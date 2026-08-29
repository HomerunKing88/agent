/**
 * Deterministic one-defect-at-a-time fixture deck generator.
 *
 * Usage: node fixtures/golden_deck.js <output.pptx> [defect_id]
 */
const pptxgen = require("pptxgenjs");
const tpl = require("../template.js");

const DEFECTS = new Set(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14"]);

function addPage(pres, defectId, metric = "1,000") {
  const slide = pres.addSlide();
  const R = tpl.R;

  tpl.header(slide, "검사기 정상 기준 장표", "FIXTURE");
  tpl.banner(slide, "모든 규칙을 지키는 기준 장표", "⇒ 결함은 한 번에 하나만 주입");
  tpl.sectionChip(slide, tpl.MX, 2.10, "① 정적 검사", "[단위: 억원]");

  const headerStyle = {
    ...tpl.tableStyles.hd,
    align: defectId === "03" ? "left" : tpl.R.table.header_align,
  };
  const negative = defectId === "02" ? "△100" : "-100";
  const bodyFont = defectId === "01" ? "Courier New" : tpl.F;
  const rows = [
    ["구분", "FY25", "증감"].map(text => ({ text, options: headerStyle })),
    [
      { text: "영업수익", options: tpl.tableStyles.td },
      { text: metric, options: { ...tpl.tableStyles.td, fontFace: bodyFont } },
      { text: negative, options: tpl.tableStyles.td },
    ],
  ];
  slide.addTable(rows, {
    x: tpl.MX, y: 2.48, w: 5.0,
    colW: [2.0, 1.5, 1.5],
    rowH: [R.table.row_height_min, defectId === "10" ? 0.20 : R.table.row_height_min],
    objectName: "fixture/table",
    border: { pt: 0.5, color: tpl.C.grayLt },
  });

  const longText = defectId === "05"
    ? "아주 좁은 상자에 의도적으로 긴 문장을 넣어 실제 렌더링 시 텍스트 넘침을 유발하는 검사 문구입니다."
    : "정상 범위의 본문 문구";
  slide.addText(longText, {
    x: 6.05, y: 2.48, w: defectId === "05" ? 0.55 : 4.2,
    h: defectId === "05" ? 0.20 : 0.45,
    fontFace: tpl.F, fontSize: R.sizes.body_min_pt,
    color: tpl.C.body, margin: 0,
  });

  // 4단계 claim 픽스처. objectName은 manifest.shape_id와 정확히 일치한다.
  if (defectId === null || defectId === "06" || defectId === "07" || defectId === "09" || defectId === "14") {
    slide.addText(metric, {
      x: 6.05, y: 3.20, w: 1.4, h: 0.35,
      objectName: "CLAIM_REVENUE",
      fontFace: tpl.F, fontSize: R.sizes.body_min_pt,
      color: tpl.C.body, margin: 0, align: "left", valign: "top",
    });
  }
  if (defectId === "09") {
    slide.addText("미등록 지표 777", {
      x: 7.6, y: 3.20, w: 1.8, h: 0.35,
      objectName: "fixture/unregistered_token",
      fontFace: tpl.F, fontSize: R.sizes.body_min_pt,
      color: tpl.C.body, margin: 0,
    });
  }
  if (defectId === "11") {
    slide.addText("본문 하단 이탈", {
      x: tpl.MX, y: R.zones.content_max_y - 0.05, w: 2.0, h: 0.20,
      objectName: "fixture/content_overflow",
      fontFace: tpl.F, fontSize: R.sizes.body_min_pt,
      color: tpl.C.body, margin: 0,
    });
  }
  if (defectId === "12") {
    slide.addText("-100", {
      x: 7.6, y: 3.65, w: 1.0, h: 0.30,
      objectName: "fixture/negative_red",
      fontFace: tpl.F, fontSize: R.sizes.body_min_pt,
      color: R.palette.red, margin: 0,
    });
  }
  if (defectId === "13") {
    slide.addText("너무 작은 본문", {
      x: 7.6, y: 3.65, w: 1.8, h: 0.30,
      objectName: "fixture/body_too_small",
      fontFace: tpl.F, fontSize: R.sizes.body_min_pt - 1,
      color: tpl.C.body, margin: 0,
    });
  }

  if (defectId === "08") {
    slide.addText("전략기획팀 · 2026.08.29", {
      x: 8.6, y: R.components.page_title.y, w: 2.4, h: R.components.page_title.h,
      fontFace: tpl.F, fontSize: R.sizes.body_min_pt, color: tpl.C.gray,
      align: "right", margin: 0,
    });
  }

  const footY = defectId === "04"
    ? R.zones.footnote_bottom_y
    : R.zones.footnote_bottom_y - R.zones.footnote_line_step;
  tpl.footer(slide, ["※ fixture generated data"], footY);
  return slide;
}

async function build(outPath, defectId = null) {
  if (defectId !== null && !DEFECTS.has(defectId)) {
    throw new Error(`unknown defect_id: ${defectId}`);
  }
  const pres = tpl.newPres(pptxgen);
  const metric = defectId === "06" ? "8,421" : defectId === "14" ? "1,100" : "1,000";
  addPage(pres, defectId, metric);
  if (defectId === "07") addPage(pres, defectId, "1,001");
  return pres.writeFile({ fileName: outPath });
}

if (require.main === module) {
  const outPath = process.argv[2];
  const defectId = process.argv[3] || null;
  if (!outPath) {
    console.error("usage: node fixtures/golden_deck.js <output.pptx> [defect_id]");
    process.exit(2);
  }
  build(outPath, defectId).catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { build, addPage, DEFECTS };
