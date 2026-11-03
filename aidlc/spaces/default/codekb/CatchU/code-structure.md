# 코드 구조 — CatchU

> 범위: 2026-11-03 집중 스캔(`kind: partial`), 기준 커밋 `9923226c`. 아래 표의 「깊이」 칸이 이 스캔에서 실제로 읽은 정도다(깊게 / 훑음 / 목록만). 이번 합치기에서 U4 #461의 작성자 설명·텍스트 자료 파일을 더했다.

## 최상위 배치

| 경로 | 무엇 | 이 스캔 |
|---|---|---|
| `web/` | Next.js 앱 | `src/features/assets`, `src/features/materials`, `src/features/recipient`, `src/components/ai-consent`만 |
| `api/` | NestJS 서비스 | `src/` 아래 분석·Catch(작성자 설명 포함)·텍스트 자료·고지·발행·탈퇴 모듈과 `docs/`만 |
| `api/contracts/repository-analysis/` | api·worker 공유 메시지 계약 | 스냅샷 밖, 훑음 |
| `worker/` | Python worker | `app/`, `docs/`, 설정 파일 |
| `docs/` | 팀 문서 정본 | 스캔하지 않음(입력 문서만 참고) |
| `aidlc/`, `.claude/` 등 | AI-DLC 설치·작업 공간 | 제외 |

## worker (`worker/app/`)

기능별 패키지이고, 처리 순서가 패키지 순서와 같다: `consumer` → `processing` → `collection` → `candidates` → `generation` → `processing.result`.

| 패키지·파일 | 분류 | 역할 | 깊이 |
|---|---|---|---|
| `collection/records.py` | 모델 | `CommitRecord`(sha·parents·**message**·author·changes), `PullRequestRecord`(number·**title**·body·state·**author**·commits·commits_truncated), `IssueRecord`, `DetailStatus` | 깊게 |
| `collection/limits.py` | 설정 | `CollectionLimits`: 호출 2,500·총량 50 MiB·30분·커밋 3,000·PR 600·이슈 1,000·커밋 상세 1,500 등 | 깊게 |
| `collection/evidence.py` | 서비스 | 근거 재료: GitHub 화면 주소, 관측 사실(「커밋 {SHA 12자}, 작성 시각 …」「병합 커밋(부모 N개)」「변경 파일 N개, 추가 X줄·삭제 Y줄」「PR #n, 상태 …」「PR 커밋 N건」「이슈 #n, 상태 …」), 한계 문구 | 깊게 |
| `collection/collect.py` | 서비스 | 수집 순서, `CollectionOutcome`(본인 커밋 관측 `with_observation`, `evidence_for`, `shared_limits`) | 훑음 |
| `collection/relations.py`·`graph.py`·`gateway.py` 등 | 서비스·어댑터 | 관계 조회(PR 커밋 목록·연결 PR·병합 경계), GitHub 전송 | 목록만 |
| `candidates/grouping.py` | 서비스 | `group(outcome)`: 소속 → PR 없는 병합 → 같은 변경 → 배정 → 커밋 묶음 → **나누기(`_split`)** → 단위 목록(`_units`). `GroupedUnit`(unit·changes·parts·issues·notes·other_authors 등) | 훑음(설명·나누기 절) |
| `candidates/identity.py` | 유틸 | `work_identity`(`wi1:` + 정규 JSON SHA-256), 단위 `PullRequestUnit`·`MergeUnit`·`CommitsUnit`·`IssueUnit`, `Part` | 깊게 |
| `candidates/build.py` | 서비스 | `build_candidates`: 후보 자격, notProvided 집계, 작업 사실·나의 기여·묶음 설명·한계·근거(본인 커밋 최근 20건), 같은 열쇠 후보 합치기. 제목 `None` | 깊게 |
| `candidates/same_change.py` | 유틸 | patch-id, cherry-pick 표시, `issue_references`(메시지의 `#번호` 읽기) | 목록만 |
| `generation/flow.py` | 서비스 | `run_generation`: 재료 → 가리기 → 크기 선별 → 호출 1회 → 판정 → 고쳐 쓰기 → `_apply` | 깊게 |
| `generation/material.py` | 어댑터 | 후보와 단위를 `wi1`로 맞춰 재료 커밋(FETCHED 본인 커밋)을 찾음. `CandidateMaterial` | 깊게 |
| `generation/request.py` | 서비스 | patch 해석·가리기 적용(`prepare`), **크기 선별(`select`)**, 지시문 `GENERATE_INSTRUCTIONS`·`REWRITE_INSTRUCTIONS` | 깊게 |
| `generation/limits.py` | 설정 | `GenerationLimits`(호출 300·고쳐 쓰기 20·자료 24,000 B·전체 32,000 B·출력 4,000 B·제목 40자 등), `CallBudget` | 깊게 |
| `generation/title.py` | 서비스 | `classify`(시험·문서·설정·코드), `decide`(조각 제목 「{대상} {종류} {동작}」) | 깊게 |
| `generation/render.py` | 유틸 | 설명·질문 틀 문장 | 깊게 |
| `generation/outcome.py` | 모델 | 실패 코드(`GENERATION_*`)·회원용 문구·근거 한계 문구 | 깊게 |
| `generation/provider.py` | 인터페이스 | `GenerationProvider` Protocol, `ProviderRequest`(purpose `GENERATE`·`REWRITE_TITLE`), `ProviderError`·`UnusableResponse` | 깊게 |
| `generation/claude.py` | 어댑터 | Anthropic 어댑터(Haiku 5.5, `inference_geo="us"`, 재시도 0, 구조화 출력, 응답 크기 상한) | 훑음 |
| `generation/redact.py` | 유틸 | 비밀값·개인정보 가리기(`MaskBook`, 비밀 파일 판정) | 훑음 |
| `generation/response.py`·`names.py`·`patch.py` | 유틸 | 응답 해석·이름 대조·patch 해석 | 훑음·목록만 |
| `processing/request_check.py` | 미들웨어 | 계약 검사 → 접수 맥락 대조(고지 판본 포함) → 현재 시도 | 깊게 |
| `processing/pipeline.py` | 서비스 | `process_request`: 검사 → RECEIVED·RUNNING 알림 → 생성기 → `Result` 조합·검사 | 깊게 |
| `processing/result.py` | 서비스 | `compose_result`(계약 v2 `Result`, `schemaVersion: "2"`), `outcome_for` | 깊게 |
| `processing/generation.py` | 모델 | `EligibleCandidate`·`DraftOutcome`·`ReflectionOutcome`·`EvidenceItem`·`GenerationOutput`·`Generator` | 깊게 |
| `processing/live.py` | 서비스 | `LiveGenerator`: 수집 → `build_candidates` → 후보가 있으면 `run_generation` | 깊게 |
| `contract/worker_messages.py` | 유틸 | 계약 YAML을 `api/contracts/repository-analysis/`에서 읽어 jsonschema로 검사 | 깊게 |
| `consumer/` | 진입점 | BullMQ 소비자(부모·자식 프로세스), 설정(`CATCHU_GENERATION_API_KEY` 필수), LIVE 조립(`child.live_assembly`) | 훑음 |
| `request_context/` | 어댑터 | api 맥락 조회 클라이언트·해석 | 목록만 |

시험은 `worker/tests/`에 영역별 `test_<영역>_<주제>.py`로 있다(후보 5개, 수집 7개, 생성 8개, 소비자 4개 등 35개). 합성 대역(`*_synthetic.py`)과 시나리오(`*_scenarios.py`)를 같이 둔다.

## api (`api/src/`)

NestJS 기능 모듈 폴더마다 `*.module.ts`·`*.controller.ts`·`*.service.ts`·`*.entity.ts`를 둔다. U4의 작성자 화면 API는 서비스 대신 `*-store.ts`(SQL 한 문장 + 소유자 조건)와 `*-input.ts`(본문·쿼리 검사)로 나눈다.

| 폴더·파일 | 분류 | 역할 | 깊이 |
|---|---|---|---|
| `analysis-intake/` | 컨트롤러·서비스 | 고지(`analysis-notice.ts`의 `REAL_NOTICE` v2·`SYNTHETIC_NOTICE`), 접수(`analysis-intake.service.ts`), 상태·이력·하루 한도 | 고지 깊게, 접수 훑음 |
| `analysis-queue/` | 어댑터 | `buildRequestMessage`·`AnalysisRequestDispatcher`(DB → 큐), 큐 설정, 결과·알림 받기 | 보내기 깊게 |
| `worker-context/` | 컨트롤러·서비스 | worker 전용 맥락 조회(접수 맥락·토큰·저장소 좌표·허용 자료 종류) | 깊게(모듈 파일 제외) |
| `analysis-receiver/` | 서비스 | 계약 검사기(`WorkerMessageValidator`), 수신 판정·저장, `AnalysisRegistrationService`(수신 → 보호 관측 → 반영), `RepositoryRegistrationPort` | 핵심 깊게 |
| `result-application/` | 서비스 | `ResultApplicationService.apply`(한 트랜잭션: 잠금 → 맥락 대조 → 등록 → APPLIED·CLOSED), `RegistrationPort` | 깊게(엔티티 제외) |
| `catches/` 등록 | 서비스·모델 | `registerCandidates`(회원·`wi1` 잠금 → 찾기·만들기), `prepareRegistrationBatch`, `prepareNewCatchContent`, 엔티티 `catch_asset`(작성자 설명 두 칸 포함)·`catch_evidence`·`candidate_registration`·`repository_protection` | 깊게 |
| `catches/author-description.controller.ts` | 컨트롤러 | `GET`·`PUT catches/:catchId/description`, 쿼리 비어 있음 확인 | 깊게 |
| `catches/author-description-store.ts` | 저장소 | `AuthorDescriptionStore.read`(REPEATABLE READ)·`save`(READ COMMITTED), 회원 `FOR KEY SHARE`, 두 칸 `UPDATE … RETURNING`, 두 칸 짝 확인 | 깊게 |
| `catches/author-description-input.ts` | 유틸 | `authorDescriptionInput`(형식·NUL·서로게이트·4,000 코드 포인트, 공백뿐이면 null) | 깊게 |
| `catches/catches.module.ts` | 설정 | 컨트롤러 둘·공급자 셋 등록, `OwnerCatchStore`·`PublicCatchStore`만 내보냄 | 깊게 |
| `catches/` 조회 | 서비스 | 회원·공개 조회(`owner-catch-*`, `public-catch-store.ts`) | 훑음 |
| `materials/` | 컨트롤러·저장소·모델 | `TextMaterialsController`(목록·만들기·읽기·고치기·지우기), `TextMaterialStore`, `text-material-input.ts`(길이·커서·쿼리 검사), `TextMaterial` 엔티티, `MaterialsModule`(`AppModule`에 등록) | 깊게 |
| `withdrawal/` | 서비스 | 탈퇴 4단계(접근 차단 → 회원 파일 → 자격정보 파일 → 회원 행 연쇄 삭제) | 서비스 깊게 |
| `ai-consent/` | 서비스 | `AI_NOTICE_VERSION` `2026-11-v1`, `AiConsentGate`(동의 확인·기록) | 게이트 깊게 |
| `publications/` | 모델 | 발행 사본 모양(`CatchSnapshot`: workFacts·subjectContribution·evidence·authorDescription·aiDraft·mismatch) | 사본 모양 깊게 |
| `published-index/` | 서비스 | 조각 나누개(`chunker.ts`: workFacts → subjectContribution → evidence.representedFacts → authorDescription, aiDraft 제외), 임베딩 | 훑음 |
| `recipient/` | 컨트롤러·서비스 | 받은 사람 공개 조회 | 목록만 |
| `database/migrations/1793162230851-CreatePublicationTables.ts`·`1793162230852-AddCatchAuthorDescription.ts` | 마이그레이션 | `text_material`·발행 표 생성, `catch_asset`에 설명 두 칸과 짝 CHECK 추가 | 훑음(설명·자료 줄 검색) |

`api/docs/`에는 기능별 문서 43개가 있다. 이 스캔은 `member-withdrawal-deletion.md`·`publications.md`·`withdrawal.md`를 깊게, 분석 접수·큐·수신·반영·U7·등록 규칙 문서는 제목과 재분석 문단만 읽었다.

시험(이번에 더해진 것, 이름과 시나리오만 확인): `api/test/catches/author-description-api.test.cjs`(S1 저장·경계값·남의 Catch 404·로그 비노출, S2 재분석 뒤 설명 유지·새 Catch는 NULL), `api/test/materials/text-materials-api.test.cjs`(S3 CRUD·경계값·교차 접근 404·커서).

## web (`web/src/`)

| 경로 | 분류 | 역할 | 깊이 |
|---|---|---|---|
| `features/assets/types.ts` | 모델 | `CatchAsset`(title·workFacts·subjectContribution·evidence·draft·reflection·confirmation·mismatch·visibility·restriction·sourceMode). 작성자 설명 칸 없음 | 깊게 |
| `features/assets/assets-view.tsx` | 화면 | 구직자 Catch 목록·상세 대화상자, `GeneratedContentNotice`(80~90행), 상세의 `descriptionEditor` 자리(근거와 「Catch 설명 초안」 사이, 290행) | 깊게 |
| `features/assets/author-description-api.ts` | 어댑터 | `GET`·`PUT` 호출, 응답 모양 확인(`isAuthorDescription`), 4,000자 검사, `applyDescriptionSave`, `isDescriptionDirty` | 깊게 |
| `features/assets/author-description-editor.tsx` | 화면·상태 | `createDescriptionEditorModel`(열 때 읽기, 늦은 응답·로그인 바뀐 뒤 응답 버림, 저장 중 추가 입력 보존), `AuthorDescriptionEditor`(미저장 이탈 확인 세 갈래) | 깊게 |
| `features/assets/author-description-panel.tsx` | 화면 | 「작성자 설명」 영역 그리기(불러오는 중·실패와 다시 불러오기·입력칸·글자 수·상태 줄·[설명 저장]) | 깊게 |
| `features/assets/assets-connected.tsx`·`assets-member-page.tsx` | 조립 | `descriptionApi` 전달, 모달 닫기·다시 불러오기 전 미저장 확인(`reloadDetail`) | 훑음(바뀐 부분) |
| `features/materials/materials-api.ts` | 어댑터 | 텍스트 자료 호출·모양 확인·길이 검사·결과 반영·안내 문구, `SENSITIVE_INFO_NOTICE` | 깊게 |
| `features/materials/materials-screen.tsx` | 화면·상태 | 목록·선택 모델(`createMaterialsScreenModel`), 편집기 모델(`createMaterialEditorModel`), `MaterialsPage` | 깊게 |
| `features/materials/materials-view.tsx` | 화면 | `MaterialsListView`·`MaterialEditorView` 그리기 | 깊게 |
| `features/materials/materials.module.css`·`README.md` | 모양·문서 | 화면 모양, 동작·한계·시험 안내 | 깊게 |
| `app/(member)/materials/page.tsx` | 진입점 | `/materials` 주소 연결 | 훑음 |
| `lib/save-outcome.ts` | 유틸 | 저장 실패 구분(`SaveFailure`)·문구·`EditStatus`·`codePointLength`. 작성자 설명과 텍스트 자료가 함께 씀 | 훑음 |
| `features/recipient/recipient-format.ts` | 유틸 | `generatedNotice`, `hasGeneratedDraft`, `missingDraftText`, `isGithubSourceUrl`, 비밀번호 안내 | 깊게 |
| `features/recipient/recipient-screen.tsx` | 화면 | 받은 사람 목록 카드·상세 | 훑음 |
| `features/recipient/recipient-api.ts` | 어댑터 | `PublicCatch`·`PublicEvidence`·`PublicProfile` | 훑음(필드 목록) |
| `components/ai-consent/ai-consent-notice.ts` | 설정 | `AI_NOTICE_VERSION`·`AI_RECIPIENTS`·`AI_FEATURES`·동의 창 문구·`AI_NOTICE_LINE` | 깊게 |
| `components/ai-consent/` 나머지 | 화면·훅 | 동의 창·흐름·한 줄 안내 | README만 깊게 |

web 시험(이번에 더해진 것, 이름만 확인): `test/author-description.test.mjs`, `test/author-description-editor.test.mjs`, `test/assets-description-reload.test.mjs`, `test/materials.test.mjs`, `test/materials-screen.test.mjs`, `test/unsaved-traverse-guard.test.mjs`.

## 반복되는 코드 모양

- **머리 설명에 근거를 단다**: 모듈 첫 설명이 팀장 결정 날짜·이슈 번호·결정 번호·업무 규칙 ID를 적는다(예: `2026-10-08 팀장 결정 「Catch 제목」`, U4는 `BR1.1`·`NFR1.8`·계약 `C-14`). 규칙 변경 때 이 설명도 함께 고쳐야 한다.
- **불변 자료형**: worker는 `@dataclass(frozen=True)`와 `__post_init__` 검사, api는 `Object.freeze`와 `readonly`.
- **원문을 로그에 남기지 않음**: 로그는 건수·고정 코드만 남긴다(worker `_log` 함수들, api `errorName`). U4 저장소 클래스는 로그를 쓰지 않는다.
- **실패는 결과로, 결함은 예외로**: 수집·생성 실패는 결과의 `failures`·생성 상태로, 입력 불일치·결함은 `ValueError`·`ContractViolation`으로 올린다.
- **고정 문장은 상수로**: 작업 사실·한계·실패 문구가 build.py·evidence.py·outcome.py의 상수 딕셔너리에 있다.
- **소유자 조건과 같은 404**(U4): 모든 회원 자료 조회에 소유자를 조건으로 넣고, 남의 것·없는 것·형식이 틀린 ID를 같은 404로 응답한다. 회원 행은 `FOR KEY SHARE`로 잡는다.
- **화면 상태 모델 분리**(web U4): 상태 전이를 `create…Model` 함수와 `createViewStore`로 빼고 컴포넌트는 `useSyncExternalStore`로 그린다. 시험이 원본 tsx를 변환해 모델을 직접 부른다. 성공 응답과 모양이 맞을 때만 「저장됨」이다.
