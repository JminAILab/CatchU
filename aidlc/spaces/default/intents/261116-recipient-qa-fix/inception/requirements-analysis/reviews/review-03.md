## Review

**Verdict:** READY
**Reviewer:** aidlc-product-lead-agent
**Date:** 2026-11-16T02:39:29Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261116-recipient-qa-fix/inception/requirements-analysis/requirements.md > FR2.2 | 머리글과 임베딩 입력에 쓰는 「그 Catch의 GitHub 기록 줄 하나」를 어떤 규칙으로 고르는지 없다. 한 Catch에는 PR 제목이나 본인 커밋 첫 줄이 여러 개일 수 있다(작업 사실 여러 줄, 근거 최대 20건). 고르는 기준이 없으면 같은 발행본에서 구현마다 머리글이 달라지고, 검색 쪽(FR2.3)과 모델 쪽(FR2.1)이 서로 다른 줄을 쓸 위험도 있다. | 고르는 규칙을 한 줄로 정한다. 예: 작업 사실의 첫 PR 제목, 없으면 첫 본인 커밋 첫 줄. 길이 자르기 여부도 정하고, 두 곳이 같은 값을 쓴다고 적는다. 정하지 않을 거면 OQ에 올려 코드 생성 계획에서 정한다고 명시한다. | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/261116-recipient-qa-fix/inception/requirements-analysis/requirements.md > 완료 기준 대조(9·10번 행) 및 NFR1(c) | 9·10번의 「묻는 Catch에 작성자 설명이 있으면 없다고 하지 않는다」는 FR1.2에 따라 작성자 설명이 검색 상위 8개에 들어와야만 모델이 볼 수 있다. 이 기준을 FR3에도 이어 두었지만, FR3 두 지시(첫 항목은 답, 확인되지 않는다고 쓰기)에는 이 기준을 직접 채우는 내용이 없다. 9번은 11/12 측정에서 상위 8개에 있었다고 하나 10번은 근거가 없다. | 대조표에서 FR3은 빼고 FR1.2·FR2로 잇는다. 작성자 설명이 상위 8개 밖이면 이 기준이 한계로 남을 수 있다고 NFR1(c)에 한 줄 적는다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261116-recipient-qa-fix/inception/requirements-analysis/requirements.md > FR1.4와 OQ2 | 한 근거의 줄을 다 붙이면 상한을 넘을 때의 동작이 비어 있다. 줄 수 상한을 걸어 둔 요구인데 이 모서리는 코드 생성 계획으로 넘겼다. 시험할 기준이 없어 목표 회귀 시험(NFR2)에서 이 경우를 확인할 수 없다. | 기본 동작을 한 줄 정한다. 예: 한 근거의 줄이 남은 상한에 다 들어가지 않으면 그 근거는 붙이지 않고 다음 근거로 간다. 이 경우도 FR1.6의 못 붙인 줄 수에 센다. 이후 계획에서 바꿀 수 있다고 적는다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261116-recipient-qa-fix/inception/requirements-analysis/requirements.md > 제약(12월 FR6.2 읽기)와 NFR1 | 승인된 12월 요구사항 FR6.2(「의미 검색으로만 고른다」)의 읽는 법을 이 문서의 제약 한 줄로만 바꾼다. 이 읽기는 Q1·Q4 답에 근거가 있어 충실하다. 다만 12월 요구사항 본문은 그대로이고 FR6.4 문서 목록에도 없어, 다음 사람이 12월 문서만 읽으면 어긋난다고 볼 수 있다. NFR1 판정자를 「팀장」으로 정한 것도 이슈 본문에 없는 덧붙임이다. | 서비스 문서(`rag-answer.md`)에 FR6.2를 어떻게 읽는지 한 줄 남기도록 FR6.1에 더한다. 판정자는 이슈가 말하지 않았으니 「사람 판정」으로만 쓰거나 팀장 확인을 받았다고 근거를 적는다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261116-recipient-qa-fix/inception/requirements-analysis/requirements.md > FR5.2와 FR7.1 | FR5.2는 줄 늘리기·머리글·지시 수정을 하기 전에 5번을 한 번 묻는다고 한다. 그런데 11/12 측정은 호스트의 평가 스크립트로 돌렸고, FR7.1은 그 스크립트가 요청을 새 공용 함수로 만들게 한다. 5번을 어떤 경로(평가 스크립트 또는 앱)로 묻는지, 공용 함수가 들어간 뒤에도 「붙이기 없음」 상태를 낼 수 있는지가 적혀 있지 않다. 순서를 잘못 잡으면 「11/12와 같은 조건」이 깨진다. | FR5.2에 5번을 묻는 경로와 순서를 한 줄로 정한다. 예: FR7의 스크립트 변경 전에 기존 요청 경로로 묻고, 그 뒤에 공용 함수로 바꾼다. 같은 경로로 로그 칸이 찍히는지도 적는다. | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261116-recipient-qa-fix/inception/requirements-analysis/requirements.md > FR2.2와 전제 | 머리글이 둘째 줄이 있을 때만 Catch를 가려 준다는 점은 맞게 적었다. 다만 11/12 발행본의 Catch마다 그 줄이 있었는지는 전제에 없다. 없는 Catch는 순번만 남아 7번·9·10번의 구분이 머리글 덕을 못 본다. | 전제에 11/12 발행본 Catch 가운데 둘째 줄이 없는 것이 있으면 NFR1(b)·(c)의 한계로 적는다고 한 줄 더한다. | Resolved (reviewer) |
| R-07 | Minor | aidlc/spaces/default/intents/261116-recipient-qa-fix/inception/requirements-analysis/requirements.md > FR1.4 | 건너뛰기 규칙이 「한 근거의 줄」에만 쓰여 있다. 작업 사실·나의 기여 줄(②)이 남은 상한에 못 들어가는 경우의 동작은 비어 있다. | ②의 줄도 같은 규칙(줄 단위로 상한까지만 붙이고 나머지는 못 붙인 줄 수에 센다)을 따른다고 한 줄 적는다. | Resolved (reviewer) |
| R-08 | Minor | aidlc/spaces/default/intents/261116-recipient-qa-fix/inception/requirements-analysis/requirements.md > FR5.2·FR5.4 | 5번의 원인은 평가 스크립트가 부르는 한 번 호출(`generate`)로 확인한다. 그런데 앱의 질의응답은 스트리밍(`generateStream`, `qna-service.ts` 118행)으로 부르고, 두 길은 `checked-gate.ts`에서 항목 판정 코드가 다르다(`NO_ITEMS` 판정이 `end()`에도 있다). 11/12에 실패가 난 길과 면접관이 쓰는 길이 같은지 요구사항이 말하지 않는다. FR5.1의 로그 칸이 두 길 모두에 찍히는지도 정해져 있지 않다. | FR5.1에 로그 칸이 한 번 호출과 스트리밍 두 길의 실패 로그에 모두 들어간다고 적고, FR5.2 결과를 적을 때 원인이 어느 길에서 확인됐는지 한 줄 남긴다. 앱 쪽(스트리밍)에서 5번이 다른 모양으로 실패할 수 있다는 한계도 평가 기록에 적는다. | New |
| R-09 | Minor | aidlc/spaces/default/intents/261116-recipient-qa-fix/inception/requirements-analysis/requirements.md > FR1.6와 FR7.1 | 상한 때문에 못 붙인 줄 수는 앱의 `qna.completed` 로그에만 남는다. 평가 스크립트는 앱의 서비스를 거치지 않고 공용 근거 목록 함수만 부르므로, NFR1에서 3번·7번이 틀렸을 때 상한에 걸려서인지 평가 기록만으로 구분할 수 없다. | FR7.1의 공용 함수가 못 붙인 줄 수를 값으로 돌려주고, 평가 스크립트가 질문별로 그 수(글 없이 숫자만)를 평가 기록에 적는다고 한 줄 더한다. 새 지표 추가 금지(범위 밖)와 부딪히면 한계로 남긴다고 적어도 된다. | New |
| R-10 | Minor | aidlc/spaces/default/intents/261116-recipient-qa-fix/inception/requirements-analysis/requirements.md > 전제 (첫 항목) | 이슈 #559 본문은 11/12 발행본이 로컬 DB에 없으면 「같은 Catch 3개로 다시 발행해 잰다」고 정한다. 요구사항은 같은 경우에 「팀장에게 알리고 조건을 다시 정한다」고 적어 이슈와 처리가 다르다. 다시 발행하면 조각 위치와 정답 위치가 달라질 수 있어, 두 문서 가운데 어느 쪽이 기준인지 승인 뒤 헷갈린다. | 전제에 이슈의 다시 발행 안을 옮기고, 그 경우 기준선과 재측정의 정답 위치를 다시 잡는다는 점(11/12와 같은 조건이 아니라는 한계)을 한 줄로 적거나, 팀장이 정할 때까지 멈춘다고 이슈와 같은 말로 맞춘다. | New |

> R-05 Reviewer note: FR5.2가 경로(평가 스크립트 measure 모드), 순서(FR1·FR2·FR3·FR7보다 먼저), 질문 10개 한 번, 기준선이라는 지위를 적었다. FR5.4가 로그 칸이 이 경로에서 찍히는지 기준선 실행 때 확인해 기록한다고 정했고, FR5.5가 같은 날 덮어쓰기와 이름 바꾸기를 적었다. `rag-eval.cjs`의 10개 거부 조건(47행)과 `rag-eval-report.cjs`의 날짜 이름 규칙(80~84행)이 요구와 맞다.

> R-06 Reviewer note: 전제에 세 Catch 모두 둘째 줄이 있다는 사실과, 없는 Catch가 나오면 순번만 남아 NFR1(b)·(c)의 한계로 적는다는 문장이 들어갔다.

> R-07 Reviewer note: FR1.4 마지막 줄에 작업 사실·나의 기여 줄도 줄 단위로 상한까지만 붙이고 나머지는 못 붙인 줄 수에 센다고 적었다.

### Summary

세 이전 지적은 모두 반영되었고, 이슈 #559의 새 본문(11/12 발행본으로 다시 재기, 기준선 먼저, 상한 시작 값, 지킬 경계)과 요구사항은 큰 모순 없이 맞는다. 남은 것은 기준선 실행 경로와 앱 경로의 차이, 평가 기록에 못 붙인 줄 수가 안 남는 점, 발행본이 없을 때의 처리 문구 같은 작은 틈뿐이라 엔지니어링이 질문 없이 시작할 수 있다.
