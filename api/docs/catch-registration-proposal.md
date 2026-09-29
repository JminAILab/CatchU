# 분석 결과 → Catch 등록 연결 — #105

> v0.7 · 2026-09-29. B의 저장 구현과 내부 호출 규약. E의 실제 수신·반영 호출부 연결은 별도다.

## 1. 구현 범위

[`registerCandidates`](../src/catches/registration-service.ts)는 E가 연 TypeORM 트랜잭션의 `EntityManager`를 받아 Catch·근거·후보별 등록 연결을 저장한다. 후보 준비 함수와 등록·보호 판단 엔티티, B 테이블 생성/되돌리기 마이그레이션을 포함한다. 별도 HTTP 등록 API나 새 F 실행은 만들지 않는다.

E는 검증한 수신 기록을 먼저 저장하고, B 호출과 E의 반영 완료 기록을 **같은 트랜잭션**에 둔다. B가 반환한 값은 아직 커밋 전 내부 결과다. 성공 응답·열람 준비는 커밋 뒤에만 외부에 알린다. 실패 시 E가 트랜잭션 밖에서 `APPLY_FAILED`를 기록한다.

A/E의 회원·요청·시도·수신 테이블, 원문 fingerprint·동의·범위 검증, 반영 상태 처리와 반복 실패 복구는 이 함수가 대신하지 않는다. DB 테스트의 A/E 테이블은 이 경계를 검증하기 위한 합성 대역이다.

## 2. 내부 호출

```ts
await dataSource.transaction(async (manager) => {
  const registrations = await registerCandidates(manager, input);
  // E: 동일 manager로 반영 완료·열람 준비·종결 상태를 저장한다.
  // 예외를 삼키지 않고 트랜잭션 바깥으로 전달한다.
  return registrations;
});
```

입력 타입은 `CatchRegistrationInput`, 반환은 후보별 `CatchRegistrationResult[]`다. 공개 API/worker 메시지 계약을 바꾸는 타입이 아니다.

| 입력 | 대조 기준 |
|---|---|
| applicationRecordId | E가 저장한 수신 기록, 같은 행을 잠가 재호출 직렬화 |
| requestId / attemptId / resultId | 수신 기록 및 시도→요청과 일치. 요청의 currentAttemptId도 대조 |
| ownerId | 원 요청 memberId와 일치. 내부 UUID는 표준 소문자로 대조 |
| sourceMode | AnalysisAttempt.sourceMode와 일치. AnalysisRequest에 필드를 추가하지 않음 |
| candidates | worker Candidate의 제목·작업 키·사실·기여·근거·생성 상태·적합성 값 |
| manager | 활성 트랜잭션 필수. 전역 DataSource/Repository 사용 없음 |

반환은 `candidateId`, `catchId`, `disposition(CREATED/EXISTING)`, `ownerViewReady`다. 후보 ID로 대응하며 배열 순서를 계약으로 사용하지 않는다. 후보 0개는 빈 배열을 반환하고 E의 정상 0건·전체 실패 의미나 최종 상태를 판단하지 않는다.

`ownerViewReady:true`는 본인 열람 준비를 뜻한다. 원 요청 소유자·근거뿐 아니라 원 요청 저장소에 대응하는 동일 소유자의 명시적인 `RepositoryProtection` 판단도 확인한다. `NONE`과 `SOURCE_PRIVATE` 모두 본인 열람이 가능하다. 행이 없거나 판단 값이 유효하지 않으면 `CATCH_NOT_READY`로 거부해 트랜잭션을 롤백한다. 최초 보호 판단의 실제 공급은 별도 연결 사항이며, 이 함수가 기본 `NONE` 행을 만들지 않는다. 호출 전에 또는 같은 트랜잭션에서 B 호출보다 먼저 유효한 판단을 준비해야 한다.

## 3. 저장·중복·보존

1. [`prepareRegistrationBatch`](../src/catches/registration-batch.ts)로 모든 후보를 검사한다. 한 후보라도 조건을 충족하지 못하면 조용히 빼지 않고 전체 호출을 거부한다.
2. 수신 기록과 요청·시도·소유자 맥락을 대조한다. E가 먼저 검증했다는 이유로 B 대조를 생략하지 않는다.
3. 같은 owner/workIdentity의 잠금을 작업 키 순으로 잡는다. 제목이나 겹친 근거로 작업 키를 새로 만들지 않는다.
4. 신규 작업은 전달 순서상 첫 적합 후보의 내용을 저장하고, 이후 같은 작업 후보는 그 Catch를 참조한다. 후보 본문을 합치지 않는다. 저장된 판단에는 적합성 표시와 묶음 근거·한계를 남긴다.
5. 새 Catch의 확인 두 값·불일치는 false, 공개 상태는 PRIVATE다. 생성 실패/미생성, 원 출처, MOCK/LIVE를 보존한다. 근거와 원 요청 저장소의 보호 판단을 확인한 다음 등록 연결을 저장한다.
6. 기존 Catch를 참조할 때 본문·근거·원 출처·확인·불일치·공개 상태를 덮어쓰지 않는다. 원 요청 소유자·근거·원 요청 저장소의 보호 판단도 다시 확인한다. 새 요청 저장소의 보호 행으로 대신하지 않는다.
7. 같은 수신 기록의 재호출도 열람 준비를 다시 검사하고, 저장된 후보 집합과 작업 키가 일치하면 최초 판정(CREATED 포함)을 그대로 반환한다. 일부 후보만 재전달해 기존 연결을 축소하지 않는다. 같은 ID의 다른 원문을 거부하는 fingerprint 검사는 E 책임이다.

DB의 `(owner_id, work_identity)`, 원 요청·결과·후보 키, `(application_record_id, candidate_id)` 유일성이 최종 중복 방어다. INSERT 충돌은 PostgreSQL을 오류 상태로 만들지 않는 `ON CONFLICT DO NOTHING` 뒤 맥락에 맞는 기존 Catch를 조회한다. 맞는 Catch가 없으면 거부한다. DB 실패를 무시하고 다음 후보를 처리하지 않는다.

## 4. 테이블과 적용 순서

| 순서 | 정본 | 작성 책임 |
|---|---|---|
| 선행 | MemberAccount·AnalysisRequest·AnalysisAttempt | A/E, #104 |
| 1 | ResultApplicationRecord | E: 수신 메타데이터·마이그레이션 |
| 2 | CatchAsset | B: 본문·상태·등록 판단 |
| 3 | CatchEvidence | B: 근거 사본 |
| 4 | CandidateRegistration | B 작성, E 연결 관점 검토 |
| 5 | RepositoryProtection | B: 회원·저장소별 명시적 보호 판단 저장 공간 |

B 엔티티는 [`src/catches/entities`](../src/catches/entities), 마이그레이션은 [`CreateCatchAssets1790600000000`](../src/database/migrations/1790600000000-CreateCatchAssets.ts)와 [`CreateRepositoryProtection1790601000000`](../src/database/migrations/1790601000000-CreateRepositoryProtection.ts)다. 단수 snake_case 테이블/컬럼, 앱 발급 UUID, 외부 ID text, 배열 text[], 판단 jsonb, enum varchar+CHECK를 사용한다. 공통 DB 규약과 동일한 TypeORM 1.1.1·pg 8.23.0을 고정했다.

B 마이그레이션은 선행 테이블이 없으면 실패하며 가짜 제품 테이블을 만들거나 FK를 생략하지 않는다. down은 보호 판단→후보 연결→근거→Catch 순서이며 A/E 테이블을 지우지 않는다. **E 마이그레이션이 추가되면 timestamp 적용 순서를 함께 확인해야 한다.**

A/E 엔티티를 연결하기 전 외부 FK는 마이그레이션에만 있다. `migration:generate`가 기존 FK 삭제를 제안하면 채택하지 말고 실제 A/E 엔티티 관계를 먼저 연결한다. B→B 관계는 엔티티에도 있다. synchronize로 스키마를 바꾸지 않는다.

## 5. 오류와 E 연결 경계

| 오류 | 의미 |
|---|---|
| CatchRegistrationInputError | 필수 내용/구조/생성 상태 모순(INVALID_INPUT), 전달된 적합성 표시 미충족(REGISTRATION_INELIGIBLE) |
| CatchRegistrationContextError | 활성 트랜잭션 부재·잘못된 내부 식별자·수신 맥락 불일치·기존 등록 연결 불일치·Catch 근거/소유/보호 판단 연결 불완전 |
| TypeORM QueryFailedError | 실제 DB 실행 실패. 일반 Error를 전부 DB 실패로 감싸지 않음 |

B의 의도적인 거부에는 고정 reason/field만 넣는다. 후보 원문·ID·URL을 오류 안내에 넣지 않는다. DB 예외 원문에는 query/parameters가 포함될 수 있으므로 외부 응답·로그에 그대로 싣지 않는다. E가 이 내부 타입을 분류·기록하는 연결은 E 호출부에서 검토한다. 새로운 공개 오류 코드가 아니다.

같은 결과가 계속 반영 실패할 때의 운영 복구는 미정이며 후보 삭제·원문 수정·자동 재분석으로 해결하지 않는다. B의 receipt 잠금 외에 E가 현재 시도/생성 방식 값을 변경하는 경로를 만들면 공유 잠금 순서와 불변성을 맞춘다. 현재 MVP는 새 요청에 새 시도를 만든다.

## 6. 검사 실행

순수 함수·기존 API 검사는 `npm test`, 실제 B 저장 검사는 `npm run test:catches:db`다. DB 검사는 `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, `TEST_DB_PASSWORD`, `TEST_DB_NAME`을 모두 지정한다. DB 이름은 `_test`로 끝나야 한다. 일반 검사에서 설정이 없으면 DB 검사는 건너뛴 것으로 표시하고, 명시 DB 검사에서 누락/잘못된 설정은 실패한다.

검사 fixture는 임의 이름의 격리 스키마에 **테스트용** A/E 최소 테이블을 먼저 만들고 실제 B 마이그레이션을 적용한다. 정상 등록 자료에는 합성 관측의 보호 판단을 명시적으로 준비한다. 종료 시 자신이 만든 스키마만 정리한다. 기존 public 스키마나 제품 DB를 초기화하지 않는다.

주요 검사는 신규 PRIVATE 저장, 생성 실패 보존, 같은 작업/재전달/동시 요청의 중복 방지, 기존 내용 보존, 소유·시도 대조, 후보 거부·DB 실패·E 완료 기록 실패 시 전체 롤백, 커밋 전 비가시성, FK·유일성·CHECK 및 down이다. E 완료/실패 기록도 합성 호출부로 검증하므로 실제 E 수신부·worker 통합 성공을 뜻하지 않는다. 판본별 실행 결과는 PR에 기록한다.

## 7. 근거와 변경 이력

- [#105](https://github.com/JminAILab/CatchU/issues/105): 등록 함수·원자 저장·중복/실패 검증과 분담.
- [PR #143 팀장 결정](https://github.com/JminAILab/CatchU/pull/143#issuecomment-5865277945), [E 담당 동의](https://github.com/JminAILab/CatchU/pull/143#issuecomment-5865412468): 빈 후보 거부·전체 롤백·논리 입출력·테이블 분담.
- [계약 요약](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md): B 등록과 E/F 반영 경계.
- [API 기능 설계](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md), [ERD](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md), [업무 규칙](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md): 원자성·속성·유일성·등록 적합성.
- [worker 메시지](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml): 입력 후보의 정본.

- v0.7 (2026-09-29): 본인 조회의 필수 보호 판단을 등록·재호출 준비 검사에도 적용하고, 보호 판단 엔티티·마이그레이션과 최초 공급 조건을 추가했다. 보호 행이 없는데 열람 준비 완료를 반환하던 불일치를 막는다.
- v0.6 (2026-09-29): B 엔티티·마이그레이션·실제 등록 함수·PostgreSQL 검사 추가. 내부 구현 설명을 실행 코드에 맞추고 실제 E 통합 경계를 유지했다.
- v0.5 (2026-09-28): 준비 함수 입력 거부 타입과 고정 이유·필드 추가. E 수용·DB 오류 분류·복구는 미결로 유지했다.
- v0.4 (2026-09-28): 팀장 결정과 E 리뷰의 전체 롤백·빈 후보 거부·입출력·작성 분담을 기록했다.
