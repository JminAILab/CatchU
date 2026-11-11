# CR3 AI 쪽 — Unit 시험 안내

## 시험 도구

- **worker:** pytest(`worker/pyproject.toml`), 커버리지 pytest-cov. 새 설정은 없다.
- **web:** Node 내장 시험 실행기(`node --test`). 새 설정은 없다.
- **api:** Step 18(고지, FR10을 넘었을 때만)에서만 고지 상수·문구 시험을 고친다. 그때는 아래 api 명령을 함께 돌린다.

## 이 Unit의 시험 명령

워크스페이스 루트에서 실행한다. 새로 만드는 시험 파일 세 개(`test_judgement.py`·`test_judgement_factcheck.py`·`test_judgement_confirmation.py`)가 생기기 전(Step 2)에는 그 셋을 빼고 돌린다.

```bash
(cd worker && uv run --locked pytest tests/test_judgement.py tests/test_judgement_factcheck.py tests/test_judgement_confirmation.py tests/test_generation_flow.py tests/test_generation_title.py tests/test_generation_groups.py tests/test_generation_material.py tests/test_generation_claude.py tests/test_consumer_settings.py tests/test_consumer_processor.py)
```

```bash
(cd web && node --test test/assets-view.test.mjs test/recipient.test.mjs)
```

Step 18을 할 때만:

```bash
(cd web && node --test test/u2-consent.test.mjs)
```

```bash
npm --prefix api test -- test/db/analysis-notice.test.cjs test/db/analysis-intake.test.cjs test/db/analysis-intake-real.test.cjs test/db/u7-scope-revision.test.cjs test/integration/analysis-intake-receiver.test.cjs test/integration/analysis-intake-real-chain.test.cjs test/u2/ai-consent.test.cjs test/u2/withdrawal.test.cjs
```

(2026-11-06 고침: 처음 적은 `test/analysis-intake`는 없는 경로라 시험을 하나도 돌리지 않았다. 고지·접수·동의 시험 파일을 직접 적는다. 시험 DB `catchu-db-test`(127.0.0.1:5433)가 있어야 한다.)

## 기대 커버리지

- 프로젝트 전체 줄 커버리지 80%는 Build and Test가 전체 시험에서 잰다(Testing Contract의 범위 하한). 위 Unit 명령으로는 판정하지 않는다.
- 이 Unit에 따로 둔 커버리지 목표는 없다.
- 새 모듈(`worker/app/judgement/`, 기계 대조 모듈, 확인 명령)은 Unit 시험으로 모든 갈래를 지난다.
- 확인하는 법(판정용이 아님): `(cd worker && uv run --locked pytest tests/test_judgement.py tests/test_judgement_factcheck.py tests/test_judgement_confirmation.py --cov=app/judgement --cov-report=term-missing)`

## 시나리오와 시험 파일

| 시나리오 | 시험 파일 |
|---|---|
| S1·S2(켜기), 잘못된 공급자 값, 키가 환경에 남지 않음 | `test_consumer_settings.py` |
| S3·S18·S30(생성 응답의 AI 쪽), 생성 요청에 기록의 글 없음 | `test_generation_flow.py`, `test_generation_title.py` |
| S4(기계 대조), PR 번호·숫자·예외 낱말·한글 | `test_judgement_factcheck.py` |
| S5·S6·S9~S11·S19·S20·S26(답 적용) | `test_generation_flow.py` |
| S7·S27·S28(호출 수·판정 없음·시간 몫) | `test_generation_flow.py` |
| S8·S17·S29·S31(판정 요청 조립·답 읽기) | `test_judgement.py` |
| S13~S16(재료 판정 답 적용) | `test_generation_groups.py`, `test_generation_material.py` |
| Claude·OpenAI 어댑터(요청 모양·저장 끔·주소 고정·다시 시도 0·실패 코드) | `test_judgement.py`, `test_generation_claude.py` |
| 로그에 원문 없음, 건수 | `test_generation_flow.py`, `test_consumer_processor.py` |
| S10·S11(설명 칸 숨김·실패 안내) | `web/test/assets-view.test.mjs`, `web/test/recipient.test.mjs` |
| S25(확인 명령, 저장소 안 경로 거부) | `test_judgement_confirmation.py` |
| S21·S22(고지, Step 18만) | api 고지 시험, `web/test/u2-consent.test.mjs` |

실패 조건(어느 시험에서든 실패로 본다):
- AI 쪽이 꺼졌는데 판정 호출이 나간다.
- 같은 후보에 판정 요청이 두 번 나간다.
- 판정 요청에 정해진 칸 밖의 자료(SHA·작성자·날짜·이슈 글·다른 Catch)나 가린 줄이 있다.
- 판정을 거치지 않은 AI 후보·문장이 제목·설명이 된다.
- 작업 사실에 생성 출력의 글이 들어간다.
- 같은 기록의 글이 제목과 둘째 줄에서 다르게 판단된다.
- 키·토큰·기록의 글·후보 원문이 로그나 파일에 남는다.

## 대역(mock)과 시험 자료

- **판정 공급자:** 합성 판정 어댑터를 쓴다. 질문 id마다 정해 둔 답을 돌려주고, 실패 셋(시간 초과·호출 오류·읽을 수 없는 응답)을 흉내 낸다. 외부 호출은 없다.
- **OpenAI·Claude SDK:** 어댑터 시험은 SDK 클라이언트 대역으로 요청 인자만 본다. 네트워크에 나가지 않는다.
- **생성 공급자:** 지금 시험의 `ScriptedProvider`(`worker/tests/generation_scenarios.py`)에 AI 쪽 응답(`titleCandidates`·`sentences`)을 더해 쓴다.
- **수집 결과:** 지금 시험 도우미의 합성 레코드를 쓴다. 확인 명령 시험은 합성 수집 결과 파일을 임시 폴더(저장소 밖)에 만든다.
- **비밀값 모양:** 실제 키를 쓰지 않는다. 꼴만 맞춘 가짜 값을 쓴다.
- **web:** 지금 시험처럼 합성 Catch 객체로 그린다. NOT_GENERATED·FAILED 표본을 하나씩 더한다.
