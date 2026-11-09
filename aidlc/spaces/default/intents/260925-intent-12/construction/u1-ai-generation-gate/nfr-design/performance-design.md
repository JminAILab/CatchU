# U1 AI 생성 관문 최소 경로 — 성능 설계

## Sources

작성일: 2026-10-27. 입력: [성능 요구사항](../nfr-requirements/performance-requirements.md)(performance-requirements), [보안](../nfr-requirements/security-requirements.md)(security-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[관측](../nfr-requirements/observability-requirements.md)(observability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U1 기능 명세](../functional-design/functional-spec.md)(functional-spec), [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) 「공통 전제」의 제한 값.

## 설계

| 요구사항 | 설계 |
|---|---|
| NFR4.1 시간 제한 45초 | 게이트 만들기 함수의 기본값으로 두고 SDK 클라이언트의 시간 제한에 넘긴다. 단계별 마감은 두지 않는다. 시간 초과 시험은 시험용 fetch가 늦게 응답하게 하고, SDK 시간 제한을 짧게 줘 실제로 오래 기다리지 않는다 |
| NFR4.2 출력 상한 | 게이트 만들기 함수의 기본값 4,000 토큰. 실제 호출 시험(S8)은 시험 코드의 상수를 넘긴다 |

## 두지 않는 것

캐시, 연결 풀 조정, 비동기 큐, 응답 시간 목표는 두지 않는다(performance-requirements 「하지 않는 것」). 호출 하나가 Claude API 요청 하나다.
