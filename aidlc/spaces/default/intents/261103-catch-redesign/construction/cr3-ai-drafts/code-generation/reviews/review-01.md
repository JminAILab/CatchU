## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-06
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | worker/docs/candidate-text.md > 24행 「제목」 문단 | 이 문서는 "쓸 만한 기록의 글이 있으면 그 글이 제목이고, 생성 호출이 실패하거나 건너뛰어져도 같다"고만 적는다. CR3의 AI 쪽이 켜지면 판정 부실(RECORD_WHAT 0.5 미만)이나 전체 미달일 때 기록의 글이 제목에서 떨어지고 작업 사실 둘째 줄도 지워진다. 같은 규칙을 적은 문서인데 계획의 「고치는 파일」 목록에도, 실제 변경에도 없다. 프로젝트 규칙(규칙을 바꾸면 같은 규칙을 적은 문서를 모두 고친다)에 어긋난다. `generation.md`에는 「이 문서는 AI 쪽이 꺼진 경로다」 안내가 있지만 이 문서에는 없다. | `candidate-text.md`의 제목·작업 사실 문단에 「AI 쪽이 꺼진 경로 기준이며, 켜지면 판정 결과에 따라 달라진다」는 한 줄과 `generation-judgement.md` 링크를 더한다. | New |
| R-02 | Minor | worker/app/processing/confirm.py > `confirm()`의 `sheet_path.write_text`/`chmod(0o600)`, worker/app/processing/collection_file.py > `write()` | 비공개 저장소의 코드 줄·기록의 글이 든 확인표와 수집 결과 파일을 기본 권한으로 먼저 쓴 뒤 `chmod`로 줄인다. 그 사이에 같은 기기의 다른 사용자가 읽을 수 있다. | 파일을 `os.open(..., 0o600)`으로 처음부터 본인 전용으로 만들거나, 출력 폴더를 `0o700`으로 만들어 쓴다. | New |
| R-03 | Minor | worker/app/judgement/openai_judge.py > `OpenAIJudge.__init__`(`OPENAI_CUSTOM_HEADERS` 검사), worker/app/consumer/child.py > `_judge_factory().openai_judge` | `OPENAI_CUSTOM_HEADERS`가 환경에 있으면 판정 공급자를 만들 때 `ValueError`가 난다. 만드는 시점은 요청을 처리하는 도중이다(`LiveGenerator`가 후보가 있을 때 부른다). 기동 때가 아니라 첫 후보가 있는 요청에서 예외가 나므로 요청 하나가 결함 처리된다. 설정 오류인데 기동 때 드러나지 않는다. | 설정 검사(`ConsumerSettings.from_environment`)에서 공급자가 openai이고 판정 키가 있을 때 이 환경변수를 함께 검사해 기동하지 않게 하거나, 문서에 「기동 후 첫 요청에서 드러난다」고 적는다. | New |
| R-04 | Minor | worker/aidlc/.aidlc-sessions/400a094a-35aa-4c64-9ac0-4dcca1289101.binding.json | 이 Unit의 `source-manifest.json`에 없는 `worker/aidlc/` 폴더가 추적 대상(`??`)으로 남아 있다. 하네스가 만든 세션 연결 파일로 보이고, 루트 `.gitignore`는 `aidlc/.aidlc-sessions/`만 제외한다. 이 Unit의 커밋에 섞여 들어갈 수 있다. | 커밋하기 전에 `worker/aidlc/`를 지우거나 커밋 대상에서 뺀다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/code-generation/code-summary.md > 「계획과 다른 점」 7 | 절차 위반(셸 heredoc으로 파일 끝에 덧붙이는 명령 한 번)이 있었다고 스스로 적었다. 내용은 바뀌지 않았다고 한다. 이 리뷰는 같은 줄을 확인하지 못했다(diff에 흔적이 없음). | 조치는 필요 없다. 기록으로만 남긴다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| Unit worker 시험 명령(`tests/test_judgement*.py`, `test_generation_flow/title/groups/material/claude.py`, `test_consumer_settings/processor.py`) | PASS: 651 passed (88.9 s) | 요약이 적은 수와 같다. 새 시험은 시나리오 번호(S1~S31)로 짝지어졌고, 항상 통과하는 단언(`assert True` 따위)은 찾지 못했다. |
| Unit web 시험 명령(`assets-view.test.mjs`, `recipient.test.mjs`) | PASS: 61 pass / 0 fail | NOT_GENERATED에서 설명 칸이 없고 FAILED에서 실패 안내가 나오는 단언이 있다. 받은 사람 화면은 컴포넌트를 그리지 않고 원문을 정규식으로 본다(요약 6에 이유가 적혀 있다). |
| 문서 크기(`wc -c`) | PASS: `generation-judgement.md` 22,071 B, `generation.md` 34,879 B, 가장 큰 `relation-collection.md` 35,790 B | 모두 36,000 B 안이다. |
| 직접 대조 | 아래 요약 | 설계(BR/NFR)와 코드가 맞는다. |

직접 대조한 항목은 다음과 같다.

- **문턱·상한:** RECORD_WHAT·RECORD_WHOLE 0.5, TITLE_CHOICE·SENTENCE 0.9, 판정 시간 20초, 호출 상한 300/300, 질문 400개, 출력 상한 2,000/8,000토큰이 `questions.py`·`limits.py`에 있다. 시간 몫은 생성 45+20, 재료 판정 20+45+20이 `CallBudget.can_generate(reserve)`와 `can_judge_material()`에 있다.
- **호출 수:** `_generate_one_ai`는 후보당 `ask()`를 한 번만 부르고 재시도가 없다. AI 쪽이 꺼지면(`judge=None`) 판정·재료 판정 경로를 타지 않는다.
- **판정 입력:** `CatchLine`은 가린 줄을 거르고, 재료 판정은 가린 줄을 글 없이 넘긴 뒤 `mask_text`로 한 번 더 거른다. SHA·작성자·날짜·이슈 글을 받는 인자가 없다.
- **판정 없이 쓰이는 글:** 판정이 실패하거나 건너뛰면 AI 후보와 문장은 제목·설명이 되지 않는다. 제목과 둘째 줄은 같은 `RecordVerdict`를 쓰므로 어긋나지 않는다(BR2.5). 작업 사실은 위치로 지우는 것만 한다.
- **실패 코드:** 판정 실패는 FAILED와 `JUDGEMENT_*` 코드로, 문장이 모두 떨어지거나 판정을 보내지 못하면 NOT_GENERATED로 나뉜다. 판정을 보내지 못한 경우는 `GENERATION_BUDGET_EXHAUSTED` 1건을 더한다.
- **비밀값:** 판정 키는 `CATCHU_JUDGEMENT_API_KEY`에서만 읽고 `SECRET_ENV`로 환경에서 지운다. OpenAI 어댑터는 `OPENAI_API_KEY`를 읽지 않고, 주소를 `data_residency="us"`로 고정하며, `trust_env=False`, `follow_redirects=False`, `max_retries=0`이다.
- **저장 끔:** 설치된 `openai==3.46.0`의 `decisions.create`에는 `store` 인자가 없다(`extra_body`는 있다). 요약과 `generation-provider.md`가 이 사실과 팀장이 확인할 것을 숨기지 않고 적었다. NFR1.5의 대안(「없으면 그대로 보내고 고지 v3에 적는다」)을 따르는 것이고, 고지 v3는 FR10 통과 뒤 Step 18에서 넣는다. 허용할 수 있다.
- **확인 명령:** `outside_repository`가 `resolve()`로 바로가기를 풀고, 시험이 바로가기 경유 경로를 거부하는 것을 본다. 수집 결과는 JSON과 type hint로만 읽는다(pickle 없음). 토큰은 환경변수에서만 받고 읽은 뒤 지운다.

### Summary

설계와 코드가 맞는다. 문턱, 시간 몫, 호출 수, 실패 코드와 NOT_GENERATED/FAILED 구분, 비밀값 처리, 설명 칸 숨김이 구현과 시험으로 확인되고, 시험도 다시 돌려 통과했다. Critical과 Major는 없다. OpenAI 요청에 저장 끔 인자가 없는 점은 요약과 문서에 정직하게 적혔고 NFR1.5의 대안 경로 안에 있다. 남은 것은 `candidate-text.md`의 낡은 제목 규칙, 확인표 파일 권한 순서, 설정 검사 위치, 떠돌이 `worker/aidlc/` 폴더 같은 Minor 항목이다. Step 17·18은 의도한 대로 하지 않았다.
