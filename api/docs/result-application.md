# E 수신 기록과 Catch 반영 연결 — #105

`src/result-application/`은 검증된 결과 수신 이후 B 등록과 E 완료 상태를 함께 저장하는 내부 서비스다. 실제 수신 DB 어댑터(#139), 진행 이벤트 연결, 자동 복구·재시도 스케줄러는 포함하지 않는다. [등록·반영 흐름](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#업무-흐름)과 [수신·후보 연결 모델](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md)이 기준이다.

## 독립 구성과 B 연결

E는 B 제품 모듈을 import하지 않는다. `RegistrationPort`는 [PR #143](https://github.com/JminAILab/CatchU/pull/143)의 기존 내부 입출력을 받는 조립 경계이며 새 HTTP/API 계약이 아니다. B가 제공된 연결부에서 실제 등록 함수와 실제 오류 타입의 분류를 **필수로 공급**한다. 기본 가짜 등록 함수·자동 활성화는 없다. B 코드·테이블이 없는 dev에서는 E 테이블/마이그레이션과 자체 검사를 독립 제공하지만 실제 Catch 등록 서비스를 호출할 수 없다.

B 제공 후의 조립 예시(현재 E 브랜치에는 아래 B 모듈이 없으므로 그대로 실행하지 않는다):

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
// #139에서 수신 정본·종결 상태를 먼저 저장·커밋한 이후 전달할 accepted 값.
const applied = await new ResultApplicationService(dataSource, registration).apply(accepted);
// 이 Promise는 B 등록/E 완료 기록의 최종 커밋 이후에만 성공한다.
// applied.registeredCatchIds / ownerResultsReady / registrations는 내부 연결 결과다.
```

등록 함수는 넘겨받은 동일한 EntityManager만 사용하고 자체 커밋·다른 연결 저장을 하지 않아야 한다([트랜잭션 규약](../CONVENTIONS.md#트랜잭션-규약)). 분류 함수는 실제 B 오류 타입의 고정 reason만 반환한다. E는 오류 이름/임의 객체의 reason을 추측하지 않으며, 원래 B 입력·맥락 오류와 QueryFailedError를 그대로 호출자에게 전달한다. 입력/적합성 거부를 정상 0건이나 DB 장애로 바꾸지 않는다.

## 테이블·원자성·재반영

`ResultApplicationRecord`는 UUID 수신 ID·요청/시도 ID, 외부 결과 ID(text), SHA-256 지문·수신 시각만 저장한다. 결과 원문·후보·비밀값은 복제하지 않는다. 시도당 하나 및 요청/시도/결과 유일성, 시도/요청 복합 FK와 지문 형식 제약을 적용한다.

적용 순서는 #104 회원·분석 기반(`1790500000000`) → E 수신 기록(`1790550000000`) → B Catch·근거·후보 연결(`1790600000000`) → B 보호 판단(`1790601000000`)이며 되돌리기는 역순이다. 이번 E 변경에는 E 엔티티·마이그레이션만 추가하며 B 테이블을 만들지 않는다. 마이그레이션 적용 순서와 E/B PR 분리·병합 순서 합의는 구분한다.

E는 READ COMMITTED 트랜잭션에서 요청 → 현재 시도 → 수신 기록을 잠그고 기존 `resultFingerprint`를 재사용해 지문·동의·범위·회원·저장소·시도·자료 모드·종결 상태를 대조한다. 입력은 첫 await 전에 복제한다. 같은 manager로 B를 호출하고, 반환한 모든 후보와 실제 `candidate_registration` 저장 연결의 ID·처리 결과·준비 여부를 대조한 뒤 APPLIED/CLOSED를 함께 저장한다. 등록 ID는 서로 다른 Catch ID에서 유도하고 열람 준비는 B가 준비됐다고 반환·저장한 등록이 있을 때만 true다. 정상 0건/실패 결과의 APPLIED는 열람 준비 true가 아니며 부분 실패의 failures·처리 종결값도 유지한다. 이 SQL 대조는 B의 기존 물리 칼럼을 사용하며 B 판정·저장 함수를 재구현하지 않는다.

저장/최종 커밋 실패는 이번 B 저장과 E 완료 기록 전체를 롤백한다. 먼저 커밋한 수신 기록과 기존 Catch는 보존하고, 별도 트랜잭션에서 같은 결과·현재 시도·ACTIVE/미반영인 경우만 APPLY_FAILED를 기록한다. 뒤늦은 실패는 다른 실행의 APPLIED/CLOSED나 바뀐 현재 시도를 덮어쓰지 않는다. 실패 기록까지 실패하면 `ApplicationFailureRecordingError`로 두 내부 오류를 보존해 전달한다. 원문을 응답/로그로 직렬화하지 않는다.

실패 기록의 고정 분류는 B의 명시적 입력/맥락 reason, E 대조 오류, DB QueryFailedError의 STORAGE_UNAVAILABLE, 미분류 내부 예외의 APPLICATION_FAILED다. 공개 오류 계약을 추가하지 않는다. 같은 결과의 명시적 재반영은 B의 기존 후보 연결을 재사용해 Catch ID를 유지하며 새 분석 실행이 아니다. 보호 판단이 없다고 NONE을 채우지 않는다.

## 검사 구분과 후속 연결

- E 자체: `npm test` 또는 `npm test -- test/db/result-application.test.cjs`. 실제 #104/E 마이그레이션·전용 `_test` DB를 사용한다. 격리된 시험 스키마의 `registration_probe`와 후보 연결은 **명시적 저장 대역**이며 실제 B 등록·적합성/보호·작업 동일성 검증을 뜻하지 않는다. 수신 정본은 `test/support/result-application-fixture.cjs`에서 #103 공용 결과로 먼저 커밋한다.
- 실제 E·B 결합: 별도 검토 공간에 [B 고정 판본 16302527450a43bf9e6a24b7cad69dd6c199d696](https://github.com/JminAILab/CatchU/commit/16302527450a43bf9e6a24b7cad69dd6c199d696)의 실제 등록 코드·테이블/마이그레이션과 현재 E 파일을 배치한다. 별도 테스트 DB를 설정하고 `npm test -- test/integration/result-application-b.check.cjs`를 실행한다. 이 파일은 기본 테스트 glob에 들어가지 않는 명시적 결합 검사이며 B가 없으면 실행할 수 없다. 전체 결합 검사에는 `npm test -- "test/**/*.test.cjs" test/integration/result-application-b.check.cjs`를 쓴다. 이 검사는 B 파일을 E 제출 브랜치에 추가하거나 merge/cherry-pick하는 절차가 아니다.
- 결합 검사에서는 실제 B 함수·마이그레이션으로 신규 PRIVATE 저장, 같은 작업·결과의 Catch ID 유지와 기존 본문/공개 상태 보존, 전체 롤백·수신 보존·별도 실패 기록·커밋 오류·실패 기록 오류·동시 반영을 대조한다. 보호 관찰과 수신 기록은 시험 준비물이다. 기존 B 시험의 E 상태 대역과 신규 실제 E 호출 검사는 구분한다.

#139는 수신 메타데이터와 PENDING 종결 상태를 별도 커밋하는 ReceiverStore DB 어댑터, Receipt 이후 실제 E apply 연결을 맡는다. 결과 원문은 accepted 또는 합의된 보존 공급자에서 받아야 하며 E 메타데이터만으로 복원할 수 없다. 보호 판단 최초 공급·결과 보존/재전달·반복 반영 실패의 복구 정책과 E/B 실제 조립·병합 순서는 후속 연결 사항이다. 이번 검사로 실제 수신부터 등록까지의 전체 흐름이나 자동 복구를 완료했다고 기록하지 않는다.
