# GitHub 연동 화면 — #253

상세 프로필의 GitHub 연동 화면(W02-G, `/profile/github`)과 GitHub 콜백 화면(`/github/callback`)을 [#231](https://github.com/JminAILab/CatchU/issues/231)의 회원 API에 연결한다.
두 화면 모두 회원 화면 묶음(`(member)`) 안에 있어 회원 경로 가드(#106)를 거친다. 토큰은 공통 API 호출 함수(`api.member`)만 다루며 이 화면은 토큰을 읽거나 저장하지 않는다.

## 현재 상태: 연결 시작은 공통 인증 통합 시험 전환을 켰을 때만

- 시작·완료·상태 조회 API와 화면 동작은 연결했다. 기본 검사(`npm test`)는 함수 대역·가짜 fetch 시험이고, 실제 api·DB 연결은 명시 실행 통합 검사로 확인한다(아래 「검사」).
- 외부 인증은 같은 탭에서 github.com으로 전체 이동한다. **기본 인증(메모리 토큰, #106)에서는 GitHub에 다녀오면 로그인이 사라진다.** 콜백 화면에서 회원 가드가 `/login`으로 보내고, 콜백 주소는 `next`에 싣지 않으므로(`safeNextPath`가 회원 경로만 허용) 받은 code는 쓰이지 않고 버려진다.
- 왕복 뒤 로그인 유지는 공통 인증(#286, [PR #308](https://github.com/JminAILab/CatchU/pull/308))의 세션 복원을 쓴다. 통합 시험 전환(`NEXT_PUBLIC_AUTH_SESSION_INTEGRATION=true`)을 켜면 가드가 Refresh 쿠키로 복원을 마친 뒤에만 콜백 화면을 그린다. 토큰을 브라우저 저장소에 넣는 별도 우회는 만들지 않는다.
- **그래서 연결 시작은 이 전환을 켰을 때만 연다.** 끈 제품 기본값에서는 연동 화면의 [GitHub 연결]·[다시 연결]과 홈 안내(#155)의 [프로필에서 GitHub 연결]·[GitHub 다시 연결]을 누를 수 없게 두고, 버튼 아래에 같은 이유('GitHub 인증 뒤 로그인을 유지하는 기능이 준비 중이라 아직 GitHub 연결을 시작할 수 없습니다.')를 보인다(`githubStartBlockedReason`). 연결 상태 조회, 연결됨의 [내 자산에서 저장소 연결 관리], 상세 프로필의 [GitHub 연결 상태]는 그대로다. 제품에서 전환을 켜는 일은 #286의 별도 승인이며, 켜면 연결 시작도 함께 열린다.
- api의 기본값은 GitHub 연결 꺼짐(`GITHUB_CONNECTION_ENABLED=false`)이다. 전환을 켠 web에서 [GitHub 연결]을 누르면 '지금은 GitHub 연결을 사용할 수 없습니다'를 보이고 이동하지 않는다.

## 파일

| 파일 | 내용 |
|---|---|
| `github-connection-api.ts` | 상태 조회(GET /me의 `github`), 시작(POST /me/github/authorization), 완료(POST /me/github/connection), 콜백 주소 해석. 응답을 화면용 결과로 나눈다 |
| `github-connection-screen.ts` | 문구, 상태 표시, 시작 버튼(`createStartControl`)·콜백(`createCallbackControl`)의 진행. React와 분리해 시험한다 |
| `github-connection-panel.tsx` | `/profile/github` 화면. 콜백 화면이 안내를 붙여 그대로 쓴다 |
| `github-callback-screen.tsx` | `/github/callback` 화면 |

상태 값 목록은 저장소 연결 관리(#153)의 `readGitHubState`를 그대로 쓴다.

## 동작

**연결 상태**(문구는 [회원·자산 흐름 초안](../../../../docs/ai-dlc-input-mvp/CatchU_회원자산_흐름_와이어프레임_초안.md) W02-G 표의 A 제안)

| 조회 결과 | 표시 | 행동 |
|---|---|---|
| 조회 중 | 'GitHub 연결 상태를 확인하고 있습니다' | 없음 |
| 조회 실패·계약과 다른 응답 | '연결 상태를 확인하지 못했습니다' | [다시 불러오기](같은 조회만), [돌아가기] |
| `DISCONNECTED` | 상태: GitHub 미연결 | [GitHub 연결](취소·실패 안내 뒤에는 [다시 연결]), [돌아가기]. 전환 꺼짐: 같은 버튼을 누를 수 없게 두고 이유를 보인다 |
| `REAUTH_REQUIRED` | 상태: GitHub 재연결 필요 + 계정 + 다시 확인 안내 | [다시 연결], [돌아가기]. 전환 꺼짐: 위와 같다 |
| `CONNECTED` | 상태: GitHub 연결됨 + 계정 | [내 자산에서 저장소 연결 관리] → `/assets`, [돌아가기] |

- 조회는 세션·재조회별로 나눠 이전 세션(다른 회원)의 응답을 쓰지 않는다. 조회 실패를 미연결로 바꾸지 않는다. 다시 불러온 뒤에는 상태 영역으로 초점을 옮긴다.
- 연결 해제·다른 계정 교체 버튼은 두지 않는다(10월 화면 기준). [돌아가기]는 진입 출처를 보존하지 않으므로 홈으로 간다(W02-G 「출처 불명은 홈」).

**연결 시작**
- 통합 시험 전환을 끈 환경에서는 버튼을 누를 수 없고 시작 API를 부르지 않는다(위 「현재 상태」). 이유는 버튼 아래에 두고 `aria-describedby`로 잇는다.
- 누르면 바로 막고 'GitHub 연결을 진행하고 있습니다'를 보이며 시작 API를 한 번 부른다. 연타는 무시한다.
- 응답의 인증 주소가 `https://github.com/login/oauth/authorize`이고 응답 state와 같은 state를 하나만 실을 때만 이동한다. 다른 주소는 시작 실패로 본다.
- 기능 꺼짐(403 `GITHUB_CONNECTION_REQUIRED`)과 그 밖의 실패를 다른 문구로 안내하고 버튼을 다시 연다. CatchU 인증 오류(401)는 안내하지 않고 공통 인증 흐름(가드의 로그인 이동)에 맡긴다.
- GitHub에서 뒤로 가기로 이 화면이 그대로 복원되면(bfcache) 버튼을 다시 열고 상태를 다시 읽는다.

**콜백**
- 주소의 query를 한 번만 해석하고, 결과를 보존한 뒤 `history.replaceState`로 `code`·`state`·`error`를 지운다. 효과가 다시 실행돼도 다시 해석하거나 완료 요청을 다시 보내지 않는다.
- 완료 요청은 code·state가 하나씩 있고 형식이 맞을 때만 한 번 보낸다. 거부·응답 유실 뒤 자동으로 다시 보내지 않는다. 다시 연결은 새 시작이다.

| 결과 | 처리 |
|---|---|
| 서버가 `CONNECTED`와 계정을 돌려줌 | 'GitHub 계정이 연결되었습니다' 뒤 `/assets`(Catch 탭 저장소 연결 관리)로 `router.replace`. 저장소 연결·분석 요청은 하지 않는다 |
| 사용자 취소(`error=access_denied`) | 완료 요청 없음. 'GitHub 연결을 취소했습니다. 기존 연결 상태는 바뀌지 않았습니다.' + 현재 상태 |
| GitHub 오류·형식 오류, 완료 거부(400 등) | 'GitHub 계정을 연결하지 못했습니다' + 현재 상태. 다음 행동은 상태를 읽은 뒤 실제 버튼에 맞춰 덧붙인다(`noticeNextStep`): 시작 버튼이 있으면 '연결하려면 [다시 연결]을 눌러 주세요.', 연결됨이면(콜백 재전송·이미 쓴 state) '기존 연결은 그대로입니다.', 시작을 막았으면 덧붙이지 않는다 |
| 응답 유실(5xx·통신 실패·계약과 다른 성공 응답) | 성공·실패로 단정하지 않는다. 'GitHub 연결 결과를 확인하지 못했습니다' + 현재 상태 조회만. 연결됨으로 확인돼도 자동 이동하지 않는다 |
| 기능 꺼짐(403) | '지금은 GitHub 연결을 사용할 수 없습니다' |
| CatchU 인증 오류(401) | 안내 없음. 토큰이 지워져 가드가 로그인으로 보낸다. 다시 로그인한 뒤에는 연결 상태를 새로 읽는다 |
| 요청 중 CatchU 세션이 바뀜 | 결과를 쓰지 않고 지금 회원의 상태만 보인다 |
| 값 없음(주소를 지운 뒤 새로고침 등) | 안내 없이 현재 상태 |

- 안내는 결과 문장만 알림(`alert`·`status`)으로 읽힌다. 상태를 읽은 뒤 덧붙는 다음 행동은 알림 밖에 두어 같은 안내를 다시 읽히지 않는다.
- code·state·GitHub 오류 설명은 화면·로그에 옮기지 않는다. 콜백 주소는 `npm run dev` 요청 로그에도 찍히지 않는다([web README 「실행」](../../../README.md#실행)). state 검증(만료·이미 사용·다른 회원)은 서버가 한다.
- 주소가 `/login?next=`로 넘어가지 않으므로 다른 회원으로 다시 로그인해도 이전 회원의 code를 보내지 않는다.

## 실행 조건

- api: `GITHUB_CONNECTION_ENABLED=true`와 GitHub OAuth 앱 설정([api 환경 변수](../../../../api/.env.example)). `GITHUB_OAUTH_CALLBACK_URL`은 이 화면 주소(로컬 예: `http://localhost:3000/github/callback`)이며 OAuth 앱의 callback URL과 같아야 한다. 실제 값은 저장소·문서·로그에 남기지 않는다.
- web: 연결 시작과 같은 탭 왕복 뒤 로그인 유지에는 통합 시험 전환(`NEXT_PUBLIC_AUTH_SESSION_INTEGRATION=true`)이 필요하다(위 「현재 상태」). Refresh 쿠키가 `SameSite=Strict`이므로 web 주소와 api의 `AUTH_WEB_ORIGIN`·`CORS_ALLOWED_ORIGINS`·`GITHUB_OAUTH_CALLBACK_URL`, web의 `NEXT_PUBLIC_API_BASE_URL`은 같은 호스트 이름을 쓴다(로컬은 모두 `localhost`).

## 검사

- `npm test`의 `test/github-connection.test.mjs`: 콜백 주소 해석(취소·GitHub 오류·값 없음·중복·형식 오류), 상태 조회의 세 상태와 조회 실패, 인증 주소 검사(다른 출처·http·경로·state 불일치·계정 정보·hash), 시작·완료 결과 구분(거부·기능 꺼짐·401·5xx·통신 실패·다른 모양의 성공), 공통 API 호출 함수(`createApiClient`)와 가짜 fetch로 요청 모양과 401 토큰 정리, 연결 시작 가능 여부(전환 켬·끔)와 꺼짐의 비활성 버튼·이유, 실패 안내의 다음 행동(상태·버튼별), 시작 버튼(연타·떠난 뒤 결과·bfcache), 콜백(한 번만 해석·전송, 결과별 표시, 세션 변경, 예외).
- `test/home-readiness.test.mjs`(홈, D): 전환을 끄면 미연결·재연결 필요 버튼이 같은 이유로 비활성이고, 상태 안내와 연결됨 이동은 그대로인지.
- `test/member-navigation.test.mjs`: 콜백 주소가 `next`에 실리지 않음, `/profile/github` 허용.
- `node test/github-connection-http.integration.mjs`(web 폴더, 명시 실행): 실제 web API 함수 → Nest HTTP → PostgreSQL. GitHub의 토큰 교환·계정 조회 두 주소만 이 프로세스의 fetch에서 합성 응답으로 바꾼다. 기능 꺼짐, 서버가 준 인증 주소의 화면 검사 통과, 연결 성공·연결됨 조회, 같은 콜백 재전송·이전 state·추가 권한·다른 회원 state 거부, GitHub 장애의 결과 불명과 기존 연결 유지, 401 토큰 정리를 확인한다.
  api 의존성 설치·빌드가 필요하다. 127.0.0.1의 전용 `catchu_issue253_test` DB(기본 포트 55253, `TEST_DB_PORT`로 변경), catchu/catchu_local 합성 접속 설정만 쓴다. 다른 DB로 포워딩하지 말고 전용 PostgreSQL 컨테이너(api README 「로컬 DB 준비」의 이미지)에서 실행한 뒤 그 컨테이너를 지운다. 비밀값·보관 키는 실행마다 난수로 만들고 보관 디렉터리는 끝나면 지운다.
- 개발 로그인 회원은 처음부터 합성 연결(#104, `catchu-synthetic-owner`, `CONNECTED`)을 받는다. 화면에서 미연결·재연결 필요를 보려면 그 회원의 연결을 #231 해제 API(`DELETE /v1/me/github/connection`, 기능 켬 필요)로 지운다. 실제 회원(Google 로그인)은 연결 행이 없어 미연결로 시작한다.
- 실제 GitHub 승인·브라우저 왕복과 React 렌더링은 위 검사에 없다. 실제 연결 검사 결과는 PR 본문에 따로 적는다.

## 남은 연결

- 실제 GitHub 승인으로 하는 같은 탭 왕복(성공·취소·만료·다른 회원)은 확인하지 않았다. [#231의 실제 GitHub 연결 확인](https://github.com/JminAILab/CatchU/issues/231#issuecomment-6051939540)과 통합 시험 전환을 켠 대역 왕복(GitHub 인증 화면·토큰 교환·계정 조회를 합성, 결과는 PR #409)을 근거로 추가 확인은 생략하기로 D와 합의했다([D 리뷰](https://github.com/JminAILab/CatchU/pull/409#pullrequestreview-5665493550)). #308의 `memberMutationOutcome()`으로 보내지 않은 완료 요청을 따로 안내할지는 정하지 않았다. 지금은 응답 유실과 같이 상태 확인만 한다.
- 연동 성공 뒤 저장소 연결 관리 모달 자동 열기와 그 주소 표현은 필요하면 #153(D) 후속에서 정한다. 지금은 쿼리 없는 `/assets`로만 가고 이전 필터·Catch 상세를 복원하지 않는다([D 답변](https://github.com/JminAILab/CatchU/pull/409#issuecomment-6432457026)·[B 답변](https://github.com/JminAILab/CatchU/pull/409#issuecomment-6433912541)).
- 외부 인증은 같은 탭 전체 이동으로 D와 합의했다(위 D 답변). 복귀 초점은 `/assets` 화면의 기본 초점을 따른다.
- 이미 승인한 OAuth 앱이면 `/assets`에서 뒤로 가기로 GitHub 인증 주소에 돌아갔을 때 GitHub가 곧바로 다시 콜백으로 보낼 수 있다. 이미 쓴 state라 서버가 거부하므로 'GitHub 계정을 연결하지 못했습니다. 기존 연결은 그대로입니다.'와 현재 상태(연결됨)가 함께 보인다.
