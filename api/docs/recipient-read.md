# 비로그인 수신자 조회 — #151 (10월 기록, 12월 U4 제출 3에서 대체됨)

> **현재 상태(2026-11-06, #416):** 이 문서의 `GET /v1/public/links/{token}`(공개 프로필·Catch 목록)·`GET …/catches/{catchId}`와 `RecipientModule`·`LinkAccessService.assertReadable`·`withLinkSnapshot`은 **없다**. 같은 경로 `GET /v1/public/links/{token}`은 이제 발행본 사본(C-10 `PublishedSnapshot`)을 돌려주고 Catch 상세 경로는 없다. 판정 순서(링크 → 작성자 상태 → grant)와 같은 시점 판정의 뜻은 이어받았으며 현행 설명은 [발행 문서 「받은 사람 열람·비밀번호 통과 API」](publications.md#받은-사람-열람비밀번호-통과-api-제출-3)다. 아래는 10월 기록으로 남긴다.

수신자가 공유 링크로 구직자의 공개 프로필과 공개 Catch를 읽는 경로다. 계약은 [수신자 API](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/recipient-api.yaml)의 `getPublicCollection`·`getPublicCatch`, [공통 스키마](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml)의 `PublicProfile`·`PublicCatch`·`PageInfo`, [계약 요약](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md) 「P — 수신자 API」의 소유 회원 판정을 따른다.

## 조립

- 기본 앱(`AppModule`)에 `RecipientModule`을 등록한다. 링크·소유 회원 판정은 `ShareLinksModule`(#150), 공개 Catch는 `CatchesModule`(B), 소유 회원 상태·공개 프로필은 A의 `OwnerProfileReaderModule`(`OwnerProfileReader`, [회원 프로필 문서](member-profile.md#수신자-조회용-소유자-상태공개-프로필-공급--151))의 실제 구현을 쓴다.
- 공급자를 주입받는 조립 경로(이전 `RecipientModule.register({ profileSource })`)와 `PublicProfileSource` 인터페이스는 없앴다. A 공급 함수가 상태(이용 가능·비활성·회원 없음)와 호출자 트랜잭션(`manager`)을 함께 다뤄야 해서, 네 항목만 돌려주는 기존 인터페이스나 그 위의 어댑터로는 계약의 재판정을 표현할 수 없기 때문이다. 시험은 제품 모듈을 그대로 가져오고, 정상 DB에서 만들 수 없는 결과만 시험 안에서 공급 함수 인스턴스의 메서드를 잠시 감싼다.
- 본인 조회 `MemberProfileService.read()`(GitHub 연결 갱신 포함)를 쓰지 않는다. 수신자 조회는 외부 GitHub 조회·연결 갱신·자격정보 접근을 하지 않는다.

## 경로와 판정 순서

| 경로 | 응답 |
|---|---|
| `GET /v1/public/links/{token}` | `{ profile, catches, page }`. `cursor`·`limit`(1~100, 기본 20) |
| `GET /v1/public/links/{token}/catches/{catchId}` | `PublicCatch` 한 건. 쿼리 없음 |

매 요청(다음 페이지 포함) 아래 순서로 다시 판정한다. cursor는 조회 위치일 뿐 권한이 아니다. unlock(`POST …/unlock`)의 순서는 [공유 링크 문서](share-links.md#수신자-비밀번호-확인접근-판정--150)에 있다.

1. 링크 존재·중단·만료 → 아니면 `404 LINK_UNAVAILABLE`(없는 URL·형식 오류·중단·만료를 구분하지 않음).
2. 링크 소유 회원 상태(1과 같은 시점) → 비활성이면 1과 같은 `404 LINK_UNAVAILABLE`. 같은 시점에 회원 행이 없으면 데이터 불일치 `500 INTERNAL_ERROR`.
3. 비밀번호 링크면 이 링크의 유효한 grant(`X-Link-Grant` 헤더) → 없거나 다른 링크·위조·만료 grant면 `401 LINK_PASSWORD_REQUIRED`. 이 단계 전에는 Catch 존재 여부를 알리지 않는다.
4. 쿼리 검사 → `400 INVALID_REQUEST`(범위 밖 `limit`, 형식이 틀리거나 다른 소유자 링크에서 받은 `cursor`, 정의되지 않은 쿼리, 상세의 쿼리).
5. 링크 소유자의 현재 자료 → 공개(PUBLIC)이고 확인된 원본 비공개 제한이 없는 Catch만. 숨김·제한·다른 회원·없는 Catch는 `404 RESOURCE_UNAVAILABLE`. 공개 0건은 빈 배열 200.
6. (목록만) 공개 프로필 → 아래 「분리된 프로필 조회」.

1~3은 #150 `LinkAccessService.assertReadable`, 4·5는 B `PublicCatchStore`와 `emptyCatchQuery`를 그대로 쓴다. 공개·보호 조건과 페이지 규칙을 이 모듈에서 다시 구현하지 않는다. 링크마다 프로필·Catch 사본을 만들지 않고, 응답에 링크 제목·링크 ID·소유자 ID·GitHub 연결 상태를 넣지 않는다. 회원 JWT를 쓰지 않으며, 인증 예외 `@Public()`은 두 메서드에만 붙인다([보안 점검](../../docs/CatchU_security_checks.md)).

## 같은 시점 판정

- 1·2는 읽기 전용 REPEATABLE READ 트랜잭션 하나에서 링크를 읽은 뒤 같은 manager로 `readOwnerState(ownerId, manager)`를 부른다(`LinkAccessService.withLinkSnapshot`). PostgreSQL REPEATABLE READ는 첫 조회 문장(링크 조회)의 스냅샷을 뒤의 문장이 함께 쓴다. 행 잠금은 잡지 않는다.
- 트랜잭션은 판정이 끝나면 닫히고 manager를 밖으로 내보내지 않는다. 이후의 Catch·프로필 조회는 판정과 분리된 조회다.
- 판정 뒤의 상태 변화로 진행 중 응답을 취소하지 않는다. 다음 요청에서 다시 판정한다.

## 분리된 프로필 조회(목록)

`readPublicProfile(ownerId)`를 트랜잭션 없이 한 번 부른다.

| 결과 | 응답 |
|---|---|
| 이용 가능 | 자가 입력 네 항목 + `fieldSource: 'SELF_REPORTED'` + `githubAccountLogin` |
| 비활성 | 그 조회 시점의 결과로 바로 `404 LINK_UNAVAILABLE`(다시 조회하지 않음) |
| 회원 없음 | 링크와 소유 회원을 같은 시점으로 **한 번** 다시 판정: 새 읽기 전용 REPEATABLE READ 트랜잭션에서 링크를 읽고 같은 manager로 `readPublicProfile(ownerId, manager)`를 부른다. 링크 불가·비활성은 404, 회원 없음은 500, 이용 가능이면 그 프로필. 상태와 프로필을 한 문장으로 읽어 판정과 프로필이 같은 시점이다. 반복하지 않는다 |
| 필수 프로필 행 누락·DB 오류 | `500 INTERNAL_ERROR`. 빈 프로필로 바꾸지 않는다 |

- `githubAccountLogin`은 필수·nullable이다. GitHub 연결이 `CONNECTED`일 때만 저장된 계정명이고 `REAUTH_REQUIRED`·`DISCONNECTED`·연결 기록 없음은 `null`이다(값은 A 공급 함수가 정한다). 저장값이라 승인 철회·계정명 변경이 아직 반영되지 않았으면 이전 계정명일 수 있다. `fieldSource`는 자가 입력 네 항목에만 적용된다.
- `public-profile-response.ts`는 공급 값에서 허용 필드만 복사한다. 모양이 다르면(문자열·배열·nullable 문자열이 아님) 기본값으로 채우지 않고 500이다.
- 상세는 계약상 `PublicCatch`만 돌려주므로 프로필을 읽지 않는다.

## 파일

| 파일 | 내용 |
|---|---|
| `src/recipient/recipient.controller.ts` | 두 경로. grant는 헤더로만 받는다 |
| `src/recipient/recipient.service.ts` | 판정 순서, 분리된 프로필 조회와 한 번 재판정 |
| `src/recipient/public-profile-response.ts` | 공급 값 검사·허용 필드 복사 |
| `src/recipient/recipient.module.ts` | 실제 #150·B·A 모듈 조립. 기본 앱에 등록 |
| `src/share-links/link-access.service.ts` | 링크·소유 회원 같은 시점 판정(`withLinkSnapshot`·`assertOwnerAvailable`) |

## 검사

- `test/recipient/recipient-http.test.cjs`: 제품 `RecipientModule`과 실제 Nest HTTP·테스트 DB(격리 스키마)·#150 판정·B 공개 조회·A 공급 함수(합성 회원·프로필·GitHub 연결 행)로 위 판정 순서, 회원 토큰 없는 열람, grant 경계(다른 링크·위조·만료·쿼리 전달), unlock 시도 제한 차단 중 받아 둔 grant 열람, 중단·만료·소유 회원 비활성의 우회 불가(unlock·목록·상세, 비밀번호 없는 링크 unlock의 400보다 먼저), 다음 페이지 재판정, 같은 시점 판정(링크 조회 뒤 커밋된 비활성화가 그 판정에 보이지 않고 다음 요청에 반영), GitHub 상태별 계정명, 링크 사이 같은 현재 자료·변경 즉시 반영·조회 전후 Catch 행 수 유지, 필수 프로필 누락·Catch 읽기 실패 500, 근거의 기여 범위·한계 보존, 응답 필드 누출, `no-store`, 서버 로그의 토큰·grant·비밀번호 비노출을 검사한다. 판정의 회원 없음·상태 조회 실패, 분리된 조회의 비활성·회원 없음 재판정 순서, 공급 함수 DB 오류·모양 오류(응답·로그에 SQL·내부 메시지가 없는지 포함)는 공급 함수 메서드를 감싼 **시험 대역**이다(정상 DB에서 외래 키로 만들 수 없거나 재현이 불안정한 결과).
- 공급 함수 예외의 경계: 공급자는 HTTP 오류를 결정하지 않고, C가 공급 결과와 오류를 수신자 HTTP 응답으로 해석한다(#151 10/18 분담). 공급 함수가 던진 예외는 감싸지 않고 전역 오류 필터로 넘긴다. 현재 `OwnerProfileReader`가 던지는 필수 프로필 누락(`OwnerProfileMissingError`)·DB 오류·형식 오류(`TypeError`·`Error`)는 모두 고정 본문의 500이며 SQL·내부 메시지를 응답에 담지 않는다. 전역 필터는 `ApiError`·HTTP 예외를 그 코드로 응답하므로, 공급 함수가 이런 예외를 던지게 바뀌면 공급 함수 호출 지점에서만 해석을 더한다(C의 판정 404는 감싸지 않는다).
- `test/recipient/recipient-app.test.cjs`: 기본 `AppModule`을 그대로 띄워 두 경로와 unlock이 실제 공급 함수로 응답하는지(회원 토큰 없음, 0건 200, GitHub 상태별 계정명, 401·404·400, 소유 회원 비활성 404와 재활성 뒤 열람, 필수 프로필 누락 500, 로그 비노출)를 테스트 DB에서 확인한다. 공개 Catch가 있는 조합은 위 시험이 맡는다.
- `test/recipient-module-boundary.test.cjs`: 실제 Guard로 두 메서드의 비로그인 허용과 미지정 경로의 인증 요구, 대역 주입 조립 경로 없음, 모듈·주입 구성, AppModule의 수신자 모듈·컨트롤러 1회 등록(구조 검사).
- `test/db/public-links-unlock-policy.test.cjs`: unlock의 같은 시점·읽기 전용 REPEATABLE READ 판정 두 번, 비밀번호 계산 중 판정 트랜잭션·테이블 잠금 없음, 해시 대기 중 소유 회원 비활성 404. 트랜잭션·잠금 검사는 비밀번호 계산 시작 시점의 관측이며, 계산이 끝날 때까지 전체 구간을 연속 관찰한 것은 아니다.
- 원본 비공개 제한은 합성 보호 관측 행으로 만든다. 실제 원본 상태 관측(OQ-B3), 실제 GitHub OAuth로 만든 연결 행, web 수신자 화면 연결과 배포 환경은 검증하지 않았다.
