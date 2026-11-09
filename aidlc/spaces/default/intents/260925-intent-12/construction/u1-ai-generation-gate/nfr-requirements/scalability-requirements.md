# U1 AI 생성 관문 최소 경로 — 규모 요구사항

## Sources

작성일: 2026-10-27. 입력: [U1 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U1 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4와 「비기능 요구사항」 머리말(12월 시연 규모), [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) 「에러 대응 최소선」 6.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR4.3 | 규모는 12월 시연 규모(소수 외부 사용자)다. `generate()` 한 번은 Claude 호출 한 번이며 상태를 두지 않는다. 그래서 api 인스턴스를 늘려도 U1 쪽에서 바꿀 것이 없다. 동시 호출 수 제한·대기열·캐시는 두지 않는다 | 해당 없음(설계 확인) | NFR4, 「에러 대응 최소선」 6 |

## 하지 않는 것

- 하루 실행 제한은 U2(AiUsageLimit), 링크당 질문 횟수는 U5의 몫이다.
- 부하 시험은 하지 않는다(NFR6: 동시 요청 세부 시험 없음).
