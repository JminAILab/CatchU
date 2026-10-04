# 공유 링크 발급(#147)·수신자 비밀번호 확인(#150)

`POST /v1/share-links`(회원 API `createShareLink`), `POST /v1/public/links/{token}/unlock`(수신자 API `unlockLink`)과 ShareLink 테이블이다. 코드는 `src/share-links/`에 있다.

| 파일 | 내용 |
|---|---|
| `share-links.controller.ts`·`share-links.service.ts`·`share-links.module.ts` | 발급 API. 신규 201, 같은 키·같은 본문 재요청 200. 응답은 회원 API `ShareLink` |
| `share-links.config.ts` | `SHARE_LINK_WEB_BASE_URL`([api README 「설치와 환경변수」](../README.md#설치와-환경변수)) |
| `share-link-response.ts` | 응답 구성. 상태는 응답 시각으로 구하고, 토큰은 `url` 안에만 넣는다 |
| `share-create.ts` | `ShareCreate` 입력 검증(제목만 trim), 발급 시각부터 정확히 30×24시간 만료 |
| `link-password.ts` | 비밀번호 검증값. Node 내장 `scrypt`(N=2^15, r=8, p=1), 16바이트 salt, 상수 시간 비교. 비밀번호는 trim·정규화하지 않는다. 깨진 저장값은 서버 오류 |
| `link-token.ts` | 256비트 난수 토큰(base64url 43자)과 수신자 URL(`/s/<token>`) 조립 |
| `share-create-fingerprint.ts` | 멱등 지문(제목 + 비밀번호 **설정 여부**)과 같은 키 재요청 비교 |
| `share-link.entity.ts` | ShareLink 엔티티. 상태 칼럼 없음 |
| `share-link-state.ts` | 상태 ACTIVE·STOPPED·EXPIRED. 중단이 만료보다 우선(#148 9/29 결정). #148도 이 함수를 쓴다 |
| `share-link-issuance.ts` | 발급 판정·저장 `issueShareLink(manager, command)` |

## 발급 처리 순서

1. 토큰의 회원 ID가 UUID가 아니면(#104 이전 개발 토큰) `401 AUTH_INVALID`. `Idempotency-Key`가 없거나 1~128자가 아니면 `400 INVALID_REQUEST`, 본문이 계약과 다르면 `400 VALIDATION_FAILED`(`details.violations`의 reason은 `isObject`·`whitelistValidation`·`isString`·`isNotEmpty`). 알 수 없는 필드 이름은 응답에 반사하지 않고 `body` 한 건으로 알린다.
2. 비밀번호 해시와 토큰은 잠금 시간을 줄이려고 트랜잭션 밖에서 미리 만든다.
3. 한 READ COMMITTED 트랜잭션에서 회원 행을 `FOR KEY SHARE`로 확인하고(없으면 `401 AUTH_INVALID`, 다른 DB 오류는 500 그대로) #104의 `runIdempotentCreation`을 부른다. 잠금 순서는 **멱등 키 잠금 → 회원 단위 발급 잠금**이다.
   - 새 키: `issueShareLink`가 회원 단위 advisory lock을 잡고, 잠금을 얻은 **뒤의** 시각으로 유효 링크(중단 안 됨, 만료 전)를 모아 제목 중복(`LINK_TITLE_CONFLICT`)을 한도(`LINK_LIMIT_REACHED`, 5개)보다 먼저 판정한 뒤 저장한다(#23 9/28 결정).
   - 같은 키: 지문이 다르면 409. 지문이 같아도 기록이 가리키는 링크를 읽어 `isSameShareCreate`로 비밀번호까지 비교한다. 비밀번호만 달라도 `409 IDEMPOTENCY_CONFLICT`이고, 같으면 그 링크를 현재 상태로 200 응답한다(중단됐으면 `STOPPED`). 기록과 링크가 어긋나면 409가 아니라 500이다.
4. 응답 구성까지 같은 트랜잭션이다. 거절·실패하면 링크와 멱등 기록이 함께 롤백되어 같은 키를 다시 쓸 수 있다.

## 테이블

마이그레이션 `1790745895865-CreateShareLink`가 `share_link`와 두 외래 키를 만든다. #104(`1790500000000`) 뒤, B(`1790600000000`)와는 서로 참조하지 않는다.

- `share_link`: 제목 1자 이상, `expires_at = issued_at + 720시간`, 중단 시각 ≥ 발급 시각, 토큰 유일, `owner_id` 인덱스.
- `owner_id → member_account.member_id`.
- `unique(link_id, owner_id)`와 `idempotency_record (link_id, member_id) → share_link (link_id, owner_id)`: 멱등 기록이 있는 링크를, 그리고 기록한 회원이 소유한 링크만 가리킨다. 분석 요청 기록은 `link_id`가 null이라 검사 대상이 아니다.
- 기록이 가리키는 링크는 지울 수 없다. 되돌릴 때는 이 마이그레이션을 #104보다 먼저 되돌린다.

유효 링크의 제목 유일·5개 한도는 시간에 따라 달라지므로 정적 unique로 두지 않고 위 회원 단위 직렬화로 판정한다.

**토큰 저장:** `link_token_reference`에 토큰 자체를 저장한다(ERD `secret-lookup-key`, [#162 검토 합의](https://github.com/JminAILab/CatchU/pull/162#issuecomment-5943491118)). 발급·같은 키 재요청·목록(#148) 응답이 모두 `url`을 다시 만들어야 해서 되돌릴 수 없는 해시로는 저장할 수 없고, 암호화 보관은 키 관리 방식이 정해지지 않아 쓰지 않는다. 토큰은 `url` 밖(별도 응답 필드·로그·오류)에 내보내지 않는다. 비밀번호와 달리 DB가 유출되면 토큰도 함께 노출되는 한계가 남는다.

비밀번호 원문은 저장·응답·로그에 남기지 않고, 지문에도 넣지 않는다(짧은 비밀번호의 해시는 추측으로 원문을 알아낼 수 있다).

## 수신자 비밀번호 확인·접근 판정 — #150

grant 형식·수명·보관·시도 제한은 [#150 9/29 결정](https://github.com/JminAILab/CatchU/issues/150#issuecomment-5883572995), 차단 응답은 #173 계약을 따른다. 회원 JWT를 쓰지 않는다(`@Public()`).

| 파일 | 내용 |
|---|---|
| `public-links.controller.ts` | `POST /v1/public/links/{token}/unlock` |
| `link-access.service.ts` | 링크 판정·unlock·수신 조회용 `assertReadable(token, grant)`(#151이 쓴다) |
| `link-grant.ts` | grant 서명·검증(HMAC-SHA256, `LINK_GRANT_SECRET`). 링크 ID·만료만 담고 서버에 저장하지 않는다 |
| `unlock-limiter.ts` | 링크·접속지 단위 시도 제한과 직렬화(프로세스 메모리) |

**unlock 판정 순서**

| 순서 | 조건 | 응답 |
|---|---|---|
| 1 | 토큰 형식이 틀림·없음·중단·만료 | 404 `LINK_UNAVAILABLE`, 고정 문구, `details` 없음(비밀번호 검사 전) |
| 2 | 비밀번호 없는 링크 | 400 `INVALID_REQUEST` |
| 3 | 본문이 `{ password: 비어 있지 않은 문자열 }`이 아님 | 400 `VALIDATION_FAILED`(세지 않음). 차단 중이어도 400 |
| 4 | 이 링크·접속지가 이미 차단 중 | 429 `LINK_UNLOCK_LIMITED`, `Retry-After`=차단 종료까지 남은 초(올림). 대기열보다 먼저 판정. 맞는 비밀번호도 거부하고 해시를 계산하지 않는다 |
| 5 | 같은 링크·접속지에 실행 중 포함 3개가 이미 걸려 있음 | 429 `LINK_UNLOCK_LIMITED`, `Retry-After: 1`(검사하지 않음) |
| 5′ | (차례가 오면) 차단 중이거나, 기록 자리(1만 개)가 모두 유효한 기록으로 차 새 키를 받을 수 없음 | 429 `LINK_UNLOCK_LIMITED`, `Retry-After`=차단 종료 또는 가장 이른 기록 만료까지. 전체 용량 초과 시 거절은 승인 대기 정책(PR #150 「확인받을 것」 2) |
| 6 | 비밀번호 틀림 | 401 `LINK_PASSWORD_INVALID`(실패 1회) |
| 7 | 맞음 | 200 `{ grant }`, 그 링크·접속지의 실패 기록 초기화(방어적 재확인에서 차단이 보이면 429, grant 없음) |

- **grant:** 수명은 발급 후 최대 2시간이며 링크 만료를 넘지 않는다. 링크 ID가 다르거나 서명·형식이 틀리거나 만료되면 무효다. web은 `X-Link-Grant` 헤더로 보내고 링크별 `sessionStorage`에 둔다(#152).
- **수신 조회 판정(`assertReadable`):** 매 요청 1번 판정을 다시 한 뒤, 비밀번호 링크는 이 링크의 유효한 grant가 없으면 401 `LINK_PASSWORD_REQUIRED`다. grant가 있어도 중단·만료는 404다. 시도 제한은 적용하지 않는다.
- **직렬화:** 같은 링크·접속지의 요청은 한 번에 하나씩 5′~7단계를 한다. 실행 중 1개를 포함해 최대 3개까지 걸 수 있다. 동시에 몰아 보내도 차단 전 검사는 10번을 넘지 않는다.
- **시도 제한:** 같은 링크·같은 접속지에서 15분 안에 10번 틀리면 그 시각부터 15분 차단한다. 차단 중 요청은 세지 않아 기간이 늘어나지 않고, 풀리면 처음부터 센다. 접속지는 직접 연결 주소다. 부하분산기를 두면 배포에서 신뢰 프록시를 설정해야 하며, 하지 않으면 모든 수신자가 같은 주소로 보여 한 사람의 실패가 그 링크 전체를 막는다. 프로세스 메모리라 재시작하면 초기화되고, 서버·프로세스가 늘면 차단이 헐거워진다. 기록은 1만 개가 상한이다. 새 링크·접속지는 검사 전에 자리를 예약하고, 자리가 없으면 만료된 기록만 정리한다. 창 안 실패 기록과 유효한 차단은 지우지 않으며, 그래도 자리가 없으면 새 키를 검사 없이 429로 거절한다. 이 경우 특정 링크·접속지의 실패 때문에 다른 정상 수신자도 막힐 수 있어, 거절 정책과 오류 코드는 팀장 확인 대기다.
- **응답 시간:** 없음·중단·만료는 같은 조회 경로를 타고, 차단되지 않은 검증만 해시를 한 번 계산한다. 응답 시간이 같다고 보장하지 않는다. 2026-09-30 로컬 측정(직렬화 적용 판본, 각 25회 중앙값): 404 2.0ms, 400 2.1ms, 429 1.9ms, 401 94.0ms, 200 91.6ms. 해시를 계산하는 401·200만 느리고, 링크 존재 여부(404)는 비밀번호 없는 링크(400)·차단(429)과 비슷하다.

## 검사

- `test/db/share-links-api.test.cjs`: 실제 앱·테스트 DB·개발 로그인 회원으로 HTTP 검증. 201·200·409(비밀번호만·제목·비밀번호 유무 차이), 제목 중복·한도·중단 제목 재사용, 동시 같은 키 5건 → 1개, 동시 다른 키 7건 → 5개, 회원별 범위, 인증·키·입력 오류, 회원 UUID가 아니거나 회원 행이 없는 토큰 401, 기록·링크 불일치 500, 비밀번호·토큰 로그 비노출.
- `test/db/share-link-issuance.test.cjs`: 마이그레이션한 스키마·외래 키, 발급 판정(중단·만료 제외, 만료 경계, 동시 발급, 회원별 직렬화, 잠금 대기 중 만료, 롤백).
- 단위: `test/share-create*.test.cjs`, `test/link-*.test.cjs`, `test/share-link-state.test.cjs`, `test/share-links-config.test.cjs`.
- `test/db/public-links-unlock.test.cjs`: unlock HTTP(200·401·404 동일 본문·400 두 종류·429와 `Retry-After`·차단 중 400/429 구분·다른 링크 비차단·동시 15회)와 늦은 성공 429와 수신 조회 판정(grant 필요·다른 링크 grant 무효·중단·만료 우회 불가), 비밀번호·grant·토큰 로그 비노출. 단위: `test/link-grant.test.cjs`, `test/unlock-limiter.test.cjs`.
