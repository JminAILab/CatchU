# CR1 규칙 쪽 Catch — Unit 시험 안내

## 시험 도구

- **worker:** pytest 9.1.1(`worker/pyproject.toml`), 커버리지 pytest-cov 7.1.0. 새 설정은 없다.
- **web:** Node 내장 시험 실행기(`node --test`). 새 설정은 없다.
- **api:** CR1은 api를 바꾸지 않으므로 이 Unit의 시험이 없다.

## 이 Unit의 시험 명령

워크스페이스 루트에서 실행한다. 새로 만드는 시험 파일 두 개가 생기기 전(Step 2)에는 그 두 파일을 빼고 돌린다.

```bash
(cd worker && uv run --locked pytest tests/test_candidate_record_text.py tests/test_generation_groups.py tests/test_candidate_grouping.py tests/test_candidate_identity.py tests/test_candidate_flow.py tests/test_candidate_cases.py tests/test_generation_material.py tests/test_generation_title.py tests/test_generation_flow.py tests/test_generation_redact.py tests/test_consumer_processor.py)
```

```bash
(cd web && node --test test/assets-view.test.mjs test/recipient.test.mjs)
```

## 기대 커버리지

- 프로젝트 전체 줄 커버리지 80%는 Build and Test가 전체 시험에서 잰다(Testing Contract의 범위 하한). 위 Unit 명령으로는 판정하지 않는다.
- 이 Unit에 따로 둔 커버리지 목표는 없다.
- 새 모듈 `worker/app/candidates/record_text.py`와 `worker/app/generation/groups.py`는 Unit 시험으로 모든 갈래를 지난다.
- 확인하는 법(판정용이 아님): `(cd worker && uv run --locked pytest tests/test_candidate_record_text.py tests/test_generation_groups.py --cov=app/candidates --cov=app/generation --cov-report=term-missing)`

## 시나리오 표 (Step 3에서 시험 이름과 짝지음)

| 시나리오 | 시험 파일 |
|---|---|
| S1·S2(나누지 않음), S18(열쇠 유지) | `test_candidate_grouping.py`, `test_candidate_identity.py` |
| S3~S7, S17, S19~S22, S29, 2,000/2,001자 경계 | `test_candidate_record_text.py` |
| S8, S9, S23, S28(작업 사실) | `test_candidate_grouping.py`, `candidate_scenarios.py` |
| S16(생성 실패에도 제목), 고쳐 쓰기 0번, 「제목만 없음」 집계, 생성 요청에 기록의 글 없음 | `test_generation_flow.py` |
| S11과 종류 판정 꼴 | `test_generation_title.py` |
| S10, S12(재료 순서·묶음) | `test_generation_material.py` |
| S24~S27, 커밋 3,000 합성 후보(결과만) | `test_generation_groups.py` |
| 로그에 `workFacts[1]`·제목 원문 없음 | `test_consumer_processor.py` |
| 가리기 위치 이동 | `test_generation_redact.py` |
| S13~S15, 옛 꼴 작업 사실, 태그 꼴 제목 | `web/test/assets-view.test.mjs`, `web/test/recipient.test.mjs` |

실패 조건(어느 시험에서든 실패로 본다):
- 가리기에 걸린 글이 제목이나 작업 사실에 나간다.
- 기록의 글이 잘린다.
- 작업 사실이 3줄 이상이다.
- 큰 후보에서 한 파일이 6,000 B(머리글 포함)를 넘는다.
- 같은 입력에서 재료 순서가 달라진다.
- 둘째 줄과 제목이 서로 다른 기록의 글 판단을 쓴다.

## 대역(mock)과 시험 자료

- **Claude 생성:** 지금 시험이 쓰는 합성 제공자(`worker/tests/generation_scenarios.py`의 가짜 생성기)를 그대로 쓴다. 외부 호출은 없다.
- **수집 결과:** 지금 시험 도우미가 만드는 합성 레코드(PR·커밋·변경 파일)를 쓴다.
  - 기록의 글 시험은 PR 제목·커밋 메시지·작성자·커밋 목록 완전 여부만 바꿔 만든다.
- **커밋 3,000 합성 후보:** 시험 안에서 만든다. 파일로 저장하지 않는다.
- **비밀값 모양:** 실제 비밀값을 쓰지 않는다. 지금 `test_generation_redact.py`처럼 꼴만 맞춘 가짜 값을 쓴다.
- **web:** 지금 시험처럼 합성 Catch 객체로 그린다. 옛 꼴 작업 사실 표본(SHA가 든 첫 줄, 다른 계정 문장) 하나를 더한다.
