# NC3 다시 볼 곳 사실과 작업 시각 — Unit 시험 안내

## 시험 틀

- **worker:** pytest(`uv run --locked pytest`). 지금 `worker/tests/`처럼 합성 커밋 기록·합성 GitHub 응답·합성 제공자를 쓴다. 새 설정·새 의존성은 없다.
- **api:** 지금 실행기 `node scripts/test-with-db.cjs`(`npm --prefix api test -- <파일>`). 시험 DB에 마이그레이션을 적용한 뒤 준 파일만 돌린다. 시험 DB `catchu-db-test`(127.0.0.1:5433, api README 「DB 테스트」의 값)가 있어야 한다. 새 설정은 없다.
- **web:** Node 내장 시험 실행기(`node --test`). 지금 `web/test/*.test.mjs`처럼 합성 응답과 서버 렌더링, 원본 tsx를 변환해 부르는 방식을 쓴다. 새 설정·새 의존성은 없다.

## 이 Unit의 시험 명령

저장소 맨 위에서 돌린다.

worker(수집 식별값·RevisitFacts·작업 시각·처리와 결과 판본):

```bash
(cd worker && uv run --locked pytest tests/test_revisit_facts.py tests/test_collection_flow.py tests/test_candidate_flow.py tests/test_live_processing.py tests/test_processing.py)
```

api(결과 계약·등록·마이그레이션·본인 목록·사본과 조각):

```bash
npm --prefix api test -- test/worker-messages.test.cjs test/analysis/receiver.test.cjs test/u7-worker-context.test.cjs test/catches/registration-batch.test.cjs test/catches/registration-postgres.test.cjs test/catches/revisit-facts-migration.test.cjs test/catches/owner-catch-http.test.cjs test/catches/owner-catch-response.test.cjs test/publications/publish-api.test.cjs test/published-index/chunker.test.cjs
```

api(worker 합성 결과와 api 계약 대조):

```bash
npm --prefix api run test:analysis-fixtures
```

web(「다시 볼 곳」 칸·응답 검사·상세 자리):

```bash
(cd web && node --test test/assets-revisit-facts.test.mjs test/assets-view.test.mjs test/assets-api.test.mjs)
```

Step 2(고치기 전 확인)에서는 새 시험 파일(`worker/tests/test_revisit_facts.py`, `api/test/catches/revisit-facts-migration.test.cjs`, `web/test/assets-revisit-facts.test.mjs`)을 뺀 명령을 돌린다.

## 실패 조건 (먼저 정하는 것)

시험 이름에 시나리오 번호(S1~S20)나 수락 기준 번호를 적는다. 아래는 통과하지 않으면 Unit이 끝나지 않는 조건이다.

- **다시 고친 곳:**
  - TheMe 꼴(앞 커밋이 넣은 줄과 글자가 같은 줄을 뒤 커밋이 지움)에 사실이 없다.
  - 앞·뒤 커밋이 뒤바뀐다.
  - 다른 후보·다른 계정 커밋으로 사실이 생긴다.
  - 잠금 파일·빌드 폴더·AI 하네스·지시 파일·비밀 경로에서 사실이 생긴다.
  - 되돌린 쌍이 다시 고침으로도 나온다.
  - 글자 없는 줄(`}` 등)로 사실이 생긴다.
- **옮긴 곳·확장자 바꿈:**
  - 여러 커밋에 걸친 같은 내용 식별값 옮김을 못 찾는다.
  - 식별값이 여럿인데 하나를 고른다.
  - 빈 파일 식별값으로 짝을 짓는다.
  - `util.js → util.ts`가 옮김으로 나온다.
  - 폴더와 확장자가 함께 바뀌었는데 사실이 둘 나온다.
- **되돌림:**
  - 다른 후보의 Y로 사실이 생긴다.
  - 짧은 식별값이나 「Reverts owner/repo#N」만으로 사실이 생긴다.
- **시험 파일:**
  - `out/test/a.js`나 `ButtonTest.tsx`로 사실이 생긴다.
  - `src/__tests__/a.test.ts`를 바꾼 작업에 사실이 없다.
  - 지운 시험 파일만 있는 작업에 사실이 생긴다(NFR8.4).
- **상한·순서:**
  - 31개 이상 담긴다.
  - 1,025자 경로의 사실이 담긴다.
  - 정렬이 종류·커밋 순서가 아니다.
  - 꺼진 규칙이 사실을 만든다.
- **판정 실패(NFR8.3·NFR4.3):**
  - 판정 예외나 기록 없는 식별값이 분석 전체를 실패시킨다.
  - 다른 후보 사실까지 빈다.
  - 로그가 없다.
  - 로그에 경로·예외 메시지·식별값이 실린다.
  - 판정 결과가 규격(전체 30개, 사실마다 경로·커밋 20개, 경로 1,024자, 종류별 경로·커밋 개수, 커밋이 그 후보 본인 커밋 안, 한 사실 안 겹침 없음)을 어겼는데, 그 후보 사실만 비고 로그 한 줄이 남는 대신 분석 전체가 실패하거나(WORKER_DEFECT) api가 결과 전체를 거부한다. 다른 후보 사실이나 결과 전송이 달라진다.
- **작업 시각:**
  - 합쳐진 후보의 커밋 시각이 빠진다.
  - 커밋 시각(committed)을 쓴다.
  - 결과 판본이 "4"가 아니다.
- **api 검사·저장:**
  - 판본 "3"·모르는 칸·종류별 개수 위반·소속 밖 커밋·시각 뒤바뀜 결과로 Catch가 생긴다.
  - 재분석이 기존 Catch의 사실·시각을 바꾼다.
  - DB 검사가 배열 아닌 값이나 시각 하나만 든 행을 받는다.
- **목록·커서:**
  - B·A·C 순서가 아니다.
  - 같은 시각 순서가 흔들린다.
  - 45개 세 쪽에서 빠짐·겹침이 있다.
  - 판본 1·2 커서나 꼴 틀린 `lastWorkAt`이 200이다.
  - 공개 목록 순서·커서가 바뀐다.
  - 응답에 작업 시각이 있다.
- **본인만 보기:** 사본·조각·공개 응답에 사실 경로·식별값·시각 글자가 나온다.
- **화면:**
  - 사실 없는 Catch에 제목이나 빈 칸이 있다.
  - 칸이 근거 아래·초안 위가 아니다.
  - MOCK·예시·이름 없음·이름 꼴 틀림에서 링크가 생긴다.
  - 링크 주소가 github.com 밖이거나 `rel`이 없다.
  - 숨은 「(새 탭)」이 없다.
  - 식별값 바로 뒤에 이/가·을/를이 붙는다.
  - 태그 꼴 경로가 HTML로 해석된다.
  - 모양 틀린 `revisitFacts` 응답이 받아들여진다.
- 시간은 어느 시험에서도 단정하지 않는다(NFR 설계 Q1).

## 시험 양

Standard 전략: 구성 요소마다 5~8개.

| 구성 요소 | 시험 파일 | 새로 더할 수 |
|---|---|---|
| Collection(식별값) | `worker/tests/test_collection_flow.py` | 약 3 |
| RevisitFacts | `worker/tests/test_revisit_facts.py`(새것) | 약 22 |
| CandidateGrouping(작업 시각) | `worker/tests/test_candidate_flow.py` | 약 3 |
| AnalysisProcessing(부르기·실패·판본) | `worker/tests/test_live_processing.py`, `test_processing.py` | 약 6 |
| 결과 계약·ResultReception | `api/test/worker-messages.test.cjs`, `api/test/analysis/receiver.test.cjs`, `api/test/u7-worker-context.test.cjs` | 약 7 |
| Catches 등록·저장 | `api/test/catches/registration-batch.test.cjs`, `registration-postgres.test.cjs`, `revisit-facts-migration.test.cjs`(새것) | 약 9 |
| Catches 읽기(정렬·커서·응답) | `api/test/catches/owner-catch-http.test.cjs`, `owner-catch-response.test.cjs` | 약 9 |
| 본인만 보기 | `api/test/publications/publish-api.test.cjs`, `api/test/published-index/chunker.test.cjs` | 약 2 |
| AssetsScreen | `web/test/assets-revisit-facts.test.mjs`(새것), `assets-view.test.mjs`, `assets-api.test.mjs` | 약 14 |

경계 시험(통합): api 등록·목록 시험은 실제 PostgreSQL에 HTTP나 결과 반영으로 부른다(회원 범위·DB 검사). worker 처리 시험은 합성 GitHub·합성 제공자로 수집부터 결과 조합까지 이어 본다. web은 합성 HTTP 응답으로 API 연결부를 본다.

## 커버리지 목표

- 프로젝트 전체 80% 줄 커버리지 기준(Testing Contract)은 Build and Test가 조립된 전체 시험에서 잰다. Unit 명령으로는 판정하지 않는다.
- 이 Unit의 새 worker 파일은 확인용으로 따로 본다. 판정용이 아니며, 다른 명령 뒤에 두지 않는다.

```bash
(cd worker && uv run --locked pytest tests/test_revisit_facts.py --cov=app/candidates --cov-report=term-missing)
```

- 측정 도구를 새로 들이거나 CI 설정을 바꾸지 않는다(팀 규칙).

## 대역과 합성 자료

- **worker:**
  - 커밋 기록(`CommitRecord`, `ChangedFile`)은 시험 안에서 합성으로 만든다.
  - TheMe 꼴 시험은 줄 글자 모양만 본뜬 합성 patch를 쓰고, 실제 저장소 주소나 내용을 넣지 않는다.
  - GitHub·AI는 지금 합성 대역을 쓰고 네트워크를 막는다.
- **api:**
  - 지금 등록·목록 시험의 합성 회원·분석 요청·저장소 등록 도우미와 `receiver-harness.cjs`를 쓴다.
  - 결과 메시지는 판본 "4" 합성 결과로 만든다.
- **web:** API는 지금 시험처럼 합성 `transport`·합성 응답으로 바꾼다. 외부 네트워크를 쓰지 않는다. 저장소 이름은 `o/r` 같은 합성 값이다.

## 시험 자료 관리

- worker·web 시험 자료는 각 시험 파일 안에 둔다. 합성 결과 세트는 `worker/fixtures/m1-synthetic/`에 둔다(Step 9).
- api 시험은 시험마다 새 회원으로 자료를 만들고, 지금 시험의 정리 방식을 따른다.
- 비밀값·실제 사용자 자료·토큰을 시험 자료나 출력에 넣지 않는다.
