# NC1 칸 제목과 링크 이름 — 코드 생성 계획

## Summary

- Builds: 작성자 설명 8칸 편집·칸별 발행본 보기, GitHub 링크 이름, 발행하면 열릴 링크 목록, 본인 목록 「작성자 설명」 걸러 보기(api 조건·커서 v2·응답 칸), 발행 화면 저장소 이름·설명 여부·걸러 보기·확인 안내
- Touches: web 새 `src/lib/author-description-sections.ts`·`src/lib/github-link-name.ts`, `src/features/assets/`(패널·편집기·화면·API·형·고정 자료·저장소), `src/features/publications/`(사본 보기·발행 화면·고르기 자료), api `src/catches/`(입력·저장소·읽기 칸·응답), 같은 규칙을 적은 web·api 문서
- Tests: web 새 시험 파일 2개(공통 함수, 약 30개)와 고칠 파일 7개(약 35개), api 고칠 시험 파일 2개(약 12개), 기존 시험은 그대로 통과

## 입력

- 기능 설계 `construction/nc1-sections-and-links/functional-design/`: `functional-spec.md`(W1~W4, 화면 상태, 한계), `rules.md`(BR1.1~BR7.6), `frontend-components.md`(공통 함수 모양, 바꿀 곳, 시험)
- NFR 요구·설계 `construction/nc1-sections-and-links/nfr-requirements/`, `nfr-design/`(성능·보안 설계, 논리 구성 요소)
- 계약 `inception/contract-design/contract-summary.md` C1(본인 목록 조건·응답 칸·커서 v2)·C7(web 공통 함수)
- Unit 정의 `inception/units-generation/unit-of-work.md`(NC1, ui, 첫 Unit 골격), 요구사항 `inception/requirements-analysis/requirements.md` FR1~FR8·NFR1·NFR2·NFR5~NFR8
- 이야기 `inception/user-stories/stories.md` US1.1~US5.4(수락 기준 58개)
- 다듬은 화면 `inception/refined-mockups/mockups.md`·`interaction-spec.md`
- 인프라 설계는 이 Unit에서 건너뛰었다(새 서비스·환경변수·CI·배포 변경 없음).

## 이 계획이 고치는 사람 쪽 파일

같은 규칙을 적은 문서를 모두 함께 고친다(이 프로젝트 규칙).

- 본인 목록 조건·커서·응답 칸(C1): `api/docs/catch-owner-read-preparation.md`(9행 목록 표, 21행 커서 문장). C1이 이 문서를 계약 문서로 정했다. 10월 기능 설계(`aidlc/.../260914-catchu-october-mvp/...`)는 지난 승인 기록이라 고치지 않는다.
- 내 자산 화면: `web/src/features/assets/README.md`(「Catch 작성자 설명 편집」 절의 자리·안내·글자 수·시험 명령, 「연결 경계와 제안」 표에 `authorDescription` 줄, 「확인할 동작」의 질문 문장), `web/src/features/assets/docs/list-screen.md`(선택 칸 표·쓰는 순서·[이 저장소 Catch 보기] 문장), `web/src/features/assets/docs/detail-screen.md`(칸 순서와 질문 아래 문구)
- 발행 화면·사본: `web/src/features/publications/README.md`(파일 표에 공통 함수 둘, 「발행」에 권장 안내·작은 줄·체크 칸·확인 안내·저장소 목록 요청, 「발행본 목록·상세」에 칸별 보기·링크 이름, 「시험」)
- 받은 사람 화면: `web/src/features/recipient/README.md` 49행(사본의 작성자 설명이 칸별로 보이고 링크가 이름으로 보인다는 한 줄)
- 고치지 않음: `api/docs/publications.md`(사본·작성자 설명 경로는 그대로), 화면 그림(`docs/images/`)

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
    },
    {
      "layer": "project",
      "text": "- ALWAYS Unit 확인 명령은 --timeout-ms 3600000(60분)으로 돌린다. 시작 전에 pmset -g batt로 충전기 연결을, sysctl -n vm.loadavg로 부하(1분 평균 6 미만)를 보고, 끝나면 결과와 함께 api·web·worker 각각 걸린 시간을 알린다. 기본 상한 30분은 배터리로 돌 때 api 시험 도중에 걸려 멈췄다. (learned 2026-11-10)"
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
  "input_sha256": "sha256:a24950ce0aa3e250dae085bc39ce7cc5a78c648b595ed5d8fa194ef62b0af990",
  "contract_sha256": "sha256:5a598f00a197bc131ca94a2a0b5f84fe01ddfd0a50f475f627aa20b6dd7a15bf"
}
```

## 단계

- [x] **Step 1. 구조·설정 확인** — 새 파일 자리(`web/src/lib/author-description-sections.ts`, `web/src/lib/github-link-name.ts`)와 불러오기 방향을 확인한다. 공통 함수 둘은 React·화면 모듈을 불러오지 않는 순수 함수이고, `github-link-name.ts`만 `github-source-url.ts`를 불러온다. 새 의존성·환경변수·마이그레이션·CI 변경은 없다. 고칠 파일 목록을 이 계획대로 확정한다. (전체)
- [x] **Step 2. 시험 실행기 확인** — `unit-test-instructions.md`의 Unit 시험 명령(web `node --test`, api `npm --prefix api test -- …`)을 고치기 전 코드에서 한 번 돌려 실행되는지 확인한다. 새 시험 파일 둘은 아직 없으므로 뺀 명령으로 돌린다. api 명령은 시험 DB(127.0.0.1:5433)가 있어야 하며, 없으면 사람에게 알리고 기다린다. (전체)
- [x] **Step 3. 시나리오·기대 결과·실패 조건 먼저 정하기** — US1.1~US5.4의 수락 기준 58개와 `unit-test-instructions.md` 「실패 조건」을 시험 파일·시험 이름에 짝짓는다. 시험 이름에 수락 기준 번호(AC1.1.1 등)를 적는다. 짝을 찾지 못한 기준이 있으면 이 단계에서 사람에게 알린다. (US1~US5)
- [x] **Step 4. 공통 함수: 칸 나누기·합치기** (BR1.1~BR1.6, frontend-components 2.1)
  - `web/src/lib/author-description-sections.ts`: `SECTION_TITLES`(8개, 순서 고정), `splitSections`(글이 있는 칸만, `start`는 UTF-16 위치, `joined`는 이은 칸), `sectionTexts`(편집용 8칸), `joinSections`(빈 칸 빼기, 「더 쓰기」만이면 칸 제목 없이, 모두 비면 빈 글), `countCodePoints`, `MAX_DESCRIPTION_LENGTH = 4000`.
  - 칸 제목 줄은 줄 전체가 `【칸 제목】`와 같을 때만 인정한다(앞뒤 공백 없음). 줄바꿈은 `\n`과 `\r\n`을 모두 줄 끝으로 읽고, 칸 글 안의 줄바꿈 문자는 바꾸지 않는다.
  - 구현 뒤 새 시험 파일 `web/test/author-description-sections.test.mjs`: 두 칸 합치기(AC1.1.1), 왕복과 칸 안 줄바꿈(AC1.1.2), 8칸 비움(AC1.1.3), 칸 안의 칸 제목 줄(AC1.1.5), 4,001자(AC1.2.1), 옛 3,990자 왕복(AC1.3.1), 「더 쓰기」만(AC1.3.2), 【참고】 줄, 같은 칸 두 번·첫 칸 제목 앞 글의 이은 칸 표시, 이모지가 든 글의 코드 포인트와 UTF-16 위치 차이.
  - 관련 스토리: US1.1, US1.2, US1.3
- [x] **Step 5. 공통 함수: 링크 이름과 링크 요소** (BR2.1~BR2.8, 보안 설계 1.2·1.3)
  - `web/src/lib/github-link-name.ts`: `githubLinkName(url, evidenceRepository)`, `evidenceRepositoryOf(sourceUrls)`, `collectLinks(texts)`. 방어 순서는 보안 설계 1.3 그대로다(`URL` 실패·포트·표 밖 꼴은 주소 전체 → 마디별 `decodeURIComponent`, 실패 마디는 원문 → `/[\p{Cc}\p{Cf}]/gu` 지우기 → 다른 저장소 앞붙임).
  - `web/src/features/publications/github-link.tsx`(새 부품): `href`·`title`은 원래 주소, `target="_blank"`, `rel="noopener noreferrer"`, 숨은 「(새 탭)」, `data-testid="github-link"`. 강조로 감쌀 때를 위해 `children`을 받는다.
  - 구현 뒤 새 시험 파일 `web/test/github-link-name.test.mjs`: 파일 줄 링크(AC2.2.1), 폴더·브랜치(AC2.2.2), 다른 저장소 커밋(AC2.2.3), 질의 무시(AC2.2.4), 잘못된 인코딩(AC2.2.5), 한글 경로(AC2.2.6), 제어·방향 바꿈 문자(AC2.2.8), 한 줄 `#L3`, PR 링크, 표 밖 꼴(`#L10C2`·`/pull/12/files`·`/tree/main`), 포트 든 주소(`https://github.com:8443/o/r/blob/ba6bba8/a.ts#L3`), 근거 저장소 대소문자 무시, 링크 모으기 순서·중복 없음(AC2.3.3), 끊긴 한글 주소(AC2.3.2), 이름 계산이 입력 글을 바꾸지 않음(AC2.2.10 앞부분).
  - 관련 스토리: US2.2, US2.3
- [x] **Step 6. api 본인 목록: 조건·커서 v2·읽기 칸·응답 칸** (BR5.1~BR5.3, 계약 C1, 보안 설계 2·3, 성능 설계 2)
  - `api/src/catches/owner-catch-input.ts`: 받는 키에 `authorDescription`(`written`·`unwritten`만, 그 밖·빈 값·배열은 400). 커서 `{ v: 2, scope, after }`, `scope`에 `authorDescription ?? null`을 더한다. `v !== 2`는 400.
  - `api/src/catches/owner-catch-store.ts`: 값에 따라 고정 SQL 조각(`c.author_description IS NOT NULL` / `IS NULL`) 하나를 조건 배열에 더한다. 정렬·`limit + 1`은 그대로다.
  - `api/src/catches/catch-reader.ts`: `READ_COLUMNS`에 `c.author_description IS NOT NULL AS "hasAuthorDescription"`, `ReadRow`에 칸 하나.
  - `api/src/catches/owner-catch-response.ts`: `OwnerCatchReadSource`·응답 형에 `hasAuthorDescription`(boolean, 아니면 무결성 오류), `toOwnerCatchResponse`가 싣는다.
  - `api/src/catches/public-catch-store.ts`는 고치지 않는다(`publicResponse`가 칸을 골라 담는다).
  - 구현 뒤 `api/test/catches/owner-catch-http.test.cjs`: 조건 셋(AC4.1.1, 25번째 Catch가 첫 쪽에), 다른 조건 커서 400(AC4.1.2), 회원 두 명 범위, 잘못된 값 400(빈 값·배열·대소문자), v1 커서 400, 목록·상세 `hasAuthorDescription`과 `written` 판정이 같음(AC5.2.3), 공개 Catch·공개 목록 응답 키 집합이 그대로이고 새 칸이 없음. `api/test/catches/owner-catch-response.test.cjs`: 응답 칸 싣기와 boolean 아닌 값의 무결성 오류. 응답 모양을 통째로 견주는 기존 시험(`owner-catch-http.test.cjs` 262행 「계약 필드」, `api/test/integration/` 안 본인 Catch 응답을 견주는 시험)은 새 칸을 더해 고친다. 공개 응답 시험은 고치지 않는다.
  - 관련 스토리: US4.1, US5.2
- [x] **Step 7. web 응답 검사·형·목록 요청·저장소** (BR5.1~BR5.4, frontend-components 4)
  - `web/src/features/assets/types.ts`: `CatchAsset`에 `hasAuthorDescription: boolean`. `fixtures.ts`의 `previewCatches`에 값을 둔다(쓴 것과 안 쓴 것이 섞이게).
  - `web/src/features/assets/catch-api.ts`: `isCatch`가 `hasAuthorDescription` boolean을 요구한다. `list`는 `{ repositoryId, authorDescription }` 걸러 보기 하나를 받아 질의에 붙이고, 응답 검사에 「`written`이면 모두 참, `unwritten`이면 모두 거짓」을 더한다.
  - `web/src/features/assets/assets-store.ts`: 목록 열쇠를 저장소 하나에서 걸러 보기(저장소·작성자 설명)로 넓힌다. 열쇠가 바뀌면 커서를 지우고 첫 쪽부터 부른다. 지금의 늦은 응답 버리기·합치기·다음 쪽 실패 유지는 그대로다.
  - `assets-api-preview.tsx`·`assets-connected.tsx`의 모의 응답·호출을 새 모양에 맞춘다.
  - 구현 뒤 `web/test/assets-api.test.mjs`: 질의 매개변수, 응답 검사(칸 없음·조건과 맞지 않는 항목 거부), 열쇠가 바뀌면 커서 초기화, 「더 보기」 400의 지금 실패 상태(AC4.1.2 화면 쪽).
  - 관련 스토리: US4.1, US4.2
- [x] **Step 8. 내 자산 목록: 「작성자 설명」 선택 칸과 빈 결과** (BR5.4~BR5.6, FR7)
  - `assets-connected.tsx`: 주소 매개변수 `authorDescription`(`written`·`unwritten`, 그 밖은 전체)을 읽고 바꾼다. 상세를 닫아도 유지하고 뒤로·앞으로 가기·새로고침으로 되살린다. [이 저장소 Catch 보기]는 공개 상태처럼 전체로 되돌린다(막 분석한 Catch는 설명이 없어 「씀」에 가려지므로, 지금 공개 상태 문장과 같은 이유).
  - `assets-view.tsx`: 저장소·공개 상태 다음에 `label`+`select` 「작성자 설명: 전체/씀/안 씀」. 미리보기 방식은 `hasAuthorDescription`으로 화면 안에서 거른다. 빈 결과 분기 순서는 BR5.5대로 설명 조건 안내 → 지금 공개 상태 분기 → 지금 「아직 표시할 Catch가 없습니다」. 카드에는 설명 여부를 보이지 않는다. 저장 뒤 지금 쪽은 다시 부르지 않는다.
  - 구현 뒤 `web/test/assets-view.test.mjs`: 선택 칸 `label`과 순서·개수 줄 `aria-live`(AC4.1.4), 「씀」 빈 결과 제목·본문(AC4.1.3)과 저장소를 골랐을 때 「이 저장소에 」, 「안 씀」 빈 결과, 카드에 표시 없음(AC4.1.5), 저장 뒤 지금 쪽 유지(AC4.2.1), 미리보기 거르기.
  - 관련 스토리: US4.1, US4.2
- [x] **Step 9. 내 자산 상세: 순서·안내·8칸 편집·링크 목록** (BR3.1~BR3.3, BR4.1~BR4.5, BR1.5, BR1.6)
  - `assets-view.tsx` 상세 순서: 작업 사실·나의 기여 → 근거 → (다시 볼 곳 자리, NC1은 그리지 않음) → Catch 설명 초안 → 생각해 볼 질문 → 작성자 설명(편집) → 현재 확인 상태. 질문 아래 문구를 「질문을 보고 아래 칸에 자기 말로 적어 보세요.」로 바꾼다.
  - `author-description-panel.tsx`: 안내 첫 문장 교체와 공개 범위 안내 추가(BR4.3), 칸 제목 8개를 보이는 `label`로, 글칸 8개(`rows={3}`, 높이 늘리기 허용), 「짚어 볼 곳」 아래 안내 다섯 가지(BR4.4 문구 그대로), h4 「발행하면 면접관에게 열릴 링크」와 목록(`GithubLink`, `aria-live` 없음)·두 안내, 합계 줄 「N / 4,000자 (칸 제목 포함)」, `useId`로 `aria-describedby` 연결(BR4.5). 패널 입력은 8칸 글과 칸 하나 바꾸기 콜백, 근거 주소 목록이다.
  - `author-description-editor.tsx`: 상태를 8칸(`texts`)과 처음 나눈 칸(`savedTexts`)으로 바꾼다. 저장은 `joinSections` 결과 하나를 지금 경로로 보낸다. 4,000자 검사는 합친 글로 한다. 「저장하지 않은 변경」은 칸 글이 처음 나눈 칸 글과 다를 때만 참이다(BR1.6). 저장 중 더 친 글을 덮지 않는 지금 동작과 늦은 응답 버리기는 그대로다. 저장 중에는 8칸 모두 쓸 수 없다.
  - `author-description-api.ts`: 4,000자 검사가 공통 함수의 `countCodePoints`·`MAX_DESCRIPTION_LENGTH`를 쓰게 한다. 경로·응답 모양은 그대로다.
  - 구현 뒤 `web/test/author-description.test.mjs`·`author-description-editor.test.mjs`·`assets-view.test.mjs`: 칸 제목 8개와 `label`(AC1.1.4), 두 칸 저장 본문(AC1.1.1), 다시 열기(AC1.1.2), 모두 비움(AC1.1.3), 칸 안 칸 제목 줄 저장(AC1.1.5), 4,001자(AC1.2.1), 합계 줄(AC1.2.2), 옛 글이 「더 쓰기」에 열리고 「저장하지 않은 변경」이 없음(AC1.3.1), 「더 쓰기」만(AC1.3.2), 안내 다섯 가지(AC2.1.1), 근거 밖 커밋 저장과 단추·목록 없음(AC2.1.2), 링크 목록 두 링크·중복 없음·두 안내·h4·`aria-live` 없음·API 요청 없음(AC2.3.1~AC2.3.7), 상세 순서(AC3.1.1·AC3.1.2), 질문 문구(AC3.1.3), 편집 안내(AC3.2.1·AC3.2.2).
  - 관련 스토리: US1.1, US1.2, US1.3, US2.1, US2.3, US3.1, US3.2
- [x] **Step 10. 사본 보기: 칸별 보기·링크 이름·강조** (BR7.1~BR7.6, BR2.6, BR2.7)
  - `web/src/features/publications/snapshot-view.tsx`: Catch 작성자 설명을 `splitSections`로 나눠 글이 있는 칸만 h5 칸 제목과 그린다. 「더 쓰기」 하나뿐이면 h5 없이, 다른 칸과 함께면 h5 「덧붙인 말」. 없으면 지금 「작성자 설명이 없습니다.」. 칸 순서·#488 순서·근거 접기는 그대로다.
  - 작성자 설명 칸 글의 링크만 `GithubLink`(이름)로 그린다. 텍스트 자료 본문은 지금처럼 주소 전체다(AC2.2.9). 근거 저장소는 사본 근거 주소의 `evidenceRepositoryOf`다.
  - 강조: 칸마다 `[start, start + text.length)`와 겹치는 부분만 칸 안 위치로 바꾸고, 이은 칸은 강조하지 않는다. 링크와 겹치면 지금처럼 링크 전체를 감싼다. 위치는 원래 주소 길이로 센다.
  - 받은 사람 화면과 작성자 발행본 상세는 같은 부품을 쓰므로 둘 다 바뀐다.
  - 구현 뒤 `web/test/publications-owner.test.mjs`·`web/test/recipient.test.mjs`: 두 칸만 보임과 「덧붙인 말」(AC1.4.1), 없음(AC1.4.2), 칸 순서(AC1.4.3), 빈 칸 h5 없음(AC1.4.4), 작성자 발행본 상세가 같음(AC1.4.5), 옛 글(AC1.5.1), 「더 쓰기」만(AC1.5.2), 링크 이름·`title`·숨은 「(새 탭)」·새 탭 속성(AC2.2.1·AC2.2.7), 텍스트 자료 본문은 주소 전체(AC2.2.9), 링크가 든 문장 강조(AC2.2.10), 칸 제목 줄에만 걸친 강조는 없음, 이은 칸 강조 없음, 긴 경로 줄바꿈 스타일(AC2.2.11), `<script>` 꼴 칸 글이 글자로 보임.
  - 관련 스토리: US1.4, US1.5, US2.2
- [x] **Step 11. 발행 화면: 권장 안내·작은 줄·걸러 보기·확인 안내** (BR6.1~BR6.7, 성능 설계 1)
  - `web/src/features/publications/publish-screen.tsx`: `PublishClients`에 저장소 목록(`Pick<RepositoryApi, "repositories">`)을 더하고, 화면을 열 때 `createRepositoryOptionsStore`를 한 번 만들어 `refresh()`, 닫을 때 `dispose()`. 모델에 `writtenOnly`(처음 거짓)와 바꾸기 동작을 더한다. 바꾸면 Catch 목록만 첫 쪽부터 다시 부르고(`authorDescription=written`), 고른 자료는 그대로다.
  - `web/src/features/publications/publish-sources.ts`: `CatchSource`에 `repositoryId`·`hasAuthorDescription`, `SelectedItem`에 `hasAuthorDescription`(텍스트 자료는 null). `catchSourceOf`가 옮겨 담는다.
  - `web/src/features/publications/publish-view.tsx`: 기존 안내 아래 「저장소마다 3~5개를 권합니다.」, 「내 Catch」 아래 체크 칸 「작성자 설명을 쓴 Catch만 보기」(`label`, 발행 중에만 막힘)와 개수 줄 「불러온 N개의 Catch」(`aria-live="polite"`), 켰는데 비면 「작성자 설명을 쓴 Catch가 없습니다」, 항목 단추 작은 줄 「저장소 이름 · 공개 상태 · 설명 안 씀 · 불일치 표시됨」(이름을 모르면 이름만 뺌), 확인 단계 「작성자 설명이 없는 Catch가 N개 있습니다. 면접관에게는 「작성자 설명이 없습니다.」로 보입니다」(N이 0이면 그리지 않음, [발행]은 막지 않음). 저장소별 개수 경고·추천·순위는 없다.
  - 구현 뒤 `web/test/publish.test.mjs`: 권장 안내(AC5.1.1), 7개 골라도 경고 없음(AC5.1.2), 저장소 이름과 「설명 안 씀」(AC5.2.1), 새로 열면 새로 불러옴(AC5.2.2), 체크 칸을 켜도 고른 A가 남음(AC5.3.1), 처음 꺼짐·켜면 첫 쪽부터(AC5.3.2), 최대 개수 유지(AC5.3.3), `label`·`aria-live`(AC5.3.4), 확인 안내 2개와 [발행] 가능(AC5.4.1), 0개면 없음(AC5.4.2), 저장소 목록 실패 때 이름만 빠짐, 체크 칸을 바꿔도 저장소 목록 요청이 더 없음(NFR1.2).
  - 관련 스토리: US5.1, US5.2, US5.3, US5.4
- [x] **Step 12. 화면 모양** (BR4.5, BR7.6, 다듬은 화면)
  - `web/src/features/assets/assets.module.css`: 칸 제목 `label`, 글칸 3줄 시작·세로 늘리기, 링크 목록, 안내 목록. 지금 760px 기준 외에 새 꺾임점은 없다.
  - `web/src/features/publications/publications.module.css`: h5 칸 제목(h4보다 한 단계 작고 굵게, 새 색 없음), 링크 이름 `overflow-wrap: anywhere`(지금 글 모양 유지), 발행 화면 체크 칸·작은 줄.
  - 관련 스토리: US1.1, US1.4, US2.2
- [x] **Step 13. 문서** — 「이 계획이 고치는 사람 쪽 파일」의 api·web 문서를 고친다. 문서 크기 검사(`docs-size`)를 돌린다. (전체)
- [x] **Step 14. 검증** — 이 Unit의 시험 명령을 돌리고, intent 검증 명령(`verification-command.txt`, api·web·worker 전체 검사·시험·커버리지)을 60분 상한으로 돌린다. 시작 전에 `pmset -g batt`(충전기)와 `sysctl -n vm.loadavg`(1분 평균 6 미만)를 보고, 끝나면 api·web·worker 각각 걸린 시간을 `code-summary.md`에 적는다. 기존 시험이 모두 통과하는지 확인한다. (전체)
- [x] **Step 15. 로컬 실제 연결 확인(최소 연결 첫 결과)** — bolt-plan B1 「보일 결과」대로 로컬 api·DB·web에서 개발 로그인으로 Catch 하나에 「이 작업에서 정한 것」과 「짚어 볼 곳」(GitHub 줄 링크)을 쓰고 저장한다. 「작성자 설명: 씀」으로 걸러 보고 발행한다. 받은 사람 링크로 열어 두 칸만 칸 제목과 함께 보이고 링크가 「파일 · 줄 · 판본」 이름으로 보이는지 확인한다. 서버를 띄우기 전에 사람에게 알리고, 결과(화면에서 본 것, 합성 자료인지)를 `code-summary.md`에 적는다. 이 확인은 전체 완료나 배포 성공이 아니다(팀 규칙). (US1.1, US1.4, US2.2, US4.1, US5.3)

- [x] **Step 16. 커밋 화면 바뀐 줄 주소 이름과 「짚어 볼 곳」 안내 줄이기 (Step 15 확인 중 팀장 발견, 팀장 결정 2026-11-10)** (BR2.2, BR4.4, FR3.1, FR4.1)
  - 까닭: Step 15에서 팀장이 직접 해 봐도 GitHub 줄 고정 주소(permalink)를 얻기 어려웠다(줄 번호 누르기·`y`·View file을 알아야 함). 처음 자연스럽게 복사한 주소는 커밋 화면의 바뀐 줄 주소(`/commit/<sha>#diff-<해시>R16-R23`)였는데, 지금 규칙에서는 주소 전체로 보였다.
  - `web/src/lib/github-link-name.ts`: 커밋 링크의 조각이 `#diff-<64자 16진수>R<시작>-R<끝>`·`#diff-<…>R<줄>`이면 「커밋 0874001 · 바뀐 줄 16–23」(한 줄이면 「바뀐 줄 16」), `L` 쪽이면 「커밋 0874001 · 이전 줄 16–23」. L과 R이 섞인 범위, 줄 번호 없는 `#diff-…`, 그 밖의 조각은 지금처럼 주소 전체다. 다른 저장소 앞붙임·질의 무시·포트 처리는 지금 규칙 그대로다. 본인 커밋 표지(NC2)는 「커밋 0874001」 바로 뒤에 붙을 수 있게 이름 조각을 나눠 둔다(NC2가 쓸 자리, NC1은 표지를 만들지 않음).
  - `web/src/features/assets/author-description-panel.tsx` `POINT_HINTS`: 커밋 화면 한 가지 방법으로 줄인다. ① 면접관이 설명을 청할 만한 줄 고르기(그대로) ② 「위 근거의 본인 커밋을 열고, 바뀐 줄의 줄 번호를 누르세요(여러 줄이면 Shift를 누른 채 끝 줄 번호도 누르세요). 주소창의 주소를 그대로 붙이세요.」 ③ 「메모에 파일 이름과 짚을 까닭을 적으세요.」(「한 줄에 링크 하나와 메모 한 줄」을 바꿈) ④ 관련 커밋 안내(그대로). Copy permalink 안내와 한글 파일 이름 안내는 뺀다(커밋 화면 주소는 파일 경로가 기호로 들어가 한글 앞에서 끊기지 않는다). 파일 줄 링크(`/blob/…#L…`)는 지금처럼 받아들이고 이름을 짓는다.
  - 시험: `web/test/github-link-name.test.mjs`에 바뀐 줄 범위·한 줄·이전 줄·L/R 섞임과 줄 번호 없는 `#diff-…`(주소 전체)·다른 저장소 앞붙임을 더한다. `web/test/author-description.test.mjs` AC2.1.1을 새 안내 넷으로 고친다.
  - 같은 규칙을 적은 문서를 함께 고치고, 바꾼 줄에 까닭(Step 15 확인 중 팀장 발견, 2026-11-10)을 적는다: `inception/requirements-analysis/requirements.md`(FR3.1 표에 한 줄, FR4.1 안내), `inception/user-stories/stories.md`(AC2.1.1 안내), `inception/refined-mockups/mockups.md`(링크 이름 표와 짚어 볼 곳 안내), `construction/nc1-sections-and-links/functional-design/rules.md`(BR2.2, BR4.4), `web/src/features/assets/README.md`, `web/src/features/publications/README.md`(링크 이름을 적은 곳). 아이디에이션 대략 화면과 질문 파일은 지난 기록이라 고치지 않는다.
  - 고친 뒤 Unit 시험 명령과 web lint·typecheck를 다시 돌리고 결과를 `code-summary.md`에 적는다.
  - 관련 스토리: US2.1, US2.2

## 스토리와 단계

| 스토리 | 단계 |
|---|---|
| US1.1·US1.2·US1.3 | Step 4, 9, 12 |
| US1.4·US1.5 | Step 10, 12 |
| US2.1 | Step 9 |
| US2.2 | Step 5, 10, 12 |
| US2.3 | Step 5, 9 |
| US3.1·US3.2 | Step 9 |
| US4.1·US4.2 | Step 6, 7, 8 |
| US5.1~US5.4 | Step 6, 11 |

## 다른 작업의 파일

- 12월 intent(260925-intent-12)의 파일은 이 계획이 고치는 것(`api/src/catches/`의 네 파일과 시험, `web/src/features/assets/`·`publications/`·`recipient/README.md`)만 고친다. 그 밖은 읽기만 한다.
- `web/src/lib/github-source-url.ts`(판별 규칙)와 `web/src/features/assets/repository-options-store.ts`는 고치지 않고 불러다 쓴다.
- `api/src/catches/public-catch-store.ts`는 고치지 않는다.
