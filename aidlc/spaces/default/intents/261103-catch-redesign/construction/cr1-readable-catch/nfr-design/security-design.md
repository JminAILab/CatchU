# CR1 규칙 쪽 Catch — 보안 설계

입력:
- 비기능 요구사항 `construction/cr1-readable-catch/nfr-requirements/security-requirements.md`
- 기능 설계 `construction/cr1-readable-catch/functional-design/functional-spec.md`(W1·W2·W4, 7절)
- 계약 `inception/contract-design/contract-summary.md`(C5·C6)
- 이 단계의 답 `nfr-design-questions.md`(Q2 A)

## 설계

| 요구 | 설계 |
|---|---|
| NFR1.1 생성 요청에 기록의 글 없음 | 기록의 글은 후보 자료의 한 칸에만 있다. 생성 요청을 만드는 곳(`worker/app/generation/request.py`)은 지금처럼 바뀐 줄만 직렬화하고, 기록의 글 칸을 읽지 않는다. 요청 본문 시험은 기록의 글이 있는 후보로 요청을 만들어 그 글이 본문에 없음을 단언한다. |
| NFR1.2 12월 AI 지시 주입 확인 | CR1 코드 생성 단계에서 확인 작업을 한 번 한다. 대상은 12월 받은 사람 AI가 근거 조각을 지시문에 넣는 곳이다(`api/src/rag-answer/`, `api/src/ai-generation/`). 근거 글이 지시와 나뉘어 들어가는지, 근거 글을 따르지 말라는 지시가 있는지를 본다. 결과(파일·줄과 판정)를 코드 생성 요약에 적는다. 고칠 것이 있으면 12월 AI 담당에게 알리고 CR1 코드는 바꾸지 않는다(Q1 A). |

## 확인 사항의 설계

- **가리기 검사 한 곳(Q2 A):**
  - `worker/app/generation/redact.py`를 `worker/app/redact.py`로 옮긴다.
  - 불러오는 두 곳(`worker/app/generation/request.py`, `worker/tests/test_generation_redact.py`)을 새 위치로 고친다. 옛 위치는 지운다.
  - 후보 판정(`worker/app/candidates`)은 새 위치의 한 글 검사(`mask_text`)를 부른다. `worker/app/redact.py`는 `app.candidates`도 `app.generation`도 불러오지 않는 순수 모듈이라 순환이 생기지 않는다.
- **기록의 글 판단 순서:** 첫 줄 잡기 → 앞뒤 공백 빼기 → 한 글 검사 → 부실 판단이다.
  - 한 글 검사는 2,000자를 넘는 글을 통째로 가린다. 그래서 그런 글은 이 단계에서 기록의 글이 없다.
  - 가린 결과 글은 쓰지 않는다. 걸렸다는 사실만 본다.
- **화면:**
  - 제목은 React 글자 노드로만 그린다. `dangerouslySetInnerHTML` 같은 HTML 삽입을 쓰지 않는다.
  - 줄임은 CSS 클래스로만 한다. 글은 바꾸지 않는다.
- **로그:** 후보 판정·생성·소비자 로그에 제목·작업 사실 글을 넣지 않는다. 지금 로그 필드(건수·코드)만 쓴다.
  - 시험: 기록의 글이 든 후보로 처리한 뒤 로그에 `workFacts[1]`과 제목 원문이 없음을 단언한다.

## 고르지 않은 것

- **후보 판정 쪽에 한 글 검사를 복사해 두기:** 검사가 두 벌이 되어 규칙이 갈라질 수 있다.
- **12월 AI 쪽을 CR1에서 고치기:** 범위 밖이다(Q1 A). 담당과 시점이 다르다.
