# 새 Catch — 계약 설계 질문

## 질문의 범위

- 입력:
  - Unit `inception/units-generation/unit-of-work.md`·`unit-of-work-dependency.md`(NC1~NC3)
  - 구성 요소 `inception/domain-design/components.md`
  - 요구사항 `inception/requirements-analysis/requirements.md`
- 지금 계약:
  - 결과 메시지 `api/contracts/repository-analysis/worker-messages.yaml`(Result 판본 "3")
  - 사본 모양 `api/src/publications/published-snapshot.ts`(C-07)
  - 분석 고지 `api/src/analysis-intake/analysis-notice.ts`(`catchu-real-analysis-notice-v3`)
- 바뀌는 경계:
  - 본인 Catch 목록·상세 HTTP(NC1·NC3)
  - 발행 사본 C-07·C-10·C-12(NC2)
  - 결과 메시지(NC3)
  - 분석 고지(NC3)
- 바깥에 새로 여는 API는 없다.
- 칸 이름과 모양은 이 단계에서 정해 계약 요약에 적는다. 아래는 그 가운데 사람이 정할 것만 묻는다. 가장 단순한 안을 A로 둔다.

## Q1. [설계] 작업 전체 한계 두 가지(FR9.3)를 사본에 담을 때 어떻게 골라낼까요?

**배경:** 담을 것은 둘이다. 같은 변경을 다시 냈거나 cherry-pick으로 옮긴 것일 수 있다는 경고, 그리고 커밋 목록을 다 받지 못한 PR이 있다는 한계다. 지금 worker는 이 문장들을 첫 근거의 `coverageLimits`에 다른 한계와 종류 표시 없이 섞어 넣는다(`worker/app/candidates/build.py`).

- 앞 둘(같은 작업 경고)은 「같은 작업을 다시 낸 것일 수 있다(PR #…」, 「cherry-pick으로 옮긴 같은 변경일 수 있다(커밋 …」처럼 앞부분이 고정이고 괄호 안이 바뀐다.
- 뒤 둘(목록 한계)은 문장 전체가 고정이다(`_LISTS_INCOMPLETE`, `_EARLIER_LIST_INCOMPLETE`).

Unit 나누기에서 「종류 칸 안이 되면 NC2가 worker와 판본 올림에 묶인다」고 적어 두었다.

A. 발행 때 api가 근거 한계 문장을 고정 문장(목록 한계 둘)과 고정 앞부분(같은 작업 경고 둘)으로 대조해 골라낸다. worker와 결과 메시지는 바꾸지 않는다. 지금 있는 Catch에도 바로 맞는다. worker 문구가 바뀌면 대조가 조용히 빠질 수 있으므로, worker 문장 상수와 api 대조 목록이 같은지 보는 시험 하나를 둔다. NC2는 web·api만 고친다. (가장 단순)
B. worker가 한계마다 종류 칸을 붙이고 결과 메시지 판본을 올린다. 문구가 바뀌어도 고르기가 깨지지 않는다. 대신 NC2가 worker 변경과 판본 올림에 묶여 NC3과 판본 올림을 함께 맞춰야 하고, DB 초기화 전까지 있는 Catch에는 종류 칸이 없다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Q2. [설계] 고지 4절에 한 줄을 더할 때 고지 판본 이름을 올릴까요?

**배경:** 3단계가 결과 문장을 Catch에 남기므로 고지 4절에 한 줄을 더한다(FR15.2). 분석 동의는 동의한 고지 판본 이름(`notice_revision`)을 저장하고, worker는 그 값을 그대로 돌려줄 뿐 판본 이름을 따로 검사하지 않는다. #504는 v3 문장 하나를 빼면서 판본 이름을 올리지 않았다. Catch 개편 CR3은 v2에서 v3으로 올렸다.

A. 판본 이름 `catchu-real-analysis-notice-v3`를 그대로 두고 4절 글만 바꾼다(#504와 같은 방식). 바꾸는 곳이 고지 글 하나다. 대신 같은 판본 이름으로 저장된 동의가 바뀌기 전 글에 대한 것인지 뒤 글에 대한 것인지 판본 이름만으로는 가를 수 없다. 출시 직전 DB 초기화로 그 전 동의는 사라진다. (가장 단순)
B. `…-v4`로 올린다. 저장된 동의가 어느 글에 대한 것인지 판본 이름으로 갈린다. 고지 상수 한 줄과 문서·시험의 판본 이름을 함께 고친다(코드 지식의 「함께 고칠 파일」).
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Q3. [설계] 다시 볼 곳 사실은 결과 메시지와 Catch에 어떤 모양으로 담을까요?

**배경:** 사실은 다섯 종류다. 다시 고친 곳, 옮긴 곳, 확장자 바꿈, 되돌림, 시험 파일 있음이다. 화면에는 사실마다 커밋 링크(github.com https만, FR12.3)와 파일 경로가 나와야 한다. 다듬은 화면은 「커밋 ba6bba8이 넣은 줄을 같은 작업의 커밋 d42d9a3이 다시 고침: firebase.ts」 같은 문장을 보였고, 실제 문구는 기능 설계로 넘겼다.

A. 사실마다 종류 값, 파일 경로(옮긴 곳·확장자 바꿈은 앞뒤 둘), 관련 커밋 식별값 목록만 담는다. 문장과 링크는 web이 만든다. worker 문구가 계약에 들어가지 않고, 링크는 저장소 주소와 식별값으로 web이 만든다. (가장 단순)
B. worker가 문장까지 만들어 함께 담는다. web은 문장을 그대로 보이고 식별값으로 링크만 만든다. 문구를 바꾸려면 worker를 고쳐 다시 분석해야 하고, 문장이 계약 검사 대상이 된다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Q4. [설계] 사본 근거에 「본인 커밋 근거인지」(FR10.2)를 어떻게 담을까요?

**배경:** 표지는 사본 근거 가운데 본인 커밋 근거와만 견준다(FR10.1). 저장된 근거의 `contribution_scope`에서 정할 수 있다. 지금 사본 근거는 `sourceUrl`·`sourceRevision`·`representedFacts`뿐이다.

A. 사본 근거마다 참·거짓 칸 하나(예: `ownCommit`)를 더한다. 발행 때 api가 `contribution_scope`로 정한다. 옛 사본에는 칸이 없고, 없으면 거짓으로 읽어 표지를 붙이지 않는다. (가장 단순)
B. 기여 범위 문장(`contributionScope`)을 그대로 사본에 담고 web이 판정한다. 판정 규칙이 web으로 가고, 지금 받은 사람에게 보이지 않던 기여 범위 문장이 사본에 들어간다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

**덧붙임(사람 원문):** api에는 지금 본인 커밋 기여 범위 문장이 없다. 판정에 쓸 두 문장(build.py의 _OWN_COMMIT_SCOPE·_OWN_COMMIT_ELSEWHERE_SCOPE)을 api 상수로 두고, Q1의 worker·api 문장 대조 시험에 함께 넣는다. 문구가 어긋나면 표지가 조용히 사라지기 때문이다.

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
