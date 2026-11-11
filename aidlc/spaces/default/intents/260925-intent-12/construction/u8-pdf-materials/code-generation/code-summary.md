# U8 PDF 자료 — 코드 요약 (Step 1~6 계획 항목 체크, Step 7·8 구현·시험까지 — 실제 S3 확인 대기·검토 전)

## Sources

입력: [코드 생성 계획](code-generation-plan.md) Step 1~3·「첫 실행 범위」, [Unit 시험 지침](unit-test-instructions.md), [시험 시나리오](test-scenarios.md) D-1~D-14, [엔티티](../functional-design/entities.md), [규칙](../functional-design/rules.md) BR1.7·BR2.1·BR2.2·BR3.1·BR3.3·BR4.3·BR4.4·BR7.1·BR7.2, [신뢰성 설계](../nfr-design/reliability-design.md) §5, [계약 요약](../../../inception/contract-design/contract-summary.md) C-06·C-07, 기존 마이그레이션 `api/src/database/migrations/1793162230851-CreatePublicationTables.ts`·규약 시험 `api/test/db/conventions.test.cjs`, `api/docs/member-withdrawal-deletion.md`.

§1~§8은 담당자 결정(2026-11-06)대로 **Step 1~3까지** 실행한 기록이다. 2026-11-07 담당자 검토(§7) 뒤 Step 1~3 파일만 로컬 커밋했고 push·PR은 하지 않았다(그 뒤 PR #486으로 통합 브랜치에 합쳐짐). **Step 4(S3 드라이버)는 2026-11-09 담당자 지시로 이어 실행했고 §9에, Step 5(PDF 자료 API)는 같은 날 담당자 승인 뒤 실행해 §10에, Step 6(추출 결과 수신)은 같은 날 이어 실행해 §11에 적었다.** Step 7(worker 추출 소비자)은 2026-11-09~10에 구현하고 합성 시험(합성 PDF·가짜 큐·가짜 S3·실제 자식 프로세스)까지 실행해 §12에 적었다. 그 과정의 쟁점 D25(쪽 단위 추출 예외)는 2026-11-10 담당자 결정(안 B)으로 해결했고, R-MEM(S3 본문 읽기 중 메모리 부족 분류)도 같은 날 담당자 지시로 고쳤다(합성 시험까지). 팀장 결정 2건은 2026-11-10 [#420 결정 댓글](https://github.com/JminAILab/CatchU/issues/420#issuecomment-6759834176)로 확정되어 Step 7 범위(PDF 하나의 글 합계 60,000자·`TEXT_LIMIT_EXCEEDED`·api 수신 검사·DB 제약·오류별 확정)를 반영하고 Windows·격리 Linux·실제 api↔worker↔DB 연결로 확인했다(§12.8). **Step 7에 남은 것은 실제 S3(개발 서버 접근 권한·범위 확인 뒤)와 담당자 검토·계획 체크다.** 결정 중 발행본 전체 글에 PDF 포함·발행 거부 문구·web 상수 주석은 Step 8.2, 실패 사유 문구는 Step 10에서 반영한다(계획 보완 항목). 계획 7.1~7.3은 체크하지 않았다. Step 8(발행의 PDF 부분, 8.1~8.3과 전체 글에 PDF 포함)은 2026-11-10 담당자 허용 뒤 구현·시험해 §13에 적었고 계획 체크는 하지 않았다. 실제 S3는 **버킷 준비, 드라이버 배포 후 확인 대기**이며 조건 대조와 배포 후 확인 항목은 §14에 있다. Step 9 이후는 미착수다.

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
  - 정정 연결(2026-11-07): 승인된 [코드 생성 계획](code-generation-plan.md) Step 3.1과 시나리오 초판은 이 변경을 "C-07 더하는 변경"이라고 적었다. 승인본은 소급 수정하지 않고 이 절이 후속 정정 기록이다. 그 표현이 가리키는 변경은 코딩 운영의 "더하는 변경"(기존 호출·가짜 구현·DB 행이 그대로 유효)으로 단정할 수 없는, **허용 입력을 좁히는 제약 강화**다. 그래서 제공 Unit이 계약 문서만 고치고 알리는 절차가 아니라, 병합 전에 U3 호환성 검토와 계약 변경 절차(계약 수정 PR)를 맞춘다.
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

## 9. Step 4 — FileStorage S3 드라이버 (2026-11-09 실행)

입력: [코드 생성 계획](code-generation-plan.md) Step 4(4.1~4.3, 담당자가 2026-11-09 더한 4.4), [시험 시나리오](test-scenarios.md) §2 S-1~S-7, [규칙](../functional-design/rules.md) BR7.3·BR7.4·BR6.2, [기술 선택](../nfr-requirements/tech-stack-decisions.md) 「파일 저장(api)」, [보안 설계](../nfr-design/security-design.md)(presigned URL 없음·역할 분리), [신뢰성 설계](../nfr-design/reliability-design.md) §5, [계약 요약](../../../inception/contract-design/contract-summary.md) C-05, 기존 `api/src/file-storage/*`·`api/test/u2/file-storage.test.cjs`. 2026-11-09 담당자 지시: Step 4만 진행, 계획 4.4(기존 U2 시험·문서 최소 수정) 추가, 커밋·push·PR 없이 검토 대기.

### 9.1 범위와 결과 한눈에

| 단계 | 한 일 | 결과 |
|---|---|---|
| 4.1 S3 드라이버 | `S3FileStorage` 새 파일(5개 메서드, 가짜 클라이언트 주입 가능) | 완료 |
| 4.2 설정·모듈·의존성 | `readFileStorageConfig` `local`/`s3` 판별 합집합, `createFileStorage` 드라이버 선택, `@aws-sdk/client-s3@3.1164.0` 고정 설치 | 완료 |
| 4.3 시험 | `s3-file-storage.test.cjs` 8개 + 공용 계약 `storage-contract.cjs` 6개×2 드라이버 | 20개 모두 통과(§9.4). 4.5 보완 뒤 21개 |
| 4.4 기존 시험·문서 최소 수정 | U2 "모르는 드라이버" 시험에서 `s3` 제외, `api/docs/file-storage.md`·`api/docs/environment.md` 갱신 | 완료. U2 시험 8개 중 S22 1개는 Windows에서 심볼릭 링크 생성 단계 EPERM(§9.4 (나)) |
| 4.5 Step 4 보완(담당자 지시 2026-11-09) | 없는 대상 판정을 `NoSuchKey`로 좁힘 + 회귀 시험, U2 설정 시험 `setEnv`에 `FILE_STORAGE_S3_BUCKET` 포함, 방어 3건·혼합 설정 거부를 계획·문서·시험에 일치, S22 재검토 | 완료(§9.7). tests 29 / pass 28 / fail 1(S22, 환경) |

### 9.2 만든·고친 파일

새 파일(코드·시험):

- `api/src/file-storage/s3-file-storage.ts` — `S3FileStorage implements FileStorage`. 생성자 `(bucket, client?: Pick<S3Client,'send'>)`, 기본 `new S3Client({})`(자격·지역·재시도 모두 SDK 기본 체인, 코드에 상수·자격 없음). 모든 메서드가 `parseStorageKey` 통과 마디를 `join('/')`한 값만 Key/Prefix로 쓴다. put=PutObject, get=GetObject(Body가 `Readable`이 아니면 IO_FAILED), copy=CopyObject(`CopySource`=`<bucket>/<fromKey>`), delete=DeleteObject(없음→성공), deletePrefix=ListObjectsV2 반복(ContinuationToken)+DeleteObjects 1,000개 단위(Quiet). `NoSuchKey`·HTTP 404는 get·copy에서만 `FileNotFound`, 그 밖은 `StorageUnavailable('IO_FAILED', { cause })`. 오류 문구에 버킷·키 없음, 직접 로그 없음.
- `api/test/file-storage/storage-contract.cjs` — `registerStorageContractTests(name, makeStorage)`. 계약 시험 6개(put→get·덮어쓰기, copy·사본 독립, 없는 키 get/copy→FileNotFound, 없는 키 delete 성공, 접두어 삭제 범위, 계약 밖 키·접두어→InvalidStorageKey·저장소 무변화). 시험 파일이 아니라 지원 파일이다(`.test.cjs` 아님).
- `api/test/file-storage/s3-file-storage.test.cjs` — 요청 기록 가짜(`RecordingS3`)로 S-1~S-6 + 추가 1개 = 8개, 메모리 맵 가짜(`MemoryS3`)와 `mkdtemp` 로컬로 계약 시험 각 6개(S-7). 실제 AWS 접속·실제 자격·실제 버킷 이름 없음(시험용 이름 `catchu-test-bucket`).

고친 기존 파일:

- `api/src/file-storage/file-storage.config.ts` — 반환형 `{driver:'local';root} | {driver:'s3';bucket}`. 셋(`FILE_STORAGE_DRIVER`·`FILE_STORAGE_LOCAL_ROOT`·`FILE_STORAGE_S3_BUCKET`) 모두 없거나 빈 문자열이면 `null`; 드라이버 없이 나머지만 있으면 기동 실패; `local`은 LOCAL_ROOT 필수(기존 검사 그대로)·S3_BUCKET은 비어야 함; `s3`는 S3_BUCKET 필수·LOCAL_ROOT는 비어야 함; 버킷 이름 모양 `^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$`; 그 밖 드라이버 값은 `'FILE_STORAGE_DRIVER는 local 또는 s3여야 합니다.'`. 기존 U2 시험이 단언하는 `/둘 다/` 문구 유지. 오류에 경로·버킷 값 없음.
- `api/src/file-storage/file-storage.module.ts` — `config.driver === 's3' ? new S3FileStorage(config.bucket) : new LocalFileStorage(config.root)`.
- `api/src/file-storage/file-storage.ts` — 머리 주석 1줄("S3 구현은 U8이 더한다" → "S3 구현은 s3-file-storage.ts(U8)다"). 코드 변경 없음.
- `api/package.json`·`api/package-lock.json` — `"@aws-sdk/client-s3": "3.1164.0"`(2026-11-06 게시 최신, 담당자 지정) 1줄 추가, lock 396줄 추가·삭제 0(`npm install --save-exact`). 다른 패키지 변경 없음.
- `api/test/u2/file-storage.test.cjs` — 마지막 시험만: 모르는 드라이버 목록 `['s3','LOCAL','disk']`→`['LOCAL','S3','disk']`, 정규식 `/local이어야/`→`/local 또는 s3여야/`, 모듈 조립 거부는 `disk`로 유지. 판정 약화 없음, 그 밖 변경 없음.
- `api/docs/file-storage.md` — 제목·머리글(U2·U8), 기준 문서(U8 BR7.3·기술 선택), 설정 표(셋 다 없음/혼합/`s3` 행), 「S3 드라이버」 절 신설(호출 대응표·오류 규칙·SDK 기본 재시도·자격 기본 체인·#389 뒤 수동 확인), 키 검사의 OUTSIDE_ROOT를 로컬 전용으로 표기, 시험 절에 새 파일 2개 추가.
- `api/docs/environment.md` — `FILE_STORAGE_DRIVER` 행을 `local`·`s3` 현재 동작으로 고치고 `FILE_STORAGE_S3_BUCKET` 행 추가.
- `code-generation-plan.md` — 4.4 항목 추가(담당자 지시, 아래 §9.5), 4.1·4.2·4.3·4.4 체크.

바꾸지 않은 것: `local-file-storage.ts`, `api/.env.example`(Step 11.1 몫), `unit-test-instructions.md`(Step 4 명령은 이미 들어 있음), `test-scenarios.md`, Step 5 이후가 건드릴 파일 전부, 담당자의 기존 미커밋 기록(`aidlc-state.md`·감사 기록 2개).

### 9.3 구현 결정

| # | 결정 | 근거 |
|---|---|---|
| D6 | 404 판정은 `name === 'NoSuchKey' \|\| $metadata.httpStatusCode === 404`로 두되 get·copy에서만 `FileNotFound`로 바꾸고 put·deletePrefix의 404는 `IO_FAILED` | C-05 "없으면 FileNotFound"는 읽기·복사 원본에만 해당. put·목록의 404는 버킷 없음 등 장애다 |
| D7 | delete는 S3가 없는 키에 오류를 내지 않지만, 내더라도 NoSuchKey·404면 성공 | C-05 "없는 키 삭제는 성공" |
| D8 | deletePrefix 방어 3건: 접두어 밖 키가 목록에 오면 삭제 없이 IO_FAILED, DeleteObjects 응답 `Errors`는 IO_FAILED, `IsTruncated`인데 다음 토큰 없으면 IO_FAILED | 다른 회원 파일 보호(BR6.2)·"접두어 삭제 끝남"을 거짓 보고하지 않음(BR7.1 탈퇴·발행 삭제의 바닥). 계획에 명시되지 않은 추가 안전장치이며 시험으로 덮었다(§9.5) |
| D9 | 설정은 드라이버마다 자기 값만 받는다(혼합 설정은 기동 실패) | 계획 4.2 "부분 설정은 기동 실패(기존 local 규칙과 같음)"의 가장 단순한 확장. 판정할 수 없는 설정을 허용하지 않는 보안 점검 원칙 |
| D10 | 자격·지역은 SDK 기본 체인, 재시도는 SDK 기본값, 코드에 상수 없음. 지역 미설정은 첫 호출 때 `IO_FAILED`로 드러난다 | 계획 4.1·기술 선택·보안 설계(역할 분리). 기동 때 AWS에 접속하지 않으므로 모듈 조립 시험이 실제 AWS 없이 돈다 |
| D11 | 가짜 S3의 NoSuchKey는 SDK 실제 클래스(`new NoSuchKey({...})`)로 만들어 판정 경로가 실제 예외 모양과 같게 했고, 이름이 다른 404는 별도 평범한 오류로 덮었다 | S-2의 두 판정 경로를 모두 시험 |

### 9.4 시험 실행 결과(그대로)

검사 환경은 세 갈래다. (1) **Windows `npm test`·`npm run test:coverage` 경로**: 테스트 DB `catchu-db-test`(127.0.0.1:5433/catchu_test)를 켠 뒤 `TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=5433 TEST_DB_NAME=catchu_test`를 명시해 실행했고, `scripts/test-with-db.cjs`가 그 DB에 접속·마이그레이션을 확인한 뒤 시험 파일을 돌렸다((가)의 시험·커버리지 명령과 §9.7의 `npm test`가 여기 해당). (2) **DB 없는 `node --test` 직접 실행**: S22 비교용 3회((나)의 기준 판본 Windows, 기준 판본 Linux 컨테이너, 현재 판본 Linux 컨테이너)로, 테스트 DB에 접속하지 않았다. 두 시험 파일은 DB를 쓰지 않아 결과에는 영향이 없지만 마이그레이션 확인은 거치지 않은 경로다. (3) **빌드·lint·typecheck**: DB와 무관하다.

**(가) 가짜 S3 시험 — 실행함, 전부 통과**

- 변경 전 기준선: `cd api && npm run lint`, `npm run typecheck` 둘 다 종료 0. 초기 구현 당시에는 변경 전 U2 시험을 실행하지 않았다. 이후 S22 재검토에서 기준 판본을 검증했으며 결과는 §9.4 (나)에 기록했다.
- 구현 뒤: `npm run build`·`npm run lint`·`npm run typecheck` 모두 종료 0(오케스트레이터가 다시 돌려도 같음).
- `cd api && npm test -- test/file-storage/s3-file-storage.test.cjs test/u2/file-storage.test.cjs`(개발자 1회, 오케스트레이터 재실행 1회 모두 같은 결과): **tests 28 / pass 27 / fail 1 / cancelled 0 / skipped 0 / todo 0, 종료 코드 1**. 전체 출력은 세션 스크래치패드 `u8-step4-storage-tests.log`에 저장(git에 들어가지 않음).
  - `s3-file-storage.test.cjs` **20/20 통과**: S-1, S-2, S-3, S-4, Errors·접두어 밖 키(추가), S-5, S-6, 드라이버 선택, `[LocalFileStorage]` 계약 6개, `[S3FileStorage(가짜 S3)]` 계약 6개(S-7).
  - `u2/file-storage.test.cjs` **7/8 통과**: put·get·copy, 없는 키·쓰기 실패, S23, 설정 없음, 빈 문자열·한쪽만, 상대 경로·없는 폴더, 모르는 드라이버(4.4에서 고친 시험 포함).
- 커버리지 `cd api && TEST_COVERAGE_INCLUDE='dist/file-storage/**' npm run test:coverage -- <같은 두 파일>`(개발자 실행): tests 28 / pass 27 / fail 1(같은 S22), 종료 코드 1. 표 원문:

```
file                     | line % | branch % | funcs % | uncovered lines
file-storage.config.js   | 100.00 |   100.00 |  100.00 |
file-storage.js          | 100.00 |    97.06 |  100.00 |
file-storage.module.js   |  96.67 |    66.67 |  100.00 | 5
local-file-storage.js    |  88.72 |    73.33 |   94.74 | 33-34 40-44 57-58 69-70 78-79 101-102
s3-file-storage.js       | 100.00 |    98.21 |  100.00 |
all files                |  95.97 |    88.78 |   98.33 |
```

  `s3-file-storage.js` 줄 100%, `dist/file-storage/**` 전체 줄 95.97%(80% 바닥 위). `local-file-storage.js`의 미덮인 줄 일부는 S22가 중간에 멈춘 영향(심볼릭 링크 경로). 임계값·설정은 바꾸지 않았다. 80% 바닥의 공식 판정은 Build and Test의 전체 스위트 몫이다.
- `npm audit`(설치 뒤, 개발자 실행): moderate 10건, 모두 `eslint`·`@typescript-eslint/*`·`minimatch` 계열(devDependencies, 설치 전부터 있음). `@aws-sdk`·`@smithy` 관련 0건. CI `check-deps-audit.sh`는 high·critical만 실패로 치므로 차단 없음.

**(나) S22 — 이 Windows 계정에서는 심볼릭 링크 생성 단계 EPERM으로 실패, 링크 차단 동작은 Linux 컨테이너에서 검증(별도 항목, 전체 통과 아님)**

- 실패 시험: `api/test/u2/file-storage.test.cjs:91` "S22 ..·역슬래시·절대 경로·계약 밖 키는 거부하고 뿌리 밖을 건드리지 않는다. 뿌리 안 심볼릭 링크도 따라가지 않는다".
- 정확한 상태: **심볼릭 링크 생성 단계 EPERM, 해당 링크 차단 동작은 이 계정에서는 미검증.** 오류는 `EPERM: operation not permitted, symlink …`, `errno -4048`, `syscall 'symlink'`이고 발생 위치는 시험 코드 108행 `await symlink(outside, join(root, 'members', OTHER))`, 즉 시험 준비 단계(심볼릭 링크 만들기)라 뒤의 `OUTSIDE_ROOT` 거부 단언까지 가지 못했다. 앞부분의 `..`·역슬래시·절대 경로·계약 밖 키 거부 단언은 그 전에 통과했다. Windows에서 개발자 모드(레지스트리 `AppModelUnlock` 키 없음)나 관리자 권한이 없는 계정은 심볼릭 링크를 만들 수 없고, 이 셸은 관리자가 아니다(`net session` 거부). 단독 `fs.symlinkSync` 실험도 동일 EPERM.
- 기준 판본 비교(2026-11-09, 담당자 지시로 재검토): 기존 작업을 보존한 채 스크래치패드에 변경 전 커밋 7ef0dd6의 별도 git 워크트리를 만들어 `npm ci`(종료 0)·`npm run build`(종료 0) 뒤 같은 시험 파일을 돌렸다. **기준 판본도 같은 계정에서 7/8 통과, S22가 동일 EPERM으로 실패(종료 코드 1).** 즉 이 실패는 Step 4 변경과 무관한 기존 환경 제약이다. 로그: 스크래치패드 `s22-baseline-windows.log`.
- 심볼릭 링크 허용 환경 검증: Docker의 Linux `node:24` 컨테이너(node v24.22.2, 심볼릭 링크 probe OK)에서 **현재 판본**과 **기준 판본**을 각각 `npm ci`(종료 0)·`npm run build`(종료 0) 뒤 같은 시험 파일로 돌렸다. **둘 다 8/8 통과, S22 통과(종료 코드 0).** 현재 판본의 심볼릭 링크 차단 동작(`LocalFileStorage.resolve`의 `OUTSIDE_ROOT`)이 실제로 검증됐다. 컨테이너 Node 소판 버전(24.22.2)은 프로젝트 고정(24.21.0)과 다르다. 로그: `s22-current-linux.log`·`s22-baseline-linux.log`. 이 두 시험 파일은 DB를 쓰지 않으므로 컨테이너에서는 `node --test`로 직접 돌렸다.
- 시험 코드·단언은 고치지 않았다. Windows 로컬 실행에서는 S22 때문에 종료 코드가 1이므로 "전체 통과"가 아니다. Windows에서 확정 재현이 필요하면 관리자 셸이나 개발자 모드가 필요하다(이번에는 하지 않았다).

**(다) 실제 S3 확인 — 미실행**

- 실제 버킷에 대한 put·get·copy·delete·deletePrefix(1,000개 초과 포함)·권한·지역 해석: 버킷·역할(#389) 준비 전이라 가짜 클라이언트로만 시험했다(OQ-U8-2). 문서(`api/docs/file-storage.md`)에 "버킷 준비 뒤 1회 수동 확인·통합 확인 표 기록"으로 적었다. **S3 실제 확인 미완.**
- SDK 기본 재시도(최대 3회)가 실제로 동작하는지: 드라이버가 재시도 코드를 더하지 않고 `send`를 1회만 부른다는 것(S-3)까지만 시험. SDK 내부 재시도는 미확인.

**(라) Docker·테스트 DB 때문에 못 한 검사 — 없음**

- 처음에는 Docker Desktop이 꺼져 있어 테스트 DB를 쓸 수 없었으나, 실행 중 담당자 허락으로 Docker를 켜고 `catchu-db-test`를 시작해 `npm test`·`npm run test:coverage` 원래 경로로 돌렸다.
- **초기 시도 기록**: Step 4 첫 실행 때 개발자가 DB 없는 대체 경로(`node --test` 직접 실행)를 시도했으나 도구 권한 거부로 실행되지 않아 그 시점에는 결과가 없었다. 이 기록은 그때 상태이며 현재 결과가 아니다.
- **그 뒤 수행한 `node --test` 직접 실행 3회**(2026-11-09 S22 재검토, 담당자 지시): 기준 판본 Windows 7/8(S22 EPERM), 기준 판본 Linux 컨테이너 8/8, 현재 판본 Linux 컨테이너 8/8. 모두 DB 없이 돌렸고 결과·로그는 §9.4 (나)에 있다. 두 시험 파일은 DB를 쓰지 않으므로 DB 유무가 결과에 영향을 주지 않는다.

### 9.5 계획 이탈

- **4.4 추가(담당자 지시 2026-11-09)**: 승인된 계획에 없던 기존 U2 시험 최소 수정과 `api/docs/file-storage.md`·`api/docs/environment.md` 수정을 계획 4.4로 더했다. 가드 정책 relaxed라 재승인 없이 계속 빌드했고, 그 사실은 워크플로우가 담당자에게 한 번 알렸다. 변경 뒤 U2 시험 7/8 통과(1건은 §9.4 (나)의 환경 제약).
- 계획 4.3의 "≈8개"보다 많은 시험(8 + 계약 6×2 = 20)을 한 파일에 두었다. 계약 시험을 Local·S3 두 드라이버에 각각 등록한 결과(S-7)이며 축소하지 않았다.
- deletePrefix에 계획에 없는 방어 3건(접두어 밖 키·`Errors`·토큰 없는 truncated → IO_FAILED)을 더했다(D8). 모두 "조용한 부분 성공"을 막는 쪽이라 계약을 좁히지 않는다.
- `file-storage.ts` 머리 주석 1줄을 현재형으로 고쳤다(코드 변경 없음).

### 9.6 미검증 항목과 담당자 검토 항목

미검증(Step 5 이후 또는 Build and Test 몫):

- 실제 S3 복사·삭제·권한·지역(§9.4 (다)). 버킷·역할 #389 뒤 수동 확인.
- S22의 Windows 로컬 통과: 관리자 셸·개발자 모드가 있어야 하며 이번에는 하지 않았다(기준 판본 동일 실패·Linux 통과는 §9.4 (나)에서 확인).
- 전체 `npm test`·커버리지 80%: Build and Test에서 판정. 4.5 보완 뒤 커버리지는 다시 재지 않았다.
- 발행 경로 연동(Step 8)·추출 수신·worker(Step 6·7)·열람(Step 9)·web(Step 10)·환경 예시(Step 11)·문서·추적(Step 12): 미착수.

담당자 검토 항목(Step 5 전):

1. D8 deletePrefix 방어 3건 — 2026-11-09 담당자 지시로 계획 4.1·문서·시험에 일치시켰다(§9.7). 수용된 것으로 본다.
2. D9 혼합 설정 기동 실패 규칙 — 같은 지시로 계획 4.2·문서·시험에 일치시켰다(§9.7). 개발 서버 `.env`에 두 드라이버 값을 함께 두면 기동 실패하므로 운용 때 유의.
3. U2 설정 시험의 `FILE_STORAGE_S3_BUCKET` 미복원 — 4.5(b)에서 고쳤다(§9.7).
4. Write 도구로 만든 새 파일과 `file-storage.config.ts`·`file-storage.module.ts`는 LF로 저장되어 git이 "LF will be replaced by CRLF" 경고를 낸다(`core.autocrlf=true`라 커밋 때 정규화, 내용 영향 없음).
5. Step 5 이후 진행 지시 — 미정. 커밋·push·PR은 담당자 지시 전까지 하지 않는다.

### 9.7 Step 4 보완(계획 4.5, 2026-11-09 담당자 지시)

변경:

- `api/src/file-storage/s3-file-storage.ts` — `isMissing`을 `name === 'NoSuchKey'`만으로 좁혔다(HTTP 404 상태 코드 분기 삭제). `NoSuchBucket`·이름 없는 404·그 밖 모든 오류는 get·copy·delete 모두 `StorageUnavailable('IO_FAILED', { cause })`. put·deletePrefix는 `NoSuchKey`가 와도 IO_FAILED. 주석을 "deletePrefix 방어 3건(계획 4.1)" 용어로 맞춤. D6·D7은 이 규칙으로 바뀐다(404 상태 코드는 더 이상 "없음"의 근거가 아님).
- `api/test/file-storage/s3-file-storage.test.cjs` — S-2를 "없는 대상 판정은 NoSuchKey만"으로 다시 썼고(이전 "이름이 NoSuchKey가 아니어도 404면 없는 대상" 단언 제거, 더 엄격한 쪽), 회귀 시험 "회귀(계획 4.5a)" 추가: SDK 실제 클래스 `NoSuchBucket`(404)과 이름 없는 404 오류 각각에 대해 delete → IO_FAILED(성공 아님, `cause` 보존), get·copy → IO_FAILED(FileNotFound 아님), 호출 1회; 대조로 `NoSuchKey`는 delete 성공·get FileNotFound. "토큰 없는 truncated" 단언을 S-4에서 "deletePrefix 방어 3건(계획 4.1)" 시험으로 옮겨 세 건을 한 시험으로 묶음(단언 삭제 없음, 호출 순서 단언 1건 추가). S-6 제목을 "설정·혼합 설정 거부(계획 4.2): …"로(단언 변경 없음). 시험 수 8→9(+계약 12).
- `api/test/u2/file-storage.test.cjs` — `setEnv`를 쓰는 세 시험("설정이 없으면…", "상대 경로·없는 폴더…" 모듈 조립, "모르는 드라이버…" 모듈 조립)에 `FILE_STORAGE_S3_BUCKET: undefined`를 더해 외부 셸 값이 있어도 시험 중 삭제·끝나면 복원되게 했다. 단언 변경 없음. `test/u2/support.cjs`의 `setEnv`는 `undefined` 삭제·복원을 이미 지원해 고치지 않았다.
- `api/docs/file-storage.md` — 설정 절 머리글을 계획 4.2 "혼합 설정 거부" 문구와 같게, S3 드라이버 표·불릿을 "없는 대상 판정은 `NoSuchKey`만, `NoSuchBucket`을 포함한 그 밖의 404·오류는 모두 `StorageUnavailable`"과 "deletePrefix 방어 3건" 용어로 계획 4.1과 일치, 시험 절 갱신(9 + 계약 12, 회귀 시험).
- `api/docs/environment.md` — `FILE_STORAGE_S3_BUCKET` 행에 `NoSuchBucket`은 없는 파일이 아니라 `StorageUnavailable`임을 추가.
- `code-generation-plan.md` — 오케스트레이터가 4.1·4.2에 방어 3건·혼합 설정 거부 문구를 적고 4.5를 추가(담당자 지시), 개발자가 4.5 체크.

검사(변경 영향분만, 각 1회, 전체 출력·종료 코드는 스크래치패드 `u8-step4-fix-<명령>.log`):

| 명령 | 결과 |
|---|---|
| `cd api && npm run build` | 종료 0 |
| `cd api && npm run lint` | 종료 0 |
| `cd api && npm run typecheck` | 종료 0 |
| `cd api && npm test -- test/file-storage/s3-file-storage.test.cjs test/u2/file-storage.test.cjs`(테스트 DB 127.0.0.1:5433/catchu_test, 새로 적용 0개) | **tests 29 / pass 28 / fail 1 / cancelled 0 / skipped 0, 종료 코드 1.** 통과 28 = `s3-file-storage.test.cjs` 21/21(S-1, S-2 새 규칙, 회귀 4.5a, S-3, S-4, 방어 3건, S-5, S-6 혼합 설정 거부, 드라이버 선택, 계약 6×2) + `u2/file-storage.test.cjs` 7/8. 실패 1 = S22(§9.4 (나), 환경 제약). 전체 통과 아님 |

실행하지 않은 것: 커버리지 재측정(지시로 생략, 마지막 측정은 §9.4 (가)), 실제 S3(§9.4 (다) 그대로 미검증, `NoSuchBucket`이 실제로 어떤 모양으로 오는지도 미확인), Windows 관리자·개발자 모드에서의 S22.

S22 재검토 결과는 §9.4 (나)에 합쳐 적었다(기준 판본 Windows 동일 실패, 현재·기준 판본 Linux 컨테이너 8/8 통과).

## 10. Step 5 — PDF 자료 API (2026-11-09 실행, 담당자 승인 뒤)

입력: [코드 생성 계획](code-generation-plan.md) Step 5(5.1~5.5), [시험 시나리오](test-scenarios.md) §3 U-1~U-12, [기능 명세](../functional-design/functional-spec.md) W1, [규칙](../functional-design/rules.md) BR1.1~BR1.8·BR2.1~BR2.4·BR6.6, [엔티티](../functional-design/entities.md) PdfMaterial, [성능 설계](../nfr-design/performance-design.md)(20벌·20 MB·10분 시한), [보안 설계](../nfr-design/security-design.md), [신뢰성 설계](../nfr-design/reliability-design.md) §5·§6, [계약 요약](../../../inception/contract-design/contract-summary.md) C-04·C-05·C-16, 기존 `api/src/materials/text-*`·`ai-consent`·`ai-run`·`analysis-queue` 패턴. 개발 담당 에이전트가 구현·첫 시험 실행 뒤 사용량 제한으로 중단되어, 마지막 수정(시험 로그 수집기) 뒤 검사는 오케스트레이터가 다시 실행했다.

### 10.1 계획 항목별 구현 여부

| 계획 | 항목 | 구현 | 위치 |
|---|---|---|---|
| 5.1 | `findOwned`(소유·존재 한 쿼리, 남의 것·없음·UUID 아님 같은 404) | 완료 | `pdf-material-store.ts` `findOwned` |
| 5.1 | 생성: 회원 행 `FOR UPDATE` → COUNT ≥ 20 → 400 `maxCount` → INSERT PENDING, 시한 = 넣는 시각 + 10분 | 완료 | `create`·`lockMember`, `PDF_EXTRACTION_DEADLINE_MINUTES` |
| 5.1 | `readStatus` 조건부 UPDATE(시한 지난 PENDING → FAILED/DEADLINE_EXCEEDED) | 완료 | `readStatus`·`settleDeadlines`(목록은 회원 전체, 상세는 한 건) |
| 5.1 | 목록(cursor) | 완료 | `list`, 커서는 텍스트 자료와 같은 규칙(`pdf-material-input.ts`) |
| 5.1 | 쪽 목록(pageNumber·readable만) | 완료 | `get`이 `pdf_page_text`에서 두 열만 읽어 `pages`로 붙임(글 본문 없음) |
| 5.1 | 삭제(행 → 쪽 연쇄) | 완료 | `remove`(0행이면 404) |
| 5.2 | multipart 파일 1개·선언 종류·머리 바이트 `%PDF-`·제목 1~100자(없으면 파일 이름)·정의 밖 필드 거부 | 완료 | `readPdfUpload`(multer 2.5.0 메모리 저장, `fileFilter`로 선언 종류, `limits.files=1`·`fields=1`, 파일 이름에서 제목) |
| 5.2 | 누적 20 MB 초과 즉시 수신 중단·400(선언 크기 불신) | 완료 | `limits.fileSize` → `LIMIT_FILE_SIZE` → 400 `maxSize` |
| 5.3 | `POST /v1/pdf-materials`: 인증 → `AiConsentGate.require` → 검증 → put → 트랜잭션 → 커밋 → 발송(실패는 로그만) → 201 | 완료 | `PdfMaterialsController.create`(동의 확인은 본문을 읽기 전) |
| 5.3 | `GET /v1/pdf-materials`, `GET /v1/pdf-materials/{id}` | 완료 | `list`·`get`(시한 판정 반영) |
| 5.3 | `GET /v1/pdf-materials/{id}/file`: 헤더 전 get 성공 확인 → 스트림 파이프, 헤더 4종 | 완료 | `file`: `findOwned` → `files.get`(실패 500·`PDF_VIEW_FAILED` before-headers) → `application/pdf`·`inline; filename="material.pdf"`·`no-store`·`nosniff` → `pipeline`; 전송 중 오류는 연결 중단·`PDF_VIEW_FAILED` streaming, 받는 쪽이 먼저 끊은 경우는 기록 안 함 |
| 5.3 | `DELETE /v1/pdf-materials/{id}`(저장소 먼저) | 완료 | `remove`: `findOwned` → `files.delete`(실패 500·DB 유지·`PDF_DELETE_STORAGE_FAILED`) → 행 삭제 → 204 |
| 5.3 | put 뒤 DB 실패·벌 수 초과는 `delete(materialKey)` 1회 보상 | 완료 | `compensate`(보상 실패는 `PDF_UPLOAD_STORE_FAILED` stage `compensate-delete` 로그만) |
| 5.3 | 남의 것·없음·UUID 아님 404 `RESOURCE_UNAVAILABLE` | 완료 | 저장소의 `NotFoundException` → 공통 오류 형식(U-7로 확인) |
| 5.4 | `pdf-extract.dispatcher.ts` + 큐 명세(`pdf-extraction-requests`, 작업 ID=pdfMaterialId, 시도 1회, 봉투 `schemaVersion "2"`·`messageId`·`memberId`·`storageKey`) | 완료 | `pdf-extraction-spec.ts`(상수·봉투·`isValidPdfExtractMessage`·작업 옵션), `QueuePdfExtractDispatcher`(BullMQ Queue+IORedis, 5초 상한, 큐 주소 없으면 `QUEUE_NOT_CONFIGURED`, 종료 때 닫기), 주입 토큰 `PDF_EXTRACT_DISPATCHER`·`PDF_EXTRACT_QUEUE_CONFIG` |
| 5.4 | `materials.module.ts`·`app.module.ts` 등록 | 완료 | `MaterialsModule`에 `FileStorageModule`·`AiConsentModule` import, 컨트롤러·스토어·발송기 등록. `app.module.ts`는 `MaterialsModule`이 이미 등록돼 있어 변경 없음 |
| 5.4 | 로그 사건 `PDF_UPLOAD_STORE_FAILED`·`PDF_EXTRACT_ENQUEUE_FAILED`·`PDF_VIEW_FAILED`(before-headers/streaming)·`PDF_DELETE_STORAGE_FAILED`(키·제목·글 없음) | 완료 | 컨트롤러 로그는 pdfMaterialId·memberId·사건·단계·오류 이름만(U-5·U-6·U-9·U-10·U-12가 비노출 확인) |
| 5.5 | `pdf-materials-api.test.cjs` ≈12개 | 완료 | U-1~U-12 각 1개 = 12개(계획 목록의 정상 201·PENDING, 동의 없음 403, PDF 아님·20 MB·제목 101자·정의 밖 필드 400, 21벌째, 저장소 미설정 500, put 뒤 DB 실패→delete, 남의 것 404, 시한 경과, 헤더 4종, 삭제 저장소 실패 + U-11 정상 삭제, U-12 발송 실패) |

빠진 항목: 없음.

### 10.2 만든·고친 파일

새 파일(코드): `api/src/materials/pdf-material-store.ts`, `api/src/materials/pdf-material-input.ts`, `api/src/materials/pdf-materials.controller.ts`, `api/src/materials/multer.d.ts`(multer 2.5.0 최소 타입 선언 — `@types/multer`가 없고 새 의존성을 들이지 않기 위해; `@nestjs/platform-express`의 override로 설치된 multer를 직접 씀), `api/src/pdf-extraction/pdf-extraction-spec.ts`, `api/src/pdf-extraction/pdf-extract.dispatcher.ts`.
새 파일(시험): `api/test/materials/pdf-materials-api.test.cjs`(12개).
고친 기존 파일: `api/src/materials/materials.module.ts`(imports·controllers·providers 추가). `code-generation-plan.md` 5.1~5.5 체크(담당자 확인 뒤 오케스트레이터가 표시).
바꾸지 않은 것: `app.module.ts`, `analysis-queue/worker-message.consumer.ts`·`analysis-receiver/*`(Step 6), 표·엔티티·마이그레이션, Step 4 파일, 의존성(`package.json` 변경 없음).

### 10.3 구현 결정

| # | 결정 | 근거 |
|---|---|---|
| D12 | multipart는 multer 메모리 저장. 선언 종류는 `fileFilter`(스트림 받기 전), 크기는 `limits.fileSize`(누적 바이트 초과 즉시 중단), 머리 바이트·제목은 받은 뒤 검사 | 계획 5.2·성능 설계 「업로드 처리 순서」. `FileStorage.put`이 Buffer를 받으므로 메모리 저장이 맞다. 타입은 `multer.d.ts`로 보완 |
| D13 | 발송기는 주입 토큰 `PDF_EXTRACT_DISPATCHER`로 두고 큐 설정은 `readAnalysisQueueConfig()`(기존 `CATCHU_QUEUE_REDIS_URL`·`CATCHU_QUEUE_PREFIX`, 새 환경변수 없음) | 계획 5.4, AiRun과 같은 규칙. 시험은 인스턴스 메서드를 바꿔 끼운다 |
| D14 | 발송은 예외를 던지지 않고 결과(`ENQUEUED`/`ENQUEUE_FAILED`)로 알리며, 컨트롤러는 실패·예외 모두 `PDF_EXTRACT_ENQUEUE_FAILED`만 남기고 201 유지 | BR2.4·U-12. 자료는 시한 판정으로 FAILED가 된다 |
| D15 | 벌 수 초과(400)는 업무 거부라 `PDF_UPLOAD_STORE_FAILED`를 남기지 않고 보상 삭제만, DB 오류는 stage `db`로 남김 | 로그 소음 방지. U-4·U-6으로 확인 |
| D16 | 원본 열람에서 받는 쪽이 먼저 끊은 경우(`ERR_STREAM_PREMATURE_CLOSE`)는 로그하지 않음 | 우리 실패가 아님. 저장소 쪽 오류만 `PDF_VIEW_FAILED` streaming |
| D17 | 시험은 두 앱 인스턴스(저장소 미설정 앱·로컬 드라이버 앱)를 띄우고, Nest Logger 재정의가 프로세스 전역이라 두 수집기를 합쳐 본다 | 첫 실행의 U-5 실패 원인(§10.4). 구현 판정은 바꾸지 않음 |

### 10.4 시험 실행 결과(그대로)

검사 환경: 모두 Windows `npm` 경로이고 시험은 로컬 테스트 DB 127.0.0.1:5433/catchu_test(`scripts/test-with-db.cjs`, "새로 적용 0개")를 썼다. 저장소는 시험 전용 임시 폴더의 로컬 드라이버, 발송기는 가짜·메서드 교체(실제 S3·실제 Redis 없음). 로그는 스크래치패드 `u8-step5-*.log`(각 전체 출력 + `EXIT_CODE=`).

| 명령 | 결과 | 종료 코드 | 로그 |
|---|---|---|---|
| 변경 전 기준선 `npm run lint`·`npm run typecheck` | 통과 | 0·0 | `u8-step5-baseline-lint.log`·`u8-step5-baseline-typecheck.log` |
| 구현 뒤 `npm run build`·`lint`·`typecheck`(개발자) | 통과 | 0·0·0 | `u8-step5-build.log`·`u8-step5-lint.log`·`u8-step5-typecheck.log` |
| 첫 시험 실행(개발자) `npm test -- test/materials/pdf-materials-api.test.cjs test/materials/text-materials-api.test.cjs test/db/pdf-tables.test.cjs` | tests 28 / pass 27 / fail 1(U-5: `PDF_UPLOAD_STORE_FAILED` 로그가 저장소 미설정 앱의 수집기에 안 보임) | 1 | `u8-step5-test.log` |
| 시험 수집기 수정 뒤 `lint`·`typecheck`(오케스트레이터 재실행) | 통과 | 0·0 | `u8-step5-lint-rerun.log`·`u8-step5-typecheck-rerun.log` |
| 같은 시험 명령 재실행(오케스트레이터) | **tests 28 / pass 28 / fail 0 / skipped 0 / cancelled 0**(PDF API 12 + 텍스트 자료 회귀 5 + DB 표 11) | 0 | `u8-step5-test-rerun.log` |
| 커버리지 `TEST_COVERAGE_INCLUDE='dist/materials/**' npm run test:coverage -- test/materials/pdf-materials-api.test.cjs` | 12/12. `pdf-materials.controller.js` 95.85% / `pdf-material-store.js` 99.44% / `pdf-material-input.js` 97.58% / 폴더 전체 81.70%(텍스트 자료 파일은 이 실행에 그 시험이 없어 27~85%) | 0 | `u8-step5-coverage-materials.log` |
| 커버리지 `TEST_COVERAGE_INCLUDE='dist/pdf-extraction/**' npm run test:coverage -- test/materials/pdf-materials-api.test.cjs` | 12/12. `pdf-extract.dispatcher.js` 69.91%(미덮임 51~64 `queue.add` 경로, 77~83 `openQueue`, 88~99 `closeAll`), `pdf-extraction-spec.js` 87.50%, 폴더 전체 76.76% | 0 | `u8-step5-coverage-pdf-extraction.log` |

첫 실행의 U-5 실패 원인: 저장소 미설정 앱과 로컬 드라이버 앱을 함께 띄우는데 Nest의 Logger 재정의가 프로세스 전역이라 두 앱의 인스턴스 로그가 마지막에 만든 앱의 수집기로만 갔다. 시험이 두 수집기를 합쳐 보도록 고쳤고(`allLogs`), 구현 코드·판정은 바꾸지 않았다. 재실행에서 28/28.

건너뛴 시험: 없음. 임계값·설정은 바꾸지 않았다. 80% 바닥의 공식 판정은 Build and Test의 전체 스위트 몫이다. 전체 `npm test`는 돌리지 않았다.

### 10.5 미검증 항목(합성 검증과 구분)

- **실제 S3**: 미검증 유지(#389 전). Step 5 저장소 실패 경로(U-5·U-6·U-10)는 메서드 교체 주입이다.
- **실제 큐(Redis/BullMQ)**: 미검증. 시험은 큐 주소를 비워 `QUEUE_NOT_CONFIGURED` 경로가 기본이고, U-1의 "커밋 뒤 발송 1회"는 가짜 발송기로 확인했다. `QueuePdfExtractDispatcher`의 실제 `queue.add`·연결 열기·종료 닫기 경로는 커버되지 않았다(폴더 커버리지 76.76%).
  - 후속 단계: Step 7(worker 추출 소비자)에서 worker가 같은 큐 이름·봉투·작업 ID 규칙으로 소비하는 것을 가짜 큐로 맞추고, Build and Test 또는 개발 서버(Redis 있음)에서 실제 연결로 확인한다.
  - 확인 항목: (1) `queue.add`가 작업 이름 `PdfExtract`, 작업 ID = pdfMaterialId, `attempts: 1`, 보관 2시간 옵션으로 들어가는지, (2) 같은 pdfMaterialId를 보관 기간 안에 다시 넣으면 BullMQ가 무시하고 `ENQUEUED`로 끝나는지, (3) 연결 실패·5초 상한에서 `ENQUEUE_FAILED`(오류 이름만)로 끝나고 업로드는 201인지, (4) 앱 종료 때 `onApplicationShutdown`이 큐·연결을 5초 안에 닫고 넘기면 끊는지, (5) 주소 값이 로그에 나오지 않는지.
- **전체 `npm test`·커버리지 80% 판정**: Build and Test 몫, 미실행.
- Step 6(수신)·Step 7(worker)·Step 8~12: 미착수.

### 10.6 계획 이탈·보고 사항

- `api/src/materials/multer.d.ts` 추가(계획 파일 목록에 없음): `@types/multer`가 없고 새 의존성을 들이지 않기 위한 최소 타입 선언. 코드 동작 변경 없음.
- 개발 담당 에이전트가 첫 시험 실행 직후 사용량 제한으로 중단됐다. 그 전에 시험 수집기를 고쳐 두었고, 이후 검사(lint·typecheck·시험·커버리지 2종)와 계획 5.1~5.5 체크·이 기록은 오케스트레이터가 했다.
- 엔진이 남긴 `aidlc/.aidlc-subagent-inflight`(에이전트 중단 때 남은 진행 표식, 추적 안 됨)가 작업 트리에 있다. 건드리지 않았다.
- Write 도구로 만든 새 파일은 LF다(`core.autocrlf=true`로 커밋 때 정규화).
- 담당자 검토 대기: Step 6 이후 진행 지시, 커밋·push·PR 시점. (2026-11-09 담당자 확인 뒤 Step 6으로 진행, §11.)

## 11. Step 6 — 추출 결과 수신 (2026-11-09 실행, 담당자 지시 뒤)

입력: [코드 생성 계획](code-generation-plan.md) Step 6(6.1~6.3), [시험 시나리오](test-scenarios.md) §4 R-1~R-8, [기능 명세](../functional-design/functional-spec.md) W2(`PdfExtractionResult` 모양·판정 5종·수신 확인), [규칙](../functional-design/rules.md) BR2.1·BR2.2·BR3.2~BR3.6, [엔티티](../functional-design/entities.md) PdfPageText, [신뢰성 설계](../nfr-design/reliability-design.md) §5·§6, [보안 설계](../nfr-design/security-design.md), [관측 설계](../nfr-design/observability-design.md) §1, [계약 요약](../../../inception/contract-design/contract-summary.md) C-16·C-02, 기존 `analysis-receiver/worker-message.validator.ts`·`analysis-queue/worker-message.consumer.ts`·`queue-spec.ts`·`analysis-queue.module.ts`. 담당자 지시(2026-11-09): Step 6만, 계획 체크·기록 갱신은 결과 검토 뒤, Step 7·커밋·push·PR 금지. 검토 뒤 같은 날 체크·기록을 갱신했다.

### 11.1 계획 항목별 구현 여부

| 계획 | 항목 | 구현 | 위치 |
|---|---|---|---|
| 6.1 | `PdfExtractionResult` 모양 검사: UUID, outcome, SUCCEEDED⇒pages 1~50·pageNumber 연속·중복 없음, FAILED⇒failureCode 필수·pages 없음, `readable = (text <> '')`, 정의 밖 필드 거부 → SCHEMA_INVALID | 완료 | `pdf-extraction-spec.ts`의 `isValidPdfExtractionResult`(허용 키 7개, `schemaVersion "2"`, 소문자 UUID 2개, `messageId = message-pdf-{id}-result`, `readable === (text !== '')`, text에 NUL 없음, FAILED의 failureCode ∈ `PDF_WORKER_FAILURE_CODES`(엔티티 상수에서 `DEADLINE_EXCEEDED` 제외)) ← `WorkerMessageValidator.pdfExtractionResult`가 위임. 계약 YAML은 수정하지 않음 |
| 6.2 | 한 트랜잭션 `pdf_material FOR UPDATE` → 없음·회원 불일치 CONTEXT_MISMATCH / DONE ALREADY_RECEIVED / FAILED 또는 시한 경과(FAILED 저장) STALE_ATTEMPT / PENDING: 쪽 행 다중 INSERT + pageCount·DONE 또는 FAILED+failureCode → 커밋 뒤 ACCEPTED/OK | 완료 | `pdf-extraction.receiver.ts` `PdfExtractionReceiver.receive`(READ COMMITTED, 쪽 행은 jsonb 배열 한 문장 INSERT·`RETURNING`으로 행 수 확인, 시한 지남은 조건부 UPDATE로 FAILED·DEADLINE_EXCEEDED 저장 뒤 STALE_ATTEMPT) |
| 6.2 | 수신 확인 `{ schemaVersion, messageId, pdfMaterialId, disposition, code }` | 완료 | `PdfExtractionReceipt`(ACCEPTED/OK, DUPLICATE/ALREADY_RECEIVED, REJECTED/CONTEXT_MISMATCH·STALE_ATTEMPT·SCHEMA_INVALID). 식별 불가(pdfMaterialId가 UUID 모양이 아니거나 messageId 없음)는 null(10월 `UNIDENTIFIABLE`과 같은 취급, 작업 완료) |
| 6.2 | 커밋 실패는 수신 확인 없이 작업 실패 | 완료 | 저장·커밋 실패 → 롤백 → `PdfExtractionStorageError` → 소비자가 `RECEIVER_STORAGE_UNAVAILABLE`로 작업 실패(R-7) |
| 6.2 | `worker-message.consumer.ts`에 작업 이름 분기 | 완료 | `job.name === 'PdfExtractionResult'` 분기(작업 ID ≠ messageId면 `JOB_ID_MISMATCH` 그대로 적용), 수신기는 생성자 3번째 선택 인자(기본 null, 미주입이면 `UNKNOWN_JOB_NAME`), `loggableJobId`에 `message-pdf-<uuid>-result` 허용 |
| 6.2 | 로그 `PDF_EXTRACTION_RECEIVED` | 완료 | 수신기가 `{ event, pdfMaterialId, messageId, disposition, code, pageCount }`만 남김(글·제목·회원 없음, 관측 설계 §1). 로그의 ID는 모양이 맞을 때만, 아니면 null |
| 6.3 | `pdf-extraction-receiver.test.cjs` ≈10개 | 완료(12개) | R-1 각 경우·식별 불가, R-2, R-3, R-4(FAILED / 시한 지남→FAILED 저장), R-5(50쪽·커밋 뒤 수신 확인)·동시 수신, R-6, R-7(UNIQUE 위반→0행·PENDING·수신 확인 없음·작업 실패)·커밋 실패, R-8 로그 비노출, 소비자 연결·`JOB_ID_MISMATCH` |

빠진 항목: 없음.

### 11.2 만든·고친 파일과 이유

새 파일: `api/src/pdf-extraction/pdf-extraction.receiver.ts`(수신기), `api/test/materials/pdf-extraction-receiver.test.cjs`(12개).
고친 파일(계획 6.1·6.2가 지목): `api/src/analysis-receiver/worker-message.validator.ts`(`pdfExtractionResult` 메서드 +9줄), `api/src/analysis-queue/worker-message.consumer.ts`(분기·선택 인자·`loggableJobId`, +19/-3), `api/src/pdf-extraction/pdf-extraction-spec.ts`(Step 5 파일에 결과 타입·검사·messageId 규칙 추가).
고친 파일(계획 목록 밖, 최소 변경 — 이유): `api/src/analysis-queue/queue-spec.ts`(`WORKER_JOB_NAMES`에 `PdfExtractionResult` 추가 — 소비자가 허용 목록 밖 작업 이름을 `UNKNOWN_JOB_NAME`으로 거부하므로 목록에 넣지 않으면 결과가 도달할 수 없음, +4/-1), `api/src/analysis-queue/analysis-queue.module.ts`(`start()`의 소비자 생성 자리에 `new PdfExtractionReceiver(dataSource, { logger })` 주입 — 실제 큐 소비자가 수신기를 받아야 분기가 동작함, +4/-1). `AnalysisQueueRunnerOptions`·`register`·`application.module.ts`는 무변경.
바꾸지 않은 것: `api/contracts/repository-analysis/worker-messages.yaml`·`common.yaml`(계약 문서, 아래 §11.6), `analysis-receiver/*` 서비스·저장소, 표·엔티티·마이그레이션, Step 4·5 산출물, 의존성.

### 11.3 구현 결정

| # | 결정 | 근거 |
|---|---|---|
| D18 | 모양 검사는 계약 YAML(Ajv)이 아니라 TypeScript 코드(`isValidPdfExtractionResult`)로 하고 `WorkerMessageValidator`가 위임 | 계약 문서 수정은 계획 12.2의 별도 계약 PR 몫(C-16 더하는 변경). `readable === (text !== '')`·연속 쪽 번호 같은 교차 필드 규칙은 코드가 더 분명 |
| D19 | worker 실패 사유 집합 = `PDF_EXTRACTION_FAILURE_CODES` − `DEADLINE_EXCEEDED` | entities.md("DEADLINE_EXCEEDED는 시한 판정이 넣는다")·W2(`ENCRYPTED·UNREADABLE_FILE·PAGE_LIMIT_EXCEEDED`). worker가 보내면 SCHEMA_INVALID. 목록은 엔티티 상수에서 파생해 정본 하나 유지 |
| D20 | 쓰지 않는 쪽 필드(`SUCCEEDED`의 failureCode, `FAILED`의 pages)는 없음 또는 null을 같은 뜻으로 받고, FAILED의 `pages: []`는 "pages 있음"으로 거부 | W2 YAML의 `\| null` 표기, BR3.2 "실패 결과에는 pages가 없다" |
| D21 | 쪽 행 INSERT는 jsonb 배열 한 문장(`jsonb_array_elements`)으로 넣고 `RETURNING`으로 행 수를 센다 | DB 문장 단위로 전부 아니면 전무(NFR4.16). TypeORM `query`는 INSERT의 영향 행 수를 돌려주지 않아 `RETURNING`이 필요했다(§11.4의 1차 실패 원인) |
| D22 | 저장 실패는 10월 `ReceiverStorageError`를 재사용하지 않고 `PdfExtractionStorageError`를 두고 소비자에서 같은 코드 `RECEIVER_STORAGE_UNAVAILABLE`로 대응 | `analysis-receiver` 서비스로의 역의존을 만들지 않으면서 기존 실패 코드 체계 유지 |
| D23 | 소비자 생성자의 수신기는 선택 인자(기본 null) | `analysis-queue-consumer`·`analysis-queue-valkey`·`u7` 등 기존 생성 호출을 깨지 않음. 미주입 상태의 `PdfExtractionResult`는 `UNKNOWN_JOB_NAME` |
| D24 | 로그 필드는 관측 설계 §1 그대로(`pdfMaterialId, messageId, disposition, code, pageCount`) | 글·제목·회원 정보 아님. 계획 6.2의 "코드·pdfMaterialId만"보다 두 필드가 많으며, 줄이려면 수신기 `record()` 한 곳만 고치면 된다 |

### 11.4 시험 실행 결과(그대로)

검사 환경: 빌드·lint·typecheck는 DB 무관. 시험은 Windows `npm test` 경로로 로컬 테스트 DB 127.0.0.1:5433/catchu_test(`scripts/test-with-db.cjs`, "새로 적용 0개")에서 실행했고, worker 결과는 가짜 작업 객체로 `WorkerMessageConsumer.process`에 직접 넣었다(BullMQ·Redis 없음, 실제 S3 없음). 로그는 스크래치패드 `u8-step6-*.log`(각 전체 출력 + `EXIT_CODE=`).

| 명령 | 결과 | 종료 코드 | 로그 |
|---|---|---|---|
| 변경 전 기준선 `cd api && npm run lint` | 통과 | 0 | `u8-step6-baseline-lint.log` |
| 변경 전 기준선 `cd api && npm run typecheck` | 통과 | 0 | `u8-step6-baseline-typecheck.log` |
| 구현 뒤 `cd api && npm run build` | 통과 | 0 | `u8-step6-build.log` |
| 구현 뒤 `cd api && npm run lint`(INSERT 수정 뒤 재실행, 로그는 마지막 것) | 통과 | 0 | `u8-step6-lint.log` |
| 구현 뒤 `cd api && npm run typecheck`(INSERT 수정 뒤 재실행, 로그는 마지막 것) | 통과 | 0 | `u8-step6-typecheck.log` |
| 1차 `cd api && npm test -- test/materials/pdf-extraction-receiver.test.cjs test/integration/analysis-queue-consumer.test.cjs test/analysis/receiver.test.cjs test/materials/pdf-materials-api.test.cjs` | 56개 중 5 fail(R-5·R-5 동시·R-7·R-8·소비자 연결, 모두 `RECEIVER_STORAGE_UNAVAILABLE`) | 1 | (로그는 재실행 것으로 덮임, 아래) |
| 2차 같은 명령(INSERT 반환 모양 수정 뒤) | **tests 56 / pass 56 / fail 0 / skipped 0 / cancelled 0**(새 수신 12 + 기존 소비자 13 + 기존 수신 19 + Step 5 API 12) | 0 | `u8-step6-test.log` |
| 커버리지 `TEST_COVERAGE_INCLUDE='dist/pdf-extraction/**' npm run test:coverage -- test/materials/pdf-extraction-receiver.test.cjs test/materials/pdf-materials-api.test.cjs` | 24/24. `pdf-extraction.receiver.js` 100.00%(분기 93.33%), `pdf-extraction-spec.js` 93.38%(미덮임 48~56: Step 5 `pdfExtractMessage` 봉투 생성, 발송기 대역 경로), `pdf-extract.dispatcher.js` 69.91%(Step 5 실제 큐 경로), 폴더 전체 89.36% | 0 | `u8-step6-coverage.log` |

1차 실패 원인과 수정: 수신기가 쪽 행 INSERT 뒤 결과를 `[rows, count]` 모양으로 기대했으나 pg 드라이버·TypeORM `query`는 INSERT에 rows만 돌려준다(영향 행 수는 UPDATE·DELETE만). 그래서 행 수 확인이 실패로 판정돼 `PdfExtractionStorageError`가 났다. `RETURNING page_number`로 행 수를 세도록 수신기를 고쳤고(시험 판정·임계값 변경 없음), 재실행에서 56/56. 스크래치패드의 `u8-step6-debug-insert.cjs`는 이 원인을 확인한 디버그 스크립트(합성 행, 프로젝트 밖)다.

건너뛴 시험: 없음(skipped 0). 임계값·설정은 바꾸지 않았다. 80% 바닥의 공식 판정은 Build and Test의 전체 스위트 몫이다.

### 11.5 미검증·미실행 항목(명시)

- **실제 Redis(BullMQ) 미실행**: `test/integration/analysis-queue-valkey.test.cjs`·`u7-analysis-chain.test.cjs` 등 실제 큐가 필요한 통합 시험은 돌리지 않았다. 소비자 생성자 변경(선택 인자)의 회귀는 typecheck와 가짜 작업 소비자 시험(13개)으로만 확인했다. 확인 항목(큐 있는 환경에서): (1) `worker-messages` 큐의 `PdfExtractionResult` 작업(작업 ID = `message-pdf-{id}-result`)이 소비되어 수신 확인 객체가 작업 반환값으로 기록되는지, (2) 저장 실패 작업이 `WORKER_MESSAGE_FAILED` 로그에 PDF 작업 ID와 `RECEIVER_STORAGE_UNAVAILABLE`로 남는지, (3) 기존 `Result`·`ProcessingEvent` 소비가 그대로인지, (4) Step 5 발송기의 실제 `queue.add` 경로(§10.5).
- **실제 S3 미검증** 유지(#389 전).
- **전체 `npm test`·커버리지 80% 판정 미실행**: Build and Test 몫. 이번에 돌린 것은 4개 파일(56개)뿐이다.
- Step 7(worker 추출 소비자)·Step 8~12: 미착수.

### 11.6 계획 이탈·계약 후속

- 계획 밖 기존 파일 2개 최소 변경(`queue-spec.ts`·`analysis-queue.module.ts`, 이유는 §11.2). `application.module.ts` 무변경.
- 계획 6.3 "≈10개" → 12개(동시 수신·커밋 실패·소비자 연결을 별도 시험으로 분리). 축소 없음.
- **C-16 계약 PR 후속(계획 12.2)**: 이번 코드가 전제하는 C-16 더하는 변경을 계약 문서(`contract-summary.md`·`api/contracts/repository-analysis/worker-messages.yaml`)에 반영하는 별도 계약 수정 PR이 필요하다. 넣을 내용: `PdfExtract` 요청 봉투(`schemaVersion "2"`, `messageId = pdf-extract-{pdfMaterialId}`, `pdfMaterialId`, `memberId`, `storageKey`), `PdfExtractionResult`(`schemaVersion "2"`, `messageId = message-pdf-{pdfMaterialId}-result`, `pdfMaterialId`, `memberId`, `outcome SUCCEEDED|FAILED`, `pages[{pageNumber, readable, text}]` 1~50·연속·`readable = (text <> '')`·NUL 없음, `failureCode ∈ ENCRYPTED|UNREADABLE_FILE|PAGE_LIMIT_EXCEEDED`), 수신 확인 `{ schemaVersion, messageId, pdfMaterialId, disposition, code }`와 판정 5종, `worker-messages` 큐 작업 이름 `PdfExtractionResult` 추가. 코드(`isValidPdfExtractionResult`)는 현재 구현 규칙이며 C-16 계약 반영·검토가 남아 있다. worker(Step 7)는 같은 규칙으로 맞추되, 계약 검토에서 달라지면 양쪽을 함께 고친다.
- 담당자 검토 대기: Step 7 진행 지시, 커밋·push·PR 시점.

## 12. Step 7 — worker 추출 소비자 (2026-11-09~10 실행, 당시 합성 시험까지·검증 미완료 → 2026-11-11 완료 체크, §12.9)

> D25는 2026-11-10 담당자 결정으로 반영했다. 합성 시험 통과는 Step 7 전체 검증 완료가 아니다. 남은 항목은 §12.6에 있으며, 계획 체크박스 7.1~7.3은 그 정리 뒤에 체크한다. 커밋·push·PR은 하지 않았다.
>
> **2026-11-11 완료 판단**: 위 문단은 2026-11-10 보류 시점의 기록이다. 그 뒤 §12.7·§12.8의 격리 Linux·실제 연결 확인과 팀장 결정 반영으로 남은 항목이 정리됐고, 2026-11-11 담당자가 검토 결과를 수용해 계획 7.1~7.3을 체크했다(§12.9). 2026-11-11에는 기존 로그·해시·현재 코드를 대조했을 뿐 **시험을 새로 실행하지 않았다.** 실제 S3 읽기 등 후속 항목은 미검증 그대로다(§12.9).

입력: [코드 생성 계획](code-generation-plan.md) Step 7(7.1~7.3), [기능 명세](../functional-design/functional-spec.md) W2 worker, [규칙](../functional-design/rules.md) BR3.1·BR3.2·BR3.6·BR3.7·BR7.4, [신뢰성 설계](../nfr-design/reliability-design.md), [보안 설계](../nfr-design/security-design.md), [관측 설계](../nfr-design/observability-design.md) §1, Step 5·6의 api 쪽 `pdf-extraction-spec.ts`·`pdf-extraction.receiver.ts`, 10월 분석 소비자(`app/consumer/*`).

진행 경위: 7.1·7.2는 2026-11-09 위임 에이전트가 작성했고 그 에이전트는 7.3 전에 끊겼다(`aidlc/.aidlc-subagent-inflight`에 세션 `7a289034…` 표식이 남아 있었으나 2026-11-10 작업 중 파일이 사라졌다. 이어받은 세션은 읽기만 했고 지우거나 되살리지 않았으며, 원인은 확인하지 못했다). 2026-11-10 이어받은 세션이 검사(아래 §12.4)와 서식 정리(`ruff format` 4개 파일)를 하고 7.3 시험을 썼다.

### 12.1 계획 항목별 구현 여부

| 계획 | 항목 | 구현 | 위치 |
|---|---|---|---|
| 7.1 | `settings.py`: `PDF_FILE_ROOT`, `CATCHU_WORKER_PDF_CONCURRENCY`(기본 1), 자식 시간·메모리 제한 설정 이름, S3 사용 여부 | 완료 | `PDF_FILE_ROOT`·`FILE_STORAGE_S3_BUCKET` 중 하나만(둘 다 없으면 Worker 안 띄움, 둘 다 있으면 오류), `CATCHU_WORKER_PDF_CHILD_TIMEOUT_SECONDS`(기본 120, 1~600), `CATCHU_WORKER_PDF_CHILD_MEMORY_MB`(기본 512, 64~16384), 동시성은 지금 1만 |
| 7.1 | `reader.py`: 배포 boto3 GetObject만, 로컬 `PDF_FILE_ROOT` 읽기 전용 | 완료 | 키 모양 검사 뒤에만 읽음, 로컬은 실제 경로가 뿌리 안인지 확인, 20 MB 넘으면 읽기 중단. 파일 쪽 문제 `FileUnreadable`(→ FAILED UNREADABLE_FILE)과 저장소 장애 `SourceUnavailable`(→ 결과 없이 작업 실패) 구분 |
| 7.1 | `extract.py`: 암호화→ENCRYPTED, 파싱 예외·0쪽→UNREADABLE_FILE, 50쪽 초과→PAGE_LIMIT_EXCEEDED, 쪽마다 extract_text, 공백·제어문자만→readable=false·'', NUL 제거 | 구현(D25 반영) | `extract_pages`·`normalize_page_text`. 쪽 단위 추출 예외는 파일 전체 UNREADABLE_FILE(D25), MemoryError는 잡지 않고 자식 분류로 올림 |
| 7.1 | `child.py`: 10월 자식 틀 재사용, 제한 초과 시 종료→FAILED UNREADABLE_FILE, 결과 표준 출력 | 완료(전달 방식 다름) | 10월 틀(`ChildRun`·`start_watchdog`·`frames`) 재사용. 결과는 표준 출력이 아니라 10월과 같은 파이프 프레임으로 넘긴다(D27). Linux에서만 `RLIMIT_AS` 메모리 제한 |
| 7.1 | `worker.py`: 별도 BullMQ Worker용 처리 함수, 봉투·키·ID 검사→불일치는 결과 없이 작업 실패, `message-pdf-{id}-result` 발송, `receipts.py` 재사용 | 완료 | `PdfExtractionProcessor`, 실패 코드 `PDF_REQUEST_INVALID`·`WORKER_DEFECT`·`WORKER_STOPPING`·`RESULT_DISPATCH_UNKNOWN`·`COMPLETION_RECORD_FAILED` |
| 7.1 | (계획에 이름 없음) `envelope.py`·`__init__.py` | 추가 | 요청 봉투 검사·결과 조립·자체 검사(`is_valid_result`, api `isValidPdfExtractionResult`와 같은 규칙)·수신 확인 분류 |
| 7.2 | `service.py`·`settings.py`·`queues.py`: 둘째 Worker 기동·종료 순서, 큐 이름·보관 규칙 | 완료 | `ConsumerSettings.pdf`가 있으면 `pdf-extraction-requests` Worker를 같은 이벤트 루프에 띄우고 같은 종료 순서에 넣음. 상태 확인은 두 Worker 모두 running일 때 running |
| 7.2 | `pyproject.toml` `boto3`·`pypdf` 정확한 버전·`uv.lock` | 완료 | `boto3==1.43.126`, `pypdf==7.0.0`, mypy에 boto3·botocore 형식 정보 없음 무시 설정 |
| 7.3 | `test_pdf_extraction.py` ≈7개 | 작성(46개, 1개 건너뜀) | 아래 §12.4 |
| 7.3 | `test_pdf_consumer.py` ≈7개 | 작성(29개), W-10 미작성 | 아래 §12.4. "분석 Worker와 독립 기동"(W-10)은 실제 Redis가 필요해 미작성·미실행(§12.5) |

7.2의 서비스 둘째 Worker 경로는 `test_pdf_service.py` 10건으로 확인했다: Redis 없이 7건, 이번에만 띄운 전용 임시 Valkey(로컬)에서 실제 큐 3건(정상 기동·결과 전송, W-10, 종료 중 PDF 자식 정리). 분석 자식·PDF 원본은 합성이고 실제 api 수신·S3·Linux 메모리 제한은 미검증이다(§12.5). 이 표의 "구현·작성"은 계획 체크를 뜻하지 않는다.

### 12.2 만든·고친 파일

새 파일(앱): `worker/app/pdf_extraction/__init__.py`·`settings.py`·`reader.py`·`extract.py`·`envelope.py`·`child.py`·`worker.py`.
새 파일(시험): `worker/tests/pdf_synthetic.py`(합성 PDF 바이트: 쪽마다 Helvetica `Tj` 한 줄 또는 빈 쪽, RC4-128 암호화 / `PdfExtract` 봉투 / `PdfJob` 가짜 작업 / 로컬 뿌리에 원본 두는 `place`), `worker/tests/pdf_children.py`(spawn 자식 대상: 멈춤·종결 없이 종료·MemoryError·쪽 추출 예외·예외·SourceUnavailable), `worker/tests/test_pdf_extraction.py`, `worker/tests/test_pdf_consumer.py`.
고친 파일(계획 7.2가 지목): `worker/app/consumer/service.py`, `settings.py`(`ConsumerSettings.pdf`), `queues.py`(PDF 큐·작업 이름·messageId 규칙·보관), `worker/pyproject.toml`, `worker/uv.lock`.
고친 파일(계획 7.1의 "receipts.py 재사용"을 위해 최소 변경): `worker/app/consumer/receipts.py` — `ReceiptWatcher`에 분류 함수·식별 필드를 바꿔 넣는 선택 인자(기본값은 10월 동작 그대로), 로그의 식별 필드 이름을 인자에서 가져옴.
바꾸지 않은 것: 계약 문서(`api/contracts/…`, `contract-summary.md`), api 코드, 10월 분석 처리 함수(`parent.py`·`child.py`), CI.

### 12.3 구현 결정

| # | 결정 | 근거 |
|---|---|---|
| D25 | (담당자 결정 2026-11-10, 안 B) 정상 추출 결과가 공백·제어문자뿐인 쪽만 readable=false·''(BR3.1). 어느 한 쪽이라도 쪽 읽기·`extract_text`에서 예외가 나면 파일 전체 FAILED(UNREADABLE_FILE), pages 없음. 시간 초과·메모리 부족·저장소(S3) 접근 실패는 기존 분류(D26) 그대로 | 아래 「D25 판단 근거」 |
| D26 | 자식 시간 초과·종결 없는 종료·MemoryError는 작업 실패가 아니라 FAILED(UNREADABLE_FILE) 결과로 확정 | NFR4.3·4.18: 10분 시한을 기다리지 않고 일찍 확정. 저장소 장애(SourceUnavailable)·자식 예외는 파일 탓이 아니므로 결과 없이 `WORKER_DEFECT`(자료는 시한으로 FAILED) |
| D27 | 자식→부모 결과는 계획의 "표준 출력 JSON" 대신 10월 자식 틀의 파이프 프레임(길이 머리 + UTF-8 JSON 한 개) | 10월 틀(spawn 자식은 표준 출력을 부모와 함께 써 작업별로 받을 수 없음, 프레임 상한·EOF 감지·종료 순서 재사용). **전달 방식 자체는 2026-11-10 담당자가 수용했다. 16 MiB 내부 한도 초과 시 처리와 손상·끊김 프레임의 결과 분류는 승인되지 않았으며, 16 MiB는 해결되지 않은 구현 제약이다**(2026-11-10 #420에 팀장 결정 요청 게시: https://github.com/JminAILab/CatchU/issues/420#issuecomment-6758888480 . 결정: [issuecomment-6759834176](https://github.com/JminAILab/CatchU/issues/420#issuecomment-6759834176) — §12.8) |
| D28 | 동시성 상한 1, 자식 시간 120초·메모리 512 MB 기본값 | 10월 소비자와 같은 종료 순서 제약(10/15 결정)으로 지금은 1만. 시간·메모리 값은 대표 PDF 측정(계획 11.4) 뒤 담당자 검토 |
| D29 | 수신 확인은 기록만, 결과 전송을 모르면 다시 보내지 않음(`RESULT_DISPATCH_UNKNOWN`) | NFR4.15·10월 원칙과 같음. 보냈는지 모를 때도 수신 확인 조회는 한다 |
| D30 | 메시지 모양은 계약 YAML이 아니라 코드(`envelope.py`)로 검사 | D18과 같은 이유(C-16 더하는 변경은 별도 계약 PR) |
| D31 | 자식 메모리 제한은 Linux(`resource.RLIMIT_AS`)에서만, Windows는 시간 제한만 | 플랫폼 제약. 배포(EC2·EKS)는 Linux |

**D25 판단 근거(후속 기록, 승인 원본 `rules.md`·`functional-spec.md`·C-16은 고치지 않음)**

- 처음 구현(2026-11-09, 안 A)은 쪽 단위 추출 예외를 그 쪽만 readable=false·''로 두었다. 2026-11-10 검토에서 승인 문서 어디에도 쪽 단위 추출 예외를 직접 다룬 규칙이 없어 쟁점으로 올렸고, 담당자가 안 B를 골랐다.
- BR3.2 logic "IF 파싱 예외 OR 쪽 수 = 0 THEN FAILED UNREADABLE_FILE"의 "파싱 예외"에 쪽 단위 파싱·글 추출 예외를 포함하는 것으로 읽는다. pypdf는 쪽 내용을 `extract_text` 때 해석하므로 쪽 단위 예외도 파일 구조를 읽지 못한 경우다.
- BR3.1의 readable=false는 "뽑은 글이 공백·제어 문자만"인 경우, 곧 추출이 *정상으로 끝난* 쪽에만 쓴다. 이렇게 두면 결과에서 "글이 없는 쪽"과 "읽다 실패한 쪽"이 섞이지 않는다(C-16·W2에 쪽 실패 사유 필드가 없어 섞이면 구분할 수 없음). team.md 「예외를 삼키지 않는다」와도 맞다.
- FR3.4·AC3.2.3("글이 안 나오는 쪽은 읽을 수 없음")은 정상 추출된 빈 쪽으로 계속 충족된다. 대가는 한 쪽 때문에 파일 전체를 다시 올려야 하는 것이며, 작성자는 BR2.3의 UNREADABLE_FILE 안내를 받는다.
- 결정 주체: 이 변경은 U8 담당자가 안 B를 고른 것(2026-11-10)이며, 승인된 U8 규칙 BR3.2("파싱 예외 → UNREADABLE_FILE")에 맞추어 worker의 예외 처리를 고친 것이다. 새 규칙을 만들거나 승인 범위를 넓히지 않으므로 별도 팀장 결정 없이 U8 담당자 결정으로 닫는다. BR3.2 문구에 "쪽 단위 추출 예외 포함"을 명시하려면 승인 산출물 정정 절차(재승인)가 필요하며, 이번에는 하지 않았다.
- 계약·소비 측 영향: failureCode 집합(3종)과 메시지 모양이 그대로라 C-16 변경안, api 수신부(Step 6), U3·U4·U5의 소비 측 코드는 바뀌지 않는다. 다만 **동작 영향은 있다**: 안 A라면 일부 쪽만 읽을 수 없는 SUCCEEDED(DONE)였을 PDF가 이제 FAILED(UNREADABLE_FILE)가 된다. FAILED 자료는 발행에 고를 수 없으므로(BR4.1) 그 PDF는 발행 사본(`published_pdf_page`)에 들어가지 않고, 따라서 U3 색인·U5 근거 대상에서도 빠진다. 작성자는 다시 올려야 한다(BR2.3). 실제로 얼마나 자주 생기는지는 대표 PDF 측정(계획 11.4) 전에는 모른다.
- 같이 고친 것: `extract.py`의 세 `except Exception` 블록이 `MemoryError`(Exception의 하위 종류)까지 삼켜 "파싱 실패"로 기록하던 것을, `MemoryError`는 그대로 올려 자식(`child.py`)의 메모리 제한 분류를 따르게 했다. 최종 결과 코드(UNREADABLE_FILE)는 같고 기록되는 원인만 바로잡혔다.
- R-MEM(2026-11-10 대조, 같은 날 담당자 지시로 반영 — 아래 마지막 항목): `reader.py`의 `MemoryError` 분류를 메모리 부족 규칙(NFR4.3·NFR4.18, 신뢰성 설계 「제한을 넘으면 FAILED(UNREADABLE_FILE)」, D26)과 대조했다.
  - 로컬 읽기(`_read_local`): `OSError`만 잡으므로 `MemoryError`는 자식까지 올라가 UNREADABLE_FILE이 된다. **규칙과 맞다.**
  - S3 `get_object` 호출: `ClientError`·`BotoCoreError`·`OSError`만 잡으므로 `MemoryError`는 올라간다. **맞다.**
  - S3 본문 읽기(`body.read`·`_read_limited`의 조각 모으기·합치기, 반영 전): `except Exception`이 `MemoryError`까지 잡아 `SourceUnavailable`로 바꿨다. 그러면 자식은 결함 프레임을 보내고 부모는 결과 없이 `WORKER_DEFECT`로 끝내므로, 자료는 10분 시한 뒤 DEADLINE_EXCEEDED가 된다. **규칙과 어긋난다**(제한에 걸린 작업은 FAILED(UNREADABLE_FILE)로 10분보다 일찍 확정되어야 함). 저장소 장애로 집계돼 원인도 흐려진다.
  - 가능성: 파일은 20 MB 상한이지만 본문 읽기는 조각 목록과 합친 바이트를 함께 들고 있어 약 40 MB가 잠시 필요하고, 그 위에 boto3·pypdf가 올라간다. 자식 메모리 제한은 설정으로 64 MB까지 낮출 수 있으므로(`CATCHU_WORKER_PDF_CHILD_MEMORY_MB` 하한), 배포(Linux, RLIMIT_AS 적용)에서 낮은 값을 쓰면 실제로 생길 수 있다.
  - 반영(2026-11-10 담당자 지시): 본문 읽기의 일반 예외 처리 앞에서 `MemoryError`를 `FileUnreadable`과 함께 그대로 올린다(`except (FileUnreadable, MemoryError): raise`). 자식(`child.py`)의 기존 메모리 부족 처리가 FAILED(UNREADABLE_FILE)로 보고한다. 다른 S3 오류(NoSuchKey → FileUnreadable, ClientError·BotoCoreError·OSError·그 밖 본문 읽기 예외 → SourceUnavailable)의 분류와 처리, 본문 닫기는 그대로다.
  - 시험(합성): ① 단위 — 가짜 S3 본문이 `MemoryError`를 내면 `read_pdf`가 그대로 올리고 본문을 닫는다, 같은 자리의 다른 오류(`ConnectionResetError`)는 여전히 `SourceUnavailable`이다. ② 처리 함수 — 실제 자식이 실제 `read_pdf`의 S3 경로(가짜 클라이언트)를 타다 본문 읽기에서 `MemoryError`가 나면, 결과가 `PdfExtractionResult` 1회·FAILED·UNREADABLE_FILE·pages 없음으로 나가고 `SourceUnavailable` 로그가 없다. 두 시험은 고치기 전 코드로 되돌려 돌렸을 때 실패함을 확인했다(2 failed).
  - **합성 시험과 실제 메모리 제한 검증은 다르다**: 위 시험은 `MemoryError`를 코드로 일으킨 것이다. Linux `RLIMIT_AS`로 자식 메모리를 실제로 제한했을 때 그 자리에서 `MemoryError`가 나는지(커널이 프로세스를 바로 죽이는 경우는 부모의 CHILD_EXITED 경로로 같은 결과가 됨)는 Windows에서 확인할 수 없어 **미검증**이다(§12.5).

### 12.4 시험·검사 결과(그대로)

검사 환경: Windows 11, `uv 0.12.17`, Python 3.12.10, ruff 0.16.8, mypy 2.3.1, pytest 9.1.1, pypdf 7.0.0, boto3 1.43.126. 큐는 가짜 출력 큐(`consumer_support.FakeOutput`)·가짜 결과 작업 조회(`FakeResultJobs`), 원본은 임시 폴더의 로컬 뿌리, S3는 가짜 클라이언트. 자식 프로세스는 실제 spawn.

| 명령(`cd worker`) | 결과 | 종료 코드 |
|---|---|---|
| `uv sync --locked`(2026-11-10 이어받기 전 확인) | 통과 | 0 |
| `uv run --locked ruff check .` | All checks passed! | 0 |
| `uv run --locked ruff format --check .` | 139 files already formatted(이어받을 때 Step 7 파일 4개에 `ruff format` 적용, 새 시험 파일도 포맷 적용) | 0 |
| `uv run --locked mypy --platform linux` | Success: no issues found in 125 source files | 0 |
| `uv run --locked mypy`(Windows 기본) | `signal.SIGKILL` 없음 오류 2건(`app/consumer/service.py:387`, `tests/test_consumer_redis.py:282`) — 플랫폼 탓, Step 7 이전부터 있던 것. 새 파일 오류 없음 | 1 |
| (D25 반영 전) `uv run --locked pytest tests/test_pdf_extraction.py tests/test_pdf_consumer.py -q` | **66 passed, 1 skipped**(15.75초). 건너뜀 1건 = 심볼릭 링크 뿌리 밖 시험(Windows 권한) | 0 |
| `uv run --locked pytest -q`(전체, 새 시험 포함) | **2327 passed, 16 skipped, 5 failed**(13분 46초, 커버리지 실행과 겹쳐 느림) | 1 |
| 같은 명령의 기준선(같은 사본, 새 시험 없음, 다른 세션 측정) | 2261 passed, 15 skipped, 5 failed | 1 |
| (D25 반영 전) `uv run --locked pytest tests/test_pdf_extraction.py tests/test_pdf_consumer.py --cov=app/pdf_extraction --cov-report=term-missing` | 66 passed, 1 skipped. `app/pdf_extraction` **TOTAL 86%**(child 83%, envelope 87%, extract 93%, reader 88%, settings 98%, worker 80%) | 0 |
| (D25 반영 뒤) `ruff check .` / `ruff format --check .` / `mypy --platform linux` | All checks passed! / 139 files already formatted / Success: no issues found in 125 source files | 0 |
| (D25 반영 뒤) `uv run --locked pytest tests/test_pdf_extraction.py tests/test_pdf_consumer.py -q` | 71 passed, 1 skipped(21.92초) | 0 |
| (D25 반영 뒤) 같은 두 파일 `--cov=app/pdf_extraction --cov-report=term-missing` | 71 passed, 1 skipped. TOTAL 86%(child 83%, envelope 87%, extract 88%, reader 88%, settings 98%, worker 80%) | 0 |
| (R-MEM 확인) 고치기 전 `reader.py`로 잠시 되돌려 `pytest … -k memory_error` | 새 시험 2개 실패(2 failed, 1 passed) — 시험이 결함을 잡음을 확인. 곧바로 수정본으로 복구 | 1 |
| **(R-MEM 반영 뒤, 최종)** `ruff check .` / `ruff format --check .` / `mypy --platform linux` | All checks passed! / 139 files already formatted / Success: no issues found in 125 source files | 0 |
| **(R-MEM 반영 뒤, 최종)** `uv run --locked pytest tests/test_pdf_extraction.py tests/test_pdf_consumer.py -q` | **74 passed, 1 skipped**(19.04초) | 0 |
| (서비스 시험 추가 뒤, 2026-11-10) `ruff check .` / `ruff format --check .` / `mypy --platform linux` | All checks passed! / 140 files already formatted / Success: no issues found in 126 source files | 0 |
| (서비스 시험 추가 뒤) `uv run --locked pytest tests/test_pdf_extraction.py tests/test_pdf_consumer.py tests/test_pdf_service.py tests/test_consumer_settings.py -q` | **124 passed, 4 skipped**(건너뜀: 심볼릭 링크 1, 실제 Redis 필요 3) | 0 |
| (실제 Valkey, 2026-11-10) `CATCHU_TEST_REDIS_URL=redis://127.0.0.1:6391 uv run --locked pytest tests/test_pdf_service.py -q` | **10 passed**(4.76초) | 0 |
| (실제 Valkey) `CATCHU_TEST_REDIS_URL=redis://127.0.0.1:6391 uv run --locked pytest tests/test_consumer_redis.py -q` | 3 passed, 8 failed, 1 skipped — 실패 8건은 Windows의 `add_signal_handler` 미지원(§12.5) | 1 |
| **(R-MEM 반영 뒤, 최종)** 같은 두 파일 `--cov=app/pdf_extraction --cov-report=term-missing` | 74 passed, 1 skipped. **TOTAL 86%**(child 83%, envelope 87%, extract 88%, reader 91%, settings 98%, worker 80%) | 0 |

최종 판본: `reader.py` sha256 `14f8cae63b40…`, `extract.py` `d09ab7325193…`, `test_pdf_extraction.py` `ae40413ca960…`, `test_pdf_consumer.py` `78fcc8387114…`(`GENEROUS = 60.0`, `SHORT = 3.0`), `pdf_children.py` `a4d0e188cb76…`. 전체 `pytest -q`는 D25·R-MEM 반영 전·시험용 제한 20초 판본으로만 돌렸다(아래). 두 변경은 `app/pdf_extraction/extract.py`·`reader.py` 안에서 끝나고 그 모듈을 부르는 것은 PDF 시험뿐이라 다른 시험에 영향이 없다고 보지만, 최종 판본으로 전체를 다시 돌리지는 않았다.

전체 실행의 실패 5건은 기준선과 같은 5건이며 Step 7과 무관하다: `test_candidate_same_change.py`의 `test_paths_git_quotes_or_keeps_match_git`·`test_diff_paths_quoted_by_git_defaults_are_read`(파일 이름의 `"`를 Windows가 막음), `test_consumer_processor.py`의 `test_child_ignoring_sigterm_is_killed_and_reaped`·`test_time_limit_covers_child_launch_and_late_child_is_reaped`·`test_child_exits_by_itself_when_parent_is_killed`(Windows의 SIGKILL·`/proc` 의존, U8 변경 없는 판본 `f37e77d0`에서도 같은 실패). 늘어난 수(통과 +66, 건너뜀 +1)는 새 시험 수와 같다. 새 PDF 시험은 SIGKILL·`/proc`에 기대는 단언(`pid_alive` 등)을 쓰지 않는다.

시험 도중 고친 것: (1) Windows 자식 stderr가 cp949로 나와 한글 로그 문구를 맞출 수 없어, 자식 로그 확인은 ASCII 부분(`ERROR app.pdf_extraction.child … UNREADABLE_FILE`)으로 한다. (2) 처음 커버리지 측정에서 정상 사례 6건이 자식 시간 제한(당시 20초)에 걸렸다. `--cov`의 자식 계측이 pypdf·botocore 불러오기를 약 0.19초에서 약 10.9초로 늘린 탓이라(측정), 정상 사례의 시험용 자식 제한을 60초로 올렸다. 정상 사례는 자식이 끝나는 즉시 돌아오므로 계측 없는 실행 시간은 그대로다. 위 전체 실행은 20초 값으로 돌았고 모두 통과했다. 앱 코드·판정·임계값은 바꾸지 않았다.

새 시험 내역(D25 반영 전 기준, 바뀐 것은 다음 문단): `test_pdf_extraction.py` 40개(추출 — 다쪽 정상, 빈 쪽 readable=false·'', 암호화→ENCRYPTED, 쓰레기 바이트 3종→UNREADABLE_FILE, 0쪽→UNREADABLE_FILE, 50쪽 성공·51쪽→PAGE_LIMIT_EXCEEDED, NUL 제거·공백·제어문자만 6종, 추출 글 NUL 제거, 한 쪽 예외→그 쪽만 readable=false / 읽기 — 로컬 정상·없음·20 MB 초과·키 모양 거부 6종·뿌리 밖 링크(건너뜀), 가짜 S3 정상·NoSuchKey→FileUnreadable·AccessDenied·네트워크→SourceUnavailable·20 MB 초과·잘못된 키는 클라이언트 호출 없음 / 설정 — 경로 없음→None, 로컬·버킷 정상, 둘 다·동시성 2·잘못된 버킷·상대 경로·경로 없이 옵션만·시간 0→SettingsError). `test_pdf_consumer.py` 27개(봉투 위반 9종→`PDF_REQUEST_INVALID`·자식·전송·수신 확인 조회 없음, 정상→`PdfExtractionResult` 1회·jobId `message-pdf-{id}-result`·attempts 1·`is_valid_result`·수신 확인 조회 1건, 암호화→FAILED ENCRYPTED, 파일 없음→FAILED UNREADABLE_FILE, 자식 시간 초과·종결 없이 종료·MemoryError→FAILED UNREADABLE_FILE(로그로 원인 확인), 자식 예외·SourceUnavailable→`WORKER_DEFECT`·결과 없음, 결과 전송 실패→`RESULT_DISPATCH_UNKNOWN`·재전송 없음, 수신 확인 읽고 결과 작업 지움, `classify_receipt` 7종, 부모·자식 로그에 쪽 글·storageKey·memberId 없음).

D25 반영(2026-11-10)으로 바뀐 시험: `test_pdf_extraction.py`의 "한 쪽 예외→그 쪽만 readable=false" 1개를 빼고, 정상 쪽+추출 예외 쪽(첫·가운데·마지막 쪽 3종)→파일 전체 FAILED UNREADABLE_FILE·pages 없음, 정상 쪽+빈 쪽(예외 없음)→SUCCEEDED·빈 쪽만 readable=false·'', 쪽 추출 중 MemoryError는 삼키지 않고 올라감을 더했다(40→44개). `test_pdf_consumer.py`에 실제 자식에서 쪽 추출 예외→결함(`WORKER_DEFECT`)이 아니라 FAILED UNREADABLE_FILE 결과 1회 발송을 더했다(27→28개, 자식 대상 `pdf_children.page_extract_error`).

R-MEM 반영(2026-11-10)으로 더한 시험: `test_pdf_extraction.py`에 S3 본문 읽기 `MemoryError`는 그대로 올라감·다른 본문 읽기 오류는 `SourceUnavailable` 유지(44→46개), `test_pdf_consumer.py`에 S3 본문 읽기 `MemoryError` → FAILED UNREADABLE_FILE 1회·pages 없음(28→29개, 자식 대상 `pdf_children.s3_body_memory_error`).

### 12.5 미검증·미실행 항목(합성 검증과 구분)

- **합성 시험(검증됨)**: 위 §12.4. 합성 PDF 바이트·가짜 큐·가짜 S3 클라이언트·실제 자식 프로세스.
  - 이 절과 §12.3·§12.4의 "결과 1회"·"1회 발송"은 **가짜 출력 큐(`FakeOutput`)에 대한 전송 시도가 한 번**이라는 뜻이다(`output.attempts == ["PdfExtractionResult"]`, 다시 넣기 없음). 실제 Redis 큐에 들어갔는지, api 수신기가 받아 저장·수신 확인했는지는 검증하지 않았다(아래 「실제 큐·api 연결」).
- **실제 S3 연결: 미검증.** #389(S3 버킷·역할) 미준비. `reader._read_s3`는 가짜 클라이언트로만 확인(NoSuchKey·AccessDenied·네트워크 오류·20 MB 초과·정상). 실제 GetObject 권한·지역·자격 체인은 #389 뒤 개발 서버에서 확인한다.
- **실제 큐(Redis/Valkey)·api 연결: 미검증.** `CATCHU_TEST_REDIS_URL`이 없어 `requires_redis` 시험은 건너뛴다. 로컬 Docker에 다른 세션의 개발 스택(`catchu-dev-1110-queue`, valkey 8.1.6, 127.0.0.1:6379)이 떠 있으나, 쓰고 있는 스택이라 담당자 확인 없이 시험에 쓰지 않았다. 확인할 것: (1) api가 넣은 `PdfExtract` 작업을 PDF Worker가 소비하는지, (2) `worker-messages`의 `PdfExtractionResult`를 api 수신기가 받아 수신 확인을 반환값으로 남기고 worker가 그것을 읽어 결과 작업을 지우는지, (3) 분석 Worker와 PDF Worker가 서로 기다리지 않고 독립 기동·종료하는지(계획 7.3의 "분석 Worker와 독립 기동"), (4) 상태 확인 응답.
- **메모리 부족 처리 — 합성 시험(검증됨)과 실제 메모리 제한(미검증)을 구분한다.**
  - 합성 시험(검증됨): 코드로 `MemoryError`를 일으켜 확인했다. 자식의 추출 단계(`pdf_children.memory_error`), 쪽 추출(`test_page_memory_error_is_not_swallowed`), S3 본문 읽기(R-MEM 시험 2개)에서 모두 FAILED(UNREADABLE_FILE) 결과의 전송 시도가 가짜 출력 큐에 1회 일어난다(실제 Redis·api 수신 아님).
  - 실제 Linux `RLIMIT_AS` 제한(미검증): Windows에는 `resource` 모듈이 없어 제한이 걸리지 않는다. 실제 제한에서 `MemoryError`가 어느 자리에서 나는지, 커널이 자식을 바로 죽이는 경우 부모의 CHILD_EXITED 경로로 같은 결과가 나는지는 Linux(CI 또는 개발 서버)에서 확인해야 한다.
- **서비스 둘째 Worker 경로(2026-11-10 `tests/test_pdf_service.py` 추가·보완, sha256 `8cb5deb560f9…`)**
  - Redis 없이 실행(통과 7건): 환경 설정 → `ConsumerSettings.pdf` 연결(없음·로컬·버킷·둘 다 오류), PDF 읽기 경로가 분석 자식 설정에 들어가지 않음, 소비자를 끈 환경에서 PDF Worker를 띄우지 않고 0으로 끝남, 큐 서버에 붙지 못한 상태에서 두 Worker가 다른 큐(`analysis-requests`·`pdf-extraction-requests`)·다른 인스턴스·동시성 1로 만들어지고 starting/503으로 답함, PDF Worker 실행 작업이 예상 밖으로 끝나면 서비스가 종료 순서를 밟아 1로 끝남, `replace`가 pdf 설정을 보존함.
  - **실제 Valkey에서 실행(통과 3건)**: 이번에만 띄운 전용 임시 컨테이너 `catchu-u8-step7-valkey-test`(`valkey/valkey:8.1.6-alpine`, `127.0.0.1:6391`, 저장 끔, `--rm`)에 `CATCHU_TEST_REDIS_URL=redis://127.0.0.1:6391`로 연결했다. 사용 중인 다른 스택(`catchu-dev-1110-*`)은 쓰지 않았고, 실행 뒤 컨테이너를 멈춰 자동 삭제했다(기존 스택은 그대로 실행 중). 확인한 것: 정상 기동(running/200) 뒤 PDF 작업 → `worker-messages`에 `message-pdf-{id}-result`·규격 통과·SUCCEEDED·예상 글·요청 작업 completed / **W-10** 분석 자식(합성, 30초 대기)이 일하는 동안 넣은 PDF 작업의 결과가 SUCCEEDED·예상 글로 나오고 그때 분석 작업은 active / 종료 중 PDF 자식이 멈춰 있으면 PDF 작업 `WORKER_STOPPING`·결과 없음·0으로 끝남. 시험은 자식 시작 대기에 시간 제한을 두고, 실패해도 서비스를 종료 요청·대기·취소로 정리한다. 같은 파일 10건 합계: `10 passed in 4.76s`. 구분: 실제 것은 Valkey 연결·BullMQ Worker·자식 프로세스이고, 분석 자식은 합성(MOCK), PDF는 로컬 뿌리의 합성 PDF이며, api 수신기는 없어 수신 확인은 기록되지 않는다.
  - 분석 소비자 실제 Redis 회귀(`test_consumer_redis.py`, 같은 임시 Valkey): **3 passed, 8 failed, 1 skipped**(177.81초). 통과 3건은 서비스를 같은 프로세스에서 띄우는 `test_health_states`·`test_events_removed_on_completion_and_result_kept_until_read`·`test_failed_reason_is_fixed_code_without_stacktrace`. 실패 8건(`test_stop_signal_at_each_moment` 5종, `test_shutdown_over_budget_kills_itself_with_137`, `test_parent_killed_mid_analysis_fails_without_rerun`, `test_lock_renewed_while_child_works`)은 모두 하네스(`tests/consumer_harness.py`)가 서비스를 별도 프로세스로 띄울 때 `loop.add_signal_handler`가 Windows에서 `NotImplementedError`를 내 시작하지 못한 것이다. 이 코드는 U8 변경 전(HEAD `7ef0dd69`)부터 있으며, 실패는 PDF 코드에 닿기 전 서비스 기동 단계에서 난다. 건너뜀 1건은 Node 큐 키트가 없어서다. 이 8건은 Linux(CI)에서 확인해야 하며 이번에는 미검증이다.
  - 확인 중 알게 된 기존 동작(U8과 무관, 후속 후보): 큐 서버에 붙지 못한 상태에서 종료 요청만 하면 PDF가 없을 때도 `close()`가 연결 재시도를 기다려 종료 상한(시험값 8초)에 걸리고 강제 종료 경로로 간다(스크래치패드 비교 실행으로 PDF 있음·없음 모두 확인). 기존 `test_health_states`도 이 상태에서는 실행 작업을 취소하는 방식으로 시험한다.
- **심볼릭 링크로 뿌리 밖을 가리키는 경우**: Windows 권한으로 링크를 만들 수 없어 건너뜀(1건). Linux CI에서 돈다.
- **대표 PDF 측정(계획 11.4)**: 시간·메모리 기본값 검토는 Step 11 몫.
- **커버리지 80% 공식 판정**: Build and Test의 전체 스위트 몫.

### 12.7 격리 Linux·실제 연결 확인 (2026-11-10)

판본: 작업 트리 `api/u8-pdf-materials`·HEAD `7ef0dd69`의 미커밋 판본(주요 파일 sha256이 작업 트리와 같음을 확인). 작업 트리·브랜치·미커밋 변경은 바꾸지 않았다(실행 전후 `git status` 40항목 그대로). `api/dist`는 git 제외 대상이며 현재 소스로 다시 빌드했다.

환경(모두 이번에만 만든 자원, 끝난 뒤 이름 붙은 것만 지움: 컨테이너 4·이미지 1·네트워크 1·볼륨 2. 기존 `catchu-dev-1110-*`·`catchu-db-test`는 그대로 실행 중):
- Linux 시험 컨테이너 `catchu-u8-step7-linux-test`: `node:24`(Node 24.22.2) + 로컬 worker 이미지에서 복사한 CPython 3.12.10, 메모리 4 GB·CPU 4·프로세스 2048로 제한, 저장소는 읽기 전용으로 붙여 컨테이너 안에 복사. PyPI에서 `uv==0.12.17`과 `worker/uv.lock` 의존성, npm에서 큐 키트 의존성(`docs/queue-verification`, `npm ci`)을 받았다.
- 전용 Valkey(`valkey/valkey:8.1.6-alpine`) 2개, 전용 Postgres(`pgvector/pgvector:0.8.7-pg16-trixie`, `127.0.0.1:55491`) 1개. WSL은 서비스 오류(`Wsl/Service/0x80072747`)로 쓸 수 없었고, 복구에 필요한 `wsl --shutdown`은 기존 Docker 스택을 멈추므로 하지 않았다.

| 확인 | 결과 |
|---|---|
| `test_consumer_redis.py`(하네스 8건·Node 키트 포함) + `test_pdf_service.py` + `test_pdf_consumer.py` + `test_pdf_extraction.py`, `CATCHU_TEST_REQUIRE_NODE=1` | **98 passed**, 건너뜀 0(71.62초). Windows에서 신호 처리기 미지원으로 실패한 하네스 8건, Node 키트 부재로 건너뛴 1건, 심볼릭 링크 1건, 실제 메모리 제한 1건 모두 통과 |
| worker 전체 `pytest -q` | **2367 passed**, 실패·건너뜀 0(148.02초). 경고 1건은 외부 라이브러리(starlette)의 지원 종료 예고. Windows 기준선 실패 5건은 Linux에서 모두 통과해 환경 문제로 확정 |
| 실제 메모리 제한 (A) 자식 `RLIMIT_AS` 512 MB, 컨테이너 4 GB | Python `MemoryError` → 자식 로그 "메모리 제한 초과" → FAILED(UNREADABLE_FILE) 전송 시도 1회 → 자식 종료 코드 0 → 같은 처리 함수의 다음 정상 작업 SUCCEEDED. 승인 규칙(NFR4.3·NFR4.18)과 일치 |
| 실제 메모리 제한 (B) 컨테이너 400 MB, 자식 제한 16 GB(사실상 없음) | OS(cgroup) 강제 종료: 자식 종료 코드 -9(SIGKILL), 부모는 `cause=CHILD_EXITED`로 현재 구현대로 FAILED(UNREADABLE_FILE) 전송 시도 → 부모 생존 → 다음 정상 작업 SUCCEEDED. **이 분류(원인 불명 종료)는 팀장 결정 대기라 관찰로만 기록**한다(이 확인 시점의 상태. 같은 날 뒤의 팀장 결정으로 "원인 모를 종료 = 즉시 FAILED(UNREADABLE_FILE)"가 확정됐고 최종 처리는 §12.8 질문 2 표를 따른다 — 여기서 관찰한 현재 구현 동작과 같다) |
| 자식 정리 | (A)(B) 모두 남은 추출 자식 없음. 부모 아래 남은 프로세스는 `multiprocessing` spawn의 표준 `resource_tracker` 1개뿐 |
| 실제 연결(현재 구현 사이): api `QueuePdfExtractDispatcher` → 전용 Valkey → Linux worker 서비스(`python -m app.consumer`, PDF Worker 켜짐, 실제 자식·pypdf) → `worker-messages` → api `AnalysisQueueRunner`(`WorkerMessageConsumer` + `PdfExtractionReceiver`) → 전용 테스트 DB → worker가 수신 확인을 읽음 | **2 passed**: 정상 2쪽 PDF → `pdf_material` DONE·page_count 2·쪽 행 2(1쪽 글, 2쪽 readable=false·'')·worker 로그 `disposition=ACCEPTED code=OK` / 암호화 PDF → FAILED·ENCRYPTED·쪽 행 0·ACCEPTED/OK. worker 로그에 쪽 글·저장 키 없음 |

조건과 한계:
- 원본은 **실제 S3가 아니라** worker의 로컬 뿌리(`PDF_FILE_ROOT`)에 둔 합성 PDF다. PDF 행은 업로드 API가 아니라 시험 스크립트가 DB에 직접 넣었다(업로드 API는 Step 5 시험 몫).
- 이 확인은 **현재 api·worker 구현 사이의 연결**이며 C-16 계약 승인이 아니다(C-16 더하는 필드는 별도 계약 PR).
- 연결 확인 스크립트는 저장소 밖(스크래치패드 `linux-env/pdf-chain.e2e.cjs`)의 일회성 확인이라 저장소 시험으로 남지 않는다. 남길지는 담당자 결정.
- 배포 관련 관찰: 컨테이너 메모리 한도가 자식 `RLIMIT_AS`(기본 512 MB)와 부모 사용량의 합보다 작으면 (A)가 아니라 (B) 경로가 된다. 개발 서버·EKS의 worker 메모리 한도와 기본값의 관계는 Step 11(대표 PDF 측정)에서 함께 본다.

### 12.8 팀장 결정 반영 (2026-11-10)

근거: [#420 팀장 결정 댓글](https://github.com/JminAILab/CatchU/issues/420#issuecomment-6759834176) — 질문 1(상한 둠, PDF 글을 발행본 전체 글 60,000자에 포함, OQ-U4-4 종결, PDF 하나의 쪽 글 합도 60,000자·초과 시 추출 중 즉시 실패·새 사유 `TEXT_LIMIT_EXCEEDED`, 발행 거부 문구에 PDF, 세 곳 상수 상호 주석), 질문 2(표의 7개 상황 추천대로, 문구는 `UNREADABLE_FILE` 공통 문구·`DEADLINE_EXCEEDED` 별도 문구, 원인별 새 코드 없음), 기록(새 사유는 C-16 계약 PR에, 승인 설계 문서 BR2.3·BR3.2·BR4.5·신뢰성 설계 §2는 재승인·수정하지 않고 이 링크를 코드 요약·PR 본문에 적음). 승인 설계 문서 diff는 0줄이다.

**Step 7에서 반영한 것**

| 결정 | 반영 | 위치 |
|---|---|---|
| PDF 하나의 쪽 글 합계 ≤ 60,000자(코드 포인트, 읽을 수 없는 쪽 0자, NUL 뺀 뒤) | 쪽마다 더하다 넘는 쪽에서 추출을 멈추고 FAILED `TEXT_LIMIT_EXCEEDED`, 부분 pages 없음 | worker `extract.py`, `settings.py` `TEXT_LIMIT`·`PdfLimits.text_limit`, `child.py` |
| 결과 자체 검사·api 수신 검사에 같은 상한(BR4.5) | 합계 > 60,000이면 worker는 보내지 않고(`WORKER_DEFECT`), api는 `REJECTED/SCHEMA_INVALID`. api는 UTF-16 단위가 아니라 코드 포인트로 센다 | worker `envelope.py` `_valid_pages`, api `pdf-extraction-spec.ts` `PDF_TEXT_TOTAL_MAX`(= `SNAPSHOT_TEXT_TOTAL_MAX`)·`pagesWithinTextLimit` |
| 새 실패 사유 | worker 사유 4종, 엔티티 사유 5종, DB CHECK 교체 | api `pdf-material.entity.ts`, 마이그레이션 `1794289608328-AddPdfTextLimitFailureCode.ts`(TypeORM 생성, 이름 `ck_pdf_material_extraction_failure_code_62ec3d8c`), worker `envelope.py` `FAILURE_CODES` |
| 상수 상호 주석 | api `publications-config.ts`(OQ-U4-4 종결 표기)·`pdf-extraction-spec.ts`, worker `settings.py`가 서로와 web `PUBLISH_LIMITS.totalText`를 가리킴. web 쪽 주석은 Step 8.2 | 위 파일 |
| 질문 2 표 | 즉시 FAILED: 파일 오류, 메모리 부족·시간 초과, 원인 모를 종료(종결 프레임을 다 받기 전에 끝이 닫히고 **자식이 실제로 끝남**). 시한 대기(`WORKER_DEFECT`): S3 장애·자식 코드 결함, **완전히 받은** 프레임의 해석 불가·16 MiB 초과·종결 아닌 프레임·규격 위반(자식 종료 여부와 무관), 끝이 닫혔는데 자식이 살아 있음. 결과 반영: 유효한 결과를 받아 검사한 뒤의 비정상 종료 | worker `pdf_extraction/worker.py` `_watch` |
| 공유 읽기 구분(분석 소비자 공용) | `Signal.TRUNCATED`를 더함: Unix에서 프레임 본문 도중 끝남(CPython `OSError("got end of file during message")`)을 손상(`CORRUPT`)과 나눔. Windows는 같은 상황을 `EOFError`로 올린다. 분석 처리 함수는 모든 `Signal`을 그대로 CHILD_EXITED로 다뤄 동작 변화 없음 | worker `consumer/children.py` |

**Linux 끊김 문제(1차 재검증 실패 1건)의 원인과 해결**: 같은 "보내는 도중 끊김"이 Windows는 `EOFError`(→ 원인 모를 종료), Linux는 `OSError`(→ 손상, 시한 대기)로 올라와 `test_cut_while_sending_is_unknown_exit`가 Linux에서만 실패했다. 시험 기대값은 바꾸지 않고, 공유 읽기에서 본문 도중 끝남을 `TRUNCATED`로 따로 표시하고 PDF 처리 함수가 자식 종료를 확인한 뒤에만 원인 모를 종료로 확정하도록 고쳤다. 완전히 받은 손상 프레임은 자식이 정상 종료해도 파일 실패로 바꾸지 않는다(`corrupt_frame` 시험).

**시험 추가**: worker — 60,000/60,001 경계(한 쪽·세 쪽 합산), 이모지 60,000/60,001, 읽을 수 없는 쪽 0자, NUL 제외, 넘는 쪽에서 멈춤, 상한 안 최대 결과의 프레임·직렬화 크기 1 MiB 미만, 결과 자체 검사 경계, 실제 pypdf 50쪽×1,000자 통과·×1,250자 초과, 처리 함수에서 상한 초과 → FAILED `TEXT_LIMIT_EXCEEDED`·pages 없음, 손상 3종(해석 불가·16 MiB 초과·종결 아닌 프레임) → `WORKER_DEFECT`, 보내는 도중 끊김+자식 종료 → `UNREADABLE_FILE`, 끝 닫힘+자식 생존 → `WORKER_DEFECT`, 결과 뒤 비정상 종료 → 결과 유지, CPython 끊김 문구 감시(Linux 전용). api — 수신 상한 경계(60,000 한 쪽·세 쪽 합·이모지·읽을 수 없는 쪽 / 60,001 세 종류 거부·저장 없음, UTF-16 60,002단위 이모지 30,001자 수용), worker 사유 4종 목록, R-6 사유 4종 저장, DB CHECK가 `TEXT_LIMIT_EXCEEDED`를 받음.

**실행별 결과(판본·환경·명령·집계)**

| # | 판본 | 환경 | 명령 | 결과 |
|---|---|---|---|---|
| 1 | 결정 반영 1차(공유 읽기 구분 전) | Windows | worker `ruff check`·`ruff format --check`·`mypy --platform linux`, `pytest tests/test_pdf_extraction.py tests/test_pdf_consumer.py tests/test_pdf_service.py tests/test_consumer_settings.py` | 정적 검사 통과, 144 passed·5 skipped |
| 2 | 같은 판본 | 격리 Linux(`node:24`+CPython 3.12.10, 4 GB·4 CPU, 전용 Valkey) | `pytest tests/test_consumer_redis.py tests/test_pdf_service.py tests/test_pdf_consumer.py tests/test_pdf_extraction.py`(`CATCHU_TEST_REQUIRE_NODE=1`) / 전체 `pytest` | 117 passed·**1 failed** / **2386 passed·1 failed**. 실패는 둘 다 `test_cut_while_sending_is_unknown_exit`(위 원인) |
| 3 | 최종(공유 읽기 구분 뒤, `children.py` `3bbaef7ffdf4…`, `pdf_extraction/worker.py` `080aabe7d6e7…`, `extract.py` `8a3322528980…`, 시험 `test_pdf_consumer.py` `98211861b86b…`) | Windows | 정적 검사, `pytest tests/test_pdf_consumer.py tests/test_pdf_extraction.py tests/test_pdf_service.py` / `pytest tests/test_consumer_processor.py tests/test_consumer_receipts.py` | 정적 검사 통과, 102 passed·6 skipped(Linux 전용 2·심볼릭 링크 1·실제 Redis 3) / 47 passed·3 failed(기존 Windows 기준선 SIGKILL·`/proc` 3건, 변화 없음) |
| 4 | 최종(복사본 해시 일치 확인) | 격리 Linux | `pytest tests/test_consumer_redis.py tests/test_consumer_processor.py tests/test_pdf_service.py tests/test_pdf_consumer.py tests/test_pdf_extraction.py` / 전체 `pytest` | **155 passed** / **2389 passed**, 실패·건너뜀 0(경고 1: starlette 지원 종료 예고) |
| 5 | api 결정 반영 | Windows + 전용 임시 Postgres(`127.0.0.1:55492`) | `npm run lint`·`typecheck`·`build`, `test-with-db.cjs`로 `pdf-extraction-receiver`·`pdf-materials-api`·`pdf-tables`·`conventions`·`analysis-queue-consumer`·`analysis/receiver`·`s3-file-storage`·`u2/file-storage` | 정적 검사 통과, **98 passed·1 failed** — 실패는 `u2/file-storage` S22(Windows 심볼릭 링크 EPERM, §9.4와 같은 기존 환경 문제, 이번 변경과 무관) |
| 6 | 마이그레이션 | 같은 임시 Postgres | `migration:run`·`migration:revert`·`migration:run`·`migration:generate` | 적용·되돌리기·재적용 성공, 생성할 차이 없음 |
| 7 | 최종 | 실제 연결: api(Windows, `QueuePdfExtractDispatcher`·`AnalysisQueueRunner`+`PdfExtractionReceiver`) ↔ 전용 Valkey ↔ Linux worker 서비스(`python -m app.consumer`) ↔ 전용 Postgres | 저장소 밖 일회성 스크립트 `pdf-chain.e2e.cjs` | **4 passed**: 2쪽 정상(DONE), 암호화(FAILED ENCRYPTED), **정확히 60,000자**(실제 pypdf 50쪽×1,200자 → DONE·50쪽·DB 글 합 60,000자·전송 `pages=50`), **60,001자**(49쪽×1,200+1,201 → FAILED `TEXT_LIMIT_EXCEEDED`·전송 `pages=0`·DB 쪽 행 0). 모두 수신 확인 ACCEPTED/OK를 worker가 읽음. worker 로그에 쪽 글·저장 키 없음 |

기록 정정·보충(2026-11-10 담당자 지시):
- **worker 전체 2,389건 통과는 Linux(4번)만의 결과다.** Windows에서는 최종 판본으로 worker 전체를 다시 돌리지 않았다. Windows의 최종 판본 결과는 3번(PDF 시험 102 passed·6 skipped, 분석 처리 함수 회귀 47 passed·3 failed 기존 기준선)뿐이고, 마지막 Windows 전체 실행은 Step 7 초기 판본의 2327 passed·16 skipped·5 failed(§12.4)다.
- **실제 Linux 메모리 제한 시험**: `tests/test_pdf_consumer.py::test_real_memory_limit_sends_failed_unreadable_once`. 조건은 Linux에서만 실행(Windows 건너뜀), 자식 `RLIMIT_AS` 기본 512 MB, 컨테이너 메모리 4 GB, 자식이 추출 단계에서 1 MiB씩 실제로 할당(`pdf_children.allocate_until_limit`, `MemoryError`를 코드로 일으키지 않음, 4 GiB까지 할당되면 시험 실패). 기대는 FAILED(UNREADABLE_FILE) 전송 시도 1회·pages 없음. 결과는 2번·4번 Linux 실행에서 통과다(두 실행 모두 `-rs` 건너뜀 0건, 실패는 2번의 끊김 시험 1건뿐. `-q` 출력이라 개별 시험 이름 줄은 없다). OS 강제 종료 경로는 §12.7 (B) 관찰로만 남는다.
- **별도 유지(미검증·미승인)**: 실제 S3 읽기(개발 서버 접근 권한·범위 확인 전), 업로드 API를 거친 연결(7번은 PDF 행을 직접 넣음), C-16 계약 승인(초안만, PR 미생성)은 이번 검증에 포함되지 않는다.

조건 구분: 7번은 실제 api 코드·큐(Valkey)·DB(Postgres)·worker 서비스·자식 프로세스·pypdf를 썼고, 원본은 **실제 S3가 아니라** worker 로컬 뿌리의 합성 PDF, PDF 행은 시험 스크립트가 DB에 직접 넣었다(업로드 API 아님). 이것은 현재 구현 사이의 연결 확인이며 C-16 계약 승인이 아니다. 1·3·5번은 합성 자료·가짜 큐 또는 테스트 DB 시험이다. 실제 S3는 미검증이다.

임시 자원: `catchu-u8-step7-linux-test`·`-valkey-linux`·`-valkey-e2e`·`-pg2`(익명 볼륨 포함)·`-linux-net`·`-pyvol`을 이름·생성 시각으로 확인하고 하나씩 지웠다. 기존 `catchu-dev-1110-*`·`catchu-db-test`는 그대로 실행 중이다. 일괄 정리 명령은 쓰지 않았다.

**Step 8.2·10으로 넘긴 것(계획 보완 항목으로 연결)**: 발행본 전체 글 검사에 PDF 쪽 글 포함(U4 `snapshot-builder.ts`·발행 시험, U8 PR에 함께), web 발행 거부 문구 `TOTAL_TEXT_LIMIT_TEXT`에 PDF 포함과 `PUBLISH_LIMITS.totalText` 상호 주석, 추출 실패 사유별 문구(`TEXT_LIMIT_EXCEEDED`·`UNREADABLE_FILE` 공통 문구·`DEADLINE_EXCEEDED`). C-16 계약 PR 초안은 공유 노트 폴더 `u8-c16-contract-pr-draft.md`(PR 미생성).

### 12.6 계획 이탈·계약 후속

- 계획 밖 파일 변경: `worker/app/consumer/receipts.py`(위 §12.2 이유), 계획에 이름 없던 `envelope.py`·`__init__.py`, 시험 도우미 `pdf_synthetic.py`·`pdf_children.py`.
- 계획 7.1 "결과 JSON 표준 출력" → 파이프 프레임(D27).
- 계획 7.3 "분석 Worker와 독립 기동"은 실제 Redis가 필요해 이번 시험에 없다(§12.5).
- **C-16 계약 PR 후속(계획 12.2, §11.6과 같은 건)**: worker 구현이 전제하는 더하는 변경 필드 — 요청 `PdfExtract`의 `schemaVersion`("2")·`messageId`(`pdf-extract-{pdfMaterialId}`)·`memberId`, 결과 `PdfExtractionResult`의 `schemaVersion`·`messageId`(`message-pdf-{pdfMaterialId}-result`)·`memberId`·`failureCode`(ENCRYPTED·UNREADABLE_FILE·PAGE_LIMIT_EXCEEDED), 수신 확인 `{schemaVersion, messageId, pdfMaterialId, disposition, code}` — 는 아직 C-16 계약 원문(통합 브랜치)에 없다. 별도 계약 수정 PR이 필요하며, 검토에서 달라지면 api `pdf-extraction-spec.ts`와 worker `envelope.py`·`queues.py`를 함께 고친다.
- D25는 2026-11-10 담당자 결정(안 B)으로 닫았다(§12.3). D25 해결만으로 Step 7 검증이 끝나지 않는다.
- **남은 항목(Step 7)**: (1) 팀장 결정 2건 — 2026-11-10 [결정 댓글](https://github.com/JminAILab/CatchU/issues/420#issuecomment-6759834176)로 확정·반영(§12.8). 16 MiB 내부 한도는 60,000자 상한으로 정상 경로에서 닿지 않으며, 넘는 프레임은 내부 메시지 손상(시한 대기)으로 다룬다, (2) 서비스 연결·(3) W-10 — Windows 임시 Valkey와 격리 Linux에서 통과(§12.7), (4) 실제 S3 — 개발 서버 버킷·역할은 2026-11-10 준비 기록(#389 열림)이 있으나 접근은 개발 서버 EC2 역할로만 되어 로컬 미검증, (5) Linux 메모리 제한 — 격리 Linux에서 관찰 완료(§12.7). OS 강제 종료의 결과 분류는 팀장 결정 대기. R-MEM은 2026-11-10 반영해 남은 항목에서 뺐다(합성 시험까지, §12.3 끝). (2)(3)은 실제 Redis가 필요하며, 사용 중인 다른 스택의 Redis는 쓰지 않는다.
- 계획 체크(7.1~7.3)는 위 남은 항목 정리 전까지 보류한다. 체크·커밋·push·PR은 담당자 지시 뒤에 한다.
  - (2026-11-11 갱신) 위 줄은 2026-11-10 보류 시점의 기록이다. 남은 항목 (1)(2)(3)(5)는 §12.7·§12.8에서 정리됐고 — (5)의 "OS 강제 종료의 결과 분류는 팀장 결정 대기"도 §12.8의 팀장 결정(원인 모를 종료 = 즉시 FAILED)으로 닫혔다 — (4) 실제 S3는 후속으로 남긴 채, 2026-11-11 담당자 지시로 7.1~7.3을 체크했다(§12.9). 이날은 기존 로그·해시·현재 코드 대조만 했고 시험을 새로 실행하지 않았다. 커밋·push·PR은 여전히 하지 않았다.

### 12.9 완료 판단과 계획 체크 (2026-11-11)

**담당자가 점검 결과를 수용해 계획 7.1~7.3을 체크했다.** 커밋·push·PR은 하지 않았고 Step 9는 착수하지 않았다.

**이날 한 일은 대조뿐이다 — 시험을 새로 실행하지 않았다.** 기존 실행 로그, 파일 해시, 현재 코드를 맞춰 보고 기존 증거가 현재 작업본에 그대로 적용되는지 판단했다.

- worker의 Step 7 파일은 2026-11-10 15:07 뒤로 바뀌지 않았다. 현재 sha256이 §12.8 실행 4번(격리 Linux, 15:14, Step 7 세션 스크래치패드 `linux-env/run3.txt`)에 찍힌 값과 같다 — `consumer/children.py` `3bbaef7ffdf4…`, `pdf_extraction/worker.py` `080aabe7d6e7…`, `extract.py` `8a3322528980…`, `tests/test_pdf_consumer.py` `98211861b86b…`. `reader.py` `14f8cae63b40…`·`tests/test_pdf_service.py` `8cb5deb560f9…`도 §12.4·§12.5 기록과 같다.
- 현재 작업본에서 `test_pdf_extraction.py`·`test_pdf_consumer.py`·`test_pdf_service.py`를 수집만 하면(`--collect-only`, 실행 아님) 108건으로, §12.8 실행 3번의 102 passed + 6 skipped와 같다.
- 그 뒤 바뀐 Step 7 관련 파일은 api `src/pdf-extraction/pdf-extraction-spec.ts` 하나다(2026-11-10 15:26, Step 8의 의존 방향 바로잡음 — `PDF_TEXT_TOTAL_MAX`를 따로 둠, §13.2).

| 계획 | 판단 | 근거 | 계획과 다른 점 |
|---|---|---|---|
| 7.1 읽기·쪽별 추출·오류 분류 | 체크 | 계획의 다섯 파일 구현(§12.1). 글 합계 상한은 `extract.py`가 쪽마다 더하다 60,000을 넘는 쪽에서 멈추고 `TEXT_LIMIT_EXCEEDED`만 돌려준다(부분 pages 없음, 정확히 60,000은 통과). 뒷받침 시험: `test_text_limit_counts_code_points_across_pages`(60,000/60,001 한 쪽·세 쪽 합산·이모지, 빈 쪽 0자, NUL 제외), `test_text_limit_stops_extraction_at_exceeding_page`, `test_text_limit_with_real_pypdf_extraction`, `test_result_self_check_applies_text_limit`, `test_text_limit_sends_failed_without_pages`, api `pdf-extraction-receiver.test.cjs` "쪽 글 합계 상한" | 결과 전달은 파이프 프레임(D27), 쪽 추출 예외는 파일 전체 실패(D25) |
| 7.2 기동·종료·큐·의존성 | 체크 | PDF 설정이 있으면 둘째 Worker를 같은 이벤트 루프에 띄우고 같은 종료 순서에 넣음, 상태 확인은 두 Worker 모두 running일 때 running. 큐·작업 이름·메시지 ID 규칙이 api `pdf-extraction-spec.ts`와 같음. `boto3==1.43.126`·`pypdf==7.0.0`이 `pyproject.toml`·`uv.lock`에 있음. `test_pdf_service.py` 10건(실제 Valkey 3건 포함) | 없음 |
| 7.3 시험 | 체크 | 최종 판본 격리 Linux 155 passed / worker 전체 2389 passed, 실패·건너뜀 0(§12.8 실행 4번). Windows 최종 판본은 PDF 시험 102 passed·6 skipped(실행 3번)이고 worker 전체는 최종 판본으로 다시 돌리지 않았다 | "분석 Worker와 독립 기동"(W-10)은 `test_pdf_consumer.py`가 아니라 `test_pdf_service.py`에 있다 |

**실제 연결 4건(§12.8 실행 7번)의 범위와 증거 구분**

- **시점**: 2026-11-10 15:14~15:16에 실행했다. api 명세 파일 `pdf-extraction-spec.ts`가 바뀌기(15:26) **전**이다. 변경 뒤에는 연결 4건을 다시 돌리지 않았고, 변경 뒤 판본에 대해 확인된 것은 **api 수신기 시험 통과까지**다 — api 전체 회귀(2026-11-10 16:33~16:59, §13.3)에서 `pdf-extraction-receiver.test.cjs`의 "쪽 글 합계 상한"·"R-6 사유 4종" 시험이 통과했다. 상수 값(60,000)은 그대로다.
- **worker 로그로 확인한 것**(`linux-env/worker-e2e-2.log`): 네 사례의 추출 시작, 결과 전송(`outcome=SUCCEEDED pages=2` / `FAILED pages=0` / `SUCCEEDED pages=50` / `FAILED pages=0`), 60,001자 사례의 "쪽 글 합계 상한 초과: page=50 limit=60000", 네 건 모두 수신 확인 `disposition=ACCEPTED code=OK`.
- **기록에만 남은 것**(실행 출력 파일 없음, §12.8 표의 서술이 근거): "4 passed" 집계, DB 단언 — `pdf_material` DONE/FAILED와 실패 사유, 쪽 행 수(50행·0행), 저장된 글 합계 60,000자.
- **거치지 않은 것**: 원본은 실제 S3가 아니라 worker 로컬 뿌리의 합성 PDF이고, PDF 행은 업로드 API가 아니라 스크립트가 DB에 직접 넣었다. 스크립트(`pdf-chain.e2e.cjs`)는 저장소 밖 일회성이다.

**후속으로 유지(체크와 무관하게 미검증·미완료)**

- 실제 S3 읽기(`reader`의 S3 경로는 가짜 클라이언트로만 확인, §14).
- 업로드 API부터 추출까지 이어지는 연결.
- 배포 환경(개발 서버·EKS)의 worker 메모리 한도와 자식 제한 기본값 검증(Step 11 대표 PDF 측정과 함께, §12.7).
- C-16 계약 PR 생성(초안만 있음, §12.6).

## 13. Step 8 — 발행의 PDF 부분 (2026-11-10 실행, 담당자 허용 뒤 — 검토 전)

> 계획 체크박스 8.1~8.3은 담당자 검토 뒤에 체크한다(2026-11-11 담당자 지시로 체크함, §13.6). 커밋·push·PR은 하지 않았다. U4 파일 변경은 팀장 결정대로 이 U8 PR에 함께 넣는 범위다.

입력: [코드 생성 계획](code-generation-plan.md) Step 8(8.1~8.3과 2026-11-10 보완 항목), [기능 명세](../functional-design/functional-spec.md) W3, [규칙](../functional-design/rules.md) BR4.1~BR4.5·BR5.1~BR5.6, [계약 요약](../../../inception/contract-design/contract-summary.md) C-17·C-07·C-08, [관측 설계](../nfr-design/observability-design.md) `PREFIX_CLEANUP_FAILED`, [#420 팀장 결정 2026-11-10](https://github.com/JminAILab/CatchU/issues/420#issuecomment-6759834176)(PDF 쪽 글을 발행본 전체 60,000자에 포함, OQ-U4-4 종결, 발행 거부 문구에 PDF, 상수 상호 주석). 승인 설계 문서는 고치지 않았다(diff 0줄).

선행 조건 확인: U4 발행 경로는 이 브랜치에 들어 있다(통합 브랜치 `af5fbf3`, PR #482 포함). 8.2는 PDF 항목이 발행 입력에 들어와야 성립하므로 미완료였던 8.1부터 했다.

### 13.1 계획 항목별 구현

| 계획 | 구현 | 위치 |
|---|---|---|
| 8.1 발행 입력에 `PDF_MATERIAL` | 항목 종류 3종(항목 수·중복 규칙은 U4 그대로) | `api/src/publications/publish-input.ts` |
| 8.2 사전 확인(트랜잭션 밖, 복사 전) | 작성자 기준 시한 판정(BR2.2)을 거친 상태가 모두 DONE이어야 함. 아니면 400 `VALIDATION_FAILED` `extractionIncomplete`(`items[i].sourceId`마다), 없음·남의 것은 404. 시한 판정은 커밋되도록 읽기 트랜잭션을 끝낸 뒤 판정 | `pdf-publish.ts` `assertPdfsDone`, `materials/pdf-material-store.ts` `readPdfStatesForPublish` |
| 8.2 C-17 1단계 | 발행본·항목 ID를 트랜잭션 전에 만듦(항상) | `publish.service.ts` `publish` |
| 8.2 2·3단계 | position 순 `copy(materialKey → publishedPdfKey)`, 실패면 `deletePrefix` 1회 뒤 500 | `pdf-publish.ts` `copyPdfs` |
| 8.2 4단계 | U4 잠금(Catch → 텍스트 자료) 뒤 PDF를 `pdf_material_id` 오름차순 `FOR SHARE`로 잠그고 DONE 재확인 → `published_item`(snapshot `{ pageCount }`, `pdf_copy_key`) → `published_pdf_page` `INSERT … SELECT`(읽을 수 없는 쪽 포함, 행 수가 쪽 수와 다르면 되돌림) | `pdf-publish.ts` `lockPdfsForPublish`·`copyPdfPages`, `publish.service.ts` `store` |
| 8.2 5·6단계 | 트랜잭션 실패면 `deletePrefix` 1회 뒤 원래 오류 그대로, 정리 실패는 로그 `PREFIX_CLEANUP_FAILED`(publicationId·단계 3/5·오류 종류, 키·접두어 값 없음) | `pdf-publish.ts` `cleanupPrefix` |
| 8.2 PDF 없는 발행 | PDF 항목이 없으면 `pdf-publish.ts`의 어떤 함수도 부르지 않고 FileStorage 호출 0회 | `publish.service.ts` |
| 8.2 보완(팀장 결정) 전체 글에 PDF 포함 | 잠근 `pdf_page_text`의 쪽 글을 `char_length`(= 코드 포인트)로 합해 전체 글 합계에 더함. PDF 하나가 상한 안이어도 다른 자료와 합쳐 60,000자를 넘으면 400 `maxTotalLength` | `pdf-publish.ts` `lockPdfsForPublish`(`textLength`), `publish.service.ts` `store` |
| 8.2 보완 web 발행 거부 문구 | "고른 자료의 전체 글(PDF 글 포함)이 60,000자를 넘었습니다. … PDF는 필요한 쪽만 남긴 파일을 새로 올려 대신 고를 수 있습니다." | `web/src/features/publications/publications-api.ts` `TOTAL_TEXT_LIMIT_TEXT` |
| 8.2 보완 상수 상호 주석 | web `PUBLISH_LIMITS.totalText`가 api·worker 위치를 가리킴(api·worker 쪽은 §12.8) | 같은 파일 |
| 8.3 시험 | `api/test/publications/publish-pdf.test.cjs` 15개(계획 (a)~(g) + P-h 2개 + 전체 글·상수 4개 + 완료 점검 보완 2개), web 문구 시험 1개 | §13.3·§13.5 |

### 13.2 계획과 다른 점·결정

- **기존 U4 시험 1건 수정**: 계획 8.3은 "기존 `publish-api.test.cjs`는 수정 없이 통과"라고 했지만, 그 시험의 입력 사례 하나가 `PDF_MATERIAL`을 "허용 밖 종류"로 단언하고 있어 8.1과 양립하지 않는다. 그 사례의 종류만 `IMAGE`로 바꾸고 머리 주석 한 곳을 고쳤다(판정 약화 없음, 나머지 사례·시험 무수정). **담당자 수용(2026-11-10)**: `PDF_MATERIAL`이 지원 종류가 됐으므로 "지원하지 않는 종류 거부" 시험의 입력을 `IMAGE`로 바꾼 것을 받아들인다. 수용 범위는 이 시험 수정에 한정한다(계획 체크·다른 이탈의 승인이 아님). 계획 8.3·시나리오 P-a의 "기존 `publish-api.test.cjs`는 수정 없이 통과"와 달라진 이유: 그 문구는 PDF 없는 발행의 기존 동작이 그대로임을 보이려는 조건인데, 같은 파일의 입력 사례 하나가 계획 8.1이 허용하기로 한 `PDF_MATERIAL`을 허용 밖 종류의 예로 쓰고 있어 8.1과 함께 성립할 수 없었다. 거부 판정은 그대로다 — 기대 결과(`items[0].kind`, `isIn`, 400 `VALIDATION_FAILED`)와 나머지 사례·시험은 바꾸지 않았고, 바뀐 것은 그 사례의 종류 값과 주석 두 줄뿐이다(`git diff`로 확인). 수정한 판본으로 `publish-api.test.cjs`는 단독 전체 실행(§13.3)에서 통과했다. **통합 시험 재확인(2026-11-11, 담당자 직접 실행)**: 시험 DB를 켠 상태에서 `api` 폴더의 `npm test -- test/publications/publish-api.test.cjs`가 10건 통과·실패 0건·건너뜀 0건이었고, 수정한 '입력 400' 시험도 통과했다. 이번 확인 범위는 이 기존 U4 발행 시험 파일 한 개이며, Step 8 전체 완료 체크와 Step 9 착수는 보류한다.
- **계획 목록 밖 파일**: `api/src/publications/pdf-publish.ts`(새 파일 — PDF 부분을 U4 서비스에서 떼어 둠), `snapshot-builder.ts`(주석만), `web/src/features/publications/publications-api.ts`·`web/test/publish.test.mjs`(팀장 결정의 문구·주석), `api/test/integration/result-application-b.test.cjs`(아래).
- **`PREFIX_CLEANUP_FAILED` 로그는 U8 전용 로거(`PdfPublish`)**: U4 로그 시험이 `Publications` 로그 줄의 칸 모양을 정확히 단언하므로 그 모양을 바꾸지 않았다.
- **의존 방향 바로잡음**: Step 7에서 `pdf-extraction-spec.ts`가 `publications-config.ts`를 불러오게 했던 것을 되돌렸다. materials·pdf-extraction은 publications를 import하지 않는 규칙(`pdf-material-store.ts` 머리 주석)이라, api의 PDF 상한(`PDF_TEXT_TOTAL_MAX = 60_000`)은 따로 두고 발행 시험이 두 값이 같은지 확인한다.
- **시험이 잡은 결함 1건**: 사전 확인을 한 트랜잭션에서 판정까지 하면 400을 던질 때 시한 판정(PENDING → FAILED `DEADLINE_EXCEEDED`)까지 되돌아갔다. 상태 읽기 트랜잭션을 먼저 끝내고 그 밖에서 판정하도록 고쳤다.
- **Step 7 누락 1건 보완**: Step 7의 새 마이그레이션(`1794289608328`)이 `result-application-b` 통합 시험의 마이그레이션 목록·되돌리기 순서에 없어 그 시험이 실패했다(당시 이 시험을 돌리지 않아 놓침). 기대 목록에 더하고 되돌리기 한 단계(표 수 34 그대로, CHECK에서 `TEXT_LIMIT_EXCEEDED`가 빠짐)를 넣었다.

### 13.3 시험·검사 결과

환경: Windows, 이 작업 전용 임시 Postgres `catchu-u8-step8-pg`(`pgvector/pgvector:0.8.7-pg16-trixie`, `127.0.0.1:55493`, `--rm`). FileStorage·AiRun·색인 쓰기는 가짜(합성 연결), PDF 행·쪽 글은 DB에 직접 넣음(업로드·추출을 거치지 않음). 실제 S3 복사는 아니다.

| 명령 | 결과 |
|---|---|
| api `npm run lint`·`typecheck`·`build` | 통과 |
| `test-with-db.cjs test/publications/publish-pdf.test.cjs` | **11 passed**(전체 실행 시점의 판본. 완료 점검에서 4개를 더한 15개 결과는 §13.5): 상수 일치, P-a(PDF 없는 발행·FileStorage 0회), P-g(복사 순서·사본 항목·쪽 사본·원본 변경/삭제에도 불변), P-f(PENDING·FAILED·시한 지난 PENDING → 400, 시한 판정 저장), P-f 404, P-b(복사 실패 → 정리 1회·500·DB 무변경), P-c·P-d(429·조각 예외 → 정리 1회·원래 오류), P-e(정리 실패 → 응답 유지·로그 단계 3·5·키 값 없음), 전체 글 3개 |
| 전체 글 사례 | PDF 단독 정확히 60,000자(쪽 3개, 빈 쪽 포함) 201 / +텍스트 1자 → 400 `maxTotalLength`·사본 정리. Catch 15,000 + 텍스트 5,000 + PDF 20,000 + PDF 20,000 = 60,000 → 201, 마지막 PDF가 20,001이면 400. 이모지 60,000자(UTF-16 120,000단위)·빈 쪽 2개 → 201, +이모지 1자 → 400 |
| web `npm run lint`·`typecheck`·`npm test` | 통과, **861 passed**(기존 문구 시험 무수정, 새 시험 1개) |
| api 전체 `test-with-db.cjs`(단독 실행, 제한 45분, 16:33:37~16:59:40) | 첫째 줄 145개 파일 **1711건: 1671 passed, 4 failed, 36 skipped**(1531.2초). 둘째 줄(대기) 5개 파일 30 passed(133.0초). 미리 도는 빌드 시험 1 passed |

**전체 실행의 실패 4건 — 모두 이번 변경 밖(같은 환경의 변경 전 판본 HEAD `7ef0dd69`와 비교)**

| 실패 | 현재 판본 단독 재실행 | 변경 전 판본 | 원인 |
|---|---|---|---|
| `u2/file-storage` S22 | 실패 | (Step 4 §9.4에서 확인) | Windows에서 심볼릭 링크 생성 권한 없음(EPERM). 기존 환경 문제 |
| `claude-mcp/mcp-connection` S6 "코드는 5분이다" | 1회 실패 뒤 3회 통과, 전체 실행에서 다시 실패 | 3회 통과 | 간헐. api(호스트 시계)가 적은 만료 시각을 DB 컨테이너 `now()`와 비교해 남은 시간 ≤ 300초를 요구한다. 측정한 시계 차이 −0.06~+0.26초로도 뒤집힌다 |
| `claude-mcp/mcp-endpoint` S9 "만료 시각이 지나면 거부" | 2회 실패 | 1회 통과·1회 실패 | 간헐. 만료 시각을 DB `now() − 1ms`로 두고 api의 호스트 시계로 판정한다. DB 시계가 1ms만 앞서도 실패 |
| `runtime/bootstrap` "개발 소스 main: env 파일의 인증 설정으로 기동·발급·종료" | 2회 실패 | 2회 실패 | 변경 전에도 실패. 이 PC 환경 문제로 보이며 원인은 이번에 더 파지 않았다 |

위 MCP 시험 2건·기동 시험 1건은 U8이 손대지 않은 파일이라 고치지 않았다(후속 후보: 시계가 다른 DB와 호스트를 비교하는 단언의 여유, 개발 소스 기동 시험의 Windows 원인).

**중단·미완료로 처리한 전체 실행 2건(결과로 쓰지 않음)**: 15:36 실행(세션 재시작 전에 띄움)이 살아 있는 줄 모르고 15:46에 같은 임시 DB로 전체 실행을 하나 더 띄웠다. 둘이 서로의 DB 초기화(`TRUNCATE`)·`dist` 다시 만들기와 겹쳐, 15:50:21부터 29분간 진전이 없었다(한쪽 발행 트랜잭션이 다른 연결의 조회를 기다리고 그 조회가 상대 실행의 `TRUNCATE` 뒤에 줄 선 상태, `dist`를 찾지 못한 통합 시험 6개 파일 실패). 로그와 중단 시점 DB 잠금 상태를 스크래치패드 `api-full-aborted/`에 남기고 두 실행의 프로세스 트리(PID 36464·38436)만 끝냈다(일반 종료는 Windows가 거부해 강제 종료). 겹친 시간대의 실패는 간섭 탓이라 위 단독 실행·재현 결과와 분리한다. 이후에는 실행 전에 남은 시험 프로세스와 DB 연결이 0인지 확인하고 제한 시간을 건다.

### 13.4 미검증·남은 것

- **실제 S3 복사·접두어 삭제: 미검증**(§14 — 버킷 준비, 드라이버 배포 후 확인 대기).
- 실제 U3 조각 나누기와의 연결(이번 시험은 색인 쓰기 가짜), 받은 사람·작성자 PDF 사본 열람(Step 9), web PDF 탭·실패 사유 문구(Step 10), 환경 예시·지역 설정(Step 11, §14.2), 문서(Step 12: `api/docs/publications.md`·`pdf-materials.md`).
- Linux에서 Step 8 시험 미실행(Windows만).

### 13.5 완료 점검 (2026-11-10, 담당자 요청 — 체크는 하지 않음)

**빠진 시험 보완**(구현 변경 없음, 시험 파일만): 시나리오 표의 **P-h가 시험에 없었다.** 아래 4개를 더해 `publish-pdf.test.cjs`는 15개다.

| 더한 시험 | 확인한 것 | 근거 |
|---|---|---|
| P-h 재확인 | 복사 뒤·트랜잭션 전에 원본이 지워지면 404, DONE이 아니게 되면 400 `extractionIncomplete`(항목 위치), 둘 다 정리 1회·발행본/쪽 사본 없음·조각 나누기 미도달 | BR4.2, 시나리오 P-h |
| P-h 잠금·순서 | 발행 트랜잭션 동안 다른 연결의 원본 삭제가 잠금 대기 초과(55P03)로 막힘(FOR SHARE), 조각 나누기 시점에 쪽 사본 3행이 이미 들어 있음 | BR4.2, W3 6 |
| 저장 불일치 | 쪽 수 3인데 쪽 행 2개인 원본 → 500, 정리 1회, 발행본·항목·쪽 사본 없음, 작업 등록 없음 | BR4.3 |
| 권한·상태 순서 | 동의 없음은 추출 전 PDF여도 400이 아니라 403이고 저장소 호출 0회. 미확인 Catch(409)는 PDF 복사 뒤라도 원래 오류·`details.catchIds` 그대로이고 정리 1회 | W3 순서, BR5.4 |

P-b는 복사 실패 종류 둘(`StorageUnavailable`·`FileNotFound` = DONE인데 파일 없음)로 넓히고 응답 본문과 `PDF_COPY_FAILED` 로그의 오류 종류를 함께 본다. 잠금 순서 자체(Catch → 텍스트 자료 → PDF)는 시나리오 표대로 코드 검토로 확인했다(`publish.service.ts` `store`: `lockCatches` → `lockTextMaterials` → 404 판정 → `lockPdfsForPublish`).

실행: 이 작업 전용 임시 Postgres `catchu-u8-step8b-pg`(`127.0.0.1:55494`, `--rm`, 실행 뒤 정리)에서 바뀐 파일 하나만 `timeout 300`으로 돌렸다 — **15 passed, 0 failed**. api `npm run lint` 통과. 다른 시험은 다시 돌리지 않았다.

**최종 판본과 회귀의 관계**: api 소스의 마지막 변경은 15:35:38(`publish.service.ts`)이고 `result-application-b` 시험 보완은 16:30경이다. 단독 전체 실행(16:33:37~16:59:40, §13.3)은 그 뒤라 **최종 소스 판본의 회귀**다(`pdf-publish.ts` `d4aecd296893…`, `publish.service.ts` `65016b56ba80…`, `publish-input.ts` `fd525763ec78…`, `pdf-material-store.ts` `59b41d8f47ef…`). 그 뒤 바뀐 것은 `publish-pdf.test.cjs`(`cc2f8cf207a1…`, 시험 추가)뿐이고 위에서 따로 돌렸다. 전체 실행의 실패 4건은 §13.3의 표대로 모두 기존·환경 실패이며 이번 변경이 만든 실패는 남아 있지 않다.

**실제 S3는 Step 8의 체크 조건이 아니다.** 계획 8.3과 시나리오 표가 정한 시험은 "DB + 가짜 저장소"이고, 계획 「실행하지 않을 수 있는 시험」과 시나리오 X-3은 실제 S3 확인을 자동 시험 밖의 1회 수동 확인(FR19 확인 표, OQ-U8-2 `blocking: false`)으로 따로 두었으며 계획 12.3도 "S3 실제 확인 미완 표시"를 문서 항목으로 둔다. 다만 그 전제였던 "버킷·역할 준비 전"은 2026-11-10 준비 공지로 바뀌었으므로, 실제 확인은 **드라이버 배포 후 확인 대기**(§14)로 별도 추적한다.

**계획 항목별 판단**

| 계획 | 구현 | 시험 | 미검증·조건 | 판단 |
|---|---|---|---|---|
| 8.1 `PDF_MATERIAL` 허용 | 완료 | P-g(PDF·텍스트 혼합 순서), 기존 입력 규칙 시험 | 없음 | **체크 가능** |
| 8.2 사전 확인·C-17 1~6단계·PDF 없는 발행 | 완료 | P-a·P-b·P-c·P-d·P-e·P-f·P-g·P-h, 저장 불일치, 권한·상태 순서 | 실제 S3 복사·정리(별도 추적), 실제 U3 조각 나누기와의 연결(색인 쓰기 가짜), Linux 미실행 | **체크 가능**(계획 문구 "전체 글 검증은 U4 현행 그대로"는 팀장 결정 보완 항목으로 대체됨을 함께 기록) |
| 8.2 보완: 전체 글에 PDF 포함·web 문구·상수 주석 | 완료 | 전체 글 3개(정확히 60,000·60,001, 여러 PDF+Catch+텍스트, 이모지·빈 쪽), 상수 일치, web 문구 | 없음 | **체크 가능**(8.2에 포함) |
| 8.3 시험 (a)~(g) | 15개 작성·통과 | — | 계획의 "기존 `publish-api.test.cjs`는 수정 없이 통과" 조건은 글자 그대로는 못 지킴(8.1 때문에 사례 1건의 종류를 `IMAGE`로 바꿈, §13.2) | 이탈은 **담당자 수용(2026-11-10, 이 시험 수정에 한정)** — 체크 가능. 체크 자체는 담당자 지시 대기 |

**Step 8 밖으로 남는 것**(체크를 막지 않음): 시나리오 X-1(PDF 사본이 있는 발행본 삭제)은 계획의 어느 체크 항목에도 배정되어 있지 않다 — 발행본 삭제(U4 `publication-manage`)는 이미 `deletePrefix(publicationPrefix)` 뒤 행 삭제이고 쪽 사본은 외래 키 연쇄로 지워지지만, PDF 사본이 있는 경우의 시험은 아직 없다. 어느 Step에서 할지 담당자 결정이 필요하다(2026-11-11 결정: Step 9.3 후속 시험, §13.6). Step 9(사본 열람)·10(web)·11(환경·지역 설정)·12(문서·`source-manifest.json`)는 미착수다.

### 13.6 담당자 검토와 완료 체크 (2026-11-11)

**담당자 지시로 계획 8.1~8.3을 체크했다.** 커밋·push·PR은 하지 않았고 Step 9는 착수하지 않았다.

| 확인 | 결과 | 누가 |
|---|---|---|
| `npm test -- test/publications/publish-pdf.test.cjs`(U8 작업본 `api`, 시험 DB 켠 상태) | **15건 통과·실패 0건·건너뜀 0건** | 담당자 직접 실행 |
| `npm test -- test/publications/publish-api.test.cjs`(같은 조건, 기존 U4 발행 시험) | **10건 통과·실패 0건·건너뜀 0건**, 수정한 '입력 400' 시험 포함(§13.2) | 담당자 직접 실행 |

**전체 회귀 실패 4건 재검토**(§13.3 표, 근거 로그는 Step 8 세션 스크래치패드의 `api-full-single.txt`·`base-*.txt`·`cur-*.txt`): 넷 모두 U8 변경 밖으로 판단을 유지한다. U8 변경은 `api/src/claude-mcp`·`api/test/claude-mcp`·MCP 표를 건드리지 않는다.

- `u2/file-storage` S22(심볼릭 링크 `EPERM`), `runtime/bootstrap` 개발 소스 기동(변경 전 판본도 2회 실패), `claude-mcp/mcp-endpoint` S9(변경 전 판본도 같은 단언 `200 !== 401`로 1회 실패): 기존 기록으로 판단된다.
- `claude-mcp/mcp-connection` S6 "코드는 5분이다": **원인은 호스트와 DB 컨테이너의 시계 차이로 추정한다(확정 아님).** 변경 전 판본에서 실패한 기록은 없다(3회 통과). 추정 근거는 셋이다 — 같은 현재 판본이 코드 변경 없이 실패(2026-11-10 16:25, 전체 실행)와 통과(16:30 3회)를 오갔고, api가 호스트 시각 + 300초로 적은 만료를 시험이 DB `now()`로 재어 남은 시간 ≤ 300초를 요구하며(DB 시계가 뒤지면 실패), 2026-11-11에 잰 차이(DB − 호스트)가 −4~+88ms 사이에서 수 초 안에 부호가 바뀌었다. 2026-11-11 재확인(`catchu-db-test` 127.0.0.1:5433, 현재 판본, `mcp-connection.test.cjs` 3회·`mcp-endpoint.test.cjs` 2회, 각 120초 제한)은 모두 통과해 실패를 재현하지 못했고, 변경 전 판본은 사본이 지워져 다시 돌리지 못했다.

**X-1(PDF 사본이 있는 발행본 삭제)은 Step 9.3의 후속 시험으로 둔다**(담당자 결정). 지금은 두 삭제가 따로 검증돼 있다 — 저장소 접두어 삭제는 `publications-manage-api.test.cjs` S11(실제 로컬 드라이버, 텍스트 발행본에 합성 파일을 넣음), 쪽 사본 연쇄 삭제는 `db/pdf-tables.test.cjs`(`publication` 행을 SQL로 직접 삭제). PDF를 실제로 발행한 발행본을 삭제 API로 지워 사본 파일 없음·`published_pdf_page` 0행·원본과 다른 발행본 유지를 한 흐름으로 보는 시험은 아직 없다. 9.3이 만드는 "로컬 드라이버에 실제 PDF 사본이 있는 발행본"을 같이 쓴다(계획 9.3에 보완 항목으로 적음).

**미검증으로 남는 것**(§13.4 그대로): 실제 S3 복사·접두어 삭제(**미검증**, §14 — 드라이버 배포 후 확인 대기), 실제 U3 조각 나누기와의 연결, Linux에서 Step 8 시험.

## 14. 개발 서버 S3 조건 대조와 배포 후 확인 항목 (2026-11-10)

실제 S3 검증 상태: **버킷 준비, 드라이버 배포 후 확인 대기.** 이번에는 대조와 항목 정리만 했고 배포·서버·버킷은 건드리지 않았다.

근거: 팀장 공지(담당자 전달 2026-11-10 — 버킷 `catchu-dev-server-files`, 허용 경로 `members/` 아래, 접근 키 없이 개발 서버 역할), [#389 2026-11-10 기록](https://github.com/JminAILab/CatchU/issues/389#issuecomment-6757389405)(서울, 공개 차단 4개, 기본 암호화 AES256, 버전 관리 안 켬, ACL 끔, 역할 인라인 정책 `catchu-dev-files-readwrite`: `members/*` 올리기·읽기·삭제와 `members/` 접두어 목록, 복사는 읽기+올리기, 메타데이터 hop 제한 2·토큰 필수), `origin/main`의 `deploy/dev-server/README.md`(앱 망의 web·api·worker가 서버 역할에 닿음, api는 큐에 붙지 않음, 큐는 worker만 붙는 내부 망).

### 14.1 U8 구현과의 대조

| 조건 | U8 구현 | 판정 |
|---|---|---|
| 버킷 이름 `catchu-dev-server-files` | api `FILE_STORAGE_DRIVER=s3`+`FILE_STORAGE_S3_BUCKET`, worker `FILE_STORAGE_S3_BUCKET`(`PDF_FILE_ROOT`와 함께 두지 않음). 두 쪽 설정 검사 모두 이 이름을 받음(로컬 확인) | 일치 |
| 허용 경로 `members/` 아래 | 키는 C-05 도우미로만 만든다: 원본 `members/{memberId}/materials/{pdfMaterialId}.pdf`, 발행 사본 `members/{memberId}/publications/{publicationId}/{publishedItemId}.pdf`, 발행 접두어 `members/{memberId}/publications/{publicationId}/`, 회원 접두어 `members/{memberId}/`. `parseStorageKey`가 `members/{uuid}/`로 시작하지 않는 키·`..`·절대 경로를 거부(로컬 확인). worker는 `members/{uuid}/materials/{uuid}.pdf` 모양만 읽음 | 일치 |
| 쓰는 S3 명령 | api: PutObject, GetObject, CopyObject(같은 버킷 안), DeleteObject, ListObjectsV2(Prefix는 항상 `members/…/`), DeleteObjects. worker: GetObject만 | 정책 범위 안(올리기·읽기·삭제·목록, 복사 = 읽기+올리기) |
| 접근 키 없이 역할 | 코드·설정에 자격·키 없음. api는 AWS SDK v3 기본 자격 체인, worker는 boto3 기본 체인(둘 다 메타데이터 토큰 방식) | 일치 |
| 기본 암호화·ACL 끔·버전 관리 없음 | 드라이버가 암호화·ACL 인자를 넣지 않아 버킷 기본값을 따르고, 삭제는 실제 삭제 | 일치 |
| presigned URL | 만들지 않음(api가 스트림으로 전달) | 일치 |
| 역할 분리 | 개발 서버는 api·worker가 같은 서버 역할을 쓴다. worker의 "읽기만"(BR7.4)은 코드로만 지켜진다(GetObject 외 호출 없음). 서비스별 역할은 EKS(#276) | 개발 서버 한계(팀장 기록의 받아들이는 위험과 같음) |

### 14.2 맞지 않거나 보완이 필요한 것

- **지역(region) 설정이 없다(배포 전 필요).** U8 코드·`.env` 예시·배포 안내 어디에도 지역 값이 없다. 로컬 확인(메타데이터 조회를 끈 조건): api는 `AWS_REGION`이 없으면 드라이버가 `StorageUnavailable(IO_FAILED)`(원인 "Region is missing")로 모든 호출이 실패하고, `AWS_REGION=ap-northeast-2`면 해석된다. worker의 boto3는 `AWS_REGION`을 읽지 않고 `AWS_DEFAULT_REGION`만 읽으며, 없으면 `us-east-1` 전역 주소(`s3.amazonaws.com`)로 붙는다. 그래서 개발 서버 환경 파일에 **api `AWS_REGION=ap-northeast-2`, worker `AWS_DEFAULT_REGION=ap-northeast-2`**가 필요하다. EC2에서 메타데이터가 지역을 대신 채워 주는지는 확인하지 못했으므로 명시 설정을 전제로 한다. 반영 위치: 계획 11.1(`api/.env.example`·`worker/.env.example`에 설정 이름), `api/docs/file-storage.md`·`environment.md`, 개발 서버 환경 파일(팀장 몫).
- **없는 키 읽기의 응답이 403일 수 있다(배포 후 확인).** 목록 권한이 `members/` 접두어 조건으로만 열려 있으면, 없는 객체의 GetObject·CopyObject가 404 `NoSuchKey`가 아니라 403 `AccessDenied`로 올 수 있다. 그 경우 api는 `FileNotFound` 대신 `StorageUnavailable(IO_FAILED)`, worker는 `FileUnreadable`(즉시 UNREADABLE_FILE) 대신 `SourceUnavailable`(시한 대기)로 분류한다. 정책의 조건 모양에 달려 있어 지금은 판단할 수 없다.
- **개발 서버에서는 추출 전체 연결을 확인할 수 없다.** 그 서버의 api는 큐에 붙지 않는다(`api.env`에 `CATCHU_QUEUE_REDIS_URL` 없음, 큐 망에도 없음). U8 발송기는 이때 `QUEUE_NOT_CONFIGURED`로 끝나고 업로드한 PDF는 10분 뒤 FAILED(DEADLINE_EXCEEDED)가 된다. DONE 자료가 생기지 않으므로 발행 복사(`copy`)·발행 접두어 정리(`deletePrefix`)도 API로는 닿지 않는다.

### 14.3 배포 후 확인 항목

**(가) S3 저장 검증 — 큐 없이 가능(api 드라이버 배포 뒤, 개발 서버)**

1. 기동: api가 `FILE_STORAGE_DRIVER=s3`·`FILE_STORAGE_S3_BUCKET=catchu-dev-server-files`·`AWS_REGION`으로 뜨고 health가 정상인지.
2. 올리기: PDF 업로드 201 → 객체가 `members/{memberId}/materials/{pdfMaterialId}.pdf`에 있고 암호화 AES256인지(팀장이 버킷에서 확인).
3. 읽기: 작성자 원본 열람이 200으로 PDF 바이트를 내려 주는지.
4. 삭제: 자료 삭제 뒤 객체가 없고 행도 없는지(저장소 먼저 삭제 순서).
5. 없는 키: 객체를 지운 뒤 원본 열람·삭제의 응답과 로그(404 `NoSuchKey` 계열인지 403인지, §14.2).
6. 접두어 삭제: 시험 회원 탈퇴로 `members/{memberId}/` 아래가 모두 지워지는지(목록+일괄 삭제 권한).
7. 벌 수 초과·DB 실패 보상 삭제(`delete(materialKey)`)가 남긴 객체가 없는지.
8. 로그·오류 응답에 버킷·키 값이 없는지.
9. 발행 복사·발행본 삭제(`copy`·`deletePrefix(publicationPrefix)`): DONE 자료가 필요해 이 서버에서는 API로 닿지 않는다. 확인하려면 큐가 있는 환경이 필요하거나, 팀장 승인 아래 시험 자료 상태를 직접 맞추는 방법을 따로 정한다(임의로 하지 않음).

**(나) 추출 전체 연결 검증 — 큐가 있어야 가능(개발 서버에서는 불가, EKS 또는 큐를 연 환경)**

1. 업로드 → api 발송 → worker가 역할로 `GetObject`(worker `FILE_STORAGE_S3_BUCKET`·`AWS_DEFAULT_REGION`) → 결과 → api 수신 → DONE·쪽 저장 → worker가 수신 확인 읽음.
2. worker 쪽 S3 오류 분류: 없는 객체(즉시 UNREADABLE_FILE인지 §14.2의 403인지), 권한·네트워크 장애(시한 대기).
3. 발행: 복사 → 사본 쪽 고정 → 받은 사람·작성자 사본 열람(Step 9).
4. Linux 컨테이너 메모리 한도와 자식 메모리 제한(512 MB)의 관계(§12.7 관찰), 대표 PDF 측정(계획 11.4).

**지금까지의 S3 검증 범위**: 가짜 S3 클라이언트 시험(api `s3-file-storage.test.cjs`, worker reader 시험)과 설정·키 모양의 로컬 확인뿐이다. 실제 버킷 호출은 한 번도 하지 않았다.

## 15. Step 9 — 받은 사람·작성자 PDF 사본 열람 (2026-11-11 실행, 담당자 지시 뒤 — 검토 전)

> 계획 체크박스 9.1~9.3은 담당자 검토 뒤에 체크한다(2026-11-11 담당자 지시로 체크함, §15.6). 커밋·push·PR은 하지 않았고 Step 10은 착수하지 않았다.

입력: [코드 생성 계획](code-generation-plan.md) Step 9(9.1~9.3과 2026-11-11 X-1 보완 항목), [기능 명세](../functional-design/functional-spec.md) W4·W5, [규칙](../functional-design/rules.md) BR6.1·BR6.2·BR6.5·BR6.6·BR6.7·BR7.1, [보안 설계](../nfr-design/security-design.md) §6, [신뢰성 설계](../nfr-design/reliability-design.md) 「열람」, [관측 설계](../nfr-design/observability-design.md) `PDF_VIEW_FAILED`, 시나리오 표 V-1~V-7·X-1, `docs/CatchU_security_checks.md`(API 경로·권한, 입력, 로그 행). 승인 설계 문서는 고치지 않았다.

### 15.1 계획 항목별 구현

| 계획 | 구현 | 위치 |
|---|---|---|
| 9.1 받은 사람 `GET /v1/public/links/{token}/items/{publishedItemId}/pdf` | 메서드 단위 `@Public()`. 읽기 전용 REPEATABLE READ 트랜잭션 하나에서 U4 `resolveForRecipientIn(token, grant, now)` → 그 발행본의 `PDF_MATERIAL` 행 조회(`publication_id = access.publicationId AND published_item_id = $2 AND item_kind = 'PDF_MATERIAL'`). 판정 실패는 U4와 같은 변환(401 `LINK_PASSWORD_REQUIRED`·404 `LINK_UNAVAILABLE`), 항목 없음·UUID 아님·다른 종류·다른 발행본도 404 `LINK_UNAVAILABLE`. grant는 `X-Link-Grant` 헤더로만, 정의 밖 쿼리는 400. 시도 제한 없음 | `recipient-links.controller.ts` `pdf`, `published-pdf-view.service.ts` `findForRecipient` |
| 9.2 작성자 `GET /v1/publications/{id}/items/{itemId}/pdf` | 전역 Guard(회원 토큰) → U4 `resolveForOwner(memberId, publicationId)`(중지·만료를 막지 않음) → 같은 항목 규칙 → 스트림. 남의 발행본·없는 발행본·그 발행본에 없는 항목·PDF 아닌 항목·형식이 틀린 ID는 같은 404 `RESOURCE_UNAVAILABLE` | `publications.controller.ts` `pdf`, `findForOwner` |
| 9.1·9.2 공통 전송 | 내려주는 것은 원본(`materialKey`)이 아니라 Step 8이 복사한 사본(`published_item.pdf_copy_key`). 헤더 전에 `FileStorage.get`을 열어 성공 확인(파일 없음·저장소 실패 500) → 헤더 4종(`application/pdf`, `inline; filename="document.pdf"`, `no-store`, `nosniff`) → `pipeline`. Range는 보지 않고 늘 전체 200. 전송 도중 오류는 연결 중단·`PDF_VIEW_FAILED`(streaming, aborted), 받는 쪽이 먼저 끊은 경우는 기록 안 함(D16과 같음). 로그 칸은 publicationId·publishedItemId·단계·상태·이유·오류 이름뿐(토큰·grant·키·제목 없음) | `published-pdf-view.service.ts` `send` |
| 9.3 시험 + X-1 보완 | `api/test/publications/recipient-pdf.test.cjs` 8개(V-1~V-7, X-1) | §15.3 |

### 15.2 계획과 다른 점·결정

- **새 파일 `published-pdf-view.service.ts`**(계획 목록 밖): 두 컨트롤러가 같은 판정·전송을 쓰도록 한 곳에 두었다. `PublicationsModule` 공급자에 더했다.
- **U4 파일 변경**: `recipient-access.service.ts`의 `unavailable`·`toApiError` 두 함수에 `export`만 붙였다(받은 사람 오류 변환을 복제하지 않으려고, 동작 변화 없음). `recipient-links.controller.ts`·`publications.controller.ts`·`publications.module.ts`는 계획이 지목한 변경이다.
- **기존 U4 시험 2개 파일 수정(담당자 수용 필요)**: (1) `app-routes.test.cjs` — "받은 사람 컨트롤러 메서드는 `GET :token`·`POST :token/unlock` 둘뿐"이라는 단언이 계획 9.1과 양립하지 않아 PDF 경로를 더한 셋으로 바꾸고, 새 메서드에 `@Public()`이 붙었는지 단언 한 줄을 더했다. 시험 제목의 "두 경로"·"두 메서드" 문구는 그대로 두었다. (2) `support.cjs` `setClock` — 시험 시계를 꽂는 대상에 `PublishedPdfViewService`를 더했다(만료 판정이 같은 시계를 쓰도록). 다른 사례·단언은 바꾸지 않았다.
- (아래 항목은 첫 구현 시점의 기록이다. 같은 날 담당자 지시로 설계 원문을 확인해 받은 사람 경로의 401·404를 기록하도록 바꿨다 — §15.6.)
- **401·404는 `PDF_VIEW_FAILED`로 기록하지 않는다(담당자 판단 필요)**: 관측 설계 표는 이 사건의 상태 코드에 401·404도 적어 두었지만, 이유 칸은 file-missing/storage 둘뿐이고 Step 5 원본 열람(§10)도 500·aborted만 기록한다. 받은 사람 경로는 인증·시도 제한이 없어 401·404마다 기록하면 누구나 로그를 늘릴 수 있으므로 Step 5와 같게 500·aborted만 남겼다. 설계 표대로 401·404도 남기려면 알려 주면 더한다.
- **작성자 경로는 회원 행 존재 확인(401 `AUTH_INVALID`)을 따로 하지 않는다**: 계획대로 `resolveForOwner`만 거친다. U4 목록·상세·중지·삭제는 회원 행이 없으면 401이지만, 이 경로는 그 경우 발행본도 연쇄 삭제돼 404가 된다.
- **전송 코드 중복**: `send`는 Step 5 원본 열람(`pdf-materials.controller.ts` `file`)과 같은 순서를 따로 구현했다. 검증이 끝난 Step 5 코드를 건드리지 않으려는 선택이며, 공용 함수로 합치는 것은 후속 후보다.
- **X-1 위치**: 시나리오 표의 후보(`publish-pdf.test.cjs` 또는 U4 `publication-manage` 시험) 대신 2026-11-11 담당자 결정대로 `recipient-pdf.test.cjs`에 두었다.
- **시험이 잡은 것 1건(시험 쪽)**: V-7에서 서버의 `PDF_VIEW_FAILED` 기록이 받는 쪽이 끊김을 본 직후에 남아 단언이 먼저 실패했다. 기록을 최대 2초 기다리도록 시험을 고쳤다(구현 변경 없음).

### 15.3 시험·검사 결과

환경: Windows, 판본은 `api/u8-pdf-materials`·HEAD `7ef0dd69`의 미커밋 작업본(`published-pdf-view.service.ts` sha256 `929c58946137…`, `recipient-pdf.test.cjs` `d9f42c82c78f…`). 시험 DB는 담당자가 띄워 둔 `catchu-db-test`(`127.0.0.1:5433`), 실행 전 다른 연결·시험 프로세스 0 확인, 시험은 겹치지 않게 하나씩 돌렸다.

실제인 것: AppModule, 테스트 DB, 개발 로그인 회원, **로컬 파일 저장소 드라이버**(임시 폴더의 실제 파일), 업로드 API(원본 저장), 발행 API(사본 복사), 삭제 API, 열람 API. 합성인 것: PDF 바이트, 쪽 글(추출 worker 없이 DB에서 DONE·쪽 글을 직접 채움), U2 AiRun·U3 PublishedIndexWriter 가짜. V-4의 저장소 장애와 V-7의 스트림 오류는 `FileStorage.get` 대역이다. **실제 S3는 쓰지 않았다.**

| 명령(`cd api`) | 결과 |
|---|---|
| `npm run typecheck` / `npm run lint` | 통과 / 통과 |
| `npm test -- test/publications/recipient-pdf.test.cjs`(첫 실행) | 7 passed, **1 failed**(V-7 로그 단언, §15.2 마지막 항목) |
| `node --test --test-name-pattern="V-7" test/publications/recipient-pdf.test.cjs`(시험 수정 뒤) | 1 passed |
| `npm test -- test/publications/*.test.cjs test/materials/*.test.cjs test/security-events.test.cjs test/rag-answer/qna-controller.test.cjs`(16개 파일) | **186 passed**, 실패·건너뜀 0 |
| api 전체 `npm test`(최종 판본, 11:24:35~11:37:06, 제한 45분) | 첫째 줄 146개 파일 **1723건: 1684 passed, 3 failed, 36 skipped**(713.0초), 둘째 줄(대기) 5개 파일 30 passed, 빌드 시험 1 passed. `recipient-pdf.test.cjs` 8건 모두 통과 |

전체 실행의 실패 3건은 §13.3·§13.6에서 U8 변경 밖으로 정리한 것과 같은 시험이다: `u2/file-storage` S22(심볼릭 링크 `EPERM`), `claude-mcp/mcp-endpoint` S9(시계 차이), `runtime/bootstrap` 개발 소스 기동. `claude-mcp/mcp-connection` S6는 이번에는 통과했다. Step 9가 만든 실패는 없다.

| 시나리오 | 시험이 본 것 | 결과 |
|---|---|---|
| V-1 | grant 없음·빈 값·모양 틀림·다른 발행본 grant → 401 `LINK_PASSWORD_REQUIRED`(없는 항목·UUID 아닌 항목이어도 401), URL의 grant는 400, 거부 15회 뒤에도 429 없음, 맞는 grant 15회 200 | 통과 |
| V-2 | 중지·삭제·만료(시계)·형식 틀린 토큰·없는 토큰 → 404 `LINK_UNAVAILABLE`, PDF 본문 없음 | 통과 |
| V-3 | 남의 발행본 항목·같은 작성자의 다른 발행본 항목·텍스트 항목·없는 항목·UUID 아님·발행본 ID → 본문까지 같은 404 | 통과 |
| V-4 | 사본 파일 삭제 뒤 받은 사람·작성자 500 `INTERNAL_ERROR`, 로그 `before-headers`·`file-missing`. 저장소 장애(대역) → `storage`. 로그에 키·토큰·제목 없음 | 통과 |
| V-5 | 200·헤더 4종·본문 = 올린 바이트. 원본 파일 내용을 바꾼 뒤와 원본 자료를 삭제 API로 지운 뒤에도 같은 바이트. `Range` 요청은 200 전체. 정의 밖 쿼리 400 | 통과 |
| V-6 | 작성자 200(비밀번호 링크도 grant 없이), 회원 두 명이 서로의 ID로 접근한 9가지가 같은 404 `RESOURCE_UNAVAILABLE`, 토큰 없음 401, 중지 뒤·만료 뒤 200(같은 때 받은 사람은 404) | 통과 |
| V-7 | 앞부분 전송 뒤 스트림 실패(대역) → 상태 200·본문 수신 실패(받은 사람·작성자), 로그 `streaming`·`aborted`, 그 뒤 같은 항목 정상 열람 | 통과 |
| X-1 | 업로드 API → 발행 API 2회(같은 원본) → 삭제 API. 지운 발행본: 사본 파일·접두어 폴더·`published_pdf_page` 0행·열람 404. 다른 발행본: 사본 파일·쪽 사본 3행·열람 200. 원본: 파일·`pdf_material`·`pdf_page_text` 3행·원본 열람 200 | 통과 |

### 15.4 미검증·남은 것

- **실제 S3: 미검증**(§14). 이번 검증은 모두 로컬 파일 저장소 드라이버다. S3 드라이버의 `get` 스트림·`copy`·`deletePrefix`가 이 경로에서 실제로 도는지는 드라이버 배포 뒤 확인 대상이다.
- 추출 worker를 거친 연결(업로드 → 추출 → 발행 → 열람): 쪽 글은 DB에 직접 넣었다.
- web 열람 도우미·Blob URL·iframe(Step 10), 브라우저 내장 뷰어에서의 표시.
- Linux에서 Step 9 시험 미실행(Windows만). `Content-Length`는 보내지 않는다(스트림 전송).
- 문서(Step 12): `api/docs/publications.md`·`pdf-materials.md`, C-12 더하는 변경의 계약 반영, `source-manifest.json`.
- 담당자 판단 대기: 기존 U4 시험 2개 파일 수정 수용, `PDF_VIEW_FAILED`의 401·404 기록 여부(§15.2).

### 15.5 계획 항목별 판단

| 계획 | 판단 | 조건 |
|---|---|---|
| 9.1 | 체크 가능 | 401·404 로그 기록 여부만 담당자 판단 대기(지금은 Step 5와 같게 기록 안 함) |
| 9.2 | 체크 가능 | 없음 |
| 9.3(+X-1) | 체크 가능 | 계획의 사례를 모두 포함해 8개 통과. 기존 U4 시험 2개 파일 수정의 수용이 전제 |

### 15.6 담당자 검토와 완료 체크 (2026-11-11)

**담당자 지시로 계획 9.1·9.2·9.3(X-1 포함)을 체크했다.** 커밋·push·PR은 하지 않았고 Step 10은 착수하지 않았다.

**수용된 것**: 기존 U4 경로 시험(`app-routes.test.cjs`) 수정과 시험 시계 변경(`support.cjs` `setClock`). 지시대로 `app-routes.test.cjs`의 시험 제목 둘과 머리 주석의 "두 경로"·"두 메서드"를 실제 검증 내용에 맞춰 "세 경로(열람·unlock·PDF 사본)"·"세 메서드"로 고쳤다. 제목이 말하는 대로 검증하도록 등록 경로 목록에 PDF 경로 둘(받은 사람·작성자)을 더하고, 받은 사람 PDF 경로는 회원 토큰 없이 Guard를 지나 404 `LINK_UNAVAILABLE`, 작성자 PDF 경로는 회원 토큰 없이 401 `AUTH_REQUIRED`임을 한 줄씩 더했다.

**9.1 — `PDF_VIEW_FAILED`의 401·404는 받은 사람 PDF 열람 경로에 적용된다(설계 예외 결정 불필요).**

- 근거 1: [관측 요구사항](../nfr-requirements/observability-requirements.md) NFR6.1이 남길 사건으로 "열람 실패 코드(401·404·500)"를 들고 검증을 "각 실패 경로 시험에서 로그 한 줄 확인"으로 정했다.
- 근거 2: [관측 설계](../nfr-design/observability-design.md) §1 `PDF_VIEW_FAILED` 행의 필드가 "publicationId …, publishedItemId, 상태 코드(401·404·500, 전송 도중 중단은 `aborted`)"다. U8 열람 경로 가운데 401(`LINK_PASSWORD_REQUIRED`)이 나오는 곳은 받은 사람 경로뿐이므로 이 행의 401은 그 경로를 가리킨다.
- 따라서 §15.2의 "기록하지 않는다"는 첫 판단은 설계와 어긋났고, 설계대로 고쳤다.

구현(`published-pdf-view.service.ts` `findForRecipient`·`denied`): 받은 사람 401·404마다 `PDF_VIEW_FAILED` 한 줄을 warn으로 남긴다 — `{ event, stage: 'before-headers', status: 401|404, reason: null, publicationId, publishedItemId, error: null }`. 응답 코드·본문은 바꾸지 않는다.

- `publicationId`: 판정을 통과했거나(항목 404) grant만 거부된 경우(401, 같은 읽기 전용 트랜잭션에서 토큰으로 발행본 ID만 읽음)에는 적는다. 링크를 찾지 못했거나 열 수 없는 404(없음·중지·만료·삭제·형식 틀린 토큰)는 `null`이다 — 토큰을 적을 수 없어 가리킬 식별자가 없다.
- `publishedItemId`: 요청 값이 UUID 모양일 때만 소문자로 적고, 아니면 `null`(요청 원문을 그대로 적지 않음).
- 이유 칸(file-missing / storage)과 오류 이름은 500·전송 중단에만 값이 있다. 400(정의 밖 쿼리)은 열람 실패 코드 목록에 없어 기록하지 않는다.
- 넣지 않는 것(NFR6.2): 토큰, grant, 파일 키, 제목, 요청 원문.

시험 보강(`recipient-pdf.test.cjs`, 시험 수는 8개 그대로):

| 시험 | 더한 단언 |
|---|---|
| V-1 | 401 여섯 건마다 warn 한 줄(발행본 ID, 항목 ID 또는 `null`), 응답은 그대로 401 `LINK_PASSWORD_REQUIRED`. 로그에 틀린 grant·UUID 아닌 ID 원문, 토큰·grant·키·제목 없음 |
| V-2 | 중지·삭제·형식 틀린 토큰·없는 토큰·만료 다섯 건마다 404 한 줄(`publicationId: null`), 응답은 그대로 404 `LINK_UNAVAILABLE`. 로그에 토큰 없음 |
| V-3 | 항목 거부 여섯 건마다 404 한 줄(판정을 통과한 발행본 ID), 없는 링크는 `null`. 응답 본문은 여전히 서로 같다 |
| V-5 | 정상 열람과 400은 기록 없음 |

실행(`cd api`, `catchu-db-test`, 최종 판본 `published-pdf-view.service.ts` `7acd42e4bd44…`·`recipient-pdf.test.cjs` `ac32f6c36f85…`·`app-routes.test.cjs` `c4095ee43a75…`):

| 명령 | 결과 |
|---|---|
| `npm run typecheck` / `npm run lint` | 통과 / 통과 |
| `npm test -- test/publications/*.test.cjs test/materials/*.test.cjs test/security-events.test.cjs test/rag-answer/qna-controller.test.cjs`(16개 파일, 11:51:14~11:55:14) | **186 passed**, 실패·건너뜀 0. `recipient-pdf.test.cjs` 8건과 `app-routes.test.cjs`의 제목을 고친 두 시험 포함 |

api 전체 `npm test`는 이 변경 뒤에 다시 돌리지 않았다. 마지막 전체 실행(§15.3, 11:24~11:37)은 401·404 기록을 넣기 전 판본이고, 그 뒤 바뀐 것은 `published-pdf-view.service.ts`·`recipient-pdf.test.cjs`·`app-routes.test.cjs` 셋이며 셋 다 위 16개 파일 실행에 들어 있다.

**남는 것**

- 같은 설계 행의 404는 작성자 경로에도 읽힐 수 있다. 작성자 사본 열람(9.2)과 Step 5 원본 열람은 404를 기록하지 않는다(둘 다 500·전송 중단만). 이번 지시는 받은 사람 경로였으므로 바꾸지 않았다 — 맞출지는 담당자 판단. (같은 날 담당자 지시로 두 경로 모두 보완했다 — §15.7.)
- 받은 사람 경로는 인증·시도 제한이 없어(BR6.7) 요청마다 warn 한 줄이 남는다. 로그 양을 막는 장치는 설계에 없다(지표·경보 없음, NFR6.5). 운영에서 문제가 되면 별도 결정이 필요하다.
- §15.4의 미검증(실제 S3, 추출 worker 연결, web 화면, Linux)과 Step 12 문서는 그대로다.

### 15.7 작성자 경로의 404 기록 보완과 Step 5 적용 판단 (2026-11-11, 담당자 지시)

기준: 관측 요구사항 NFR6.1·NFR6.2, 관측 설계 §1 `PDF_VIEW_FAILED` 행, 규칙 BR6.6. 승인 설계 문서는 고치지 않았다. Step 9 계획 체크는 그대로다.

**작성자 사본 열람(`published-pdf-view.service.ts` `findForOwner`)**: 404가 나오는 두 자리 모두에서 요청마다 `PDF_VIEW_FAILED` 한 줄(warn)을 남긴다. 응답(404 `RESOURCE_UNAVAILABLE`)과 판정 순서(`resolveForOwner` → 항목 조회)는 그대로다.

| 자리 | 기록하는 식별자 |
|---|---|
| 작성자가 접근할 수 있는 발행본을 찾지 못함(남의 것·없는 것·형식 틀린 ID) — 소유 확인 전 | `memberId`(인증된 회원), `publicationId: null`(요청 값이 본인 것인지 확인되지 않아 적지 않음), `publishedItemId`(UUID 모양일 때만) |
| 본인 발행본에서 요청한 PDF 항목을 찾지 못함(다른 발행본의 항목·PDF 아닌 항목·없는 항목) — 소유 확인 뒤 | `memberId`, `publicationId`(본인 것으로 확인된 값), `publishedItemId`(UUID 모양일 때만) |

받은 사람 줄과 같은 함수(`denied`)·같은 칸을 쓰고, 작성자 줄에만 `memberId` 칸이 더 있다(받은 사람 경로에는 회원이 없다). 토큰·grant·저장 키·제목·요청 원문은 넣지 않는다.

**Step 5 작성자 원본 열람(`GET /v1/pdf-materials/{id}/file`)에도 같은 요구사항이 적용된다고 판단해 보완했다.**

- 대조: 404는 `PdfMaterialStore.findOwned`가 던지고(남의 자료·없는 자료·형식 틀린 ID), 컨트롤러 `file`은 500(헤더 전)과 전송 중단만 기록했다. 404를 기록하는 곳은 없었고, 시험(U-7·U-9)도 500의 기록만 봤다.
- 적용 근거: 관측 설계 행의 필드가 "publicationId **또는 pdfMaterialId**"라 원본 열람이 이 사건의 대상이고, NFR6.1이 "열람 실패 코드(401·404·500)"를 남기라고 하며, BR6.6이 작성자 두 경로(사본·원본)의 거부를 404로 정한다.
- 보완(`pdf-materials.controller.ts` `file`): `findOwned`가 404를 내면 `{ event: 'PDF_VIEW_FAILED', stage: 'before-headers', status: 404, reason: null, pdfMaterialId, memberId, error: null }` 한 줄(warn)을 남기고 그대로 던진다. `pdfMaterialId`는 소유가 확인되지 않은 요청 값이라 UUID 모양일 때만 적는다. 상세·삭제의 404는 열람이 아니라 기록하지 않는다.
- **작성자 두 경로의 401은 기록하지 않는다(해석을 기록해 둔다)**: 회원 토큰이 없을 때의 401 `AUTH_REQUIRED`는 U8 코드에 닿기 전 공통 인증 계층에서 나온다. 설계 행의 401은 U8 열람 규칙이 정한 유일한 401인 받은 사람 경로의 `LINK_PASSWORD_REQUIRED`(BR6.1)로 읽었다. 원본 열람의 회원 행 없음(401 `AUTH_INVALID`)도 회원 인증 실패라 같은 이유로 넣지 않았다. 이 해석이 틀리면 공통 인증 계층에서 다뤄야 하므로 U8 범위 밖의 결정이 필요하다.

시험 보강:

| 파일 | 더한 단언 |
|---|---|
| `api/test/publications/recipient-pdf.test.cjs` V-6 | 작성자 404 9가지마다 warn 한 줄(소유 확인 전 4건은 `publicationId: null`, 확인 뒤 5건은 본인 발행본 ID, 모두 `memberId`), 응답은 그대로 같은 404. 정상 열람·401(토큰 없음)·400은 기록 없음. 중지·만료 뒤 구간의 기록은 받은 사람 거부 두 줄뿐(작성자 줄과 섞이지 않음). 로그에 UUID 아닌 ID 원문·남의 발행본 ID·토큰·키·제목 없음 |
| `api/test/materials/pdf-materials-api.test.cjs` U-7 | 원본 열람 404 4건마다 warn 한 줄(UUID 모양이 아닌 ID 2건은 `pdfMaterialId: null`), 상세·삭제의 404는 기록 없음, 본인의 정상 원본 열람은 기록 없음. 로그에 요청 원문·제목·키·토큰 없음 |

실행(`cd api`, `catchu-db-test`, 실행 전 다른 연결·시험 프로세스 0 확인):

| 명령 | 결과 |
|---|---|
| `npm run typecheck` / `npm run lint` | 통과 / 통과 |
| `npm test -- test/publications/recipient-pdf.test.cjs test/materials/pdf-materials-api.test.cjs test/publications/app-routes.test.cjs`(12:05) | **24 passed**, 실패·건너뜀 0 |
| 같은 16개 파일 묶음(§15.6과 같은 명령, 최종 판본 `published-pdf-view.service.ts` `5a3ceb0c56b2…`·`pdf-materials.controller.ts` `ea684bd9d208…`, 12:35~12:39) | **186 passed**, 실패·건너뜀 0 |

**api 전체 `npm test`는 이 보완 뒤에 다시 돌리지 않았다.** 마지막 전체 실행은 §15.3의 것(2026-11-11 11:24~11:37, 1723건: 1684 passed·3 failed·36 skipped)이고, 그 판본에는 받은 사람 401·404 기록(§15.6)과 이 절의 변경이 없다. 그 뒤 바뀐 api 파일은 `published-pdf-view.service.ts`·`pdf-materials.controller.ts`와 시험 `recipient-pdf.test.cjs`·`pdf-materials-api.test.cjs`·`app-routes.test.cjs`이며 모두 위 16개 파일 실행에 들어 있다.

실제 서버 기록 확인(§16.4의 브라우저 확인 중, 로컬 api 로그): 받은 사람 500 두 줄(`file-missing`)과 404 한 줄(`publicationId: null`)이 위 모양으로 남았고, 로그 전체에 링크 토큰·저장 키·시험 비밀번호가 없었다.

## 16. Step 10 — web PDF 탭·뷰어·쪽 표시 (2026-11-11 실행, 담당자 지시 뒤 — 검토 전)

> 계획 체크박스 10.1~10.4는 담당자 검토 뒤에 체크한다(2026-11-11 담당자 지시로 체크함, §16.7). 커밋·push·PR은 하지 않았고 Step 11은 착수하지 않았다.

입력: [코드 생성 계획](code-generation-plan.md) Step 10(10.1~10.4와 2026-11-10 보완 문구), [기능 명세](../functional-design/functional-spec.md) W1·W4, [화면 컴포넌트](../functional-design/frontend-components.md), [규칙](../functional-design/rules.md) BR1.1~BR1.5·BR2.3·BR6.3·BR6.4, [보안 설계](../nfr-design/security-design.md) §2·§6, [관측 설계](../nfr-design/observability-design.md) §3, 시나리오 표 F-1~F-9, `docs/CatchU_security_checks.md`(화면 출력·입력·설정 행). 승인 설계 문서는 고치지 않았다.

### 16.1 계획 항목별 구현

| 계획 | 구현 | 위치(`web/src/features/…`) |
|---|---|---|
| 10.1 API 경계 | 목록·상세·삭제는 공통 `api.member`. 업로드(multipart)와 PDF 본문(바이너리)은 공통 클라이언트가 JSON만 다뤄, 같은 기준 주소 규칙으로 직접 `fetch`(U5 SSE와 같은 방식). 회원 요청은 메모리 토큰을 붙이고 회원 인증 401이면 그 토큰을 지운다. 보내기 전 검사(파일 1개·PDF·20 MB·제목 100자), 실패 사유 문구 5종(#420 결정 문구), 서버 400 첫 위반 안내 | `materials/pdf-materials-api.ts`, `materials/pdf-clients.ts` |
| 10.1 올리기 | 민감 정보 안내(텍스트 자료와 같은 상수)·외부 AI 한 줄 고지(U2 `AiNoticeLine`)·파일 1개 입력·제목(비우면 파일 이름). 403 `AI_CONSENT_REQUIRED`는 U2 `useAiConsent().run`으로 동의 뒤 같은 요청 1회 재전송. 20벌이면 단추 막고 안내 | `materials/pdf-upload-form.tsx`, `materials/pdf-materials-tab.tsx` |
| 10.1 목록 | 배지(글 추출 중 / 완료 n쪽 / 실패 + 사유별 문구), [원본 보기](공용 뷰어), 삭제(확인 뒤 204일 때만 목록에서 뺌), [새로고침](폴링 없음), 더 보기. 조회 실패는 0건이 아님 | `materials/pdf-material-list.tsx`, `materials/pdf-materials-tab.tsx` |
| 10.1 탭 | 자료 화면에 [텍스트 자료]·[PDF 자료] 탭. 저장하지 않은 텍스트 입력이 있으면 PDF 탭으로 옮기기 전에 기존 미저장 확인을 거친다 | `materials/materials-screen.tsx`·`materials-view.tsx`·`materials.module.css` |
| 10.2 공용 뷰어 | `loadPdf`: 200이고 종류가 PDF이며 **본문을 끝까지 받은 뒤에만** Blob. `createPdfViewerModel`: 화면 안 뷰어가 열려 있으면 쪽만 바꿈(같은 URL 재사용, 요청 없음), 닫았다가 다시 열기·새 탭은 재요청. 새 탭은 빈 창 먼저 → 요청 1회 → 창에 주입(`opener` 끊음), 팝업 차단이면 같은 Blob을 화면 안 뷰어에 + 안내. 401 `LINK_PASSWORD_REQUIRED`·404 `LINK_UNAVAILABLE`은 `onAccessLost`, 500·전송 중단·네트워크 오류는 일반 실패 안내(grant 유지). URL 해제: 뷰어 닫기·화면 떠남·접근 상실(새 탭용 URL 포함). iframe에 sandbox 없음 | `recipient/pdf-viewer-launcher.tsx`·`pdf-viewer.module.css` |
| 10.3 PDF 항목 | 쪽 수, 쪽마다 "n쪽"·글(텍스트 노드)·"읽을 수 없음" 표지·[원본 n쪽 열기], 근거 범위는 그 쪽 글에서만 `<mark>`. [PDF 보기]·[새 탭에서 열기] | `publications/published-pdf-item.tsx` |
| 10.3 화면 연결 | `snapshot-view.tsx`의 "준비 중" 자리 교체. 받은 사람 화면은 받은 사람 사본 경로 + grant 머리 + `onAccessLost`, 작성자 발행본 화면은 작성자 사본 경로. `recipient-api.ts` `pickItem`이 `pdfPages`의 계약 칸만 통과, `recipient-slots.ts` `fieldText`에 `pages[n]`(쪽 번호로 찾음), 사본 검사에 쪽 사본 모양 추가 | `publications/snapshot-view.tsx`·`publications-api.ts`·`publication-detail-screen.tsx`·`publication-detail-view.tsx`, `recipient/recipient-api.ts`·`recipient-slots.ts`·`recipient-screen.tsx`·`recipient-view.tsx` |
| 10.4 시험 | 새 시험 3개 파일 16건, 상호작용 요소에 `data-testid` | §16.3 |

### 16.2 계획과 다른 점·결정

- **공통 보안 설정 변경(결정 필요)**: `web/next.config.ts`의 CSP에 `frame-src 'self' blob:` 한 줄을 더했다. 계획·설계 어디에도 없던 변경이다. `frame-src`가 없으면 `default-src 'self'`가 적용돼, 설계가 정한 화면 안 뷰어(iframe + Blob URL)를 브라우저가 막는다 — 브라우저 확인에서 콘솔 오류 "Framing 'blob:…' violates … default-src 'self' … 'frame-src' was not explicitly set"로 확인했다. 변경 뒤 화면 안 뷰어에 PDF가 그려졌다. Blob URL은 이 출처의 스크립트만 만들 수 있고 다른 출처의 문서는 여전히 넣을 수 없으며 `frame-ancestors 'none'`·`object-src 'none'`은 그대로다. `test/security-headers.test.mjs`에 단언 한 줄을 더했다. #217 공통 설정이라 **담당 확인이 필요**하며, 받아들이지 않으면 화면 안 뷰어는 쓸 수 없고 새 탭 열기만 남는다.
- **기존 U4 시험 1건 수정**: `test/publications-owner.test.mjs`의 "PDF 자료 표시는 준비 중입니다" 단언을 새 표시(0쪽·PDF 항목 자리·열기 단추 없음)로 바꿨다. 계획 10.3이 그 자리를 교체하도록 정했다. 다른 단언은 그대로다.
- **기존 화면 파일 변경**: `materials-screen.tsx`의 `MaterialsScreen`에 `pdf` 선택 인자(없으면 탭 없이 텍스트 자료만 — 기존 시험이 그대로 통과), `PublishedSnapshotView`·`RecipientPublicationView`·`PublicationDetailView`·`PublicationDetailScreen`에 `pdfSource` 선택 인자, `PublishedItem`의 PDF 형에 `pdfPages` 칸.
- **계획 목록 밖 새 파일**: `materials/pdf-materials-tab.tsx`(탭 상태 모델, 화면 컴포넌트 설계의 `PdfMaterialsTab`), `materials/pdf-clients.ts`(호출 객체), `recipient/pdf-viewer.module.css`.
- **직접 `fetch`**: 계획 10.1은 API 파일만 지목했고 전송 방식은 정하지 않았다. 공통 `api-client.ts`는 고치지 않았다. 공통 인증 통합 시험 전환(`NEXT_PUBLIC_AUTH_SESSION_INTEGRATION=true`)에서는 이 직접 요청이 갱신 흐름을 타지 않는다(기본값인 기존 모드만 확인).
- **브라우저 확인이 잡은 결함 1건(구현)**: 뷰어 모델이 한 번 정리되면 그 뒤 응답을 모두 버려, React 개발 모드(효과를 한 번 정리했다가 다시 붙임)에서 "불러오는 중"에 멈췄다. 다시 붙을 때 받도록 `activate()`를 더하고 회귀 시험을 넣었다. 합성 시험만으로는 드러나지 않았다.
- **브라우저 확인이 잡은 배치 1건**: 화면 안 뷰어가 좁은 목록 칸(234px)에 들어가 PDF 탭 배치를 목록 넓게로 바꿨다(547px).
- **계획에 없는 빈자리(결정 필요)**: 발행 화면(`publish-screen.tsx`)에서 PDF를 고르는 단계가 계획 어느 Step에도 없다. 관측 설계 §3은 "발행 화면: 추출 중·실패 PDF는 고를 수 없게 표시"(NFR7.3)를 요구한다. 지금은 화면만으로 PDF를 발행할 수 없어, 브라우저 확인의 발행본은 발행 API를 직접 불러 만들었다.
- 문서(`materials/README.md`·`recipient/README.md`의 PDF 절)는 계획 12.1 몫이라 쓰지 않았다.

### 16.3 자동 시험·정적 검사 (합성 응답·서버 렌더링)

판본: `api/u8-pdf-materials`·HEAD `7ef0dd69`의 미커밋 작업본(`pdf-viewer-launcher.tsx` sha256 `4a92cc6438e4…`, `pdf-materials-api.ts` `9918415f0724…`, `published-pdf-item.tsx` `109224bfc99f…`, `next.config.ts` `8653eb6af6f6…`). Windows.

| 명령(`cd web`) | 결과 |
|---|---|
| `npm run lint` / `npm run typecheck` | 통과 / 통과 |
| `npm test`(구현 직후 첫 실행, 새 시험 전) | 861건: 860 passed, **1 failed** — `publications-owner.test.mjs`의 "준비 중" 단언(§16.2) |
| `node --test test/recipient-pdf.test.mjs`(첫 실행) | 3 passed, **1 failed** — 시험 쪽 글자 위치 계산이 한 칸 어긋남(구현 변경 없이 시험을 고침) |
| `npm test`(최종 판본, 12:34) | **877 passed**, 실패·건너뜀 0(기존 861 + 새 16) |
| `npm run build` | 성공 |

새 시험 16건: `test/pdf-materials-api.test.mjs` 7건(F-1 제출 전 검사와 요청 없음, F-2 동의 뒤 1회 재전송·닫음·기록 실패·반복 없음, F-3 목록 매핑·배지·사유 문구·조회 실패≠0건, F-4 민감 정보 안내·AI 고지·20벌, 올리기 결과 해석, 삭제 확인, 요청 주소·머리와 토큰 처리), `test/pdf-viewer.test.mjs` 5건(F-5 본문 실패 시 Blob 없음·grant 유지, F-6 401·404 접근 상실과 작성자 404·401 구분, F-7 팝업 차단 요청 1회, F-8 쪽 이동 재사용·재요청·해제 시점·다시 붙기, 화면 표지·sandbox 없음), `test/recipient-pdf.test.mjs` 4건(F-9 `fieldText pages[n]`, `pickItem` 통과·모양 검사, 쪽 표시·읽을 수 없음·강조, 받은 사람·작성자 화면 연결).

이 시험들은 **합성 응답과 대역**(Blob URL 생성·해제, 창 열기, `fetch`)이며 실제 브라우저·api 검증이 아니다.

### 16.4 실제 로컬 API 연결·브라우저 확인 (2026-11-11 12:23~12:34)

환경(이번에만 만든 것, 끝난 뒤 정리): 현재 작업본의 api(`node dist/main.js`, 포트 3311, 로컬 파일 저장소 = 스크래치패드 폴더, 큐 없음)와 web(`next dev`, 포트 3310)을 띄우고, 기존 `catchu-db-test` 컨테이너 안에 확인용 데이터베이스 `catchu_u8_browser_test`를 만들어 썼다. 끝난 뒤 두 서버 프로세스를 종료하고 그 데이터베이스만 이름으로 지웠다(`catchu_test`·`catchu_lock_test`와 컨테이너는 그대로). 브라우저는 Claude 내장 브라우저(Chrome 156 계열)다.

대신한 것: 파일 선택 창은 자동화로 누를 수 없어 3쪽짜리 합성 PDF를 페이지 스크립트로 파일 입력에 넣었다. 추출 worker가 없어 올린 PDF를 DB에서 DONE·쪽 글 3개(2쪽은 읽을 수 없음)로 만들었다. 발행은 발행 API를 직접 불렀다(§16.2 빈자리).

| 흐름 | 브라우저에서 직접 본 것 |
|---|---|
| 개발 로그인 → 자료 화면 → [PDF 자료] 탭 | 탭 전환, 실제 api의 빈 목록, 민감 정보 안내·AI 고지 표시 |
| 올리기(실제 업로드 API) | `POST /pdf-materials` 403 → 동의 창 → [동의] → `POST /ai-consent` 204 → 같은 요청 재전송 201 → 목록 맨 위 "글 추출 중" |
| [원본 보기](CSP 변경 전) | 요청 200, iframe은 생겼지만 콘솔에 CSP 차단 오류(§16.2) |
| [원본 보기](CSP 변경 뒤) | 화면 안 뷰어에 내장 PDF 뷰어가 3쪽 문서를 그림(화면 캡처로 확인), sandbox 속성 없음, 주소는 `blob:…#page=1` |
| [새로고침] | DB에서 DONE으로 바꾼 뒤 "완료 3쪽" |
| 작성자 발행본 상세 | PDF 항목에 "3쪽", 쪽 3개(2쪽 "읽을 수 없음", 3쪽 글의 `<b>`가 글자로 보임), 단추 5개 |
| [원본 3쪽 열기] → [원본 1쪽 열기] | 작성자 사본 요청 1회, 같은 Blob URL에 `#page=3` → `#page=1`(요청 수 그대로 1), 내장 뷰어가 3쪽으로 이동 |
| [뷰어 닫기] → [PDF 보기] | 새 요청(2회째)과 새 Blob URL |
| [새 탭에서 열기] | 이 브라우저가 새 창을 막음 → 요청 1회만 더 나가고(3회째) 화면 안 뷰어에 표시 + 팝업 차단 안내 문구 |
| 받은 사람 화면(공개 링크) | PDF 항목·단추 표시, [PDF 보기] → 받은 사람 사본 경로 200(주소에 쿼리 없음) → 화면 안 뷰어 |
| 사본 파일을 잠시 옮김 → [PDF 보기] | 500 → "PDF를 불러오지 못했습니다. 다시 시도해 주세요", 화면은 판정 통과 상태 그대로 |
| 링크 중지(중지 API) → [PDF 보기] | 404 → "이 링크는 열람할 수 없습니다" 화면으로 전환 |
| 비밀번호 링크 | 비밀번호 입력 → 판정 통과 → 사본 요청에 사전 요청(OPTIONS)이 붙음(머리 `X-Link-Grant`) → 파일 없음 500에서 일반 실패 안내·화면 유지·grant 보관 그대로 → 파일을 되돌린 뒤 비밀번호 재입력 없이 200 |

**브라우저에서 확인하지 못한 것**: 팝업이 허용된 새 탭 열기(이 브라우저가 창을 막음), Blob URL 해제 자체(해제 뒤 접근 실패를 CSP가 가려 구분할 수 없었음 — 모델 시험만), 전송 도중 끊김(대역 시험만), 근거 강조와 스크롤(U5 답변이 필요), PDF 삭제의 네이티브 확인 창, 20 MB·종류 거부의 실제 파일 선택, Safari·Firefox·모바일, 공통 인증 통합 시험 전환 모드.

### 16.5 미검증·남은 것

- **실제 S3: 미검증.** 이번 브라우저 확인의 저장소는 로컬 파일 저장소다.
- **업로드부터 worker 추출까지: 실행하지 않았다.** 업로드 API와 동의 흐름은 실제로 탔지만, 추출은 DB에서 상태와 쪽 글을 직접 넣어 대신했다.
- 발행 화면의 PDF 고르기(계획에 없음, §16.2), CSP 변경의 담당 확인(§16.2).
- api 전체 회귀는 §15.7에 적은 대로 로그 보완 전 판본의 결과다. web은 최종 판본으로 전체 877건을 돌렸다.
- 문서·`source-manifest.json`·`traceability.json`(Step 12).

### 16.6 계획 항목별 판단

| 계획 | 판단 | 근거 | 남은 검증 |
|---|---|---|---|
| 10.1 | 체크 가능 | 구현 완료, F-1~F-4 시험, 실제 업로드 API·동의 흐름·목록·배지·원본 보기를 브라우저에서 확인 | 삭제 확인 창·실제 파일 선택·실패 사유 배지의 브라우저 확인, 추출 worker를 거친 상태 변화 |
| 10.2 | 체크 가능(CSP 변경 수용이 전제) | 구현 완료, F-5~F-8 시험, 화면 안 뷰어·쪽 이동 재사용·재요청·팝업 차단·500 일반 실패(grant 유지)·404 접근 상실을 브라우저에서 확인 | 팝업 허용 새 탭, URL 해제, 전송 도중 끊김의 브라우저 확인. `frame-src` 변경의 담당 확인 |
| 10.3 | 체크 가능 | 구현 완료, F-9 시험, 받은 사람·작성자 화면에서 실제 api의 쪽 사본 표시와 각 사본 경로 사용을 브라우저에서 확인. 기존 U4 시험 1건 수정의 수용이 전제 | 근거 강조·스크롤의 브라우저 확인(U5 답변 필요) |
| 10.4 | 체크 가능 | 계획의 세 시험 파일(계획 ≈13개, 실제 16건)과 web 전체 877건 통과, lint·typecheck·build 통과, 브라우저 확인 수행 | 위 항목들의 브라우저 미확인분 |

### 16.7 담당자 검토와 완료 체크 (2026-11-11)

**담당자 지시로 계획 10.1~10.4를 체크했다.** 커밋·push·PR은 하지 않았고 Step 11은 착수하지 않았다. 이 절을 쓰면서 시험을 새로 실행하지 않았다(근거는 §16.3·§16.4의 실행 결과).

**수용된 것(§16.2에서 "결정 필요"·"수정"으로 적은 두 건)**

- `web/next.config.ts` CSP의 `frame-src 'self' blob:` 추가(와 `test/security-headers.test.mjs`의 단언 한 줄). 이로써 10.2의 전제가 충족된다.
- 기존 U4 시험 `test/publications-owner.test.mjs`의 "PDF 자료 표시는 준비 중입니다" 단언을 새 PDF 항목 표시로 교체.

**체크 판단 근거**

| 계획 | 근거 |
|---|---|
| 10.1 | 계획이 지목한 파일(`pdf-materials-api.ts`·`pdf-upload-form.tsx`·`pdf-material-list.tsx`, `materials-screen.tsx`·`materials-view.tsx`의 PDF 탭)을 구현했고 2026-11-10 보완 문구 5종을 그대로 넣었다. F-1~F-4 자동 시험 통과, 실제 업로드 API·동의 흐름·목록·배지·원본 보기를 브라우저에서 확인(§16.4) |
| 10.2 | 계획의 동작(본문 수신 성공 뒤에만 Blob, 쪽 이동 재사용, 다시 열기·새 탭 재요청, 빈 창 먼저·요청 1회·차단 시 화면 안 뷰어, 401·404 `onAccessLost`, 그 외 일반 실패·grant 유지, 원래 화면이 URL 보관·해제)을 구현했다. F-5~F-8 자동 시험 통과, CSP 변경 수용으로 화면 안 뷰어가 실제 브라우저에서 동작 |
| 10.3 | `published-pdf-item.tsx`, `snapshot-view.tsx` 자리 교체(받은 사람·작성자 모드), `recipient-api.ts`의 `pdfPages` 통과, `recipient-slots.ts`의 `pages[n]`을 구현했다. F-9 자동 시험 통과, 두 화면에서 실제 api의 쪽 사본과 각 사본 경로 사용을 브라우저에서 확인. 교체한 U4 시험은 수용됨 |
| 10.4 | 계획의 세 시험 파일을 `node --test`로 작성·통과(16건), 상호작용 요소에 `data-testid`. web 전체 877건·lint·typecheck·build 통과 |

**발행 화면에서 PDF를 골라 발행하는 경로는 아직 구현되지 않았다.**

- 현재 상태: web 발행 화면(`publish-screen.tsx`·`publish-view.tsx`·`publish-sources.ts`)은 Catch와 텍스트 자료만 고른다(`PublicationItemKind = "CATCH" | "TEXT_MATERIAL"`). api는 Step 8에서 `PDF_MATERIAL` 발행을 받는다.
- **§16.4 브라우저 확인의 발행본 둘(공개·비밀번호)은 화면이 아니라 발행 API(`POST /v1/publications`)를 직접 불러 만들었다.** 따라서 "화면에서 PDF를 골라 발행"하는 흐름은 자동 시험·브라우저 어느 쪽으로도 확인되지 않았다. Step 10의 체크는 계획 10.1~10.4가 적은 범위(자료 탭·뷰어·발행본 표시·시험)에 대한 것이다.
- 연결되는 요구사항: US4.1 AC4.1.1("Catch(설명 포함)·텍스트·PDF가 있음 → 고르고 순서를 정해 발행함", PDF 부분은 후순위)과 AC4.1.9의 PDF 부분, 규칙 BR4.1(추출이 DONE인 PDF만 고를 수 있다), U8 관측 요구사항 NFR7.3 앞 절반("발행에 넣을 수 없는 PDF(추출 중·실패)는 발행 화면에서 고를 수 없게 표시하고 이유를 보인다", 검증: 화면 시험), 관측 설계 §3 「발행 화면」 행.
- 기존 작업·이슈 대조(2026-11-11):
  - 소유 Unit은 U8이다. U4 기능 명세 「하지 않는 것」이 "PDF 선택·복사·열람(U8)"으로 적었고, U8 이슈 [#420](https://github.com/JminAILab/CatchU/issues/420)의 범위 표 「발행」 행이 "추출이 끝난 PDF만 고를 수 있음"이다.
  - 이 화면 작업만 다루는 별도 이슈는 없다(저장소 이슈를 "PDF"로 찾은 결과 U8은 #420 하나, U4 #416은 닫힘). #420의 완료 기준은 "U8이 통합 브랜치에 합쳐졌다" 하나다.
  - U8 코드 생성 계획에는 이 작업을 적은 항목이 없다. Step 8은 api 발행(8.1~8.3), Step 10은 자료 탭·뷰어·발행본 표시다. Step 10 머리가 NFR7.1~7.3을 들지만 항목은 NFR7.3의 뒤 절반(401·404 화면 전환)만 다룬다. 즉 승인 요구사항에는 있고 계획에서 빠진 자리다.

**후속 작업 위치 제안(담당자 결정 대기, 계획은 고치지 않았다)**

1. 구현 — **U8 계획 Step 10에 보완 항목 하나(예: 10.5)로 더해 #420·같은 U8 PR에서 한다.** 근거: 소유가 U8이고(위 대조), 필요한 재료가 모두 이 작업본에 있다(PDF 목록 API와 `extractionBadge`, api의 `PDF_MATERIAL` 발행과 `extractionIncomplete` 거부). 따로 이슈를 열면 U8 PR이 합쳐진 뒤에야 시작할 수 있고, 그사이 통합 브랜치에서는 화면으로 PDF를 발행할 수 없다. 고칠 곳은 U4 화면 파일이다 — `publish-sources.ts`(PDF 자료 목록과 고를 수 없는 이유: 추출 중·실패 사유), `publish-screen.tsx`·`publish-view.tsx`(PDF 목록·고르기·순서), `publications-api.ts`(`PublicationItemKind`에 `PDF_MATERIAL`, 서버 400 `extractionIncomplete` 안내 문구). Step 8.2 보완과 같이 "U4 파일 변경을 U8 PR에 함께"의 형태다.
2. 자동 시험 — 기존 `web/test/publish.test.mjs`에 더한다: DONE만 고를 수 있음, 추출 중·실패는 고를 수 없고 이유 표시(NFR7.3 화면 시험), 고른 순서대로 `PDF_MATERIAL` 항목이 요청에 실림, 서버 `extractionIncomplete` 거부 안내.
3. 실제 연결 검증 — **Step 11.4(대표 PDF 연속 업로드의 추출 완료 시각 측정) 때 함께 본다.** 그 측정은 api·worker·큐를 실제로 띄워 업로드부터 추출까지 타므로, 이어서 발행 화면에서 PDF를 골라 발행 → 받은 사람 열람까지 한 번 보면 지금 미검증인 "업로드부터 worker 추출까지"와 "화면에서 PDF 발행"을 같은 환경에서 닫을 수 있다. 결과는 FR19 확인 표의 U8 행 ③(PDF 포함 발행)에 적는다.

**미검증으로 남는 것(체크와 무관하게 그대로, §16.4·§16.5)**

- 실제 S3(저장·복사·열람·삭제). 이번 확인의 저장소는 로컬 파일 저장소다.
- 업로드부터 worker 추출까지의 연결. 추출 결과는 DB에 직접 넣었다.
- 화면에서 PDF를 골라 발행하는 흐름(미구현).
- 팝업이 허용된 상태의 새 탭 열기, Blob URL 해제의 브라우저 확인, 전송 도중 끊김의 브라우저 확인.
- 근거 강조·스크롤(U5 답변 필요), PDF 삭제의 확인 창, 실제 파일 선택 창, 다른 브라우저, 공통 인증 통합 시험 전환 모드.
- api 전체 회귀는 로그 보완(§15.6·§15.7) 전 판본의 결과다.

### 16.8 계획 10.5 — 발행 화면에서 PDF 선택·발행 (2026-11-11 실행, 담당자 지시 뒤 — 검토 전)

> 담당자가 §16.7의 제안을 수용해 계획 Step 10에 10.5를 더했다(#420, 같은 작업본). 계획 체크박스 10.5는 담당자 검토 뒤에 체크한다(2026-11-11 담당자 지시로 체크함 — 아래 「10.5 판단」). 10.1~10.4의 체크는 그대로다. 커밋·push·PR은 하지 않았고 Step 11은 착수하지 않았다.

근거: US4.1 AC4.1.1의 PDF 부분, 규칙 BR4.1, 관측 요구사항 NFR7.3 앞 절반(계획 10.5에 연결해 적음). 승인 설계 문서는 고치지 않았다.

**구현(U4 화면 파일, `web/src/features/publications/`)**

| 파일 | 바꾼 것 |
|---|---|
| `publish-sources.ts` | `PdfSource`·`pdfSourceOf`: PDF 목록 항목을 상태 표시(자료 화면 배지와 같은 "글 추출 중 / 완료 n쪽 / 실패")와 고를 수 있는지·이유로 바꾼다. DONE만 고를 수 있고, 추출 중은 "글 추출이 끝난 뒤 발행에 넣을 수 있습니다…", 실패는 "글 추출에 실패해 발행에 넣을 수 없습니다" + 실패 사유별 문구. 종류 표지 `ITEM_KIND_LABELS` |
| `publish-screen.tsx` | `PublishClients.pdfs`(선택 인자)와 PDF 목록 읽기·더 보기, `togglePdf`(DONE만 고름, 이미 고른 것은 상태와 무관하게 뺌). 고른 항목은 종류와 상관없이 한 목록이라 섞은 순서가 그대로 발행 요청 `items`의 순서다. 서버가 `extractionIncomplete`로 거부하면 PDF 목록을 다시 읽는다 |
| `publish-view.tsx` | "내 PDF 자료" 목록(상태·이유·비활성, `data-testid="publish-pdf-option"` 등), 고른 목록·확인 단계의 "PDF 자료" 표지 |
| `publications-api.ts` | `PublicationItemKind`에 `PDF_MATERIAL`, 400 `extractionIncomplete` 안내 `PDF_EXTRACTION_INCOMPLETE_TEXT`(항목 개수·중복 안내나 전체 글 상한 안내와 구분) |

`pdfs`를 넘기지 않은 화면은 PDF 자리 없이 Catch·텍스트만 고르는 기존 화면 그대로다. 제품 화면(`PublishPage`)은 `pdfs`를 넘긴다.

**자동 시험(합성 응답·서버 렌더링, `cd web`)** — 판본: 미커밋 작업본(`publish-screen.tsx` sha256 `62e8a7834209…`, `publish-view.tsx` `4a8a28a5c8ee…`, `publish-sources.ts` `dab363ddfb7e…`, `publications-api.ts` `48c35a227265…`, `test/publish.test.mjs` `8c21ad5af736…`)

| 명령 | 결과 |
|---|---|
| `node --test test/publish.test.mjs`(구현 직후, 시험을 더하기 전) | **12 passed** — 기존 Catch·텍스트 발행 시험을 고치지 않고 통과 |
| `node --test test/publish.test.mjs`(시험 4건을 더한 뒤) | **16 passed**, 실패·건너뜀 0 |
| `npm run lint` / `npm run typecheck` / `npm run build` | 통과 / 통과 / 성공 |
| `npm test`(최종 판본, 13:21) | **881 passed**, 실패·건너뜀 0(§16.3의 877 + 새 4) |

기존 시험 파일 `test/publish.test.mjs`에 더한 4건(기존 12건의 단언은 바꾸지 않았다):

| 시험 | 확인한 것 |
|---|---|
| PDF 선택 | 상태별 선택 가능 여부: DONE만 골라지고 추출 중·실패·목록에 없는 ID는 골라지지 않음. 화면에 상태 표시·이유(실패 사유 5종 문구 포함)·비활성, 목록 조회 실패는 0건이 아님 |
| PDF 발행 순서 | 텍스트 → PDF → Catch → 둘째 PDF로 고르고 순서를 바꾼 뒤, 고른 목록·확인 단계·발행 요청 `items`가 모두 같은 순서(`PDF_MATERIAL` 포함) |
| PDF 거부 안내 | 400 `items[i].sourceId`·`extractionIncomplete` → "발행되지 않았습니다" + PDF 추출 안내, 편집 단계로 돌아가고 고른 항목·제목·비밀번호 유지, PDF 목록 재조회 1회, 자동 재발행 없음, 고른 PDF가 고를 수 없는 상태가 돼도 뺄 수 있음. 다른 400은 목록을 다시 읽지 않음 |
| 기존 흐름 | `pdfs` 없이: PDF 상태·자리·요청 없음, Catch·텍스트 발행 요청과 호출 순서가 그대로. `pdfs`가 있어도 PDF를 고르지 않으면 발행 요청이 같음 |

**실제 로컬 API 연결·브라우저 확인(2026-11-11 13:16~13:20)**

환경은 §16.4와 같은 방식이다(현재 작업본의 api 포트 3311·로컬 파일 저장소·큐 없음, web `next dev` 포트 3310, `catchu-db-test` 안에 확인용 데이터베이스 `catchu_u8_browser_test`를 새로 만들어 쓰고 끝난 뒤 그 데이터베이스만 이름으로 삭제, 두 서버 프로세스 종료). Claude 내장 브라우저.

**추출 완료 상태는 시험 데이터로 준비했다.** 실제 업로드 API로 합성 PDF 셋을 올린 뒤(동의 기록·텍스트 자료 하나도 API로 만듦), 추출 worker가 없으므로 DB에서 직접 하나는 DONE·쪽 글 3개(2쪽은 읽을 수 없음), 하나는 FAILED(`TEXT_LIMIT_EXCEEDED`)로 바꾸고 하나는 PENDING 그대로 두었다. 발행은 API를 부르지 않고 화면에서 했다.

| 흐름 | 브라우저에서 직접 본 것 |
|---|---|
| 개발 로그인 → 발행본 → [새로 발행] | 안내 문구에 "PDF 자료", "내 PDF 자료"에 실제 api의 셋: 완료 PDF는 "완료 3쪽"·활성, 추출 중 PDF는 "글 추출 중"·이유·비활성, 실패 PDF는 "실패"·이유(사유 문구 포함)·비활성 |
| 추출 중 PDF 누르기 | 골라지지 않음 |
| 완료 PDF → 텍스트 자료 순으로 고름 | 고른 목록이 "PDF 자료 … → 텍스트 자료 …" 순서, 완료 PDF만 눌린 상태 |
| 제목 입력 → [다음] → 확인 단계 | 항목이 같은 순서로 보임 |
| [발행] | `POST /v1/publications` 201, 완료 화면에 상태 "유효"와 링크 주소. DB의 `published_item`은 1번 `PDF_MATERIAL`(사본 키 있음, 쪽 사본 3행)·2번 `TEXT_MATERIAL`, 저장 폴더에 사본 파일 1개 |
| 받은 사람 화면(발행된 링크) | 항목 순서 PDF → 텍스트, 쪽 3개(2쪽 "읽을 수 없음"), [PDF 보기] → 받은 사람 사본 경로 200 → 화면 안 뷰어에 내장 PDF 뷰어가 1/3쪽을 그림(화면 캡처) |

브라우저에서 확인하지 않은 것: Catch를 함께 섞은 발행(이 회원에게 Catch가 없었다 — 자동 시험만), 순서 바꾸기 단추(자동 시험만), 서버의 `extractionIncomplete` 거부(자동 시험만), 20개 한도.

**남는 것**

- **실제 업로드 → worker 추출 → 화면 선택·발행 → 받은 사람 열람은 11.4에서 확인한다**(계획 10.5에 적음). 이번에는 추출 결과를 DB에 직접 넣었다.
- 실제 S3, 팝업이 허용된 새 탭 등 §16.5·§16.7의 미검증은 그대로다.
- api는 이번에 고치지 않았다(발행 api는 Step 8 그대로).

**10.5 판단**

| 계획 | 판단 | 근거 | 남은 검증 |
|---|---|---|---|
| 10.5 | **체크함**(2026-11-11 담당자 지시) | 담당자 확인: 현재 작업본의 발행 화면 시험 `test/publish.test.mjs` 16건이 담당자의 별도 재실행에서도 전부 통과했다. 브라우저 확인의 추출 상태는 DB로 준비한 시험 데이터라는 범위는 위 그대로다(worker 추출을 거친 흐름은 11.4). 계획 10.5가 적은 네 파일 구현, 기존 시험 파일에 상태별 선택·혼합 순서·`extractionIncomplete` 안내·기존 흐름 4건(16건 통과), web 전체 881건·lint·typecheck·build 통과, 실제 로컬 api와 브라우저로 화면에서 PDF를 골라 발행하고 받은 사람 화면에서 사본이 열림을 확인 | worker 추출을 거친 전체 흐름(11.4), Catch 혼합·순서 바꾸기·서버 거부의 브라우저 확인 |

## 17. Step 11 — 설정·배포 준비와 추출 시간 측정 (2026-11-11 실행, 담당자 지시 뒤 → 같은 날 완료 체크, §17.9)

계획 11.1~11.4를 실행했다. **계획 체크박스는 바꾸지 않았다**(담당자가 결과를 본 뒤 결정). 커밋·Step 12 착수도 하지 않았다. api·worker·web의 실행 코드는 이번에 고치지 않았고, 바뀐 것은 설정 예시·로컬 compose·api 이미지 한 줄·배포 안내 한 문장이다.

### 17.1 계획 항목별 변경

| 계획 | 파일 | 한 일 |
|---|---|---|
| 11.1 | `api/.env.example` | 파일 저장 설정 이름 `FILE_STORAGE_DRIVER`·`FILE_STORAGE_LOCAL_ROOT`·`FILE_STORAGE_S3_BUCKET`·`AWS_REGION`을 값 없이 더하고, 셋 다 비울 때의 동작(기동은 하고 파일 저장 호출만 실패)·드라이버별로 넣을 값·함께 넣으면 기동하지 않는 조합을 주석으로 적음 |
| 11.1 | `worker/.env.example` | PDF 소비자 설정을 주석 처리한 예시로 더함: `PDF_FILE_ROOT`, `FILE_STORAGE_S3_BUCKET`, `AWS_DEFAULT_REGION`, `CATCHU_WORKER_PDF_CONCURRENCY=1`, `CATCHU_WORKER_PDF_CHILD_TIMEOUT_SECONDS=120`, `CATCHU_WORKER_PDF_CHILD_MEMORY_MB=512`(값은 코드 기본값). 두 읽기 경로 가운데 하나만 넣는다는 것과 둘 다 비울 때·둘 다 넣을 때의 동작을 적음 |
| 11.2 | `deploy/compose.local-db.yaml` | 이름 붙은 볼륨 `files`를 더해 api에는 `/var/lib/catchu/files`(쓰기), worker에는 같은 경로 `:ro`로 붙임. 볼륨은 붙이기만 하고, 쓰려면 환경 파일에 api `FILE_STORAGE_DRIVER=local`·`FILE_STORAGE_LOCAL_ROOT=/var/lib/catchu/files`, worker `PDF_FILE_ROOT=/var/lib/catchu/files`를 넣는다고 주석으로 적음 |
| 11.3 | (변경 없음) | 잠금 파일은 Step 4·7에서 이미 갱신돼 있어 이번에 바꾼 것이 없다. 확인만 함(§17.3) |
| 11.4 | (저장소 변경 없음) | 측정과 직접 확인(§17.4~§17.6). 측정 스크립트와 결과 파일은 저장소 밖에 둠 |

비밀값·실제 버킷 이름·실제 주소는 어느 파일에도 넣지 않았다.

### 17.2 계획과 다른 점·결정

- **계획 목록 밖 변경 두 건.** (1) `api/Dockerfile` 실행 단계에 `RUN mkdir -p /var/lib/catchu/files && chown 1000:1000 /var/lib/catchu/files` 한 줄을 더했다. api 이미지는 UID 1000으로 돌고 루트 파일시스템이 읽기 전용이라, 이 폴더가 이미지에 실행 사용자 소유로 있어야 새로 붙인 볼륨에 api가 쓸 수 있다(없으면 볼륨이 root 소유로 만들어져 업로드가 실패한다). s3 드라이버는 이 폴더를 쓰지 않는다. (2) `deploy/README.md`의 `down -v` 설명 한 문장에 로컬 파일 저장 볼륨(`files`)도 지워진다는 것을 더했다. **두 건 모두 담당자 수용 여부 확인이 필요하다.**
- **계획에 없던 설정 이름 두 개.** `AWS_REGION`(api, AWS SDK가 읽음)과 `AWS_DEFAULT_REGION`(worker, boto3가 읽음). §14에서 S3 드라이버에 지역 값이 필요하다고 확인한 것을 예시 파일에 이름만 적었다. 코드가 새로 읽는 값은 아니다.
- `compose.local-db.yaml`에만 볼륨을 넣었다. 개발 서버용 구성과 공유 인프라(#389)는 건드리지 않았다(계획 11.2).
- 11.4의 계획 문장은 "추출 완료 시각을 1회 재어 기록"이다. 담당자 지시(2026-11-11)에 따라 실제 worker가 DONE으로 만든 PDF를 화면에서 선택·발행하고 받은 사람 화면에서 사본을 여는 확인을 함께 했다(계획 10.5가 11.4로 넘긴 흐름).

### 17.3 11.1~11.3 확인 결과

| 확인 | 방법 | 결과 |
|---|---|---|
| 합친 compose 설정 | `docker compose config`(단일 구성 + local-db, 더미 환경 파일) | api에 `files` 쓰기 마운트, worker에 `files` 읽기 전용 마운트, 최상위 볼륨 `db-data`·`files`. 오류 없음 |
| api 이미지의 볼륨 쓰기 | 현재 작업본으로 api 이미지를 빌드해 새 이름 붙은 볼륨을 붙이고 UID 1000으로 파일 쓰기 | 성공. 폴더 소유 `1000:1000`·권한 755, `/app`은 읽기 전용 그대로 |
| worker 이미지의 읽기 전용 | 현재 작업본으로 worker 이미지를 빌드해 같은 볼륨을 `:ro`로 붙임 | 읽기 성공, 쓰기 거부. 이미지 안 pypdf 7.0.0·boto3 1.43.126 |
| api 잠금 파일 | `npm ci --dry-run` | 정상(잠금 파일과 `package.json` 일치) |
| worker 잠금 파일 | `uv lock --check` | 정상 |
| 의존성 점검 | `bash .github/scripts/check-deps-audit.sh api worker` | 종료 코드 0. api는 moderate 한 건(minimatch) 참고 표시만 있고 차단 기준(high 이상) 없음, worker 취약점 없음. **예외를 더하지 않았다** |

**실행하지 않은 것**: `compose.single` + `compose.local-db` 전체 스택을 올려 그 안에서 업로드·추출을 돌려 보지는 않았다. 이 구성의 api는 운영 모드라 개발 로그인이 없고 평문 큐 주소를 받지 않아 이번 확인 흐름에 맞지 않았다. 볼륨 동작은 위처럼 이미지 단위로만 확인했다. 확인용 볼륨·이미지는 끝난 뒤 이름으로 지웠다.

### 17.4 11.4 환경 — 사용한 저장소와 큐 (2026-11-11 13:31~13:36 KST)

| 구성 | 실제로 쓴 것 |
|---|---|
| 파일 저장소 | **로컬 파일 저장 드라이버**(`FILE_STORAGE_DRIVER=local`). 저장소 밖 임시 폴더를 api가 쓰고, 같은 폴더를 worker 컨테이너에 `/var/lib/catchu/files`로 **읽기 전용** 연결(`PDF_FILE_ROOT`). **실제 S3는 쓰지 않았다** |
| 큐 | 이번 확인 전용 Valkey 컨테이너(`valkey/valkey:8.1.6-alpine`, 디스크 저장 끔, 평문 연결). 큐 접두사 `catchu-u8s11`. api와 worker가 같은 큐에 붙음 |
| api | 호스트에서 현재 작업본의 `dist/main.js`, 개발 모드, 포트 3311. `CATCHU_QUEUE_REDIS_URL`이 있어 추출 요청 발행과 결과 수신(`PdfExtractionReceiver`)이 함께 조립됨 |
| worker | 현재 작업본으로 빌드한 worker 이미지의 컨테이너(Linux, `python -m app.consumer`). `--read-only`·`--tmpfs /tmp`·`--cap-drop ALL`, 메모리 2g, `NODE_ENV=test`, `CATCHU_WORKER_MOCK=true`(분석 요청용 설정이며 PDF 추출은 MOCK이 아니라 pypdf로 실제 추출). 기동 로그 `pdf=enabled(concurrency=1)`, 상태 확인 `consumer: running`. 자식 프로세스 제한은 기본값(120초·512 MB) |
| DB | 담당자 시험 컨테이너 `catchu-db-test` 안에 확인용 데이터베이스 `catchu_u8_step11_test`를 새로 만들어 마이그레이션 적용. `catchu_test`·`catchu_lock_test`는 건드리지 않음 |
| web | 현재 작업본의 `next dev`, 포트 3310. Claude 내장 브라우저 |
| 도구 | Docker 29.6.1(Windows). worker는 Windows에서 서비스로 뜨지 않아 컨테이너로 돌렸다(§12) |

**정리**: 끝난 뒤 이번에 만든 것만 이름으로 하나씩 지웠다 — api·web 프로세스 2개, 컨테이너 2개(worker·큐), 망 1개, 이미지 2개, 볼륨 1개, 데이터베이스 `catchu_u8_step11_test`. 남은 컨테이너·볼륨·망·이미지 0, 포트 3310·3311 대기 0. 기존 컨테이너와 이미지는 그대로다.

### 17.5 11.4 측정 결과 — 대표 PDF 연속 업로드의 추출 완료 시간

**측정 요약.** 20·30·40·50·50쪽 합성 PDF 5건, 마지막 파일은 쪽마다 그림 포함. 다섯 건 모두의 DONE 최초 관측은 2차 2,471 ms, 3차 2,217 ms다.

**측정 방법.** 20·30·40·50·50쪽 합성 PDF 5건(마지막 파일은 쪽마다 그림 포함)을 앞 요청의 201을 받는 즉시 이어서 올리고(추출을 기다리지 않음), 목록 API를 0.2초마다 읽어 상태가 `PENDING`에서 바뀐 것을 처음 본 시각을 적었다. 시각은 첫 업로드를 보내기 직전부터 잰 ms다. 관찰 오차는 최대 약 0.2초 + 요청 시간이다. 이 스크립트는 DB를 건드리지 않는다.

**대표 PDF.** 실제 사용자 문서가 아니라 **합성 PDF**다(Helvetica 글만 있는 쪽, 쪽당 약 1,000자). 다섯째만 쪽마다 압축하지 않은 그림을 넣어 파일을 약 15 MB로 키웠다.

| # | 쪽 | 크기(B) | 2차: 접수 | 2차: DONE 관찰 | 2차: 접수 뒤 대기 | 3차: 접수 | 3차: DONE 관찰 | 3차: 접수 뒤 대기 |
|---|---|---|---|---|---|---|---|---|
| 1 | 20 | 27,834 | 29 | 527 | 498 | 37 | 572 | 535 |
| 2 | 30 | 41,594 | 60 | 1,002 | 942 | 84 | 1,034 | 950 |
| 3 | 40 | 55,354 | 88 | 1,467 | 1,379 | 117 | 1,264 | 1,147 |
| 4 | 50 | 69,173 | 115 | 1,935 | 1,820 | 145 | 1,747 | 1,602 |
| 5 | 50 + 쪽마다 그림 | 15,441,006 | 279 | 2,471 | 2,192 | 320 | 2,217 | 1,897 |

- 업로드 5건이 모두 접수되기까지 2차 279 ms, 3차 320 ms. **다섯 건이 모두 DONE으로 처음 관측된 시각은 마지막 파일의 DONE 최초 관측값인 2차 2,471 ms, 3차 2,217 ms이며 이것을 대표 수치로 쓴다.** 다섯 건 모두 쪽 수가 올린 쪽 수와 같았다.
- 결과 파일의 `totalMs`(2차 2,690 ms, 3차 2,422 ms)는 완료 시각이 아니라 **측정 스크립트가 끝난 시각**이다(2026-11-11 담당자 지시로 기존 측정 기록에서 확인). 스크립트는 목록을 읽은 직후의 시각을 DONE 관측 시각으로 적고, 그 뒤 0.2초를 기다린 다음에야 반복을 끝내고 `totalMs`를 적는다. 두 값의 차이가 2차 219 ms, 3차 205 ms로 그 대기 0.2초와 맞는다. 따라서 `totalMs`는 추출 완료 시간으로 쓰지 않는다. 1차의 `totalMs` 2,405 ms(마지막 상태 변화 관측 2,190 ms)도 같다.
- worker 로그의 `PDF 추출 시작` ~ `PDF 결과 전송` 간격으로 본 건당 추출은 약 0.33~0.56초(15 MB 파일 약 0.47~0.51초)다. 동시성 1이라 한 건씩 차례로 처리돼, 뒤에 올린 것일수록 대기가 길다(위 표의 계단 모양).
- worker 컨테이너 메모리 약 58 MiB, 큐 약 10 MiB(측정 직후 `docker stats` 한 번).

**1차 측정(스크립트 잘못으로 다시 잰 판본).** 합성 글의 줄 길이를 자르지 않아 50쪽 두 건의 글 합계가 60,000자를 넘었다. 결과는 20·30·40쪽 DONE(576·1,042·1,271 ms), 50쪽 두 건 FAILED `TEXT_LIMIT_EXCEEDED`(1,731·2,190 ms)였고 worker 로그에 "쪽 글 합계 상한 초과 … limit=60000"이 남았다. 의도한 측정은 아니지만, **글 합계 상한(Step 7.1)이 실제 큐·worker·api 수신 연결에서 동작해 목록에 FAILED와 사유 코드로 보인 관찰**이다. 줄 길이를 84자로 잘라(50쪽 합 약 51,000자) 2·3차를 쟀다.

**집계(세 차례 15건 + 화면 업로드 1건 = 16건).** worker 로그: 추출 시작 16, 성공 14, 실패 2, 결과 수신 확인 `ACCEPTED`/`OK` 16, ERROR·WARNING·Traceback 0. api 로그: `PDF_EXTRACTION_RECEIVED` 16, 실패 로그 0. DB `pdf_material`: DONE 14, FAILED 2. worker 로그에 저장 키·파일 경로는 없다(`members/`·`.pdf`로 찾은 34줄은 모두 로거 이름 `app.pdf_extraction.*`).

**동시성 기본값 검토 근거로 읽을 때.** 이 측정에서는 동시성 1로 20·30·40·50·50쪽 합성 PDF 5건 연속 업로드가 약 2.2~2.5초에 모두 DONE으로 관측돼, 추출 대기 시한 10분과 견주면 여유가 크다. 다만 아래 한계가 있어 **기본값(1)을 바꿀 근거도, 실제 문서에서 충분하다는 근거도 이 측정만으로는 되지 않는다.**

- 합성 PDF는 글만 있고 글꼴·구조가 단순하다. 스캔본·복잡한 조판·글꼴이 많이 든 실제 이력서·포트폴리오는 쪽당 추출이 훨씬 느릴 수 있다. 실제 사용자 문서로는 재지 않았다.
- 로컬 파일 읽기다. S3에서 내려받는 시간은 들어 있지 않다.
- 개발용 PC 한 대에서 다른 요청이 없는 상태로 잰 값이다. 분석 요청과 같은 프로세스에서 함께 돌 때의 영향은 재지 않았다.
- 계획은 1회 측정이다. 유효한 측정은 2회(2·3차)다.

### 17.6 11.4 직접 확인한 흐름 — 실제 worker 추출 → 화면 선택·발행 → 받은 사람 열람

회원 `u8-step11-author-1`(개발 로그인). **이 흐름에서는 DB를 직접 고치지 않았다.** PDF의 추출 상태는 모두 실제 worker가 큐로 받아 처리하고 api가 결과를 수신해 바꾼 것이다(§16.8의 브라우저 확인과 다른 점).

| 흐름 | 브라우저에서 직접 본 것 |
|---|---|
| 자료 화면 → PDF 탭 | 측정으로 올린 15건이 실제 상태로 보임(완료·쪽 수, 실패·사유) |
| PDF 탭에서 3쪽 PDF 업로드(제목 `screen-upload-check`) | `POST /v1/pdf-materials` 201, 목록에 "글 추출 중" |
| [새로고침] | 같은 행이 "완료 3쪽"(worker가 추출해 api가 수신) |
| 발행본 → [새로 발행] | "내 PDF 자료" 16건 가운데 DONE 14건은 활성, FAILED 2건은 이유와 함께 비활성 |
| worker가 DONE으로 만든 "[synthetic] resume 20 pages"와 `screen-upload-check`를 고름 → 제목 → [다음] → [발행] | `POST /v1/publications` 201, 완료 화면에 상태 "유효"와 링크. DB의 `published_item` 1번 `PDF_MATERIAL`(쪽 사본 20행)·2번 `PDF_MATERIAL`(쪽 사본 3행), 원본 상태 DONE |
| 받은 사람 화면(발행된 링크) | 두 항목이 고른 순서로 보이고 쪽 글이 worker가 뽑은 글 그대로 표시. 두 항목 모두 [PDF 보기] → 받은 사람 사본 경로 200 → 화면 안 뷰어에 PDF가 그려짐(화면 캡처) |

이로써 계획 10.5가 11.4로 넘긴 "실제 업로드 → worker 추출 → 화면 선택·발행 → 받은 사람 열람"을 로컬 파일 저장소와 로컬 큐에서 한 번 이어서 확인했다.

### 17.7 미검증·남은 것

- **실제 S3**: 업로드·추출·사본 복사·열람 어느 것도 실제 S3로 돌리지 않았다(§12.9·§14·§16.5의 미검증 그대로). 이번 확인은 전부 로컬 파일 저장 드라이버다.
- **전체 compose 스택**: `compose.local-db.yaml`의 `files` 볼륨은 이미지 단위 쓰기·읽기 전용 확인과 `compose config`까지만 했다. 스택을 올려 그 안에서 업로드·추출을 돌리지 않았다.
- **실제 사용자 문서·스캔본**으로의 추출 시간, S3 내려받기 시간, 분석 요청과 함께 돌 때의 시간.
- **추출 실패 경로의 실제 연결**은 `TEXT_LIMIT_EXCEEDED` 하나만 봤다. 시간 초과·메모리 제한·깨진 PDF·암호 걸린 PDF의 실제 큐 연결은 자동 시험(§12)만 있다.
- **브라우저 미확인**: 팝업이 허용된 새 탭 열기(내장 브라우저가 팝업을 막음), Blob URL 해제(§16.5), Catch를 섞은 발행·순서 바꾸기 단추·서버의 `extractionIncomplete` 거부(§16.8 그대로, 자동 시험만).
- **회귀 시험 재실행 없음**: 이번 변경은 설정 예시·compose·Dockerfile 한 줄·안내 문장이라 api·worker·web 자동 시험을 다시 돌리지 않았다. api 이미지와 worker 이미지 빌드는 현재 작업본으로 성공했다.
- 개발 서버 배포 뒤 확인 항목(§14)은 그대로 남는다.

### 17.8 계획 항목별 판단

| 계획 | 완료 체크 가능 여부 | 근거 | 담당자 확인이 필요한 것 |
|---|---|---|---|
| 11.1 | 가능 | 두 예시 파일에 계획이 적은 이름이 모두 있고 값은 비움 또는 코드 기본값, 비밀값 없음 | 계획에 없던 `FILE_STORAGE_LOCAL_ROOT`·`AWS_REGION`·`AWS_DEFAULT_REGION`·자식 제한 두 이름을 함께 적은 것 |
| 11.2 | 가능(조건부) | 로컬 compose에 읽기 전용 볼륨 추가, 합친 설정 확인, 실제 이미지로 api 쓰기·worker 읽기 전용 확인, 공유 인프라 미변경 | `api/Dockerfile` 한 줄과 `deploy/README.md` 한 문장(계획 목록 밖) 수용 여부. 전체 스택 미실행 |
| 11.3 | 가능 | 잠금 파일 두 개가 선언과 일치, 의존성 점검 종료 코드 0, 예외 추가 없음 | 없음 |
| 11.4 | 가능 | 수십 쪽 PDF 5건 연속 업로드의 추출 완료 시각을 실제 큐·worker로 재어 기록(유효 2회), 담당자가 더한 화면 선택·발행·받은 사람 열람을 worker가 만든 DONE으로 확인 | 측정이 합성 PDF·로컬 파일 저장소라는 한계(§17.5)를 받아들일지. 동시성 기본값 1과 10분 시한은 바꾸지 않았다 |

### 17.9 담당자 검토와 완료 체크 (2026-11-11)

담당자가 §17의 결과를 보고 다음을 결정했다. 이 절 위의 "체크박스는 바꾸지 않았다"·"수용 여부 확인이 필요하다"는 검토 전 기록이며 그대로 둔다.

- **계획 11.1~11.4 완료 체크를 수용**했다. 계획 문서의 네 항목을 `[x]`로 바꿨다.
- **계획 목록 밖 변경을 수용**했다: `api/Dockerfile`의 UID 1000 소유 폴더 생성 한 줄, `deploy/README.md`의 공유 볼륨(`files`) 삭제 안내 한 문장, 설정 예시의 로컬 경로(`FILE_STORAGE_LOCAL_ROOT`)와 지역(`AWS_REGION`·`AWS_DEFAULT_REGION`) 이름.
- **측정 요약 문구를 맞추고 두 수치의 시점을 구분**했다(§17.5). 대표 수치는 다섯 건 모두의 DONE 최초 관측값(2차 2,471 ms, 3차 2,217 ms)이고, 2,690 ms·2,422 ms는 측정 스크립트 종료 시각이다. 근거는 측정 스크립트의 기록 순서와 두 값의 차이(219 ms·205 ms)가 반복 끝의 0.2초 대기와 맞는 것이다. 다시 재지는 않았다.
- 미검증 범위(§17.7)는 그대로다: 실제 S3, Compose 전체 스택 기동.

## 18. Step 12 — 문서·계약 변경안·추적 (2026-11-11 실행, 담당자 지시 뒤 → 같은 날 완료 체크, §18.7)

계획 12.1~12.3을 실행했다. **계획 체크박스는 바꾸지 않았다**(담당자가 결과를 본 뒤 결정). 커밋·푸시·PR 생성도 하지 않았다. 실행 코드는 고치지 않았고 문서와 기록만 바꿨다. 자동 시험은 다시 돌리지 않았다(문서 변경뿐).

확인 범위는 모든 문서에 같은 말로 적었다: **로컬 파일 저장소에서 실제 큐와 실제 worker를 거친 전체 흐름은 확인됨**(§17.4~§17.6), **실제 S3와 Compose 전체 스택 기동은 미검증**.

### 18.1 계획 12.1 — 문서

| 파일 | 한 일 |
|---|---|
| `api/docs/pdf-materials.md`(새 문서) | 표와 파일 키, PDF 자료 API 5개(업로드·목록·상세·원본 열람·삭제)와 오류·상한·시한, 추출 메시지 봉투와 수신 판정 5종(C-16 더하는 변경 표시), 발행의 PDF 부분(C-17), PDF 사본 열람 두 경로(C-12 추가 경로 표시), 설정 이름, 로그 사건, 수용한 위험, 확인 범위, 시험 파일과 실행 명령 |
| `api/docs/publications.md` | 「표」 절에 PDF 자료 문서 링크 1줄 |
| `worker/README.md` | 「PDF 글 추출 소비자」 절(처리 순서, 경우별 결과, 설정 5개와 기동 규칙, 확인 범위)과 파일 역할 표에 `app/pdf_extraction/` 행 |
| `web/src/features/materials/README.md` | 「PDF 자료 탭 (U8)」 절(파일·동작·시험과 확인 범위) |
| `web/src/features/recipient/README.md` | 「PDF 항목과 사본 열람 (U8)」 절(쪽 표시·근거 강조·열기·다시 요청·접근 상실·해제·CSP)과 "PDF 항목은 자리만 보인다" 문장 갱신 |

**계획 목록 밖 문서 변경 두 건(담당자 수용 여부 확인 필요).**

- `api/docs/file-storage.md`: "환경변수 예시 파일의 두 S3 설정 이름은 U8 Step 11에서 더한다"가 Step 11 뒤로 사실과 달라져 지금 상태로 한 문장 고쳤다.
- `web/src/features/publications/README.md`: 발행 화면이 Catch·텍스트 자료만 고른다고 적혀 있어, 계획 10.5의 PDF 선택·발행을 파일 표 한 칸과 동작 한 항목으로 더했다.

문서 사이 상대 링크는 대상 파일이 실제로 있는지 확인했다(§18.6).

### 18.2 계획 12.2 — 계약 변경안 (별도 계약 수정 PR로 넘김)

**계약 문서 `contract-summary.md`와 `api/contracts/repository-analysis/worker-messages.yaml`은 고치지 않았다**(계약 소유 규칙). 아래는 지금 코드가 전제하는 값이며, 계약 검토에서 달라지면 api `src/pdf-extraction/pdf-extraction-spec.ts`와 worker `app/pdf_extraction/envelope.py`·`app/consumer/queues.py`를 함께 고친다.

**C-16 PDF 글 추출 요청·결과 수신 — 더하는 변경.** 원문에 없는 것은 봉투 필드(`schemaVersion`·`messageId`), 결과의 `memberId`·`failureCode`, 쪽 배열의 제약, 수신 확인의 모양이다. 큐 이름·작업 이름·작업 ID·판정 5종의 뜻은 원문 그대로다.

```yaml
channels:
  pdf-extraction-requests:                 # api → worker
    publish:
      message:
        name: PdfExtract                   # 작업 ID = pdfMaterialId, 시도 1회, 재시도 없음, 완료·실패 작업 2시간 보관
        payload:
          schemaVersion: "2"               # 더함. 10월 worker 결과 메시지 봉투와 같은 값
          messageId: "pdf-extract-{pdfMaterialId}"   # 더함
          pdfMaterialId: uuid              # 소문자
          memberId: uuid                   # 소문자
          storageKey: "members/{memberId}/materials/{pdfMaterialId}.pdf"   # 두 ID에서 나온 값과 같아야 함
        # 다섯 필드만. worker는 모양이 틀리면 결과 없이 작업을 실패로 끝낸다
  worker-messages:                         # worker → api, 10월 큐에 작업 이름 하나 더함
    subscribe:
      message:
        name: PdfExtractionResult          # 작업 ID = messageId
        payload:
          schemaVersion: "2"               # 더함
          messageId: "message-pdf-{pdfMaterialId}-result"   # 더함
          pdfMaterialId: uuid
          memberId: uuid                   # 더함. pdf_material의 회원과 다르면 CONTEXT_MISMATCH
          outcome: SUCCEEDED | FAILED
          pages:                           # SUCCEEDED만(FAILED면 없거나 null)
            - { pageNumber: int, readable: boolean, text: string }
            # 1~50개, pageNumber는 1부터 연속, 세 필드만, text에 NUL 없음, readable == (text != ""),
            # text 코드 포인트 합 60,000 이하. 글은 신뢰하지 않는 입력
          failureCode: ENCRYPTED | UNREADABLE_FILE | PAGE_LIMIT_EXCEEDED | TEXT_LIMIT_EXCEEDED   # 더함. FAILED만
        # 정의 밖 필드 거부. DEADLINE_EXCEEDED는 api 시한 판정이 넣으며 worker가 보내면 SCHEMA_INVALID
receipt:
  shape: { schemaVersion: "2", messageId, pdfMaterialId, disposition, code }   # 더함(10월 수신 확인 모양에 맞춤)
  ACCEPTED/OK: PENDING이고 시한 전 → 저장 뒤 커밋한 다음에만
  DUPLICATE/ALREADY_RECEIVED: 이미 DONE
  REJECTED/CONTEXT_MISMATCH: pdf_material 없음 또는 회원 불일치
  REJECTED/STALE_ATTEMPT: FAILED, 또는 PENDING인데 시한 지남(이때 FAILED/DEADLINE_EXCEEDED로 저장)
  REJECTED/SCHEMA_INVALID: 모양 오류(식별자조차 없으면 수신 확인 없음)
  저장 실패: 수신 확인 없이 작업 실패, 자료는 시한으로 FAILED
```

- `TEXT_LIMIT_EXCEEDED`와 쪽 글 합계 60,000자는 팀장 결정(2026-11-10, #420)으로 더해졌다. §11.6·§12의 앞선 메모에는 실패 사유가 셋으로 적혀 있으며 이 절이 최신이다.
- 계약 YAML(`worker-messages.yaml`)에 `PdfExtractionResult` 스키마를 더할지는 계약 PR에서 정한다. 지금은 코드(`isValidPdfExtractionResult`, worker `is_valid_result`)로 검사한다(D18·D30).

**C-12 받은 사람 브라우저용 HTTP 경로 — 더하는 변경.** 경로 하나를 더한다(제공 Unit U8). 기존 경로는 바꾸지 않는다.

```yaml
  /public/links/{token}/items/{publishedItemId}/pdf:
    get:
      summary: 발행본 PDF 사본 열람 (U8, 로그인 없음)
      parameters: [{ name: X-Link-Grant, in: header, required: false }]
      responses:
        "200": "application/pdf — inline; filename=\"document.pdf\", Cache-Control: no-store, X-Content-Type-Options: nosniff"
        "401": LINK_PASSWORD_REQUIRED
        "404": LINK_UNAVAILABLE          # 링크 판정 실패, 또는 그 발행본의 PDF_MATERIAL 항목이 아님(사유를 구분하지 않음)
        "500": 파일 없음·저장소 실패
      # 판정은 C-10 resolveForRecipient 그대로. Range 미지원. 시도 제한 없음
```

- 같은 절의 `PublishedSnapshot`에서 PDF 항목은 `snapshot: { pageCount }`와 `pdfPages: [{ pageNumber, text, readable }]`를 갖고 다른 종류의 `pdfPages`는 `null`이다. 이 칸은 C-07·C-10에 이미 있는 모양이라 변경안에 넣지 않았다.
- 작성자 사본 경로 `GET /v1/publications/{publicationId}/items/{publishedItemId}/pdf`와 PDF 자료 API 5개는 계약이 "각 Unit 안의 web↔api"로 둔 범위라 계약 변경이 아니다.

### 18.3 계획 12.3 — 소스 목록과 요구사항 추적

- **`source-manifest.json`**: Step 1~6까지 33개였던 목록을 Step 1~12의 108개로 다시 만들었다. 기존 목록에 지금 작업본의 변경·새 파일(aidlc 기록 제외)을 더했고 모든 경로가 실제로 있는지 확인했다. 계약 문서는 목록에 없다(고치지 않음).
- **`traceability.json`**: 111행(AC·BR·NFR) 가운데 110행을 OK로, 1행을 GAP로 적었다. 계획의 「단계 → 스토리·요구사항 대응」 표와 Step 1~3 때 적어 둔 행별 Step 메모를 따라 Step 단위의 구현 파일과 시험 파일을 넣었다.
  - 센서 규칙상 코드 생성 단계의 `target`은 실제로 있는 파일 경로 하나여야 한다. 그래서 `target`에는 대표 파일 하나를, 나머지 구현·시험 파일과 확인 범위는 그 행의 `note`에 적었다. Step 1~3의 기존 OK 7행도 같은 모양으로 옮겼고 내용은 보존했다.
  - 대표 파일을 정할 수 없는 두 행(NFR4.13 두지 않는 것 확인, NFR6.4 확인 표 입력)은 이 기록 문서를 `target`으로 뒀다.
  - **GAP 1행: NFR5.4**(S3 실제 삭제 확인). 실행하지 않았으므로 OK로 적지 않았다.
- **센서 실행**: `aidlc engine sensor fire traceability --stage code-generation --output-path …/traceability.json` 결과 `failed`, 지적은 `gaps: ["NFR5.4"]` 하나이고 `invalid_targets`·`orphans`·`missing_*`는 0이다. NFR5.4가 미실행인 동안 이 센서는 통과하지 않는다.
- **계획과 다른 점**: 계획이 적은 `--write-upstream`은 쓰지 않았다. 상류 ID 목록은 Step 1~3 때 이미 들어 있고, 센서 상류 목록에 없는 NFR6.x·NFR7.x를 손으로 더한 상태라 덮어쓰지 않으려는 것이다. 행 단위 메모가 "Step n"으로만 적힌 요구사항은 그 Step의 파일 묶음으로 연결했으므로, 요구사항 한 줄과 시험 한 건의 일대일 대응까지는 적지 않았다.

### 18.4 확인 표 입력(NFR6.4)과 두 가지 검토(NFR2.2·NFR2.4)

FR19 확인 표의 U8 행에 넣을 입력이다. 대상 판본은 브랜치 `api/u8-pdf-materials`의 작업본(HEAD `7ef0dd69` + 미커밋 변경)이다.

| 단계 | 날짜 | 방법 | 결과 |
|---|---|---|---|
| 업로드 → 추출 완료 | 2026-11-11 | 로컬 파일 저장소 + 실제 큐 + 실제 worker, 화면 업로드 1건과 API 업로드 15건 | 확인됨(DONE 14, 의도하지 않은 상한 초과 FAILED 2 — §17.5) |
| 발행(PDF 포함) | 2026-11-11 | 발행 화면에서 worker가 추출한 PDF 2건 선택·발행 | 확인됨(201, 쪽 사본 20행·3행) |
| 받은 사람 열람·쪽 글 표시 | 2026-11-11 | 받은 사람 화면, [PDF 보기] | 확인됨(사본 경로 200, 화면 안 렌더링) |
| 읽을 수 없는 쪽 표시 | 2026-11-11 | 브라우저(§16.8, 추출 상태를 DB로 준비한 시험 데이터)와 자동 시험 | worker를 거친 흐름에서는 미실행(합성 PDF에 글 없는 쪽이 없었음) |
| 발행본 삭제 뒤 파일 삭제 | 2026-11-11 | 자동 시험(`recipient-pdf.test.cjs` X-1, 로컬 드라이버) | 통과. 브라우저·실제 worker 흐름에서는 미실행 |
| 탈퇴 뒤 파일 삭제 | — | 자동 시험(로컬 드라이버, `member-cascade-delete.test.cjs`와 U2 탈퇴 시험) | 이번 Step에서 다시 돌리지 않음 |
| S3 실제 확인(업로드·추출·복사·열람·삭제) | — | — | **미실행**(S3 실제 확인 미완) |
| Compose 전체 스택 기동 | — | — | **미실행** |

- **NFR2.2(외부 AI 직접 호출 없음)**: U8 코드(`api/src/materials/pdf-*`, `api/src/pdf-extraction`, `api/src/publications/pdf-publish.ts`·`published-pdf-view.service.ts`, `worker/app/pdf_extraction`)에서 제공자 SDK·키 이름을 검색해 0건이다.
- **NFR2.4(MCP 비노출)**: PDF 표를 읽는 api 파일은 U8 파일과 발행본 읽기·색인·요약 경로뿐이고, `api/src/claude-mcp/mcp-material-reader.ts`의 SQL에는 PDF 표가 없다(그 파일 머리 주석도 그렇게 적는다). U8은 MCP 경로를 만들지 않았다.

### 18.5 미검증·넘기는 것

- **미검증**: 실제 S3(업로드·추출 읽기·사본 복사·열람·접두어 삭제), Compose 전체 스택 기동. §17.7의 나머지 미검증도 그대로다.
- **별도 계약 수정 PR**: §18.2의 C-16·C-12 더하는 변경.
- **확인이 필요한 관찰**: 계약 C-15(Claude에 보이는 MCP 도구) 절의 주석에 "content는 snapshot을 글로 편 것(PDF는 쪽별 글 포함 …)"이라는 문구가 있다. NFR2.4는 PDF 글을 MCP 도구에 노출하지 않는다고 적는다. 지금 코드는 노출하지 않는다. 문구가 어느 범위를 뜻하는지는 계약 소유자 확인이 필요하며 이번에 고치지 않았다.
- **이번 Step에서 다시 돌리지 않은 시험**: api·worker·web 자동 시험 전체. 마지막 실행 결과는 각 Step 절(§10~§16)에 있다.
- 작업본에 `aidlc-state.md` 변경과 audit 기록 파일이 있다. 이번 Step에서 고친 것이 아니며(센서 실행이 audit에 줄을 더함) 커밋 범위는 담당자가 정한다.

### 18.6 확인과 계획 항목별 판단

- 새·수정 문서의 상대 링크 대상 파일 존재 확인: 통과(끊어진 링크 0).
- 문서에 비밀값·실제 버킷 이름·토큰·저장 키 없음. AI 서명·도구 표기 없음.
- `source-manifest.json` 108개 경로 모두 실제로 있음. `traceability.json`은 JSON으로 읽히고 센서 지적은 NFR5.4 하나.

| 계획 | 완료 체크 가능 여부 | 근거 | 담당자 확인이 필요한 것 |
|---|---|---|---|
| 12.1 | 가능 | 계획이 적은 다섯 문서 작성·갱신, 확인 범위를 같은 말로 표기 | 계획 목록 밖 두 문서(`file-storage.md` 한 문장, `publications/README.md` PDF 선택 항목) 수용 여부 |
| 12.2 | 가능 | 계약 문서는 고치지 않고 변경안을 §18.2에 적음 | 계약 수정 PR을 누가 언제 올릴지, C-15 주석 문구 확인 |
| 12.3 | 가능(조건부) | 기록·소스 목록·추적 파일 작성, 미실행 시험과 계획 이탈·S3 미완 표시 | 추적 센서가 NFR5.4 GAP로 통과하지 않는 상태를 받아들일지, `--write-upstream` 미사용과 Step 단위 연결 |

### 18.7 담당자 검토와 완료 체크 (2026-11-11)

담당자가 §18의 결과를 보고 다음을 결정했다. 이 절 위의 "체크박스는 바꾸지 않았다"·"수용 여부 확인이 필요하다"는 검토 전 기록이며 그대로 둔다.

- **계획 12.1·12.2를 완료 체크**했다.
- **계획 12.3은 추적 두 행을 보완한 뒤 "추적 기록 작성 완료"로 체크**했다. `traceability.json`의 AC4.1.1·BR4.1 행 `note`에 Step 10.5의 화면 구현(`web/src/features/publications/publish-screen.tsx` 등), 발행 화면 시험(`web/test/publish.test.mjs` 16건 가운데 PDF 4건), 브라우저 확인 기록(§16.8, §17.6)을 연결했다. 두 행의 `target`(대표 파일 `api/src/publications/pdf-publish.ts`)은 그대로다.
- **NFR5.4는 GAP로 둔다.** S3 실제 삭제 확인을 실행하지 않았다.
- **추적 센서의 마지막 결과는 `failed`다**(2026-11-11, 실행 식별값 `2251b524`). 지적은 `gaps: ["NFR5.4"]` 하나이고 `orphans`·`missing_from_table`·`missing_from_upstream_ids`·`invalid_entries`·`invalid_targets`는 0이다. 12.3의 체크는 추적 기록을 다 썼다는 뜻이며 센서 통과를 뜻하지 않는다.
- 계획 문서의 체크박스는 이제 모두 `[x]`다. 남은 것은 실제 S3 확인, Compose 전체 스택 기동, 별도 계약 수정 PR(C-16·C-12), C-15 주석 문구 확인이다(§18.5).

**커밋·PR 준비에서 확인한 것(같은 날, 커밋·푸시·PR 생성은 하지 않음).** 이 작업본의 기준은 `7ef0dd69`이고 PR 대상인 통합 브랜치 `intent/260925-intent-12`는 그보다 123커밋 앞에 있다. 작업본을 지금의 통합 브랜치와 미리 합쳐 보면 12개 파일이 충돌한다(api 통합 시험 1, web 발행·받은 사람 화면과 발행 시험 7, worker 소비자 연결·의존성 4). §10~§17의 시험 결과는 모두 기준 `7ef0dd69` 위의 판본에 대한 것이므로, 통합 브랜치를 합쳐 충돌을 푼 뒤 관련 시험과 전체 회귀를 다시 돌려야 한다.
