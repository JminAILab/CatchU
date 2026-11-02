## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-31T09:38:04Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/rules.md > BR6.5 (같은 내용이 functional-spec.md W4 4번, S15에 있음) | 한 쪽 상한 40,000자는 「Claude 도구 결과 한도 25,000토큰을 고려한 값」이라고만 적혀 있고 글자 수를 토큰 수로 바꾼 근거가 없다. 이 서비스의 자료는 대부분 한글이고 응답은 JSON 직렬화 문자열로 재므로 한글 40,000자는 25,000토큰을 넘을 수 있다고 본다(토큰 수는 직접 측정하지 못해 추정이다). 넘으면 AC13.1.4의 응답 크기 제한이 Claude 쪽에서는 지켜지지 않고, 큰 자료를 가진 회원의 조회가 Claude 화면에서 잘리거나 실패한다. S15는 상한 안에 드는지만 보고 Claude의 토큰 한도 안에 드는지는 보지 않는다. S22도 한글로 큰 자료를 쓰라는 조건이 없다. | 상한을 한글 기준 토큰 수에 맞춰 다시 정하거나(예: 글자 수를 더 낮추기), 상한을 한글 합성 자료로 실제 Claude에서 재 보고 정한다고 S22에 적는다. 정한 값과 근거를 BR6.5에 적고, 값이 바뀔 수 있으면 상수 한 곳에 두어 고치기 쉽게 한다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/rules.md > BR3.7, functional-spec.md > 상태 전이(클라이언트 등록) | BR3.7은 「approvedAt을 처음 한 번 채운다. 갱신된 행이 없으면 MCP_AUTHORIZATION_INVALID」라고 쓴다. 문장 그대로 `approved_at IS NULL` 조건의 UPDATE로 구현하면, 이미 승인에 쓰인 등록으로 두 번째 승인(승인 코드가 5분 안에 안 쓰여 처음부터 다시 하는 경우, 버튼 중복 누름)을 하면 0행이 되어 정상 요청이 거부된다. 의도는 「등록 행이 없으면 거부」로 읽히지만 쓰인 문장은 둘 다 가능하다. | 「등록 행이 있으면 approvedAt은 비어 있을 때만 채우고 행이 없을 때만 거부」로 고쳐 쓰고, 이미 승인된 등록으로 다시 승인하는 시험(S6 또는 S8)을 하나 더한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/rules.md > BR2.1, BR4.5 | SDK 1.32.2 패키지 소스를 직접 확인했다. 등록 핸들러는 `token_endpoint_auth_method`가 `none`이 아니면 `client_secret`을 만들어 `registerClient`에 넘기고 그 반환값을 그대로 201로 돌려준다. 토큰 핸들러는 `refresh_token` 요청을 `provider.exchangeRefreshToken`으로 넘기고, 그 밖의 grant_type은 `unsupported_grant_type`을 낸다. 그래서 「요청에 다른 인증 방식이 있어도 공개 클라이언트로 저장하고 `client_secret`이 없다」는 `registerClient`가 비밀값을 지우고 인증 방식을 `none`으로 바꿔 돌려줘야 지켜지고, 「refresh_token 요청은 invalid_grant」는 `exchangeRefreshToken`이 직접 그 오류를 내야 지켜진다. 설계는 이 두 접점을 쓰지 않았고 S7은 「invalid_grant 또는 OAuth 오류」라 어느 쪽이든 통과한다. | 두 규칙에 「`registerClient`가 비밀값을 지우고 `none`으로 바꿔 돌려준다」와 「`exchangeRefreshToken`은 항상 invalid_grant」를 구현 지침으로 적고, S3·S7이 비밀값이 응답에 없는지와 오류 이름을 정확히 확인하게 한다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/rules.md > BR3.5 | 돌아갈 주소는 운영에서 항상 `claude.ai` 하나이고 `clientName`은 보여 주지 않으므로, 승인 화면은 회원이 직접 시작한 연결과 다른 사람이 만든 `/authorize` 링크로 시작된 연결을 구별할 정보가 없다. 막는 장치는 「직접 시작한 연결이 아니면 취소하세요」 문구뿐이다. 코드가 회원 브라우저를 거쳐 `claude.ai` 콜백으로 가고 그 콜백이 Claude 쪽 세션과 `state`를 묶는지에 방어가 달려 있는데, 설계는 이 점을 확인할 항목에 올려 두지 않았다. | 「첫 실제 연결 때 확인」에 「다른 Claude 계정이 시작한 `state`로 이 회원의 승인 코드가 `claude.ai` 콜백에 도착했을 때 Claude가 거부하는지」를 더하거나, 문구뿐인 방어를 받아들이는 한계로 적는다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| SDK 소스 확인(`@modelcontextprotocol/sdk` 1.32.2 패키지) | 확인함. 승인 핸들러는 PKCE를 S256만 받고 `resource`를 선택 입력으로 받는다. 토큰 핸들러는 PKCE를 `challengeForAuthorizationCode`로 먼저 읽고, 틀리면 코드를 소비하기 전에 거부한다. 등록 20회/시간, 토큰 50회/15분, 승인 100회/15분 기본 한도는 설계와 같다. 해지 주소는 `provider.revokeToken`이 있어야 생겨 BR1.1의 「`/revoke` 없음」이 성립한다. | 설계의 SDK 가정과 대체로 맞는다. 어긋나는 부분은 위 Minor 행이다. |
| 저장소 대조 | `api/src/withdrawal/withdrawal.service.ts`가 `mcp_access_token`, `mcp_authorization_code`, `mcp_connection`을 `member_id`로 지우는 것을 확인했다. `catch_asset`에 `title`(null 허용), `author_description`, `visibility`, `mismatch`, `draft_content`가 있고 `catch_evidence.source_url`이 있다. api는 `@nestjs/platform-express`와 `ioredis`를 쓰고 `TRUST_PROXY_CIDRS` 처리가 있다. web은 CSP `frame-ancestors 'none'`을 이미 건다. | 엔티티 이름, 읽는 칸, 승인 화면의 프레임 삽입 방어 가정이 모두 실제와 맞는다. |
| 정적 검증 도구 | 이 단계에는 정의된 검증 도구가 없어 실행하지 않았다. | 해당 없음. |

### Summary

계약 C-06·C-13~C-15, 탈퇴 코드, 읽는 표 칸과의 대조에서 깨진 참조나 순환은 찾지 못했고, 해제와 토큰 교환이 겹치는 경우의 잠금 순서도 맞게 설계되어 있다. 이 설계로 개발자가 구현할 수 있다고 본다. 승인 전에 따져 볼 것은 한글 자료에서 40,000자 상한이 Claude의 25,000토큰 한도를 넘을 수 있다는 점 하나이고, 나머지는 문장 보완 수준이다.
