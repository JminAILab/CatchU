# U8 PDF 자료 — 코드 요약 (Step 1~3까지)

## Sources

입력: [코드 생성 계획](code-generation-plan.md) Step 1~3·「첫 실행 범위」, [Unit 시험 지침](unit-test-instructions.md), [시험 시나리오](test-scenarios.md) D-1~D-14, [엔티티](../functional-design/entities.md), [규칙](../functional-design/rules.md) BR1.7·BR2.1·BR2.2·BR3.1·BR3.3·BR4.3·BR4.4·BR7.1·BR7.2, [신뢰성 설계](../nfr-design/reliability-design.md) §5, [계약 요약](../../../inception/contract-design/contract-summary.md) C-06·C-07, 기존 마이그레이션 `api/src/database/migrations/1793162230851-CreatePublicationTables.ts`·규약 시험 `api/test/db/conventions.test.cjs`, `api/docs/member-withdrawal-deletion.md`.

이 문서는 담당자 결정(2026-11-06)대로 **Step 1~3까지만** 실행한 상태다. Step 4(S3 드라이버) 이후는 담당자가 이어가라고 한 뒤 같은 계획으로 진행하며, 그때 이 문서를 이어 쓴다. 2026-11-07 담당자 검토(§7) 뒤 Step 1~3 파일만 로컬 커밋했고 push·PR은 하지 않았다.

## 1. 이번 실행 범위와 결과 한눈에

| 단계 | 한 일 | 결과 |
|---|---|---|
| Step 1 시나리오 | `test-scenarios.md`에 W1~W5 전체 시나리오·기대 결과·실패 조건 78행(DB 14·S3 7·업로드 12·수신 8·worker 10·발행 8·열람 7·web 9·삭제/탈퇴/S3 3). 행마다 AC·BR·NFR ID와 시험 파일, 「Step 3」 열로 이번 실행이 덮는 D-1~D-14 표시 | 완료 |
| Step 2 러너 확인 | api·web·worker 러너 명령 3개 실행(변경 전) | 모두 통과(아래 §4) |
| Step 3 DB 표·엔티티 | 마이그레이션 1개, 엔티티 3개, 탈퇴 삭제 표 3행, DB 시험 11개 + 기존 회원 연쇄 삭제 시험 확장 | 시험 전부 통과(아래 §4) |

## 2. 만든·고친 파일

새 파일(코드):

- `api/src/database/migrations/1793977402870-CreatePdfMaterialTables.ts` — `pdf_material`·`pdf_page_text`·`published_pdf_page` 세 표 CREATE, `ix_pdf_material_member_id` 인덱스, 외래 키 3개(모두 `ON DELETE CASCADE`). `npm run migration:generate`로 테스트 DB(마이그레이션 22개 적용 상태) 기준 생성했고 다른 표 변경은 들어 있지 않다. `down`의 `DROP INDEX "public"."ix_..."`만 기존 마이그레이션처럼 `DROP INDEX "ix_..."`로 고쳤다(격리 스키마에서 되돌리는 기존 통합 시험이 `public` 한정 이름으로는 실패하기 때문).
- `api/src/materials/pdf-material.entity.ts` — `PdfMaterial` 엔티티와 상수 `PDF_EXTRACTION_STATES`·`PDF_EXTRACTION_FAILURE_CODES`·`PDF_PAGE_LIMIT`(50). 회원 FK `deleteWithParent`, CHECK 7개(제목 1자 이상, 크기 > 0, 쪽 수 NULL 또는 1~50, 상태 IN, 사유 IN, (DONE) = (쪽 수 있음), (FAILED) = (사유 있음)), `member_id` 인덱스.
- `api/src/materials/pdf-page-text.entity.ts` — `PdfPageText` 엔티티. PDF FK CASCADE, UNIQUE (pdf_material_id, page_number), CHECK page_number >= 1, **CHECK `"readable" = ("text" <> '')`**.
- `api/src/publications/published-pdf-page.entity.ts` — `PublishedPdfPage` 엔티티. C-07 열 모양 그대로(published_pdf_page_id, published_item_id FK CASCADE, page_number >= 1, text, readable, UNIQUE (published_item_id, page_number)) + 같은 readable/text CHECK.

새 파일(시험·기록):

- `api/test/db/pdf-tables.test.cjs` — 시험 11개(§4).
- `aidlc/.../u8-pdf-materials/code-generation/test-scenarios.md` — Step 1 산출물.

고친 기존 파일:

- `api/docs/member-withdrawal-deletion.md` — 표에 3행 추가(`pdf_material`→회원, `pdf_page_text`→PDF 자료, `published_pdf_page`→발행 항목. 마이그레이션 이름과 "원본 PDF와 외래 키 없음" 설명 포함).
- `api/test/db/member-cascade-delete.test.cjs` — `MEMBER_ROWS`에 새 표 3개의 회원 귀속 조건 추가, `memberWithAllData`에 DONE PDF 1벌·쪽 글 1행·발행 PDF 항목(position 2, `pdf_copy_key`)·쪽 사본 1행 추가. 판정 방식(세 표 모두 0행·남는 회원 행 수 일치·외래 키 전수 조사)은 그대로.
- `api/test/integration/result-application-b.test.cjs` — **계획의 「기존 파일 변경」 목록에 없던 변경**(§6 계획 이탈).
- `code-generation-plan.md` — 1.1·2.1·2.2·3.1·3.2·3.3·3.4·3.5 체크.

바꾸지 않은 것: `materials.module.ts`·`app.module.ts`·`database.config.ts`(엔티티는 `**/*.entity.{ts,js}` 글롭으로 자동 탐색되고, 기존 `text_material`도 `forFeature` 없이 DataSource로 쓰므로 Step 3에는 등록 변경이 없다), 의존성(`package.json`·`pyproject.toml` 변경 없음), Step 4 이후가 건드릴 파일 전부.

## 3. 구현 결정

| # | 결정 | 근거 |
|---|---|---|
| D1 | readable/text 제약은 두 표 모두 `CHECK ("readable" = ("text" <> ''))` 양방향 | 계획 3.1(담당자 결정 2026-11-06). Step 6 수신 검증(BR3.3)·worker 판정(BR3.1)과 같은 규칙. 사본은 원본에서 복사되므로 두 표 규칙이 같아야 발행이 실패하지 않는다 |
| D2 | `extraction_failure_code`는 nullable varchar + `inValues` CHECK | PostgreSQL CHECK는 NULL을 통과시키므로 "값이 있을 때만 정한 코드"가 된다. 규약(enum은 varchar + inValues)과 제약 이름 규칙 그대로. 시험이 NULL 통과와 정의 밖 값 거부를 모두 확인 |
| D3 | 회원당 20벌·파일 20 MB·제목 100자 상한은 DB 제약으로 두지 않음 | entities.md 결정(API 검증, Step 5). DB는 제목 1자 이상·크기 양수·쪽 수 1~50만 막는다 |
| D4 | `published_pdf_page`는 원본 `pdf_material`과 외래 키 없음 | C-07·BR4.4: 원본을 지워도 사본은 발행본 수명을 따른다. D-4 시험으로 확인 |
| D5 | `down`의 인덱스 DROP을 스키마 한정 없이 씀 | 기존 마이그레이션 스타일·격리 스키마 되돌리기 시험(`result-application-b`)과 맞춤 |

## 4. 시험 실행 결과(그대로)

테스트 DB는 README 「DB 테스트」의 컨테이너 `catchu-db-test`(127.0.0.1:5433/catchu_test). 아래 명령은 모두 `TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=5433 TEST_DB_NAME=catchu_test`를 명시하고 tail 없이 전체 출력을 확인했다.

Step 2.1 러너 확인(변경 전, 개발자 실행):

| 명령 | 결과 |
|---|---|
| `cd api && npm test -- test/db/publication-tables.test.cjs` | 마이그레이션 새로 적용 22개, 5 pass / 0 fail |
| `cd web && node --test test/api-client.test.mjs` | 21 pass / 0 fail |
| `cd worker && uv run pytest tests/test_health.py` | 1 passed, 경고 1(starlette DeprecationWarning, 기존) |
| `cd worker && uv sync --locked`(담당자 요청으로 추가 실행) | 종료 코드 0, 잠금 파일 그대로 52개 설치. `boto3`·`pypdf`는 아직 없음(Step 7에서 추가) |

Step 2.2: `cd api && npm test -- test/db/pdf-tables.test.cjs test/db/member-cascade-delete.test.cjs`는 새 파일이 없을 때 **`node --test`가 없는 파일을 오류 없이 조용히 건너뛰고** 있는 파일만 돌렸다(4 pass). 파일이 없으면 "시험 없음"이 아니라 "실행되지 않음"으로 보이므로, Unit 명령 결과는 파일 존재와 함께 읽어야 한다.

변경 전 기준선(`member-cascade-delete`·`conventions`·`timestamptz`): 7 pass / 0 fail.

Step 3.4(변경 뒤):

| 묶음 | 명령 | 결과 |
|---|---|---|
| 이번 범위 | `cd api && npm test -- test/db/pdf-tables.test.cjs test/db/member-cascade-delete.test.cjs` | 빌드 성공, 마이그레이션 새로 적용 1개(첫 실행) → **15 pass / 0 fail**(pdf-tables 11 + member-cascade-delete 4). 담당자 요청으로 다시 실행: 15 pass / 0 fail |
| 표 규약 회귀 | `cd api && npm test -- test/db/conventions.test.cjs test/db/timestamptz.test.cjs test/db/publication-tables.test.cjs` | **8 pass / 0 fail** |
| 고친 통합 시험 | `cd api && npm test -- test/integration/result-application-b.test.cjs` | **19 pass / 0 fail**(마이그레이션 전체 적용·역순 되돌리기 포함). `pg` DeprecationWarning 1건은 기존 출력 |
| 정적 검사 | `cd api && npm run lint`, `cd api && npm run typecheck` | 둘 다 통과(출력 없음) |
| U3 영향 확인(2026-11-07 담당자 검토 때 한정 실행) | `cd api && npm test -- test/published-index/chunker.test.cjs test/published-index/published-index-writer.test.cjs` | **18 pass / 0 fail**. 범위는 §5 참고 |

`pdf-tables.test.cjs`의 11개(시나리오 D-1~D-14 대응):

1. 제목 1자 이상·크기 양수·정한 상태·정한 실패 사유만 받는다(D-12 일부)
2. DONE은 쪽 수, FAILED는 실패 사유와 함께 있거나 함께 없다(D-12)
3. DONE PDF의 쪽 수는 1~50(D-12)
4. `pdf_page_text` readable·글 유무 양방향 거부 + 정상 2건 + 글 무가공 확인(D-7·D-8·D-11)
5. `published_pdf_page` 같은 4건(D-9·D-10·D-11)
6. 같은 PDF 안 쪽 번호 유일·1 이상(D-5·D-13)
7. 같은 발행 항목 안 쪽 사본 번호 유일·1 이상(D-6·D-13)
8. 회원 삭제 → PDF·쪽 글 연쇄, 다른 회원 유지(D-1)
9. PDF 삭제 → 쪽 글만 연쇄, 발행 사본 유지(D-2·D-4)
10. 발행본 삭제 → 쪽 사본 연쇄, 원본·다른 발행본 사본 유지(D-3)
11. 외래 키 3개 모두 CASCADE + `published_pdf_page` 열 모양 C-07 일치(D-14)

실행하지 않은 것: 전체 `npm test`와 커버리지 80% 판정(계획대로 Build and Test 몫. 이번 범위 코드는 엔티티·마이그레이션만이라 Unit 한정 커버리지 측정 대상 폴더가 아직 없다).

## 5. 계약 변경안(별도 PR로 넘김)

- **C-07 readable/text 제약 강화**: `published_pdf_page`에 `CHECK (readable = (text <> ''))`를 더했다. 열 모양(열 이름·자료형·NOT NULL·UNIQUE·FK)은 C-07 그대로다. 규칙은 두 방향으로 나눠 읽는다.
  - 기존 계약 문구: "읽을 수 없는 쪽은 빈 문자열" — readable=false이면 text=''. 새 CHECK가 이 방향을 DB에서 강제한다(readable=false·text 있음 거부).
  - 이번에 추가한 규칙: "읽을 수 있는 쪽은 빈 문자열 불가" — readable=true이면 text<>''. C-07 원문에는 없던 규칙이며, 원문이 막지 않던 입력(readable=true·text='')을 DB가 거부하므로 계약 허용 입력을 좁히는 제약 강화다. 열 모양이 같다는 이유로 호환으로 단정하지 않는다.
  - 이 표를 쓰는 쪽은 U8의 발행 복사(`pdf_page_text`에서 복사, 같은 CHECK)만이고 U3·U4·U5는 읽기만 한다. U3 담당에게는 새 제약의 호환성 검토를 요청하고, 계약 문서 본문 반영은 별도 계약 수정 PR로 낸다(시점은 §7).
  - 2026-11-07 담당자 검토에서 확인한 범위: (1) 코드·자료 대조 — U3 메모리 fixture(`api/test/published-index/chunker.test.cjs`의 PDF 쪽: readable=true·글 있음 2건, readable=false·'' 1건)는 새 규칙에 맞고 readable=true·text='' 사례는 없다. U3 조각 나누기 코드는 `readable`만 거르고 빈 글은 조각을 만들지 않는다. (2) 실행한 시험 — U3 chunker·published-index-writer 18개 통과(§4). (3) 미실행 — U3 DB 시험(`api/test/published-index/support.cjs`)은 `published_pdf_page`에 행을 넣지 않으므로, 새 CHECK를 U3 DB 시험이 실제로 거친 적은 없다. U3가 앞으로 DB 시험에 PDF 쪽 자료를 넣으면 이 규칙을 따라야 한다.
- C-16·C-12 더하는 변경은 Step 6·9에서 생기며 그때 적는다.

## 6. 계획 이탈

- `api/test/integration/result-application-b.test.cjs` 수정(계획 목록에 없던 기존 파일). 이 시험은 마이그레이션 이름 전체 목록과 표 개수(31)를 고정값으로 비교하고 역순 되돌리기를 확인하므로, 새 마이그레이션이 들어가면 그대로는 실패한다(U6의 `CreateMcpTables`도 같은 자리를 고쳤다). 변경은 목록에 `CreatePdfMaterialTables1793977402870` 추가, 표 수 31→34, U6 되돌리기 앞에 U8 되돌리기 1단계(34→31, 세 표 없음 확인) 추가로 최소이며 판정은 약화하지 않았다. 변경 뒤 19 pass로 확인했다. 되돌리기 단계는 표 수(31)와 세 표의 부재(`to_regclass`)를 확인하며 남은 31개 표의 이름은 그 자리에서 열거하지 않는다(U3·U5·U6 되돌리기 단계와 같은 방식. 뒤 단계의 개수·이름 단언과 마지막 `['migrations']` 단언이 간접 확인). 담당자가 2026-11-07 수용했다.

## 7. 미검증 항목과 담당자 검토 항목

미검증(Step 4 이후 또는 Build and Test 몫):

- 실제 S3 복사·삭제 확인(버킷·역할 #389 준비 전, OQ-U8-2). Step 4는 가짜 클라이언트로만 시험한다.
- 발행 경로 연동(Step 8), 추출 수신·worker(Step 6·7), 받은 사람·작성자 열람(Step 9), web(Step 10): 미착수, 파일 미변경.
- 전체 `npm test`·커버리지 80%: Build and Test에서 판정.

담당자 검토 항목(Step 4 전)과 2026-11-07 결과:

1. `result-application-b.test.cjs` 수정 수용 여부(§6) — 수용.
2. `published_pdf_page` CHECK 추가(C-07 readable/text 제약 강화, §5)를 U3 담당에게 알리는 시점과 계약 PR 시점 — 첫 제출 PR 본문에 U3 담당의 호환성 검토 요청을 넣는다. 계약 문서 PR 시점은 미정.
3. Step 4 이후 진행 지시 — 미정(첫 제출 PR 초안까지만).

## 8. 환경 준비(git에 들어가지 않음)

- 이 작업 사본에는 `api/.env`·`node_modules`가 없었다. `api`·`web`에 `npm ci`(잠금 파일 그대로, 새 의존성 없음), `worker`에 `uv sync --locked`(성공, 52개)를 실행했다.
- 테스트 DB 컨테이너 `catchu-db-test`(127.0.0.1:5433)를 README 명령 그대로 새로 띄웠다. 기존 `catchu-db-test-u4`(5443, 정지 상태)는 건드리지 않았다.
- 비밀값·사용자 자료는 쓰지 않았다(시험 자료는 전부 합성).
