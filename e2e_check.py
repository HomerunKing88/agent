#!/usr/bin/env python3
"""e2e_check.py — 잡 한 바퀴 회귀 검사 (생성기 ↔ 검사기 ↔ 오케스트레이터).

`fixtures/`는 pptx 한 장을 audit.py에 물리는 검사다. 이 파일은 그 위의 이음매를 본다.
잡 폴더를 만들고 `orchestrator.py`를 build부터 report까지 돌린 뒤 결과 파일을 확인한다.
Slack 결정 분기는 `slack_bot.run_orchestrator`를 stub으로 불러 본다.
지금까지 나온 통합 버그는 전부 이 경로에서만 보였다.

  manifest valign 기본값        생성기가 pptxgenjs와 다른 값을 적었다
  칩 보조설명 캔버스 이탈         고정 폭이 우측 칼럼에서 판형을 넘었다
  게이트 오배선                  EDITOR 지적이 HOUSE로 떨어졌다
  미등록 숫자 토큰 오탐           더미 문구의 맨숫자가 잡혔다
  역할별 최소 pt 누락            헬퍼 여섯이 규정대로 그렸는데 오탐 22건이 났다

실적 수치를 쓰지 않는다. 원천은 더미(0과 10)로 만들고 임시 폴더에서만 돈다.

  python e2e_check.py            # 통과하면 exit 0
  python e2e_check.py --keep     # 잡 폴더를 지우지 않는다 (실패 조사용)
"""
from __future__ import annotations

import argparse
import json
import importlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import types
import zipfile
from pathlib import Path

import yaml
from openpyxl import Workbook

REPO = Path(__file__).resolve().parent
sys.path.insert(0, str(REPO))
from schemas.decision import validate as validate_decision      # noqa: E402
from schemas.issue import validate as validate_issue            # noqa: E402
from schemas.manifest import validate as validate_manifest      # noqa: E402
from schemas.metadata import validate as validate_metadata      # noqa: E402


class Failed(Exception):
    pass


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f"  — {detail}" if detail and not ok else ""))
    if not ok:
        raise Failed(label)


def orch(job: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(REPO / "orchestrator.py"), str(job), *args],
                          capture_output=True, text=True)


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def make_job(root: Path) -> Path:
    """deck.js가 참조하는 시트·셀을 갖춘 더미 잡 폴더."""
    job = root / "job_e2e_000"
    (job / "source").mkdir(parents=True)
    (job / "builder").mkdir()
    shutil.copy2(REPO / "deck.js", job / "builder" / "deck_v1.js")

    book = Workbook()
    perf = book.active
    perf.title = "실적"
    for row in range(5, 10):
        for col in "CDE":
            perf[f"{col}{row}"] = 0
    peer = book.create_sheet("동종")
    for col in "CDEFG":
        peer[f"{col}12"] = 10
    book.save(job / "source" / "source.xlsx")
    return job


# 모든 그리기 헬퍼를 한 번씩 부르는 덱. deck.js와 fixtures/golden_deck.js가
# 쓰지 않는 헬퍼(statCard, iconBadge, darkCard, stacked100, waterfall, panel)는
# 이것이 없으면 한 번도 그려지지 않는다. 좌표 버그가 있어도 아무도 모른다.
COVERAGE_DECK = r"""
const pptxgen = require("pptxgenjs");
const tpl = require(process.env.TEMPLATE_JS);
// 스타일 규칙은 생성기가 노출하는 자기 스타일 절에서 읽는다 (계획서 2.17)
const R = tpl.SR, MX = tpl.MX, CW = tpl.CW, C = tpl.C;
const pres = tpl.newPres(pptxgen);

const s1 = pres.addSlide();
tpl.header(s1, "헬퍼 커버리지", "COVERAGE");
tpl.banner2(s1, [{ text: "배너 런", options: { fontSize: R.sizes.banner_pt, bold: true, color: C.white } }]);
tpl.sectionChip(s1, MX, 2.10, "① 카드", "(보조설명)");
tpl.panel(s1, MX, 2.55, 4.8, 1.6, "패널 제목");
tpl.statCard(s1, MX + 5.2, 2.55, 2.2, 1.0, "1,234", "스탯 라벨");
tpl.statCard(s1, MX + 7.6, 2.55, 2.2, 1.0, "56.7", "다크 라벨", { dark: true });
tpl.iconBadge(s1, MX + 5.2, 3.75, "①");
tpl.darkCard(s1, MX + 5.8, 3.75, 4.0, 0.6,
  [{ text: "다크카드 본문", options: { fontSize: R.sizes.dark_card_body_pt, bold: true, color: C.white } }]);
tpl.footer(s1, ["※ 커버리지 각주"]);

const s2 = pres.addSlide();
tpl.header(s2, "차트 헬퍼", "COVERAGE");
tpl.stacked100(s2, MX, 4.2, 1.6, ["당사", "A사", "B사"],
  [[50, 30, 20], [40, 40, 20], [30, 30, 40]], [C.navy, C.steel, C.grayLt], [C.white, C.body, C.body]);
tpl.waterfall(s2, MX + 5.4, CW - 5.4, 4.2, 1.6, 50, 10, 20, ["실제", "델타", "가상"], "+10.0%p");
tpl.creamBox(s2, 6.55, 0.55, "시사점 한 문장.");
tpl.footer(s2, ["※ 커버리지 각주"]);

// 저장은 반드시 writeDeck을 탄다. 직접 writeFile을 부르면 도형 ID 재부여를
// 건너뛴다 — 이 커버리지 덱이 실제로 그러고 있었다 (2026-08-30, 관문이 잡았다).
tpl.writeDeck(pres, process.argv[2]).then(() => {
  // 검사기는 manifest의 style로 어느 기준으로 볼지 정한다 (계획서 2.17).
  // 이 덱은 claim이 없지만 manifest는 있어야 한다. 없으면 audit이 스타일을 모른다.
  tpl.writeManifest(process.argv[2].replace(/\.pptx$/, "") + "_manifest.json");
});
"""

# 커버리지 덱에서 눈감아 주는 규칙. **비어 있는 것이 정상이다.**
# 헬퍼가 house-rules 규정대로 그렸는데 audit이 역할을 몰라 오탐 22건을 내던 시기에
# sizes.body_min_pt를 여기 넣어 뒀었다. Codex가 role_min_pt를 붙이면서(27a6d45)
# 오탐이 0이 되어 비웠다. 다시 채워야 한다면 그건 검사기 쪽 격차라는 뜻이다.
COVERAGE_KNOWN_GAP: set[str] = {
    # 커버리지 덱은 헬퍼가 그려지는지만 본다. 숫자는 더미고 claim으로 묶지 않는다.
    # 실제 잡이라면 결함이지만 여기서는 목적이 다르다.
    # 이 덱에 claim을 붙이면 헬퍼 커버리지가 아니라 claim 배선을 시험하는 것이 되고,
    # 그건 [1]~[5]가 이미 하고 있다.
    "claim.unregistered_numeric_token",
}


EDITOR_MAJOR = {"issues": [{
    "id": "E-001", "slide": 1, "type": "STRUCTURE", "severity": "MAJOR", "action": "USER_DECISION",
    "finding": "e2e 회귀용 지적", "evidence": "p1", "proposal": "사용자가 정한다"}]}


def slack_run(job: Path) -> tuple[str, str]:
    """`slack_bot.run_orchestrator`를 불러 결정 완료 경로를 확인한다 (6단계).

    이 경로는 Slack API를 타지 않는다. 디스크 상태만 보고 다음 행동을 정한다.
    그래서 `slack_bolt`가 깔려 있지 않아도 stub으로 부를 수 있다 — 맥에서도 돈다.
    실제 봇 기동은 집 Windows PC 몫이고, 여기서 고정하려는 것은
    "결정이 이미 있으면 버튼을 다시 요구하지 않는다"는 분기 하나다.
    """
    bolt = types.ModuleType("slack_bolt")
    decorator = lambda *_a, **_k: (lambda fn: fn)  # noqa: E731
    bolt.App = lambda *_a, **_k: types.SimpleNamespace(event=decorator, action=decorator)
    adapter = types.ModuleType("slack_bolt.adapter")
    socket = types.ModuleType("slack_bolt.adapter.socket_mode")
    socket.SocketModeHandler = object
    sys.modules.setdefault("slack_bolt", bolt)
    sys.modules.setdefault("slack_bolt.adapter", adapter)
    sys.modules.setdefault("slack_bolt.adapter.socket_mode", socket)
    os.environ.setdefault("SLACK_BOT_TOKEN", "e2e-stub")
    return importlib.import_module("slack_bot").run_orchestrator(job, 1)


# 어떤 검사 규칙도 도달하지 못하는 게이트. QA_REPORT에는 PASS로 찍힌다.
# "검사했고 통과"와 "검사한 적 없음"이 구분되지 않는 자리다 (2.16-7).
# 사용자가 받는 문서라 조용히 늘어나면 안 된다. 아래 목록과 실제가 어긋나면 FAIL.
GATES_NOT_WIRED = {
    # CALC는 2026-08-29에 살아났다. Codex가 계산 불일치를 calc.* 규칙으로 분리했다(e5eb0c9).
    # 이 감시가 "목록이 낡았다"로 잡아서 알았다. 합성 테스트가 아니라 실제로 발동한 첫 사례다.
    "LINT": "lint_deck.js가 계획서 9절 보류 항목이다. 아예 존재하지 않는다",
}


# preflight가 잡는 구조 결함. audit.py 대상이 아니라 expected_results.json에
# 등재되지 않는다(Codex 판단, f0ae9b0). 그러면 아무도 회귀로 안 본다 — 그래서 여기서 본다.
#
# 이 둘이 struct로 안 잡히면 STRUCT 게이트가 스타일 오검만 세고 진짜 구조 결함을
# 놓치고 있다는 뜻이다. 발동한 적 없는 게이트는 작동을 모르는 게이트다 (2.16-7).
STRUCT_FIXTURES = {
    "S04_duplicate_shape_id.pptx": 1,   # 도형 ID 중복 (+ spTree 루트 ID까지 2건 난다)
    "S05_table_col_width.pptx": 1,      # 표 열 너비 합. 이 장표는 스타일 오류도 같이
                                        # 나서 한 파일로 분리를 증명한다
}


def struct_fixtures(rules: dict) -> None:
    """구조 결함 픽스처가 owner=struct로 분류되는지 본다."""
    cfg = rules["preflight"]
    exe = REPO / cfg["source"]
    style_owned = list(cfg["style_owned"])
    for name, least in STRUCT_FIXTURES.items():
        path = REPO / "fixtures" / name
        if not path.is_file():
            check(f"{name} 있음", False, "make_fixtures.py를 돌려라")
        out = subprocess.run([sys.executable, str(exe), str(path)],
                             capture_output=True, text=True).stdout
        errs = [ln for ln in out.splitlines() if ln.startswith("[오류]")]
        struct = [ln for ln in errs if not any(ph in ln for ph in style_owned)]
        check(f"{name} struct {len(struct)}건 (>= {least})", len(struct) >= least,
              f"오류 {len(errs)}건 전부 style로 분류됐다: {errs[:1]}")


# 생성기만 읽고 검사기는 모르는 규칙. 지금 있는 만큼이 기준선이고 **늘면 막는다.**
#
# L1(같은 값이 두 군데)이 열한 번 났다. 가드가 한 방향만 봤기 때문이다 —
# "규칙에 있는데 읽는 코드가 없다"는 잡았지만 "생성기만 알고 검사기는 모르는 규칙"은
# 못 봤다. 검사기가 모르면 생성기가 값을 바꿔도 아무도 어긋남을 못 잡는다.
# 실제로 chip.desc_gap·desc_w가 그 자리에 있었고 칩이 판형을 넘었다.
#
# 값 일치 스캔(오탐 302건)과 최상위 참조 스캔(오탐 52건)은 못 쓴다고 실측으로 확인했다.
# 이쪽은 오탐이 낮다 — 규칙 이름을 양쪽 코드에서 찾을 뿐이다.
# 0으로 만들 수는 없다(지금 123개가 이미 있다). 다만 **새로 늘지는 못하게** 한다.
# 이미 있는 123개는 갚아야 할 빚이다 — 검사기가 하나씩 읽게 하고 기준선을 낮춘다.
#
# 실측으로 확인했다. 검사기가 모르는 규칙을 하나 넣으니 123→124로 잡혔고,
# 되돌리니 통과했다.
ONE_SIDED_BASELINE = 42
# 설계상 한쪽만 읽는 것들. 잎 이름이 코드에 안 나올 뿐 실제로는 검사된다.
#   role_min_pt  검사기 쪽 표다. 생성기는 안 읽는다
#   qa           검사기 전용 임계값
#   sizes        audit이 role_min_pt를 거쳐 간접으로 읽는다 (minimum_font_size)
#   themes·palette  색은 palette_usage·forbidden 쪽에서 묶어 검사한다
ONE_SIDED_SKIP = ("role_min_pt.", "qa.", "sizes.", "themes.", "palette.")

GEN_FILES = ("template.js", "template_shin.js", "deck.js", "deckkit.js")
CHK_FILES = ("audit.py", "render_check.py", "skill/shin-ppt1/scripts/preflight.py")


def one_sided_rules(rules: dict) -> list[str]:
    """생성기만 읽고 검사기는 모르는 스타일 규칙."""
    read = lambda fs: "\n".join((REPO / f).read_text(encoding="utf-8")
                                 for f in fs if (REPO / f).exists())
    gen, chk = read(GEN_FILES), read(CHK_FILES)
    leaves: list[tuple] = []

    def walk(node, path=()):
        if isinstance(node, dict):
            for k, v in node.items():
                walk(v, path + (k,))
        elif not isinstance(node, list):
            leaves.append(path)

    for style in (rules.get("styles") or {}).values():
        walk(style)
    out = set()
    for path in leaves:
        key = ".".join(path)
        if key.startswith(ONE_SIDED_SKIP):
            continue
        leaf = path[-1]
        # **잎 이름만 본다.** 부모까지 인정하면 `table`·`sizes` 같은 흔한 이름 때문에
        # 자식 전부가 "검사기가 안다"로 새 버린다. 시험용 키를 넣어 확인했다 —
        # 부모 완화가 있을 때는 안 잡혔고, 없애니 잡혔다.
        # 짧은 이름은 우연히 걸리므로 네 글자 이상만 센다.
        if len(leaf) < 4:
            continue
        if leaf in gen and leaf not in chk:
            out.add(key)
    return sorted(out)


def lessons_guarded() -> list[str]:
    """LESSONS.md의 각 줄이 실제로 있는 가드를 가리키나. 못 가리키는 줄을 돌려준다.

    **가드 없는 교훈은 반드시 다시 난다.** 2026-08-30 하루에 "값이 두 군데"
    부류만 아홉 번 고쳤다. 매번 커밋 메시지에는 적었는데 목록이 없어 아무도
    다시 읽지 않았다 — 나 자신도.

    가드는 둘 중 하나다.
      스크립트  파일:심볼 또는 파일명. 그 파일이 있고 심볼이 그 안에 있어야 한다
      판단      REVIEWER가 본다. `prompts/REVIEW.md`가 그 말을 담아야 한다
    적어 놓고 실제로 없으면 여기서 걸린다. 문서만 늘어나는 것을 막는다.
    """
    text = (REPO / "LESSONS.md").read_text(encoding="utf-8")
    bad: list[str] = []
    review = (REPO / "prompts" / "REVIEW.md").read_text(encoding="utf-8")
    for line in text.splitlines():
        if not re.match(r"^\| L\d+ ", line):
            continue
        cols = [c.strip() for c in line.strip("|").split("|")]
        if len(cols) < 8:
            continue
        num, guard, kind = cols[0], cols[6], cols[7]
        if kind == "판단":
            # 판단 가드는 REVIEW.md가 실제로 그 얘기를 해야 한다. 렌즈 이름으로 확인한다.
            lens = "DESIGN" if "DESIGN" in guard else ("CONTENT" if "CONTENT" in guard else None)
            if guard.startswith("**없다**"):
                continue                                  # 가드 없음을 명시한 줄은 통과시킨다
            if lens and lens not in review:
                bad.append(f"{num}: REVIEW.md에 {lens} 렌즈가 없다")
            elif not lens and "prompts/REVIEW.md" not in guard and "house-rules" not in guard:
                bad.append(f"{num}: 판단 가드인데 REVIEW.md도 house-rules도 안 가리킨다")
            continue
        # 스크립트 가드 — 백틱 안을 파일과 심볼로 나눈다.
        # 확장자가 있으면 파일, 없으면 심볼이다. 심볼은 같은 칸에 적힌 파일 중
        # 하나에 있으면 된다 (규칙 이름을 파일명으로 읽어 오탐이 났다).
        refs = re.findall(r"`([^`]+)`", guard)
        files, symbols = [], []
        for ref in refs:
            head, _, sym = ref.partition(":")
            head = head.strip()
            if "*" in head or "?" in head:
                continue                                  # glob은 파일이 아니라 패턴이다
            if re.search(r"\.(py|js|yaml|yml|sh|md|json)$", head):
                files.append(head)
                if sym.strip():
                    symbols.append((sym.strip(), head))
            else:
                symbols.append((head, None))
        blobs = {}
        for fname in files:
            path = REPO / fname
            if not path.exists():
                bad.append(f"{num}: {fname}가 없다")
            else:
                blobs[fname] = path.read_text(encoding="utf-8")
        for sym, want in symbols:
            pool = [blobs[want]] if want and want in blobs else list(blobs.values())
            if pool and not any(sym in b for b in pool):
                bad.append(f"{num}: {sym}를 {want or '가드 파일'}에서 못 찾았다")
    return bad


def unwired_gates() -> tuple[list[str], list[str]]:
    """규칙이 도달하지 못하는 게이트와, 목록이 낡은 게이트를 돌려준다.

    `unenforced_drift()`와 같은 모양이다. 한쪽만 보면 목록이 낡아도 모른다.
      dark   도달 규칙이 0인데 목록에 없다   → 게이트가 조용히 죽었다
      lit    목록에 있는데 도달 규칙이 생겼다 → 목록을 지워야 한다
    """
    orchestrator = importlib.import_module("orchestrator")
    emitted = set()
    for name in ("audit.py", "render_check.py"):
        # `Issue(` 와 규칙 이름 사이의 줄바꿈을 허용한다. 이게 없어서 여러 줄에
        # 걸친 호출 다섯 개가 감시견에 안 보였다 — contract.* 둘, render.* 셋.
        # 게이트 배선을 증명하는 장치 자신이 눈이 멀어 있었다 (2026-08-30).
        emitted |= set(re.findall(r'Issue\(\s*"([a-z][a-z_.]+)"', (REPO / name).read_text(encoding="utf-8")))
    # orchestrator가 스스로 붙이는 규칙 (EDITOR 지적, 스키마 위반)
    emitted |= {"editor.MESSAGE", "pipeline.schema_violation"}

    reachable = {orchestrator.gate_of(rule) for rule in emitted}
    dark = [g for g in orchestrator.GATES if g not in reachable and g not in GATES_NOT_WIRED]
    lit = [g for g in GATES_NOT_WIRED if g in reachable]
    return sorted(dark), sorted(lit)


CODE_FILES = ("template.js", "deck.js", "audit.py", "render_check.py",
              "orchestrator.py", "slack_bot.py")


def unenforced_drift(rules: dict) -> tuple[list[str], list[str]]:
    """house-rules의 규칙 중 아무도 안 읽는 것과, 목록이 낡은 것을 돌려준다.

    규칙을 YAML에 적어 두고 검사기를 안 붙이면 "검사되고 있다"고 착각하게 된다.
    실제로 그런 키가 여섯 개 있었다 (2026-08-29 점검).
    의도적으로 강제하지 않는 것은 `unenforced` 절에 사유와 함께 적는다.

    양쪽을 다 본다. 한쪽만 보면 목록이 낡아도 아무도 모른다.
      dead   코드 참조가 0인데 unenforced에 없다  → 규칙이 조용히 죽었다
      stale  unenforced에 있는데 코드가 읽고 있다  → 목록을 지워야 한다
    """
    code = "\n".join((REPO / name).read_text(encoding="utf-8") for name in CODE_FILES)
    code += "\n".join(path.read_text(encoding="utf-8") for path in (REPO / "schemas").glob("*.py"))
    listed = {item["key"] for item in rules.get("unenforced", [])}
    # 스크립트가 아니라 CRITIC이 재는 규칙 (house-rules의 judgment_rules).
    # 코드 참조가 0이어도 죽은 규칙이 아니다 — 재는 주체가 사람(모델)일 뿐이다.
    # 2026-08-30 신설. 그전에는 규칙이 한 종류뿐이라 잴 수 없는 것은 아예 안 적혔고,
    # 안 적힌 것은 아무도 안 봤다. 그 구멍으로 결함 넷이 그대로 나갔다.
    judged = {item["key"] for item in rules.get("judgment_rules", [])}
    listed |= judged

    # YAML 앵커로 한 노드가 여러 경로에 걸린다 (house-rules의 styles가 그렇다).
    # 같은 객체를 두 번 세면 없는 규칙이 죽은 것처럼 보인다. 정체로 걸러낸다.
    seen_nodes: set[int] = set()

    def walk(node, path=()):
        if isinstance(node, dict):
            if id(node) in seen_nodes:
                return
            seen_nodes.add(id(node))
            for key, value in node.items():
                yield from walk(value, path + (key,))
        else:
            yield path

    dead, enforced = [], []
    # unenforced와 judgment_rules는 규칙이 아니라 규칙에 대한 메모다. 세지 않는다
    for path in walk({k: v for k, v in rules.items()
                      if k not in ("unenforced", "judgment_rules")}):
        dotted, leaf = ".".join(path), path[-1]
        parent = path[-2] if len(path) > 1 else None
        read_by_code = leaf in code or (parent is not None and parent in code)
        if not read_by_code and dotted not in listed:
            dead.append(dotted)
        if read_by_code and dotted in listed and dotted not in judged:
            enforced.append(dotted)
    return sorted(set(dead)), sorted(set(enforced))


def run(job: Path, rules: dict) -> None:
    print("\n[1] 정상 잡 — 전 구간이 돌고 게이트가 열린다")
    result = orch(job, "build")
    check("build", result.returncode == 0, result.stderr.strip()[-200:])

    manifest = read(job / "builder" / "manifest.json")
    check("manifest 형식", not validate_manifest(manifest, rules),
          "; ".join(validate_manifest(manifest, rules)[:2]))
    check("claim에 좌표가 있다", all(c["placements"] for c in manifest["claims"]))
    check("버전 세 개가 박혔다",
          all(manifest.get(k) for k in ("schema_version", "house_rule_version", "template_version")))

    metadata = read(job / "run_metadata.json")
    check("run_metadata 형식", not validate_metadata(metadata, rules))

    check("review", orch(job, "review").returncode == 0)
    register = read(job / "review" / "issue_register.json")
    check("issue_register 형식", not validate_issue(register, rules),
          "; ".join(validate_issue(register, rules)[:2]))
    check("audit PASS", register.get("audit_status") == "PASS", str(register.get("audit_error")))
    check("이슈 0건", not register.get("issues"),
          json.dumps(register.get("issues", [])[:2], ensure_ascii=False))

    check("route", orch(job, "route").returncode == 0)
    orch(job, "gates")
    gates = read(job / "review" / "gates.json")
    check("게이트 전부 통과", not gates.get("blocked"), str(gates.get("violations")))

    print("\n[2] EDITOR MAJOR 지적 — ISSUE 게이트가 막는다 (HOUSE가 아니라)")
    (job / "review" / "editor_r1.json").write_text(
        json.dumps(EDITOR_MAJOR, ensure_ascii=False), encoding="utf-8")
    orch(job, "review")
    orch(job, "gates")
    gates = read(job / "review" / "gates.json")
    check("ISSUE가 막힌다", gates.get("blocked") == ["ISSUE"], str(gates.get("blocked")))

    print("\n[3] 사용자 기각 — 게이트가 열린다")
    decision = {"job": job.name, "user": "e2e", "at": "2026-08-29 00:00:00",
                "choice": "REJ", "items": [{"id": "E-001", "action": "REJ", "note": ""}]}
    (job / "review" / "user_decision.json").write_text(
        json.dumps(decision, ensure_ascii=False), encoding="utf-8")
    check("user_decision 형식", not validate_decision(decision, rules))
    orch(job, "gates")
    gates = read(job / "review" / "gates.json")
    check("기각 후 게이트가 열린다", not gates.get("blocked"), str(gates.get("blocked")))

    print("\n[4] Slack 결정 완료 — 버튼을 다시 요구하지 않는다 (6단계)")
    # 결정이 이미 디스크에 있으면 DECISION(버튼)이 아니라 DONE(FINAL)으로 가야 한다.
    # 사용자가 폰에서 버튼을 눌렀는데 봇이 같은 버튼을 또 띄우면 잡이 거기서 멈춘다.
    kind, message = slack_run(job)
    check("run_orchestrator가 DONE", kind == "DONE", f"{kind}: {message}")
    check("결정을 다시 묻지 않는다", kind != "DECISION", message)

    print("\n[5] manifest 변조 — 감사 필드를 뭉개면 ERROR이고 게이트가 막힌다")
    path = job / "builder" / "manifest.json"
    tampered = read(path)
    claim = tampered["claims"][0]
    claim["override"] = {"value": claim["display"]["text"], "reason": "조정", "at": "어제"}
    path.write_text(json.dumps(tampered, ensure_ascii=False), encoding="utf-8")
    check("schemas가 잡는다", bool(validate_manifest(tampered, rules)))
    orch(job, "review")
    register = read(job / "review" / "issue_register.json")
    check("audit이 ERROR를 낸다", register.get("audit_status") == "ERROR",
          str(register.get("audit_status")))
    # 이슈가 0건이어도 ALL PASS가 되면 안 된다 (2.16-7 조용한 PASS 금지).
    # [3]에서 REJ 결정을 이미 써 뒀으므로, 검사 불가가 기각으로 우회되지 않는 것도 같이 본다.
    orch(job, "gates")
    gates = read(job / "review" / "gates.json")
    check("ERROR가 게이트를 막는다 (ISSUE)", "ISSUE" in (gates.get("blocked") or []),
          f"blocked={gates.get('blocked')}")
    check("기각으로 우회되지 않는다", (job / "review" / "user_decision.json").exists()
          and "ISSUE" in (gates.get("blocked") or []))

    print("\n[6] 헬퍼 전수 — 어떤 덱도 안 쓰는 헬퍼까지 그려 본다")
    cov = job.parent / "coverage"
    cov.mkdir(exist_ok=True)
    (cov / "coverage_deck.js").write_text(COVERAGE_DECK, encoding="utf-8")
    env = {**os.environ,
           "NODE_PATH": str(REPO / "node_modules"),
           "TEMPLATE_JS": str(REPO / "template.js"),
           "HOUSE_RULES": str(REPO / "house-rules.yaml")}
    built = subprocess.run(["node", str(cov / "coverage_deck.js"), str(cov / "cov.pptx")],
                           cwd=cov, env=env, capture_output=True, text=True)
    check("커버리지 덱 생성", built.returncode == 0, built.stderr.strip()[-200:])

    unnamed = []
    with zipfile.ZipFile(cov / "cov.pptx") as archive:
        for entry in archive.namelist():
            if not re.match(r"ppt/slides/slide\d+\.xml$", entry):
                continue
            for name in re.findall(r'<p:cNvPr id="(\d+)" name="([^"]*)"', archive.read(entry).decode()):
                shape_id, shape_name = name
                # id=1은 슬라이드 자신이다
                if shape_id != "1" and (not shape_name or shape_name.startswith(
                        ("Object ", "Text ", "Shape ", "Table "))):
                    unnamed.append(f"{entry}:{shape_name or '<빈 이름>'}")
    check("모든 도형에 이름이 있다", not unnamed, ", ".join(unnamed[:3]))

    # 검사기는 manifest의 style로 기준을 고른다 (계획서 2.17). 없으면 스타일을 모른다.
    audited = subprocess.run(
        [sys.executable, str(REPO / "audit.py"), "--json",
         "--manifest", str(cov / "cov_manifest.json"), str(cov / "cov.pptx")],
        capture_output=True, text=True)
    found = json.loads(audited.stdout)["results"][0]
    check("커버리지 덱 검사 수행됨", found["status"] != "ERROR", str(found.get("error")))
    leftover = sorted({i["rule"] for i in found["issues"]} - COVERAGE_KNOWN_GAP)
    check("알려진 격차 외 이슈 없음", not leftover, ", ".join(leftover))
    gap = [i for i in found["issues"] if i["rule"] in COVERAGE_KNOWN_GAP]
    if gap:
        print(f"       (알려진 격차 {len(gap)}건: audit.py가 house-rules의 role_min_pt를 아직 안 읽는다)")

    print("\n[7] 보고서가 나온다 — 경고까지 실려 나가나")
    orch(job, "report")
    check("QA_REPORT.md", (job / "final" / "QA_REPORT.md").exists())
    # 검사기가 낸 경고가 사용자가 받는 문서까지 오나. 게이트 화면에는 나오는데
    # 보고서에 없던 일이 있었다 (2026-09-03). 배관이 끝까지 안 나르면 없는 것과 같다
    reg = read(job / "review" / "issue_register.json")
    body = (job / "final" / "QA_REPORT.md").read_text(encoding="utf-8")
    warn = reg.get("warnings") or []
    check("경고가 보고서에 실린다" if warn else "경고 없음 (실을 것이 없다)",
          not warn or all(str(w.get("rule")) in body for w in warn),
          f"register {len(warn)}건인데 보고서에 없다")
    check("CHANGELOG.md", (job / "final" / "CHANGELOG.md").exists())

    print("\n[8] 규칙이 강제되고 있나 — house-rules의 죽은 키를 센다")
    dead, stale = unenforced_drift(rules)
    check("검사 없는 새 규칙 없음", not dead, ", ".join(dead))
    check("unenforced 목록이 최신", not stale, ", ".join(stale))

    print("\n[9] 게이트가 실제로 검사되나 — 도달 못 하는 게이트를 센다")
    dark, lit = unwired_gates()
    check("규칙이 도달 못 하는 새 게이트 없음", not dark, ", ".join(dark))
    check("GATES_NOT_WIRED 목록이 최신", not lit, ", ".join(lit))
    if GATES_NOT_WIRED:
        print(f"       (QA_REPORT가 PASS로 찍는 미검사 게이트 {len(GATES_NOT_WIRED)}개: "
              f"{', '.join(GATES_NOT_WIRED)} — BUILDER_TO_PIPE.md 8절)")

    print("\n[10] 검사기 자체 테스트가 도나 — fixtures/test_*.py")
    # CODEX가 audit.py에 붙인 단위 테스트다. 아무도 안 돌리면 썩는다 —
    # 오늘 여러 번 확인한 부류다 (발동한 적 없는 게이트는 작동을 모르는 게이트다).
    # 여기서 한 번에 돌린다. 파일이 늘면 자동으로 같이 돈다.
    tests = sorted((REPO / "fixtures").glob("test_*.py"))
    if tests:
        names = [f"fixtures.{t.stem}" for t in tests]
        ran = subprocess.run([sys.executable, "-m", "unittest", *names],
                             capture_output=True, text=True, cwd=REPO)
        check(f"검사기 테스트 {len(names)}개", ran.returncode == 0,
              ran.stderr.strip().splitlines()[-1] if ran.stderr.strip() else "")
    else:
        print("       (없음)")

    print("\n[11] 겪은 오류에 가드가 붙어 있나 — LESSONS.md")
    holes = lessons_guarded()
    check("가드 없는 교훈 없음", not holes, ", ".join(holes[:3]))
    import re as _re
    rows = [l for l in (REPO / "LESSONS.md").read_text(encoding="utf-8").splitlines()
            if _re.match(r"^\| L\d+ ", l)]
    hit = sum(int(l.split("|")[3].strip()) for l in rows if l.split("|")[3].strip().isdigit())
    # 가드를 붙인 뒤에도 또 났나. 이것이 "배우고 있나"의 지표다 —
    # 목록이 길어지는 것은 학습이 아니다. 붙인 가드가 버티는지가 학습이다.
    leaked = []
    for l in rows:
        c = [x.strip() for x in l.strip("|").split("|")]
        if len(c) >= 5 and c[3] and c[4] and c[4] > c[3]:
            leaked.append(f"{c[0]}({c[3]}→{c[4]})")
    print(f"       ({len(rows)}부류 {hit}회. 가드 설치 후 재발 {len(leaked)}부류"
          + (f": {', '.join(leaked)}" if leaked else "") + ")")

    print("\n[12] 검사기가 모르는 규칙이 늘지 않았나 — L1의 반대 방향")
    lonely = one_sided_rules(rules)
    check(f"생성기만 아는 규칙 {len(lonely)}개 (기준선 {ONE_SIDED_BASELINE})",
          len(lonely) <= ONE_SIDED_BASELINE,
          "새로 생긴 것: " + ", ".join(lonely[-3:]) + " — 검사기가 읽게 하거나 기준선을 낮춰라")
    if len(lonely) < ONE_SIDED_BASELINE:
        print(f"       (기준선보다 {ONE_SIDED_BASELINE - len(lonely)}개 줄었다. "
              f"ONE_SIDED_BASELINE을 {len(lonely)}으로 낮춰라)")

    print("\n[13] 구조 결함이 struct로 분류되나 — STRUCT 픽스처 두 장")
    struct_fixtures(rules)

    print("\n[14] 배관이 본체를 넘지 않았나 (계획서 9절 7단계)")
    # 자는 검사기 **전체**다. audit.py 하나만 쓰던 것을 2026-08-30에 바꿨다.
    # STRUCT 게이트를 붙이자 732 = 732로 정확히 맞닿았고, PIPE가 한도를 맞추려고
    # 코드를 압축했다. 한도 때문에 코드를 줄이는 것은 이 규칙이 의도한 방향이 아니다.
    # 배관이 부푼 것이 아니라 실제 판정이 늘었고 자를 대는 쪽이 안 자란 것이었다.
    # audit.py 하나를 자로 쓴 것은 render_check.py가 없던 시점의 선택이다.
    plumbing = len((REPO / "orchestrator.py").read_text(encoding="utf-8").splitlines())
    parts = {name: len((REPO / name).read_text(encoding="utf-8").splitlines())
             for name in ("audit.py", "render_check.py")}
    checker = sum(parts.values())
    check(f"orchestrator({plumbing}) <= 검사기({checker} = "
          f"{' + '.join(str(v) for v in parts.values())})", plumbing <= checker,
          "배관이 검사기 전체보다 크다. 멈추고 프레임워크 도입을 사용자와 상의한다")


def main() -> int:
    parser = argparse.ArgumentParser(description="잡 한 바퀴 회귀 검사")
    parser.add_argument("--keep", action="store_true", help="잡 폴더를 지우지 않는다")
    args = parser.parse_args()

    rules = yaml.safe_load((REPO / "house-rules.yaml").read_text(encoding="utf-8"))
    root = Path(tempfile.mkdtemp(prefix="deck-e2e-"))
    try:
        run(make_job(root), rules)
    except Failed as error:
        print(f"\nE2E FAIL — {error}")
        print(f"잡 폴더: {root}")
        return 1
    finally:
        if args.keep:
            print(f"\n잡 폴더: {root}")
        else:
            shutil.rmtree(root, ignore_errors=True)
    print("\nE2E PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
