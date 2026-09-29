# web — 사용자 화면

Next.js로 만드는 10월 MVP의 사용자 화면이다. 로그인·프로필·GitHub 연동, 홈·분석 상태, 본인 자산 확인·공개/숨김, 공유 링크·수신자 열람 흐름을 다룬다. 적용 범위는 [MVP 범위 문서](../aidlc/spaces/default/intents/260914-catchu-october-mvp/ideation/scope-definition/scope-document.md)와 담당 이슈의 완료 기준으로 확인한다.

이 README는 [#82 web 최소 실행 골격](https://github.com/JminAILab/CatchU/issues/82)과 [#106 공통 기반](https://github.com/JminAILab/CatchU/issues/106) PR①(레이아웃·헤더·주소·공통 표시) 기준이다. API 호출·토큰·회원 경로 가드는 #106 PR②, 각 화면은 기능 이슈에서 추가한다.

## 요구 환경

| 항목 | 값 | 근거 |
|---|---|---|
| Node.js | 24.21.0 고정. `package.json` `engines` + `.npmrc`의 `engine-strict=true`로 다른 버전에서는 `npm ci`가 실패한다 | 9/23 회의 공통 결정 |
| npm | 11 이상. 잠금 파일은 `package-lock.json` | [#81](https://github.com/JminAILab/CatchU/issues/81) 공통 설정 |
| 포트 | 3000 (api 3001, worker 8000) | [#81](https://github.com/JminAILab/CatchU/issues/81) 공통 설정 |
| Next.js / React | 16.3.6 / 19.2.8 | `package.json` |

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
| 개발 서버 | `npm run dev` | http://localhost:3000 에 "CatchU web" 화면. 파일 수정 시 자동 반영 |
| 배포용 빌드 | `npm run build` | `.next/` 생성, 오류 없이 종료 |
| 빌드 결과 실행 | `npm run start` | `npm run build` 뒤에만 가능. 주소는 개발 서버와 같음 |

종료는 서버를 띄운 터미널에서 `Ctrl+C`. 포트 3000이 이미 사용 중이면 `npm run dev -- -p 3001`처럼 실행 인자로 임시로 바꾸되(Windows·macOS 공통), 팀 공통 포트는 3000이다. `.env`·`.env.local`의 `PORT`는 적용되지 않는다.

## 검사

| 명령 | 내용 | 실패 예 |
|---|---|---|
| `npm run lint` | ESLint (`eslint-config-next` core-web-vitals + typescript) | 조건문 안의 React Hook 호출 |
| `npm run typecheck` | `tsc --noEmit`. 생성 파일(`next-env.d.ts`, `.next/types`) 없이도 통과해야 함 | `const n: number = "x"` |
| `npm run build` | 프로덕션 빌드 | 빌드 중 타입·import 오류 |
| `npm run check:run` | `scripts/smoke.mjs`: 포트가 비어 있는지 확인한 뒤 빌드 결과를 `next start`로 띄우고, Ready 출력 후 `GET /`가 200이고 본문에 "CatchU web"이 있는지 확인하고 종료(전체 30초 제한). **`npm run build` 이후에만, 개발 서버를 끈 상태에서 실행** | 포트 사용 중, 서버 미기동, 200 아님, 본문 불일치, 30초 초과 |
| `npm test` | Node 기본 테스트 도구로 공통 응답 해석 검사 | 오류를 빈 목록으로 처리, HTTP 상태·code 소실 |
| `npm run check` | lint → typecheck → test → build → check:run | 하나라도 실패하면 중단 |

PR 전에는 `npm run check`를 실행하고 결과를 PR 「확인」 칸에 적는다.

## 환경변수

현재 골격은 필수 환경변수가 없다. `.env.example`에 이름·용도·필수/선택을 적고, 실제 값은 `.env.local`(커밋 금지)에 둔다.

- 이름이 `NEXT_PUBLIC_`으로 시작하는 변수만 브라우저에 노출된다. 비밀값·토큰은 이 이름으로 두지 않는다.
- 그 밖의 변수는 서버(Node.js)에서만 읽힌다.
- API 주소·인증 관련 변수는 해당 기능 이슈에서 `.env.example`에 추가한다.

## 파일 역할

| 경로 | 역할 |
|---|---|
| `src/app/layout.tsx` | 루트 레이아웃(`<html lang="ko">`, 기본 메타데이터, `globals.css`) |
| `src/app/globals.css` | 전역 기본값과 공통 색·폭 변수. 화면 스타일은 넣지 않는다 |
| `src/app/(guest)/`, `(member)/`, `s/` | 화면 묶음별 레이아웃(헤더). 아래 「공통 레이아웃」 참조 |
| `src/app/(guest)/page.tsx` | `/` 기본 화면. 서비스 소개는 #155에서 채운다 |
| `src/app/preview/common/` | 헤더·상태 표시 개발용 미리보기(`npm run dev`에서만) |
| `src/components/header/` | 로그인·비로그인·수신자 헤더와 프로필 메뉴 |
| `src/components/notice-dialog/` | 채용공고·알림 안내창 |
| `src/components/status/` | 불러오는 중·조회 실패·정상 0건 공통 표시 |
| `src/lib/routes.ts` | 페이지 주소 상수. 아래 「페이지 주소」 표와 함께 고친다 |
| `scripts/smoke.mjs` | 최소 실행 검사(`check:run`) |
| `package.json` / `package-lock.json` | 의존성·스크립트·Node 버전 고정 |
| `.node-version` | Node.js 버전(버전 관리 도구용) |
| `.env.example` | 환경변수 목록 예시(포트는 여기서 못 바꿈) |
| `.npmrc` | `engine-strict=true` — Node 버전 강제 |
| `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` | Next.js·TypeScript·ESLint 설정(create-next-app 기본값) |
| `.gitignore` | `node_modules/`, `.next/`, `next-env.d.ts` 등 생성물 제외 |

## 코드 추가 위치

- 화면(라우트): 아래 「페이지 주소」의 주소를 쓰고, 헤더에 맞는 묶음 폴더 안에 둔다. 예: 내 자산은 `src/app/(member)/assets/page.tsx`, 수신자 링크는 `src/app/s/[token]/page.tsx`.
- 여러 화면이 함께 쓰는 컴포넌트: `src/components/`.
- API 호출·오류 응답 해석 등 화면과 분리되는 로직: `src/lib/`. `api-response.ts`가 [#88](https://github.com/JminAILab/CatchU/issues/88)의 응답 해석을 제공한다.
- 디렉터리는 필요할 때 만들고, 담당 화면 밖의 공통 구조 변경은 이슈에서 먼저 조율한다.

## 공통 레이아웃 (#106 PR①)

헤더는 화면 묶음 폴더의 `layout.tsx`가 붙인다. 괄호 폴더는 주소에 나타나지 않는다. 화면 파일을 알맞은 묶음에 두면 헤더를 따로 넣지 않아도 된다. **폴더 배치는 인증 판정이 아니다.** `(member)`에 두어도 토큰 없는 접근을 막지 않으며, 토큰 확인 중·미인증 상태의 헤더와 보호 화면 노출은 PR②의 회원 경로 가드에서 처리한다.

| 묶음 폴더 | 헤더 | 구성 (#55 10월 헤더 합의) |
|---|---|---|
| `src/app/(guest)/` | 비로그인 일반 | 왼쪽 로고(→ `/`) / 오른쪽 [Google로 시작하기](→ 로그인 진입). 내 자산·공유 링크·프로필은 없음 |
| `src/app/(member)/` | 로그인 일반·발행자 | 왼쪽 로고(→ `/home`)·내 자산·공유 링크·채용공고 / 오른쪽 알림·프로필. 대표 구성 진입점은 10월에 없음 |
| `src/app/s/` | 공유 링크 수신자 | 이동 없는 CatchU 브랜드만. 로그인 여부와 무관하며 로그인·프로필 버튼 없음 |

- **채용공고·알림:** 흐리게 표시하되 누를 수 있다(`disabled`를 쓰지 않는다). 누르면 현재 화면 위 안내창에 '개발 중인 기능입니다'와 [확인]을 띄우고, [확인]은 안내창만 닫는다. 열리면 [확인]에 초점이 가고, Tab은 안내창 밖으로 나가지 않으며, 닫으면 누른 메뉴로 초점이 돌아간다. X·Esc·바깥 클릭 닫기는 #55 미결이라 두지 않았다.
- **프로필:** 누르면 근처에 [프로필 보기](→ `/profile`)·[로그아웃] 메뉴가 열린다(#51). 로그아웃 요청·세션 처리는 PR②에서 `MemberHeader`의 `onLogout`으로 연결한다. 그전에는 [로그아웃]이 '연결 전' 표시와 함께 누를 수 없는 상태(`aria-disabled`)로 보인다.
- **조회 상태:** `src/components/status/status.tsx`의 세 컴포넌트를 쓴다. 불러오는 중은 `LoadingState`, `readApiResponse`가 `lookup-failed`를 돌려주면 `LookupFailedState`, 성공 응답의 빈 목록일 때만 `EmptyState`다. 조회 실패를 0건으로, 요청 중을 성공으로 표시하지 않는다.
- **스타일:** 컴포넌트 옆 CSS Modules(`*.module.css`)를 쓴다. 공통 색·폭은 `globals.css`의 `--color-*`·`--content-width` 변수를 쓴다. `globals.css`가 `body` 기본 여백을 없애므로 화면에서 여백을 되돌리는 음수 여백은 필요 없다.
- **미리보기:** `npm run dev` 뒤 `http://localhost:3000/preview/common`에서 세 헤더와 상태 표시를 모의 상태로 확인한다. 로그인 헤더는 실제 화면 상태(로그아웃 연결 전)와 모의 로그아웃 연결을 나란히 보여 준다. 배포용 실행에서는 404다. `127.0.0.1` 주소로 열면 개발 서버가 화면 스크립트를 막아 버튼이 동작하지 않으므로 `localhost`로 연다.

## 페이지 주소

**정본은 이 표이며, `src/lib/routes.ts`와 함께 고친다.** 구분: **확정** 결정 문서에 있음 / **제안** 담당자 확인 전 안 / **미정** 담당자가 정함. `[token]`·`[catchId]`·`…`는 자리표시자다. 근거: [9/24 팀장 결정](../docs/ai-dlc-input-mvp/2026-09-14_followup.md), [web 기능 설계 「내 자산 화면 구조」](../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md), #55 「10월 헤더 합의」, [#106 주소 표 초안](https://github.com/JminAILab/CatchU/issues/106#issuecomment-5865962875).

| 주소 | 화면 | 담당 | 로그인 | 구분 | 비고 |
|---|---|---|---|---|---|
| `/` | 서비스 소개 | D | 불필요 | 제안 | 로그아웃 성공 후 비로그인 홈 이동은 확정(#55) |
| `/login` | 로그인 진입 | A / 틀 D | 불필요 | 제안 | 회원 경로 가드의 이동 목적지(PR②) |
| `/home` | 로그인 후 홈 | D | 필요 | 제안 | CTA는 Catch 탭 저장소 연결 관리로 이동(확정) |
| `/profile/setup` | 최초 프로필 입력 (W02) | A | 필요 | 제안 | 저장 성공 후 `/home` |
| `/profile` | 상세 프로필 (W02-P) | A | 필요 | 제안 | 프로필 메뉴 [프로필 보기]의 목적지 |
| `/profile/edit` | 프로필 수정 (W02) | A | 필요 | 제안 | 저장·취소 후 `/profile`로 복귀 |
| `/profile/github` | GitHub 연동 (W02-G) | A | 필요 | 제안 | 성공 후 Catch 탭 저장소 연결 관리로 복귀(확정) |
| `/assets` | 내 자산 (Catch 탭) | B / 연결 관리 D | 필요 | 제안 | Catch 탭을 기본으로 표시. 준비 중 탭의 주소(`tab`) 반영 여부는 미정 |
| `/assets?repositoryId=…` | 저장소 필터 | B | 필요 | 제안 | PR #156의 B 제안. 값은 저장소 식별자 |
| `/assets?catchId=…` | Catch 상세 모달 | B | 필요 | 제안 | PR #156 제안: 닫으면 `catchId`만 제거하고 필터 유지. 새로고침·뒤로 가기·재로그인 후 상태 유지는 확정 |
| `/links` | 링크 목록·발급·복사·중단 | C | 필요 | 제안 | 발급은 이 페이지의 폼·모달로 처리 |
| `/s/[token]` | 수신자 링크 | C | 불필요 | 제안 | 수신자 전용 헤더 |
| `/s/[token]/catches/[catchId]` | 수신자 Catch 상세 | C | 불필요 | 제안 | 직접 진입해도 접근 판정·비밀번호 확인 후 표시 |

**주소 원칙(제안, PR②에서 적용):**
- 토큰 없이 회원 경로에 들어오거나 회원 API가 `AUTH_REQUIRED`·`AUTH_INVALID`를 돌려주면 `/login`으로 보낸다. 수신자 비밀번호 401은 수신자 화면에서 처리한다.
- `GET /v1/me` 성공 시 `profile.displayName`이 빈 문자열이면 `/profile/setup`으로 보낸다. 조회 중에는 판단을 미루고, 조회 실패는 다시 불러오기로 처리한다. 이미 `/profile/setup`이면 다시 보내지 않는다.
- 복귀 주소는 `/login?next=<인코딩한 경로>`로 넘기고 서비스 안 회원 경로만 허용한다. 토큰·grant는 주소에 넣지 않는다.
- 이름이 저장된 회원만 로그인 후 `next`로 복귀한다. 유효하지 않은 `next`는 `/home`으로 보내며, 최초 프로필 입력(`/profile/setup`)을 거친 경우에도 `/home`으로 이동한다.
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

정상 JSON은 그대로 반환하며 `EMPTY`·`PARTIAL_FAILED`·`FAILED` 같은 분석 결과를 HTTP 오류로 바꾸지 않는다. 204는 성공 데이터 null이다. 함수는 기능별 성공 스키마를 검증하지 않으므로 화면에서 확인해야 한다. 401도 회원 인증과 링크 비밀번호 오류를 code로 구분하며 자동 로그인 이동·토큰 처리·재시도는 하지 않는다. 해당 API 클라이언트 연결은 #106 범위다. 함수는 요청/응답이나 예외를 로그에 출력하지 않는다.

테스트는 새 의존성 없이 Node.js 24의 TypeScript 타입 제거와 `node --test`를 사용한다. 현재 package의 모듈 형식 미지정으로 `.ts`를 ES module로 재해석한다는 Node 경고가 나올 수 있으며, 테스트 실패는 아니다.

## 작업 규칙

- 착수·브랜치·기록·검토 기준은 [공통 작업관리](../docs/CatchU_작업관리.md)를 따른다.
- 화면 문구·상태는 각 흐름 초안(`docs/ai-dlc-input-mvp/`)과 승인 요구사항을 근거로 하고, 요청 중·저장 중을 성공으로, 조회 실패를 데이터 없음으로 표시하지 않는다.
- 브라우저 로그에는 민감정보를 출력하지 않는다.
- 로컬 실행 확인과 NCP 배포 검증은 각각 기록한다.
