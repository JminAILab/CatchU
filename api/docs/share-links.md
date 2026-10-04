# 공유 링크 발급(#147)·목록·중단(#148)

`POST /v1/share-links`(회원 API `createShareLink`), `GET /v1/share-links`(`listShareLinks`), `PUT /v1/share-links/{linkId}/stop`(`stopShareLink`)과 ShareLink 테이블이다. 코드는 `src/share-links/`에 있다.

| 파일 | 내용 |
|---|---|
| `share-links.controller.ts`·`share-links.service.ts`·`share-links.module.ts` | 발급(신규 201, 같은 키·같은 본문 재요청 200)·목록·중단 API. 응답은 회원 API `ShareLink` |
| `share-link-list.ts` | 목록 쿼리(`cursor`·`limit`) 검사와 소유자에 묶인 cursor |
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

## 목록·중단 — #148

- **목록** `GET /v1/share-links`: 본인 링크만 발행 시각 최신순, 같은 시각이면 `linkId` 역순이다. `limit`은 1~100(기본 20), `page.nextCursor`는 마지막 페이지에서 null. 0개는 `items: []`인 정상 응답이다. 상태는 응답 시각으로 구한다.
  - 쿼리는 `cursor`·`limit`만 받는다. 다른 이름, 같은 이름 반복, 범위 밖 `limit`, 고치거나 다른 회원의 `cursor`는 `400 VALIDATION_FAILED`(reason `whitelistValidation`·`isInt`·`min`·`max`·`isCursor`)이며 입력값을 담지 않는다.
  - cursor는 소유자와 위치만 담은 불투명 문자열이다. 권한을 담지 않으므로 매 요청 인증된 회원의 링크만 다시 조회한다.
- **중단** `PUT /v1/share-links/{linkId}/stop`: #148 9/29 팀장 결정 표를 따른다. 업무 판정은 200과 404를 쓴다(입력 오류 400·인증 오류 401·서버 오류 500은 별도).

| 경우 | 응답 |
|---|---|
| 본인 유효 링크 | 200, `STOPPED`(중단 시각 기록) |
| 본인 링크 반복 중단 | 200, 처음 `stoppedAt` 유지(만료 시각이 지나도 `STOPPED`) |
| 본인 만료 링크 | 200, 중단 처리 없이 `EXPIRED` |
| 타인 링크·없는 링크·UUID 형식이 아닌 ID | 404 `RESOURCE_UNAVAILABLE`(소유 확인을 상태 확인보다 먼저) |
| 본문(객체·배열·문자열 등 종류 무관)이나 쿼리가 붙은 요청 | 400 `VALIDATION_FAILED`(reason `isEmpty`·`whitelistValidation`). JSON 원시값은 해석 단계에서 400 `INVALID_REQUEST` |

- 중단은 링크 행을 `FOR UPDATE`로 잠가 동시 중단도 같은 `stoppedAt` 하나로 모은다. `share_link` 행만 바꾸며 Catch 내용·공개 상태는 건드리지 않는다.
- 세 API 모두 회원 UUID가 아니거나 회원 행이 없는 토큰은 `401 AUTH_INVALID`다. 이 확인은 공통 Guard가 아니라 서비스에서 하고, 트랜잭션 안에서 회원 행을 `FOR KEY SHARE`로 잡는다([#162 검토 합의](https://github.com/JminAILab/CatchU/pull/162#issuecomment-5943491118)).

## 테이블

마이그레이션 `1790745895865-CreateShareLink`가 `share_link`와 두 외래 키를 만든다. #104(`1790500000000`) 뒤, B(`1790600000000`)와는 서로 참조하지 않는다.

- `share_link`: 제목 1자 이상, `expires_at = issued_at + 720시간`, 중단 시각 ≥ 발급 시각, 토큰 유일, `owner_id` 인덱스.
- `owner_id → member_account.member_id`.
- `unique(link_id, owner_id)`와 `idempotency_record (link_id, member_id) → share_link (link_id, owner_id)`: 멱등 기록이 있는 링크를, 그리고 기록한 회원이 소유한 링크만 가리킨다. 분석 요청 기록은 `link_id`가 null이라 검사 대상이 아니다.
- 기록이 가리키는 링크는 지울 수 없다. 되돌릴 때는 이 마이그레이션을 #104보다 먼저 되돌린다.

유효 링크의 제목 유일·5개 한도는 시간에 따라 달라지므로 정적 unique로 두지 않고 위 회원 단위 직렬화로 판정한다.

**토큰 저장:** `link_token_reference`에 토큰 자체를 저장한다(ERD `secret-lookup-key`, [#162 검토 합의](https://github.com/JminAILab/CatchU/pull/162#issuecomment-5943491118)). 발급·같은 키 재요청·목록(#148) 응답이 모두 `url`을 다시 만들어야 해서 되돌릴 수 없는 해시로는 저장할 수 없고, 암호화 보관은 키 관리 방식이 정해지지 않아 쓰지 않는다. 토큰은 `url` 밖(별도 응답 필드·로그·오류)에 내보내지 않는다. 비밀번호와 달리 DB가 유출되면 토큰도 함께 노출되는 한계가 남는다.

비밀번호 원문은 저장·응답·로그에 남기지 않고, 지문에도 넣지 않는다(짧은 비밀번호의 해시는 추측으로 원문을 알아낼 수 있다).

## 검사

- `test/db/share-links-api.test.cjs`: 실제 앱·테스트 DB·개발 로그인 회원으로 HTTP 검증. 201·200·409(비밀번호만·제목·비밀번호 유무 차이), 제목 중복·한도·중단 제목 재사용, 동시 같은 키 5건 → 1개, 동시 다른 키 7건 → 5개, 회원별 범위, 인증·키·입력 오류, 회원 UUID가 아니거나 회원 행이 없는 토큰 401, 기록·링크 불일치 500, 비밀번호·토큰 로그 비노출.
- `test/db/share-links-manage-api.test.cjs`: 목록·중단 HTTP 검증. 빈 목록, 본인 링크만, 최신순·동일 시각 정렬, cursor 페이지(빠짐·중복 없음), 상태 3종, 쿼리 오류, 첫·반복 중단(처음 `stoppedAt` 유지), 만료 링크 중단, 중단 뒤 만료, 타인·없는·형식 오류 ID 동일 404, 본문(객체·배열·원시값·비JSON)·쿼리 400, 동시 중단 5건, 인증 오류, 목록 조회 DB 오류 500.
- `test/db/share-link-issuance.test.cjs`: 마이그레이션한 스키마·외래 키, 발급 판정(중단·만료 제외, 만료 경계, 동시 발급, 회원별 직렬화, 잠금 대기 중 만료, 롤백).
- 단위: `test/share-create*.test.cjs`, `test/link-*.test.cjs`, `test/share-link-state.test.cjs`, `test/share-links-config.test.cjs`.
