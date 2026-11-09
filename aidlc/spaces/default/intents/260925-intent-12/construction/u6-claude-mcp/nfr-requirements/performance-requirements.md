# U6 Claude MCP 본인 연결 — 성능 요구사항

## Sources

작성일: 2026-10-31. 입력: [U6 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U6 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4·FR13.6, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-15, [비기능 질문·답변](nfr-requirements-questions.md) Q3. 외부 근거: [Authentication for connectors](https://claude.com/docs/connectors/building/authentication.md) 「Endpoint latency」, [Build an MCP server for Claude](https://claude.com/docs/connectors/building.md) 「Design within the size and timeout limits」.

## 범위

NFR4는 처리 시간·가동률·복구 수치를 새로 만들지 않는다고 정했다. 그래서 U6은 응답 시간 목표를 두지 않고, 호출 한 번이 읽는 양의 상한과 Claude 쪽 대기 한도를 넘지 않게 하는 구조만 둔다. 응답 크기 40,000자와 분당 60회는 기능 설계에서 정한 값이다(rules BR6.1·BR6.5).

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR4.1 | 새 응답 시간 목표를 두지 않는다. Claude 쪽 한도는 사실로만 적는다: 메타데이터·등록·토큰 주소 10초, 도구 호출 240초, 도구 결과 약 150,000자. U6의 OAuth 주소와 도구는 외부 서비스를 부르지 않고 DB만 쓴다(도구 호출의 빈도 집계만 Redis). 이 한도 안에 드는지는 실제 연결에서 본다 | 기능 설계 S22 | NFR4, 위 외부 근거 |
| NFR4.2 | 도구 호출 한 번에 DB에서 최대 50행을 읽고 응답을 40,000자까지 채운다. 남은 행은 다음 쪽이다. 두 값은 상수 한 곳에 둔다. Catch는 그 행들의 근거 주소를 조회 한 번으로 함께 읽는다. 최악의 메모리는 50행 × 본문 상한이므로 U4의 본문 상한이 정해지면 다시 확인한다 | 기능 설계 S14(50행이 넘는 자료 포함)·S15 | Q3, 기능 설계 BR5.5·BR6.5, 보안 점검 「LLM·검색 기능」(입력·출력 크기 상한) |
| NFR4.3 | 빈도 확인은 자료를 읽기 전에 한다. 61번째 호출은 DB의 자료를 읽지 않는다. 빈도 집계 명령은 1초 안에 끝나지 않으면 오류로 치고 통과시켜, Redis가 멈춰도 도구 호출이 걸리지 않는다 | 기능 설계 S16 | 기능 설계 BR6.1·BR6.3 |
| NFR4.4 | 토큰 확인은 요청마다 DB를 읽고 캐시하지 않는다. 기본 키와 UNIQUE로 찾는 조회라 회원의 자료 양에 따라 늘지 않는다 | 기능 설계 S8·S9, 코드 검토 | 기능 설계 BR4.7 |

## 채택하지 않은 것

- 응답 시간 목표(p95 등): NFR4가 새 수치를 만들지 않는다고 정했다.
- 한 번에 20행: 최악의 메모리가 줄지만 작은 항목이 많은 회원은 호출이 2.5배 늘어 빈도 한도에 더 빨리 닿는다(Q3).
- 행 수 상한 없이 남은 행을 모두 읽기: 자료가 많은 회원은 호출마다 전부 읽는다(Q3).
- 토큰 확인·도구 응답 캐시: 해제·탈퇴가 다음 호출부터 바로 막혀야 하고(BR4.7), 지운 자료의 사본을 두지 않는다(reliability-requirements NFR5.2).
