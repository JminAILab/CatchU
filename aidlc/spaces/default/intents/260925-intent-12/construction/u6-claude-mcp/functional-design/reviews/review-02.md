## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-31T11:08:46Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/rules.md > BR6.5 (같은 내용이 functional-spec.md W4 4번, S15에 있음) | 한 쪽 상한 40,000자는 「Claude 도구 결과 한도 25,000토큰을 고려한 값」이라고만 적혀 있고 글자 수를 토큰 수로 바꾼 근거가 없다. 이 서비스의 자료는 대부분 한글이고 응답은 JSON 직렬화 문자열로 재므로 한글 40,000자는 25,000토큰을 넘을 수 있다고 본다(토큰 수는 직접 측정하지 못해 추정이다). 넘으면 AC13.1.4의 응답 크기 제한이 Claude 쪽에서는 지켜지지 않고, 큰 자료를 가진 회원의 조회가 Claude 화면에서 잘리거나 실패한다. S15는 상한 안에 드는지만 보고 Claude의 토큰 한도 안에 드는지는 보지 않는다. S22도 한글로 큰 자료를 쓰라는 조건이 없다. | 상한을 한글 기준 토큰 수에 맞춰 다시 정하거나(예: 글자 수를 더 낮추기), 상한을 한글 합성 자료로 실제 Claude에서 재 보고 정한다고 S22에 적는다. 정한 값과 근거를 BR6.5에 적고, 값이 바뀔 수 있으면 상수 한 곳에 두어 고치기 쉽게 한다. | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/rules.md > BR3.7, functional-spec.md > 상태 전이(클라이언트 등록) | BR3.7은 「approvedAt을 처음 한 번 채운다. 갱신된 행이 없으면 MCP_AUTHORIZATION_INVALID」라고 쓴다. 문장 그대로 `approved_at IS NULL` 조건의 UPDATE로 구현하면, 이미 승인에 쓰인 등록으로 두 번째 승인(승인 코드가 5분 안에 안 쓰여 처음부터 다시 하는 경우, 버튼 중복 누름)을 하면 0행이 되어 정상 요청이 거부된다. 의도는 「등록 행이 없으면 거부」로 읽히지만 쓰인 문장은 둘 다 가능하다. | 「등록 행이 있으면 approvedAt은 비어 있을 때만 채우고 행이 없을 때만 거부」로 고쳐 쓰고, 이미 승인된 등록으로 다시 승인하는 시험(S6 또는 S8)을 하나 더한다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/rules.md > BR2.1, BR4.5 | SDK 1.32.2 패키지 소스를 직접 확인했다. 등록 핸들러는 `token_endpoint_auth_method`가 `none`이 아니면 `client_secret`을 만들어 `registerClient`에 넘기고 그 반환값을 그대로 201로 돌려준다. 토큰 핸들러는 `refresh_token` 요청을 `provider.exchangeRefreshToken`으로 넘기고, 그 밖의 grant_type은 `unsupported_grant_type`을 낸다. 그래서 「요청에 다른 인증 방식이 있어도 공개 클라이언트로 저장하고 `client_secret`이 없다」는 `registerClient`가 비밀값을 지우고 인증 방식을 `none`으로 바꿔 돌려줘야 지켜지고, 「refresh_token 요청은 invalid_grant」는 `exchangeRefreshToken`이 직접 그 오류를 내야 지켜진다. 설계는 이 두 접점을 쓰지 않았고 S7은 「invalid_grant 또는 OAuth 오류」라 어느 쪽이든 통과한다. | 두 규칙에 「`registerClient`가 비밀값을 지우고 `none`으로 바꿔 돌려준다」와 「`exchangeRefreshToken`은 항상 invalid_grant」를 구현 지침으로 적고, S3·S7이 비밀값이 응답에 없는지와 오류 이름을 정확히 확인하게 한다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/rules.md > BR3.5 | 돌아갈 주소는 운영에서 항상 `claude.ai` 하나이고 `clientName`은 보여 주지 않으므로, 승인 화면은 회원이 직접 시작한 연결과 다른 사람이 만든 `/authorize` 링크로 시작된 연결을 구별할 정보가 없다. 막는 장치는 「직접 시작한 연결이 아니면 취소하세요」 문구뿐이다. 코드가 회원 브라우저를 거쳐 `claude.ai` 콜백으로 가고 그 콜백이 Claude 쪽 세션과 `state`를 묶는지에 방어가 달려 있는데, 설계는 이 점을 확인할 항목에 올려 두지 않았다. | 「첫 실제 연결 때 확인」에 「다른 Claude 계정이 시작한 `state`로 이 회원의 승인 코드가 `claude.ai` 콜백에 도착했을 때 Claude가 거부하는지」를 더하거나, 문구뿐인 방어를 받아들이는 한계로 적는다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/functional-spec.md > 주요 시나리오와 확인 > S24와 그 아래 판단 문단 | 질문하신 S24는 요구사항·계약과 충돌하지 않는다. 책임(unit-of-work U6의 실제 Claude 연결 확인), AC13.2.4, NFR1을 지키는 확인이고 새 기능을 요구하지 않으며 합성 자료만 쓴다. 다만 판정 방법에 약점이 둘 있다. (1) 판정을 「5분 뒤에도 `NONE`」으로만 하면, 승인 요청이 api에 도달하지 않았거나 승인 화면에서 이동이 실패한 경우에도 `NONE`이라 「Claude가 콜백을 거부했다」와 구별되지 않는다. (2) 대조군이 명시되지 않았다. 같은 환경·같은 브라우저·같은 Claude 로그인에서 본인이 시작한 연결(S22)은 `ACTIVE`가 되어야 S24의 `NONE`이 거부의 증거가 된다. | S24 기대 결과에 「승인 요청이 api에 도달해 코드가 만들어졌고(사건 이름만 로그에 남김) 쓰이지 않았음」을 확인하는 항목을 더하고, S24는 S22가 성공한 같은 환경에서만 판정한다고 적는다. | New |
| R-06 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/functional-spec.md > S24, Assumptions & Open Questions > 가정(S24에 협조할 팀원 계정) | S24는 실제로 하기 어려운 면이 있다. 두 사람이 같은 시각에 맞춰야 하고, 팀원은 외부에서 닿는 HTTPS 개발 서버가 있어야 자기 Claude에서 연결을 시작할 수 있다. 팀원 Claude가 Free 플랜이면 URL 연결이 1개까지라 기존 연결을 빼야 하고, Team·Enterprise면 Owner가 더해야 한다(설계가 인용한 공식 문서 기준). 팀원이 연결을 시작한 뒤 Claude 쪽 인증 대기가 시간 제한으로 끝나면 주소를 보내는 동안 흐름이 사라질 수 있다. 설계는 이미 이를 새 외부 의존으로 적고 못 하면 받아들이는 한계로 적도록 했으므로 막는 문제는 아니다. | 납품 계획의 외부 의존 표에 S24용 협조자와 일정(U6 담당이 정함)을 한 줄로 더하거나, Unit 제출 때 확인 불가 사실로 적는 현재 방침을 유지한다는 결정을 승인 때 확인한다. | New |
| R-07 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/rules.md > BR4.2, functional-spec.md > 「첫 실제 연결 때 확인」 첫 항목 | 공식 문서(Build an MCP server for Claude의 OAuth 점검 목록)는 「Claude refreshes access tokens when they expire」라고 적는다. 설계는 갱신 토큰 없는 7일 수명을 승인된 결정(unit-of-work, ADR-009)으로 따르고 확인 항목에도 올려 두었으므로 설계 오류는 아니다. 다만 Claude가 갱신을 시도할 때의 동작이 정해진 규칙(`invalid_grant` 뒤 재승인 안내)과 다르면 AC13.1.2의 사용자 경험이 달라질 수 있다. | 확인 항목에 「Claude가 `invalid_grant`를 받은 뒤 재승인 화면을 보여 주는지」를 명시해 S22의 만료 재승인 시험 기준으로 쓴다. | New |

> R-01 Reviewer note: BR6.5와 「Assumptions & Open Questions」가 기준을 Claude Code의 25,000토큰이 아니라 claude.ai·Desktop의 약 150,000자로 바로잡았다. 공식 문서(Build an MCP server for Claude, 크기·시간 제한 표)를 직접 열어 claude.ai·Desktop 약 150,000자, Claude Code 25,000토큰임을 확인했다. FR13.1 범위가 웹·Desktop이라 40,000자는 한글이어도 여유가 있다. S22에 한글 합성 자료로 40,000자에 가까운 쪽을 읽는 시험이 들어갔고 실패하면 값을 낮춘다고 적었다. 상수 한 곳에 둔다는 점도 BR6.5에 있다. 남은 위험은 실제 Claude에서 보이는 동작뿐이며 S22가 맡는다.

> R-02 Reviewer note: BR3.7이 「등록 행이 있으면 approvedAt은 비어 있을 때만 채우고, 행이 없을 때만 MCP_AUTHORIZATION_INVALID」로 고쳐졌다. S6에 이미 승인에 쓰인 등록으로 다시 승인하는 시험(새 코드, approved_at 처음 값 유지)이 있고 상태 전이 절도 같은 내용이다.

> R-03 Reviewer note: BR2.1이 `registerClient`가 비밀값을 지우고 `none`으로 바꿔 돌려준다고 적었다. BR4.5가 `exchangeRefreshToken`이 항상 `invalid_grant`를 내고 그 밖의 grant_type은 `unsupported_grant_type`이라고 적었다. S3은 `client_secret` 부재와 `none`을, S7은 오류 이름을 정확히 확인한다.

> R-04 Reviewer note: 「첫 실제 연결 때 확인」에 다른 Claude 계정이 시작한 연결 항목이 들어갔고, S24와 받아들이는 한계 처리(제출 전까지 못 하면 사실을 적음)가 생겼다. S24 자체에 대한 의견은 아래 새 발견에 적었다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 공식 문서 확인(Build an MCP server for Claude, 크기·시간 제한 표) | claude.ai·Desktop 약 150,000자, Claude Code 25,000토큰 | 이전 R-01의 근거가 바로잡혔음을 확인했다. 40,000자는 웹·Desktop 기준으로 충분히 작다. |
| 상류 계약 대조(requirements FR13.6, contract-summary C-15, unit-of-work U6) | 응답 크기 값은 개발 담당 결정으로 남겨져 있고 U6 설계가 그 자리를 채운다. 도구 둘·읽기 전용·IP로 세지 않음과 모순 없음 | 계약 경계를 어기지 않는다. 인증 전 주소의 IP 제한은 BR2.5와 해석 절에 예외로 명시되어 있다. |

### Summary

이전 발견 네 건은 모두 고쳐졌고 열린 Critical·Major는 없어 READY로 판단한다. S24는 요구사항·계약과 충돌하지 않으며 실행도 가능하지만, 판정을 「`NONE`」 하나에만 두면 거부의 증거가 약하므로 코드 생성 여부와 대조군(S22)을 함께 보도록 보강하는 것을 권한다.
