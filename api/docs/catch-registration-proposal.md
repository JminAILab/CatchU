# #105 — 분석 결과를 Catch로 저장하는 연결안

> 연결안 v0.5 · 2026-09-28 · 작성: leechaeah(B)
> 기준: `9093d2e452dbcdcd746265758abc9e7f41ff9527`. 기존 계약·ERD의 행동과 유일성을 유지하며 PR #143의 9/28 팀장 결정·E 담당 동의를 반영했다. 논리 입출력, 같은 트랜잭션에서의 저장, 생성·되돌리기 순서와 작성 분담은 아래 리뷰 근거로 구분한다. 실제 타입·물리 구현·PR 병합 순서까지 확정하거나 DB 동작을 검증한 기록은 아니다. 구현한 본문 변환·후보 묶음 준비의 범위는 §2에 구분한다.

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
- [연결 합의 — 9/28 E 리뷰] E 호출부가 트랜잭션을 시작하고 B에 넘긴다. B는 그 트랜잭션만 사용하며 따로 커밋하거나 새로운 트랜잭션을 열지 않는다. E의 상태 기록까지 커밋된 뒤에만 사용자에게 성공·열람 가능 상태를 알린다.

## 2. E가 B에 넘길 값

[연결 합의 — 9/28 E 리뷰] 아래 논리 입력으로 E가 B의 등록 함수를 호출한다. `registerResultCandidates(input, transaction)`은 함수 이름 제안이며, 아래 표는 실제 TypeScript 타입 선언이 아니다. DB ID 형식과 공용 타입 위치는 #86·#104의 결과에 맞춘다.

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

- 생성 상태·본문의 모순은 내부 `CatchRegistrationInputError`로 거부한다. 실패·미생성을 성공으로 바꾸거나 내용을 만들어 채우지 않는다.
- 새 카드의 확인·불일치는 false, 공개 상태는 PRIVATE로 고정한다. 입력과 출력의 배열은 공유하지 않는다.
- 소유권·등록 적합성·중복 판정, registrationAssessment, DB ID·저장·후보 연결·열람 준비 상태는 포함하지 않는다. 기존 Catch 갱신에도 사용하지 않는다.
- [단위 검사](../test/catches/new-catch-content.test.cjs)는 함수 전용 합성 값으로 위 기준을 확인한다. E 호출부 연결과 아래 DB 통합 사례는 선행 기반·담당 합의 후 구현한다.

[prepareRegistrationBatch](../src/catches/registration-batch.ts)는 같은 소유자의 한 결과로 검증된 후보 목록을 받아 등록 준비를 수행한다. 필수 본문·근거와 전달된 적합성 표시, 후보 ID/후보 안의 근거 ID 중복을 검사한다. 하나라도 잘못되면 일부 후보만 성공 반환하지 않는다. 이 검사는 근거의 진위나 실패 영향 분리 판단 자체를 수행한 것이 아니며, 소유권·원 요청/출처 맥락은 실제 연결에서 대조한다.

[팀장 결정 — 9/28] 내용이 빈 후보를 거부하는 검사는 유지한다. worker 메시지 스키마의 통과 여부와 별개로, 저장할 CatchAsset·CatchEvidence의 ERD가 작업 사실 1개 이상·비어 있지 않은 기여·근거 1개 이상을 요구하므로 B의 등록 검사가 더 엄격하다.

[구현·내부 연결 제안] 준비 함수의 의도적인 입력 거부는 [CatchRegistrationInputError](../src/catches/registration-input-error.ts)로 구분한다. 기존 `TypeError`를 상속하므로 기존 입력 거부 검사는 유지한다. 이 타입과 아래 reason은 B 내부 구현안이며 공개 API 오류 코드나 E가 이미 수용한 연결 계약이 아니다.

| reason | 의미 |
|---|---|
| INVALID_INPUT | 필수값·구조·중복 식별자·생성 상태/본문의 모순 등 준비 입력이 올바르지 않음 |
| REGISTRATION_INELIGIBLE | 전달된 근거·기여 확인 또는 실패 영향 분리의 적합성 표시가 true가 아님 |

오류에는 고정 안내와 코드에 정한 필드명만 넣으며 후보 본문·ID·URL·DB 오류 원인을 싣지 않는다. 예상하지 못한 일반 `Error`·`TypeError`는 입력 거부로 감싸지 않는다. 이 타입이 아니라는 이유만으로 DB 장애라고 분류해서도 안 된다. DB 어댑터의 실제 실패 식별과 E 전달·처리 방법은 연결 때 맞춘다. 후보가 하나라도 거부되면 부분 준비 결과를 반환하지 않는 기존 동작은 유지한다. 실제 DB 저장·롤백·복구 코드는 아직 없다.

작업 키는 변형하지 않고 동일한 문자열끼리 묶는다. 제목이 달라도 같은 작업 키면 한 묶음이고, 다른 작업이면 근거 일부가 겹쳐도 별도 묶음이다. 후보별 본문과 식별자는 보존하며, 합치거나 대표 후보를 선택하거나 기존 Catch를 고치지 않는다. 아직 DB 저장이 아니므로 catchId·등록 결과·열람 준비를 반환하지 않는다. 후보 0건도 빈 묶음만 반환하고 E의 결과 의미를 정하지 않는다. [묶음 준비 검사](../test/catches/registration-batch.test.cjs)는 이 범위만 확인한다.

## 3. B가 E에 돌려줄 값

[연결 합의 — 9/28 E 리뷰] 입력 후보마다 다음 값을 반환한다. 반환 순서가 아니라 candidateId로 대응한다. 실제 등록 함수와 반환 타입은 선행 기반에 맞춰 구현한다.

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
- [팀장 결정·E 동의 — 9/28] B가 후보 중 하나라도 저장할 수 없다고 판단하거나 저장 도중 실패하면 이번 반영 전체를 롤백하고, E가 트랜잭션 밖에서 APPLY_FAILED를 기록한다. 후보를 조용히 버리거나 EMPTY로 바꿔 APPLIED 처리하지 않는다. 앞서 저장한 수신 기록과 기존 Catch는 유지한다.
- [연결 요구 — E 리뷰] B의 등록 조건 미충족과 DB 저장 실패를 E에 구분해 전달한다. 근거 부족/기준 미달은 수집·생성 오류와도 구분한다. §2의 입력 오류 타입은 준비 함수에서 구현한 내부 제안이다. E가 이를 받는 방식, 실제 DB 오류 식별·전달·롤백 처리는 아직 구현하지 않았다.
- [미결] 같은 결과를 다시 저장해도 등록 조건 미충족 등으로 계속 실패하는 경우의 복구 방법은 E 담당과 정한다. 임의로 후보를 제외하거나 원문을 수정해 성공 처리하지 않는다. 현재 문서는 자동 복구·재분석 절차를 추가하지 않는다.
- APPLY_FAILED 기록 자체가 실패해도 성공으로 보고하지 않는다. 수신 기록을 근거로 한 복구 경로와 안전한 오류 기록은 E 처리와 맞춘다.

## 5. 네 테이블의 생성 순서·작성 분담

선행은 #86의 DB 물리 규약·테스트 기반과 #104의 회원·요청·시도 테이블이다. 이름, ID·시각 타입, enum 표현, 마이그레이션 경로를 이 문서에서 미리 고정하지 않는다.

9/28 E 담당이 아래 생성 순서·역순 되돌리기와 작성 분담에 동의했다. E는 ResultApplicationRecord와 생성·되돌리기 코드, B 등록 함수 호출부, 반영 완료·실패 상태 처리를 맡는다. B는 아래 세 테이블과 등록 함수를 맡고, CandidateRegistration은 E와 함께 검토한다.

| 순서 | 테이블 | 참조·역할 | 작성 분담 — E 리뷰 동의 |
|---|---|---|---|
| 1 | ResultApplicationRecord | AnalysisRequest·AnalysisAttempt를 참조하는 수신 기록 | E 담당이 엔티티·마이그레이션과 수신/반영 처리를 작성 |
| 2 | CatchAsset | MemberAccount·AnalysisRequest를 참조하는 Catch 정본 | B 담당이 작성 |
| 3 | CatchEvidence | CatchAsset를 참조하는 근거 정본 | B 담당이 작성 |
| 4 | CandidateRegistration | ResultApplicationRecord·CatchAsset를 참조하는 후보별 연결 | B 담당이 작성하고 E 담당과 검토 |

1과 2는 서로의 테이블을 참조하지 않아 준비를 병행할 수 있다. 적용 순서는 위와 같이 맞추고, 되돌리기는 4→3→2→1이다. #104의 기존 테이블은 #105 되돌리기의 삭제 대상이 아니다.

실제 연결은 #86 DB 기반과 #104 선행 테이블이 준비된 뒤 진행한다. E의 이번 범위는 #105 연결에 필요한 부분이며, 결과 수신·상태 조회 API 전체는 해당 E 기능 이슈에서 진행한다.

[E 제안·미확정] ResultApplicationRecord를 별도 PR로 먼저 반영하고 이후 B 등록 함수와 E 호출부·상태 처리를 연결하는 방식이다. 위 테이블의 생성 순서와 별개로, 실제 PR 구성·병합 순서·마이그레이션 반영 방법은 아직 맞춰야 한다.

## 6. #103 자료로 확인할 사례

| 사례 | 확인할 결과 |
|---|---|
| 적합 후보 1개 | title이 있는 PRIVATE Catch와 근거·등록 연결·E 반영 완료가 함께 저장됨. 확인 두 값과 불일치는 false |
| 같은 결과 재전달 | 기존 연결과 같은 catchId를 반환하고 Catch·근거가 늘지 않음 |
| 두 후보가 같은 작업 | 서로 다른 후보 연결 두 개가 같은 Catch 하나를 참조 |
| 다른 작업의 근거 일부 중첩 | 작업 동일성이 다르면 근거가 겹쳐도 별도 Catch로 저장 |
| 초안 또는 질문 생성 실패 | 근거·기여 등 조건을 충족하면 Catch 등록. 실패/미생성 상태와 null·빈 질문 등 계약 표현을 보존 |
| 후보 중 하나의 등록 조건 미충족 | 일부 후보만 저장·완료 처리하지 않고 이번 반영 전체 롤백. DB 저장 실패와 구분할 정보는 E와 정할 내부 오류 형식을 사용 |
| 저장 도중 또는 E 완료 기록 실패 | 이번 Catch·근거·등록 연결·완료 변경이 모두 롤백되고 이전 자료·수신 기록은 유지 |
| 커밋 후 응답 유실 | 다시 받아도 같은 Catch를 반환하고 기존 공개·본문을 보존 |
| 같은 결과의 동시 반영 | 유일성 충돌을 처리해 같은 Catch·연결로 수렴하고 중간 부분 저장을 완료로 노출하지 않음 |
| 정상 0건 / 부분 실패 / 전체 실패 | E가 원래 결과 의미를 보존. B는 제공 가능한 후보만 처리하며 0건에서 가짜 Catch를 만들지 않음 |
| 맥락 불일치·다른 payload·늦은 결과 | E에서 거부·격리. B에 전달되지 않고 기존 자료를 보존 |

현재는 사례 목록만 정리했다. 실제 PostgreSQL, 마이그레이션 되돌리기, 원자성·동시성 시험은 #86·#103·#104 결과를 사용해 구현 후 수행한다.

## 7. 합의한 내용과 남은 연결 질문

논리 입출력, 같은 트랜잭션에서 Catch 등록·E 상태 기록, 커밋 뒤 성공·열람 가능 노출, 네 테이블의 생성·되돌리기 순서와 §5 작성 분담은 E 담당의 동의를 받았다. 후보 하나라도 저장할 수 없으면 전체를 실패시키는 기준과 빈 내용 검사 유지는 팀장 결정에 따른다. 이 확인은 실제 DB 저장·롤백·중복 처리 검증을 대신하지 않는다.

1. **오류 구분과 지속 실패 복구:** §2의 `CatchRegistrationInputError`·reason을 E 연결에 사용할지와 실제 DB 저장 실패의 식별·전달 방법을 E와 정한다. 준비 함수 밖에서 발생한 오류를 모두 DB 실패로 처리하지 않는다. E는 이를 바탕으로 복구안을 정리하고 B의 추가 판단이 필요한 부분을 확인한다. 같은 결과의 반복 반영이 계속 실패하는 경우의 처리 방법은 미결로 유지한다.
2. **실제 연결 순서:** #86·#104의 물리 규약에 맞출 타입·잠금·마이그레이션 방식과 PR 구성·병합 순서를 정한다. E 수신 기록 테이블을 별도 PR로 먼저 반영하는 안은 아직 제안이며, 실제 저장 후 §6의 원자성·중복·실패 사례를 함께 검증한다.

## 변경 이력

- v0.5 (2026-09-28): 준비 함수의 입력 거부를 식별하는 내부 오류와 이유·고정 필드명을 추가했다. 일반 예외를 입력 거부로 감싸지 않고 원문을 노출하지 않는 검사를 보강했다. E의 오류 형식 수용·실제 DB 실패 구분·복구는 미결로 유지한다.

- v0.4 (2026-09-28): PR #143의 팀장 결정과 E 담당 답변을 반영했다. ERD 기준의 빈 내용 거부 이유, 전체 롤백 기준, 논리 입출력·작성 분담 동의를 기록하고, 오류 전달 형식·지속 실패 복구·PR 병합 순서는 미결로 분리했다. 준비 코드와 실제 DB 구현·검증 범위는 바꾸지 않았다.

## 근거

- [#105](https://github.com/JminAILab/CatchU/issues/105): 등록 함수, 네 테이블, 트랜잭션과 중복/실패 검증 범위.
- [PR #143 팀장 결정 — 2026-09-28](https://github.com/JminAILab/CatchU/pull/143#issuecomment-5865277945): ERD 기준의 빈 후보 거부, 전체 반영 실패, 지속 실패 복구의 협의 필요.
- [PR #143 E 담당 동의·후속 제안 — 2026-09-28](https://github.com/JminAILab/CatchU/pull/143#issuecomment-5865412468): 입출력·같은 트랜잭션·생성/되돌리기·작성 분담 동의, 오류 구분 요구와 별도 PR 선행 제안.
- [계약 요약 — B 등록·공개 및 E/F 반영 경계, OQ-B1](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md): 내부 호출과 단일 트랜잭션 기준.
- [API 기능 설계 — F3/F4, 동시성과 일관성](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md): 수신·반영 분리, 롤백과 커밋 뒤 응답 유실의 차이.
- [ERD — CatchAsset·CatchEvidence·ResultApplicationRecord·CandidateRegistration](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md): 속성·참조·유일성.
- [업무 규칙 BR2.5~BR2.8](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md): 수신 검사·등록 적합성·생성 상태의 분리.
- [worker 메시지 v1 — Result·Candidate](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml): 입력 후보의 정본. 새 메시지 계약을 만들지 않는다.
