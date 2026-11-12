# 새 Catch — 통합 시험 안내

- 시험 전략은 Standard다. 그래서 핵심 경계의 통합 시험만 둔다.
- 아래 표의 시험은 모두 기존 시험 틀 안에 있다: api `node --test` + 시험 DB, worker pytest + 합성 대역, web `node --test`.
- 계약 번호는 `inception/contract-design/contract-summary.md`의 것이다.

## 경계와 시험

| 경계 | 무엇을 보나 | 시험 |
|---|---|---|
| C1 본인 목록 「작성자 설명」 조건 (NC1) | `authorDescription` 조건 둘, 커서 범위, 공개 응답에 새 칸 없음 | api `test/catches/owner-catch-http.test.cjs`·`owner-catch-response.test.cjs`, web `test/assets-api.test.mjs`·`test/assets-view.test.mjs`·`test/publish.test.mjs` |
| C2 본인 목록 정렬과 다시 볼 곳 (NC3) | 작업 시각순·커서 판본 3, 판본 1·2 커서 400, 공개 목록 커서 v2 그대로 | api `test/catches/owner-catch-http.test.cjs`, web `test/assets-revisit-facts.test.mjs`·`test/assets-view.test.mjs` |
| C3 발행 사본의 선택 칸 넷 (NC2) | 저장소 이름·작성 달·작업 한계·본인 커밋 표지, 옛 사본 그대로, 조각·요약 근거에 새 칸 글자 없음 | api `test/publications/publish-api.test.cjs`·`test/published-index/chunker.test.cjs`·`test/rag-answer/summary-sources.test.cjs`, web `test/recipient.test.mjs`·`test/publications-owner.test.mjs` |
| C4 결과 메시지 판본 "4" (NC3) | worker가 사실·작업 시각을 보내고 api가 검사해 담음, 판본 "3" 거부, 상한 넘는 결과 거부 | api `test/worker-messages.test.cjs`·`test/analysis/receiver.test.cjs`·`test/catches/registration-batch.test.cjs`·`registration-postgres.test.cjs`·`revisit-facts-migration.test.cjs`, worker `tests/test_live_processing.py`·`tests/test_processing.py`·`tests/test_candidate_flow.py`, 공용 자료 `npm --prefix api run test:analysis-fixtures` |
| C5 분석 고지 v3 4절 한 줄 (NC3) | 고지 문구와 판본 | api `test/db/analysis-notice.test.cjs` |
| C6 worker·api 문장 대조 (NC2) | api 상수가 worker 원본 문장과 같음, 반례에서 실패 | api `test/publications/work-limit-sentences.test.cjs` |
| C7 web 공통 부품 (NC1 → NC2) | 칸 제목 나누기·링크 이름이 표지 판정과 함께 돎 | web `test/author-description-sections.test.mjs`·`test/github-link-name.test.mjs`·`test/recipient.test.mjs` |
| 받은 사람 AI 지시 (NC2) | 세 지시 끝 문장·딱지 상수 둘 | api `test/rag-answer/qna-controller.test.cjs`·`base-summary-handler.test.cjs`·`test/jd/jd-summary.test.cjs` |

web 시험은 Node에서 `react-dom/server`로 그린 글자를 단언한다. DOM 흉내도 실제 브라우저도 아니다.

## 실행

- 경계 시험은 각 Unit의 Unit 시험 명령 안에 있다(세 Unit의 `unit-test-instructions.md`). 같은 명령은 한 번만 돌린다.
- 전체 시험·커버리지는 intent 검증 명령으로 돌린다(`build-instructions.md`).

## 실제 연결 확인

합성 시험이 대신하지 못하는 연결은 로컬 측정 환경에서 실제 키와 실제 GitHub로 봤다. 대상은 실제 GitHub·api·worker·받은 사람 AI다. 결과는 `test-results.md` 「실제 연결 측정」에 있다.

| 무엇 | 어떻게 | 기록 |
|---|---|---|
| NC3 호출 수·규칙별 수·사실 대조·실패 로그 | 측정 DB에서 TheMe를 NC3 판으로 LIVE 분석 | `test-results.md`, `nfr4-1-human-check.md` |
| NC3 실제 커밋 링크(AC9.1.4) | 팀장이 자기 브라우저로 상세 화면을 봄 | `test-results.md` |
| NC2 질의응답 10개·기본 요약(NFR3, AC8.1.1~AC8.1.3) | 팀장이 작성자 설명을 쓴 Catch 셋으로 발행. 그 발행본에 `rag-eval measure`를 돌림 | `nfr3-qna-measurement.md`, `api/docs/rag-evaluation/2026-11-12.md` |
| NC3 사실이 사본·조각에 없음(AC12.7·FR14.3) | 측정 DB를 SQL로 조회 | `nfr3-qna-measurement.md` |

## 커버리지

- 서비스마다 줄 커버리지 80% 이상이 하한이다(Testing Contract).
- intent 검증 명령의 `test:coverage`·`pytest --cov`가 잰다.

## 시험 자료

- 시험에는 합성 자료만 쓴다(합성 SHA, 합성 GitHub 응답, 합성 커밋 기록).
- 실제 저장소 원문과 키는 시험에 넣지 않는다.
- 실제 측정 원문(질문·답)은 git 밖 `api/.rag-eval/`에만 둔다.
