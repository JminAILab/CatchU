# 구성 요소 목록 — CatchU

> 기준: 2026-11-09 전체 다시 스캔(커밋 `a1d0fbb4`) 위에 2026-11-16 집중 스캔(커밋 `eb0d5a6c`, `kind: partial`)을 합쳤다. 아래 `###` 제목이 구성 요소 이름이며 `reverse-engineering-timestamp.md`의 `analyzed.components`가 글자 그대로 쓴다. 11-16에 깊게 다시 읽은 것은 `api.published-index`·`api.ai-generation`·`api.rag-answer`·`web.rag-answer` 넷이고 「깊이」에 「11-16 깊게」라고 적었다. 그 밖의 항목은 11-09 글 그대로이며 「깊이」도 그때 읽은 정도다(깊게 = 핵심 파일을 끝까지 읽음, 훑음 = 파일 목록·머리 설명·내보낸 이름만). 「이 intent와 닿는 곳」은 11-16 확인한 넷에서는 이 intent(#559)를, 나머지에서는 앞 intent(261109-new-catch)를 뜻한다. 경로 표는 `api-documentation.md`, 판본은 `technology-stack.md`에 있다.

## worker

### worker.collection
- **책임**: 허용한 GitHub 자료(커밋·PR·이슈)와 관계(PR 커밋 목록, 연결 PR GraphQL, 병합 경계, 파일 모드)를 모아 정규화 기록과 근거 재료를 만든다. 원자료는 메모리에만 둔다.
- **주요 파일**: `worker/app/collection/collect.py`(순서), `records.py`(기록 모양), `evidence.py`(근거 문장), `relations.py`(관계, 1,584줄), `gateway.py`·`transport.py`(호출 통제·HTTPS), `limits.py`·`budget.py`(상한), `credentials.py`·`selection.py`(자격정보·범위 대조)
- **이 intent와 닿는 곳**: (앞 intent) 규칙 사실의 재료가 이미 있다. 커밋마다 `authored_at`·`committed_at`, 파일마다 `status`(renamed)·`previous_path`·`patch`·`mode_lines`. 파일 내용 식별값(blob sha)은 버린다(`records.py` 43~56행). (#559) 근거의 기록 줄(`representedFacts`) 글은 `evidence.py`가 만든다. 이번 intent는 이 글을 바꾸지 않는다.
- **의존**: GitHub REST·GraphQL(httpx2), `app.processing.request_check`
- **깊이**: records·evidence 깊게, 나머지 훑음(11-09)

### worker.candidates
- **책임**: 수집 결과만으로 작업 단위(PR·PR 없는 병합·본인 커밋 묶음)를 정하고, 소속 커밋을 빼고, 후보 자격·미제공 집계·작업 사실·나의 기여·근거·`wi1` 열쇠·기록의 글·본인 커밋 목록을 만든다. GitHub를 부르지 않는다.
- **주요 파일**: `worker/app/candidates/grouping.py`(`group`, 7단계, 1,880줄), `build.py`(`build_candidates`), `identity.py`(`work_identity`), `record_text.py`(기록의 글·부실 판단), `same_change.py`(같은 변경)
- **이 intent와 닿는 곳**: (앞 intent) 작업 사실 문장(`build.py` 27~36·124~134행, 1~2줄, CatchU가 센 숫자·날짜 없음), 근거 20건 상한(`EVIDENCE_COMMIT_CAP`), 본인 커밋 목록(`own_commit_shas`).
- **의존**: `worker.collection`, `worker.processing`(자료형)
- **깊이**: record_text 깊게, build는 모듈 설명과 앞 300줄, grouping은 모듈 설명(11-09)

### worker.generation
- **책임**: 후보마다 재료(바뀐 줄)를 고르고 가리고 크기에 맞춰 Claude에 보내 설명 초안·생각해 볼 질문·제목 후보를 만든다. AI 쪽(CR3)이 켜지면 판정 질문을 만들고 답을 제목·작업 사실·설명에 적용한다.
- **주요 파일**: `worker/app/generation/flow.py`(입구, 943줄), `material.py`, `request.py`, `groups.py`(종류 순서 코드→시험→설정→문서), `title.py`(`classify` 파일 종류), `patch.py`(patch 온전성), `judged.py`, `claude.py`(실제 제공자, 786줄), `response.py`, `limits.py`, `outcome.py`
- **이 intent와 닿는 곳**: (앞 intent) 「시험 파일 있음」 판정에 쓸 수 있는 `classify`(`title.py` 37~43·131행).
- **의존**: `worker.candidates`(`group` 다시 부름), `worker.collection`, `worker.judgement`, Anthropic API
- **깊이**: title 분류 깊게, 나머지 훑음(11-09)

### worker.judgement
- **책임**: 판정 공급자 자리(CR3). 질문마다 확률·점수로만 답한다. OpenAI Decisions(`gpt-6-luna`)와 Claude 구조화 출력, 합성 어댑터.
- **주요 파일**: `worker/app/judgement/provider.py`(규약), `questions.py`, `answers.py`, `factcheck.py`(기계 대조), `openai_judge.py`, `claude.py`, `synthetic.py`
- **이 intent와 닿는 곳**: 직접 닿지 않는다. 받은 사람 AI의 대조는 api `fact-check.ts`이고 이 패키지와 다른 코드다.
- **깊이**: 훑음(11-09)

### worker.processing
- **책임**: 요청 검사(계약·접수 맥락·현재 시도), 진행 알림, LIVE 조립(수집→후보→생성), 결과 조합·계약 검사, MOCK 가짜 생성기, FR10 확인 명령.
- **주요 파일**: `worker/app/processing/live.py`, `pipeline.py`, `result.py`, `generation.py`(후보 자료형 `EligibleCandidate`·`RecordText`), `request_check.py`, `runner.py`, `fake_generator.py`, `confirm.py`
- **이 intent와 닿는 곳**: (앞 intent) 새 규칙 사실을 후보 자료형에 싣고 결과 메시지로 옮기는 길(`generation.py`, `result.py`), 가짜 생성기의 합성 값
- **의존**: `worker.contract`, `worker.collection`, `worker.candidates`, `worker.generation`, `worker.request_context`
- **깊이**: generation 앞부분 깊게, 나머지 훑음(11-09)

### worker.contract
- **책임**: `api/contracts/repository-analysis/` YAML을 읽어 메시지 스키마를 검사하고 합성 템플릿을 채운다.
- **주요 파일**: `worker/app/contract/worker_messages.py`
- **이 intent와 닿는 곳**: 없다.
- **깊이**: 훑음(11-09)

### worker.consumer
- **책임**: BullMQ 큐 소비자. 부모가 요청마다 자식 프로세스를 띄우고(동시 수 설정), 상한·종료 순서·수신 확인·상태 확인을 맡는다.
- **주요 파일**: `worker/app/consumer/parent.py`, `children.py`, `child.py`, `service.py`, `settings.py`, `queues.py`, `receipts.py`, `health.py`
- **이 intent와 닿는 곳**: 없다.
- **깊이**: 훑음(11-09)

### worker.request_context
- **책임**: api 내부 조회 한 번(찾음·모름·실패)과 응답 해석. 소속 커밋 집합(`assigned_commits`)도 여기서 받는다.
- **주요 파일**: `worker/app/request_context/client.py`, `decode.py`, `reasons.py`, `settings.py`
- **깊이**: 훑음(11-09)

### worker.redact
- **책임**: 비밀값·개인정보 가리기. 생성 재료와 기록의 글 검사가 함께 쓴다.
- **주요 파일**: `worker/app/redact.py`
- **깊이**: 훑음(11-09)

## api

### api.common
- **책임**: 공통 오류 형식·필터·입력 검증 파이프, no-store, 요청 ID, 보안 헤더, CORS, 신뢰 프록시, 주기 작업, Redis 오류 감시.
- **주요 파일**: `api/src/common/errors/*`, `common/http/*`, `common/periodic-task.ts`, `common/redis-connection-errors.ts`, `cors.ts`, `trust-proxy.ts`, `app.setup.ts`
- **깊이**: app.setup 깊게, 나머지 훑음(11-09)

### api.auth
- **책임**: Access JWT(15분) 발급·검증 전역 Guard, 세션·Refresh 쿠키, 개발 로그인, worker 서비스 키.
- **주요 파일**: `api/src/auth/*`(`access-token.guard.ts`, `session.service.ts`, `session.entity.ts`, `worker-context-auth.ts`)
- **깊이**: 훑음(11-09)

### api.database
- **책임**: DB 연결 설정, 데이터 원본, 이름 규칙, 마이그레이션, CHECK·외래 키 도우미.
- **주요 파일**: `api/src/database/*`, `database/migrations/*`
- **이 intent와 닿는 곳**: (#559) `published_chunk`의 길이 CHECK(`char_end - char_start <= 1000`)는 엔티티 데코레이터와 마이그레이션에 있다. 조각 길이를 바꾸면 마이그레이션이 필요하다.
- **깊이**: 표 목록과 `catch_asset`·`commit_assignment` 변경 깊게(11-09)

### api.member-analysis
- **책임**: 회원·프로필·GitHub 연결·분석 요청·동의·시도·멱등 기록 표와 공통 멱등 처리, 개발 회원.
- **주요 파일**: `api/src/member-analysis/member-analysis.entity.ts`(표 일곱 개), `idempotent-creation.ts`, `dev-member.service.ts`
- **깊이**: 훑음(11-09)

### api.member-profile
- **책임**: `GET /v1/me`, `PUT /v1/me/profile`, 발행본 판정이 쓰는 소유 회원 상태 읽기(`OwnerProfileReader`).
- **주요 파일**: `api/src/member-profile/*`
- **깊이**: 훑음(11-09)

### api.google-login
- **책임**: Google 인가 주소·코드 교환·회원 연결, 시도 제한.
- **주요 파일**: `api/src/google-login/*`
- **깊이**: 훑음(11-09)

### api.github-connection
- **책임**: GitHub OAuth App 연결·해제, 토큰 AES-256-GCM 파일 보관, 단일 자격정보 제공 함수.
- **주요 파일**: `api/src/github-connection/*`(`credential-vault.ts`, `github-connection.service.ts`)
- **깊이**: 훑음(11-09)

### api.member-repositories
- **책임**: 공개 저장소 직접 등록·목록, 선정·허용 범위 판본, worker 맥락용 선정 공급자.
- **주요 파일**: `api/src/member-repositories/*`(`repository-registration.service.ts`, `repository-selection.source.ts`, `registration-context.source.ts`)
- **이 intent와 닿는 곳**: (앞 intent) 저장소 이름(owner/name)은 `repository_registration`·선정 쪽에 있었다. 11-16 기준 사본에는 선택 칸 `repositoryName`이 있다(`published-snapshot.ts` 28행, 칸 이름만 확인).
- **깊이**: 훑음(11-09)

### api.analysis-intake
- **책임**: 분석 고지(합성·실제 v3), 접수(멱등·동의·하루 횟수 한 트랜잭션), 이력·상태·홈 요약.
- **주요 파일**: `api/src/analysis-intake/analysis-intake.controller.ts`, `analysis-intake.service.ts`, `analysis-notice.ts`(`catchu-real-analysis-notice-v3`), `analysis-history.ts`
- **이 intent와 닿는 곳**: (앞 intent) 3단계 규칙 사실의 결과 문장을 Catch에 남기면 고지 4절과 판본을 바꾼다.
- **깊이**: 컨트롤러 깊게, 서비스·고지는 훑음(11-09)

### api.analysis-queue
- **책임**: 대기 시도를 읽어 Request v2를 조립·검사하고 큐에 넣는다(5초, 100건). 진행 알림·결과를 받는다.
- **주요 파일**: `api/src/analysis-queue/queue-spec.ts`, `analysis-request.dispatcher.ts`, `worker-message.consumer.ts`, `analysis-queue.module.ts`, `analysis-queue.config.ts`(질문 횟수 Redis도 이 설정을 읽는다)
- **깊이**: 규격 깊게, 나머지 훑음(11-09)

### api.analysis-receiver
- **책임**: 결과·알림 메시지 검사·중복 판정·수신 기록·수신 확인, 등록 연결(보호 관측 포함).
- **주요 파일**: `api/src/analysis-receiver/receiver.types.ts`, `analysis-receiver.service.ts`, `worker-message.validator.ts`, `analysis-registration.service.ts`, `repository-registration.port.ts`
- **이 intent와 닿는 곳**: (앞 intent) `Candidate` 타입과 검사기. 결과에 칸을 더하면 여기도 바뀐다.
- **깊이**: 자료형 깊게, 나머지 훑음(11-09)

### api.result-application
- **책임**: 수신 정본을 한 트랜잭션에서 Catch 등록으로 반영하고 시도·요청 상태를 닫는다.
- **주요 파일**: `api/src/result-application/result-application.service.ts`, `registration.port.ts`, `result-application.entity.ts`
- **깊이**: 앞부분 깊게(11-09)

### api.analysis-deadline
- **책임**: 접수 뒤 60분 처리 시한을 1분마다 판정해 닫는다(`PeriodicTask`).
- **주요 파일**: `api/src/analysis-deadline/*`
- **깊이**: 훑음(11-09)

### api.worker-context
- **책임**: worker 전용 내부 조회. 접수 맥락·GitHub 토큰·저장소 좌표·허용 자료 종류·소속 커밋 SHA 전체를 잠금 아래에서 확인해 준다.
- **주요 파일**: `api/src/worker-context/worker-context.service.ts`, `worker-context.controller.ts`, `worker-context.types.ts`
- **이 intent와 닿는 곳**: (앞 intent) 소속 커밋을 넘겨 재분석 때 빼게 한다(114~121·172행).
- **깊이**: 소속 커밋 부분과 응답 모양 깊게(11-09)

### api.catches
- **책임**: Catch 등록(회원·열쇠 잠금, 만들기·참조, 소속 기록), 본인 조회·확인·불일치·공개, 작성자 설명 읽기·저장, 표 다섯 개.
- **주요 파일**: `registration-service.ts`, `registration-batch.ts`, `new-catch-content.ts`, `owner-catch-store.ts`, `owner-catch-response.ts`, `owner-catch-input.ts`, `catch-reader.ts`, `author-description-store.ts`, `author-description-input.ts`(4,000자), `author-description.controller.ts`, `owner-catches.controller.ts`, `public-catch-store.ts`(제품에서 안 씀), `entities/catch-asset.entity.ts`·`catch-evidence.entity.ts`·`candidate-registration.entity.ts`·`commit-assignment.entity.ts`·`repository-protection.entity.ts`
- **이 intent와 닿는 곳**: (앞 intent) 목록 응답에 작성자 설명 여부·시각·저장소 이름 칸이 없고 순서는 `catch_id`다. 새 Catch 내용은 등록 때만 쓰고 기존 Catch는 바꾸지 않는다. (#559) 닿지 않는다(받은 사람 AI는 사본만 읽는다).
- **의존**: PostgreSQL, `api.analysis-receiver`(후보 타입), `api.auth`(`CurrentMemberId`)
- **깊이**: 깊게(11-09)

### api.materials
- **책임**: 텍스트 자료(제목 100자·본문 20,000자) 목록·만들기·읽기·고치기·지우기. PDF 자료 표.
- **주요 파일**: `api/src/materials/*`
- **깊이**: 훑음(11-09)

### api.publications
- **책임**: 발행(트랜잭션 안 사본·공개 전환·조각), 작성자 발행본 목록·상세·중지·삭제, 면접관 열람·비밀번호 통과, C-10 `PublicationAccess` DB 구현.
- **주요 파일**: `publish.service.ts`, `publish-input.ts`, `snapshot-builder.ts`, `published-snapshot.ts`, `publication.entity.ts`, `publication-manage.service.ts`, `db-publication-access.ts`, `publication-access.ts`, `recipient-access.service.ts`, `publications.controller.ts`, `recipient-links.controller.ts`, `publications-config.ts`, `in-memory-publication-access.ts`(시험용)
- **이 intent와 닿는 곳**: (#559) 발행 트랜잭션이 `published-index`의 `chunkInTransaction`을 부른다. 조각 나누기를 바꿔도 이 모듈은 그대로이지만 발행 전체 글 60,000자 상한(`publications-config.ts`)과 조각 수는 함께 본다. `PublishedSnapshot`(C-07)은 `rag-answer`·`published-index`가 읽는 모양이다.
- **의존**: `api.catches` 표(SQL로 직접), `api.materials` 표, `api.share-links` 도구, `api.published-index`, `api.ai-run`, `api.daily-run-limit`, `api.ai-consent`, `api.file-storage`, `api.member-profile`
- **깊이**: 깊게(11-09). `published-snapshot.ts` 칸 이름은 11-16 훑음

### api.share-links
- **책임**: 링크 토큰·비밀번호 해시(scrypt)·grant 서명·시도 제한기·주소 키. 10월 `share_link` 표와 엔티티가 남아 있다.
- **주요 파일**: `api/src/share-links/*`
- **깊이**: 훑음(11-09)

### api.published-index
- **책임**: 발행 사본을 조각으로 나누고(사본 문자열 칸마다, 1,000자 이하 범위), 조각을 발행 트랜잭션 안에서 저장하고, 백그라운드로 Voyage 임베딩을 채우고, 색인 상태 판정과 발행본 안 의미 검색을 준다(C-08·C-09).
- **주요 파일**: `chunker.ts`(조각 나누기, 순수), `published-index-writer.ts`(`chunkInTransaction`·`requestReindex`), `embed-publication-handler.ts`(`EMBED_PUBLICATION`), `published-search.ts`(`readIndexState`·`search`), `published-chunk.entity.ts`·`publication-index.entity.ts`(표), `embedding-config.ts`(값), `embedding-types.ts`·`embedding-provider.ts`·`voyage-embedding-provider.ts`·`synthetic-embedding-provider.ts`(제공자), `published-index-log.ts`, `published-index.module.ts`(토큰 `PUBLISHED_INDEX_WRITER`·`PUBLISHED_SEARCH`)
- **조각 규칙(11-16 확인)**:
  - 항목 `position` → 칸 순서 → 칸 안 위치 순으로 조각을 만든다. Catch 칸 순서는 `workFacts[i]` → `subjectContribution` → `evidence[i].representedFacts[j]` → `authorDescription`(null이 아닐 때), 텍스트 자료는 `body`, PDF는 읽을 수 있는 `pages[n]`(`chunker.ts` 104~146행).
  - 칸이 1,000자 이하면 범위 하나, 넘으면 빈 줄 문단 → 줄 → 1,000자 자리 순으로 겹치지 않게 모으고 앞뒤 공백을 뺀다. 위치는 UTF-16 단위(152~239행).
  - Catch 근거 하나(`evidence[i]`)의 기록 줄은 줄(`representedFacts[j]`)마다 따로 조각이다. 조각에는 그 Catch 근거 주소 전체(`catchEvidenceUrls`)가 붙지만 어느 근거 줄인지는 `fieldPath` 글자뿐이다.
  - `aiDraft`·`mismatch`·항목 `title`·`repositoryName`·`authorDescriptionEditedMonth`·`workLimits`·근거 `ownCommit`은 조각이 아니다.
  - 사본 모양이 C-07과 다르거나 위치 검사가 틀리면 `ChunkSourceError`로 발행 전체가 되돌려진다.
- **검색 규칙(11-16 확인)**: 그 발행본 조각만 `embedding <=> 질문 벡터`로 정확 비교(근사 색인 없음), `ORDER BY distance, seq LIMIT n`. 색인이 `DONE`이 아니면 `IndexNotReady`, 빈 질문이면 Voyage를 부르지 않고 빈 결과(`published-search.ts` 124~144행).
- **이 intent와 닿는 곳**: 바꿀 곳 1(같은 근거 줄 함께 보내기)과 2(어느 Catch인지 알게 하기)의 출발점. 조각은 발행 때 한 번 나누고 [검색 다시 준비]도 다시 나누지 않아 옛 발행본은 그대로 남는다. 함께 고칠 파일은 `code-quality-assessment.md` 「이 intent(#559)가 닿는 자리」.
- **의존**: PostgreSQL(pgvector), `api.ai-run`(처리기 등록·등록), `api.ai-generation`(`guarded-fetch`), Voyage AI
- **깊이**: 11-16 깊게(폴더 전부)

### api.rag-answer
- **책임**: 면접관 질의응답(SSE: 확인 넷 → 다시 쓰기 → 검색 8개 → 인용 생성 스트림), 기본 요약 읽기·다시 만들기와 `BASE_SUMMARY` 처리기, 링크당 하루 질문 수(Redis), 로그 사건.
- **주요 파일**: `qna.controller.ts`, `qna-service.ts`(`answerQuestion`·`chunkToSource`), `question-input.ts`, `question-rewriter.ts`, `question-counter.ts`, `korean-date.ts`, `summary.controller.ts`, `summary-sources.ts`, `base-summary-handler.ts`, `base-summary-store.ts`, `base-summary.entity.ts`, `rag-answer-config.ts`, `rag-answer-log.ts`, `link-access-errors.ts`, `rag-answer-tokens.ts`, `rag-answer.module.ts`
- **값과 지시(11-16 확인, `rag-answer-config.ts`)**: 질문 500자, 앞 대화 6개·2,000자, 검색 8개(`QNA_SEARCH_LIMIT`), 하루 100개, 요약 시한 10분, 다시 쓰기 10초·200토큰, keep-alive 15초, 질의응답 모델 `HAIKU`(`QNA_MODEL`). `QNA_INSTRUCTION` = 「발행본 자료만으로 질문에 답하고, 근거가 되는 줄을 인용하며, 자료에 없는 일은 없다고 말한다.」 + `AUTHOR_MATERIAL_VOICE_INSTRUCTION`(「자료 종류가 작성자 자료 원문인 내용은 '작성자는 …라고 적었다'처럼 작성자의 말로 옮기고, 확인된 사실처럼 쓰지 않는다.」). 끝 문장 상수는 기본 요약·JD 요약 지시도 같이 쓴다.
- **결과와 로그(11-16 확인)**: `answerQuestion`은 예외 대신 `QnaRunResult`(stage `REWRITE|SEARCH|GENERATE`, outcome `OK|REWRITE_FAILED|SEARCH_FAILED|INDEX_NOT_READY|GENERATION_FAILED|CLIENT_CLOSED`)를 돌려주고, 컨트롤러가 `qna.completed`(단계·결과·오류 이름·시간·조각 수·보낸 항목 수)를 남긴다. 버린 항목 수는 이 로그에 없고 게이트 로그 `ai_gate_result`에만 있다(`rag-answer-log.ts` 23행 주석).
- **기본 요약 근거(11-16 확인)**: 조각이 아니라 사본 칸 하나 = 근거 하나(`summary-sources.ts` 96~114행), 위치는 칸 전체. 칸 순서는 조각과 같은 순서를 따로 적는다.
- **이 intent와 닿는 곳**: 바꿀 곳 3(`QNA_INSTRUCTION`)과 5(답 0개 원인 로그). `chunkToSource`가 조각을 근거로 옮기는 자리라 바꿀 곳 1·2의 요청 쪽 변경이 여기를 지난다.
- **의존**: `api.published-index`(C-09), `api.ai-generation`(C-01), `api.publications`(C-10 `PUBLICATION_ACCESS`), `api.ai-run`, `api.daily-run-limit`, Redis(질문 수), Anthropic(다시 쓰기)
- **깊이**: 11-16 깊게(폴더 전부, `question-counter.ts`는 앞부분과 규약)

### api.ai-generation
- **책임**: C-01 AI 생성 게이트. 입구 검사(80,000자·모델), 인용 요청 만들기(근거마다 인용 문서), Claude 호출(한 번·스트림), 응답 줄 → 항목, 블록 범위 → 사본 위치, 따옴표 인용(#528), 기계 대조, JD 역할, 게이트 로그.
- **주요 파일**: `checked-gate.ts`(앱이 쓰는 U2 게이트), `ai-generation.gate.ts`(U1 최소 경로·`createCitationClient`·`toCallFailed`), `ai-generation.module.ts`(토큰 `AI_GENERATION_GATE`), `ai-generation.types.ts`, `gate-policy.ts`, `citation-lines.ts`, `citation-request.ts`, `claude-citation-client.ts`, `response-items.ts`, `citation-locator.ts`, `quote-citations.ts`, `fact-check.ts`, `jd-checks.ts`, `guarded-fetch.ts`
- **요청 규칙(11-16 확인)**: 근거 순서대로 줄이 있는 근거만 인용 문서 하나로 만든다(줄마다 글 블록, `citations.enabled`, `context` = 자료 종류). 문서 번호 → 근거 위치 대응표(`CitationDocument`)는 문서 하나에 근거 하나다. 근거가 없으면 Claude를 부르지 않는다(`SKIP`). `publicationText`는 보내지 않는다(`citation-request.ts`).
- **응답 규칙(11-16 확인)**: 줄이 `- `로 시작해야 항목이다. 인용이 있으면 모두 위치로 연결돼야 하고(하나라도 아니면 `location`으로 버림), 없으면 따옴표 인용을 찾고, 그래도 없으면 `AI_INTERPRETATION`. 출력 상한에서 끝난 마지막 줄은 `truncated`로 버린다(`response-items.ts`).
- **대조 규칙(11-16 확인)**: 인용 항목은 항목 글의 숫자·PR 번호·파일 이름·영어 표기(예외 약어 제외)가 인용한 줄들(+그 근거의 Catch PR 번호)에 모두 있어야 한다. 인용 없는 항목은 숫자·PR 번호가 없어야 하고 영어 표기·파일 이름이 `publicationText`(질의응답은 발행본 조각 전체)에 있어야 한다(`fact-check.ts` 96~134행).
- **로그(11-16 확인)**: 성공 끝은 `ai_gate_result`(feature·mode·itemCount·droppedCount·`dropReasons{truncated, location, fact, role, outside_heading}`·nonItemLineCount·quoteCitedCount·stopReason·토큰·시간·requestId), 실패는 `ai_gate_failed`(feature·mode·failure·itemCount·droppedCount·requestId·시간). 스트림은 모델 항목이 0개일 때만 `NO_ITEMS`로 실패한다(`checked-gate.ts` 132~145·204~218행).
- **이 intent와 닿는 곳**: 바꿀 곳 2(`SOURCE_KIND_CONTEXT`·문서 만들기)와 5(로그 칸). 바꿀 곳 1에서 여러 줄을 한 문서로 보내면 대응표·위치 찾기·따옴표 인용 찾기가 함께 바뀐다. 이 게이트는 기본 요약·질의응답·JD 요약이 함께 쓴다.
- **의존**: Anthropic API(`@anthropic-ai/sdk`)
- **깊이**: 11-16 깊게(폴더 전부, `jd-checks.ts`·`guarded-fetch.ts`는 앞부분과 내보낸 이름)

### api.jd-summary
- **책임**: 받은 사람 화면 4번 자리의 JD 요약(로그인 회원). JD 한 줄마다 발행본 검색 6개 → `JD_SUMMARY` 생성.
- **주요 파일**: `jd-summary-processor.ts`(검색 호출 30행), `jd-generation-request.ts`(조각 → 근거, 지시문), `jd-summary.service.ts`, `jd-summary-store.ts`, `jd-summary.module.ts`
- **이 intent와 닿는 곳**: (#559) 같은 조각·검색·게이트를 쓴다. `jdGenerationRequest`는 조각 글 1,000자 이하·근거 6개 이하·`charEnd - charStart === text.length`를 검사해 어기면 `JdContractInvalid`다(`jd-generation-request.ts` 18~23·32행). 지시 끝 문장은 `AUTHOR_MATERIAL_VOICE_INSTRUCTION`이다.
- **깊이**: 11-16 훑음(`jd-generation-request.ts` 전부, 처리기는 검색 줄만)

### api.ai-run
- **책임**: `ai-run` 큐의 백그라운드 실행(C-02). 커밋 뒤 등록, 처리기 등록, 실행 상태 표 도우미(`readStatus`, `persistDeadlineFailure`).
- **주요 파일**: `api/src/ai-run/ai-run.ts`, `ai-run-spec.ts`, `run-status-store.ts`
- **깊이**: 훑음(11-09)

### api.ai-consent
- **책임**: 외부 AI 첫 이용 동의 판본(`2026-11-v2`)과 동의 확인·기록.
- **주요 파일**: `api/src/ai-consent/*`
- **깊이**: 훑음(11-09)

### api.daily-run-limit
- **책임**: 계정당 한국 시간 하루 실행 횟수(종류별). 호출자의 트랜잭션 안에서 센다.
- **주요 파일**: `api/src/daily-run-limit/*`
- **깊이**: 훑음(11-09)

### api.file-storage
- **책임**: 파일 저장(`local` 드라이버), 발행본·회원 접두어 삭제.
- **주요 파일**: `api/src/file-storage/*`
- **깊이**: 훑음(11-09)

### api.withdrawal
- **책임**: 탈퇴 4단계(세션·발행 링크·MCP → 회원 파일 → 자격정보 파일 → 회원 행 연쇄 삭제).
- **주요 파일**: `api/src/withdrawal/*`
- **깊이**: 훑음(11-09)

### api.claude-mcp
- **책임**: Claude 본인 연결. OAuth(SDK `mcpAuthRouter`), `/v1/mcp`, 도구 둘, 연결 상태·승인·해제, 빈도 제한, 로그.
- **주요 파일**: `mcp.controller.ts`, `mcp-tools.ts`, `mcp-material-reader.ts`, `mcp-page.ts`, `mcp-oauth.provider.ts`, `mcp-connection.service.ts`, `mcp-config.ts`, 엔티티 넷
- **이 intent와 닿는 곳**: (앞 intent) `list_my_catches`가 `author_description`을 그대로 준다.
- **깊이**: 자료 읽기·쪽 만들기 깊게, 나머지 훑음(11-09)

### api.health
- **책임**: `GET /health`.
- **주요 파일**: `api/src/health/health.controller.ts`
- **깊이**: 깊게(11-09)

### contract.repository-analysis
- **책임**: api·worker 공유 메시지 계약(Request·ProcessingEvent·ResultReceipt v2, Result v3).
- **주요 파일**: `api/contracts/repository-analysis/worker-messages.yaml`, `common.yaml`
- **이 intent와 닿는 곳**: (앞 intent) `Candidate`가 `additionalProperties: false`라 칸을 더하면 판본을 올린다. (#559) 닿지 않는다.
- **깊이**: worker-messages 깊게, common 훑음(11-09)

## web

### web.app-routes
- **책임**: Next.js 주소와 레이아웃(`(guest)`·`(member)` 가드·`s/[token]`), 오류·404 화면, 개발용 미리보기.
- **주요 파일**: `web/src/app/**`, `web/src/lib/routes.ts`
- **깊이**: routes 깊게, 나머지 훑음(11-09)

### web.lib
- **책임**: API 호출 함수(`/v1` 붙이기, 회원·받은 사람 구분), 응답 해석, 인증 상태·갱신·로그아웃, 저장 결과 문구, 저장하지 않은 변경 경고, GitHub 주소 판정.
- **주요 파일**: `web/src/lib/api.ts`, `api-client.ts`(`normalizeApiBaseUrl`·`API_VERSION_PATH`), `api-response.ts`, `auth-*.ts`, `save-outcome.ts`, `unsaved-traverse-guard.ts`, `view-store.ts`, `github-source-url.ts`
- **이 intent와 닿는 곳**: (앞 intent) `splitGithubLinks`가 한글에서 주소를 끊는다(15~18행).
- **깊이**: github-source-url 깊게, 나머지 훑음(11-09)

### web.components
- **책임**: 헤더 셋, 회원 가드·인증 부품, 안내창, 상태 표시, AI 동의 창·한 줄 안내(`AI_NOTICE_VERSION`, `AiNoticeLine`), 받은 사람 안내 묶음, 오류 화면 문구.
- **주요 파일**: `web/src/components/**`
- **깊이**: 훑음(11-09)

### web.assets
- **책임**: 내 자산 화면. Catch 목록(저장소·공개 상태 걸러 보기, 더 보기)·상세 대화상자, 확인·불일치·공개 조작, 작성자 설명 편집, 저장소 연결 관리 자리.
- **주요 파일**: `assets-view.tsx`, `types.ts`, `catch-api.ts`, `assets-store.ts`, `assets-connected.tsx`, `author-description-api.ts`·`author-description-editor.tsx`·`author-description-panel.tsx`, `catch-actions.tsx`
- **이 intent와 닿는 곳**: (앞 intent) 목록 카드(제목·`workFacts[0]`·근거 수), 걸러 보기, 작성자 설명 textarea(4,000자). (#559) 닿지 않는다.
- **의존**: `api.catches`, `web.lib`
- **깊이**: 깊게(store·connected는 훑음, 11-09)

### web.publications
- **책임**: 발행 화면(고르기·순서·제목·비밀번호·확인·완료), 발행본 목록·상세, 사본 그리기(`PublishedSnapshotView`, 작성자 상세와 면접관 화면이 함께 씀).
- **주요 파일**: `publish-screen.tsx`, `publish-view.tsx`, `publish-sources.ts`, `publications-api.ts`, `snapshot-view.tsx`, `publication-detail-*.tsx`, `publications-list-*.tsx`
- **이 intent와 닿는 곳**: (#559, 11-16 훑음) 작성자 발행본 상세(`publication-detail-view.tsx` 84행)가 `BaseSummaryPanel` 작성자 모드를 `publicationId`·`showEvidence`로 달고, 사본(`detail.snapshot`, 항목 `title` 포함)은 같은 화면 86행 `PublishedSnapshotView`에 넘긴다. 근거 강조는 `publication-detail-screen.tsx` 121~150행이 받은 사람 화면과 같은 규칙으로 처리한다. `snapshot-view.tsx`는 강조 범위를 `<mark data-testid="snapshot-highlight">`로 그리고, 근거 칸(`subjectContribution`·`evidence[...]`)이 강조되면 접힌 근거를 연다(142~155행).
- **깊이**: snapshot-view·publish-sources 깊게, publish-view 앞부분, 나머지 훑음(11-09). 상세 화면은 11-16 훑음

### web.recipient
- **책임**: 면접관 링크 화면(불러오기·접근 불가·비밀번호·준비됨), 사본과 U5·U10 패널 자리, 근거 강조.
- **주요 파일**: `recipient-view.tsx`, `recipient-screen.tsx`, `recipient-api.ts`, `recipient-store.ts`, `recipient-grants.ts`, `recipient-format.ts`, `recipient-slots.ts`
- **이 intent와 닿는 곳**: (#559, 11-16 훑음) `RecipientSlots`(`recipient-view.tsx` 97~113행)가 자리 2에 `BaseSummaryPanel`, 자리 3에 `QnaPanel`, 자리 4에 `JdRecipientPanel`을 같은 `RecipientSlotProps`로 단다. 사본은 같은 화면 84행에서 `PublishedSnapshotView`로 가고 패널에는 가지 않는다. `showEvidence`(`recipient-screen.tsx` 59~73행)는 `resolveEvidenceTarget`(`recipient-slots.ts` 40~51행)으로 항목·칸·범위를 사본에 대조해 강조하고 그 자리로 옮긴다. `fieldText`(62~78행)가 `fieldPath` → 사본 문자열을 찾는다.
- **깊이**: view·api 깊게, 나머지 훑음(11-09). `recipient-slots.ts`·패널 자리는 11-16 훑음

### web.rag-answer
- **책임**: AI 기본 요약 패널(받은 사람·작성자 모드), 질의응답 패널(SSE 읽기·대화 메모리), 요약·답 항목 표시(`GatedItemView`), 응답 모양 검사, 안내 문구.
- **주요 파일**: `base-summary-panel.tsx`, `qna-panel.tsx`, `gated-item-view.tsx`, `rag-answer-api.ts`, `sse-reader.ts`, `rag-answer-state.ts`, `rag-answer-messages.ts`, `rag-answer.module.css`, `README.md`
- **항목 표시(11-16 확인)**: `GatedItemView({ items, showEvidence, testId })`가 `<ul>` 안에 항목마다 `<li>`: 항목 글, `AI_INTERPRETATION`이면 「AI 해석」 꼬리표, `CITED`면 인용마다 `<blockquote>`(인용문 + `sourceLabel` 글자의 단추, 누르면 `showEvidence(citation.location)`). 확인된 사실 표시는 붙이지 않고 글은 React 텍스트로만 그린다(`gated-item-view.tsx` 10~36행). 이 부품을 쓰는 곳은 이 폴더의 두 패널뿐이다. JD 요약은 `features/jd/jd-result-view.tsx`의 자기 부품(「원문에서 확인」 단추)을 쓴다.
- **질의응답 패널(11-16 확인)**: 대화는 화면 메모리에만 두고, 질문마다 최근 6개를 보내고, 항목이 오는 대로 그린다. 끝 안내는 `askDisplay`가 정한다: `done` + 항목 0개면 「발행본에서 이 질문의 근거를 찾지 못했습니다」, `error`면 받은 항목을 두고 「답을 만들지 못했습니다. 다시 질문해 주세요」, 스트림 전 409·429·400은 입력란 아래 안내(`rag-answer-state.ts` 74~96행).
- **props(11-16 확인)**: 받은 사람 모드 `{ token, getGrant, onAccessLost, isLoggedIn, showEvidence }`(C-11 `RecipientSlotProps`를 각자 선언), 작성자 모드 `{ publicationId, showEvidence }`. 패널은 사본을 받지 않는다.
- **이 intent와 닿는 곳**: 바꿀 곳 4(출처 딱지 옆 항목 제목). 제목은 사본을 가진 화면(받은 사람·작성자)에만 있다.
- **의존**: `api.rag-answer`, `web.lib`, `web.components`(`AiNoticeLine`)
- **깊이**: 11-16 깊게(폴더 전부, `sse-reader.ts`는 머리 설명과 규약)

### web.materials
- **책임**: 텍스트 자료 목록·편집 한 화면(`/materials`).
- **주요 파일**: `web/src/features/materials/*`
- **깊이**: 훑음(11-09)

### web.repository-management
- **책임**: 저장소 연결 관리(등록·상태·분석 요청 연결).
- **주요 파일**: `web/src/features/repository-management/*`, `web/src/features/analysis-request/*`
- **깊이**: 훑음(11-09)

### web.member-account
- **책임**: 로그인·세션 화면, 회원 진입, 프로필 설정·보기·수정, GitHub 연결, Claude 연결·승인, 홈·시작 안내, 탈퇴, 서비스 소개.
- **주요 파일**: `web/src/features/{auth-screens,auth-session,member-entry,profile,github-connection,claude-connection,home,start-guide,withdrawal,landing}/*`
- **깊이**: 훑음(11-09)

## 배포·검사·도구

### deploy.images-compose
- **책임**: 세 서비스 운영 이미지, 한 호스트 Compose 실행, 로컬 합성 DB·큐, 이미지 검사.
- **주요 파일**: `api/Dockerfile`, `web/Dockerfile`, `worker/Dockerfile`, `.dockerignore`, `deploy/compose.single.yaml`, `deploy/compose.local-db.yaml`, `deploy/local-db/*`, `deploy/scripts/*`, `deploy/env/*.example`
- **깊이**: 훑음(11-09)

### deploy.dev-server
- **책임**: AWS EC2 한 대 개발 서버(Caddy), main push 자동 배포(SSM).
- **주요 파일**: `deploy/dev-server/**`, `.github/workflows/deploy-dev-server.yml`
- **깊이**: 훑음(11-09)

### deploy.aws
- **책임**: EKS·RDS·EFS·WAF·로그·경보 생성 스크립트와 k8s 매니페스트(12월 최종 환경).
- **주요 파일**: `deploy/aws/**`
- **깊이**: 훑음(11-09)

### ci.github-actions
- **책임**: PR·push 검사(changes·web·api·worker·deps-audit), 이미지 검사, 문서 크기 검사, Dependabot, 이슈·PR 양식.
- **주요 파일**: `.github/workflows/ci.yml`, `images.yml`, `.github/scripts/*`, `.github/dependabot.yml`, `.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md`
- **깊이**: 훑음(11-09)

### docs.team
- **책임**: 팀 문서 정본(작업관리·코딩 절차·보안 점검·레포 컨벤션·결정 기록)과 AI-DLC 입력 스냅샷.
- **주요 파일**: `docs/README.md`, `docs/CatchU_*.md`, `docs/ai-dlc-input-catch/*`
- **깊이**: 앞 intent 입력(`CatchU_새_Catch_입력.md` §4~§9)만 깊게, 나머지 목록만(11-09)

### tools.queue-verification
- **책임**: 9~10월 BullMQ Node↔Python 호환 검증 키트와 결과.
- **주요 파일**: `docs/queue-verification/**`
- **깊이**: 훑음(11-09)
