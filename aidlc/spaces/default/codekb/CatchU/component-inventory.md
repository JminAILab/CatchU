# 구성 요소 목록 — CatchU

> 범위: 2026-11-03 집중 스캔(`kind: partial`), 기준 커밋 `9923226c`. 아래 제목(`###`)이 구성 요소 이름이며, `reverse-engineering-timestamp.md`의 `analyzed.components`가 이 이름을 글자 그대로 쓴다. 「깊이」가 「훑음」·「목록만」인 요소는 깊게 분석한 것으로 기록하지 않았다. 이번 합치기에서 `api.materials`·`web.materials`를 새로 넣고, `api.catches`·`api.withdrawal`·`api.publications`·`web.assets`에 U4 #461 내용을 더했다.

## worker

### worker.collection
- **책임**: GitHub에서 커밋·PR·이슈와 관계(PR 커밋 목록·연결 PR·병합 경계)를 수집해 정규화 기록과 근거 재료를 만든다. 원자료는 메모리에만 둔다.
- **주요 파일**: `worker/app/collection/records.py`, `limits.py`, `evidence.py`, `collect.py`, `relations.py`
- **이 intent와 닿는 곳**: 기록의 글 재료가 여기 있다 — `CommitRecord.message`, `PullRequestRecord.title`·`author`·`commits`·`commits_truncated`. 수집 상한(`max_commits` 3,000 등)은 결과에 실을 소속 커밋 수의 상한이 된다. 관측 사실 문장(evidence.py)은 바꾸지 않는 대상이다.
- **의존**: GitHub API(httpx2), `app.processing.request_check`(요청 형식)
- **깊이**: records·limits·evidence 깊게, collect 훑음, relations 등 목록만

### worker.candidates
- **책임**: 수집 결과만으로 작업 단위(PR·PR 없는 병합·커밋 묶음)를 정하고, 후보 자격·notProvided 집계·작업 사실·나의 기여·묶음 설명·근거와 `wi1` 열쇠를 만든다. GitHub를 부르지 않는다.
- **주요 파일**: `worker/app/candidates/grouping.py`(`group`, `_split`, `_units`), `identity.py`(`work_identity`), `build.py`(`build_candidates`), `same_change.py`(`issue_references`)
- **이 intent와 닿는 곳**: 이슈 번호 나누기(`_split`), 이미 소속된 커밋을 빼는 자리(소속 판정·배정 앞), 작업 사실 첫 줄 문장(`_pull_request_text`·`_merge_text`·`_commits_text`), 근거 20건 상한(`EVIDENCE_COMMIT_CAP`), 같은 열쇠 후보 합치기(`_merge_same_identity`)
- **의존**: `worker.collection`, `worker.processing`(자료형)
- **깊이**: build·identity 깊게, grouping은 모듈 설명과 나누기 절만

### worker.generation
- **책임**: 후보마다 재료를 찾고, 가리고, 크기에 맞게 고른 변경 줄을 제공자에 한 번 보내 설명 초안·생각해볼 질문·조각 제목을 만든다. 근거 한계 끝 문구만 더한다.
- **주요 파일**: `worker/app/generation/flow.py`, `material.py`, `request.py`, `limits.py`, `title.py`, `render.py`, `outcome.py`, `provider.py`, `claude.py`, `redact.py`, `response.py`, `names.py`, `patch.py`
- **이 intent와 닿는 곳**: 재료 순서·변경 묶음(`select`), 종류 판정(`classify`) 재사용, 제목 결정(`decide` 대신 기록의 글·Claude 후보·기계 대조·판정), 설명 초안(틀 문장 대신 Claude 문장 + 대조 + 판정), 판정 공급자 자리(지금 없음), 실패 코드, 가리기를 기록의 글에도 적용
- **의존**: `worker.candidates`(`group`·`work_identity` 재호출), `worker.collection`(기록), Anthropic API(`claude.py`)
- **깊이**: flow·material·request·limits·title·render·outcome·provider 깊게, claude·redact·response 훑음

### worker.processing
- **책임**: 요청 검사(계약·접수 맥락·현재 시도), 진행 알림, 생성기 호출, 결과 조합·계약 검사. LIVE 조립(`LiveGenerator`).
- **주요 파일**: `worker/app/processing/request_check.py`, `pipeline.py`, `result.py`, `generation.py`, `live.py`
- **이 intent와 닿는 곳**: 요청의 새 칸(이미 소속된 커밋 목록)을 받아 후보 판정에 넘기는 길, 결과의 새 칸(후보별 소속 커밋 전체) 조합, `schemaVersion` 문자열, 고지 판본 대조
- **의존**: `worker.contract`, `worker.collection`, `worker.candidates`, `worker.generation`, `worker.request_context`
- **깊이**: 깊게

### worker.contract
- **책임**: `api/contracts/repository-analysis/` YAML을 읽어 메시지 스키마를 검사하고 합성 템플릿을 채운다.
- **주요 파일**: `worker/app/contract/worker_messages.py`
- **이 intent와 닿는 곳**: 계약 판본을 올리면 이 검사기가 새 YAML을 그대로 읽는다(코드 변경보다 계약·합성 자료 변경이 크다).
- **의존**: jsonschema·referencing·pyyaml, 계약 파일
- **깊이**: 깊게

### worker.consumer
- **책임**: BullMQ 큐 소비자(부모·자식 프로세스), 설정 읽기, LIVE 부품 조립, 수신 확인 처리.
- **주요 파일**: `worker/app/consumer/child.py`(`live_assembly`), `settings.py`
- **이 intent와 닿는 곳**: OpenAI 판정 키 설정과 판정 공급자 조립(키가 있을 때만 AI 쪽을 켬)
- **깊이**: 훑음

### worker.request_context
- **책임**: api 맥락 조회 클라이언트와 응답 해석.
- **이 intent와 닿는 곳**: 이미 소속된 커밋 목록을 맥락 조회로 넘기는 안을 고르면 여기 해석이 바뀐다.
- **깊이**: 목록만

## api

### api.analysis-intake
- **책임**: 분석 고지 제공(합성·실제), 분석 접수·상태·이력·재요청, 하루 한도.
- **주요 파일**: `api/src/analysis-intake/analysis-notice.ts`(`REAL_NOTICE` v2), `analysis-intake.service.ts`
- **이 intent와 닿는 곳**: 분석 고지 v3 문구와 판본. 접수는 현재 판본 동의만 받는다.
- **깊이**: 고지 깊게, 접수 훑음

### api.analysis-queue
- **책임**: 대기 시도를 DB에서 읽어 요청 메시지를 조립·검사하고 큐에 넣는다. 결과·알림을 받는다.
- **주요 파일**: `api/src/analysis-queue/analysis-request.dispatcher.ts`
- **이 intent와 닿는 곳**: 요청에 이미 소속된 커밋 목록을 싣는다면 여기서 소속 표를 읽어 조립한다(`pending` 쿼리와 `buildRequestMessage`).
- **의존**: PostgreSQL, Redis, `api.analysis-receiver`(검사기)
- **깊이**: 보내기 깊게

### api.worker-context
- **책임**: worker 전용 맥락 조회. 접수 맥락·토큰·저장소 좌표·허용 자료 종류를 잠금 아래에서 확인해 준다.
- **주요 파일**: `api/src/worker-context/worker-context.service.ts`, `worker-context.controller.ts`, `worker-context.types.ts`
- **이 intent와 닿는 곳**: 이미 소속된 커밋 목록을 큐 메시지 대신 이 응답으로 넘기는 대안 자리
- **깊이**: 깊게(모듈 파일 제외)

### api.analysis-receiver
- **책임**: 결과·알림 메시지 검사·중복 판정·저장, 수신 확인, 반영 호출(보호 관측 포함).
- **주요 파일**: `worker-message.validator.ts`, `receiver.types.ts`, `analysis-registration.service.ts`, `repository-registration.port.ts`
- **이 intent와 닿는 곳**: `Result`·`Candidate` 타입과 검사기(새 칸·새 판본), 근거 주소 대조
- **깊이**: 핵심 깊게

### api.result-application
- **책임**: 수신 정본을 한 트랜잭션에서 Catch 등록으로 반영하고 시도·요청 상태를 닫는다.
- **주요 파일**: `result-application.service.ts`, `registration.port.ts`
- **이 intent와 닿는 곳**: 소속 저장을 등록과 같은 트랜잭션에서 하려면 `RegistrationPort`·`RegistrationResult` 대조가 넓어진다.
- **깊이**: 깊게(엔티티 제외)

### api.catches
- **책임**: Catch 등록(회원·열쇠 잠금, 만들기·잇기), 새 Catch 내용 변환, 엔티티, 회원·공개 조회, **Catch 작성자 설명 읽기·저장**(U4 #461, 계약 C-14).
- **주요 파일**: `registration-service.ts`, `registration-batch.ts`, `new-catch-content.ts`, `entities/catch-asset.entity.ts`, `entities/catch-evidence.entity.ts`, `entities/candidate-registration.entity.ts`, `author-description.controller.ts`, `author-description-store.ts`(`AuthorDescriptionStore`), `author-description-input.ts`(`authorDescriptionInput`, `AUTHOR_DESCRIPTION_MAX_LENGTH` 4,000), `catches.module.ts`(컨트롤러 `OwnerCatchesController`·`AuthorDescriptionController`, 공급자 `OwnerCatchStore`·`PublicCatchStore`·`AuthorDescriptionStore`, 내보냄은 앞의 둘)
- **작성자 설명의 저장**: `catch_asset`의 두 칸(`author_description` text, `author_description_updated_at` timestamptz). 두 칸이 함께 NULL이거나 함께 값이도록 CHECK가 막는다. 엔티티에 초기값이 없어, 이 칸을 모르는 저장 코드가 설명을 덮지 않는다. 쓰는 곳은 `AuthorDescriptionStore.save`의 `UPDATE` 하나다.
- **재분석과 작성자 설명**: 등록은 새 Catch 삽입에 설명 칸을 넣지 않고(NULL), 같은 열쇠면 `EXISTING`으로 참조만 해 설명이 그대로다(시험 S2). 열쇠가 바뀌어 새 Catch가 생기면 설명은 옛 Catch에 남는다.
- **이 intent와 닿는 곳**: 소속 표(커밋 SHA → Catch, 회원·저장소 안 유일)와 저장 시점, 기존 Catch에 새 커밋을 소속으로만 기록, 제목 길이(DB 상한 없음). 기존 Catch의 내용을 새로 쓰는 쪽으로 바뀌면 설명 두 칸은 제외해야 한다.
- **의존**: PostgreSQL, `api.analysis-receiver`(후보 타입), 인증(`CurrentMemberId`), `owner-catch-input.ts`(`catchIdInput`·`isUuid`·`emptyCatchQuery`)
- **깊이**: 등록·엔티티·작성자 설명 깊게, 조회 훑음

### api.materials
- **책임**: 작성자의 텍스트 자료 한 벌(제목·본문) 목록·만들기·읽기·고치기·지우기(U4 #461, 계약 C-13). Catch와 연결되지 않는 회원 단위 자료다.
- **주요 파일**: `api/src/materials/materials.module.ts`, `text-materials.controller.ts`, `text-material-store.ts`(`TextMaterialStore`), `text-material-input.ts`(`TEXT_MATERIAL_LIMITS` 제목 100·본문 20,000, `TEXT_MATERIAL_PAGE` 기본 20·최대 100, 커서), `text-material.entity.ts`
- **저장**: `text_material`(`member_id` 색인, 회원 외래 키 연쇄 삭제, 제목 1자 이상 CHECK). 덮어쓰기, 충돌 감지 없음. 삭제는 행만 지우고 발행 사본은 남는다.
- **이 intent와 닿는 곳**: 직접 닿지 않는다. 탈퇴 연쇄 삭제 목록과 「새 표는 회원 연쇄 삭제」 규칙의 실제 예다.
- **의존**: PostgreSQL, 인증. `publications`를 import하지 않는다. MCP(U6)는 이 모듈이 아니라 표를 `member_id`로 걸러 읽는다.
- **깊이**: 깊게

### api.withdrawal
- **책임**: 탈퇴 4단계(세션 폐기·발행 링크 중지·MCP 행 삭제 → 회원 파일 → 자격정보 파일 → 회원 행 연쇄 삭제).
- **주요 파일**: `api/src/withdrawal/withdrawal.service.ts`, `api/docs/member-withdrawal-deletion.md`, `api/docs/withdrawal.md`
- **작성자 설명·텍스트 자료**: 따로 지우는 단계가 없다. 4단계 회원 행 삭제가 `catch_asset`(작성자 설명 칸 포함)과 `text_material`을 연쇄로 지운다. 설명·자료를 저장하는 트랜잭션은 회원 행을 `FOR KEY SHARE`로 잡아 그동안 4단계 삭제가 기다린다. 1단계는 `publication`·`mcp_*` 표가 DB에 없으면 건너뛴다(`to_regclass`).
- **이 intent와 닿는 곳**: 소속 표의 외래 키를 연쇄 삭제로 두고 삭제 목록 문서에 행을 더한다. 시험(`test/db/member-cascade-delete.test.cjs`)이 회원을 참조하는 연쇄 삭제가 아닌 외래 키를 잡는다.
- **깊이**: 깊게

### api.ai-consent
- **책임**: 외부 AI 첫 이용 동의 판본과 동의 확인·기록.
- **주요 파일**: `api/src/ai-consent/ai-consent.gate.ts`
- **이 intent와 닿는 곳**: `AI_NOTICE_VERSION` 올림(web 상수와 함께)
- **깊이**: 게이트 깊게

### api.publications
- **책임**: 발행 사본 모양과 접근. U4 api 안내 문서(`api/docs/publications.md`)가 표(C-07·C-13·C-14), 작성자 설명·텍스트 자료 API, C-10 접근 인터페이스를 함께 적는다.
- **주요 파일**: `api/src/publications/published-snapshot.ts`, `api/docs/publications.md`
- **이 intent와 닿는 곳**: 사본의 `workFacts`에 기록의 글 줄이 들어가면 발행 사본과 검색 조각에 그대로 간다. 사본에는 제목 출처 칸이 없다. 사본에 `authorDescription` 칸이 있으나 발행·사본 만들기 코드는 아직 없다(제출 2·3).
- **깊이**: 사본 모양과 안내 문서 깊게

### api.published-index
- **책임**: 발행 사본을 검색 조각으로 나누고 임베딩한다.
- **주요 파일**: `api/src/published-index/chunker.ts`
- **이 intent와 닿는 곳**: 작업 사실은 `GITHUB_RECORD` 조각이다(조각 길이 상한 1,000자). 작성자 설명은 `AUTHOR_MATERIAL` 조각이다. 제목·AI 초안은 조각이 아니다. 이 intent는 조각 규칙을 바꾸지 않는다.
- **깊이**: 훑음

### api.recipient
- **책임**: 받은 사람 공개 조회 응답.
- **깊이**: 목록만

### contract.repository-analysis
- **책임**: api·worker 공유 메시지 계약 v2(`api/contracts/repository-analysis/worker-messages.yaml`, `common.yaml`).
- **이 intent와 닿는 곳**: 요청에 소속 커밋 목록, 후보에 소속 커밋 전체 칸을 더하고 판본을 올린다.
- **깊이**: 훑음(스냅샷 밖)

## web

### web.assets
- **책임**: 구직자 Catch 목록·상세 대화상자, 확인·불일치·공개 조작, **Catch 상세의 작성자 설명 편집**(U4 #461).
- **주요 파일**: `web/src/features/assets/types.ts`, `assets-view.tsx`(`AssetsView`·`CatchDetail`·`GeneratedContentNotice`, `descriptionEditor` 자리), `author-description-api.ts`(`createAuthorDescriptionApi`·`isAuthorDescription`·`applyDescriptionSave`), `author-description-editor.tsx`(`createDescriptionEditorModel`·`AuthorDescriptionEditor`), `author-description-panel.tsx`(`AuthorDescriptionPanel`), `assets.module.css`(`.descriptionInput`), 연결은 `assets-connected.tsx`·`assets-member-page.tsx`
- **작성자 설명 자리**: 상세의 근거 아래, 「Catch 설명 초안」 위에 「작성자 설명」 제목으로 둔다. AI 초안을 입력칸에 넣지 않는다. `descriptionApi`가 없으면(미리보기) 그리지 않는다. 상세마다 `key=catchId`로 새로 마운트한다. 저장하지 않은 입력이 있으면 모달 닫기·[현재 상태 다시 불러오기]·새로고침·링크 이동·로그아웃·뒤로 가기 전에 묻는다.
- **이 intent와 닿는 곳**: 제목 줄 수 제한, 자동 생성 안내 문장(받은 사람 화면과 같은 문장을 따로 가짐, 80~90행), 제목 출처 공통 안내 한 줄의 자리 후보. 상세에 사람 설명과 AI 초안이 함께 있어 안내의 「설명」이 무엇을 가리키는지 정해야 한다.
- **의존**: api Catch 조회·작성자 설명 API, `src/lib/save-outcome.ts`(저장 결과 문구, 텍스트 자료와 공유), `src/lib/view-store.ts`, `src/lib/unsaved-traverse-guard.ts`
- **깊이**: types·assets-view·작성자 설명 세 파일 깊게, assets-connected·assets-member-page·README 훑음(바뀐 부분)

### web.materials
- **책임**: 텍스트 자료 목록·편집 한 화면(`/materials`, 회원 헤더 [텍스트 자료]).
- **주요 파일**: `web/src/features/materials/materials-api.ts`(`createMaterialsApi`, `MATERIAL_LIMITS`, `SENSITIVE_INFO_NOTICE`, 결과 반영·안내 문구), `materials-screen.tsx`(`createMaterialsScreenModel`·`createMaterialEditorModel`·`MaterialsPage`), `materials-view.tsx`(`MaterialsListView`·`MaterialEditorView`), `materials.module.css`, `README.md`, 주소는 `src/app/(member)/materials/page.tsx`
- **이 intent와 닿는 곳**: 직접 닿지 않는다.
- **의존**: api 텍스트 자료 API, `src/lib/save-outcome.ts`·`view-store.ts`·`unsaved-traverse-guard.ts`, 공통 인증
- **깊이**: 깊게

### web.recipient
- **책임**: 받은 사람 링크 화면(목록 카드·상세·비밀번호 단계).
- **주요 파일**: `web/src/features/recipient/recipient-format.ts`(`generatedNotice`), `recipient-screen.tsx`, `recipient-api.ts`, `recipient.module.css`
- **이 intent와 닿는 곳**: 기존 자동 생성 안내(`generatedNotice`) 고치기, 제목 줄 수 제한
- **깊이**: format 깊게, 화면·API·CSS 훑음

### web.ai-consent
- **책임**: 외부 AI 첫 이용 동의 창·한 줄 안내와 문구·판본 상수.
- **주요 파일**: `web/src/components/ai-consent/ai-consent-notice.ts`, `README.md`
- **이 intent와 닿는 곳**: 받는 곳에 OpenAI 추가, `AI_NOTICE_VERSION` 올림(api와 함께). `AI_NOTICE_LINE`도 받는 곳 목록으로 만들어진다.
- **깊이**: 깊게
