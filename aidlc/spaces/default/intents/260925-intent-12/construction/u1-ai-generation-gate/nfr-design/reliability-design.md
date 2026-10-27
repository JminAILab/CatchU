# U1 AI 생성 관문 최소 경로 — 신뢰성 설계

## Sources

작성일: 2026-10-27. 입력: [신뢰성 요구사항](../nfr-requirements/reliability-requirements.md)(reliability-requirements), [성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[관측](../nfr-requirements/observability-requirements.md)(observability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U1 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 W2, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-01 오류와 「에러 대응 최소선」.

## 설계

| 요구사항 | 설계 |
|---|---|
| NFR4.4 재시도 없음 | SDK 클라이언트의 재시도를 0으로 만든다(SDK 기본은 2회). 게이트도 다시 부르지 않는다. 실패는 아래 표대로 `AiProviderError` 하나로 호출자에게 던진다 |
| NFR6.1 실패를 숨기지 않음 | 잘린 마지막 항목·위치로 연결되지 않는 인용의 항목은 `droppedCount`로 세고, 그 밖의 실패는 빈 결과가 아니라 오류로 끝낸다(기능 설계 BR4.4·BR5.1~BR5.4) |

## 실패와 원인

| 일어난 일 | 낸 오류 | 원인(`reason`) |
|---|---|---|
| 연결 실패, 오류 응답, 시간 초과, redirect, 본문 상한 초과, 응답 모양이 맞지 않음 | `AiProviderError` | `CALL_FAILED` |
| 중단 이유가 거절 | `AiProviderError` | `REFUSED` |
| 낼 항목이 0개 | `AiProviderError` | `NO_ITEMS` |
| 정상 끝·출력 상한·거절 밖의 중단 이유 | `AiProviderError` | `UNEXPECTED_STOP` |

`reason`은 로그 구분용 값이다. 호출자는 오류 이름만으로 실패를 기록할 수 있다(기능 설계 entities.md 「요약」).

## 두지 않는 것

회로 차단기, 대체 모델로 넘기기, 캐시된 응답, 상태 확인 경로는 두지 않는다(reliability-requirements 「하지 않는 것」).
