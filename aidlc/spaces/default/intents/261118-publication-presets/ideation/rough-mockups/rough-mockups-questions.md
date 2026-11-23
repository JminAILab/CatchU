# Rough Mockups — 질문

선택지는 승인된 의도 진술(`ideation/intent-capture/intent-statement.md`), 범위 문서(`ideation/scope-definition/scope-document.md`), 백로그(`ideation/scope-definition/intent-backlog.md`), 입력 문서 `docs/ai-dlc-input-preset/CatchU_발행_프리셋_입력.md` §3, 지금 코드(이 브랜치의 `web/src`)를 바탕으로 만들었다.

지금 화면에서 확인한 것:

- 상단 메뉴는 「내 자산 · 텍스트 자료 · 발행본 · JD 관리」다. 발행은 「발행본」 화면의 [새로 발행]에서 시작한다.
- 발행 화면은 「발행할 자료 고르기」(내 Catch·내 텍스트 자료·내 PDF 자료) → 「고른 항목과 순서」(위로·아래로·빼기) → 「제목과 비밀번호」 → 「발행 내용 확인」 → 「발행됨」 순서다.
- 받은 사람 화면은 제목 → 이 링크에서 할 수 있는 것 안내 → Claude 연결 → 발행 시각 → 「발행본 자료」 → 「AI 요약」 → 「발행본에 질문하기」 → JD 요약 순서다.
- 자료 화면의 탭(「텍스트 자료」「PDF 자료」)은 누르면 바뀌고, 화살표 키로 탭을 옮기는 동작은 없다.

## Q1. [디자인] 프리셋 화면으로 들어가는 자리

A. 「발행본」 화면에서 들어간다. 「내 발행본」 목록 위에 [프리셋 관리] 링크를 두고, 발행 화면의 「프리셋이 없으면 만들러 가는 링크」도 같은 곳을 가리킨다. 상단 메뉴는 그대로다
B. 상단 메뉴에 「프리셋」을 새로 더한다(메뉴가 5개가 된다)
C. 「텍스트 자료」 화면의 탭으로 더한다
D. Not yet defined
X. Other (please specify)

[Answer]: B. 상단 메뉴의 「텍스트 자료」와 「발행본」 사이에 「프리셋」을 더한다. 발행 화면에서 프리셋이 없을 때 보이는 링크는 프리셋 화면을 가리킨다. (승인 검토에서 A에서 바꿈)

## Q2. [디자인] 프리셋 화면의 틀

A. 텍스트 자료 화면과 같은 틀: 한 화면에 왼쪽 프리셋 목록, 오른쪽 고른 프리셋의 편집(이름, 담을 자료 고르기, 담긴 자료와 순서, 항목·글자 수, 보낸 링크는 안 바뀐다는 안내)
B. 목록 화면과 편집 화면을 따로 둔다
C. Not yet defined
X. Other (please specify)

[Answer]: B

## Q3. [디자인] 발행 화면의 흐름

A. 지금 흐름을 그대로 두고 「발행할 자료 고르기」와 「고른 항목과 순서」 자리만 「프리셋 고르기」와 「고른 프리셋과 순서」로 바꾼다. 「제목과 비밀번호」 → 「발행 내용 확인」 → 「발행됨」은 그대로다
B. 흐름을 새로 짠다
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Q4. [디자인] 받은 사람 화면에서 요약·자료·질의응답의 순서

지금은 자료가 먼저이고 AI 요약이 그 아래에 있다. 이번에 요약이 자료 맨 아래에 놓이지 않게 정한다(의도 진술).

A. 제목 → 안내 → Claude 연결 → 발행 시각 → 「AI 요약」 → 탭 줄과 탭의 자료 → 「발행본에 질문하기」 → JD 요약
B. 제목 → 안내 → Claude 연결 → 발행 시각 → 「AI 요약」 → 「발행본에 질문하기」 → 탭 줄과 탭의 자료 → JD 요약
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Q5. [디자인] 탭의 키보드 동작

A. 지금 자료 화면의 탭 부품 그대로: 탭마다 Tab 키로 옮겨 가고 Enter·Space로 연다(가장 단순하다)
B. 화살표 키로 탭 사이를 옮기는 동작을 더한다(탭 부품을 고쳐 자료 화면도 같이 바뀐다)
C. Not yet defined
X. Other (please specify)

[Answer]: B

## Q6. [디자인] 출처 단추로 다른 탭의 글로 옮겨 간 뒤 「답으로 돌아가기」 단추의 자리

A. 옮겨 간 글 바로 위에 하나 보인다. 누르면 출처 단추를 누른 답으로 돌아가고, 탭은 옮겨 간 탭 그대로 둔다
B. 화면 아래쪽에 떠 있는 단추로 둔다
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Q7. [디자인] 화면 크기

A. 지금 화면들과 같은 기준으로 한다(따로 좁은 화면 설계를 하지 않는다). 탭 줄이 넘치면 다음 줄로 넘어간다
B. 좁은 화면 배치를 따로 설계한다
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct

## Requested Changes Feedback

What should change?

[Answer]: Q5를 B로 바꿉니다. 화살표 키로 탭 사이를 옮기는 동작을 더하고, 자료 화면의 탭도 같은 부품으로 함께 바뀝니다.
