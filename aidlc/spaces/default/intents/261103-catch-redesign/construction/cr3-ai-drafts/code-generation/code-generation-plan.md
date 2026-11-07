# CR3 AI 쪽 — 코드 생성 계획

## Summary

- Builds: 판정 공급자 자리(OpenAI·Claude·합성), AI 제목 후보·설명 문장과 기계 대조, 재료 판정·Catch 판정과 적용, 설명 칸 숨김, FR10 확인 명령, (FR10을 넘으면) 고지 v3·첫 이용 고지 판본
- Touches: worker 새 `app/judgement/`·기계 대조 모듈·확인 명령, `worker/app/generation/`(flow·request·response·claude·limits·outcome), `worker/app/consumer/`(settings·child), `worker/pyproject.toml`·`uv.lock`(openai SDK), `web/src/features/assets/`·`recipient/`, worker 문서, (FR10 통과 때) api·web 고지 상수와 문서
- Tests: worker 새 시험 파일 3개(판정·기계 대조·확인 명령)와 고칠 파일 4개 약 60개, web 시험 2개 파일 약 6개, 기존 시험은 그대로 통과, FR10 확인 20개 Catch

## 입력

- 기능 설계 `construction/cr3-ai-drafts/functional-design/`: `functional-spec.md`(W1~W6, 시나리오 S1~S31), `rules.md`(BR1~BR10), `entities.md`
- 비기능 요구사항·설계 `construction/cr3-ai-drafts/nfr-requirements/`, `nfr-design/`
- 계약 `inception/contract-design/contract-summary.md`(C3·C4·C5·C7, 모양 변경 없음)
- Unit 정의 `inception/units-generation/unit-of-work.md`(CR3), 요구사항 `inception/requirements-analysis/requirements.md`
- 스토리 US2.2(AC2.2.4·AC2.2.5)·US2.3·US3.1·US3.3·US4.4
- CR1 접점: 후보 자료의 `RecordText` 칸, 작업 사실 두 번째 항목, 재료 고르기(`groups.py`·`request.select`)

## 이 계획이 고치는 사람 쪽 파일

같은 규칙을 적은 문서를 모두 함께 고친다(이 프로젝트 규칙).

- 판정·AI 쪽 설명: `worker/docs/generation.md`(가리키는 줄 하나만, 34,666 B라 늘리지 않음), `worker/docs/generation-provider.md`(공급자가 둘이 됨), `worker/docs/generation-limits.md`(판정 상한·로그 칸), `worker/docs/queue-consumer.md`(환경변수 표에 이름 둘), `worker/README.md`(모듈 지도·제공자 줄), `worker/.env.example`·`deploy/env/worker.env.example`(이름만)
- 설명 칸 숨김: `web/src/features/assets/README.md`, `web/src/features/recipient/README.md`
- 제목 규칙(검토 R-01, Step 19): `worker/docs/candidate-text.md` 「제목」 문단
- 공개 저장소 규칙의 확인 명령 예외(Step 20): `worker/docs/github-collection.md`, `docs/CatchU_collection_control_scope.md`, `worker/docs/generation-judgement.md`
- (Step 18, FR10 통과 때만) 고지: `api/docs/analysis-intake.md`(v3 판본·문구), `api/docs/repository-analysis-u7.md`(v2 적용 문장), `api/docs/daily-run-limit.md`(판본 상수 설명은 그대로, 확인만), `web/src/components/ai-consent/README.md`(받는 곳 목록)
- 고치지 않음: 12월 intent의 `api/src/ai-generation/`·`api/docs/ai-generation.md`(기계 대조 규칙은 읽기만 한다)

## 팀장 인프라 (이 계획 밖, 코드 생성과 따로)

- OpenAI 계정·키, SSM `/catchu/prod/worker/CATCHU_JUDGEMENT_API_KEY` → Secret `catchu-worker`, `deploy/aws/k8s/worker.yaml`의 env 연결
- worker 나가는 연결 허용(NetworkPolicy)에 OpenAI 대역 추가. 지금은 api·큐·GitHub·Anthropic만이다(`worker/docs/request-context.md` 68행)
- 판정 키와 `CATCHU_JUDGEMENT_PROVIDER=claude`는 고지 v3가 배포된 뒤에만 서버에 넣는다(NFR5.3)
- 판정 키·OpenAI 나가는 연결을 넣을 때 함께 고칠 문서: `deploy/README.md`(204행), `deploy/aws/k8s/README.md`(12·32·40·106행), `worker/docs/request-context.md`(68행, 나가는 연결 대역)

## Testing Contract

```json
{
  "version": 1,
  "methodology": "custom",
  "source": "team",
  "ordering": "각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.",
  "scope": "mvp",
  "test_strategy": "standard",
  "project_type": "brownfield",
  "applicable_notes": [
    {
      "layer": "org",
      "text": "We treat tests as a first-class deliverable in every Bolt. The specific\nmethodology (TDD, BDD, ATDD, or classic test-after) is affirmed at\npractices-discovery and recorded in `team.md` under this heading with explicit\n`Methodology` and `Ordering` fields; Code Generation resolves those fields\nindependently from coverage, tooling, and scope notes.\n\nWhen no posture has been affirmed, our default per scope is:\n- **Methodology**: test-after\n- **Ordering**: implement each applicable testable layer, then write and run\n  that layer's tests.\n- `mvp`, `enterprise`, `feature`, `infra`, `classic` add an 80% line-coverage\n  floor and CI execution before merge.\n- `bugfix`, `security-patch` add a targeted regression for the specific\n  bug/vulnerability and require the existing suite to remain green.\n- `express` uses the Minimal strategy: requirement-driven unit tests (one per\n  requirement, with a happy-path floor per component); existing tests remain\n  green.\n- `poc`, `refactor`, `workshop` add no extra new-test floor and require the\n  existing suite to remain green.\n\nThe active `Test Strategy` still applies in every scope and determines test\nvolume/types. Scope floors are additive; they never reduce or replace the\nselected strategy.\n\nBuild and Test verifies defined coverage floors and affirmed quality targets;\nthey may not be weakened to make a step pass.\n\nAffirm a stricter posture in `team.md` if the team commits to one."
    },
    {
      "layer": "team",
      "text": "- **Methodology**: custom\n- **Ordering**: 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.\n- 커버리지 측정은 팀장이 공용 기반으로 넣은 서비스별 명령을 쓴다. Unit에서 측정 도구를 따로 들이거나 CI를 고치지 않고, 필요하면 팀장에게 요청한다."
    }
  ],
  "obligations": {
    "strategy": "standard",
    "strategy_volume": [
      "Five to eight tests per component.",
      "Unit tests plus integration tests for key boundaries.",
      "Add E2E, performance, or security tests when requirements demand them."
    ],
    "scope_floor": [
      "Meet an 80% line-coverage floor.",
      "Run the selected tests in CI before merge."
    ],
    "combination_rule": "Apply every selected-strategy obligation and every scope-floor obligation; neither replaces the other, and a targeted scope regression may add the narrowest necessary test type beyond the strategy default."
  },
  "plan_profile": {
    "methodology": "custom",
    "runner_step": "Verify the existing test runner/configuration and record the exact unit-scoped command.",
    "runner_ready_before_first_test": true,
    "testable_layers": [
      "Data model / database behavior",
      "Repository / data access",
      "Business logic",
      "API / endpoint",
      "Frontend behavior"
    ],
    "steps": [
      "Project structure and production configuration skeleton.",
      "Verify the existing test runner/configuration and record the exact unit-scoped command.",
      "Custom ordering - 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.",
      "Implementation and tests - preserve that exact ordering; do not convert it to layer-local TDD.",
      "Environment/build configuration.",
      "Documentation and traceability."
    ]
  },
  "input_sha256": "sha256:b6cb6e0b1ba6bb0736259ab7987a5841cfc41f21a49cf2fb5eade7c786b2dc66",
  "contract_sha256": "sha256:19386d629b3092339d296f2cdf4cb18982564dbd19832a03198ee5687fbc32b6"
}
```

해당하지 않는 층: DB·저장소 접근·API 끝점은 CR3이 바꾸지 않는다(계약 C5). 시험 층은 worker 업무 규칙·어댑터와 web 화면이다.

## 단계

- [x] **Step 1. 구조·설정 확인** — 새 패키지 `worker/app/judgement/`와 기계 대조 모듈 자리를 정하고, 불러오기 방향(생성 흐름 → 판정, 판정은 생성·후보 판정을 불러오지 않음)을 확인한다. 고칠 파일 목록을 이 계획대로 확정한다. (전체)
- [x] **Step 2. 시험 실행기 확인** — `unit-test-instructions.md`의 Unit 시험 명령(worker pytest, web node --test)을 지금 코드에서 새 파일 없이 한 번 돌려 실행되는지 확인한다. (전체)
- [x] **Step 3. 시나리오·기대 결과·실패 조건 먼저 정하기** — 기능 설계 3절 S1~S31과 실패 조건(`unit-test-instructions.md`)을 시험 파일·시험 이름에 짝짓는다. 시험 이름·설명 문자열에 S번호를 적는다. (US2.2·US2.3·US3.1·US3.3·US4.4)
- [x] **Step 4. 기계 대조 모듈** (BR3.3)
  - 표준 라이브러리만 쓰는 새 모듈. 12월 `api/src/ai-generation/fact-check.ts`의 낱말 뽑기(PR 번호·영문 숫자 덩어리·숫자/파일/영어 나누기·예외 낱말)를 다시 짠다. 영어 이름·숫자는 가리킨 줄 글, 파일 이름은 가리킨 줄 경로에 있어야 한다.
  - 구현 뒤 새 시험 파일 `worker/tests/test_judgement_factcheck.py`(S4, PR 번호, 숫자 앞자리 0, 예외 낱말, 한글 무시).
  - 관련 스토리: US2.3, US3.1
- [x] **Step 5. 판정 구성 요소: 규약·합성 어댑터·요청 조립·답 읽기** (BR2.1~BR2.5, BR6.1·BR6.2)
  - `worker/app/judgement/`: 공급자 규약(요청 → 답 또는 실패 셋), 합성 어댑터, Catch 판정·재료 판정 요청 조립 함수 두 개(정해진 칸만, 지시문과 자료 분리), 답 읽기(`[id, 값]` 꼴, 범위 밖·없는 id 버림, 고르기 확률 합 1), 질문 400개 상한, 재료 판정 앞 5줄 가리기(`app.redact`).
  - 구현 뒤 새 시험 파일 `worker/tests/test_judgement.py`(S8·S17·S29·S31, 빠진 답, 범위 밖 값).
  - 관련 스토리: US2.3, US3.3
- [x] **Step 6. Claude 판정 어댑터** (BR1.2, 비기능 설계 공급자 호출)
  - 지금 `ClaudeProvider` 규칙 그대로(다시 시도 끔, `inference_geo="us"`, 구조화 출력, 사용자 지정 머리글 있으면 만들지 않음), 판정 출력 상한(Catch 2,000토큰·재료 8,000토큰), 시간 제한 20초.
  - 구현 뒤 `test_judgement.py`에 요청 모양·질문 집합이 OpenAI와 같다는 시험(S2)을 더한다. 외부 호출 없이 SDK 대역으로 본다.
  - 관련 스토리: US2.3
- [x] **Step 7. OpenAI 판정 어댑터와 의존성** (BR1.1, NFR1.5, 비기능 설계 공급자 호출)
  - `worker/pyproject.toml`·`uv.lock`에 공식 `openai` SDK를 판본 고정으로 더한다. 판본과 저장 끔·지역·출력 상한 인자 이름은 공식 문서로 확인해 `generation-provider.md`에 적는다.
  - 주소 고정, 프록시 환경변수 안 씀, 주소 바꿈 안 따라감, 호출 전체 시간 제한, 다시 시도 끔, 키는 생성자 인자로만(`OPENAI_API_KEY` 무시), 응답 크기 상한, 요청마다 저장 끔, 처리 위치 미국(아니면 켜지 않음).
  - 구현 뒤 `test_judgement.py`에 어댑터 시험(저장 끔·주소 고정·다시 시도 0·실패 코드 셋)을 SDK 대역으로 더한다. 의존성 취약점 검사(`uv audit` 등 지금 worker 검사)를 돌린다.
  - 관련 스토리: US2.3
- [x] **Step 8. 설정과 LIVE 조립** (BR1.1·BR1.4, 비기능 설계 비밀값)
  - `worker/app/consumer/settings.py`: `CATCHU_JUDGEMENT_PROVIDER`(`openai` 기본·`claude`, 밖이면 기동 실패)와 `CATCHU_JUDGEMENT_API_KEY`(`SECRET_ENV`에 더해 읽고 지움)를 읽어 `LiveSettings`에 칸 둘을 더한다. 운영 필수 셋은 그대로다.
  - `worker/app/consumer/child.py` `live_assembly`·`worker/app/processing/live.py`: 칸 둘로 판정 어댑터를 만들어 생성기에 넘긴다. 꺼지면 넘기지 않는다.
  - 구현 뒤 `worker/tests/test_consumer_settings.py`에 S1·S2, 잘못된 공급자 값, 키가 환경에 남지 않음을 더한다. Claude 어댑터 공통 규칙이 바뀌면 `worker/tests/test_generation_claude.py`도 함께 돌린다.
  - 관련 스토리: US2.3
- [x] **Step 9. 생성 요청·응답의 AI 쪽** (BR3.1·BR5.1·BR2.4)
  - `worker/app/generation/request.py`(AI 쪽 지시문), `response.py`(응답 키 `titleCandidates`·`sentences` 검사, 근거 줄 id, 40자 넘는 후보 버림, 문장 칸 없으면 읽을 수 없는 응답), `claude.py`(출력 스키마). AI 쪽이 꺼지면 지금 지시문·응답 그대로.
  - 구현 뒤 `worker/tests/test_generation_flow.py`·`test_generation_title.py`에 S3·S18·S30과 생성 요청에 기록의 글 없음을 더한다.
  - 관련 스토리: US2.3, US3.1
- [x] **Step 10. 흐름: 순서·시간 몫·상한** (BR2.6, BR6.1·BR6.3·BR6.4, 비기능 설계 성능)
  - `worker/app/generation/flow.py`: 후보마다 재료 판정(큰 후보, 시간 몫 20+45+20초 확인) → 재료 담기에 답 적용(`request.select`, 공통 묶음·갈래·점수·판정 없는 파일 뒤) → 생성(시간 몫 45+20초 확인) → Catch 판정. 생성 응답이 없거나 시간·상한이 모자라면 판정하지 않는다.
  - `worker/app/generation/limits.py`: 판정 시간 제한 20초, Catch·재료 판정 상한 각 300번, `CallBudget`에 판정 호출 따로 세기.
  - 구현 뒤 `test_generation_flow.py`·`test_generation_groups.py`에 S7·S13~S17·S27·S28을 더한다.
  - 관련 스토리: US2.3, US3.3
- [x] **Step 11. 판정 답 적용: 제목·둘째 줄·설명** (BR3.4·BR3.5·BR4.1·BR4.2·BR5.2~BR5.4)
  - `flow.py` `_apply` 자리: 제목 순서(기록의 글 → AI 후보 → 전체 미달 기록의 글 → 조각 제목(고쳐 쓰기 없음) → 없음), 「판정 없음」 경로, RECORD_WHAT 0.5 미만이면 둘째 줄 위치로 지움, 0.9 이상 문장만 이어 쓰기, 남은 문장 0개면 NOT_GENERATED, 판정 실패면 FAILED(`outcome.py`에 JUDGEMENT_* 코드 셋과 회원 문구).
  - 구현 뒤 `test_generation_flow.py`에 S5·S6·S9~S11·S19·S20·S26을 더한다. 작업 사실에 생성 출력이 없다는 시험을 유지한다.
  - 관련 스토리: US2.2, US2.3, US3.1
- [x] **Step 12. 운영 로그 건수** (NFR2.6·NFR3.2)
  - `GenerationReport`·`_log`에 판정 건수·결과 건수·켜짐 여부·공급자 이름 칸을 더한다. 원문은 남기지 않는다.
  - 구현 뒤 `test_generation_flow.py`에 건수 시험, `test_consumer_processor.py`에 로그에 기록의 글·후보·문장·키가 없다는 시험을 더한다.
  - 관련 스토리: US2.3
- [x] **Step 13. 화면: 설명 칸 숨김** (BR7.1)
  - `web/src/features/assets/assets-view.tsx`·`web/src/features/recipient/recipient-screen.tsx`: NOT_GENERATED면 「Catch 설명 초안」 칸을 그리지 않는다. FAILED·GENERATED는 지금 그대로.
  - 구현 뒤 `web/test/assets-view.test.mjs`·`web/test/recipient.test.mjs`에 S10(칸 없음, 화면 낭독기에도 없음)·S11(FAILED 안내)을 더한다.
  - 관련 스토리: US3.1
- [x] **Step 14. FR10 확인 명령** (BR9.1·BR9.2, NFR1.6, 비기능 설계 Q2 A)
  - worker 개발 명령: 수집 결과 파일 입력. 수집 결과 파일이 없는 저장소는 같은 명령이 실제 GitHub에서 직접 수집해 파일로 남긴다. 공개 저장소(TheMe·algo-problem)와 비공개 `JminAILab/CatchU`를 모두 이 길로 받는다. 토큰은 셸 환경변수로 넣는 fine-grained 토큰 하나로, 공개 저장소 읽기에 `JminAILab/CatchU` 읽기 전용 권한(Contents·Metadata·Pull requests·Issues 모두 Read)을 더한 것이다. 운영과 같은 후보 판정·생성·판정, 결과 메시지 보내지 않음, 로컬 확인표를 `~/catchu-local-live/cr3-fr10/`에 씀(저장소 안이면 거부), 토큰·키를 파일·로그에 남기지 않음.
  - 구현 뒤 새 시험 파일 `worker/tests/test_judgement_confirmation.py`(S25, 저장소 안 경로 거부, 합성 수집 결과로 확인표 칸).
  - 관련 스토리: 없음(FR10.1)
- [x] **Step 15. 문서** (BR10.1, NFR7.1)
  - 새 문서 `worker/docs/generation-judgement.md`(공급자·질문·적용 규칙·켜고 끄기·배포 안내 「고지 v3 뒤에만 판정 키·claude 공급자」·FR10 확인 명령 사용법).
  - 「이 계획이 고치는 사람 쪽 파일」의 worker·web 문서와 환경변수 예시를 고친다. 문서 크기 검사를 돌린다.
  - 관련 스토리: 전체
- [x] **Step 16. 검증** — 이 Unit의 시험 명령을 돌리고, intent 검증 명령(api·web·worker 전체 검사·시험·커버리지)을 돌린다. 기존 시험이 모두 통과하는지 확인하고 결과를 `code-summary.md`에 적는다.
- [x] **Step 17. FR10 확인(Catch 20개)과 기록** (BR9.1~BR9.3, NFR3.1)
  - 전제: 팀장이 OpenAI 키를 만들었다(요구사항 제약 C5). 팀장이 fine-grained GitHub 토큰 하나(공개 저장소 읽기 + `JminAILab/CatchU`의 Contents·Metadata·Pull requests·Issues Read)를 만들었다. 키와 토큰은 셸 환경변수로만 넣는다.
  - Step 14 명령으로 세 저장소를 직접 수집해 수집 결과 파일을 남기고(비공개 CatchU도 같은 명령, 같은 토큰), CatchU 6·TheMe 7·algo-problem 7을 만든다. 팀장이 확인표에 맞음·틀림을 표시한다. 기준(틀린 제목 통과 0건, 틀린 문장 통과 1건 이하)을 판정한다. 못 미치면 지시문을 한 번까지만 고치고, 그래도 못 미치면 Claude 판정으로 다시 잰다.
  - 확인 명령은 팀장이 자기 터미널에서 돌린다(팀장 결정 2026-11-06). 키·토큰은 그 터미널의 환경변수로만 넣고, AI 세션에는 넣지 않는다. AI는 명령 한 줄과 환경변수 이름을 알려 주고, 팀장이 준비됐다고 할 때까지 기다린다.
  - 커밋되는 기록(`code-summary.md` 「FR10 확인」)에는 건수·결과·조정 횟수·AI 쪽을 켤지 결정만 적는다. 확인표 원문은 저장소 밖에 둔다.
  - 관련 스토리: US2.3, US3.1, US3.3
- [x] **Step 18. 고지 v3·첫 이용 고지 판본 (FR10을 넘었을 때만)** (BR8.1~BR8.3)
  - Step 17이 기준을 넘었을 때만 한다. 못 넘었으면 이 단계는 하지 않고 「하지 않음(FR10 미달)」으로 `code-summary.md`에 적는다.
  - `api/src/analysis-intake/analysis-notice.ts`: `catchu-real-analysis-notice-v3`, 2·3·4절(OpenAI 회사 이름·연락처·보관·처리 위치는 공식 안내로 확인). 합성 고지 그대로. 고지 SHA 시험 갱신.
  - `api/src/ai-consent/ai-consent.gate.ts`·`web/src/components/ai-consent/ai-consent-notice.ts`: `AI_NOTICE_VERSION` 같은 새 값, 받는 곳에 OpenAI.
  - 「이 계획이 고치는 사람 쪽 파일」의 고지 문서를 고친다. 문구는 CR3 PR에서 팀장이 승인한다. 배포 안내에 「판정 키는 v3 배포 뒤」를 적는다.
  - 관련 스토리: US4.4
- [x] **Step 19. 코드 검토 뒤 고칠 것 (검토 1회차 Minor, 팀장 결정 2026-11-06)** — Step 17보다 먼저 한다.
  - R-01: `worker/docs/candidate-text.md` 「제목」 문단에 「AI 쪽이 꺼진 경로 기준이며, 켜지면 판정 결과에 따라 달라진다」 한 줄과 `generation-judgement.md` 링크를 더한다.
  - R-02: FR10 확인표(`worker/app/processing/confirm.py`)와 수집 결과 파일(`worker/app/processing/collection_file.py`)을 처음부터 본인만 읽을 수 있게(0o600) 만든다. 만든 뒤 권한을 바꾸는 방식은 쓰지 않는다. 시험은 `test_judgement_confirmation.py`에서 만든 파일의 권한을 본다.
  - R-03: 기동 검사는 더하지 않는다. `worker/docs/generation-judgement.md`에 「`OPENAI_CUSTOM_HEADERS`가 있으면 첫 후보가 있는 요청에서 결함 처리된다」 한 줄만 적는다.
  - R-04: `worker/aidlc/`는 커밋에서 뺀다(코드 변경 없음).
  - 고친 뒤 `unit-test-instructions.md`의 Unit 시험 명령만 다시 돌리고, 결과를 `code-summary.md` 「코드 검토 뒤 고친 것」에 적는다.
  - 관련 스토리: US2.3
- [x] **Step 20. FR10 확인 명령의 비공개 저장소 수집 (Step 17 첫 실행 결과, 팀장 결정 2026-11-06)** — Step 17을 다시 돌리기 전에 한다. (BR9.1, FR10.1 「CatchU는 비공개라 개발용 실행으로」)
  - 원인: 첫 실행에서 `JminAILab/CatchU`가 Catch 0개였다. 수집의 공개 저장소 검사(`worker/app/collection/collectors.py`의 저장소 확인, 「공개 저장소가 아니어서 자료를 조회하지 않고 수집을 멈췄다」, `REPOSITORY_UNREACHABLE`)에 걸렸다. 토큰 권한 문제가 아니다.
  - 고칠 것: 수집에 비공개 저장소를 허용하는 인자 하나를 더한다. 기본값은 허용하지 않음(지금과 같음)이다. FR10 확인 명령(`worker/app/processing/confirm.py`의 직접 수집)만 그 인자를 켠다. 운영 경로(큐 소비자·`app.processing`의 LIVE 처리)는 인자를 넘기지 않아 지금처럼 공개 저장소만 모은다.
  - 시험: 운영 경로가 그 인자를 켜지 않는다는 시험(기본값으로 비공개 저장소면 `REPOSITORY_UNREACHABLE`, 운영 수집 호출에 인자가 없음)과, 확인 명령이 비공개 저장소를 모은다는 시험(합성 GitHub 응답, 외부 호출 없음).
  - 문서: 같은 규칙을 적은 문서에 「FR10 확인 명령만 예외」를 적는다. `worker/docs/github-collection.md`(19행 「공개 저장소」), `docs/CatchU_collection_control_scope.md`(182행 「대상은 공개 저장소뿐」), `worker/docs/generation-judgement.md`(「FR10 확인 명령」). 12월 intent의 `api/docs/repository-analysis-u7.md`(api 등록·접수의 공개 확인)는 다른 규칙이라 고치지 않는다.
  - 고친 뒤 `unit-test-instructions.md`의 Unit 시험 명령과 바꾼 수집 시험 파일만 다시 돌리고, 결과를 `code-summary.md`에 적는다.
  - 관련 스토리: 없음(FR10.1)

## 스토리와 단계

| 스토리 | 단계 |
|---|---|
| US2.2(AC2.2.4·AC2.2.5) | Step 11 |
| US2.3 | Step 4~12, 17 |
| US3.1 | Step 4, 9, 11, 13, 17 |
| US3.3 | Step 5, 10, 17 |
| US4.4 | Step 18 |

## 다른 작업의 파일

12월 intent의 `api/src/ai-generation/`·`api/docs/ai-generation.md`는 Step 4에서 읽기만 하고 고치지 않는다. CR1이 만든 `worker/app/candidates/record_text.py`·`groups.py`는 읽기만 하고, `request.select`에 재료 판정 답을 받는 인자를 더한다.
