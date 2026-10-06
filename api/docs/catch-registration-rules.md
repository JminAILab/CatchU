# Catch 등록 — 내부 호출과 저장 규칙

[등록 연결 안내](catch-registration-proposal.md) · [DB 적용과 검사](catch-registration-database.md) · [E 연결 조건](catch-registration-e-integration.md)

## 내부 호출

```ts
await dataSource.transaction(async (manager) => {
  const registrations = await registerCandidates(manager, input);
  // E: 동일 manager로 반영 완료·열람 준비·종결 상태를 저장한다.
  // 예외를 삼키지 않고 트랜잭션 바깥으로 전달한다.
  return registrations;
});
```

입력 타입은 `CatchRegistrationInput`, 반환은 후보별 `CatchRegistrationResult[]`다.
공개 API/worker 메시지 계약을 바꾸는 타입이 아니다.

| 입력 | 대조 기준 |
|---|---|
| applicationRecordId | E가 저장한 수신 기록. 같은 행을 잠가 재호출 직렬화 |
| requestId / attemptId / resultId | 수신 기록 및 시도→요청과 일치. 요청의 currentAttemptId도 대조 |
| ownerId | 원 요청 memberId와 일치. 내부 UUID는 표준 소문자로 대조 |
| sourceMode | AnalysisAttempt.sourceMode와 일치. AnalysisRequest에 필드를 추가하지 않음 |
| candidates | worker Candidate의 제목·작업 키·사실·기여·근거·생성 상태·적합성 값 |
| manager | 활성 트랜잭션 필수. 전역 DataSource/Repository 사용 없음 |

반환은 `candidateId`, `catchId`, `disposition(CREATED/EXISTING)`, `ownerViewReady`다.
후보 ID로 대응하며 배열 순서를 계약으로 사용하지 않는다.
후보 0개는 빈 배열을 반환한다. E의 정상 0건·전체 실패 의미나 최종 상태는 판단하지 않는다.

`ownerViewReady:true`는 본인 열람 준비를 뜻한다.
원 요청 소유자·근거와 원 요청 저장소에 대응하는 동일 소유자의 명시적인
`RepositoryProtection` 판단을 확인한다. `NONE`과 `SOURCE_PRIVATE` 모두 본인 열람이 가능하다.
행이 없거나 판단 값이 유효하지 않으면 `CATCH_NOT_READY`로 거부해 트랜잭션을 롤백한다.
B가 기본 `NONE` 행을 만들지 않으며, 최초 판단은 [E 연결 조건](catch-registration-e-integration.md#보호-판단과-live-출처)대로 공급한다.

## 저장·중복·보존

1. [`prepareRegistrationBatch`](../src/catches/registration-batch.ts)로 모든 후보를 검사한다.
   한 후보라도 조건을 충족하지 못하면 조용히 빼지 않고 전체 호출을 거부한다.
2. 수신 기록과 요청·시도·소유자 맥락을 대조한다.
   E가 먼저 검증했다는 이유로 B 대조를 생략하지 않는다.
3. 같은 owner/workIdentity의 잠금을 작업 키 순으로 잡는다.
   제목이나 겹친 근거로 작업 키를 새로 만들지 않는다.
4. 신규 작업은 전달 순서상 첫 적합 후보의 내용을 저장한다.
   이후 같은 작업 후보는 그 Catch를 참조하며 후보 본문을 합치지 않는다.
   저장된 판단에는 적합성 표시와 묶음 근거·한계를 남긴다.
5. 새 Catch의 확인 두 값·불일치는 false, 공개 상태는 PRIVATE다.
   생성 실패/미생성, 원 출처, MOCK/LIVE를 보존한다.
   근거와 원 요청 저장소의 보호 판단을 확인한 다음 등록 연결을 저장한다.
6. 기존 Catch를 참조할 때 원 요청의 저장소와 Catch의 MOCK/LIVE가
   이번 요청·시도의 맥락과 같은지 먼저 대조한다.
   다르면 `CatchRegistrationContextError('CONTEXT_MISMATCH')`로 전체 반영을 거부한다.
   본문·근거·원 출처·확인·불일치·공개 상태를 덮어쓰지 않는다.
   원 요청 소유자·근거·원 요청 저장소의 보호 판단도 다시 확인한다.
   새 요청 저장소의 보호 행으로 대신하지 않는다.
7. 같은 수신 기록의 재호출도 저장소·MOCK/LIVE와 열람 준비를 다시 검사한다.
   저장된 후보 집합과 작업 키가 일치하면 최초 판정(CREATED 포함)을 그대로 반환한다.
   일부 후보만 재전달해 기존 연결을 축소하지 않는다.
   같은 ID의 다른 원문을 거부하는 fingerprint 검사는 E 책임이다.

DB의 `(owner_id, work_identity)`, 원 요청·결과·후보 키,
`(application_record_id, candidate_id)` 유일성이 최종 중복 방어다.
INSERT 충돌은 PostgreSQL을 오류 상태로 만들지 않는 `ON CONFLICT DO NOTHING` 뒤
맥락에 맞는 기존 Catch를 조회한다. 맞는 Catch가 없으면 거부한다.
DB 실패를 무시하고 다음 후보를 처리하지 않는다.

저장소·MOCK/LIVE 대조는 잘못된 기존 Catch 연결을 막는 검사다.
`workIdentity`는 불투명한 문자열이며 B가 형식을 강제하거나 다시 계산하지 않는다.
원본·포크의 작업 판별이나 [PR #180](https://github.com/JminAILab/CatchU/pull/180)의
전체 기준 채택을 이 검사로 결정하지 않는다.

## 오류와 롤백

| 오류 | 의미 |
|---|---|
| CatchRegistrationInputError | 필수 내용/구조/생성 상태 모순(INVALID_INPUT), 전달된 적합성 표시 미충족(REGISTRATION_INELIGIBLE) |
| CatchRegistrationContextError | 활성 트랜잭션 부재·잘못된 내부 식별자·수신 맥락 불일치·기존 등록 연결 불일치·Catch 근거/소유/보호 판단 연결 불완전 |
| TypeORM QueryFailedError | 실제 DB 실행 실패. 일반 Error를 전부 DB 실패로 감싸지 않음 |

B의 의도적인 거부에는 고정 reason/field만 넣는다.
후보 원문·ID·URL을 오류 안내에 넣지 않는다.
DB 예외 원문에는 query/parameters가 포함될 수 있으므로 외부 응답·로그에 그대로 싣지 않는다.
E 호출부가 내부 타입을 분류·기록하며, 새로운 공개 오류 코드로 사용하지 않는다.

저장소·MOCK/LIVE 불일치는 기존 내부 `CONTEXT_MISMATCH`로 전달한다.
정상 `EXISTING`이나 후보 0건으로 바꾸지 않는다.
묶음 뒤쪽에서 발견해도 이번 Catch·근거·후보 연결과 같은 트랜잭션의 E 완료 기록은 함께 롤백한다.
기존 Catch와 먼저 저장한 수신 결과는 보존한다.
롤백 후 E 실패 기록·복구는 [E 연결 조건](catch-registration-e-integration.md#실패와-재시작-후-재반영)에서 확인한다.
