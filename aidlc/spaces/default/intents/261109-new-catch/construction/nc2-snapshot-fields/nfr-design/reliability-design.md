# NC2 면접관 사본 칸과 표지 — 신뢰성 설계

입력:
- NFR 요구 `construction/nc2-snapshot-fields/nfr-requirements/reliability-requirements.md`(NFR7.1~NFR7.3·NFR8.1·NFR8.2)와 검토 R-03·R-04
- 기능 설계 `construction/nc2-snapshot-fields/functional-design/functional-spec.md`, `rules.md`
- 계약 `inception/contract-design/contract-summary.md` C3·C6
- 이 단계의 답 `nfr-design-questions.md`(Q1 A, Q2 A)

## 1. 옛 사본과 web 모양 검사 (NFR7.1·NFR7.2)

- web `isCatchSnapshot`(`publications-api.ts`)에 선택 칸 검사를 더한다. 칸이 `undefined`면 통과, 있으면 모양 검사:
  - `repositoryName`: 비어 있지 않은 글
  - `authorDescriptionEditedMonth`: `^[0-9]{4}-(0[1-9]|1[0-2])$`
  - `workLimits`: 비어 있지 않은 글의 배열(1개 이상)
  - `evidence[].ownCommit`: 참·거짓
- 받은 사람 `pickItem`(`recipient-api.ts`)은 새 칸을 있을 때만 옮긴다(구조 분해 뒤 `undefined`인 칸은 만들지 않는다).
- 사본 보기는 칸마다 따로 있는지 보고 그린다. `ownCommit`은 `=== true`일 때만 참으로 본다.
- 시험 고정 자료: 옛 사본(새 칸 없음), 새 사본(칸 넷), 모양 틀린 사본 셋.

## 2. 안전망 (NFR7.3)

- 발행 잠금 조회는 저장소 등록을 LEFT JOIN 하므로, 행이 없으면 `owner`·`name`이 null이다. 그때 그 Catch 사본에 `repositoryName`을 넣지 않고 발행을 이어 간다.
- 그 사실은 트랜잭션 안에서 값으로만 기억하고, 트랜잭션이 끝나 발행이 성공한 뒤 경고 한 줄을 남긴다(Q1 A, 관측 설계). 롤백되면 남기지 않는다.
- 시험 하나: DB 외래 키 때문에 실제로 만들 수 없는 경우라, 발행 서비스의 사본 만들기 함수(순수 함수)에 등록 이름이 null인 행을 넘겨 칸이 빠지는지, 서비스 시험에서 그 표시가 있을 때 경고 줄이 하나 남는지 본다.

## 3. 문장 대조 시험 (NFR8.2, C6)

- 상수 넷은 api 한 파일(예: `api/src/publications/work-limit-sentences.ts`, 이름은 코드 생성에서 다듬음)에 둔다.
- 시험은 새로 만든다(기존 api 시험에 `build.py`를 읽는 시험은 없다, 검토 R-04). `api/test/publications/` 아래 `.test.cjs` 하나가 `node:fs`로 `resolve(__dirname, '../../../worker/app/candidates/build.py')`를 읽는다. 경로 기준은 지금 `api/test/analysis/shared-fixtures.check.cjs`가 worker 고정 자료를 읽는 방식과 같다.
- 찾는 글자: 한계 문장 둘은 `"` + 상수 + `"`, 같은 작업 경고 앞부분 둘은 `f"` + 상수.
- 반례: 원본 글자에서 한 문장만 다른 글자로 바꾼 사본으로 같은 검사 함수를 돌리면 실패해야 한다.
- CI: `ci.yml`이 `worker/app/*` 변경에도 api 시험을 돌리므로 고치지 않는다.

## 4. 표지가 없는 경우 (검토 R-03, 한계)

- 소속 기록 마이그레이션(`1794054790720-CreateCommitAssignment`) 전에 등록된 Catch는 소속 기록이 없어 표지가 없다. 출시 직전 DB 초기화 뒤에는 생기지 않는다. 개발 서버에서 표지를 확인할 때는 새로 분석한 Catch를 쓴다.
- 이미 다른 Catch에 배정된 커밋: 등록(`writeAssignments`)은 이미 있는 (회원, 저장소, 식별값)을 건너뛰므로, 그 커밋은 먼저 배정된 Catch에만 속한다. 이 Catch의 근거에 그 커밋 주소가 있어도 `ownCommit`은 거짓이고 표지가 없다. 평소에는 worker가 이미 배정된 변경을 새 작업 단위에서 빼므로 드물다. 표지 이름이 「이 작업의 본인 커밋」이므로, 다른 Catch(다른 작업)에 속한 커밋에 표지를 붙이지 않는 것이 뜻에 맞다. 한계로 기능 설계 README 문단에 함께 적는다.

## 5. 트랜잭션과 배포

- 새 읽기는 모두 지금 발행 트랜잭션(`READ COMMITTED`) 안이다. 실패하면 지금처럼 전체가 롤백되고 사본이 반쯤 남지 않는다. 재시도는 두지 않는다(사람이 다시 누른다).
- 사본 칸은 선택 칸만 더하므로 api·web 배포 순서와 무관하다. 소속 기록 표는 이미 있어 마이그레이션이 없다.

## Sources

- `construction/nc2-snapshot-fields/nfr-requirements/reliability-requirements.md`, `reviews/review-01.md`(R-03, R-04)
- `construction/nc2-snapshot-fields/functional-design/rules.md`(BR1.1, BR1.4, BR1.6, BR2.1, BR2.2, BR3.4), `functional-spec.md`
- `inception/contract-design/contract-summary.md` C3·C6
- `nfr-design-questions.md` Q1 A, Q2 A
- 지금 코드: `api/src/publications/publish.service.ts`, `api/src/catches/registration-service.ts`(`writeAssignments`), `api/src/database/migrations/1794054790720-CreateCommitAssignment.ts`, `api/test/analysis/shared-fixtures.check.cjs`, `web/src/features/publications/publications-api.ts`, `web/src/features/recipient/recipient-api.ts`, `.github/workflows/ci.yml`
