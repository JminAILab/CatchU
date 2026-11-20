# 발행 프리셋 — 발행 프리셋 intent U1

지원자가 발행에 쓸 자료 묶음(프리셋)을 저장하고, 발행 때 프리셋 1~5개를 골라 탭으로 나눠 보이게 하는 api 안내다. 코드는 `src/presets/`(PresetLibrary: 경로·입력·저장소·로그)와 `src/publishable-source/`(PublishableSource: 발행과 같은 글자 셈·자격 판정·종류별 묶음 읽기)에 있다. `PresetsModule`은 `AppModule`에 등록하고, 발행 모듈(`PublicationsModule`)이 프리셋 펴기(`PresetStore.expand`)를 쓰려고 가져온다.

기준 문서: [U1 기능 명세](../../aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/functional-design/functional-spec.md)·[업무 규칙](../../aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/functional-design/rules.md) BR1~BR7·[엔티티](../../aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/functional-design/entities.md), [U1 비기능 설계](../../aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/nfr-design/), [계약 요약](../../aidlc/spaces/default/intents/261118-publication-presets/inception/contract-design/contract-summary.md) P-1~P-6. 규칙 ID는 그 문서의 것이다. 발행 요청과 사본 칸의 바뀐 점은 [발행본 문서](publications.md)에 있다.

## 표

| 표 | 칸 | 제약 |
| --- | --- | --- |
| `preset` | `preset_id`, `member_id`, `name`, `created_at`, `updated_at` | 회원 연쇄 삭제. 이름 1자 이상(1~50자·회원당 50개는 API 검사). 색인 `(member_id, created_at, preset_id)` |
| `preset_item` | `preset_item_id`, `preset_id`, `position`, `catch_id`·`text_material_id`·`pdf_material_id` 가운데 정확히 하나 | 프리셋·Catch·텍스트 자료·PDF 연쇄 삭제. `position` 1~20, `(preset_id, position)` 유일, 종류마다 `(preset_id, 원본)` 부분 유일 |

- 마이그레이션 `1795140270696-AddPublicationPresets` 하나가 표 둘을 만들고 변경 전 발행본을 지운 뒤 `published_item`에 칸 둘을 더한다(아래 「배포」).
- 항목 수·글자 수·발행할 수 없는 자료는 저장하지 않고 읽을 때마다 센다(ADR-005). 그래서 담은 뒤 숨긴 Catch·길어진 원본이 다음 열기에 바로 보인다.
- `position`은 저장 때 1부터 빈틈없이 매긴다. 담긴 원본을 지우면 그 항목만 연쇄로 빠지고 남은 자리는 다시 매기지 않으며, 읽을 때 `position` 순으로 본다(BR6.1). 발행본 사본은 프리셋을 가리키지 않아 그대로다.
- 가리키는 자료가 프리셋 주인의 것인지는 외래 키가 아니라 저장 때 확인한다(BR1.5, NFR2.5). 탈퇴는 회원 행 삭제로 프리셋과 항목을 지운다([탈퇴 연쇄 삭제](member-withdrawal-deletion.md)).

## 경로

로그인 회원 경로다. 지금 발행 경로와 같은 전역 Bearer Guard와 `@CurrentMemberId()`를 쓰고, Bearer 경로라 CSRF·Origin 검사는 없다(NFR 요구 검토 R-01). 쿼리는 받지 않는다(400). 남의 프리셋·없는 프리셋·UUID가 아닌 ID는 구분하지 않고 404 `RESOURCE_UNAVAILABLE`이다(BR1.1).

| 경로 | 요청 | 성공 | 오류 |
| --- | --- | --- | --- |
| `GET /v1/presets` | — | 200 `{ presets: PresetSummary[] }` | 401 |
| `POST /v1/presets` | `{ name, items: [{ kind, sourceId }] }` | 201 `{ presetId }` | 400, 401, 404, 409 `PRESET_LIMIT_REACHED` |
| `GET /v1/presets/{presetId}` | — | 200 `PresetDetail` | 401, 404 |
| `PUT /v1/presets/{presetId}` | `{ name, items }` | 200 `{ presetId }` | 400, 401, 404 |
| `DELETE /v1/presets/{presetId}` | — | 204 | 401, 404 |
| `POST /v1/presets/measure` | `{ items }` 1~50개 | 200 `{ items: ItemMeasure[] }`(요청 순서) | 400, 401, 404 |

- `PresetSummary`: `{ presetId, name, itemCount, textLength, overLimit, unpublishableCount, unpublishableItems: [{ kind, sourceId, title, reason }] }`. 만든 시각, 같으면 `presetId` 순으로 모두 한 번에 준다(쪽 나눔 없음, BR1.9). `overLimit`은 `textLength > 60,000`이다.
- `PresetDetail`: `{ presetId, name, items: ItemMeasure[] }`(position 순). `ItemMeasure`: `{ kind, sourceId, title, textLength, unpublishableReason }`.
- `title`은 원본 제목이고 Catch 제목이 없으면 발행과 같은 「제목 없는 Catch」다(R-07). 이름은 앞뒤 공백만 빼고 그대로 돌려준다. 화면은 글자로만 그린다(NFR3.1).

## 검사

| 규칙 | 내용 | 거부 |
| --- | --- | --- |
| BR1.2 | 이름: 문자열, 앞뒤 공백을 뺀 1~50자(코드 포인트), NUL·고립 서로게이트 안 됨. 같은 이름은 받는다 | 400 `name`(`isString`·`isNotEmpty`·`maxLength`·`noNul`·`isWellFormed`) |
| BR1.4 | 저장 항목 0~20개, 같은 `(kind, sourceId)` 두 번 안 됨, `kind`는 `CATCH`·`TEXT_MATERIAL`·`PDF_MATERIAL`, `sourceId`는 UUID | 400 `items`(`maxItems`·`arrayUnique`), `items[i]`·`items[i].kind`·`items[i].sourceId` |
| BR2.4 | 세기 항목 1~50개, 같은 자료 두 번 안 됨 | 400 `items`(`arrayMinSize`·`maxItems`·`arrayUnique`) |
| BR1.3 | 회원당 프리셋 50개. 동시에 만들어 51개가 되는 경우는 막지 않는다 | 409 `PRESET_LIMIT_REACHED`(「프리셋은 50개까지 만들 수 있습니다.」) |
| BR1.5 | 담는·세는 자료는 요청 회원의 것이고 있어야 한다. 발행 자격은 저장을 막지 않는다(이유로만 보임) | 404 |
| BR1.4 | 담은 자료 글자 합 60,000자 이하(발행과 같은 셈) | 400 `{ field: 'items', reason: 'maxTotalLength' }` |

정의 밖 칸은 400 `body`(`whitelistValidation`)이고, 오류 응답에 이름·자료 ID를 담지 않는다.

## 세기와 이유

글자 수와 이유는 발행과 같은 규칙(`src/publishable-source/`)으로 센다(BR2.1·BR2.2).

- 글자 수: Catch는 작업 사실·나의 기여·근거 사실·작성자 설명의 코드 포인트 합(제목·AI 초안·주소 제외, `catchTextLength`), 텍스트 자료는 본문, PDF는 읽을 수 있는 쪽 글의 합(SQL `sum(char_length(text)) FILTER (WHERE readable)`로 본문을 읽지 않고 셈). 추출이 끝나지 않은 PDF는 0이다.
- 이유: Catch는 확인 필요 → 보호 → 비공개 순으로 처음 맞는 것(`CONFIRMATION_REQUIRED`·`SOURCE_RESTRICTED`·`PRIVATE`), PDF는 추출이 끝나지 않았으면 `EXTRACTION_INCOMPLETE`, 텍스트 자료는 없음(null). 발행 막힘 코드와의 대응은 `PRIVATE` ↔ `CATCH_PRIVATE`, `EXTRACTION_INCOMPLETE` ↔ `extractionIncomplete`이고 나머지는 같다.
- 기록 문제(원 요청이 회원과 맞지 않음, 보호 관측 없음·불완전)인 Catch는 이유로 바꾸지 않고 요청 전체가 500이다(NFR2.10). 그런 Catch는 지금도 본인 Catch 목록을 500으로 만들어 고르기 목록에 나올 수 없다. 저장은 자격을 보지 않으므로 담을 수는 있다.

## 읽기와 쓰기의 트랜잭션

- 목록·상세·세기: 읽기 전용 `REPEATABLE READ` 한 트랜잭션. 회원 행 확인(없으면 401 `AUTH_INVALID`) → 프리셋 행 → 항목 행 → 종류별 원본 묶음(`readSources`: Catch 행 → 근거 → 보호 관측 → 텍스트 자료 → PDF, 없는 종류는 건너뜀) → 순수 판정 함수. 조회 수는 프리셋·항목 수와 무관하다(NFR6.2). 같은 스냅샷에서 항목의 원본 행이 없으면 데이터 문제라 500이다(NFR 설계 검토 R-01).
- 만들기·고치기·지우기: `READ COMMITTED` 한 트랜잭션. 회원 행 `FOR KEY SHARE` → (고치기) 소유 확인 → (만들기) 50개 확인 → 자료 소유·글자 합 → 프리셋 행 쓰기(고치기는 이름·`updated_at`) → 항목을 모두 지우고 배열 순서대로 다시 쓰기. 하나라도 걸리면 아무것도 바뀌지 않는다(NFR2.7). 프리셋 행은 잠그지 않아, 같은 프리셋을 동시에 두 번 저장해 유일 제약에 걸리면 500이다(R-08, NFR2.9).
- 발행의 펴기(`expand`): 발행 트랜잭션 밖에서 읽기 전용 `REPEATABLE READ`로 고른 프리셋과 항목을 한 번 읽는다. 하나라도 남의 것·없는 것이면 404이고 PDF 복사·발행 트랜잭션 전이라 아무것도 쓰지 않는다(NFR2.4).

## 로그

Nest `Logger('Presets')`(`src/presets/presets-log.ts`)로 저장·지우기마다 한 줄. 칸은 `event`·`memberId`·`presetId`·`errorCode`뿐이고 이름·자료 ID·내용은 받지 않는다(BR7.1, NFR4.5).

| `event` | 수준 | 채우는 칸 |
| --- | --- | --- |
| `PRESET_SAVED` | log | `memberId`, `presetId`(만들기·고치기) |
| `PRESET_SAVE_FAILED` | warn | `memberId`, `errorCode` |
| `PRESET_DELETED` | log | `memberId`, `presetId` |
| `PRESET_DELETE_FAILED` | warn | `memberId`, `errorCode` |

목록·상세·세기의 500은 공통 오류 필터의 서버 오류 로그로 남는다(NFR4.7).

## 배포

변경 전 발행본은 DB 행을 마이그레이션이, PDF 사본 파일을 팀장이 지운다(BR5.1·BR5.2). 버킷은 버전 관리를 켜지 않아 지운 파일을 되살릴 수 없다([S3 안내](../../deploy/aws/s3.md)). 원본 `members/*/materials/`와 `members/` 전체는 지우지 않는다.

1. **main에 올리는 조건**: 발행 화면을 새 요청 모양(`presetIds`)과 막힘 칸(`blockedSources`)에 맞춘 web PR이 dev에 들어가기 전에는 dev를 main에 올리지 않는다. 이 api만 main에 나가면 main 발행 화면이 발행에 실패한다. dev에서도 그 web PR이 들어올 때까지 발행 화면은 옛 요청 모양이라 발행에 실패한다(단위 Q2). web은 사본의 새 칸을 모르는 칸으로 무시한다.
2. **올리기 전 원본 수 적기**: `aws s3 ls s3://catchu-prod-files/members/ --recursive --profile catchu | grep -c '/materials/'`
3. **배포**: dev를 main에 병합하면 자동 배포가 옛 api·worker를 멈추고 종료를 확인한 뒤 마이그레이션 Pod를 돌리고, 그다음 새 api·worker·web을 띄운다([EKS 자동 배포](../../deploy/aws/cd/README.md)). 마이그레이션은 프리셋 표 둘을 만들고 `DELETE FROM publication`으로 변경 전 발행본을 모두 지운 뒤(항목·쪽 사본·조각·색인·요약·JD 요약 실행이 연쇄로 지워짐) 칸 둘을 더한다. 옛 링크는 지금의 접근 불가 화면(「이 링크는 열람할 수 없습니다.」)이 된다. `down`은 칸 둘과 표 둘을 지우고 지운 발행본은 되살리지 않는다.
4. **가르는 시각 T 확인**: 옛 api는 마이그레이션 전에 멈추고 새 api는 그 뒤에 뜨므로, 변경 전 발행본의 PDF 사본은 모두 마이그레이션 시작 시각 T보다 먼저, 새 발행본의 사본은 T보다 뒤에 만들어진다. 그래서 배포가 끝난 뒤에 T 이전의 사본만 지운다. 배포 전에 지우면 그 뒤 배포까지 옛 api가 만든 사본이 남고, 배포 뒤 `publications` 전체를 지우면 새 사본도 지워진다. T는 배포 실행 기록의 「migration 성공: … 시작 …」 값이고, `kubectl -n catchu get pod catchu-migrate-<배포 커밋 앞 12자리> -o jsonpath='{.status.startTime}'`로도 본다.
5. **지울 목록 만들기(dry-run)**: 아래로 목록 파일만 만들고 아무것도 지우지 않는다. 둘째 수가 0인지(목록에 `publications` 밖 파일이 없는지) 보고, 목록이 `members/<회원>/publications/<발행본>/` 아래 파일뿐인지 열어 본다.

   ```bash
   T='<4의 시각>'
   aws s3api list-objects-v2 --bucket catchu-prod-files --prefix members/ --query 'Contents[].[LastModified,Key]' --output text --profile catchu | awk -v t="$T" '$2 ~ /\/publications\// && $1 < t {print $2}' > old-copies.txt
   wc -l < old-copies.txt
   grep -vc '/publications/' old-copies.txt
   ```

6. **지우기**: `while read -r key; do aws s3 rm "s3://catchu-prod-files/$key" --profile catchu; done < old-copies.txt`
7. **사후 확인**: 5의 둘째 줄(목록 만들기)을 다시 돌려 `wc -l < old-copies.txt`가 0인지, 2의 원본 수가 그대로인지 본다.
8. **팀원 로컬**: 로컬 폴더에 남은 옛 사본은 가리키는 행이 없어 열리지 않으므로 지우기는 선택이다.

## 시험

- `test/presets/preset-input.test.cjs`: 이름·항목·세기 개수·중복·UUID·정의 밖 칸(DB 없음)
- `test/presets/presets-api.test.cjs`: 만들기·고치기·지우기, 50개·60,000자 경계, 남의 자료·남의 프리셋 404, 목록 50개·만든 순서, 조회 수 고정(프리셋 1개와 50개), 이유·`overLimit`, 기록 문제 500, 원본 없음 500, 세기 1·50·51개, 로그
- `test/publishable-source/eligibility.test.cjs`: 판정 순서·이유 넷·기록 문제 예외·글자 셈·제목 대체·앞선 사본 판정(DB 없음)
- `test/integration/preset-publish-chain.test.cjs`: 프리셋 API로 만든 프리셋 둘(같은 Catch)로 발행 → 받은 링크 사본의 프리셋 칸 → 실제 조각 나누기·받은 링크 읽기에 겹친 사본 한 번, 자료 지우기·탈퇴
- 발행 쪽 시험은 [발행본 문서 「시험」](publications.md#시험)

실행(테스트 DB 5433, pgvector 필요): `TEST_DB_PORT=5433 npm --prefix api test -- test/presets/preset-input.test.cjs test/presets/presets-api.test.cjs test/publishable-source/eligibility.test.cjs`
