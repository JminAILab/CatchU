# CR3 AI 쪽 — 비기능 요구사항 질문

요구사항(NFR1 외부 AI 처리, NFR2 호출 횟수, NFR3 판정 품질, NFR5 비밀값, NFR7 문서 크기)과 CR3 기능 설계(BR1~BR10, 판정 시간 제한 20초·상한 300번)가 정한 것은 묻지 않는다. 비기능 쪽에서 아직 비어 있는 것만 묻는다. 기본값은 가장 단순한 안이다.

## Q1. [보안] OpenAI 판정 요청의 자료 보관 설정

판정 입력(바뀐 줄·경로, 본인 PR 제목·커밋 메시지 첫 줄, AI가 쓴 후보)은 OpenAI로 간다(NFR1). 지금 Claude 생성 호출은 미국 처리이고, 고지 v2 3절에 보관 30일과 연락처를 적었다. 고지 v3 3절에는 OpenAI 쪽 보관도 적어야 한다(FR9.1, 문구는 PR에서 팀장 승인).

A. 공급자가 요청마다 주는 「응답 저장 끔」 설정이 있으면 켜고, 고지 v3 3절에는 공식 안내의 보관 기간·처리 위치를 적는다. 계정 단위 설정(보관 0일 계약 등)은 따로 하지 않는다(기본값)
B. A에 더해 OpenAI 계정에서 보관을 줄이는 계정 설정을 팀장이 신청한다(보관이 더 짧아지지만, 계정 신청과 확인 절차가 늘고 켜는 시점이 늦어질 수 있다)
X. Other (please specify)

[Answer]: A

## Q2. [보안] FR10 로컬 확인표를 둘 곳

확인표에는 비공개 CatchU 저장소의 코드 줄·기록의 글·AI 후보와 문장이 그대로 들어간다. Git에 넣지 않기로 정했다(CR3 BR9.2). 남은 것은 어디에 두느냐다.

A. 저장소 밖의 로컬 폴더(`~/catchu-local-live/cr3-fr10/`)에 쓴다. 명령은 그 폴더가 저장소 안이면 거부한다. 확인이 끝나면 팀장이 지운다(기본값, 실수로 커밋될 길이 없다)
B. 저장소 안의 Git 무시 폴더(`worker/.local/fr10/`)에 쓴다(찾기 쉽지만, 무시 규칙이 바뀌거나 다른 작업 폴더로 복사될 때 섞일 수 있다)
X. Other (please specify)

[Answer]: A

## Q3. [개발] OpenAI 판정 공급자를 부르는 방식

worker에는 OpenAI 관련 의존성이 없다. Claude 생성은 공식 Anthropic SDK를 쓰고, 다시 시도를 끄고(`max_retries=0`) 키는 SDK가 스스로 읽는 이름을 쓰지 않는다. 새 의존성은 보안 점검 대상이다.

A. 공식 `openai` 파이썬 SDK를 판본 고정(`uv.lock`)으로 더하고, Claude 어댑터와 같은 규칙(다시 시도 끔, 키는 `CATCHU_JUDGEMENT_API_KEY`에서만, 응답 크기 상한, 미국 처리)으로 쓴다(기본값)
B. 새 의존성 없이 worker가 이미 쓰는 HTTP 클라이언트로 판정 API를 직접 부른다(의존성이 늘지 않지만, 요청·응답 모양과 오류 처리를 직접 짜고 지켜야 한다)
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
