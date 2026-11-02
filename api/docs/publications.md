# 발행본·텍스트 자료·Catch 설명 — 12월 U4

12월 intent U4(발행·링크)의 api 안내다. 첫 경계 제출(#422)이 표 정의·마이그레이션과 C-10 인터페이스·가짜 구현을 넣었고([계약 요약](../../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md) 「Contract ownership rules」의 첫 주 선합치), U4 본체 제출 1이 Catch 작성자 설명·텍스트 자료 API를 더했다(아래 「Catch 작성자 설명 API」·「텍스트 자료 API」). 발행·받은 사람 열람·작성자 발행본 관리 API와 C-10 실제 DB 구현은 제출 2·3에서 만든다. 지금 api 코드에서 `publication`·`published_item` 표를 읽거나 쓰는 곳은 없다.

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

가짜 구현은 grant 서명을 흉내 내지 않고 자기가 발급한 값만 통과시킨다. `readSnapshot`은 없는 발행본이면 `NotFound`를 던진다. 계약에는 이 경우가 적혀 있지 않아 실제 구현과 맞출 때 다시 확인한다.

## 시험

- `test/publications/in-memory-publication-access.test.cjs`: 가짜 구현의 판정이 계약 C-10과 U4 설계의 판정 순서(삭제·중지·만료 → grant)와 같은지
- `test/db/publication-tables.test.cjs`: 위 표의 DB 제약
- `test/db/member-cascade-delete.test.cjs`: 새 표도 회원 탈퇴 때 함께 지워지는지
- `test/catches/author-description-api.test.cjs`(제출 1): S1(저장·두 번 저장·공백·4,000/4,001자·형식 거부·남의 Catch 404·로그 비노출)·S2(재분석 뒤 설명 유지, 새 Catch는 NULL). 격리 스키마(`catch-db-fixture`)와 실제 Catch 등록 코드를 쓴다
- `test/materials/text-materials-api.test.cjs`(제출 1): S3(CRUD·경계값·회원 두 명 교차 접근 404·cursor·로그 비노출). 실제 `AppModule`과 개발 로그인 합성 회원을 쓴다

제출 1 실행: `npm test -- test/catches/author-description-api.test.cjs test/materials/text-materials-api.test.cjs`(테스트 DB 필요, README 「DB 테스트」).
