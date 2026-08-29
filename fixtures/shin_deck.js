const pptxgen = require("pptxgenjs");
const tpl = require("../template_shin.js");

async function build(outPath, manifestPath) {
  const pres = tpl.newPres(pptxgen, "report", "soft");
  const slide = tpl.addSlide(pres);
  tpl.header(slide, "shin 스타일 기준 장표");
  tpl.summary(slide, "핵심 수익성은 개선", "FY26E 전망치를 기준으로 작성");
  tpl.sub(slide, tpl.MX, 2.05, "수익성 지표", "FY26E");
  tpl.bullets(slide, [[{ t: "영업이익률은 전년 대비 개선" }], [{ t: "주요 사업의 이익 기여 확대" }]], tpl.MX, 2.55, 4.8);
  tpl.footer(slide, ["※ FY26E는 전망치"]);
  tpl.whitelistToken({ slide: 1, token: "FY26E", reason: "FY26E 연도 표기" });
  await tpl.save(pres, outPath);
  tpl.writeManifest(manifestPath);
}

if (require.main === module) {
  const [outPath, manifestPath] = process.argv.slice(2);
  if (!outPath || !manifestPath) process.exit(2);
  build(outPath, manifestPath).catch(error => { console.error(error.message); process.exit(1); });
}

module.exports = { build };
