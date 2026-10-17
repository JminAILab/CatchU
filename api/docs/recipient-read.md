# 비로그인 수신자 조회 — #151

수신자가 공유 링크로 구직자의 공개 프로필과 공개 Catch를 읽는 경로다. 계약은 [수신자 API](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/recipient-api.yaml)의 `getPublicCollection`·`getPublicCatch`와 [공통 스키마](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml)의 `PublicProfile`·`PublicCatch`·`PageInfo`를 따른다.

## 현재 상태

- **기본 앱(`AppModule`)에는 등록하지 않는다.** 공개 프로필을 줄 A의 공급자가 아직 정해지지 않았다([10/13 확인 요청](https://github.com/JminAILab/CatchU/issues/151#issuecomment-6137981301)). 수신자 모듈은 공급자를 받아야만 조립되므로(`RecipientModule.register({ profileSource })`), 공급자가 없으면 제품 앱에서 두 경로가 열리지 않는다(없는 경로 404).
- 시험은 공급자 자리에 **대역**을 넣는다. 대역으로 통과한 결과를 A 프로필 연동 검증으로 보지 않는다. 대역을 켜는 환경변수나 설정은 없다.
- 실제 공급자가 정해지면 `AppModule`에 `RecipientModule.register({ profileSource })`를 더하고, 이 문서와 [api README](../README.md)의 상태를 고친다.

## 경로와 판정 순서

| 경로 | 응답 |
|---|---|
| `GET /v1/public/links/{token}` | `{ profile, catches, page }`. `cursor`·`limit`(1~100, 기본 20) |
| `GET /v1/public/links/{token}/catches/{catchId}` | `PublicCatch` 한 건. 쿼리 없음 |

매 요청(다음 페이지 포함) 아래 순서로 다시 판정한다. cursor는 조회 위치일 뿐 권한이 아니다.

1. 링크 존재·중단·만료 → 아니면 `404 LINK_UNAVAILABLE`(없는 URL·형식 오류·중단·만료를 구분하지 않음).
2. 비밀번호 링크면 이 링크의 유효한 grant(`X-Link-Grant` 헤더) → 없거나 다른 링크·위조·만료 grant면 `401 LINK_PASSWORD_REQUIRED`. 이 단계 전에는 Catch 존재 여부를 알리지 않는다.
3. 쿼리 검사 → `400 INVALID_REQUEST`(범위 밖 `limit`, 형식이 틀리거나 다른 소유자 링크에서 받은 `cursor`, 정의되지 않은 쿼리, 상세의 쿼리).
4. 링크 소유자의 현재 자료 → 공개(PUBLIC)이고 확인된 원본 비공개 제한이 없는 Catch만. 숨김·제한·다른 회원·없는 Catch는 `404 RESOURCE_UNAVAILABLE`. 공개 0건은 빈 배열 200.

1·2는 #150 `LinkAccessService.assertReadable`, 3·4는 B `PublicCatchStore`와 `emptyCatchQuery`를 그대로 쓴다. 공개·보호 조건과 페이지 규칙을 이 모듈에서 다시 구현하지 않는다. 링크마다 프로필·Catch 사본을 만들지 않고, 응답에 링크 제목·링크 ID·소유자 ID를 넣지 않는다. 회원 JWT를 쓰지 않으며, 인증 예외 `@Public()`은 두 메서드에만 붙인다([보안 점검](../../docs/CatchU_security_checks.md)).

## 공개 프로필 공급자 — A와 합의 전

`public-profile-source.ts`의 `PublicProfileSource.read(ownerId)`는 링크 판정을 통과한 링크의 소유자 ID로만 부른다. 돌려받은 값에서 `displayName`·`introduction`·`desiredRole`·`skills`만 복사하고 `fieldSource: 'SELF_REPORTED'`를 붙인다. 다른 필드가 섞여 와도 응답에 넣지 않는다. 값이 이 모양이 아니거나 공급자가 오류를 던지면 기본값으로 채우지 않고 `500 INTERNAL_ERROR`다.

아래는 이 작업에서 정하지 않았다. A의 답변과 계약 수정으로 정한다.

- 프로필 4항목의 공개 투영과 GitHub 공개 정보 추가 여부([계약 요약 OQ-A2](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md)). 지금은 현재 계약 `PublicProfile`의 모양만 따르며 GitHub 필드는 넣지 않는다.
- GitHub 미연동·재인증 필요 상태의 수신자 표현.
- 비활성·탈퇴 소유자 링크의 수신 응답, 프로필 행 누락의 처리. 지금은 공급자가 던진 오류를 그대로 500으로 보낸다.

## 파일

| 파일 | 내용 |
|---|---|
| `src/recipient/recipient.controller.ts` | 두 경로. grant는 헤더로만 받는다 |
| `src/recipient/recipient.service.ts` | 판정 순서와 재사용 연결 |
| `src/recipient/public-profile-source.ts` | A 공급자 인터페이스와 주입 토큰 |
| `src/recipient/public-profile-response.ts` | 공급자 값 검사·허용 필드 복사 |
| `src/recipient/recipient.module.ts` | 공급자 필수 조립. 기본 앱 미등록 |

## 검사

- `test/recipient/recipient-http.test.cjs`: 실제 Nest HTTP·테스트 DB(격리 스키마)·#150 판정·B 공개 조회와 프로필 대역으로 위 판정 순서, 회원 토큰 없는 열람, grant 경계(다른 링크·위조·만료·쿼리 전달), unlock 시도 제한 차단 중 받아 둔 grant 열람, 중단·만료 우회 불가, 다음 페이지 재판정, 사본 없음, 읽기 실패 500, 근거의 기여 범위·한계 보존, 응답 필드 누출(본인용 질문·확인·불일치·내부 ID·링크 제목), `no-store`, 서버 로그의 토큰·grant·비밀번호 비노출을 검사한다.
- `test/recipient-module-boundary.test.cjs`: 실제 Guard로 두 메서드의 비로그인 허용과 미지정 경로의 인증 요구, 공급자 없는 조립 거부, 제품 앱에 수신자 모듈·경로가 없음을 검사한다.
- 원본 비공개 제한은 합성 보호 관측 행으로 만든다. 실제 GitHub 원본 상태 관측과 A 프로필 연동, web 수신자 화면 연결은 검증하지 않았다.
