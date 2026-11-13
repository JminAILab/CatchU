## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-10T13:39:39Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261109-new-catch/construction/nc2-snapshot-fields/functional-design/rules.md > BR1.6 logic (그리고 functional-spec.md 6절 「문장 대조」) | 문장 대조 시험을 「build.py 파일 글자에 상수가 들어 있는지 찾기」로만 적었다. 그런데 `worker/app/candidates/build.py`에서 본인 커밋 기여 범위 첫 문장 「연동 계정이 작성자로 기록된 커밋」(`_OWN_COMMIT_SCOPE`, 99행)은 같은 파일의 다른 문장 안에도 그대로 들어 있다. 둘째 기여 범위 문장(`_OWN_COMMIT_ELSEWHERE_SCOPE`, 100행), 이슈 범위 문장(`_ISSUE_SCOPE`)이 그렇고, `evidence.py`의 「연동 계정이 작성자로 기록된 커밋이 아니라 …」도 같은 꼴이다. 그래서 worker가 첫 문장만 바꿔도 부분 문자열 검색은 다른 문장에서 찾아 통과한다. 그러면 api의 `ownCommit` 판정(BR1.4, 글자까지 같을 때만 true)은 조용히 대부분 false가 되고 표지가 사라지는데, 이 변화를 막으려고 둔 시험이 알리지 못한다. 시험 항목의 「하나를 틀리게 바꾸면 실패하는지」도 api 상수 쪽만 바꾸는 시험이라 이 구멍을 잡지 못한다. | BR1.6의 대조 방식을 고친다. 여섯 문장을 파이썬 글자 상자(따옴표로 시작하고 끝나는 한 줄 글자) 경계까지 포함해 찾거나, 대입문(`_OWN_COMMIT_SCOPE = "…"`)을 정규식으로 찾는다. 같은 대조 시험에 「첫 문장만 worker에서 바꾸면 실패한다」는 반례를 넣는 것을 시험 항목(functional-spec 6절)에 적는다. 같은 작업 경고 앞부분 둘은 f-string 시작 따옴표까지 포함해 찾는다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261109-new-catch/construction/nc2-snapshot-fields/functional-design/functional-spec.md > 「FR10.3 자리를 읽는 법 (Q3 B)」, 「표지의 뜻 (FR10.5)」 | 승인된 요구사항 FR10.3·FR10.5, AC7.1.4, interaction-spec 4절 사용 예는 표지를 「판본·커밋 이름 바로 뒤」에 둔다고 적었다. 이 Unit은 커밋 화면 바뀐 줄 링크에서는 표지를 「바뀐 줄 16–23」 뒤에 둔다(사람 결정 Q3 B). 이 경우 위치로 뜻(그 커밋이 본인 것임)을 나타내려던 FR10.5의 방식이 약해지는데, 화면 안내 문장도 두지 않으므로 README 기록이 유일한 설명이다. 결정 자체는 사람이 했으므로 막지는 않는다. | README(`web/src/features/publications/README.md`)에 「바뀐 줄 링크의 표지는 이름 끝이 아니라 링크 뒤이며, 뜻은 그 커밋이 본인 것이라는 것」을 적는다고 BR4.6에 구체적으로 명시한다. 그리고 NC2 PR 설명에 이 해석이 FR10.3 표현과 다르다는 점을 한 줄 남긴다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261109-new-catch/construction/nc2-snapshot-fields/functional-design/rules.md > BR3.2 logic | 작성 시점을 `h4` 「작성자 설명」 안에 넣으면 제목의 접근 이름이 「작성자 설명 2026년 11월에 마지막으로 고침」으로 바뀐다(interaction-spec 5절·mockups 4절이 정한 자리와는 같다). 이 h4의 글자를 그대로 찾는 지금 시험이나 접근 이름 조회가 있으면 깨질 수 있는데, 기능 설계는 어느 시험이 영향을 받는지 적지 않았다. | 코드 계획에서 `snapshot-view` 시험 가운데 h4 「작성자 설명」을 이름이나 정확한 글자로 찾는 것을 모두 찾아 고칠 목록에 넣는다고 functional-spec 5절 「고치는 파일」에 한 줄 더한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| sensor-traceability (functional-design, traceability.json) | pass: true, gaps 0, orphans 0, invalid 0, findings_count 0 | 이야기·요구사항 추적은 모두 닫혀 있다. 이것은 구조 검사이며 위 대조 시험 결함은 잡지 못한다. |
| required-sections / upstream-coverage / linter / type-check | 직접 실행하지 않음(요청받은 도구는 traceability 하나) | 이 도구들의 결과 없이 기능 설계 문서를 직접 대조해 판단했다. 근거가 필요한 판단은 위 지금 코드 대조(`build.py`, `publish.service.ts`, `snapshot-builder.ts`, `published-snapshot.ts`, `chunker.ts`, `summary-sources.ts`, `github-link-name.ts`, `recipient-api.ts`, `publications-api.ts`, `ci.yml`)로 한 것이다. |

### Summary

사본 칸 넷, 저장소 등록 조인(DB의 NOT NULL·외래 키로 뒷받침됨), 표지 판정, AI 재료 제외, 옛 사본 처리는 지금 코드와 승인된 계약 C3·C6·C7, 이야기 AC와 맞고, 구현자가 되물을 곳이 거의 없다. 다만 문장 대조 시험(BR1.6)이 부분 문자열 검색이라 worker 쪽 본인 커밋 기여 범위 문장이 바뀌어도 통과할 수 있는 구멍이 하나 있으니, 코드 생성 전에 방식을 고쳐 두면 READY로 진행해도 된다.
