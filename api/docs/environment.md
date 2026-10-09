# api 환경변수

api가 읽는 환경변수 목록이다. 설치, `.env` 준비, 값의 우선순위(터미널 환경이 `.env`보다 먼저), 비밀값 취급은 [api README 「설치와 환경변수」](../README.md#설치와-환경변수)를 따른다. 새 환경변수는 이 표에 더한다.

표의 「로컬 DB 준비」·「DB 테스트」는 [api README](../README.md)의 절이다.

| 구분 | 이름   | 기본값 | 의미                             |
| ---- | ------ | ------ | -------------------------------- |
| 선택 | `PORT` | `3001` | HTTP 포트. 정수 `1~65535`만 허용 |
| 선택 | `CORS_ALLOWED_ORIGINS` | 없음(CORS 꺼짐) | 교차 출처 호출을 허용할 web 출처. 쉼표로 구분하고 `http://localhost:3000`처럼 출처와 정확히 같아야 한다(`*`·경로·끝 슬래시 불가, 잘못되면 기동 실패). http 출처는 `NODE_ENV`가 `development`·`test`일 때만 받고, 그 밖(`production`·미지정 포함)에서 하나라도 있으면 기동 실패(#218). 허용 요청 헤더는 `Authorization`·`Content-Type`·`Idempotency-Key`·`X-Link-Grant`, 노출 응답 헤더는 `Retry-After`, 쿠키(credentials)는 허용하지 않는다. 운영 값은 OQ-A1에서 정한다(#106) |
| 선택 | `TRUST_PROXY_CIDRS` | 없음(프록시 신뢰 안 함) | 신뢰할 프록시(부하분산기)의 IP 또는 CIDR, 쉼표로 구분. 이 프록시가 붙인 `X-Forwarded-For`로만 요청 주소(`request.ip`)를 정하고, 없으면 직접 연결 주소를 쓴다. 이름·`true`·홉 수·전체 대역(`/0`)·잘못된 값은 기동 실패. 수신자 비밀번호 시도 제한이 이 주소로 세므로 배포에서는 부하분산기 대역만 넣는다(넓게 열면 주소를 꾸며 제한을 피할 수 있다). Express에서 `request.hostname`·`request.protocol` 해석에도 쓰인다([docs/share-links.md](share-links.md)) |
| 선택 | `BIND_HOST` | `127.0.0.1` | HTTP 바인딩 주소. IP 주소만 허용하고 `localhost` 같은 이름은 기동 실패. `0.0.0.0`은 같은 네트워크의 다른 기기에서도 접속되므로 컨테이너 등 필요할 때만 쓴다 |
| 필수 | `AUTH_JWT_SECRET` | 없음 | 안전한 난수 32바이트를 64자리 hex로 표현한 서명 키. 환경별로 별도 준비 |
| 필수 | `AUTH_ACCESS_TOKEN_TTL_SECONDS` | 없음 | Access JWT 수명(초). 양의 안전한 정수이며 현재 시각과 합산 가능해야 함 |
| 선택 | `DEV_LOGIN_ENABLED` | 비활성 | 정확히 `true`이고 `NODE_ENV`가 `development` 또는 `test`일 때만 개발 로그인 허용 |
| 선택 | `DEV_ANALYSIS_INJECTION_ENABLED` | 비활성 | 분석 주입 모듈을 조립한 경우에만 사용. 정확히 `true`이고 `NODE_ENV`가 `development` 또는 `test`여야 허용. 이 설정만으로 HTTP 경로가 생기지 않음 |
| 선택 | `NODE_ENV` | 미지정 | 개발 로그인은 정확히 `development` 또는 `test`에서만 허용. 미지정·공란·그 밖의 값은 플래그가 켜져 있어도 거부. 같은 기준으로 http 주소도 `development`·`test`에서만 받으므로, 그 밖(미지정 포함)에서는 `SHARE_LINK_WEB_BASE_URL`에 https 주소가 필요하고 `CORS_ALLOWED_ORIGINS`에 http 출처가 있으면 기동 실패(#218). 운영 배포에서는 반드시 `production`, 로컬 개발은 `.env.example`처럼 `development`로 둔다. HSTS 헤더도 같은 기준으로 `development`·`test`가 아니면 붙는다 |
| 운영 필수 | `LINK_GRANT_SECRET` | 개발·테스트는 실행마다 임시 키 | 비밀번호 링크 열람 증표(grant) 서명 키. 32바이트 무작위 값의 64자리 hex이며 `AUTH_JWT_SECRET`과 달라야 한다. `production`에서 없거나 형식이 틀리면 기동 실패 |
| 운영 필수 | `SHARE_LINK_WEB_BASE_URL` | `NODE_ENV`가 `development`·`test`일 때만 `http://localhost:3000` | 공유 링크 `url`(`<이 값>/s/<token>`)을 만들 web 주소. http 주소는 `NODE_ENV`가 `development`·`test`일 때만 받고, 그 밖(`production`·미지정 포함)에서 없거나 http이면 기동 실패(#218). http(s)가 아니거나 쿼리·조각·계정 정보가 있어도 기동 실패. CORS 허용 출처와 따로 둔다 |
| 필수 | `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | 없음 | 개발 DB 접속. 로컬 값은 「로컬 DB 준비」의 `docker run`과 `.env.example`이 같다. `DB_PORT`는 정수 `1~65535` |
| 선택 | `TEST_DB_HOST` / `TEST_DB_PORT` / `TEST_DB_USER` / `TEST_DB_PASSWORD` / `TEST_DB_NAME` | `127.0.0.1` / `5433` / `catchu` / `catchu_local` / `catchu_test` | `npm test`가 쓰는 테스트 DB(「DB 테스트」). 이름은 `_test`로 끝나야 함 |
