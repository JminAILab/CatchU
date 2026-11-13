# 구성 요소 목록 — CatchU

> 기준: 2026-11-09 전체 다시 스캔(`kind: full`), 커밋 `a1d0fbb4`. 아래 `###` 제목이 구성 요소 이름이며 `reverse-engineering-timestamp.md`의 `analyzed.components`가 글자 그대로 쓴다. 「깊이」는 이번 실행에서 읽은 정도다(깊게 = 핵심 파일을 끝까지 읽음, 훑음 = 파일 목록·머리 설명·내보낸 이름만). 경로 표는 `api-documentation.md`, 판본은 `technology-stack.md`에 있다.

## worker

### worker.collection
- **책임**: 허용한 GitHub 자료(커밋·PR·이슈)와 관계(PR 커밋 목록, 연결 PR GraphQL, 병합 경계, 파일 모드)를 모아 정규화 기록과 근거 재료를 만든다. 원자료는 메모리에만 둔다.
- **주요 파일**: `worker/app/collection/collect.py`(순서), `records.py`(기록 모양), `evidence.py`(근거 문장), `relations.py`(관계, 1,584줄), `gateway.py`·`transport.py`(호출 통제·HTTPS), `limits.py`·`budget.py`(상한), `credentials.py`·`selection.py`(자격정보·범위 대조)
- **이 intent와 닿는 곳**: 규칙 사실의 재료가 이미 있다. 커밋마다 `authored_at`·`committed_at`, 파일마다 `status`(renamed)·`previous_path`·`patch`·`mode_lines`. 파일 내용 식별값(blob sha)은 버린다(`records.py` 43~56행).
- **의존**: GitHub REST·GraphQL(httpx2), `app.processing.request_check`
- **깊이**: records·evidence 깊게, 나머지 훑음

### worker.candidates
- **책임**: 수집 결과만으로 작업 단위(PR·PR 없는 병합·본인 커밋 묶음)를 정하고, 소속 커밋을 빼고, 후보 자격·미제공 집계·작업 사실·나의 기여·근거·`wi1` 열쇠·기록의 글·본인 커밋 목록을 만든다. GitHub를 부르지 않는다.
- **주요 파일**: `worker/app/candidates/grouping.py`(`group`, 7단계, 1,880줄), `build.py`(`build_candidates`), `identity.py`(`work_identity`), `record_text.py`(기록의 글·부실 판단), `same_change.py`(같은 변경)
- **이 intent와 닿는 곳**: 작업 사실 문장(`build.py` 27~36·124~134행, 1~2줄, CatchU가 센 숫자·날짜 없음), 근거 20건 상한(`EVIDENCE_COMMIT_CAP`), 본인 커밋 목록(`own_commit_shas`). 「작업 시각」은 단위 안 본인 커밋의 `authored_at`에서 계산할 수 있다.
- **의존**: `worker.collection`, `worker.processing`(자료형)
- **깊이**: record_text 깊게, build는 모듈 설명과 앞 300줄, grouping은 모듈 설명

### worker.generation
- **책임**: 후보마다 재료(바뀐 줄)를 고르고 가리고 크기에 맞춰 Claude에 보내 설명 초안·생각해 볼 질문·제목 후보를 만든다. AI 쪽(CR3)이 켜지면 판정 질문을 만들고 답을 제목·작업 사실·설명에 적용한다.
- **주요 파일**: `worker/app/generation/flow.py`(입구, 943줄), `material.py`, `request.py`, `groups.py`(종류 순서 코드→시험→설정→문서), `title.py`(`classify` 파일 종류), `patch.py`(patch 온전성), `judged.py`, `claude.py`(실제 제공자, 786줄), `response.py`, `limits.py`, `outcome.py`
- **이 intent와 닿는 곳**: 「시험 파일 있음」 판정에 쓸 수 있는 `classify`(`title.py` 37~43·131행). 입력 문서는 이 분류가 빌드 결과물도 시험으로 센다고 보고 더 좁은 분류를 따로 두려 한다.
- **의존**: `worker.candidates`(`group` 다시 부름), `worker.collection`, `worker.judgement`, Anthropic API
- **깊이**: title 분류 깊게, 나머지 훑음

### worker.judgement
- **책임**: 판정 공급자 자리(CR3). 질문마다 확률·점수로만 답한다. OpenAI Decisions(`gpt-6-luna`)와 Claude 구조화 출력, 합성 어댑터.
- **주요 파일**: `worker/app/judgement/provider.py`(규약), `questions.py`, `answers.py`, `factcheck.py`(기계 대조), `openai_judge.py`, `claude.py`, `synthetic.py`
- **이 intent와 닿는 곳**: 직접 닿지 않는다. 기계 대조 빼기는 이 intent 밖(#485).
- **깊이**: 훑음

### worker.processing
- **책임**: 요청 검사(계약·접수 맥락·현재 시도), 진행 알림, LIVE 조립(수집→후보→생성), 결과 조합·계약 검사, MOCK 가짜 생성기, FR10 확인 명령.
- **주요 파일**: `worker/app/processing/live.py`, `pipeline.py`, `result.py`, `generation.py`(후보 자료형 `EligibleCandidate`·`RecordText`), `request_check.py`, `runner.py`, `fake_generator.py`, `confirm.py`
- **이 intent와 닿는 곳**: 새 규칙 사실을 후보 자료형에 싣고 결과 메시지로 옮기는 길(`generation.py`, `result.py`), 가짜 생성기의 합성 값
- **의존**: `worker.contract`, `worker.collection`, `worker.candidates`, `worker.generation`, `worker.request_context`
- **깊이**: generation 앞부분 깊게, 나머지 훑음

### worker.contract
- **책임**: `api/contracts/repository-analysis/` YAML을 읽어 메시지 스키마를 검사하고 합성 템플릿을 채운다.
- **주요 파일**: `worker/app/contract/worker_messages.py`
- **이 intent와 닿는 곳**: 계약 판본을 올리면 이 검사기가 새 YAML을 그대로 읽는다.
- **깊이**: 훑음

### worker.consumer
- **책임**: BullMQ 큐 소비자. 부모가 요청마다 자식 프로세스를 띄우고(동시 수 설정), 상한·종료 순서·수신 확인·상태 확인을 맡는다.
- **주요 파일**: `worker/app/consumer/parent.py`, `children.py`, `child.py`, `service.py`, `settings.py`, `queues.py`, `receipts.py`, `health.py`
- **이 intent와 닿는 곳**: 없다.
- **깊이**: 훑음

### worker.request_context
- **책임**: api 내부 조회 한 번(찾음·모름·실패)과 응답 해석. 소속 커밋 집합(`assigned_commits`)도 여기서 받는다.
- **주요 파일**: `worker/app/request_context/client.py`, `decode.py`, `reasons.py`, `settings.py`
- **깊이**: 훑음

### worker.redact
- **책임**: 비밀값·개인정보 가리기. 생성 재료와 기록의 글 검사가 함께 쓴다.
- **주요 파일**: `worker/app/redact.py`
- **깊이**: 훑음

## api

### api.common
- **책임**: 공통 오류 형식·필터·입력 검증 파이프, no-store, 요청 ID, 보안 헤더, CORS, 신뢰 프록시, 주기 작업, Redis 오류 감시.
- **주요 파일**: `api/src/common/errors/*`, `common/http/*`, `common/periodic-task.ts`, `common/redis-connection-errors.ts`, `cors.ts`, `trust-proxy.ts`, `app.setup.ts`
- **깊이**: app.setup 깊게, 나머지 훑음

### api.auth
- **책임**: Access JWT(15분) 발급·검증 전역 Guard, 세션·Refresh 쿠키, 개발 로그인, worker 서비스 키.
- **주요 파일**: `api/src/auth/*`(`access-token.guard.ts`, `session.service.ts`, `session.entity.ts`, `worker-context-auth.ts`)
- **깊이**: 훑음

### api.database
- **책임**: DB 연결 설정, 데이터 원본, 이름 규칙, 마이그레이션 25개, CHECK·외래 키 도우미.
- **주요 파일**: `api/src/database/*`, `database/migrations/*`
- **이 intent와 닿는 곳**: `catch_asset`에 만든 시각 칸이 없다. 새 칸은 마이그레이션으로 더한다.
- **깊이**: 표 목록과 `catch_asset`·`commit_assignment` 변경 깊게

### api.member-analysis
- **책임**: 회원·프로필·GitHub 연결·분석 요청·동의·시도·멱등 기록 표와 공통 멱등 처리, 개발 회원.
- **주요 파일**: `api/src/member-analysis/member-analysis.entity.ts`(표 일곱 개), `idempotent-creation.ts`, `dev-member.service.ts`
- **깊이**: 훑음

### api.member-profile
- **책임**: `GET /v1/me`, `PUT /v1/me/profile`, 발행본 판정이 쓰는 소유 회원 상태 읽기(`OwnerProfileReader`).
- **주요 파일**: `api/src/member-profile/*`
- **깊이**: 훑음

### api.google-login
- **책임**: Google 인가 주소·코드 교환·회원 연결, 시도 제한.
- **주요 파일**: `api/src/google-login/*`
- **깊이**: 훑음

### api.github-connection
- **책임**: GitHub OAuth App 연결·해제, 토큰 AES-256-GCM 파일 보관, 단일 자격정보 제공 함수.
- **주요 파일**: `api/src/github-connection/*`(`credential-vault.ts`, `github-connection.service.ts`)
- **깊이**: 훑음

### api.member-repositories
- **책임**: 공개 저장소 직접 등록·목록, 선정·허용 범위 판본, worker 맥락용 선정 공급자.
- **주요 파일**: `api/src/member-repositories/*`(`repository-registration.service.ts`, `repository-selection.source.ts`, `registration-context.source.ts`)
- **이 intent와 닿는 곳**: 저장소 이름(owner/name)은 `repository_registration`·선정 쪽에 있고 Catch·사본에는 없다. 사본에 저장소 이름을 넣으려면 발행 때 여기를 읽어야 한다.
- **깊이**: 훑음

### api.analysis-intake
- **책임**: 분석 고지(합성·실제 v3), 접수(멱등·동의·하루 횟수 한 트랜잭션), 이력·상태·홈 요약.
- **주요 파일**: `api/src/analysis-intake/analysis-intake.controller.ts`, `analysis-intake.service.ts`, `analysis-notice.ts`(`catchu-real-analysis-notice-v3`), `analysis-history.ts`
- **이 intent와 닿는 곳**: 3단계 규칙 사실의 결과 문장을 Catch에 남기면 고지 4절과 판본을 바꾼다.
- **깊이**: 컨트롤러 깊게, 서비스·고지는 훑음

### api.analysis-queue
- **책임**: 대기 시도를 읽어 Request v2를 조립·검사하고 큐에 넣는다(5초, 100건). 진행 알림·결과를 받는다.
- **주요 파일**: `api/src/analysis-queue/queue-spec.ts`, `analysis-request.dispatcher.ts`, `worker-message.consumer.ts`, `analysis-queue.module.ts`
- **깊이**: 규격 깊게, 나머지 훑음

### api.analysis-receiver
- **책임**: 결과·알림 메시지 검사·중복 판정·수신 기록·수신 확인, 등록 연결(보호 관측 포함).
- **주요 파일**: `api/src/analysis-receiver/receiver.types.ts`, `analysis-receiver.service.ts`, `worker-message.validator.ts`, `analysis-registration.service.ts`, `repository-registration.port.ts`
- **이 intent와 닿는 곳**: `Candidate` 타입과 검사기. 결과에 칸을 더하면 여기도 바뀐다.
- **깊이**: 자료형 깊게, 나머지 훑음

### api.result-application
- **책임**: 수신 정본을 한 트랜잭션에서 Catch 등록으로 반영하고 시도·요청 상태를 닫는다.
- **주요 파일**: `api/src/result-application/result-application.service.ts`, `registration.port.ts`, `result-application.entity.ts`
- **깊이**: 앞부분 깊게

### api.analysis-deadline
- **책임**: 접수 뒤 60분 처리 시한을 1분마다 판정해 닫는다(`PeriodicTask`).
- **주요 파일**: `api/src/analysis-deadline/*`
- **깊이**: 훑음

### api.worker-context
- **책임**: worker 전용 내부 조회. 접수 맥락·GitHub 토큰·저장소 좌표·허용 자료 종류·소속 커밋 SHA 전체를 잠금 아래에서 확인해 준다.
- **주요 파일**: `api/src/worker-context/worker-context.service.ts`, `worker-context.controller.ts`, `worker-context.types.ts`
- **이 intent와 닿는 곳**: 소속 커밋을 넘겨 재분석 때 빼게 한다(114~121·172행). 규칙 사실을 다시 계산하는 재분석은 이미 속한 커밋을 보지 못한다.
- **깊이**: 소속 커밋 부분과 응답 모양 깊게

### api.catches
- **책임**: Catch 등록(회원·열쇠 잠금, 만들기·참조, 소속 기록), 본인 조회·확인·불일치·공개, 작성자 설명 읽기·저장, 표 다섯 개.
- **주요 파일**: `registration-service.ts`, `registration-batch.ts`, `new-catch-content.ts`, `owner-catch-store.ts`, `owner-catch-response.ts`, `owner-catch-input.ts`, `catch-reader.ts`, `author-description-store.ts`, `author-description-input.ts`(4,000자), `author-description.controller.ts`, `owner-catches.controller.ts`, `public-catch-store.ts`(제품에서 안 씀), `entities/catch-asset.entity.ts`·`catch-evidence.entity.ts`·`candidate-registration.entity.ts`·`commit-assignment.entity.ts`·`repository-protection.entity.ts`
- **이 intent와 닿는 곳**: 목록 응답에 작성자 설명 여부·시각·저장소 이름 칸이 없고 순서는 `catch_id`다. 작성자 설명은 한 칸(4,000자) 그대로 칸 제목 글을 담을 수 있다. 새 Catch 내용은 등록 때만 쓰고 기존 Catch는 바꾸지 않는다.
- **의존**: PostgreSQL, `api.analysis-receiver`(후보 타입), `api.auth`(`CurrentMemberId`)
- **깊이**: 깊게

### api.materials
- **책임**: 텍스트 자료(제목 100자·본문 20,000자) 목록·만들기·읽기·고치기·지우기. PDF 자료 표(U8 몫, 아직 경로 없음).
- **주요 파일**: `api/src/materials/*`
- **깊이**: 훑음

### api.publications
- **책임**: 발행(트랜잭션 안 사본·공개 전환·조각), 작성자 발행본 목록·상세·중지·삭제, 면접관 열람·비밀번호 통과, C-10 `PublicationAccess` DB 구현.
- **주요 파일**: `publish.service.ts`, `publish-input.ts`, `snapshot-builder.ts`, `published-snapshot.ts`, `publication.entity.ts`, `publication-manage.service.ts`, `db-publication-access.ts`, `publication-access.ts`, `recipient-access.service.ts`, `publications.controller.ts`, `recipient-links.controller.ts`, `publications-config.ts`, `in-memory-publication-access.ts`(시험용)
- **이 intent와 닿는 곳**: `CatchSnapshot` 칸(저장소 이름·작성 시점·조회 한계 없음), 발행 SQL이 읽는 칸, 사본 모양을 쓰는 다른 곳(`code-quality-assessment.md`).
- **의존**: `api.catches` 표(SQL로 직접), `api.materials` 표, `api.share-links` 도구, `api.published-index`, `api.ai-run`, `api.daily-run-limit`, `api.ai-consent`, `api.file-storage`, `api.member-profile`
- **깊이**: 깊게

### api.share-links
- **책임**: 링크 토큰·비밀번호 해시(scrypt)·grant 서명·시도 제한기·주소 키. 10월 `share_link` 표와 엔티티가 남아 있다.
- **주요 파일**: `api/src/share-links/*`
- **깊이**: 훑음

### api.published-index
- **책임**: 사본을 조각으로 나누고(필드 단위, 1,000자), 임베딩(Voyage)하고, 의미 검색한다.
- **주요 파일**: `chunker.ts`, `published-index-writer.ts`, `embed-publication-handler.ts`, `published-search.ts`, `voyage-embedding-provider.ts`, `synthetic-embedding-provider.ts`, `embedding-config.ts`
- **이 intent와 닿는 곳**: 조각 대상은 `workFacts[i]`·`subjectContribution`·`evidence[i].representedFacts[j]`(GITHUB_RECORD)와 `authorDescription`(AUTHOR_MATERIAL). 새 사본 칸은 고르지 않으면 조각이 되지 않는다(입력 문서가 원하는 동작).
- **깊이**: chunker·writer 깊게, 나머지 훑음

### api.rag-answer
- **책임**: 면접관 질의응답(SSE: 다시 쓰기 → 검색 → 인용 생성), 기본 요약 읽기·다시 만들기와 `BASE_SUMMARY` 처리기, 링크당 하루 질문 수(Redis).
- **주요 파일**: `qna.controller.ts`, `qna-service.ts`, `question-rewriter.ts`, `question-counter.ts`, `summary.controller.ts`, `summary-sources.ts`, `base-summary-handler.ts`, `base-summary-store.ts`, `rag-answer-config.ts`
- **이 intent와 닿는 곳**: 요약 근거는 사본 필드에서 직접 만든다(`summary-sources.ts`). 「작성자는 …라고 적었다」 지시 변경은 `rag-answer-config.ts` 쪽이다(2단계).
- **깊이**: summary-sources 깊게, 나머지 훑음

### api.ai-generation
- **책임**: C-01 AI 생성 게이트. Claude 인용 호출, 줄 나누기·위치 계산, 입구 검사·공통 지시·기계 대조·스트림, JD 역할.
- **주요 파일**: `checked-gate.ts`, `claude-citation-client.ts`, `citation-*.ts`, `fact-check.ts`, `response-items.ts`, `guarded-fetch.ts`, `jd-checks.ts`
- **깊이**: 훑음

### api.ai-run
- **책임**: `ai-run` 큐의 백그라운드 실행(C-02). 커밋 뒤 등록, 처리기 등록, 실행 상태 표 도우미.
- **주요 파일**: `api/src/ai-run/ai-run.ts`, `ai-run-spec.ts`, `run-status-store.ts`
- **깊이**: 훑음

### api.ai-consent
- **책임**: 외부 AI 첫 이용 동의 판본(`2026-11-v2`)과 동의 확인·기록.
- **주요 파일**: `api/src/ai-consent/*`
- **깊이**: 훑음

### api.daily-run-limit
- **책임**: 계정당 한국 시간 하루 실행 횟수(종류별). 호출자의 트랜잭션 안에서 센다.
- **주요 파일**: `api/src/daily-run-limit/*`
- **깊이**: 훑음

### api.file-storage
- **책임**: 파일 저장(`local` 드라이버), 발행본·회원 접두어 삭제.
- **주요 파일**: `api/src/file-storage/*`
- **깊이**: 훑음

### api.withdrawal
- **책임**: 탈퇴 4단계(세션·발행 링크·MCP → 회원 파일 → 자격정보 파일 → 회원 행 연쇄 삭제).
- **주요 파일**: `api/src/withdrawal/*`
- **깊이**: 훑음

### api.claude-mcp
- **책임**: Claude 본인 연결. OAuth(SDK `mcpAuthRouter`), `/v1/mcp`, 도구 둘, 연결 상태·승인·해제, 빈도 제한, 로그.
- **주요 파일**: `mcp.controller.ts`, `mcp-tools.ts`, `mcp-material-reader.ts`, `mcp-page.ts`, `mcp-oauth.provider.ts`, `mcp-connection.service.ts`, `mcp-config.ts`, 엔티티 넷
- **이 intent와 닿는 곳**: `list_my_catches`가 `author_description`을 그대로 준다. 칸 제목 글도 그대로 간다.
- **깊이**: 자료 읽기·쪽 만들기 깊게, 나머지 훑음

### api.health
- **책임**: `GET /health`.
- **주요 파일**: `api/src/health/health.controller.ts`
- **깊이**: 깊게

### contract.repository-analysis
- **책임**: api·worker 공유 메시지 계약(Request·ProcessingEvent·ResultReceipt v2, Result v3).
- **주요 파일**: `api/contracts/repository-analysis/worker-messages.yaml`, `common.yaml`
- **이 intent와 닿는 곳**: `Candidate`가 `additionalProperties: false`라 규칙 사실·작업 시각 칸을 더하면 판본을 올린다.
- **깊이**: worker-messages 깊게, common 훑음

## web

### web.app-routes
- **책임**: Next.js 주소와 레이아웃(`(guest)`·`(member)` 가드·`s/[token]`), 오류·404 화면, 개발용 미리보기.
- **주요 파일**: `web/src/app/**`, `web/src/lib/routes.ts`
- **깊이**: routes 깊게, 나머지 훑음

### web.lib
- **책임**: API 호출 함수(`/v1` 붙이기, 회원·받은 사람 구분), 응답 해석, 인증 상태·갱신·로그아웃, 저장 결과 문구, 저장하지 않은 변경 경고, GitHub 주소 판정.
- **주요 파일**: `web/src/lib/api.ts`, `api-client.ts`, `api-response.ts`, `auth-*.ts`, `save-outcome.ts`, `unsaved-traverse-guard.ts`, `view-store.ts`, `github-source-url.ts`
- **이 intent와 닿는 곳**: `splitGithubLinks`가 한글에서 주소를 끊는다(15~18행). 짚어 볼 곳 링크 안내에 닿는다.
- **깊이**: github-source-url 깊게, 나머지 훑음

### web.components
- **책임**: 헤더 셋, 회원 가드·인증 부품, 안내창, 상태 표시, AI 동의 창·한 줄 안내(`AI_NOTICE_VERSION`), 받은 사람 안내 묶음, 오류 화면 문구.
- **주요 파일**: `web/src/components/**`
- **깊이**: 훑음

### web.assets
- **책임**: 내 자산 화면. Catch 목록(저장소·공개 상태 걸러 보기, 더 보기)·상세 대화상자, 확인·불일치·공개 조작, 작성자 설명 편집, 저장소 연결 관리 자리.
- **주요 파일**: `assets-view.tsx`, `types.ts`, `catch-api.ts`, `assets-store.ts`, `assets-connected.tsx`, `author-description-api.ts`·`author-description-editor.tsx`·`author-description-panel.tsx`, `catch-actions.tsx`
- **이 intent와 닿는 곳**: 목록 카드(제목·`workFacts[0]`·근거 수), 걸러 보기는 받은 목록 안에서만 한다(`assets-view.tsx` 112~113행). 작성자 설명은 textarea 하나(4,000자). 「질문에 대한 답변을 저장하는 기능은 제공하지 않습니다」 문구(275행).
- **의존**: `api.catches`, `web.lib`
- **깊이**: 깊게(store·connected는 훑음)

### web.publications
- **책임**: 발행 화면(고르기·순서·제목·비밀번호·확인·완료), 발행본 목록·상세, 사본 그리기(`PublishedSnapshotView`, 작성자 상세와 면접관 화면이 함께 씀).
- **주요 파일**: `publish-screen.tsx`, `publish-view.tsx`, `publish-sources.ts`, `publications-api.ts`, `snapshot-view.tsx`, `publication-detail-*.tsx`, `publications-list-*.tsx`
- **이 intent와 닿는 곳**: 「저장소마다 3~5개 권장」 안내 자리, 사본 칸 순서(불일치 → AI 초안 → 작성자 설명 → 기록, 근거 접기)와 새 칸 그리기, `isCatchSnapshot` 검사(62~67행).
- **깊이**: snapshot-view·publish-sources 깊게, publish-view 앞부분, 나머지 훑음

### web.recipient
- **책임**: 면접관 링크 화면(불러오기·접근 불가·비밀번호·준비됨), 사본과 U5 패널 자리, 근거 강조.
- **주요 파일**: `recipient-view.tsx`, `recipient-screen.tsx`, `recipient-api.ts`, `recipient-store.ts`, `recipient-grants.ts`, `recipient-format.ts`, `recipient-slots.ts`
- **이 intent와 닿는 곳**: `pickItem`(`recipient-api.ts` 27~44행)이 사본 칸을 하나씩 골라 옮긴다. 새 칸은 여기서도 넣어야 보인다.
- **깊이**: view·api 깊게, 나머지 훑음

### web.rag-answer
- **책임**: 기본 요약 패널, 질의응답 패널(SSE 읽기), 근거 단추.
- **주요 파일**: `web/src/features/rag-answer/*`
- **깊이**: 훑음

### web.materials
- **책임**: 텍스트 자료 목록·편집 한 화면(`/materials`).
- **주요 파일**: `web/src/features/materials/*`
- **깊이**: 훑음

### web.repository-management
- **책임**: 저장소 연결 관리(등록·상태·분석 요청 연결).
- **주요 파일**: `web/src/features/repository-management/*`, `web/src/features/analysis-request/*`
- **깊이**: 훑음

### web.member-account
- **책임**: 로그인·세션 화면, 회원 진입, 프로필 설정·보기·수정, GitHub 연결, Claude 연결·승인, 홈·시작 안내, 탈퇴, 서비스 소개.
- **주요 파일**: `web/src/features/{auth-screens,auth-session,member-entry,profile,github-connection,claude-connection,home,start-guide,withdrawal,landing}/*`
- **깊이**: 훑음

## 배포·검사·도구

### deploy.images-compose
- **책임**: 세 서비스 운영 이미지, 한 호스트 Compose 실행, 로컬 합성 DB·큐, 이미지 검사.
- **주요 파일**: `api/Dockerfile`, `web/Dockerfile`, `worker/Dockerfile`, `.dockerignore`, `deploy/compose.single.yaml`, `deploy/compose.local-db.yaml`, `deploy/local-db/*`, `deploy/scripts/*`, `deploy/env/*.example`
- **깊이**: 훑음

### deploy.dev-server
- **책임**: AWS EC2 한 대 개발 서버(Caddy), main push 자동 배포(SSM).
- **주요 파일**: `deploy/dev-server/**`, `.github/workflows/deploy-dev-server.yml`
- **깊이**: 훑음

### deploy.aws
- **책임**: EKS·RDS·EFS·WAF·로그·경보 생성 스크립트와 k8s 매니페스트(12월 최종 환경, 아직 자원 없음).
- **주요 파일**: `deploy/aws/**`
- **깊이**: 훑음

### ci.github-actions
- **책임**: PR·push 검사(changes·web·api·worker·deps-audit), 이미지 검사, 문서 크기 검사, Dependabot, 이슈·PR 양식.
- **주요 파일**: `.github/workflows/ci.yml`, `images.yml`, `.github/scripts/*`, `.github/dependabot.yml`, `.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md`
- **깊이**: 훑음

### docs.team
- **책임**: 팀 문서 정본(작업관리·코딩 절차·보안 점검·레포 컨벤션·결정 기록)과 AI-DLC 입력 스냅샷.
- **주요 파일**: `docs/README.md`, `docs/CatchU_*.md`, `docs/ai-dlc-input-catch/*`
- **깊이**: 이 intent 입력(`CatchU_새_Catch_입력.md` §4~§9)만 깊게, 나머지 목록만

### tools.queue-verification
- **책임**: 9~10월 BullMQ Node↔Python 호환 검증 키트와 결과.
- **주요 파일**: `docs/queue-verification/**`
- **깊이**: 훑음
