## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-31T11:29:11Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/rules.md > BR6.5 (같은 내용이 functional-spec.md W4 4번, S15에 있음) | 한 쪽 상한 40,000자는 「Claude 도구 결과 한도 25,000토큰을 고려한 값」이라고만 적혀 있고 글자 수를 토큰 수로 바꾼 근거가 없다. 이 서비스의 자료는 대부분 한글이고 응답은 JSON 직렬화 문자열로 재므로 한글 40,000자는 25,000토큰을 넘을 수 있다고 본다(토큰 수는 직접 측정하지 못해 추정이다). 넘으면 AC13.1.4의 응답 크기 제한이 Claude 쪽에서는 지켜지지 않고, 큰 자료를 가진 회원의 조회가 Claude 화면에서 잘리거나 실패한다. S15는 상한 안에 드는지만 보고 Claude의 토큰 한도 안에 드는지는 보지 않는다. S22도 한글로 큰 자료를 쓰라는 조건이 없다. | 상한을 한글 기준 토큰 수에 맞춰 다시 정하거나(예: 글자 수를 더 낮추기), 상한을 한글 합성 자료로 실제 Claude에서 재 보고 정한다고 S22에 적는다. 정한 값과 근거를 BR6.5에 적고, 값이 바뀔 수 있으면 상수 한 곳에 두어 고치기 쉽게 한다. | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/rules.md > BR3.7, functional-spec.md > 상태 전이(클라이언트 등록) | BR3.7은 「approvedAt을 처음 한 번 채운다. 갱신된 행이 없으면 MCP_AUTHORIZATION_INVALID」라고 쓴다. 문장 그대로 `approved_at IS NULL` 조건의 UPDATE로 구현하면, 이미 승인에 쓰인 등록으로 두 번째 승인(승인 코드가 5분 안에 안 쓰여 처음부터 다시 하는 경우, 버튼 중복 누름)을 하면 0행이 되어 정상 요청이 거부된다. 의도는 「등록 행이 없으면 거부」로 읽히지만 쓰인 문장은 둘 다 가능하다. | 「등록 행이 있으면 approvedAt은 비어 있을 때만 채우고 행이 없을 때만 거부」로 고쳐 쓰고, 이미 승인된 등록으로 다시 승인하는 시험(S6 또는 S8)을 하나 더한다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/rules.md > BR2.1, BR4.5 | SDK 1.32.2 패키지 소스를 직접 확인했다. 등록 핸들러는 `token_endpoint_auth_method`가 `none`이 아니면 `client_secret`을 만들어 `registerClient`에 넘기고 그 반환값을 그대로 201로 돌려준다. 토큰 핸들러는 `refresh_token` 요청을 `provider.exchangeRefreshToken`으로 넘기고, 그 밖의 grant_type은 `unsupported_grant_type`을 낸다. 그래서 「요청에 다른 인증 방식이 있어도 공개 클라이언트로 저장하고 `client_secret`이 없다」는 `registerClient`가 비밀값을 지우고 인증 방식을 `none`으로 바꿔 돌려줘야 지켜지고, 「refresh_token 요청은 invalid_grant」는 `exchangeRefreshToken`이 직접 그 오류를 내야 지켜진다. 설계는 이 두 접점을 쓰지 않았고 S7은 「invalid_grant 또는 OAuth 오류」라 어느 쪽이든 통과한다. | 두 규칙에 「`registerClient`가 비밀값을 지우고 `none`으로 바꿔 돌려준다」와 「`exchangeRefreshToken`은 항상 invalid_grant」를 구현 지침으로 적고, S3·S7이 비밀값이 응답에 없는지와 오류 이름을 정확히 확인하게 한다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/rules.md > BR3.5 | 돌아갈 주소는 운영에서 항상 `claude.ai` 하나이고 `clientName`은 보여 주지 않으므로, 승인 화면은 회원이 직접 시작한 연결과 다른 사람이 만든 `/authorize` 링크로 시작된 연결을 구별할 정보가 없다. 막는 장치는 「직접 시작한 연결이 아니면 취소하세요」 문구뿐이다. 코드가 회원 브라우저를 거쳐 `claude.ai` 콜백으로 가고 그 콜백이 Claude 쪽 세션과 `state`를 묶는지에 방어가 달려 있는데, 설계는 이 점을 확인할 항목에 올려 두지 않았다. | 「첫 실제 연결 때 확인」에 「다른 Claude 계정이 시작한 `state`로 이 회원의 승인 코드가 `claude.ai` 콜백에 도착했을 때 Claude가 거부하는지」를 더하거나, 문구뿐인 방어를 받아들이는 한계로 적는다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/functional-spec.md > 주요 시나리오와 확인 > S24와 그 아래 판단 문단 | 질문하신 S24는 요구사항·계약과 충돌하지 않는다. 책임(unit-of-work U6의 실제 Claude 연결 확인), AC13.2.4, NFR1을 지키는 확인이고 새 기능을 요구하지 않으며 합성 자료만 쓴다. 다만 판정 방법에 약점이 둘 있다. (1) 판정을 「5분 뒤에도 `NONE`」으로만 하면, 승인 요청이 api에 도달하지 않았거나 승인 화면에서 이동이 실패한 경우에도 `NONE`이라 「Claude가 콜백을 거부했다」와 구별되지 않는다. (2) 대조군이 명시되지 않았다. 같은 환경·같은 브라우저·같은 Claude 로그인에서 본인이 시작한 연결(S22)은 `ACTIVE`가 되어야 S24의 `NONE`이 거부의 증거가 된다. | S24 기대 결과에 「승인 요청이 api에 도달해 코드가 만들어졌고(사건 이름만 로그에 남김) 쓰이지 않았음」을 확인하는 항목을 더하고, S24는 S22가 성공한 같은 환경에서만 판정한다고 적는다. | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/functional-spec.md > S24, Assumptions & Open Questions > 가정(S24에 협조할 팀원 계정) | S24는 실제로 하기 어려운 면이 있다. 두 사람이 같은 시각에 맞춰야 하고, 팀원은 외부에서 닿는 HTTPS 개발 서버가 있어야 자기 Claude에서 연결을 시작할 수 있다. 팀원 Claude가 Free 플랜이면 URL 연결이 1개까지라 기존 연결을 빼야 하고, Team·Enterprise면 Owner가 더해야 한다(설계가 인용한 공식 문서 기준). 팀원이 연결을 시작한 뒤 Claude 쪽 인증 대기가 시간 제한으로 끝나면 주소를 보내는 동안 흐름이 사라질 수 있다. 설계는 이미 이를 새 외부 의존으로 적고 못 하면 받아들이는 한계로 적도록 했으므로 막는 문제는 아니다. | 납품 계획의 외부 의존 표에 S24용 협조자와 일정(U6 담당이 정함)을 한 줄로 더하거나, Unit 제출 때 확인 불가 사실로 적는 현재 방침을 유지한다는 결정을 승인 때 확인한다. | Unresolved |
| R-07 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/rules.md > BR4.2, functional-spec.md > 「첫 실제 연결 때 확인」 첫 항목 | 공식 문서(Build an MCP server for Claude의 OAuth 점검 목록)는 「Claude refreshes access tokens when they expire」라고 적는다. 설계는 갱신 토큰 없는 7일 수명을 승인된 결정(unit-of-work, ADR-009)으로 따르고 확인 항목에도 올려 두었으므로 설계 오류는 아니다. 다만 Claude가 갱신을 시도할 때의 동작이 정해진 규칙(`invalid_grant` 뒤 재승인 안내)과 다르면 AC13.1.2의 사용자 경험이 달라질 수 있다. | 확인 항목에 「Claude가 `invalid_grant`를 받은 뒤 재승인 화면을 보여 주는지」를 명시해 S22의 만료 재승인 시험 기준으로 쓴다. | Unresolved |

> R-05 Reviewer note: functional-spec.md S24 아래 판단 문단을 직접 다시 읽었다. 대조군이 들어갔다. S22가 성공한 같은 환경, 같은 브라우저, 같은 Claude 로그인에서 하고 시작 때 시험 회원 상태가 `NONE`이어야 하며(S22 뒤라면 전체 해제 뒤) 그래서 `NONE`이 거부를 뜻한다고 적었다. 약점 (1)도 줄었다. 기대 결과가 브라우저의 `claude.ai` 콜백 이동을 코드가 만들어진 증거로 삼고, 이동하지 못했으면 판단하지 않고 다시 한다고 적었다. 콜백 이동 뒤 5분이 지나도 `NONE`이면 막힌 것이라는 기준(BR4.1)도 맞다. 처음 권한 「사건 이름만 로그에 남기는 확인 항목」은 그대로 넣지 않았지만 같은 목적을 이동 여부로 채웠고, 코드가 쓰이지 않았다는 증거는 `NONE`이 맡는다. 남은 차이는 사소하다.

> R-06 Reviewer note: 문서를 바꾸지 않기로 한 결정대로 그대로다. 「Assumptions & Open Questions」에 S24 협조자가 새 의존이라는 가정과 Free 1개·Team Owner 조건이 적혀 있고, 「첫 실제 연결 때 확인」 마지막 항목이 Unit 제출 전까지 못 하면 확인하지 못했다는 사실과 함께 받아들이는 한계로 적는다고 한다. 납품 계획 외부 의존 표에 협조자 한 줄은 없다. 막는 문제는 아니다.

> R-07 Reviewer note: 문서를 바꾸지 않기로 한 결정대로 그대로다. rules.md BR4.2·BR4.5와 functional-spec.md 「첫 실제 연결 때 확인」 첫 항목은 갱신 토큰 없이 만료될 때 Claude의 표시를 확인하라고만 적고, 만료 뒤 Claude가 `invalid_grant`를 받고 재승인 화면을 보여 주는지는 명시하지 않는다. S22의 「수명을 줄인 만료 재승인」 시험이 실질적으로 이를 다루므로 막는 문제는 아니다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 해당 없음 | 이번 재확인은 열린 발견 세 건의 문서 대조만 했고 검증 도구는 돌리지 않았다 | 구조 검증 결과를 주장하지 않는다 |

### Summary

사용자가 고치기로 한 R-05는 S24의 대조군과 코드 생성 증거가 보강되어 고쳐졌다. 문서를 바꾸지 않기로 한 R-06과 R-07은 그대로 Minor로 남아 있고 새 발견은 없으므로 열린 Critical·Major 없이 READY로 판단한다.
