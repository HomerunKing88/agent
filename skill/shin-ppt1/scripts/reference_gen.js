/**
 * shin-ppt1 기준본 10page 생성
 * 테마 4종 + 도식 견본. 페이지마다 다른 도식을 쓰고 끝에서 checkLayout()으로 여백을 검사한다.
 * 각 페이지 끝에서 checkLayout()으로 여백 규칙을 검사한다.
 */
let pptxgen;
try {
  pptxgen = require("pptxgenjs");
} catch (e) {
  console.error("pptxgenjs가 없다. 작업 폴더에서 먼저 설치할 것:\n  npm install pptxgenjs");
  process.exit(1);
}
const tpl = require("./template.js");
const { C, TS, MX, CW, RX, COLW } = tpl;
const pres = tpl.newPres(pptxgen, "report", "soft");

/* ══ 1p · report — 표 + 흐름 도식 ══ 각주 2줄 → 하한 7.64 ══ */
{
  tpl.useTheme("report");
  const s = tpl.addSlide(pres);
  tpl.header(s, "테마 report — 기본 팔레트 (표 + 흐름 도식)");
  tpl.summary(s, "상급자 개인 보고에 쓰는 기본 테마임", "색면은 요약박스 하나로 제한하고 구조는 선·여백으로 만듦");

  tpl.sub(s, MX, 2.00, "구성 항목별 비중", "(단위: 억원, 예시)", COLW);
  const st = tpl.makeTableStyles(tpl.TS.table);
  const L = tpl.openTable(s, [
    [{ text: "구분", options: st.hd }, { text: "금액", options: st.hd }, { text: "비중", options: st.hd }, { text: "판단", options: st.hd }],
    [{ text: "A 부문", options: st.td }, { text: "1,240", options: st.num }, { text: "64.6%", options: st.numEm }, { text: "유지", options: st.td }],
    [{ text: "B 부문", options: st.td }, { text: "860", options: st.num }, { text: "44.8%", options: st.num }, { text: "확대", options: st.td }],
    [{ text: "C 부문", options: st.td }, { text: "-180", options: st.num }, { text: "-9.4%", options: st.num }, { text: "축소", options: st.td }],
    [{ text: "합계", options: st.tot }, { text: "1,920", options: st.totN }, { text: "100.0%", options: st.totN }, { text: "-", options: st.tdM }]
  ], { x: MX, y: 2.44, w: COLW, colW: [1.28, 1.30, 1.30, 1.14], rowH: [0.80, 0.90, 0.90, 0.90, 0.90], washCols: [2] });

  tpl.sub(s, RX, 2.00, "자금 회전 구조", "(회귀 경로 포함)", COLW);
  tpl.flow(s, RX, 2.44, COLW, 2.10, [
    { icon: "coin", title: "조달", desc: "차입·자본" },
    { icon: "box", title: "운용", desc: "자산 편입" },
    { icon: "clock", title: "회수", desc: "만기 상환" }
  ], { hi: 1, loop: true, loopLabel: "회수분 재투입" });

  tpl.sub(s, RX, 5.32, "검토 포인트", "");
  tpl.bullets(s, [
    [{ t: "회수 주기가 12개월을 넘기면 재투입분이 한 회전 밀림", c: C.body }],
    [{ t: "C 부문 손실은 조달 단계 한도에서 흡수 불가", c: C.body }],
    [{ t: "⇒ 한도 재산정을 운용 단계보다 먼저 진행", b: true, c: C.ink }]
  ], RX, 5.74, COLW, TS.bullet, 0.42);

  const T = tpl.msgBox(s, 6.94, 0.70, "C 부문은 손실 구간이 이어지고 있어 한도 재산정이 선행되어야 함", MX, CW);
  tpl.footer(s, ["※ 예시 수치임. 실제 보고에는 원천 데이터로 대체", "※ 음수는 마이너스 부호로 표기"], { page: "1 / 10" });
  tpl.checkLayout("1p report", { cols: [L, 6.78], tail: T, footLines: 2 });
}

/* ══ 2p · mono — 비교 대조 ══ 각주 1줄 → 하한 7.79 ══ */
{
  tpl.useTheme("mono");
  const s = tpl.addSlide(pres);
  tpl.header(s, "테마 mono — 무채색 전용 (비교 대조)");
  tpl.summary(s, "색이 브랜드로 읽히면 안 되는 대외·심의 자료용임", "강조는 색이 아니라 굵기와 선 두께로 처리함");

  tpl.sub(s, MX, 2.00, "수행 방식 비교", "(강조 쪽만 옅은 배경 + 굵은 테두리)", CW);
  const B = tpl.compare(s, MX, 2.44, CW, { left: "직접 수행", right: "외부 위탁" }, [
    { label: "초기 비용", left: "높음 (28억)", right: "낮음 (11억)" },
    { label: "3년 누적", left: "52억", right: "61억" },
    { label: "소요 기간", left: "9개월", right: "4개월" },
    { label: "내부 역량", left: "축적됨", right: "축적 안 됨" },
    { label: "운영 통제", left: "직접 통제", right: "계약 범위 내" }
  ], "left", { hh: 0.56, rh: 0.60 });

  tpl.sub(s, MX, B + 0.30, "검토 의견", "");
  tpl.bullets(s, [
    [{ t: "초기 비용은 외부 위탁이 낮으나 3년 누적 기준으로 역전됨", c: C.body }],
    [{ t: "내부 역량 축적이 후속 과제의 전제 조건임", c: C.body }],
    [{ t: "⇒ 직접 수행을 원안으로 하되 1차 연도만 부분 위탁", b: true, c: C.ink }]
  ], MX, B + 0.72, CW, TS.bullet, 0.40);
  tpl.footer(s, ["※ 비용은 예시 수치임"], { page: "2 / 10" });
  tpl.checkLayout("2p mono", { cols: [B + 0.72 + 0.80 + 0.20], footLines: 1 });
}

/* ══ 3p · paper — 적층 + 카드 표 ══ 각주 2줄 → 하한 7.64 ══ */
{
  tpl.useTheme("paper");
  const s = tpl.addSlide(pres);
  tpl.header(s, "테마 paper — 크림 지면 (적층 구조 + 카드 표)");
  tpl.summary(s, "인쇄해서 손에 들고 보는 회장·이사회 보고용임", "지면이 크림색이라 표를 카드로 띄우면 종이 위에 얹힌 것처럼 읽힘");

  tpl.sub(s, MX, 2.00, "자본구조 우선순위", "", COLW);
  const S1 = tpl.stack(s, MX, 2.44, COLW, [
    { label: "선순위", note: "담보 확보, 금리 하단" },
    { label: "메자닌", note: "전환권 부여" },
    { label: "에쿼티", note: "잔여 수익 귀속" }
  ], 0, { lh: 0.96 });

  tpl.sub(s, MX, S1 + 0.32, "회수 전제", "");
  tpl.bullets(s, [
    [{ t: "선순위 상환 완료 전까지 에쿼티 배분 유보", c: C.body }],
    [{ t: "메자닌 전환권은 FY27 이후 행사 가능", c: C.body }]
  ], MX, S1 + 0.76, COLW, TS.bullet, 0.44);
  const Lb = S1 + 0.76 + 0.44 + 0.22;

  tpl.sub(s, RX, 2.00, "연도별 수지", "(억원)", COLW);
  const st = tpl.makeTableStyles(tpl.TS.table);
  const R = tpl.openTable(s, [
    [{ text: "연도", options: st.hd }, { text: "수익", options: st.hd }, { text: "비용", options: st.hd }, { text: "순이익", options: st.hd }],
    [{ text: "FY24", options: st.td }, { text: "1,204", options: st.num }, { text: "988", options: st.num }, { text: "216", options: st.num }],
    [{ text: "FY25", options: st.td }, { text: "1,431", options: st.num }, { text: "1,109", options: st.num }, { text: "322", options: st.num }],
    [{ text: "FY26E", options: st.td }, { text: "1,688", options: st.num }, { text: "1,240", options: st.num }, { text: "448", options: st.numEm }],
    [{ text: "CAGR", options: st.tot }, { text: "18.4%", options: st.totN }, { text: "12.1%", options: st.totN }, { text: "44.0%", options: st.totN }]
  ], { x: RX, y: 2.44, w: COLW, colW: [1.14, 1.32, 1.30, 1.26], rowH: [0.80, 0.92, 0.92, 0.92, 0.92], cardBg: true });

  const T = tpl.msgBox(s, 6.92, 0.72, "조달금리가 50bp 오르면 FY26E 순이익은 -32 변동함. 헤지 비율 상향을 함께 검토 요망", MX, CW);
  tpl.footer(s, ["※ 표는 지면색과 다른 카드 배경으로 띄움(cardBg). 크림 지면에서만 효과가 있음", "※ 예시 수치임"], { page: "3 / 10" });
  tpl.checkLayout("3p paper", { cols: [Lb, R], tail: T, footLines: 2 });
}

/* ══ 4p · dense — 다계열 막대 + 다열 표 ══ 각주 2줄 → 하한 7.64 ══ */
{
  tpl.useTheme("dense");
  const s = tpl.addSlide(pres);
  tpl.header(s, "테마 dense — 다계열 수치 (막대 + 다열 표)");
  tpl.summary(s, "계열이 셋 이상인 수치 페이지에만 씀", "계열색은 순서를 고정해 페이지가 바뀌어도 같은 계열이 같은 색임");

  tpl.sub(s, MX, 2.00, "분기별 부문 실적", "(단위: 억원)", COLW);
  const Lb = tpl.chartBar(s, MX, 2.44, COLW, 3.94, ["1Q", "2Q", "3Q", "4Q"], [
    { name: "A 부문", vals: [320, 280, 410, 380] },
    { name: "B 부문", vals: [210, 240, 190, 260] },
    { name: "C 부문", vals: [120, 150, 130, 170] }
  ]);

  tpl.sub(s, RX, 2.00, "부문별 지표", "(매출 억원, 나머지 %)", COLW);
  const st = tpl.makeTableStyles(tpl.TS.tableMin);
  const R = tpl.openTable(s, [
    [{ text: "부문", options: st.hd }, { text: "매출", options: st.hd }, { text: "YoY", options: st.hd }, { text: "이익률", options: st.hd }, { text: "ROE", options: st.hd }],
    [{ text: "A", options: st.td }, { text: "1,390", options: st.num }, { text: "12.4", options: st.num }, { text: "18.2", options: st.num }, { text: "11.0", options: st.num }],
    [{ text: "B", options: st.td }, { text: "900", options: st.num }, { text: "-3.1", options: st.num }, { text: "9.4", options: st.num }, { text: "6.2", options: st.num }],
    [{ text: "C", options: st.td }, { text: "570", options: st.num }, { text: "21.8", options: st.numEm }, { text: "14.1", options: st.num }, { text: "9.8", options: st.num }],
    [{ text: "계", options: st.tot }, { text: "2,860", options: st.totN }, { text: "9.4", options: st.totN }, { text: "14.6", options: st.totN }, { text: "9.3", options: st.totN }]
  ], { x: RX, y: 2.44, w: COLW, colW: [0.86, 1.20, 1.02, 1.00, 0.94], rowH: [0.80, 0.86, 0.86, 0.86, 0.86], washCols: [2] });

  tpl.sub(s, MX, 6.70, "판단", "");
  tpl.bullets(s, [
    [{ t: "C 부문 YoY 21.8%는 기저 효과가 절반 이상 차지함", c: C.body }],
    [{ t: "⇒ 4Q 반등 폭만으로 FY27 목표를 상향하지 않음", b: true, c: C.ink }]
  ], MX, 7.08, CW, TS.bullet, 0.34);
  tpl.footer(s, ["※ 계 행의 YoY·이익률·ROE는 매출 가중평균임(단순평균 아님). 매출은 단순 합계",
                 "※ 막대는 네이티브 차트이며 더블클릭하면 엑셀 데이터 편집이 열림"], { page: "4 / 10" });
  tpl.checkLayout("4p dense", { cols: [Lb, R], tail: 7.08 + 0.34 + 0.20, footLines: 2 });
}

/* ══ 5p · report — 타임라인 + 매트릭스 ══ 각주 1줄 → 하한 7.79 ══ */
{
  tpl.useTheme("report");
  const s = tpl.addSlide(pres);
  tpl.header(s, "컴포넌트 견본 — 타임라인 + 매트릭스 (report 테마)");
  tpl.summary(s, "일정과 우선순위를 한 장에서 같이 보여줄 때의 배치임", "타임라인 설명 높이를 줄수에 맞춰 아래 빈 띠를 없앰");

  tpl.sub(s, MX, 2.00, "추진 일정", "(2분기 진행 중)", CW);
  const TL = tpl.timeline(s, MX, 2.44, CW, [
    { when: "1분기", what: "준비", note: "내부 검토 완료\n대상 부문 3개 확정" },
    { when: "2분기", what: "실행", note: "시범 적용\n손익 영향 월 단위 점검" },
    { when: "3분기", what: "확산", note: "전 부문 전개\n한도 재산정 반영" },
    { when: "4분기", what: "정착", note: "성과 측정\nFY27 계획에 반영" }
  ], { hi: 1, noteH: 0.68 });

  tpl.sub(s, MX, TL + 0.32, "우선순위 판단", "", CW);
  const M = tpl.matrix(s, MX, TL + 0.80, CW, 2.62,
    { x: ["낮음", "높음"], xName: "실행 난이도", y: ["낮음", "높음"], yName: "기대 효과" }, [
    { title: "즉시 착수", note: "효과 크고 난이도 낮음. 2분기 시범 대상" },
    { title: "단계 추진", note: "효과 크나 사전 준비 필요. 3분기 이후" },
    { title: "후순위", note: "효과·난이도 모두 낮음" },
    { title: "보류", note: "투입 대비 효과 불명확" }
  ], 0);
  tpl.footer(s, ["※ 두 축 모두 방향을 말로 적음. 세로축 이름은 왼쪽 여백에 세워서 넣음"], { page: "5 / 10" });
  tpl.checkLayout("5p report", { cols: [M], footLines: 1 });
}

/* ══ 6p — 워터폴 + 추이 ══ 각주 1줄 → 하한 7.79 ══ */
{
  tpl.useTheme("report");
  const s = tpl.addSlide(pres);
  tpl.header(s, "도식 견본 ① — 증감 분해 + 시계열 추이");
  tpl.summary(s, "수치가 왜 움직였는지는 표가 아니라 분해 도식으로 보여줌", "추이는 방향이 보여야 하므로 막대 대신 꺾은선을 씀");

  tpl.sub(s, MX, 2.00, "순영업수익 증감 분해", "(FY25 → FY26E, 억원)", CW);
  const W1 = tpl.chartWaterfall(s, MX, 2.44, CW, 2.44, [
    { label: "FY25", value: 1431, type: "base" },
    { label: "위탁", value: 186, type: "delta" },
    { label: "IB", value: 142, type: "delta" },
    { label: "운용", value: -98, type: "delta" },
    { label: "기타", value: 27, type: "delta" },
    { label: "FY26E", value: 1688, type: "total" }
  ]);

  tpl.sub(s, MX, W1 + 0.36, "부문별 분기 추이", "(억원)", CW);
  const L1 = tpl.chartLine(s, MX, W1 + 0.80, CW, 2.10, ["1Q", "2Q", "3Q", "4Q", "1Q E"], [
    { name: "위탁", vals: [320, 288, 356, 402, 418] },
    { name: "IB", vals: [186, 214, 198, 246, 262] },
    { name: "운용", vals: [142, 108, 126, 96, 104] }
  ]);
  tpl.footer(s, ["※ 두 그림 모두 네이티브 차트임. 증감 분해는 받침 계열로 막대를 띄우므로 세로축이 0에서 시작하지 않음"], { page: "6 / 10" });
  tpl.checkLayout("6p 워터폴·추이", { cols: [L1], footLines: 1 });
}

/* ══ 7p — 수익 구성 (누적 금액 막대 + 구성비 표) ══ 각주 2줄 → 하한 7.64 ══ */
{
  tpl.useTheme("dense");
  const s = tpl.addSlide(pres);
  tpl.header(s, "도식 견본 ② — 수익 구성 (누적 금액 막대 + 구성비 표)");
  tpl.summary(s, "구성비만 보여주면 총액이 커진 사실이 가려짐", "금액 누적 막대로 총액과 구성을 한 그림에서 보이고 비중은 표로 읽힘");

  tpl.sub(s, MX, 2.00, "수익 구성 추이", "(금액, 억원)", COLW);
  const Lb = tpl.chartBar(s, MX, 2.44, COLW, 4.30, ["FY24", "FY25", "FY26E"], [
    { name: "위탁", vals: [512, 566, 648] },
    { name: "IB", vals: [286, 348, 452] },
    { name: "운용", vals: [244, 302, 358] },
    { name: "기타", vals: [162, 215, 230] }
  ], { barGrouping: "stacked", dataLabelPosition: "ctr", dataLabelColor: C.card, valAxisHidden: true });

  tpl.sub(s, RX, 2.00, "부문별 구성비", "(%, %p)", COLW);
  const st = tpl.makeTableStyles(tpl.TS.tableMin);
  const R = tpl.openTable(s, [
    [{ text: "부문", options: st.hd }, { text: "FY24", options: st.hd }, { text: "FY25", options: st.hd }, { text: "FY26E", options: st.hd }, { text: "증감", options: st.hd }],
    [{ text: "위탁", options: st.td }, { text: "42.5", options: st.num }, { text: "39.6", options: st.num }, { text: "38.4", options: st.num }, { text: "-4.1", options: st.num }],
    [{ text: "IB", options: st.td }, { text: "23.8", options: st.num }, { text: "24.3", options: st.num }, { text: "26.8", options: st.numEm }, { text: "+3.0", options: st.numEm }],
    [{ text: "운용", options: st.td }, { text: "20.3", options: st.num }, { text: "21.1", options: st.num }, { text: "21.2", options: st.num }, { text: "+0.9", options: st.num }],
    [{ text: "기타", options: st.td }, { text: "13.4", options: st.num }, { text: "15.0", options: st.num }, { text: "13.6", options: st.num }, { text: "+0.2", options: st.num }],
    [{ text: "계", options: st.tot }, { text: "100.0", options: st.totN }, { text: "100.0", options: st.totN }, { text: "100.0", options: st.totN }, { text: "-", options: st.tdM }]
  ], { x: RX, y: 2.44, w: COLW, colW: [1.10, 0.98, 0.98, 0.98, 0.98], rowH: [0.70, 0.72, 0.72, 0.72, 0.72, 0.72], washCols: [4] });

  const T = tpl.msgBox(s, 7.02, 0.62, "총액은 3년간 1,204 → 1,688로 늘었고 그 증가분의 절반 이상이 IB 부문에서 나옴", MX, CW);
  tpl.footer(s, ["※ FY24 기타는 합계 100.0%를 맞추기 위한 단수조정 -0.1%p를 반영한 값임(반올림값 13.5%)",
                 "※ 증감은 FY26E와 FY24의 차이(%p). 막대는 네이티브 차트임. 예시 수치임"], { page: "7 / 10" });
  tpl.checkLayout("7p 수익 구성", { cols: [Lb, R], tail: T, footLines: 2 });
}

/* ══ 8p — 단계 띠 + 간트 ══ 각주 1줄 → 하한 7.79 ══ */
{
  tpl.useTheme("report");
  const s = tpl.addSlide(pres);
  tpl.header(s, "도식 견본 ③ — 추진 단계 + 기간 일정");
  tpl.summary(s, "단계 이름만 이어 붙일 때는 띠, 기간이 겹칠 때는 간트를 씀", "타임라인은 시점만 찍으므로 기간 표현에는 쓰지 않음");

  tpl.sub(s, MX, 2.00, "추진 단계", "(3단계 진행 중)", CW);
  const C1 = tpl.chevron(s, MX, 2.44, CW, 1.04, [
    { label: "현황 진단", note: "부문별 수익성 실사" },
    { label: "안 도출", note: "대안 3개 비교" },
    { label: "경영진 보고", note: "이사회 부의" },
    { label: "실행 전개", note: "분기 단위 점검" }
  ], { hi: 2 });

  tpl.sub(s, MX, C1 + 0.36, "세부 일정", "(기간이 겹치는 과제)", CW);
  const G1 = tpl.gantt(s, MX, C1 + 0.80, CW, ["1Q", "2Q", "3Q", "4Q"], [
    { label: "수익성 실사", from: 0, to: 1, note: "전 부문" },
    { label: "대안 비교·선정", from: 1, to: 2, note: "3개 안" },
    { label: "이사회 부의", from: 2, to: 2, note: "9월" },
    { label: "시범 적용", from: 2, to: 3, note: "2개 부문" },
    { label: "성과 측정", from: 3, to: 3, note: "" }
  ], { hi: 1, rh: 0.60 });
  tpl.footer(s, ["※ 간트 막대는 기간 양끝을 포함함. 예시 일정임"], { page: "8 / 10" });
  tpl.checkLayout("8p 단계·간트", { cols: [G1], footLines: 1 });
}

/* ══ 9p — 주체별 프로세스 + 평가 격자 ══ 각주 2줄 → 하한 7.64 ══ */
{
  tpl.useTheme("report");
  const s = tpl.addSlide(pres);
  tpl.header(s, "도식 견본 ④ — 주체별 프로세스 + 평가 격자");
  tpl.summary(s, "부서가 여럿인 절차는 흐름 도식으로는 누가 하는지 안 보임", "평가는 초록·빨강 신호등 대신 농도 3단계로 표시함");

  tpl.sub(s, MX, 2.00, "한도 승인 절차", "(부서별 역할)", CW);
  const SW = tpl.swimlane(s, MX, 2.44, CW, ["신청", "심사", "승인", "집행"], [
    { name: "영업본부", cells: ["한도 신청서 제출", null, null, "약정 체결"] },
    { name: "리스크관리", cells: [null, "여신 심사·등급 부여", null, "사후 한도 점검"] },
    { name: "경영전략", cells: [null, "자본 배분 검토", "심의위 상정", null] }
  ], { rh: 0.64, hi: [2, 2] });

  tpl.sub(s, MX, SW + 0.36, "대안별 평가", "(농도가 진할수록 우위)", CW);
  const HT = tpl.heat(s, MX, SW + 0.80, CW, ["수익성", "자본 효율", "실행 용이성", "조직 수용성"], [
    { label: "A안 · 직접 수행", vals: [3, 2, 1, 1], texts: ["상", "중", "하", "하"] },
    { label: "B안 · 합작", vals: [2, 3, 2, 2], texts: ["중", "상", "중", "중"] },
    { label: "C안 · 전면 위탁", vals: [1, 1, 3, 3], texts: ["하", "하", "상", "상"] }
  ], { rh: 0.50 });
  tpl.footer(s, ["※ 강조 칸은 심의위 상정 단계임", "※ 평가는 상·중·하 3단계이며 절대 점수가 아님"], { page: "9 / 10" });
  tpl.checkLayout("9p 프로세스·평가", { cols: [HT], footLines: 2 });
}

/* ══ 10p — 분기 구조 + 단계별 축소 ══ 각주 1줄 → 하한 7.79 ══ */
{
  tpl.useTheme("report");
  const s = tpl.addSlide(pres);
  tpl.header(s, "도식 견본 ⑤ — 분기 구조 + 단계별 축소");
  tpl.summary(s, "숫자 몇 개를 큰 색면으로 부풀리지 않음", "도형 크기는 담는 정보량에 맞추고 남는 자리는 표나 문장으로 채움");

  tpl.sub(s, MX, 2.00, "FY26E 수익 귀속", "(억원)", CW);
  const B = tpl.branch(s, MX, 2.44, CW, 2.20,
    { title: "순영업수익", value: "1,688", note: "FY26E 계획" },
    [
      { label: "위탁 648", note: "리테일 잔고 증가분 반영. 분기 균등 가정" },
      { label: "IB 452", note: "확정 딜 17건 기준. 파이프라인 잔여분 제외" },
      { label: "운용·기타 588", note: "종금북 포함. 조달금리 3.4% 전제" }
    ]);

  tpl.sub(s, MX, B + 0.32, "딜 파이프라인 단계별 잔존", "(건수)", CW);
  const Fn = tpl.funnel(s, MX, B + 0.76, CW, [
    { label: "검토 접수", value: 148, note: "전 채널 유입 기준" },
    { label: "내부 심사", value: 86, note: "규모·업종 요건 미달분 제외" },
    { label: "실사 착수", value: 41, note: "외부 자문 계약 체결" },
    { label: "약정 체결", value: 17, note: "FY26 상반기 누적" }
  ], { rh: 0.46, zoneW: CW * 0.34, unit: "건" });
  tpl.footer(s, ["※ 깔때기 폭은 첫 단계 대비 비율이며 전환율은 전 단계 대비임. 예시 수치임"], { page: "10 / 10" });
  tpl.checkLayout("10p 분기·깔때기", { cols: [Fn], footLines: 1 });
}

tpl.save(pres, process.argv[2] || "./reference_v1.pptx");   // build.sh가 경로를 넘긴다
