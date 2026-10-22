# 분석 고지·접수·실패 재요청 — #138

## 기준과 검증 범위

[회원 API](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml)와 [접수·재요청 계약](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#분석-접수상태재요청), [업무 규칙](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md)의 현재 판본을 따른다. 이슈에 연결된 9093d2e 판본 이후 제목 null·제목 고쳐 쓰기 등 변경을 확인했다. 제목만 없다고 실패 재요청을 허용하지 않으며 접수·동시성·실패 재요청 기준을 바꾸지 않는다.

첫 연결은 [#104 개발 회원·합성 GitHub 연결](member-analysis.md)과 [#136 선정 저장소 공급](member-repositories.md)을 사용한다. 실제 Nest HTTP·PostgreSQL로 접수와 롤백을 검사하지만 GitHub 자료·worker·LLM을 호출하지 않는다. 기존 Google·GitHub·세션 기능을 대체하지 않는다. #139 수신/개발 주입은 새로 구현하지 않는다. #140 이력/개별 상태 GET은 [이력·상태 조회](analysis-history.md)에 있다. 실제 회원의 고지 조회는 [#322](https://github.com/JminAILab/CatchU/issues/322)에서, 실제 회원의 접수는 [#323](https://github.com/JminAILab/CatchU/issues/323)에서 더했다(아래 「실제 자료용 고지와 고지 선택」·「실제 회원의 접수 — #323」). 실제 회원 접수는 [#231 GitHub 연결](github-connection.md)과 [#252 DB 선정 공급](repository-selection.md)을 쓴다.

## 합성 고지의 정본·활성화

`src/analysis-intake/analysis-notice.ts`의 `SYNTHETIC_NOTICE`에서 본문·판본·범위를 함께 버전 관리한다. 고지 판본은 `catchu-synthetic-analysis-notice-v1`, 허용 범위 판본은 [공용 합성 표본](../../worker/fixtures/m1-synthetic/context.sample.json) 및 #104의 `00000000-0000-4000-8000-000000000201`이다. 합성 COMMIT/PULL_REQUEST/ISSUE와 선정 참조를 묶는다. 본문/범위를 바꾸면 판본도 함께 변경해 오래된 동의를 현재 동의로 받지 않는다. 접수한 동의는 DB에서 불변으로 보존한다.

- 개발 회원에게 `NODE_ENV=development` 또는 `test`와 `DEV_LOGIN_ENABLED=true`일 때만 합성 고지를 제공한다.
- 실제 회원이나 실제 판본 부재를 합성 고지로 대신하지 않고, 실제 회원·LIVE 공급을 합성 동의로 받지 않는다. 개발 회원의 접수 공급자는 #136과 같은 DevMemberService이며 합성 연결 이외는 거부한다. 합성 공급의 LIVE는 `403 CONSENT_REQUIRED`로 접수하지 않는다. 실제 회원은 아래 「실제 회원의 접수 — #323」대로 접수한다.
- 합성 판본은 실제 자료 처리 동의로 쓸 수 없다. 실제 자료용 고지는 #322에서 따로 실었고 그 판본에 동의한 실제 회원의 접수는 #323에서 받는다(아래 절). 큐 전송·worker 실행은 이 API 범위가 아니다.
- 운영이나 개발 기능이 비활성이면 개발 회원의 고지 조회와 모든 신규 접수를 기존 #136 개발 공급자와 같은 `403 INTERNAL_ERROR`로 거부한다. 개발 회원 경계 거부도 같은 기준을 유지한다. 동의 누락·고지/범위 판본 불일치는 `403 CONSENT_REQUIRED`로 구분하며 공통 필터·오류 코드는 바꾸지 않는다. 조회 실패·자료 불일치는 `500 INTERNAL_ERROR`이며 정상 빈 목록이나 권한 없음으로 바꾸지 않는다.
- 고지 조회는 GitHub 연결과 공급 방식을 읽지 않는다(#322). 개발 회원은 연결 행 부재·정상 해제·재인증 필요·잘못된 참조·실제 GitHub 연결·연결 공급 장애·LIVE 공급에서도 합성 고지를 받는다. 신규 접수·저장소 조회는 기존대로 연결 행 부재·정상 해제(외부 계정 참조 null)·재인증 필요를 `403 GITHUB_CONNECTION_REQUIRED`로 거부하고, 합성 참조 검사와 개발 회원 경계를 유지하며, 정상 해제 외 잘못된 참조·실제 연결을 합성 연결로 보정하지 않는다(`500 INTERNAL_ERROR`).

## 실제 자료용 고지와 고지 선택 — #322

[#322](https://github.com/JminAILab/CatchU/issues/322)의 2026-10-17 팀장 확정 문구를 `src/analysis-intake/analysis-notice.ts`의 `REAL_NOTICE`에 판본 `catchu-real-analysis-notice-v1`로 싣는다. 합성 판본 `catchu-synthetic-analysis-notice-v1`과 다른 값이다. 문구는 12월 공개판 기준이며 설명하는 기능의 현재 구현 여부에 맞춰 고치지 않는다. 배열 한 원소가 한 줄, 빈 원소가 문단 사이 빈 줄이고 응답 `text`는 이를 LF(`\n`)로 이은 일반 텍스트다(HTML·마크다운 아님). 화면 표시는 [#154](https://github.com/JminAILab/CatchU/issues/154)가 맡아 이 문단·줄바꿈에 맞춘다.

`GET /v1/analysis-notice`는 [공통 회원 구분](member-analysis.md#실제개발-회원-구분--322)으로 고지를 고르며 GitHub 연결 상태·공급 방식은 보지 않는다. 응답 두 필드·no-store·인증 조건은 그대로다.

| 회원 | 응답 |
|---|---|
| 실제 회원(Google 로그인으로 생성) | 개발 로그인 설정과 GitHub 연결 상태에 관계없이 실제 고지. 실제 판본이 없으면 합성 고지로 대신하지 않고 `403 CONSENT_REQUIRED` |
| 개발 회원(개발 로그인으로 생성) | 위 절의 활성화 조건에서 합성 고지, 아니면 `403 INTERNAL_ERROR`. 실제 GitHub 연결이 있어도 합성 고지 |
| 미지원 출처·비활성·없는 회원 | 실제 회원으로 보지 않고 `403 INTERNAL_ERROR` |
| 회원 자료 조회 장애 | 고지나 403으로 대신하지 않고 `500 INTERNAL_ERROR` |

#322는 접수(`POST /v1/analysis-requests`)를 바꾸지 않았다. 실제 회원의 접수와 실제 판본 동의 대조는 아래 「실제 회원의 접수 — #323」에 있다. 개발 회원이 실제 판본에 동의한 요청은 개발 기능이 켜진 환경에서 현재 판본 불일치로 `403 CONSENT_REQUIRED`다.

고지 문구를 바꿀 때:

1. 팀장이 문구를 쓰고 확정해 해당 이슈 본문에 남긴다([2026-10-14 결정](https://github.com/JminAILab/CatchU/issues/138#issuecomment-6159562994)).
2. 담당(E)이 `REAL_NOTICE`의 `text`와 `noticeRevision`을 함께 바꾼다(예: `-v1` → `-v2`). 글자 하나가 바뀌어도 판본을 올리고, 같은 판본에 다른 문구를 싣지 않는다.
3. `test/db/analysis-notice.test.cjs`의 확정 문구 지문(SHA-256)과 판본 기대값을 새 값으로 바꾼다. 문구만 바뀌고 지문이 그대로면 시험이 실패한다.
4. 반영 PR에서 팀장 승인을 받는다. 이 승인이 실제 고지의 승인 기록이다.
5. 외부 AI 제공자나 고지에 적은 보내는 자료·처리 위치·보관 조건이 바뀌면 문구와 판본을 함께 갱신한다([#119 결정](https://github.com/JminAILab/CatchU/issues/119#issuecomment-6159097353)).

이미 받은 동의의 판본은 DB에 그대로 남는다. 판본이 바뀐 뒤의 새 접수·실패 재요청은 현재 판본 동의만 받고(#323), 이미 접수된 키의 재전송은 판본을 다시 대조하지 않는다.

## 실제 회원의 접수 — #323

[#323](https://github.com/JminAILab/CatchU/issues/323)은 새 접수·실패 재요청의 근거를 [공통 회원 구분](member-analysis.md#실제개발-회원-구분--322)으로 고른다. 공개 API·응답·오류 코드·큐 메시지 규격과 아래 절의 멱등·동시 접수·실패 재요청 조건은 그대로다.

| 회원 | 접수 근거 | 첫 시도·상태 `sourceMode` |
|---|---|---|
| 실제 회원(Google 로그인으로 생성) | 개발 로그인 설정(`DEV_LOGIN_ENABLED`·`NODE_ENV`)과 관계없이 #231 연결·#322 실제 고지·#252 선정 공급 | `LIVE` |
| 개발 회원(개발 로그인으로 생성) | 위 「합성 고지의 정본·활성화」의 합성 연결·합성 고지 | `MOCK` |
| 미지원 출처·비활성·없는 회원 | 실제 회원으로 보지 않고 `403 INTERNAL_ERROR` | — |

실제 회원의 새 접수·실패 재요청은 이렇게 판정한다.

1. 키 형식이 맞고 같은 키 기록이 없을 때만 생성 트랜잭션 밖에서 #231 `refreshStatus`로 보관 자격정보의 만료·이용 불가를 연결 상태에 반영한다(목록과 같다). 갱신 실패(보관소 오류)는 멱등 잠금 안에서 새 접수로 판정될 때만 `500`으로 알린다. 그사이 같은 키·같은 본문 요청이 먼저 접수됐으면 재전송이므로 그 접수의 현재 상태를 주고, 오류 원문 없는 경고 로그만 남긴다.
2. GitHub 연동 설정(`GITHUB_CONNECTION_ENABLED`)이 꺼진 서버는 보관 자격정보를 읽지 못해 #232 실행 조회가 거부하므로, 남은 연결 행과 관계없이 `403 GITHUB_CONNECTION_REQUIRED`다(#231 연결 API와 같다).
3. 생성 트랜잭션의 같은 `EntityManager`로 [#252 `confirmForIntake`](repository-selection.md#접수-재확인--323)를 불러 회원 → 연결 → 선정 → 범위 정의를 읽기 잠금하고 커밋까지 유지한다.
4. 동의의 범위 판본이 현재 선정의 범위 판본과, 고지 판본이 현재 실제 고지 판본과 같아야 한다.
5. 공급받은 네 칸 `{revision, repositoryId, allowedResourceTypes, selectionReference}`(원래 선정 참조, `COMMIT`·`PULL_REQUEST`·`ISSUE`)를 동의로 저장하고 요청·`LIVE` 첫 시도·멱등 기록과 함께 커밋한다.

| 상황 | 응답 |
|---|---|
| `accepted:false`, 합성·이전 고지 판본, 현재 실제 고지 없음, 현재 선정과 다른 범위 판본 | `403 CONSENT_REQUIRED` |
| 연결 없음·해제·재인증 필요·만료나 이용 불가 자격정보·보관 자격정보 없는 연결·합성 연결, GitHub 연동이 꺼진 서버 | `403 GITHUB_CONNECTION_REQUIRED` |
| 현재 선정 목록 밖·제외한 저장소 | `403 REPOSITORY_NOT_ALLOWED` |
| 선정 자료와 카탈로그·범위 정의 불일치, 회원·연결·선정 조회 DB 오류, 자격정보 보관소 오류 | `500 INTERNAL_ERROR`. 합성 자료·선정 없음·`MOCK` 시도로 바꾸지 않는다 |

거부·장애에는 요청·동의·시도·멱등 기록이 남지 않는다. 판정은 회원 단위 접수 잠금 뒤에 하므로 동시 접수·다른 저장소 409·선행 이력·실패 재요청 판정은 개발 회원과 같고, 허용된 실패 재요청은 새 실제 동의·요청·`LIVE` 시도를 만든다. 같은 키·같은 본문 재전송은 1~4를 하지 않으므로 접수 뒤 연결 해제·재인증 필요·고지/범위 판본 변경·선정 제외에도 기존 요청의 현재 상태를 200으로 주고 새 행을 만들지 않는다.

개발 회원에 실제 GitHub 연결이 붙으면 합성 연결로 보정하지 않고 새 접수·실패 재요청 모두 `500 INTERNAL_ERROR`다(개발 기능 꺼짐은 `403 INTERNAL_ERROR`). #136 목록·#252 개발 공급과 같은 기준이며, `refreshStatus`를 부르지 않고 `LIVE` 시도나 실제 자격정보를 쓰는 `MOCK` 시도를 만들지 않는다.

큐 메시지 사본만 두 참조를 `attemptId`로 바꾸고 저장 동의는 원래 선정 참조를 유지한다. 이 네 칸은 [#233 보내기](analysis-queue.md#보내기)의 넣기 전 검사(모양·저장소·판본·계약 스키마)를 통과하고, #232 실행 조회의 `DatabaseRepositorySelectionSource`가 저장소 전체 선정으로 해석한다. 부분 자료 종류·추가 칸·다른 참조는 전체 선정으로 해석하지 않는다(`SCOPE_UNVERIFIED`). 큐 보내기의 제품 활성화·worker 실행·결과 등록은 #323 범위가 아니다.

## API와 입력

#104 이전의 UUID가 아닌 회원 토큰은 고지 조회·접수 모두 DB 조회 전에 401 AUTH_INVALID로 거부한다.

병합된 [#250 세션 인증](auth-sessions.md)의 DB Guard를 따른다. 자동 검사의 문자열 회원 토큰은 제품 발급 함수를 우회해 시험에서 직접 서명하고, 운영·개발 기능 비활성 검사는 실제 시험 회원과 `SessionService.create`의 유효한 세션으로 인증을 통과한 뒤 기존 403 차단을 확인한다. 세션 정책·응답 계약은 바꾸지 않는다.

모든 경로는 기존 전역 회원 Guard와 `@CurrentMemberId()`를 사용한다. 성공·오류 모두 `Cache-Control: no-store`다. 새 응답 필드·오류 코드·환경변수는 추가하지 않는다.

| 경로 | 입력 | 성공 |
|---|---|---|
| `GET /v1/analysis-notice` | Bearer 회원 인증, 쿼리 없음 | 200 `{noticeRevision,text}`. 실제 회원은 실제 고지, 개발 회원은 합성 시험임을 표시한 합성 고지 |
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

#104의 `runIdempotentCreation`과 `insertInitialAnalysis`를 재사용한다. 신규 접수는 READ COMMITTED에서 **멱등 키 → 회원 단위 접수 잠금 → 회원·현재 연결(실제 회원은 연결 → 선정 → 범위 정의) 읽기 잠금 → 요청 → 시도** 순서로 판정한다. 연결 공급자는 선택적인 EntityManager를 받으면 접수 트랜잭션 안에서 현재 회원·연결을 확인하며 연결 변경이 커밋 전에 판정을 뒤집지 않게 한다. 기존 #136 조회는 원래 REPEATABLE READ 경계를 유지한다.

- 같은 회원·operation·키의 정규화 입력은 고정 순서 tuple(repositoryId, accepted, noticeRevision, scopeRevision, retryOfRequestId)의 SHA-256 지문으로 비교한다. 지문이 같아도 공통 비동기 비교 콜백에서 연결 자원의 회원·저장소·응답 참조를 확인한다. 비밀값은 지문·응답 참조에 저장하지 않는다.
- 같은 키·다른 유효 본문은 409 IDEMPOTENCY_CONFLICT다. 같은 키·같은 본문은 회원 인증·키 소유·지문 일치·참조 요청의 회원/저장소/응답 참조를 확인하고 연결 자원의 **현재 상태**를 다시 읽어 200으로 응답한다. 이미 접수된 키에서는 현재 GitHub 연결·선정·고지/범위 판본을 신규 접수 조건으로 다시 검사하지 않는다. 접수 뒤 DISCONNECTED·REAUTH_REQUIRED·판본 변경에도 같은 requestId를 반환하고 새 행을 만들지 않는다. 새 키의 신규 접수와 새로운 실패 재요청은 현재 조건을 계속 검사한다.
- 다른 키끼리도 회원 단위 advisory lock으로 판정/생성을 직렬화하며 기존 DB ACTIVE 부분 유일성 제약을 유지한다.
- 상태 읽기의 요청·시도 잠금은 `FOR NO KEY UPDATE`를 사용한다. 멱등 소유 확인의 요청 행 `FOR KEY SHARE`를 유지하면서, 이전 키 재전송이 회원 잠금을 기다리고 새 키 실패 재요청이 같은 요청 행을 읽을 때의 교착을 피한다. 요청→시도 잠금 순서와 상태 변경 차단, 회원·요청 소유 확인은 유지한다.
- 같은 저장소의 ACTIVE는 새 동의/시도 없이 기존 요청을 200으로 반환하고 해당 키를 그 요청에 연결한다. 다른 저장소 ACTIVE는 409 ANALYSIS_IN_PROGRESS와 본인의 `details.existingRequestId`다.
- 신규 요청·새 동의·첫 시도·멱등 기록은 같은 manager에서 저장하고 응답 구성까지 마친 뒤 바깥 커밋 성공 후에만 202를 반환한다. 저장/응답 구성/최종 커밋 실패는 전체 롤백한다. 같은 키 재응답이 원 동의를 변경하거나 새 동의를 만들지 않는다.
- 새 접수의 상태는 ACCEPTED/ACTIVE/QUEUED/NOT_READY, sourceMode는 개발 회원 MOCK·실제 회원 LIVE, 후보 0·Catch ID 빈 목록·ownerResultsReady=false다. 202는 실행·반영 완료를 의미하지 않는다.

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

이전 실패 키를 다시 조회해도 현재 다른 ACTIVE가 있으면 retry.allowed=false/IN_PROGRESS다. 이미 후속 요청을 만든 오래된 실패는 후속 작업이 끝나도 재요청 대상으로 표시하지 않는다. 같은 키 재응답의 현재 판정과 새 POST의 선행 이력 판정이 엇갈리지 않게 한다. 두 판정은 `analysis-status.ts`의 `retryDecision`·`blocksReanalysis` 한 곳에서 계산한다. #140 조회도 같은 판정을 잠금 없는 한 시점 읽기로 부른다([이력·상태 조회](analysis-history.md#한-시점-읽기와-상태-불변)).

## 실행 요청 맥락의 준비와 경계

`AnalysisIntakeService.prepareExecutionRequest`는 저장한 요청·시도·동의·허용 scope를 현재 worker Request 스키마에 맞춰 준비하는 **내부 함수**다. 자격정보 참조도 mock 전용이며 실제 토큰을 제공하지 않는다. `MOCK` 시도만 준비하고 실제 회원의 `LIVE` 시도는 `403 CONSENT_REQUIRED`로 거부한다. `LIVE` 요청 메시지는 #233 보내기가 저장 기록으로 만든다. HTTP 경로·큐 등록·worker 호출·자동 재시도·처리 시한은 없다. 메시지 준비가 실행 증거가 아니며 요청은 QUEUED로 남는다. #139를 자동 AppModule에 등록하지 않는다. 이 접수 API가 저장한 요청·동의·시도를 개발용 주입과 DB 수신 처리에 연결한 검증은 [분석 메시지 수신 「실제 접수 연결 검증」](analysis-receiver.md#실제-접수-연결-검증)에 있다.

## 개발 재현과 검사

[README 설치·DB 테스트](../README.md#db-테스트)를 따르고 기존 .env·DB를 덮어쓰지 않는다. 개발 로그인으로 토큰을 메모리에만 받아 `GET /v1/me/repositories`의 저장소/범위와 `GET /v1/analysis-notice`의 현재 고지를 읽은 뒤 위 본문을 POST한다. 합성 판본을 실제 계정/자료로 제출하지 않는다. 토큰·OAuth query·DB 비밀값·HTTP 원문은 로그나 PR에 붙이지 않는다.

실제 회원의 HTTP 접수는 Google 로그인([google-login.md](google-login.md))과 GitHub 연결([github-connection.md](github-connection.md)) 설정이 있어야 재현된다. 실제 회원 세션으로 `GET /v1/me/repositories`의 `repositoryId`·`allowedScopeRevision`과 `GET /v1/analysis-notice`의 `noticeRevision`을 읽어 새 `Idempotency-Key`로 POST하면 202·`sourceMode: LIVE`다. 설정이 없으면 아래 실제 공급 검사로 확인한다.

```powershell
npm run lint
npm run typecheck
npm test -- test/db/analysis-intake.test.cjs test/db/analysis-intake-real.test.cjs test/integration/analysis-intake-real-chain.test.cjs test/db/analysis-notice.test.cjs test/member-repositories.test.cjs test/db/member-analysis.test.cjs
npm test
npm run test:analysis-fixtures
npm run build
```

`analysis-intake.test.cjs`는 실제 HTTP·전용 PostgreSQL의 새 접수·현재 상태 재응답·다중 키 경쟁·회원 경계·현재 연결/고지/범위·저장/지연 커밋 실패·확정 실패/정상/부분/불명/복구 판정을 검사한다. [PR #284 리뷰 F1~F3](https://github.com/JminAILab/CatchU/pull/284#pullrequestreview-5498953523) 회귀로 접수 뒤 연결·선정·판본 변경의 200/동일 ID/행 불변과 새 키·실패 재요청 거부, 고지/접수 비활성 403 구분, 정상 해제의 고지 200·접수 403을 확인한다. 공유 공급자의 저장소 조회 회귀는 정상 해제 403과 잘못된 참조·DB 실패 500을 구분한다. 해제 상태는 DB에 정상 API와 같은 null 참조 형태로 구성하며 이번에 실제 GitHub 승인·해제 API를 시험한 것은 아니다. 여러 저장소는 시험 공급 대역, 종결 실패는 합성 상태 또는 기존 E에 합성 Result를 수신·반영한 준비물이다. worker Request 스키마 대조는 전송 시험이 아니다.

[교착 리뷰](https://github.com/JminAILab/CatchU/pull/284#pullrequestreview-5500599838)의 회귀는 확정 실패 준비 후 별도 DB 연결로 회원 접수 잠금을 잡고 새 키 실패 재요청→이전 키 재전송 순서로 대기시킨다. `pg_locks`에서 두 대기를 확인한 뒤 풀며 3개의 독립 시험에서 각각 202·200, 이전 실패의 현재 상태, 새 요청의 ACTIVE 하나, 요청·동의·시도·멱등 기록 각각 총 2개와 원 기록 불변을 확인한다. 새 키를 다시 전송해도 200·추가 행 없음이어야 한다. 수정 전 잠금으로는 이 시험 3건이 교착에 따른 500을 검출한다. 검토 사본의 결과와 최종 구현 판본에서 직접 수행한 결과는 PR 검사 기록에서 구분한다.

`analysis-notice.test.cjs`(#322)는 확정 문구 지문과 판본 구분, 회원 구분 함수, Google 로그인으로 만든 실제 회원의 연결 상태별 실제 고지, 개발 로그인 설정 다섯 가지(켬·false·production·미지정·preview)에서의 실제 고지와 개발 회원·미지원 출처 차단, 개발 회원의 연결 상태별 합성 고지, 실제 판본 부재 403, 회원 조회 장애 500, 개발 회원 접수 유지(실제 판본 동의 거부·실제 연결이 섞인 개발 접수 거부·합성 접수 MOCK)와 실제 회원의 합성 저장소 접수 거부, 트랜잭션 안 회원 행 읽기 잠금을 검사한다. Google 제공자는 시험 대역이고 GitHub 연결은 #231의 행 모양을 DB에 직접 만들었으며 실제 Google·GitHub를 호출하지 않는다.

②의 시험은 처리 시한 닫기([#237](https://github.com/JminAILab/CatchU/issues/237))가 병합되기 전이므로 APPLY_FAILED/CLOSED를 시험 DB에 직접 구성한다. 처리 결과 4종(FAILED·EMPTY·SUCCEEDED·PARTIAL_FAILED)과 후보 수에서 허용·새 ID·이력 연결·원 기록 불변·응답과 POST 판정 일치를 확인하고, 등록 연결(열람 준비 true/false)·Catch 본체만 있는 경우와 닫히지 않은 ACTIVE에서는 거부(ACTIVE는 같은 저장소 200·다른 저장소 409)를 확인한다. 이 시험은 닫는 주기·실제 반영 흐름을 대신하지 않는다.

#323의 두 시험 파일은 실제 공급 검사와 시험 대역을 시험 이름으로 구분한다. 회원은 Google 로그인 대신 같은 식별 접두사(`catchu:google:`)의 회원 행과 실제 세션 발급으로 만든다.

| 구분 | 내용 |
|---|---|
| 실제 공급(`analysis-intake-real.test.cjs`) | 실제 Nest HTTP·인증 Guard·전용 PostgreSQL, 마이그레이션 초기 선정(#252)·#319 좌표 카탈로그·#322 실제 고지. 연결은 GitHub 연동을 켜고 시험 전용 임시 보관소에 #231 `authorize`·`connect`로 만들고(거부 사례는 #231이 남기는 행 모양을 직접 넣음) GitHub OAuth 응답(`exchange`)만 대역이다. 개발 로그인 설정 여섯 가지의 목록 → 고지 → `LIVE` 접수와 동의 네 칸, 큐 보내기 검사·#232 공급의 전체 선정 해석, 위 거부표(만료·파일 없음 403, 보관소 오류 500, 연동을 끈 서버 403 포함), 재전송 불변, 개발 회원+실제 연결 500, 원자·동시·실패 재요청·롤백 회귀 |
| 실제 공급 연결(`analysis-intake-real-chain.test.cjs`) | 운영 설정(`NODE_ENV=production`, 개발 로그인 꺼짐)의 제품 조립(`createApplicationModule`)에서 두 선정 저장소를 목록 → 고지 → 접수(HTTP)하고, 보내기 검사·큐 사본을 거친 #232 실행 조회(HTTP)가 같은 판본·전체 선정·좌표를 주는지 본다. GitHub OAuth·사용자 확인 응답과 메모리 큐만 대역 |
| 대역 | 이름에 「대역」을 적은 시험: 실제 고지 판본 제거·교체, 선정 조회 DB 오류 주입, 이름 변경을 가정한 새 좌표 판본, 같은 키 동시 요청 중 보관소 일시 오류 |

자동 검사 결과와 실제 명령·작업 위치·판본·미검증은 #138·#322·#323 구현 PR에서 관리한다. 실제 Google·GitHub 호출, 큐 서버·worker 왕복, 화면 전체 연결과 작성자 외 재현은 이 API 검사와 구분한다. 실제 고지 문구의 승인은 #322 반영 PR의 팀장 승인이다.
