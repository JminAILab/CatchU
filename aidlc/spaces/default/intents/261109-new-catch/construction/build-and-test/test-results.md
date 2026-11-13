# 새 Catch — 빌드·시험 결과

- 대상: NC1~NC3를 합친 작업 브랜치 판(NC3 승인 커밋 `3bb20bb2`)에 이 단계의 고침 셋을 더한 작업 트리
  - FR15.4 규칙 끄기: `worker/app/candidates/revisit.py`의 `ENABLED_KINDS`
  - 되돌림 규칙을 끈 때 되돌림 쌍을 다시 고침으로 남기기(A2)
  - 평가 스크립트의 답 실패 기록(`api/scripts/rag-eval/rag-eval.cjs`)
- 실행: 2026-11-11~12, macOS 로컬. 시작 전 충전기 연결(AC Power), 1분 부하 평균 5.56·4.66을 확인했다.
- 시험 실행 위치: api·worker 시험은 Node·Python 프로세스에서 돌았다. web 시험은 Node에서 `react-dom/server`로 그린 글자를 본다. DOM 흉내도 실제 브라우저도 쓰지 않는다.
  - 실제 브라우저로 본 것은 팀장이 측정 환경의 web(`localhost:3000`)을 자기 브라우저로 연 두 가지다. 하나는 AC9.1.4 실제 커밋 링크, 다른 하나는 NC3 Unit 확인 때 본 목록·상세 화면이다.

## 빌드

| 서비스 | 명령 | 종료 코드 |
|---|---|---|
| api | `npm --prefix api run lint` · `typecheck` · `build`(`test:coverage`가 먼저 실행) | 0 · 0 · 0 |
| web | `npm --prefix web run lint` · `typecheck` | 0 · 0 |
| worker | `uv run --locked ruff check .` · `ruff format --check .` · `mypy` | 0 · 0 · 0 |

web `next build`는 돌리지 않았다. intent 검증 명령(`verification-command.txt`)에 없고, 측정 환경 web은 `npm run dev`로 띄웠다.

## 서비스별 전체 시험·커버리지 (프로젝트 하한 80%의 근거)

| 서비스 | 명령 | 종료 코드 | 결과 | 줄 커버리지(맨 아래 줄) | 걸린 시간 |
|---|---|---|---|---|---|
| api | `npm --prefix api run test:coverage` | 0 | 1,837개 중 1,799 통과·0 실패·38 건너뜀 | `all files` 98.49%(분기 89.86%, 함수 96.86%) | 473초 |
| web | `npm --prefix web run test:coverage` | 0 | 1,026개 모두 통과 | `all files` 93.65%(분기 90.54%, 함수 88.37%) | 15초 |
| worker | `(cd worker && uv run --locked pytest --cov --cov-report=term-missing)` | 0 | 2,636 통과·12 건너뜀 | `TOTAL` 96%(8,977줄 중 366줄 빠짐) | 202초 |

- api가 건너뛴 38개는 모두 실제 큐·Redis 시험이다. `CATCHU_TEST_REDIS_URL`이 없어서 건너뛰었고, 그중 1개는 U10 전용 로컬 큐 설정이 없어서 건너뛰었다. NC1~NC3가 바꾼 경로의 시험은 건너뛴 것에 없다.
- intent가 바꾼 파일의 줄 커버리지(확인용, 판정은 위 서비스 전체 값):
  - api(`dist/` 기준): 바뀐 20개 파일이 모두 97% 이상이다. `receiver.types.ts`는 타입만 있어 표에 없다.
  - worker: `build.py` 96%, `revisit.py` 97%, `normalize.py` 95%, `records.py` 97%, `fake_generator.py` 96%, `generation.py` 97%, `live.py` 100%, `result.py` 98%.
  - web: 대부분 93% 이상이고, `assets-view.tsx`는 87.38%다.
  - web `assets-connected.tsx`는 21.14%다. 연결 화면 조립 파일이라 시험이 일부만 불러온다. 이번 intent는 이 파일에서 19줄을 더하고 13줄을 지웠다.
  - web `assets-api-preview.tsx`·`assets-preview.tsx`는 시험이 불러오지 않아 표에 없다. web README 규칙대로 0%로 따로 센다. 둘 다 미리보기 화면용이다.

## Unit 시험 명령 (세 Unit의 `unit-test-instructions.md`, 같은 명령은 한 번)

| Unit | 명령 | 종료 코드 | 결과 |
|---|---|---|---|
| NC1 | `(cd web && node --test test/author-description-sections.test.mjs … test/recipient.test.mjs)` (11개 파일) | 0 | 262 통과 |
| NC1 | `npm --prefix api test -- test/catches/owner-catch-http.test.cjs test/catches/owner-catch-response.test.cjs` | 0 | 80 통과 |
| NC1 | web 공통 함수 둘 커버리지(확인용) | 0 | 34 통과, 줄 100%·분기 99.32% |
| NC2 | `(cd web && node --test test/github-link-name.test.mjs test/publications-owner.test.mjs test/recipient.test.mjs test/publish.test.mjs)` | 0 | 118 통과 |
| NC2 | `npm --prefix api test -- test/publications/publish-api.test.cjs … test/jd/jd-summary.test.cjs` (8개 파일) | 0 | 77 통과 |
| NC2 | web `github-link-name.ts` 커버리지(확인용) | 0 | 21 통과, 줄 100%·분기 98.98% |
| NC3 | `(cd worker && uv run --locked pytest tests/test_revisit_facts.py tests/test_collection_flow.py tests/test_candidate_flow.py tests/test_live_processing.py tests/test_processing.py)` | 0 | 229 통과 |
| NC3 | `npm --prefix api test -- test/worker-messages.test.cjs … test/published-index/chunker.test.cjs` (10개 파일) | 0 | 248 통과 |
| NC3 | `npm --prefix api run test:analysis-fixtures` | 0 | 16 통과 |
| NC3 | `(cd web && node --test test/assets-revisit-facts.test.mjs test/assets-view.test.mjs test/assets-api.test.mjs)` | 0 | 92 통과 |
| NC3 | worker `test_revisit_facts.py` `app/candidates` 커버리지(확인용) | 0 | 42 통과, `revisit.py` 97%(폴더 `TOTAL` 36%는 이 시험 하나만 돌려서다) |
| 이 단계 | `npm --prefix api test -- test/rag-answer/rag-eval.test.cjs` | 0 | 9 통과(답 실패 기록 시험 포함) |

## 실제 연결 측정 (로컬 측정 환경, 실제 키·실제 GitHub)

측정 환경은 cr1과 따로 만든 DB·Valkey(`catchu-nc3-measure-*`)다. 팀장이 Google로 로그인하고, GitHub 연결과 분석 동의도 팀장이 했다. 그 뒤 TheMe를 NC3 판으로 LIVE 분석했다.

### 호출 수·시간·크기 (NC3 NFR1.1·NFR1.3, Q1 A)

| 값 | 11/8 cr1(바꾸기 전) | NC3 판 | 판정 |
|---|---|---|---|
| 「수집 종료」 calls | 132 | 132 | 같음 |
| 「생성 종료」 generationCalls · rewriteCalls | 45 · 0 | 45 · 0 | 같음 |
| 후보 수 | 46 | 46 | 같음 |
| 수집 elapsedSeconds | 61.638 | 65.979 | 기록만 |
| 종결 elapsedSeconds | 239.704 | 165.443 | 기록만(AI 호출 시간이 섞임) |
| resultBytes | 152,482 | 174,600 | 기록만 |

호출 수가 같아 Q1의 조건부 B(바꾸기 전 판 재측정)는 하지 않았다.

### 로그 (NC3 NFR4.3, NC2 Q2)

- worker 로그의 「다시 볼 곳 계산 실패」: 0줄
- api 로그의 `EMBEDDING_PROVIDER_SYNTHETIC`: 0줄

### 규칙별 붙은 Catch 수와 버림 (FR15.4, NFR4.2)

분모는 이 분석에서 만든 Catch 46개다. DB 질의로 셌다.

| 규칙 | 붙은 Catch | 비율 | FR15.4 |
|---|---|---|---|
| REWORKED_LINES | 19 | 41.3% | 남김 |
| MOVED_FILE | 4 | 8.7% | 남김 |
| EXTENSION_CHANGED | 1 | 2.2% | 버림(5% 미만) |
| REVERTED | 0 | 0% | 버림 |
| TEST_FILES_PRESENT | 0 | 0% | 버림 |

- 사실은 모두 66개다(다시 고침 57, 옮김 8, 확장자 1). Catch 하나에 많아야 9개다.
- 팀장 결정에 따라 버린 셋은 worker 상수 `ENABLED_KINDS`로 끄고, 그에 맞는 시험과 문서만 고쳤다. 고지 4절 초안 문구는 그대로다.
- 고친 문서는 `worker/docs/candidate-decision.md`, `worker/README.md`, 기능 설계 `rules.md` BR2.4·BR3.1, `functional-spec.md` W1이다.
- 되돌림 규칙을 끈 때 되돌림 쌍을 다시 고침에서 빼지 않게 고쳤다(A2). 시험을 더했다(`test_a2_revert_pair_is_rework_when_revert_rule_is_off`).
- worker Unit 시험은 229개 모두 통과했다.

### 사람 대조와 실제 링크

- NFR4.1: 사실 66줄이 모두 맞고 틀린 줄은 0줄이다(`nfr4-1-human-check.md`).
  - 66줄은 다른 Claude 세션이 스크립트로 GitHub 커밋 상세와 자동 대조했다.
  - 팀장은 화면 링크와 GitHub로 표본 38번·65번을 확인했다.
- AC9.1.4: 팀장이 실제 커밋 링크를 자기 브라우저 화면에서 확인했다.
- AC12.7·FR14.3: 카카오 지도 Catch의 사실 4개와 작업 시각이 사본 세 개와 검색 조각 52개 어디에도 없다(`nfr3-qna-measurement.md`).

### 질의응답 재측정과 기본 요약 (NFR3, FR11.1·FR11.2, AC8.1.1~AC8.1.3)

상세는 `nfr3-qna-measurement.md`, 저장소 기록은 `api/docs/rag-evaluation/2026-11-12.md`다.

- 검색 적중률(앞 5·8·12개): 70.0%·80.0%·80.0%
- 근거 통과율: 96.7%(통과 29, 버림 1)
- 팀장 판정:
  - 오귀속 0건(AC8.1.3 통과), 근거 비뒷받침 0건
  - 답 실패 1건(5번)
  - 사실처럼 쓴 문장 2개(1·2번), 딱지 없이 옮긴 답 2개(3·8번)
- AC8.1.2 기본 요약:
  - 꼴은 「작성자는 …라고 적었다」가 4/4로 맞다.
  - 6항목이 모두 인용 없는 AI 해석 항목이라 '작성자 자료 원문' 딱지가 붙지 않는다.
  - 항목 5는 GitHub 기록(커밋 메시지)을 작성자 주장처럼 썼다.
  - 팀장 결정: 불충족으로 기록하고 intent가 끝난 뒤 후속으로 다룬다.

## Target Verification Matrix

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| TC-COV-api | 세 Unit `code-generation-plan.md` Testing Contract | 줄 80% 이상 | 98.49% | 위 「서비스별 전체 시험」 api 행 | build-and-test | Met |
| TC-COV-web | 같음 | 줄 80% 이상 | 93.65% | 같은 표 web 행 | build-and-test | Met |
| TC-COV-worker | 같음 | 줄 80% 이상 | 96% | 같은 표 worker 행 | build-and-test | Met |
| TC-CI | 같음 「Run the selected tests in CI before merge.」 | CI에서 시험 | — | `aidlc-state.md` ci-pipeline `[ ]` EXECUTE | ci-pipeline | N/A — CI Pipeline, later in this plan, sets up CI to run these tests before merge |
| TC-UNIT | 세 Unit `unit-test-instructions.md` | 모두 통과 | 11개 명령 종료 코드 0 | 위 「Unit 시험 명령」 | build-and-test | Met |
| TC-BUILD | intent 검증 명령 | 린트·타입 검사 통과 | 모두 종료 코드 0 | 위 「빌드」 | build-and-test | Met |
| NC1-NFR(13) | `nc1-sections-and-links/nfr-requirements/` NFR1.1·1.2·2.1·5.1~5.4·6.1~6.3·7.1·7.2·8.1 | 각 확인 방법 | 시험 통과·코드 확인 | NC1 `code-generation/traceability.json`의 대상 파일, 위 NC1 명령 | build-and-test | Met |
| NC2-NFR(15) | `nc2-snapshot-fields/nfr-requirements/` NFR1.1·1.2·2.1·2.2·5.1~5.3·6.1~6.3·7.1~7.3·8.1·8.2 | 각 확인 방법 | 시험 통과·코드 확인 | NC2 `traceability.json`, 위 NC2 명령. NFR2.2의 답 말투는 아래 AC8.1.1 행 | build-and-test | Met |
| NC3-NFR(15) | `nc3-revisit-facts/nfr-requirements/` NFR1.2·1.4~1.6·2.1·5.1·5.2·6.1·7.1~7.3·8.1~8.4 | 각 확인 방법 | 시험 통과·코드 확인 | NC3 `traceability.json`, 위 NC3 명령 | build-and-test | Met |
| NC3-NFR1.1 | NC3 performance-requirements NFR1.1 | GitHub·AI 호출 수가 바꾸기 전과 같다 | calls 132·generationCalls 45·rewriteCalls 0, 모두 같음 | 위 「호출 수·시간·크기」 | build-and-test | Met |
| NC3-NFR1.3 | NC3 performance-requirements NFR1.3 | elapsedSeconds를 기록만 한다 | 수집 65.979, 종결 165.443 | 같은 표 | build-and-test | Met |
| NC3-NFR4.1 | NC3 observability-requirements NFR4.1 | 사실 30~50줄 이상 대조, 줄마다 판정 | 66줄 맞음·틀림 0 | `nfr4-1-human-check.md` | build-and-test | Met |
| NC3-NFR4.2 | NC3 observability-requirements NFR4.2 | 규칙별 수·비율을 기록 | 위 규칙 표 | 「규칙별 붙은 Catch 수」 | build-and-test | Met |
| NC3-NFR4.3 | NC3 observability-requirements NFR4.3 | 「다시 볼 곳 계산 실패」 0줄 | 0줄 | 「로그」 | build-and-test | Met |
| FR15.4 | requirements FR15.4 | 절반 넘게·5% 미만 규칙은 버린다 | 셋 버림, 둘 남김 | 「규칙별 붙은 Catch 수」, worker 시험 | build-and-test | Met |
| AC9.1.4 | stories AC9.1.4 | 실제 커밋 링크가 열린다 | 팀장 확인 | 팀장 브라우저(실제 브라우저) | build-and-test | Met |
| AC12.7·FR14.3 | requirements AC12.7·FR14.3 | 사실·시각이 사본·조각에 없다 | 0건 | `nfr3-qna-measurement.md` | build-and-test | Met |
| NFR3·FR11.2 | requirements NFR3·FR11.2, Q2 A | 질의응답 10개 재측정, 오귀속 0건 | 오귀속 0, 비뒷받침 0 | `nfr3-qna-measurement.md`, `api/docs/rag-evaluation/2026-11-12.md` | build-and-test | Met |
| AC8.1.3 | stories AC8.1.3 | 남의 기여를 지원자 기여로 쓰지 않는다 | 0건(7·9번 시험됨) | 같음 | build-and-test | Met |
| AC8.1.1 | stories AC8.1.1, FR11.1 | 답이 「작성자는 …라고 적었다」 꼴이고 딱지가 붙는다 | 3·8번 딱지 없음, 1번 꼴 다름, 1·2번 사실처럼 씀 | `nfr3-qna-measurement.md` 답별 판정 | build-and-test | Not Met |
| AC8.1.2 | stories AC8.1.2, FR11.1 | 기본 요약의 작성자 문장이 그 꼴이고 딱지가 붙는다 | 꼴 4/4, 딱지 0/6, 항목 5는 GitHub 기록을 작성자 주장처럼 씀 | 같음 「AC8.1.2」 | build-and-test | Not Met |
| FR15.1·FR15.2·FR15.3·NC3-NFR7.4 | requirements FR15.1~FR15.3, NC3 reliability-requirements NFR7.4 | 아래 「PR·배포 때만 확인되는 것」 | 결과 메시지 판본 "4"와 거부 시험은 통과. 나머지는 아직 하지 않음 | NC3 `traceability.json`(NFR7.4 Deferred) | NC3 PR(이 계획에 맡을 단계 없음) | Unverified |

`FR15.1·FR15.2·FR15.3·NC3-NFR7.4` 행에서 PR·배포 때만 확인되는 것:
- FR15.1 함께 배포: api와 worker를 함께 배포한다.
- FR15.2 고지 문구 팀장 승인: 고지 4절의 한 줄을 팀장이 PR에서 승인한다.
- FR15.3: 초기화 전에 통합 브랜치에 들어간다.
- NFR7.4: PR 병합이 초기화보다 앞선다.

## 실패와 남은 일

- 실패한 명령은 없다.
- Not Met은 AC8.1.1·AC8.1.2 두 행이다. Unverified는 FR15.1~FR15.3·NFR7.4 한 행이다.
- 원인과 고칠 길, 팀장 결정은 `build-and-test-summary.md` 「알려진 한계·남은 일」에 적는다.

## 실패 처리 (2026-11-12)

- 원인
  - AC8.1.1·AC8.1.2: NC2 받은 사람 AI 지시. 작성자 글을 인용 없는 AI 해석 항목으로 옮기면 딱지가 붙지 않는다.
  - FR15.1~FR15.3·NFR7.4: 이 계획에 맡을 단계가 없다. PR·배포 때만 확인된다.
- 고칠 길(AC8.1.x만): NC2 코드 생성으로 돌아가 작성자 주장을 인용 항목으로 내게 지시와 시험을 고친다. 그리고 질의응답 10개·기본 요약을 다시 잰다.
  - 예상 공수 2~3시간
  - 비용은 측정 한 번 약 0.05달러 이하
  - 위험: NFR3를 다시 판정해야 하고, NC2 계획 승인·리뷰·Unit 확인을 다시 거친다
- 팀장 선택: **Accept failure**.
  - 세 행을 실패로 남기고 이 단계 승인 관문으로 간다.
  - AC8.1.1·AC8.1.2는 NC3 PR 「수행하지 못한 검증」과 intent 뒤 후속으로 다룬다.
  - FR15.1~FR15.3·NFR7.4는 NC3 PR에서 확인한다.
- 돌아간 횟수 0/3.
