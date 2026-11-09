# U5 RAG 응답 — 비기능 요구사항 질문

입력: [U5 기능 명세](../functional-design/functional-spec.md)·[업무 규칙](../functional-design/rules.md), [요구사항](../../../inception/requirements-analysis/requirements.md)의 NFR1~NFR7·C02·C07, [계약 요약](../../../inception/contract-design/contract-summary.md)의 C-01·C-02·C-09·C-12와 「에러 대응 최소선」, [보안 점검](../../../../../../../docs/CatchU_security_checks.md)의 「외부 호출」·「로그·오류 응답」·「LLM·검색 기능」, 기존 코드 `api/src/ai-generation`(게이트·`guarded-fetch.ts`·`claude-citation-client.ts`의 모델 ID 상수), `api/src/analysis-queue/analysis-queue.config.ts`(Redis 주소 검사).

이미 정해진 것(다시 묻지 않음): 처리 시간·가동률·복구 수치는 새로 만들지 않는다(NFR4). 질문 다시 쓰기는 U5의 `QuestionRewriter`로 `@anthropic-ai/sdk`·`CATCHU_GENERATION_API_KEY`를 쓰고 시간 제한 10초, 실패는 SSE `error` 하나, 재시도 없음(기능 설계 BR4.1·BR4.6). 답 생성·기본 요약은 U2 게이트(C-01, 게이트 기본 시간 제한 45초), 질문 임베딩은 U3 검색(호출당 10초)을 그대로 쓴다. 질문 500자·앞 대화 6개×2,000자·검색 조각 8개·링크당 하루 100회, 기본 요약 처리 시한 10분(기능 설계 Q2·Q3). 질문·대화·답·근거 글·링크 토큰·키는 로그에 남기지 않는다(BR1.4).

## Q1. [보안] `QuestionRewriter`의 외부 호출 상한과 키·모델 처리

보안 점검 「외부 호출」은 주소 고정·redirect 금지·응답 크기와 시간 상한을 요구한다. U1·U2 게이트는 SDK에 `guarded-fetch.ts`의 `createGuardedFetch`(redirect 금지, 응답 본문 256 KiB)를 넣어 이를 지킨다. 기능 설계 검토 R-05는 다시 쓰기의 모델 ID 대응과 키가 비었을 때의 동작이 정해지지 않았다고 지적했다(승인 때 받아들인 위험). 게이트는 키가 비어도 api 기동을 막지 않고 부를 때마다 실패(`NOT_CONFIGURED`)로 끝난다.

A. 게이트와 같게 한다: SDK에 `createGuardedFetch`(기본 256 KiB)를 넣어 redirect 금지·응답 상한을 지키고, 주소는 SDK 기본값(환경변수로 바꾸지 않음), SDK 자동 재시도 0회, 시간 제한 10초, 출력 상한 200토큰. 모델 ID와 추론 설정은 `claude-citation-client.ts`가 내보내는 `CLAUDE_MODEL_IDS`·`THINKING_OFF` 상수를 가져다 쓴다(U1 파일은 고치지 않고 `ClaudeCitationClient`는 쓰지 않음). 키가 비면 api 기동은 막지 않고 다시 쓰기 호출이 그 자리에서 실패해 SSE `error ANSWER_FAILED`가 된다.
B. A와 같되 키가 비면 운영 환경에서 api 기동을 멈춘다 — 설정 누락을 빨리 알지만 게이트와 판정이 갈리고 기동 시험이 는다.
C. `createGuardedFetch` 없이 SDK 시간 제한만 둔다 — 가장 적게 만들지만 보안 점검 「외부 호출」 행을 지키지 못한다.
X. Other (please specify)

[Answer]: A

## Q2. [성능] 질의응답 SSE를 끝까지 열어 두는 방법

질문 하나는 다시 쓰기(최대 10초) → 질문 임베딩(최대 10초) → 답 생성 스트림(게이트 45초)까지 길게는 1분 남짓 걸릴 수 있다. 그 사이 화면 앞 프록시(Next.js·ALB·nginx)가 응답을 모아 두거나 오래 조용한 연결을 끊으면 항목이 차례로 보이지 않는다(AC6.2.2). 새 응답 시간 목표는 만들지 않는다(NFR4).

A. 응답 머리에 `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`를 두고 첫 바이트를 바로 보낸다. 15초마다 SSE 주석 한 줄(`: keep-alive`)을 보내 조용한 연결이 끊기지 않게 한다. 새 지연 목표는 두지 않는다.
B. 머리만 두고 keep-alive 주석은 보내지 않는다 — 더 단순하지만 프록시의 유휴 시간 제한(예: 60초)보다 길어지는 드문 질문은 끊길 수 있다.
C. A에 더해 질문 전체 상한(예: 90초)을 따로 둔다 — 걸린 질문을 확실히 끊지만 단계별 시간 제한과 겹치는 규칙·시험이 는다.
X. Other (please specify)

[Answer]: A

## Q3. [운영] 질문 횟수용 Redis 연결

질문 횟수는 Redis 키로 센다(기능 설계 BR3.1). api에는 분석 큐용 `CATCHU_QUEUE_REDIS_URL` 검사(운영은 비밀번호가 든 `rediss://`만)가 이미 있다. Redis가 멈춰 응답이 늦으면 질문이 그만큼 기다리게 된다. Redis에 닿지 못하면 질문을 통과시키고 기록만 남긴다(BR3.2).

A. 같은 Redis(`CATCHU_QUEUE_REDIS_URL`과 그 검사, 키 앞에 `CATCHU_QUEUE_PREFIX`)에 질문 횟수 전용 연결 하나를 둔다. 명령 시간 제한 1초, 연결이 끊긴 동안 명령을 쌓아 두지 않는다(바로 실패 → 통과·기록). 주소가 비어 있으면(개발 환경 등) 세지 않고 통과·기록한다. 새 환경변수는 없다.
B. 질의응답용 Redis 주소를 따로 둔다(`CATCHU_QNA_REDIS_URL`) — 큐와 나눌 수 있지만 새 비밀값·배포 설정이 팀장 공용 기반 작업으로 는다.
X. Other (please specify)

[Answer]: A

## Q4. [운영] 질의응답·기본 요약 기록에 남길 항목

기능 설계 BR1.4는 발행본 ID·단계·결과 종류·다시 쓰기 여부·검색 조각 수·버린 수만 남기게 했다. 게이트는 자기 로그에 토큰 수·걸린 시간·요청 ID를 남기고, U3 검색도 자기 로그를 남긴다.

A. BR1.4 항목에 질문 하나의 단계별 걸린 시간(다시 쓰기·검색·생성)과 보낸 항목 수, 다시 쓰기 호출의 토큰 수를 더한다. 기본 요약 처리기는 발행본 ID·결과(DONE·FAILED·버림)·실패 종류·항목 수·버린 수·걸린 시간을 남긴다. 모두 계산·응답에서 온 값이고 글 원문은 없다.
B. BR1.4 그대로 두고 기본 요약 처리기는 결과·실패 종류만 남긴다 — 가장 단순하지만 느린 단계와 다시 쓰기 비용을 로그로 볼 수 없다.
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- 외부 호출(Q1 A): `QuestionRewriter` 실제 구현은 SDK에 `createGuardedFetch`(기본 256 KiB)를 넣어 redirect 금지·응답 상한을 지키고, 주소는 SDK 기본값(환경변수로 바꾸지 않음), SDK 자동 재시도 0회, 시간 제한 10초, 출력 상한 200토큰이다. 모델 ID·추론 설정은 `claude-citation-client.ts`의 `CLAUDE_MODEL_IDS`·`THINKING_OFF` 상수를 가져다 쓴다(U1 파일은 고치지 않고 `ClaudeCitationClient`는 쓰지 않음). 키가 비면 api 기동은 막지 않고 다시 쓰기 호출이 그 자리에서 실패해 SSE `error ANSWER_FAILED`가 된다. 기능 설계 검토 R-05를 이것으로 정한다.
- SSE 유지(Q2 A): `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`를 두고 첫 바이트를 바로 보내며, 15초마다 `: keep-alive` 주석 한 줄을 보낸다. 새 지연 목표는 두지 않는다.
- Redis(Q3 A): `CATCHU_QUEUE_REDIS_URL`(그 검사 그대로)과 `CATCHU_QUEUE_PREFIX` 키 앞붙이를 쓰는 질문 횟수 전용 연결 하나. 명령 시간 제한 1초, 끊긴 동안 명령을 쌓지 않음(바로 실패 → 통과·기록). 주소가 비면 세지 않고 통과·기록. 새 환경변수 없음.
- 기록(Q4 A): 질의응답은 BR1.4 항목에 단계별 걸린 시간(다시 쓰기·검색·생성), 보낸 항목 수, 다시 쓰기 토큰 수를 더한다. 기본 요약 처리기는 발행본 ID·결과(DONE·FAILED·버림)·실패 종류·항목 수·버린 수·걸린 시간을 남긴다. 글 원문·키·링크 토큰은 남기지 않는다.
- 질문하지 않고 가장 단순한 안으로 정한 것: 새 응답 시간·가동률·복구 수치는 두지 않는다(NFR4). 기술은 기존 api(NestJS·TypeScript), TypeORM·PostgreSQL, ioredis, `@anthropic-ai/sdk`, web(Next.js)을 그대로 쓰고 새 의존성은 없다. 받은 사람 경로는 별도 요청 빈도 제한 없이 링크당 하루 질문 횟수만 둔다(FR6.6).

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
