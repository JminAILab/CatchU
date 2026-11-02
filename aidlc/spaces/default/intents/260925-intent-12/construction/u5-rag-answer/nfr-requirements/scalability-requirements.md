# U5 RAG 응답 — 확장성 요구사항

## Sources

작성일: 2026-10-30. 입력: [U5 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U5 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4·「의도 분석」(12월 이용자는 소수 외부 사용자), [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-02·C-03·C-06, [비기능 질문·답변](nfr-requirements-questions.md) Q3.

## 범위

12월 이용은 소수 외부 사용자의 시연 규모다(요구사항 「의도 분석」, NFR4). 확장 목표나 자동 확장은 두지 않고, 여러 api 인스턴스에서도 맞게 동작해야 하는 부분만 정한다.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR4.7 | 질문 횟수는 프로세스 메모리가 아니라 Redis 키 하나(발행본·한국 시간 날짜)에 원자적으로 늘려 세므로 api 인스턴스가 여럿이어도 같은 한도를 지킨다. 키는 다음 한국 시간 자정에 만료되어 쌓이지 않는다 | 같은 키를 두 번 늘리는 시험, 만료 시각 계산 시험(자정 경계) | NFR4, FR6.6, 기능 설계 BR3.1·BR9.2 |
| NFR4.8 | 질의응답은 서버에 상태를 남기지 않는다(대화는 브라우저). 어느 인스턴스가 받아도 결과가 같다 | 해당 없음(설계 성질), 기능 설계 BR1.4 | FR6.2 |
| NFR4.9 | `base_summary`는 발행본마다 한 행이고 늘어나는 양은 발행본 수와 같다. 별도 정리 장치 없이 발행본 삭제·작성자 탈퇴 때 연쇄 삭제된다 | reliability-requirements NFR5.1 | C-06, FR5.2, 기능 설계 BR9.1 |
| NFR4.10 | 기본 요약 생성은 C-02 AiRun 큐에서 돌고 동시 실행 수는 AiRun 설정을 따른다. U5가 따로 동시성 제한을 두지 않는다 | 해당 없음 | C-02 |
| NFR4.11 | 확장 목표·부하 시험·자동 확장 설정은 두지 않는다 | 해당 없음 | NFR4, NFR6, C06 |
