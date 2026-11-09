# CR3 AI 쪽 — 비기능 설계 질문

기능 설계(BR1~BR10)와 비기능 요구사항(NFR1.1~NFR7.1)이 정한 것은 묻지 않는다. 설계에서 실제로 갈리는 두 가지만 묻는다. 기본값은 가장 단순한 안이다.

## Q1. [개발] 판정을 언제 부를까

분석에는 마감(시작에서 3,540초)이 있다. 지금은 후보마다 생성 호출을 차례로 부른 뒤, 마지막에 제목 고쳐 쓰기를 몰아서 한다. 판정은 Catch마다 생성 뒤에 한 번이다(NFR2.1). 마감에 걸린 Catch는 판정하지 않고 설명이 NOT_GENERATED가 된다(NFR2.2).

A. 후보마다 생성 직후 바로 그 Catch의 판정을 부르고 다음 후보로 간다. 마감에 걸리면 그 뒤 후보만 생성·판정이 빠진다(기본값, 끝난 Catch는 늘 판정까지 마친다)
B. 모든 후보의 생성을 먼저 마친 뒤 판정을 몰아서 부른다(지금 고쳐 쓰기와 같은 모양이지만, 마감에 걸리면 생성은 됐는데 판정을 못 받은 Catch가 여럿 생겨 설명이 빠진다)
X. Other (please specify)

[Answer]: A

## Q2. [운영] FR10 확인 명령이 공개 저장소를 받을 때의 GitHub 인증

확인 명령은 공개 저장소(TheMe·algo-problem)를 실제 GitHub에서 받아 수집 결과 파일로 남긴다(기능 설계 BR9.1). 인증 없는 GitHub 조회는 시간당 60번이라 수집이 끝나지 않는다.

A. 팀장이 명령을 돌릴 때 셸 환경변수로 읽기 전용 GitHub 토큰을 넣는다. 명령은 토큰을 파일·로그·확인표에 남기지 않고, 쓰고 나면 버린다(기본값)
B. 로컬 실제 연결 도구의 api가 저장한 GitHub 연결 자격을 꺼내 쓴다(토큰을 따로 만들지 않지만, 암호화된 자격을 개발 명령이 풀어야 해서 api 내부에 기대게 된다)
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
