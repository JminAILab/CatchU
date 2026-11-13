# 새 Catch — CI Pipeline 질문

## 지금 CI (저장소에서 확인한 사실, 질문 아님)

- **CI 도구:** GitHub Actions `.github/workflows/ci.yml`(`dev-ci`).
  - PR과 push 모두 `dev`·`intent/**`에서 돈다.
  - 바뀐 경로에 따라 `web`·`api`·`worker` 검사를 고른다(`changes`).
  - `changes`에는 문서 크기 검사와 경로 고르기 회귀 시험이 들어 있다.
  - 의존성 목록이 바뀌면 `deps-audit`가 돈다.
- **각 검사가 하는 일:**
  - web: `npm run check`(린트·타입·시험·빌드·기동 확인)
  - api: 린트·타입·`npm test`(시험 DB 포함)·공용 자료 확인
  - worker: ruff·형식·mypy·pytest
  - CI는 커버리지를 재지 않는다. 각 서비스 README와 팀 규칙 「커버리지는 팀장이 넣은 서비스별 명령으로 잰다」에 따른 것이다.
- **브랜치와 필수 검사:**
  - NC1~NC3 PR은 `worker/새-catch-ncN` → 통합 브랜치 `intent/260925-intent-12`로 간다(NC1 #517 병합, NC2 #520 열림).
  - 통합 브랜치는 보호 규칙이 없다. 검사는 돌지만 병합을 막지는 않는다.
  - `dev`는 `changes`·`web`·`api`·`worker`·`deps-audit` 다섯 검사가 필수다. PR·merge commit만 받는다.
- **이 intent가 바꾼 경로와 CI:**
  - 통합 브랜치와 비교해 바뀐 서비스 경로는 `api/src`·`api/test`·`api/scripts`·`api/docs`·`api/contracts`, `web/src`·`web/test`, `worker/app`·`worker/tests`·`worker/fixtures`·`worker/docs`·`worker/README.md`다.
  - 경로 고르기 규칙으로 web·api·worker 검사가 모두 돈다.
  - api의 문장 대조 시험(`work-limit-sentences.test.cjs`)은 `worker/app/candidates/build.py`를 읽는다. `worker/app/*`이 바뀌면 api 검사도 돈다(NC2 C6 열린 질문의 답).
  - 로컬에서 경로 고르기 회귀 시험 6개와 문서 크기 검사가 통과했다.
- **산출물 저장소:** 개발 서버 배포(`deploy-dev-server.yml`, `main` push)와 이미지 검사(`images.yml`, `main` PR)가 있다. 이 intent는 둘을 바꾸지 않는다.

## Q1. 이번 intent에서 CI를 고칠까요?

**배경:**
- Testing Contract의 「병합 전에 CI에서 시험을 돌린다」는 지금 CI가 이미 지킨다.
- 커버리지 80%는 Build and Test에서 서비스별 전체 명령으로 쟀다(api 98.49%·web 93.65%·worker 96%).
- 팀 규칙상 공유 CI 변경은 팀장 몫이다.
- 11/9 기준 Actions 사용량은 1,156분이고 11/21~23 소진이 예상된다.

A. 고치지 않는다. 지금 `dev-ci`와 `dev` 필수 검사 다섯을 이 intent의 품질 관문으로 기록만 한다. (가장 단순, 추가 공수·Actions 분 0)
B. CI에서 커버리지 80% 하한을 강제한다. api 검사를 `test:coverage`로 바꾸고 web·worker에 하한 옵션을 더한다.
   - 더 막는 것: 커버리지가 떨어진 PR이 dev로 가는 것
   - 늘어나는 것: 공수 약 2~3시간(세 서비스 설정과 회귀 확인), api 검사가 매번 수십 초 더 걸려 Actions 분이 는다
C. 통합 브랜치 `intent/**`에도 `dev`와 같은 필수 검사를 건다(저장소 설정 한 번).
   - 더 막는 것: 검사가 실패한 Unit PR이 통합 브랜치에 들어가는 것
   - 늘어나는 것: 공수 약 10분. 다만 팀원 Unit PR의 병합 흐름이 바뀌어 팀에 알려야 한다
X. Other (please specify)

[Answer]: A, 운영 메모 한 줄 더함 (2026-11-12, **Mode:** chat)

**덧붙임(사람 원문):** Q1 기록에는 운영 메모 한 줄을 더한다: 통합 브랜치에는 보호 규칙이 없으므로 Unit PR은 CI 통과를 확인한 뒤 합친다.

## Q2. Construction 마무리 확인(단계 경계)을 어떻게 적을까요?

**배경:**
- 이 단계는 Construction을 닫으며 「Unit 사이 추적 관문이 통과했는지」를 확인해 `verification/phase-check-construction.md`에 적는다.
- Build and Test의 추적 관문은 통과하지 못했고, 팀장이 Accept failure로 받았다. 받은 실패는 AC8.1.1·AC8.1.2 딱지, 그리고 FR15.1~FR15.3·NFR7.4 PR 몫이다.
- 이 계획에는 Operation 단계가 모두 SKIP이라, 이 단계 뒤로 이어지는 단계가 없다.

A. 「받은 실패가 있는 통과」로 적는다. 받은 실패 세 행과 그 처리처를 그대로 옮긴다. 처리처는 NC3 PR 「수행하지 못한 검증」, intent 뒤 후속, NC3 PR 병합 때 확인이다. intent는 이대로 닫는다. (가장 단순)
B. 「막힘」으로 적고 intent를 닫지 않는다. AC8.1.x 후속을 처리한 뒤 다시 확인한다.
   - 더 막는 것: 불충족이 남은 채 intent가 완료로 보이는 것
   - 늘어나는 것: intent 완료가 NC2 지시 고침(2~3시간)과 NC3 PR 병합 뒤로 밀린다
X. Other (please specify)

[Answer]: A, 처리 자리 구체화 (2026-11-12, **Mode:** chat)

**덧붙임(사람 원문):** Q2 기록에는 세 행의 처리 자리를 구체적으로 적는다.
- FR15.1: 진행 중인 분석이 없을 때 api·worker를 함께 배포한다(배포 때 확인).
- FR15.2: 고지 4절 문구와 작업 시각 포함 여부는 NC3 PR에서 팀장이 승인한다.
- FR15.3·NFR7.4: 출시 직전 DB 초기화 전에 NC3 PR을 통합 브랜치에 병합한다.
- AC8.1.1·AC8.1.2: intent가 끝난 뒤 후속 이슈 하나로 넘긴다. 내용은 (1) 따옴표로 글자 그대로 옮긴 작성자 글에 코드가 작성자 자료에서 그 글을 찾아 인용을 붙이는 고침(질의응답 3·8번이 이 경우), (2) 기본 요약이 작성자 주장을 인용 항목으로 내도록 지시·형식을 고치는 일(요약 항목 5가 GitHub 기록을 작성자 주장처럼 쓴 것 포함)이다.

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
