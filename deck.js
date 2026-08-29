/**
 * deck.js — 1page 보고 장표 골격
 *
 * 이 파일은 리포에 두는 **템플릿**이다. 잡마다 잡 폴더로 복사해 채운다.
 *   G:\내 드라이브\deck-qa-jobs\job_YYYYMMDD_NNN\builder\deck_v1.js
 * 리포의 이 파일에는 실적 수치를 넣지 않는다. 아래 값은 전부 더미다.
 *
 * 규칙 값은 여기서도 하드코딩하지 않는다. template.js가 house-rules.yaml에서 읽어
 * 노출하는 상수(tpl.MX, tpl.CW, tpl.R.*)만 쓴다.
 *
 * 장표에 찍는 숫자는 전부 tpl.claim()을 거친다 (계획서 2.4).
 * claim()이 돌려준 문자열을 그대로 그려야 SOURCE ↔ MANIFEST ↔ PPTX 3자 대조가 성립한다.
 *
 * 실행:  node deck.js [출력경로.pptx]   → 같은 폴더에 manifest.json 을 함께 쓴다
 */
const path = require("path");
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

// ── 원천 ────────────────────────────────────────────────────────────
// 잡 폴더에서는 builder/ 옆의 ../source/ 를 가리킨다. 파일이 없으면 해시가 null로 남고
// 게이트가 잡는다 (리포에서 더미로 돌릴 때가 그 경우다).
const SRC = "source.xlsx";
const SH_PERF = "실적", SH_PEER = "동종";
const UNIT = "억원";
tpl.sourceRoot(path.join(__dirname, "..", "source"));

// ── 데이터 ──────────────────────────────────────────────────────────
// claim()은 slide 번호를 addSlide() 호출에서 자동으로 받는다.
// 그래서 이 함수는 슬라이드가 열린 뒤에 호출돼야 한다 (buildPage 참조).
// 잡에서는 값과 셀 참조(ref)를 여기서 바꾼다. 값만 바꾸고 ref를 안 바꾸면 3자 대조가 잡는다.
function pageData() {
  const num = (id, ref, v, o) =>
    tpl.claim(v, Object.assign({ id, ref, src: SRC, sheet: SH_PERF, unit: UNIT, rounding: 1 }, o));

  // 증감 열은 계산값이다. delta는 근거 두 셀을 적는다 (transform 어휘, 계획서 2.5)
  const delta = (id, from, to, v) =>
    tpl.claim(v, { id, src: SRC, sheet: SH_PERF, unit: UNIT, rounding: 1,
                   signed: true, transform: "delta", from, to });

  return {
    title:    "○○ 부문 수익성 점검",
    tag:      "시안 A · 표+차트형",
    bannerL1: "지표 A는 전년 대비 개선되었으나 동종 평균에는 미달",
    bannerL2: "⇒ 고정비 구조 재편이 선행되어야 함",
    table: {
      head: ["구분", "FY24", "FY25", "FY26E", "증감"],
      rows: [
        ["항목 가", num("ITEM_A_FY24", "C5", 0), num("ITEM_A_FY25", "D5", 0),
                    num("ITEM_A_FY26E", "E5", 0), delta("ITEM_A_DELTA", "D5", "E5", 0)],
        ["항목 나", num("ITEM_B_FY24", "C6", 0), num("ITEM_B_FY25", "D6", 0),
                    num("ITEM_B_FY26E", "E6", 0), delta("ITEM_B_DELTA", "D6", "E6", -0)],
        ["항목 다", num("ITEM_C_FY24", "C7", 0), num("ITEM_C_FY25", "D7", 0),
                    num("ITEM_C_FY26E", "E7", 0), delta("ITEM_C_DELTA", "D7", "E7", 0)],
        ["항목 라", num("ITEM_D_FY24", "C8", 0), num("ITEM_D_FY25", "D8", 0),
                    num("ITEM_D_FY26E", "E8", 0), delta("ITEM_D_DELTA", "D8", "E8", -0)],
      ],
      // 합계는 열 범위를 sum으로 적는다. 값을 손으로 적고 range를 안 맞추면 CALC가 잡는다
      total: ["합계",
        num("TOTAL_FY24",  null, 0, { transform: "sum", range: "C5:C8" }),
        num("TOTAL_FY25",  null, 0, { transform: "sum", range: "D5:D8" }),
        num("TOTAL_FY26E", null, 0, { transform: "sum", range: "E5:E8" }),
        delta("TOTAL_DELTA", "D9", "E9", 0),
      ],
    },
    chart: {
      labels: ["당사", "A사", "B사", "C사", "D사"],
      // 차트 막대는 수치를 pptxgenjs가 직접 그린다. 라벨 문자열은 claim()이 만든 것을 쓴다
      vals: [10, 10, 10, 10, 10],
      valClaims: ["OWN", "PEER_A", "PEER_B", "PEER_C", "PEER_D"].map((id, i) =>
        tpl.claim(10, { id: "ROE_" + id, src: SRC, sheet: SH_PEER,
                        ref: String.fromCharCode(67 + i) + "12", unit: "%", rounding: 1 })),
      // 단순평균은 transform 어휘 다섯 개에 없다. unverified로 두고 근거를 한 줄 적는다 (계획서 2.5)
      avg: 10,
      avgClaim: tpl.claim(10, { id: "ROE_PEER_AVG", unit: "%", rounding: 1,
                                transform: "unverified", note: "동종 4사 단순평균. 가중 아님" }),
    },
    bullets: [
      [{ t: "관찰 1 " }, { t: "핵심 구절", b: true, c: tpl.C.navy }, { t: " 서술" }],
      [{ t: "관찰 2 서술" }],
      [{ t: "⇒ 결론 한 줄", b: true, c: tpl.C.red }],
    ],
    cream: "시사점 한 문장. 페이지 결론을 여기 둔다.",
    notes: ["※ 기준: 더미", "* 산출: 더미"],
  };
}

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
function buildPage(pres, data) {
  const s = pres.addSlide();
  // 슬라이드가 열린 뒤에 값을 만든다. claim()이 slide 번호를 여기서 받아 간다
  const d = data || pageData();

  tpl.header(s, d.title, d.tag);
  tpl.banner(s, d.bannerL1, d.bannerL2);

  // ① 좌측: 표 — 단위 표기는 house-rules의 notation.unit_label (대괄호. 괄호 표기 금지)
  tpl.sectionChip(s, COL_L_X, CHIP_Y, "① 실적 추이", R.notation.unit_label);

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
    d.chart.labels, d.chart.vals, { avg: d.chart.avg, avgLbl: "평균 " + d.chart.avgClaim });

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
  buildPage(pres);
  // manifest는 pptx와 같은 폴더에 둔다 (잡 폴더 builder/)
  const mf = tpl.writeManifest(path.join(path.dirname(path.resolve(outPath)), "manifest.json"));
  return pres.writeFile({ fileName: outPath }).then(f => ({ pptx: f, manifest: mf }));
}

if (require.main === module) {
  const out = process.argv[2] || "deck_v1.pptx";
  build(out)
    .then(r => {
      console.log("생성:", r.pptx);
      console.log("manifest:", r.manifest.file, `claim ${r.manifest.count}건`);
      if (r.manifest.unhashed) console.log(`주의: 원천 파일을 못 찾아 해시가 빈 claim ${r.manifest.unhashed}건`);
    })
    .catch(e => { console.error("실패:", e.message); process.exit(1); });
}

module.exports = { build, buildPage, pageData, assertColW, assertRowH, assertWithinContent, assertFootnoteClear };
