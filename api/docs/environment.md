# api 환경변수

api가 읽는 환경변수 목록이다. 설치, `.env` 준비, 값의 우선순위(터미널 환경이 `.env`보다 먼저), 비밀값 취급은 [api README 「설치와 환경변수」](../README.md#설치와-환경변수)를 따른다. 새 환경변수는 이 표에 더한다.

표의 「로컬 DB 준비」·「DB 테스트」는 [api README](../README.md)의 절이다.

| 구분 | 이름   | 기본값 | 의미                             |
| ---- | ------ | ------ | -------------------------------- |
| 선택 | `PORT` | `3001` | HTTP 포트. 정수 `1~65535`만 허용 |
| 선택 | `CORS_ALLOWED_ORIGINS` | 없음(CORS 꺼짐) | 교차 출처 호출을 허용할 web 출처. 쉼표로 구분하고 `http://localhost:3000`처럼 출처와 정확히 같아야 한다(`*`·경로·끝 슬래시 불가, 잘못되면 기동 실패). CORS는 `NODE_ENV=development`·`test`에서만 사용하며 운영·미지정·그 밖 환경에서는 목록을 비워야 한다(#250 동일 출처 결정). 허용 요청 헤더는 `Authorization`·`Content-Type`·`Idempotency-Key`·`X-Link-Grant`, 노출 응답 헤더는 `Retry-After`, 정확한 개발 허용 출처에는 쿠키(credentials)를 허용한다. 갱신·로그아웃은 별도의 AUTH_WEB_ORIGIN 검사도 수행한다([세션 안내](auth-sessions.md)) |
| 선택 | `TRUST_PROXY_CIDRS` | 없음(프록시 신뢰 안 함) | 신뢰할 프록시(부하분산기)의 IP 또는 CIDR, 쉼표로 구분. 이 프록시가 붙인 `X-Forwarded-For`로만 요청 주소(`request.ip`)를 정하고, 없으면 직접 연결 주소를 쓴다. 이름·`true`·홉 수·전체 대역(`/0`)·잘못된 값은 기동 실패. 수신자 비밀번호 시도 제한이 이 주소로 세므로 배포에서는 부하분산기 대역만 넣는다(넓게 열면 주소를 꾸며 제한을 피할 수 있다). Express에서 `request.hostname`·`request.protocol` 해석에도 쓰인다([docs/share-links.md](share-links.md)) |
| 선택 | `BIND_HOST` | `127.0.0.1` | HTTP 바인딩 주소. IP 주소만 허용하고 `localhost` 같은 이름은 기동 실패. `0.0.0.0`은 같은 네트워크의 다른 기기에서도 접속되므로 컨테이너 등 필요할 때만 쓴다 |
| 필수 | `AUTH_JWT_SECRET` | 없음 | 안전한 난수 32바이트를 64자리 hex로 표현한 서명 키. 환경별로 별도 준비 |
| 필수 | `AUTH_ACCESS_TOKEN_TTL_SECONDS` | 없음 | Access JWT 수명(초). #250 팀장 결정에 따라 정확히 `900`이어야 하며 다른 값은 기동 실패 |
| 운영 필수 | `AUTH_WEB_ORIGIN` | 개발·test만 `http://localhost:3000` | 갱신·로그아웃에서 허용할 정확한 단일 Origin. 운영은 HTTPS·web/API 동일 출처. 개발·test만 loopback HTTP 허용(이때만 쿠키 Secure 생략). wildcard·경로·끝 슬래시·계정 정보는 기동 실패. Domain 생략·Strict 고정([세션 안내](auth-sessions.md)) |
| 선택 | `DEV_LOGIN_ENABLED` | 비활성 | 정확히 `true`이고 `NODE_ENV`가 `development` 또는 `test`일 때만 개발 로그인 허용 |
| 선택 | `GOOGLE_LOGIN_ENABLED` | 비활성 | 정확히 `true`일 때 Google 로그인 활성화. 미지정·공란·`false`는 비활성이며 다른 값은 기동 실패. 아래 세 설정은 활성화할 때 필수([Google 로그인 안내](google-login.md)) |
| 활성화 시 필수 | `GOOGLE_CLIENT_ID` | 없음 | 등록한 웹 OAuth 클라이언트 ID. `.apps.googleusercontent.com` 형식을 검사하며 누락·잘못된 값이면 기동 실패 |
| 활성화 시 필수 | `GOOGLE_CLIENT_SECRET` | 없음 | 같은 클라이언트의 비밀값. 비어 있거나 공백·제어문자가 있으면 기동 실패. 환경별로 안전하게 보관하고 Git·로그·PR에 기록하지 않음 |
| 활성화 시 필수 | `GOOGLE_REDIRECT_URI` | 없음 | Google에 등록한 콜백과 정확히 같은 절대 URL. HTTPS가 필요하며 `NODE_ENV=development` 또는 `test`에서는 loopback HTTP도 허용. 계정 정보·query·fragment 또는 정규화 시 달라지는 값은 거부. [앱 등록·로컬 설정](google-login.md#개발용-앱-등록과-설정) 참조 |
| 선택 | `GITHUB_CONNECTION_ENABLED` | 비활성 | 정확히 `true`일 때 실제 GitHub 연결 활성화. 미지정·공란·`false`는 비활성이며 다른 값은 기동 실패. 아래 다섯 설정은 활성화할 때 필수([GitHub 연결 안내](github-connection.md)) |
| 활성화 시 필수 | `GITHUB_OAUTH_CLIENT_ID` | 없음 | 등록한 GitHub OAuth App Client ID. 영문·숫자·밑줄·하이픈 1~128자이며 누락·형식 오류는 기동 실패 |
| 활성화 시 필수 | `GITHUB_OAUTH_CLIENT_SECRET` | 없음 | 같은 앱의 Client secret. 공백·제어문자 없는 ASCII 1~512자. 로컬 .env 또는 배포 비밀 관리 수단에만 보관하고 Git·로그·PR에 기록하지 않음 |
| 활성화 시 필수 | `GITHUB_OAUTH_CALLBACK_URL` | 없음 | GitHub 앱에 등록한 콜백 URL. HTTPS가 필요하며 공통 `isDevelopmentOrTest`에 따라 정확히 `development`·`test`일 때만 localhost·127.0.0.1·::1의 HTTP 허용. 미지정·공란·다른 환경은 HTTP 거부. 계정 정보·query·fragment도 거부 |
| 활성화 시 필수 | `GITHUB_CREDENTIAL_DIRECTORY` | 없음 | 루트가 아닌 절대 경로의 전용 영속 보관 디렉터리. 토큰 암호문만 보관하며 Git 추적 밖에 두고 서비스 계정의 읽기·쓰기 권한과 운영 보관 준비를 확인 |
| 활성화 시 필수 | `GITHUB_CREDENTIAL_ENCRYPTION_KEY` | 없음 | 별도 난수 32바이트를 64자리 hex로 표현한 AES-256-GCM 키. `AUTH_JWT_SECRET`·`LINK_GRANT_SECRET`과 같으면 기동 실패. 기존 암호문을 쓸 때 같은 키를 유지하며 키 불일치가 확인된 연결은 재연결 필요로 전환 |
| 선택 | `WORKER_CONTEXT_ENABLED` | 비활성 | 정확히 `true`이고 별도 서비스 키가 유효하면 제품 main이 실제 DB 선정 공급자와 worker 전용 내부 조회 경로를 등록. 미지정·공란·`false`는 모듈 미등록, 다른 값은 기동 실패. LIVE 접수·큐를 켜는 설정은 아님([내부 조회 안내](worker-context.md)) |
| 활성화 시 필수 | `WORKER_CONTEXT_API_KEY` | 없음 | 안전한 별도 난수 32바이트의 64자리 hex. worker의 X-Worker-Key와 일치해야 하며 AUTH_JWT_SECRET·LINK_GRANT_SECRET·GITHUB_CREDENTIAL_ENCRYPTION_KEY와 같거나 형식이 틀리면 환경과 관계없이 기동 실패. Git·로그·일반 응답에 기록하지 않음 |
| 선택 | `DEV_ANALYSIS_INJECTION_ENABLED` | 비활성 | 분석 주입 모듈을 조립한 경우에만 사용. 정확히 `true`이고 `NODE_ENV`가 `development` 또는 `test`여야 허용. 이 설정만으로 HTTP 경로가 생기지 않음 |
| 선택 | `NODE_ENV` | 미지정 | 개발 로그인은 정확히 `development` 또는 `test`에서만 허용. 미지정·공란·그 밖의 값은 플래그가 켜져 있어도 거부. 같은 기준으로 http 주소도 `development`·`test`에서만 받으므로, 그 밖(미지정 포함)에서는 `SHARE_LINK_WEB_BASE_URL`에 https 주소가 필요하고 `CORS_ALLOWED_ORIGINS`가 비어 있지 않으면 기동 실패(#250). `LINK_GRANT_SECRET`의 임시 키도 `development`·`test`에서만 만들므로, 그 밖(미지정 포함)에서는 키가 없으면 기동 실패(#242). 운영 배포에서는 반드시 `production`, 로컬 개발은 `.env.example`처럼 `development`로 둔다. HSTS 헤더도 같은 기준으로 `development`·`test`가 아니면 붙는다 |
| 운영 필수 | `LINK_GRANT_SECRET` | `NODE_ENV`가 `development`·`test`일 때만 실행마다 임시 키 | 비밀번호 링크 열람 증표(grant) 서명 키. 32바이트 무작위 값의 64자리 hex이며 `AUTH_JWT_SECRET`과 달라야 한다. 없거나 빈 값이면 `development`·`test`에서만 임시 키를 만들고(재시작하면 수신자가 비밀번호를 다시 입력), 그 밖(`production`·미지정 포함)에서는 기동 실패(#242). 형식이 틀리면 환경과 관계없이 기동 실패 |
| 운영 필수 | `SHARE_LINK_WEB_BASE_URL` | `NODE_ENV`가 `development`·`test`일 때만 `http://localhost:3000` | 공유 링크 `url`(`<이 값>/s/<token>`)을 만들 web 주소. http 주소는 `NODE_ENV`가 `development`·`test`일 때만 받고, 그 밖(`production`·미지정 포함)에서 없거나 http이면 기동 실패(#218). http(s)가 아니거나 쿼리·조각·계정 정보가 있어도 기동 실패. CORS 허용 출처와 따로 둔다 |
| 필수 | `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | 없음 | 개발 DB 접속. 로컬 값은 「로컬 DB 준비」의 `docker run`과 `.env.example`이 같다. `DB_PORT`는 정수 `1~65535` |
| 선택(큐 연결을 켤 때 필수) | `CATCHU_QUEUE_REDIS_URL` | 없음(큐 모듈 조립 안 함) | 분석 큐 서버 주소(#233, worker와 같은 이름). 없거나 비면 큐 모듈을 조립하지 않는다. 있으면 제품 main이 큐 연결을 조립해 `listen` 뒤 시작하고, 틀리면 기동 실패. `NODE_ENV`가 `development`·`test`면 `redis://`·`rediss://`, 그 밖(미지정 포함)은 비밀번호가 든 `rediss://`만 받는다. 대문자 접두사·질의 문자열·`#`·풀리지 않는 퍼센트 인코딩·DB 번호 밖 경로(끝 슬래시만 있는 주소, `/1/../0`처럼 정규화하면 DB 번호가 되는 경로 포함, worker와 같게 원문으로 판정)는 거부. 주소 전체를 비밀값으로 다루고 Git·로그·PR에 남기지 않는다([큐 연결](analysis-queue.md#설정)) |
| 선택 | `CATCHU_QUEUE_PREFIX` | `catchu` | 큐 키 접두사. worker와 같아야 한다. 영문·숫자·`_`·`-` 64자 이하(첫 글자 영문·숫자), 틀리면 큐 모듈 설정 오류 |
| 선택(백그라운드 AI 실행에 필요) | `CATCHU_QUEUE_REDIS_URL`·`CATCHU_QUEUE_PREFIX`(AiRun) | 위와 같음 | 12월 intent U2 AiRun(큐 `ai-run`)도 같은 두 값을 읽는다(새 이름 없음). 주소가 없으면 AiRun은 연결하지 않고 모든 등록이 `ENQUEUE_FAILED`, 실행 상태는 처리 시한으로 FAILED가 된다([AiRun](ai-run.md)) |
| 운영 필수 | `CATCHU_EMBEDDING_API_KEY` | 없음 | 12월 intent U3 발행본 색인·검색의 Voyage AI 키. api 기동 때 판정한다: 있으면 Voyage, 없으면 `NODE_ENV`가 `development`·`test`일 때만 합성 제공자(경고 `EMBEDDING_PROVIDER_SYNTHETIC`), 그 밖(`production`·미지정 포함)에서는 기동 실패(#431). 앞뒤 공백만 있으면 없음으로 본다. Git·로그·PR에 남기지 않는다([발행본 색인·검색](published-index.md)) |
| 선택 | `CATCHU_GENERATION_API_KEY` | 없음 | 12월 intent AI 생성 게이트의 Claude API 키(U1·U2). 없으면 api는 기동하고 게이트를 부를 때 `AiProviderError(CALL_FAILED/NOT_CONFIGURED)`로 끝난다. Git·로그·PR에 남기지 않는다([AI 생성 게이트](ai-generation.md)) |
| 선택(탈퇴·파일 저장에 필요) | `FILE_STORAGE_DRIVER` | 없음 | 12월 intent U2 파일 저장 드라이버. 지금은 `local`만 받는다(`s3`는 U8). 이 값과 아래 값이 둘 다 없거나 빈 문자열이면 api는 기동하고 파일 저장의 모든 호출이 `StorageUnavailable`(탈퇴는 2단계에서 500). 한쪽만 있거나 모르는 값이면 기동 실패([파일 저장](file-storage.md)) |
| 선택(탈퇴·파일 저장에 필요) | `FILE_STORAGE_LOCAL_ROOT` | 없음 | `local` 드라이버의 뿌리 폴더. 이미 있는 폴더의 절대 경로여야 하며 상대 경로·없는 폴더는 기동 실패. 오류에 경로 값을 넣지 않는다. 개발 서버에는 U2 코드를 올리기 전에 두 값을 넣는다 |
| 선택 | `CATCHU_TEST_REDIS_URL` | 없음(큐 시험 건너뜀) | `npm test`의 실제 Valkey 시험이 쓰는 큐 주소. 있으면 시험이 반드시 돌고 닿지 않으면 실패한다. 실행기가 `.env`에서 넘기지 않으므로 셸 환경변수로 준다(CI는 `redis://127.0.0.1:6379`) |
| 선택 | `TEST_COVERAGE_INCLUDE` | `dist/**` | `npm run test:coverage`가 표에 넣을 범위(glob). Unit 폴더(예: `dist/share-links/**`)만 넣으면 맨 아래 비율이 그 Unit의 값이다. 실행기가 `.env`에서 넘기지 않으므로 셸 환경변수로 준다([README 「검사와 빌드 후 실행」](../README.md#검사와-빌드-후-실행)) |
| 선택 | `TEST_DB_HOST` / `TEST_DB_PORT` / `TEST_DB_USER` / `TEST_DB_PASSWORD` / `TEST_DB_NAME` | `127.0.0.1` / `5433` / `catchu` / `catchu_local` / `catchu_test` | `npm test`가 쓰는 테스트 DB(「DB 테스트」). 이름은 `_test`로 끝나야 함 |
