# Code Generation Plan Approval

AI-DLC writes this file when it asks you to approve the plan. To answer here
instead of in chat, write your answer after `[Answer]:` and tell me in chat when you are done.

## Plan Approval

Approve the code plan for u1-preset-contract?

- Builds: 프리셋 저장·세기 API, 발행 판정 규칙 떼기, 프리셋 ID 발행, 사본의 프리셋 칸과 앞선 사본 거르기(조각·요약·질의응답 머리글·받은 링크 읽기), 변경 전 발행본 버리는 마이그레이션
- Touches: 새 `api/src/presets/`·`api/src/publishable-source/`, `api/src/publications/`(입력·발행·사본·응답), `api/src/published-index/`, `api/src/rag-answer/`, `api/src/claude-mcp/`, `api/src/common/errors/`...
- Tests: 새 시험 파일 6개(약 45건, 단위·DB 통합·api 끝까지 잇는 시험 1개)와 기존 시험 고침(발행·사본·요약·질의응답·받은 링크 읽기·조각·연쇄 삭제)
- 근거: 기능 설계 `construction/u1-preset-contract/functional-design/`(entities·rules·functional-spec, 검토 review-01), NFR 요구 `nfr-requirements/`(검토 review-01), NFR 설계 `nfr-design/`(검토 review-01), 계약 `incep...
- 이 단위는 api만 바꾼다. web은 바꾸지 않는다(사본 칸이 늘어도 web 응답 검사는 모르는 칸을 무시한다). 이 단위가 dev에 들어간 뒤 U2가 들어올 때까지 dev 발행 화면은 발행에 실패한다(단위 Q2).

Full plan: aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/code-generation/code-generation-plan.md
Test instructions: aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/code-generation/unit-test-instructions.md

[Approval Fingerprint]: sha256:v3:816d10f325663bc9c5d820a32d4bd99f124dfaf77eb7bab95025e681aa5c4ea3
[Planned Source]: dc6b1c674de3c3676ef65faf328a75f3114455be75367e4da52fb5a6f1f047e1

- A. Approve Plan
- B. Request Changes
- C. I'll edit the files

[Answer]: A. Approve Plan
