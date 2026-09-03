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

// 이 생성기가 어느 스킬의 문법인지. 규칙은 그 스타일 절에서만 읽는다 (계획서 2.17).
// 최상위 절은 옛 코드를 위한 다리이고, 읽는 쪽이 다 옮기면 지운다.
const STYLE = "corporate-strategy-ppt";
const SR = R.styles && R.styles[STYLE];
if (!SR) throw new Error(`house-rules.yaml에 styles.${STYLE}가 없다 (계획서 2.17)`);

const C = SR.palette;
const F = SR.fonts.body;
const FH = SR.fonts.heading;
const SZ = SR.sizes;
const CM = SR.components;
const Z = SR.zones;

const W = SR.layout.width, H = SR.layout.height, MX = SR.layout.margin_x;
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
const NT = R.numeric_tokens;
if (!NT) throw new Error("house-rules.yaml에 numeric_tokens 절이 없다 (계획서 10절)");

// template.js 자신의 버전. 헬퍼의 좌표나 이름 규약이 바뀌면 올린다.
// manifest에 함께 새겨 두어야 "이 픽스처가 어느 생성기로 만들어졌는지"가 남는다 (계획서 2.16-6).
const TEMPLATE_VERSION = "2026.08.29";

// ── 계약은 deckkit.js에 있다 (계획서 2.16, 2.17) ──────────────────────
// 도형 이름·claim·manifest는 스타일이 달라도 같아야 한다. 그래서 여기 두지 않는다.
// 이 파일에는 corporate-strategy-ppt의 헬퍼와 수치만 남는다.
const kit = require("./deckkit.js").init(R);
const { nameOf, claimName, claim, claimText, table, cell, whitelistToken,
        manifest, resetManifest, sourceRoot, currentSlide } = kit;

// 검사기는 manifest의 style로 styles[STYLE]을 읽는다 (2.17)
const writeManifest = (file) => kit.writeManifest(file, { style: STYLE, templateVersion: TEMPLATE_VERSION });

// 헬퍼가 도형을 그릴 때 쓰는 통로. 이름 없는 도형을 만들 수 없게 막는다
const _shape = (s, type, base, opts) => kit.shape(s, type, base, opts);
const _text  = (s, content, base, opts) => kit.text(s, base, content, opts);
function shape(s, type, name, opts) { return kit.shape(s, type, name, opts); }
function text(s, name, content, opts) { return kit.text(s, name, content, opts); }

function newPres(pptxgen) {
  const pres = kit.newPres(pptxgen, R);
  pres.defineLayout({ name: SR.layout.name, width: W, height: H });
  pres.layout = SR.layout.name;
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
    // 마커 크기는 본문 크기(fs)를 따라가지 않고 규칙 값으로 고정한다.
    // 호출부가 fs를 낮춰도 마커는 10pt다 — 검사기가 결정적으로 볼 수 있어야 한다
    if (!isConcl) _text(s, CM.bullet_marker, nameOf("bullets", "marker"), { x, y: yy, w: 0.18, h: 0.26, fontFace: F, fontSize: SZ.bullet_marker_pt, bold: true, color: C.navy, margin: 0 });
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
  _text(s, glyph, nameOf("icon_badge", "glyph"), { x, y, w: d, h: d, fontFace: F, fontSize: SZ.icon_badge_glyph_pt, bold: true, color: dark ? C.white : C.navy, align: "center", valign: "middle", margin: 0 });
}

// 세로 막대 5개 내외 + 평균 점선. vals 순서대로, i===0(당사)은 navy+tint 밴드
// opts.valClaims: vals와 같은 길이의 claim id 배열. 주면 막대 위 수치를 manifest 문자열로 그린다
// opts.avgClaim: 평균선 라벨의 claim id. 라벨은 opts.avgLbl(접두)와 합쳐 그린다
function colChart(s, px, pw, base, maxH, vmax, labels, vals, opts = {}) {
  const x0 = px + 0.24, slot = (pw - 0.48) / vals.length, bw = Math.min(0.42, slot - 0.14);
  vals.forEach((v, i) => {
    const cx = x0 + i * slot + (slot - bw) / 2;
    if (i === 0 && opts.highlightFirst !== false)
      _shape(s, "rect", nameOf("col_chart", "band"), { x: cx - 0.08, y: base - maxH - 0.28, w: bw + 0.16, h: maxH + 0.6, fill: { color: C[SR.charts.own_series_band] } });
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
    const a = SR.charts.avg_line;
    const ay = base - opts.avg / vmax * maxH;
    _shape(s, "line", nameOf("col_chart", "avg_line"), { x: px + 0.2, y: ay, w: pw - 0.4, h: 0, line: { color: C[a.color], width: a.width_pt, dashType: a.dash } });
    const aOpts = { x: px + pw - 1.35, y: ay - 0.19, w: 1.2, h: 0.16, fontFace: F, fontSize: a.label_pt, bold: a.label_bold, color: C[a.color], align: "right", margin: 0 };
    if (opts.avgClaim) claimText(s, opts.avgClaim, Object.assign({ prefix: opts.avgLbl || "" }, aOpts));
    else _text(s, opts.avgLbl || "", nameOf("col_chart", "avg_label"), aOpts);
  }
}

// 100% 세로 스택. segs: 각 항목 [v1, v2, ...] (합 100), segColors/segLblColors 병렬
function stacked100(s, px, base, maxH, labels, segs, segColors, segLblColors, slot = SR.charts.stack100.slot_default, bw = SR.charts.stack100.bar_w_default, x0off = 0.24) {
  const x0 = px + x0off;
  segs.forEach((vals, i) => {
    const cx = x0 + i * slot + (slot - bw) / 2;
    if (i === 0) _shape(s, "rect", nameOf("stack100", "band"), { x: cx - 0.07, y: base - maxH - 0.09, w: bw + 0.14, h: maxH + 0.42, fill: { color: C[SR.charts.own_series_band] } });
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
  const wf = SR.charts.waterfall;
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
const T = SR.table;
/* ══════════════════════════════════════════════════════════
   네이티브 차트 (2026-09-03 신설)

   **네이티브 차트를 원칙으로 한다** (CLAUDE.md, 사용자 확정 2026-09-03).
   pptxgenjs의 addChart는 OOXML 차트와 엑셀 워크시트를 파일 안에 같이 넣는다.
   받는 사람이 더블클릭하면 "데이터 편집"이 열리고, 고치면 막대·선이 따라 바뀐다.

   앞의 colChart·stacked100·waterfall은 도형 기반이다. 배치를 정밀하게 잡아야 하고
   숫자가 확정돼 다시 고칠 일이 없을 때만 쓴다.

   **네이티브 차트를 쓰면 tpl.chartSeries()로 계열의 원천 범위를 같이 적는다.**
   안 적으면 audit이 "그 값이 시트 어딘가에 있나"까지만 본다 (LESSONS L38).
   ══════════════════════════════════════════════════════════ */

// 차트 공통 서식. 색·크기는 전부 house-rules에서 읽는다 (계획서 2.14)
function chartBase() {
  const ch = SR.chart || {};
  return {
    fill: C.white,
    border: { pt: 0, color: C.white },
    chartColors: (ch.series || [C.navy, C.steel, C.grayLt]).slice(),
    showLegend: false,
    legendPos: "b",
    legendFontFace: F, legendFontSize: SZ.chart_axis_label_pt, legendColor: C.body,
    catAxisLabelFontFace: F, catAxisLabelFontSize: SZ.chart_axis_label_pt, catAxisLabelColor: C.title,
    valAxisLabelFontFace: F, valAxisLabelFontSize: SZ.chart_axis_label_pt, valAxisLabelColor: C.gray,
    catAxisLineShow: true, catGridLine: { style: "none" },
    valGridLine: ch.grid_color
      ? { color: ch.grid_color, size: ch.grid_width, style: "solid" }
      : { style: "none" },
    valAxisLineShow: false,
    dataLabelFontFace: F, dataLabelFontSize: SZ.chart_value_label_pt, dataLabelColor: C.body,
    dataLabelPosition: "outEnd",
    showValue: true,
    barGapWidthPct: 60,
  };
}

// 세로 막대 (네이티브). colChart의 편집 가능 판이다
function chartBar(s, x, y, w, h, labels, series, opts = {}) {
  const data = series.map(sr => ({ name: sr.name || "계열", labels, values: sr.vals }));
  s.addChart("bar", data, Object.assign(chartBase(), {
    objectName: nameOf("chartBar", "chart"),
    x, y, w, h, barDir: "col",
    showLegend: series.length > 1,
    valAxisHidden: series.length === 1,
  }, opts));
  return y + h;
}

// 꺾은선 (네이티브)
function chartLine(s, x, y, w, h, labels, series, opts = {}) {
  const data = series.map(sr => ({ name: sr.name || "계열", labels, values: sr.vals }));
  s.addChart("line", data, Object.assign(chartBase(), {
    objectName: nameOf("chartLine", "chart"),
    x, y, w, h,
    showLegend: series.length > 1,
    lineSize: 2, lineDataSymbol: "circle", lineDataSymbolSize: 6, lineSmooth: false,
    showValue: series.length === 1,
    dataLabelPosition: "t",
    valAxisHidden: series.length === 1,
  }, opts));
  return y + h;
}

const tableStyles = {
  hd:  { fontFace: F, fontSize: SZ.table_header_pt, bold: true, color: C.white, fill: { color: C.navy }, align: T.header_align, valign: "middle" },
  td:  { fontFace: F, fontSize: SZ.table_body_pt, color: C.body, align: T.default_align, valign: "middle" },
  tdR: { fontFace: F, fontSize: SZ.table_body_pt, color: C.body, align: T.numeric_col_align, valign: "middle" },
  tdL: { fontFace: F, fontSize: SZ.table_body_pt, color: C.body, align: T.long_text_col_align, valign: "middle" },
  tdG: { fontFace: F, fontSize: SZ.table_body_pt, color: C.gray, align: T.default_align, valign: "middle" },
  tl:  { fontFace: F, fontSize: SZ.table_body_pt, bold: true, color: C.body, align: T.default_align, valign: "middle" },
  usCell: { bold: true, color: C.navy, fill: { color: C[T.own_column_fill] } } // 당사 열
};

module.exports = {
  R, F, FH, C, W, H, MX, CW, FOOT_BASE,
  newPres, header, banner, banner2, sectionChip, panel, panel2, creamBox,
  bullets, footer, darkCard, statCard, iconBadge, colChart, chartBar, chartLine, stacked100, waterfall, tableStyles,
  claim, claimText, table, cell, text, shape, whitelistToken, chartSeries: kit.chartSeries, manifest, writeDeck: kit.writeDeck, writeManifest, resetManifest, sourceRoot, currentSlide,
  TEMPLATE_VERSION, STYLE, SR, nameOf, claimName, U
};
