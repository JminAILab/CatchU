# NC1 칸 제목과 링크 이름 — 코드 요약

계획 `code-generation-plan.md`의 16단계를 모두 마쳤다(체크 16/16). Step 1~14는 개발자 에이전트가 했다. 링크 목록 항목 고침(「계획과 다른 점」 7), Step 15, Step 16은 오케스트레이터가 사람과 함께 했다. Step 16은 Step 15 확인 중 팀장 발견으로 계획 승인 뒤 더한 단계다(아래 「Step 16」). intent 전체 검증 명령(`verification-command.txt`)은 Unit 확인 단계에서 60분 상한으로 돌린다(「검증」).

## 바꾼 파일

새로 만듦:
- web 공통 함수: `web/src/lib/author-description-sections.ts`(칸 나누기·합치기·글자 수·이은 칸), `web/src/lib/github-link-name.ts`(링크 이름·근거 저장소·링크 모으기)
- web 부품: `web/src/features/publications/github-link.tsx`(링크 요소)
- web 시험: `web/test/author-description-sections.test.mjs`, `web/test/github-link-name.test.mjs`

고침:
- api: `api/src/catches/owner-catch-input.ts`(조건 `authorDescription`, 커서 v2), `owner-catch-store.ts`(고정 SQL 조각), `catch-reader.ts`(읽기 칸 `hasAuthorDescription`), `owner-catch-response.ts`(응답 칸)
- api 시험: `api/test/catches/owner-catch-http.test.cjs`, `owner-catch-response.test.cjs`
- web 내 자산: `web/src/features/assets/` `types.ts`, `fixtures.ts`, `catch-api.ts`, `assets-store.ts`, `assets-connected.tsx`, `assets-view.tsx`, `assets-preview.tsx`, `assets-api-preview.tsx`, `author-description-api.ts`, `author-description-editor.tsx`, `author-description-panel.tsx`(8칸으로 새로 씀), `assets.module.css`
- web 발행·사본: `web/src/features/publications/` `publish-sources.ts`, `publish-screen.tsx`, `publish-view.tsx`, `snapshot-view.tsx`, `publications.module.css`
- web 시험: `web/test/` `assets-api.test.mjs`, `assets-view.test.mjs`, `author-description.test.mjs`(새로 씀), `author-description-editor.test.mjs`, `assets-description-reload.test.mjs`, `publish.test.mjs`, `publications-owner.test.mjs`, `recipient.test.mjs`
- 문서: `api/docs/catch-owner-read-preparation.md`, `web/src/features/assets/README.md`, `web/src/features/assets/docs/list-screen.md`, `web/src/features/assets/docs/detail-screen.md`, `web/src/features/publications/README.md`, `web/src/features/recipient/README.md`
- 지운 파일 없음. 새 의존성·환경변수·마이그레이션·CI 변경 없음.
- 기능 설계 `functional-design/frontend-components.md` 두 줄(「계획과 다른 점」 7).

## 핵심 구현 결정

- **칸(BR1):** 칸 제목 줄은 줄 전체가 `【칸 제목】`과 같을 때만 인정한다. 칸마다 시작 위치(UTF-16)와 이은 칸 표시를 돌려주고, 사본 보기는 이은 칸을 강조하지 않는다. 글자 수는 코드 포인트로 api와 같게 센다. 「저장하지 않은 변경」은 처음 나눈 칸 글과 지금 칸 글이 다를 때만 참이다(`author-description-api.ts`의 `isDescriptionDirty`).
- **링크 이름(BR2):** 지금 판별 규칙은 그대로 쓴다. 이름은 BR2.2 표의 꼴과 정확히 맞을 때만 만들고, 포트·표 밖 꼴은 주소 전체로 둔다. 마디별로 디코딩하고 제어·서식 문자를 지운다. 이름은 작성자 설명에만 쓰고, 텍스트 자료 본문은 주소 전체 그대로다.
- **본인 목록(BR5, C1):** 고정 SQL 조각 둘 가운데 하나를 고른다. 커서 범위 해시에 작성자 설명 조건이 들어간다. 공개 응답은 `publicResponse`가 칸을 골라 담아 새 칸이 나가지 않고, 키 집합 시험으로 확인한다. web 저장소의 목록 열쇠는 저장소·작성자 설명 걸러 보기다.
- **발행 화면(BR6):** 저장소 목록 부품을 발행 모델이 만들고 `open()`에서 한 번 부른다. 체크 칸은 Catch 목록만 다시 부르고, 고른 자료는 따로 둔다.

## 시험 범위

- Unit 명령(시험 안내 그대로):
  - web 11개 파일 236/236 통과(「계획과 다른 점」 7과 Step 16의 수정 뒤 다시 돌림. Step 16 전에는 233/233)
  - api 2개 파일 72/72 통과
- 고치기 전 기준: web 151/151, api 63/63. 새로 더한 시험은 web 82개, api 9개다.
- 공통 함수 둘의 커버리지(확인용): 줄 100%, `github-link-name.ts` 분기 98.41%
- lint·typecheck: api·web 모두 종료 코드 0(수정 뒤 web은 다시 돌림). 문서 크기 검사 종료 코드 0. assets README는 30,935 / 36,000 B다.
- 회귀 확인(개발자 에이전트):
  - web 전체 `node --test test/*.test.mjs` 950/950 통과
  - api integration 5개 파일과 `author-description-api.test.cjs`: 94 통과, 3 실패, 1 건너뜀(아래)

## 쓰고 돌리지 않은 시험

- api integration I4·I6·I8 세 시험은 시작 조건에서 멈췄다(「worker 잠금 의존성과 CATCHU_TEST_WORKER_PYTHON 실행 파일 필요」). 이 작업 폴더에 worker 실행 환경이 없어서다. NC1이 고친 코드의 시험은 아니고, intent 검증 명령에서 worker와 함께 다시 돈다.
- intent 전체 검증 명령(api·web·worker 전체 검사·시험·커버리지)은 아직 돌리지 않았다. Unit 확인 단계에서 60분 상한, 충전기·부하 확인과 함께 돌리고 서비스별 시간을 적는다.

## 계획과 다른 점

1. **`npm ci`(web·api):** 이 작업 폴더에 `node_modules`가 없어 Step 2 기준값을 잡기 전에 설치했다. lockfile은 바뀌지 않았다.
2. **`web/test/assets-description-reload.test.mjs`도 고침:** 편집기 모델이 8칸(`change(title, value)`, `texts`/`savedTexts`)으로 바뀌어 최소한만 맞췄다.
3. **저장소 목록 부품의 자리:** 성능 설계 그림은 화면 컴포넌트의 `useMemo`였다. 실제로는 발행 모델(`createPublishModel`)이 만들고 `open()`에서 한 번 부르며, 닫으면 `dispose()`한다. 동작은 같고, 「체크 칸을 바꿔도 다시 부르지 않음」(NFR1.2)을 서버 렌더링 시험으로 보기 위해서다.
4. **`assets-preview.tsx`도 고침:** 미리보기도 주소 매개변수로 작성자 설명 걸러 보기를 쓴다.
5. **링크 이름 세부 해석:**
   - `:443`처럼 기본 포트를 적은 주소도 포트가 글자로 있으면 주소 전체로 둔다(설계보다 넓게 막음).
   - 끝 빗금 하나는 허용해, 한글 앞에서 끊긴 `…/src/`가 「src · 판본 …」으로 보인다(AC2.3.2).
   - 16진수가 아닌 커밋 식별값은 BR2.3 글자 그대로 「브랜치 <값>」이다.
6. **공개 목록 커서도 v2:** `PublicCatchStore.list`가 같은 커서 함수를 쓴다. 이 목록은 HTTP 경로가 없고 내부·시험에서만 쓰인다. `public-catch-store.ts`는 고치지 않았다.
7. **링크 목록 항목을 글자로 고침(사람 결정 2026-11-10):**
   - 처음에는 기능 설계 frontend-components 3.1(「항목은 `GithubLink`다」)대로 링크로 만들었다.
   - 승인된 다듬은 화면 interaction-spec 2절은 「목록 항목은 글자이고 Tab 순서에 들지 않음」이다. 이 어긋남을 사람에게 물었고, 「글자로 고침」으로 정해졌다.
   - `author-description-panel.tsx`는 이제 `githubLinkName` 글자를 그린다. 시험(`author-description.test.mjs` AC2.3.1)은 링크 요소가 없음을 본다.
   - frontend-components 3.1과 2.3의 두 줄, `web/src/features/assets/README.md`의 한 줄을 함께 고쳤다.
8. **개발용 `repository-management-preview.tsx`는 고치지 않음:** 다른 Unit의 파일이다. 그 개발용 모의 응답은 `authorDescription`을 무시하므로, 그 미리보기에서 「씀/안 씀」을 고르면 목록 조회 실패로 보인다. 제품 화면과는 상관없다.

## 로컬 실제 연결 확인 (B1 최소 연결 첫 결과, 2026-11-10)

판정: **보일 결과 통과.** 파일 줄 링크 이름은 화면으로 보지 않았다(아래). 실제 Google 로그인과 로컬 api·DB·web으로 확인했다. 개발 서버·배포 확인은 아니고, 전체 완료도 아니다.

환경:
- 이 작업 폴더(NC1 변경, 커밋 전)의 api·web을 Catch 개편 때 쓴 로컬 환경(`~/catchu-local-live/cr1`, DB 55460)으로 띄웠다. Catch는 53개이고 모두 Catch 개편 때 TheMe 등을 실제 분석한 것이다.
- 띄우기 전에 DB를 백업했다(`~/catchu-local-live/cr1/backup/cr1-before-nc1-20261110-1538.dump`). 이 작업 폴더 판본으로 DB 이주를 돌렸고, 새로 더해진 것은 PDF 표 이주 하나다.
- 이 환경의 api에는 Claude 키가 없다(요약 생성 `NOT_CONFIGURED`). 임베딩은 개발 모드 합성 제공자다. NC1과 상관없다.

사람이 브라우저에서 한 것과 본 것:
1. TheMe의 「SET_TOKEN 코드 수정」 Catch에 다섯 칸(이 작업에서 정한 것·맡은 부분·무엇이 문제였나·고른 것과 버린 것·짚어 볼 곳)을 썼다. 「짚어 볼 곳」에는 파일 줄 링크 대신 커밋 링크를 넣었다.
2. 링크 목록에 「커밋 0874001」이 이름 글자로 보였고, 저장했다.
3. 「작성자 설명: 씀」으로 걸렀더니 그 Catch가 보였다.
4. 발행 화면에서 「작성자 설명을 쓴 Catch만 보기」를 켰더니 그 Catch의 작은 줄에 저장소 이름이 보였다. 그 Catch를 골라 발행했다.
5. 받은 사람 화면에서는 쓴 다섯 칸만 h5 칸 제목과 함께 보였고, 빈 세 칸은 보이지 않았다.
   - 링크는 「커밋 0874001」 이름으로 보였다. `title`에 주소 전체가 있고, 새 탭으로 열리며, 숨은 「(새 탭)」이 있다.
   - 옛 자유 글이 있는 다른 Catch는 칸 제목 없이 예전처럼 보였다.
6. 파일 줄 링크 이름(「파일 · 줄 · 판본」)은 화면으로 보지 않았다. 시험(`github-link-name.test.mjs` AC2.2.1)으로만 확인했다.

DB 대조(오케스트레이터):
- 저장된 글(285자)은 칸 제목 줄 다섯 개가 칸 순서대로 있고, 칸 사이에 빈 줄이 하나씩 있다. 빈 칸의 칸 제목은 없다(BR1.4).
- 가장 최근 발행본 사본의 `authorDescription`이 저장된 글과 글자까지 같다. 사본에 `hasAuthorDescription` 칸이 없다(NFR2.1).
- 작성자 설명이 있는 Catch는 3개다. 하나는 이번에 쓴 것이고, 둘은 칸 제목 없는 옛 글이다.

## 발견: GitHub 줄 고정 주소를 얻기 어렵다

- 팀장이 직접 해 봐도 GitHub에서 줄 고정 주소(permalink)를 얻기가 어려웠다. 줄을 끌어서는 안 되고, 줄 번호 누르기·`y`·View file을 알아야 한다.
- 처음 자연스럽게 복사한 주소는 커밋 화면의 바뀐 줄 주소(`/commit/<sha>#diff-…R16-R23`)였다. 그때 이름 규칙(BR2.2)에서는 표 밖 꼴이라 주소 전체로 보였다.
- 코드 검토 전에 사람에게 물었다(2026-11-10).
  1. 「짚어 볼 곳」 안내: 커밋 화면 한 가지로 줄인다.
  2. 바뀐 줄 주소: 이름으로 읽는다. 덧붙임으로 이름 꼴, 메모 안내 고침, 한글 파일 이름 안내 빼기, 까닭을 적는 자리를 정했다.
- 결정은 Step 16으로 반영했다(아래).

## Step 16: 커밋 화면 바뀐 줄 주소 이름과 안내 줄이기 (팀장 결정 2026-11-10)

- `web/src/lib/github-link-name.ts`: 커밋 링크의 조각이 `#diff-<64자 16진수>`에 한쪽 범위나 한 줄(`R16-R23`·`R16`·`L16-L23`·`L7`)이면 이름을 짓는다.
  - R 쪽은 「커밋 0874001 · 바뀐 줄 16–23」, 한 줄이면 「바뀐 줄 16」이다.
  - L 쪽은 「이전 줄 …」이다.
  - L·R이 섞인 범위, 줄 번호 없는 `#diff-…`, 64자가 아닌 파일 자리, 그 밖의 조각은 지금처럼 주소 전체다.
  - 다른 저장소 앞붙임·질의 무시·포트 처리는 그대로다.
  - 이름은 「커밋 xxxxxxx」 뒤에 줄 꼬리를 잇는 꼴이다. NC2 본인 커밋 표지는 「커밋 xxxxxxx」 바로 뒤, 줄 꼬리 앞에 붙는다.
- `web/src/features/assets/author-description-panel.tsx` `POINT_HINTS`를 넷으로 줄였다.
  1. 줄 고르기(그대로)
  2. 「위 근거의 본인 커밋을 열고, 바뀐 줄의 줄 번호를 누르세요(여러 줄이면 Shift를 누른 채 끝 줄 번호도 누르세요). 주소창의 주소를 그대로 붙이세요.」
  3. 「메모에 파일 이름과 짚을 까닭을 적으세요.」
  4. 관련 커밋(그대로)

  Copy permalink 안내와 한글 파일 이름 안내는 뺐다. 파일 줄 링크(`/blob/…#L…`)는 지금처럼 받아들이고 이름을 짓는다.
- 시험:
  - `web/test/github-link-name.test.mjs`에 세 시험을 더했다(바뀐 줄 범위·한 줄·이전 줄·질의, 글 속 주소가 조각까지 한 링크, 표 밖 diff 꼴, 다른 저장소·포트).
  - `web/test/author-description.test.mjs` AC2.1.1은 넷으로 고쳤다.
- 같은 규칙을 적은 문서를 고치고 바꾼 줄마다 까닭을 적었다.
  - `inception/requirements-analysis/requirements.md`: FR3.1 표 한 줄, FR4.1, AC4.1
  - `inception/user-stories/stories.md`: AC2.1.1
  - `inception/refined-mockups/mockups.md`: 짚어 볼 곳 안내, 링크 이름 표
  - `construction/nc1-sections-and-links/functional-design/rules.md`: BR2.2, BR4.4
  - `construction/nc1-sections-and-links/functional-design/frontend-components.md`: 3.1 안내 목록
  - `web/src/features/assets/README.md`, `web/src/features/publications/README.md`
  - 아이디에이션 대략 화면과 질문 파일은 지난 기록이라 고치지 않았다.
- 고친 뒤 다시 돌린 것: web Unit 명령 236/236 통과, web lint·typecheck 종료 코드 0, 문서 크기 검사 종료 코드 0. api는 고치지 않아 다시 돌리지 않았다.
- 바뀐 줄 주소 이름은 화면으로 다시 보지 않았다. 시험으로만 확인했다.
