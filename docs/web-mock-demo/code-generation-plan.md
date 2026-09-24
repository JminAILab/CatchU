# CatchU web 모의 시연 구현 계획 — 팀 공유본

> **지위: 중단 (2026-09-24 팀장 결정) · 기록.** 2026-09-21 공유 당시 기록이며 소급 수정하지 않고 현행 기준으로 쓰지 않는다. 경위와 현행 기준은 [착수 안내](README.md)의 지위를 따른다.

2026-09-21 · intent `260920-catchu-web-mock` · express / Minimal

승인된 구현 계획의 배포용 사본이다. CI 착수 순서와 수신자 갱신 보정까지 재승인된 판본을 옮겼다. 기능·담당·검사 기준은 보존하고, 개인 작업 경로·소스 연결 운영·승인 명령을 팀용 브랜치 안내로 바꿨다. 원본과의 관계·편집 범위는 [출처와 사본 관리](provenance.md), 첫 작업은 [팀원 착수 안내](README.md)를 따른다. 체크박스의 Step 1은 계획 작성자의 준비 완료만 뜻하며 팀원 환경 준비나 앱 구현 완료가 아니다.

> **수신자 갱신 보정 반영:** [9/15 기준 유지 결정](https://github.com/JminAILab/CatchU/pull/74#issuecomment-5758191355)에 따라 원본에서 재승인된 OQ2를 반영했다. 열린 수신자 화면은 저장소 이벤트·탭 복귀만으로 자동 갱신하지 않고 다음 조회에서 현재 상태를 확인한다. 헤더·자산 공통 탭·분석→Catch 함수 책임은 [별도 조율 항목](README.md#관련-기능-구현-전에-조율할-접점)으로 남아 있다.

## Sources

- [이번 모의 시연 요구사항 참조](requirements-reference.md): FR1~FR8·NFR1~NFR4 및 범위. 실제 MVP의 같은 번호와 구분한다.
- [현행 레포 컨벤션](../CatchU_레포_컨벤션.md), [작업관리](../CatchU_작업관리.md): 문서는 dev 대상 PR, 코드 반영은 아래 승인된 시연 계획의 경로와 merge commit 원칙 적용.
- [PR #70](https://github.com/JminAILab/CatchU/pull/70), [PR #72](https://github.com/JminAILab/CatchU/pull/72)는 검토 입력이다. [PR #57](https://github.com/JminAILab/CatchU/pull/57)은 C 화면 자료다. 이 PR들의 제출·병합을 공식 설계 승인으로 간주하지 않는다.
- 사용자 승인 내용: 9/30 합성 시연, 홈 D·팀원 3, A 로그인·프로필·연동, 실패 후 명시적 분석 재요청만 허용. 팀원 1은 시연 화면·이동·핵심 내용을 먼저 정리한 뒤 CI 작성, 팀원 3 골격은 CI와 독립 진행.
- [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation), [Node 릴리스](https://nodejs.org/en/about/previous-releases), [Vitest 안내](https://vitest.dev/guide/). 아래 버전은 원본 계획의 9/21 조회값으로, 패키지 조합 설치 검증은 S에서 수행한다.

## 목표와 범위

9/30까지 합성 자료로 로그인·프로필 → 홈/연동 → 저장소/동의 → 분석 → Catch 확인/공개 → 링크 발행 → 비로그인 수신자 흐름을 연결한다. 9/21 골격, 9/23 정상 연결, 9/28~29 경계 보완·타인 재현, 9/30 시연은 목표이며 달성 보장이 아니다. 9/24~26 추가 인력·지원 시간을 가정하지 않는다.

web Next.js만 작성한다. 실제 OAuth/GitHub/LLM/API/DB/큐, api/worker 초기화, NCP 배포는 적용하지 않는다. 서버 API 계층·DB 마이그레이션·Docker/IaC 단계는 이번 코드 범위에 해당하지 않는다. 전체 기능을 골격 패키지에 넣지 않는다. 기존 실제 MVP의 책임·검사 기준과 [잔여 검증 조건](provenance.md#기존-실제-mvp-조건의-뜻)은 보존하며, 실험 자료·키·모델 응답·Claude 대화 기록을 읽지 않는다. 기존 자료 삭제 기한 9/23 23:59 KST 또는 관련 설계·구현 경계 중 이른 시점의 조건도 연장/해소하지 않는다.

## OQ별 구현 제안

### OQ1 — 화면 경로·프로필·이동

| 영역/작성자 | 경로와 동작 제안 |
|---|---|
| A / 팀원 2 | `/login` 모의 로그인 → 최초 `/profile?mode=onboarding` → 저장 후 D가 소유하는 `/home`으로 이동. 기존 프로필이면 바로 홈으로 이동. `/profile`의 수정 취소는 저장 전 값 유지 후 홈으로 복귀. 최초 작성 취소는 로그인으로 돌아가며 프로필 미완료 소유자 접근은 작성으로 안내. A는 이동·세션 계약을 소유하며 홈 UI는 작성하지 않음 |
| A / 팀원 2 | 표시 이름만 trim 후 필수. 한 줄 소개·직무·기술 태그는 선택. 이번 시연 공개 프로필은 이 네 필드만 허용하며 이메일·모의 내부 ID·연동 토큰은 표시하지 않음. 필드/공개 범위는 이번 계획의 제안이며 초안의 확정 정책으로 주장하지 않음 |
| D / 팀원 3 | `/home` 화면·프로필 표시·연동 상태 안내·프로필 수정/GitHub 연결을 위한 `/profile` 이동을 소유. `/profile`의 연결 버튼·저장 상태는 A 소유. `/assets/github` 저장소 선택·동의, `/analysis/[analysisId]` 진행/완료/실패도 D 소유. 미연동 홈 허용; 분석 버튼은 연결·선택·동의 모두 확인 |
| B / 팀원 4 | `/assets` Catch 목록, `/assets/[catchId]` 상세/설명/합성 근거/최소 생각 질문. 목록 복귀 시 선택한 repo/analysis 쿼리 유지. 상세 직접 접근 실패는 오류와 목록 복귀 제공 |
| C / 팀원 3 | `/links` 관리 목록, `/links/new` 발행, `/links/[linkId]` 성공 결과/중단. 발행 취소는 목록 복귀, 제출 중 취소/중복 제출 방지 |
| C / 팀원 3 | `/s/[token]`, `/s/[token]/catches/[catchId]`: 수신자 전용 레이아웃. 헤더는 발행자 프로필과 해당 링크 첫 화면으로만 이동. 소유자 로그인 여부와 무관하게 관리 메뉴 미표시 |

앱 최초 `/`는 `/login`으로 안내한다. 수신자 페이지에는 로그인 리다이렉트를 적용하지 않는다. 모의 소유자 화면은 탭 세션을 확인하고 필요시 로그인 안내; 복귀 경로는 위 소유자 내부 경로만 허용한다. 프로필은 현재 저장된 공개 필드를 표시하며 발행 시 스냅샷 동결을 도입하지 않는다. Catch 설명/근거는 합성 fixture로 고정하고 편집·재생성 UI는 만들지 않는다.

### OQ2 — 저장·식별자·재진입·시계

- 브라우저 `localStorage`의 `catchu.web-mock.v1`에 schemaVersion, revision, profile, githubConnected, analyses, catches, links, operations를 한 합성 상태로 저장한다. 모듈별 타입/변경 함수는 각 기능 작성자가 소유한다. DB 또는 서버 공유 저장소로 설명하지 않는다.
- 소유자 로그인은 탭별 `sessionStorage`에 둔다. 같은 브라우저·같은 origin의 새 탭에서 수신자 URL을 연다. 다른 브라우저/시크릿 창/다른 PC로 URL을 보내면 상태를 공유하지 않으며, 해당 시연은 이번 완료 범위 밖임을 README와 안내에 명시한다.
- **소유자 화면·공통 저장:** 저장 성공을 소유자 화면에 반영하고 공통 저장 어댑터의 읽기/쓰기·같은 origin 변경 전달 기능을 유지한다. 소유자 화면의 `storage` 이벤트·탭 활성화·페이지 이동에 따른 상태 확인을 제거하지 않는다. 아래 수신자 정책을 공통 저장 기능 전체의 삭제로 구현하지 않는다.
- **이미 열린 수신자 화면:** 소유자가 다른 탭에서 Catch를 숨기거나 링크를 중단해도 `storage` 이벤트 또는 탭 복귀(focus/visibilitychange)만으로 자동 재조회·회수·갱신하지 않는다. 공통 저장 상태의 변경 알림을 수신자 화면의 자동 재검사에 연결하지 않는다.
- **수신자의 다음 조회:** 최초 진입, 새로고침, 목록/상세 재조회와 해당 조회를 수반하는 이동에서는 저장소의 현재 링크 상태·만료·공개 여부를 다시 확인한다. 숨긴 Catch는 목록에서 제외하고 직접 상세에서도 본문을 제공하지 않으며, 중단/만료 링크는 거부한다. 단순 탭 복귀는 다음 조회로 세지 않는다. 최초 복원/다음 조회가 진행되는 동안에는 로딩만 표시하고, 접근 확인 전에 이전 본문이나 숨김 자료가 잠깐 나타나지 않게 한다. 열린 화면 자동 회수 없음이 다음 조회의 접근 검사 생략이나 발행 시 본문 동결을 뜻하지 않는다.
- repo ID는 fixture의 안정 ID, analysis ID는 최초 요청 또는 실패 후 명시적 재요청에만 새로 부여하며 완료한 분석의 재분석은 제공하지 않는다. Catch ID는 repo ID + fixture evidence key로 안정화한다. 실패 후 재요청 결과는 기존 Catch에 upsert하며 확인/공개 상태를 덮어쓰지 않는다. 링크 token은 매 발행 새 ID로 생성하며 중단/만료 ID를 재사용하지 않는다.
- UTC epoch 밀리초로 발행 시각과 만료 시각을 저장하고 `expiresAt = issuedAt + 30 * 24 * 60 * 60 * 1000`; `now >= expiresAt`이면 거부한다. 모의 시계는 주입 가능하게 하며 만료 경계 시나리오는 실제 시스템 시간을 바꾸지 않는다.
- 시연 도구의 초기화는 이 namespace와 모의 세션/비밀번호 통과 기록만 지우고 seed를 복원한다. 다른 localStorage는 지우지 않는다. 초기화/손상 상태/저장 실패를 정상 성공으로 표시하지 않는다. 읽기 실패는 오류·재시도·명시적 초기화 안내로 처리하며 자동 seed 덮어쓰기 금지.
- 골격은 이 어댑터와 한 가지 seed 예시만 제공한다. 도메인별 상세 모델·상태 전이는 A/B/C/D 작업에서 추가한다. 동시 여러 소유자 탭 쓰기는 시연 지원 범위 밖이며 실제 분산 경합 제어를 주장하지 않는다.

### OQ3 — 실패·재조회·중복·불일치·비밀번호

| 구분 | 구체 제안 |
|---|---|
| 시나리오 선택 | 소유자 전용 모의 도구에서 success, empty-result, analysis-failed, query-failed, write-failed, issue-unknown-committed, issue-unknown-not-committed를 선택. 수신자 관리 헤더에는 도구를 넣지 않음 |
| 분석 | 명시적 요청은 같은 repo의 동의와 연결 상태를 검증. pending 요청에는 동일 operation ID를 반환. pending → completed/failed 전환은 저장된 상태로 시연하며 페이지 재방문은 조회만 수행 |
| 재요청 | 분석 상태가 failed일 때만 사용자의 명시적 재요청으로 새 analysis ID 생성. completed(성공 0건 포함)는 결과 재조회만 제공하고 재분석 버튼·서비스 전이는 만들지 않음. pending은 기존 요청 조회, query-failed는 기존 요청의 조회 재시도만 제공. 기존 Catch·공개 상태·발행 링크 유지와 동일 합성 근거 중복 방지를 검사 |
| 공개/숨김 | 저장 성공 뒤에만 UI 성공 확정. 실패는 마지막 성공 상태 유지. 전역 공개 여부를 수신자 목록·직접 상세에서 매번 확인 |
| 불일치 | 불일치 표시는 확인과 분리. 공개 중이면 같은 성공한 상태 변경에서 숨김으로 전환. 불일치 취소는 unreviewed로 복귀하고 숨김 유지. 확인 완료도 숨김 유지. 재공개는 불일치 해제 후 별도 공개 버튼을 눌러야 하며 설명 편집/재생성은 제공하지 않음 |
| 발행 | 제목 trim, 빈 제목 거부, 활성 링크끼리 정확히 같은 trim 제목 중복 거부. 대소문자/유니코드 추가 정규화·길이 상한 없음. 유효 링크 5개 한도. operation ID로 결과 조회/재시도 결합 |
| 발행 응답 불명 | URL/성공 화면을 표시하지 않고 ‘결과 확인’ 제공. committed 시나리오는 기존 operation의 결과를 확인한 후 같은 URL 한 번만 표시; not-committed는 미접수 확인 뒤 같은 operation으로 재시도. 불명 상태에서 다른 발행을 막아 중복을 피함. 실제 서버 멱등성 검증 주장은 하지 않음 |
| 비밀번호 | 발행할 때 선택 설정. 비교용 합성 값만 사용하고 실제 비밀번호 입력 금지 안내. 발행 후 변경/해제 UI 없음. 변경 필요시 기존 링크 중단 → 다른 token으로 새 발행 |
| 인증 유지 | 통과 기록을 탭 sessionStorage에 token+상태 generation 단위로 저장. 같은 탭 새로고침에는 유지, 새 독립 탭에서는 재입력. 테스트/안내에서 새 탭은 opener 없이 열어 세션 복제를 방지. 매 목록/상세 접근에 링크 상태·만료·현재 공개 여부 재검사; 중단/만료/초기화 시 통과 기록 무효 |
| 수신자 읽기 | 중단/만료/미존재/비밀번호 오입력/숨김 상세는 본문 비노출. 링크 중단과 자산 숨김은 독립. 공개 자산 0건은 유효한 빈 화면, 조회 실패는 오류. 비밀번호는 클라이언트 시연이며 보안 기능으로 주장하지 않음 |

### OQ4 — 작업 패키지와 파일 소유

아래 코드 경로는 **각 팀원의 CatchU clone 기준**이며 아직 생성된 앱 파일을 뜻하지 않는다. 아래 S/CI/A/B/C/D/I/R은 협업 패키지 이름으로, AI-DLC Unit/Bolt를 생성하지 않는다. 각 작성자는 자기 구현·검사·결함 수정 책임을 가진다. 검토자는 모두 제안이며 사람의 수락/PR 승인 전 확정 완료로 쓰지 않는다.

| 패키지 | 작성자 / 검토자 제안 | 소유 파일·결과물 | 선행·완료 기준 / 검사 |
|---|---|---|---|
| S 최소 골격 | 팀원 3 / 팀원 2(팀원 4 대안) | `web/package.json`, `package-lock.json`, `.nvmrc`, `.npmrc`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `eslint.config.mjs`, `vitest.config.ts`, `src/test/setup.ts`, `src/app/layout.tsx`, `page.tsx`, `globals.css`, `src/components/mock-banner.tsx`, `src/lib/mock/{storage,seed,clock}.ts`, `web/README.md`, `web/.env.example`, `web/.gitignore` | 승인·실제 작업 위치 확인 후 CI 착수·완료를 기다리지 않고 진행. 실행 껍데기·모의 배너·seed 1개·저장 어댑터·runner까지. 전체 로그인/분석/링크 기능 제외. 로컬 설치·실행·G0 + TS 검사 성공 후 PR 검토·타인 로컬 재현 가능. 병합은 CI 통과 후 |
| CI PR 검사 | 팀원 1 / 팀원 4(팀원 2 대안) | `.github/workflows/web-pr.yml`; README의 CI 설명 | 팀원 1이 승인된 요구사항 안에서 9/30 시연의 화면·이동 순서·화면별 핵심 내용 정리를 마친 뒤 CI 작성 시작. 구체 착수 날짜 미정. 모든 화면 디자인/구현 완성은 선행 조건 아님. scripts 계약 사용. 첫 코드 PR 병합 전 실제 G0 통과, 실패가 merge 차단 조건임을 확인. 자동 배포/서버 job 없음 |
| A 로그인·프로필·GitHub 연동 | 팀원 2 / 팀원 4 | `src/app/login/page.tsx`, `src/app/(owner)/layout.tsx`, `src/app/(owner)/profile/page.tsx`; `src/features/profile/{model,repository,service,profile-screen,owner-session}.ts[x]` | S 최소 인터페이스 후 착수, CI 완료/팀원 1 페어링은 작성 선행 아님. 홈으로 이동하는 계약까지이며 홈 렌더는 D. FR1·NFR2. TA + G0 |
| D 홈·저장소·분석 | 팀원 3 / 팀원 2 | `src/app/(owner)/home/page.tsx`, `src/features/home/home-screen.tsx`, `src/app/(owner)/assets/github/page.tsx`, `src/app/(owner)/analysis/[analysisId]/page.tsx`; `src/features/analysis/{model,repository,service,repo-select-screen,analysis-screen}.ts[x]` | S 후 A의 profile/연동 계약을 fixture로 사용해 홈부터 작성 가능. FR1/2/3, 분석 실패 후 재요청·기존 상태 보존, 완료 분석은 재조회만. TD + G0 |
| B Catch 확인·공개 | 팀원 4 / 팀원 2 | `src/app/(owner)/assets/page.tsx`, `assets/[catchId]/page.tsx`; `src/features/catches/{model,repository,service,catch-list,catch-detail}.ts[x]` | S 후 D의 결과 fixture 계약으로 병행; D 완성 대기 불필요. FR4/5/6. TB + G0 |
| C 발행·수신자 | 팀원 3 / 팀원 4 | `src/app/(owner)/links/{page,new/page,[linkId]/page}.tsx`; `src/app/s/[token]/{layout,page,catches/[catchId]/page}.tsx`; `src/features/links/{model,repository,service,link-editor,link-list,recipient-view,recipient-session}.ts[x]` | 팀원 3은 S → D 정상 경로 → C 정상 경로 순으로 배치. A/B 계약 fixture로 개발 가능, 최종 연결은 A/B/D 모두 필요. FR7/8. TC + G0 |
| I 통합·경계 보완 | 각 기능 작성자, 팀원 1 비동기 조율 / 팀원 2·4 교차검토 | `src/features/demo/demo-controls.tsx`, `src/test/web-mock/flow.test.tsx`, 각 담당 경계 수정, README 시나리오 | 정상 흐름 연결 후 실패·만료·공개 갱신 검증. 팀원 3이 demo-controls/flow 조립, 각 작성자가 자기 결함 수정. TI + G0 + M1~M5 |
| R 타인 재현 | 골격 비작성자 팀원 2 제안 / 팀원 4 대안; 작은 PR 검토 팀원 3 | 새 clone 설치/실행/종료/검사 기록, 작은 변경 PR, PR/CI URL과 SHA·실행 환경 증거 | S 로컬 준비 후 CI 전에도 1차 로컬 재현 가능, 9/28~29 전체 연결 재현 제안. 아직 수락·실행 증거 없음. TR + 로컬 G0, 전체 연결 후 M1~M5. 실제 CI·PR 승인 증거는 병합 전 별도 확인 |

각 패키지는 해당 `src/test/web-mock/` 아래 테스트 파일도 소유한다(정확한 목록은 테스트 지침). A는 profile/, D는 home/ui.test.tsx와 analysis/를 소유한다. 표의 .ts[x]는 순수 모델/저장/서비스 .ts, UI .tsx라는 표기이며 실제 생성 경로는 source-manifest에 정확히 기록한다.

공통 `package.json`/lock/runner/root layout/storage/seed/README 틀은 팀원 3 소유. 새 의존성이나 공통 인터페이스 변경은 작성자가 이유·영향을 PR에 적고 팀원 3과 비동기로 조율하며 동시 lockfile 편집을 피한다. CI 파일은 팀원 1 소유, 기능 폴더는 해당 작성자 소유. A가 제공하는 profile/연동 상태 읽기·변경 및 세션 계약을 D의 홈·분석에서 사용하고 서로 파일을 복사하지 않는다. 홈 표시/홈 버튼 검사는 D, 프로필 저장·연동 변경과 홈 목적지 이동 검사는 A다. domain 저장 포맷 추가는 기능 작성자가 제안하고 S 소유자가 합성 root schema/seed 조립을 반영한다. 소유는 타인의 수정 금지나 CODEOWNERS 도입을 뜻하지 않는다.

### OQ5 — 도구·명령·CI

**착수 관계:** 팀원 1의 시연 흐름 정리 → CI 작성. 정리 결과에는 승인된 요구사항 범위의 화면 목록·이동 순서·화면별 핵심 내용과 요구사항 대응을 남긴다. 정리가 끝나면 CI에 착수하며 구체 날짜는 아직 확정하지 않는다. 모든 화면의 디자인·구현 완성이나 별도 설계 승인 단계를 기다리는 조건을 추가하지 않는다. 이 정리는 팀원 1의 선행 작업이며 팀원 3 골격의 선행 조건이 아니다.

팀원 3은 CI와 독립적으로 골격 설치·실행·lint·타입 검사·테스트·빌드까지 진행한다. 골격이 먼저 준비되면 첫 PR의 골격 부분 검토와 타인 로컬 재현을 진행할 수 있다. 첫 PR의 최종 구성은 S+CI로 유지하며, CI가 준비되고 실제 통과하기 전까지는 **첫 병합이 대기할 수 있다**. 선행 로컬 검사·리뷰는 CI 성공으로 대체 기록하지 않는다.

제안 조합: Node **24.21.0**, 동봉 npm **11.19.0**, Next **16.3.5** App Router, React/React DOM **19.3.0**, TypeScript, ESLint와 동버전 eslint-config-next, Vitest **5.0.1** + jsdom + React Testing Library. 추가 UI 프레임워크 없이 CSS로 시작한다. TypeScript/ESLint/jsdom/Testing Library 등 나머지 정확 버전은 S에서 이 조합의 peer/engine 조건을 확인하고 최초 lockfile·README에 고정한다. 최신판 자동 추종은 하지 않는다. API 호환 실패 시 숨기거나 검사를 끄지 않고 조합 변경 근거를 검토한다.

패키지 경계는 `web/` 하나이며 루트 workspace/api/worker 설치는 하지 않는다. `.nvmrc`, package의 engines/packageManager, `.npmrc save-exact=true`, 커밋할 npm lockfile 하나로 맞춘다. 처음 의존성 해소 후 다른 작성자/CI는 `npm ci`. `NEXT_PUBLIC_DEMO_MODE=true`만 들어간 예시를 제공하되 모의가 기본이고 real 연결 모드 자체는 없다.

scripts 계약: `dev = next dev`, `start = next start`, `lint = eslint . --max-warnings=0`, `typecheck = next typegen && tsc --noEmit`, `test = vitest run`, `build = next build`. 브라우저 저장소 접근은 client 경계에서만 수행한다. 외부 폰트 다운로드나 실제 API 호출을 빌드/화면에 넣지 않는다. 정확 실행 명령·경로 필터는 [테스트 지침](unit-test-instructions.md).

CI는 GitHub Actions `pull_request`에서 intent 작업 브랜치와 dev 대상 PR의 합쳐질 결과를 검사한다. 읽기 권한만 사용, Node는 `web/.nvmrc`, npm cache는 web lockfile, working-directory web. job 이름 `web-checks`: npm ci → lint → typecheck → 지정 web-mock 테스트 디렉터리 → build. `passWithNoTests`/continue-on-error/빈 성공 job 금지. 패키지가 없는 CI 단독 선행 병합 대신 S+CI를 첫 PR에 함께 넣는다. 워크플로에 paths 필터를 두어 required check가 영구 pending 되지 않게 하는 문제는 피하고, 이 시연 PR에서는 job을 항상 실행한다. Actions 버전은 구현 시 공식 지원판의 고정 commit SHA를 검토해 사용한다.

### OQ6 — 팀 작업 브랜치·PR 반영 경로

실제 저장소는 [JminAILab/CatchU](https://github.com/JminAILab/CatchU)이며 코드 계획의 확인 기준 dev SHA는 `314a5fde1d2109683e139f2c5b7724289fb0852c`다. 각자는 본인의 별도 clone을 사용한다. 공통 기반이나 작업 브랜치가 원격에 존재한다고 가정하지 말고 원격 공유 후 전달된 기준 SHA를 확인한다. 앱·CI 파일은 각 clone의 `web/`, `.github/workflows/`에 작성한다.

| 용도 | 작업 브랜치 | PR 대상 |
|---|---|---|
| 팀원 3 최소 골격 | `web/mock-skeleton` | `web/catchu-web-mock` |
| 팀원 1 CI | `web/mock-ci` | 최종적으로 골격 브랜치에 결합해 첫 S+CI PR에 포함 |
| 팀원 2 A | `web/mock-a` | `web/catchu-web-mock` |
| 팀원 4 B | `web/mock-b` | `web/catchu-web-mock` |
| 팀원 3 D / C | `web/mock-d` / `web/mock-c` | `web/catchu-web-mock` |
| 시연 통합 | `web/catchu-web-mock` | `dev` |
| 이번 공유 문서 | `docs/web-mock-team-handoff` | `dev` |

코드 경로는 [PR #16의 예외 동의](https://github.com/JminAILab/CatchU/pull/16#issuecomment-5630201390)와 [컨벤션 「2.1 AI-DLC intent 브랜치 예외」](../CatchU_레포_컨벤션.md#21-ai-dlc-intent-브랜치-예외)를 이번 계획에 적용한다. 별도 Unit/Bolt를 생성하지 않고 이 절의 작업 브랜치를 사용한다. 상시 영역 통합 브랜치를 새로 두는 결정이 아니다. 문서 PR은 현행 문서 컨벤션과 양식대로 dev에 제출하며 앱·CI 첫 PR과 구분한다.

준비 책임은 팀원 1 `ljm0850`이다. 원격 공동 브랜치·기준 SHA·독립 checkout·PR 대상·안내 판본을 골격 실행 이슈와 PR #74에 공유한다. 팀원별 로컬 준비와 GitHub 보호 설정 완료는 별도로 확인한다. 이 문서 보완으로 원격 코드 브랜치를 생성한 것은 아니다.

1. 코드 작업은 확인한 dev SHA에서 intent 브랜치를 만들고 작업 브랜치를 나누는 승인 계획을 따른다. 다른 팀원의 미커밋 작업이나 PR 브랜치를 덮어쓰지 않는다.
2. 골격 준비 후 같은 첫 S+CI PR을 CI 추가 대기 상태로 열어 골격 검토·타인 로컬 재현을 먼저 진행할 수 있다. 팀원 1은 시연 흐름 정리 후 CI를 작성하고, 팀원 3이 CI 커밋을 골격 브랜치에 merge하여 같은 PR에 추가한다.
3. 첫 PR의 최종 구성은 S+CI다. 최종 SHA의 실제 CI 통과·작성자 외 승인 1건 이상·리뷰 대화 해소 후 merge commit으로 intent 브랜치에 반영한다. 골격이 먼저 끝나도 CI 미준비/실패면 병합 대기다.
4. A/B/C/D는 S 인터페이스 이후 fixture로 작성 가능하며 S+CI 병합 후 기준을 맞춘다. 각 PR에도 CI·타인 승인·merge commit을 적용한다.
5. 연결 시연·타인 재현 증거를 갖춘 뒤 intent → dev 최종 PR. main 반영·배포는 이번 계획에 포함하지 않는다. 공유 이력을 임의 rebase/강제 push하지 않는다.

원본 기록을 관리하는 AI-DLC 세션은 같은 intent에서 이어간다. 팀원에게 로컬 하네스나 승인 영수증을 복사해 실행 권한으로 쓰게 하지 않는다. 새 intent 생성·요구사항 재작성은 코드 checkout 준비의 기본 절차가 아니다. 계획·테스트 내용 변경이 필요하면 원본 관리자가 같은 단계의 공식 재승인을 먼저 처리하고 공유본을 갱신한다.

### OQ7 — 타인 재현 제안과 증거

팀원 2를 골격 비작성자 재현 담당, 팀원 4를 대안으로 제안한다. 골격의 로컬 설치·실행·검사가 준비되면 CI 착수·완료 전에도 새 작업 폴더에서 README만으로 1차 재현할 수 있다. 첫 S+CI PR 검토와 함께 진행하되 CI 미준비 상태는 병합 대기로 표시한다. 팀원 3의 실시간 안내를 성공 조건으로 두지 않는다. 9/28~29에는 전체 연결을 같은 방식으로 재현한다. 이는 수락/일정 확보 증거가 아니며 현재 완료라고 기록하지 않는다. 새 숙련도 조사·지원 시간 계산·팀원 1 페어링을 골격 착수 조건으로 추가하지 않는다.

재현자는 저장소 URL/기준 SHA/Node·npm/OS, 설치·실행·종료·검사·빌드 결과, 발견/수정된 안내 결함, 정상/경계 관찰을 남기고 작은 변경 PR(예: 본인이 발견한 README 재현 설명 수정)을 실제 제출한다. 작성자가 만든 문서·계획 승인·복구 진단은 이 증거를 대신하지 않는다. PR 승인과 CI 결과도 별도 확인한다.

## 구현 순서와 요구사항 추적

아래 Step은 체크리스트 식별자다. 병행 가능한 패키지를 직렬 착수 조건으로 바꾸지 않는다. 각 기능 내부에서는 모델 → 저장 → 서비스 → UI 순으로 **각 계층 구현 직후 해당 테스트 작성·실행**을 반복한다. 전 기능을 다 구현한 뒤 테스트를 몰아서 쓰지 않는다.

- [x] **Step 1 — 작업 기반 확인**: 계획 작성자의 별도 clone·기준 SHA·로컬 브랜치·소스 연결·공식 승인 유효성 확인 완료. 팀원별 checkout과 원격 코드 브랜치 공유 완료를 뜻하지 않는다. 팀 안내는 OQ6과 README를 따른다. NFR3/4, OQ6.
- [ ] **Step 2 — S 구조/설정**: 팀원 3이 CI 착수·완료와 무관하게 web 설정·최소 root 화면·모의 배너·README 틀 작성. 팀원 1은 먼저 시연의 화면·이동 순서·화면별 핵심 내용을 승인된 요구사항 안에서 정리하고, 완료 후 CI 작성에 착수한다(날짜 미정). 팀원 1의 정리 완료도 S의 선행 조건이 아니다. NFR1/3/4, OQ4/5.
- [ ] **Step 3 — S runner 준비**: Vitest/jsdom/RTL 설정과 test/setup 생성, runner 버전/명령 확인. 첫 실행 테스트 전에 완료. TS의 정확한 파일 명령 준비. NFR3/4.
- [ ] **Step 4 — S 데이터/저장 계층**: seed/schema/clock 구현 후 경계 테스트, 이어 storage 어댑터 구현 후 복원/손상/저장실패 테스트. `shared/model.test.ts`, `shared/storage.test.ts`; TS 실행. FR3/6/8 기반, NFR1/3.
- [ ] **Step 5 — S 최소 화면**: 배너·로딩/복원오류·seed 표시 구현 후 `shared/shell.test.tsx` 작성/TS 실행. 로그인·분석·링크 기능은 아직 제외. NFR1/2/4.
- [ ] **Step 6 — CI 결합과 첫 PR**: S 로컬 설치·실행·TS·G0 통과 후 CI 전에도 PR의 골격 검토·타인 로컬 재현 진행 가능. 팀원 1의 시연 흐름 정리 완료 → CI 작성 순서를 확인하고, 준비된 CI를 같은 첫 S+CI PR에 결합한다. 최종 PR의 실제 CI G0 통과·타인 승인·리뷰 대화 해소 후에만 merge commit으로 intent 반영. CI 실패는 각 작성자가 수정. 골격이 먼저 완료되면 CI 때문에 첫 병합이 대기할 수 있으며, CI 날짜나 전체 화면 완성 조건은 추가하지 않는다. NFR3/4.
- [ ] **Step 7 — A**: profile 모델 후 테스트, 저장/세션 후 테스트, 입력·GitHub 연동 서비스 후 테스트, 로그인/프로필 UI와 홈으로의 이동 계약 후 테스트. 홈 UI/표시 검사는 포함하지 않음. TA 실행 및 G0. S 인터페이스 후 D/B와 병행. FR1, NFR1/2.
- [ ] **Step 8 — D**: A 계약 fixture를 사용하는 홈 화면·안내·이동 구현 후 home/ui.test.tsx 실행. 이어 분석 모델 후 테스트, 요청/재조회 저장 후 테스트, 동의·중복방지·실패 후 재요청 서비스 후 테스트, 선택/진행 UI 후 테스트. completed 재분석 거부와 query-failed 조회 재시도 구분 포함. TD 및 G0. 홈 착수는 A 실제 UI 완성에 종속되지 않음. FR1/2/3, NFR2.
- [ ] **Step 9 — B**: Catch 모델 후 테스트, upsert/공개 저장 후 테스트, 확인/불일치/공개 서비스 후 테스트, 목록/상세 UI 후 테스트. TB 및 G0. D fixture로 병행. FR4/5/6, NFR2.
- [ ] **Step 10 — C**: 링크/수명 모델 후 테스트, operation/링크 저장 후 테스트, 제목·한도·발행·접근 서비스 후 테스트, 발행/수신자 UI 후 테스트. TC 및 G0. FR7/8, NFR2.
- [ ] **Step 11 — I 연결**: domain root schema/seed와 라우트를 연결하고 실패 선택 도구 구현, 이후 flow 통합 행동 테스트 작성/TI 실행. M1~M5로 실제 브라우저 새 탭/만료/직접 상세까지 검사. FR1~FR8, NFR1/2/3.
- [ ] **Step 12 — R 재현·최종 PR 증거**: README 완성, G0 및 TR 실제 수행, 작은 변경 PR·타인 승인·CI 기록, 최종 intent→dev 검토. 구현 source-manifest·code-summary·traceability는 실제 작성/검사 후 공식 단계에서 생성한다. NFR3/4.

테스트 파일과 시나리오의 상세 매핑은 테스트 지침을 함께 승인한다. 소스/테스트가 없는 현재는 실행 통과·PR 준비 완료·시연 완료를 주장하지 않는다.

| 요구사항 | 구현 단계 | 필수 검사 |
|---|---|---|
| FR1 | Step 7/8 | TA, TD(home), M1 |
| FR2 | Step 8 | TD, M2 |
| FR3 | Step 4/8/9 | TS, TD, TB, M2 |
| FR4 | Step 9 | TB, M1 |
| FR5 | Step 9 | TB, M3 |
| FR6 | Step 4/9/10/11 | TS, TB, TC, TI, M3 |
| FR7 | Step 10 | TC, M4 |
| FR8 | Step 10/11 | TC, TI, M4/M5 |
| NFR1 | Step 2/4/5/7~11 | TS와 각 UI 검사, M1/M5 |
| NFR2 | Step 5/7~11 | 각 UI 검사, M1~M5 |
| NFR3 | Step 3~12 | 패키지 검사와 G0, PR CI/리뷰 증거 |
| NFR4 | Step 2/6/12 | TS, G0, TR 실제 재현/작은 변경 PR |

## Assumptions & Open Questions

- OQ1~OQ6은 이번 모의 시연 계획으로 승인됐다. 실제 서비스 설계 전체의 승인으로 확대하지 않는다.
- OQ7 실제 재현 담당의 수락·실행 시점과 팀원별 checkout·원격 코드 브랜치 준비는 실행 시 확인한다. 계획 작성자 환경의 준비를 팀 전체 준비로 확대하지 않는다.
- 패키지 exact lock/호환성은 설치 허용 후 S에서 검증한다. 변경이 필요한 경우 원인과 영향이 드러나는 계획/PR 갱신을 한다.
- 9/23 정상 연결이 늦으면 실제 서비스 연결/장식 요소를 넣어 만회하지 않고 남은 필수 행동과 담당별 결함을 보고한다. 합의 목표·완료 기준을 조용히 축소하지 않는다.

## 검사 계약 — 팀 적용 요약

원본의 기계 판독용 계약 대신 이번 시연에 적용되는 내용을 옮겼다. 원본 계약·승인 기록은 배포하지 않는다.

- express / Minimal, test-after: 적용되는 모델 → 저장 → 서비스 → UI 계층을 구현한 직후 해당 검사를 작성·실행한다.
- 첫 테스트 실행 전에 최소 runner/config와 정확한 실행 명령을 준비한다.
- 요구사항당 검증 가능한 검사와 컴포넌트별 정상 경로를 최소 기준으로 두고 기존 검사를 유지한다. 파일별 정상/오류·경계 사례는 테스트 지침을 따른다.
- 선택적 80% 커버리지를 추가하지 않는다. G0, 실제 PR CI, 타인 승인·재현 기준은 유지한다.
- 실제 DB/API 계층은 이번 구현에 해당하지 않는다. 브라우저의 합성 모델·저장 어댑터·서비스·화면을 검사한다.
- 세부 명령·FR/NFR 대응·완료 증거는 위 표와 [테스트 지침](unit-test-instructions.md)에 따른다.
