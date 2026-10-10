# #149 병합 후 링크 발급 통합 검증

## 기준과 판정

2026-10-09 원격 조회 기준 `dev`는 `3b025df9ba5c2d5285a4cacd28382e7a3fd45a28`다. 아래 병합 커밋이 모두 이 커밋의 조상임을 `git merge-base --is-ancestor`로 확인했다.

| PR | 병합 시각(KST) | 병합 커밋 |
|---|---|---|
| #239 | 10-07 09:09 | `ef6dd714` |
| #226 | 10-07 15:01 | `ac671ea3` |
| #247 | 10-07 21:33 | `2c7f70a8` |
| #236 | 10-08 14:22 | `43370e02` |

7일의 선행 판본 검증과 최종 dev 통합 검증은 다르다. #236은 8일 병합됐으므로 최종 통합 검증이 필요하다. 새 검사는 위 dev에 로컬 검증 코드를 더한 판본이다. 원격 이슈·PR은 변경하지 않았다. L01 공개 자료 요약 연결은 이번 범위 밖이며 #149 전체 완료로 판정하지 않는다.

## 자동 검사: 실제 web 상태 코드 + HTTP + PostgreSQL

`test/db/share-links-web-integration.test.cjs`는 실제 Nest 앱을 임시 포트에서 띄우고 web의 상태 저장소·API 호출·응답 해석을 그대로 호출한다. React 렌더링이나 실제 브라우저 검사는 아니다. 응답 유실만 성공한 HTTP 응답을 소비한 뒤 예외를 내는 방식으로 주입한다. 제한 값·서버 시계·DB를 모의로 교체하지 않는다.

- 최초 429 → 실제 Retry-After 대기 → 같은 키·본문으로 신규 201, DB 각 1건.
- 201 응답 유실 → 재전송 429 → 대기 중 제출 차단·목록 닫기/다시 열기 → 자동 요청 없음 → 같은 키·본문으로 200, 동일 링크, DB 각 1건.
- 제목 51→50, 비밀번호 7→8·65→64 수정: 400 뒤 필드 안내, DB 변화 없음, 새 키로 201. 비밀번호 생략 시 본문에 필드가 없고 DB 보호값도 null.

Docker Desktop을 시작한 뒤 전용 테스트 DB를 준비한다. 자동 검사는 테스트마다 테이블을 초기화하므로 기존 개발 DB와 공유하지 않는다. 수동 브라우저 검사와 동시에 돌리지 않는다.

```powershell
# 저장소 루트에서 처음 한 번. 이미 만들었으면 docker start catchu-149-db
docker run --name catchu-149-db -e POSTGRES_USER=catchu -e POSTGRES_PASSWORD=catchu_local -e POSTGRES_DB=catchu_149_test -p 127.0.0.1:5433:5432 -d postgres:16
docker exec catchu-149-db pg_isready -U catchu -d catchu_149_test

Set-Location api # 저장소 루트 기준
npm.cmd ci
$env:TEST_DB_HOST='127.0.0.1'
$env:TEST_DB_PORT='5433'
$env:TEST_DB_USER='catchu'
$env:TEST_DB_PASSWORD='catchu_local'
$env:TEST_DB_NAME='catchu_149_test'
npm.cmd test -- test/db/share-links-web-integration.test.cjs
```

실제 1분 대기 두 번이 포함되어 약 2분 이상 걸린다. 일반 `npm test`도 이 파일을 찾는다. 실패하면 테스트 이름·오류와 실행 HEAD를 남긴다.

## 수동 브라우저: 실제 응답 유실과 429

자동 검사 종료 후 다음을 각각 별도 PowerShell 창에서 실행한다. 도구는 전용 로컬 `catchu_149_test`만 사용하며 테이블을 지우지 않는다. 포트는 중계 3431, web 3000이다. 기존 서버가 사용 중이면 먼저 본인이 띄운 서버를 종료한다.

```powershell
# 창 1: 저장소 루트에서
Set-Location api
npm.cmd run build
node scripts/verify-share-links-browser.cjs
```

```powershell
# 창 2: 저장소 루트에서
Set-Location web
npm.cmd ci
$env:NEXT_PUBLIC_API_BASE_URL='http://127.0.0.1:3431'
$env:NEXT_PUBLIC_DEV_LOGIN_ENABLED='true'
npm.cmd run dev
```

`http://localhost:3000`에서 개발 로그인 후 `/links`로 이동한다. 도구 시작마다 새 합성 회원을 사용한다. 도구를 재시작하면 브라우저도 새로고침하고 다시 로그인한다. `ready`의 DB 건수를 기준값으로 적는다. JSON 로그에는 HTTP 상태·헤더·키/본문 동일 여부·링크 동일 여부·DB 전체 건수만 남긴다. 토큰·비밀번호·키·본문 원문은 출력하지 않는다. 전용 DB에서 다른 작업을 동시에 하지 않는다.

### 응답 불명 → 429 → 기존 결과 복구

1. 새로 시작한 도구의 창 1에 `loss`를 입력한다. 새 링크에 제목과 합성 비밀번호를 넣어 발행한다.
2. 도구가 동일 회원의 입력 오류 9회를 실제 API로 보낸 뒤 10번째 요청을 정상 발급한다. 201 헤더 뒤 본문을 끊는다. 브라우저는 응답 불명이어야 한다. 로그: `status:201`, `dropped:true`, DB 기준값 대비 링크/멱등 기록 각각 +1.
3. 바로 [다시 발행]을 누른다. 로그: 실제 `429`, `RATE_LIMITED`, 정수 `retryAfter`, `cacheControl:no-store`, `sameKey:true`, `sameBody:true`. DB는 그대로다.
4. 대기 중 입력·재발행이 잠기는지 확인한다. [목록에서 확인] → [요청 다시 보기]로 왕복해도 대기가 유지되어야 한다. 발급 요청 로그가 추가되지 않아야 한다.
5. 시간이 지나도 자동 요청은 없어야 한다. [다시 발행]을 누르면 `200`, `sameKey:true`, `sameBody:true`, `sameLink:true`, DB 변화 없음, 화면은 발행 완료다.

### 최초 429 → 신규 발급

도구 재시작·새로 로그인 후 창 1에 `429`를 입력한다. 10회의 실제 입력 오류 뒤 첫 발급을 보내므로 429가 발생하며 DB 증가가 없어야 한다. 화면을 닫지 않고 기다렸다 [다시 발행]하면 같은 키·본문의 201과 DB 각 +1이어야 한다. 최초 429는 앞선 불명 시도가 없으므로 폼을 닫으면 요청은 놓고 대기만 유지한다. 이 경우 다시 작성한 요청은 새 키가 맞다.

### 입력 경계·비밀번호 수정

도구를 재시작·다시 로그인하고 `normal` 상태에서 수행한다. 각 사례의 비교를 새로 시작하려면 창 1에 `normal`을 입력한다. 400도 발급 빈도에 포함되므로 사례 사이 60초 대기 또는 도구 재시작·새로 로그인을 사용한다.

| 입력 → 수정 | 기대 HTTP/화면/DB |
|---|---|
| 제목 `가` 51자 → 50자, 비밀번호 사용 해제 | 400 제목 안내 → 201, 수정 시 새 키, DB 제목 길이 50·보호값 null |
| 비밀번호 `p` 7자 → 8자 | 400 비밀번호 안내 → 201, 수정 시 새 키·보호값 존재 |
| 비밀번호 `p` 65자 → 64자 | 400 비밀번호 안내 → 201, 수정 시 새 키·보호값 존재 |

400에서 DB 증가가 없어야 한다. 발급 성공 뒤 비밀번호 입력이 지워지는지 확인한다. 같은 회원의 유효 링크 5개 제한과 혼동하지 않도록 새 도구 세션으로 분리한다.

DB 독립 확인(원문·해시·URL·토큰을 출력하지 않음):

```powershell
docker exec catchu-149-db psql -U catchu -d catchu_149_test -c "SELECT count(*) FROM share_link; SELECT count(*) FROM idempotency_record; SELECT char_length(title) AS title_length, password_protection_reference IS NOT NULL AS protected FROM share_link ORDER BY issued_at DESC LIMIT 5;"
```

목록 왕복은 `/links` 안에서 폼을 닫았다 여는 조작이다. 다른 경로 이동·새로고침·회원 변경 시 요청/비밀번호를 지우는 기존 동작까지 보존 대상으로 바꾸지 않는다.

## 직접 확인과 미실행 기록

2026-10-09 로컬 직접 확인:

- 통과: 원격 dev SHA, 네 PR의 MERGED 상태·병합 시각, dev 조상 포함 검사.
- 통과: 기존 web `node --test test/share-links.test.mjs test/api-client.test.mjs` 56/56. 응답/시계 모의 기반이며 실제 브라우저·DB 성공 근거가 아니다.
- 통과: 신규 두 JavaScript 파일 `node --check` 문법 검사.
- 통과: API `npm run lint`, `npm run typecheck`, `npm run build`. 최초 빌드는 의존성 미설치로 tsc를 찾지 못했으나 `npm ci --ignore-scripts --cache .npm` 후 해소됐다. 잠금 파일·의존성 버전은 바꾸지 않았다.
- 통과: 자동 검사에서 사용하는 네 web 모듈의 Node 직접 import, `git diff --check`.
- 최초 환경 실패(아래 재실행으로 해소): `node scripts/test-with-db.cjs test/db/share-links-web-integration.test.cjs`는 테스트 본문 실행 전에 `ECONNREFUSED 127.0.0.1:5433`으로 중단됐다. 당시 Docker 엔진 파이프도 없었다. 수동 도구 역시 DB 없는 환경에서 실패 종료됨을 확인했다.

### Docker 시작 후 재실행 — 2026-10-09 10:39~10:49 KST

판본은 동일한 `3b025df9ba5c2d5285a4cacd28382e7a3fd45a28` + 이 문서·검증 코드의 미커밋 변경이다. Docker 시작 뒤 전용 `catchu-149-db` 컨테이너(PostgreSQL 16, 로컬 5433, `catchu_149_test`)를 만들었다. 마이그레이션 5개 적용. 기존 개발 DB·다른 컨테이너는 변경하지 않았다.

**자동 통합 검사 통과:** 위 TEST_DB 설정으로 `api/`에서 `npm.cmd test -- test/db/share-links-web-integration.test.cjs` 실행. 빌드 성공, 3/3 통과, 실패·건너뜀 0, 약 126.5초. 최초 429 뒤 신규 발급, 응답 유실 뒤 429/기존 링크 복구, 입력 경계·비밀번호 수정/저장 검증 모두 실제 HTTP·PostgreSQL로 확인했다. React 브라우저 검증은 아래 별도 실행이다.

**실제 브라우저 통과:** Next 개발 서버 + 실제 Nest 앱 + 전용 PostgreSQL + 응답 유실 중계 도구. Codex 브라우저에서 개발 로그인·`/links` 폼을 조작했다. 외부 Google 로그인·worker·배포 환경은 사용하지 않았다. 합성 회원·비밀번호만 사용했다. 429는 실제 서버 정책이며 성공 응답 본문 유실만 의도적으로 주입했다.

| 시각(KST)·조작 | 실제 HTTP/화면 | DB 링크/멱등 기록 |
|---|---|---|
| 10:46:01 발급 | 201을 서버가 처리한 뒤 본문 유실, 화면은 발급 불명 | 기준 3/3 → 4/4 |
| 10:46:18 다시 발행 | 429 RATE_LIMITED, Retry-After 44, no-store, 키·본문 동일, 입력·재전송 잠김 | 4/4 유지 |
| 대기 중 목록→요청 다시 보기 | 대기·버튼 비활성 유지. 시간이 지나도 자동 POST 없음 | 독립 SQL 조회도 4/4 |
| 10:47:12 다시 발행 | 200, 최초와 키·본문·linkId 동일, 발행 완료 화면 | 4/4 유지 |
| 10:47:44 제목 51자 → 10:47:51 50자 | 400 VALIDATION_FAILED 제목 안내 → 새 키로 201, 비밀번호 없음 | 4/4 → 5/5 |
| 10:48:04 비밀번호 7자 → 10:48:10 8자 | 400 비밀번호 길이 안내 → 새 키로 201 | 5/5 → 6/6 |
| 10:48:23 비밀번호 65자 → 10:48:37 64자 | 400 비밀번호 길이 안내 → 새 키로 201 | 6/6 → 7/7 |

독립 SQL 조회에서 최종 7/7, 최근 4건의 제목 길이/보호값 유무는 `(10,true), (9,true), (50,false), (12,true)`였다. 수정 비밀번호의 실제 검증 성공·거부된 이전 비밀번호의 검증 실패는 자동 통합 검사에서 확인했다. 최초 429→201 경로는 자동 검사에서 확인했으며 이번 브라우저 조작은 불명→429→200 경로를 확인했다.

실행 중 발견·보완한 사항:

- 수동 안내에 빠졌던 `NEXT_PUBLIC_DEV_LOGIN_ENABLED=true`를 추가했다. 제품 코드 결함은 아니다.
- Windows 샌드박스에서는 Next 경로 접근 오류와 브라우저→중계 서버 연결 실패가 있었다. 동일 로컬 검증 서버를 샌드박스 밖에서 실행해 해결했다. 제품 설정·인증 정책은 바꾸지 않았다.
- 수동 도구의 readline Ctrl+C에서도 서버 종료 처리가 호출되도록 SIGINT 처리기를 추가했다. 재시작 후 Ctrl+C로 exit 0 종료를 확인했고 변경 파일 lint·diff 검사도 통과했다.
- 화면 증거는 로컬 `output/issue149/completed.jpg`와 `retry-form.jpg`에 저장했다. URL·토큰이 없는 영역만 캡처했고 원격에 올리지 않았다.

**이번에도 미검증:** 배포 환경, 실제 Google 로그인, 실제 사용자 자료, L01 공개 자료 요약 연결. `/links` 완전 이탈·새로고침 후 요청 보존은 기존 제품 범위가 아니다. 따라서 이번 발급 통합 시나리오 통과와 #149 전체 완료는 구분한다.

검증용 API·web 서버는 종료했다. 전용 Docker DB와 합성 검증 자료는 사용자의 재실행을 위해 남겼다.

사용자 실행 기록에는 날짜·`git rev-parse HEAD`·미커밋 변경 포함 여부·테스트별 통과/실패·안전한 JSON 로그·DB 전후 건수·브라우저 상태를 함께 남긴다. DevTools 요청 본문/Authorization/발급 URL을 그대로 공유하지 않는다.

### PR 준비 재검사 — 2026-10-10

- 최신 원격 dev `5c2728c5ef192935ce70448f67d5b537012c55b7`가 작업 브랜치에 포함됨을 확인했다. 검사 판본은 `91b5edb07aeee5205b35dd9a822805a4e7be6d10` + 실행 안내의 저장소 기준 경로 수정이다. 검증 코드 자체는 이 커밋과 같다.
- API `npm.cmd run lint`, `npm.cmd run typecheck` 통과. `npm.cmd test -- test/db/share-links-web-integration.test.cjs test/db/share-links-api.test.cjs`는 빌드 포함 23/23 통과(약 150초, 실패·건너뜀 0).
- 기존 전용 컨테이너 `catchu-149-db`를 다시 시작하고 TEST_DB_*로 `127.0.0.1:5433/catchu_149_test`를 지정했다. 이 테스트 DB의 자료만 검사 과정에서 초기화했다.
- web `node --test test/share-links.test.mjs test/api-client.test.mjs` 56/56 통과.
- `git diff --check`와 저장소 문서 크기 검사 통과. Windows CRLF로 스크립트 직접 실행이 실패해 실행 스트림만 LF로 변환했다. 스크립트 파일은 바꾸지 않았다.
- 최신 판본의 실제 브라우저 검사는 이번에 반복하지 않았다. 위 10월 9일 브라우저 관측과 이번 실제 HTTP·DB 검증의 판본을 구분한다. 제품 코드에서 새 결함은 발견되지 않았다.
