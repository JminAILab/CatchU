## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-31T16:55:12Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/nfr-design/logical-components.md > 실패 범위(등록 IP 한도) | 막히는 범위를 등록 한도(시간당 20회)만 적었다. SDK의 `/token`은 IP당 15분 50회(`token.js:62-63`), `/authorize`는 15분 100회가 기본이다. 운영에서 Claude의 송신 주소가 소수라면 `/token`도 모든 회원이 같은 한도를 나눠 쓴다. 신뢰 프록시를 못 맞추면 `/authorize`의 브라우저도 앞단 주소 하나로 묶인다. 시연 규모에서는 문제가 없을 가능성이 높지만 설계에는 빠져 있다 | 이 두 한도가 공유됨을 한 줄로 적고, S22에서 한도에 닿는지 본다. 코드는 바꾸지 않는다 | Rejected: R-01·R-02는 승인된 BR2.5와 functional-spec.md 「첫 실제 연결 때 확인」에 이미 있으므로 문서를 고치지 않는다. |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/nfr-design/security-design.md > SDK와 U6이 나눠 맡는 일(메타데이터) | 임시 앱 출력에 인증 서버 메타데이터가 `grant_types_supported: ["authorization_code","refresh_token"]`로 나온다. U6은 갱신 토큰을 내지 않고 `exchangeRefreshToken`은 언제나 거부한다. 광고와 동작이 다르다는 설명이 없다. 토큰 응답에 갱신 토큰이 없으므로 Claude가 갱신을 시도할 가능성은 낮고, 만료 시 재승인으로 이어지는 흐름은 설계가 의도한 대로다 | 이 불일치를 알고 받아들인다고 적고, S22의 만료 재승인 확인에서 Claude가 갱신 요청 없이 재승인으로 가는지 본다 | Rejected: R-01·R-02는 승인된 BR2.5와 functional-spec.md 「첫 실제 연결 때 확인」에 이미 있으므로 문서를 고치지 않는다. |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/nfr-design/security-design.md > NFR1.5 행·NFR1.9 행 | 두 가지 근거가 정확하지 않다. (1) 「SDK는 https가 아닌 발급자 주소를 기동 때 거부한다」는 환경변수 `MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL`이 1이나 true이면 풀린다(`router.js:15-26`). 운영에 이 변수가 있는지 보는 기동 확인이 없다. (2) SDK의 `/authorize`는 loopback 주소의 포트를 무시하고 비교한다(`authorize.js` `redirectUriMatches`). 그래서 SDK 단계만 보면 「정확히 일치」가 아니다. 운영 허용 목록에는 loopback이 없고 승인 요청 API가 다시 정확히 비교하므로 실제 노출은 없다 | `readMcpConfig`가 운영 모드에서 그 환경변수가 설정되어 있으면 설정 이름만 넣은 오류로 멈추게 하거나 그 한계를 적는다. 「정확히 일치」는 승인 요청 API와 토큰 교환에서 지켜진다고 정정해 적고, 포트가 다른 loopback 주소를 개발 설정에서 시험한다 | Resolved (reviewer) |

> R-03 Reviewer note: NFR1.9 행이 SDK의 https 거부에 `MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL` 예외가 있다고 적었다. `router.js:17`(변수 판독)과 `:22-26`(거부)에 맞다. 운영에서 http가 될 길이 없다는 근거도 맞다. `session.config.ts:12-20`은 운영에서 https가 아니면 기동을 멈추고, 기능 명세 「공개 주소 판정」은 운영에서 `AUTH_WEB_ORIGIN`만 쓰며 `MCP_DEV_PUBLIC_ORIGIN`이 있으면 기동 실패라고 정한다. 기동 확인을 더하지 않는다는 판단은 사실과 맞는다. 「돌아갈 주소의 「정확히 일치」」 문단은 `authorize.js:47-66`의 loopback 포트 무시와 일치한다. 포트와 정확 비교를 U6의 등록·승인 요청 API·코드 교환(BR2.2, BR3.2, BR4.3)이 맡는다는 설명도 맞다. 포트가 다른 loopback 주소의 시험은 S5로 넘겼다. 이는 코드 생성 단계에서 확인할 일이다

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| SDK 1.32.2 `router.js` 직접 대조 | 일치 | 환경변수 예외(`:17`)와 https·loopback 거부(`:22-26`)를 글과 맞춰 봤다. 허용 호스트는 `localhost`·`127.0.0.1`뿐이다 |
| SDK 1.32.2 `authorize.js` 직접 대조 | 일치 | `redirectUriMatches`가 양쪽이 loopback일 때 포트만 무시한다. 스킴·호스트·경로·쿼리는 정확히 비교한다 |
| `api/src/auth/session.config.ts` 대조 | 일치 | 운영은 https 출처가 아니면 throw한다 |
| `functional-spec.md` 「공개 주소 판정」 대조 | 일치 | 운영 공개 주소는 `AUTH_WEB_ORIGIN`뿐이다 |

### Summary

수정한 NFR1.9 행과 「정확히 일치」 문단은 SDK 소스와 api 코드, 기능 명세에 맞아 R-03은 해결되었다. 새로 찾은 막히는 문제나 사실과 다른 주장은 없다.
