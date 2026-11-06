# 받은 사람 열람·비밀번호 통과 API — 12월 U4 제출 3

12월 intent U4(발행·링크) 제출 3(W4 받은 사람 열람·W6 10월 공유 링크 전환)의 api 안내다. 표·C-10 판정·발행·작성자 관리는 [발행 문서](publications.md)에 있고, 이 문서는 받은 사람 경로만 다룬다. 기준 문서: [U4 기능 명세](../../aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/functional-design/functional-spec.md) W4·W6·S8·S9·S14, [보안 설계](../../aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/security-design.md) 「판정과 읽기의 시점」·「비밀번호 통과」, [계약 요약](../../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md) C-10·C-12, #416 팀장 결정(2026-11-04 OQ-U4-NFR-5, 2026-11-05 OQ-U4-NFR-6). web 화면은 [받은 사람 화면 README](../../web/src/features/recipient/README.md).

## 경로


`src/publications/recipient-links.controller.ts`·`recipient-access.service.ts`(U4 제출 3 W4·W6, 계약 C-12). 10월 `RecipientController`(공개 프로필·Catch 목록·상세)와 `PublicLinksController`(unlock)를 이 컨트롤러 하나로 대체했고, `AppModule`에서 `ShareLinksModule`·`RecipientModule`을 뺐다(BR9.1). 회원 JWT를 쓰지 않으며 인증 예외 `@Public()`은 클래스가 아니라 두 메서드에만 붙인다(NFR1.1, [보안 점검](../../docs/CatchU_security_checks.md)). grant는 `X-Link-Grant` 머리글로만 받고 토큰·grant·비밀번호를 로그·오류에 넣지 않는다(NFR1.9).

| 경로 | 요청 | 성공 | 오류 |
| --- | --- | --- | --- |
| `GET /v1/public/links/{token}` | 머리글 `X-Link-Grant`(선택). 쿼리 없음 | 200 C-10 `PublishedSnapshot`(`title`·`publishedAt`·`expiresAt`·`items[]`, `Cache-Control: no-store`) | 401 `LINK_PASSWORD_REQUIRED`, 404 `LINK_UNAVAILABLE`, 400 `VALIDATION_FAILED`(정의 밖 쿼리, 10월 `limit`·`cursor` 포함), 500 `INTERNAL_ERROR` |
| `POST /v1/public/links/{token}/unlock` | 본문 `{ password }` | 200 `{ grant }` | 401 `LINK_PASSWORD_INVALID`, 404 `LINK_UNAVAILABLE`, 400 `INVALID_REQUEST`(비밀번호 없는 발행본)·`VALIDATION_FAILED`(본문), 429 `LINK_UNLOCK_LIMITED` + `Retry-After`, 500 |

10월 `GET /v1/public/links/{token}/catches/{catchId}`·`POST/GET /v1/share-links`·`PUT /v1/share-links/{id}/stop`은 없다(등록되지 않은 경로의 공통 응답). `test/publications/app-routes.test.cjs`가 등록된 (메서드, 경로)에 중복이 없고 받은 사람 두 경로가 이 컨트롤러에만 있으며 10월 경로가 없음을 확인한다.

## 열람의 판정 순서와 시점

열람은 `RecipientAccessService.read`가 **읽기 전용 REPEATABLE READ 트랜잭션 하나**에서 `DbPublicationAccess.resolveForRecipientIn`(판정) → `readSnapshotIn`(사본 읽기)을 부른다(보안 설계 R-04). 형식이 틀린 토큰은 트랜잭션을 열지 않고 404다. 행 잠금은 잡지 않는다.

| 순서 | 조건 | 응답 |
| --- | --- | --- |
| 1 | 토큰 형식(`isLinkTokenFormat`) 틀림, 발행본 없음(삭제 포함), 중지, 만료 | 404 `LINK_UNAVAILABLE`, 고정 문구, 구분 없음(BR6.1, NFR1.12) |
| 2 | 작성자(소유 회원) 상태 — 1과 같은 스냅샷 | 비활성 → 1과 같은 404. 회원 행 없음 → 500 `INTERNAL_ERROR` 고정 본문(아래 「작성자 상태별 처리」) |
| 3 | 비밀번호 발행본이면 이 발행본의 유효한 grant | 없음·다른 발행본·위조·만료 grant → 401 `LINK_PASSWORD_REQUIRED`. 비밀번호 없는 발행본은 머리글을 무시한다 |
| 4 | 사본 읽기 | 200. `published_item`을 position 순으로, 원본 Catch·자료는 읽지 않는다 |

**판정 뒤의 상태 변화**(#416 OQ-U4-NFR-5 결정 A 2026-11-04, OQ-U4-NFR-6 결정 2026-11-05; 열람 `GET` 기준이며 unlock은 아래 「작성자 상태별 처리」의 두 번 판정): 판정을 통과한 요청은 그 사이에 커밋된 중지·만료·삭제·작성자 비활성 때문에 취소되지 않는다. 이 경로는 판정과 사본 읽기가 같은 스냅샷이라 그 요청은 판정 시점의 사본을 돌려주고, 차단은 **다음 요청의 재판정**으로 한다. 삭제는 판정 뒤 읽을 사본이 없는 경우(`NotFound`)에만 그 요청도 404 `LINK_UNAVAILABLE`이다. 소비 Unit(U5·U10·U9)의 경로는 각자 매핑한다([발행 문서 「C-10 PublicationAccess」](publications.md#c-10-publicationaccess)의 「판정 뒤 상태 변경」). `test/publications/recipient-api.test.cjs`의 R-04 사례가 사본 읽기 직전에 중지·삭제·비활성을 커밋해 그 요청 200·다음 요청 404를 확인한다.

## 작성자 상태별 처리

| 작성자(소유 회원) 상태 | 열람 `GET` | 비밀번호 통과 `POST …/unlock` | 근거 |
| --- | --- | --- | --- |
| `ACTIVE` | 계속 판정 | 계속 판정 | — |
| 비활성(`account_state <> 'ACTIVE'`) | 404 `LINK_UNAVAILABLE`(없음·중지·만료와 구분 없음) | 404(최초 판정에서. 비밀번호 없는 발행본의 400보다 먼저, 해시 전) | #416 OQ-U4-NFR-6 1번 A. 다시 활성이면 다음 요청부터 열린다 |
| 회원 행 없음(데이터 불일치) | 500 `INTERNAL_ERROR` `{ code, message }` 고정 본문 | 500 | 응답·로그에 SQL·내부 메시지·토큰 없음. 정상 DB에서는 외래 키 때문에 생기지 않아 `OwnerProfileReader.readOwnerState` 대역으로만 시험한다 |
| 판정 통과 뒤 비활성 커밋 | 판정과 사본 읽기가 같은 스냅샷이라 그 요청에는 보이지 않는다 → 그 요청은 그대로 200, 다음 요청 404 | 최초 판정(1단계) 뒤 **해시 직전 재판정(8단계) 전**에 커밋되면 재판정이 보고 **그 요청 404** `LINK_UNAVAILABLE`(해시 계산 안 함). **재판정까지 통과한 뒤** 커밋되면 그 요청은 원래 절차대로 끝나고(비밀번호·차단 결과에 따라 200 `{ grant }`·401·429) 다음 요청의 재판정이 막는다 | OQ-U4-NFR-6 2번(통과한 요청을 작성자 비활성만을 이유로 취소하지 않음) |

판정 위치는 중지·만료 **다음**, 비밀번호(grant) **앞**이며 10월 #151과 같다. 계정을 비활성으로 바꾸는 제품 코드는 아직 없어 수동 변경에서만 생긴다.

열람과 unlock은 판정 횟수와 트랜잭션이 다르다. **열람 `GET`**은 판정과 사본 읽기를 읽기 전용 REPEATABLE READ 트랜잭션 **하나**에서 하므로 판정 뒤 커밋된 변화를 같은 요청이 볼 수 없다. **unlock**은 `RecipientAccessService.judge`(`DbPublicationAccess.resolveForUnlock`)를 **두 번** 부른다: 본문 검사 전의 최초 판정(1단계)과 해시 직전 재판정(8단계)이며, 각각 짧은 별도 트랜잭션이고 비밀번호 계산 전에 닫힌다. 그래서 두 판정 사이에 커밋된 중지·만료·비활성은 재판정이 잡아 그 요청이 404로 끝나고, 재판정 뒤의 변화만 다음 요청으로 넘어간다.

## 비밀번호 통과(unlock)

순서·제한값은 10월 `link-access.service.ts`와 같고([공유 링크 문서 「unlock 판정 순서」](share-links.md#수신자-비밀번호-확인접근-판정--150)의 1~10단계), 달라진 것은 둘이다.

- 1·8단계의 판정 대상이 `share_link`가 아니라 `publication`이며(`DbPublicationAccess.resolveForUnlock`, 계약 밖 클래스 메서드: 토큰 형식 → 발행본 → 중지·만료 → 작성자 상태까지 판정하고 비밀번호 검증값을 돌려줌), 판정 트랜잭션은 비밀번호 계산 전에 닫힌다.
- 시도 제한·빈도·차단의 **링크 단위 키는 `publicationId`**다(주소 단위 키 `publicationId|주소`). grant도 `publicationId`에 묶이고 수명 2시간, 발행본 만료를 넘지 않는다(BR6.2, NFR1.6).

unlock 정책·제어(`UNLOCK_POLICY`·`UNLOCK_CONTROLS`)는 이 모듈에만 선언한다([발행 문서 「PublicationsModule 구성」](publications.md#publicationsmodule-구성-제출-2); 제출 2의 중복 등록 문제는 `ShareLinksModule`을 빼면서 사라졌다). 비밀번호 실패·차단은 10월 `security-events`가 그대로 남긴다.

## 받은 사람 시험 (제출 3)

- `test/publications/recipient-api.test.cjs`: 판정 순서(형식 오류·없음·중지·만료 404, `no-store`, 토큰 비노출), S8, S9(작성자는 중지·만료 발행본을 계속 봄), R-04(한 트랜잭션의 격리·읽기 전용과 판정 뒤 중지·삭제·비활성), S14, 작성자 비활성 404와 재활성, 회원 행 없음 500 대역과 비노출, 거부 사례(정의 밖 쿼리 400, 회원 토큰 무관)
- `test/publications/recipient-unlock-policy.test.cjs`: 10월 `public-links-unlock*`·`public-links-client-address`의 unlock·주소 제한 사례를 발행본 경로로 옮긴 것
- `test/publications/app-routes.test.cjs`: 위 경로 경계
- web `test/recipient.test.mjs`: 화면(G1~G4 구조, 사본 표지, 근거 링크, 404·401·429·grant)

제출 3 실행(제출 1·2 파일 포함, 테스트 DB 필요. 제출 1·2 시험 설명은 [발행 문서 「시험」](publications.md#시험)):

```bash
npm test -- test/catches/author-description-api.test.cjs test/materials/text-materials-api.test.cjs test/publications/in-memory-publication-access.test.cjs test/publications/publication-access-db.test.cjs test/publications/publish-api.test.cjs test/publications/publications-manage-api.test.cjs test/publications/publications-logging.test.cjs test/publications/publications-module.test.cjs test/publications/recipient-api.test.cjs test/publications/recipient-unlock-policy.test.cjs test/publications/app-routes.test.cjs test/db/member-cascade-delete.test.cjs
```
