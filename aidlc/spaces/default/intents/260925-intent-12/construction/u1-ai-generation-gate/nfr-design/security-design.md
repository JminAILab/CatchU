# U1 AI 생성 관문 최소 경로 — 보안 설계

## Sources

작성일: 2026-10-27. 입력: [보안 요구사항](../nfr-requirements/security-requirements.md)(security-requirements), [성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[관측](../nfr-requirements/observability-requirements.md)(observability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U1 기능 명세](../functional-design/functional-spec.md)(functional-spec), [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-01, [논리 구성 요소](logical-components.md), [비기능 설계 질문·답변](nfr-design-questions.md).

## 설계

| 요구사항 | 설계 |
|---|---|
| NFR1.1 키 | 게이트 만들기 함수가 설정으로 받은 키(호출하는 쪽이 `CATCHU_GENERATION_API_KEY`에서 읽음)를 SDK 클라이언트에 직접 넘긴다. SDK가 환경변수에서 키를 스스로 읽지 않게 키를 늘 명시해서 넘긴다. 키가 비었으면 만들지 않고 오류로 멈추며, 오류 메시지에 키 값을 넣지 않는다. 실제 호출 시험은 같은 환경변수가 비었으면 건너뛰고 미실행으로 보고한다 |
| NFR1.2 보내는 자료 | 요청 만들개는 요청의 `sources`·`instruction`·`userText`만 쓴다. 게이트는 DB나 다른 모듈을 읽지 않는다 |
| NFR2.1 제공자·처리 위치 | Claude 호출기가 모델(HAIKU→Haiku 5.5, SONNET→Sonnet 5.5), 생각 끔, 처리 위치 미국을 매 요청에 싣는다 |
| NFR2.2 ① 주소 고정 | SDK 클라이언트를 만들 때 Claude API 주소를 코드의 상수로 넘긴다. 주소를 바꾸는 환경변수(`ANTHROPIC_BASE_URL` 등)를 읽지 않는다 |
| NFR2.2 ② redirect | 지키는 fetch가 redirect를 따라가지 않게 요청하고, 3xx 응답을 받으면 실패로 끝낸다 |
| NFR2.2 ③ 본문 상한 | 지키는 fetch가 응답 본문을 조각마다 세면서 넘긴다(압축을 푼 뒤 바이트 기준). 합이 256 KiB를 넘으면 읽기를 멈추고 실패로 끝낸다. 게이트는 이를 `AiProviderError(CALL_FAILED)`로 낸다 |
| NFR2.2 ④ 시간·재시도 | SDK 클라이언트의 시간 제한 45초, 재시도 0(신뢰성 설계) |
| NFR2.3 지시와 자료 분리 | 시스템 지시에는 항목 형식 지시와 `instruction`만 넣는다. 근거 글은 인용 문서로, `userText`는 문서 뒤 사용자 메시지로 보낸다. `publicationText`는 요청에 넣지 않는다 |
| NFR2.4 쟁점 기록 | U1 PR 「리뷰 요청」에 다음을 적는다: 숨긴 지시 방어·역량 평가 표현 금지·입력 상한·근거 대조는 U2, 비밀값·개인정보 가리기는 근거를 모으는 호출 Unit, U2가 붙기 전에는 게이트를 앱에 등록하지 않아 시험 밖에서 쓰지 않음(logical-components Q1) |
| NFR6.3 로그 | 로그는 관측 설계의 칸만 쓴다. 오류를 만들 때 SDK 오류의 원문 메시지를 그대로 붙이지 않고 원인 이름과 상태 코드만 옮긴다 |

## 시험

- 키가 비었을 때 게이트 생성 거부, 오류에 키가 없음.
- 요청 본문: 주소·모델·생각 끔·처리 위치·지시와 문서 분리·`publicationText` 없음.
- redirect 응답, 본문 256 KiB 딱 맞음·넘음(작은 조각의 합으로 넘음 포함): 모두 시험용 fetch로 돌린다(논리 구성 요소 「시험에서 바꿔 끼우는 자리」).
- 로그·오류 메시지에 근거 글·인용문·`userText`·키가 없음.
