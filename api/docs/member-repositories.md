# 선정 지원 저장소 조회 — #136

`GET /v1/me/repositories`는 인증된 회원의 현재 연결에서 **선정 지원 공개 저장소**를 조회한다. [회원 API 계약](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml)의 저장소 목록과 [공통 응답 규격](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml)의 Repository·PageInfo를 따른다.

## 공급자와 응답

공급은 [#322 회원 구분](member-analysis.md#실제개발-회원-구분--322)으로 고른다. 실제 회원은 [#252 DB 선정 공급](repository-selection.md)을 받고, 개발 회원은 실제 GitHub 연결이 있어도 아래 개발 대역을 받는다. 미지원 출처는 `403 INTERNAL_ERROR`다.

개발 회원은 [#104 개발 연동 대역](member-analysis.md#개발-회원과-합성-github-연결)의 `DevMemberService.readConnection(인증된 memberId)`를 그대로 사용한다. 이 함수는 현재 회원에게 허용한 선정 목록을 제공하며, [#138 분석 접수](https://github.com/JminAILab/CatchU/issues/138)도 같은 공급자를 재사용해야 한다. 개발 대역은 실제 GitHub OAuth·네트워크 조회·접근권한 검증·분석 동의를 하지 않는다.

현재 대역은 [공용 합성 맥락](../../worker/fixtures/m1-synthetic/context.sample.json)의 저장소 한 개만 제공한다. 목록·페이지 응답에는 `sourceMode`·회원 ID·연결 참조·자격정보를 추가하지 않는다. 실제 연동으로 오인하지 않도록 이 안내와 개발 환경 설정으로 구분한다.

```json
{
  "items": [{
    "repositoryId": "synthetic-repo-0001",
    "name": "catchu-synthetic-repo",
    "ownerLogin": "catchu-synthetic-owner",
    "url": "https://example.invalid/catchu-synthetic-owner/catchu-synthetic-repo",
    "allowedScopeRevision": "00000000-0000-4000-8000-000000000201"
  }],
  "page": { "nextCursor": null }
}
```

이는 합성 응답 예시이며 실제 GitHub 저장소 조회 결과가 아니다.

## 페이지와 오류

- `limit`은 기본 20, 최소 1·최대 100이다. `cursor`·`limit` 이외의 필드와 중복 입력은 `400 VALIDATION_FAILED`, `details.violations`로 거부한다. 회원 ID를 입력받지 않고 기존 전역 Guard와 `@CurrentMemberId()`를 사용한다.
- 저장소 ID 오름차순으로 나누고 다음 위치를 `page.nextCursor`에 반환한다. 마지막 페이지와 정상 빈 목록은 `null`이다. 클라이언트는 커서 내부 형식을 해석하지 않는다.
- 커서는 회원·현재 목록 판본·마지막 저장소에 묶인 위치 표식이다. 다른 회원의 커서·잘못된 형식·바뀐 목록 또는 허용 범위의 커서는 `400 VALIDATION_FAILED`다. 처음 페이지부터 다시 조회한다. 커서 자체는 권한 증표가 아니며, 매 페이지에서 현재 연결과 선정 목록을 다시 읽는다.
- `DISCONNECTED`·`REAUTH_REQUIRED` 또는 연결 행 부재는 `403 GITHUB_CONNECTION_REQUIRED`다. 연결된 상태의 정상 0건만 `200`과 빈 `items`로 반환한다.
- 공급자·DB 조회 오류와 잘못된 공급 자료는 `500 INTERNAL_ERROR`로 전달한다. 실패를 빈 배열로 변환하지 않고 기존 전역 필터가 내부 원문·SQL·토큰 노출을 막는다. 성공·오류 모두 `Cache-Control: no-store`다.
- #104 이전의 문자열 회원 토큰은 `401 AUTH_INVALID`다. 개발 로그인으로 실제 회원 UUID 토큰을 다시 받아야 한다.
- 개발 대역은 `DEV_LOGIN_ENABLED=true`와 `NODE_ENV=development` 또는 `test`일 때만 동작한다. 기본 비활성·운영 차단과 개발 회원 제한은 기존 #104 공급자의 동작을 유지한다. 이 내부 공급자가 던지는 코드 없는 403은 기존 공통 필터 기준의 `403 INTERNAL_ERROR`로 반환된다. 실제 회원의 목록은 이 설정과 관계없이 [#252](repository-selection.md#목록--get-v1merepositories)가 공급한다.

## 로컬 재현

먼저 [README](../README.md)의 설치·환경변수·로컬 DB 준비를 따른다. 기존 설정을 덮어쓰지 않으며, 마이그레이션이 적용된 본인 개발 DB와 개발용 로그인 설정을 사용한다. 개발 대역에는 새 환경변수가 없다. 실제 회원 공급의 마이그레이션·재현은 [#252 문서](repository-selection.md#재현)를 따른다.

API를 실행한 뒤 별도 PowerShell에서 다음처럼 호출한다. 토큰은 메모리에만 두고 출력·로그·이슈·PR에 붙이지 않는다.

```powershell
$base = 'http://127.0.0.1:3001'
$login = Invoke-RestMethod -Method Post -Uri "$base/v1/auth/dev-login" `
  -ContentType 'application/json' -Body '{"memberId":"repository-reviewer"}'
$headers = @{ Authorization = "Bearer $($login.accessToken)" }
$page = Invoke-RestMethod -Uri "$base/v1/me/repositories?limit=20" -Headers $headers
$page.items | Select-Object repositoryId,name,ownerLogin,url,allowedScopeRevision
# 다음 페이지가 있으면 받은 커서를 그대로 사용한다. 현재 합성 대역은 한 개여서 null이다.
if ($null -ne $page.page.nextCursor) {
  $cursor = [Uri]::EscapeDataString($page.page.nextCursor)
  $page = Invoke-RestMethod -Uri "$base/v1/me/repositories?cursor=$cursor&limit=20" -Headers $headers
}
Remove-Variable login,headers
```

## 검사와 연결 한계

[테스트 DB 안내](../README.md#db-테스트)에 따라 기존 개발 DB·다른 작업 DB와 분리된 `_test` DB에서 검사한다.

```powershell
npm run lint
npm run typecheck
npm test -- test/member-repositories.test.cjs
npm test
npm run build
```

`test/member-repositories.test.cjs`는 실제 HTTP·전용 PostgreSQL에서 개발 로그인 → 회원 UUID → #104 연결 공급 → 계약 응답과 표본 일치, 인증·입력 거부, 회원 간 연결 경계, 연결 해제·재인증·행 부재, 실제 SQL 조회 실패와 안전한 오류를 검사한다. 여러 저장소·정상 빈 목록·페이지 중 연결 변경은 테스트용 공급 자료로 확인한다. 이 자료는 제품 GitHub 연결이나 실제 제공자 검증이 아니다.

저장소 관리 화면이 이 API를 사용하는 방식은 [D 담당 코드](../../web/src/features/repository-management/repository-api.ts)와 대조했으나 실제 web 화면·전체 A/E API 연결은 별도 검토다. D의 저장소 관리 모달, B Catch 목록·필터, 실제 선정 공급 방식은 수정하지 않는다. #138은 조회된 `allowedScopeRevision`을 권한 증표로 믿지 말고 접수 시 현재 선정 대상·범위를 다시 확인해야 한다. 실제 회원 접수(#323)는 [접수 재확인](repository-selection.md#접수-재확인--323)을 쓴다.
