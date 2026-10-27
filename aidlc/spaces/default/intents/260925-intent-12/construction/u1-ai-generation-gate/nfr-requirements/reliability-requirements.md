# U1 AI 생성 관문 최소 경로 — 신뢰성 요구사항

## Sources

작성일: 2026-10-27. 입력: [U1 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 W1·W2, [U1 업무 규칙](../functional-design/rules.md)(rules)의 BR2.4·BR5.1~BR5.4, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4·NFR6, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-01 오류와 「에러 대응 최소선」 1·2.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR4.4 | 가동률·복구 시간 목표는 두지 않는다. Claude 호출이 실패하면(연결 실패·오류 응답·시간 초과·응답 본문 상한 초과·거절·항목 없음·예상 밖 중단) 자동으로 다시 보내지 않고 `AiProviderError` 하나로 호출자에게 알린다. 다시 시도는 사람이 한다(호출 Unit의 [다시 만들기]·새 질문) | 실패 종류마다 한 번만 보냈는지와 오류가 나는지 시험(SDK 기본 재시도가 꺼졌는지 포함) | NFR4, C-01 errors, 「에러 대응 최소선」 2 |
| NFR6.1 | 실패를 성공으로 숨기지 않는다. 잘린 응답의 마지막 항목처럼 일부만 버리는 경우는 `droppedCount`로 남고, 나머지 실패는 빈 결과가 아니라 오류다(기능 설계 BR5.1~BR5.4) | 기능 설계 시나리오 S6·S7 | NFR6, 「에러 대응 최소선」 1 |

## 하지 않는 것

- 대체 모델로 넘기기(fallback), 회로 차단기, 캐시된 응답 쓰기는 두지 않는다. 시연 규모에서 막을 위험보다 공수가 크다.
- 처리 시한과 실패 기록(AiRun)은 U2, 호출 Unit의 상태 표시는 각 Unit 몫이다.
