/**
 * shin-ppt1 헬퍼 (pptxgenjs) — v1
 *
 * shin-ppt(v4)의 골격을 그대로 두고 팔레트를 테마로 분리한 판이다.
 *   - 색 값은 호출부에서 직접 쓰지 않는다. 전부 C.* 역할 키로만 참조한다
 *   - useTheme()이 C를 갈아끼우므로 같은 생성 스크립트가 테마만 바꿔 두 번 돈다
 *   - 지면색이 흰색이 아닌 테마(paper)를 위해 addSlide()로 배경을 깐다
 *
 * 준비: 작업 폴더에서 한 번
 *   npm install pptxgenjs
 *   (preflight.py는 파이썬 표준 라이브러리만 쓰므로 따로 설치할 것이 없다)
 *
 * 사용:
 *   const tpl = require("./template.js");
 *   const pres = tpl.newPres(require("pptxgenjs"), "report", "soft");
 *   const s = tpl.addSlide(pres);
 *   tpl.header(s, "제목", "기준일");
 *   tpl.summary(s, "결론 첫 줄", "보조 줄");
 *   ...
 *   tpl.footer(s, ["※ 각주"]);
 */

// ── 규칙 값은 house-rules.yaml에서 읽는다 (계획서 2.14, 2.17) ─────────
// 원본 스킬은 이 값들을 코드에 두었다. 리포에서는 생성기와 검사기가 같은 값을 봐야 한다.
// 두 벌이 되면 갈라진다. 스킬 원본은 skill/shin-ppt1/scripts/template.js에 그대로 있다.
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const RULES_PATH = process.env.HOUSE_RULES || path.join(__dirname, "house-rules.yaml");
const R = yaml.load(fs.readFileSync(RULES_PATH, "utf8"));

const STYLE = "shin-ppt1";
const SR = R.styles && R.styles[STYLE];
if (!SR) throw new Error(`house-rules.yaml에 styles.${STYLE}가 없다 (계획서 2.17)`);

// 계약은 deckkit이 갖고 있다. 스타일이 둘이어도 계약은 하나다 (2.16, 2.17)
const kit = require("./deckkit.js").init(R);
const { nameOf, claimName, claim, claimText, table: kitTable, cell,
        whitelistToken, manifest, resetManifest, sourceRoot, currentSlide } = kit;

const TEMPLATE_VERSION = "2026.08.29";
const writeManifest = (file) => kit.writeManifest(file, { style: STYLE, templateVersion: TEMPLATE_VERSION });

// 이름 없는 도형을 만들 수 없게 막는 통로 (계약 2.16-1)
const _shape = (s, type, base, opts) => kit.shape(s, type, base, opts);
const _text  = (s, content, base, opts) => kit.text(s, base, content, opts);

// 글꼴은 두 벌뿐이다. 셋째 글꼴을 들이지 않는다
const F  = SR.fonts.body;      // 제목·요약박스를 뺀 전부
const FH = SR.fonts.heading;   // 페이지 제목과 상단 요약박스
const FOOT_BASE = SR.zones.footnote_bottom_y;   // 각주 바닥 기준선

const W = SR.layout.width, H = SR.layout.height, MX = SR.layout.margin_x, CW = W - 2 * MX;
const COLW = SR.columns.width, RX = SR.columns.right_x;   // 2단: 좌 0.65~5.67 / 우 6.02~11.04

/* ── 모서리 처리 — 카드류 도형에만 적용한다 ──
   'square' 각진 모서리(기본. 리서치 리포트 인상)
   'soft'   0.05in. 인쇄물에서 겨우 눈에 띄는 정도
   'round'  0.10in. 화면 배포용

   표·마감선·막대·강조 열 배경은 어떤 값에서도 각진 채로 둔다.
   전부 둥글게 하면 균일한 각진 카드가 균일한 둥근 카드로 바뀔 뿐이다. */
const CORNERS = { square: 0, soft: 0.05, round: 0.10 };
let RADIUS = 0;
function useCorners(name) {
  if (!(name in CORNERS)) throw new Error("모서리 값: " + Object.keys(CORNERS).join(", "));
  RADIUS = CORNERS[name];
  return RADIUS;
}
function corners() { return RADIUS; }

// 카드류 사각형. RADIUS가 0이면 rect, 아니면 roundRect로 나간다
// 높이가 작은 도형에 큰 반경을 주면 알약처럼 보이므로 짧은 변의 22%로 제한한다
function box(s, o) {
  if (!RADIUS) { s.addShape("rect", Object.assign({ objectName: "box/shape" }, o)); return; }
  const r = Math.min(RADIUS, Math.min(o.w, o.h) * 0.22);
  s.addShape("roundRect", Object.assign({ objectName: "box/shape",}, o, { rectRadius: r }));
}

/* ── 타이포 스케일 — 크기는 전부 여기서만 정한다 ──
   지면(A4 가로 11.69×8.27in)에 비해 글씨가 작아 보이지 않게 잡은 값이다.
   개별 호출부에서 fontSize를 직접 쓰지 않는다. 쓰는 순간 위계가 어긋난다. */
// 크기는 house-rules의 styles.shin-ppt1.sizes 한 곳에서만 정한다.
// 호출부에서 fontSize를 숫자로 쓰지 않는다 (design-system.md).
const TS = {
  title: SR.sizes.title_pt,          summary: SR.sizes.summary_pt,
  sub: SR.sizes.sub_pt,              subDesc: SR.sizes.sub_desc_pt,
  table: SR.sizes.table_pt,          tableMin: SR.sizes.table_min_pt,
  bigValue: SR.sizes.big_value_pt,   cardTitle: SR.sizes.card_title_pt,
  cardBody: SR.sizes.card_body_pt,   layer: SR.sizes.layer_pt,
  bullet: SR.sizes.bullet_pt,        gridHead: SR.sizes.grid_head_pt,
  gridCell: SR.sizes.grid_cell_pt,   axis: SR.sizes.axis_pt,
  legend: SR.sizes.legend_pt,        value: SR.sizes.value_pt,
  foot: SR.sizes.foot_pt,
};

/* ── 세로 리듬 — 여백은 눈대중이 아니라 이 값으로 맞춘다 ── */
const BAND_TOP  = SR.zones.band_top;   // 콘텐츠 시작(요약박스 아래 첫 소제목)
const SUB_GAP   = SR.zones.sub_gap;    // 소제목 y → 그 아래 콘텐츠 y
const BLOCK_GAP = SR.zones.block_gap;  // 블록 하단 → 다음 소제목 y
const COL_TOL   = SR.zones.col_tolerance;  // 2단 좌·우 마지막 요소 하단 차이 허용치
const SLACK_MAX = SR.zones.slack_max;      // 이보다 더 비면 행·도식 높이로 흡수한다

// 각주 줄수에 따른 콘텐츠 하한
function bandBottom(footLines) { return FOOT_BASE - 0.15 * footLines - 0.20; }

// 페이지를 다 짠 뒤 호출한다. 어기면 콘솔에 경고가 뜬다
// cols: 각 단의 마지막 요소 하단 y 배열, tail: 전폭 요소(msgBox 등) 하단 y
const LAYOUT_ISSUES = [];
function layoutIssues() { return LAYOUT_ISSUES.slice(); }

function checkLayout(page, { cols = [], tail = null, footLines = 1 }) {
  const lim = bandBottom(footLines), all = tail != null ? cols.concat(tail) : cols;
  const msgs = [];
  all.forEach(b => { if (b > lim + 0.005) msgs.push(`하단 ${b.toFixed(2)} 이 하한 ${lim.toFixed(2)} 을 넘음`); });
  if (cols.length === 2 && Math.abs(cols[0] - cols[1]) > COL_TOL)
    msgs.push(`2단 하단 차이 ${Math.abs(cols[0] - cols[1]).toFixed(2)} (허용 ${COL_TOL})`);
  const deepest = Math.max.apply(null, all);
  if (lim - deepest > SLACK_MAX)
    msgs.push(`잔여 여백 ${(lim - deepest).toFixed(2)} — 행 높이·도식 높이로 흡수할 것`);
  if (msgs.length) {
    msgs.forEach(m => LAYOUT_ISSUES.push(`${page}: ${m}`));
    console.warn(`[레이아웃 ${page}] ` + msgs.join(" / "));
  }
  return msgs;
}

/**
 * 저장 관문. 반드시 이 함수로 저장한다.
 * 레이아웃 위반이 하나라도 있으면 파일을 쓰지 않고 종료한다.
 * pres.writeFile()을 직접 부르면 이 관문을 우회하게 되므로 쓰지 않는다.
 */
function save(pres, fileName) {
  if (LAYOUT_ISSUES.length) {
    console.error("레이아웃 위반 " + LAYOUT_ISSUES.length + "건 — 파일을 만들지 않는다");
    LAYOUT_ISSUES.forEach(m => console.error("  - " + m));
    process.exit(1);
  }
  // deckkit이 저장 뒤 도형 ID를 다시 매긴다 (계획서 2.1).
  // pptxgenjs가 표에만 다른 공식을 써서 ID가 겹친다 — 규격 위반이다
  return kit.writeDeck(pres, fileName).then(r => {
    console.log("생성 완료: " + fileName + (r.renumbered ? `  (도형 ID 재부여 ${r.renumbered}장)` : ""));
  });
}

/* ══════════════════════════════════════════════════════════
   테마 — 역할 키 13개 + series 6색. 키를 늘리지 않는다
   전부 밝은 지면이다. 어두운 지면 테마는 인쇄가 안 되므로 두지 않는다
   ══════════════════════════════════════════════════════════ */

// 테마 팔레트도 house-rules에서 읽는다 (계획서 2.14).
// darkPage는 지면색이 흰색이 아닌지의 파생값이라 여기서 계산한다.
const THEMES = Object.fromEntries(Object.entries(SR.themes).map(([name, t]) => [
  name, { ...t, darkPage: String(t.page).toUpperCase() !== "FFFFFF" },
]));

const C = {};
let THEME_NAME = "report";

function useTheme(name) {
  const t = THEMES[name];
  if (!t) throw new Error("알 수 없는 테마: " + name + " (가능: " + Object.keys(THEMES).join(", ") + ")");
  Object.keys(C).forEach(k => delete C[k]);
  Object.assign(C, t);
  THEME_NAME = name;
  return C;
}
function themeName() { return THEME_NAME; }
useTheme("report");

function newPres(pptxgen, theme, cornerName) {
  useTheme(theme || SR.default_theme);
  useCorners(cornerName || "soft");
  // deckkit이 addSlide를 가로채 slide 번호를 센다 (계약 2.4).
  // 판형은 스타일마다 다르므로 여기서 정한다.
  const pres = kit.newPres(pptxgen, R);
  pres.defineLayout({ name: SR.layout.name, width: W, height: H });
  pres.layout = SR.layout.name;
  return pres;
}

// 지면색을 깐 슬라이드. 흰 지면 테마에서도 이 함수로 통일한다
function addSlide(pres) {
  const s = pres.addSlide();
  s.background = { color: C.page };
  return s;
}

/* ══════════════════════════════════════════════════════════
   골격 컴포넌트
   ══════════════════════════════════════════════════════════ */

function ruleThick(s, y, x = MX, w = CW) { s.addShape("rect", { objectName: "ruleThick/shape", x, y, w, h: 0.028, fill: { color: C.ink } }); }
function ruleThin(s, y, x = MX, w = CW) { s.addShape("rect", { objectName: "ruleThin/shape", x, y, w, h: 0.008, fill: { color: C.rule } }); }

// 눈썹 라벨. 제목 위 분류 표기(자간을 벌린 작은 글씨). 부서명은 넣지 않는다
function eyebrow(s, text, x = MX, y = 0.24) {
  s.addText(text, { objectName: "eyebrow/text", x, y, w: CW - 2.6, h: 0.20, fontFace: F, fontSize: TS.legend - 0.5,
    bold: true, color: C.mute, charSpacing: 1.6, margin: 0, valign: "middle" });
}

// 제목 + 굵은 마감선. 제목이 지면 폭을 다 쓴다
// 우측 상단에는 아무것도 넣지 않는다. 기준일·출처·페이지는 각주 줄로 내린다
function header(s, title, opts = {}) {
  if (typeof opts === "string") {
    throw new Error("header의 셋째 인자는 옵션 객체다. 기준일·출처는 footer(s, notes)로 내린다");
  }
  if (opts.eyebrow) eyebrow(s, opts.eyebrow);
  s.addText(title, { objectName: "header/text", x: MX, y: 0.46, w: CW, h: 0.40, fontFace: FH, fontSize: TS.title, bold: true, color: C.ink, margin: 0, valign: "middle" });
  ruleThick(s, 0.90);
}

// 상단 요약박스. 하고 싶은 말을 두괄식으로 넣는다. 한 줄 36자 이내
function summary(s, l1, l2, y = 1.06, h = 0.76) {
  const boxOpt = { x: MX, y, w: CW, h, fill: { color: C.dark } };
  if (C.darkPage) boxOpt.line = { color: C.accent, width: 1 };   // 어두운 지면 테마를 추가할 때만 켠다
  box(s, boxOpt);
  const runs = Array.isArray(l1) ? l1 : [
    { text: l1, options: { fontSize: TS.summary, bold: true, color: C.onDark, breakLine: !!l2 } },
    ...(l2 ? [{ text: l2, options: { fontSize: TS.summary, bold: true, color: C.accentLt } }] : [])
  ];
  s.addText(runs, { objectName: "summary/text", x: MX + 0.18, y, w: CW - 0.36, h, fontFace: FH, align: "center", valign: "middle", margin: 0, lineSpacingMultiple: 1.20 });
  return y + h;
}

// 본문 중 강조 메시지. 페이지당 한 개 이내
function msgBox(s, y, h, text, x = MX, w = CW) {
  box(s, { x, y, w, h, fill: { color: C.sky } });
  s.addText(text, { objectName: "msgBox/text", x: x + 0.22, y, w: w - 0.44, h, fontFace: F, fontSize: TS.cardBody, color: C.msgInk, valign: "middle", margin: 0, lineSpacingMultiple: 1.22 });
  return y + h;
}

// 소제목. accent 세로바 + ink 소제목. 색 면적은 세로바 0.055in 뿐
function sub(s, x, y, label, desc, descW = 3.4) {
  s.addShape("rect", { objectName: "sub/shape", x, y: y + 0.02, w: 0.06, h: 0.28, fill: { color: C.accent } });
  s.addText(label, { objectName: "sub/text", x: x + 0.16, y, w: 3.4, h: 0.32, fontFace: F, fontSize: TS.sub, bold: true, color: C.ink, margin: 0, valign: "middle" });
  if (desc) s.addText(desc, { objectName: "sub/text", x: x + 0.16, y, w: descW, h: 0.32, fontFace: F, fontSize: TS.subDesc, color: C.mute, align: "right", margin: 0, valign: "middle" });
}

// 오픈 테이블. 헤더 배경 없음
// opts.washCols: 옅은 배경을 깔 열 인덱스   opts.cardBg: 표 전체를 card 색으로 띄움(크림 지면용)
function openTable(s, rows, opts) {
  const { x, y, w, colW, rowH } = opts;
  const total = rowH.reduce((a, b) => a + b, 0);
  if (opts.cardBg) s.addShape("rect", { objectName: "openTable/shape", x, y, w, h: total, fill: { color: C.card } });
  (opts.washCols || []).forEach(ci => {
    const cx = x + colW.slice(0, ci).reduce((a, b) => a + b, 0);
    s.addShape("rect", { objectName: "openTable/shape", x: cx, y: y + rowH[0], w: colW[ci], h: total - rowH[0], fill: { color: C.wash } });
  });
  s.addTable(rows, { objectName: "openTable/table", x, y, w, colW, rowH, border: { type: "none" }, margin: opts.margin || [3, 8, 3, 8], valign: "middle" });
  ruleThick(s, y - 0.014, x, w);
  ruleThin(s, y + rowH[0], x, w);
  let acc = rowH[0];
  for (let i = 1; i < rowH.length - 1; i++) { acc += rowH[i]; ruleThin(s, y + acc, x, w); }
  ruleThick(s, y + total, x, w);
  return y + total;
}

// 셀 스타일. fs 기본 12.5, TS.tableMin 아래로 내리지 않는다
// 정렬 규칙: 1행(머리글)과 1열은 중앙정렬이 기본이다. 숫자·짧은 값 열도 중앙정렬.
// 긴 서술문이 들어가 셀 안에서 줄바꿈되는 열만 tdL(좌측)을 쓴다.
// 자릿수가 세 자리 이상 벌어져 크기 비교가 어려우면 그 표만 numAlign: "right"로 연다.
function makeTableStyles(fs, opts = {}) {
  if (opts.tnum) {
    throw new Error("등폭 글꼴(Consolas)은 쓰지 않는다. 글꼴은 맑은 고딕과 HY헤드라인M 두 벌뿐이다");
  }
  const b = fs || TS.table, hf = b - 0.5, nf = F;
  const nAlign = opts.numAlign || "center";
  return {
    hd:    { fontFace: F, fontSize: hf, bold: true, color: C.ink, align: "center", valign: "middle" },
    td:    { fontFace: F, fontSize: b, color: C.body, align: "center", valign: "middle" },
    tdL:   { fontFace: F, fontSize: b, color: C.body, align: "left", valign: "middle" },
    tdR:   { fontFace: F, fontSize: b, color: C.body, align: "right", valign: "middle" },
    tdM:   { fontFace: F, fontSize: b, color: C.mute, align: "center", valign: "middle" },
    em:    { fontFace: F, fontSize: b, bold: true, color: C.accent, align: "center", valign: "middle" },
    emL:   { fontFace: F, fontSize: b, bold: true, color: C.accent, align: "left", valign: "middle" },
    // 숫자 열
    num:   { fontFace: nf, fontSize: b, color: C.body, align: nAlign, valign: "middle" },
    numEm: { fontFace: nf, fontSize: b, bold: true, color: C.accent, align: nAlign, valign: "middle" },
    // 합계 행
    tot:   { fontFace: F, fontSize: b, bold: true, color: C.ink, align: "center", valign: "middle" },
    totN:  { fontFace: nf, fontSize: b, bold: true, color: C.ink, align: nAlign, valign: "middle" }
  };
}

// 불릿. "⇒" 결론 줄에는 마커를 붙이지 않는다
function bullets(s, items, x, y, w, fs = TS.bullet, step = 0.40) {
  items.forEach((runs, i) => {
    const yy = y + i * step;
    const concl = runs.length && typeof runs[0].t === "string" && runs[0].t.trim().startsWith("⇒");
    if (!concl) s.addShape("rect", { objectName: "bullets/shape", x: x + 0.01, y: yy + 0.085, w: 0.055, h: 0.055, fill: { color: C.accent } });
    s.addText(runs.map(r => ({ text: r.t, options: { fontSize: fs, color: r.c || C.body, bold: !!r.b } })),
      { objectName: "bullets/text", x: x + 0.16, y: yy, w: w - 0.16, h: step, fontFace: F, margin: 0, valign: "top", lineSpacingMultiple: 1.18 });
  });
}

// 단일 계열 세로 막대. 강조 항목만 accent, 나머지 rule
// valClaims: vals와 같은 길이의 claim id 배열. 주면 막대 위 수치를 manifest 문자열로 그린다.
// 막대 높이(v)와 찍히는 문자열이 갈라지면 그림과 숫자가 다른 말을 한다 (계획서 2.4).
function bars(s, px, pw, base, maxH, vmax, labels, vals, hi, valClaims) {
  const x0 = px + 0.18, slot = (pw - 0.36) / vals.length, bw = Math.min(0.44, slot - 0.18);
  vals.forEach((v, i) => {
    const cx = x0 + i * slot + (slot - bw) / 2, on = i === hi;
    const h = v / vmax * maxH;
    s.addShape("rect", { objectName: "bars/shape", x: cx, y: base - h, w: bw, h, fill: { color: on ? C.accent : C.rule } });
    const vOpts = { x: cx - 0.22, y: base - h - 0.24, w: bw + 0.44, h: 0.22, fontFace: F, fontSize: TS.value, bold: on, color: on ? C.accent : C.body, align: "center", margin: 0 };
    const vClaim = valClaims && valClaims[i];
    if (vClaim) claimText(s, vClaim, vOpts);
    else s.addText(String(v), { objectName: "bars/text", ...vOpts });
    s.addText(labels[i], { objectName: "bars/text", x: x0 + i * slot - 0.06, y: base + 0.06, w: slot + 0.12, h: 0.34, fontFace: F, fontSize: TS.axis, color: on ? C.ink : C.mute, align: "center", margin: 0, valign: "top", lineSpacingMultiple: 1.0 });
  });
  ruleThin(s, base, px, pw);
}

// 다계열 묶음 막대. 계열색은 C.series 순서를 그대로 쓴다(페이지마다 바꾸지 않는다)
// series: [{name, vals:[...]}]  vals 길이는 labels 길이와 같아야 한다
function barsGroup(s, x, w, base, maxH, vmax, labels, series, opts = {}) {
  const n = labels.length, m = series.length;
  if (m > 6) throw new Error("계열은 6개까지다. 넘으면 표로 옮긴다");
  series.forEach(sr => {
    if (sr.vals.length !== n) throw new Error("계열 " + sr.name + "의 값 개수가 라벨 수와 다르다");
  });

  // 범례 — 기본은 막대 위쪽. opts.legendY로 소제목 바로 아래에 붙일 수 있다
  const ly = opts.legendY != null ? opts.legendY : base - maxH - 0.40;
  let lx = x + 0.04;
  series.forEach((sr, si) => {
    s.addShape("rect", { objectName: "barsGroup/shape", x: lx, y: ly + 0.07, w: 0.16, h: 0.10, fill: { color: C.series[si] } });
    s.addText(sr.name, { objectName: "barsGroup/text", x: lx + 0.24, y: ly, w: 1.22, h: 0.26, fontFace: F, fontSize: TS.legend, color: C.body, margin: 0, valign: "middle" });
    lx += 1.24;
  });

  const slot = w / n, gw = Math.min(slot * 0.70, 1.50), bw = gw / m;
  labels.forEach((lb, i) => {
    const gx = x + i * slot + (slot - gw) / 2;
    series.forEach((sr, si) => {
      const v = sr.vals[i], bh = Math.max(0, v) / vmax * maxH;
      s.addShape("rect", { objectName: "barsGroup/shape", x: gx + si * bw, y: base - bh, w: bw - 0.03, h: bh, fill: { color: C.series[si] } });
      if (opts.values !== false) {
        // opts.valClaims[si][i] 가 있으면 manifest 문자열로 찍는다.
        // 막대 높이와 숫자가 갈라지면 그림과 값이 다른 말을 한다 (계획서 2.4)
        const vOpts = { x: gx + si * bw - 0.20, y: base - bh - 0.22, w: bw + 0.37, h: 0.20, fontFace: F, fontSize: TS.value, color: C.mute, align: "center", margin: 0 };
        const vClaim = opts.valClaims && opts.valClaims[si] && opts.valClaims[si][i];
        if (vClaim) claimText(s, vClaim, vOpts);
        else s.addText(String(v), { objectName: "barsGroup/text", ...vOpts });
      }
    });
    s.addText(lb, { objectName: "barsGroup/text", x: x + i * slot, y: base + 0.06, w: slot, h: 0.30, fontFace: F, fontSize: TS.axis, color: C.ink, align: "center", margin: 0, valign: "top" });
  });
  ruleThin(s, base, x, w);
  return base + 0.36;
}

function caption(s, x, y, w, text) {
  s.addText(text, { objectName: "caption/text", x, y, w, h: 0.28, fontFace: F, fontSize: TS.legend, color: C.mute, margin: 0 });
}

// 각주. 바닥 기준으로 붙이고 마감선도 함께 그린다
function footer(s, notes, y, opts = {}) {
  if (y != null && typeof y === "object") { opts = y; y = null; }   // footer(s, notes, {page})
  if (y == null) {
    y = FOOT_BASE - SR.zones.footnote_line_step * notes.length;
    if (opts.rule !== false) ruleThin(s, y - 0.12);
  }
  // 텍스트 상자 높이를 줄수에 맞춘다. 고정 0.42로 두면 상자 하단이 지면 밖으로 나간다
  const pw = opts.page ? 1.10 : 0;
  s.addText(notes.map((t, i) => ({ text: t, options: { breakLine: i < notes.length - 1 } })),
    { objectName: "footer/text", x: MX, y, w: CW - pw, h: 0.15 * notes.length + 0.12, fontFace: F, fontSize: TS.foot, color: C.mute, margin: 0, valign: "top", lineSpacingMultiple: 1.14 });
  // 페이지 표기는 각주 줄 오른쪽 끝. 제목 옆이 아니라 여기다
  if (opts.page) {
    s.addText(String(opts.page), { objectName: "footer/text", x: MX + CW - pw, y, w: pw, h: 0.20, fontFace: F, fontSize: TS.foot,
      color: C.mute, align: "right", margin: 0, valign: "top" });
  }
}

/* ══════════════════════════════════════════════════════════
   아이콘 — 폰트 글리프를 쓰지 않고 도형으로 직접 그린다
   전부 단선 1.25pt, 정사각 박스 안
   ══════════════════════════════════════════════════════════ */

const ICON_PT = 1.25;

function icon(s, x, y, sz, kind, color) {
  const c = color || C.accent, L = { color: c, width: ICON_PT };
  const ln = (x1, y1, w, h) => s.addShape("line", { objectName: "icon/shape", x: x1, y: y1, w, h, line: L });
  const rc = (x1, y1, w, h) => s.addShape("rect", { objectName: "icon/shape", x: x1, y: y1, w, h, fill: { type: "none" }, line: L });
  const el = (x1, y1, w, h) => s.addShape("ellipse", { objectName: "icon/shape", x: x1, y: y1, w, h, fill: { type: "none" }, line: L });
  const u = sz;
  switch (kind) {
    case "bank":
      ln(x, y + u * 0.30, u, 0);
      ln(x + u * 0.5, y + u * 0.06, 0, u * 0.24);
      [0.18, 0.42, 0.66].forEach(p => ln(x + u * p + u * 0.08, y + u * 0.34, 0, u * 0.42));
      ln(x, y + u * 0.82, u, 0);
      break;
    case "doc":
      rc(x + u * 0.14, y + u * 0.06, u * 0.72, u * 0.88);
      [0.32, 0.50, 0.68].forEach(p => ln(x + u * 0.28, y + u * p, u * 0.44, 0));
      break;
    case "coin":
      el(x + u * 0.06, y + u * 0.10, u * 0.88, u * 0.26);
      ln(x + u * 0.06, y + u * 0.23, 0, u * 0.24); ln(x + u * 0.94, y + u * 0.23, 0, u * 0.24);
      el(x + u * 0.06, y + u * 0.34, u * 0.88, u * 0.26);
      ln(x + u * 0.06, y + u * 0.47, 0, u * 0.24); ln(x + u * 0.94, y + u * 0.47, 0, u * 0.24);
      el(x + u * 0.06, y + u * 0.58, u * 0.88, u * 0.26);
      break;
    case "spread":
      rc(x + u * 0.24, y + u * 0.04, u * 0.52, u * 0.26);
      ln(x + u * 0.50, y + u * 0.30, 0, u * 0.16);
      ln(x + u * 0.14, y + u * 0.46, u * 0.72, 0);
      [0.14, 0.50, 0.86].forEach(p => ln(x + u * p, y + u * 0.46, 0, u * 0.20));
      [0.14, 0.50, 0.86].forEach(p => rc(x + u * (p - 0.10), y + u * 0.66, u * 0.20, u * 0.24));
      break;
    case "clock":
      el(x + u * 0.08, y + u * 0.08, u * 0.84, u * 0.84);
      ln(x + u * 0.50, y + u * 0.28, 0, u * 0.22);
      ln(x + u * 0.50, y + u * 0.50, u * 0.22, 0);
      break;
    case "chart":
      ln(x + u * 0.12, y + u * 0.86, u * 0.76, 0);
      [[0.26, 0.30], [0.46, 0.48], [0.66, 0.64]].forEach(([p, h]) =>
        rc(x + u * p, y + u * (0.86 - h), u * 0.14, u * h));
      break;
    case "people":
      el(x + u * 0.32, y + u * 0.10, u * 0.34, u * 0.34);
      s.addShape("roundRect", { objectName: "icon/shape", x: x + u * 0.16, y: y + u * 0.52, w: u * 0.66, h: u * 0.34, rectRadius: 0.04, fill: { type: "none" }, line: L });
      break;
    case "check":
      el(x + u * 0.06, y + u * 0.06, u * 0.88, u * 0.88);
      ln(x + u * 0.30, y + u * 0.52, u * 0.16, u * 0.18);
      ln(x + u * 0.46, y + u * 0.70, u * 0.26, u * -0.34);
      break;
    case "warn":
      s.addShape("triangle", { objectName: "icon/shape", x: x + u * 0.04, y: y + u * 0.10, w: u * 0.92, h: u * 0.78, fill: { type: "none" }, line: L });
      ln(x + u * 0.50, y + u * 0.38, 0, u * 0.24);
      break;
    case "box":
      rc(x + u * 0.08, y + u * 0.24, u * 0.84, u * 0.60);
      ln(x + u * 0.08, y + u * 0.44, u * 0.84, 0);
      ln(x + u * 0.36, y + u * 0.10, u * 0.28, 0);
      ln(x + u * 0.36, y + u * 0.10, 0, u * 0.14); ln(x + u * 0.64, y + u * 0.10, 0, u * 0.14);
      break;
    default:
      rc(x + u * 0.10, y + u * 0.10, u * 0.80, u * 0.80);
  }
}

/* ══════════════════════════════════════════════════════════
   기본 도식 7종
   공통: 카드 제목 13pt / 본문 11pt / 라벨 10.5pt
   강조는 wash 배경 + accent 테두리 + bold 셋을 한 번에 건다
   ══════════════════════════════════════════════════════════ */

// ① 흐름 — 순서·공정, 자본이 돌아오는 구조
function flow(s, x, y, w, h, steps, opts = {}) {
  const n = steps.length, gap = 0.42;
  const bw = (w - gap * (n - 1)) / n;
  steps.forEach((st, i) => {
    const bx = x + i * (bw + gap), on = opts.hi === i;
    if (opts.bare) {
      // 테두리 없이 상단 선만. 카드가 줄지어 선 인상을 줄인다
      s.addShape("rect", { objectName: "flow/shape", x: bx, y, w: bw, h: on ? 0.03 : 0.012, fill: { color: on ? C.accent : C.rule } });
      if (on) s.addShape("rect", { objectName: "flow/shape", x: bx, y: y + 0.03, w: bw, h: h - 0.03, fill: { color: C.wash } });
    } else {
      box(s, { x: bx, y, w: bw, h, fill: { color: on ? C.wash : C.card }, line: { color: on ? C.accent : C.rule, width: on ? 1.25 : 0.75 } });
    }
    if (st.icon) icon(s, bx + bw / 2 - 0.22, y + 0.14, 0.44, st.icon, on ? C.accent : C.body);
    s.addText(st.title, { objectName: "flow/text", x: bx + 0.08, y: y + 0.66, w: bw - 0.16, h: 0.32, fontFace: F, fontSize: TS.cardTitle, bold: true, color: C.ink, align: "center", valign: "middle", margin: 0 });
    if (st.desc) s.addText(st.desc, { objectName: "flow/text", x: bx + 0.10, y: y + 1.02, w: bw - 0.20, h: h - 1.12, fontFace: F, fontSize: TS.cardBody, color: C.body, align: "center", valign: "top", margin: 0, lineSpacingMultiple: 1.14 });
    if (i < n - 1) {
      s.addShape("rightArrow", { objectName: "flow/shape", x: bx + bw + 0.09, y: y + h * 0.30, w: 0.24, h: 0.20, fill: { color: C.rule } });
    }
  });
  if (opts.loop) {
    const by = y + h + 0.26, x1 = x + w - bw / 2, x2 = x + bw / 2;
    s.addShape("line", { objectName: "flow/shape", x: x1, y: y + h, w: 0, h: by - (y + h), line: { color: C.accent, width: 1, dashType: "dash" } });
    s.addShape("line", { objectName: "flow/shape", x: x2, y: by, w: x1 - x2, h: 0, line: { color: C.accent, width: 1, dashType: "dash" } });
    s.addShape("upArrow", { objectName: "flow/shape", x: x2 - 0.09, y: by - 0.22, w: 0.18, h: 0.22, fill: { color: C.accent } });
    if (opts.loopLabel) {
      s.addShape("rect", { objectName: "flow/shape", x: x2 + 0.24, y: by - 0.19, w: x1 - x2 - 0.48, h: 0.18, fill: { color: C.page } });
      s.addText(opts.loopLabel, { objectName: "flow/text", x: x2 + 0.20, y: by - 0.20, w: x1 - x2 - 0.40, h: 0.20, fontFace: F, fontSize: TS.axis, bold: true, color: C.accent, align: "center", valign: "middle", margin: 0 });
    }
  }
  return y + h + (opts.loop ? 0.46 : 0);
}

// ② 적층 — 계층·자본구조. layers: [{label, note}] 위에서 아래로
function stack(s, x, y, w, layers, hi, opts = {}) {
  const lh = opts.lh || 0.58;
  layers.forEach((L, i) => {
    const ly = y + i * lh, on = i === hi;
    box(s, { x, y: ly, w: w * 0.46, h: lh - 0.06, fill: { color: on ? C.wash : C.card }, line: { color: on ? C.accent : C.rule, width: on ? 1.25 : 0.75 } });
    s.addText(L.label, { objectName: "stack/text", x: x + 0.08, y: ly, w: w * 0.46 - 0.16, h: lh - 0.06, fontFace: F, fontSize: TS.layer, bold: on, color: on ? C.accent : C.ink, align: "center", valign: "middle", margin: 0 });
    if (L.note) s.addText(L.note, { objectName: "stack/text", x: x + w * 0.50, y: ly, w: w * 0.50, h: lh - 0.06, fontFace: F, fontSize: TS.cardBody, color: C.body, valign: "middle", margin: 0 });
  });
  return y + layers.length * lh;
}

// ③ 분기 — 하나의 값이 여러 갈래로 나뉘는 구조
function branch(s, x, y, w, h, head, items, opts = {}) {
  const hw = opts.headW || w * 0.30, gap = 0.52;
  box(s, { x, y, w: hw, h, fill: { color: C.wash }, line: { color: C.accent, width: 1.25 } });
  s.addText(head.title, { objectName: "branch/text", x: x + 0.10, y: y + h * 0.13, w: hw - 0.20, h: 0.34, fontFace: F, fontSize: TS.layer, color: C.body, align: "center", valign: "middle", margin: 0 });
  s.addText(head.value, { objectName: "branch/text", x: x + 0.10, y: y + h * 0.37, w: hw - 0.20, h: 0.54, fontFace: F, fontSize: TS.bigValue, bold: true, color: C.accent, align: "center", valign: "middle", margin: 0 });
  if (head.note) s.addText(head.note, { objectName: "branch/text", x: x + 0.10, y: y + h * 0.74, w: hw - 0.20, h: 0.30, fontFace: F, fontSize: TS.axis, color: C.mute, align: "center", valign: "middle", margin: 0 });

  const ix = x + hw + gap, iw = w - hw - gap, n = items.length;
  const ih = (h - 0.14 * (n - 1)) / n;
  const spine = x + hw + gap * 0.46;
  s.addShape("line", { objectName: "branch/shape", x: x + hw, y: y + h / 2, w: gap * 0.46, h: 0, line: { color: C.rule, width: 1 } });
  s.addShape("line", { objectName: "branch/shape", x: spine, y: y + ih / 2, w: 0, h: h - ih, line: { color: C.rule, width: 1 } });
  items.forEach((it, i) => {
    const iy = y + i * (ih + 0.14);
    s.addShape("line", { objectName: "branch/shape", x: spine, y: iy + ih / 2, w: ix - spine, h: 0, line: { color: C.rule, width: 1 } });
    box(s, { x: ix, y: iy, w: iw, h: ih, fill: { color: C.card }, line: { color: C.rule, width: 0.75 } });
    s.addText(it.label, { objectName: "branch/text", x: ix + 0.16, y: iy, w: iw * 0.40, h: ih, fontFace: F, fontSize: TS.layer, bold: true, color: C.ink, valign: "middle", margin: 0 });
    if (it.note) s.addText(it.note, { objectName: "branch/text", x: ix + iw * 0.42, y: iy, w: iw * 0.56, h: ih, fontFace: F, fontSize: TS.cardBody, color: C.body, valign: "middle", margin: 0, lineSpacingMultiple: 1.14 });
  });
  return y + h;
}

// ④ 2×2 매트릭스. cells 순서: [좌상, 우상, 좌하, 우하]
// axis: { x:[왼쪽말, 오른쪽말], xName, y:[아래말, 위말], yName }
// y를 주면 왼쪽에 세로축 여백을 내고 방향과 축 이름을 적는다. 안 주면 가로축만 그린다
function matrix(s, x, y, w, h, axis, cells, hi) {
  const gut = axis.y ? 0.58 : 0;          // 세로축 표기용 왼쪽 여백
  const gx = x + gut, gw = w - gut;
  const cw = gw / 2, ch = h / 2;
  cells.forEach((c, i) => {
    const cx = gx + (i % 2) * cw, cy = y + Math.floor(i / 2) * ch, on = i === hi;
    if (on) s.addShape("rect", { objectName: "matrix/shape", x: cx, y: cy, w: cw, h: ch, fill: { color: C.wash } });
    s.addText(c.title, { objectName: "matrix/text", x: cx + 0.18, y: cy + 0.16, w: cw - 0.36, h: 0.34, fontFace: F, fontSize: TS.cardTitle - 0.5, bold: true, color: on ? C.accent : C.ink, margin: 0, valign: "middle" });
    if (c.note) s.addText(c.note, { objectName: "matrix/text", x: cx + 0.18, y: cy + 0.54, w: cw - 0.36, h: ch - 0.68, fontFace: F, fontSize: TS.cardBody, color: C.body, margin: 0, valign: "top", lineSpacingMultiple: 1.16 });
  });
  s.addShape("line", { objectName: "matrix/shape", x: gx, y: y + ch, w: gw, h: 0, line: { color: C.rule, width: 1 } });
  s.addShape("line", { objectName: "matrix/shape", x: gx + cw, y, w: 0, h, line: { color: C.rule, width: 1 } });
  s.addShape("rect", { objectName: "matrix/shape", x: gx, y: y + h, w: gw, h: 0.02, fill: { color: C.ink } });
  s.addShape("rect", { objectName: "matrix/shape", x: gx, y, w: 0.02, h, fill: { color: C.ink } });

  // 가로축
  s.addText(axis.x[0], { objectName: "matrix/text", x: gx, y: y + h + 0.08, w: cw, h: 0.28, fontFace: F, fontSize: TS.axis, color: C.mute, margin: 0 });
  s.addText(axis.x[1], { objectName: "matrix/text", x: gx + cw, y: y + h + 0.08, w: cw - 0.04, h: 0.28, fontFace: F, fontSize: TS.axis, color: C.mute, align: "right", margin: 0 });
  if (axis.xName) s.addText(axis.xName, { objectName: "matrix/text", x: gx, y: y + h + 0.08, w: gw, h: 0.28, fontFace: F, fontSize: TS.axis, bold: true, color: C.ink, align: "center", margin: 0 });

  // 세로축 — 위아래 방향을 말로 적고 축 이름은 세워서 넣는다
  if (axis.y) {
    s.addText(axis.y[1], { objectName: "matrix/text", x: x, y: y - 0.02, w: gut - 0.10, h: 0.26, fontFace: F, fontSize: TS.axis, color: C.mute, align: "right", valign: "middle", margin: 0 });
    s.addText(axis.y[0], { objectName: "matrix/text", x: x, y: y + h - 0.24, w: gut - 0.10, h: 0.26, fontFace: F, fontSize: TS.axis, color: C.mute, align: "right", valign: "middle", margin: 0 });
    if (axis.yName) {
      s.addText(axis.yName, { objectName: "matrix/text", x: x + gut / 2 - h / 2, y: y + h / 2 - 0.15, w: h, h: 0.30, rotate: 270,
        fontFace: F, fontSize: TS.axis, bold: true, color: C.ink, align: "center", valign: "middle", margin: 0 });
    }
  }
  return y + h + 0.36;
}

// ⑤ 타임라인 — 단계별 일정과 마일스톤
function timeline(s, x, y, w, nodes, opts = {}) {
  const n = nodes.length, slot = w / n, base = y + 0.68;
  const noteH = opts.noteH || 0.94;   // 설명 줄수에 맞춰 줄인다. 남기면 아래에 빈 띠가 생긴다
  s.addShape("rect", { objectName: "timeline/shape", x, y: base, w, h: 0.02, fill: { color: C.rule } });
  nodes.forEach((nd, i) => {
    const cx = x + i * slot + slot / 2, on = i === opts.hi;
    s.addText(nd.when, { objectName: "timeline/text", x: cx - slot / 2 + 0.08, y, w: slot - 0.16, h: 0.34, fontFace: F, fontSize: TS.cardTitle - 0.5, bold: true, color: on ? C.accent : C.ink, align: "center", valign: "middle", margin: 0 });
    if (nd.what) s.addText(nd.what, { objectName: "timeline/text", x: cx - slot / 2 + 0.08, y: y + 0.34, w: slot - 0.16, h: 0.28, fontFace: F, fontSize: TS.axis, color: C.mute, align: "center", valign: "middle", margin: 0 });
    s.addShape("ellipse", { objectName: "timeline/shape", x: cx - 0.085, y: base - 0.075, w: 0.17, h: 0.17, fill: { color: on ? C.accent : C.card }, line: { color: on ? C.accent : C.rule, width: 1.25 } });
    if (nd.note) s.addText(nd.note, { objectName: "timeline/text", x: cx - slot / 2 + 0.08, y: base + 0.20, w: slot - 0.16, h: noteH, fontFace: F, fontSize: TS.cardBody, color: C.body, align: "center", valign: "top", margin: 0, lineSpacingMultiple: 1.16 });
  });
  return base + 0.20 + noteH;
}

// ⑥ 비교 대조 — 두 방식을 항목별로 맞대는 구조
function compare(s, x, y, w, heads, rows, hi, opts = {}) {
  const lw = (w - 1.90) / 2, mx = x + lw, mw = 1.90, rx = mx + mw;
  const hh = opts.hh || 0.54, rh = opts.rh || 0.62;
  [[x, lw, heads.left, hi === "left"], [rx, lw, heads.right, hi === "right"]].forEach(([bx, bw, t, on]) => {
    box(s, { x: bx, y, w: bw, h: hh, fill: { color: on ? C.wash : C.card }, line: { color: on ? C.accent : C.rule, width: on ? 1.25 : 0.75 } });
    s.addText(t, { objectName: "compare/text", x: bx + 0.08, y, w: bw - 0.16, h: hh, fontFace: F, fontSize: TS.cardTitle, bold: true, color: on ? C.accent : C.ink, align: "center", valign: "middle", margin: 0 });
  });
  rows.forEach((r, i) => {
    const ry = y + hh + 0.06 + i * rh;
    s.addText(r.left, { objectName: "compare/text", x: x + 0.08, y: ry, w: lw - 0.16, h: rh, fontFace: F, fontSize: TS.cardBody, color: hi === "left" ? C.ink : C.body, align: "center", valign: "middle", margin: 0 });
    s.addText(r.label, { objectName: "compare/text", x: mx, y: ry, w: mw, h: rh, fontFace: F, fontSize: TS.cardBody, bold: true, color: C.mute, align: "center", valign: "middle", margin: 0 });
    s.addText(r.right, { objectName: "compare/text", x: rx + 0.08, y: ry, w: lw - 0.16, h: rh, fontFace: F, fontSize: TS.cardBody, color: hi === "right" ? C.ink : C.body, align: "center", valign: "middle", margin: 0 });
    if (i < rows.length - 1) s.addShape("rect", { objectName: "compare/shape", x, y: ry + rh, w, h: 0.008, fill: { color: C.rule } });
  });
  return y + hh + 0.06 + rows.length * rh;
}

// ⑦ 계층도 — 상위 1개 아래 하위 n개
function tree(s, x, y, w, root, children) {
  const rw = w * 0.36, rx = x + (w - rw) / 2, rh = 0.60;
  box(s, { x: rx, y, w: rw, h: rh, fill: { color: C.wash }, line: { color: C.accent, width: 1.25 } });
  s.addText(root.label, { objectName: "tree/text", x: rx + 0.08, y, w: rw - 0.16, h: rh, fontFace: F, fontSize: TS.cardTitle - 0.5, bold: true, color: C.accent, align: "center", valign: "middle", margin: 0 });

  const n = children.length, slot = w / n, ty = y + rh + 0.34, ch = 0.92;
  s.addShape("line", { objectName: "tree/shape", x: x + w / 2, y: y + rh, w: 0, h: 0.16, line: { color: C.rule, width: 1 } });
  s.addShape("line", { objectName: "tree/shape", x: x + slot / 2, y: y + rh + 0.16, w: w - slot, h: 0, line: { color: C.rule, width: 1 } });
  children.forEach((c, i) => {
    const cx = x + i * slot, bw = slot - 0.20;
    s.addShape("line", { objectName: "tree/shape", x: cx + slot / 2, y: y + rh + 0.16, w: 0, h: 0.18, line: { color: C.rule, width: 1 } });
    box(s, { x: cx + 0.10, y: ty, w: bw, h: ch, fill: { color: C.card }, line: { color: C.rule, width: 0.75 } });
    s.addText(c.label, { objectName: "tree/text", x: cx + 0.16, y: ty + 0.08, w: bw - 0.12, h: 0.32, fontFace: F, fontSize: TS.layer, bold: true, color: C.ink, align: "center", valign: "middle", margin: 0 });
    if (c.note) s.addText(c.note, { objectName: "tree/text", x: cx + 0.16, y: ty + 0.42, w: bw - 0.12, h: ch - 0.50, fontFace: F, fontSize: TS.cardBody, color: C.body, align: "center", valign: "top", margin: 0, lineSpacingMultiple: 1.14 });
  });
  return ty + ch;
}

module.exports = {
  F, FH, C, TS, THEMES, W, H, MX, CW, COLW, RX, FOOT_BASE,
  BAND_TOP, SUB_GAP, BLOCK_GAP, COL_TOL, SLACK_MAX, bandBottom, checkLayout, layoutIssues, save,
  useTheme, themeName, newPres, addSlide,
  CORNERS, useCorners, corners, box,
  header, eyebrow, summary, sub, ruleThick, ruleThin,
  openTable, makeTableStyles, bullets, msgBox, caption, footer,
  icon, bars, barsGroup,
  flow, stack, branch, matrix, timeline, compare, tree,
  // ── 계약 (deckkit. 계획서 2.16) ──────────────────────────────────
  claim, claimText, cell, whitelistToken, manifest, writeManifest,
  resetManifest, sourceRoot, currentSlide, nameOf, claimName,
  table: kitTable, writeDeck: kit.writeDeck,
  // 이 생성기가 어느 스킬의 문법인지. manifest에 박힌다 (2.17)
  STYLE, TEMPLATE_VERSION, R, SR, TS,
};

/* ══════════════════════════════════════════════════════════
   확장 도식 8종 (v2)
   기존 7종과 같은 규칙을 따른다. 카드 제목 13pt / 본문 11pt / 라벨 10.5pt,
   강조는 wash 배경 + accent 테두리 + bold 셋을 한 번에 건다.
   ══════════════════════════════════════════════════════════ */

// 천단위 구분 + 부호
function fmtNum(v, digits) {
  const n = Number(v);
  return digits != null ? n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
                        : n.toLocaleString("en-US");
}
// 배경색 위에 올릴 글자색을 명도로 고른다
function textOn(hex) {
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? C.ink : C.card;
}

// ⑧ 워터폴 — 증감 분해(브리지). 실적·손익이 무엇 때문에 얼마 움직였는지
// items: [{label, value, type:"base"|"delta"|"total"}]  delta의 value는 증감분
function waterfall(s, x, y, w, h, items, opts = {}) {
  const n = items.length;
  let run = 0;
  const seq = items.map(it => {
    if (it.type === "base" || it.type === "total") { run = it.value; return Object.assign({}, it, { from: null, to: it.value }); }
    const from = run; run = run + it.value; return Object.assign({}, it, { from: from, to: run });
  });
  // 축이 0에서 시작하면 증감 막대가 기준 막대에 눌려 보이지 않는다.
  // 최저 수준 아래로 여유를 두고 바닥을 잡는다. 축이 0이 아님을 각주에 밝힌다.
  let hi = -Infinity, lo = Infinity;
  seq.forEach(q => { [q.from, q.to].forEach(v => { if (v != null) { hi = Math.max(hi, v); lo = Math.min(lo, v); } }); });
  const rng = (hi - lo) || Math.abs(hi) || 1;
  const floor = opts.vmin != null ? opts.vmin : lo - rng * 0.55;
  hi = opts.vmax != null ? opts.vmax : hi + rng * 0.18;
  seq.forEach(q => { if (q.from == null) q.from = floor; });
  lo = floor;
  const span = (hi - lo) || 1, plotH = h - 0.60;
  const yOf = v => y + plotH - (v - lo) / span * plotH;
  const slot = w / n, bw = Math.min(slot * 0.58, 0.86);

  seq.forEach((q, i) => {
    const cx = x + i * slot + (slot - bw) / 2;
    const top = yOf(Math.max(q.from, q.to)), bot = yOf(Math.min(q.from, q.to));
    const isEnd = q.type === "base" || q.type === "total";
    const fill = isEnd ? C.ink : (q.value >= 0 ? C.series[1] : C.series[3]);
    s.addShape("rect", { objectName: "waterfall/shape", x: cx, y: top, w: bw, h: Math.max(bot - top, 0.02), fill: { color: fill } });
    const lab = isEnd ? fmtNum(q.value) : (q.value >= 0 ? "+" : "-") + fmtNum(Math.abs(q.value));
    s.addText(lab, { objectName: "waterfall/text", x: cx - 0.30, y: top - 0.24, w: bw + 0.60, h: 0.22, fontFace: F, fontSize: TS.value,
      bold: isEnd, color: isEnd ? C.ink : C.body, align: "center", margin: 0 });
    s.addText(q.label, { objectName: "waterfall/text", x: x + i * slot, y: y + plotH + 0.10, w: slot, h: 0.40, fontFace: F, fontSize: TS.axis,
      bold: isEnd, color: isEnd ? C.ink : C.mute, align: "center", valign: "top", margin: 0, lineSpacingMultiple: 1.02 });
    if (i < n - 1 && seq[i + 1].type === "delta") {
      s.addShape("line", { objectName: "waterfall/shape", x: cx + bw, y: yOf(q.to), w: slot - bw, h: 0, line: { color: C.rule, width: 0.75, dashType: "dash" } });
    }
  });
  ruleThin(s, y + plotH, x, w);
  return y + h;
}

// ⑨ 추이 — 시계열 꺾은선. 막대로는 방향이 안 보이는 경우에 쓴다
// series: [{name, vals:[...]}]
function lineTrend(s, x, y, w, h, labels, series, opts = {}) {
  const n = labels.length, m = series.length;
  if (m > 4) throw new Error("추이 계열은 4개까지다. 넘으면 표로 옮긴다");
  let hi = -Infinity, lo = Infinity;
  series.forEach(sr => sr.vals.forEach(v => { hi = Math.max(hi, v); lo = Math.min(lo, v); }));
  hi = opts.vmax != null ? opts.vmax : hi * 1.12;
  lo = opts.vmin != null ? opts.vmin : Math.min(lo, 0);
  const span = (hi - lo) || 1;
  const legendH = m > 1 ? 0.36 : 0;
  const plotY = y + legendH, plotH = h - legendH - 0.48;
  const yOf = v => plotY + plotH - (v - lo) / span * plotH;
  const xOf = i => x + 0.26 + i * (w - 0.52) / Math.max(n - 1, 1);

  if (m > 1) {
    let lx = x + 0.04;
    series.forEach((sr, si) => {
      s.addShape("rect", { objectName: "lineTrend/shape", x: lx, y: y + 0.12, w: 0.22, h: 0.06, fill: { color: C.series[si] } });
      s.addText(sr.name, { objectName: "lineTrend/text", x: lx + 0.28, y: y, w: 1.22, h: 0.26, fontFace: F, fontSize: TS.legend, color: C.body, margin: 0, valign: "middle" });
      lx += 1.28;
    });
  }
  series.forEach((sr, si) => {
    const col = C.series[si];
    for (let i = 0; i < n - 1; i++) {
      const x1 = xOf(i), y1 = yOf(sr.vals[i]), x2 = xOf(i + 1), y2 = yOf(sr.vals[i + 1]);
      s.addShape("line", { objectName: "lineTrend/shape", x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color: col, width: 1.75 } });
    }
    sr.vals.forEach((v, i) => {
      s.addShape("ellipse", { objectName: "lineTrend/shape", x: xOf(i) - 0.065, y: yOf(v) - 0.065, w: 0.13, h: 0.13, fill: { color: col } });
      if (opts.values !== false && (opts.values === true || si === 0 || m === 1)) {
        const vOpts = { x: xOf(i) - 0.48, y: yOf(v) - 0.34, w: 0.96, h: 0.20,
          fontFace: F, fontSize: TS.value, color: C.body, align: "center", margin: 0 };
        const vClaim = opts.valClaims && opts.valClaims[si] && opts.valClaims[si][i];
        if (vClaim) claimText(s, vClaim, vOpts);
        else s.addText(fmtNum(v, opts.digits), { objectName: "lineTrend/text", ...vOpts });
      }
    });
  });
  labels.forEach((lb, i) => {
    s.addText(lb, { objectName: "lineTrend/text", x: xOf(i) - 0.56, y: plotY + plotH + 0.08, w: 1.12, h: 0.30, fontFace: F, fontSize: TS.axis,
      color: C.ink, align: "center", valign: "top", margin: 0 });
  });
  ruleThin(s, plotY + plotH, x, w);
  return y + h;
}

// ⑩ 구성비 누적 막대 — 100% 가로 막대. 원그래프 대신 쓴다(여러 행을 세로로 비교 가능)
// rows: [{label, parts:[{name, value}]}]  parts 순서는 전 행에서 같아야 한다
function stackedBar(s, x, y, w, rows, opts = {}) {
  const lw = opts.labelW || w * 0.18, rh = opts.rh || 0.58, gap = opts.gap || 0.16;
  const names = rows[0].parts.map(p => p.name);
  let ly = y;
  if (opts.legend !== false) {
    let lx = x + lw;
    names.forEach((nm, si) => {
      s.addShape("rect", { objectName: "stackedBar/shape", x: lx, y: y + 0.09, w: 0.20, h: 0.11, fill: { color: C.series[si] } });
      s.addText(nm, { objectName: "stackedBar/text", x: lx + 0.26, y: y, w: 1.24, h: 0.28, fontFace: F, fontSize: TS.legend, color: C.body, margin: 0, valign: "middle" });
      lx += 1.34;
    });
    ly = y + 0.40;
  }
  rows.forEach((r, ri) => {
    const by = ly + ri * (rh + gap), bx = x + lw, bw = w - lw;
    const tot = r.parts.reduce((a, p) => a + p.value, 0) || 1;
    s.addText(r.label, { objectName: "stackedBar/text", x, y: by, w: lw - 0.12, h: rh, fontFace: F, fontSize: TS.layer - 1, bold: true, color: C.ink, valign: "middle", margin: 0 });
    let cx = bx;
    r.parts.forEach((p, si) => {
      const pw = p.value / tot * bw, col = C.series[si];
      s.addShape("rect", { objectName: "stackedBar/shape", x: cx, y: by, w: pw, h: rh, fill: { color: col } });
      if (pw > 0.52) {
        s.addText((p.value / tot * 100).toFixed(1) + "%", { objectName: "stackedBar/text", x: cx, y: by, w: pw, h: rh, fontFace: F, fontSize: TS.axis,
          bold: true, color: textOn(col), align: "center", valign: "middle", margin: 0 });
      }
      cx += pw;
    });
  });
  return ly + rows.length * rh + (rows.length - 1) * gap;
}

// ⑪ 단계 띠 — 추진 단계 로드맵. flow와 달리 설명 없이 단계 이름만 이어 붙인다
function chevron(s, x, y, w, h, steps, opts = {}) {
  const n = steps.length, ov = 0.18;
  const bw = (w + ov * (n - 1)) / n;
  steps.forEach((st, i) => {
    const bx = x + i * (bw - ov), on = opts.hi === i;
    s.addShape("chevron", { objectName: "chevron/shape", x: bx, y, w: bw, h, fill: { color: on ? C.wash : C.card },
      line: { color: on ? C.accent : C.rule, width: on ? 1.25 : 0.75 } });
    s.addText(st.label, { objectName: "chevron/text", x: bx + 0.24, y: st.note ? y + 0.08 : y, w: bw - 0.44, h: st.note ? 0.32 : h,
      fontFace: F, fontSize: TS.layer, bold: true, color: on ? C.accent : C.ink, align: "center", valign: "middle", margin: 0 });
    if (st.note) s.addText(st.note, { objectName: "chevron/text", x: bx + 0.24, y: y + 0.42, w: bw - 0.44, h: h - 0.50, fontFace: F, fontSize: TS.axis,
      color: C.body, align: "center", valign: "top", margin: 0, lineSpacingMultiple: 1.10 });
  });
  return y + h;
}

// ⑫ 주체별 프로세스 — 부서가 여럿인 절차. 누가 무엇을 언제 하는지
// cols: 단계 이름 배열   lanes: [{name, cells:[문자열 또는 null, ...]}]
function swimlane(s, x, y, w, cols, lanes, opts = {}) {
  const lw = opts.laneW || 1.24, cw = (w - lw) / cols.length;
  const hh = 0.40, rh = opts.rh || 0.74;
  cols.forEach((c, i) => {
    s.addText(c, { objectName: "swimlane/text", x: x + lw + i * cw, y, w: cw, h: hh, fontFace: F, fontSize: TS.gridHead, bold: true,
      color: C.ink, align: "center", valign: "middle", margin: 0 });
  });
  ruleThin(s, y + hh, x, w);
  lanes.forEach((L, j) => {
    const ly = y + hh + 0.06 + j * rh;
    s.addText(L.name, { objectName: "swimlane/text", x, y: ly, w: lw - 0.10, h: rh, fontFace: F, fontSize: TS.gridCell + 0.5, bold: true,
      color: C.mute, valign: "middle", margin: 0 });
    L.cells.forEach((t, i) => {
      if (!t) return;
      const cx = x + lw + i * cw + 0.07, bw = cw - 0.14, on = opts.hi && opts.hi[0] === j && opts.hi[1] === i;
      box(s, { x: cx, y: ly + 0.06, w: bw, h: rh - 0.16, fill: { color: on ? C.wash : C.card },
        line: { color: on ? C.accent : C.rule, width: on ? 1.25 : 0.75 } });
      s.addText(t, { objectName: "swimlane/text", x: cx + 0.06, y: ly + 0.06, w: bw - 0.12, h: rh - 0.16, fontFace: F, fontSize: TS.gridCell,
        color: on ? C.accent : C.body, align: "center", valign: "middle", margin: 0, lineSpacingMultiple: 1.08 });
      const nxt = L.cells[i + 1];
      if (nxt) s.addShape("rightArrow", { objectName: "swimlane/shape", x: cx + bw + 0.005, y: ly + rh / 2 - 0.09, w: 0.13, h: 0.16, fill: { color: C.rule } });
    });
    if (j < lanes.length - 1) ruleThin(s, ly + rh, x, w);
  });
  ruleThin(s, y + hh + 0.06 + lanes.length * rh, x, w);
  return y + hh + 0.06 + lanes.length * rh;
}

// ⑬ 깔때기 — 단계별로 줄어드는 구조(파이프라인·심사 통과). stages: [{label, value, note}]
function funnel(s, x, y, w, stages, opts = {}) {
  const n = stages.length, rh = opts.rh || 0.64, gap = 0.10;
  const zone = opts.zoneW || w * 0.52, maxV = stages[0].value || 1;
  stages.forEach((st, i) => {
    const by = y + i * (rh + gap);
    const bw = zone * Math.max(st.value / maxV, 0.22), bx = x + (zone - bw) / 2;
    const col = C.series[i % 6];
    box(s, { x: bx, y: by, w: bw, h: rh, fill: { color: col } });
    s.addText(st.label, { objectName: "funnel/text", x: bx, y: by, w: bw, h: rh, fontFace: F, fontSize: TS.cardBody, bold: true,
      color: textOn(col), align: "center", valign: "middle", margin: 0 });
    const stOpts = { x: x + zone + 0.16, y: by, w: 1.16, h: rh,
      fontFace: F, fontSize: TS.cardBody, bold: true, color: C.ink, align: "right", valign: "middle", margin: 0 };
    // stages[i].claim 에 claim id를 주면 manifest 문자열로 찍는다
    if (st.claim) claimText(s, st.claim, { ...stOpts, suffix: opts.unit || "" });
    else s.addText(fmtNum(st.value) + (opts.unit || ""), { objectName: "funnel/text", ...stOpts });
    const rest = w - zone - 1.68;
    if (i > 0) {
      const conv = st.value / stages[i - 1].value * 100;
      s.addText("전 단계 대비 " + conv.toFixed(0) + "%" + (st.note ? " · " + st.note : ""),
        { objectName: "funnel/text", x: x + zone + 1.60, y: by, w: rest, h: rh, fontFace: F, fontSize: TS.axis, color: C.body, valign: "middle", margin: 0 });
    } else if (st.note) {
      s.addText(st.note, { objectName: "funnel/text", x: x + zone + 1.60, y: by, w: rest, h: rh, fontFace: F, fontSize: TS.axis, color: C.mute, valign: "middle", margin: 0 });
    }
  });
  return y + n * rh + (n - 1) * gap;
}

// ⑭ 평가 격자 — 항목 × 구분 농도 3단계. 신호등 대신 쓴다(초록·빨강을 쓰지 않는다)
// 파워포인트 네이티브 표로 만든다. 칸 배경은 셀 채우기이므로 사용자가 글자와 색을 직접 고칠 수 있다
// rows: [{label, vals:[0~3, ...], texts:[선택]}]   0 빈칸 / 1 옅음 / 2 중간 / 3 진함
function heat(s, x, y, w, cols, rows, opts = {}) {
  const lw = opts.labelW || w * 0.26, cw = (w - lw) / cols.length;
  const hh = opts.hh || 0.42, rh = opts.rh || 0.60;
  const LV = [C.card, C.wash, C.accentLt, C.accent];
  const hd = { fontFace: F, fontSize: TS.gridHead, bold: true, color: C.ink, align: "center", valign: "middle" };
  const trows = [[{ text: "", options: hd }].concat(cols.map(c => ({ text: c, options: hd })))];
  rows.forEach(r => {
    const line = [{ text: r.label, options: { fontFace: F, fontSize: TS.gridCell + 0.5, color: C.ink, align: "center", valign: "middle" } }];
    r.vals.forEach((v, i) => {
      const lv = Math.max(0, Math.min(3, v)), col = LV[lv];
      line.push({ text: (r.texts && r.texts[i]) || "", options: {
        fontFace: F, fontSize: TS.gridCell, bold: lv >= 2,
        color: lv === 0 ? C.mute : textOn(col), align: "center", valign: "middle",
        fill: { color: col }, border: [{ type: "solid", color: C.rule, pt: 0.75 }, { type: "solid", color: C.rule, pt: 0.75 },
                                       { type: "solid", color: C.rule, pt: 0.75 }, { type: "solid", color: C.rule, pt: 0.75 }] } });
    });
    trows.push(line);
  });
  s.addTable(trows, { objectName: "heat/table", x: x, y: y, w: w, colW: [lw].concat(cols.map(() => cw)),
    rowH: [hh].concat(rows.map(() => rh)), border: { type: "none" }, margin: [3, 6, 3, 6], valign: "middle" });
  ruleThin(s, y + hh, x, w);
  ruleThick(s, y + hh + rows.length * rh, x, w);
  return y + hh + rows.length * rh;
}

// ⑮ 간트 — 기간이 겹치는 일정. timeline이 시점만 찍는 것과 다르다
// tasks: [{label, from, to, note}]  from·to는 periods 인덱스(0부터, 양끝 포함)
function gantt(s, x, y, w, periods, tasks, opts = {}) {
  const lw = opts.labelW || w * 0.24, pw = (w - lw) / periods.length;
  const hh = 0.40, rh = opts.rh || 0.58;
  periods.forEach((p, i) => {
    s.addText(p, { objectName: "gantt/text", x: x + lw + i * pw, y, w: pw, h: hh, fontFace: F, fontSize: TS.gridHead, bold: true,
      color: C.ink, align: "center", valign: "middle", margin: 0 });
  });
  ruleThin(s, y + hh, x, w);
  const bodyH = tasks.length * rh;
  for (let i = 1; i < periods.length; i++) {
    s.addShape("line", { objectName: "gantt/shape", x: x + lw + i * pw, y: y + hh, w: 0, h: bodyH + 0.06, line: { color: C.rule, width: 0.75 } });
  }
  tasks.forEach((t, j) => {
    const ry = y + hh + 0.06 + j * rh, on = opts.hi === j;
    s.addText(t.label, { objectName: "gantt/text", x, y: ry, w: lw - 0.10, h: rh, fontFace: F, fontSize: TS.gridCell + 0.5, color: C.ink, valign: "middle", margin: 0 });
    const bx = x + lw + t.from * pw + 0.06, bw = (t.to - t.from + 1) * pw - 0.12;
    box(s, { x: bx, y: ry + 0.09, w: bw, h: rh - 0.24, fill: { color: on ? C.accent : C.series[1] } });
    if (t.note) s.addText(t.note, { objectName: "gantt/text", x: bx, y: ry + 0.09, w: bw, h: rh - 0.24, fontFace: F, fontSize: TS.axis,
      color: textOn(on ? C.accent : C.series[1]), align: "center", valign: "middle", margin: 0 });
  });
  ruleThin(s, y + hh + 0.06 + bodyH, x, w);
  return y + hh + 0.06 + bodyH;
}

module.exports.fmtNum = fmtNum;
module.exports.textOn = textOn;
module.exports.waterfall = waterfall;
module.exports.lineTrend = lineTrend;
module.exports.stackedBar = stackedBar;
module.exports.chevron = chevron;
module.exports.swimlane = swimlane;
module.exports.funnel = funnel;
module.exports.heat = heat;
module.exports.gantt = gantt;

/* ══════════════════════════════════════════════════════════
   네이티브 차트 4종 (v3)
   pptxgenjs의 addChart는 OOXML 차트와 함께 엑셀 워크시트를 파일 안에 넣는다.
   받는 사람이 차트를 더블클릭하면 "데이터 편집"으로 숫자를 직접 고칠 수 있고,
   고치면 막대 길이가 따라 바뀐다. 수치가 들어가는 그림은 전부 이쪽을 쓴다.

   앞의 도형 기반 bars·barsGroup·lineTrend·stackedBar·waterfall은
   숫자가 확정돼 다시 고칠 일이 없고 배치를 정밀하게 잡아야 할 때만 쓴다.
   ══════════════════════════════════════════════════════════ */

// 차트 공통 서식. 테마색·타이포 스케일을 그대로 물린다
function chartBase(opts) {
  return {
    fill: C.page,
    border: { pt: 0, color: C.page },
    chartColors: C.series.slice(),
    showLegend: false,
    legendPos: "t",
    // 차트 안 글씨는 렌더 시 한 단계 작아 보이므로 본문 스케일보다 한 칸 올려 잡는다
    legendFontFace: F, legendFontSize: TS.axis, legendColor: C.body,
    catAxisLabelFontFace: F, catAxisLabelFontSize: TS.gridCell, catAxisLabelColor: C.ink,
    valAxisLabelFontFace: F, valAxisLabelFontSize: TS.axis, valAxisLabelColor: C.mute,
    catAxisLineShow: true, catGridLine: { style: "none" },
    valGridLine: { style: "none" },
    valAxisLineShow: false,
    dataLabelFontFace: F, dataLabelFontSize: TS.axis, dataLabelColor: C.body,
    dataLabelPosition: "outEnd",
    showValue: true,
    barGapWidthPct: 60
  };
}

// ⑯ 세로 막대(네이티브) — bars·barsGroup의 편집 가능 판
// series: [{name, vals:[...]}]
function chartBar(s, x, y, w, h, labels, series, opts = {}) {
  const data = series.map(sr => ({ name: sr.name || "계열", labels: labels, values: sr.vals }));
  s.addChart("bar", data, Object.assign(chartBase(), { objectName: "chartBar/chart",
    x: x, y: y, w: w, h: h,
    barDir: "col",
    showLegend: series.length > 1,
    valAxisHidden: true,
    catAxisLineShow: true
  }, opts));
  return y + h;
}

// ⑰ 꺾은선(네이티브) — lineTrend의 편집 가능 판
function chartLine(s, x, y, w, h, labels, series, opts = {}) {
  const data = series.map(sr => ({ name: sr.name || "계열", labels: labels, values: sr.vals }));
  s.addChart("line", data, Object.assign(chartBase(), { objectName: "chartLine/chart",
    x: x, y: y, w: w, h: h,
    showLegend: series.length > 1,
    lineSize: 2,
    lineDataSymbol: "circle",
    lineDataSymbolSize: 6,
    lineSmooth: false,
    showValue: series.length === 1,
    dataLabelPosition: "t",
    valAxisHidden: series.length === 1,
    valAxisMinVal: opts.vmin,
    valAxisMaxVal: opts.vmax
  }, opts));
  return y + h;
}

// ⑱ 100% 가로 누적(네이티브) — stackedBar의 편집 가능 판
// 원값을 넣으면 구성비로 바꿔 워크시트에 담는다. 편집 화면에는 %가 보인다
// rows: [{label, parts:[{name, value}]}]
function chartStack100(s, x, y, w, h, rows, opts = {}) {
  // 가로 막대는 첫 항목이 아래에 놓인다. 적은 순서대로 위에서 아래로 보이게 뒤집는다
  const src = rows.slice().reverse();
  const names = src[0].parts.map(p => p.name);
  const labels = src.map(r => r.label);
  const data = names.map((nm, si) => ({
    name: nm,
    labels: labels,
    values: src.map(r => {
      const tot = r.parts.reduce((a, p) => a + p.value, 0) || 1;
      return Number((r.parts[si].value / tot * 100).toFixed(1));
    })
  }));
  s.addChart("bar", data, Object.assign(chartBase(), { objectName: "chartStack100/chart",
    x: x, y: y, w: w, h: h,
    barDir: "bar",
    barGrouping: "percentStacked",
    showLegend: true,
    valAxisHidden: true,
    dataLabelPosition: "ctr",
    dataLabelColor: C.card,
    dataLabelFormatCode: '0.0"%"',
    barGapWidthPct: 45
  }, opts));
  return y + h;
}

// ⑲ 워터폴(네이티브) — 보이지 않는 받침 계열 + 증가·감소·기준 계열의 누적 막대
// 워크시트 첫 계열("받침")은 막대를 띄우는 값이므로 편집할 때 함께 맞춰야 한다
// items: [{label, value, type:"base"|"delta"|"total"}]
function chartWaterfall(s, x, y, w, h, items, opts = {}) {
  const isEndT = q => q.type === "base" || q.type === "total";
  let run = 0;
  const seq = items.map(it => {
    if (it.type === "base" || it.type === "total") { run = it.value; return Object.assign({}, it, { lo: 0, hi: it.value }); }
    const a = run; run = run + it.value;
    return Object.assign({}, it, { lo: Math.min(a, run), hi: Math.max(a, run) });
  });
  // 바닥은 실제 막대가 놓이는 최저 수준으로 잡는다. 0으로 두면 기준 막대가 화면을 다 먹는다
  let top = -Infinity, bot = Infinity;
  seq.forEach(q => {
    top = Math.max(top, q.hi);
    bot = Math.min(bot, isEndT(q) ? q.hi : q.lo);
  });
  const rng = (top - bot) || Math.abs(top) || 1;
  const floor = opts.vmin != null ? opts.vmin : Math.max(0, Math.floor((bot - rng * 0.55) / 10) * 10);
  const labels = seq.map(q => q.label);
  const isEnd = isEndT;
  const data = [
    { name: "받침", labels: labels, values: seq.map(q => isEnd(q) ? 0 : q.lo) },
    { name: "기준·합계", labels: labels, values: seq.map(q => isEnd(q) ? q.hi : 0) },
    { name: "증가", labels: labels, values: seq.map(q => !isEnd(q) && q.value >= 0 ? q.hi - q.lo : 0) },
    { name: "감소", labels: labels, values: seq.map(q => !isEnd(q) && q.value < 0 ? q.hi - q.lo : 0) }
  ];
  s.addChart("bar", data, Object.assign(chartBase(), { objectName: "chartWaterfall/chart",
    x: x, y: y, w: w, h: h,
    barDir: "col",
    barGrouping: "stacked",
    chartColors: [C.page, C.ink, C.series[1], C.series[3]],
    showLegend: false,
    showValue: false,                 // 받침 계열 값까지 찍히므로 라벨은 끄고 값축을 켠다
    dataLabelPosition: "ctr",         // 누적 막대에서 outEnd는 파워포인트가 거부한다
    valAxisHidden: false,
    valAxisMinVal: floor,
    valAxisMaxVal: opts.vmax != null ? opts.vmax : Math.ceil((top + rng * 0.12) / 10) * 10,
    barGapWidthPct: 45
  }, opts));
  return y + h;
}

module.exports.chartBase = chartBase;
module.exports.chartBar = chartBar;
module.exports.chartLine = chartLine;
module.exports.chartStack100 = chartStack100;
module.exports.chartWaterfall = chartWaterfall;
