/**
 * exec-onepager-ppt 하우스 스타일 헬퍼 (pptxgenjs)
 *
 * 규칙 값(폰트, 크기, 색, 좌표, 정렬, 각주 기준선)은 이 파일에 두지 않는다.
 * 전부 house-rules.yaml에서 읽는다. 계획서 2.14 — 생성기와 검사기가 같은 값을 본다.
 * 값을 바꿔야 하면 YAML을 고치고 Codex에게 알린다.
 *
 * 사용:
 *   const pptxgen = require("pptxgenjs");
 *   const tpl = require("./template.js");
 *   const pres = tpl.newPres(pptxgen);
 *   const s = pres.addSlide();
 *   tpl.header(s, "제목", "시안 A · 차트형");
 *   tpl.banner(s, "사실 진술", "결론·함의");
 *   tpl.panel(s, tpl.MX, 2.25, 3.33, 3.9, "① 섹션 제목");
 *   tpl.footer(s, ["※ 기준 각주", "* 보조 각주"]);   // y 생략 = 바닥 기준 자동
 */
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const crypto = require("crypto");

const RULES_PATH = process.env.HOUSE_RULES || path.join(__dirname, "house-rules.yaml");
const R = yaml.load(fs.readFileSync(RULES_PATH, "utf8"));

const C = R.palette;
const F = R.fonts.body;
const FH = R.fonts.heading;
const SZ = R.sizes;
const CM = R.components;
const Z = R.zones;

const W = R.layout.width, H = R.layout.height, MX = R.layout.margin_x;
const CW = W - 2 * MX;
const FOOT_BASE = Z.footnote_bottom_y;

const SW = CM.stroke_width;          // 테두리 공통 두께
const RULE = CM.rule_thickness;      // 구분선 두께

function newPres(pptxgen) {
  const pres = new pptxgen();
  pres.defineLayout({ name: R.layout.name, width: W, height: H });
  pres.layout = R.layout.name;
  // manifest의 slide 번호를 손으로 적지 않기 위해 addSlide를 가로챈다 (계획서 2.4).
  // 한 프로세스에서 덱을 여러 개 만들 때 앞 덱의 claim이 섞이지 않도록 여기서 초기화한다.
  resetManifest();
  const addSlide = pres.addSlide.bind(pres);
  pres.addSlide = function (...args) { _slideNo += 1; return addSlide(...args); };
  return pres;
}

// 제목은 heading 폰트 bold. 우측 본부명·날짜 없음, 제목 아래 구분선 없음
function header(s, title, tag) {
  const t = CM.page_title;
  s.addText(title, { x: MX, y: t.y, w: CW, h: t.h, fontFace: FH, fontSize: SZ.page_title_pt, bold: true, color: C[t.color], margin: 0, valign: t.valign });
  if (tag) {
    const [tx, ty] = Z.draft_tag_xy;
    s.addText(tag, { x: tx, y: ty, w: 2.65, h: 0.2, fontFace: F, fontSize: SZ.draft_tag_pt, color: C.grayLt, align: "right", margin: 0 });
  }
}

// 배너(요약박스): heading 폰트 bold, 중앙정렬. 한 줄 max_chars_per_line 이내로 끊는다
// l1=흰색 사실, l2=앰버 결론. runs 배열을 직접 넘기려면 banner2 사용
function banner(s, l1, l2, h = CM.banner.h, y = CM.banner.y) {
  banner2(s, [
    { text: l1, options: { fontSize: SZ.banner_pt, bold: true, color: C.white, breakLine: true } },
    { text: l2, options: { fontSize: SZ.banner_pt, bold: true, color: C.amber } }
  ], h, y);
}
function banner2(s, runs, h = CM.banner.h, y = CM.banner.y) {
  const pad = CM.padding.banner_x;
  s.addShape("rect", { x: MX, y, w: CW, h, fill: { color: C.navy } });
  s.addText(runs, { x: MX + pad, y, w: CW - pad * 2, h, fontFace: FH, align: "center", valign: "middle", margin: 0, lineSpacingMultiple: CM.banner.line_spacing });
}

// 섹션 칩: heading 폰트, bold 없음(네이비 배경에서 뭉갠다). 옆에 gray 보조설명(desc) 옵션
// chipW는 글자수 × 0.20 + 0.35 이상
function sectionChip(s, x, y, label, desc, chipW = CM.chip.w) {
  const ch = CM.chip.h;
  s.addShape("roundRect", { x, y, w: chipW, h: ch, fill: { color: C.navy }, rectRadius: CM.chip.radius });
  s.addText(label, { x, y, w: chipW, h: ch, fontFace: FH, fontSize: SZ.chip_pt, color: C.white, align: "center", valign: "middle", margin: 0 });
  if (desc) s.addText(desc, { x: x + chipW + 0.10, y: y + 0.04, w: 5.2, h: 0.22, fontFace: F, fontSize: SZ.chip_desc_pt, color: C.gray, margin: 0, valign: "middle" });
}

// 줄글 블록 뒤에 까는 옅은 회색 패널. 불릿은 이 안쪽으로 들여쓴다
function panel2(s, x, y, w, h) {
  const p = CM.bullet_panel;
  s.addShape("rect", { x, y, w, h, fill: { color: C[p.fill] }, line: { color: C[p.line], width: SW } });
}

// 페이지 결론용 크림 박스(구버전의 "시사점 행"·다크카드를 대체). 검정 일반 글씨
function creamBox(s, y, h, text) {
  const b = CM.cream_box, pad = CM.padding.cream_x;
  s.addShape("rect", { x: MX, y, w: CW, h, fill: { color: C[b.fill] }, line: { color: C[b.line], width: SW } });
  s.addText(text, { x: MX + pad, y, w: CW - pad * 2, h, fontFace: F, fontSize: SZ.cream_box_pt, color: b.text_color, valign: "middle", margin: 0, lineSpacingMultiple: CM.body_line_spacing });
}

function panel(s, x, y, w, h, title) {
  const pad = CM.padding.panel_title_x;
  s.addShape("rect", { x, y, w, h, fill: { color: C.white }, line: { color: C.grayLt, width: SW } });
  s.addText(title, { x: x + pad, y: y + 0.12, w: w - pad * 2, h: 0.28, fontFace: F, fontSize: SZ.card_title_pt, bold: true, color: C.navy, margin: 0, valign: "middle" });
  s.addShape("rect", { x: x + pad, y: y + 0.46, w: w - pad * 2, h: RULE, fill: { color: C.divLt } });
}

// items: [[{t,b,c},...],...]  강조 런 {b:true,c:C.navy}, 결론 런 {t:"⇒ ...", b:true, c:C.red}
// ⇒ 로 시작하는 결론 줄에는 ▸ 마커를 붙이지 않는다(마커 중복) — forbidden.marker_on_conclusion_line
function bullets(s, items, x, y, w, fs = SZ.body_min_pt, step = CM.bullet_step) {
  items.forEach((runs, i) => {
    const yy = y + i * step;
    const isConcl = runs.length && typeof runs[0].t === "string" && runs[0].t.trim().startsWith(CM.conclusion_prefix);
    if (!isConcl) s.addText(CM.bullet_marker, { x, y: yy, w: 0.18, h: 0.26, fontFace: F, fontSize: fs, bold: true, color: C.navy, margin: 0 });
    s.addText(runs.map(r => ({ text: r.t, options: { fontSize: fs, color: r.c || C.body, bold: !!r.b } })),
      { x: x + 0.2, y: yy, w: w - 0.2, h: step + 0.08, fontFace: F, margin: 0, valign: "top", lineSpacingMultiple: CM.bullet_line_spacing });
  });
}

// 각주는 바닥 기준. y를 생략하면 줄 수에 맞춰 footnote_bottom_y에서 역산해 붙인다
function footer(s, notes, y, opts = {}) {
  if (y == null) y = FOOT_BASE - Z.footnote_line_step * notes.length;
  if (opts.line) s.addShape("rect", { x: MX, y: y - 0.05, w: CW, h: CM.divider_thickness, fill: { color: C.navy } });
  s.addText(notes.map((t, i) => ({ text: t, options: { breakLine: i < notes.length - 1 } })),
    { x: MX, y, w: CW, h: H - y - 0.1, fontFace: F, fontSize: SZ.footnote_pt, color: C.gray, margin: 0, valign: "top", lineSpacingMultiple: CM.footnote_line_spacing });
}

// 사용 자제(크림 박스로 대체). 제목 앰버 bold + 본문 흰색 bold는 호출부 runs에서 지정
function darkCard(s, x, y, w, h, runs) {
  const pad = CM.padding.dark_card_x;
  s.addShape("rect", { x, y, w, h, fill: { color: C.navy } });
  s.addText(runs, { x: x + pad, y, w: w - pad * 2, h, fontFace: F, valign: "middle", margin: 0, lineSpacingMultiple: CM.body_line_spacing });
}

function statCard(s, x, y, w, h, num, lbl, opts = {}) {
  const dark = opts.dark;
  s.addShape("rect", { x, y, w, h, fill: { color: dark ? C.navy : C.white }, line: { color: dark ? C.navy : C.grayLt, width: SW } });
  s.addText(num, { x: x + 0.07, y: y + 0.07, w: w - 0.14, h: h * 0.45, fontFace: F, fontSize: opts.numSize || SZ.stat_card_number_pt, bold: true, color: dark ? C.amber : (opts.numColor || C.navy), margin: 0, valign: "middle", align: "center" });
  s.addText(lbl, { x: x + 0.07, y: y + h * 0.5, w: w - 0.14, h: h * 0.46, fontFace: F, fontSize: opts.lblSize || SZ.stat_card_label_pt, bold: true, color: dark ? C.steel : C.gray, margin: 0, valign: "top", align: "center", lineSpacingMultiple: CM.stat_label_line_spacing });
}

// 지름 고정 원형 배지 + 내부 글리프. 같은 행의 배지는 y를 맞춘다. 크기·모양 혼용 금지
function iconBadge(s, x, y, glyph, opts = {}) {
  const b = CM.icon_badge, d = b.diameter;
  const dark = opts.fill !== "tint";
  s.addShape("ellipse", { x, y, w: d, h: d, fill: { color: dark ? C.navy : C.tint } });
  s.addText(glyph, { x, y, w: d, h: d, fontFace: F, fontSize: SZ.bullet_marker_pt, bold: true, color: dark ? C.white : C.navy, align: "center", valign: "middle", margin: 0 });
}

// 세로 막대 5개 내외 + 평균 점선. vals 순서대로, i===0(당사)은 navy+tint 밴드
function colChart(s, px, pw, base, maxH, vmax, labels, vals, opts = {}) {
  const x0 = px + 0.24, slot = (pw - 0.48) / vals.length, bw = Math.min(0.42, slot - 0.14);
  vals.forEach((v, i) => {
    const cx = x0 + i * slot + (slot - bw) / 2;
    if (i === 0 && opts.highlightFirst !== false)
      s.addShape("rect", { x: cx - 0.08, y: base - maxH - 0.28, w: bw + 0.16, h: maxH + 0.6, fill: { color: C[R.charts.own_series_band] } });
    const h = v / vmax * maxH;
    s.addShape("rect", { x: cx, y: base - h, w: bw, h, fill: { color: i === 0 ? C.navy : (opts.barColor || C.grayLt) } });
    s.addText(v.toFixed(opts.dec == null ? 1 : opts.dec), { x: cx - 0.12, y: base - h - 0.2, w: bw + 0.24, h: 0.18, fontFace: F, fontSize: SZ.chart_value_label_pt, bold: i === 0, color: i === 0 ? C.navy : C.body, align: "center", margin: 0 });
    s.addText(labels[i], { x: x0 + i * slot - 0.05, y: base + 0.04, w: slot + 0.1, h: 0.2, fontFace: F, fontSize: SZ.chart_value_label_pt, bold: i === 0, color: i === 0 ? C.navy : C.body, align: "center", margin: 0 });
  });
  s.addShape("rect", { x: px + 0.15, y: base, w: pw - 0.3, h: RULE, fill: { color: C.grayLt } });
  if (opts.avg != null) {
    const a = R.charts.avg_line;
    const ay = base - opts.avg / vmax * maxH;
    s.addShape("line", { x: px + 0.2, y: ay, w: pw - 0.4, h: 0, line: { color: C[a.color], width: a.width_pt, dashType: a.dash } });
    s.addText(opts.avgLbl || "", { x: px + pw - 1.35, y: ay - 0.19, w: 1.2, h: 0.16, fontFace: F, fontSize: a.label_pt, bold: a.label_bold, color: C[a.color], align: "right", margin: 0 });
  }
}

// 100% 세로 스택. segs: 각 항목 [v1, v2, ...] (합 100), segColors/segLblColors 병렬
function stacked100(s, px, base, maxH, labels, segs, segColors, segLblColors, slot = R.charts.stack100.slot_default, bw = R.charts.stack100.bar_w_default, x0off = 0.24) {
  const x0 = px + x0off;
  segs.forEach((vals, i) => {
    const cx = x0 + i * slot + (slot - bw) / 2;
    if (i === 0) s.addShape("rect", { x: cx - 0.07, y: base - maxH - 0.09, w: bw + 0.14, h: maxH + 0.42, fill: { color: C[R.charts.own_series_band] } });
    const tops = [];
    let cum = 0;
    vals.forEach(v => { cum += v; tops.push(cum); });
    vals.forEach((v, j) => {
      const yTop = base - tops[j] / 100 * maxH, hh = v / 100 * maxH;
      s.addShape("rect", { x: cx, y: yTop, w: bw, h: hh, fill: { color: segColors[j] } });
      s.addText(Math.round(v) + "%", { x: cx - 0.09, y: yTop, w: bw + 0.18, h: hh, fontFace: F, fontSize: SZ.chart_value_label_pt, bold: i === 0, color: segLblColors[j], align: "center", valign: "middle", margin: 0 });
    });
    s.addText(labels[i], { x: x0 + i * slot - 0.06, y: base + 0.04, w: slot + 0.12, h: 0.2, fontFace: F, fontSize: SZ.chart_value_label_pt, bold: i === 0, color: i === 0 ? C.navy : C.body, align: "center", margin: 0 });
  });
}

// 워터폴: 실제(navy) → 델타(앰버, 공중) → 가상(grayLt), 점선 연결 + 0/25/50 눈금
function waterfall(s, px, pw, base, hScale, vmax, v0, v1, catLabels, lblDelta) {
  const wf = R.charts.waterfall;
  [[base - hScale, vmax / 1 + "%"], [base - hScale / 2, vmax / 2 + "%"], [base, "0%"]].forEach(([gy, lbl]) => {
    s.addShape("rect", { x: px + 0.55, y: gy, w: pw - 0.75, h: RULE, fill: { color: gy === base ? C.grayLt : C[wf.tick_color] } });
    s.addText(lbl, { x: px + 0.1, y: gy - 0.09, w: 0.4, h: 0.18, fontFace: F, fontSize: SZ.chart_axis_label_pt, color: C.gray, align: "right", valign: "middle", margin: 0 });
  });
  const bw = 0.5, slot = 0.82, x0 = px + 0.62 + (slot - bw) / 2;
  const cx = [x0, x0 + slot, x0 + 2 * slot];
  const h0 = v0 / vmax * hScale, h1 = v1 / vmax * hScale;
  s.addShape("rect", { x: cx[0], y: base - h0, w: bw, h: h0, fill: { color: C[wf.actual] } });
  s.addShape("rect", { x: cx[1], y: base - h1, w: bw, h: h1 - h0, fill: { color: C[wf.delta] } });
  s.addShape("rect", { x: cx[2], y: base - h1, w: bw, h: h1, fill: { color: C[wf.hypothetical] } });
  s.addShape("line", { x: cx[0] + bw, y: base - h0, w: slot - bw, h: 0, line: { color: C.gray, width: SW, dashType: "dash" } });
  s.addShape("line", { x: cx[1] + bw, y: base - h1, w: slot - bw, h: 0, line: { color: C.gray, width: SW, dashType: "dash" } });
  [[v0.toFixed(1) + "%", cx[0], C.navy], [lblDelta, cx[1], C.blue], [v1.toFixed(1) + "%", cx[2], C.title]].forEach(([t, x, col], i) => {
    const top = i === 0 ? base - h0 : base - h1;
    s.addText(t, { x: x - 0.15, y: top - 0.22, w: bw + 0.3, h: 0.2, fontFace: F, fontSize: SZ.waterfall_value_pt, bold: true, color: col, align: "center", margin: 0 });
  });
  catLabels.forEach((t, i) => {
    s.addText(t, { x: cx[i] - 0.16, y: base + 0.04, w: bw + 0.32, h: 0.2, fontFace: F, fontSize: SZ.chart_value_label_pt, color: C.body, align: "center", margin: 0 });
  });
}

// 표 셀 스타일 프리셋 (colW 합계 == w 를 호출부에서 반드시 보장)
// 정렬 기본값은 전부 center. 좌측정렬(tdL)은 셀 안에서 줄바꿈되는 긴 서술문 열에만 쓰고,
// 그 열도 헤더는 hd(center)를 쓴다. rowH는 table.row_height_min / row_height_2line_min 이상.
const T = R.table;
const tableStyles = {
  hd:  { fontFace: F, fontSize: SZ.table_header_pt, bold: true, color: C.white, fill: { color: C.navy }, align: T.header_align, valign: "middle" },
  td:  { fontFace: F, fontSize: SZ.table_body_pt, color: C.body, align: T.default_align, valign: "middle" },
  tdR: { fontFace: F, fontSize: SZ.table_body_pt, color: C.body, align: "right", valign: "middle" },
  tdL: { fontFace: F, fontSize: SZ.table_body_pt, color: C.body, align: T.long_text_col_align, valign: "middle" },
  tdG: { fontFace: F, fontSize: SZ.table_body_pt, color: C.gray, align: T.default_align, valign: "middle" },
  tl:  { fontFace: F, fontSize: SZ.table_body_pt, bold: true, color: C.body, align: T.default_align, valign: "middle" },
  usCell: { bold: true, color: C.navy, fill: { color: C[T.own_column_fill] } } // 당사 열
};

// ── claim / manifest (계획서 2.4, 2.5, 2.8, 6.2) ──────────────────────
// 값을 찍는 지점에서 manifest를 부산물로 방출한다. 손으로 쓰면 실제 장표와 어긋난다.
// manifest에 적는 것은 값이 아니라 근거 좌표(파일·시트·셀)다.
// claim()이 돌려준 문자열을 그대로 장표에 그려야 3자 대조가 성립한다.
//   SOURCE(source.xlsx) ↔ MANIFEST(manifest.json) ↔ FINAL(pptx)

if (!R.manifest) throw new Error("house-rules.yaml에 manifest 절이 없다");
const MF = R.manifest;
const N = R.notation;

let _claims = [];
let _slideNo = 0;
let _srcRoot = process.env.DECK_SOURCE_ROOT || __dirname;
const _hashCache = new Map();

function resetManifest() { _claims = []; _slideNo = 0; _hashCache.clear(); }
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
 *       override: { value, reason }   원천과 다른 값을 의도적으로 찍을 때 (계획서 2.8)
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
    // override는 불일치가 나도 FAIL이 아니라 CHANGELOG에 사유와 함께 기록된다
    if (opts.override.value == null || !opts.override.reason)
      throw new Error(`claim[${id}]: override에는 value와 reason이 둘 다 필요하다 (계획서 2.8)`);
    text = String(opts.override.value);
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
    display: { text, unit: opts.unit || null, rounding },
    source: {
      file: opts.src || null,
      file_hash: opts.src ? _hash(opts.src) : null,
      sheet: opts.sheet || null,
      ref: opts.ref || null,
    },
    transform: tf,
  };
  if (opts.override) entry.override = { value: String(opts.override.value), reason: opts.override.reason };

  _claims.push(entry);
  return text;
}

// 타임스탬프를 넣지 않는다. 같은 입력이면 같은 파일이어야 픽스처 회귀 비교가 된다.
// 실행 정보는 run_metadata.json이 따로 담는다 (계획서 6.4)
function writeManifest(file) {
  const claims = manifest();
  const out = { house_rule_version: R.version, claims };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n", "utf8");
  return { file, count: claims.length, unhashed: claims.filter(c => c.source.file && !c.source.file_hash).length };
}

module.exports = {
  R, F, FH, C, W, H, MX, CW, FOOT_BASE,
  newPres, header, banner, banner2, sectionChip, panel, panel2, creamBox,
  bullets, footer, darkCard, statCard, iconBadge, colChart, stacked100, waterfall, tableStyles,
  claim, manifest, writeManifest, resetManifest, sourceRoot, currentSlide
};
