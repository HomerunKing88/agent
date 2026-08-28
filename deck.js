/**
 * deck.js — 1page 보고 장표 골격
 *
 * 이 파일은 리포에 두는 **템플릿**이다. 잡마다 잡 폴더로 복사해 채운다.
 *   G:\내 드라이브\deck-qa-jobs\job_YYYYMMDD_NNN\builder\deck_v1.js
 * 리포의 이 파일에는 실적 수치를 넣지 않는다. 아래 DATA는 전부 더미다.
 *
 * 규칙 값은 여기서도 하드코딩하지 않는다. template.js가 house-rules.yaml에서 읽어
 * 노출하는 상수(tpl.MX, tpl.CW, tpl.R.*)만 쓴다.
 *
 * 실행:  node deck.js [출력경로.pptx]
 */
const pptxgen = require("pptxgenjs");
const tpl = require("./template.js");

const R = tpl.R;
const MX = tpl.MX, CW = tpl.CW;

// ── 레이아웃 예산 ────────────────────────────────────────────────────
// 배너 아래부터 시사점 박스 위까지가 본문 영역이다.
const CHIP_Y    = 2.10;
const BODY_Y    = CHIP_Y + R.components.chip_content_gap;   // 칩 아래 규정 간격
const COL_L_X   = MX,          COL_L_W = 5.00;
const COL_R_X   = MX + 5.40,   COL_R_W = CW - 5.40;
const CREAM_Y   = 6.55,        CREAM_H = 0.55;

// ── 더미 데이터 ─────────────────────────────────────────────────────
// 실제 잡에서는 source.xlsx에서 온 값이 들어간다.
// 4단계에서 이 자리가 tpl.claim(값, {src, sheet, ref, ...}) 호출로 바뀐다.
const DATA = {
  title:    "○○ 부문 수익성 점검",
  tag:      "시안 A · 표+차트형",
  bannerL1: "지표 A는 전년 대비 개선되었으나 동종 평균에는 미달",
  bannerL2: "⇒ 고정비 구조 재편이 선행되어야 함",
  table: {
    head: ["구분", "FY24", "FY25", "FY26E", "증감"],
    rows: [
      ["항목 가", "00.0", "00.0", "00.0", "+0.0"],
      ["항목 나", "00.0", "00.0", "00.0", "-0.0"],
      ["항목 다", "00.0", "00.0", "00.0", "+0.0"],
      ["항목 라", "00.0", "00.0", "00.0", "-0.0"],
    ],
    total:  ["합계",  "00.0", "00.0", "00.0", "+0.0"],
  },
  chart: { labels: ["당사", "A사", "B사", "C사", "D사"], vals: [10, 10, 10, 10, 10], avg: 10 },
  bullets: [
    [{ t: "관찰 1 " }, { t: "핵심 구절", b: true, c: tpl.C.navy }, { t: " 서술" }],
    [{ t: "관찰 2 서술" }],
    [{ t: "⇒ 결론 한 줄", b: true, c: tpl.C.red }],
  ],
  cream: "시사점 한 문장. 페이지 결론을 여기 둔다.",
  notes: ["※ 기준: 더미", "* 산출: 더미"],
};

// ── 예방 가드 (계획서 2.1) ───────────────────────────────────────────
// 검사로 잡기 전에 생성 단계에서 막는다. 위반하면 pptx를 만들지 않고 죽는다.

// house-rules: table.colw_sum_must_equal_width
function assertColW(colW, w, where) {
  const sum = colW.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - w) > 1e-9)
    throw new Error(`[${where}] colW 합계 ${sum.toFixed(4)} != 표 폭 ${w.toFixed(4)}`);
}

// house-rules: table.row_height_min / row_height_2line_min
function assertRowH(rowH, where) {
  const min = R.table.row_height_min;
  rowH.forEach((h, i) => {
    if (h < min) throw new Error(`[${where}] ${i}행 rowH ${h} < 하한 ${min}`);
  });
}

// house-rules: zones.content_max_y — 캔버스 하단 이탈 방지
function assertWithinContent(bottomY, where) {
  const max = R.zones.content_max_y;
  if (bottomY > max) throw new Error(`[${where}] 하단 ${bottomY.toFixed(2)} > content_max_y ${max}`);
}

// 각주와 본문이 겹치지 않는지. 각주 y는 줄 수에서 역산된다
function assertFootnoteClear(bottomY, noteCount) {
  const footY = R.zones.footnote_bottom_y - R.zones.footnote_line_step * noteCount;
  if (bottomY > footY) throw new Error(`본문 하단 ${bottomY.toFixed(2)} 가 각주 시작 ${footY.toFixed(2)} 를 침범`);
  if (noteCount > R.zones.footnote_max_lines)
    throw new Error(`각주 ${noteCount}행 > 상한 ${R.zones.footnote_max_lines}행`);
}

// ── 장표 구성 ───────────────────────────────────────────────────────
function buildPage(pres, d) {
  const s = pres.addSlide();

  tpl.header(s, d.title, d.tag);
  tpl.banner(s, d.bannerL1, d.bannerL2);

  // ① 좌측: 표
  tpl.sectionChip(s, COL_L_X, CHIP_Y, "① 실적 추이", "(단위: 억원)");

  const colW = [1.60, 0.85, 0.85, 0.85, 0.85];
  assertColW(colW, COL_L_W, "실적 추이 표");

  const rows = [
    d.table.head.map(t => ({ text: t, options: tpl.tableStyles.hd })),
    ...d.table.rows.map(r => r.map((t, i) => ({
      // 첫 열은 항목명(짧은 구절이므로 중앙정렬 유지), 나머지는 수치
      text: t, options: i === 0 ? tpl.tableStyles.td : tpl.tableStyles.tdR,
    }))),
    d.table.total.map(t => ({ text: t, options: tpl.tableStyles.tl })),
  ];
  const rowH = rows.map(() => R.table.row_height_min);
  assertRowH(rowH, "실적 추이 표");

  s.addTable(rows, { x: COL_L_X, y: BODY_Y, w: COL_L_W, colW, rowH, border: { pt: 0.5, color: tpl.C.grayLt } });

  const tableBottom = BODY_Y + rowH.reduce((a, b) => a + b, 0) + R.table.below_table_gap;

  // 표 아래 캡션 — house-rules: components.table_caption_prefix
  s.addText(R.components.table_caption_prefix + "표 판독 한 문장.", {
    x: COL_L_X, y: tableBottom, w: COL_L_W, h: 0.20,
    fontFace: tpl.F, fontSize: R.sizes.table_caption_pt, color: tpl.C.gray, margin: 0,
  });

  // ② 우측: 차트 + 불릿 패널
  tpl.sectionChip(s, COL_R_X, CHIP_Y, "② 동종 비교", "(동종 대비, %)");

  const chartBase = BODY_Y + 2.10;
  tpl.colChart(s, COL_R_X, COL_R_W, chartBase, 1.70, 12,
    d.chart.labels, d.chart.vals, { avg: d.chart.avg, avgLbl: "평균 00.0" });

  const panelY = chartBase + 0.45, panelH = 1.35;
  tpl.panel2(s, COL_R_X, panelY, COL_R_W, panelH);
  tpl.bullets(s, d.bullets,
    COL_R_X + R.components.bullet_panel_indent, panelY + 0.14,
    COL_R_W - R.components.bullet_panel_indent * 2);

  // 시사점
  tpl.creamBox(s, CREAM_Y, CREAM_H, d.cream);

  // 각주 — y 생략 시 바닥 기준 자동 계산
  tpl.footer(s, d.notes);

  // 예산 검증
  const bodyBottom = Math.max(tableBottom + 0.20, panelY + panelH, CREAM_Y + CREAM_H);
  assertWithinContent(bodyBottom, "본문");
  assertFootnoteClear(CREAM_Y + CREAM_H, d.notes.length);

  return s;
}

function build(outPath) {
  const pres = tpl.newPres(pptxgen);
  buildPage(pres, DATA);
  return pres.writeFile({ fileName: outPath });
}

if (require.main === module) {
  const out = process.argv[2] || "deck_v1.pptx";
  build(out)
    .then(f => console.log("생성:", f))
    .catch(e => { console.error("실패:", e.message); process.exit(1); });
}

module.exports = { build, buildPage, DATA, assertColW, assertRowH, assertWithinContent, assertFootnoteClear };
