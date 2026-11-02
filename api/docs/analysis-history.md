# 본인 분석 이력·개별 상태 조회 — #140

홈용 본인 접수 이력 유무(`GET /v1/me/analysis-summary`, #428)는 [아래 절](#홈용-본인-접수-이력-유무--428)에 있다.

## 기준과 범위

다음 기준을 따른다.

- [회원 API](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml): `GET /analysis-requests`(listAnalysisRequests), `GET /analysis-requests/{requestId}`(getAnalysisRequest)
- [공통 스키마](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml): `AnalysisStatus`, `PageInfo`
- [계약 요약](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md): 「분석 접수·상태·재요청」, [「M — 회원 API」](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#m--회원-api)의 회원 목록 규칙

이슈에 연결된 9093d2e 판본과 현재 판본의 두 경로·`AnalysisStatus`·`PageInfo`는 같다. 상태 전이와 재요청 두 경우는 현재 [API 기능 설계](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md)를 따른다. 이 기준은 [#138 접수](analysis-intake.md), [PR #296](https://github.com/JminAILab/CatchU/pull/296)(닫힌 반영 실패 재요청), [#237 처리 시한 닫기](analysis-deadline.md)에 이미 반영돼 있다.

상태는 접수와 같은 `src/analysis-intake/analysis-status.ts`로 계산한다. 응답 필드·오류 코드·환경변수는 새로 두지 않는다. DB에는 목록 순서를 받치는 인덱스 하나만 더한다(마이그레이션 `1792640486167-AddAnalysisRequestHistoryIndex`). 로컬은 `npm run migration:run`, 배포는 [배포 안내 「migration」](../../deploy/README.md#migration)대로 적용한다. 다음은 이 범위가 아니다.

- 화면: #153·#154
- B의 Catch 조회·상세
- 상태를 바꾸는 API
- #114 전체 연결 검증

## API와 오류

두 경로 모두 기존 전역 회원 Guard와 `@CurrentMemberId()`를 쓰고, 요청에서 회원 ID를 받지 않는다. 성공·오류 응답 모두 `Cache-Control: no-store`다.

| 경로 | 입력 | 성공 |
|---|---|---|
| `GET /v1/analysis-requests` | 쿼리는 `limit`(1~100, 기본 20)과 `cursor`만 | 200 `{items: AnalysisStatus[], page: {nextCursor}}`. 마지막 페이지의 `nextCursor`는 null |
| `GET /v1/analysis-requests/{requestId}` | 쿼리 없음 | 200 `AnalysisStatus` |

| 상황 | 응답 |
|---|---|
| 인증 없음 | `401 AUTH_REQUIRED`(공통 Guard) |
| 토큰·세션 오류 | `401 AUTH_INVALID`(공통 Guard) |
| `limit`이 정수 문자열이 아니거나 반복됨 | `400 VALIDATION_FAILED`, `details.violations=[{field:"limit", reason:"isInt"}]` |
| `limit`이 1 미만 / 100 초과 | 위와 같고 reason만 `min` / `max` |
| 해석할 수 없거나 고친 `cursor`, 다른 회원의 `cursor`, 반복된 `cursor` | `400 VALIDATION_FAILED`, `{field:"cursor", reason:"isCursor"}` |
| 목록에 다른 쿼리가 붙음, 개별 상태에 쿼리가 붙음 | `400 VALIDATION_FAILED`, `{field:"query", reason:"whitelistValidation"}` |
| 다른 회원의 요청, 없는 요청, UUID가 아닌 ID | 같은 `404 RESOURCE_UNAVAILABLE`. 다른 회원의 요청이 있는지 드러내지 않는다 |
| DB 조회 오류, 자료 불일치(현재 시도 없음 등) | `500 INTERNAL_ERROR`. 빈 목록·404·결과 없음·처리 실패로 바꾸지 않는다 |

오류 응답에는 입력값·SQL·스택·토큰을 넣지 않는다.

**목록 순서.** 본인 요청만 접수 시각(`submittedAt`) 최신순으로 준다. 접수 시각이 같으면 `requestId` 역순이다. 이 순서는 재요청 판정이 고르는 '같은 저장소의 가장 최근 요청'과 같다. 회원별 `(member_id, submitted_at, request_id)` 인덱스로 이 순서를 바로 읽으므로, 전체 요청을 훑거나 정렬하지 않는다.

**cursor.** 회원과 마지막 위치(접수 시각·`requestId`)를 담은 불투명 문자열이며 권한 증표가 아니다. 서버는 매 페이지 인증된 회원의 요청만 다시 조회한다.

- 페이지를 넘기는 사이 새 요청이 생겨도 다음 페이지는 받은 위치 다음부터 이어진다. 중복·누락은 없다.
- 새 요청은 첫 페이지를 다시 읽을 때 보인다.
- 이력이 0건이면 `{"items":[],"page":{"nextCursor":null}}`다.

## 한 시점 읽기와 상태 불변

한 응답은 읽기 전용 `REPEATABLE READ` 트랜잭션 하나에서 읽는다. 첫 조회 문장(요청 목록 또는 요청 행)의 스냅샷을 뒤의 문장이 함께 쓴다. 그래서 다음 값이 모두 같은 시점의 값이다.

- 요청과 현재 시도
- B 등록 연결, 원 요청의 Catch 본체, E 수신 기록
- 재요청 판정에 쓰는 같은 회원의 진행 중 요청과 같은 저장소의 최근 요청

목록에서는 한 페이지의 모든 항목이 같은 시점이다. 동의는 요청 행의 `consentId`로 같은 시점에 묶이며, 접수한 동의 행은 바뀌지 않는다.

- **잠금 없음.** 조회는 행 잠금을 잡지 않으므로 수신·반영·처리 시한 닫기를 기다리게 하지 않는다. 조회 도중 다른 트랜잭션이 반영을 커밋하면 그 응답은 커밋 전 상태로만 읽고, 다음 조회부터 반영 뒤 상태를 읽는다.
- **접수와 같은 판정.** 접수(`POST`)의 같은 키 재응답과 선행 이력 판정은 기존대로 요청→시도를 `FOR NO KEY UPDATE`로 잠그고 읽는다(`readAnalysisStatus`). 조회는 같은 판정을 잠금 없이 부른다(`readAnalysisStatusSnapshot`). 두 경로의 응답이 같은지는 시험으로 비교한다.
- **상태를 바꾸지 않음.** 읽기 전용 트랜잭션이라 조회는 아무것도 쓰지 못한다. 조회가 성공하든 실패하든 상태 변경, 새 요청·동의·시도, 큐 전송, 자동 재요청이 없다. 시간 경과나 조회 실패로 실패를 확정하지도 않는다. 처리 시한 판정은 [#237 주기 작업](analysis-deadline.md)이 한다.

## 화면 담당 안내 — 상태·결과 진입·재요청

세 상태 필드는 의미가 서로 다르므로 하나로 합치지 않는다.

| 필드 | 값 |
|---|---|
| `processing`(F 처리 결과) | `QUEUED` 대기, `RUNNING` 진행, `UNCERTAIN` 실행 불명, `SUCCEEDED` 정상 완료, `EMPTY` 정상 0건, `PARTIAL_FAILED` 부분 실패, `FAILED` 실패 |
| `application`(E·B 서비스 반영) | `NOT_READY` 결과 전, `PENDING` 반영 대기, `APPLYING` 반영 중, `RECOVERING` 복구 중, `APPLIED` 반영 완료, `APPLY_FAILED` 반영 실패 |
| `lifecycle` | `ACTIVE` 진행 중(회원당 하나), `CLOSED` 종료(E가 더 처리·반영하지 않음) |

`RECOVERING`은 계약상 쓰지 않는 값이다. 저장돼 있으면 반영이 끝나지 않은 상태로 돌려준다.

| 화면에서 정할 것 | 쓰는 필드 |
|---|---|
| 진행 중 표시 | `lifecycle=ACTIVE`. 처리가 끝났어도(`SUCCEEDED` 등) `ACTIVE`이면서 `application`이 `PENDING`·`APPLYING`·`RECOVERING`·`APPLY_FAILED`이면 반영이 아직 끝나지 않았다. 처리 실패나 새 요청 가능으로 표시하지 않는다 |
| 결과 보기 | `registeredCatchIds`가 비어 있지 않을 때만 연다. B가 등록하고 본인 열람 준비를 확인한 Catch ID이며 중복을 뺐다. `processing` 종료, `eligibleCandidateCount`, `ownerResultsReady`만 보고 결과 버튼을 열지 않는다 |
| 정상 0건 | `processing=EMPTY`·`application=APPLIED`·`lifecycle=CLOSED`는 정상 완료다(등록 적합 후보 없음). 접수 직후의 `eligibleCandidateCount=0`(`QUEUED`·`ACTIVE`)과 다르다. 조회 실패는 0건 응답이 아니라 HTTP 오류로만 온다 |
| 실패 안내 | `failures[]`의 `stage`·`code`·`message`를 쓴다. `PARTIAL_FAILED`에는 유효 결과가 함께 있을 수 있다. 처리 시한으로 닫힌 요청은 `code=PROCESSING_DEADLINE_EXCEEDED`다 |
| 재요청 버튼 | `retry.allowed=true`일 때만 보인다. 새 `Idempotency-Key`, 현재 고지·범위에 대한 새 동의, `retryOfRequestId=<requestId>`로 `POST /v1/analysis-requests`를 보낸다([#138](analysis-intake.md#선행-이력과-실패-재요청)) |
| 저장소 이름 | 응답 구조는 접수와 같다. `repositoryId`를 [`GET /v1/me/repositories`](member-repositories.md)의 `repositoryId`와 맞춰 이름을 붙인다. 지금 선정 목록에 없는 저장소의 이력도 그대로 온다 |
| 조회 실패 | 401은 web 공통 인증(#286)이 세션을 갱신하고, 갱신에 실패하면 다시 로그인하게 한다. 404는 본인 요청이 아니거나 없음, 500은 일시 오류다. 화면은 상태를 바꾸거나 분석 실패로 표시하지 않고, 사용자가 [다시 불러오기]를 누르면 다시 조회한다 |

`retry.reason`은 재요청을 판정한 사유일 뿐, 결과 유무나 실패 원인을 뜻하지 않는다. 화면 안내는 위 표의 필드로 만든다.

| `retry.reason` | 언제 |
|---|---|
| `FAILURE_WITHOUT_RESULTS` | 재요청 가능(`allowed=true`). 아래 두 경우다 |
| `IN_PROGRESS` | 이 요청이 진행 중이거나, 재요청 대상이지만 같은 회원의 다른 요청이 진행 중이다 |
| `EXECUTION_UNCERTAIN` | 실행 여부를 알 수 없다 |
| `APPLICATION_UNRESOLVED` | 반영 대기·반영 중·복구 중이거나, 반영 실패가 아직 닫히지 않았다(적합 후보가 없을 때) |
| `RESULTS_EXIST` | 등록 연결(열람 준비 전 포함)이나 원 요청의 Catch 본체가 있다. 반영 실패로 닫히지 않은 요청에 적합 후보가 있을 때도 나온다. 열람할 Catch가 없어도 나올 수 있다 |
| `NOT_FAILED` | 처리 실패지만 실패 항목이나 확정 근거(서버의 실패 확정 참조, E 수신 기록)가 없다 |
| `REANALYSIS_DEFERRED` | 정상 완료·정상 0건처럼 재분석 대상이 아니거나, 같은 저장소에 더 최근 요청이 있다 |

`FAILURE_WITHOUT_RESULTS`의 두 경우:

1. **확정 실패.** `FAILED`/`APPLIED`/`CLOSED`이고 등록이 없으며 실패 확정 근거가 있다.
2. **반영 실패로 닫힘.** `APPLY_FAILED`/`CLOSED`이고 등록이 없다. 처리 결과와 후보 수는 보지 않는다(PR #296).

같은 요청이라도 판정은 조회 시점의 회원 이력에 따라 달라진다. 예를 들어 재요청할 수 있던 실패 요청도 다른 저장소의 요청이 진행 중이면 `IN_PROGRESS`가 된다. 재요청으로 새 요청이 생기면, 새 요청이 진행 중일 때는 `IN_PROGRESS`, 끝난 뒤에는 `REANALYSIS_DEFERRED`다.

## 개발 재현과 검사

[README 「DB 테스트」](../README.md#db-테스트)대로 전용 시험 DB를 준비하고 `TEST_DB_*`를 셸에 지정한다. 개발 로그인으로 받은 토큰은 메모리에만 둔다. 접수한 뒤 `GET /v1/analysis-requests`와 `GET /v1/analysis-requests/{requestId}`를 호출한다. 토큰·DB 비밀값·HTTP 원문은 로그나 PR에 붙이지 않는다.

```powershell
npm run lint
npm run typecheck
npm test -- test/db/analysis-request-history.test.cjs test/integration/analysis-intake-receiver.test.cjs
npm test
```

**`test/db/analysis-request-history.test.cjs`.** 실제 Nest HTTP·인증 Guard·전용 PostgreSQL에서 다음을 본다.

- 상태 조합 17종(대기부터 반영 실패로 닫힘까지): `member-api.yaml`의 200 응답 스키마(Ajv로 검사), 같은 키 재응답과 같은 응답인지, 닫힌 요청에서 실제 실패 재요청을 보낸 결과가 `retry.allowed`와 맞는지
- 정상 0건·초기 후보 0·조회 실패의 구분
- 빈 이력, 조회 장애의 500과 상태 불변
- 회원 경계(404·401), 페이지 순서·경계·cursor 묶음, 입력 오류 400
- 회원 단위 재요청 판정, 한 시점 읽기

**`test/integration/analysis-intake-receiver.test.cjs`의 `#140` 시험 2건.**

- #103 공용 합성 세트 전체를 실제 접수 API(#138) → 개발용 주입·DB 수신(#139) → 반영·B 등록(#105)으로 거친 상태를 조회 API로 읽는다. 같은 키 재응답과 비교하고, 조회 전후 행이 같은지 본다.
- 반영 실패 → 처리 시한 닫기 → 실패 재요청까지의 이력과 페이지를 읽는다.

**합성·대역으로 만든 것.**

- DB 시험의 처리·반영 상태, 등록 연결·Catch 본체·수신 기록은 시험 DB에 직접 구성했다. 페이지·회원 범위 시험의 요청도 직접 넣었다.
- 조회 장애는 시험 중 표 이름을 잠시 바꿔 만든다.
- 한 시점 읽기는 조회 트랜잭션의 첫 조회 뒤에 멈춰 두고, 그사이 다른 연결이 반영을 커밋하게 해 확인한다.
- 연결 시험의 결과 메시지는 #103 합성 세트이고, 좌표는 합성 저장소 어댑터가 준다. 처리 시한 닫기는 서비스를 직접 호출한다.

**검증하지 않은 것.** 실제 Google 로그인·GitHub 연결·LIVE 자료, 큐·worker 왕복, 화면 연결, 시간 경과에 따른 주기 실행.

**알려진 한계.** 페이지 위치는 위 인덱스로 찾지만, 항목마다 접수와 같은 상태 판정을 따로 읽는다. 그래서 한 페이지의 쿼리 수가 항목 수에 비례한다(기본 20·최대 100). 이력이 많을 때의 응답 시간은 측정하지 않았다.

## 홈용 본인 접수 이력 유무 — #428

홈([#155](https://github.com/JminAILab/CatchU/issues/155))이 ‘저장소 연결 전’과 ‘준비 완료’를 나누는 데 쓰는 값이다. 기준은 [회원 API](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml)의 `GET /me/analysis-summary`(getAnalysisSummary)와 [계약 요약 「분석 접수·상태·재요청」](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#분석-접수상태재요청)의 ‘접수 이력 유무’ 행이다. 계약은 [#155 합의](https://github.com/JminAILab/CatchU/issues/155#issuecomment-6488715811)대로 [PR #432](https://github.com/JminAILab/CatchU/pull/432)에서 정했다.

| 경로 | 입력 | 성공 |
|---|---|---|
| `GET /v1/me/analysis-summary` | 쿼리 없음. 기존 전역 회원 Guard와 `@CurrentMemberId()`로 본인 요청만 본다 | 200 `{"hasAcceptedAnalysisRepository": boolean}` |

- `true`: 본인의 영속 접수 요청(`requestState` ACCEPTED)이 1건 이상이다. 처리 상태(대기·진행·실행 불명·반영 대기·성공·0건·부분 실패·실패·반영 실패)와 실패 뒤 재요청에 관계없이 세고, 지금 선정 목록에서 빠진 저장소의 요청도 센다.
- `false`: 정상 조회 결과 본인 접수 요청이 0건이다.
- 거절된 접수 시도는 분석 요청을 만들지 않으므로 세지 않는다. 다른 회원의 요청도 세지 않는다.
- `true`는 지금 분석할 수 있다거나 분석이 끝났다는 뜻이 아니다. GitHub 연결 상태는 `GET /v1/me`, 저장소 선정은 [`GET /v1/me/repositories`](member-repositories.md), 요청별 상태는 위 이력·개별 상태 조회가 맡는다. `GET /v1/me` 응답은 바꾸지 않았다.

| 상황 | 응답 |
|---|---|
| 인증 없음 | `401 AUTH_REQUIRED`(공통 Guard) |
| 토큰·세션 오류 | `401 AUTH_INVALID`(공통 Guard) |
| 쿼리가 붙음(이름·값과 무관) | `400 VALIDATION_FAILED`, `details.violations=[{field:"query", reason:"whitelistValidation"}]` |
| DB 조회 오류 | `500 INTERNAL_ERROR`. `false`로 바꾸지 않는다 |

성공·오류 모두 `Cache-Control: no-store`다. 오류 응답에는 입력값·SQL·스택·토큰을 넣지 않는다. 연결·저장소·동의를 판단하지 않고 경로에 자원 ID가 없어 403·404는 없다. 홈에서 `500`은 이력 유무를 알 수 없다는 뜻이며 `false`(이력 없음)가 아니다. 401은 다른 회원 경로처럼 web 공통 인증(#286)이 세션 갱신·재로그인으로 처리한다.

**구현.** `AnalysisHistoryService.summary`가 회원 ID와 `ACCEPTED` 조건으로 `analysis_request`에 행이 있는지 한 문장(`existsBy`)으로 확인한다. 회원 조건은 기존 회원별 인덱스 `(member_id, submitted_at, request_id)`의 앞 칼럼이며, 실행 계획과 응답 시간은 측정하지 않았다. 쓰기·행 잠금이 없고, 새 마이그레이션·환경변수·오류 코드도 없다.

**`test/db/analysis-summary.test.cjs`.** 실제 Nest HTTP·인증 Guard·전용 PostgreSQL에서 다음을 본다(`npm test -- test/db/analysis-summary.test.cjs`).

- 이력 없음은 false다. 처리 상태 9가지와 실제 실패 재요청 뒤에는 true이고, 조회 전후 접수 관련 표가 같으며, `GET /v1/me`에는 이 값이 없다.
- 다른 회원에게만 이력이 있으면 false이고, 쿼리로 회원을 고를 수 없다.
- 현재 선정 목록에 없는 저장소의 지난 접수도 true다.
- 조회 장애는 500이고, 로그에는 경로 틀·코드만 남는다. 장애가 풀리면 같은 값을 다시 읽는다.
- 인증 없음·잘못된 토큰은 401, 쿼리는 400이다.
- 모든 응답을 dev에 병합된 계약의 응답 코드 목록·본문 스키마(Ajv)·no-store 헤더와 대조한다.

처리 상태와 선정 목록에 없는 저장소의 요청은 시험 DB에 직접 구성했고, 조회 장애는 시험 중 표 이름을 잠시 바꿔 만든다. 개발 회원만 썼다(실제 회원도 같은 회원 ID 조건으로 읽는다). 실제 Google 로그인·실제 회원의 LIVE 접수와 홈 화면 연결(#155)은 검증하지 않았다.
