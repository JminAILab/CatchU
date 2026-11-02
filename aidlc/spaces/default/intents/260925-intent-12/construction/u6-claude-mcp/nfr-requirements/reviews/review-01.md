## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-31T14:43:13Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/nfr-requirements/security-requirements.md > NFR1.1 와 tech-stack-decisions.md > Assumptions & Open Questions 마지막 항목 | NFR1.1은 토큰 실패를 모두 401로 하고 이유를 구분해 알리지 않는다고 정했다. 그런데 SDK 1.32.2의 `requireBearerAuth`(`middleware/bearerAuth.js` 60~90행)는 `InvalidTokenError`의 `errorCode`와 메시지를 `WWW-Authenticate` 헤더와 본문에 그대로 싣는다. 토큰 확인 함수가 "만료"와 "없음" 등 다른 메시지로 던지면 이유가 새어 나간다. 이 라우터를 어떻게 붙일지는 NFR Design으로 미뤄져 있어, 지금 요구사항만으로는 NFR1.1의 시험(이유 구분 없음)이 어떤 응답을 기대하는지 정해져 있지 않다. | NFR1.1의 확인 칸에 "만료·없음·해제·탈퇴 토큰의 401 응답 헤더와 본문이 같다"는 시험을 적고, 토큰 확인 함수가 던지는 오류 메시지를 한 가지로 고정한다고 명시한다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/nfr-requirements/performance-requirements.md > NFR4.2 와 tech-stack-decisions.md > 선택 표 「요청 본문 상한」 | 토큰 없는 `/v1/mcp` 요청의 본문 상한이 정해지지 않았다. Nest 파서면 100KB, SDK 전송 객체가 직접 읽으면 4MiB·묶음 100개다. 두 경로의 상한이 40배 차이 나는데 NFR Design으로만 넘겨 두었고, 인증 전에 본문을 읽는지(Origin 확인 → 토큰 확인 → 본문 읽기 순서)는 어느 요구사항에도 없다. NFR1.6은 Origin을 토큰 확인 앞에 두라고만 한다. | NFR1.1 또는 NFR1.6에 "본문은 토큰 확인 뒤에 읽는다"를 한 줄 추가하거나, 읽는 상한 값을 이 단계에서 하나로 정한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 단계 정의의 검증 도구 | 이 검토에서 실행하지 않음. 산출물 쪽 대조로 대신함 | 아래 대조 결과 참고 |
| SDK 1.32.2 대조 | `register.js` 시간당 20회, `token.js` 15분 50회, `authorize.js` 15분 100회, `bearerAuth.js`가 처음 보는 오류를 로그 없이 500으로 바꿈 | NFR4.6, NFR4.10과 일치함 |
| 저장소 대조 | `assertSessionOrigin`은 `ai-consent`·`session`·`withdrawal` 컨트롤러에만 있고 나머지 쓰기 경로에는 없음. `trust-proxy.ts`는 `TRUST_PROXY_CIDRS`가 없으면 `trust proxy`를 끔 | NFR1.7의 근거 서술과 기능 설계의 IP 한도 서술이 사실과 맞음 |

### Summary

보안·성능·규모·신뢰성·관측 요구사항은 서로 참조가 맞고, SDK와 저장소 코드에 대한 주장도 직접 대조해 모두 사실이었다. 토큰 실패 응답의 이유 비노출과 인증 전 본문 상한이라는 작은 빈틈 둘만 요구사항에 한 줄씩 보태면 구현자가 추측할 일이 없어 READY로 판단한다.
