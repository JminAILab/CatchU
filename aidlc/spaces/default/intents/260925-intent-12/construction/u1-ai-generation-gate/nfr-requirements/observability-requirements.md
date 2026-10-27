# U1 AI 생성 관문 최소 경로 — 관측 요구사항

## Sources

작성일: 2026-10-27. 입력: [U1 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 S8, [U1 업무 규칙](../functional-design/rules.md)(rules)의 BR3.4·BR5.5, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR6, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) 「에러 대응 최소선」 1, [보안 점검](../../../../../../../docs/CatchU_security_checks.md) 「로그·오류 응답」, [비기능 질문·답변](nfr-requirements-questions.md) Q3.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR6.2 | 호출마다 로그 한 줄을 남긴다. 칸: 기능 이름, 중단 이유, 실패 원인(실패일 때), 낸 항목 수, `droppedCount`, 항목으로 인정하지 않은 줄 수(`droppedCount`에는 세지 않음), 입력·출력 토큰 수, 걸린 시간, Anthropic 요청 ID. 정상은 정보 수준, 실패·버림은 경고 수준이다. 근거 글·인용문·`userText`·키·줄 내용은 남기지 않는다(보안 요구사항 NFR6.3) | 정상·잘림·실패 각각의 로그 칸 시험 | NFR6, 기능 설계 BR5.5, Q3 |
| NFR6.1 | 실제 호출 시험(S8)의 결과 기록에 쓴 출력 상한 상수, 상한을 낮춰 다시 돌렸는지, 합격 기준 ①~⑤ 각각의 결과를 남긴다. 키가 없어 건너뛴 경우는 미실행으로 적는다. 이 기록이 '최소 연결 첫 결과' 승인 자료다 | S8 결과 기록 | NFR6, team.md Walking Skeleton, 기능 설계 S8 |

## 하지 않는 것

- 지표 수집·대시보드·알림·분산 추적은 두지 않는다(NFR6: 별도 관제 화면 없음).
- 로그 형식과 출력 위치는 api의 기존 로거를 따른다.
