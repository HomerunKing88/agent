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
 * **배너·불릿·시사점 같은 문장에도 숫자를 손으로 쓰지 않는다.**
 * claim이 만든 문자열을 이어 붙인다.
 *
 *   bannerL1: `FY26E 세전이익은 ${total.fy26.text}억으로 개선되나 ...`   (O)
 *   bannerL1: "FY26E 세전이익은 8,860억으로 470억 개선되나 ..."          (X)
 *
 * 손으로 쓰면 원천이 바뀔 때 표만 따라 바뀌고 문장은 옛 숫자로 남는다.
 * 2026-08-29 연습 잡에서 실제로 걸렸다. "470억"이라 썼는데 claim 문자열은 "+470"(부호 포함)이라
 * 미등록 토큰으로 잡혔다. 숫자가 맞아도 표기가 다르면 갈라진다는 뜻이다.
 *
 * 실행:  node deck.js [출력경로.pptx]   → 같은 폴더에 manifest.json 을 함께 쓴다
 */
const path = require("path");
const pptxgen = require("pptxgenjs");
const tpl = require("./template.js");

// 스타일 규칙은 생성기가 노출하는 자기 스타일 절에서 읽는다 (계획서 2.17).
// notation처럼 스타일 무관한 절은 tpl.R(최상위)에 그대로 있다. 2.17이 그렇게 자른 것이다.
const R = tpl.SR;
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
  // claim()이 만든 문자열과 id를 함께 돌려준다. id가 있어야 셀 위치를 manifest에 적을 수 있다
  // (계획서 2.16-1: 표는 shape_id + (행, 열)로 참조한다)
  const num = (id, ref, v, o) =>
    ({ id, text: tpl.claim(v, Object.assign({ id, ref, src: SRC, sheet: SH_PERF, unit: UNIT, rounding: 1 }, o)) });

  // 증감 열은 계산값이다. delta는 근거 두 셀을 적는다 (transform 어휘, 계획서 2.5)
  const delta = (id, from, to, v) =>
    ({ id, text: tpl.claim(v, { id, src: SRC, sheet: SH_PERF, unit: UNIT, rounding: 1,
                                signed: true, transform: "delta", from, to }) });

  // 동종 비교 막대. 막대 높이(v)와 찍히는 문자열이 같은 원천에서 나오게 한 배열에 묶는다
  const peer = [
    { id: "ROE_OWN",    ref: "C12", v: 10 },
    { id: "ROE_PEER_A", ref: "D12", v: 10 },
    { id: "ROE_PEER_B", ref: "E12", v: 10 },
    { id: "ROE_PEER_C", ref: "F12", v: 10 },
    { id: "ROE_PEER_D", ref: "G12", v: 10 },
  ];
  peer.forEach(x => tpl.claim(x.v, { id: x.id, src: SRC, sheet: SH_PEER, ref: x.ref, unit: "%", rounding: 1 }));

  // 장표에 숫자가 찍히는데 claim이 아닌 것이 있으면 audit이 미등록 토큰으로 잡는다.
  // 연도 라벨 같은 공통 예외는 house-rules에 있다. 이 잡에서만 통하는 예외는 아래처럼 사유와 함께 등록한다.
  // 사유 없는 예외는 만들 수 없다 — 오탐 몇 건 때문에 검사를 통째로 끄는 일을 막는다.
  //   tpl.whitelistToken({ token: "-100", reason: "브리프 원문 인용. 산출값 아님" });

  // 단순평균은 transform 어휘 다섯 개에 없다. unverified로 두고 근거를 한 줄 적는다 (계획서 2.5)
  const PEER_AVG = 10;
  tpl.claim(PEER_AVG, { id: "ROE_PEER_AVG", unit: "%", rounding: 1,
                        transform: "unverified", note: "동종 4사 단순평균. 가중 아님" });

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
      // 막대 높이는 v로 그리고, 막대 위 수치는 claim 문자열로 찍는다.
      // 둘이 갈라지면 그림과 숫자가 다른 말을 하므로 같은 배열에서 뽑는다
      vals: peer.map(x => x.v),
      valClaims: peer.map(x => x.id),
      avg: PEER_AVG,
      avgClaim: "ROE_PEER_AVG",
    },
    bullets: [
      // 더미 문구에 맨숫자를 두지 않는다. 이 파일이 잡마다 복사되므로
      // 등록되지 않은 숫자 토큰 오탐이 잡마다 따라간다 (계획서 10절 미결)
      [{ t: "관찰 가 " }, { t: "핵심 구절", b: true, c: tpl.C.navy }, { t: " 서술" }],
      [{ t: "관찰 나 서술" }],
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
  if (Math.abs(sum - w) > tpl.U.epsilon_in)
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
  tpl.sectionChip(s, COL_L_X, CHIP_Y, "① 실적 추이", tpl.R.notation.unit_label);

  const colW = [1.60, 0.85, 0.85, 0.85, 0.85];
  assertColW(colW, COL_L_W, "실적 추이 표");

  // 값이 claim이면 셀과 manifest를 잇고, 아니면 그냥 문자열 셀을 만든다
  const mkCell = (v, style) =>
    (v && typeof v === "object" && v.id) ? tpl.cell(v.text, v.id, style) : { text: v, options: style };

  const rows = [
    d.table.head.map(t => mkCell(t, tpl.tableStyles.hd)),
    ...d.table.rows.map(r => r.map((t, i) =>
      // 첫 열은 항목명(짧은 구절이므로 중앙정렬 유지), 나머지는 수치
      mkCell(t, i === 0 ? tpl.tableStyles.td : tpl.tableStyles.tdR))),
    d.table.total.map(t => mkCell(t, tpl.tableStyles.tl)),
  ];
  const rowH = rows.map(() => R.table.row_height_min);
  assertRowH(rowH, "실적 추이 표");

  tpl.table(s, tpl.nameOf("table", "perf"), rows, { x: COL_L_X, y: BODY_Y, w: COL_L_W, colW, rowH, border: { pt: 0.5, color: tpl.C.grayLt } });

  const tableBottom = BODY_Y + rowH.reduce((a, b) => a + b, 0) + R.table.below_table_gap;

  // 표 아래 캡션 — house-rules: components.table_caption_prefix
  tpl.text(s, tpl.nameOf("table", "caption"), R.components.table_caption_prefix + "표 판독 한 문장.", {
    x: COL_L_X, y: tableBottom, w: COL_L_W, h: 0.20,
    fontFace: tpl.F, fontSize: R.sizes.table_caption_pt, color: tpl.C.gray, margin: 0,
  });

  // ② 우측: 차트 + 불릿 패널
  tpl.sectionChip(s, COL_R_X, CHIP_Y, "② 동종 비교", "(동종 대비, %)");

  const chartBase = BODY_Y + 2.10;
  tpl.colChart(s, COL_R_X, COL_R_W, chartBase, 1.70, 12,
    d.chart.labels, d.chart.vals,
    { avg: d.chart.avg, avgLbl: "평균 ", avgClaim: d.chart.avgClaim, valClaims: d.chart.valClaims });

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
  // 등록만 되고 어디에도 찍히지 않은 claim은 audit.py가 XML에서 찾을 도형이 없다는 뜻이다.
  // 조용한 PASS를 만드는 상태이므로 pptx를 만들지 않고 죽는다 (계획서 2.1, 2.16-7)
  const unplaced = tpl.manifest().filter(c => !c.placements.length).map(c => c.shape_id);
  if (unplaced.length)
    throw new Error(`장표에 찍히지 않은 claim: ${unplaced.join(", ")}`);
  // manifest는 pptx와 같은 폴더에 둔다 (잡 폴더 builder/)
  const mf = tpl.writeManifest(path.join(path.dirname(path.resolve(outPath)), "manifest.json"));
  // deckkit이 저장 뒤 도형 ID를 다시 매긴다. pptxgenjs가 표에만 다른 공식을 써서 겹친다
  return tpl.writeDeck(pres, outPath).then(r => ({ pptx: r.file, manifest: mf, renumbered: r.renumbered }));
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
