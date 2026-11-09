# Catch 개편 — 통합 시험 안내

시험 전략은 Standard다. 그래서 핵심 경계의 통합 시험만 둔다. Unit 사이 경계와, 그 경계를 지나는 시험은 아래와 같다. 모두 기존 시험 틀(api `node --test` + 시험 DB, worker pytest + 합성 대역, web `node --test`) 안에 있다.

## 경계와 시험

| 경계 | 무엇을 보나 | 시험 |
|---|---|---|
| C1 api 맥락 조회 → worker | 소속 SHA 목록 칸(`assignedCommitShas`), 그 회원·저장소 것만 | api `test/db/worker-context-api.test.cjs`·`test/u7-worker-context.test.cjs`, worker `tests/test_request_context.py` |
| C2 worker 결과 v3 → api 수신·등록 | 판본 "3", `ownCommitShas`, 같은 트랜잭션의 소속 쓰기 | api `test/analysis/receiver.test.cjs`·`test/catches/registration-postgres.test.cjs`, worker `tests/test_processing.py`·`tests/test_worker_messages.py`, 공용 자료 `worker/fixtures/m1-synthetic` |
| C6 후보 판정 → CR2 빼기·CR3 판정 | 기록의 글·작업 사실 둘째 줄·소속 집합 | worker `tests/test_candidate_assignment.py`·`tests/test_candidate_cases.py`·`tests/test_generation_flow.py` |
| C7 재료 고르기·제목 결정 → CR3 판정 | 재료 순서, AI 쪽 꺼짐·켜짐 제목 | worker `tests/test_generation_material.py`·`tests/test_generation_title.py`·`tests/test_judgement.py` |
| C3·C4 고지 v3·첫 이용 고지 판본 | 판본 값, 받는 곳 셋 | api `test/db/analysis-notice.test.cjs`·`test/u2/ai-consent.test.cjs`, web `test/u2-consent.test.mjs` |
| C5 Catch 응답 → 화면 | 목록 2줄, 설명 칸 숨김, 받은 사람 안내 | web `test/assets-view.test.mjs`·`test/recipient.test.mjs`(Node에서 원문 단언·컴포넌트 출력, 실제 브라우저 아님) |
| 탈퇴 연쇄 삭제 | 소속 기록 0건 | api `test/db/member-cascade-delete.test.cjs`·`test/catches/upstream-foreign-keys.test.cjs` |

## 실행

- 경계 시험은 각 Unit의 Unit 시험 명령 안에 있다(세 Unit의 `unit-test-instructions.md`). 같은 명령은 한 번만 돌린다.
- 전체 시험·커버리지는 intent 검증 명령으로 돌린다(`build-instructions.md`).

## 실제 연결 확인(사람이 브라우저에서)

합성 시험이 대신하지 못하는 실제 GitHub·api·worker 연결은 Unit마다 로컬 실제 연결 확인으로 봤다. 기록은 각 Unit 코드 요약에 있다.

| Unit | 확인 | 결과 |
|---|---|---|
| CR1 | 로컬 실제 분석 다섯 가지(TheMe·catchu-live-test) | CR1 코드 요약 |
| CR3 | FR10 확인 Catch 20개 | 기준 통과(틀린 제목 0, 틀린 문장 0), CR3 코드 요약 「FR10 확인」 |
| CR2 | 같은 저장소 세 번 분석(`ljm0850/catchu-live-test`) | 두 번째 분석 새 Catch 0, 새 커밋만 새 Catch, 설명 그대로. CR2 코드 요약 「로컬 실제 연결 확인」 |

## 커버리지

- 서비스마다 줄 커버리지 80% 이상이 하한이다(Testing Contract).
- intent 검증 명령의 `test:coverage`·`pytest --cov`가 잰다.

## 시험 자료

- 합성 자료만 쓴다(40자 합성 SHA, 합성 GitHub 응답, 합성 판정 공급자).
- 실제 저장소 원문과 키는 시험에 넣지 않는다.
- FR10 확인표 원문은 저장소 밖(`~/catchu-local-live/cr3-fr10/`)에만 있다.
