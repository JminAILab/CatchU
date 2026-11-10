# CR2 소속 저장 — Unit 시험 안내

## 시험 틀

- api: Node 내장 시험 실행기(`node --test`)를 `api/scripts/test-with-db.cjs`가 부른다. 파일을 넘기면 그 파일만 시험 DB(`catchu-db-test`, 127.0.0.1:5433, README 「DB 테스트」의 docker 명령)에서 돌린다. 새 설정은 없다.
- worker: pytest(`worker/pyproject.toml` 설정 그대로). 외부 호출은 합성 대역으로 막는다.

## 이 Unit의 시험 명령

api(시험 DB가 떠 있어야 한다):

```bash
npm --prefix api test -- test/catches/registration-postgres.test.cjs test/catches/registration-batch.test.cjs test/db/worker-context-api.test.cjs test/u7-worker-context.test.cjs test/analysis/receiver.test.cjs test/db/member-cascade-delete.test.cjs test/catches/upstream-foreign-keys.test.cjs
```

worker:

```bash
(cd worker && uv run --locked pytest tests/test_candidate_assignment.py tests/test_request_context.py tests/test_request_context_settings.py tests/test_processing.py tests/test_worker_messages.py tests/test_live_processing.py tests/test_candidate_identity.py tests/test_candidate_cases.py tests/test_generation_flow.py tests/test_judgement.py)
```

`tests/test_candidate_assignment.py`는 이 Unit이 새로 만든다. Step 2(실행기 확인)에서는 이 파일을 빼고 같은 명령을 돌린다.

## 시나리오·기대 결과·실패 조건(구현 전에 정함, 기능 명세 W1~W7)

| 시나리오 | 기대 결과 | 실패 조건 |
|---|---|---|
| W1 첫 분석(소속 없음) | 후보·열쇠가 지금과 같고, 등록 때 후보 본인 커밋이 모두 소속으로 써진다 | 열쇠가 바뀐다, 소속이 빠진다 |
| W3 같은 PR에 새 커밋 | 열쇠는 PR 그대로, 본인 목록은 새 커밋만. 기존 Catch에 소속만 더해지고 내용·작성자 설명·저장 시각 그대로 | 새 Catch가 생긴다, 설명이 바뀐다 |
| W4 통합 PR | 새 Catch에 새 커밋 1개만, 옛 5개는 Unit Catch 소속 그대로 | 옛 커밋이 옮겨진다 |
| W5 직접 커밋 이음 | 남은 2개로 새 열쇠·새 Catch, 묶음 설명에 고정 문장, 연결이 비어도 분석 계속 | 결함으로 멈춘다, 앞 Catch가 바뀐다 |
| W6 바뀐 것 없음 | 후보 0, 미제공 0, 로그 `assignedUnits`>0 | 미제공으로 센다 |
| W7 실패 | 소속 쓰기 DB 오류면 전체 롤백, 칸 없는 맥락 응답은 `CONTEXT_RESPONSE_INVALID`, "2" 결과는 `SCHEMA_INVALID` | 일부만 남는다 |
| 결정성 | 같은 입력 두 번이면 열쇠·`ownCommitShas`가 같고, 재료 찾기가 모든 후보를 찾는다 | 다른 열쇠, 재료 결함 |
| 탈퇴 | 소속 기록 0건, 연쇄 삭제 시험 통과 | 남는 행 |

## 기대 커버리지

- 이 intent의 줄 커버리지 하한은 80%이고, 서비스 전체 시험으로 Build and Test(intent 검증 명령의 `test:coverage`·`pytest --cov`)가 잰다. 위 Unit 명령은 커버리지를 판정하지 않는다.
- 이 Unit의 새 코드(소속 빼기·등록 쓰기·맥락 칸)는 위 시험으로 갈래를 모두 지난다.

## 대역·시험 자료

- worker 맥락 응답: `tests/context_synthetic.py`·`live_synthetic.py`에 `assignedCommitShas`를 더한다. 소속 집합은 시험마다 직접 넘긴다.
- 후보 장면: `tests/candidate_scenarios.py`의 합성 수집 결과를 쓰고, 소속 집합만 바꿔 W3~W6을 만든다.
- api 결과 자료: `test/helpers/worker-messages.cjs`가 계약 YAML로 검사하는 결과를 "3"과 `ownCommitShas`로 만든다. 공용 자료 `worker/fixtures/m1-synthetic/results/`도 같다.
- SHA는 40자 소문자 합성 값만 쓴다. 실제 저장소 자료·키는 시험에 넣지 않는다.
