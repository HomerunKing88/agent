# 집 Windows PC 셋업 절차서

계획서 4절·9절 5단계를 실제로 밟는 순서다. 위에서부터 차례로 한다.
각 단계 끝에 **확인** 줄이 있다. 그게 나와야 다음으로 넘어간다.

WSL을 쓰지 않는다. `pywin32`로 PowerPoint를 잡을 수 없고 경로가 갈라진다 (계획서 4절).
네이티브 Windows에서 한다.

---

## 0. 시작 전 — 맥북에서 한 번

**리포가 아직 GitHub에 안 올라가 있다.** 이걸 안 하면 집 PC가 오늘 작업을 못 받는다.

맥북에서:

```
git push -u origin claude/step4-shape-naming
```

**확인**: `git log origin/claude/step4-shape-naming --oneline -1` 이 최신 커밋과 같다.

---

## 1. 전제 확인

- [ ] PowerPoint가 설치돼 있다 (Microsoft 365 또는 Office. 뷰어는 안 된다)
- [ ] 맑은 고딕이 있다 (Windows 기본이라 대개 있다)
- [ ] HY헤드라인M이 있다 (한컴오피스가 있으면 대개 함께 깔린다)
- [ ] 구글 드라이브 데스크톱이 깔려 있고 드라이브 문자를 안다 (`G:` 등)

HY헤드라인M이 없어도 진행한다. 제목 계열 넘침 검사만 빠지고
표·본문 검사는 맑은 고딕으로 그대로 된다 (계획서 4.1).

---

## 2. 도구 설치

| 도구 | 최소 버전 | 확인 명령 |
|---|---|---|
| Git for Windows | — | `git --version` |
| Node | 18+ | `node --version` |
| Python | **3.11+** | `python --version` |
| Claude Code | — | `claude --version` |

Python은 3.11 미만이면 `verify_render_windows.py`가 거부한다.
설치할 때 **"Add Python to PATH"를 켠다.**

**확인**: 네 명령이 모두 버전을 뱉는다.

---

## 3. 리포 받기

**동기화 폴더(구글 드라이브·원드라이브) 안에 두지 않는다.** `.git`이 깨진다 (계획서 4절).
`C:\dev\` 같은 로컬 경로에 둔다.

```
mkdir C:\dev
cd C:\dev
git clone https://github.com/HomerunKing88/agent.git
cd agent
git switch claude/step4-shape-naming
```

**확인**: `git log --oneline -1` 이 맥북의 최신 커밋과 같다.

---

## 4. 의존성 설치

```
npm install
pip install -r requirements.txt
```

`requirements.txt`의 `pywin32`는 Windows에서만 깔린다. 맥에서는 건너뛰게 표시해 뒀다.

**확인**:

```
python -c "import win32com.client; print('pywin32 OK')"
python -c "import pptx, openpyxl, yaml, pydantic; print('나머지 OK')"
node -e "require('pptxgenjs'); require('js-yaml'); console.log('node OK')"
```

세 줄 다 나와야 한다.

---

## 5. 픽스처 재생성

**픽스처 pptx는 리포에 없다.** `.gitignore`가 `*.pptx`를 막고 있어서다.
검사 대상이 없으면 다음 단계가 통째로 무의미하다.

```
python fixtures/make_fixtures.py
```

**확인**: `dir fixtures\*.pptx` 에 15개 안팎이 보인다 (`00_golden.pptx` 포함).

---

## 6. 1차 검사 (여기까지는 맥북에서도 되던 것)

```
python audit.py fixtures/
python e2e_check.py
```

**확인**: 각각 `EXPECTED MATCH`, `E2E PASS`.

여기서 틀리면 렌더 검증으로 가지 않는다. 환경이 잘못 깔린 것이다.

---

## 7. 렌더 검증 — 이번 셋업의 목적

여기서만 되는 검사다. 진짜 PowerPoint를 열어 글자가 상자 밖으로 나갔는지 실측한다.

```
python fixtures/verify_render_windows.py
```

돌 때 PowerPoint 창이 잠깐 떴다 사라진다. 정상이다. 건드리지 말고 둔다.

**확인**: 아래 둘이 같이 나와야 한다.

- `00_golden.pptx` → **PASS** (정상 장표는 안 걸린다)
- `05_text_overflow.pptx` → **FAIL** (일부러 넘치게 만든 장표가 잡힌다)

**이 두 줄이 나오면 계획서 9절 5단계 완료다.**

한쪽만 나오면 알려 달라. 둘 다 PASS면 검사가 안 도는 것이고,
둘 다 FAIL이면 기준이 잘못 잡힌 것이다. 어느 쪽인지에 따라 손볼 데가 다르다.

`SKIP`이 나오면 PowerPoint나 pywin32가 없는 것이다. 2·4단계로 돌아간다.

---

## 8. 잡 폴더 (실적 수치가 들어가는 곳)

리포 **밖**에 둔다. 커밋하지 않는다 (계획서 2.15).

```
G:\내 드라이브\deck-qa-jobs\job_YYYYMMDD_NNN\
  source\    source.xlsx  brief.md
  builder\   deck_v1.js  deck_v1.pptx  manifest.json
  review\    audit_r1.json  editor_r1.json  issue_register.json  user_decision.json
  final\     deck_FINAL.pptx  QA_REPORT.md  CHANGELOG.md
```

드라이브 문자가 `G:`가 아니면 환경변수로 알려 준다.

```
setx DECK_JOBS_ROOT "D:\내 드라이브\deck-qa-jobs"
```

**확인**: `orchestrator.py <잡폴더>` 가 폴더를 찾아 상태를 찍는다.

---

## 9. 전원 설정

파이프라인이 도는 동안 PC가 자면 안 된다.
제어판 → 전원 옵션에서 **절전은 "안 함", 디스플레이는 꺼져도 된다.**

계획서 6단계에도 같은 조건이 적혀 있다. 슬랙 봇이 파일을 놓치지 않으려는 것이다.

---

## 10. 슬랙 (여기는 나중에)

5단계가 끝난 뒤에 한다. 사람이 슬랙 웹에서 해야 하는 일이 섞여 있다.

1. 슬랙 앱 생성 — **Socket Mode 켜기**, `files:read` 스코프
2. 토큰 두 개 발급 — 봇 `xoxb-...`, 앱 `xapp-...`
3. `#deck-review` 채널 만들고 봇 초대
4. 환경변수로 넣는다

```
setx SLACK_BOT_TOKEN "xoxb-..."
setx SLACK_APP_TOKEN "xapp-..."
setx SLACK_CHANNEL "#deck-review"
```

5. `python slack_bot.py`
6. 작업 스케줄러에 "로그온 시 실행"으로 등록

**확인**: 폰에서 `#deck-review`에 파일을 올리면 봇이 스레드를 만든다 (계획서 6단계 완료 조건).

---

## 막히면

각 단계의 **확인** 줄이 안 나오면 거기서 멈추고 그 출력을 그대로 알려 달라.
다음 단계로 넘어가면 어디서 틀어졌는지 못 찾는다.

`SKIP`은 실패가 아니라 "조건이 안 갖춰져 검사를 안 했다"는 뜻이다.
`PASS`와 구분해서 봐야 한다 — 안 한 검사를 통과로 읽으면 안 된다.
