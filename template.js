/**
 * exec-onepager-ppt 하우스 스타일 헬퍼 (pptxgenjs)
 * 사용:
 *   const pptxgen = require("pptxgenjs");
 *   const tpl = require("./template.js");
 *   const pres = tpl.newPres(pptxgen);
 *   const s = pres.addSlide();
 *   tpl.header(s, "제목", "시안 A · 차트형");
 *   tpl.banner(s, [ {text:"사실 진술", options:{fontSize:15,bold:true,color:tpl.C.white,breakLine:true}},
 *                   {text:"결론·함의", options:{fontSize:15,bold:true,color:tpl.C.amber}} ]);
 *   tpl.panel(s, tpl.MX, 2.25, 3.33, 3.9, "① 섹션 제목");
 *   ... (아래 차트/표 헬퍼) ...
 *   tpl.footer(s, ["※ 기준 각주", "* 보조 각주"], 7.52);
 */
const F = "맑은 고딕";   // 본문 전용
const FH = "HY헤드라인M";  // 제목·배너(요약박스) 전용. bold 적용
const FOOT_BASE = 7.70;   // 각주 바닥 기준선 (줄수만큼 위로 올려 붙인다)
const C = {
  title: "1F2937", body: "3C4350", gray: "6B7280", grayLt: "C4CAD2",
  navy: "0D4D79", tint: "E7EEF4", tintBd: "C9DAE8", tintLt: "F1F5F9",
  cream: "FFF2CC", creamBd: "FFDC6D", panel: "F7F8FA", panelBd: "E8EBEF",
  amber: "FFC000", amberTint: "FFF1CC", blue: "0057D9", divLt: "DDE1E6",
  white: "FFFFFF", steel: "C9DAE8", red: "FF0000"
};
const W = 11.6929, H = 8.2677, MX = 0.65, CW = W - 2 * MX;

function newPres(pptxgen) {
  const pres = new pptxgen();
  pres.defineLayout({ name: "A4L", width: W, height: H });
  pres.layout = "A4L";
  return pres;
}

// v3: 제목은 HY헤드라인M 17pt bold. 우측 본부명·날짜 없음, 제목 아래 구분선 없음
function header(s, title, tag) {
  s.addText(title, { x: MX, y: 0.52, w: CW, h: 0.34, fontFace: FH, fontSize: 17, bold: true, color: C.title, margin: 0, valign: "middle" });
  if (tag) s.addText(tag, { x: 8.4, y: 8.0, w: 2.65, h: 0.2, fontFace: F, fontSize: 8, color: C.grayLt, align: "right", margin: 0 });
}

// v3 배너(요약박스): HY헤드라인M 15pt bold, 중앙정렬. 한 줄 36자 이내로 끊는다
// l1=흰색 사실, l2=앰버 결론. runs 배열을 직접 넘기려면 banner2 사용
function banner(s, l1, l2, h = 0.82, y = 1.06) {
  s.addShape("rect", { x: MX, y, w: CW, h, fill: { color: C.navy } });
  s.addText([
    { text: l1, options: { fontSize: 15, bold: true, color: C.white, breakLine: true } },
    { text: l2, options: { fontSize: 15, bold: true, color: C.amber } }
  ], { x: MX + 0.15, y, w: CW - 0.30, h, fontFace: FH, align: "center", valign: "middle", margin: 0, lineSpacingMultiple: 1.20 });
}
function banner2(s, runs, h = 0.82, y = 1.06) {
  s.addShape("rect", { x: MX, y, w: CW, h, fill: { color: C.navy } });
  s.addText(runs, { x: MX + 0.15, y, w: CW - 0.30, h, fontFace: FH, align: "center", valign: "middle", margin: 0, lineSpacingMultiple: 1.20 });
}

// v2 섹션 칩: 번호 패널 대신 사용. 옆에 10pt gray 보조설명(desc) 옵션
// v3 섹션 칩: HY헤드라인M 12pt, **bold 없음**(네이비 배경에서 뭉갠다)
// chipW는 글자수 × 0.20 + 0.35 이상 (HY헤드라인M이 넓다)
function sectionChip(s, x, y, label, desc, chipW = 1.95) {
  s.addShape("roundRect", { x, y, w: chipW, h: 0.30, fill: { color: C.navy }, rectRadius: 0.05 });
  s.addText(label, { x, y, w: chipW, h: 0.30, fontFace: FH, fontSize: 12, color: C.white, align: "center", valign: "middle", margin: 0 });
  if (desc) s.addText(desc, { x: x + chipW + 0.10, y: y + 0.04, w: 5.2, h: 0.22, fontFace: F, fontSize: 10, color: C.gray, margin: 0, valign: "middle" });
}

// 줄글 블록 뒤에 까는 옅은 회색 패널. 불릿은 이 안쪽으로 0.16in 들여쓴다
function panel2(s, x, y, w, h) {
  s.addShape("rect", { x, y, w, h, fill: { color: C.panel }, line: { color: C.panelBd, width: 0.75 } });
}

// 페이지 결론용 크림 박스(구버전의 "시사점 행"·다크카드를 대체). 검정 일반 글씨
function creamBox(s, y, h, text) {
  s.addShape("rect", { x: MX, y, w: CW, h, fill: { color: C.cream }, line: { color: C.creamBd, width: 0.75 } });
  s.addText(text, { x: MX + 0.20, y, w: CW - 0.40, h, fontFace: F, fontSize: 10, color: "000000", valign: "middle", margin: 0, lineSpacingMultiple: 1.22 });
}

function panel(s, x, y, w, h, title) {
  s.addShape("rect", { x, y, w, h, fill: { color: C.white }, line: { color: C.grayLt, width: 0.75 } });
  s.addText(title, { x: x + 0.15, y: y + 0.12, w: w - 0.3, h: 0.28, fontFace: F, fontSize: 11.5, bold: true, color: C.navy, margin: 0, valign: "middle" });
  s.addShape("rect", { x: x + 0.15, y: y + 0.46, w: w - 0.3, h: 0.012, fill: { color: C.divLt } });
}

// items: [[{t,b,c},...],...]  강조 런 {b:true,c:C.navy}, 결론 런 {t:"⇒ ...", b:true, c:C.red}
// ⇒ 로 시작하는 결론 줄에는 ▸ 마커를 붙이지 않는다(마커 중복)
function bullets(s, items, x, y, w, fs = 10, step = 0.33) {
  items.forEach((runs, i) => {
    const yy = y + i * step;
    const isConcl = runs.length && typeof runs[0].t === "string" && runs[0].t.trim().startsWith("⇒");
    if (!isConcl) s.addText("▸", { x, y: yy, w: 0.18, h: 0.26, fontFace: F, fontSize: fs, bold: true, color: C.navy, margin: 0 });
    s.addText(runs.map(r => ({ text: r.t, options: { fontSize: fs, color: r.c || C.body, bold: !!r.b } })),
      { x: x + 0.2, y: yy, w: w - 0.2, h: step + 0.08, fontFace: F, margin: 0, valign: "top", lineSpacingMultiple: 1.15 });
  });
}

// v3: 각주는 바닥 기준. y를 생략하면 줄 수에 맞춰 FOOT_BASE에서 역산해 붙인다
function footer(s, notes, y, opts = {}) {
  if (y == null) y = FOOT_BASE - 0.14 * notes.length;
  if (opts.line) s.addShape("rect", { x: MX, y: y - 0.05, w: CW, h: 0.016, fill: { color: C.navy } });
  s.addText(notes.map((t, i) => ({ text: t, options: { breakLine: i < notes.length - 1 } })),
    { x: MX, y, w: CW, h: H - y - 0.1, fontFace: F, fontSize: 8, color: C.gray, margin: 0, valign: "top", lineSpacingMultiple: 1.12 });
}

function darkCard(s, x, y, w, h, runs) { // v2: 제목 앰버 12pt bold + 본문 흰색 11pt bold
  s.addShape("rect", { x, y, w, h, fill: { color: C.navy } });
  s.addText(runs, { x: x + 0.18, y, w: w - 0.36, h, fontFace: F, valign: "middle", margin: 0, lineSpacingMultiple: 1.22 });
}

function statCard(s, x, y, w, h, num, lbl, opts = {}) {
  const dark = opts.dark;
  s.addShape("rect", { x, y, w, h, fill: { color: dark ? C.navy : C.white }, line: { color: dark ? C.navy : C.grayLt, width: 0.75 } });
  s.addText(num, { x: x + 0.07, y: y + 0.07, w: w - 0.14, h: h * 0.45, fontFace: F, fontSize: opts.numSize || 15, bold: true, color: dark ? C.amber : (opts.numColor || C.navy), margin: 0, valign: "middle", align: "center" });
  s.addText(lbl, { x: x + 0.07, y: y + h * 0.5, w: w - 0.14, h: h * 0.46, fontFace: F, fontSize: opts.lblSize || 9.5, bold: true, color: dark ? C.steel : C.gray, margin: 0, valign: "top", align: "center", lineSpacingMultiple: 1.05 });
}

// 세로 막대 5개 내외 + 평균 점선. vals 순서대로, i===0(당사)은 navy+tint 밴드
function colChart(s, px, pw, base, maxH, vmax, labels, vals, opts = {}) {
  const x0 = px + 0.24, slot = (pw - 0.48) / vals.length, bw = Math.min(0.42, slot - 0.14);
  vals.forEach((v, i) => {
    const cx = x0 + i * slot + (slot - bw) / 2;
    if (i === 0 && opts.highlightFirst !== false)
      s.addShape("rect", { x: cx - 0.08, y: base - maxH - 0.28, w: bw + 0.16, h: maxH + 0.6, fill: { color: C.tint } });
    const h = v / vmax * maxH;
    s.addShape("rect", { x: cx, y: base - h, w: bw, h, fill: { color: i === 0 ? C.navy : (opts.barColor || C.grayLt) } });
    s.addText(v.toFixed(opts.dec == null ? 1 : opts.dec), { x: cx - 0.12, y: base - h - 0.2, w: bw + 0.24, h: 0.18, fontFace: F, fontSize: 8.5, bold: i === 0, color: i === 0 ? C.navy : C.body, align: "center", margin: 0 });
    s.addText(labels[i], { x: x0 + i * slot - 0.05, y: base + 0.04, w: slot + 0.1, h: 0.2, fontFace: F, fontSize: 8.5, bold: i === 0, color: i === 0 ? C.navy : C.body, align: "center", margin: 0 });
  });
  s.addShape("rect", { x: px + 0.15, y: base, w: pw - 0.3, h: 0.012, fill: { color: C.grayLt } });
  if (opts.avg != null) {
    const ay = base - opts.avg / vmax * maxH;
    s.addShape("line", { x: px + 0.2, y: ay, w: pw - 0.4, h: 0, line: { color: C.blue, width: 1, dashType: "dash" } });
    s.addText(opts.avgLbl || "", { x: px + pw - 1.35, y: ay - 0.19, w: 1.2, h: 0.16, fontFace: F, fontSize: 7.5, bold: true, color: C.blue, align: "right", margin: 0 });
  }
}

// 100% 세로 스택. segs: 각 항목 [v1, v2, ...] (합 100), segColors/segLblColors 병렬
function stacked100(s, px, base, maxH, labels, segs, segColors, segLblColors, slot = 0.57, bw = 0.4, x0off = 0.24) {
  const x0 = px + x0off;
  segs.forEach((vals, i) => {
    const cx = x0 + i * slot + (slot - bw) / 2;
    if (i === 0) s.addShape("rect", { x: cx - 0.07, y: base - maxH - 0.09, w: bw + 0.14, h: maxH + 0.42, fill: { color: C.tint } });
    let acc = 0;
    // 위에서 아래로 그리기 위해 역순 누적 (마지막 세그먼트가 바닥)
    const tops = [];
    let cum = 0;
    vals.forEach(v => { cum += v; tops.push(cum); });
    vals.forEach((v, j) => {
      const yTop = base - tops[j] / 100 * maxH, hh = v / 100 * maxH;
      s.addShape("rect", { x: cx, y: yTop, w: bw, h: hh, fill: { color: segColors[j] } });
      s.addText(Math.round(v) + "%", { x: cx - 0.09, y: yTop, w: bw + 0.18, h: hh, fontFace: F, fontSize: 8.5, bold: i === 0, color: segLblColors[j], align: "center", valign: "middle", margin: 0 });
    });
    s.addText(labels[i], { x: x0 + i * slot - 0.06, y: base + 0.04, w: slot + 0.12, h: 0.2, fontFace: F, fontSize: 8.5, bold: i === 0, color: i === 0 ? C.navy : C.body, align: "center", margin: 0 });
  });
}

// 워터폴: 실제(navy) → 델타(앰버, 공중) → 가상(grayLt), 점선 연결 + 0/25/50 눈금
function waterfall(s, px, pw, base, hScale, vmax, v0, v1, catLabels, lblDelta) {
  [[base - hScale, vmax / 1 + "%"], [base - hScale / 2, vmax / 2 + "%"], [base, "0%"]].forEach(([gy, lbl]) => {
    s.addShape("rect", { x: px + 0.55, y: gy, w: pw - 0.75, h: 0.012, fill: { color: gy === base ? C.grayLt : C.divLt } });
    s.addText(lbl, { x: px + 0.1, y: gy - 0.09, w: 0.4, h: 0.18, fontFace: F, fontSize: 7.5, color: C.gray, align: "right", valign: "middle", margin: 0 });
  });
  const bw = 0.5, slot = 0.82, x0 = px + 0.62 + (slot - bw) / 2;
  const cx = [x0, x0 + slot, x0 + 2 * slot];
  const h0 = v0 / vmax * hScale, h1 = v1 / vmax * hScale;
  s.addShape("rect", { x: cx[0], y: base - h0, w: bw, h: h0, fill: { color: C.navy } });
  s.addShape("rect", { x: cx[1], y: base - h1, w: bw, h: h1 - h0, fill: { color: C.amber } });
  s.addShape("rect", { x: cx[2], y: base - h1, w: bw, h: h1, fill: { color: C.grayLt } });
  s.addShape("line", { x: cx[0] + bw, y: base - h0, w: slot - bw, h: 0, line: { color: C.gray, width: 0.75, dashType: "dash" } });
  s.addShape("line", { x: cx[1] + bw, y: base - h1, w: slot - bw, h: 0, line: { color: C.gray, width: 0.75, dashType: "dash" } });
  [[v0.toFixed(1) + "%", cx[0], C.navy], [lblDelta, cx[1], C.blue], [v1.toFixed(1) + "%", cx[2], C.title]].forEach(([t, x, col], i) => {
    const top = i === 0 ? base - h0 : base - h1;
    s.addText(t, { x: x - 0.15, y: top - 0.22, w: bw + 0.3, h: 0.2, fontFace: F, fontSize: 9.5, bold: true, color: col, align: "center", margin: 0 });
  });
  catLabels.forEach((t, i) => {
    s.addText(t, { x: cx[i] - 0.16, y: base + 0.04, w: bw + 0.32, h: 0.2, fontFace: F, fontSize: 8.5, color: C.body, align: "center", margin: 0 });
  });
}

// 표 셀 스타일 프리셋 (colW 합계 == w 를 호출부에서 반드시 보장)
// 정렬 기본값은 전부 center. 좌측정렬(tdL)은 셀 안에서 줄바꿈되는 긴 서술문 열에만 쓰고,
// 그 열도 헤더는 hd(center)를 쓴다. rowH는 1줄 0.33 / 2줄 0.58 이상.
const tableStyles = {
  hd: { fontFace: F, fontSize: 9, bold: true, color: C.white, fill: { color: C.navy }, align: "center", valign: "middle" },
  td: { fontFace: F, fontSize: 9, color: C.body, align: "center", valign: "middle" },
  tdR: { fontFace: F, fontSize: 9, color: C.body, align: "right", valign: "middle" },
  tdL: { fontFace: F, fontSize: 9, color: C.body, align: "left", valign: "middle" },
  tdG: { fontFace: F, fontSize: 9, color: C.gray, align: "center", valign: "middle" },
  tl: { fontFace: F, fontSize: 9, bold: true, color: C.body, align: "center", valign: "middle" },
  usCell: { bold: true, color: C.navy, fill: { color: C.steel } } // 당사 열
};

module.exports = { F, FH, C, W, H, MX, CW, FOOT_BASE, newPres, header, banner, banner2, sectionChip, panel, panel2, creamBox, bullets, footer, darkCard, statCard, colChart, stacked100, waterfall, tableStyles };
