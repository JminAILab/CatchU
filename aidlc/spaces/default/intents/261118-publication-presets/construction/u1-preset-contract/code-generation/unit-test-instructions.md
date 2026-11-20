# Unit Test Instructions — u1-preset-contract

근거: `code-generation-plan.md`(Testing Contract, Step 3·Step 11), 기능 설계 `functional-design/rules.md`, NFR 요구 `nfr-requirements/`.

## 실행기와 준비

- 실행기: 지금 api 실행기 `api/scripts/test-with-db.cjs`(node `--test`). 새 도구를 들이지 않는다.
- DB: pgvector가 있는 로컬 시험 DB(포트 5433). `api/.env`의 시험 DB 5435에는 pgvector가 없으므로 명령에 `TEST_DB_PORT=5433`을 붙인다. 실행기가 마이그레이션을 먼저 적용한다.
- 실행기는 인자로 준 파일만 첫째 DB에서 차례로 돈다.

## 이 단위 명령

새 시험(이 단위가 만드는 파일):

```bash
TEST_DB_PORT=5433 npm --prefix api test -- test/publishable-source/eligibility.test.cjs test/presets/preset-input.test.cjs test/presets/presets-api.test.cjs test/publications/publish-presets.test.cjs test/publications/first-copy.test.cjs test/integration/preset-publish-chain.test.cjs
```

이 단위가 고치는 기존 시험:

```bash
TEST_DB_PORT=5433 npm --prefix api test -- test/publications/publish-api.test.cjs test/publications/publish-pdf.test.cjs test/publications/publication-access-db.test.cjs test/publications/in-memory-publication-access.test.cjs test/publications/recipient-api.test.cjs test/publications/publications-manage-api.test.cjs test/rag-answer/summary-sources.test.cjs test/rag-answer/qna-sources.test.cjs test/published-index/chunker.test.cjs test/published-index/published-index-writer.test.cjs test/claude-mcp/mcp-shared-publication.test.cjs test/claude-mcp/mcp-shared-reader.test.cjs test/claude-mcp/mcp-shared-text.test.cjs test/db/member-cascade-delete.test.cjs test/db/publication-tables.test.cjs test/errors.test.cjs
```

JD 요약 시험 가운데 사본 객체를 만드는 파일은 Step 11에서 고칠 때 위 둘째 명령에 파일 이름으로 더한다(`api/test/jd/` 아래).

Step 4 직후의 중간 확인(판정 규칙을 옮긴 직후, 아직 P-2로 바꾸기 전):

```bash
TEST_DB_PORT=5433 npm --prefix api test -- test/publications/publish-api.test.cjs test/publications/publish-pdf.test.cjs
```

## 기대 커버리지

- 범위(mvp)의 80% 줄 커버리지는 Build and Test가 전체 시험으로 잰다. 위 단위 명령은 커버리지 문턱을 판정하지 않는다. 문턱 설정을 바꾸지 않는다.
- 이 단위 폴더만 보려면 `TEST_COVERAGE_INCLUDE='dist/presets/**'`와 `npm --prefix api run test:coverage -- <파일들>`을 따로 돌린다(참고용).

## 시나리오(Step 3에서 시험 코드보다 먼저 확정)

| 묶음 | 시나리오 | 기대 결과 | 실패 조건 |
|---|---|---|---|
| 저장 | 이름 앞뒤 공백, 1자, 50자 | 다듬어 저장 | 0자·51자는 400 `name` |
| 저장 | 50개째 만들기 | 201 | 51개째 409 `PRESET_LIMIT_REACHED` |
| 저장 | 항목 0·20개 | 저장 | 21개·중복은 400 `items` |
| 저장 | 60,000자 경계 | 60,000자 저장 | 60,001자 400 `maxTotalLength` |
| 저장 | 남의 Catch·텍스트 자료·PDF | — | 404, 아무것도 안 바뀜 |
| 저장 | 고치기 중 검사 실패 | 이름·항목 그대로 | — |
| 권한 | 남의 프리셋 GET·PUT·DELETE | — | 404, 그 프리셋 그대로 |
| 목록 | 50개 | 한 응답에 50줄 | — |
| 목록 | 프리셋 1개와 50개(항목 20개씩) | 조회 수 같음 | 다르면 실패 |
| 목록·상세 | 숨긴 Catch·보호·추출 미완료 | 이유 PRIVATE·SOURCE_RESTRICTED·EXTRACTION_INCOMPLETE | — |
| 목록 | 원본 글이 길어짐 | overLimit true | — |
| 목록 | 보호 관측 없는 Catch | — | 요청 전체 500 |
| 세기 | 1·50개, 제목 없는 Catch | ItemMeasure, `UNTITLED_CATCH_TITLE` | 51개·중복 400, 남의 자료 404 |
| 발행 | presetIds 0·6개·중복·옛 items | — | 400 |
| 발행 | 남의 프리셋 | — | 404, 발행본·PDF 사본 없음 |
| 발행 | 빈 프리셋 | — | 400 `presetIds[i]` `emptyPreset` |
| 발행 | P1(2개)·P2(3개) | position 1~5, presetOrdinal 1·2, presetName 복사 | — |
| 발행 | 같은 Catch·같은 PDF가 두 프리셋 | 사본 둘, 상한은 두 번 셈 | 경계 넘으면 400 |
| 발행 | 미확인·보호·비공개·추출 미완료 | — | 409·400, details.blockedSources만(catchIds 없음) |
| 발행 | 비공개 Catch | 공개로 바뀌지 않음 | — |
| 앞선 사본 | 겹친 사본 | 조각·요약 근거·머리글·받은 링크 읽기에 앞선 것만 | — |
| 앞선 사본 | 같은 Catch가 두 프리셋(요약, `summary-sources.test.cjs`) | 그 근거가 요약 근거에 한 번만 | 두 번 쓰이면 실패 |
| 앞선 사본 | 같은 Catch가 두 프리셋(질의응답, `qna-sources.test.cjs`) | 근거 한 번, 머리글 표 글자가 건너뛰지 않고 이어짐, 둘째 줄의 같은 작업 수에 겹친 사본 안 셈 | 표 글자가 비거나 수가 늘면 실패 |
| 앞선 사본 | 쪽 경계 바로 뒤가 겹친 사본(받은 링크 읽기, `mcp-shared-text.test.cjs`) | 다음 쪽이 그다음 앞선 사본부터 이어짐 | 겹친 사본이 나오거나 항목이 빠지면 실패 |
| 앞선 사본 | 받은 사람·작성자 응답 | isFirstCopy·source_id 없음 | — |
| 마이그레이션 | up·down, 변경 전 발행본 | 행 지워짐, 옛 링크 404 | — |
| 삭제 | 탈퇴 | 프리셋 지워짐, 탈퇴 성공 | — |
| 삭제 | 텍스트 자료·PDF 지우기 | 그 항목만 빠짐, 발행본 사본 그대로 | — |

## 모의·시험 자료

- DB 시험은 지금 `api/test/publications/support.cjs`·`api/test/db/` 도우미처럼 시험 DB에 회원·Catch·자료를 직접 만든다. 실제 회원 자료를 쓰지 않는다.
- 외부 호출(임베딩·AI)은 지금 시험처럼 합성 제공자와 기록용 가짜를 쓴다.
- 조회 수 세기는 TypeORM 질의 기록(로거)이나 `manager.query`를 감싼 시험용 셈으로 한다.
