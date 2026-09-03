/**
 * deckkit.js — 생성기와 검사기를 잇는 계약 (계획서 2.16).
 *
 * 스타일이 둘이다 (2.17). shin-ppt1과 corporate-strategy-ppt는 헬퍼도 수치도 다르지만
 * **계약은 같아야 한다.** 도형에 이름이 붙고, 숫자가 claim으로 등록되고,
 * manifest에 근거 좌표가 남는 것. 그게 audit.py가 붙을 수 있는 유일한 지점이다.
 *
 * 이 파일이 그 계약이다. 두 생성기가 각자 복사해 가지면 두 벌이 되고,
 * 한쪽만 고쳐졌을 때 조용히 갈라진다 (2.14가 house-rules.yaml에 대해 막은 것과 같다).
 *
 *   const kit = require("./deckkit.js");
 *   const pres = kit.newPres(pptxgen, R);        // addSlide를 가로채 slide 번호를 센다
 *   const v = kit.claim(8412, { id: "FY26_NIBT", src: "source.xlsx", ... });
 *   kit.claimText(slide, "FY26_NIBT", { x: 6, y: 3, w: 1.4, h: 0.35 });
 *   kit.writeManifest("manifest.json", { style: "shin-ppt1", templateVersion: "..." });
 *
 * 규칙 값은 여기서 읽지 않는다. 호출부가 `init(R)`로 넘긴다.
 * 스타일마다 다른 house-rules 절을 이 파일이 알 필요가 없다.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// 호출부가 넘기는 규칙. init()이 채운다
let R = null, MF = null, NM = null, U = null, NT = null, N = null;

function init(rules) {
  R = rules;
  MF = R.manifest;
  if (!MF) throw new Error("house-rules.yaml에 manifest 절이 없다");
  NM = MF.shape_name;
  if (!NM) throw new Error("house-rules.yaml manifest.shape_name이 없다 (계획서 2.16-1)");
  U = R.units;
  if (!U) throw new Error("house-rules.yaml에 units 절이 없다 (계획서 2.16-4)");
  NT = R.numeric_tokens;
  if (!NT) throw new Error("house-rules.yaml에 numeric_tokens 절이 없다 (계획서 10절)");
  N = R.notation;
  return module.exports;
}

// ── 도형 이름 (계획서 2.16-1) ────────────────────────────────────────
// audit.py는 manifest 항목을 pptx XML의 도형 name으로 찾는다. 이름이 없으면
// 대조할 대상을 잃고 조용히 PASS가 난다(계획서 2.16-7이 금지하는 상태다).
// 그래서 헬퍼는 s.addShape/s.addText를 직접 부르지 않고 아래 두 함수를 거친다.
const _nameSeq = new Map();          // slide 번호 -> Map(이름 -> 사용 횟수)
function _uniqName(base) {
  let m = _nameSeq.get(_slideNo);
  if (!m) { m = new Map(); _nameSeq.set(_slideNo, m); }
  const n = (m.get(base) || 0) + 1;
  m.set(base, n);
  return n === 1 ? base : base + NM.index_sep + n;
}
function nameOf(...parts) { return parts.join(NM.sep); }
function claimName(id) { return NM.claim_prefix + id; }
// 실제로 붙은 이름을 돌려준다. 같은 이름이 겹치면 #2가 붙으므로 호출부가 받아 써야 한다
function _shape(s, type, base, opts) {
  const name = _uniqName(base);
  s.addShape(type, Object.assign({}, opts, { objectName: name }));
  return name;
}
function _text(s, content, base, opts) {
  const name = _uniqName(base);
  s.addText(content, Object.assign({}, opts, { objectName: name }));
  return name;
}


// addSlide를 가로채 slide 번호를 센다 (계획서 2.4). 손으로 적으면 manifest와 어긋난다.
// 판형 정의는 스타일마다 다르므로 호출부가 한다.
// writeDeck만 아는 진짜 writeFile. 밖에서 못 꺼낸다.
const REAL_WRITE = Symbol("deckkit.realWriteFile");

function newPres(pptxgen, rules) {
  if (rules) init(rules);
  const pres = new pptxgen();
  resetManifest();
  const addSlide = pres.addSlide.bind(pres);
  pres.addSlide = function (...args) { _slideNo += 1; return addSlide(...args); };

  // 저장 관문을 코드로 막는다.
  //
  // pres.writeFile()을 직접 부르면 도형 ID 재부여를 건너뛴다. pptxgenjs가
  // 표 ID를 intTableNum * slide._slideNum + 1로 매겨서 표가 들어간 장표는
  // 거의 항상 ID가 중복된다 — 픽스처 20개가 전부 그랬다.
  //
  // 여기 주석으로 "직접 부르지 마라"라고 적어 둔 적이 있는데, 실제 잡 스크립트
  // 두 개가 그대로 직접 불렀다 (2026-08-29). 주석은 관문이 아니다.
  // 부르면 던진다.
  pres[REAL_WRITE] = pres.writeFile.bind(pres);
  pres.writeFile = function () {
    throw new Error(
      "pres.writeFile()을 직접 부르면 도형 ID 재부여를 건너뛴다. " +
      "kit.writeDeck(pres, fileName)을 써라 (deckkit.js).");
  };
  return pres;
}

// ── claim / manifest (계획서 2.4, 2.5, 2.8, 6.2) ──────────────────────
// 값을 찍는 지점에서 manifest를 부산물로 방출한다. 손으로 쓰면 실제 장표와 어긋난다.
// 값을 찍는 지점에서 manifest를 부산물로 방출한다. 손으로 쓰면 실제 장표와 어긋난다.
// manifest에 적는 것은 값이 아니라 근거 좌표(파일·시트·셀)다.
// claim()이 돌려준 문자열을 그대로 장표에 그려야 3자 대조가 성립한다.
//   SOURCE(source.xlsx) ↔ MANIFEST(manifest.json) ↔ FINAL(pptx)


// override.at 검증용. 타임존 없는 시각은 받지 않는다 — 누가 언제 조정했는지가 감사의 핵심이다
const ISO8601_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

let _claims = [];
let _tokenWhitelist = [];
let _chartSeries = [];
let _slideNo = 0;
let _srcRoot = process.env.DECK_SOURCE_ROOT || __dirname;
const _hashCache = new Map();

function resetManifest() { _claims = []; _tokenWhitelist = []; _chartSeries = []; _slideNo = 0; _hashCache.clear(); _nameSeq.clear(); }
// 잡 폴더에서는 builder/ 기준으로 ../source 를 가리킨다
function sourceRoot(dir) { if (dir != null) _srcRoot = dir; return _srcRoot; }
function currentSlide() { return _slideNo; }
function manifest() { return JSON.parse(JSON.stringify(_claims)); }

function _decimalsOf(v) {
  const s = String(v);
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`claim: 표기할 수 없는 수 ${s}. rounding을 명시한다`);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

// 음수는 notation.negative("-"). △는 forbidden.negative_triangle이라 여기서 나올 수 없다
function _fmt(v, rounding, signed) {
  const neg = v < 0;
  const [ip0, dp] = Math.abs(v).toFixed(rounding).split(".");
  const ip = ip0.replace(/\B(?=(\d{3})+(?!\d))/g, N.thousands_sep);
  let out = dp ? ip + N.decimal_sep + dp : ip;
  if (neg) out = N.negative + out;
  else if (signed) out = N.positive + out;
  return out;
}

// 원천 파일이 없는 환경(리포의 더미 실행)에서는 null로 남긴다. 게이트가 잡는다
function _hash(file) {
  if (_hashCache.has(file)) return _hashCache.get(file);
  const p = path.isAbsolute(file) ? file : path.join(_srcRoot, file);
  let h = null;
  try { h = "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); } catch (e) { h = null; }
  _hashCache.set(file, h);
  return h;
}

// transform 어휘는 house-rules.yaml에서 닫혀 있다. 일반 수식 평가기를 만들지 않는다
function _transform(id, o) {
  const type = o.transform || "identity";
  const spec = MF.transforms[type];
  if (!spec) throw new Error(`claim[${id}]: transform '${type}'은 어휘 밖이다. 허용: ${Object.keys(MF.transforms).join(", ")}`);
  const t = { type };
  spec.forEach(k => {
    if (o[k] == null || o[k] === "") throw new Error(`claim[${id}]: transform '${type}'에는 ${k}가 필요하다`);
    t[k] = o[k];
  });
  return t;
}

/**
 * 장표에 찍을 값 하나를 등록하고, 찍을 문자열을 돌려준다.
 *
 *   const v = tpl.claim(8412, { id: "FY26_NIBT", src: "source.xlsx", sheet: "실적", ref: "G22", unit: "억원" });
 *   // v === "8,412"  —  이 문자열을 그대로 addText/표 셀에 넣는다
 *
 * opts: id(필수) type(numeric|text) src sheet ref unit rounding signed slide
 *       transform(identity|sum|ratio|delta|cagr|unverified) + 그 type의 필수 인자
 *       override: { value, reason, author, at }  원천과 다른 값을 의도적으로 찍을 때 (계획서 2.8)
 *         at은 ISO-8601 + 타임존. 조정을 결정한 시각이며 호출부가 적는다.
 *         빌드 시각을 자동으로 넣으면 manifest가 비결정적이 되어 회귀 비교가 깨진다.
 */
function claim(value, opts = {}) {
  const id = opts.id;
  if (!id) throw new Error("claim: id가 없다. manifest의 shape_id로 쓰인다");

  const kind = opts.type || MF.kinds[0];
  if (!MF.kinds.includes(kind)) throw new Error(`claim[${id}]: kind '${kind}'는 허용 밖이다. 허용: ${MF.kinds.join(", ")}`);

  const slide = opts.slide != null ? opts.slide : _slideNo;
  if (!slide) throw new Error(`claim[${id}]: 열린 슬라이드가 없다. addSlide() 뒤에 값을 만들거나 opts.slide를 넘긴다`);

  const tf = _transform(id, opts);
  if (MF.source_required && tf.type !== "unverified" && (!opts.src || !opts.sheet))
    throw new Error(`claim[${id}]: src와 sheet가 필요하다. 근거가 없으면 transform: "unverified" + note를 쓴다`);
  if (MF.source_ref_required_for.includes(tf.type) && !opts.ref)
    throw new Error(`claim[${id}]: transform '${tf.type}'의 근거 셀 ref가 없다`);

  let text, rounding = null;
  if (opts.override) {
    // override는 불일치가 나도 FAIL이 아니라 CHANGELOG에 사유와 함께 기록된다 (계획서 2.8).
    // 그래서 "누가 언제" 없이는 받지 않는다. 그게 없으면 숨김 수정과 구분이 안 된다 (2.16-8)
    const miss = MF.override_fields.filter(k => opts.override[k] == null || opts.override[k] === "");
    if (miss.length)
      throw new Error(`claim[${id}]: override에 ${miss.join(", ")}가 없다. 필수: ${MF.override_fields.join(", ")} (계획서 2.16-8)`);
    if (!ISO8601_TZ.test(String(opts.override.at)))
      throw new Error(`claim[${id}]: override.at은 타임존이 붙은 ISO-8601이어야 한다: ${opts.override.at}`);
    text = String(opts.override.value);
    // 표시 자릿수는 남긴다. 없으면 audit이 원천 값을 "0"으로 적어
    // CHANGELOG가 "0 -> 9.9"가 된다. 실제 원천은 "0.0"이다
    if (opts.rounding != null) rounding = opts.rounding;
  } else if (kind === "numeric") {
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error(`claim[${id}]: numeric인데 값이 수가 아니다: ${value}`);
    rounding = opts.rounding != null ? opts.rounding : _decimalsOf(value);
    text = _fmt(value, rounding, !!opts.signed);
  } else {
    text = String(value);
  }

  const bad = N.negative_forbidden.find(ch => text.includes(ch));
  if (bad) throw new Error(`claim[${id}]: 금지된 음수 표기 '${bad}' 포함: ${text}`);

  // 같은 지표가 페이지마다 다른 값으로 찍히는 것을 생성 단계에서 막는다 (게이트 XREF)
  const prev = _claims.find(c => c.shape_id === id);
  if (prev && prev.display.text !== text)
    throw new Error(`claim[${id}]: 같은 지표를 다른 값으로 등록했다 — p${prev.slide} "${prev.display.text}" vs p${slide} "${text}"`);

  const entry = {
    slide, shape_id: id, kind,
    // 이 값이 실제로 어느 도형/셀에 찍혔는지. claimText()·table()이 채운다 (계획서 2.16-3).
    // 비어 있으면 audit.py가 대조할 대상이 없다는 뜻이므로 writeManifest가 센다.
    placements: [],
    display: { text, unit: opts.unit || null, rounding },
    source: {
      file: opts.src || null,
      file_hash: opts.src ? _hash(opts.src) : null,
      sheet: opts.sheet || null,
      ref: opts.ref || null,
      // 이 값이 어느 항목의 것인지 가리키는 셀 (예: 제품명이 든 B18).
      // 적으면 audit이 그 글자와 장표의 라벨을 대조한다. 안 적으면 건너뛴다.
      // 값이 맞아도 라벨이 어긋나면 뜻이 정반대가 되는데 아무도 못 잡던 자리다 (L34)
      label_ref: opts.label_ref || null,
    },
    transform: tf,
  };
  if (opts.override) {
    entry.override = {};
    MF.override_fields.forEach(k => { entry.override[k] = String(opts.override[k]); });
  }

  _claims.push(entry);
  return text;
}

// ── 근거 좌표 (계획서 2.16-3) ────────────────────────────────────────
// display.text만으로는 XML의 어느 도형인지 특정할 수 없다. 좌표·서체·정렬을 함께 적어야
// audit.py가 "그 값이 그 자리에 그 서체로 찍혔는지"까지 본다.

const _rd = v => (typeof v === "number" ? Number(v.toFixed(U.bounds_round_in)) : null);

function _claimOf(id, who) {
  const e = _claims.find(c => c.shape_id === id);
  if (!e) throw new Error(`${who}: 등록되지 않은 claim '${id}'. claim()을 먼저 부른다`);
  return e;
}

/**
 * claim한 값을 그린다. 문자열을 호출부가 다시 쓰지 않는다 —
 * manifest에 등록된 display.text를 그대로 찍어야 MANIFEST ↔ FINAL이 어긋날 수 없다.
 *
 * opts: pptxgenjs addText 옵션 + prefix/suffix (라벨과 값을 한 도형에 넣을 때)
 */
function claimText(s, id, opts = {}) {
  const e = _claimOf(id, "claimText");
  const { prefix = "", suffix = "", ...to } = opts;
  const shown = prefix + e.display.text + suffix;
  const name = _text(s, shown, claimName(id), to);
  e.placements.push({
    slide: _slideNo, type: "shape", name, text: shown,
    bounds: { x: _rd(to.x), y: _rd(to.y), w: _rd(to.w), h: _rd(to.h) },
    font: { face: to.fontFace || null, size: to.fontSize != null ? to.fontSize : null, bold: !!to.bold },
    // 미지정 시의 기본값은 pptxgenjs의 것을 그대로 적는다. 다르게 적으면
    // 실제 XML과 어긋나 audit이 도형마다 오탐을 낸다 (align=left, valign=middle)
    align: to.align || "left", valign: to.valign || "middle",
  });
  return shown;
}

/**
 * 표를 그린다. 표는 도형 하나라서 셀마다 이름을 줄 수 없다.
 * 그래서 셀은 shape_id + (행, 열)로 참조한다 (계획서 2.16-1).
 * 셀에 claim: "<id>"를 달면 위치를 기록하고 addTable에 넘기기 전에 그 키를 떼어낸다.
 */
function table(s, base, rows, opts = {}) {
  const name = _uniqName(base);
  const clean = rows.map((row, ri) => row.map((cell, ci) => {
    if (!cell || typeof cell !== "object" || !cell.claim) return cell;
    const e = _claimOf(cell.claim, "table");
    if (cell.text !== e.display.text)
      throw new Error(`table[${cell.claim}]: 셀 문자열이 manifest와 다르다 — "${cell.text}" vs "${e.display.text}"`);
    e.placements.push({ slide: _slideNo, type: "cell", table: name, row: ri, col: ci, text: cell.text });
    const { claim: _drop, ...rest } = cell;
    return rest;
  }));
  s.addTable(clean, Object.assign({}, opts, { objectName: name }));
  return name;
}

// 잡 덱이 헬퍼 밖에서 도형을 그릴 때 쓰는 통로. 이름 없는 도형을 만들지 않기 위해 열어 둔다
function text(s, name, content, opts) { return _text(s, content, name, opts); }
function shape(s, type, name, opts) { return _shape(s, type, name, opts); }

// 표 셀 하나를 만든다. claim() 결과 문자열과 id를 함께 넘겨 셀과 manifest를 잇는다
function cell(text, id, options) { return { text, claim: id, options }; }

// ── 숫자 토큰 예외 (계획서 10절 해소, 2026-08-29) ────────────────────
// audit.py는 장표의 모든 숫자 토큰이 claim으로 등록돼 있기를 기대한다.
// 연도 라벨처럼 어느 잡에나 나오는 예외는 house-rules의
// numeric_tokens.global_text_whitelist에 있다. 그 잡에서만 통하는 예외를 여기 둔다.
//
// 사유 없는 예외를 만들 수 없게 막는다. 사유가 없으면 검사를 그냥 끈 것과 같고,
// 그러면 오탐 몇 건 때문에 검사 전체가 조용히 죽는다.
// 필수 필드는 house-rules의 job_whitelist_fields가 정한다 — 어휘를 한 곳에만 둔다.
//
//   tpl.whitelistToken({ token: "-100", reason: "브리프 원문 인용. 산출값 아님" });
//
function whitelistToken(opts = {}) {
  const entry = {};
  NT.job_whitelist_fields.forEach(k => {
    const v = (k === "slide" && opts.slide == null) ? _slideNo : opts[k];
    if (v == null || v === "")
      throw new Error(`whitelistToken: ${k}가 없다. 필수 필드는 ${NT.job_whitelist_fields.join(", ")}`);
    entry[k] = k === "slide" ? Number(v) : String(v);
  });
  if (!entry.slide) throw new Error("whitelistToken: 열린 슬라이드가 없다. addSlide() 뒤에 부르거나 slide를 넘긴다");
  _tokenWhitelist.push(entry);
  return entry;
}

// ── 저장 (계획서 2.1) ────────────────────────────────────────────────
// pptxgenjs가 표에만 다른 공식으로 도형 ID를 매긴다.
//   표     id = intTableNum * slide._slideNum + 1   (1번 표, 1번 슬라이드 → 2)
//   그 외  id = idx + 2                             (0번 항목 → 2)
// 그래서 표가 있는 슬라이드는 항상 ID가 겹친다. 라이브러리 쪽 문제라 생성 시점에 못 막는다.
//
// 파워포인트가 열기는 하지만 규격 위반이고, 스킬의 preflight.py가 오류로 잡는다.
// 2026-08-30에 STRUCT 게이트 첫 실행에서 발견했다 — 만든 덱 셋이 전부 겹쳐 있었다.
// audit.py는 하우스 규칙만 보므로 이걸 못 본다 (계획서 2.18).
//
// 저장 뒤에 슬라이드마다 ID를 1부터 다시 매긴다. 이름(objectName)은 건드리지 않는다 —
// manifest ↔ XML 대조 키가 이름이기 때문이다 (2.16-1).
async function writeDeck(pres, fileName) {
  // newPres가 pres.writeFile을 막아 뒀다. 진짜는 REAL_WRITE에 있다.
  // newPres를 안 거치고 온 pres도 받아 준다 — 그때는 원래 것을 그대로 쓴다.
  const write = pres[REAL_WRITE] || pres.writeFile.bind(pres);
  await write({ fileName });
  const renumbered = renumberShapeIds(fileName);
  return { file: fileName, renumbered };
}

// zip 라이브러리를 새로 들이지 않는다. 파이썬은 이미 전제 환경이고(계획서 4절)
// 표준 라이브러리로 끝난다. preflight.py도 같은 방식이다.
/**
 * 쓴 파일에서 장별 기하를 되읽는다. 레이아웃 자기 점검이 쓸 값이다.
 *
 * 왜 되읽나: `checkLayout`은 호출부가 각 단의 하단 y를 넘겨 줘야 해서
 * **아무도 안 불렀다** (2026-09-03 확인. 잡 004·005 둘 다 0회).
 * 값을 넘겨받는 대신 **실제로 쓰인 것을 읽으면** 부를지 말지가 선택이 아니게 된다.
 * 저장 관문 안에 있으니 잡 스크립트가 건너뛸 수도 없다.
 *
 * 돌려주는 것: [{ page, cols: [좌단 하단, 우단 하단], tail, footLines }]
 * 머리글·각주·쪽번호는 콘텐츠가 아니므로 뺀다.
 */
function readGeometry(file, rightX, footBase) {
  const script = `
import re, sys, zipfile
from xml.etree import ElementTree as ET
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
EMU = 914400.0
src, right_x, foot_base = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
out = []
with zipfile.ZipFile(src) as z:
    names = sorted((n for n in z.namelist() if re.fullmatch(r"ppt/slides/slide\\d+\\.xml", n)),
                   key=lambda n: int(re.search(r"(\\d+)", n.split("/")[-1]).group(1)))
    for page, n in enumerate(names, 1):
        root = ET.fromstring(z.read(n))
        left, right, foot = [], [], 0
        for sp in root.iter():
            nv = sp.find(f"./{P}nvSpPr/{P}cNvPr") if sp.tag.endswith("}sp") else None
            if nv is None:
                nv = sp.find(f"./{P}nvGraphicFramePr/{P}cNvPr") if sp.tag.endswith("}graphicFrame") else None
            if nv is None:
                continue
            name = nv.get("name") or ""
            xfrm = sp.find(f".//{A}xfrm")
            if xfrm is None:
                continue
            off, ext = xfrm.find(f"{A}off"), xfrm.find(f"{A}ext")
            if off is None or ext is None:
                continue
            x = int(off.get("x")) / EMU; y = int(off.get("y")) / EMU
            w = int(ext.get("cx")) / EMU; h = int(ext.get("cy")) / EMU
            role = name.split("/")[0]
            # 머리글·요약띠·각주·구분선은 콘텐츠가 아니다. 하단 계산에서 뺀다.
            # ruleThin(각주 위 구분선)을 안 빼면 그것이 가장 깊은 요소로 잡힌다
            if role in ("header", "footer", "summary", "ruleThin", "ruleThick"):
                if role == "footer":
                    # 각주는 한 도형에 여러 줄이 들어간다. 도형이 아니라 문단을 센다
                    foot += max(1, len([t for t in sp.iter(f"{A}p")
                                        if "".join(x.text or "" for x in t.iter(f"{A}t")).strip()]))
                continue
            if y >= foot_base - 0.02:
                continue
            (right if x >= right_x - 0.05 else left).append(y + h)
        out.append({"page": page,
                    "cols": [round(max(left), 3) if left else None,
                             round(max(right), 3) if right else None],
                    "footLines": max(1, foot)})
import json; print(json.dumps(out))
`;
  const r = require("child_process").spawnSync(
    "python3", ["-c", script, file, String(rightX), String(footBase)], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("기하 되읽기 실패: " + (r.stderr || "").trim());
  return JSON.parse(r.stdout.trim() || "[]");
}

function renumberShapeIds(file) {
  const script = `
import re, shutil, sys, zipfile
src = sys.argv[1]
tmp = src + ".renum"
touched = 0
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for it in zin.infolist():
        data = zin.read(it.filename)
        if re.fullmatch(r"ppt/slides/slide\\d+\\.xml", it.filename):
            xml = data.decode("utf-8")
            # 미디어가 있으면 도형 ID가 rId와 묶여 있다. 건드리지 않는다
            if not re.search(r"<a:blip|<p:pic\\b", xml):
                n = [0]
                def sub(m):
                    n[0] += 1
                    return m.group(1) + str(n[0]) + m.group(3)
                out = re.sub(r'(<p:cNvPr id=")(\\d+)(")', sub, xml)
                if out != xml:
                    data = out.encode("utf-8"); touched += 1
        zout.writestr(it, data)
shutil.move(tmp, src)
print(touched)
`;
  const r = require("child_process").spawnSync("python3", ["-c", script, file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("도형 ID 재부여 실패: " + (r.stderr || "").trim());
  return parseInt(r.stdout.trim(), 10) || 0;
}

// 타임스탬프를 넣지 않는다. 같은 입력이면 같은 파일이어야 픽스처 회귀 비교가 된다.
// 실행 정보는 run_metadata.json이 따로 담는다 (계획서 6.4)
// meta로 스타일과 생성기 버전을 받는다. 계약(이 파일)은 스타일을 모르고,
// 어느 스킬로 만들었는지는 생성기가 안다 (계획서 2.17).
/**
 * 차트 계열이 원천의 어느 범위에서 왔는지 적는다.
 *
 * 네이티브 차트 값은 내장 워크북 안에 있어 claim에 안 걸린다. 이것이 없으면
 * audit이 "그 값이 시트 어딘가에 있나"까지만 본다 — 거래대금 자리에 신용잔고
 * 값을 넣어도 통과한다 (LESSONS L38).
 *
 * 안 적어도 된다(chart_series_ref_optional). 다만 안 적으면 audit이 경고를 남긴다.
 */
function chartSeries(entries) {
  (Array.isArray(entries) ? entries : [entries]).forEach((e, i) => {
    if (!e || !e.ref) throw new Error("chartSeries: ref가 없다. 원천 범위를 적어야 한다 (예: C4:C15)");
    if (!e.src || !e.sheet) throw new Error("chartSeries: src와 sheet가 필요하다");
    // chart 이름에 기본값을 두면 조용히 어긋난다. 2026-09-03에 기본값이
    // "chartLine/chart"였는데 실제로는 chartBar를 그려서 audit이
    // claim.chart_series_missing으로 잡았다. 기본값이 없었으면 여기서 걸렸다
    if (!e.chart) throw new Error(
      "chartSeries: chart 이름이 없다. 실제 도형 이름을 적어야 한다 " +
      "(chartBar/chart · chartLine/chart 등). 기본값을 두면 조용히 어긋난다");
    _chartSeries.push({
      slide: e.slide != null ? e.slide : _slideNo,
      chart: e.chart,
      series: e.series != null ? e.series : i + 1,
      name: e.name || null,
      source: { file: e.src, file_hash: _hash(e.src), sheet: e.sheet, ref: e.ref },
    });
  });
  return _chartSeries.length;
}

function writeManifest(file, meta = {}) {
  if (!meta.style) throw new Error("writeManifest: style이 없다. 어느 스킬로 만든 장표인지 적어야 한다 (계획서 2.17)");
  if (!meta.templateVersion) throw new Error("writeManifest: templateVersion이 없다 (계획서 2.16-6)");
  const claims = manifest();
  // 규칙이 바뀔 때 "이 덱이 무엇을 기준으로 만들어졌는지"를 보존한다 (계획서 2.16-6)
  const out = {
    schema_version: MF.schema_version,
    house_rule_version: R.version,
    style: meta.style,
    template_version: meta.templateVersion,
    token_whitelist: _tokenWhitelist.slice(),
    chart_series: _chartSeries.slice(),
    claims,
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n", "utf8");
  return {
    file, count: claims.length,
    unhashed: claims.filter(c => c.source.file && !c.source.file_hash).length,
    // 좌표가 없는 claim은 audit.py가 XML에서 찾을 수 없다. 게이트가 잡는다 (계획서 2.16-7)
    unplaced: claims.filter(c => !c.placements.length).map(c => c.shape_id),
    whitelisted: _tokenWhitelist.length,
  };
}


module.exports = {
  init, newPres,
  // 도형 이름 (2.16-1)
  nameOf, claimName, shape, text,
  // claim / manifest (2.4~2.8, 6.2)
  claim, claimText, table, cell, whitelistToken, chartSeries, writeDeck, renumberShapeIds, readGeometry,
  manifest, writeManifest, resetManifest, sourceRoot, currentSlide,
};
