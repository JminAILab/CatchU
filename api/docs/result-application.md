# E 수신 기록과 Catch 반영 연결 — #105

`src/result-application/`은 검증된 결과 수신 이후 B의 Catch 등록과 E의 반영 완료 상태를 함께 저장하는 내부 서비스다. [PR #205](https://github.com/JminAILab/CatchU/pull/205)는 E 수신 기록 테이블·마이그레이션과 이 반영 서비스를 제공한다. 수신 기록을 실제 수신 경로에서 저장하고 서비스를 호출하는 조립은 [E↔B 전체 연결 #105](https://github.com/JminAILab/CatchU/issues/105), 결과 본문 보관과 장애·반복 실패 복구는 [복구 작업 #234](https://github.com/JminAILab/CatchU/issues/234)에서 다룬다. [등록·반영 흐름](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#업무-흐름)과 [수신·후보 연결 모델](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md)이 구현 기준이며, 결과 본문 보관에 필요한 계약 수정은 아래 후속 범위에서 구분한다.

## 독립 구성과 B 연결

E는 B 제품 모듈을 import하지 않는다. `RegistrationPort`는 [PR #143](https://github.com/JminAILab/CatchU/pull/143)의 기존 내부 입출력을 받는 조립 경계이며 새 HTTP/API 계약이 아니다. B가 제공된 연결부에서 실제 등록 함수와 실제 오류 타입의 분류를 **필수로 공급**한다. 기본 가짜 등록 함수·자동 활성화는 없다. E 자체 검사는 등록 대역으로 독립 실행할 수 있고, 실제 결합 검사는 같은 저장소의 B 등록 함수를 전달한다.

조립 예시(호출부에서 연결된 `dataSource`와 먼저 저장·커밋한 `accepted`를 공급해야 한다):

```ts
import { ResultApplicationService } from './result-application/result-application.service';
import type { RegistrationPort } from './result-application/registration.port';
import { registerCandidates, CatchRegistrationContextError } from './catches/registration-service';
import { CatchRegistrationInputError } from './catches/registration-input-error';

const registration: RegistrationPort = {
  register: registerCandidates,
  classifyError(error) {
    if (error instanceof CatchRegistrationInputError || error instanceof CatchRegistrationContextError) return error.reason;
    return undefined;
  },
};
// #105에서 #139의 실제 수신 경로를 연결할 때,
// 수신 정본·종결 상태를 먼저 저장·커밋한 이후 전달할 accepted 값.
const applied = await new ResultApplicationService(dataSource, registration).apply(accepted);
// 이 Promise는 B 등록/E 완료 기록의 최종 커밋 이후에만 성공한다.
// applied.registeredCatchIds / ownerResultsReady / registrations는 내부 연결 결과다.
```

등록 함수는 넘겨받은 동일한 EntityManager만 사용하고 자체 커밋·다른 연결 저장을 하지 않아야 한다([트랜잭션 규약](../CONVENTIONS.md#트랜잭션-규약)). 분류 함수는 실제 B 오류 타입의 고정 reason만 반환한다. E는 오류 이름/임의 객체의 reason을 추측하지 않으며, 원래 B 입력·맥락 오류와 QueryFailedError를 그대로 호출자에게 전달한다. 입력/적합성 거부를 정상 0건이나 DB 장애로 바꾸지 않는다.

## 테이블·원자성·재반영

현재 PR #205의 `ResultApplicationRecord`는 UUID 수신 ID·요청/시도 ID, 외부 결과 ID(text), SHA-256 지문·수신 시각만 저장한다. 이 구현에는 결과 원문·후보·비밀값을 저장하는 칼럼이 없다. 시도당 하나 및 요청/시도/결과 유일성, 시도/요청 복합 FK와 지문 형식 제약을 적용한다. 이 메타데이터만으로 결과 본문을 복원할 수 없으며, #234의 결과 본문 보관은 별도 변경이다.

적용 순서는 [회원·분석 기반 #104](https://github.com/JminAILab/CatchU/issues/104)(`1790500000000`) → E 수신 기록(`1790550000000`) → B Catch·근거·후보 연결(`1790600000000`) → B 보호 판단(`1790601000000`)이며 되돌리기는 역순이다. E 마이그레이션은 E 테이블만, B 마이그레이션은 B 테이블만 관리한다. [#105의 연결 순서](https://github.com/JminAILab/CatchU/issues/105)에 따라 E 제공분 검토 → 실제 E 테이블 적용·되돌리기와 B 외래 키 연결 확인 → B 재검증으로 진행한다. #105 전체 완료나 #234 복구 완료를 E 제공분의 선행 조건으로 두지 않는다.

E는 READ COMMITTED 트랜잭션에서 요청 → 현재 시도 → 수신 기록을 잠그고 기존 `resultFingerprint`를 재사용해 지문·동의·범위·회원·저장소·시도·자료 모드·종결 상태를 대조한다. 입력은 첫 await 전에 복제한다. 같은 manager로 B를 호출하고, 반환한 모든 후보와 실제 `candidate_registration` 저장 연결의 ID·처리 결과·준비 여부를 대조한 뒤 APPLIED/CLOSED를 함께 저장한다. `registrations`와 DB 저장에는 미준비 후보를 포함한 전체 등록을 유지한다. 결과 진입에 사용하는 `registeredCatchIds`는 B가 `ownerViewReady === true`로 반환·저장한 등록의 Catch ID만 중복 제거해 담고, 이 배열이 비어 있지 않을 때만 `ownerResultsReady`가 true다([결과 진입 계약](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#분석-접수상태재요청)). 전부 미준비이면 false·빈 ID 배열, 혼합이면 준비된 ID만 반환하며 같은 결과 재반영에도 이 기준을 적용한다. 정상 0건/실패 결과의 APPLIED는 열람 준비 true가 아니며 부분 실패의 failures·처리 종결값도 유지한다. 이 SQL 대조는 B의 기존 물리 칼럼을 사용하며 B 판정·저장 함수를 재구현하지 않는다.

저장/최종 커밋 실패는 이번 B 저장과 E 완료 기록 전체를 롤백한다. 먼저 커밋한 수신 기록과 기존 Catch는 보존하고, 별도 트랜잭션에서 같은 결과·현재 시도·ACTIVE/미반영인 경우만 APPLY_FAILED를 기록한다. 뒤늦은 실패는 다른 실행의 APPLIED/CLOSED나 바뀐 현재 시도를 덮어쓰지 않는다. 실패 기록까지 실패하면 `ApplicationFailureRecordingError`로 두 내부 오류를 보존해 전달한다. 원문을 응답/로그로 직렬화하지 않는다.

실패 기록의 고정 분류는 B의 명시적 입력/맥락 reason, E 대조 오류, DB QueryFailedError의 STORAGE_UNAVAILABLE, 미분류 내부 예외의 APPLICATION_FAILED다. 공개 오류 계약을 추가하지 않는다. 같은 결과의 명시적 재반영은 B의 기존 후보 연결을 재사용해 Catch ID를 유지하며 새 분석 실행이 아니다. 보호 판단이 없다고 NONE을 채우지 않는다.

## 검사 구분과 후속 연결

- E 자체: `npm test` 또는 `npm test -- test/db/result-application.test.cjs`. 실제 #104/E 마이그레이션·전용 `_test` DB를 사용한다. 격리된 시험 스키마의 `registration_probe`와 후보 연결은 **명시적 저장 대역**이며 실제 B 등록·적합성/보호·작업 동일성 검증을 뜻하지 않는다. 수신 정본은 `test/support/result-application-fixture.cjs`에서 #103 공용 결과로 먼저 커밋한다.
- 실제 E·B 결합: 현재 저장소의 실제 E 반영 서비스와 B 등록 코드·마이그레이션을 함께 사용한다. `npm test`에 기본 포함되며, 별도 테스트 DB에서 `npm test -- test/integration/result-application-b.test.cjs`로 이 검사만 실행할 수도 있다.
- 결합 검사에서는 실제 B 함수·마이그레이션으로 신규 PRIVATE 저장, 같은 작업·결과의 Catch ID 유지와 기존 본문/공개 상태 보존, 전체 롤백·수신 보존·별도 실패 기록·커밋 오류·실패 기록 오류·동시 반영을 대조한다. 보호 관찰과 수신 기록은 시험 준비물이다. 기존 B 시험의 E 상태 대역과 신규 실제 E 호출 검사는 구분한다.

## 후속 작업의 범위

- **실제 수신·등록 연결 — [#105](https://github.com/JminAILab/CatchU/issues/105):** [메시지 수신 #139](https://github.com/JminAILab/CatchU/issues/139)의 경로에 `ReceiverStore` DB 어댑터를 연결해 수신 메타데이터와 처리 종결값·반영 대기 상태(`PENDING`)를 먼저 커밋하고, 수신 확인(`Receipt`) 이후 실제 B 등록 함수와 E의 `apply`를 호출하도록 조립한다. 최초 저장소 보호 판단도 공급해야 하며, 판단이 없으면 열람 준비로 처리하지 않는다. [10/4 팀장 조건](https://github.com/JminAILab/CatchU/issues/105#issuecomment-5975854918)에 따른 실제 자료(`LIVE`)의 근거 주소와 연결된 GitHub 저장소 대조도 실제 분석 연결에서 갖춘다. 합성 자료(`MOCK`)는 이 주소 대조에서 제외한다. 공급 주체·조립 책임과 실행 방법은 #105에서 확인한다.
- **결과 본문 보관·장애 복구 — [#234](https://github.com/JminAILab/CatchU/issues/234):** 10/6 팀장 결정은 결과 본문을 수신 기록과 같은 트랜잭션으로 api DB에 보관하고, 재시작·주기적 조회로 미반영 결과를 찾아 #105의 반영 경로를 다시 호출하는 방식이다. 반영 완료 시 본문을 삭제하고, 미반영 본문은 수신 시각부터 14일 뒤 삭제한다. 재시도 한도를 넘으면 자동 복구를 멈추고 반영 실패(`APPLY_FAILED`)로 둔다. 한도·간격과 보관 테이블 구성은 #234에서 정한다. 이 결정은 현재 #205의 구현이나 검증 결과가 아니며, 원문 보관을 금지한 승인 설계·계약을 고치는 팀장 PR이 선행돼야 한다. 복구 중단·보관 만료 뒤 진행 중 요청을 종료하는 방법도 #234에 연결된 계약 결정 사항이다.
- **큐와 worker 보존:** [큐 연결 #233](https://github.com/JminAILab/CatchU/issues/233)과 [worker 결과 보존 #121](https://github.com/JminAILab/CatchU/issues/121)은 각 작업에서 다룬다.

이번 자체·결합 검사는 수신 기록과 보호 판단을 시험 준비물로 공급한다. 실제 수신부터 Catch 등록까지의 전체 연결 검증은 #105에서, 본문 보관·자동 복구 검증은 #234에서 각각 확인한다.
