# CR1 규칙 쪽 Catch — 비기능 요구사항 질문

## 질문의 범위

- 입력:
  - 기능 설계 `construction/cr1-readable-catch/functional-design/`
  - 요구사항 NFR1~NFR7
  - 계약 C5
  - 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 정해진 것:
  - CR1은 새 외부 호출·저장 칸·계약·인증 변경이 없다.
  - 판정이 없고, 생성 호출은 줄어든다(고쳐 쓰기 건너뜀).
  - 결정성(NFR4), 배포 호환(계약 그대로), 문서 크기(NFR7)는 요구사항대로 둔다.
  - 기록의 글은 자르지 않는다(FR5.1).
- 가장 단순한 안을 A로 둔다.

## Q1. [보안] 기록의 글이 12월 받은 사람 AI의 근거에 들어가는 일을 CR1에서 어디까지 다룰까요?

**배경:**
- 작업 사실 둘째 줄(기록의 글)은 12월 받은 사람 AI가 인용하는 GitHub 기록 조각으로 들어간다(FR6.3, `api/src/published-index/chunker.ts`).
- 지금까지 작업 사실에는 CatchU가 만든 구조 문장만 있었다. 이제 작성자의 자유 글이 들어가므로, 커밋 첫 줄에 쓴 지시문이 12월 AI에 닿을 수 있다.
- 작성자 설명(사람이 쓴 자유 글)은 이미 근거로 들어간다.

A. CR1 코드 생성 때, 12월 AI가 근거 글을 지시로 따르지 않게 되어 있는지 코드에서 확인만 하고 결과(파일·줄)를 남긴다. 고칠 것이 나오면 12월 AI 담당에게 알리고 CR1에서 고치지 않는다.
B. 확인하지 않고 한계로만 적는다. 더 막는 것: 없음. 줄어드는 공수: 확인 시간. 대신 위험이 있는지 모른 채 넘어간다.
C. Not yet defined — 아직 정하지 않았다.
X. Other (please specify)

[Answer]: A

## Q2. [관측] 운영 로그에 CR1 건수(기록의 글이 제목이 된 후보 수, 부실로 본 수, 가리기에 걸린 수)를 더할까요?

**배경:**
- 요구사항에는 이 건수의 근거가 없다.
- 지금 생성 단계 로그에는 제목 고쳐 쓰기 수, 「제목만 없음」 수 같은 건수가 있다.
- 기록의 글 원문은 어느 경우에도 로그에 남기지 않는다(team.md 「Code Style」).

A. 더하지 않는다. 「제목만 없음」 집계의 뜻만 최종 제목 기준으로 바로잡는다(BR3.3).
B. 세 건수를 더한다. 더 막는 것: FR10 확인이나 운영에서 기록의 글이 얼마나 쓰이는지 로그로 볼 수 있다. 늘어나는 공수: 로그 필드 3개와 시험이 는다.
C. Not yet defined — 아직 정하지 않았다.
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
