# U2 공용 기반 — 성능 요구사항

## Sources

작성일: 2026-10-27. 입력: [U2 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U2 업무 규칙](../functional-design/rules.md)(rules)의 BR1·BR3·BR5, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4·NFR2, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-01~C-03, [비기능 질문·답변](nfr-requirements-questions.md) Q1·Q2.

## 원칙

NFR4는 질의응답(SSE, U5)과 수집 상한(U7) 밖의 처리 시간·가동률·복구 수치를 새로 만들지 않는다고 정했다. 그래서 U2는 응답 시간 목표값을 두지 않는다. 대신 성능에 영향을 주는 상한과 처리 방식만 정한다.

## 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR4.1 | U2는 응답 시간·처리량 목표 수치를 새로 두지 않는다. 시연 규모(소수의 외부 사용자)를 전제로 한다 | 문서 확인 | NFR4, 11월 범위 결정 |
| NFR4.2 | AI 생성 게이트는 근거 글과 질문·JD 줄 합계가 80,000자를 넘으면 Claude를 부르지 않고 `AiInputTooLarge`로 바로 끝낸다 | 시나리오 S7 | BR3.1, C-01, Q5(기능 설계) |
| NFR4.3 | 하루 실행 횟수 쓰기는 DB 문장 하나(조건부 삽입·갱신)로 끝나며 별도 잠금·조회를 더하지 않는다 | 시나리오 S1·S3 | BR1.3, C-03 |
| NFR4.4 | 백그라운드 실행(AiRun)은 api 프로세스당 동시 1개다. 겹친 작업은 차례로 처리한다 | 설정값 확인, 시험에서 두 작업이 차례로 끝나는지 | Q1(비기능), 10월 큐 동시 1 |
| NFR4.5 | 질의응답 스트림(generateStream)은 항목 하나가 끝나 대조를 통과할 때마다 내보내며, 응답 전체를 기다렸다 내보내지 않는다 | 시나리오 S18 | BR3.8, NFR4(SSE) |
| NFR4.6 | DB 잠금 대기는 앱 계정의 `lock_timeout = 3s`를 그대로 따른다. U2가 따로 상한을 두지 않는다 | api/docs/lock-wait-limit.md | 10월 #220 결정 |

## 한계

- 동시 1이라 시연 중 여러 사람이 한꺼번에 발행하면 기본 요약·임베딩이 차례로 끝나 늦게 보일 수 있다. 처리 시한 안에 끝나지 않으면 실패로 보이고 사람이 다시 만든다(FR6.8).
- 80,000자는 사전 측정값이 아니라 초기값이다. 실제 JD 요약 "전체 넣기"(NFR3)에서 걸리면 기록하고 값을 바꾼다.
