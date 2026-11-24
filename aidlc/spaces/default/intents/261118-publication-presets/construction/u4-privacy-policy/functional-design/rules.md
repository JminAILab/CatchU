# Rules — u4-privacy-policy

이 단위의 규칙은 방침 글자를 어떻게 바꾸는지에 대한 것뿐이다. 바꿀 글 자체는 `functional-spec.md` 「확정 문구」 C1~C5가 정본이다.

```yaml
rules:
  - id: BR1.1
    statement: 1번 저장 항목 표의 「자료·JD를 올리고 발행할 때」 줄 받는 정보에 「프리셋(이름과 담은 자료 목록)」을 넣는다
    category: policy
    applies_to: 개인정보 처리방침 1번 표
    trigger: 방침 글을 바꿀 때
    logic: IF 방침에 프리셋 저장을 알린다 THEN C1의 글로 그 줄 둘째 칸을 바꾸고, 쓰는 곳 칸과 표 줄 수는 그대로 둔다
    violation: 시험의 글자 대조가 실패한다
    source: FR4.3
  - id: BR1.2
    statement: 하나씩 지울 수 있는 것을 적은 두 곳(2번 둘째 줄, 5번)에 프리셋을 넣고, 프리셋을 지워도 이미 만든 발행본에는 남는다고 적는다
    category: policy
    applies_to: 개인정보 처리방침 2번 둘째 줄과 5번 「하나씩 지우기」
    trigger: 방침 글을 바꿀 때
    logic: IF 방침에 프리셋을 하나씩 지울 수 있다고 알린다 THEN C3·C4의 글로 두 줄을 함께 바꾼다
    violation: 시험의 글자 대조가 실패한다
    source: FR4.3
  - id: BR1.3
    statement: 2번 첫째 줄의 탈퇴 때까지 보관하는 목록에 프리셋을 넣는다
    category: policy
    applies_to: 개인정보 처리방침 2번 첫째 줄
    trigger: 방침 글을 바꿀 때
    logic: IF 방침이 보관하는 것을 나열한다 THEN C2의 글로 그 줄을 바꾼다
    violation: 시험의 글자 대조가 실패한다
    source: FR4.3(팀장 결정 Q3)
  - id: BR1.4
    statement: 9번 시행일 줄 바로 아래에 바뀐 날짜와 내용을 적은 줄 하나를 더하고, 날짜는 main 배포일로 팀장이 정한다
    category: policy
    applies_to: 개인정보 처리방침 9번
    trigger: 방침 글을 바꿀 때
    logic: IF 방침이 바뀐다 THEN C5의 글을 더하고 ○○만 팀장이 알려 준 날짜로 바꾼다. 날짜가 없으면 코드 생성을 시작하지 않는다
    violation: 시험의 글자 대조가 실패하거나, 날짜 없이 배포된다
    source: FR4.3(원문 9번의 약속, 팀장 결정 Q4)
  - id: BR1.5
    statement: 원문 사본과 화면은 같은 글자이고, 사본의 원문 출처는 이 단위의 기능 설계 문서이며 SHA-256을 새 사본 값으로 바꾼다
    category: validation
    applies_to: privacy-policy.md, privacy-policy.tsx, privacy-policy.test.mjs, README
    trigger: 방침 글을 바꿀 때
    logic: IF 사본이나 화면의 글을 바꾼다 THEN 둘을 함께 바꾸고, 시험의 출처 주석과 SHA-256, README 근거를 이 문서로 바꾼다
    violation: 시험의 글자 대조나 SHA-256 대조가 실패한다
    source: FR4.3(팀장 결정 Q5)
```

| ID | 내용 | 확정 문구 |
|---|---|---|
| BR1.1 | 1번 표에 프리셋 | C1 |
| BR1.2 | 하나씩 지우기 두 곳에 프리셋 | C3·C4 |
| BR1.3 | 보관 목록에 프리셋 | C2 |
| BR1.4 | 9번에 바뀐 날짜와 내용 | C5 |
| BR1.5 | 사본·화면 같게, 출처와 SHA-256 | — |
