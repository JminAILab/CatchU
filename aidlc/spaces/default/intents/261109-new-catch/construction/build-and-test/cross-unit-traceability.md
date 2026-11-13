# 새 Catch — Unit 사이 추적

출처: `aidlc engine sensor-traceability --stage build-and-test` 출력(2026-11-12). 이 문서는 그 출력을 옮기고, 덮이지 않은 항목마다 이 단계에서 무엇으로 확인했는지 덧붙인다.

## 판정

- 도구 판정: `pass: false`. 덮이지 않은 항목은 10개다: FR11.1, FR11.2, FR15.1~FR15.4, NFR3, NFR4, NFR7, AC8.1.3.
- 이 단계 판정: 10개 가운데 5개는 이 단계 측정으로 확인했다. 2개(FR11.1, NFR4)는 일부만 확인했고, 나머지 4개(FR15.1~FR15.3, NFR7)는 PR·배포 때 확인한다.
  - 측정으로 확인: FR11.2, FR15.4, NFR3, AC8.1.3, 그리고 NFR4의 일부.
  - 일부만 확인: FR11.1(AC8.1.1·AC8.1.2 불충족), NFR4.
  - PR·배포 때 확인: FR15.1~FR15.3, NFR7(NFR7.4).
- 도구는 Unit 코드 생성의 추적표(`traceability.json`)만 읽는다. 그래서 이 단계의 측정 기록은 도구 판정에 들어가지 않는다.
- 승인 관문에 올릴 항목은 FR11.1(AC8.1.1·AC8.1.2), FR15.1~FR15.3, NFR7.4다.

## 요구사항별 덮임 (도구 출력 요약)

| 묶음 | 덮임 | Unit | 대상 파일(대표) |
|---|---|---|---|
| FR1~FR8 (칸 제목·링크 이름·본인 목록 조건·발행 화면) | 모두 덮임 | NC1 | web `test/author-description-*.test.mjs`·`github-link-name.test.mjs`·`recipient.test.mjs`·`publish.test.mjs`·`assets-view.test.mjs`, api `test/catches/owner-catch-http.test.cjs` |
| FR9·FR10 (사본 선택 칸·본인 커밋 표지) | 모두 덮임 | NC2 | api `test/publications/publish-api.test.cjs`·`test/published-index/chunker.test.cjs`, web `test/recipient.test.mjs`·`github-link-name.test.mjs` |
| FR11.1 (받은 사람 AI 말투) | 덮이지 않음(AC8.1.3 미구축) | NC2 | AC8.1.1 `qna-controller.test.cjs`, AC8.1.2 `base-summary-handler.test.cjs` |
| FR11.2 (질의응답 재측정) | 덮이지 않음 | — | — |
| FR12~FR14 (다시 볼 곳·작업 시각·본인 목록 정렬) | 모두 덮임 | NC3 | worker `tests/test_revisit_facts.py`·`test_candidate_flow.py`, api `owner-catch-http.test.cjs`·`publish-api.test.cjs`, web `assets-revisit-facts.test.mjs` |
| FR15.1~FR15.4 (3단계 공통) | 덮이지 않음 | — | — |
| NFR1·NFR2·NFR5·NFR6·NFR8 | 모두 덮임 | NC1~NC3 | 세 Unit `traceability.json` |
| NFR3 | 덮이지 않음 | — | — |
| NFR4 | 덮이지 않음(NFR4.1 Deferred) | NC3 | NFR4.3 `worker/app/processing/live.py` |
| NFR7 | 덮이지 않음(NFR7.4 Deferred) | NC1~NC3 | NFR7.4 말고는 모두 OK |
| AC1.1.1~AC11.2.1 | AC8.1.3 말고 모두 덮임 | NC1~NC3 | 도구 출력의 `built_in` |

## 덮이지 않은 항목과 이 단계의 확인

| ID | 왜 덮이지 않았나 | 이 단계에서 | 근거 | 판정 |
|---|---|---|---|---|
| FR11.2·NFR3 | 측정이라 코드 대상이 없음 | 질의응답 10개를 다시 쟀다. 오귀속 0, 비뒷받침 0 | `nfr3-qna-measurement.md` | 확인 |
| AC8.1.3 | 측정이라 코드 대상이 없음 | 남의 기여를 지원자 기여로 쓴 답 0건(7·9번 시험됨) | 같음 | 확인 |
| FR11.1 | AC8.1.3이 측정이라 미구축으로 나옴 | AC8.1.1·AC8.1.2 실제 답을 봄 | 같음 | 불충족(AC8.1.1·AC8.1.2) |
| FR15.4 | 측정이라 코드 대상이 없음 | 규칙별 수를 재서 셋을 끔 | `test-results.md` 「규칙별 붙은 Catch 수」 | 확인 |
| NFR4 | NFR4.1이 Build and Test로 넘어옴 | NFR4.1 66줄 대조, NFR4.2 규칙별 수, NFR4.3 실패 로그 0줄 | `nfr4-1-human-check.md`, `test-results.md` | 확인 |
| FR15.1 | 배포 방식이라 코드 대상이 없음 | 판본 "4"와 판본 "3" 거부는 시험 통과. 함께 배포는 아직 | `test/worker-messages.test.cjs`·`test/analysis/receiver.test.cjs` | 확인 안 됨(배포 때) |
| FR15.2 | 고지 문구 승인이 PR 몫 | 고지 4절 한 줄은 코드에 있음. 팀장 승인은 NC3 PR에서 | `api/test/db/analysis-notice.test.cjs` | 확인 안 됨(NC3 PR) |
| FR15.3·NFR7(NFR7.4) | 병합 시점이라 코드 대상이 없음 | 아직 | NC3 `traceability.json`(Deferred) | 확인 안 됨(NC3 PR 병합) |

## Unit별 상태

| Unit | 코드 생성 추적표 | 미구축 |
|---|---|---|
| NC1 `nc1-sections-and-links` | 모두 OK | 없음 |
| NC2 `nc2-snapshot-fields` | 모두 OK | AC8.1.3(측정 몫) |
| NC3 `nc3-revisit-facts` | NFR4.1·NFR7.4만 Deferred | NFR4.1(이 단계에서 확인), NFR7.4(NC3 PR) |
