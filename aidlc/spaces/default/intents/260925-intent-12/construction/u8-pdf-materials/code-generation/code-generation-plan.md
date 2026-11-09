# U8 PDF 자료 — 코드 생성 계획

## Summary

- Builds: PDF 자료 업로드·추출·발행 사본·열람·삭제(api 모듈 + S3 드라이버, worker 추출 소비자, web PDF 탭·뷰어)
- Touches: `api/src/materials/`·`api/src/pdf-extraction/`(새 폴더)·`api/src/file-storage/`·`api/src/publications/`·`api/src/database/migrations/`, `worker/app/pdf_extraction/`(새 폴더)·`worker/app/consumer/`, `web/src/features/materials/`·`web/src/features/recipient/`·`web/src/features/publications/`, 환경 예시·compose·문서
- Tests: 약 83개(api 56: DB 11·저장소 8·업로드 12·수신 10·발행 7·열람 8 / worker 14 / web 13), 단위 + 경계 통합(DB·가짜 S3·가짜 큐). 이번 실행 범위는 Step 1~3(DB 표·엔티티·DB 시험 11개)까지이고 Step 4 전에 담당자 검토를 기다린다

작성일: 2026-11-06. Unit: `u8-pdf-materials`(#420, 후순위). 입력: [기능 명세](../functional-design/functional-spec.md) W1~W5, [규칙](../functional-design/rules.md) BR1~BR7, [엔티티](../functional-design/entities.md), [계약 요약](../../../inception/contract-design/contract-summary.md) C-04·C-05·C-06·C-07·C-08·C-10·C-11·C-12·C-16·C-17, [성능 설계](../nfr-design/performance-design.md), [보안 설계](../nfr-design/security-design.md), [기술 선택](../nfr-requirements/tech-stack-decisions.md), [Unit 정의](../../../inception/units-generation/unit-of-work.md) U8, [재승인 요구사항](../../../inception/requirements-analysis/requirements.md) FR3·FR4·FR5·FR14.9·FR20. 코드는 저장소 루트(`api/`·`worker/`·`web/`)에 쓰고, 이 기록 폴더에는 계획·시험 지침·요약·추적만 둔다.

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

## 범위와 전제

- 하는 것: 기능 명세 W1~W5 전부(업로드·목록·원본 열람·삭제, 추출·수신, 발행 PDF 부분, 받은 사람·작성자 사본 열람·쪽 표시, S3 드라이버·삭제 확인 시험).
- 하지 않는 것: OCR, 파일 교체, PDF 글의 MCP 노출, 조각 나누기·검색(U3), 요약·질의응답(U5), 공용 인프라(#389 버킷·역할, 개발 서버 큐 연결, compose 볼륨은 설정 이름만 둠), 계약 문서 본문 수정(C-16·C-12 더하는 변경은 `api/docs/pdf-materials.md`에 적고 계약 문서 반영은 별도 PR).
- 선행 조건(기능 명세 §1): 4·5단계(W3·W4)는 U4 발행 경로가 통합 브랜치 `intent/260925-intent-12`에 합쳐져 있어야 한다. 현재 작업 사본 `api/u8-pdf-materials`는 그 브랜치(af5fbf3, PR #482 포함)에서 분기했으며 U4 발행 서비스·받은 사람 화면이 들어 있다. 1~3단계는 이 조건과 무관하다.
- 테스트 DB: api 시험은 `npm test`가 테스트 DB(기본 127.0.0.1:5433, README 「DB 테스트」의 docker 명령)에 마이그레이션을 적용한 뒤 돈다. 컨테이너가 없으면 Step 2에서 먼저 띄운다(기존 절차).
- 기존 파일 변경(이 작업이 만들지 않은 파일): `api/src/publications/publish-input.ts`·`publish.service.ts`(C-17 2단계 채우기), `api/src/file-storage/file-storage.config.ts`·`file-storage.module.ts`(s3 분기), `api/src/analysis-queue/worker-message.consumer.ts`·`api/src/analysis-receiver/worker-message.validator.ts`(PdfExtractionResult 분기), `api/src/materials/materials.module.ts`, `api/src/app.module.ts`(모듈 등록), `api/docs/member-withdrawal-deletion.md`(표 3행), `api/docs/publications.md`(링크 1줄), `api/.env.example`·`worker/.env.example`(설정 이름), `api/package.json`·`package-lock.json`(`@aws-sdk/client-s3`), `worker/pyproject.toml`·`uv.lock`(`boto3`·`pypdf`), `worker/app/consumer/service.py`·`settings.py`·`queues.py`(둘째 Worker·설정), `web/src/features/materials/materials-screen.tsx`·`materials-view.tsx`·`materials-api.ts`, `web/src/features/publications/snapshot-view.tsx`, `web/src/features/recipient/recipient-api.ts`·`recipient-slots.ts`, `docker-compose*.yml`(worker 읽기 전용 볼륨). 그 밖의 기존 파일은 건드리지 않는다.
- 보안 점검(`docs/CatchU_security_checks.md`)의 입력·권한·설정·외부 호출 항목은 Step 5·6·8·9의 시험 목록에 각각 들어 있다.

## 첫 실행 범위(담당자 결정 2026-11-06)

- **이번 실행은 Step 1~3까지만 한다**: 시나리오 정의 → 러너 확인 → 세 표의 마이그레이션·엔티티·탈퇴 삭제 표 갱신·DB 경계 시험. 화면·API·worker·발행 변경(Step 4~12)은 이번 실행에 넣지 않는다(계약 「첫 주 선합치」와도 맞는다).
- Step 3이 끝나면 **변경 파일 목록·실행 결과(시험 통과/실패 그대로)·미검증 항목**을 `code-summary.md`와 대화로 보고하고, **Step 4 전에 담당자 검토를 기다린다.** Step 4 이후는 담당자가 이어가라고 한 뒤에 같은 계획(순서 유지)으로 진행한다.
- 커밋·push·PR 생성은 이 실행에 포함하지 않는다(담당자가 따로 지시).

## 단계

시험 순서는 Testing Contract의 custom 순서를 따른다: 먼저 시나리오·기대 결과·실패 조건을 정하고(Step 1), 러너를 확인한 뒤(Step 2), 층마다 구현 → 그 층의 시험 작성·실행(Step 3~10). 층 안에서 TDD로 바꾸지 않는다. 전체 12단계의 순서는 그대로이며, 이번 실행 범위는 위 절대로 Step 1~3이다.

### Step 1. 시험 시나리오 정하기 (custom 순서의 첫 단계) — US3.1·US3.2·US4.1·US5.2

- [x] 1.1 기능 명세 §6의 시험 시나리오를 바탕으로 업무 시나리오·기대 결과·실패 조건 표를 `aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/code-generation/test-scenarios.md`에 적는다(이 Unit 기록 폴더, 코드 아님). 행마다 AC/BR/NFR ID와 시험 파일 이름을 붙인다. 추적: AC3.1.2·3.1.4·3.1.5, AC3.2.1~3.2.5, AC4.1.1·4.1.8·4.1.9, AC5.2.2·5.2.4, BR1~BR7, NFR1.1~1.10, NFR4.x, NFR5.x.

### Step 2. 시험 러너 확인과 Unit 명령 기록

- [x] 2.1 api: 테스트 DB 컨테이너 확인 뒤 `npm test -- test/db/publication-tables.test.cjs`가 통과하는지 확인(기존 러너 동작 확인). web: `node --test test/api-client.test.mjs`. worker: `uv run pytest tests/test_health.py`.
- [x] 2.2 `unit-test-instructions.md`의 Unit 한정 명령(아래 파일 목록)이 그대로 실행되는지 확인하고, 없는 파일은 다음 단계에서 만들 때까지 비어 있음을 확인한다.

### Step 3. DB 표·엔티티 (Data model) — AC3.1.5, AC5.2.2, BR1.7·BR4.3·BR4.4·BR7.1, NFR5.1·5.2

- [x] 3.1 마이그레이션 `api/src/database/migrations/<timestamp>-CreatePdfMaterialTables.ts`: `pdf_material`(회원 FK CASCADE, title CHECK 1자 이상, file_size_bytes CHECK >0, page_count CHECK, extraction_state CHECK IN, extraction_deadline_at NOT NULL, extraction_failure_code NULL, CHECK (state=DONE)=(page_count IS NOT NULL), CHECK (state=FAILED)=(failure_code IS NOT NULL)), `pdf_page_text`(PDF FK CASCADE, UNIQUE (pdf_material_id,page_number), **CHECK (readable = (text <> ''))** — readable=false인데 text가 비어 있지 않은 행과 readable=true인데 text가 빈 행을 모두 거부한다. Step 6 수신 검증(BR3.3)·worker 판정(BR3.1: 공백·제어문자만이면 readable=false·text='')과 같은 규칙), `published_pdf_page`(C-07 정의의 열·FK CASCADE·UNIQUE (published_item_id,page_number) 그대로. C-07은 "읽을 수 없는 쪽은 빈 문자열"이라고만 적었으므로 `pdf_page_text`와 같은 CHECK (readable = (text <> ''))를 더한다. 열 모양은 바꾸지 않는 제약 강화라 C-07 더하는 변경이며 `code-summary.md`의 계약 변경안에 적고 U3 담당에게 알린다. 사본은 `pdf_page_text`에서 복사되므로 두 표의 규칙이 같아야 발행이 실패하지 않는다).
- [x] 3.2 TypeORM 엔티티 `api/src/materials/pdf-material.entity.ts`, `pdf-page-text.entity.ts`, `api/src/publications/published-pdf-page.entity.ts`(`deleteWithParent` 규칙, C-06).
- [x] 3.3 `api/docs/member-withdrawal-deletion.md` 표에 3행 추가(`pdf_material`→회원, `pdf_page_text`→PDF 자료, `published_pdf_page`→발행 항목).
- [x] 3.4 시험(구현 뒤): `api/test/db/pdf-tables.test.cjs` — 연쇄 삭제 3경로(회원→pdf_material→pdf_page_text, published_item→published_pdf_page), UNIQUE 위반 2건(두 표의 (부모, page_number)), **readable·text 불일치 거부 4건**(`pdf_page_text`: readable=false·text 비어 있지 않음 / readable=true·text 빈 문자열; `published_pdf_page`: 같은 두 경우), 정상 쪽(readable=true·글 있음, readable=false·'') 저장 2건, 상태·쪽 수 CHECK 2건(≈11개). `api/test/db/member-cascade-delete.test.cjs`에 새 표 3개 확인 추가.
- [x] 3.5 Step 3 보고: 변경 파일 목록·시험 실행 결과(통과·실패 그대로)·미검증 항목(실제 S3, 발행 경로 연동 등 Step 4 이후)을 `code-summary.md`에 적고 대화로 보고한 뒤 **담당자 검토를 기다린다.** 이번 실행은 여기서 멈춘다.

### Step 4. FileStorage S3 드라이버 (Repository) — BR7.3·BR7.4, NFR1.7·NFR4.8·NFR4.11

- [ ] 4.1 `api/src/file-storage/s3-file-storage.ts`: `@aws-sdk/client-s3`로 put(PutObject)·get(GetObject 스트림, NoSuchKey→FileNotFound)·copy(CopyObject, 원본 없음→FileNotFound)·delete(DeleteObject, 없어도 성공)·deletePrefix(ListObjectsV2 반복+DeleteObjects 1,000개 단위)·그 밖 오류→StorageUnavailable('IO_FAILED'). 키는 `parseStorageKey` 뒤에만. SDK 재시도 기본값 유지. 자격은 기본 체인(코드에 자격 없음).
- [ ] 4.2 `file-storage.config.ts`에 `FILE_STORAGE_DRIVER=s3`·`FILE_STORAGE_S3_BUCKET`(필수) 분기, 부분 설정은 기동 실패(기존 local 규칙과 같음). `file-storage.module.ts`에서 드라이버 선택. `api/package.json`에 의존성 추가(정확한 버전·잠금).
- [ ] 4.3 시험(구현 뒤): `api/test/file-storage/s3-file-storage.test.cjs` — 요청을 기록하는 가짜 S3 클라이언트로 5개 메서드 정상·NoSuchKey·IO 오류·deletePrefix 1,001개 페이지 처리·키 모양 거부·설정 누락 기동 실패(≈8개). 로컬 드라이버와 같은 계약 시험을 공유 지원 파일로 돌린다.

### Step 5. PDF 자료 API (Business logic + API) — W1, AC3.1.2·3.1.4, BR1.1~BR1.8·BR2.1~BR2.4·BR6.6, NFR1.1·1.6·2.1·4.1·4.12

- [ ] 5.1 `api/src/materials/pdf-material-store.ts`: 소유 조회(`findOwned`), 생성(회원 행 `FOR UPDATE` 잠금 안에서 COUNT→20 이상 거부→INSERT), `readStatus` 조건부 UPDATE(시한 경과 PENDING→FAILED/DEADLINE_EXCEEDED), 목록(cursor), 쪽 목록(pageNumber·readable만), 삭제.
- [ ] 5.2 `api/src/materials/pdf-material-input.ts`: multipart 파일 1개·선언 종류·머리 바이트 `%PDF-`·제목 1~100자(없으면 파일 이름)·정의 밖 필드 거부; 파일 스트림 누적 바이트가 20 MB를 넘는 즉시 수신 중단·400(선언 크기 불신).
- [ ] 5.3 `api/src/materials/pdf-materials.controller.ts`: `POST /v1/pdf-materials`(회원 인증→`AiConsentGate.require`→검증→put→트랜잭션→커밋→PdfExtract 발송 실패는 로그만→201), `GET /v1/pdf-materials`, `GET /v1/pdf-materials/{id}`, `GET /v1/pdf-materials/{id}/file`(헤더 전 get 성공 확인→스트림 파이프, 헤더 4종), `DELETE /v1/pdf-materials/{id}`(저장소 먼저). put 뒤 DB 실패·벌 수 초과는 `delete(materialKey)` 1회 보상. 남의 것·없음·UUID 아님 404 `RESOURCE_UNAVAILABLE`.
- [ ] 5.4 `api/src/pdf-extraction/pdf-extract.dispatcher.ts` + 큐 명세(`pdf-extraction-requests`, 작업 ID=pdfMaterialId, 시도 1회, 봉투 `schemaVersion "2"`·`messageId`·`memberId`·`storageKey`). `materials.module.ts`·`app.module.ts` 등록. 로그 사건 `PDF_UPLOAD_STORE_FAILED`·`PDF_EXTRACT_ENQUEUE_FAILED`·`PDF_VIEW_FAILED`(before-headers/streaming)·`PDF_DELETE_STORAGE_FAILED`(키·제목·글 없음).
- [ ] 5.5 시험(구현 뒤): `api/test/materials/pdf-materials-api.test.cjs` — 정상 201·PENDING, 동의 없음 403, PDF 아님·누적 20 MB 초과·제목 101자·정의 밖 필드 각 400, 21벌째 400(동시 2건 중 1건만 통과), 저장소 미설정 500·행 없음, put 뒤 DB 실패→delete 호출·500, 남의 것 404, 시한 경과 목록 읽기 FAILED, 원본 열람 헤더 4종, 삭제 시 저장소 실패 500·DB 유지(≈12개).

### Step 6. 추출 결과 수신 (Business logic) — W2 수신, AC3.2.2·3.2.3, BR2.1·BR3.3·BR3.4·BR3.5, NFR4.7·4.16·5.3·6.1·6.3

- [ ] 6.1 `api/src/analysis-receiver/worker-message.validator.ts`에 `PdfExtractionResult` 모양 검사 분기(UUID, outcome, SUCCEEDED⇒pages 1~50·pageNumber 연속·중복 없음, FAILED⇒failureCode 필수·pages 없음, **readable = (text <> '')** 즉 readable=false인데 text가 있거나 readable=true인데 text가 비면 SCHEMA_INVALID — Step 3.1의 DB CHECK와 같은 규칙, 정의 밖 필드 거부).
- [ ] 6.2 `api/src/pdf-extraction/pdf-extraction.receiver.ts`: 한 트랜잭션에서 `pdf_material` `FOR UPDATE` → 없음·회원 불일치 CONTEXT_MISMATCH / DONE ALREADY_RECEIVED / FAILED 또는 시한 경과(이때 FAILED 저장) STALE_ATTEMPT / PENDING: 쪽 행 다중 INSERT + pageCount·DONE 또는 FAILED+failureCode → 커밋 뒤 ACCEPTED/OK. 수신 확인 `{ schemaVersion, messageId, pdfMaterialId, disposition, code }`. 커밋 실패는 수신 확인 없이 작업 실패. `worker-message.consumer.ts`에 작업 이름 분기 추가. 로그 `PDF_EXTRACTION_RECEIVED`.
- [ ] 6.3 시험(구현 뒤): `api/test/materials/pdf-extraction-receiver.test.cjs` — SCHEMA_INVALID(51쪽·불연속·readable=false인데 text 있음·readable=true인데 text 빔·정의 밖 필드), CONTEXT_MISMATCH, ALREADY_RECEIVED, STALE_ATTEMPT(FAILED / 시한 경과→FAILED 저장), OK(쪽 50행·pageCount), FAILED+failureCode, 쪽 행 하나 제약 위반→0행·PENDING 유지(≈10개).

### Step 7. worker 추출 소비자 (worker) — W2 worker, AC3.2.2·3.2.3·3.2.5, BR3.1·BR3.2·BR3.6·BR3.7·BR7.4, NFR1.7·1.8·1.9·4.3·4.4·4.18

- [ ] 7.1 `worker/app/pdf_extraction/` 새 패키지: `settings.py`(`PDF_FILE_ROOT`, `CATCHU_WORKER_PDF_CONCURRENCY` 기본 1, 자식 시간·메모리 제한값 설정 이름, S3 사용 여부), `reader.py`(배포: `boto3` GetObject만; 로컬: `PDF_FILE_ROOT` 읽기 전용), `extract.py`(자식 프로세스에서 pypdf: `is_encrypted`→ENCRYPTED, 파싱 예외·쪽 수 0→UNREADABLE_FILE, 쪽 수>50→PAGE_LIMIT_EXCEEDED, 쪽마다 `extract_text`, 공백·제어문자만→readable=false·'', NUL 제거), `child.py`(10월 자식 프로세스 틀 재사용, 제한 초과 시 종료→FAILED UNREADABLE_FILE, 결과 JSON 표준 출력), `worker.py`(`pdf-extraction-requests` 별도 BullMQ Worker, 봉투·`storageKey` 모양·ID 일치 검사→불일치는 결과 없이 작업 실패, 결과를 `worker-messages`에 `message-pdf-{id}-result`로 발송, `receipts.py` 재사용).
- [ ] 7.2 `worker/app/consumer/service.py`·`settings.py`·`queues.py`: 둘째 Worker 기동·종료 순서에 포함, 큐 이름·보관 규칙 추가. `pyproject.toml`에 `boto3`·`pypdf` 추가(정확한 버전·`uv.lock`).
- [ ] 7.3 시험(구현 뒤): `worker/tests/test_pdf_extraction.py`(정상 다쪽·빈 쪽 readable=false·암호화·파싱 실패·0쪽·51쪽·NUL 제거, 합성 PDF 바이트 사용, ≈7개), `worker/tests/test_pdf_consumer.py`(봉투 검사·키 모양 거부·ID 불일치·자식 제한 초과→FAILED·결과 발송 ID 규칙·수신 확인 기록·분석 Worker와 독립 기동, 가짜 큐, ≈7개).

### Step 8. 발행의 PDF 부분 (Business logic, U4 파일 변경) — W3, AC3.1.5·AC4.1.1·4.1.8·4.1.9, BR4.1~BR4.5·BR5.1~BR5.6, NFR4.6·4.17

- [ ] 8.1 `publish-input.ts`: `PUBLISH_ITEM_KINDS`에 `PDF_MATERIAL` 추가(항목 수·중복 규칙 그대로).
- [ ] 8.2 `publish.service.ts`: 사전 확인(작성자 PDF `readStatus`→DONE 아니면 400 `VALIDATION_FAILED` `extractionIncomplete`, 복사 전) → C-17 1단계 `publicationId`·`publishedItemId` 선생성 → 2단계 position 순 `copy(materialKey→publishedPdfKey)` → 3단계 실패 시 `deletePrefix` 1회·500 → 4단계 트랜잭션: U4 BR5.1 순서 뒤에 PDF `FOR SHARE`(`pdf_material_id` 오름차순) 재확인, `published_item`(PDF_MATERIAL, snapshot {pageCount}, pdf_copy_key), `published_pdf_page` `INSERT ... SELECT` → 5단계 실패 시 `deletePrefix` 1회·원래 오류 → 6단계 정리 실패 로그 `PREFIX_CLEANUP_FAILED`(정리를 부른 단계 번호). PDF 항목이 없으면 FileStorage 미호출. 전체 글 검증은 U4 현행 그대로(OQ-U4-4 보류).
- [ ] 8.3 시험(구현 뒤): `api/test/publications/publish-pdf.test.cjs` — (a) PDF 없는 발행+저장소 미설정→201·FileStorage 미호출, (b) 복사 실패→500·DB 행 없음·deletePrefix 호출, (c) 복사 뒤 한도 429→deletePrefix·DB 없음, (d) chunk 예외→500·정리 호출, (e) 정리 실패→응답 유지·로그만, (f) PENDING/FAILED PDF→400 extractionIncomplete·복사 없음, (g) 정상: `published_pdf_page` 행 수=`pdf_page_text` 행 수·pdf_copy_key·이후 원본 변경에도 사본 불변(≈7개). 기존 `publish-api.test.cjs`는 수정 없이 통과해야 한다.

### Step 9. 받은 사람·작성자 PDF 사본 열람 (API) — W4, AC3.2.1·AC4.4.1(PDF), BR6.1·BR6.2·BR6.5·BR6.6·BR6.7, NFR1.2·1.3·1.4·1.10·4.5·4.19

- [ ] 9.1 `api/src/publications/recipient-links.controller.ts`에 `GET /v1/public/links/{token}/items/{publishedItemId}/pdf`: 읽기 전용 트랜잭션에서 `resolveForRecipient(token, grant, now)` → `publication_id = access.publicationId AND item_kind='PDF_MATERIAL'` 행만(없음·UUID 아님·다른 종류 404 `LINK_UNAVAILABLE`) → 헤더 전 `get` 성공 확인(실패 500) → 스트림 파이프, 헤더 4종(`application/pdf`, `inline; filename="document.pdf"`, `no-store`, `nosniff`), Range 없음, 전송 도중 오류는 연결 중단·로그. 시도 제한 없음, 토큰·grant·키 로그 금지.
- [ ] 9.2 `publications.controller.ts`에 `GET /v1/publications/{id}/items/{itemId}/pdf`: `resolveForOwner` → 같은 항목 규칙 → 스트림(중지·만료 뒤에도).
- [ ] 9.3 시험(구현 뒤): `api/test/publications/recipient-pdf.test.cjs` — 비밀번호 링크 grant 없음 401, 중지·만료·삭제 404, 다른 발행본 항목·텍스트 항목·없는 항목·UUID 아님 404, 파일 없음 500, 정상 200 헤더 4종, 작성자 중지 뒤 200, 전송 도중 오류 시 연결 중단(≈8개).

### Step 10. web PDF 탭·뷰어·쪽 표시 (Frontend) — W1 화면·W4, AC3.1.2·3.1.4·AC3.2.1·3.2.3, BR1.5·BR2.3·BR6.3·BR6.4, NFR7.1~7.3, 보안 설계 §2(Blob URL 규칙)

- [ ] 10.1 `web/src/features/materials/pdf-materials-api.ts`(업로드 multipart·목록·상세·원본·삭제, 403 AI_CONSENT_REQUIRED→U2 동의 창→재전송), `pdf-upload-form.tsx`(제출 전 검사: 종류·20 MB·제목 100자, 민감 정보 안내 문구는 텍스트 자료와 같은 문구, 외부 AI 한 줄 고지), `pdf-material-list.tsx`(배지: 추출 중/완료 n쪽/실패 사유별 문구, [원본 보기], 삭제 확인), `materials-screen.tsx`·`materials-view.tsx`에 PDF 탭 추가.
- [ ] 10.2 `web/src/features/recipient/pdf-viewer-launcher.tsx`(공용 도우미): `fetchPdf` 주입, 200+본문 수신 성공 때만 Blob 생성; 화면 안 iframe `#page=n`(sandbox 없음); 같은 뷰어 쪽 이동은 Blob 재사용; 처음·다시 열기·새 탭은 재요청; [새 탭에서 열기]는 빈 창 먼저→요청 1회→성공 시 빈 창에 주입(차단 시 화면 안 뷰어 + 안내), 실패 시 빈 창 닫고 401·404는 `onAccessLost`·그 외 일반 열람 실패 안내(grant 유지); Blob URL은 원래 화면이 보관·해제(뷰어 닫기·언마운트·onAccessLost).
- [ ] 10.3 `web/src/features/publications/published-pdf-item.tsx`(제목·쪽 수·쪽 목록, readable=false "읽을 수 없음", 글은 텍스트 노드, `<mark>` 강조, [원본 n쪽 열기]), `snapshot-view.tsx`의 "준비 중" 자리 교체(받은 사람·작성자 모드), `recipient-api.ts` PDF 분기에 `pdfPages` 통과, `recipient-slots.ts` `fieldText`에 `pages[n]`→`pdfPages[n-1].text`.
- [ ] 10.4 시험(구현 뒤, `node --test`): `web/test/pdf-materials-api.test.mjs`(업로드 전 검사 4건·403 재전송·목록 매핑, ≈5개), `web/test/pdf-viewer.test.mjs`(본문 실패 시 Blob 없음·일반 실패 안내, 401→onAccessLost, 팝업 차단 fallback 요청 1회, 쪽 이동 Blob 재사용, 해제 시점, ≈5개), `web/test/recipient-pdf.test.mjs`(`fieldText pages[n]`, readable=false 표지, pickItem pdfPages 통과, ≈3개). 상호작용 요소에 `data-testid`.

### Step 11. 환경·빌드 설정 — BR7.3·BR7.4, NFR1.7, 기술 선택

- [ ] 11.1 `api/.env.example`에 `FILE_STORAGE_DRIVER=local|s3`, `FILE_STORAGE_S3_BUCKET=` 이름만; `worker/.env.example`에 `PDF_FILE_ROOT`, `CATCHU_WORKER_PDF_CONCURRENCY`, 자식 제한 설정 이름(값은 기본값만). 비밀값 없음.
- [ ] 11.2 개발용 compose에 api 로컬 저장 폴더를 worker에 읽기 전용 볼륨으로 마운트(`PDF_FILE_ROOT`). 공유 인프라(#389)는 건드리지 않는다.
- [ ] 11.3 의존성 잠금 파일 갱신과 `deps-audit` 예외 없음 확인(api `package-lock.json`, worker `uv.lock`).
- [ ] 11.4 대표 PDF(수십 쪽) 연속 업로드 3~5건의 추출 완료 시각을 로컬에서 1회 재어 `code-summary.md`에 기록(동시성 기본값 검토 근거; 10분 시한 변경은 담당자 별도 결정).

### Step 12. 문서·추적

- [ ] 12.1 `api/docs/pdf-materials.md` 새 문서: PDF 자료 API 5개·받은 사람/작성자 사본 열람 경로·발행 PDF 부분·추출 메시지 봉투와 수신 확인(C-16 더하는 변경 내용)·C-12 추가 경로·설정 이름·수용 위험. `api/docs/publications.md`에 링크 1줄. `worker/README.md`에 추출 소비자·설정 절 추가. `web/src/features/materials/README.md`·`recipient/README.md`에 PDF 절 추가.
- [ ] 12.2 계약 문서(`contract-summary.md`) C-16·C-12 더하는 변경은 이 코드 생성에서 고치지 않고 `code-summary.md`에 변경안을 적어 별도 계약 수정 PR로 넘긴다(계약 소유 규칙).
- [ ] 12.3 `code-summary.md`(파일 목록·결정·시험 결과·실행하지 않은 시험과 이유·계획 이탈·S3 실제 확인 미완 표시), `source-manifest.json`(이 Unit이 만든·바꾼 모든 경로), `traceability.json`(`aidlc engine sensor-traceability --stage code-generation ... --write-upstream` 뒤 AC·BR·NFR 행마다 구현·시험 파일 target).

## 단계 → 스토리·요구사항 대응

| Step | 스토리·수용 기준 | 규칙·NFR |
|---|---|---|
| 1 | US3.1·US3.2·US4.1·US5.2 전체 | 시나리오 정의(Testing Contract 순서) |
| 3 | AC3.1.5, AC5.2.2 | BR1.7·BR4.3·BR4.4·BR7.1, NFR5.1·5.2 |
| 4 | AC5.2.2(S3 삭제), AC14.1.4(S3 부분) | BR7.3·BR7.4, NFR1.7·4.8·4.11 |
| 5 | AC3.1.2, AC3.1.4 | BR1.1~1.8·BR2.1~2.4·BR6.6, NFR1.1·1.6·2.1·4.1·4.12 |
| 6 | AC3.2.2, AC3.2.3(readable 저장) | BR2.1·BR3.3~3.5, NFR4.7·4.16·5.3·6.1·6.3 |
| 7 | AC3.2.2, AC3.2.3, AC3.2.5 | BR3.1·3.2·3.6·3.7·BR7.4, NFR1.7~1.9·4.3·4.4·4.18 |
| 8 | AC3.1.5, AC4.1.1, AC4.1.8, AC4.1.9 | BR4.1~4.5·BR5.1~5.6, NFR4.6·4.17 |
| 9 | AC3.2.1, AC4.4.1(PDF) | BR6.1·6.2·6.5·6.6·6.7, NFR1.2~1.4·1.10·4.5·4.19 |
| 10 | AC3.1.2·3.1.4, AC3.2.1·3.2.3, AC6.3.5(PDF 강조) | BR1.5·2.3·6.3·6.4, NFR7.1~7.3, 보안 설계 §2 |
| 11 | — | BR7.3·7.4, NFR1.7·4.4(측정) |
| 12 | — | NFR6.4(확인 표 입력), 추적 |

## 시험 파일과 수(계획)

| 파일 | 수 | 종류 |
|---|---|---|
| `api/test/db/pdf-tables.test.cjs` | 11 | DB 통합(이번 실행 범위) |
| `api/test/file-storage/s3-file-storage.test.cjs` | 8 | 단위(가짜 S3) |
| `api/test/materials/pdf-materials-api.test.cjs` | 12 | API 통합(DB·로컬 드라이버) |
| `api/test/materials/pdf-extraction-receiver.test.cjs` | 10 | 통합(DB) |
| `api/test/publications/publish-pdf.test.cjs` | 7 | 통합(DB·가짜 저장소) |
| `api/test/publications/recipient-pdf.test.cjs` | 8 | API 통합 |
| `worker/tests/test_pdf_extraction.py` | 7 | 단위 |
| `worker/tests/test_pdf_consumer.py` | 7 | 단위(가짜 큐) |
| `web/test/pdf-materials-api.test.mjs` | 5 | 단위 |
| `web/test/pdf-viewer.test.mjs` | 5 | 단위 |
| `web/test/recipient-pdf.test.mjs` | 3 | 단위 |
| 합계 | 83(최소 62 목표; 이번 실행 범위 Step 1~3은 11개 + member-cascade-delete 추가 확인) | |

커버리지 80% 바닥은 Build and Test가 전체 스위트로 판정한다. Unit 한정 측정은 `unit-test-instructions.md`의 명령으로 하되, 다른 Unit의 시험이 덮는 코드 때문에 임계값에 걸릴 수 있으며 그 경우 선택한 시험이 모두 통과하면 실패한 시험이 아니다. 임계값을 낮추지 않는다.

## 실행하지 않을 수 있는 시험(이유와 함께 code-summary에 기록)

- 실제 S3 복사·삭제 확인: 버킷·역할(#389) 준비 전이라 가짜 클라이언트로만 시험한다(OQ-U8-2).
- 브라우저 수동 확인(iframe 쪽 이동·새 탭·팝업 차단): 자동 시험이 아니라 FR19 확인 표에 적는다.
