# U6 Claude MCP 본인 연결 — 규모 설계

## Sources

작성일: 2026-11-01. 입력: [규모 요구사항](../nfr-requirements/scalability-requirements.md)(scalability-requirements)의 NFR4.5~NFR4.8과 「알려진 한계」, [성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[관측](../nfr-requirements/observability-requirements.md)(observability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U6 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 W1·W3·W4와 S4·S8·S13·S16, [엔티티](../functional-design/entities.md)와 [업무 규칙](../functional-design/rules.md)의 BR2.4·BR2.5·BR4.4·BR5.6·BR6.2·BR6.4, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-06·C-15, [비기능 설계 질문·답변](nfr-design-questions.md)의 요약 확인, `deploy/aws/k8s/api.yaml`.

## 범위

12월 이용자는 소수이고 NFR4는 규모 기준을 시연 규모로 둔다. U6은 확장 장치를 새로 두지 않고, 요청 사이에 서버 상태를 두지 않는 구조와 저절로 쌓이는 행을 정리하는 자리만 적는다.

## 설계

| 요구사항 | 설계 |
|---|---|
| NFR4.5 한 프로세스, 세션 없음 | 요청마다 `McpServer`와 전송 객체를 만들고(`sessionIdGenerator: undefined`, `enableJsonResponse: true`) 응답이 끝나면 닫는다. 프로세스에 남는 U6 상태는 SDK의 IP 집계(메모리)와 Redis 연결 하나뿐이다. 응답에 `Mcp-Session-Id`가 없는 것을 임시 앱으로 확인했고 S13이 본다 |
| NFR4.6 쌓이는 행 | 타이머가 없다. `registerClient`가 새 등록과 함께 `DELETE FROM mcp_client WHERE approved_at IS NULL AND registered_at < now() - interval '7 days'`를 부른다. `exchangeAuthorizationCode` 트랜잭션이 그 회원의 만료된 토큰·연결·코드를 지운다(BR4.4). 다른 회원의 행은 건드리지 않는다(S4·S8) |
| NFR4.7 색인 | U6 마이그레이션은 표의 기본 키·UNIQUE와 `mcp_authorization_code.member_id` 색인 하나만 만든다. 읽는 표(`catch_asset`, `catch_evidence`, `text_material`)에는 색인을 더하지 않는다. `text_material`은 회원 행을 색인으로 찾은 뒤 DB가 정렬하며, 회원 한 명의 자료 수는 시연 규모다 |
| NFR4.8 빈도 키 | 키는 `{prefix}:mcp-rate:{memberId}:{floor(now / 60000)}` 하나다. 큐의 `prefix`를 그대로 써서 큐 키와 겹치지 않는 이름 아래에 둔다. 만료 120초로 사라져 Redis에 쌓이지 않는다. 만료는 창 1분보다 길면 되고, 키에 분 창이 들어 있어 앞 창의 횟수와 합쳐지지 않는다 |

## 상태와 확장

- 토큰·연결·코드·등록은 모두 PostgreSQL에 있고 도구 호출은 요청마다 독립이다. api를 다시 띄워도 연결이 끊기지 않는다(reliability-design).
- api를 여러 개로 늘려도 회원 빈도 집계는 Redis에 있어 맞다. SDK IP 집계만 프로세스마다 따로 세어 한도가 그만큼 늘어난다(BR2.5). 지금은 한 프로세스이므로 맞출 것이 없다(`deploy/aws/k8s/api.yaml`).
- U6이 새로 쓰는 DB 연결은 없다. 기존 TypeORM 연결 묶음을 함께 쓴다. 트랜잭션은 승인·토큰 교환·전체 해제 셋뿐이고 그 안에 외부 호출이 없다.

## 가정이 깨질 때

- 가정: 회원 한 명의 텍스트 자료와 Catch는 쪽 몇 개 분량이다. 자료가 많아져 정렬이 눈에 띄게 느려지면 `text_material (member_id, created_at, text_material_id)` 색인을 그때 U4와 정한다. 새 수치 기준은 두지 않는다(NFR4).
- 가정: 미승인 등록은 IP 하나당 7일에 최대 3,360행(NFR4.6)이다. Claude 송신 주소를 함께 쓰므로 실제로는 전체 상한에 가깝고, `mcp_client`가 이 정도 행이어도 기본 키 조회와 정리 문장에 문제가 없다.

## 두지 않는 것

자동 확장, 읽기 복제본, 응답 캐시, 샤딩, 전체 또는 IP 기준의 `/v1/mcp` 빈도 제한, 처리량 목표는 두지 않는다(scalability-requirements 「채택하지 않은 것」).
