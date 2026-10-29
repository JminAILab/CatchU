# 발행본·텍스트 자료 경계 — 12월 U4 첫 경계 제출

12월 intent U4(발행·링크)가 착수 직후 먼저 합치는 경계다([계약 요약](../../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md) 「Contract ownership rules」의 첫 주 선합치). 표 정의·마이그레이션과 C-10 인터페이스·가짜 구현만 있고, 발행·열람·텍스트 자료·Catch 설명의 API·화면과 C-10 실제 DB 구현은 U4 본체에서 만든다. 지금 api 코드에서 이 표를 읽거나 쓰는 곳은 없다.

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
