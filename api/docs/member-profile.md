# 본인 회원·프로필 조회와 전체 저장 — #135

[회원 API 명세](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml), [응답 형식](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml), [회원 계약의 입력 기준](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#m--회원-api)을 구현한다. 회원·기본 프로필·합성 연동 생성은 [#104 기반](member-analysis.md), 인증·오류·주소 접두사는 [api 규약](../CONVENTIONS.md#인증-기반-사용과-후속-경계--87)과 [공통 오류 안내](../README.md#공통-오류-처리--api-명세-v1)를 재사용한다.

## API와 소유권

| 요청 | 성공 응답 | 저장·공개 범위 |
| --- | --- | --- |
| `GET /v1/me` | `Member`: `memberId`, `profile`, `github` | 인증된 본인 계정·기본 프로필·연동 상태만 조회 |
| `PUT /v1/me/profile` | 저장된 `Profile`의 네 필드 | 네 필드를 전체 교체. 생략한 필드를 이전 값으로 채우지 않음 |

두 API는 공통 인증 Guard와 `@CurrentMemberId()`로 얻은 회원 ID만 사용한다. 요청 본문·쿼리로 대상을 선택하지 않으며 추가 쿼리도 거부한다. 토큰은 공통 규약대로 검사하며, 유효한 토큰이어도 회원이 없거나 비활성인 경우 `404 RESOURCE_UNAVAILABLE`이다. 기능 코드가 개발 로그인 플래그나 JWT 내부 형식에 의존하지 않는다.

`GET`의 `profile`은 아래 네 필드만 반환한다. `github`는 `state`(`CONNECTED`·`DISCONNECTED`·`REAUTH_REQUIRED`)와 `accountLogin`(문자열 또는 `null`)만 반환한다. 연동 행이 없으면 `{ "state": "DISCONNECTED", "accountLogin": null }`이다. 개발 식별 문자열·비밀 참조·내부 행 ID·출처 메타데이터는 응답에 포함하지 않는다. 조회 중에는 일관된 DB 스냅샷을 사용한다.

## 입력 제한과 이름 저장 판정

다음 수치는 기존 승인 명세에 있던 제한이 아니라 **2026-10-06 이번 구현 요청에서 @yeongyeon1802가 확인한 입력 기준**이다. 내용과 근거는 [#135 입력 기준 확인 기록](https://github.com/JminAILab/CatchU/issues/135#issuecomment-6012338349)에 남겼으며, 기존 승인 원본은 소급 수정하지 않았다.

| 필드 | 필수 타입 | 저장 기준 |
| --- | --- | --- |
| `displayName` | 문자열 | 앞뒤 공백을 `trim()`으로 제거한 후 비어 있지 않아야 함. 최대 50 코드 포인트 |
| `introduction` | 문자열 | 최대 200 코드 포인트. 빈 문자열 허용 |
| `desiredRole` | 문자열 | 최대 100 코드 포인트. 빈 문자열 허용 |
| `skills` | 문자열 배열 | 최대 20개, 각 항목 최대 50 코드 포인트. 빈 배열 허용 |

모든 필드를 반드시 보낸다. 표시 이름의 내부 공백·대소문자·유니코드 조합은 변경하지 않는다. 선택 문자열과 기술 항목은 보정·중복 제거하지 않으며, 초과 입력을 잘라 저장하지 않는다. 타입·필수 필드·추가 필드·길이 오류는 `400 VALIDATION_FAILED`와 `details.violations: [{field, reason}]`으로 반환한다. 잘못된 JSON이나 최상위 `null` 등 공통 요청 해석 단계의 오류는 기존 `400 INVALID_REQUEST`다.

[PR #238 NUL 입력 리뷰](https://github.com/JminAILab/CatchU/pull/238#discussion_r4193329628)에 따라 네 항목의 각 문자열에 NUL(`U+0000`)이 있으면 저장 전에 `400 VALIDATION_FAILED`로 거부한다. 위반 항목은 `displayName`·`introduction`·`desiredRole` 또는 `skills.<배열 인덱스>`, 규칙 이름은 `noNul`로 반환하며 입력 원문은 응답·로그에 넣지 않는다. NUL을 제거해 저장하지 않으며 다른 제어문자를 일괄 금지하지 않는다. 기존 표시 이름 trim·코드 포인트 길이 제한·선택 항목의 빈 값 허용은 유지한다.

길이는 JavaScript의 `Array.from(value).length`와 같은 **유니코드 코드 포인트**로 센다. 이모지·결합 문자에서 화면에 보이는 글자 수와 다를 수 있다. [#137 프로필 화면 연결](https://github.com/JminAILab/CatchU/issues/137)과 [#106 web 공통 기반](https://github.com/JminAILab/CatchU/issues/106)의 후속 화면 검증도 같은 기준과 표시 이름의 trim 순서를 사용해야 한다. HTML `maxlength`나 문자열의 UTF-16 `length`만으로 서버 제한을 대체하지 않는다.

이름 저장 여부는 **조회 성공 시 저장된 `profile.displayName === ""`인지**로 판단한다. 빈 문자열은 #104가 생성한 최초 기본값이며, `PUT`으로 빈 이름을 다시 저장할 수는 없다. 빈 값이면 최초 프로필 입력, 저장된 이름이 있으면 홈 진입에 사용하는 방향은 [#106 연결 제안](https://github.com/JminAILab/CatchU/issues/106#issuecomment-5865929993)을 따른다. 로딩 중에는 판정을 기다리고 조회 실패는 재시도 가능한 오류로 처리해야 한다. 조회 실패·필수 프로필 행 누락을 빈 기본 프로필로 바꾸지 않으며, 판단용 새 응답 필드를 추가하지 않았다. 실제 web 연결 검증은 후속 작업이다.

[PR #238 고립 서로게이트 리뷰](https://github.com/JminAILab/CatchU/pull/238#discussion_r4201690535)에 따라 표시 이름·한 줄 소개·희망 직무·각 기술 문자열의 짝이 없는 UTF-16 상위·하위 서로게이트도 저장 전에 `400 VALIDATION_FAILED`로 거부한다. 위반 필드는 위와 같고 규칙 이름은 `isWellFormed`다. 문자를 제거하거나 대체 문자로 변환하지 않으며 입력 원문은 응답·로그에 넣지 않는다. 정상 한글·이모지·올바른 서로게이트 쌍·입력에 이미 있는 대체 문자(`U+FFFD`)는 허용한다. 기존 NUL 거부·표시 이름 trim·코드 포인트 길이 제한·선택 항목의 빈 값 정책은 유지한다.

## 저장·오류·정보 공개 경계

기존 기본 프로필 행을 트랜잭션 안에서 잠근 뒤 허용된 네 필드만 저장한다. 프로필 ID·회원 ID·자가 입력 출처(`SELF_REPORTED`)·GitHub 연동은 유지한다. 응답은 최종 커밋 성공 후에 반환한다. 저장 또는 커밋에 실패하면 `500 INTERNAL_ERROR`이며 기존 저장값이 보존된다. 조회 DB 오류나 필수 프로필 행 누락도 `500 INTERNAL_ERROR`이며 빈 프로필·이름 미저장 성공으로 응답하지 않는다. 회원·기본 프로필 행을 이 API에서 생성하지 않는다.

성공·오류 모두 기존 전역 설정의 `Cache-Control: no-store`를 사용한다. 입력값·SQL·토큰·DB 예외 원문을 오류 응답이나 로그에 추가하지 않는다. 원본 객체를 직접 검증해 DTO 변환 과정에서 누락될 수 있는 `constructor`·`__proto__` 등 추가 필드도 거부한다.

프로필은 자가 입력 정보이며 검증된 경력·기술이라는 의미가 아니다. 이 API는 본인용이며 수신자 공개 API를 추가하지 않는다. 수신자에게 제공할 기본 프로필 항목은 표시 이름·한 줄 소개·희망 직무·기술 목록·GitHub 계정명으로 한정하는 [공유 링크 프로필 결정](../../docs/ai-dlc-input-mvp/CatchU_공유링크_정보_판단조건_초안.md#4-1-공개-프로필과-수정-내용의-반영)과 별도 공개 계약을 따른다. 본인 응답을 그대로 공개하거나 추가 GitHub 정보·비밀 참조를 공개하지 않는다. 프로필 갱신이 기존 Catch의 생성 결과를 다시 작성하는 동작도 포함하지 않는다.

## 로컬 호출 예시

먼저 [README의 환경변수·로컬 DB·개발 실행](../README.md#설치와-환경변수)과 [개발 로그인 재현](auth-review.md)을 따른다. 아래 예시는 합성 회원을 사용하며 토큰을 화면에 출력하지 않는다. 운영에서는 개발 로그인으로 재현하지 않는다.

```powershell
$apiBase = 'http://127.0.0.1:3001'
$loginBody = @{ memberId = 'profile-review-owner' } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$apiBase/v1/auth/dev-login" -ContentType 'application/json' -Body $loginBody
$headers = @{ Authorization = "Bearer $($login.accessToken)" }
# 본인 조회 결과를 변수에 받는다. 실제 자료·토큰을 이슈·로그에 붙이지 않는다.
$me = Invoke-RestMethod -Method Get -Uri "$apiBase/v1/me" -Headers $headers
$profileBody = @{ displayName = '검토용 이름'; introduction = ''; desiredRole = ''; skills = @() } | ConvertTo-Json
$savedProfile = Invoke-RestMethod -Method Put -Uri "$apiBase/v1/me/profile" -Headers $headers -ContentType 'application/json' -Body ([System.Text.Encoding]::UTF8.GetBytes($profileBody))
$meAfter = Invoke-RestMethod -Method Get -Uri "$apiBase/v1/me" -Headers $headers
# 검토 후 인증 값을 남기지 않는다.
Remove-Variable login, headers, loginBody
```

## 파일과 검사

| 위치 | 역할 |
| --- | --- |
| `src/member-profile/profile-input.ts` | 입력 제한·네 필드 검사·표시 이름 trim |
| `src/member-profile/member-profile.service.ts` | 인증된 회원 조회·응답 투영·트랜잭션 저장 |
| `src/member-profile/member-profile.controller.ts` | 본인 API 경로·현재 회원 ID 사용·쿼리 거부 |
| `src/member-profile/member-profile.module.ts` | 기능 모듈. `AppModule`에서 등록 |
| `test/member-profile-input.test.cjs` | 코드 포인트 경계·초과·타입·특수 키 검사 |
| `test/db/member-profile-api.test.cjs` | 실제 API·전용 PostgreSQL의 소유권·조회·저장·최종 커밋 실패 검사 |

[README의 DB 테스트](../README.md#db-테스트)대로 개발 DB와 분리된 `_test` DB를 준비한 뒤 `api/`에서 실행한다. 검사는 해당 테스트 DB의 자료를 초기화하므로 기존 사용자 DB를 지정하지 않는다.

```powershell
npm run lint
npm run typecheck
npm test -- test/member-profile-input.test.cjs test/db/member-profile-api.test.cjs
npm test
npm run test:analysis-fixtures
npm run build
```

검사는 합성 회원·개발 로그인·실제 HTTP·PostgreSQL을 사용한다. 실제 Google/GitHub 제공자 인증, 수신자 공개 API, web 화면의 입력·진입·복귀 연결은 검사 범위에 포함하지 않는다.
