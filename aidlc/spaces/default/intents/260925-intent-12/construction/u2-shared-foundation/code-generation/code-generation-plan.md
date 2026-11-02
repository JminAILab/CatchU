# U2 공용 기반 — 코드 생성 계획

## Summary

- Builds: 하루 실행 제한·첫 이용 동의·백그라운드 실행(AiRun)·파일 저장(로컬)·탈퇴 API와 화면, AI 게이트의 입력 상한·기계 대조·JD 역할·스트림, 시작 안내·404·오류 화면, 통합 확인 표
- Touches: api/src(ai-generation, 새 모듈 ai-run·daily-run-limit·ai-consent·file-storage·withdrawal, 마이그레이션 1개), web/src(공용 동의 창·한 줄 안내·시작 안내·탈퇴·not-found·error), api/docs·docs 문서
- Tests: api 모듈별 5~8개(약 50개, 단위+DB 통합), web 화면 로직 약 15개, 기존 U1 시험 전부 재실행

## Sources

입력: [기능 명세](../functional-design/functional-spec.md)·[업무 규칙](../functional-design/rules.md)·[엔티티](../functional-design/entities.md), [비기능 요구사항](../nfr-requirements/)·[비기능 설계](../nfr-design/)(특히 [보안 설계](../nfr-design/security-design.md)의 설정 검사 시점 변경), [계약 요약](../../../inception/contract-design/contract-summary.md) C-01~C-06, [Unit 정의](../../../inception/units-generation/unit-of-work.md) U2, [요구사항](../../../inception/requirements-analysis/requirements.md). 기존 코드: api/src/ai-generation(U1), auth·github-connection(credential-vault)·member-profile, api/src/analysis-queue/queue-spec.ts(10월 큐 규칙), web/src/app·features.

## 계획에 더한 결정 (코드 생성 질문 답, 2026-10-27)

비기능 설계의 동작은 그대로 둔다: 파일 저장 설정이 없으면 api는 기동하고 FileStorage를 쓰는 순간 `StorageUnavailable`이며, 탈퇴 2단계는 건너뛰지 않고 실패한다(지울 파일이 있는지 판정할 수 없기 때문). 여기에 세 가지를 더한다.

1. 빈 문자열은 "없음"으로 본다(10월 GitHub 설정과 같음). 그 밖의 값은 있는 것으로 보고 기동 때 검사한다.
2. `dev-ci`는 고치지 않는다. U2 시험이 시험 안에서 두 값(`FILE_STORAGE_DRIVER`, `FILE_STORAGE_LOCAL_ROOT`)을 넣는다.
3. 통합 확인 표의 「탈퇴 뒤 차단」에 "U2 코드를 개발 서버에 올리기 전에 두 값을 넣는다"를 선행 조건으로 적는다.

계약 변경은 팀 규칙(계약 설계 「Contract ownership rules」, 레포 컨벤션 §2.1 「경계·계약 PR」)대로 진행한다(계획 1차 변경 요청). C-01의 `jdRole`·`SERVER_NOTICE`는 기존 호출이 그대로 유효한 더하는 변경이다. 계약 문서 수정은 통합 브랜치(`intent/260925-intent-12`) 대상 PR로 따로 올리고 U5·U10 담당이 리뷰한 뒤 팀장이 합친다. C-11 자리는 같은 PR에서 주인인 U4 담당에게 요청한다. U2 코드는 이 PR의 리뷰를 기다리지 않고 바로 진행하며, C-01·C-11에 기대는 부분(JD 역할·SERVER_NOTICE, 받은 사람 안내 자리)은 맨 뒤 단계(Step 12)로 보내고 리뷰에서 바뀌면 그 부분만 고친다.

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

## 단계

순서는 Testing Contract의 custom 순서다: 먼저 시나리오·기대 결과·실패 조건을 확정하고(Step 3), 각 구성 요소를 구현한 뒤 그 시험 코드를 쓰고 돌린다(Step 4~13). 층별 TDD로 바꾸지 않는다.

### 준비

- [ ] **Step 1. 계약 수정 PR 올리기 (코드 아님, 기다리지 않음).** 계약 요약 문서의 C-01(`GatedItem.jdRole`, `kind: SERVER_NOTICE`, 한 호출 = JD 요구사항 한 줄, check-scope 구체화)과 C-11(받은 사람 시작 안내 붙는 자리) 변경을 통합 브랜치 `intent/260925-intent-12` 대상의 별도 PR로 올린다. 리뷰어는 C-01은 U5·U10 담당, C-11은 주인인 U4 담당에게 같은 PR에서 요청하고, 합치기는 팀장이 한다. 이 PR은 U2 제출물과 별개이며 U2 코드는 리뷰를 기다리지 않고 Step 2로 넘어간다. (레포 컨벤션 §2.1, 계약 설계 「Contract ownership rules」, functional-spec 「계약 변경 제안」) — US6.3, US16.2
- [x] **Step 2. 시험 실행기 확인.** api: `npm test -- <파일>`(scripts/test-with-db.cjs, 시험 DB 필요)로 U1 시험 하나를 돌려 실행기가 동작하는지 확인한다. web: `node --test test/<파일>`. 명령은 unit-test-instructions.md에 적는다.
- [x] **Step 3. 시나리오 확정.** functional-spec의 S1~S29(S12b·S12c·S16b~S16d 포함)를 시험 파일별로 나눠 unit-test-instructions.md 「시나리오 표」에 기대 결과·실패 조건과 함께 적는다. 코드보다 먼저 한다.

### api — 저장 표

- [x] **Step 4. 마이그레이션과 엔티티.** `daily_execution_count`(member_id FK CASCADE, usage_date date, count int CHECK ≥0, PK(member_id, usage_date))와 `ai_consent`(consent_id PK, member_id FK CASCADE, notice_version, consented_at, UNIQUE(member_id, notice_version)) 마이그레이션 1개를 `npm run migration:generate`로 만들고 엔티티를 더한다. 같은 변경에서 api/docs/member-withdrawal-deletion.md에 두 표 행을 더하고 test/db/member-cascade-delete.test.cjs에 두 표를 넣는다. 시험: 연쇄 삭제 확인. — BR7.7, NFR5.2, US14.1

### api — 공용 모듈 (구현 → 그 시험)

- [x] **Step 5. DailyRunLimit** (`api/src/daily-run-limit/`). `consume(memberId, kind, now, manager?)`를 조건부 쓰기 한 문장으로, 한국 날짜 계산, 상수 `DAILY_RUN_LIMIT = 30`, 429 `DAILY_LIMIT_REACHED` 오류 코드 등록. 시험(`test/u2/daily-run-limit.test.cjs`, 6개): 29→30 허용, 30에서 거부, 동시 두 번 중 하나만(S3), KST 자정 경계(S4), manager 트랜잭션 되돌림, 응답에 남은 횟수 없음. — BR1.1~1.7, US6.4, NFR4.3·4.7
- [x] **Step 6. AiConsentGate** (`api/src/ai-consent/`). `hasConsented`·`require`·`record`, 상수 `AI_NOTICE_VERSION`, `GET/POST /v1/ai-consent`(10월 Guard·Origin·CSRF), 403 `AI_CONSENT_REQUIRED`. 시험(`test/u2/ai-consent.test.cjs`, 6개): 동의 없음 403, 동의 뒤 통과, 같은 판본 재전송 204, 옛 판본 400(S6), 인증 없음 401, 판본 올리면 다시 동의 필요. — BR2.1~2.3, US20.1, NFR2.4
- [x] **Step 7. AiRun** (`api/src/ai-run/`). 큐 `ai-run`, `registerHandler`(중복 등록 기동 실패), `enqueueAfterCommit`(attempts 1, 보관 상수 `AI_RUN_JOB_RETENTION_SECONDS = 7200`, Redis 오류는 `ENQUEUE_FAILED`), runKey 검사(콜론·빈 값 거부), Worker concurrency 1·maxStalledCount 0, 순수 함수 `readStatus`, 조건부 FAILED 저장 도우미, 늦은 결과 버림 도우미(부모 확인, 23503은 버림). 시험(`test/u2/ai-run.test.cjs`, 8개): 등록·실행, 같은 runKey 두 번이면 한 번 실행, 콜론 거부(S20), Redis 끊김 ENQUEUE_FAILED(S19), readStatus 경계, 조건부 저장이 DONE을 덮지 않음, 부모 없으면 버림(S21), 처리기 예외 로그·재시도 없음. — BR5.1~5.7, NFR4.4·4.8·4.9·5.4·6.1~6.3
- [x] **Step 8. FileStorage** (`api/src/file-storage/`). 인터페이스(C-05), 키 도우미(memberPrefix 등), 로컬 드라이버(임시 이름 → 이름 바꾸기, 뿌리 안 재확인), 설정 읽기: **빈 문자열과 미설정은 "없음" → 기동은 하고 모든 호출이 `StorageUnavailable`**, 값이 있으면 기동 때 검사(모르는 드라이버·상대 경로·없는 폴더·한쪽만 있음 → 기동 실패). 시험(`test/u2/file-storage.test.cjs`, 8개, 두 값은 시험 안에서 임시 폴더로 넣음): put/get/copy, 없는 키 FileNotFound, 없는 접두어 삭제 성공(S23), `..` 키 거부(S22), 설정 없음 → 호출 시 StorageUnavailable, 빈 문자열 = 없음, 상대 경로 → 기동 실패, 모르는 드라이버 → 기동 실패. — BR6.1~6.4(바뀐 BR6.1은 security-design 기준), NFR1.3·1.4
- [x] **Step 9. AI 게이트 확장 — 계약 그대로인 부분** (`api/src/ai-generation/`, U1 코드에 더함). 입력 상한 `AI_INPUT_MAX_CHARS = 80000`, SONNET은 QNA만, 공통 지시 문구, 대조 낱말 뽑기(약어 15개 예외), CITED·AI_INTERPRETATION 대조와 버림 수, `generateStream`, Nest 모듈 등록·주입, `ai_gate_result` 로그. JD 역할·SERVER_NOTICE는 Step 12에서 한다. 시험(`test/u2/ai-gate-checks.test.cjs`·`test/u2/ai-gate-stream.test.cjs`, 합계 약 13개, 기록한 응답 JSON 사용): S7~S11, S17, S18. 기존 U1 시험 전부 다시 통과. — BR3.1~3.9, US6.3, NFR2.1~2.3·3.1·4.2·4.5

### api — 탈퇴

- [x] **Step 10. Withdrawal** (`api/src/withdrawal/`). `DELETE /v1/me`(Guard 뒤, 본문 없음): 1단계 트랜잭션(그 회원 세션 폐기, `publication.stopped_at`, `mcp_access_token`·`mcp_authorization_code`·`mcp_connection` 삭제) → 2 `FileStorage.deletePrefix(memberPrefix)` → 3 credential-vault 삭제(없으면 성공) → 4 member_account 삭제. 실패는 500 `WITHDRAWAL_FAILED`와 `withdrawal_failed` 로그(단계 번호·오류 이름). U4·U6 표가 아직 없으면 시험에서 C-07·C-06 모양의 시험용 표를 만든다. 시험(`test/u2/withdrawal.test.cjs`, 7개): 정상(S24, 다른 회원 JD 원본 남음은 표가 있을 때), 2단계 실패 500·링크 차단 유지(S25), 실패 뒤 재요청 성공(2·3단계 대상 없음), 탈퇴 뒤 Access 401(S26), 같은 Google 계정 재가입 = 새 memberId(S27), 인증 없음 401, 설정 없음 → 2단계 실패. — BR7.1~7.6, US14.1·14.3, NFR1.1·1.2·5.1·5.5

### web

- [x] **Step 11. web 공용·화면 — 계약 그대로인 부분** (`web/src/components`·`features`·`app`). 공용 동의 창(403 `AI_CONSENT_REQUIRED` 때 열고 동의 뒤 같은 요청 한 번 재전송)·한 줄 안내, 오류 코드 셋 안내(한도·동의·탈퇴 실패), 회원 홈 고정 여섯 단계 안내와 메뉴 링크, `app/not-found.tsx`·`app/error.tsx`(내부 정보 없음), 회원 정보 화면의 [탈퇴] → 확인창 → `DELETE /v1/me` → 성공 시 로그인 상태 정리·홈 "탈퇴했습니다". 받은 사람 안내 묶음은 Step 12에서 한다. 상호작용 요소에 `data-testid`. 시험(`web/test/u2-*.test.mjs`, 약 12개): 동의 창 재전송 한 번, 닫으면 실행 안 함, 한도 문구·남은 횟수 없음, 시작 안내 링크 여섯 개, 탈퇴 성공·실패 상태, 404·오류 화면 문구. — BR2.4·2.5·BR7.5·BR8.1·BR8.3·BR9.2, US16.2·US20.1·US14.1, NFR7.1

### 계약 변경에 기대는 부분 (맨 뒤)

- [x] **Step 12. C-01·C-11에 기대는 부분.** Step 1의 계약 수정 PR에 적은 모양대로 만든다. 리뷰에서 모양이 바뀌면 이 단계만 고친다.
  - api 게이트: JD_SUMMARY 전용 형식 지시·머리줄 인식(U1 BR3.4 앞)·역할 모양 검사·면접 질문/확인되지 않는 점 대조, "찾지 못함" `SERVER_NOTICE`(대문자 표기, 한글 없는 줄 첫 낱말 제외, 줄당 3개, 이번 sources 글과 대조), `GatedItem.jdRole`. 시험(`test/u2/ai-gate-jd.test.cjs`, 약 8개): S12·S12b·S12c·S13~S16, S16b~S16d.
  - web: 받은 사람 안내 묶음 컴포넌트(Claude 줄은 prop으로만, 기본 꺼짐). U4가 C-11 자리에 단다. 시험(`web/test/u2-recipient-guide.test.mjs`, 약 3개): 안내 항목, Claude 줄 on/off.
  - — BR4.1~4.8, BR8.2, US6.3, US16.2

### 설정·문서·마무리

- [x] **Step 13. 문서.** api/docs: `ai-run.md`(처리기 등록법, 시한이 2시간보다 길면 보관 상수를 함께 올릴 것), `file-storage.md`(설정 표: 없음/빈 문자열/틀림), `withdrawal.md`, `ai-generation.md` 갱신(U2 검사·JD 역할·상수 위치), `google-login.md`에 배포 앱 '프로덕션' 게시 절차와 확인 기록 칸. docs: `CatchU_통합확인.md`(시나리오 목록·확인 표·제출 준비 절, 「탈퇴 뒤 차단」 선행 조건 "U2 코드를 개발 서버에 올리기 전에 `FILE_STORAGE_DRIVER`·`FILE_STORAGE_LOCAL_ROOT`를 넣는다"). `dev-ci`와 환경변수 예시 파일은 고치지 않는다(팀장 공용 기반 작업으로 남김). — BR9.1·9.4·9.5, US1.1·US19.1·US19.2, NFR6.8
- [x] **Step 14. 검사와 커버리지.** api `npm run lint`·`npm run typecheck`, U2와 U1 시험 파일 실행, `TEST_COVERAGE_INCLUDE`로 U2 경로 줄 커버리지 80% 이상 확인(측정은 팀장이 넣은 `npm run test:coverage`). web `npm run lint`·`npm run typecheck`·U2 시험·`npm run test:coverage`. 기준을 낮추지 않고 못 미치면 그대로 보고한다.

## 스토리 → 단계

| 스토리 | 단계 |
|---|---|
| US1.1 로그인 대상 | Step 13(절차 문서), Step 11(Google만 보이는 로그인 화면 유지 확인) |
| US6.3 근거 검사·출처 표시 | Step 1, Step 9, Step 12 |
| US6.4 하루 한도 | Step 5, Step 11 |
| US14.1 탈퇴 | Step 4, Step 8, Step 10, Step 11 |
| US14.3 재가입 | Step 10 |
| US16.2 시작 안내·오류 화면 | Step 1, Step 11, Step 12 |
| US19.1·US19.2 통합 확인 | Step 13 |
| US20.1 동의·고지 | Step 6, Step 11 |
