# web — 사용자 화면

> 기능별 동작·연결 안내는 이 README에 덧붙이지 않고 `web/src/features/<기능>/README.md`로 쓴다.

Next.js로 만드는 10월 MVP의 사용자 화면이다. 로그인·프로필·GitHub 연동, 홈·분석 상태, 본인 자산 확인·공개/숨김, 공유 링크·수신자 열람 흐름을 다룬다. 적용 범위는 10월 작업이면 [MVP 범위 문서](../aidlc/spaces/default/intents/260914-catchu-october-mvp/ideation/scope-definition/scope-document.md)와 담당 이슈의 완료 기준, 11월 Unit이면 12월 intent 요구사항과 그 Unit 기능 설계로 확인한다.

이 README는 [#82 web 최소 실행 골격](https://github.com/JminAILab/CatchU/issues/82)과 [#106 공통 기반](https://github.com/JminAILab/CatchU/issues/106) PR①(레이아웃·헤더·주소·공통 표시)과 PR②(API 호출·토큰·로그인 진입·회원 경로 가드) 기준이다. 각 화면은 기능 이슈에서 추가한다.

## 요구 환경

| 항목 | 값 | 근거 |
|---|---|---|
| Node.js | 24.21.0 고정. `package.json` `engines` + `.npmrc`의 `engine-strict=true`로 다른 버전에서는 `npm ci`가 실패한다 | 9/23 회의 공통 결정 |
| npm | 11 이상. 잠금 파일은 `package-lock.json` | [#81](https://github.com/JminAILab/CatchU/issues/81) 공통 설정 |
| 포트 | 3000 (api 3001, worker 8000) | [#81](https://github.com/JminAILab/CatchU/issues/81) 공통 설정 |
| Next.js / React | 16.4.1 / 19.2.8 | `package.json` |

모든 명령은 `web/` 디렉터리에서 실행한다. 저장소 루트에는 `package.json`이 없다(워크스페이스 미사용).

## 설치

**Node.js 24.21.0 준비** — 설치된 버전이 다르면 `npm ci`가 `engine-strict`로 실패한다.

| 도구 | 명령 | 비고 |
|---|---|---|
| nvm (macOS/Linux) | `nvm install 24.21.0 && nvm use 24.21.0` | nvm은 `.node-version`을 읽지 않으므로 버전을 직접 적는다 |
| nvm-windows | `nvm install 24.21.0` → `nvm use 24.21.0` | 관리자 권한 터미널 |
| fnm | `fnm install 24.21.0`, 이후 `fnm use`가 `.node-version`을 읽음 | |
| 설치 프로그램 | https://nodejs.org 에서 24.21.0 | |

확인: `node -v` → `v24.21.0`, `npm -v` → 11 이상.

```bash
cd web
npm ci
```

`npm ci` 중 `unrs-resolver` 설치 스크립트(allow-scripts) 미승인 경고가 나온다. 설치 스크립트를 승인하지 않아도 된다. Windows에서 전체 검사를 통과했고, macOS에서는 팀장이 lint 통과를 확인했다.

`npm ci`는 `package-lock.json`과 정확히 같은 버전을 설치한다. 의존성을 추가·변경할 때만 `npm install`을 쓰고, 바뀐 `package-lock.json`을 함께 커밋한다.

## 실행

| 목적 | 명령 | 확인 |
|---|---|---|
| 개발 서버 | `npm run dev` | http://localhost:3000 에 비로그인 서비스 소개 화면. 파일 수정 시 자동 반영 |
| 배포용 빌드 | `npm run build` | `.next/` 생성, 오류 없이 종료 |
| 빌드 결과 실행 | `npm run start` | `npm run build` 뒤에만 가능. 주소는 개발 서버와 같음 |

운영 이미지는 빌드 때 `CATCHU_STANDALONE_BUILD=1`로 standalone 출력(`node server.js`로 실행)을 만든다. 위 명령의 빌드·실행은 바뀌지 않는다. 운영 이미지 빌드·실행은 [배포 안내](../deploy/README.md)를 따른다.

종료는 서버를 띄운 터미널에서 `Ctrl+C`. 포트 3000이 이미 사용 중이면 `npm run dev -- -p 3001`처럼 실행 인자로 임시로 바꾸되(Windows·macOS 공통), 팀 공통 포트는 3000이다. `.env`·`.env.local`의 `PORT`는 적용되지 않는다.

## 검사

| 명령 | 내용 | 실패 예 |
|---|---|---|
| `npm run lint` | ESLint (`eslint-config-next` core-web-vitals + typescript) | 조건문 안의 React Hook 호출 |
| `npm run typecheck` | `tsc --noEmit`. 생성 파일(`next-env.d.ts`, `.next/types`) 없이도 통과해야 함 | `const n: number = "x"` |
| `npm run build` | 프로덕션 빌드 | 빌드 중 타입·import 오류 |
| `npm run check:run` | `scripts/smoke.mjs`: 포트가 비어 있는지 확인한 뒤 빌드 결과를 `next start`로 띄우고, Ready 출력 후 `GET /`가 200이고 본문에 서비스 소개 제목(`id="landing-title"`)이 있는지, 보안 헤더(아래 「보안 응답 헤더」)가 붙고 `X-Powered-By`가 없는지 확인하고 종료(전체 30초 제한). **`npm run build` 이후에만, 개발 서버를 끈 상태에서 실행** | 포트 사용 중, 서버 미기동, 200 아님, 본문 불일치, 보안 헤더 누락, 30초 초과 |
| `npm test` | Node 기본 테스트 도구로 공통 응답 해석 검사 | 오류를 빈 목록으로 처리, HTTP 상태·code 소실 |
| `npm run test:coverage` | `npm test`와 같은 시험을 Node 기본 커버리지로 돌려 `src/`의 `.ts`·`.tsx` 파일별 줄·분기·함수 비율을 표로 낸다. Unit의 비율은 범위를 그 Unit 폴더로 좁혀 잰 맨 아래 `all files` 줄로 본다: `node --test --experimental-test-coverage --test-coverage-include="src/features/<폴더>/**" test/*.test.mjs`(여러 폴더는 `"src/{lib,features/<폴더>}/**"`처럼 묶는다). 시험이 한 번도 불러오지 않은 파일은 표와 맨 아래 비율에 들어가지 않으므로 0%로 따로 센다. `assets-view.tsx`는 시험(`test/assets-view.test.mjs`)이 직접 변환해 불러와 비율·빠진 줄 번호가 원본과 다를 수 있다. CI는 재지 않는다 | `npm test`와 같음 |
| `npm run check` | lint → typecheck → test → build → check:run | 하나라도 실패하면 중단 |

PR 전에는 `npm run check`를 실행하고 결과를 PR 「확인」 칸에 적는다.

## 환경변수

`.env.example`에 이름·용도·필수/선택을 적고, 내 값은 `.env.local`(커밋 금지)에 둔다. 로컬 개발은 `.env.example`을 `.env.local`로 복사하면 된다.

| 구분 | 이름 | 예시 값 | 의미 |
|---|---|---|---|
| API 호출 시 필수 | `NEXT_PUBLIC_API_BASE_URL` | `http://127.0.0.1:3001` | api 기준 주소. `/v1`은 넣지 않는다(호출 함수가 붙인다). 없거나 잘못되면 호출하지 않고 조회 실패로 돌려준다. `npm run build`로 만든 운영 빌드처럼 `NODE_ENV`가 `development`·`test`가 아니면 https 주소나 로컬 주소(`localhost`·`127.0.0.1`)의 http만 받고, 그 밖의 http 주소도 잘못된 주소로 본다(#218). 이 주소의 출처를 CSP 연결 허용에도 넣는다(「보안 응답 헤더」). IPv6 주소(`[::1]` 등)는 CSP에 적을 수 없어 형식과 관계없이 `npm run dev`·`npm run build`가 오류로 멈추므로 `127.0.0.1`이나 `localhost`를 쓴다 |
| 선택 | `NEXT_PUBLIC_DEV_LOGIN_ENABLED` | `false` | 기본 비활성. 정확히 `true`일 때만 `/login`에 개발용 로그인을 보인다. api도 `DEV_LOGIN_ENABLED=true`와 `NODE_ENV=development` 또는 `test`가 함께 지정돼야 허용하며, 그 밖에는 403이다 |
| 선택 | `NEXT_PUBLIC_AUTH_SESSION_INTEGRATION` | `false` | 공통 인증(#286) 화면 연결의 통합 시험 전환. 정확히 `true`일 때만 켠다. 각 화면 담당 확인·#287 연결·통합 검증 전에는 제품에서 켜지 않는다([공통 인증 안내](src/features/auth-session/README.md)) |

- 이름이 `NEXT_PUBLIC_`으로 시작하는 변수만 브라우저에 노출된다. 비밀값·토큰은 이 이름으로 두지 않는다.
- `NEXT_PUBLIC_` 값은 `npm run dev`·`npm run build`를 시작할 때 읽힌다. 바꾸면 다시 시작한다.
- web과 api의 출처가 다르므로 api의 `CORS_ALLOWED_ORIGINS`에 web을 여는 주소(`http://localhost:3000`)를 둔다([api README 「환경변수」](../api/README.md)). `127.0.0.1:3000`처럼 다른 주소로 열면 브라우저가 요청을 막는다.
- 그 밖의 변수는 서버(Node.js)에서만 읽힌다.

## 파일 역할

| 경로 | 역할 |
|---|---|
| `src/app/layout.tsx` | 루트 레이아웃(`<html lang="ko">`, 기본 메타데이터, `globals.css`) |
| `src/app/globals.css` | 전역 기본값과 공통 색·폭 변수. 화면 스타일은 넣지 않는다 |
| `src/app/(guest)/`, `(member)/`, `s/` | 화면 묶음별 레이아웃(헤더). 아래 「공통 레이아웃」 참조 |
| `src/app/(guest)/page.tsx` | `/` 비로그인 서비스 소개([기능 안내](src/features/landing/README.md)) |
| `src/app/preview/common/` | 헤더·상태 표시 개발용 미리보기(`npm run dev`에서만) |
| `src/app/(member)/home/` | 회원 가드 안의 로그인 후 홈. 연결 상태 안내와 다음 행동을 조립한다([기능 안내](src/features/home/README.md)) |
| `src/app/(member)/assets/` | 회원 가드 안의 실제 내 자산 페이지. B 목록·상세와 D 저장소 모달을 조립한다([기능 안내](src/features/assets/README.md)) |
| `src/app/s/[token]/` | 공유 링크 수신자 목록·Catch 상세. 회원 로그인 없이 수신자 API에 연결한다([기능 안내](src/features/recipient/README.md)) |
| `src/components/header/` | 로그인·비로그인·수신자 헤더와 프로필 메뉴 |
| `src/components/notice-dialog/` | 채용공고·알림 안내창 |
| `src/components/status/` | 불러오는 중·조회 실패·정상 0건 공통 표시 |
| `src/lib/routes.ts` | 페이지 주소 상수. 아래 「페이지 주소」 표와 함께 고친다 |
| `scripts/smoke.mjs` | 최소 실행 검사(`check:run`) |
| `package.json` / `package-lock.json` | 의존성·스크립트·Node 버전 고정 |
| `.node-version` | Node.js 버전(버전 관리 도구용) |
| `.env.example` | 환경변수 목록 예시(포트는 여기서 못 바꿈) |
| `.npmrc` | `engine-strict=true` — Node 버전 강제 |
| `next.config.ts` | Next.js 설정. `agentRules: false`로 `npm run dev`가 `web/`에 `AGENTS.md`·`CLAUDE.md`를 자동으로 만들지 않게 한다. 보안 응답 헤더와 `X-Powered-By` 끄기도 여기에 둔다 |
| `tsconfig.json`, `eslint.config.mjs` | TypeScript·ESLint 설정(create-next-app 기본값) |
| `.gitignore` | `node_modules/`, `.next/`, `next-env.d.ts` 등 생성물 제외 |

## 코드 추가 위치

- 화면(라우트): 아래 「페이지 주소」의 주소를 쓰고, 헤더에 맞는 묶음 폴더 안에 둔다. 예: 내 자산은 `src/app/(member)/assets/page.tsx`, 수신자 링크는 `src/app/s/[token]/page.tsx`.
- 여러 화면이 함께 쓰는 컴포넌트: `src/components/`.
- API 호출·오류 응답 해석 등 화면과 분리되는 로직: `src/lib/`. `api.ts`가 API 호출 함수(아래 「API 호출」), `api-response.ts`가 [#88](https://github.com/JminAILab/CatchU/issues/88)의 응답 해석을 제공한다.
- 회원 경로를 새 최상위 주소로 추가하면 `src/lib/member-navigation.ts`의 복귀 허용 목록(`MEMBER_PATH_PREFIXES`)에도 넣는다. 목록에 없으면 로그인 후 그 주소로 돌아오지 않고 `/home`으로 간다.
- 디렉터리는 필요할 때 만들고, 담당 화면 밖의 공통 구조 변경은 이슈에서 먼저 조율한다.

## 공통 레이아웃 (#106 PR①)

헤더는 화면 묶음 폴더의 `layout.tsx`가 붙인다. 괄호 폴더는 주소에 나타나지 않는다. 화면 파일을 알맞은 묶음에 두면 헤더를 따로 넣지 않아도 된다. **폴더 배치는 인증 판정이 아니다.** `(member)`에 두어도 토큰 없는 접근을 막지 않으며, 토큰 없는 접근은 `(member)/layout.tsx`의 회원 경로 가드(`src/components/auth/member-guard.tsx`)가 막으며, 그동안 헤더와 화면을 그리지 않는다.

| 묶음 폴더 | 헤더 | 구성 (#55 10월 헤더 합의) |
|---|---|---|
| `src/app/(guest)/` | 비로그인 일반 | 왼쪽 로고(→ `/`) / 오른쪽 [Google로 시작하기](→ 로그인 진입). 내 자산·공유 링크·프로필은 없음 |
| `src/app/(member)/` | 로그인 일반·발행자 | 왼쪽 로고(→ `/home`)·내 자산·텍스트 자료(U4)·공유 링크·채용공고 / 오른쪽 알림·프로필. 대표 구성 진입점은 10월에 없음 |
| `src/app/s/` | 공유 링크 수신자 | 이동 없는 CatchU 브랜드만. 로그인 여부와 무관하며 로그인·프로필 버튼 없음 |

- **회원 화면 폭:** 창 폭 760px부터 지원한다. `(member)/layout.tsx`의 전용 CSS는 760px 미만에서만 헤더·본문 폭을 760px로 유지하고 문서 가로 스크롤을 허용한다. 760px 이상에서는 세로 스크롤바를 뺀 가용 폭에 맞추며, 헤더 메뉴는 글자 단위로 줄바꿈하지 않는다. 회원 화면 검증 폭은 760·1024·1536px이다. 비로그인·공유 링크 수신자 레이아웃에는 이 최소 폭을 적용하지 않는다([#412 회원 화면 범위](https://github.com/JminAILab/CatchU/issues/412)).
- **채용공고·알림:** 흐리게 표시하되 누를 수 있다(`disabled`를 쓰지 않는다). 누르면 현재 화면 위 안내창에 '개발 중인 기능입니다'와 [확인]을 띄운다. 열리면 [확인]에 초점이 가고, Tab은 안내창 밖으로 나가지 않는다.
- **프로필:** 누르면 근처에 [프로필 보기](→ `/profile`)·[로그아웃] 메뉴가 열린다(#51). [로그아웃]은 메모리 토큰을 지우고 비로그인 홈(`/`)으로 보낸다. 서버 세션·Refresh Token은 아직 없다(OQ-A1). `MemberHeader`에 `onLogout`을 주지 않으면 [로그아웃]이 '연결 전' 표시와 함께 누를 수 없는 상태(`aria-disabled`)로 보인다.
- **닫기 조작:** #51·#55의 미결을 [#171 A 담당 검토](https://github.com/JminAILab/CatchU/pull/171#pullrequestreview-5349302819)(9/29)로 정했다. 어느 방법으로 닫아도 창·메뉴만 닫고 현재 페이지·입력·필터·상세 상태는 그대로 둔다.

| 대상 | 닫는 방법 | 초점 | 닫히지 않는 경우 |
|---|---|---|---|
| 안내창 | [확인]·X·Esc·바깥 클릭 | 어느 방법이든 연 메뉴로 돌아감 | 창 안 클릭, 창 안에서 누르기 시작해 바깥에서 뗀 경우 |
| 프로필 메뉴 | [프로필] 버튼·Esc·바깥 클릭. [로그아웃]을 누르면 메뉴를 먼저 닫고 로그아웃을 요청한다(#287) | Esc·[로그아웃]으로 닫으면 [프로필] 버튼으로 돌아감. 바깥 클릭은 누른 요소의 동작·초점을 막지 않음 | 메뉴 안 클릭([로그아웃] 제외) |
- **조회 상태:** `src/components/status/status.tsx`의 세 컴포넌트를 쓴다. 불러오는 중은 `LoadingState`, `readApiResponse`가 `lookup-failed`를 돌려주면 `LookupFailedState`, 성공 응답의 빈 목록일 때만 `EmptyState`다. 조회 실패를 0건으로, 요청 중을 성공으로 표시하지 않는다.
- **스타일:** 컴포넌트 옆 CSS Modules(`*.module.css`)를 쓴다. 공통 색·폭은 `globals.css`의 `--color-*`·`--content-width` 변수를 쓴다. `globals.css`가 `body` 기본 여백을 없애므로 화면에서 여백을 되돌리는 음수 여백은 필요 없다.
- **미리보기:** `npm run dev` 뒤 `http://localhost:3000/preview/common`에서 세 헤더와 상태 표시를 모의 상태로 확인한다. 로그인 헤더는 실제 화면 상태(로그아웃 연결 전)와 모의 로그아웃 연결을 나란히 보여 준다. 배포용 실행에서는 404다. 미리보기 접속 주소는 `http://localhost:3000/preview/common`으로 통일한다.

## 페이지 주소

**정본은 이 표이며, `src/lib/routes.ts`와 함께 고친다.** A~D 담당과 '제안' 구분은 10월 기준이다. 11월 Unit은 주소를 그 Unit 기능 설계(받은 사람 링크 화면은 계약 C-11·C-12)에 따라 정하고, 이 표와 `routes.ts`를 함께 고치며 담당 칸에는 Unit 번호를 적는다. 구분: **확정** 결정 문서에 있음 / **제안** 담당자 확인 전 안 / **미정** 담당자가 정함. `[token]`·`[catchId]`·`…`는 자리표시자다. 근거: [9/24 팀장 결정](../docs/ai-dlc-input-mvp/2026-09-14_followup.md), [web 기능 설계 「내 자산 화면 구조」](../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md), #55 「10월 헤더 합의」, [#106 주소 표 초안](https://github.com/JminAILab/CatchU/issues/106#issuecomment-5865962875).

| 주소 | 화면 | 담당 | 로그인 | 구분 | 비고 |
|---|---|---|---|---|---|
| `/` | 서비스 소개 | D | 불필요 | 제안 | 로그아웃 성공 후 비로그인 홈 이동은 확정(#55) |
| `/login` | 로그인 진입 | A / 틀 D | 불필요 | 제안 | 회원 경로 가드의 이동 목적지. Google 로그인은 통합 시험 전환(아래 「공통 인증」)을 켰을 때만 연결되고 끄면 연결 전 표시(A, #287), 개발용 로그인은 `NEXT_PUBLIC_DEV_LOGIN_ENABLED=true`일 때만 |
| `/google/callback` | Google 로그인 콜백 | A | 불필요 | 확정 | api `GOOGLE_REDIRECT_URI`와 같은 주소(로컬 `http://localhost:3000/google/callback`). 통합 시험 전환을 켰을 때만 열고 끄면 404. 주소의 `code`·`state`·`error`는 해석 뒤 지운다([인증 화면](src/features/auth-screens/README.md)) |
| `/home` | 로그인 후 홈 | D | 필요 | 제안 | CTA는 Catch 탭 저장소 연결 관리로 이동(확정). GitHub 미연동·재연동 필요의 연동 화면(`/profile/github`) 버튼은 #253 전까지 비활성으로 두고 준비 중 이유를 보인다([홈](src/features/home/README.md)) |
| `/profile/setup` | 최초 프로필 입력 (W02) | A | 필요 | 제안 | 저장 성공 후 회원 정보를 다시 불러온 뒤 `/home` |
| `/profile` | 상세 프로필 (W02-P) | A | 필요 | 제안 | 프로필 메뉴 [프로필 보기]의 목적지. 수정(`/profile/edit`)으로 진입하는 링크를 둔다. GitHub 연동(`/profile/github`) 진입은 #253 전까지 '연결 전'으로 표시하고 이동하지 않는다 |
| `/profile/edit` | 프로필 수정 (W02) | A | 필요 | 제안 | 저장 성공·취소 후 `/profile`로 복귀하고, 저장 실패 시 이 화면과 입력을 유지 |
| `/profile/github` | GitHub 연동 (W02-G) | A | 필요 | 제안 | 성공 후 Catch 탭 저장소 연결 관리로 복귀(확정) |
| `/assets` | 내 자산 (Catch 탭) | B / 연결 관리 D | 필요 | 제안 | Catch 탭을 기본으로 표시. 준비 중 탭의 주소(`tab`) 반영 여부는 미정 |
| `/assets?repositoryId=…` | 저장소 필터 | B | 필요 | 제안 | PR #156의 B 제안. 값은 저장소 식별자 |
| `/assets?catchId=…` | Catch 상세 모달 | B | 필요 | 제안 | PR #156 제안: 닫으면 `catchId`만 제거하고 필터 유지. 새로고침·뒤로 가기·재로그인 후 상태 유지는 확정 |
| `/materials` | 텍스트 자료 목록·편집 | U4 | 필요 | 확정 | U4 담당 결정 D3(2026-10-29, [U4 코드 요약](../aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/code-generation/code-summary.md) 「구현 결정과 설계 후속 변경 기록」). 목록과 편집을 한 화면에 둔다([텍스트 자료](src/features/materials/README.md)) |
| `/links` | 링크 목록·발급·복사·중단 | C | 필요 | 제안 | 발급은 이 페이지의 폼·모달로 처리 |
| `/s/[token]` | 수신자 링크 | C | 불필요 | 제안 | 수신자 전용 헤더 |
| `/s/[token]/catches/[catchId]` | 수신자 Catch 상세 | C | 불필요 | 제안 | 직접 진입해도 접근 판정·비밀번호 확인 후 표시 |

**주소 원칙(제안):** 이름 조회·회원 가드·로그인 이동을 연결했다. 현재 범위와 최초 프로필 저장 연결은 [회원 진입 연결](src/features/member-entry/README.md), 프로필 상세·수정은 [프로필 화면](src/features/profile/README.md)을 따른다.
- 토큰 없이 회원 경로에 들어오거나 회원 API가 `AUTH_REQUIRED`·`AUTH_INVALID`를 돌려주면 `/login`으로 보낸다. 수신자 비밀번호 401은 수신자 화면에서 처리한다.
- `GET /v1/me` 성공 시 `profile.displayName`이 빈 문자열이면 `/profile/setup`으로 보낸다. 조회 중에는 판단을 미루고, 조회 실패는 다시 불러오기로 처리한다. 이미 `/profile/setup`이면 다시 보내지 않는다. 이름이 저장된 회원이 `/profile/setup`에 들어오면 `/home`으로 보낸다. 이름이 저장된 회원은 상세(`/profile`)와 수정(`/profile/edit`)을 열고, 이름이 비면 두 화면 모두 `/profile/setup`으로 보낸다.
- 복귀 주소는 `/login?next=<인코딩한 경로>`로 넘기고 서비스 안 회원 경로만 허용한다. 토큰·grant는 주소에 넣지 않는다.
- 이름이 저장된 회원만 로그인 후 `next`로 복귀한다. 유효하지 않은 `next`는 `/home`으로 보내며, 최초 프로필 입력(`/profile/setup`)을 거친 경우에도 `/home`으로 이동한다.
- 최초 프로필 입력은 저장에 성공하면 회원 정보(`GET /v1/me`)를 다시 불러온 뒤 `/home`으로 이동한다. 저장 전의 빈 이름 응답 때문에 `/profile/setup`으로 되돌아가지 않게 하기 위해서다([#171 A 담당 검토](https://github.com/JminAILab/CatchU/pull/171#pullrequestreview-5349302819)).
- 저장소 연결 관리는 별도 주소 없이 `/assets` 안 모달이다. 모달 열림의 주소 반영과 연동 복귀 때 자동 열기는 #153에서 정한다.

## 공통 응답 해석 (#88)

`src/lib/api-response.ts`의 `readApiResponse`에 `Response` 또는 fetch Promise를 전달한다. 네트워크 실패까지 처리하려면 fetch를 먼저 await하지 않고 Promise를 그대로 넘긴다.

```typescript
import { readApiResponse } from '@/lib/api-response';

const result = await readApiResponse(fetch(url, options));
// result.kind === 'success': data는 unknown. 기능별 스키마를 확인한 뒤 사용한다.
// result.kind === 'api-error': status와 code로 안내를 결정한다.
// result.kind === 'lookup-failed': 조회 실패를 표시한다. 빈 결과로 바꾸지 않는다.
```

정본은 [API 명세 v1](../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md)과 공통 Error 스키마다. 추가 필드는 무시하며 알려진 details만 전달한다. 새로운 업무 code도 문자열 그대로 보존하고, 화면에서 모르는 코드는 일반 오류 안내로 처리한다. 오류 응답의 필수 형식 위반·JSON 해석 실패·네트워크 실패는 `LOOKUP_FAILED`다. HTTP 응답을 받았다면 상태를 보존하고, 네트워크 실패는 `status: null`이다.

정상 JSON은 그대로 반환하며 `EMPTY`·`PARTIAL_FAILED`·`FAILED` 같은 분석 결과를 HTTP 오류로 바꾸지 않는다. 204는 성공 데이터 null이다. 함수는 기능별 성공 스키마를 검증하지 않으므로 화면에서 확인해야 한다. 401도 회원 인증과 링크 비밀번호 오류를 code로 구분하며 자동 로그인 이동·토큰 처리·재시도는 하지 않는다. 회원 인증 401 처리는 아래 「API 호출」의 호출 함수가 맡는다. 함수는 요청/응답이나 예외를 로그에 출력하지 않는다.

테스트는 새 의존성 없이 Node.js 24의 TypeScript 타입 제거와 `node --test`를 사용한다. 현재 package의 모듈 형식 미지정으로 `.ts`를 ES module로 재해석한다는 Node 경고가 나올 수 있으며, 테스트 실패는 아니다.

## API 호출 (#106 PR②)

화면은 `fetch`를 직접 쓰지 않고 `src/lib/api.ts`의 `api`를 쓴다. 결과는 「공통 응답 해석」과 같은 `ApiResult`다.

```typescript
import { api } from '@/lib/api';
import { createIdempotencyKeyHolder, isSettledResult } from '@/lib/idempotency';

// 회원 API: 토큰이 있으면 Authorization: Bearer를 붙인다. 경로는 /v1 뒤부터 적는다.
const me = await api.member('/me');

// 생성 POST: 같은 요청을 다시 보낼 때 같은 키를 쓴다.
const key = createIdempotencyKeyHolder();            // 화면(폼)마다 하나
const created = await api.member('/share-links', { method: 'POST', body, idempotencyKey: key.current() });
if (isSettledResult(created)) key.reset();          // 성공·4xx 업무 거부(401·429 제외)일 때만 새 키로

// 수신자 API: 회원 토큰을 붙이지 않는다. 비밀번호 링크는 grant를 X-Link-Grant로 보낸다.
const page = await api.recipient(`/public/links/${encodeURIComponent(token)}`, { linkGrant });

// 비밀번호 시도 제한(429 LINK_UNLOCK_LIMITED)·발급 빈도 제한(429 RATE_LIMITED)이면 남은 초가 retryAfterSeconds로 온다.
const unlock = await api.recipient(`/public/links/${encodeURIComponent(token)}/unlock`, { method: 'POST', body: { password } });
if (unlock.kind === 'api-error' && unlock.code === 'LINK_UNLOCK_LIMITED') showLimited(unlock.retryAfterSeconds);
```

- 요청은 `cache: 'no-store'`로 보내고 쿠키를 싣지 않는다(`credentials: 'omit'`).
- 회원 API가 401 `AUTH_REQUIRED`·`AUTH_INVALID`를 돌려주면 그 토큰을 지운다. 회원 경로 가드가 `/login?next=<현재 경로>`로 보낸다. 수신자 401(`LINK_PASSWORD_*`)은 지우지 않고 수신자 화면이 처리한다.
- 자동 재시도하지 않는다. 서버가 저장했는지 알 수 없는 결과(조회 실패·5xx)면 키를 유지하고, 사용자가 다시 누르면 같은 키로 보낸다. 401도 앞선 같은 키 요청의 저장 여부를 알려 주지 않으므로 키를 유지한다. 429(빈도 제한)도 요청을 처리하지 않은 것이라 키를 유지하고, `Retry-After`가 지난 뒤 사용자가 다시 누르면 같은 키·본문으로 보낸다(#235 계약). 성공과 401·429를 뺀 4xx 업무 거부만 확정으로 본다(`isSettledResult`).
- 로그인 복귀 후 키 보존은 아직 구현하지 않았다. 지금은 401이면 로그인 화면으로 이동하면서 화면이 다시 만들어져 키도 새로 생긴다. 후속 구현 조건: 로그인 뒤 키를 이어 쓰려면 실제 생성 화면에서 **같은 회원·같은 생성 요청일 때만** 이어 쓰고, 다른 계정으로 로그인했으면 키를 버린다. 로그인 뒤 이전 요청을 자동으로 다시 보내지 않는다.
- 오류 응답에 `Retry-After`가 1 이상의 정수 초로 오면 `retryAfterSeconds`로 전달한다. 헤더가 없거나 다른 형식이면 붙이지 않으며, 남은 시간을 추정하지 않는다.
- 토큰은 탭의 메모리(`src/lib/access-token.ts`)에만 둔다. localStorage·sessionStorage·쿠키·URL·로그에 쓰지 않으며, 새로고침하면 사라져 다시 로그인한다. 실제 유지 방식은 OQ-A1에서 정한다. 예외는 Google 로그인 시도 값 하나뿐이다([팀장 T1 결정](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6182257830), [공통 인증 안내](src/features/auth-session/README.md)).
- 개발용 로그인은 `api.devLogin(memberId, { signal })`다. `memberId`에는 개발용 식별 문자열을 넣으며, api가 해당 회원을 찾거나 만들어 그 회원의 토큰을 준다. 성공하면 토큰을 메모리에 넣고, 결과에는 토큰을 담지 않는다. 가장 늦게 시작한 로그인만 반영하며, 먼저 보낸 로그인이 늦게 오거나 로그인 화면을 떠나 취소되면 토큰을 바꾸지 않는다.

## 공통 인증 (#286)

회원 인증 상태·세션 갱신·로그아웃·로그인 완료와 통합 시험 전환 `NEXT_PUBLIC_AUTH_SESSION_INTEGRATION`의 동작은 [공통 인증 안내](src/features/auth-session/README.md)에 있다.

## 보안 응답 헤더 (#217)

`next.config.ts`가 응답에 아래 헤더를 붙이고 `X-Powered-By`를 끈다. 경로를 정리하는 자동 이동(308: 끝 슬래시, 중복 슬래시·역슬래시)에는 Next가 헤더 설정을 적용하지 않아 빠진다. 이 응답은 이동할 주소만 담고 화면을 그리지 않는다. 값은 `npm run dev`·`npm run build`를 시작할 때 정해지므로, `NEXT_PUBLIC_API_BASE_URL`을 바꾸면 다시 시작하거나 다시 빌드한다.

| 헤더 | 값 | 하는 일 |
|---|---|---|
| `Content-Security-Policy` | 같은 출처의 자원만 허용, 연결은 같은 출처와 API 기준 주소의 출처만, `frame-ancestors 'none'` | 허용하지 않은 곳에서 스크립트·자원을 불러오거나 연결하지 못하게 하고, 다른 사이트가 화면을 끼워 넣지 못하게 한다 |
| `X-Content-Type-Options` | `nosniff` | 브라우저가 응답 형식을 짐작하지 않게 한다 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 다른 출처로는 출처만 보내 공유 링크 주소(`/s/<토큰>`)가 넘어가지 않게 한다 |
| `Strict-Transport-Security` | `max-age=300` | `NODE_ENV`가 development·test가 아닐 때(배포용 빌드). 브라우저가 https로 받은 뒤 5분 동안 https로만 접속하게 한다. 도메인·인증서가 정해지면 기간을 늘린다 |

- 스크립트는 인라인을 허용한다(`'unsafe-inline'`). Next.js가 페이지에 인라인 스크립트를 넣는데, 요청마다 일회용 값(nonce)을 주려면 모든 페이지를 요청 때마다 새로 그려야 해서다. 그래서 화면 출력은 [보안 점검](../docs/CatchU_security_checks.md) 「화면 출력」대로 React 텍스트로만 그린다.
- 개발 서버에서만 `'unsafe-eval'`을 더한다(React 개발용 오류 표시).
- 외부 스크립트·이미지·글꼴·연결(예: Google 로그인 스크립트, 외부 이미지)을 새로 쓰면 CSP의 해당 항목에 그 출처를 더하고, 브라우저 콘솔에 CSP 위반 오류가 없는지 확인한다. 화면을 다른 페이지 안에 띄워야 하면 이슈로 먼저 정한다.

## 작업 규칙

- 착수·브랜치·기록·검토 기준은 [공통 작업관리](../docs/CatchU_작업관리.md)를 따른다.
- Next.js 16은 이전 판과 API·파일 규칙이 달라진 부분이 있다. 사람이든 AI든 Next.js 코드를 쓰기 전에 설치된 판본의 문서 `node_modules/next/dist/docs/`를 확인한다.
- 화면 문구·상태는 승인 요구사항과 근거 화면 설계(10월은 `docs/ai-dlc-input-mvp/`의 흐름 초안, 11월은 Unit 기능 설계의 화면 구성)를 근거로 하고, 요청 중·저장 중을 성공으로, 조회 실패를 데이터 없음으로 표시하지 않는다.
- 브라우저 로그에는 민감정보를 출력하지 않는다.
- 로컬 실행 확인과 AWS 배포 검증은 각각 기록한다.
