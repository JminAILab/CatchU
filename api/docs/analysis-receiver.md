# 분석 메시지 수신과 개발용 주입 — #139

이 구현은 [#139의 독립 준비 범위](https://github.com/JminAILab/CatchU/issues/139)다. 기준은 [메시지 계약](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml), [수신 업무 흐름](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#업무-흐름)·[상태 전이 정본](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#상태-전이-정본), [수신 기록 모델](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md)이다. 실제 큐/worker 연결이나 HTTP 주입 API를 추가하지 않는다.

## 수신 결과와 저장 경계

- `AnalysisReceiver.receiveProgress(input)`: `ProcessingEvent` 자체 스키마와 현재 요청·시도를 검사한다. `RECEIVED`는 관측만 저장하고 실행 시작으로 바꾸지 않는다. `QUEUED → RUNNING/UNCERTAIN`만 적용하며, 진행 간 미정 전이는 관측만 남긴다. 종결 이후 진행은 종결 상태를 유지한다. 반환하는 내부 판정값은 `ResultReceipt`가 아니다.
- `AnalysisReceiver.receiveResult(input)`: `resultId/requestId/attemptId` 세 값 중 누락·빈 값·타입 오류가 있으면 `{ receipt: null }`과 고정 거부 코드만 남긴다. 식별 가능하면 스키마, 후보/실패 수에 따른 종결 의미, 접수된 회원·저장소·동의·범위·자료 모드 및 현재 시도를 대조한다. 접수 자료가 없거나 맥락이 다르면 `CONTEXT_MISMATCH`, 이전 시도는 `STALE_ATTEMPT`다.
- 같은 결과 ID/내용은 `DUPLICATE/ALREADY_RECEIVED`, 현재 시도의 다른 결과 또는 다른 내용은 `REJECTED/PAYLOAD_CONFLICT`다. 지문은 객체 키 순서를 정렬하고 전송 `messageId`를 제외한 SHA-256이다. 배열 순서와 `finishedAt`을 포함한 나머지 내용은 보존하여 충돌을 묵인하지 않는다.
- 새 정상 결과는 수신 메타데이터와 `processing=outcome`, `application=PENDING`, 적합 후보 수를 함께 저장한다. **저장소의 커밋이 성공한 뒤에만 `ACCEPTED/OK`를 반환한다.** 저장·커밋 실패는 일반화한 `ReceiverStorageError`로 끝나며 성공 Receipt를 반환하지 않는다. 외부 입력·저장소 오류 원문을 로그에 넣지 않는다.
- 정상 0건·부분 실패·실패·초안 없는 적합 후보를 보존한다. 독립 `AnalysisReceiver`의 `accepted.result/metadata`는 [#105 등록 연결](receiver-registration.md)이 사용할 입력이며, 수신 로직 자체는 B 생성·`APPLIED/CLOSED`·본인 열람 준비를 설정하지 않는다. 실제 DB 조립의 `AnalysisRegistrationService`가 수신 커밋 이후 이를 호출한다. 중복 반환에는 새 `accepted` 입력이 없고 자동 재반영하지 않는다.

`ReceiverStore.withRequest`는 요청·현재 시도 조회, 판정, 저장을 같은 원자 구간에서 수행하고 **커밋 이후에만 resolve**해야 한다. 예외와 커밋 실패는 rollback하며, 현재 시도당 종결 결과 하나와 수신 식별자 유일성을 DB에서도 보장해야 한다. 서로 다른 인스턴스의 동시 수신도 DB에서 직렬화해야 한다. 테스트의 메모리 저장소는 이 경계를 흉내 낸 것이므로 실제 DB의 잠금·유일성·장애 복구 검증을 대신하지 않는다.

수신 기록에는 식별자·지문·수신 시각만 저장하고 F 결과 원문을 복제하지 않는다. Receipt 전송과 그 이후 #105 호출을 구분한다. [10/6 최신 결정](https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296)으로 결과 보관·자동 복구 계획은 철회됐다. [#237 처리 시한·실패 종료](https://github.com/JminAILab/CatchU/issues/237)는 [PR #295](https://github.com/JminAILab/CatchU/pull/295)로 구현돼 있으며, 시한을 넘긴 요청의 닫기와 닫힌 뒤 결과 거부는 [처리 시한 닫기](analysis-deadline.md)가 정한다. 이 수신 모듈 자체는 미반영 결과를 자동 복구하거나 시간만으로 요청을 닫지 않는다.

## 내부 주입 사용과 검사

`AnalysisReceiverModule.register({ store, contractDirectory })`에 위 트랜잭션을 구현한 저장소와 `worker-messages.yaml`·`common.yaml`이 있는 절대 경로를 넘긴다. 현재 저장소의 계약 디렉터리는 `aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design`이다. 실행·배포 시 두 파일을 함께 제공해야 하며, 스키마를 읽지 못하면 모듈 조립에 실패한다. 테스트는 저장소 정본을 읽고, 승인 파일을 변경하지 않는다.

개발 내부 호출은 `DevAnalysisInjection.inject(memberId, requestId, kind, template, caseId)`다. `kind`는 `Result` 또는 `ProcessingEvent`다. 회원 ID는 [#87 인증 접근자](../src/auth/auth.decorators.ts)의 `CurrentMemberId`에서 전달하고 요청 body의 회원 ID로 대체하지 않는다. 저장소에서 본인 요청인지 확인한 다음 MOCK 접수 맥락으로만 `{{requestId}}`·`{{attemptId}}`·`{{memberId}}`·`{{repositoryId}}`·`{{consentId}}`·`{{scopeRevision}}`·`{{caseId}}`를 채운다. 템플릿에 없는 ID는 생성하지 않으며 타인 요청·다른 요청으로의 바꿔치기·LIVE 자료 주입을 거부한다.

설정 없음, `true` 이외 값, `NODE_ENV=production` 또는 환경 미지정이면 주입을 거부한다. `DEV_LOGIN_ENABLED`와는 별도 설정이다. `test/analysis/dev-injection.test.cjs`는 메모리 저장소와 실제 Guard·CurrentMemberId를 조립한다. [DB 조립](receiver-registration.md)은 `registerDatabase`로 실제 요청·수신·B/E 반영까지 연결하며 `test/integration/receiver-registration.test.cjs`에서 재현한다. **검사용 컨트롤러·메모리 저장소·합성 보호 공급자는 제품 `AppModule`에 등록하지 않는다.** 실제 #138 접수 API가 DB에 저장한 맥락과의 연결은 아래 「실제 접수 연결 검증」이 검사하고, 전송 호출자 연결은 별도다.

```powershell
# api/에서 실행. 실제 .env나 외부 계정 없이 대역 수신·개발 주입 및 기존 검사를 실행한다.
npm ci
npm run lint
npm run typecheck
npm test
```

[#103 공용 합성 자료](https://github.com/JminAILab/CatchU/issues/103)는 다른 담당의 정본이므로 이 PR에 복사하지 않는다. 기본 경로 `worker/fixtures/m1-synthetic`에 자료가 있으면 `npm run test:analysis-fixtures`를 실행한다. 별도 판본으로 검사할 때는 그 판본의 `cases.json`·`events/`·`results/` 디렉터리를 준비하고 다음처럼 실행한다.

```powershell
$previousFixtureDir = $env:ANALYSIS_FIXTURE_DIR
try {
  $env:ANALYSIS_FIXTURE_DIR = 'C:\검토자료\m1-synthetic'
  npm run test:analysis-fixtures
} finally {
  if ($null -eq $previousFixtureDir) { Remove-Item Env:ANALYSIS_FIXTURE_DIR -ErrorAction SilentlyContinue }
  else { $env:ANALYSIS_FIXTURE_DIR = $previousFixtureDir }
}
```

자료가 없거나 기대 수신 판정과 다르면 실패한다. 이 검사는 공용 자료의 수신/처리 기대값만 검증하며, manifest의 Catch 개수·등록 판정은 B 구현 검증으로 취급하지 않는다. 검사 판본과 결과는 PR에 기록한다. 이 검사의 요청·동의·시도는 합성 대역이다. #138의 실제 DB 접수 결과로 같은 사례를 수신한 검사는 아래 절의 별도 시험이다.

## 실제 접수 연결 검증

`test/integration/analysis-intake-receiver.test.cjs`가 #138 접수 API(`GET /v1/analysis-notice`·`GET /v1/me/repositories`·`POST /v1/analysis-requests`)로 만든 요청·동의·시도를 개발용 주입과 같은 DB 수신 처리에 연결한다. 요청·동의·시도를 직접 넣지 않고, 접수 응답의 `requestId`·`attemptId`·`consentId`와 동의 판본으로 #103 템플릿을 채운 결과를 확인한다. 같은 멱등 키로 접수 API를 다시 부르면 현재 상태가 나오므로, 수신 뒤 상태도 그 API로 읽는다.

| 검증 | 검사 |
| --- | --- |
| 접수 맥락 연결 | 수신 기록의 요청·시도가 접수 응답과 같고, 동의의 회원·저장소·판본이 접수 본문과 같다. 수신 뒤 접수 API 상태가 `SUCCEEDED/APPLIED/CLOSED`·등록 Catch 1건이다 |
| #103 사례 | `cases.json`의 사례 전부(정상 1건·0건·부분 실패·실패·식별 불가·재전달·같은 ID 다른 내용·같은 작업 두 후보·진행 이벤트)와 음성 대조 7건을 실제 접수 요청마다 주입해, 수신 확인·처리 결과·Catch 수가 매니페스트의 기대와 같다. 식별 불가·형식 오류는 수신 기록과 Catch를 만들지 않고 요청은 `QUEUED/ACTIVE`로 남는다 |
| 늦은 진행 이벤트 | 종결 결과 뒤의 `RUNNING`·`UNCERTAIN` 이벤트는 `TERMINAL_UNCHANGED`이며 접수 상태·시도·수신 기록·Catch가 그대로다 |
| 맥락 불일치 | 다른 시도 `STALE_ATTEMPT`, 다른 동의 판본·저장소·동의 ID `CONTEXT_MISMATCH`, 같은 ID 다른 내용 `PAYLOAD_CONFLICT`로 거부되고 기존 수신 기록·Catch가 바뀌지 않는다. 다른 요청·회원 ID가 채워진 템플릿은 주입 단계에서 거부한다 |
| 재전달 | 같은 결과는 `DUPLICATE`이며 새 반영·Catch를 만들지 않는다 |
| 저장 실패 | 수신 기록 저장이 실패하면 500·수신 확인 없음·요청 `QUEUED/ACTIVE`이고, 제약을 풀면 같은 메시지를 다시 수락한다 |
| 소유·인증 | 인증 없음 401, 다른 회원·없는 요청 404이며 접수 상태가 바뀌지 않는다 |
| 운영 차단 | `DEV_ANALYSIS_INJECTION_ENABLED`를 켜지 않으면 접수한 요청에도 403이고 DB가 바뀌지 않는다. 시험용 조립을 뺀 제품 `AppModule`에는 주입 제공자와 주입·수신 경로가 없다 |

제목 `null`은 [PR #272](https://github.com/JminAILab/CatchU/pull/272)가 `receiver.types.ts`의 `title: string | null`과 B 저장·조회를 반영했고, 실제 DB 수신 시험(`test/integration/receiver-registration.test.cjs`)이 `null` 보존과 빈 문자열·누락 거부를 검사한다. 이 시험은 `missing-title` 음성 대조(필드 누락)만 접수 맥락에서 반복한다.

한계: 보호 관측은 접수 맥락에서 만든 합성 대역이고 실제 GitHub 조회가 아니다. 이 시험이 검증하지 않은 범위는 실제 worker·큐·전송 호출자, 실제 보호 관측 공급·조립([#105](https://github.com/JminAILab/CatchU/issues/105)에서 확인할 책임), 처리 시한 닫기와 수신의 경합이다. 처리 시한 닫기는 구현돼 있고 그 동작은 [처리 시한 닫기](analysis-deadline.md)의 시험이 검증하며, 이 시험은 호출하지 않는다. 이 검증은 수신 확인이 등록 완료가 아님과 접수 맥락 연결을 확인한 것이며 #105 전체 완료를 뜻하지 않는다. 실행: `api/`에서 전용 `_test` DB를 지정해 `npm test -- test/integration/analysis-intake-receiver.test.cjs`.

## 실제 연결에 남은 작업

| 연결 | 필요한 결과 |
| --- | --- |
| [#104 요청·시도 모델](https://github.com/JminAILab/CatchU/issues/104) + [#105 수신 기록 테이블](https://github.com/JminAILab/CatchU/issues/105) | [DB 수신 어댑터](receiver-registration.md)에서 기존 실제 테이블과 요청 → 시도 → 수신 기록 잠금을 사용. 커밋 실패·동시 수신을 전용 DB로 검사 |
| [#138 분석 접수 API](https://github.com/JminAILab/CatchU/issues/138) | 위 「실제 접수 연결 검증」으로 재현했다. 접수 API가 저장한 행을 큐 보내기(#233)가 같은 맥락으로 보내는지도 [큐 연결 시험](analysis-queue.md#시험)이 확인한다 |
| [#105 등록·반영](https://github.com/JminAILab/CatchU/issues/105) | 수신 커밋 후 실제 B/E 반영 조립은 제공됐다. 실제 보호 관측·저장소 주소의 공급 주체와 조립 책임은 #105에서 확인하며 #231·#232의 책임으로 배정하지 않는다. ACCEPTED는 APPLIED가 아님 |
| [#233 전송 연결](https://github.com/JminAILab/CatchU/issues/233) | 큐 송수신 모듈이 있다([큐 연결](analysis-queue.md)). 결과 작업을 받아 `AnalysisRegistrationService`에 넘기고 수신 확인을 작업 반환값으로 돌려준다. 모듈은 `AppModule`에 아직 등록하지 않았고, 켜는 일은 #252 좌표 제공자와 #105 근거 보존 수정 뒤다(10월 정책 공급자는 #314). 결과 원문 보관·자동 재반영은 추가하지 않음 |

이미 구현된 것: [#237 처리 시한·실패 종료](https://github.com/JminAILab/CatchU/issues/237)는 [PR #295](https://github.com/JminAILab/CatchU/pull/295)로 dev에 있다. 10/4 교차 검토 의견([#139 댓글](https://github.com/JminAILab/CatchU/issues/139#issuecomment-5975854779))의 "실행 중에 멈춘 요청" 항목은 이 구현이 닫는다. 같은 의견의 보낸 쪽 확인·거부 기록의 요청 식별자·예상 밖 오류 분류는 코드에 반영되지 않았고 담당 작업이 정해지지 않았다.
