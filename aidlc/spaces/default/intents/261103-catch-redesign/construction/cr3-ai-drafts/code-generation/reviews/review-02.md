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
| R-06 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/code-generation/code-summary.md > 고지 v3 > OpenAI 사실과 출처 / api/src/analysis-intake/analysis-notice.ts > REAL_NOTICE 3절 「OpenAI 처리 위치와 보관」 | 고지는 「OpenAI는 받은 자료를 AI 학습에 쓰지 않습니다」를 조건 없이 적는다. 그런데 요약은 이 말이 「팀이 데이터 공유를 따로 켜지 않았다는 전제」라고 적는다. 그 전제를 운영 전에 확인하라는 항목이 `worker/docs/generation-judgement.md`와 `api/docs/analysis-intake.md`에 없다(「데이터 공유」·「전제」 검색 결과 없음). 요약이 「확인 못 함」으로 둔 프롬프트 캐시 24시간 예외도 팀장 결정 대기라 고지에 없다. 확인하지 않은 전제가 사실문으로 나간다. | 배포 안내의 「판정 키는 v3 배포 뒤」 줄 옆에 「OpenAI 프로젝트의 데이터 공유 설정이 꺼져 있는지 확인한 뒤 키를 넣는다」를 한 줄 더한다. PR 설명에는 캐시 24시간 예외를 넣을지에 대한 결정을 남긴다. 고지 문구 자체는 팀장 승인 사항이다. | New |
| R-07 | Minor | docs/CatchU_수집통제_임시자료.md > 36행 「대상은 공개 저장소뿐이므로…」 | Step 20 계획은 같은 규칙을 적은 문서로 세 곳만 고친다(`github-collection.md`, `CatchU_collection_control_scope.md`, `generation-judgement.md`). 이 문서에도 「대상은 공개 저장소뿐」이 예외 없이 있다. 프로젝트 규칙(코드 계획에서 규칙을 바꿀 때 같은 규칙을 적은 문서를 모두 찾는다)에 비춰 한 곳이 빠졌다. 다만 이 문서는 지위가 「제안」이고, 행이 이미 고친 scope 문서 3.2절을 가리킨다. | 이 행 끝에 「FR10 확인 명령만 예외, 3.2 참조」를 더한다. 또는 이 문서가 제안 지위라 고치지 않는다고 `code-summary.md`의 「고치지 않은 곳」에 적는다. | New |
| R-08 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr3-ai-drafts/code-generation/unit-test-instructions.md > 시나리오와 시험 파일 표 「Claude·OpenAI 어댑터(요청 모양·저장 끔·주소 고정…)」 | 표는 OpenAI 어댑터가 「저장 끔」을 시험한다고 적는다. 그러나 `worker/app/judgement/openai_judge.py:14-15`와 `worker/docs/generation-judgement.md:163`은 Decisions 요청에 저장 끔 인자가 없어 보내지 않는다고 적고, 고지 v3도 같은 내용이다. 표의 문구가 낡았다. | 「저장 끔」을 「저장 끔 인자를 보내지 않음」으로 고친다. | New |
| R-09 | Minor | worker/app/processing/collection_file.py:`write_private` | 파일은 처음부터 0o600으로 만든다(O_EXCL, chmod 없음). 하지만 `path.parent.mkdir(parents=True, exist_ok=True)`는 기본 권한으로 폴더를 만든다. 그래서 `~/catchu-local-live/cr3-fr10/`는 보통 0o755이고, 다른 계정이 파일 이름 목록(`owner__name.sheet.json`)을 볼 수 있다. Windows에서는 mode가 무시된다. 비공개 코드 줄은 파일 안에 있어 내용은 보호된다. | 폴더를 0o700으로 만든다(`mkdir(mode=0o700, ...)`). 또는 Windows 제약과 폴더 권한을 `generation-judgement.md`의 확인 명령 항목에 한 줄 적는다. | New |

> R-01 Not re-checked this round

> R-02 Not re-checked this round

> R-03 Not re-checked this round

> R-04 Not re-checked this round

> R-05 Not re-checked this round

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| worker pytest (Unit 명령 10개 파일 + `test_collection_controls.py`) | 723 passed | Step 19·20 시험을 포함해 모두 통과한다. |
| web `node --test test/u2-consent.test.mjs test/assets-view.test.mjs test/recipient.test.mjs` | 71 pass / 0 fail | 받는 곳 셋·판본 대조·S10·S11 통과 |
| api `npm test -- test/db/analysis-notice.test.cjs test/u2/ai-consent.test.cjs` | 19 pass / 0 fail | 고지 SHA·35줄 단언과 판본 불일치 400 통과 |
| `grep allow_private_repository worker/app` | `collect.py`·`collectors.py` 정의, `confirm.py:148` True, `live.py:89` 주석(인자 미전달)뿐 | 운영에서 켜는 경로가 없다. 환경변수·CLI·설정 입력도 없다. |

### Summary

**Step 20 (비공개 저장소 허용).** 인자 기본값은 False이고 `collect` → `_collect_with` → `_run` → `verify_repository`로만 전달된다. 켜는 곳은 `confirm.py`의 `collect_live` 하나다. `live.py`는 인자를 넘기지 않고, 이를 보는 시험(`test_collection_controls.py`)이 있다. 허용해도 `verify_repository`에서 공개 여부 하나만 건너뛰고 나머지 확인은 그대로다. 저장소 ID·같은 이름·크기 상한·`private` 칸 모양 확인을 그대로 한다는 시험이 있다. 따라서 이 변경은 옳다.

**Step 19.** R-01(`candidate-text.md` 24행), R-02(`write_private`, O_EXCL, 0o600, chmod 없음), R-03(`generation-judgement.md` 21행)이 반영됐다. R-04(`worker/aidlc/` 제외)는 코드 변경이 없고, 현재 untracked 상태라 커밋 때 제외해야 한다.

**Step 17.** `code-summary.md`의 FR10 기록에는 건수·판정·결정만 있고 원문이 없다. 저장소 이름과 일반 사유 문장뿐이다. 나는 `~/catchu-local-live/`를 읽지 않았다.

**Step 18.** 고지 v3는 코드가 OpenAI에 실제로 보내는 항목과 맞는다. 맞춘 대응은 다음과 같다.
- 기록의 글(`record`: PR 제목 또는 커밋 첫 줄), 제목 후보·설명 문장, 보낸 줄과 파일의 경로·상태(`questions.py` `catch_request`).
- 큰 작업의 재료 판정 파일 경로·상태·바뀐 줄 수·앞 5줄·폴더 묶음 이름(`material_request`).
- 가릴 값이 있는 기록의 글은 보내지 않음(`record_text.py:149`).
- 작성자·날짜·SHA·이슈 글을 보내는 인자가 없음.
- 판정을 claude로 둘 때의 경우(`confirm.make_judge`와 같은 구조)와 us 지역 주소 고정(`openai_judge.py:55`).

고지에 있고 코드에 없는 항목은 발견하지 못했다. `AI_NOTICE_VERSION` 2026-11-v2는 api·web이 같고, 시험이 대조한다. `catchu-real-analysis-notice-v3`는 `REAL_NOTICE` 한 곳에서 읽히고 옛 판본 문자열은 남아 있지 않다.

**남은 Minor.** 위 Minor 4건은 모두 문서·배포 안내·폴더 권한에 관한 것이고 구현을 막지 않는다. 가장 중요한 것은 첫째다. 확인하지 않은 전제를 고지의 사실문이 쓴다. 고지 문구는 PR에서 팀장이 최종 승인한다. Critical·Major는 없다.

READY
