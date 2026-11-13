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
확인한 상태·확인 출처·확인 시각이 모두 있어야 유효한 판단으로 인정한다.
조회 실패만 기록된 행이나 이 세 값 중 하나라도 없는 행(JSON `null` 포함)은 준비 완료로 보지 않는다.
이전의 유효한 관측과 판단이 남아 있다면, 최근 조회 실패 기록만으로 본인 열람 준비를 거부하거나 보호 상태를 바꾸지 않는다.
B가 기본 `NONE` 행을 만들지 않으며, 최초 판단은 [E 연결 조건](catch-registration-e-integration.md#보호-판단과-live-출처)대로 공급한다.

## 저장·중복·보존

1. [`prepareRegistrationBatch`](../src/catches/registration-batch.ts)로 모든 후보를 검사한다.
   한 후보라도 조건을 충족하지 못하면 조용히 빼지 않고 전체 호출을 거부한다.
   worker 메시지의 전달 형식보다 엄격하게 빈 필수 내용을 거부하는 이유는, Catch 저장에 적용되는 ERD의 필수 내용·근거 조건을 지켜야 하기 때문이다.
   제목은 [PR #262](https://github.com/JminAILab/CatchU/pull/262) 계약대로 필수 필드이며 `null` 또는 한 글자 이상의 문자열을 받는다. `null`은 그대로 저장하고 대체 제목을 만들지 않는다. 필드 누락·빈 문자열·다른 타입은 거부한다. 제목 유무로 생성 상태나 등록 적합성을 바꾸지 않는다.
2. 수신 기록과 요청·시도·소유자 맥락을 대조한다.
   E가 먼저 검증했다는 이유로 B 대조를 생략하지 않는다.
3. 같은 owner/workIdentity의 잠금을 작업 키 순으로 잡는다.
   제목이나 겹친 근거로 작업 키를 새로 만들지 않는다.
4. 신규 작업은 전달 순서상 첫 적합 후보의 내용을 저장한다.
   이후 같은 작업 후보는 그 Catch를 참조하며 후보 본문을 합치지 않는다.
   근거는 받은 배열 순서대로 `position`을 1부터 저장한다. 기존 Catch 참조·재전달은 근거와 위치를 덮어쓰지 않는다.
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

## 소속 기록 (CR2)

Catch 개편 CR2부터 결과(v3부터, 지금 v4)의 후보마다 본인 커밋 목록(`ownCommitShas`, 1~3,000개, 소문자 40자, 중복 없음)이 온다. 등록은 이 목록을 검사(필드 `ownCommitShas`)하고 다음처럼 쓴다.

- 위 4·6단계에서 Catch를 만들거나 기존 Catch를 찾고 보호 판단까지 확인한 뒤, 같은 트랜잭션에서 그 작업 키 후보들의 목록 합집합(앞 후보 목록 뒤에 새 SHA를 처음 나온 순서로)을 `commit_assignment`에 쓴다. 회원은 입력의 ownerId, 저장소는 수신 기록이 가리키는 분석 요청의 저장소 ID다.
- 1,000행씩 `insert().values([...]).orIgnore()`로 쓴다. 이미 있는 (회원, 저장소, SHA)는 같은 Catch든 다른 Catch든 건너뛰고 저장된 소속을 바꾸지 않는다(갱신 없음).
- 기존 Catch에 이을 때 더하는 쓰기는 소속 행뿐이다. 제목·작업 사실·근거·초안·작성자 설명·저장 시각은 쓰지 않는다.
- 7단계 재호출(저장된 등록 재응답)은 소속을 다시 쓰지 않는다.
- 소속 쓰기 DB 오류는 바꾸지 않고 올려 Catch·근거·후보 연결과 함께 롤백한다. 소속 행의 (catch_id, member_id)가 Catch의 (catch_id, owner_id)와 맞지 않으면 외래 키가 거부한다.
- 소속은 worker 맥락 조회가 `assignedCommitShas`로 돌려주고, worker는 재분석 때 그 커밋을 뺀다([worker 소속 커밋 빼기](../../worker/docs/commit-assignment.md)). 표 모양은 [DB 적용과 검사](catch-registration-database.md)에 있다.
- 새 Catch NC2부터 소속은 발행 사본의 본인 커밋 표지 근거(`evidence[].ownCommit`)로도 쓰인다. 발행이 고른 Catch의 소속을 읽어 근거 커밋 주소마다 참·거짓을 정한다([발행 사본 선택 칸](publications.md#사본-선택-칸-넷-새-catch-nc2-계약-c3)). 소속의 뜻이나 쓰는 규칙을 바꾸면 면접관 화면의 「이 작업의 본인 커밋」 표지도 바뀐다.
- worker가 근거 한계에 새 작업 전체 한계 문장을 더하면 `src/publications/work-limit-sentences.ts`의 상수 목록에도 더해야 면접관 화면의 「이 기록으로 알 수 없는 것」에 보인다.

## 다시 볼 곳 사실과 작업 시각 (새 Catch NC3)

새 Catch NC3부터 결과 v4의 후보마다 다시 볼 곳 사실(`revisitFacts`, 0~30개)과 첫·마지막 작업 시각(`firstWorkAt`·`lastWorkAt`)이 온다. 계약 검사(Ajv)가 모양을 먼저 보고(SCHEMA_INVALID), 등록 입력 검사(1단계 `prepareRegistrationBatch`)가 뜻을 더 본다.

- **등록 입력 검사:** 사실마다 종류별 경로·커밋 수(REWORKED_LINES 경로 1·커밋 2, MOVED_FILE·EXTENSION_CHANGED 경로 2·커밋 1~2, REVERTED 경로 0·커밋 2, TEST_FILES_PRESENT 경로 1~20·커밋 1~20), 경로 1~1,024자(코드 포인트), 식별값 소문자 16진수 40자, 같은 사실 안 경로·커밋 겹침 없음, 사실의 커밋이 그 후보 `ownCommitShas` 안인지 본다. 어기면 `INVALID_INPUT`(필드 `revisitFacts`)이다. 두 시각은 `Date`로 해석해 `firstWorkAt ≤ lastWorkAt`을 본다(오프셋·소수 초 글도 받음). 해석하지 못하면 `firstWorkAt`·`lastWorkAt`, 뒤바뀌면 `lastWorkAt` 필드의 `INVALID_INPUT`이다. 한 후보라도 어기면 그 결과의 Catch를 하나도 등록하지 않는다. 받은 값은 오류에 싣지 않는다.
- 종류별 개수 표는 worker `revisit.py`의 자기 결과 확인, web `catch-api.ts` 응답 검사와 같은 값이다. 바꾸면 세 곳을 함께 고친다.
- **새 Catch에만 한 번 쓴다:** 4단계에서 새 Catch를 만들 때 첫 후보의 사실과 두 시각을 `catch_asset.revisit_facts`(jsonb)·`first_work_at`·`last_work_at`(timestamptz)에 함께 쓴다. 6단계 기존 Catch 참조와 7단계 재호출은 새 칸을 쓰지 않는다(재분석 때 기존 Catch의 사실·시각 그대로). 등록 뒤 새 칸을 고치는 경로는 없다.
- **DB 검사:** `revisit_facts`는 jsonb 배열이고, 두 시각은 둘 다 NULL이거나 둘 다 있고 앞이 뒤보다 늦지 않다. 어기면 등록 트랜잭션 전체가 롤백된다. 마이그레이션 전 Catch는 빈 배열·NULL이다.
- 사실·시각은 본인 목록·상세 응답과 정렬에만 쓴다([본인 Catch 조회](catch-owner-read-preparation.md)). 발행 사본·공개 Catch 응답·Claude 연결 읽기는 이 칸을 읽지 않는다.

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
기존 Catch와 먼저 저장한 수신 기록(식별자·지문·시각)은 보존한다. 복구용 결과 본문은 저장하지 않는다.
롤백 후 E 실패 기록·요청 닫기는 [E 연결 조건](catch-registration-e-integration.md#실패-요청-닫기)에서 확인한다.
