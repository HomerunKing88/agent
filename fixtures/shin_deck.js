const pptxgen = require("pptxgenjs");
const tpl = require("../template_shin.js");

async function build(outPath, manifestPath, defect = null) {
  const pres = tpl.newPres(pptxgen, "report", "soft");
  const slide = tpl.addSlide(pres);
  tpl.header(slide, "shin 스타일 기준 장표");
  tpl.summary(slide, "핵심 수익성은 개선", "FY26E 전망치를 기준으로 작성");
  tpl.sub(slide, tpl.MX, 2.05, "수익성 지표", "FY26E");
  tpl.bullets(slide, [[{ t: "영업이익률은 전년 대비 개선" }], [{ t: "주요 사업의 이익 기여 확대" }]], tpl.MX, 2.55, 4.8);
  tpl.footer(slide, ["※ FY26E는 전망치"]);
  tpl.whitelistToken({ slide: 1, token: "FY26E", reason: "FY26E 연도 표기" });
  if (defect === "S01") tpl.whitelistToken({ slide: 1, token: "1,000", reason: "표 결함 픽스처 값" });
  if (defect === "S03") tpl.whitelistToken({ slide: 1, token: "100", reason: "음수 부호 결함 픽스처 값" });
  if (defect === "S01") {
    slide.addTable([
      [{ text: "구분", options: { bold: true, align: "center" } }, { text: "FY26", options: { bold: true, align: "center" } }],
      [{ text: "영업이익", options: { align: "center" } }, { text: "1,000", options: { align: tpl.SR.table.numeric_col_align } }],
    ], { x: tpl.MX, y: 3.20, w: 4.2, colW: [2.1, 2.1], rowH: [0.35, 0.35],
      objectName: "openTable/table", fontFace: tpl.F, fontSize: 10, margin: 0 });
  } else if (defect === "S02") {
    slide.addText("제삼 글꼴 결함", { x: 6.1, y: 3.25, w: 2.2, h: 0.3,
      objectName: "shinThirdFont", fontFace: "Courier New", fontSize: 12, margin: 0 });
  } else if (defect === "S03") {
    slide.addText("△100", { x: 6.1, y: 3.25, w: 1.2, h: 0.3,
      objectName: "shinNegativeTriangle", fontFace: tpl.F, fontSize: 12, margin: 0 });
  }
  await tpl.save(pres, outPath);
  tpl.writeManifest(manifestPath);
}

if (require.main === module) {
  const [outPath, manifestPath, defect] = process.argv.slice(2);
  if (!outPath || !manifestPath) process.exit(2);
  build(outPath, manifestPath, defect).catch(error => { console.error(error.message); process.exit(1); });
}

module.exports = { build };
