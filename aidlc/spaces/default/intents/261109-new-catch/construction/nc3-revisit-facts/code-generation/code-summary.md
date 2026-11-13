# NC3 다시 볼 곳 사실과 작업 시각 — 코드 요약

입력: 승인된 계획 `code-generation-plan.md`(16단계, 플랜 승인 때 팀장 덧붙임 「자기 결과 확인」 포함), `unit-test-instructions.md`, 기능 설계·NFR 요구·NFR 설계(`construction/nc3-revisit-facts/`), 계약 C2·C4·C5.

## 만든 것과 고친 것

**worker**
- `app/candidates/revisit.py`(새것):
  - 규칙 다섯(다시 고침·옮김·확장자 바꿈·되돌림·시험 파일 있음)과 좁은 산출물 목록 여섯 묶음
  - 켜진 종류 상수 `ENABLED_KINDS`, 종류·커밋 순서 정렬과 상한(30개·경로·커밋 20개·경로 1,024자)
  - 정해진 예외 `RevisitFactsDefect`(기록 없는 식별값)와 자기 결과 확인 `check_facts`(api 등록 검사와 같은 규칙)
- `app/collection/records.py`·`normalize.py`: `ChangedFile.blob_sha`(16진수 40자일 때만, 소문자).
- `app/processing/generation.py`: `EligibleCandidate`에 `revisit_facts`·`first_work_at`·`last_work_at`과 시각 짝·순서 검사.
- `app/candidates/build.py`: `_merge_same_identity` 뒤 `_with_work_times`(최소·최대 authored). 기록 없음은 `ValueError`.
- `app/processing/live.py`: `build_candidates` 뒤 `run_generation` 앞에서 `with_revisit_facts`를 부른다.
  - `Exception`이면 그 후보 사실만 비우고, 예외 종류 이름만 든 오류 로그 한 줄을 남긴다.
  - 팀 규칙 「예외를 삼키지 않는다」의 예외 한 곳이라는 주석을 달았다.
- `app/processing/result.py`: `RESULT_SCHEMA_VERSION = "4"`, 새 칸 셋(시각은 UTC 초 단위 `Z`).
- `app/processing/fake_generator.py`: 합성 템플릿의 새 칸을 읽는다.
- `fixtures/m1-synthetic/results/` 7개: 판본 "4". 「후보 하나 성공」은 종류마다 사실 하나, 나머지는 빈 배열.

**계약과 api**
- `api/contracts/repository-analysis/worker-messages.yaml`: Result "4", Candidate 필수 칸 셋, `RevisitFact`(모르는 칸 거부, 30개·20개·1,024자).
- `analysis-receiver/receiver.types.ts`: 새 칸과 판본 "4".
- `catches/new-catch-content.ts`: 등록과 본인 응답이 함께 쓰는 사실 검사(`REVISIT_FACT_KINDS`, 종류별 개수 표, `isRevisitFactList`)와 `parseWorkTimes`(`Date`로 해석해 첫 ≤ 마지막). 새 Catch 내용에 사실·시각을 싣는다.
- `catches/registration-batch.ts`: 사실 커밋이 그 후보 `ownCommitShas` 안인지 본다(`INVALID_INPUT`). `registration-input-error.ts`에 칸 이름 셋을 더했다.
- `catches/registration-service.ts`: 주석만 바꿨다. 지금 INSERT 펼침이 새 Catch에만 새 칸을 쓴다.
- `catches/entities/catch-asset.entity.ts`, `database/migrations/1794378756644-AddCatchRevisitFacts.ts`(새것): 칸 셋과 검사 둘.
- `catches/catch-reader.ts`·`owner-catch-response.ts`: `revisitFacts`를 무결성 검사와 함께 싣는다. 시각은 응답에 없다.
- 커서와 정렬:
  - `owner-catch-input.ts`: 본인 목록 커서 판본 3(`after: {lastWorkAt, catchId}`, `toISOString` 왕복 검사). 공개 목록은 따로 둔 판본 2 함수(`publicCatchQuery`·`nextPublicCatchCursor`)를 쓴다.
  - `owner-catch-store.ts`: `ORDER BY last_work_at DESC NULLS LAST, catch_id ASC`와 다음 쪽 고정 조각 둘.
  - `public-catch-store.ts`: 부르는 함수 이름만 바꿨다.
- `analysis-intake/analysis-notice.ts`: 4절 셋째 줄 뒤에 초안 한 줄을 더했다. 판본 이름은 그대로다.

**web**
- `features/assets/revisit-facts.tsx`(새것): `revisitCommitHref`(고정 호스트·이름 꼴·40자), `revisitSentence`(문장 다섯 꼴, 식별값 뒤 「에서」「의」), 「다시 볼 곳」 칸. 사실이 없으면 아무것도 그리지 않는다.
- `assets-view.tsx`: 근거와 Catch 설명 초안 사이에 칸을 둔다.
- `types.ts`·`catch-api.ts`: `RevisitFact` 형과 응답 검사. 모양이 틀리면 받지 못한 응답으로 본다.
- `fixtures.ts`: 예시 Catch 넷에 `revisitFacts: []`를 넣었다.
- `README.md`: 「다시 볼 곳」 칸, 링크 조건, 커서 판본 3. 팀장 확인 뒤 「GitHub 연결이 없어 저장소 이름을 못 불러오면 커밋은 글자로만 보인다」 한 줄을 더했다.

**문서와 앞 단계 설계 문서(Step 15)**
- api: `catch-owner-read-preparation.md`, `catch-registration-rules.md`(새 절), `analysis-receiver.md`, `analysis-intake.md`, `repository-analysis-u7.md`
- worker: `README.md`, `docs/candidate-decision.md`(작업 시각과 다시 볼 곳 사실 절, 34,964 / 36,000 B), `docs/commit-assignment.md`, `docs/repository-analysis-u7.md`, `fixtures/m1-synthetic/README.md`
- `worker/docs/relation-collection.md`는 결과 판본을 적은 줄이 없어 고치지 않았다(GitHub REST 판본 머리글 이야기만 있음).
- 앞 단계 설계 문서 네 자리:
  - `functional-design/functional-spec.md` W1 「실패와 경계」 첫 줄과 S10
  - `functional-design/rules.md` BR3.5 logic
  - `nfr-requirements/performance-requirements.md` NFR1.3

## 계획에 이름이 없던 고친 파일 (기존 시험을 그대로 통과시키려고)

- **worker 시험:** `tests/test_worker_messages.py`, `tests/test_generation_response.py`. 판본 "3"을 단정하고 있었다.
- **api 시험 도우미·마이그레이션 시험:**
  - `test/support/catch-db-fixture.cjs`: 마이그레이션 목록과 후보 새 칸
  - `test/catches/new-catch-content.test.cjs`
  - `test/catches/null-title-migration.test.cjs`, `test/catches/evidence-position-migration.test.cjs`: 되돌리기 한 단계, 다시 적용한 뒤의 기대 행
  - `test/integration/result-application-b.test.cjs`
  - `test/db/analysis-notice.test.cjs`: 고지 글 고정 SHA-256과 줄 수 35 → 36
- **web:** `fixtures.ts`. 형이 새 칸을 요구한다.
- **문서:** `api/docs/repository-analysis-u7.md`, `worker/docs/repository-analysis-u7.md`. 결과 판본을 적은 줄이 있었다.

## 주요 결정

- **순환 import:** `generation.py`는 `RevisitFact`를 형 검사용으로만, `fake_generator.py`는 함수 안에서만 불러온다. 맨 위에서 불러오면 worker 시험이 순환 import로 멈췄다.
- **자기 결과 확인의 시험 길:** 규칙은 바꿔 끼울 수 있는 `RULES` 튜플이다. 시험이 규격을 어기는 규칙으로 바꿔 끼워 정해진 예외를 확인한다.
- **입력에서 빼는 것:** 병합 커밋은 판정 입력에서 뺀다. 되돌림 대상은 같은 후보의 병합 아닌 본인 커밋만이다.
- **산출물 목록을 보는 단위:** 옮김·확장자 바꿈은 (앞, 뒤) 경로 쌍으로 산출물 목록을 본다.
- **시험 파일 경로 상한:** 1,024자를 넘는 경로는 그 경로만 빼고, 앞의 20개 경로·20개 커밋만 담는다.
- **종류별 개수 표:** api·worker·web이 같은 표를 따로 들고, 서로를 가리키는 주석을 달았다.
- **판본 다시 찾기(검토 Minor 3):** `"schemaVersion": "3"`과 결과 v3·커서 v2 글자를 다시 찾았다. 남은 것은 셋뿐이고 모두 맞다.
  - 판본 "3"을 거부하는지 보는 시험
  - `ownCommitShas`가 Result v3에서 들어왔다는 주석
  - 일부러 그대로 둔 공개 목록 커서 `v: 2`

## 시험

- **고치기 전(Step 2):** worker 174, api 225와 합성 대조 16, web 82 통과
- **Unit 명령(Step 16):** 충전기 연결, 1분 평균 부하가 8.10이라 6 아래로 내려간 5.73에서 시작했다.

| 서비스 | 명령 | 결과 | 걸린 시간 |
|---|---|---|---|
| worker | Unit pytest | 226 통과 | 3초 |
| api | Unit 시험 파일 | 248 통과 | 23초 |
| api | `test:analysis-fixtures` | 16 통과 | 6초 |
| web | Unit `node --test` | 92 통과 | 1초 미만 |

- **전체(회귀):** worker 2,633 통과·12 건너뜀, api 1,806개 가운데 1,768 통과·0 실패·38 건너뜀(329초), web 1,026 통과
- **린트·타입:** ruff, mypy strict, tsc, eslint 깨끗. 문서 크기 검사 통과.
- **커버리지 참고:** `revisit.py` 줄 96%(Unit 확인용, 판정 아님). 프로젝트 전체 80% 기준은 빌드와 시험이 잰다.
- **이 단계에서 돌리지 않은 시험:** 없음. 위 명령은 모두 돌렸다. 시간은 어느 시험에서도 단정하지 않는다.

## Step 16 최소 연결 첫 결과 (2026-11-11, 팀장 확인)

- **합성 분석:** cr1 로컬 환경에서 개발 회원으로 합성 분석을 돌렸다.
  - worker는 처리 SUCCEEDED·후보 1이었고, api가 판본 "4" 결과를 받아들였다(`WORKER_RESULT_RECEIVED` ACCEPTED·OK).
  - 등록은 `APPLY_FAILED`·`CATCH_NOT_READY`로 설계상 멈췄다. 큐 조립의 좌표 공급자가 LIVE 전용이라, 후보가 있는 MOCK 결과는 등록되지 않는다(`application.module.ts` 주석, `api/docs/selected-repository-coordinates.md` 38~41행). NC3 결함이 아니다.
  - 판본 4 결과 왕복은 이 실행으로, 등록 저장은 api 시험으로 갈음한다.
- **마이그레이션:** 서버를 켜기 전에 cr1 DB의 기존 Catch 53행에 오류 없이 적용됐다. 53행 모두 빈 사실·빈 시각이다. 백업은 `~/catchu-local-live/cr1/backup/cr1-before-nc3-20261111.dump`다.
- **화면은 직접 넣은 자료로 확인했다:** Google 회원의 TheMe Catch 둘에 값을 넣었다. 「README.md 문서 수정」에는 소속 기록 커밋으로 만든 다섯 종류 사실과 시각을, 「fix : 테마 등록시…」에는 시각만 넣었다.
  - **목록:** 둘이 위(06-03 → 04-10)이고 나머지 51개가 원래 순서로 아래다. 「더 보기」 두 번(20·20·13)으로 빠짐·겹침이 없다.
  - **상세:** 「다시 볼 곳」(h3 + 「본인만 확인」, ul 다섯 줄)이 근거 바로 아래에 있다. 문장 다섯과 조사(「에서」「의」)가 기대와 같다. 근거 → 초안 → 질문 순서는 초안 있는 Catch에서 확인했다.
  - **옛 Catch:** 칸이 없다.
  - 확인 뒤 두 Catch를 빈 사실·빈 시각으로 되돌렸다.
- **커밋 링크는 화면에서 확인하지 못했다:** 이 Google 회원은 로컬 GitHub 연결이 없어 `/v1/me/repositories`가 403 `GITHUB_CONNECTION_REQUIRED`였다. 저장소 이름을 못 불러와 BR9.3(Q4 A)대로 글자로 떨어졌다(Tab 0개). 실제 링크는 web 시험으로 갈음하고, 빌드와 시험의 TheMe 실측 때 본다.
- **이것은 합성·직접 넣은 자료로 본 연결 확인이다.** 실제 분석 성공이나 배포 성공이 아니다.
- **뒷정리:**
  - 끔: api·worker·web, cr1 DB·큐 컨테이너
  - 켜 둠: 시험 DB `catchu-db-test`(Unit 확인을 마친 뒤 끈다)
  - 이번 실행에서 개발 로그인과 MOCK은 환경 변수로만 켰고, cr1 환경 파일은 고치지 않았다.
  - 개발 회원과 합성 요청 기록은 cr1 DB에 그대로 있다(팀장 허락).

## 남은 일과 넘기는 것

- **PR 「리뷰 요청」에 적을 것:**
  - 고지 4절 한 줄 문구(초안)의 팀장 승인, 작업 시각도 적을지 여부
  - 「진행 중인 분석이 없을 때 api·worker 함께 배포, 남은 분석은 다시 함」
  - 팀 규칙 「예외를 삼키지 않는다」의 예외 한 곳(NFR 요구 Q1 B)
- **빌드와 시험:**
  - TheMe 실측: 바꾸기 전·후의 「수집 종료」 `calls=`, 「생성 종료」 `generationCalls`, 「종결 결과 생성」 `elapsedSeconds`·`resultBytes`
  - 「다시 볼 곳 계산 실패」 로그 0줄
  - 규칙별 Catch 수 DB 질의와 버림 기준(FR15.4)
  - 사람 대조 30~50줄(NFR4.1)
  - 실제 커밋 링크 화면 확인
- **작업 규칙에서 벗어난 것:** 개발자가 끝 줄바꿈을 확인하며 임시 파일 하나를 셸(heredoc·`rm`)로 만들었다 지웠고, worker 출력 요약에 `python3 -c`를 한 번 썼다. 프로젝트 내용은 바뀌지 않았다.
- **오케스트레이터 기록:** 개발자에게 넘길 때 엔진 brief 전문 대신 표지 두 줄·파일 안내·승인된 계획과 시험 안내 파일 경로를 줬다. 두 파일은 brief와 같은 내용이다.
