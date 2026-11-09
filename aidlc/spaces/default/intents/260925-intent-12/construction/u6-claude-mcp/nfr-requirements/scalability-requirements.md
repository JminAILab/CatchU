# U6 Claude MCP 본인 연결 — 규모 요구사항

## Sources

작성일: 2026-10-31. 입력: [U6 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U6 업무 규칙](../functional-design/rules.md)(rules), [U6 엔티티](../functional-design/entities.md), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-06·C-15, `deploy/aws/k8s/api.yaml`.

## 범위

12월 이용자는 소수의 외부 사용자이고(requirements 의도 분석) NFR4는 규모 기준을 시연 규모로 둔다. U6은 확장 장치를 새로 두지 않고, 시연 규모에서 성립하는 가정과 저절로 쌓이는 행의 크기만 적는다.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR4.5 | 시연 규모 가정: api는 한 프로세스다(`deploy/aws/k8s/api.yaml` 「한 개만 띄우고」). MCP 세션을 서버에 두지 않아 U6이 더하는 서버 메모리 상태는 SDK IP 집계뿐이다. 자동 확장은 두지 않는다 | 기능 설계 S13(서버에 세션이 생기지 않음) | NFR4, 기능 설계 BR2.5·BR5.6 |
| NFR4.6 | 저절로 쌓이는 행을 타이머 없이 정리한다. 미승인 `mcp_client`는 등록 요청 때 지우며, IP 하나당 7일에 최대 3,360행(시간당 20회 × 168시간)까지 쌓일 수 있다. 승인 코드·토큰·연결의 만료 행은 그 회원의 다음 토큰 교환 때 지운다. 승인에 쓰인 `mcp_client` 행은 남는다 | 기능 설계 S4·S8 | 기능 설계 BR2.4·BR2.5·BR4.4 |
| NFR4.7 | 색인은 새 표의 기본 키·UNIQUE 외에 `mcp_authorization_code.member_id` 하나만 더한다(`text_material.member_id`와 같은 방식). `mcp_connection`·`mcp_access_token`은 `(member_id, mcp_client_id)` UNIQUE가 회원 조회를 덮는다. 읽는 표에는 색인을 더하지 않는다. `catch_asset`은 `(owner_id, work_identity)` UNIQUE, `catch_evidence`는 `(catch_id, source_evidence_id)` UNIQUE, `text_material`은 `member_id` 색인을 그대로 쓴다 | 마이그레이션 검토 | entities, 기능 설계 BR5.2·BR7.2, C-13·C-14 |
| NFR4.8 | 빈도 집계는 큐와 같은 Redis 하나를 쓰고 새 저장소를 두지 않는다. 키는 회원·분 창마다 하나이고 창이 끝나면 만료로 사라진다 | 기능 설계 S16 | 기능 설계 BR6.2·BR6.4, C-06 |

## 채택하지 않은 것

- 자동 확장·읽기 복제·응답 캐시: 시연 규모에서 필요하지 않고 근거가 없다.
- 전체 또는 IP 기준의 `/v1/mcp` 빈도 제한: FR13.6이 회원 기준만 두었고 Claude 요청은 모두 같은 송신 주소에서 온다.

## 알려진 한계

- 토큰 없는 `/v1/mcp` 요청과 세지 않는 `tools/list`에는 빈도 제한이 없다. 토큰 확인은 색인 조회 한 번이라 시연 규모에서는 막지 않는다.
- SDK IP 집계는 프로세스마다 따로 센다. api를 여러 개로 늘리면 한도도 그만큼 늘어난다(기능 설계 BR2.5).
