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

if (!R.manifest) throw new Error("house-rules.yaml에 manifest 절이 없다");
const MF = R.manifest;
const NM = MF.shape_name;
if (!NM) throw new Error("house-rules.yaml manifest.shape_name이 없다 (계획서 2.16-1)");
const U = R.units;
if (!U) throw new Error("house-rules.yaml에 units 절이 없다 (계획서 2.16-4)");

// template.js 자신의 버전. 헬퍼의 좌표나 이름 규약이 바뀌면 올린다.
// manifest에 함께 새겨 두어야 "이 픽스처가 어느 생성기로 만들어졌는지"가 남는다 (계획서 2.16-6).
const TEMPLATE_VERSION = "2026.08.29";

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
  _text(s, title, nameOf("header", "title"), { x: MX, y: t.y, w: CW, h: t.h, fontFace: FH, fontSize: SZ.page_title_pt, bold: true, color: C[t.color], margin: 0, valign: t.valign });
  if (tag) {
    const [tx, ty] = Z.draft_tag_xy;
    _text(s, tag, nameOf("header", "draft_tag"), { x: tx, y: ty, w: 2.65, h: 0.2, fontFace: F, fontSize: SZ.draft_tag_pt, color: C.grayLt, align: "right", margin: 0 });
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
  _shape(s, "rect", nameOf("banner", "bg"), { x: MX, y, w: CW, h, fill: { color: C.navy } });
  _text(s, runs, nameOf("banner", "text"), { x: MX + pad, y, w: CW - pad * 2, h, fontFace: FH, align: "center", valign: "middle", margin: 0, lineSpacingMultiple: CM.banner.line_spacing });
}

// 섹션 칩: heading 폰트, bold 없음(네이비 배경에서 뭉갠다). 옆에 gray 보조설명(desc) 옵션
// chipW는 글자수 × 0.20 + 0.35 이상
function sectionChip(s, x, y, label, desc, chipW = CM.chip.w) {
  const ch = CM.chip.h;
  _shape(s, "roundRect", nameOf("chip", "bg"), { x, y, w: chipW, h: ch, fill: { color: C.navy }, rectRadius: CM.chip.radius });
  _text(s, label, nameOf("chip", "label"), { x, y, w: chipW, h: ch, fontFace: FH, fontSize: SZ.chip_pt, color: C.white, align: "center", valign: "middle", margin: 0 });
  if (desc) {
    const dx = x + chipW + CM.chip.desc_gap;
    // desc_w는 상한이다. 우측 칼럼 칩에서 고정폭을 그대로 쓰면 판형을 넘는다
    const dw = Math.min(CM.chip.desc_w, W - MX - dx);
    if (dw <= 0) throw new Error(`sectionChip: 보조설명 자리가 없다 (x=${dx.toFixed(2)}, 우측 한계=${(W - MX).toFixed(2)})`);
    _text(s, desc, nameOf("chip", "desc"), { x: dx, y: y + 0.04, w: dw, h: 0.22, fontFace: F, fontSize: SZ.chip_desc_pt, color: C.gray, margin: 0, valign: "middle" });
  }
}

// 줄글 블록 뒤에 까는 옅은 회색 패널. 불릿은 이 안쪽으로 들여쓴다
function panel2(s, x, y, w, h) {
  const p = CM.bullet_panel;
  _shape(s, "rect", nameOf("bullet_panel", "bg"), { x, y, w, h, fill: { color: C[p.fill] }, line: { color: C[p.line], width: SW } });
}

// 페이지 결론용 크림 박스(구버전의 "시사점 행"·다크카드를 대체). 검정 일반 글씨
function creamBox(s, y, h, text) {
  const b = CM.cream_box, pad = CM.padding.cream_x;
  _shape(s, "rect", nameOf("cream_box", "bg"), { x: MX, y, w: CW, h, fill: { color: C[b.fill] }, line: { color: C[b.line], width: SW } });
  _text(s, text, nameOf("cream_box", "text"), { x: MX + pad, y, w: CW - pad * 2, h, fontFace: F, fontSize: SZ.cream_box_pt, color: b.text_color, valign: "middle", margin: 0, lineSpacingMultiple: CM.body_line_spacing });
}

function panel(s, x, y, w, h, title) {
  const pad = CM.padding.panel_title_x;
  _shape(s, "rect", nameOf("panel", "bg"), { x, y, w, h, fill: { color: C.white }, line: { color: C.grayLt, width: SW } });
  _text(s, title, nameOf("panel", "title"), { x: x + pad, y: y + 0.12, w: w - pad * 2, h: 0.28, fontFace: F, fontSize: SZ.card_title_pt, bold: true, color: C.navy, margin: 0, valign: "middle" });
  _shape(s, "rect", nameOf("panel", "rule"), { x: x + pad, y: y + 0.46, w: w - pad * 2, h: RULE, fill: { color: C.divLt } });
}

// items: [[{t,b,c},...],...]  강조 런 {b:true,c:C.navy}, 결론 런 {t:"⇒ ...", b:true, c:C.red}
// ⇒ 로 시작하는 결론 줄에는 ▸ 마커를 붙이지 않는다(마커 중복) — forbidden.marker_on_conclusion_line
function bullets(s, items, x, y, w, fs = SZ.body_min_pt, step = CM.bullet_step) {
  items.forEach((runs, i) => {
    const yy = y + i * step;
    const isConcl = runs.length && typeof runs[0].t === "string" && runs[0].t.trim().startsWith(CM.conclusion_prefix);
    if (!isConcl) _text(s, CM.bullet_marker, nameOf("bullets", "marker"), { x, y: yy, w: 0.18, h: 0.26, fontFace: F, fontSize: fs, bold: true, color: C.navy, margin: 0 });
    _text(s, runs.map(r => ({ text: r.t, options: { fontSize: fs, color: r.c || C.body, bold: !!r.b } })),
      nameOf("bullets", "line"), { x: x + 0.2, y: yy, w: w - 0.2, h: step + 0.08, fontFace: F, margin: 0, valign: "top", lineSpacingMultiple: CM.bullet_line_spacing });
  });
}

// 각주는 바닥 기준. y를 생략하면 줄 수에 맞춰 footnote_bottom_y에서 역산해 붙인다
function footer(s, notes, y, opts = {}) {
  if (y == null) y = FOOT_BASE - Z.footnote_line_step * notes.length;
  if (opts.line) _shape(s, "rect", nameOf("footer", "rule"), { x: MX, y: y - 0.05, w: CW, h: CM.divider_thickness, fill: { color: C.navy } });
  _text(s, notes.map((t, i) => ({ text: t, options: { breakLine: i < notes.length - 1 } })),
    nameOf("footer", "notes"), { x: MX, y, w: CW, h: H - y - 0.1, fontFace: F, fontSize: SZ.footnote_pt, color: C.gray, margin: 0, valign: "top", lineSpacingMultiple: CM.footnote_line_spacing });
}

// 사용 자제(크림 박스로 대체). 제목 앰버 bold + 본문 흰색 bold는 호출부 runs에서 지정
function darkCard(s, x, y, w, h, runs) {
  const pad = CM.padding.dark_card_x;
  _shape(s, "rect", nameOf("dark_card", "bg"), { x, y, w, h, fill: { color: C.navy } });
  _text(s, runs, nameOf("dark_card", "text"), { x: x + pad, y, w: w - pad * 2, h, fontFace: F, valign: "middle", margin: 0, lineSpacingMultiple: CM.body_line_spacing });
}

// opts.numClaim에 claim id를 주면 큰 수치를 manifest 문자열로 그리고 좌표를 기록한다
function statCard(s, x, y, w, h, num, lbl, opts = {}) {
  const dark = opts.dark;
  _shape(s, "rect", nameOf("stat_card", "bg"), { x, y, w, h, fill: { color: dark ? C.navy : C.white }, line: { color: dark ? C.navy : C.grayLt, width: SW } });
  const numOpts = { x: x + 0.07, y: y + 0.07, w: w - 0.14, h: h * 0.45, fontFace: F, fontSize: opts.numSize || SZ.stat_card_number_pt, bold: true, color: dark ? C.amber : (opts.numColor || C.navy), margin: 0, valign: "middle", align: "center" };
  if (opts.numClaim) claimText(s, opts.numClaim, numOpts);
  else _text(s, num, nameOf("stat_card", "number"), numOpts);
  _text(s, lbl, nameOf("stat_card", "label"), { x: x + 0.07, y: y + h * 0.5, w: w - 0.14, h: h * 0.46, fontFace: F, fontSize: opts.lblSize || SZ.stat_card_label_pt, bold: true, color: dark ? C.steel : C.gray, margin: 0, valign: "top", align: "center", lineSpacingMultiple: CM.stat_label_line_spacing });
}

// 지름 고정 원형 배지 + 내부 글리프. 같은 행의 배지는 y를 맞춘다. 크기·모양 혼용 금지
function iconBadge(s, x, y, glyph, opts = {}) {
  const b = CM.icon_badge, d = b.diameter;
  const dark = opts.fill !== "tint";
  _shape(s, "ellipse", nameOf("icon_badge", "bg"), { x, y, w: d, h: d, fill: { color: dark ? C.navy : C.tint } });
  _text(s, glyph, nameOf("icon_badge", "glyph"), { x, y, w: d, h: d, fontFace: F, fontSize: SZ.bullet_marker_pt, bold: true, color: dark ? C.white : C.navy, align: "center", valign: "middle", margin: 0 });
}

// 세로 막대 5개 내외 + 평균 점선. vals 순서대로, i===0(당사)은 navy+tint 밴드
// opts.valClaims: vals와 같은 길이의 claim id 배열. 주면 막대 위 수치를 manifest 문자열로 그린다
// opts.avgClaim: 평균선 라벨의 claim id. 라벨은 opts.avgLbl(접두)와 합쳐 그린다
function colChart(s, px, pw, base, maxH, vmax, labels, vals, opts = {}) {
  const x0 = px + 0.24, slot = (pw - 0.48) / vals.length, bw = Math.min(0.42, slot - 0.14);
  vals.forEach((v, i) => {
    const cx = x0 + i * slot + (slot - bw) / 2;
    if (i === 0 && opts.highlightFirst !== false)
      _shape(s, "rect", nameOf("col_chart", "band"), { x: cx - 0.08, y: base - maxH - 0.28, w: bw + 0.16, h: maxH + 0.6, fill: { color: C[R.charts.own_series_band] } });
    const h = v / vmax * maxH;
    _shape(s, "rect", nameOf("col_chart", "bar"), { x: cx, y: base - h, w: bw, h, fill: { color: i === 0 ? C.navy : (opts.barColor || C.grayLt) } });
    const vOpts = { x: cx - 0.12, y: base - h - 0.2, w: bw + 0.24, h: 0.18, fontFace: F, fontSize: SZ.chart_value_label_pt, bold: i === 0, color: i === 0 ? C.navy : C.body, align: "center", margin: 0 };
    const vClaim = opts.valClaims && opts.valClaims[i];
    if (vClaim) claimText(s, vClaim, vOpts);
    else _text(s, v.toFixed(opts.dec == null ? 1 : opts.dec), nameOf("col_chart", "value"), vOpts);
    _text(s, labels[i], nameOf("col_chart", "cat"), { x: x0 + i * slot - 0.05, y: base + 0.04, w: slot + 0.1, h: 0.2, fontFace: F, fontSize: SZ.chart_value_label_pt, bold: i === 0, color: i === 0 ? C.navy : C.body, align: "center", margin: 0 });
  });
  _shape(s, "rect", nameOf("col_chart", "axis"), { x: px + 0.15, y: base, w: pw - 0.3, h: RULE, fill: { color: C.grayLt } });
  if (opts.avg != null) {
    const a = R.charts.avg_line;
    const ay = base - opts.avg / vmax * maxH;
    _shape(s, "line", nameOf("col_chart", "avg_line"), { x: px + 0.2, y: ay, w: pw - 0.4, h: 0, line: { color: C[a.color], width: a.width_pt, dashType: a.dash } });
    const aOpts = { x: px + pw - 1.35, y: ay - 0.19, w: 1.2, h: 0.16, fontFace: F, fontSize: a.label_pt, bold: a.label_bold, color: C[a.color], align: "right", margin: 0 };
    if (opts.avgClaim) claimText(s, opts.avgClaim, Object.assign({ prefix: opts.avgLbl || "" }, aOpts));
    else _text(s, opts.avgLbl || "", nameOf("col_chart", "avg_label"), aOpts);
  }
}

// 100% 세로 스택. segs: 각 항목 [v1, v2, ...] (합 100), segColors/segLblColors 병렬
function stacked100(s, px, base, maxH, labels, segs, segColors, segLblColors, slot = R.charts.stack100.slot_default, bw = R.charts.stack100.bar_w_default, x0off = 0.24) {
  const x0 = px + x0off;
  segs.forEach((vals, i) => {
    const cx = x0 + i * slot + (slot - bw) / 2;
    if (i === 0) _shape(s, "rect", nameOf("stack100", "band"), { x: cx - 0.07, y: base - maxH - 0.09, w: bw + 0.14, h: maxH + 0.42, fill: { color: C[R.charts.own_series_band] } });
    const tops = [];
    let cum = 0;
    vals.forEach(v => { cum += v; tops.push(cum); });
    vals.forEach((v, j) => {
      const yTop = base - tops[j] / 100 * maxH, hh = v / 100 * maxH;
      _shape(s, "rect", nameOf("stack100", "seg"), { x: cx, y: yTop, w: bw, h: hh, fill: { color: segColors[j] } });
      _text(s, Math.round(v) + "%", nameOf("stack100", "seg_label"), { x: cx - 0.09, y: yTop, w: bw + 0.18, h: hh, fontFace: F, fontSize: SZ.chart_value_label_pt, bold: i === 0, color: segLblColors[j], align: "center", valign: "middle", margin: 0 });
    });
    _text(s, labels[i], nameOf("stack100", "cat"), { x: x0 + i * slot - 0.06, y: base + 0.04, w: slot + 0.12, h: 0.2, fontFace: F, fontSize: SZ.chart_value_label_pt, bold: i === 0, color: i === 0 ? C.navy : C.body, align: "center", margin: 0 });
  });
}

// 워터폴: 실제(navy) → 델타(앰버, 공중) → 가상(grayLt), 점선 연결 + 0/25/50 눈금
function waterfall(s, px, pw, base, hScale, vmax, v0, v1, catLabels, lblDelta) {
  const wf = R.charts.waterfall;
  [[base - hScale, vmax / 1 + "%"], [base - hScale / 2, vmax / 2 + "%"], [base, "0%"]].forEach(([gy, lbl]) => {
    _shape(s, "rect", nameOf("waterfall", "tick"), { x: px + 0.55, y: gy, w: pw - 0.75, h: RULE, fill: { color: gy === base ? C.grayLt : C[wf.tick_color] } });
    _text(s, lbl, nameOf("waterfall", "tick_label"), { x: px + 0.1, y: gy - 0.09, w: 0.4, h: 0.18, fontFace: F, fontSize: SZ.chart_axis_label_pt, color: C.gray, align: "right", valign: "middle", margin: 0 });
  });
  const bw = 0.5, slot = 0.82, x0 = px + 0.62 + (slot - bw) / 2;
  const cx = [x0, x0 + slot, x0 + 2 * slot];
  const h0 = v0 / vmax * hScale, h1 = v1 / vmax * hScale;
  _shape(s, "rect", nameOf("waterfall", "actual"), { x: cx[0], y: base - h0, w: bw, h: h0, fill: { color: C[wf.actual] } });
  _shape(s, "rect", nameOf("waterfall", "delta"), { x: cx[1], y: base - h1, w: bw, h: h1 - h0, fill: { color: C[wf.delta] } });
  _shape(s, "rect", nameOf("waterfall", "hypothetical"), { x: cx[2], y: base - h1, w: bw, h: h1, fill: { color: C[wf.hypothetical] } });
  _shape(s, "line", nameOf("waterfall", "connector"), { x: cx[0] + bw, y: base - h0, w: slot - bw, h: 0, line: { color: C.gray, width: SW, dashType: "dash" } });
  _shape(s, "line", nameOf("waterfall", "connector"), { x: cx[1] + bw, y: base - h1, w: slot - bw, h: 0, line: { color: C.gray, width: SW, dashType: "dash" } });
  [[v0.toFixed(1) + "%", cx[0], C.navy], [lblDelta, cx[1], C.blue], [v1.toFixed(1) + "%", cx[2], C.title]].forEach(([t, x, col], i) => {
    const top = i === 0 ? base - h0 : base - h1;
    _text(s, t, nameOf("waterfall", "value"), { x: x - 0.15, y: top - 0.22, w: bw + 0.3, h: 0.2, fontFace: F, fontSize: SZ.waterfall_value_pt, bold: true, color: col, align: "center", margin: 0 });
  });
  catLabels.forEach((t, i) => {
    _text(s, t, nameOf("waterfall", "cat"), { x: cx[i] - 0.16, y: base + 0.04, w: bw + 0.32, h: 0.2, fontFace: F, fontSize: SZ.chart_value_label_pt, color: C.body, align: "center", margin: 0 });
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

const N = R.notation;

let _claims = [];
let _slideNo = 0;
let _srcRoot = process.env.DECK_SOURCE_ROOT || __dirname;
const _hashCache = new Map();

function resetManifest() { _claims = []; _slideNo = 0; _hashCache.clear(); _nameSeq.clear(); }
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
    // 이 값이 실제로 어느 도형/셀에 찍혔는지. claimText()·table()이 채운다 (계획서 2.16-3).
    // 비어 있으면 audit.py가 대조할 대상이 없다는 뜻이므로 writeManifest가 센다.
    placements: [],
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
    font: { face: to.fontFace || F, size: to.fontSize != null ? to.fontSize : null, bold: !!to.bold },
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

// 타임스탬프를 넣지 않는다. 같은 입력이면 같은 파일이어야 픽스처 회귀 비교가 된다.
// 실행 정보는 run_metadata.json이 따로 담는다 (계획서 6.4)
function writeManifest(file) {
  const claims = manifest();
  // 규칙이 바뀔 때 "이 덱이 무엇을 기준으로 만들어졌는지"를 보존한다 (계획서 2.16-6)
  const out = {
    schema_version: MF.schema_version,
    house_rule_version: R.version,
    template_version: TEMPLATE_VERSION,
    claims,
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n", "utf8");
  return {
    file, count: claims.length,
    unhashed: claims.filter(c => c.source.file && !c.source.file_hash).length,
    // 좌표가 없는 claim은 audit.py가 XML에서 찾을 수 없다. 게이트가 잡는다 (계획서 2.16-7)
    unplaced: claims.filter(c => !c.placements.length).map(c => c.shape_id),
  };
}

module.exports = {
  R, F, FH, C, W, H, MX, CW, FOOT_BASE,
  newPres, header, banner, banner2, sectionChip, panel, panel2, creamBox,
  bullets, footer, darkCard, statCard, iconBadge, colChart, stacked100, waterfall, tableStyles,
  claim, claimText, table, cell, text, shape, manifest, writeManifest, resetManifest, sourceRoot, currentSlide,
  TEMPLATE_VERSION, nameOf, claimName, U
};
