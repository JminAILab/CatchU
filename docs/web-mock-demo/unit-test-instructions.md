# CatchU web 모의 시연 테스트 지침 — 팀 공유본

2026-09-21 KST · `260920-catchu-web-mock` · express / Minimal · 승인 판본 공유

[구현 계획](code-generation-plan.md)과 그 Testing Contract를 함께 따른다. **아래는 구현 이후 실행할 명령·기대 결과이며 이번에 실행한 앱 검사가 아니다.** 모든 실행 경로는 각 팀원의 CatchU clone의 `web/` 기준이다. 원본과 공유본의 관계는 [출처와 사본 관리](provenance.md)를 따른다.

홈 화면·home/ui.test.tsx는 D·팀원 3 소유이며 A·팀원 2는 로그인·프로필·GitHub 연동과 홈 목적지로 이동하는 계약을 검사한다. 분석 재요청은 failed 후 사용자 명시 동작만 허용한다. completed(0건 포함)는 재조회만, query-failed는 조회 재시도만 수행한다.

코드 브랜치와 PR 대상은 [구현 계획 OQ6](code-generation-plan.md#oq6--팀-작업-브랜치pr-반영-경로), 첫 작업은 [팀원 착수 안내](README.md)를 따른다. 팀원별 checkout·기준 SHA 확인 후 구현 순서에 맞춰 설치/검사를 실행한다. 새 intent·요구사항 재작성·승인 영수증 복사를 준비 조건으로 두지 않는다.

## 검사 범위와 순서

- 팀원 1은 승인된 요구사항 안에서 9/30 시연의 화면·이동 순서·화면별 핵심 내용 정리를 마친 뒤 CI 작성을 시작한다. CI 착수 날짜는 미정이며 모든 화면 디자인·구현 완성을 기다리지 않는다. 팀원 3의 골격 착수·로컬 설치·실행·검사는 이 정리와 CI 착수·완료에 종속되지 않는다.
- 골격이 먼저 준비되면 CI 전에도 같은 첫 S+CI PR의 골격 부분 검토·타인 로컬 재현을 진행할 수 있다. 로컬 설치·실행·lint·타입 검사·테스트·빌드 기준은 그대로 적용한다. CI는 준비되는 대로 같은 PR에 추가하고, 최종 PR의 실제 CI 통과·타인 승인·리뷰 대화 해소 전에는 병합하지 않는다. 골격 로컬 완료 후 첫 병합은 CI 때문에 대기할 수 있다.
- test-after: runner 준비 → 계층 구현 → 그 계층의 테스트 작성/실행 → 다음 계층. A/B/C/D 내부 모델·저장·서비스·UI 각각에 적용한다.
- 요구사항당 최소 하나의 검증 사례, 컴포넌트마다 정상 경로 unit 검사. 각 테스트 파일에는 정상 경로와 최소 두 오류/경계 사례가 있어야 한다. 아래 사례를 실제 파일에 배치하고 새 컴포넌트가 생기면 해당 정상 검사를 추가한다.
- 단위 검사가 기본이며 공유 상태/화면 연결은 React Testing Library 통합 행동 검사, 실제 새 탭·설치 재현은 수동 관찰로 보완한다. 선택적 80% 커버리지·대형 E2E 프레임워크·성능 인증을 추가하지 않는다.
- 기존 검사가 있으면 유지한다. 빈 파일/무조건 true/skip/todo만으로 완료 처리, `--passWithNoTests`, 오류를 숨기는 성공 코드는 허용하지 않는다.
- 코드 작성 후 source-manifest와 traceability에 실제 경로·검사 ID·결과를 기록한다. 계획 단계에서 통과나 파일 존재를 꾸며 기록하지 않는다.

## 준비와 runner

S 작성자 팀원 3은 Node 24.21.0 / npm 11.19.0, Next 16.3.5, React/React DOM 19.3.0, Vitest 5.0.1 조합을 출발점으로 검증한다. TypeScript/ESLint/jsdom/RTL과 types 패키지의 정확 버전·호환 조합을 package와 lockfile·README에 기록한다. Next용 ESLint 설정은 Next 버전과 맞추고 UI 테스트는 jsdom, 순수 서비스 테스트는 필요한 곳에서 node 환경을 쓴다.

`vitest.config.ts`는 `src/test/web-mock/**/*.test.{ts,tsx}`를 포함하고 `src/test/setup.ts`에서 jest-dom matcher/cleanup을 설정한다. alias `@/`를 src에 맞춘다. React UI 컴포넌트와 순수 상태 로직을 분리해 브라우저 저장소를 서버 렌더 시 읽지 않는다. Next의 async 서버 컴포넌트 자체를 Vitest로 검증했다고 주장하지 않고 페이지 내부의 client UI 행동을 검사한다. route 연결/실제 렌더는 M1~M5가 보완한다.

테스트마다 fresh seed, 독립 fake storage, mock clock/ID generator를 주입하고 끝나면 타이머·mock·storage를 정리한다. 오류 시나리오는 버튼 문구만 검사하지 않고 성공 상태 미변경·본문 비노출·중복 ID 없음까지 확인한다. UI 선택자는 접근 가능한 role/name을 우선하며 주요 조작 요소에는 data-testid도 부여한다. 쿼리 결과 fixture에는 실제 GitHub URL/개인 기록 대신 명확한 합성 설명과 합성 근거를 쓴다.

**첫 실행 테스트 전 준비 확인** (실행 허용 후 실제 clone의 web에서):
```sh
node --version
npm --version
npm ci
npm exec -- vitest --version
```
최초 lockfile 생성은 S 작업에 포함되며 그 이후 재현자와 CI는 npm ci만 사용한다. 현재 상태에서 npm ci를 실행하지 않는다. 버전 출력만으로 검사 통과라고 하지 않는다. Step 4 구현 후 첫 unit 실행은 정확히:
```sh
npm run test -- src/test/web-mock/shared/model.test.ts
```

## 명령 계약

아래 이름은 문서의 참조 ID이며 별도 shell alias/script를 가정하지 않는다. 모든 명령은 실제 clone의 **web 디렉터리에서 실행**한다. test 명령에는 항상 이 시연의 정확한 파일/디렉터리를 전달한다.

| ID | 실행 명령 | 적용 |
|---|---|---|
| TS | `npm run test -- src/test/web-mock/shared/model.test.ts src/test/web-mock/shared/storage.test.ts src/test/web-mock/shared/shell.test.tsx` | S 세 파일이 작성된 이후 |
| TA | `npm run test -- src/test/web-mock/profile/model.test.ts src/test/web-mock/profile/repository.test.ts src/test/web-mock/profile/service.test.ts src/test/web-mock/profile/ui.test.tsx` | A |
| TD | `npm run test -- src/test/web-mock/home/ui.test.tsx src/test/web-mock/analysis/model.test.ts src/test/web-mock/analysis/repository.test.ts src/test/web-mock/analysis/service.test.ts src/test/web-mock/analysis/ui.test.tsx` | D 홈·분석 |
| TB | `npm run test -- src/test/web-mock/catches/model.test.ts src/test/web-mock/catches/repository.test.ts src/test/web-mock/catches/service.test.ts src/test/web-mock/catches/ui.test.tsx` | B |
| TC | `npm run test -- src/test/web-mock/links/model.test.ts src/test/web-mock/links/repository.test.ts src/test/web-mock/links/service.test.ts src/test/web-mock/links/ui.test.tsx` | C |
| TI | `npm run test -- src/test/web-mock/flow.test.tsx` | I |
| TR | 아래 ‘새 작업 폴더 재현’ 절차: 버전/설치 → dev/종료 → G0 → start/종료 → 작은 변경 PR | R |

계층별 반복에서는 아직 없는 파일을 요구하지 않고 위 명령에서 **작성한 해당 파일 하나**를 명시한다. 예: A 저장 계층은 `npm run test -- src/test/web-mock/profile/repository.test.ts`. 패키지 PR 제출 때는 표의 해당 패키지 전체와 G0를 실행한다.

**G0 — 로컬/PR CI 공통 통과 조건**

CI 미준비 기간에도 아래 명령을 로컬에서 모두 실행한다. 그 결과는 ‘로컬 통과’로 남기며 ‘CI 통과’로 기록하지 않는다. 골격의 dev 실행·화면 확인·종료는 아래 수동 확인 절차를 함께 따른다. CI 추가 후 최종 PR에서 아래 검사가 실제 실행·통과해야 첫 병합이 가능하다.

```sh
npm ci
npm run lint
npm run typecheck
npm run test -- src/test/web-mock/
npm run build
```
test는 zero-Unit 이번 시연 폴더만 대상으로 한다. Next build가 lint를 대신하지 않는다. typecheck script는 `next typegen && tsc --noEmit`으로 새 clone의 route 타입을 먼저 생성한다. lint는 warning 0. build/lint/type 오류 무시 옵션을 넣지 않는다. S+CI 첫 PR에서는 shared 테스트가 실제로 실행돼야 하고 이후 기능 PR은 추가된 테스트까지 포함한다. 마지막 단계에는 아래 필수 파일/사례가 모두 존재·실행돼야 한다.

CI job `web-checks`는 PR의 합쳐질 소스를 검사하며 intent 브랜치·dev 대상 PR에 적용한다. 워크플로 자체가 PR에 처음 추가되는 첫 S+CI PR도 실제 Actions 실행 기록을 확인한다. 배포 job, api/worker 설치, 실제 자격증명은 필요하지 않다. CI 도입 PR에서는 의도적으로 lint 오류를 넣은 임시 검증 커밋에서 job 실패를 확인한 다음 오류를 고치고 최종 SHA의 전체 green을 남긴다. 실패 검증을 위해 별도 앱 기능/테스트를 만들지 않는다. 보호 설정의 required check와 타인 승인 조건은 실제 조회/권한으로 확인할 후속 작업이며 현재 설정됐다고 단정하지 않는다.

## 파일별 필수 사례

각 행의 세 부분은 정상 / 오류·경계 1 / 오류·경계 2를 뜻한다. 한 case가 여러 값을 parameterize할 수 있으며, 요구사항의 추가 경계를 세 사례 숫자에 맞춰 삭제하지 않는다. 컴포넌트 정상 검사는 ui 파일의 describe로 나누고 기능당 한 happy path로 여러 컴포넌트를 검사했다고 가정하지 않는다.

| 파일 (src/test/web-mock/ 아래) | 필수 사례와 검증 결과 | 요구사항 |
|---|---|---|
| shared/model.test.ts | 합성 seed·고정 시각 정상 / 잘못된 schemaVersion 거부 / reset 후 generation 변경·기존 token 재사용 없음 | NFR1, FR3/8 기반 |
| shared/storage.test.ts | 저장→복원과 같은 origin 변경 전달 / 손상 JSON은 오류이며 자동 덮어쓰기 없음 / quota·write 실패는 마지막 성공 상태 보존 | FR6, NFR1/2 |
| shared/shell.test.tsx | 합성 배너·seed 화면의 접근 가능한 정상 표시 / 복원 전 로딩에서 본문 비노출 / 복원 오류와 명시적 복구 안내 | NFR1/2 |
| profile/model.test.ts | 필수 이름+선택 필드 저장형 / 공백 이름 거부 / 공개 projection에서 이메일·내부 ID·provider 데이터 제외 | FR1, NFR1 |
| profile/repository.test.ts | 프로필 저장·재진입 / 저장 실패 시 기존 값 유지 / 새 독립 탭 소유자 세션 없음 | FR1 |
| profile/service.test.ts | 최초 저장 후 홈 목적지 반환·모의 GitHub 연동 상태 저장 / 미연동도 홈 이동 계약 허용 / 수정 취소·허용되지 않은 returnTo 거부. 홈 UI 렌더 검사는 D 소유 | FR1 |
| profile/ui.test.tsx | 로그인·프로필·연동·세션 각 컴포넌트 정상 및 홈 이동 호출 / 이름 오류와 안내 / 취소·키보드 연동 변경과 저장 실패. 홈 화면 자체는 렌더/검사하지 않음 | FR1, NFR2 |
| home/ui.test.tsx | D·팀원 3: 프로필/연동 상태 fixture로 홈 정상 표시와 프로필·자산 이동 / 미연동도 홈 허용하며 연결 안내 / 프로필 조회 실패·로딩 구분과 미연동 분석 시작 차단. 키보드 버튼 조작·연동 변경 후 갱신 포함 | FR1, NFR2 |
| analysis/model.test.ts | 요청 repo/analysis ID 보존 / 잘못된 repo ID 거부 / 완료 0건과 failed/query-failed 별개 | FR2/3 |
| analysis/repository.test.ts | pending 저장 후 재조회가 같은 ID / pending·completed 재진입/조회 재시도 때 새 요청 없음 / failed 후 명시적 재요청 결과 upsert가 기존 Catch·공개·링크 보존 | FR3 |
| analysis/service.test.ts | 선택+연동+명시적 동의로 최초 요청 / 조건 각각 누락·취소 시 요청 거부 / 연속 클릭 중복 방지와 failed일 때만 명시적 재요청 허용. completed(0건 포함)·pending·query-failed에서 분석 재요청은 거부 | FR2/3 |
| analysis/ui.test.tsx | 선택·진행 컴포넌트 정상 연결 / 분석 실패에서만 재요청 버튼 제공 / 완료 화면에는 결과 재조회만, query-failed에는 조회 재시도만 제공하고 0건 성공으로 표시하지 않음·이전 화면 복귀 | FR2/3, NFR2 |
| catches/model.test.ts | 합성 설명·근거·질문 매핑 / 미확인·불일치·미공개 분리 / 자동 확인·자동 공개 없음 | FR4/5 |
| catches/repository.test.ts | 안정 ID upsert 후 상태 유지 / 같은 근거 중복 Catch 없음 / 공개/숨김 write 실패 시 마지막 상태 유지 | FR3/6 |
| catches/service.test.ts | 별도 공개 후 수신자 후보 포함 / 불일치→숨김, 취소/확인도 자동 재공개 없음 / 숨김 후 목록·직접 상세 비노출 | FR5/6 |
| catches/ui.test.tsx | 목록·상세·설명·근거·질문 정상 및 같은 목록 복귀 / 합성 오류 Catch 불일치 표시 / 성공0건과 조회오류 별개·공개 상태 색상 외 문구 | FR4/5/6, NFR2 |
| links/model.test.ts | 발행 시각+30일과 새 token / 만료 직전 허용, 정각·이후 거부 / 중단/만료 링크가 유효 개수/제목에서 제외 | FR7/8 |
| links/repository.test.ts | 발행 성공의 operation→한 URL 복원 / 응답 불명 committed 조회가 같은 결과 반환 / not-committed 재시도 한 번만 생성·저장 실패는 성공 없음 | FR7 |
| links/service.test.ts | 무비밀번호/설정 비밀번호 정상 열람 / 제목 공백·trim중복·4→5 허용·5→6 거부 / 잘못된 비밀번호·미존재·중단·만료·숨김 상세 거부 | FR7/8 |
| links/ui.test.tsx | 발행기·목록·수신자·세션 각 정상 / 제출중·실패·불명에서 성공 URL 없음 / 관리 메뉴·발행후 비밀번호 변경/해제 없음·중단 후 새 URL만 유효 | FR7/8, NFR2 |
| flow.test.tsx | seed부터 FR1→FR8 연결 정상 / 동의 거부·분석/조회실패에서 후속 성공 오인 없음 / 숨김·중단·만료 전파와 현재 프로필 공개 필드 재조회 | FR1~FR8 |

NFR3은 이 매핑/기존검사 유지/G0의 실제 통과/실패를 검증하는 절차로, NFR4는 TR의 독립 재현으로 검사한다. 단위 검사로 사람의 재현·PR 승인을 대체하지 않는다.

FR7 추가 assertion: trim 뒤 제목 비교만 수행하며 대소문자 변형이나 임의 길이 상한을 추가하지 않는다. 제목은 수신자 화면에 나오지 않는다. 활성 링크 5개 계산은 mock clock 기준으로 한다.
FR8 추가 assertion: 모든 Catch 숨김은 링크 중단과 다름, 링크 중단은 Catch 삭제/전역 숨김과 다름. 새 링크는 새 token·새 issuedAt/30일·선택한 비밀번호 조건. 이전 URL은 재전달해도 거부. 비밀번호 통과 기록이 있어도 중단/만료/숨김을 우회하지 못한다.

## 수동 브라우저 확인 M1~M5

실행은 실제 clone의 web에서:
```sh
npm run dev -- --hostname 127.0.0.1 --port 3000
```
`http://127.0.0.1:3000`에서 시작한다. 다른 origin(localhost와 127.0.0.1 혼용 포함)을 쓰면 localStorage가 달라지는 것을 안내한다. 종료는 실행한 터미널의 Ctrl+C, 같은 주소 접속 불가로 종료 확인. build 이후 배포형 로컬 실행은:
```sh
npm run start -- --hostname 127.0.0.1 --port 3000
```
dev와 start를 동시에 같은 포트에서 실행하지 않는다.

| ID | 재현 절차 | 기대 결과·기록 |
|---|---|---|
| M1 정상 연결 | reset → 모의 로그인 → 프로필 저장 → 미연동 홈 확인 → 모의 연결 → 저장소+동의 → 분석완료 → Catch 상세/근거/질문 → 목록 → 확인 → 별도 공개 → 링크발행 → opener 없는 같은 브라우저 새 탭에서 열기 | 같은 repo/Catch/profile 이어짐. 확인만으로 공개되지 않음. 수신자 로그인·관리 메뉴·링크 제목 없음. 화면/관찰 순서 기록 |
| M2 동의·분석 상태 | 연동/선택/동의 각각 누락, 취소, 빠른 두 번 요청. pending/완료 화면 새로고침·재방문, query-failed에서 조회 재시도, analysis-failed에서만 명시적 재요청. 완료 0건도 재방문 | 부적격 요청 없음. 재조회는 기존 ID, 실패 후 명시적 재요청만 새 ID. 완료한 분석의 재분석 UI/서비스 전이 없음. 기존 Catch/공개/링크 보존·중복 없음. 0건은 성공 응답일 때만 |
| M3 공개/불일치/갱신 | 수신자 탭을 유지한 채 소유자 탭에서 숨김. 새로고침·활성화·직접 상세. write-failed 선택 후 공개/숨김. 불일치→취소→확인→명시적 공개 | 기존 링크에도 숨김 반영. 실패 시 마지막 성공 상태. 불일치 취소/확인으로 자동 재공개 없음. 한 Catch 숨김은 다른 Catch/링크 유지 |
| M4 발행·접근 경계 | 공백/trim중복 제목, 활성4/5, issue-unknown 두 경우와 결과확인, 비밀번호 오입력/정상. 만료1ms 전/정각/후. 중단 후 다른 비밀번호 또는 없음으로 새 발행, 구URL 재열람 | 잘못된 발행 거부, 성공 전 URL 없음, 한 operation 한 링크. 정각부터 거부. 구URL 계속 거부·새URL 새30일. 미존재/숨김 상세 거부 |
| M5 접근성·한계 | 키보드 Tab/Shift+Tab/Enter로 핵심 흐름, 오류 필드 이름/포커스와 상태 문구 확인. 비밀번호 통과 탭 새로고침/새 독립 탭 비교. 저장손상/초기화/다른 브라우저 URL 열기 | 입력 이름과 다음 행동 명확, 색상 외 구분. 탭 인증 제안대로 작동. 손상은 오류이며 자동 정상 오인 없음. 다른 브라우저 공유 미지원 안내. 실제 auth/보안 검사 통과로 표현하지 않음 |

모의 시계/시나리오 선택값과 기대/관찰을 함께 남긴다. 전체 링크 목록에는 실제 개인 자료를 넣지 않는다. 캡처·로그는 합성 자료만 포함한다.

## 새 작업 폴더 재현 (TR)

팀원 2 제안(골격 비작성자), 팀원 4 대안. 수락·실행 시점은 미확인이다. 원래 폴더를 지우거나 재사용하지 않고 본인의 새 clone에서 재현한다. 다음은 향후 담당자가 실제 수행할 순서다.

골격이 먼저 준비되면 CI 전에도 1차 로컬 재현을 수행할 수 있다. 이때 CI 결과는 ‘미준비/미실행’으로 구분한다. 작은 변경 PR 제출과 검토는 진행할 수 있지만 CI가 준비되고 실제 통과하기 전에는 첫 코드 PR을 병합하지 않는다. 최초 PR의 최종 구성은 S+CI를 유지하고, CI 추가 이후 영향 있는 변경은 재검사·재검토한다. 모든 화면이 준비되기 전 1차 재현을 전체 시연 완료로 기록하지 않는다.

1. PR에 기록된 origin URL과 재현 대상 commit SHA로 새 clone/checkout. 실제 경로·SHA·OS·node/npm 버전을 기록한다. 현재 계획에는 최종 앱 SHA가 없으므로 가짜 SHA를 넣지 않는다.
2. web README만 보고 Node 선택, `npm ci`, 필요한 모의 환경 예시 준비. 실제 key/token 입력이 필요하면 NFR1/4 실패로 보고한다.
3. 위 dev 명령으로 주소 확인, S 단계는 배너·seed 정상 확인, 최종 단계는 M1~M5 수행. Ctrl+C로 종료 확인.
4. G0 명령을 모두 실행하고 명령별 exit code/결과 기록. build 후 start 확인과 종료까지 수행한다.
5. 안내 부족으로 작성자에게 추가 설명을 받아야 했다면 그 부분을 결함으로 기록하고 README를 보완한 뒤 새 문서만으로 다시 확인한다. 통과 기록에서 어려움을 생략하지 않는다.
6. 발견한 작은 문서/화면 변경을 본인의 작업 브랜치에 작성하고 해당 검사/G0 후 **실제 PR 제출**. 대상은 당시 시연 intent 브랜치(이미 dev에 최종 반영됐다면 dev). 타인 리뷰·CI·merge commit 규칙 유지. 문서 작성 또는 로컬 diff만으로 PR 제출 완료라고 하지 않는다.
7. 증거: 담당자, 시작/종료 시점, 새 폴더 경로, SHA, 설치·실행·종료·G0 결과, 시나리오 관찰/한계, 작은 변경 PR URL, 검토자 승인·CI URL, 남은 결함. S 1차 재현과 전체 기능 최종 재현을 구분한다.

## 통과 판정과 현재 상태

패키지 완료는 해당 테스트/정적·타입·빌드와 타인 PR 리뷰, 첫 코드 병합부터 CI 통과가 있어야 한다. 전체 시연 완료에는 M1~M5와 TR의 실제 증거가 추가된다. 코드는 있는데 테스트가 없거나, 문서만 있고 실제 재현자가 없으면 미완료다. 발견한 실패는 해당 작성자가 수정하고 영향 있는 검사만 재실행한 뒤 PR의 최종 SHA로 G0를 확인한다.

골격의 로컬 준비·검토·재현 완료와 첫 PR의 병합 가능 여부를 따로 기록한다. 골격이 먼저 준비돼도 CI 미준비/실패 상태에서는 ‘첫 병합 대기’이며, 로컬 검사나 타인 승인만으로 병합 조건을 충족했다고 하지 않는다.

현재: **계획 문서 검토만 수행, 앱 검사·CI·브라우저 시연·타인 재현·작은 변경 PR 모두 미실행.** 실제 서비스 연결·보안·LLM 품질·NCP 배포·기존 MVP C01/C02 완료와 구분한다.
