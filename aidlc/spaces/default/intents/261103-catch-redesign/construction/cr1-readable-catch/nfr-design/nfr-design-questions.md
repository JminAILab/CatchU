# CR1 규칙 쪽 Catch — 비기능 설계 질문

## 질문의 범위

- 입력: 비기능 요구사항 `construction/cr1-readable-catch/nfr-requirements/`, 기능 설계 `construction/cr1-readable-catch/functional-design/`, 계약 C5·C6·C7.
- 정해진 것:
  - 새 외부 호출·저장·계약·인프라는 없다.
  - 가리기 검사는 후보 판정과 생성이 함께 쓴다.
  - 기록의 글은 한 번 계산해 후보 자료 한 칸에 싣는다.
  - 화면은 CSS로만 2줄 줄임을 한다.
  - 로그에 원문을 남기지 않는다.
  - 12월 AI 지시 주입은 코드 생성 때 확인만 한다.
  - 처리 시간 기준은 커밋 3,000 합성 후보의 재료 고르기 5초다(설계 제안값).
- 가장 단순한 안을 A로 둔다.

## Q1. [성능] 처리 시간 5초 기준은 시험에서 어떻게 확인할까요?

**배경:** 시간을 단언하는 시험은 CI 컴퓨터가 느리거나 바쁠 때 실패할 수 있다. 팀은 CI 시간을 줄이려고 여러 번 손봤다(api 시험 시간 단축).

A. 일반 시험에는 시간 단언을 넣지 않고, 합성 후보(커밋 3,000)의 결과(상한 안·결정적)만 단언한다. 시간은 코드 생성 때 한 번 재서 코드 생성 요약에 기록한다.
B. 일반 시험에 5초 단언을 넣는다. 더 막는 것: 나중 변경이 재료 계산을 느리게 만들면 CI가 잡는다. 늘어나는 공수: CI 시간과 느린 컴퓨터에서의 잘못된 실패 위험.
C. Not yet defined — 아직 정하지 않았다.
X. Other (please specify)

[Answer]: A

## Q2. [보안] 후보 판정과 생성이 함께 쓸 가리기 검사는 어디에 둘까요?

**배경:**
- 지금 검사는 `worker/app/generation/redact.py`에 있다. 이 모듈을 불러오는 곳은 `worker/app/generation/request.py`와 시험 `worker/tests/test_generation_redact.py` 둘뿐이다.
- 후보 판정(`worker/app/candidates`)이 생성 쪽을 불러오면 불러오기 순환이 날 수 있다(기능 설계 BR2.4).

A. 검사 모듈을 `worker/app/redact.py`로 옮기고, 불러오는 두 곳을 새 위치로 고친다. 옛 위치는 지운다.
B. A처럼 옮기되, 옛 위치(`app/generation/redact.py`)에는 새 모듈을 다시 내보내는 줄만 남긴다. 더 막는 것: 거의 없다(불러오는 곳이 둘뿐이다). 늘어나는 공수: 같은 검사를 가리키는 이름이 두 곳에 남는다.
C. Not yet defined — 아직 정하지 않았다.
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
