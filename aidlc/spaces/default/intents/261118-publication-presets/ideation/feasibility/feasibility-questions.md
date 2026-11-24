# Feasibility & Constraints — 질문

선택지는 승인된 의도 진술(`ideation/intent-capture/intent-statement.md`), 입력 문서 `docs/ai-dlc-input-preset/CatchU_발행_프리셋_입력.md` §4(기준 커밋 `61b03716`의 지금 코드), 팀 규칙(`aidlc/spaces/default/memory/team.md`)을 바탕으로 만들었다.

## Q1. [아키텍트] 함께 바뀌거나 영향을 받는 기존 기능 (select all that apply)

지금 발행본은 항목마다 순서 번호 하나로 저장되고 묶음 개념이 없다. 프리셋 구분을 더하면 어디까지 손이 가나?

A. 발행 요청과 사본 저장: 요청에 프리셋 구분이 생기고, 저장된 항목에 프리셋 구분을 더하는 DB 변경이 든다
B. 순서 번호를 쓰는 AI 요약 근거 목록, 질의응답 항목 머리글, 검색 조각 나누기
C. 받은 사람 화면과 작성자 발행본 화면(같은 사본 표시를 쓴다), 출처 단추의 이동
D. 발행본을 읽는 다른 기능인 Claude 연결의 받은 링크 읽기와 JD 요약: 사본 구조가 바뀌면 영향을 받는다. 프리셋 구분을 실을지는 요구사항 단계에서 정한다
E. 새 프리셋 저장과 프리셋 화면(만들기·고치기·순서), 그리고 발행 화면을 프리셋 고르기로 바꾸는 것
F. Not identified
X. Other (please specify)

[Answer]: A, B, C, D, E, X. 텍스트 자료·PDF 지우기(프리셋에 담긴 자료를 지울 때의 처리), 탈퇴(프리셋도 지움), 개인정보처리방침 문구(저장 항목과 하나씩 지우기 문장에 프리셋을 더함).

## Q2. [아키텍트] 이 변경 전에 발행한 발행본과 이미 보낸 링크

A. 계속 열려야 한다. 기존 발행본은 탭 하나로 보이고(탭 이름은 요구사항 단계에서 정한다), 이미 보낸 링크가 깨지면 안 된다
B. 버려도 된다. 지금 이용자는 팀 관련자뿐이라 기존 발행본은 지우거나 열리지 않아도 된다(이전 처리가 줄어든다)
C. Not yet defined
X. Other (please specify)

[Answer]: B

## Q3. [개발] 기술 스택과 구현 인력

A. 지금 스택 그대로 팀장 혼자 구현한다(web Next.js, api NestJS, PostgreSQL·TypeORM). 새 라이브러리는 들이지 않고 탭 부품은 자료 화면에 이미 있는 것을 다시 쓴다
B. A에 더해 새 라이브러리가 필요하다(이름을 적는다)
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Q4. [운영] 규제·개인정보 요구

A. 새 요구 없음. 프리셋은 지원자가 이미 가진 자료를 묶을 뿐이고, 발행할 때 비공개 Catch를 공개로 바꾸는 지금 동작을 그대로 둔다
B. 개인정보처리방침이나 고지 문구를 고쳐야 한다
C. Not identified
X. Other (please specify)

[Answer]: B. 새 규제 요구는 없다. 다만 개인정보처리방침의 저장 항목 표와 「하나씩 지우기」 문장에 프리셋을 더하고, 탈퇴할 때 프리셋도 지운다. 프리셋 이름을 외부 AI에 보내는지는 설계에서 정하고, 보내게 되면 고지 문구도 함께 고친다.

## Q5. [운영] AWS와 배포

A. 새 AWS 자원은 없다. 개발 서버 자동 배포와 `dev-ci`를 그대로 쓰고, DB 변경은 지금처럼 배포 때 도는 migration으로 넣는다
B. 새 AWS 자원이나 배포 변경이 필요하다
C. Not identified
X. Other (please specify)

[Answer]: A

## Q6. [일정] 막힐 수 있는 것 (select all that apply)

A. 팀원 3이 지금 같은 받은 사람 화면과 발행본 자료 화면을 정리하고 있어 파일 충돌을 조율해야 한다
B. 발행 요청·사본 계약 변경은 담당들의 PR 리뷰가 필요해 리뷰를 기다리는 시간이 생길 수 있다
C. None
X. Other (please specify)

[Answer]: A, B

## Q7. [아키텍트] 기존 발행본: 의도 진술과 Q2의 어긋남 (Q2에서 이어진 질문)

승인된 의도 진술은 「이 변경 전에 발행한 발행본의 탭 표시」를 이번 판 범위 안에 두고 세부를 요구사항 단계로 넘겼다(Intent Capture Q11). Q2는 기존 발행본을 버려도 된다고 했다. 어느 쪽으로 맞출까?

A. 기존 발행본은 버린다(지우거나 열리지 않아도 된다). 의도 진술의 탭 표시 항목은 요구사항 단계에서 「버린다」로 정한다
B. 기존 발행본은 탭 하나로 계속 열리게 한다(Q2를 A로 바꾼다)
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
