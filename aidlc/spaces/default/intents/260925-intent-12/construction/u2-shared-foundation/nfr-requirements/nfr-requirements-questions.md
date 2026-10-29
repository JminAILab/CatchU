# U2 공용 기반 — 비기능 요구사항 질문

입력: [U2 기능 명세](../functional-design/functional-spec.md), [U2 업무 규칙](../functional-design/rules.md), [요구사항](../../../inception/requirements-analysis/requirements.md)의 NFR1~NFR7, [계약 요약](../../../inception/contract-design/contract-summary.md)의 C-01~C-06과 「에러 대응 최소선」.

이미 정해진 것은 묻지 않는다: 처리 시간·가동률·복구 수치는 새로 만들지 않는다(NFR4), 자동 배포·별도 관제 화면은 만들지 않는다(NFR6), 처리 시한 값은 각 작업 주인 Unit이 정한다(C-02), DB 잠금 대기 상한은 앱 계정의 `lock_timeout = 3s`를 그대로 쓴다(api/docs/lock-wait-limit.md), 자동 재시도는 없다(FR6.8). 아래는 U2가 정해야 하는 값만이다. 선택지는 가장 단순한 안을 A로 둔다.

## Q1. [개발] 백그라운드 실행(AiRun)의 동시 실행 수

api 프로세스 하나가 임베딩·기본 요약·JD 요약 작업을 몇 개까지 동시에 돌릴지 정한다. 10월 분석 큐의 소비자는 동시 1이다(api/src/analysis-queue/queue-spec.ts).

A. 1 — 10월 큐와 같다. 발행·JD 요약이 겹치면 차례로 처리한다. 시연 규모에서는 기다림이 길지 않다
B. 3 — 겹친 작업이 빨리 끝난다. 더 막는 것: 시연 중 여러 사람이 동시에 발행했을 때의 대기. 늘어나는 것: Claude·Voyage AI 동시 호출과 그 요금 한도·DB 연결 사용, 동시 실행 시험
X. Other (please specify)

[Answer]: A

## Q2. [개발] 백그라운드 작업을 큐에 남겨 두는 시간

작업 ID는 runKey이고 자동 작업 키는 "{종류}-{publicationId}"다(C-02). 큐에 작업이 남아 있는 동안에는 같은 키를 다시 등록해도 무시된다. 10월 큐는 처리 시한보다 긴 2시간 동안 남긴다.

A. 10월과 같이 2시간 남기고 지운다. 그동안 같은 키 재등록은 무시된다. 정체된 작업은 다시 처리하지 않는다(10월 maxStalledCount 0과 같음)
B. 끝나자마자 지운다. Redis 사용은 조금 줄지만, 같은 키가 다시 등록되면 두 번 실행될 수 있다
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- AiRun 동시 실행 수: api 프로세스당 1(10월 큐와 같음)
- AiRun 작업 보관: 끝나거나 실패한 작업을 2시간 남긴 뒤 지움, 그동안 같은 runKey 재등록은 무시, 정체된 작업은 다시 처리하지 않음(maxStalledCount 0). 전제: 각 Unit이 정하는 처리 시한은 2시간 이하다. 더 긴 시한이 생기면 보관 시간을 그 시한 이상으로 올린다
- 그대로 따르는 것: 처리 시간·가동률·복구 수치는 새로 만들지 않음(NFR4), 별도 관제 화면 없음(NFR6), 처리 시한 값은 각 작업 주인 Unit, DB 잠금 대기 상한은 앱 계정 lock_timeout 3초, 자동 재시도 없음(FR6.8), 로그에는 비밀값·사용자 자료를 남기지 않음(team.md)
- 기술 선택: 새 라이브러리 없이 기존 NestJS·TypeORM·PostgreSQL·Redis(BullMQ)·Next.js와 Node 파일 시스템을 쓴다(FileStorage 로컬). 한국 날짜는 UTC+9 계산으로 둔다

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
