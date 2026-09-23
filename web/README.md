# web — 사용자 화면

Next.js로 만드는 10월 MVP의 사용자 화면이다. 로그인·프로필·GitHub 연동, 홈·분석 상태, 본인 자산 확인·공개/숨김, 공유 링크·수신자 열람 흐름을 다룬다. 적용 범위는 [MVP 범위 문서](../aidlc/spaces/default/intents/260914-catchu-october-mvp/ideation/scope-definition/scope-document.md)와 담당 이슈의 완료 기준으로 확인한다.

이 README는 [#82 web 최소 실행 골격](https://github.com/JminAILab/CatchU/issues/82) 기준이다. 기능 화면·API 연결·인증은 아직 없고, 각 기능 이슈에서 추가한다.

## 요구 환경

| 항목 | 값 | 근거 |
|---|---|---|
| Node.js | 24.21.0 (`.node-version`, `package.json` `engines`) | 9/23 회의 공통 결정 |
| npm | 11 이상. 잠금 파일은 `package-lock.json` | [#81](https://github.com/JminAILab/CatchU/issues/81) 공통 설정 |
| 포트 | 3000 (api 3001, worker 8000) | [#81](https://github.com/JminAILab/CatchU/issues/81) 공통 설정 |
| Next.js / React | 16.3.6 / 19.2.8 | `package.json` |

모든 명령은 `web/` 디렉터리에서 실행한다. 저장소 루트에는 `package.json`이 없다(워크스페이스 미사용).

## 설치

```bash
cd web
npm ci
```

`npm ci`는 `package-lock.json`과 정확히 같은 버전을 설치한다. 의존성을 추가·변경할 때만 `npm install`을 쓰고, 바뀐 `package-lock.json`을 함께 커밋한다.

## 실행

| 목적 | 명령 | 확인 |
|---|---|---|
| 개발 서버 | `npm run dev` | http://localhost:3000 에 "CatchU web" 화면. 파일 수정 시 자동 반영 |
| 배포용 빌드 | `npm run build` | `.next/` 생성, 오류 없이 종료 |
| 빌드 결과 실행 | `npm run start` | `npm run build` 뒤에만 가능. 주소는 개발 서버와 같음 |

종료는 서버를 띄운 터미널에서 `Ctrl+C`. 포트 3000이 이미 사용 중이면 `PORT=3001 npm run dev`처럼 임시로 바꾸되, 팀 공통 포트는 3000이다.

## 검사

| 명령 | 내용 | 실패 예 |
|---|---|---|
| `npm run lint` | ESLint (`eslint-config-next` core-web-vitals + typescript) | 조건문 안의 React Hook 호출 |
| `npm run typecheck` | `tsc --noEmit`. 생성 파일(`next-env.d.ts`, `.next/types`) 없이도 통과해야 함 | `const n: number = "x"` |
| `npm run build` | 프로덕션 빌드 | 빌드 중 타입·import 오류 |
| `npm run check:run` | `scripts/smoke.mjs`: 빌드 결과를 `next start`로 띄워 `GET /`가 200이고 본문에 "CatchU web"이 있는지 확인 후 종료. **`npm run build` 이후에만 실행** | 서버 미기동, 200 아님, 본문 불일치 |
| `npm run check` | 위 4개를 순서대로 실행 | 하나라도 실패하면 중단 |

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
| `.env.example` | 환경변수 목록 예시 |
| `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` | Next.js·TypeScript·ESLint 설정(create-next-app 기본값) |
| `.gitignore` | `node_modules/`, `.next/`, `next-env.d.ts` 등 생성물 제외 |

## 코드 추가 위치

- 화면(라우트): `src/app/<경로>/page.tsx`. 예: 공유 링크 수신자 화면은 `src/app/s/[token]/page.tsx`처럼 이슈에서 정한 경로를 따른다.
- 여러 화면이 함께 쓰는 컴포넌트: `src/components/`.
- API 호출·오류 응답 해석 등 화면과 분리되는 로직: `src/lib/`. 오류 응답 공통 형식은 [#88](https://github.com/JminAILab/CatchU/issues/88)에서 추가한다.
- 디렉터리는 필요할 때 만들고, 담당 화면 밖의 공통 구조 변경은 이슈에서 먼저 조율한다.

## 작업 규칙

- 착수·브랜치·기록·검토 기준은 [공통 작업관리](../docs/CatchU_작업관리.md)를 따른다.
- 화면 문구·상태는 각 흐름 초안(`docs/ai-dlc-input-mvp/`)과 승인 요구사항을 근거로 하고, 요청 중·저장 중을 성공으로, 조회 실패를 데이터 없음으로 표시하지 않는다.
- 브라우저 로그에는 민감정보를 출력하지 않는다.
- 로컬 실행 확인과 NCP 배포 검증은 각각 기록한다.
