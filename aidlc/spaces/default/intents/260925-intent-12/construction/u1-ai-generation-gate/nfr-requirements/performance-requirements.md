# U1 AI 생성 관문 최소 경로 — 성능 요구사항

## Sources

작성일: 2026-10-27. 입력: [U1 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U1 업무 규칙](../functional-design/rules.md)(rules)의 BR2.2, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) 「공통 전제」의 제한 값, [비기능 질문·답변](nfr-requirements-questions.md) Q2.

## 요구사항

NFR4는 처리 시간·가동률·복구 수치를 새로 만들지 않는다고 정했다. 아래 값은 응답 목표가 아니라 상한이다.

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR4.1 | 호출 하나의 시간 제한은 45초다. 넘으면 그 호출을 끝내고 `AiProviderError`로 낸다. 다시 보내지 않는다. 시간 제한은 SDK 설정 하나로 두고, 연결·응답 읽기 단계별 마감은 두지 않는다(보안 요구사항 NFR2.2) | 시간 초과 합성 응답 시험. 시계는 시험용으로 바꿔 실제로 기다리지 않는다 | NFR4, Q2(10월 worker 생성과 같은 값) |
| NFR4.2 | 기본 출력 상한은 4,000 토큰이며, 게이트를 만들 때 넘기는 설정으로 바꿀 수 있다(기능 설계 BR2.2). 실제 호출 시험(S8)은 완성 항목 2개 이상과 마지막 항목 잘림이 나오는 별도 시험 상수를 쓴다 | 기본값과 시험 상수가 요청에 실리는지 확인 | NFR4, Q2 |

## 하지 않는 것

- 응답 시간 목표(p95 등), 첫 글자까지의 시간 목표, 처리량 목표는 두지 않는다(NFR4).
- 질의응답의 SSE 지연은 U5와 U2의 `generateStream` 몫이다.
- 비용은 Claude 콘솔의 지출 상한이 막는다(팀장 준비). U1은 토큰 수를 로그에 남겨 볼 수 있게만 한다(observability-requirements NFR6.2).
