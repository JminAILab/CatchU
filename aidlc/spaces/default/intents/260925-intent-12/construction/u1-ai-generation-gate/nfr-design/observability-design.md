# U1 AI 생성 관문 최소 경로 — 관측 설계

## Sources

작성일: 2026-10-27. 입력: [관측 요구사항](../nfr-requirements/observability-requirements.md)(observability-requirements), [성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U1 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 S8, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) 「에러 대응 최소선」 1.

## 설계

| 요구사항 | 설계 |
|---|---|
| NFR6.2 호출 로그 | 게이트가 호출마다 api의 기존 로거로 한 줄을 남긴다. 칸: 기능 이름, 중단 이유, 실패 원인, 낸 항목 수, `droppedCount`, 항목으로 인정하지 않은 줄 수, 입력·출력 토큰 수, 걸린 시간(밀리초), Anthropic 요청 ID. 정상은 정보, 실패·버림이 있으면 경고. 이 칸들은 기능 설계 BR5.5의 기록 항목을 넓힌 것이다 |
| NFR6.1 S8 결과 기록 | 실제 호출 시험이 돌면 결과 기록을 시험 출력으로 남긴다: 쓴 출력 상한 상수, 다시 돌렸는지, 합격 기준 ①~⑤ 각각의 결과, 응답 본문 크기. 키가 없어 건너뛰면 미실행이라고 남긴다. 팀장이 이 출력을 PR과 '최소 연결 첫 결과' 승인 자료에 붙인다. 근거 글과 인용문은 기록에 넣지 않는다 |

## 두지 않는 것

지표 수집, 대시보드, 알림, 분산 추적, 요청 상관 ID 전파는 두지 않는다(observability-requirements 「하지 않는 것」).
