# #105 — 분석 결과를 Catch로 저장하는 연결안

> 검토용 제안 v0.3 · 2026-09-28 · 작성: leechaeah(B)
> 기준: `9093d2e452dbcdcd746265758abc9e7f41ff9527`. 기존 계약·ERD의 행동과 유일성을 유지한다. 아래 등록 함수 형태, 물리 구현과 작성 분담은 E 담당과 확인할 제안이며 DB 검증 결과가 아니다. 독립적으로 구현한 본문 변환·후보 묶음 준비의 범위는 §2에 구분한다.

## 1. 이번에 맞출 일

분석 담당(E)이 검사한 경험 후보를 넘기면 B가 Catch와 근거를 저장한다. B는 후보마다 어느 Catch에 연결했는지 돌려준다. 새 카드 저장과 E의 ‘반영 완료’ 기록은 한 묶음으로 성공하거나 모두 취소되어야 한다.

```text
E: 분석 결과 검사 → 수신 기록 저장
                         ↓
       하나의 저장 묶음(트랜잭션) 시작
       B: Catch·근거·후보 연결 저장
       E: 반영 완료·열람 준비 상태 저장
       모두 성공하면 커밋 / 하나라도 실패하면 롤백
                         ↓
       성공: 저장된 Catch로 이동할 수 있음
       실패: 기존 자료 보존 + 반영 실패 기록
```

- [기준] 이 연결은 api 내부 함수다. 공개 Catch 생성 API나 worker 전송 경로를 새로 만들지 않는다.
- [기준] 합성 자료로 연결한다. 실제 작업 동일성 판별은 #111·#118, 공용 합성 자료는 #103의 결과를 사용한다.
- [제안] E 호출부가 트랜잭션을 시작하고 B에 넘긴다. B는 그 트랜잭션만 사용하며 따로 커밋하거나 새로운 트랜잭션을 열지 않는다.

## 2. E가 B에 넘길 값

[제안] 함수 이름은 `registerResultCandidates(input, transaction)`으로 둔다. 아래는 내부 호출에 필요한 논리 필드이며 실제 TypeScript 타입 선언이 아니다. DB ID 형식과 공용 타입 위치는 #86·#104의 결과에 맞춘다.

| 입력 | 의미·검사 |
|---|---|
| applicationRecordId | E가 먼저 저장한 수신 기록. 실제 행과 요청·시도·결과를 대조한다. |
| requestId / attemptId / resultId | 어떤 분석 요청·시도·결과의 등록인지 식별한다. 외부 ID의 단독 전역 유일성을 가정하지 않는다. |
| ownerId | 검증한 Result.memberId를 B의 소유자 명칭으로 매핑한다. 원 요청의 회원과 같아야 한다. |
| sourceMode | MOCK 또는 LIVE. 원 요청·결과와 같아야 하며 그대로 저장한다. |
| candidates | worker 메시지 v1의 Candidate 배열을 그대로 사용한다. 후보별 title·workIdentity·사실·기여·적합성·근거·초안·질문을 포함한다. |
| transaction | E가 연 TypeORM 트랜잭션의 EntityManager를 넘기는 안. #86의 연결·마이그레이션 방식과 맞춘다. |

E는 스키마, 현재 시도, 회원·저장소·동의·범위·sourceMode, 같은 ID의 다른 payload를 먼저 검사한다. B도 DB의 수신 기록→시도→요청 관계와 소유자를 검사하고, 후보의 등록 조건을 확인한다. 호출자가 검사했다고 해서 임의의 회원 자료를 저장하지 않는다.

등록 후 서비스에 필요한 근거·설명·질문은 B 정본에 복사한다. 후보의 evidenceId는 CatchEvidence.sourceEvidenceId에 대응한다. 후보의 groupingBasis·groupingLimitations·eligibility는 등록 판단에 사용하되 임의 컬럼이나 F 원문 저장 테이블을 추가하지 않는다. registrationAssessment의 물리 표현은 ERD 의미를 유지해 구현 때 정한다.

### B에서 준비할 저장 대응표

아래 대응은 기존 ERD의 속성에 맞춘다. 실제 컬럼 타입·이름과 마이그레이션 코드는 #86의 물리 규약을 적용할 때 작성한다.

| 받은 값 | B 저장 위치 | 보존할 기준 |
|---|---|---|
| ownerId, requestId, resultId, candidateId | CatchAsset.ownerId, sourceRequestId, sourceResultId, sourceCandidateId | 원 요청의 소유자·결과 맥락을 대조 |
| title, workIdentity, workFacts, subjectContribution | CatchAsset의 같은 이름 속성 | 제목이나 기여를 새로 생성하지 않음 |
| draft.status / draft.content | draftStatus / draftContent | GENERATED일 때만 본문 문자열, 실패·미생성은 null |
| reflection.status / reflection.questions | reflectionStatus / reflectionQuestions | 질문의 생성 상태를 보존하고 답변 저장 필드를 추가하지 않음 |
| evidence[] | CatchEvidence | evidenceId를 sourceEvidenceId에 매핑하고 출처·판본·관측 사실·기여 범위·한계를 저장 |
| sourceMode | CatchAsset.sourceMode | MOCK/LIVE를 바꾸지 않음 |
| B의 근거·기여·적합성 판정 | registrationAssessment | 기존 등록 판단 의미를 유지. 물리 표현은 구현 때 정함 |
| 새 Catch의 초기 상태 | workFactsConfirmed=false, contributionConfirmed=false, mismatch=false, visibility=PRIVATE | 기존 Catch를 참조할 때는 이 초기값으로 덮어쓰지 않음 |
| applicationRecordId, candidateId, 판정 결과 | CandidateRegistration | catchId·CREATED/EXISTING·ownerViewReady와 함께 저장 |

repositoryId는 원 요청에서 유도한다. CatchAsset에 별도 저장소 컬럼이나 등록된 Catch ID 배열을 추가하지 않는다. 위 표와 §6의 기대 결과는 E 담당의 답을 기다리는 동안에도 B가 구현 준비에 사용할 수 있다.

### 구현한 내부 준비 코드

[prepareNewCatchContent](../src/catches/new-catch-content.ts)는 위 대응표 중 새 Catch의 본문·근거·초기 상태만 만든다. `CatchContentSource`는 이 변환에 필요한 부분 타입이며 E↔B 호출 계약을 확정하거나 Candidate 전체 검증을 대신하지 않는다.

- 생성 상태·본문의 모순은 내부 `TypeError`로 거부한다. 실패·미생성을 성공으로 바꾸거나 내용을 만들어 채우지 않는다.
- 새 카드의 확인·불일치는 false, 공개 상태는 PRIVATE로 고정한다. 입력과 출력의 배열은 공유하지 않는다.
- 소유권·등록 적합성·중복 판정, registrationAssessment, DB ID·저장·후보 연결·열람 준비 상태는 포함하지 않는다. 기존 Catch 갱신에도 사용하지 않는다.
- [단위 검사](../test/catches/new-catch-content.test.cjs)는 함수 전용 합성 값으로 위 기준을 확인한다. E 호출부 연결과 아래 DB 통합 사례는 선행 기반·담당 합의 후 구현한다.

[prepareRegistrationBatch](../src/catches/registration-batch.ts)는 같은 소유자의 한 결과로 검증된 후보 목록을 받아 등록 준비를 수행한다. 필수 본문·근거와 전달된 적합성 표시, 후보 ID/후보 안의 근거 ID 중복을 검사한다. 하나라도 잘못되면 일부 후보만 성공 반환하지 않는다. 이 검사는 근거의 진위나 실패 영향 분리 판단 자체를 수행한 것이 아니며, 소유권·원 요청/출처 맥락은 실제 연결에서 대조한다.

작업 키는 변형하지 않고 동일한 문자열끼리 묶는다. 제목이 달라도 같은 작업 키면 한 묶음이고, 다른 작업이면 근거 일부가 겹쳐도 별도 묶음이다. 후보별 본문과 식별자는 보존하며, 합치거나 대표 후보를 선택하거나 기존 Catch를 고치지 않는다. 아직 DB 저장이 아니므로 catchId·등록 결과·열람 준비를 반환하지 않는다. 후보 0건도 빈 묶음만 반환하고 E의 결과 의미를 정하지 않는다. [묶음 준비 검사](../test/catches/registration-batch.test.cjs)는 이 범위만 확인한다.

## 3. B가 E에 돌려줄 값

[제안] 입력 후보마다 다음 값을 반환한다. 반환 순서가 아니라 candidateId로 대응한다.

| 반환값 | 의미 |
|---|---|
| candidateId | 입력 후보의 ID |
| catchId | 새로 만든 Catch 또는 같은 소유자의 기존 동일 작업 Catch |
| disposition | CREATED / EXISTING. CandidateRegistration에 저장한 판정 |
| ownerViewReady | 해당 Catch와 근거가 준비됐는지 B가 판정한 값 |

- B의 함수 반환은 아직 트랜잭션 내부 결과다. E의 상태 저장까지 끝나 커밋된 뒤에만 외부에 성공·열람 준비를 알린다.
- E는 CandidateRegistration에서 서로 다른 catchId를 구한다. 두 후보가 같은 작업이어도 등록 연결은 두 개, Catch는 하나가 될 수 있다.
- ownerResultsReady는 B가 준비됐다고 확인한 Catch가 있고 연결이 일관되게 커밋됐을 때만 true다. 후보 0개의 정상·실패 결과는 E가 의미를 반영하며 Catch를 만들지 않는다.
- [제안] 동일 수신 기록·후보의 재호출은 저장된 등록 연결을 그대로 반환한다. 처음 CREATED였던 기록을 호출 횟수 때문에 EXISTING으로 바꾸지 않는다.
- B는 processing, application, lifecycle의 최종 값을 반환하거나 직접 결정하지 않는다. 그 상태의 정본은 E다.

## 4. 저장 순서와 실패 처리

### 유지할 기준

1. E가 검증한 ResultApplicationRecord를 먼저 저장한다. F 결과 원문을 이 테이블에 복제하지 않는다.
2. E가 같은 결과의 반영을 직렬화하고 현재 시도·기존 반영 여부를 확인한다.
3. 하나의 트랜잭션 안에서 B가 후보를 검사하고 Catch·근거·CandidateRegistration을 저장하거나 기존 Catch를 참조한다.
4. 같은 트랜잭션 안에서 E가 반영 완료와 준비·종결 상태를 기록한다. 등록 ID 목록의 정본은 CandidateRegistration이며 별도 배열 정본을 만들지 않는다.
5. 모두 성공하면 커밋한다. 일부 후보만 처리한 경우 APPLIED/CLOSED로 만들지 않는다.
6. 실패하면 이번 트랜잭션의 변경을 모두 롤백한다. E는 롤백 밖에서 APPLY_FAILED를 기록한다. 앞서 저장한 수신 기록과 기존 Catch는 유지한다.

### 구현 제안

- 같은 수신 기록을 동시에 처리하지 않도록 E가 트랜잭션에서 수신/시도 행을 잠그는 안을 사용한다. 정확한 잠금 대상·순서는 #104와 함께 확인한다.
- B는 `unique(ownerId, workIdentity)`, 원 후보 키, `unique(applicationRecordId, candidateId)`를 DB의 최종 중복 방어로 유지한다.
- 작업 키 충돌은 기존 Catch를 조회해 참조한다. 기존 본문·출처·확인·불일치·공개 상태를 덮어쓰지 않는다. 새 후보의 근거로 기존 Catch를 교체하거나 덧붙이지 않는다.
- 충돌 처리에서 트랜잭션이 오류 상태가 된 채 계속 실행하지 않는다. 안전한 충돌 처리 SQL 또는 트랜잭션 단위 재진입 방식은 #86의 실제 DB로 검증한다.
- 동일 결과 재전달과 저장 복구는 F를 다시 실행하는 일이 아니다. 자동 분석 재시도를 추가하지 않는다.
- [미결] B 검사에서 E/F가 적합하다고 전달한 후보를 저장할 수 없다고 판단한 경우의 내부 오류 전달 형식을 합의한다. 초안에서는 전체 반영을 실패시키는 안을 제안한다. 후보를 조용히 버리거나 EMPTY로 바꿔 APPLIED 처리하지 않는다. 근거 부족/기준 미달의 의미와 수집·생성 오류는 구분한다.
- APPLY_FAILED 기록 자체가 실패해도 성공으로 보고하지 않는다. 수신 기록을 근거로 한 복구 경로와 안전한 오류 기록은 E 처리와 맞춘다.

## 5. 네 테이블의 생성 순서·작성 분담 제안

선행은 #86의 DB 물리 규약·테스트 기반과 #104의 회원·요청·시도 테이블이다. 이름, ID·시각 타입, enum 표현, 마이그레이션 경로를 이 문서에서 미리 고정하지 않는다.

| 순서 | 테이블 | 참조·역할 | 작성 분담 제안 |
|---|---|---|---|
| 1 | ResultApplicationRecord | AnalysisRequest·AnalysisAttempt를 참조하는 수신 기록 | E 담당이 엔티티·마이그레이션과 수신/반영 처리를 작성 |
| 2 | CatchAsset | MemberAccount·AnalysisRequest를 참조하는 Catch 정본 | B 담당이 작성 |
| 3 | CatchEvidence | CatchAsset를 참조하는 근거 정본 | B 담당이 작성 |
| 4 | CandidateRegistration | ResultApplicationRecord·CatchAsset를 참조하는 후보별 연결 | B 담당이 작성하고 E 담당과 검토 |

1과 2는 서로의 테이블을 참조하지 않아 준비를 병행할 수 있다. 적용 순서는 위와 같이 맞추고, 되돌리기는 4→3→2→1이다. #104의 기존 테이블은 #105 되돌리기의 삭제 대상이 아니다.

E의 반영 상태 기록 코드 작성자, migration 반영 방식·순서, 같은 작업 PR에서 협업할 방법은 아직 합의 전이다. 위 표는 다른 담당에게 새 작업을 확정 배정한 것이 아니다. #105에서 담당자의 답을 받아 실행 범위를 정한다.

## 6. #103 자료로 확인할 사례

| 사례 | 확인할 결과 |
|---|---|
| 적합 후보 1개 | title이 있는 PRIVATE Catch와 근거·등록 연결·E 반영 완료가 함께 저장됨. 확인 두 값과 불일치는 false |
| 같은 결과 재전달 | 기존 연결과 같은 catchId를 반환하고 Catch·근거가 늘지 않음 |
| 두 후보가 같은 작업 | 서로 다른 후보 연결 두 개가 같은 Catch 하나를 참조 |
| 다른 작업의 근거 일부 중첩 | 작업 동일성이 다르면 근거가 겹쳐도 별도 Catch로 저장 |
| 초안 또는 질문 생성 실패 | 근거·기여 등 조건을 충족하면 Catch 등록. 실패/미생성 상태와 null·빈 질문 등 계약 표현을 보존 |
| 저장 도중 또는 E 완료 기록 실패 | 이번 Catch·근거·등록 연결·완료 변경이 모두 롤백되고 이전 자료·수신 기록은 유지 |
| 커밋 후 응답 유실 | 다시 받아도 같은 Catch를 반환하고 기존 공개·본문을 보존 |
| 같은 결과의 동시 반영 | 유일성 충돌을 처리해 같은 Catch·연결로 수렴하고 중간 부분 저장을 완료로 노출하지 않음 |
| 정상 0건 / 부분 실패 / 전체 실패 | E가 원래 결과 의미를 보존. B는 제공 가능한 후보만 처리하며 0건에서 가짜 Catch를 만들지 않음 |
| 맥락 불일치·다른 payload·늦은 결과 | E에서 거부·격리. B에 전달되지 않고 기존 자료를 보존 |

현재는 사례 목록만 정리했다. 실제 PostgreSQL, 마이그레이션 되돌리기, 원자성·동시성 시험은 #86·#103·#104 결과를 사용해 구현 후 수행한다.

## 7. E 담당과 확인할 두 가지

1. **호출과 상태 저장:** E가 위 입력을 만들고 트랜잭션을 열어 B에 전달한 뒤, 같은 트랜잭션에서 반영 완료를 기록하는 안으로 연결할 수 있는가? B 등록 부적합 판단·저장 실패의 내부 오류 형식도 함께 맞춘다.
2. **작성 분담과 마이그레이션:** E는 ResultApplicationRecord·호출부·반영 상태 기록, B는 CatchAsset·CatchEvidence·CandidateRegistration을 작성하는 제안과 생성/되돌리기 순서가 맞는가?

답변 전에는 함수·물리 타입·작성 분담을 확정으로 표시하지 않는다. B 구현용 데이터 모델과 테스트 준비는 이 답변 및 선행 기반에 맞춰 이어 간다.

## 근거

- [#105](https://github.com/JminAILab/CatchU/issues/105): 등록 함수, 네 테이블, 트랜잭션과 중복/실패 검증 범위.
- [계약 요약 — B 등록·공개 및 E/F 반영 경계, OQ-B1](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md): 내부 호출과 단일 트랜잭션 기준.
- [API 기능 설계 — F3/F4, 동시성과 일관성](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md): 수신·반영 분리, 롤백과 커밋 뒤 응답 유실의 차이.
- [ERD — CatchAsset·CatchEvidence·ResultApplicationRecord·CandidateRegistration](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md): 속성·참조·유일성.
- [업무 규칙 BR2.5~BR2.8](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md): 수신 검사·등록 적합성·생성 상태의 분리.
- [worker 메시지 v1 — Result·Candidate](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml): 입력 후보의 정본. 새 메시지 계약을 만들지 않는다.
