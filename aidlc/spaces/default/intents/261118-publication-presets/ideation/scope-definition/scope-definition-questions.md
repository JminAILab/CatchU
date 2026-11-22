# Scope Definition — 질문

선택지는 승인된 의도 진술(`ideation/intent-capture/intent-statement.md`), 타당성 평가(`ideation/feasibility/feasibility-assessment.md`), 제약 목록(`ideation/feasibility/constraint-register.md`), 입력 문서 `docs/ai-dlc-input-preset/CatchU_발행_프리셋_입력.md` §3(팀장 결정)을 바탕으로 만들었다.

범위 안 기능을 아래 묶음으로 보았다.

- 프리셋 만들기·고치기·지우기(이름, Catch·텍스트 자료·PDF 담기, 안의 순서, 작성자 설명 걸러 보기 옮김)
- 프리셋으로 발행(최대 5개, 프리셋 순서, 프리셋이 없으면 만들러 가는 링크)
- 받은 사람·작성자 발행본 화면의 탭(이름 줄임, 누르면 전체 이름)
- 요약·질의응답을 탭 밖에 두고 요약·자료 배치 정하기
- 출처 단추가 다른 탭의 글로 옮겨 가기, 답으로 돌아가는 단추
- 지원자에게 알리는 것 넷(확인 필요·비공개 표시, 항목·글자 수, 발행이 막힌 자리, 고쳐도 보낸 링크는 안 바뀐다는 안내)
- 자료 지우기·탈퇴·개인정보처리방침
- 기존 발행본 버리기
- 받은 링크 읽기·JD 요약을 바뀐 사본에 맞추기

## Q1. [제품] 무엇이 꼭 있어야 하나 (Must)

A. 위 묶음 모두 Must다. 입력 문서 §3은 팀장 결정이고 의도 진술 범위와 같다
B. 지원자에게 알리는 것 넷은 Should로 내린다(시간이 모자라면 뒤로 미룬다)
C. 답으로 돌아가는 단추는 Should로 내린다
D. Not yet defined
X. Other (please specify)

[Answer]: A

## Q2. [제품] 만드는 순서

A. 의존 순서: 발행 요청·사본 계약과 프리셋 저장 → 프리셋 화면 → 프리셋으로 발행 → 받은 사람·작성자 발행본 화면의 탭과 출처 이동 → 받은 링크 읽기·JD 요약 맞춤
B. 위험 먼저: 받은 사람 화면의 탭과 출처 이동을 먼저 만들어 본다
C. 가치 먼저: 면접관이 보는 화면부터 만든다
D. Not yet defined
X. Other (please specify)

[Answer]: A

## Q3. [제품] 11월 안 dev 반영을 어떻게 나눠 올리나

타당성 평가는 계약 변경 PR의 리뷰 대기를 위험으로 적었다.

A. 계약 변경(발행 요청·사본)을 먼저 PR로 올려 담당 리뷰를 받고, 나머지는 이어서 올린다. 모두 2026-11-30까지 dev에 들어간다
B. 한 PR로 한꺼번에 올린다
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Q4. [제품] 팀원 3의 지금 화면 정리와의 순서

팀원 3이 같은 받은 사람 화면·발행본 자료 화면을 정리하고 있다(안내 접기, 박스 크기).

A. 프리셋·발행 쪽을 먼저 만들고, 받은 사람 화면은 팀원 3의 정리가 dev에 들어간 뒤 그 위에서 시작한다
B. 기다리지 않고 동시에 고친 뒤 합칠 때 충돌을 푼다
C. Not yet defined
X. Other (please specify)

[Answer]: X. 기다리지 않는다. 팀장은 Q2의 순서대로 진행한다. 받은 사람 화면을 시작할 때 팀원 3의 정리가 dev에 들어와 있으면 그 위에서 시작하고, 없으면 그대로 진행한다. dev에 먼저 들어간 쪽이 기준이 되고 뒤에 들어오는 쪽이 거기에 맞춘다.

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
