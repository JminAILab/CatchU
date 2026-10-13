# 분석 고지·접수·실패 재요청 — #138

## 기준과 검증 범위

[회원 API](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml)와 [접수·재요청 계약](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#분석-접수상태재요청), [업무 규칙](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md)의 현재 판본을 따른다. 이슈에 연결된 9093d2e 판본 이후 제목 null·제목 고쳐 쓰기 등 변경을 확인했다. 제목만 없다고 실패 재요청을 허용하지 않으며 접수·동시성·실패 재요청 기준을 바꾸지 않는다.

첫 연결은 [#104 개발 회원·합성 GitHub 연결](member-analysis.md)과 [#136 선정 저장소 공급](member-repositories.md)을 사용한다. 실제 Nest HTTP·PostgreSQL로 접수와 롤백을 검사하지만 GitHub 자료·worker·LLM을 호출하지 않는다. 기존 Google·GitHub·세션 기능을 대체하지 않는다. #139 수신/개발 주입·#140 이력/개별 상태 GET은 새로 구현하지 않는다.

## 합성 고지의 정본·활성화

`src/analysis-intake/analysis-notice.ts`의 `SYNTHETIC_NOTICE`에서 본문·판본·범위를 함께 버전 관리한다. 고지 판본은 `catchu-synthetic-analysis-notice-v1`, 허용 범위 판본은 [공용 합성 표본](../../worker/fixtures/m1-synthetic/context.sample.json) 및 #104의 `00000000-0000-4000-8000-000000000201`이다. 합성 COMMIT/PULL_REQUEST/ISSUE와 선정 참조를 묶는다. 본문/범위를 바꾸면 판본도 함께 변경해 오래된 동의를 현재 동의로 받지 않는다. 접수한 동의는 DB에서 불변으로 보존한다.

- `NODE_ENV=development` 또는 `test`와 `DEV_LOGIN_ENABLED=true`일 때만 합성 고지를 제공한다.
- 실제 회원·LIVE 공급이나 실제 자료용 설정 부재를 합성 고지/동의로 보정하지 않는다. 현재 접수 공급자는 #136과 같은 DevMemberService이며 개발 회원·합성 연결 이외는 거부한다. LIVE는 `403 CONSENT_REQUIRED`로 접수하지 않는다.
- 실제 자료용 고지의 정본·관리 책임·승인은 **미결**이다. 실제 공급자·허용 범위와 고지/자료 처리 조건을 함께 정하기 전에는 이 합성 판본을 실제 자료 처리 동의로 사용할 수 없다. 실제 worker 전달도 없다.
- 운영이나 개발 기능이 비활성이면 고지 조회는 `403 CONSENT_REQUIRED`다. 개발 공급자 자체의 비활성/회원 경계 거부는 기존 #136의 `403 INTERNAL_ERROR`를 유지한다. 조회 실패·자료 불일치는 `500 INTERNAL_ERROR`이며 정상 빈 목록이나 권한 없음으로 바꾸지 않는다.

## API와 입력

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

#104의 `runIdempotentCreation`과 `insertInitialAnalysis`를 재사용한다. READ COMMITTED에서 **멱등 키 → 회원 단위 접수 잠금 → 현재 연결/회원 읽기 잠금 → 요청 → 시도** 순서로 판정한다. 연결 공급자는 선택적인 EntityManager를 받으면 접수 트랜잭션 안에서 현재 회원·연결을 확인하며 연결 변경이 커밋 전에 판정을 뒤집지 않게 한다. 기존 #136 조회는 원래 REPEATABLE READ 경계를 유지한다.

- 같은 회원·operation·키의 정규화 입력은 고정 순서 tuple(repositoryId, accepted, noticeRevision, scopeRevision, retryOfRequestId)의 SHA-256 지문으로 비교한다. 지문이 같아도 공통 비동기 비교 콜백에서 연결 자원의 회원·저장소·응답 참조를 확인한다. 비밀값은 지문·응답 참조에 저장하지 않는다.
- 같은 키·다른 유효 본문은 409 IDEMPOTENCY_CONFLICT다. 같은 키는 연결 자원의 **현재 상태**를 다시 읽어 200으로 응답한다.
- 다른 키끼리도 회원 단위 advisory lock으로 판정/생성을 직렬화하며 기존 DB ACTIVE 부분 유일성 제약을 유지한다.
- 같은 저장소의 ACTIVE는 새 동의/시도 없이 기존 요청을 200으로 반환하고 해당 키를 그 요청에 연결한다. 다른 저장소 ACTIVE는 409 ANALYSIS_IN_PROGRESS와 본인의 `details.existingRequestId`다.
- 신규 요청·새 동의·첫 시도·멱등 기록은 같은 manager에서 저장하고 응답 구성까지 마친 뒤 바깥 커밋 성공 후에만 202를 반환한다. 저장/응답 구성/최종 커밋 실패는 전체 롤백한다. 같은 키 재응답이 원 동의를 변경하거나 새 동의를 만들지 않는다.
- 새 접수의 상태는 ACCEPTED/ACTIVE/QUEUED/NOT_READY, sourceMode=MOCK, 후보 0·Catch ID 빈 목록·ownerResultsReady=false다. 202는 실행·반영 완료를 의미하지 않는다.

## 선행 이력과 실패 재요청

같은 회원·저장소의 선행 이력을 검사한다. 다른 저장소의 종료 이력에 실패 재요청 기준을 확대하지 않는다. 같은 저장소에 정상 완료·EMPTY·유효 부분 결과나 후보/등록 Catch가 있으면 요청 참조를 빼더라도 409 REANALYSIS_DEFERRED다.

실패 재요청은 가장 최근 실패 요청을 명시하고 다음을 모두 만족해야 한다.

1. FAILED/APPLIED/CLOSED이며 진행·반영·복구가 남지 않았다.
2. 적합 후보·등록 연결·원 요청의 Catch 본체가 없고 ownerResultsReady=false다.
3. 실패 배열이 있고 서버의 실패 확정 참조 또는 기존 E가 검증·저장한 현재 시도의 ResultApplicationRecord가 있다. HTTP 시간 초과·조회 실패·수신 ACK만으로 확정하지 않는다.
4. 현재 연결·선정 대상·고지/범위와 새 동의가 유효하다.

참조 생략·오래된 실패 선택·실행 불명·반영 실패/복구·확정 근거 부족은 409 RETRY_NOT_ALLOWED다. 허용하면 새 requestId/consentId/attemptId를 만들고 원 실패를 retryOfRequestId로 연결한다. 원 요청/동의·Catch·링크는 변경하지 않는다. 실패 확정 참조의 실제 전송/처리 시한 공급은 기존 후속 작업 범위이며 여기서 시간을 근거로 만들지 않는다.

상태 응답은 같은 트랜잭션의 요청/시도 잠금 안에서 읽는다. 등록 Catch ID는 현재 시도의 B 등록 연결에서 본인 열람 준비가 확인된 것만 반환한다. 실패 확정 참조·수신 지문·자격정보는 응답에 포함하지 않는다.

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

`analysis-intake.test.cjs`는 실제 HTTP·전용 PostgreSQL의 새 접수·현재 상태 재응답·다중 키 경쟁·회원 경계·현재 연결/고지/범위·저장/지연 커밋 실패·확정 실패/정상/부분/불명/복구 판정을 검사한다. 여러 저장소는 시험 공급 대역, 종결 실패는 합성 상태 또는 기존 E에 합성 Result를 수신·반영한 준비물이다. worker Request 스키마 대조는 전송 시험이 아니다.

자동 검사 결과와 실제 명령·작업 위치·판본·미검증은 #138 구현 PR에서 관리한다. 실제 GitHub·worker·화면 전체 연결, 실제 고지/자료 처리 동의 승인과 작성자 외 재현은 이 합성 API 검사와 구분한다.
