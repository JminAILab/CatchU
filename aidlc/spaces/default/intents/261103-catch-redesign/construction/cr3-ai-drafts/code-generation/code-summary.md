# CR3 AI 쪽 — 코드 요약

계획 `code-generation-plan.md`의 Step 1~20을 모두 마쳤다. 구현은 개발자 에이전트가 했고, 오케스트레이터가 Unit 시험을 다시 돌려 확인했다(아래 「검증」).

- Step 17(FR10 확인): 팀장이 자기 터미널에서 돌리고 표시했다. 기준을 넘었다(아래 「FR10 확인」).
- Step 18(고지 v3): FR10을 넘어서 했다(아래 「고지 v3」). 문구는 CR3 PR에서 팀장이 승인한다.
- Step 19·20: 검토 뒤 수정과, Step 17 첫 실행에서 드러난 수정이다.

## 바꾼 파일

앱 소스(worker):
- **새로 만듦:**
  - `worker/app/judgement/` 패키지
    - `provider.py`: 판정 규약과 실패 코드 셋
    - `questions.py`: Catch 판정·재료 판정 요청 조립
    - `answers.py`: 답 읽기·검사
    - `factcheck.py`: 기계 대조
    - `synthetic.py`·`claude.py`·`openai_judge.py`: 판정 어댑터
  - `worker/app/generation/judged.py`: 판정 답 적용
  - `worker/app/processing/confirm.py`·`collection_file.py`: FR10 확인 명령과 수집 결과 파일
- **고침:**
  - `worker/app/generation/flow.py`·`request.py`·`response.py`·`claude.py`·`limits.py`·`outcome.py`·`provider.py`
  - `worker/app/consumer/settings.py`·`child.py`·`service.py`, `worker/app/processing/live.py`
- **의존성:** `worker/pyproject.toml`·`worker/uv.lock`. `openai==3.46.0` 하나를 더했다.

앱 소스(web): `web/src/features/assets/assets-view.tsx`, `web/src/features/recipient/recipient-screen.tsx`

문서·예시:
- **새로 만듦:** `worker/docs/generation-judgement.md`(22,071 B)
- **고침:**
  - `worker/docs/generation.md`(34,879 B)·`generation-limits.md`·`generation-provider.md`·`queue-consumer.md`
  - `worker/README.md`, `worker/.env.example`
  - `deploy/env/worker.env.example`: 이름만 적고 주석 처리했다
  - `web/src/features/assets/README.md`·`docs/detail-screen.md`, `web/src/features/recipient/README.md`

계약 파일과 결과 판본은 그대로다(계약 C5). api·web의 고지와 첫 이용 고지 판본은 Step 18에서 바꿨다(아래 「고지 v3」). 전체 목록은 `source-manifest.json`에 있다.

## 주요 구현 결정

- **OpenAI 판정**
  - 호출: OpenAI Decisions API(`client.decisions.create(model="gpt-6-luna", input, questions)`)로 부른다. 질문 1~400개를 predicate·choice·score로 묻는 API라 설계의 질문 모양과 맞는다.
  - 접속 주소: `data_residency="us"`로 `https://us.api.openai.com/v1`에 고정했다.
  - 다시 시도: 하지 않는다(`max_retries=0`).
  - HTTP 전송: Claude 어댑터와 같은 보호를 쓴다.
    - 프록시 환경변수를 무시한다.
    - 주소 바꿈을 따라가지 않는다.
    - 응답은 256 KiB까지만 받고, 압축 응답은 거부한다.
    - 호출 전체에 마감을 둔다.
  - 키: 생성자 인자로만 넘긴다. `OPENAI_API_KEY`는 읽지 않는다.
  - SDK가 환경에서 읽는 다른 값
    - `OPENAI_CUSTOM_HEADERS`가 있으면 어댑터를 만들지 않는다.
    - `OPENAI_ORG_ID`·`OPENAI_PROJECT_ID`·`OPENAI_ADMIN_KEY`는 만든 뒤 지운다.
    - `openai` 로거에는 INFO 아래 기록을 버리는 필터를 단다.
- **두 공급자, 같은 질문(S2):** 판정 답은 공급자와 관계없이 `[질문 id, 값]` 꼴로 모아 한 곳(`answers.read`)에서 검사한다. Claude 판정은 생성 제공자에 새로 둔 공용 호출(`ClaudeProvider.structured`)을 다시 써서, 생성과 같은 보호를 받는다.
- **기계 대조(`factcheck.py`)**
  - 표준 라이브러리만 쓴다. 12월 `api/src/ai-generation/fact-check.ts`의 낱말 나누기를 다시 짰다.
  - 줄 글은 점·빗금으로 더 나눠 본다(`this.x`에서 `x`를 찾는다).
  - 경로는 뒤에서부터 이은 부분 경로까지 낱말로 본다(`src/a.py`의 `a.py`).
- **흐름**
  - 후보마다 재료 판정 → 생성 → Catch 판정 순서로 한다.
  - 생성은 「남은 시간 ≥ 생성 45초 + 판정 20초」일 때만 시작한다. 재료 판정은 「≥ 20 + 45 + 20초」일 때만 시작한다.
  - 판정 답 적용은 `app/generation/judged.py`에, 재료 묶음을 판정 답으로 다시 짜는 일은 `request.judged_groups`에 둔다.
- **회원 문구:** 판정이 실패하면 「설명 확인 중 오류가 나 설명 초안을 만들지 못했다」 꼴로 쓴다. 회원에게 낯선 낱말 「판정」은 쓰지 않는다.
- **FR10 확인 명령:** `python -m app.processing.confirm`
  - 수집 결과 파일: 형식 정보만 보고 다시 읽는 JSON(`collection_file.py`)이다. 실행 코드 형식(pickle 등)은 쓰지 않는다.
  - 출력 경로: 저장소 작업 폴더 안이면 바로가기를 거쳐도 거부한다.
  - 토큰 이름: `CATCHU_FR10_GITHUB_TOKEN`. 키·토큰은 읽은 뒤 명령의 환경에서 지운다.
  - 같은 명령이 비공개 `JminAILab/CatchU`도 직접 모은다(계획 Step 14).
  - 확인표 머리: 분석 전체 시간과 가장 긴 재료 판정 시간을 적는다(성능 설계 「20초 안에 드는지」).

## 계획과 다른 점

1. **OpenAI SDK에 없는 인자 셋(NFR1.5의 대안 경로)**
   - 없는 것: Decisions 요청에는 요청마다 응답 저장을 끄는 인자(`store`), 출력 토큰 상한 인자, 요청 단위 지역 인자가 없다.
   - 대신 한 것:
     - 저장 끔은 보내지 않는다.
     - 처리 위치는 클라이언트의 `data_residency`로 미국에 고정했다.
     - 출력 크기는 질문 수 상한(400)과 응답 본문 상한(256 KiB)으로 묶는다.
   - 팀장이 확인할 것(`generation-judgement.md`에 적음):
     - 공식 안내의 기본 보관 기간
     - 미국 지역 엔드포인트가 팀장 키의 프로젝트와 `gpt-6-luna`를 받는지
   - 시험: 「요청에 저장 끔 설정이 있다」는 어댑터 시험은 둘 수 없었다. 대신 요청 본문이 `model`·`input`·`questions`뿐이라는 시험을 두었다.
2. **계획 목록 밖에서 고친 파일**
   - `worker/app/consumer/service.py`: 기동 로그에 `judgementProvider=`·`aiSide=`를 더했다(보안 설계).
   - `worker/app/generation/provider.py`: `ProviderRequest`에 `ai_side` 칸을 더했다.
   - `web/src/features/assets/docs/detail-screen.md`: 설명 칸 규칙을 같이 적은 문서라 함께 고쳤다(project.md 규칙).
   - 새 파일 `judged.py`·`collection_file.py`.
3. **BR2.5 해석:** 기록의 글 질문 가운데 하나만 답이 빠져도 「판정 없음」으로 본다. 물은 RECORD_WHOLE 답만 빠진 경우도 그렇다. 그래서 제목과 작업 사실 둘째 줄이 늘 같은 판단을 쓴다.
4. **S28(생성 뒤 판정 시간 부족)**
   - 생성을 시작할 때 판정 몫 20초까지 확인하므로, 생성 뒤 로컬 처리에 시간이 걸린 경우에만 생긴다.
   - 시험은 읽을 때마다 1초씩 가는 시계로 그 경우를 흉내 냈다.
   - 판정 호출 상한에 닿은 경우는 따로 시험한다.
5. **기존 시험 세 곳**
   - `test_generation_title.py`: `run_generation`의 인자 목록을 고정한 시험에 `judge`·`observe`를 더했다. 둘 다 GitHub 연결이 아니라는 시험 취지는 그대로다.
   - `test_generation_rewrite_coverage.py`: 로그를 읽는 도우미가 새 칸(`aiSide`·`judgementProvider`와 AI 쪽 `*Reasons`)을 건너뛰게 했다.
   - `web/test/assets-view.test.mjs`: NOT_GENERATED일 때 「생성된 설명 초안이 없습니다.」를 기대하던 시험을 BR7.1(설명 칸 숨김)에 맞췄다.
6. **받은 사람 화면 S10·S11:** 화면 원문을 읽어 단언한다. CR1의 S13 시험과 같은 이유다(컴포넌트가 store·라우팅을 함께 불러와 시험에서 그리지 못한다).
7. **절차 위반 한 번:** 셸 heredoc으로 빈 내용을 파일 끝에 붙이는 명령을 한 번 실행했다. 파일 내용은 바뀌지 않았다.

## 시험

새 시험:
- `worker/tests/test_judgement_factcheck.py`: S4. PR 번호·숫자·예외 낱말·한글, 부분 경로·점 나누기.
- `worker/tests/test_judgement.py`
  - S8·S17·S29·S31: 요청 조립과 답 읽기. 정해진 칸 밖 자료와 가린 줄이 없는지 본다.
  - 어댑터: 요청 모양, 주소 고정, 다시 시도 0, 실패 코드 셋, 환경값 무시.
- `worker/tests/test_judgement_confirmation.py`: S25. 저장소 안 경로 거부(바로가기 포함), 수집 결과 파일 왕복, 키·토큰 비보관.

고친 시험:
- `test_generation_flow.py`: S5~S7·S9~S11·S19·S20·S26~S28. 판정 호출 1번, AI 쪽이 꺼지면 판정 0번, 마감 직전 판정 없음, 로그에 원문 없음.
- `test_generation_title.py`·`test_generation_groups.py`·`test_generation_material.py`·`test_generation_claude.py`: S3·S13~S16·S18·S30, 생성 요청에 기록의 글 없음.
- `test_consumer_settings.py`: S1·S2. 잘못된 공급자 값이면 기동하지 않고, 키는 환경에 남지 않는다.
- `test_consumer_processor.py`: 자식 프로세스 로그의 건수, 원문 없음.
- `web/test/assets-view.test.mjs`·`web/test/recipient.test.mjs`: S10·S11. NOT_GENERATED면 설명 칸이 없고, FAILED면 실패 안내를 보인다.

## 검증

오케스트레이터가 다시 돌린 결과(2026-11-06):
- worker Unit 시험 명령(10개 파일): **651 passed**. `--cov=app/judgement`로 판정 패키지 **줄 100%**(549문 중 미포함 0).
- web Unit 시험 명령(2개 파일): **61 pass / 0 fail**.

개발자 에이전트가 돌린 intent 검증 명령: **종료 코드 0.**

| 서비스 | 검사 | 시험 | 줄 커버리지 |
|---|---|---|---|
| api | lint·typecheck 통과 | 1,778개 중 pass 1,742 / fail 0 / skipped 36 (시험 DB `catchu-db-test` 127.0.0.1:5433) | 98.38% |
| web | lint·typecheck 통과 | 905 pass / 0 fail | 95.45% |
| worker | ruff·mypy(132 files)·ruff format 통과 | 2,526 passed, 12 skipped | 96% |

그 밖의 검사:
- 의존성 취약점 검사(`uv audit --frozen --preview-features audit-command`): 54개 패키지에 알려진 취약점 없음.
- 문서 크기 검사(`.github/scripts/check-doc-sizes.sh`): 통과.
- AI 쪽이 꺼진 경로: 기존 시험 결과가 그대로다(위 5의 세 곳만 고쳤다).

Step 1~20을 모두 마친 뒤 마지막으로 다시 돌린 Unit 시험(개발자 에이전트, 2026-11-06):

| 명령 | 결과 |
|---|---|
| worker pytest(Unit 명령 10개 파일 + `test_collection_controls.py`) | 723 passed |
| web `node --test`(`assets-view`·`recipient`·`u2-consent`) | 71 pass / 0 fail |
| api 고지·접수·동의 8개 파일(`unit-test-instructions.md` Step 18 명령) | 147 pass / 0 fail / 1 skipped |

api의 건너뜀 1건은 시험 안의 사유다. U6 실제 표가 있어 그 경우를 만들 수 없다.

## 코드 검토 뒤 고친 것 (팀장 결정, 2026-11-06)

검토 1회차(READY, Minor 4)의 지적을 계획 Step 19로 처리했다. 확인 관문은 이 수정과 Step 17·18을 마친 뒤 다시 연다(팀장 결정).

- **R-01 `worker/docs/candidate-text.md`:** 「제목」 문단 끝에 한 문장을 더했다. 이 순서는 AI 쪽이 꺼진 경로 기준이고, 켜지면 기록의 글도 판정 결과에 따라 제목이 되거나 떨어진다. `generation-judgement.md#적용` 링크를 붙였다(13,825 B).
- **R-02 확인표·수집 결과 파일 권한:**
  - 두 파일 모두 공용 도우미 `collection_file.write_private`로 쓴다. 이미 있는 파일은 지우고, `os.open(…, O_WRONLY | O_CREAT | O_EXCL, 0o600)`로 만드는 순간부터 본인만 읽게 만든다. 만든 뒤 권한을 바꾸는 호출(`chmod`)은 지웠다.
  - 지운 뒤 다른 누가 같은 이름을 먼저 만들면 덮어쓰지 않고 실패한다(`O_EXCL`).
  - `os.fchmod`로 권한을 좁힌 뒤 쓰는 방식은 쓰지 않았다. worker의 Python 3.12는 Windows에 `os.fchmod`가 없다.
  - 시험(`test_judgement_confirmation.py`, 30개)
    - 두 파일이 정확히 `0o600`인지 본다.
    - `os.open`이 0o600으로 불리고 `chmod`가 불리지 않는지 본다.
    - 0o644로 미리 있던 파일이 0o600 새 파일로 바뀌는지 본다.
- **R-03 `OPENAI_CUSTOM_HEADERS`:** 기동 검사는 더하지 않았다. `worker/docs/generation-judgement.md` 「켜고 끄기」에 한 줄만 적었다. 기동 때는 막지 않고, 후보가 있는 첫 요청에서 판정 공급자를 만들 때 결함으로 처리된다(22,299 B).
- **R-04 `worker/aidlc/`:** 커밋에서 뺀다. 코드 변경은 없다.

고친 뒤 다시 돌린 것:
- worker Unit 시험 명령(10개 파일): **653 passed**.
- web Unit 시험 명령(2개 파일): **61 pass / 0 fail**.
- `ruff check`·`ruff format --check`(148 files)·`mypy`(132 files) 통과, 문서 크기 검사 통과.

## 비기능 설계 재검토 뒤 고친 것 (팀장 결정, 2026-11-07)

확인 관문 전 재검토(비기능 설계, READY·Minor 4)의 지적을 문서와 추적표만 고쳐 처리했다. 코드는 바꾸지 않았다.

- `nfr-design/performance-design.md` 「판정 출력 상한」: OpenAI Decisions에는 출력 토큰 상한 인자가 없다. 그래서 질문 400개와 응답 본문 256 KiB로 묶는다고 적었다.
- `nfr-design/security-design.md` 「공급자 호출」 OpenAI 행: 저장 끔 인자가 없을 때의 길을 적었다. 기본 보관(남용 감시 기록 최대 30일)을 고지 v3와 문서에 적고, 팀장이 PR에서 승인한다. 처리 위치는 `data_residency="us"`다.
- `nfr-design/security-design.md` 「FR10 확인 명령」:
  - 비공개 수집은 확인 명령의 `allow_private_repository`만 켠다. 운영 `live.py`는 넘기지 않는다.
  - 파일은 처음부터 0o600으로 만든다.
  - 한계: 출력 폴더가 기본 권한이라 같은 기기의 다른 계정이 파일 이름을 볼 수 있다(내용은 막힘).
- `nfr-design/traceability.json`: NFR1.5·NFR1.6 행을 위 내용에 맞췄다.

## FR10 확인 명령의 비공개 저장소 수집 (Step 20, 팀장 결정 2026-11-06)

- **원인:** Step 17 첫 실행에서 `JminAILab/CatchU`가 Catch 0개였다. 수집 결과의 실패 코드는 `REPOSITORY_UNREACHABLE`, 호출은 1번이었다. 수집의 공개 저장소 검사(`worker/app/collection/collectors.py` `verify_repository`)에 걸렸다. 토큰 권한 문제가 아니다.
- **고침:**
  - 인자: `allow_private_repository: bool = False`. 주변의 `allow_empty_repository`와 같은 꼴이다.
  - 넘어가는 길: `collect` → `_collect_with` → `_run` → `verify_repository`.
  - 멈추는 조건: `if not public and not allow_private_repository:`일 때만 `REPOSITORY_UNREACHABLE`로 멈춘다.
  - 그대로인 확인: 허용해도 저장소 ID, 같은 이름, 크기 상한, `private` 칸 모양 확인은 그대로다.
- **켜는 곳:** `worker/app/processing/confirm.py` `collect_live` 하나다. 운영 LIVE 처리(`worker/app/processing/live.py`)는 넘기지 않는다(주석 한 줄). app 안에서 `collect`를 부르는 곳은 이 둘뿐이다.
- **시험:**
  - `worker/tests/test_collection_controls.py`(+7)
    - 기본값이면 비공개에서 멈춘다. 허용하면 끝까지 모은다.
    - 허용해도 다른 이름·`private` 칸 빠짐·모양 틀림·크기 상한·저장소 ID 불일치면 멈춘다.
    - 운영 경로 시험: `app.processing.live.collect`를 실제 함수를 감싼 기록기로 바꾸고, 운영 `LiveGenerator`로 비공개 저장소를 처리한다. 인자가 넘어가지 않았는지, 결과가 `REPOSITORY_UNREACHABLE`인지 함께 본다.
  - `worker/tests/test_judgement_confirmation.py`(+2): `collect_live`와 명령 하나가 비공개 저장소를 모아 확인표를 쓴다.
- **문서:** 「FR10 확인 명령만 예외」를 아래 세 곳에 적었다.
  - `worker/docs/github-collection.md`(10,193 B)
  - `docs/CatchU_collection_control_scope.md` 182행 뒤 한 문장(32,664 B)
  - `worker/docs/generation-judgement.md`(22,996 B)
  - 12월 intent의 `api/docs/repository-analysis-u7.md`는 api 등록·접수 규칙이라 고치지 않았다.
- **다시 돌린 것:**
  - worker Unit 시험 명령: **655 passed**
  - web: **61 pass / 0 fail**
  - `test_collection_controls.py`: **68 passed**
  - ruff·ruff format(148 files)·mypy(132 files)·문서 크기 검사 통과
  - 참고로 worker 전체: 2,537 passed, 12 skipped(개발자 에이전트 측정)

## FR10 확인 (Step 17, 2026-11-06)

판정: **기준을 넘었다.** 틀린 제목 통과 0건(기준 0건), 틀린 문장 통과 0건(기준 1건 이하). **결정(팀장): AI 쪽을 켠다.** 운영 서버에는 고지 v3가 배포된 뒤에만 판정 키를 넣는다. Step 18(고지 v3)을 진행한다.

확인 방법:
- 팀장이 자기 터미널에서 FR10 확인 명령을 돌렸다. 키·토큰은 그 터미널 환경변수로만 넣었다.
- 팀장이 세 확인표의 `marks`를 모두 채웠다.
- 아래 건수는 오케스트레이터가 확인표의 `marks` 칸과 구조 칸(출처·남긴 문장 id·기계 대조 통과·재료 판정 여부)만 세어 다시 맞췄다. 원문은 읽지 않았다.
- 확인표·수집 결과 원문은 `~/catchu-local-live/cr3-fr10/`(저장소 밖)에만 있다.

| 항목 | 값 |
|---|---|
| Catch | 20개(CatchU 6·TheMe 7·algo-problem 7) |
| 판정 공급자 | openai |
| 판정 실패 | 0 |
| 재료 판정 | 7번(CatchU 3·TheMe 3·algo-problem 1), 가장 긴 것 2.4초(20초 시간 제한 안) |
| 지시문 조정 | 0번 |
| 문턱 | 0.9 그대로 |
| 화면에 나간 제목 | 19개 모두 맞음. 출처는 기록의 글 12·전체 미달 기록의 글 3·조각 제목 3·AI 1이다. 제목 없음 1개는 표시 대상이 아니다 |
| 판정이 고른 AI 제목 | 3개 모두 맞음(화면에 나간 것 1개) |
| 설명 문장 | 54개. 화면에 남은 것 31개는 모두 맞음. 맞는데 버린 것 23개(그중 기계 대조에서 버린 것 19개). 틀린 문장 0개 |
| 분석 시간 | TheMe 34.8초, algo-problem 28.8초(첫 실행, 팀장 측정) |

CatchU 첫 실행은 Catch 0개였다(공개 저장소 검사). Step 20으로 고친 뒤 다시 돌린 결과가 위 값이다.

### 함께 본 것: CatchU 다섯째 Catch(보고만, 고칠지는 팀장이 정한다)

증상: 재료 판정을 했는데 AI 제목 후보·문장이 0개였다. 그래서 설명은 NOT_GENERATED이고 설명 칸이 숨겨졌다. 제목은 기록의 글이다.

확인한 것(구조 칸과 수집 결과로 다시 계산한 줄·파일 수만 봤다):
- **재료:**
  - 바뀐 파일은 `.md` 3개, 바뀐 줄은 1,166줄이다. 가린 줄은 없다.
  - 큰 후보라서 재료 판정을 했다. 판정이 없었다면 CR1 규칙 순서로 125줄을 보냈을 것이다.
- **생성 호출은 했고 응답도 읽혔다:**
  - 판정 답에 기록의 글 질문(`RECORD_WHAT`)만 있다.
  - Catch 판정은 생성 응답이 읽혔을 때만 부른다(`flow._generate_one_ai`).
  - 재료 판정이 세 파일을 모두 `GENERATED`로 답했다면 보낼 줄이 0줄이라 생성도 판정도 부르지 않는다. 따라서 적어도 한 파일은 생성 재료로 남았다.
- **응답이 0개가 된 원인 후보:**
  - ① 모델이 제목 후보·문장 목록을 빈 채로 돌려줬다.
  - ② 받은 항목을 응답 검사가 모두 버렸다. 버리는 경우는 셋이다.
    - 근거 줄 id가 보낸 자료에 없음(`UNKNOWN_LINE`)
    - 항목 모양이 틀림(`ITEM_SHAPE`)
    - 제목이 40자를 넘음(`TOO_LONG`)
  - 확인표에는 재료 판정 답도, 버린 원인도 남지 않아 둘을 가를 수 없다.
- **가를 수 있는 길:**
  - 그 실행의 터미널 운영 로그 「생성 종료」 줄의 `aiDropReasons=`와 `materialJudgementReasons=` 건수를 본다(요청 하나 6개 Catch의 합계).
  - 또는 확인표에 재료 판정 답과 버린 원인 건수를 남긴다(팀장이 정할 일).

### 후속 의견(이번 CR3에서는 고치지 않고 기록만 한다, 팀장)

- **기계 대조가 맞는 글을 많이 버린다.**
  - 이번 20개에서 맞는 문장 19개를 버렸다. 버린 경우는 파일 이름에만 있는 낱말이나 근거 줄을 잘못 짚은 것이다.
  - 틀린 문장은 하나도 잡지 못했다. 표본에 틀린 문장이 없었다.
  - 판정이 남긴 문장 31개는 모두 0.9 이상이고 모두 맞았다.
  - 다음 작업으로 기계 대조를 빼거나 약하게 하는 것을 검토한다. 그 전에 틀린 문장을 일부러 섞어 판정만으로 걸러지는지 확인한다. 후속 이슈: [#485](https://github.com/JminAILab/CatchU/issues/485).
- **기록의 글과 AI 글:** 사람이 이해하기에는 기록의 글보다 AI 제목·설명이 낫다. 기록의 글이 「왜」에 가까우면 제목보다 개인 설명 쪽이 맞다.
- **판정과 팀장 판단이 갈린 곳:**
  - 쓸 만한 기록의 글을 부실로 버린 것 1건
  - 전체 미달이 아니라고 본 것 1건
- **묶는 규칙:** 알고리즘 저장소에서 서로 상관없는 풀이 15개가 한 Catch로 묶였다.

## 고지 v3 (Step 18, 2026-11-06)

FR10을 넘어서 했다. **문구는 CR3 PR에서 팀장이 승인한다.**

- **실제 자료용 고지:** `api/src/analysis-intake/analysis-notice.ts`의 `REAL_NOTICE`를 `catchu-real-analysis-notice-v3`로 바꿨다. 합성 고지는 그대로다.
  - 바꾼 곳은 2·3·4절이다(BR8.2). 1·5절과 빈 줄 6개는 v2 그대로다.
  - 2절: 설명 초안·제목 후보는 AI가 바뀐 줄만 보고 쓰고, 다른 AI 서비스가 그 글과 본인 기록의 글이 맞는지 확인해 맞다고 본 것만 남긴다. 남은 문장이 없으면 설명 초안 없이 Catch를 만든다.
  - 3절 받는 곳: Anthropic, PBC(미국)와 OpenAI OpCo, LLC(미국).
  - 3절 OpenAI에 보내는 것: Anthropic에 보낸 줄과 파일, 본인 PR 제목이나 커밋 메시지 첫 줄 하나, AI가 쓴 후보와 문장. 큰 작업은 파일마다 경로·상태·바뀐 줄 수와 앞 5줄도 보낸다.
  - 3절의 다른 줄
    - 판정을 Anthropic에 맡기는 설정일 때를 따로 적었다.
    - 가릴 값이 있는 기록의 글은 보내지 않는다.
    - OpenAI 처리 위치와 보관, 연락처 `privacy@openai.com`을 적었다.
  - 4절: Catch의 제목과 작업 사실에 본인 PR 제목이나 커밋 메시지 첫 줄이 그대로 들어갈 수 있다.
  - 고지 SHA 시험(`api/test/db/analysis-notice.test.cjs`): `2fcc3d9a…`, 30줄 → 35줄.
- **첫 이용 고지 판본(BR8.3):** `AI_NOTICE_VERSION`을 `2026-11-v1`에서 `2026-11-v2`로 올렸다. api `ai-consent.gate.ts`와 web `ai-consent-notice.ts`가 같은 값이다. 받는 곳에 `OpenAI API(OpenAI)`를 더했다.
- **OpenAI 사실과 출처(2026-11-06 확인, PR에서 팀장이 대조):**
  - 회사 이름 `OpenAI OpCo, LLC`, 미국 주소: <https://cdn.openai.com/osa/openai-services-agreement.pdf>, <https://cdn.openai.com/pdf/openai-data-processing-addendum.pdf>
  - 연락처 `privacy@openai.com`: 위 DPA의 Data importer 칸
  - API 자료를 학습에 쓰지 않음. 남용 감시 기록에 최대 30일 보관하고, 법이나 해를 막는 데 필요하면 더 길다. 미국 지역 주소 `us.api.openai.com`에서 지역 처리한다: <https://developers.openai.com/api/docs/guides/your-data>
  - Decisions에 요청마다 보관을 끄는 설정이 없음: 위 페이지와 설치된 SDK `openai==3.46.0`
  - 「학습에 쓰지 않음」은 팀이 데이터 공유를 따로 켜지 않았다는 전제다.
- **확인 못 해 고지에 넣지 않은 것:**
  - 남용 감시 기록이 저장되는 위치. 그래서 OpenAI 쪽은 「미국에서 처리」까지만 적었다.
  - Decisions 프롬프트 캐시가 GPU 안에 최대 24시간 남는다는 공식 안내의 예외. 넣을지는 팀장이 정한다.
- **함께 고친 파일**
  - 고지 문서: `api/docs/analysis-intake.md`(새 절 「고지 v3 — Catch 개편 CR3」, 31,721 B), `api/docs/repository-analysis-u7.md`(v2 적용 문장 하나), `web/src/components/ai-consent/README.md`, `web/src/features/analysis-request/README.md`(현재 판본)
  - worker 문서: `worker/docs/generation-judgement.md`(배포 안내 줄에 v3·`2026-11-v2`, 「한계」의 보관 줄), `worker/docs/generation-provider.md`(「남은 확인」의 OpenAI 행)
  - 시험: `api/test/db/analysis-intake-real.test.cjs`
    - 「새 판본 배포」를 흉내 내던 고정 값 `…-v3`가 이제 현재 판본과 같아졌다.
    - 그래서 `REAL_NOTICE.noticeRevision + '-next'`로 바꿨다.
  - 시험: `web/test/u2-consent.test.mjs`(받는 곳 셋 단언)
  - 주석만: `web/src/components/ai-consent/ai-consent-dialog.tsx`
  - `api/docs/daily-run-limit.md`는 판본 값을 적지 않아 확인만 했다.
- **고치지 않은 곳(보고만)**
  - 입력·결정 기록: `docs/ai-dlc-input-catch/CatchU_Catch_개편_입력.md`, `docs/CatchU_11월_범위_결정.md`
  - 코드 지식 저장소: `aidlc/spaces/default/codekb/CatchU/*`. 다음 역분석 때 갱신된다.
  - 12월 intent의 승인 기록: U2 「받는 곳 둘」 등
  - 옛 판본 값을 쓰는 합성 시험 값: 동작에 영향이 없다.
- **팀장이 볼 것**
  - 첫 이용 고지 한 줄(`AI_NOTICE_LINE`)이 받는 곳 셋을 모두 적는다. 그래서 OpenAI를 쓰지 않는 JD 요약·질의응답 화면에도 OpenAI가 나온다. 지금 Voyage가 나오는 방식과 같다.
  - 저장소 분석은 이 첫 이용 동의를 요구하지 않는다(`api/docs/daily-run-limit.md` 31행). 그래도 BR8.3대로 판본을 올렸다.
- **시험 안내 고침:** `unit-test-instructions.md`의 Step 18 api 명령 `test/analysis-intake`는 없는 경로라 시험을 하나도 돌리지 않았다. 고지·접수·동의 시험 파일 8개를 직접 적었다.
- **시험(개발자 에이전트 실행)**
  - web `u2-consent` 10 pass
  - api 고지·접수·동의 11개 파일: 163 pass / 0 fail / 2 skipped
  - api 전체: 1,743 pass / 0 fail / 36 skipped
  - web 전체: 905 pass
  - api·web lint·typecheck, 문서 크기 검사 통과

## 한계

- **OpenAI 보관:** Decisions 요청에는 요청 단위 저장 끔 인자가 없다. 그래서 OpenAI의 기본 보관(남용 감시 기록 최대 30일)을 따르고, 고지 v3에 그렇게 적었다.
- **Claude 판정 답 스키마:**
  - 값 칸이 문자열·수·수 목록 가운데 하나인 배열 목록이다. 이 스키마를 구조화 출력이 받는지는 실제 API로 확인하지 못했다.
  - FR10은 OpenAI 판정으로 넘어서 Claude 판정으로 다시 잴 일이 없었다.
- **재료 판정 20초:** FR10에서 가장 긴 재료 판정이 2.4초였다(7번). 재료 판정의 질문 수는 확인표에 남지 않아 400개에 가까운 경우였는지는 모른다.
- **받은 사람 화면:** S10·S11은 그리지 않고 원문으로 단언한다(위 6).

## 운영에 켤 때 팀장이 할 일

- 운영에 켤 때(고지 v3 배포 뒤)는 계획 「팀장 인프라」 절대로 한다. 이때 문서 세 곳의 나가는 연결 대역을 함께 고친다(`deploy/README.md`·`deploy/aws/k8s/README.md`·`worker/docs/request-context.md`).
  - SSM `/catchu/prod/worker/CATCHU_JUDGEMENT_API_KEY`를 Secret `catchu-worker`에 넣는다.
  - `worker.yaml`에 env를 더한다.
  - worker 나가는 연결에 `us.api.openai.com`을 연다.
- OpenAI 판정 키와 `CATCHU_JUDGEMENT_PROVIDER=claude`는 고지 v3가 배포된 뒤에만 서버에 넣는다.
