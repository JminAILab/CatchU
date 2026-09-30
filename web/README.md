# web — 사용자 화면

Next.js로 만드는 10월 MVP의 사용자 화면이다. 로그인·프로필·GitHub 연동, 홈·분석 상태, 본인 자산 확인·공개/숨김, 공유 링크·수신자 열람 흐름을 다룬다. 적용 범위는 [MVP 범위 문서](../aidlc/spaces/default/intents/260914-catchu-october-mvp/ideation/scope-definition/scope-document.md)와 담당 이슈의 완료 기준으로 확인한다.

이 README는 [#82 web 최소 실행 골격](https://github.com/JminAILab/CatchU/issues/82) 기준이다. 기능 화면·API 연결·인증은 아직 없고, 각 기능 이슈에서 추가한다.

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
| `src/app/layout.tsx` | 루트 레이아웃(`<html lang="ko">`, 기본 메타데이터) |
| `src/app/page.tsx` | `/` 기본 화면. 골격 확인용 문구만 있음 |
| `scripts/smoke.mjs` | 최소 실행 검사(`check:run`) |
| `package.json` / `package-lock.json` | 의존성·스크립트·Node 버전 고정 |
| `.node-version` | Node.js 버전(버전 관리 도구용) |
| `.env.example` | 환경변수 목록 예시(포트는 여기서 못 바꿈) |
| `.npmrc` | `engine-strict=true` — Node 버전 강제 |
| `next.config.ts` | Next.js 설정. `agentRules: false`로 `npm run dev`가 `web/`에 `AGENTS.md`·`CLAUDE.md`를 자동으로 만들지 않게 한다 |
| `tsconfig.json`, `eslint.config.mjs` | TypeScript·ESLint 설정(create-next-app 기본값) |
| `.gitignore` | `node_modules/`, `.next/`, `next-env.d.ts` 등 생성물 제외 |

## 코드 추가 위치

- 화면(라우트): `src/app/<경로>/page.tsx`. 예: 공유 링크 수신자 화면은 `src/app/s/[token]/page.tsx`처럼 이슈에서 정한 경로를 따른다.
- 여러 화면이 함께 쓰는 컴포넌트: `src/components/`.
- API 호출·오류 응답 해석 등 화면과 분리되는 로직: `src/lib/`. `api-response.ts`가 [#88](https://github.com/JminAILab/CatchU/issues/88)의 응답 해석을 제공한다.
- 디렉터리는 필요할 때 만들고, 담당 화면 밖의 공통 구조 변경은 이슈에서 먼저 조율한다.

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
- Next.js 16은 이전 판과 API·파일 규칙이 달라진 부분이 있다. 사람이든 AI든 Next.js 코드를 쓰기 전에 설치된 판본의 문서 `node_modules/next/dist/docs/`를 확인한다.
- 화면 문구·상태는 각 흐름 초안(`docs/ai-dlc-input-mvp/`)과 승인 요구사항을 근거로 하고, 요청 중·저장 중을 성공으로, 조회 실패를 데이터 없음으로 표시하지 않는다.
- 브라우저 로그에는 민감정보를 출력하지 않는다.
- 로컬 실행 확인과 NCP 배포 검증은 각각 기록한다.
