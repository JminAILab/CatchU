# 분석 고지·접수·실패 재요청 — #138

## 기준과 검증 범위

[회원 API](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml)와 [접수·재요청 계약](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#분석-접수상태재요청), [업무 규칙](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md)의 현재 판본을 따른다. 이슈에 연결된 9093d2e 판본 이후 제목 null·제목 고쳐 쓰기 등 변경을 확인했다. 제목만 없다고 실패 재요청을 허용하지 않으며 접수·동시성·실패 재요청 기준을 바꾸지 않는다.

첫 연결은 [#104 개발 회원·합성 GitHub 연결](member-analysis.md)과 [#136 선정 저장소 공급](member-repositories.md)을 사용한다. 실제 Nest HTTP·PostgreSQL로 접수와 롤백을 검사하지만 GitHub 자료·worker·LLM을 호출하지 않는다. 기존 Google·GitHub·세션 기능을 대체하지 않는다. #139 수신/개발 주입·#140 이력/개별 상태 GET은 새로 구현하지 않는다.

## 합성 고지의 정본·활성화

`src/analysis-intake/analysis-notice.ts`의 `SYNTHETIC_NOTICE`에서 본문·판본·범위를 함께 버전 관리한다. 고지 판본은 `catchu-synthetic-analysis-notice-v1`, 허용 범위 판본은 [공용 합성 표본](../../worker/fixtures/m1-synthetic/context.sample.json) 및 #104의 `00000000-0000-4000-8000-000000000201`이다. 합성 COMMIT/PULL_REQUEST/ISSUE와 선정 참조를 묶는다. 본문/범위를 바꾸면 판본도 함께 변경해 오래된 동의를 현재 동의로 받지 않는다. 접수한 동의는 DB에서 불변으로 보존한다.

- `NODE_ENV=development` 또는 `test`와 `DEV_LOGIN_ENABLED=true`일 때만 합성 고지를 제공한다.
- 실제 회원·LIVE 공급이나 실제 자료용 설정 부재를 합성 고지/동의로 보정하지 않는다. 현재 접수 공급자는 #136과 같은 DevMemberService이며 개발 회원·합성 연결 이외는 거부한다. LIVE는 `403 CONSENT_REQUIRED`로 접수하지 않는다.
- 실제 자료용 고지는 팀장이 문구를 쓰고 승인하며, 담당(E)이 그 문구를 실제 자료용 판본으로 API에 싣는다([2026-10-14 결정](https://github.com/JminAILab/CatchU/issues/138#issuecomment-6159562994)). 문구와 실제 공급자·허용 범위가 정해져 반영되기 전에는 이 합성 판본을 실제 자료 처리 동의로 사용할 수 없다. 실제 worker 전달도 없다.
- 운영이나 개발 기능이 비활성이면 고지 조회와 신규 접수 모두 기존 #136 개발 공급자의 `403 INTERNAL_ERROR`로 거부한다. 개발 회원 경계 거부도 같은 기준을 유지한다. 동의 누락·고지/범위 판본 불일치는 `403 CONSENT_REQUIRED`로 구분하며 공통 필터·오류 코드는 바꾸지 않는다. 조회 실패·자료 불일치는 `500 INTERNAL_ERROR`이며 정상 빈 목록이나 권한 없음으로 바꾸지 않는다.
- 정상 해제로 `DISCONNECTED`의 외부 계정 참조가 null이 된 개발 회원은 고지 조회를 할 수 있지만 신규 접수·저장소 조회는 `403 GITHUB_CONNECTION_REQUIRED`다. 연결 행 부재도 고지 제공을 막지 않는다. CONNECTED의 합성 참조 검사와 개발 회원 경계를 유지하며, 정상 해제 외 잘못된 참조·실제 자료를 합성 연결로 보정하지 않는다.

## API와 입력

#104 이전의 UUID가 아닌 회원 토큰은 고지 조회·접수 모두 DB 조회 전에 401 AUTH_INVALID로 거부한다.

병합된 [#250 세션 인증](auth-sessions.md)의 DB Guard를 따른다. 자동 검사의 문자열 회원 토큰은 제품 발급 함수를 우회해 시험에서 직접 서명하고, 운영·개발 기능 비활성 검사는 실제 시험 회원과 `SessionService.create`의 유효한 세션으로 인증을 통과한 뒤 기존 403 차단을 확인한다. 세션 정책·응답 계약은 바꾸지 않는다.

모든 경로는 기존 전역 회원 Guard와 `@CurrentMemberId()`를 사용한다. 성공·오류 모두 `Cache-Control: no-store`다. 새 응답 필드·오류 코드·환경변수는 추가하지 않는다.

| 경로 | 입력 | 성공 |
|---|---|---|
| `GET /v1/analysis-notice` | Bearer 회원 인증, 쿼리 없음 | 200 `{noticeRevision,text}`, 본문에 합성 시험임을 표시 |
| `POST /v1/analysis-requests` | Bearer, 필수 `Idempotency-Key` 1~128자, 아래 JSON, 쿼리 없음 | 새 요청 202, 같은 저장소 ACTIVE/같은 키 재응답 200, 모두 계약의 AnalysisStatus |

```json
{
  "repositoryId": "synthetic-repo-0001",
  "consent": {
    "accepted": true,
    "noticeRevision": "catchu-synthetic-analysis-notice-v1",
    "scopeRevision": "00000000-0000-4000-8000-000000000201"
  }
}
```

실패 재요청은 같은 형식에 `retryOfRequestId`를 추가하고 **새 키·새로운 동의**로 전송한다. 통신 응답 불명에서 같은 접수를 확인하는 재전송은 원래 키·원래 본문을 유지한다. 서버는 자동 재전송하지 않는다.

추가 필드·누락·잘못된 타입/빈 값은 `400 VALIDATION_FAILED`, JSON 해석 실패·키 오류는 기존 `400 INVALID_REQUEST`다. false 동의와 현재 고지/범위 판본 불일치는 `403 CONSENT_REQUIRED`, 미연결/재인증 필요는 `403 GITHUB_CONNECTION_REQUIRED`, 선정 대상 아님은 `403 REPOSITORY_NOT_ALLOWED`다. 다른 회원·없는/잘못된 재요청 UUID는 같은 `404 RESOURCE_UNAVAILABLE`이며 기존 작업 ID를 누출하지 않는다.

## 저장·잠금·중복 처리

#104의 `runIdempotentCreation`과 `insertInitialAnalysis`를 재사용한다. 신규 접수는 READ COMMITTED에서 **멱등 키 → 회원 단위 접수 잠금 → 현재 연결/회원 읽기 잠금 → 요청 → 시도** 순서로 판정한다. 연결 공급자는 선택적인 EntityManager를 받으면 접수 트랜잭션 안에서 현재 회원·연결을 확인하며 연결 변경이 커밋 전에 판정을 뒤집지 않게 한다. 기존 #136 조회는 원래 REPEATABLE READ 경계를 유지한다.

- 같은 회원·operation·키의 정규화 입력은 고정 순서 tuple(repositoryId, accepted, noticeRevision, scopeRevision, retryOfRequestId)의 SHA-256 지문으로 비교한다. 지문이 같아도 공통 비동기 비교 콜백에서 연결 자원의 회원·저장소·응답 참조를 확인한다. 비밀값은 지문·응답 참조에 저장하지 않는다.
- 같은 키·다른 유효 본문은 409 IDEMPOTENCY_CONFLICT다. 같은 키·같은 본문은 회원 인증·키 소유·지문 일치·참조 요청의 회원/저장소/응답 참조를 확인하고 연결 자원의 **현재 상태**를 다시 읽어 200으로 응답한다. 이미 접수된 키에서는 현재 GitHub 연결·선정·고지/범위 판본을 신규 접수 조건으로 다시 검사하지 않는다. 접수 뒤 DISCONNECTED·REAUTH_REQUIRED·판본 변경에도 같은 requestId를 반환하고 새 행을 만들지 않는다. 새 키의 신규 접수와 새로운 실패 재요청은 현재 조건을 계속 검사한다.
- 다른 키끼리도 회원 단위 advisory lock으로 판정/생성을 직렬화하며 기존 DB ACTIVE 부분 유일성 제약을 유지한다.
- 상태 읽기의 요청·시도 잠금은 `FOR NO KEY UPDATE`를 사용한다. 멱등 소유 확인의 요청 행 `FOR KEY SHARE`를 유지하면서, 이전 키 재전송이 회원 잠금을 기다리고 새 키 실패 재요청이 같은 요청 행을 읽을 때의 교착을 피한다. 요청→시도 잠금 순서와 상태 변경 차단, 회원·요청 소유 확인은 유지한다.
- 같은 저장소의 ACTIVE는 새 동의/시도 없이 기존 요청을 200으로 반환하고 해당 키를 그 요청에 연결한다. 다른 저장소 ACTIVE는 409 ANALYSIS_IN_PROGRESS와 본인의 `details.existingRequestId`다.
- 신규 요청·새 동의·첫 시도·멱등 기록은 같은 manager에서 저장하고 응답 구성까지 마친 뒤 바깥 커밋 성공 후에만 202를 반환한다. 저장/응답 구성/최종 커밋 실패는 전체 롤백한다. 같은 키 재응답이 원 동의를 변경하거나 새 동의를 만들지 않는다.
- 새 접수의 상태는 ACCEPTED/ACTIVE/QUEUED/NOT_READY, sourceMode=MOCK, 후보 0·Catch ID 빈 목록·ownerResultsReady=false다. 202는 실행·반영 완료를 의미하지 않는다.

## 선행 이력과 실패 재요청

같은 회원·저장소의 선행 이력을 검사한다. 다른 저장소의 종료 이력에 실패 재요청 기준을 확대하지 않는다. 같은 저장소에 정상 완료·EMPTY·유효 부분 결과나 후보/등록 Catch가 있으면 요청 참조를 빼더라도 409 REANALYSIS_DEFERRED다. 반영 실패로 닫혔고 등록 Catch가 없는 요청(아래 ②)은 정상 완료가 아니므로 이 검사에서 제외하고, 가장 최근 요청의 재요청 판정으로 넘긴다.

실패 재요청은 가장 최근 요청을 `retryOfRequestId`로 명시하고, 그 요청이 CLOSED이며 등록 Catch가 없는 아래 두 경우 중 하나여야 한다([처리 시한 계약 PR #292](https://github.com/JminAILab/CatchU/pull/292)). 두 경우 모두 `retry.allowed=true`, `reason=FAILURE_WITHOUT_RESULTS`다.

**① 실패 확정.** FAILED/APPLIED/CLOSED이고 다음을 모두 만족한다.

1. 진행·반영·복구가 남지 않았다.
2. 적합 후보·등록 연결·원 요청의 Catch 본체가 없고 ownerResultsReady=false다.
3. 실패 배열이 있고 서버의 실패 확정 참조 또는 기존 E가 검증·저장한 현재 시도의 ResultApplicationRecord가 있다. HTTP 시간 초과·조회 실패·수신 ACK만으로 확정하지 않는다.

**② 반영 실패로 닫힘.** APPLY_FAILED/CLOSED이고 등록 연결·Catch 본체가 없으며 ownerResultsReady=false다. 처리 결과(processing)·적합 후보 수·실패 배열·실패 확정 참조는 보지 않는다. 닫히지 않은(ACTIVE) 반영 실패는 대상이 아니다.

두 경우 모두 현재 연결·선정 대상·고지/범위와 새 동의가 유효해야 하며, 이 검사는 선행 이력 검사보다 먼저 한다.

참조 생략·오래된 요청 선택·실행 불명·닫히지 않은 반영 대기/실패/복구·확정 근거 부족은 409 RETRY_NOT_ALLOWED다. 등록 Catch나 유효 결과가 있으면 409 REANALYSIS_DEFERRED다. 허용하면 새 requestId/consentId/attemptId를 만들고 원 요청을 retryOfRequestId로 연결한다. 원 요청/동의·Catch·링크는 변경하지 않는다. 실패 확정 참조와 처리 시한 닫기의 실제 공급은 [#237](https://github.com/JminAILab/CatchU/issues/237) 범위이며 여기서 시간을 근거로 만들지 않는다.

상태 응답은 같은 트랜잭션의 요청/시도 잠금 안에서 읽는다. 등록 Catch ID는 현재 시도의 B 등록 연결에서 본인 열람 준비가 확인된 것만 반환한다. 실패 확정 참조·수신 지문·자격정보는 응답에 포함하지 않는다.

`retry.reason`은 재요청 판정의 사유이며 결과 유무나 실패 원인을 뜻하지 않는다. `RESULTS_EXIST`는 등록 연결(본인 열람 준비 전 포함)이나 원 요청의 Catch 본체가 있으면 내려가고, 반영 실패로 닫히지 않은 요청에 적합 후보가 있을 때도 내려가므로 열람 가능한 Catch가 없어도 나올 수 있다. `registeredCatchIds`에는 위처럼 본인 열람 준비가 확인된 Catch만 담긴다. 화면 안내는 `reason`이 아니라 `lifecycle`·`application`·`registeredCatchIds`로 만든다.

이전 실패 키를 다시 조회해도 현재 다른 ACTIVE가 있으면 retry.allowed=false/IN_PROGRESS다. 이미 후속 요청을 만든 오래된 실패는 후속 작업이 끝나도 재요청 대상으로 표시하지 않는다. 같은 키 재응답의 현재 판정과 새 POST의 선행 이력 판정이 엇갈리지 않게 한다. 두 판정은 `analysis-status.ts`의 `retryDecision`·`blocksReanalysis` 한 곳에서 계산한다.

## 실행 요청 맥락의 준비와 경계

`AnalysisIntakeService.prepareExecutionRequest`는 저장한 요청·시도·동의·허용 scope를 현재 worker Request 스키마에 맞춰 준비하는 **내부 함수**다. 자격정보 참조도 mock 전용이며 실제 토큰을 제공하지 않는다. HTTP 경로·큐 등록·worker 호출·자동 재시도·처리 시한은 없다. 메시지 준비가 실행 증거가 아니며 요청은 QUEUED로 남는다. #139를 자동 AppModule에 등록하지 않는다.

## 개발 재현과 검사

[README 설치·DB 테스트](../README.md#db-테스트)를 따르고 기존 .env·DB를 덮어쓰지 않는다. 개발 로그인으로 토큰을 메모리에만 받아 `GET /v1/me/repositories`의 저장소/범위와 `GET /v1/analysis-notice`의 현재 고지를 읽은 뒤 위 본문을 POST한다. 합성 판본을 실제 계정/자료로 제출하지 않는다. 토큰·OAuth query·DB 비밀값·HTTP 원문은 로그나 PR에 붙이지 않는다.

```powershell
npm run lint
npm run typecheck
npm test -- test/db/analysis-intake.test.cjs test/member-repositories.test.cjs test/db/member-analysis.test.cjs
npm test
npm run test:analysis-fixtures
npm run build
```

`analysis-intake.test.cjs`는 실제 HTTP·전용 PostgreSQL의 새 접수·현재 상태 재응답·다중 키 경쟁·회원 경계·현재 연결/고지/범위·저장/지연 커밋 실패·확정 실패/정상/부분/불명/복구 판정을 검사한다. [PR #284 리뷰 F1~F3](https://github.com/JminAILab/CatchU/pull/284#pullrequestreview-5498953523) 회귀로 접수 뒤 연결·선정·판본 변경의 200/동일 ID/행 불변과 새 키·실패 재요청 거부, 고지/접수 비활성 403 구분, 정상 해제의 고지 200·접수 403을 확인한다. 공유 공급자의 저장소 조회 회귀는 정상 해제 403과 잘못된 참조·DB 실패 500을 구분한다. 해제 상태는 DB에 정상 API와 같은 null 참조 형태로 구성하며 이번에 실제 GitHub 승인·해제 API를 시험한 것은 아니다. 여러 저장소는 시험 공급 대역, 종결 실패는 합성 상태 또는 기존 E에 합성 Result를 수신·반영한 준비물이다. worker Request 스키마 대조는 전송 시험이 아니다.

[교착 리뷰](https://github.com/JminAILab/CatchU/pull/284#pullrequestreview-5500599838)의 회귀는 확정 실패 준비 후 별도 DB 연결로 회원 접수 잠금을 잡고 새 키 실패 재요청→이전 키 재전송 순서로 대기시킨다. `pg_locks`에서 두 대기를 확인한 뒤 풀며 3개의 독립 시험에서 각각 202·200, 이전 실패의 현재 상태, 새 요청의 ACTIVE 하나, 요청·동의·시도·멱등 기록 각각 총 2개와 원 기록 불변을 확인한다. 새 키를 다시 전송해도 200·추가 행 없음이어야 한다. 수정 전 잠금으로는 이 시험 3건이 교착에 따른 500을 검출한다. 검토 사본의 결과와 최종 구현 판본에서 직접 수행한 결과는 PR 검사 기록에서 구분한다.

②의 시험은 처리 시한 닫기([#237](https://github.com/JminAILab/CatchU/issues/237))가 병합되기 전이므로 APPLY_FAILED/CLOSED를 시험 DB에 직접 구성한다. 처리 결과 4종(FAILED·EMPTY·SUCCEEDED·PARTIAL_FAILED)과 후보 수에서 허용·새 ID·이력 연결·원 기록 불변·응답과 POST 판정 일치를 확인하고, 등록 연결(열람 준비 true/false)·Catch 본체만 있는 경우와 닫히지 않은 ACTIVE에서는 거부(ACTIVE는 같은 저장소 200·다른 저장소 409)를 확인한다. 이 시험은 닫는 주기·실제 반영 흐름을 대신하지 않는다.

자동 검사 결과와 실제 명령·작업 위치·판본·미검증은 #138 구현 PR에서 관리한다. 실제 GitHub·worker·화면 전체 연결, 실제 고지/자료 처리 동의 승인과 작성자 외 재현은 이 합성 API 검사와 구분한다.
