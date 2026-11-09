# U1 AI 생성 관문 최소 경로 — 규모 설계

## Sources

작성일: 2026-10-27. 입력: [규모 요구사항](../nfr-requirements/scalability-requirements.md)(scalability-requirements), [성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[관측](../nfr-requirements/observability-requirements.md)(observability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U1 기능 명세](../functional-design/functional-spec.md)(functional-spec), [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) 「에러 대응 최소선」 6.

## 설계

| 요구사항 | 설계 |
|---|---|
| NFR4.3 시연 규모·상태 없음 | 게이트는 만들 때 받은 설정 말고는 상태를 두지 않는다. 호출 사이에 나누는 것은 SDK 클라이언트 하나뿐이다. api 인스턴스를 늘려도 U1에서 바꿀 것이 없다. 동시 호출 수 제한·대기열·캐시는 두지 않는다 |

## 두지 않는 것

부하 시험, 자동 늘리기 규칙, 자료 나누기는 없다. 하루 실행 제한(U2)과 링크당 질문 횟수(U5)가 호출 수를 막는다.
