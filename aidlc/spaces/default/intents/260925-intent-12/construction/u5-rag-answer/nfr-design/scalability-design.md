# U5 RAG 응답 — 확장성 설계

## Sources

작성일: 2026-10-30. 입력: [성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[관측](../nfr-requirements/observability-requirements.md)(observability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U5 기능 명세](../functional-design/functional-spec.md)(functional-spec), [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-02·C-06, [비기능 설계 질문·답변](nfr-design-questions.md).

## 설계

| 요구사항 | 설계 |
|---|---|
| NFR4.7 공유 질문 횟수 | 키는 `{CATCHU_QUEUE_PREFIX}:qna-question-count:{publicationId}:{YYYY-MM-DD}`(한국 시간 날짜). `MULTI` 안에서 `INCR` 뒤 `EXPIREAT 다음 한국 시간 자정(초)`를 한 번에 보낸다(매번 같은 값이라 여러 번 걸어도 같다). 한국 시간 날짜·자정 계산은 시각을 받는 순수 함수 하나로 두고 경계(23:59:59·00:00:00 KST)를 시험한다. 여러 api 인스턴스가 같은 키를 원자적으로 늘린다 |
| NFR4.8 상태 없음 | 질의응답 처리기는 요청 지역 값만 쓴다. 대화·검색 결과·다시 쓴 질문을 프로세스 메모리나 DB에 두지 않는다 |
| NFR4.9 행 수 | `base_summary`는 `publication_id` 유일 제약으로 발행본마다 한 행. 연쇄 삭제로 정리되고 따로 지우는 작업은 없다 |
| NFR4.10 요약 동시성 | `BASE_SUMMARY` 처리기는 AiRun에 한 번 등록하고 동시 실행 수는 AiRun 설정을 따른다. U5는 잠금·세마포어를 두지 않는다 |
| NFR4.11 목표 없음 | 자동 확장·부하 시험·용량 목표 없음 |
