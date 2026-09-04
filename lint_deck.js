#!/usr/bin/env node
/**
 * lint_deck.js — 잡 스크립트가 헬퍼를 우회해 pptxgenjs를 직접 부르는지 본다.
 * 계획서 8절 LINT 게이트("헬퍼 우회 raw 호출 0, 사유 명시 예외 제외")의 본체다.
 *
 * 왜 필요한가. tpl.* 을 거치면 도형에 역할 이름이 붙고 manifest에 등재된다.
 * slide.addText()를 직접 부르면 이름 없는 도형이 생기고, audit은 이름으로 도형을
 * 찾으므로 그 도형에 무슨 값이 적혀 있든 아무도 안 본다. 게이트 아홉 개를
 * 정문으로 우회하는 길이다.
 *
 * 규칙 값(패턴·사유·예외 표시)은 house-rules.yaml `lint` 절에서만 읽는다 (2.14).
 * 여기에 하드코딩하지 않는다 — 갈라지면 검사기와 규칙이 딴소리를 한다.
 *
 *   node lint_deck.js <deck.js> [--json]
 *
 * 종료코드: 0 통과 / 1 위반 / 2 못 돌림(파일 없음·규칙 없음).
 * 못 돌린 것을 0으로 끝내지 않는다 — 모르는 상태는 PASS가 아니다 (2.16-7).
 */
const fs = require("fs");
const path = require("path");

function loadRules() {
  const yamlPath = path.join(__dirname, "house-rules.yaml");
  const text = fs.readFileSync(yamlPath, "utf8");
  // 의존성을 늘리지 않으려고 필요한 절만 읽는다. js-yaml이 있으면 그것을 쓴다.
  try {
    const yaml = require("js-yaml");
    const doc = yaml.load(text);
    return { ...doc.lint, text_style: doc.text_style };
  } catch (e) {
    if (e.code !== "MODULE_NOT_FOUND") throw e;
  }
  // 폴백: `lint:` 블록만 손으로 읽는다. 구조가 얕아서 가능하다.
  const block = text.split(/^lint:\s*$/m)[1];
  if (block === undefined) return null;
  const body = block.split(/^\S/m)[0];
  const rawCalls = [];
  let marker = null;
  const mMarker = body.match(/^\s*exception_marker:\s*['"]?(.+?)['"]?\s*$/m);
  if (mMarker) marker = mMarker[1];
  const re = /^\s*-\s*pattern:\s*(['"])([\s\S]*?)\1\s*\n\s*why:\s*(['"])([\s\S]*?)\3/gm;
  let m;
  while ((m = re.exec(body)) !== null) rawCalls.push({ pattern: m[2], why: m[4] });
  return rawCalls.length ? { raw_calls: rawCalls, exception_marker: marker } : null;
}

// 헬퍼 객체에 붙은 호출은 위반이 아니다. tpl.addSlide()는 template_shin.js의
// 헬퍼이고, kit.chartSeries()는 deckkit의 것이다. 이름을 박아 두지 않고 파일에서
// 찾는다 — 잡마다 별칭이 다르다(tpl·kit·T). 2026-09-04에 접두어만 보다가
// tpl.addSlide()를 위반으로 찍었다 (L37: 오탐을 피하려다 구멍을 낸다의 반대편).
function helperAliases(text) {
  const found = new Set();
  const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (/(^|\/)(template[\w-]*|deckkit)\.js$/.test(m[2]) || /(^|\/)(template[\w-]*|deckkit)$/.test(m[2]))
      found.add(m[1]);
  }
  return found;
}

// 호출 하나를 통째로 읽는다. `s.addText(label, {\n  objectName: ...` 처럼
// 인자가 여러 줄에 걸치므로 괄호가 닫힐 때까지 따라간다. 한 줄만 보면
// objectName이 다음 줄에 있을 때 놓친다.
function callText(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length && i < openIdx + 4000; i += 1) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") { depth -= 1; if (depth === 0) return text.slice(openIdx, i + 1); }
  }
  return text.slice(openIdx, openIdx + 4000);
}

function lint(file, rules) {
  const marker = rules.exception_marker;
  const namesOk = rules.names_shape_ok === true;
  const raw = fs.readFileSync(file, "utf8");
  const aliases = helperAliases(raw);
  const lines = raw.split(/\r?\n/);
  // 줄 시작 오프셋 — 매치 위치를 줄 번호로 바꾼다
  const lineStart = [];
  let acc = 0;
  for (const ln of lines) { lineStart.push(acc); acc += ln.length + 1; }
  const lineOf = (idx) => {
    let lo = 0, hi = lineStart.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStart[mid] <= idx) lo = mid; else hi = mid - 1; }
    return lo;
  };

  const issues = [];
  for (const rc of rules.raw_calls) {
    const re = new RegExp(rc.pattern, "g");
    let m;
    while ((m = re.exec(raw)) !== null) {
      const i = lineOf(m.index);
      const line = lines[i];
      // 주석 줄은 코드가 아니다
      const uptoOnLine = raw.slice(lineStart[i], m.index);
      if (/^\s*(\/\/|\*)/.test(line) || uptoOnLine.includes("//")) continue;
      // 수신자가 헬퍼면 우회가 아니다 (tpl.addSlide 등)
      const recv = uptoOnLine.match(/([A-Za-z_$][\w$]*)\s*$/);
      if (recv && aliases.has(recv[1])) continue;
      // 사유를 적었으면 통과
      if (marker && line.includes(marker)) continue;
      // 도형에 이름을 붙였으면 audit이 본다
      const openIdx = raw.indexOf("(", m.index);
      if (namesOk && openIdx !== -1 && /\bobjectName\s*:/.test(callText(raw, openIdx))) continue;
      issues.push({
        rule: "lint.raw_call",
        line: i + 1,
        text: line.trim().slice(0, 120),
        pattern: rc.pattern,
        message: rc.why + " (또는 objectName을 붙여 audit이 보게 하라)",
      });
    }
  }
  issues.sort((a, b) => a.line - b.line);
  return issues;
}

// 문안 지문 검사. skill/shin-ppt1/references/anti-slop.md의 "문안 지문" 표를
// 스크립트가 재는 형태로 옮긴 것이고, 값은 house-rules.yaml의 text_style에만 있다.
// 규칙은 SKILL.md:290에 적혀 있었는데 재는 사람이 없어 2026-09-04 잡 007이
// 서술형 어미로 가득 찬 채 아홉 게이트를 다 통과했다.
function lintText(file, ts) {
  if (!ts || !Array.isArray(ts.forbidden)) return [];
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split(/\r?\n/);
  const issues = [];
  // 문자열 리터럴만 본다. 코드·변수명은 문안이 아니다
  const strRe = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;             // 주석은 장표에 안 나간다
    let m;
    strRe.lastIndex = 0;
    while ((m = strRe.exec(line)) !== null) {
      const text = m[2];
      if (ts.requires_hangul && !/[가-힣]/.test(text)) continue;
      if ((ts.exempt_contains || []).some(x => text.includes(x))) continue;
      // 장표에 안 찍히는 자리는 문안이 아니다 (reason: "…", label: "…")
      const key = line.slice(0, m.index).match(/([A-Za-z_$][\w$]*)\s*:\s*$/);
      if (key && (ts.exempt_after_key || []).includes(key[1])) continue;
      for (const rule of ts.forbidden) {
        if (!new RegExp(rule.pattern, "u").test(text)) continue;
        issues.push({
          rule: "lint.text_style",
          line: i + 1,
          text: text.slice(0, 90),
          pattern: rule.id || rule.pattern,
          message: rule.why,
        });
      }
    }
  });
  return issues;
}

function main(argv) {
  const args = argv.filter((a) => a !== "--json");
  const asJson = argv.includes("--json");
  const file = args[0];
  const out = (payload, code) => {
    if (asJson) process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    else {
      if (payload.status === "ERROR") console.error(`lint: ERROR  ${payload.error}`);
      else if (!payload.issues.length) console.log(`lint: PASS  ${payload.file}`);
      else {
        console.log(`lint: FAIL  ${payload.file}  위반 ${payload.issues.length}건`);
        for (const it of payload.issues)
          console.log(`  [${it.line}] ${it.text}\n        → ${it.message}`);
      }
    }
    process.exit(code);
  };
  const base = { file: file || "", status: "ERROR", error: null, issues: [] };
  if (!file) return out({ ...base, error: "사용: node lint_deck.js <deck.js> [--json]" }, 2);
  if (!fs.existsSync(file)) return out({ ...base, error: `파일이 없다: ${file}` }, 2);
  const rules = loadRules();
  if (!rules) return out({ ...base, error: "house-rules.yaml에 lint 절이 없다" }, 2);
  const issues = lint(file, rules).concat(lintText(file, rules.text_style));
  issues.sort((a, b) => a.line - b.line);
  return out({ ...base, status: issues.length ? "FAIL" : "PASS", issues },
             issues.length ? 1 : 0);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { lint, loadRules };
