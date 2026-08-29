#!/usr/bin/env bash
# build.sh — 생성부터 검증·산출까지 한 번에. 하나라도 걸리면 산출 폴더로 내보내지 않는다.
#
#   ./build.sh <생성스크립트.js> <산출파일명.pptx> [preflight 추가옵션...]
#   예) ./build.sh report_gen.js FY26_중장기계획.pptx
#
# 생성 스크립트는 산출 경로를 첫 인자로 받아야 한다. 마지막 줄을 이렇게 쓴다.
#   tpl.save(pres, process.argv[2]);
#
# 단계
#   0 pptxgenjs 설치 확인
#   1 생성  — template.js의 save() 관문이 레이아웃 위반을 막는다
#   2 preflight --fix — 파워포인트 구조 검사 20가지
#   3 렌더  — PDF·PNG 변환. 여기서 죽으면 파일이 깨진 것이다
#   4 지면 밖 검사 — PDF 텍스트 최하단이 595.2pt 안에 있는지
#   5 산출  — 위 전부 통과했을 때만 /mnt/user-data/outputs 로 복사
#
# 어느 단계든 실패하면 즉시 종료하고 산출 파일을 만들지 않는다.
# 렌더 이미지는 build_render/ 에 남으므로 눈으로 확인한다. 확인은 생략하지 않는다.

set -euo pipefail

GEN="${1:?생성 스크립트를 지정할 것}"
OUT="${2:?산출 파일명을 지정할 것}"
shift 2 || true
PF_OPTS=("$@")

WORK="$(cd "$(dirname "$GEN")" && pwd)"
BASE="$(basename "$OUT" .pptx)"
TMP="$WORK/${BASE}.pptx"
RENDER="$WORK/build_render"
OUTDIR="/mnt/user-data/outputs"

step() { printf '\n[%s] %s\n' "$1" "$2"; }
die()  { printf '\n실패: %s\n산출 파일을 만들지 않는다.\n' "$1" >&2; exit 1; }

cd "$WORK"

step 0 "pptxgenjs 확인"
if ! node -e "require('pptxgenjs')" 2>/dev/null; then
  echo "  설치 중..."
  npm install pptxgenjs --silent || die "pptxgenjs 설치 실패"
fi
echo "  준비됨"

step 1 "생성 — $GEN"
node "$(basename "$GEN")" "$TMP" || die "생성 단계. 레이아웃 위반이면 좌표를 고친 뒤 다시 돌린다"
[ -f "$TMP" ] || die "생성 스크립트가 파일을 만들지 않았다.
  마지막 줄이 tpl.save(pres, process.argv[2]) 형태인지 확인할 것"

step 2 "preflight 구조 검사"
python3 preflight.py "$TMP" --fix "${PF_OPTS[@]}" || die "preflight. 위 오류를 고친 뒤 다시 돌린다"
rm -f "$TMP.bak"

step 3 "렌더"
rm -rf "$RENDER"; mkdir -p "$RENDER"
python3 /mnt/skills/public/pptx/scripts/office/soffice.py --headless \
  --convert-to pdf --outdir "$RENDER" "$TMP" >/dev/null 2>&1 || die "PDF 변환. 파일이 깨졌다"
[ -f "$RENDER/$BASE.pdf" ] || die "PDF가 만들어지지 않았다"
pdftoppm -jpeg -r 110 "$RENDER/$BASE.pdf" "$RENDER/pg"
PAGES=$(ls "$RENDER"/pg-*.jpg | wc -l)
echo "  $PAGES 페이지 렌더 완료 → $RENDER/"

step 4 "지면 밖 검사"
MAXY=$(pdftotext -bbox "$RENDER/$BASE.pdf" - 2>/dev/null \
       | grep -oP 'yMax="[\d.]+"' | grep -oP '[\d.]+' | sort -rn | head -1)
python3 - "$MAXY" <<'PY' || die "본문이 지면 아래로 넘쳤다"
import sys
y = float(sys.argv[1] or 0)
print(f"  텍스트 최하단 {y:.1f}pt / 한계 593.0pt")
sys.exit(0 if y <= 593.0 else 1)
PY

step 5 "산출"
mkdir -p "$OUTDIR"
cp "$TMP" "$OUTDIR/$OUT"
echo "  $OUTDIR/$OUT"

cat <<EOF

전 단계 통과. 남은 일은 하나다.
  $RENDER/pg-*.jpg 를 전부 눈으로 확인할 것.
  구조 검사가 잡지 못하는 것(문안, 수치 해석, 밀도)은 사람이 본다.
EOF
