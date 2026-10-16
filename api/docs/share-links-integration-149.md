# #149 병합 후 링크 발급 통합 검증

병합된 #239 입력 길이 검사, #226 발급 화면, #247 web 429 대기, #236 서버 발급 제한을 연결해 확인하는 실행 안내다. 실행 결과는 이 문서에 두지 않고 검증한 PR에 판본별로 기록한다(아래 「결과 기록 방법」, 첫 기록은 [PR #266](https://github.com/JminAILab/CatchU/pull/266)).

## 검증 범위

- 자동 검사: 실제 Nest HTTP·PostgreSQL에 web의 상태 저장소·API 호출·응답 해석을 연결한다. 응답 본문 해석 실패만 의도적으로 주입한다.
- 수동 브라우저: 일반 브라우저·web 개발 서버·응답 유실 중계 도구·전용 PostgreSQL로 실제 응답 유실과 429를 재현한다.
- 범위 밖: React DOM 버튼 속성·매초 타이머의 자동 검사, 배포 환경, 실제 Google 로그인, 실제 사용자 자료, L01 공개 자료 요약 연결. `/links` 완전 이탈·새로고침 뒤 요청 보존은 기존 제품 범위가 아니다. 이 검증 통과를 #149 전체 완료로 판정하지 않는다.

## 자동 검사: 실제 web 상태 코드 + HTTP + PostgreSQL

`test/db/share-links-web-integration.test.cjs`는 실제 Nest 앱을 임시 포트에서 띄우고 web의 상태 저장소·API 호출·응답 해석을 그대로 호출한다. React 렌더링이나 실제 브라우저 검사는 아니다. 서버 발급 후 201 응답을 불완전한 JSON Response로 교체해 본문 해석 실패를 주입한다. 실제 소켓 절단은 수동 중계 도구로 확인한다. 제한 값·서버 시계·DB를 모의로 교체하지 않는다.

- 최초 429 → 실제 Retry-After 대기 → 같은 키·본문으로 신규 201, DB 각 1건.
- 201 응답 본문 해석 실패 → 재전송 429 → 대기 중 제출 차단·목록 닫기/다시 열기 → 자동 요청 없음 → 같은 키·본문으로 200, 동일 링크, DB 각 1건.
- 최초 429 → 폼 닫기·새 작성 → 대기 유지·제출 차단 → 만료 뒤 자동 요청 없음 → 새 키·수정 본문으로 201, DB 각 1건.
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

실제 1분 대기 세 번이 포함되어 약 3분 이상 걸린다. 수동 자료를 보존할 때는 별도로 만든 `catchu_149_regression_test`를 TEST_DB_NAME으로 지정한다. 일반 `npm test`도 이 파일을 찾는다. 실행 중 `MODULE_TYPELESS_PACKAGE_JSON` 경고는 web TypeScript 모듈을 Node가 ES module로 다시 해석했다는 안내이며 검사 실패가 아니다.

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

`http://localhost:3000/login?next=%2Flinks`에서 개발 식별 문자열 `verify-149-manual`로 로그인한다. 토큰은 메모리에만 있으므로 로그인 후 주소창 이동이나 새로고침 대신 화면 버튼으로 이동한다. CORS 허용 출처인 localhost:3000을 사용한다. 도구 시작마다 새 합성 회원을 사용한다. 도구를 재시작하면 브라우저도 새로고침하고 다시 로그인한다. `ready`의 DB 건수를 기준값으로 적는다. JSON 로그에는 HTTP 상태·헤더·키/본문 동일 여부·링크 동일 여부·DB 전체 건수만 남긴다. 토큰·비밀번호·키·본문 원문은 출력하지 않는다. 전용 DB에서 다른 작업을 동시에 하지 않는다.

도구가 실패하면 요청 처리 중에는 `"kind":"verification-error"`, 시작 중에는 `"kind":"startup-error"`, 종료 정리 중에는 `"kind":"cleanup-error"` JSON 한 줄을 남긴다. `stage`(실패 단계)와 `reason`(허용 목록의 오류 코드·오류 이름, 또는 `too-large`·`unexpected-status`·`invalid-json`·`unknown`)으로 원인을 구분하고 `action` 안내를 따른다. 상태 코드가 원인이면 `status`도 남긴다. 예외 원문·토큰·비밀번호·멱등 키·요청 본문·SQL은 출력하지 않는다.

### 응답 불명 → 429 → 기존 결과 복구

1. 새로 시작한 도구의 창 1에 `loss`를 입력한다. 새 링크에 제목과 합성 비밀번호를 넣어 발행한다.
2. 도구가 동일 회원의 입력 오류 9회를 실제 API로 보낸 뒤 10번째 요청을 정상 발급한다. 201 헤더 뒤 본문을 끊는다. 브라우저는 응답 불명이어야 한다. 로그: `status:201`, `dropped:true`, DB 기준값 대비 링크/멱등 기록 각각 +1.
3. 바로 [다시 발행]을 누른다. 로그: 실제 `429`, `RATE_LIMITED`, 정수 `retryAfter`, `cacheControl:no-store`, `sameKey:true`, `sameBody:true`. DB는 그대로다.
4. 대기 중 입력·재발행이 잠기는지 확인한다. [목록에서 확인] → [요청 다시 보기]로 왕복해도 대기가 유지되어야 한다. 발급 요청 로그가 추가되지 않아야 한다.
5. 시간이 지나도 자동 요청은 없어야 한다. [다시 발행]을 누르면 `200`, `sameKey:true`, `sameBody:true`, `sameLink:true`, DB 변화 없음, 화면은 발행 완료다.

### 최초 429 → 신규 발급

도구 재시작·새로 로그인 후 창 1에 `429`를 입력한다. 10회의 실제 입력 오류 뒤 첫 발급을 보내므로 429가 발생하며 DB 증가가 없어야 한다. 화면을 닫지 않고 기다렸다 [다시 발행]하면 같은 키·본문의 201과 DB 각 +1이어야 한다. 최초 429는 앞선 불명 시도가 없으므로 폼을 닫으면 요청은 놓고 대기만 유지한다. 이 경우 다시 작성한 요청은 새 키가 맞다.

### 입력 경계·비밀번호 수정

도구를 재시작·다시 로그인하고 `normal` 상태에서 수행한다. 각 사례의 비교를 새로 시작하려면 첫 오류 요청 전에 창 1에 `normal`을 입력한다. sameKey/sameBody는 모드 설정 이후 첫 요청과 비교하며 직전 요청과의 비교가 아니다. 비교를 초기화하지 않았다면 DevTools의 오류 POST와 성공 POST 각각에서 Headers → Request Headers → Idempotency-Key를 비교한다. Keep log를 유지하고 요청 목록의 Name을 클릭해 상세를 연다. Authorization은 공유하지 않는다. 400도 발급 빈도에 포함되므로 사례 사이 60초 대기 또는 도구 재시작·새로 로그인을 사용한다.

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

## 판정 기준

- 각 절의 기대 HTTP·화면·DB 변화와 모두 일치하면 통과다. 하나라도 다르면 실패로 기록하고 기대값을 바꾸지 않는다.
- 자동 검사 통과는 web 상태 코드·HTTP·DB 연결의 근거이며 React 화면·타이머 렌더링의 근거가 아니다.
- 수동 관측에서 정지 화면만으로 정확한 대기 시간·클릭 시점을 입증하지 않는다. DB 건수는 중계 도구의 조회와 위 독립 SQL 조회를 구분한다.

## 결과 기록 방법

결과는 검증한 PR 본문 한 곳에 판본별로 남기고, 변경 없이 검증만 했으면 관련 PR 또는 #149 댓글 한 곳에 남긴다. 다른 문서에서는 그 기록을 링크한다([코딩 절차 「검사 선택과 결과 보고」](../../docs/CatchU_coding_procedures.md#검사-선택과-결과-보고)). 다른 판본의 결과와 합치지 않는다.

사용자 실행 기록에는 날짜·`git rev-parse HEAD`·미커밋 변경 포함 여부·테스트별 통과/실패·안전한 JSON 로그·DB 전후 건수·브라우저 상태를 함께 남긴다. DevTools 요청 본문/Authorization/발급 URL을 그대로 공유하지 않는다.

- 기준 dev와 실행 위치·명령·TEST_DB 이름(비밀번호 제외)을 함께 적는다.
- 결과는 통과·실패·실행하지 못함·해당 없음으로 구분하고, 실패하면 테스트 이름·오류를 남긴다.
- 직접 조작한 관측과 다른 사람이 제공한 화면·로그의 검토를 구분한다.
