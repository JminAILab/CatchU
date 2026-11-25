# Scalability Requirements — u1-preset-contract

근거: 기능 설계 `construction/u1-preset-contract/functional-design/functional-spec.md`와 `rules.md`(BR1.3·BR1.4·BR3.1·BR3.4), 요구사항 `inception/requirements-analysis/requirements.md`(NFR6, Constraints), 코드 지식 기록 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`.

이용자는 2026-12월까지 팀 관련자뿐이다(requirements Assumptions). 규모는 상한으로 묶여 있어 따로 늘리는 장치를 두지 않는다.

| ID | 요구 | 근거 |
|---|---|---|
| NFR6.5 | 저장되는 프리셋 자료의 최대 양은 회원당 프리셋 50개 × 항목 20개 = 항목 1,000행이다. 이 상한 안에서 NFR6.2(종류별 일정한 조회 수)를 지킨다 | BR1.3, BR1.4 |
| NFR6.6 | 발행본 한 개의 크기는 지금과 같다: 항목 20개, 전체 글 60,000자. 프리셋 5개를 골라도 이 상한을 넘지 않는다 | BR3.1, BR3.4 |
| NFR6.7 | 새 배포 단위·새 외부 자원·캐시를 두지 않는다. 지금 api 프로세스와 PostgreSQL로 한다 | requirements Constraints |
