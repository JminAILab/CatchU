# 발행본·텍스트 자료·Catch 설명 — 12월 U4

12월 intent U4(발행·링크)의 api 안내다. 첫 경계 제출(#422)이 표 정의·마이그레이션과 C-10 인터페이스·가짜 구현을 넣었고([계약 요약](../../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md) 「Contract ownership rules」의 첫 주 선합치), U4 본체 제출 1이 Catch 작성자 설명·텍스트 자료 API를(아래 「Catch 작성자 설명 API」·「텍스트 자료 API」), 제출 2가 C-10 DB 구현과 발행·작성자 발행본 관리 API(`src/publications/`의 `PublicationsModule`, `AppModule`에 등록)를 더했다(아래 「C-10 PublicationAccess」·「발행 API」·「작성자 발행본 관리 API」). 받은 사람 열람 경로 교체와 10월 공유 링크 제거(W6)는 제출 3에서 한 변경으로 한다. 그때까지 `ShareLinksModule`·`RecipientModule`은 그대로 있고, 10월 작성자 경로(`/v1/share-links`)와 새 경로(`/v1/publications`)는 겹치지 않는다.

기준 문서: [U4 기능 명세](../../aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/functional-design/functional-spec.md) W3·W5·「작성자 API」·[업무 규칙](../../aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/functional-design/rules.md) BR4~BR8·BR10, [U4 비기능 설계](../../aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/)(보안·신뢰성·성능·관측), 계약 C-02·C-03·C-04·C-05·C-07·C-08·C-10. 규칙 ID는 그 문서의 것이다.

## 표

| 계약 | 표·칸 | 위치 |
| --- | --- | --- |
| C-07 | `publication`, `published_item` | `src/publications/publication.entity.ts`, 사본 모양은 `published-snapshot.ts` |
| C-13 | `text_material` | `src/materials/text-material.entity.ts` |
| C-14 | `catch_asset.author_description`, `author_description_updated_at` | `src/catches/entities/catch-asset.entity.ts` |

- 마이그레이션은 영역별로 둘이다: `1793162230851-CreatePublicationTables`(C-07·C-13 새 표)와 `1793162230852-AddCatchAuthorDescription`(C-14). Catch 마이그레이션 묶음만 적용하는 격리 시험(`test/support/catch-db-fixture.cjs`)은 뒤의 것만 함께 적용한다.
- DB 제약은 계약 그대로다. 제목·본문·설명 길이, 발행 항목 수 같은 상한은 DB가 아니라 U4 API 검증이라 여기에 없다.
- 모두 회원을 따라 지워진다([탈퇴 연쇄 삭제](member-withdrawal-deletion.md)). `published_item`은 발행본을 따라 지워지고 원본 Catch·자료와 외래 키가 없다.
- `published_pdf_page`(U8)·`publication_index`·`published_chunk`(U3)는 각 제공 Unit이 만든다.
- PDF 자료(업로드·추출·발행의 PDF 부분·PDF 사본 열람 경로)는 [PDF 자료 문서](pdf-materials.md)에 있다(U8).
- 발행본 상태(ACTIVE·STOPPED·EXPIRED)는 저장하지 않고 `publication-state.ts`의 `publicationState`로 구한다. 중지가 만료보다 우선한다.

## Catch 작성자 설명 API (C-14, 제출 1)

`src/catches/author-description.controller.ts`·`author-description-store.ts`·`author-description-input.ts`. `CatchesModule`에 등록한다. 전역 인증 Guard·Bearer 토큰·오류 형식·`no-store`는 10월 공통 기반 그대로다.

| 경로 | 요청 | 성공 | 오류 |
| --- | --- | --- | --- |
| `GET /v1/catches/{catchId}/description` | — | 200 `{ authorDescription, authorDescriptionUpdatedAt }` | 401, 404 |
| `PUT /v1/catches/{catchId}/description` | `{ description: string }` | 200 `{ authorDescription, authorDescriptionUpdatedAt }` | 400, 401, 404 |

- `GET`은 작성자 화면이 편집 전에 현재 설명을 읽으려고 둔 경로다. 기능 명세 「작성자 API」에는 `PUT`만 있어 제출 1에서 더했다(응답 모양은 `PUT`과 같다). 10월 본인 Catch 응답(`GET /v1/catches/{catchId}`)에는 설명 칸을 넣지 않았다.
- 설명은 0~4,000자(유니코드 코드 포인트)다. 앞뒤 공백을 지운 뒤 0자면 두 칸 모두 NULL로 저장해 설명을 지운다. 그 밖에는 쓴 그대로 저장한다(BR1.1·BR1.2). 넘으면 400 `VALIDATION_FAILED`, `details.violations`는 `[{ field: 'description', reason: 'maxLength' }]`이다. 정의 밖 필드(`whitelistValidation`)·문자열 아님(`isString`)·NUL 문자(`noNul`)·짝 없는 서로게이트(`isWellFormed`)도 같은 400이다.
- 조회 조건에 소유자를 넣는다. 남의 Catch·없는 Catch·UUID 형식이 아닌 ID는 같은 404 `RESOURCE_UNAVAILABLE`이다(NFR1.1·NFR1.8). 저장은 덮어쓰기이며 마지막 저장이 남는다(BR2.1). 갱신 시각은 DB의 `clock_timestamp()`다.
- 설명 두 칸만 바꾼다. AI 초안·확인·공개·불일치 칸은 그대로다. 결과 반영(재분석)은 기존 Catch를 참조만 하고 이 칸을 쓰지 않으며, 새 Catch는 설명 없이 만들어진다(BR1.4, `registration-service.ts`).
- 설명 본문은 로그·오류 응답에 남기지 않는다(BR10.2).

## 텍스트 자료 API (C-13, 제출 1)

`src/materials/`의 `MaterialsModule`(`text-materials.controller.ts`·`text-material-store.ts`·`text-material-input.ts`). `AppModule`에 등록한다.

| 경로 | 요청 | 성공 | 오류 |
| --- | --- | --- | --- |
| `GET /v1/text-materials` | `cursor`·`limit`(1~100, 기본 20) | 200 `{ items: [{ textMaterialId, title, updatedAt }], page: { nextCursor } }` | 400, 401 |
| `POST /v1/text-materials` | `{ title, body }` | 201 `{ textMaterialId, title, body, createdAt, updatedAt }` | 400, 401 |
| `GET /v1/text-materials/{id}` | — | 200 TextMaterial | 401, 404 |
| `PUT /v1/text-materials/{id}` | `{ title, body }` | 200 TextMaterial | 400, 401, 404 |
| `DELETE /v1/text-materials/{id}` | — | 204 | 401, 404 |

- 제목은 앞뒤 공백을 지운 뒤 1~100자로 세고 지운 값으로 저장한다. 본문은 1~20,000자(공백만이면 거부)이며 그대로 저장한다(BR3.2). 위반은 400 `VALIDATION_FAILED`이고 `violations`에 칸별 이유를 모두 담는다.
- 목록은 만든 시각 최신순(같은 시각은 ID 역순)이며 항목에 본문을 넣지 않는다. 커서는 회원별 범위 해시와 마지막 행의 만든 시각(마이크로초)·ID를 담은 base64url이다. 권한 증명이 아니며 다른 회원의 커서·바꾼 커서는 400이다(NFR4.11).
- 모든 조회·수정·삭제에 `member_id = 인증 회원` 조건을 넣는다. 남의 것·없는 것·UUID 형식이 아닌 ID는 같은 404다(BR3.4, NFR1.1·NFR1.8). 수정은 덮어쓰기다(BR2.1).
- 삭제는 행만 지운다. 발행 사본(`published_item`)은 외래 키가 없어 남는다(BR3.5, 발행이 생기는 제출 2에서 S10으로 확인).
- 제목·본문은 로그·오류 응답에 남기지 않는다(BR10.2). U6은 이 API가 아니라 표를 `member_id`로 걸러 읽는다(C-13 read-rule).
- `catches`·`materials`는 `publications`를 import하지 않는다(U4 비기능 설계 「의존 방향」).

## C-10 PublicationAccess

`src/publications/publication-access.ts`에 인터페이스와 판정 실패 세 가지(`LinkUnavailable`·`LinkPasswordRequired`·`NotFound`)가 있다. 받은 사람 경로는 `LinkUnavailable`을 404 `LINK_UNAVAILABLE`, `LinkPasswordRequired`를 401 `LINK_PASSWORD_REQUIRED`로, 작성자 경로는 `NotFound`를 404 `RESOURCE_UNAVAILABLE`로 응답한다.

### DB 구현과 주입 토큰 (제출 2)

`src/publications/db-publication-access.ts`의 `DbPublicationAccess`가 실제 구현이다. `PublicationsModule`이 토큰 **`PUBLICATION_ACCESS`**(`src/publications/publications-config.ts`, `publications.module.ts`가 다시 내보냄)로 등록하고 `exports`에 넣는다. 다른 Unit은 자기 모듈 `imports`에 `PublicationsModule`을 넣고 `@Inject(PUBLICATION_ACCESS)`로 받는다. U5는 [rag-answer.md](rag-answer.md)대로 `RagAnswerModule.register({ imports: [PublicationsModule], publicationAccess: { useExisting: PUBLICATION_ACCESS } })`처럼 쓴다(U5 처리기 등록은 U5 PR에서 한다, 팀장 결정 2026-11-03).

```typescript
import { Inject, Module } from '@nestjs/common';
import { PUBLICATION_ACCESS, PublicationsModule } from '../publications/publications.module';
import type { PublicationAccess } from '../publications/publication-access';
// @Module({ imports: [PublicationsModule], ... })
constructor(@Inject(PUBLICATION_ACCESS) private readonly access: PublicationAccess) {}
```

| 함수 | 동작 |
| --- | --- |
| `resolveForRecipient(token, grant, now)` | 읽기 전용 REPEATABLE READ 트랜잭션 하나에서 판정한다. 순서: 토큰 형식(10월 `isLinkTokenFormat`, 아니면 조회 없이 `LinkUnavailable`) → `link_token_reference`로 발행본 조회 → 중지·만료(`publication-state.ts`, 없음·삭제와 구분 없이 `LinkUnavailable`) → 소유 회원 상태(`OwnerProfileReader.readOwnerState`, 같은 스냅샷): 비활성이면 `LinkUnavailable`(404), 회원 행 없음이면 `PublicationOwnerMissing`(공통 필터가 500 `INTERNAL_ERROR`, 토큰·SQL 비노출) → 비밀번호 링크면 10월 `verifyLinkGrant(key, grant, publicationId, now)` 실패 시 `LinkPasswordRequired`. 캐시 없음 |
| `resolveForOwner(memberId, publicationId)` | `member_id`·`publication_id` 조건으로 한 행을 읽는다. 남의 것·없는 것·UUID 형식이 아닌 ID는 구분 없이 `NotFound`. 상태는 모듈 시계(`PUBLICATIONS_CLOCK`)로 구하며 중지가 만료보다 우선 |
| `readSnapshot(publicationId)` | 읽기 전용 REPEATABLE READ 트랜잭션에서 `publication`(제목·시각)과 `published_item`만 position 순으로 읽는다. 원본 `catch_asset`·`text_material`은 읽지 않는다. 상태(중지·만료·소유 회원)는 판정하지 않는다. 발행본 행이 없으면 빈 사본을 만들지 않고 `NotFound`(계약의 `NotFound`, #416 OQ-U4-NFR-5 결정 2026-11-04). U4 항목의 `pdfPages`는 null이고 PDF 항목(U8)이 있을 때만 `published_pdf_page`를 읽는다 |
| `resolveForRecipientIn(manager, …)`·`readSnapshotIn(manager, …)` | 계약 밖의 클래스 메서드. 넘겨받은 활성 REPEATABLE READ manager로 같은 일을 한다. 제출 3의 받은 사람 열람 경로가 판정과 사본 읽기를 한 트랜잭션에 묶을 때 쓴다(보안 설계 R-04). 다른 Unit은 계약 함수만 쓴다 |

판정 뒤 상태 변경(OQ-U4-NFR-5, #416 팀장 결정 2026-11-04, A안): `resolveForRecipient`와 `readSnapshot`은 각각 자기 트랜잭션에서 돌므로 두 호출 사이에 커밋된 중지·만료는 그 요청의 `readSnapshot`에 반영되지 않고 사본이 그대로 나온다. 중지·만료에 한해 이는 허용된 동작이다. 판정을 통과한 요청은 중지·만료만을 이유로 취소하지 않고 그 요청의 접수·횟수 차감은 유효하며, 차단은 다음 요청의 재판정으로 한다. 판정 직후 발행본이 삭제된 것이 확인되면(`readSnapshot`의 `NotFound`, 또는 그 요청의 쓰기가 발행본 `publication_id`를 참조하는 외래 키 제약에서 거부된 경우 — SQLSTATE 23503이고 거부한 제약(pg 오류의 `constraint`, 예: `fk_published_item_publication_id`)이 `publication`을 참조하는 것일 때만) 저장·차감을 되돌리고 404 `LINK_UNAVAILABLE`로 응답하고, 다른 제약의 23503을 포함해 삭제로 확인되지 않은 DB 오류는 500을 유지한다. 판정 뒤 소유 회원(작성자) 비활성도 같다(#416 OQ-U4-NFR-6 결정 2026-11-05, 2번): 통과한 요청을 작성자 비활성만을 이유로 취소하지 않고 다음 요청의 재판정으로 막는다. 이 매핑은 각 소비 Unit(U5·U10·U9)이 자기 경로에서 한다. U4 자신의 받은 사람 열람 경로(제출 3)는 `resolveForRecipientIn`·`readSnapshotIn`을 한 REPEATABLE READ 트랜잭션에서 불러 판정 시점의 같은 스냅샷을 읽으므로 이 틈이 없다. 경계 시험은 `test/publications/publication-access-db.test.cjs`·`in-memory-publication-access.test.cjs`에 있다.

소유 회원(작성자) 비활성 404·회원 행 없음 500은 #416 OQ-U4-NFR-6 팀장 결정(2026-11-05, 1번 A)으로 확정됐다. 판정 위치는 중지·만료 다음, 비밀번호(grant) 앞이며 #468의 구현과 같아 코드는 바꾸지 않았다. 두 경우는 지금 수동 변경이나 데이터 손상에서만 생긴다(계정을 비활성으로 바꾸는 코드가 없고, 회원 행이 없으면 외래 키 때문에 발행본도 없다).

소비 Unit(U5·U10·U9)은 시험에서 `src/publications/in-memory-publication-access.ts`의 `InMemoryPublicationAccess`를 합성 제공자로 쓴다. 시험 전용이며 앱 모듈에 등록하지 않는다.

```js
const { InMemoryPublicationAccess } = require('../../dist/publications/in-memory-publication-access');
const access = new InMemoryPublicationAccess(() => now);   // resolveForOwner 상태 계산에 쓰는 시계
access.put({ publicationId, ownerMemberId, token, passwordProtected: true, title, publishedAt, expiresAt, stoppedAt: null, items });
const grant = access.issueGrant(publicationId, grantExpiresAt);  // 비밀번호 통과 뒤 상황
await access.resolveForRecipient(token, grant, now);           // RecipientAccess
access.put({ ...같은 발행본, stoppedAt: now });                 // 중지 상황 → LinkUnavailable
access.remove(publicationId);                                   // 삭제 상황 → LinkUnavailable
```

가짜 구현은 grant 서명을 흉내 내지 않고 자기가 발급한 값만 통과시킨다. `readSnapshot`은 없는 발행본이면 `NotFound`를 던진다. DB 구현도 같은 값을 던진다(위 표). 중지·만료된 발행본의 사본은 둘 다 그대로 돌려준다(상태 판정은 `resolveForRecipient`에서만). 가짜 구현에는 소유 회원 상태가 없어 비활성 404·회원 없음 500은 만들 수 없다.

## PublicationsModule 구성 (제출 2)

`src/publications/publications.module.ts`. `AppModule`에 등록돼 있고, 제출 3(W6)부터 `ShareLinksModule`·`RecipientModule`은 `AppModule`에 없다. 10월 `share-links` 폴더에서는 표·API·Nest 모듈에 의존하지 않는 도구(`link-token`·`link-grant`·`link-password`·`share-links.config`·`unlock-policy`와 제한기들·`request-rate-limiter`·`client-address`)만 가져온다([공유 링크 문서 「남은 도구」](share-links.md#남은-도구-srcshare-links-u4u5u9가-가져다-씀)). `catches`·`materials`는 `publications`를 가져오지 않는다(의존 방향 R-05, `test/publications/publications-module.test.cjs`가 확인).

| 공급자 | 토큰 | 만드는 방법 | 기동 때 검사 |
| --- | --- | --- | --- |
| grant 키 | `LINK_GRANT_KEY` | `readLinkGrantKey()` | 운영(`NODE_ENV`가 development·test가 아님)에서 `LINK_GRANT_SECRET`이 없거나 64자 hex가 아니거나 `AUTH_JWT_SECRET`과 같으면 기동 실패(#242) |
| web 주소 설정 | `SHARE_LINKS_CONFIG` | `readShareLinksConfig()` | 운영에서 `SHARE_LINK_WEB_BASE_URL`이 없거나 https가 아니면 기동 실패(#218). 발행 응답 `url`의 web 주소 |
| 발행 빈도 제한기 | `PUBLISH_RATE_LIMITER` | `new RequestRateLimiter(PUBLISH_RATE_LIMIT)` | 없음. 10월 발급 제한기와 다른 인스턴스, 프로세스 메모리(api 하나 전제, NFR4.13) |
| 시계 | `PUBLICATIONS_CLOCK` | `() => new Date()` | 없음. 시험이 발행·관리·C-10의 시계를 바꾼다 |
| C-10 DB 구현 | `PUBLICATION_ACCESS`(export) | `DbPublicationAccess` | 없음 |
| unlock 정책·제어(제출 3) | `UNLOCK_POLICY`·`UNLOCK_CONTROLS` | 10월 `unlock-policy.ts`의 `PRODUCT_UNLOCK_POLICY`·`createUnlockControls` | 없음. 이 모듈에만 선언한다(제출 2에서는 `ShareLinksModule`과 중복돼 미뤘고, W6에서 그 모듈을 빼며 옮김) |
| 받은 사람 서비스·컨트롤러(제출 3) | `RecipientAccessService`, `RecipientLinksController` | — | 아래 「받은 사람 열람·비밀번호 통과 API」 |

imports: `OwnerProfileReaderModule`(소유 회원 상태), U2 `AiRunModule`·`DailyRunLimitModule`·`AiConsentModule`·`FileStorageModule`, U3 `PublishedIndexModule`(`PUBLISHED_INDEX_WRITER`). 환경변수 이름은 10월 그대로라 배포 설정을 바꾸지 않는다.

임시값(`src/publications/publications-config.ts` 한곳, 값만 바꾸면 된다):

| 상수 | 값 | 미결 |
| --- | --- | --- |
| `PUBLISH_RATE_LIMIT` | 회원별 1분 10회(기록 상한 1만) | OQ-U4-2 |
| `SNAPSHOT_TEXT_TOTAL_MAX` | 전체 글 60,000자(코드 포인트) | OQ-U4-4(AI 입력 한도 확인 뒤 조정, 검증된 값 아님) |

## 발행 API (제출 2)

`src/publications/publish.service.ts`·`publish-input.ts`·`snapshot-builder.ts`, 컨트롤러 `publications.controller.ts`. 전역 인증 Guard·오류 형식·`no-store`는 10월 공통 기반 그대로이고 `@Public()`을 붙이지 않는다.

| 경로 | 요청 | 성공 | 오류 |
| --- | --- | --- | --- |
| `POST /v1/publications` | `{ title, password?, items: [{ kind: CATCH \| TEXT_MATERIAL, sourceId }] }` | 201 `{ publicationId, url, state: ACTIVE, publishedAt, expiresAt, passwordProtected }` | 400 `VALIDATION_FAILED`, 401, 403 `AI_CONSENT_REQUIRED`, 404 `RESOURCE_UNAVAILABLE`, 409 `CONFIRMATION_REQUIRED`·`SOURCE_RESTRICTED`(`details.catchIds`), 429 `RATE_LIMITED`(`Retry-After`)·`DAILY_LIMIT_REACHED`, 500 |

판정 순서(성능 설계 「판정 위치와 순서」, BR4.8→BR4.1·BR4.5→BR4.7→BR5.1):

1. 회원별 발행 빈도(`PUBLISH_RATE_LIMIT`, 키는 회원 ID). 초과면 입력 검사 전에 429 `RATE_LIMITED`와 `Retry-After`(초). 거부한 요청은 세지 않는다.
2. 입력: 제목은 앞뒤 공백을 지운 뒤 1~50자(코드 포인트), 비밀번호는 있으면 그대로 8~64자(trim·정규화 없음), 항목 1~20개, `kind`는 `CATCH`·`TEXT_MATERIAL`만, `sourceId`는 UUID, 같은 `(kind, sourceId)` 중복 불가, 정의 밖 필드·쿼리 거부. `details.violations`의 `field`는 `title`·`password`·`items`·`items[i]`·`items[i].kind`·`items[i].sourceId`·`body`이고 값은 담지 않는다.
3. 동의 `AiConsentGate.require` → 403(하루 횟수를 쓰지 않음).
4. 트랜잭션 밖에서 토큰(`generateLinkToken`)과 scrypt 검증값(`hashLinkPassword`)을 만든다.
5. READ COMMITTED 트랜잭션: 회원 행 `FOR KEY SHARE` → `DailyRunLimit.consume(작성자, 'BASE_SUMMARY', now, manager)`(`LIMIT_REACHED`면 되돌리고 429) → Catch를 `catch_id` 오름차순으로 `FOR NO KEY UPDATE`(10월 공개 전환과 같은 잠금), 그다음 텍스트 자료를 `text_material_id` 오름차순으로 `FOR UPDATE`로 잠그고 다시 읽음(남의 것·없음 404) → 자격: 미확인 Catch가 하나라도 있으면 409 `CONFIRMATION_REQUIRED`, 그다음 원 요청의 저장소 보호 관측을 `FOR SHARE`로 읽어 확인된 `SOURCE_PRIVATE`면 409 `SOURCE_RESTRICTED`(둘 다 `details.catchIds`에 해당 Catch만; 원 요청 불일치·관측 없음·불완전은 10월처럼 500, 비공개로 단정하지 않음 BR7.4) → 전체 글(SnapshotTextTotal: `workFacts`·`subjectContribution`·`evidence[].representedFacts`·`authorDescription`·`body`의 코드 포인트 합, 제목·`aiDraft`·주소 제외)이 60,000자를 넘으면 400 `{ field: 'items', reason: 'maxTotalLength' }` → `publication`(`published_at = now`, `expires_at = now + 2160시간`)·`published_item`(요청 순서 1..n, 사본은 C-07 모양, Catch 제목이 없으면 '제목 없는 Catch', `aiDraft`는 `draft_status = GENERATED`일 때만) 쓰기 → 고른 PRIVATE Catch를 PUBLIC으로 → `PublishedIndexWriter.chunkInTransaction(manager, publicationId, now)` → 커밋. 어느 단계든 실패하면 전부(하루 횟수 포함) 되돌아간다.
6. 커밋 뒤 `AiRun.enqueueAfterCommit('EMBED_PUBLICATION', 'EMBED_PUBLICATION-{publicationId}', { publicationId })`와 `('BASE_SUMMARY', 'BASE_SUMMARY-{publicationId}', { publicationId })`를 **항상** 차례로 등록한다(C-08 publish-sequence 4, 팀장 결정 2026-11-03 1: 켜고 끄는 설정 없음). `ENQUEUE_FAILED`는 로그만 남기고 201이다(시한으로 실패 확정, C-02). 앱 기동 시 U5가 `BASE_SUMMARY` 처리기를 등록한다. 큐가 없어 작업이 실행되지 않으면 발행 후 10분부터 요약은 `FAILED`로 표시된다([rag-answer.md](rag-answer.md)).

- 토큰은 응답 `url`(`buildRecipientLinkUrl(SHARE_LINK_WEB_BASE_URL, token)`) 안에만 있다. 비밀번호 원문은 저장·응답·로그에 없다.
- 재전송·두 번 누르기 방지는 없다(BR4.9). web이 응답까지 버튼을 막는다.
- 409의 `details.catchIds`를 위해 공통 오류 `ErrorDetails`(`src/common/errors/api-error.ts`)에 `catchIds?: string[]`(UUID만)을 더했다. 공통 필터가 UUID 형식이 아닌 값은 버린다. 계약 common.yaml의 `details` 허용 키(두 개) 바깥에 추가한 항목이다. 팀장 확인(#468).

## 작성자 발행본 관리 API (제출 2)

`src/publications/publication-manage.service.ts`. C-09 합의 전이라 `indexState` 칸과 `POST .../reindex`는 없다(OQ-U4-5, 미완성 상태).

| 경로 | 요청 | 성공 | 오류 |
| --- | --- | --- | --- |
| `GET /v1/publications` | `cursor`·`limit`(1~100, 기본 20) | 200 `{ items: [{ publicationId, title, url, state, publishedAt, expiresAt, passwordProtected }], page: { nextCursor } }` | 400, 401 |
| `GET /v1/publications/{id}` | — | 200 `{ publicationId, url, state, passwordProtected, snapshot: PublishedSnapshot }`(제목·발행·만료 시각은 `snapshot` 안) | 401, 404 |
| `PUT /v1/publications/{id}/stop` | 본문 없음 | 200 `{ state, stoppedAt }`: ACTIVE면 `STOPPED`와 지금 시각, 이미 STOPPED면 처음 시각 유지, EXPIRED면 `{ state: 'EXPIRED', stoppedAt: null }`(쓰지 않음) | 401, 404 |
| `DELETE /v1/publications/{id}` | — | 204 | 401, 404, 500 `INTERNAL_ERROR`(접두어 삭제 실패, DB 유지) |

- 목록은 발행 시각 최신순(같은 시각은 ID 역순)이며 커서는 제출 1 텍스트 자료 목록과 같은 방식(회원별 범위 해시·마지막 행의 발행 시각 마이크로초·ID의 base64url, 다른 회원·바꾼 커서는 400)이다. 상태는 응답 시각으로 구한다.
- 상세는 소유 판정(`member_id` 조건)과 `readSnapshotIn`을 같은 REPEATABLE READ 스냅샷에서 한다. 중지·만료 뒤에도 본다(BR6.5·BR8.1).
- 중지는 행을 `FOR UPDATE`로 잠근 뒤 상태를 다시 구한다(BR8.2). 되살리기·연장·비밀번호 변경은 없다(BR8.3).
- 삭제(BR8.4): `resolveForOwner` → `FileStorage.deletePrefix(publicationPrefix(memberId, publicationId))`(없는 접두어는 성공) → 실패(`StorageUnavailable` 등)면 로그 `PREFIX_DELETE_FAILED`와 500 `INTERNAL_ERROR`로 끝내고 DB를 지우지 않는다 → 성공하면 `publication` 행을 지워 `published_item`·색인·조각·요약·JD 요약 결과가 외래 키로 함께 지워진다. 늦게 도착한 결과는 부모가 없어 거부되고 버리는 것은 각 처리기 몫이다(BR8.5). 만료는 행을 지우지 않는다(BR8.6).
- 모든 조회·수정·삭제에 `member_id = 인증 회원` 조건을 넣는다. 남의 것·없는 것·UUID 형식이 아닌 ID는 같은 404다.

## 받은 사람 열람·비밀번호 통과 API (제출 3)

받은 사람 경로는 [받은 사람 열람·비밀번호 통과 API 문서](recipient-publication.md)로 옮겼다. 요지: `GET /v1/public/links/{token}`(200 C-10 `PublishedSnapshot`)과 `POST /v1/public/links/{token}/unlock`(200 `{ grant }`)을 `PublicationsModule`의 `RecipientLinksController`·`RecipientAccessService`가 맡고, 10월 `RecipientModule`·`ShareLinksModule`은 없다. 열람은 판정과 사본 읽기를 읽기 전용 REPEATABLE READ 트랜잭션 하나에서 하며(판정 뒤 커밋된 중지·만료·삭제·작성자 비활성은 다음 요청에서 막음), unlock은 최초 판정과 해시 직전 재판정 두 번이다. 작성자 비활성 404·회원 행 없음 500, unlock 순서·제한값·시험 목록은 그 문서에 있다.

## 로그 (제출 2)

Nest `Logger('Publications')`(`src/publications/publications-log.ts`)로 사건마다 객체 한 줄을 남긴다. 칸은 `event`·`publicationId`·`memberId`·`errorCode`·`jobKind`·`enqueue` 여섯 개뿐이고(해당 없으면 null) 이름·값 표기는 **임시**다(NFR6.3). 토큰·grant·비밀번호·제목·본문·SQL·stack은 넣지 않는다.

| `event` | 수준 | 채우는 칸 |
| --- | --- | --- |
| `PUBLISH_SUCCEEDED` | log | `publicationId`, `memberId` |
| `PUBLISH_FAILED` | warn | `memberId`, `errorCode`(응답 코드. 발행본 ID는 롤백돼 없음) |
| `ENQUEUE_RESULT` | ENQUEUED log, ENQUEUE_FAILED warn | `publicationId`, `jobKind`(`EMBED_PUBLICATION`·`BASE_SUMMARY`), `enqueue` |
| `PREFIX_DELETE_FAILED` | error | `publicationId`, `memberId`, `errorCode: INTERNAL_ERROR` |

항목 수·처리 시간·받은 사람 판정 결과는 남기지 않는다. 비밀번호 실패·unlock 제한·인증 실패는 10월 `security-events`가 남긴다(U4는 새 기록 종류를 더하지 않는다).

## 시험

- `test/publications/in-memory-publication-access.test.cjs`: 가짜 구현의 판정이 계약 C-10과 U4 설계의 판정 순서(삭제·중지·만료 → grant)와 같은지, 판정 뒤 중지·만료·삭제와 다음 요청 재판정(OQ-U4-NFR-5 경계)
- `test/db/publication-tables.test.cjs`: 위 표의 DB 제약
- `test/db/member-cascade-delete.test.cjs`: 새 표도 회원 탈퇴 때 함께 지워지는지
- `test/catches/author-description-api.test.cjs`(제출 1): S1(저장·두 번 저장·공백·4,000/4,001자·형식 거부·남의 Catch 404·로그 비노출)·S2(재분석 뒤 설명 유지, 새 Catch는 NULL). 격리 스키마(`catch-db-fixture`)와 실제 Catch 등록 코드를 쓴다
- `test/materials/text-materials-api.test.cjs`(제출 1): S3(CRUD·경계값·회원 두 명 교차 접근 404·cursor·로그 비노출). 실제 `AppModule`과 개발 로그인 합성 회원을 쓴다
- `test/publications/publication-access-db.test.cjs`(제출 2): C-10 DB 구현의 판정 순서(형식 오류 토큰·없음·중지·만료·삭제 404, grant 없음·위조·다른 발행본·만료 401, 중지가 grant보다 먼저, 비활성 소유자 404와 재활성, 회원 없음 500 대역), `resolveForOwner` 상태 우선순위·NotFound, `readSnapshot`, 판정 뒤 중지·만료·삭제·소유자 비활성과 다음 요청 재판정·같은 트랜잭션 변형(OQ-U4-NFR-5 경계)
- `test/publications/publish-api.test.cjs`(제출 2): S4~S7, 빈도 429·`Retry-After`, 입력 400 칸별 이유, 동의 403, 404, 자격 409 `details.catchIds`·보호 관측 없음 500, 하루 한도 429·롤백, 조각 예외 500·롤백, 등록 실패 201, 전체 글 60,000/60,001자
- `test/publications/publications-manage-api.test.cjs`(제출 2): 목록 cursor·`indexState` 없음, 상세 모양, S9(작성자 쪽)·S10~S13(접두어 삭제는 시험 전용 임시 폴더의 로컬 저장소, 실패는 가짜 `FileStorage`)
- `test/publications/publications-logging.test.cjs`(제출 2): 결과 분류별 줄·칸, 등록 실패와 접두어 삭제 실패 구분, 합성 비밀값·본문 비노출
- `test/publications/publications-module.test.cjs`(제출 2·3): 공급자 선언(unlock 제어는 이 모듈에만)·`PUBLICATION_ACCESS` 주입, 기본 앱 경로 중복 없음·받은 사람 경로 포함·10월 경로 없음, 운영 설정 기동 실패, 의존 방향
- 제출 3 받은 사람 시험은 [받은 사람 API 문서 「받은 사람 시험 (제출 3)」](recipient-publication.md#받은-사람-시험-제출-3)

U2 `AiRun`·`FileStorage`(실패 쪽)·U3 `PublishedIndexWriter`는 계약 모양 가짜로 바꿔 돌린다. 그 결과는 '합성 연결을 포함한 사전 확인'이며 실제 연결 성공이 아니다(team.md Walking Skeleton).

제출 1 실행: `npm test -- test/catches/author-description-api.test.cjs test/materials/text-materials-api.test.cjs`(테스트 DB 필요, README 「DB 테스트」).

제출 2 실행(제출 1 파일 포함):

```bash
npm test -- test/catches/author-description-api.test.cjs test/materials/text-materials-api.test.cjs test/publications/in-memory-publication-access.test.cjs test/publications/publication-access-db.test.cjs test/publications/publish-api.test.cjs test/publications/publications-manage-api.test.cjs test/publications/publications-logging.test.cjs test/publications/publications-module.test.cjs
```

줄 커버리지: `TEST_COVERAGE_INCLUDE='dist/publications/**' npm run test:coverage -- test/publications/publication-access-db.test.cjs test/publications/publish-api.test.cjs test/publications/publications-manage-api.test.cjs test/publications/publications-logging.test.cjs test/publications/publications-module.test.cjs`.
