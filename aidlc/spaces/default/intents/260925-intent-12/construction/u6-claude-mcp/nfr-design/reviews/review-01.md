## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-31T16:24:29Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/nfr-design/logical-components.md > 실패 범위(등록 IP 한도) | 막히는 범위를 등록 한도(시간당 20회)만 적었다. SDK의 `/token`은 IP당 15분 50회(`token.js:62-63`), `/authorize`는 15분 100회가 기본이다. 운영에서 Claude의 송신 주소가 소수라면 `/token`도 모든 회원이 같은 한도를 나눠 쓴다. 신뢰 프록시를 못 맞추면 `/authorize`의 브라우저도 앞단 주소 하나로 묶인다. 시연 규모에서는 문제가 없을 가능성이 높지만 설계에는 빠져 있다 | 이 두 한도가 공유됨을 한 줄로 적고, S22에서 한도에 닿는지 본다. 코드는 바꾸지 않는다 | New |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/nfr-design/security-design.md > SDK와 U6이 나눠 맡는 일(메타데이터) | 임시 앱 출력에 인증 서버 메타데이터가 `grant_types_supported: ["authorization_code","refresh_token"]`로 나온다. U6은 갱신 토큰을 내지 않고 `exchangeRefreshToken`은 언제나 거부한다. 광고와 동작이 다르다는 설명이 없다. 토큰 응답에 갱신 토큰이 없으므로 Claude가 갱신을 시도할 가능성은 낮고, 만료 시 재승인으로 이어지는 흐름은 설계가 의도한 대로다 | 이 불일치를 알고 받아들인다고 적고, S22의 만료 재승인 확인에서 Claude가 갱신 요청 없이 재승인으로 가는지 본다 | New |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/nfr-design/security-design.md > NFR1.5 행·NFR1.9 행 | 두 가지 근거가 정확하지 않다. (1) 「SDK는 https가 아닌 발급자 주소를 기동 때 거부한다」는 환경변수 `MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL`이 1이나 true이면 풀린다(`router.js:15-26`). 운영에 이 변수가 있는지 보는 기동 확인이 없다. (2) SDK의 `/authorize`는 loopback 주소의 포트를 무시하고 비교한다(`authorize.js` `redirectUriMatches`). 그래서 SDK 단계만 보면 「정확히 일치」가 아니다. 운영 허용 목록에는 loopback이 없고 승인 요청 API가 다시 정확히 비교하므로 실제 노출은 없다 | `readMcpConfig`가 운영 모드에서 그 환경변수가 설정되어 있으면 설정 이름만 넣은 오류로 멈추게 하거나 그 한계를 적는다. 「정확히 일치」는 승인 요청 API와 토큰 교환에서 지켜진다고 정정해 적고, 포트가 다른 loopback 주소를 개발 설정에서 시험한다 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 임시 앱 재실행(`spike.cjs`) | 완료. 메타데이터, 등록, `/authorize` 302와 `no-store`, `/token` 폼·JSON, `/revoke` 404, 없는 경로 JSON 404, 전역 Guard 401이 산출물의 서술과 같다 | 임시 앱으로 확인했다는 주장은 대체로 맞다. 가짜 저장 단계라 실제 DB·Claude 동작의 증거는 아니고 산출물도 그렇게 적었다 |
| SDK 1.32.2 소스 대조(`bearerAuth.js`, `router.js`, `authorize.js`, `token.js`, `register.js`) | 인용한 줄과 문구가 맞다. 만료·`no expiration`·`resource_metadata` 조건·500 변환이 서술대로다 | 토큰 확인 함수의 만료 선거부와 `resourceMetadataUrl` 항상 지정 설계는 근거가 있다 |
| Nest `init()` 순서(`nest-application.js:103-127`) | 파서 등록, 라우터 등록, `onModuleInit`, 404 처리 등록 순이다 | SDK 라우터가 Nest 경로 뒤, Nest 404 처리 앞에 걸린다. 루트 경로가 `/v1` 밖이라 충돌이 없고 결론은 맞다. 다만 서술은 「Nest 기본 처리보다 앞」이다 |
| 코드 대조(`no-store.interceptor.ts`, `validation.pipe.ts`, `session-http.ts`, `ai-run.ts`, `withdrawal.service.ts`, `text-material.entity.ts`, `catch-reader.ts`) | 인용한 이름과 칸이 있다. `forbidNonWhitelisted`, `assertSessionOrigin`, 탈퇴가 부르는 `mcp_*` 표 이름과 `member_id`가 맞다 | 교차 참조가 해소된다 |
| 요구사항 ID 대조(`traceability.json`) | NFR1.1~NFR6.5의 33개가 모두 있고 빠진 것이 없다 | 추적 완전 |
| Claude 문서 대조(lazy-authentication, 401 조건) | 401과 `WWW-Authenticate`의 `resource_metadata`가 신호이고 본문은 참고용이라는 서술이 맞다. 모든 호출을 401로 막는 설계는 문서가 허용하는 방식이다 | 설계와 어긋나지 않는다 |

### Summary

실제로 깨지는 곳이나 요구사항·계약과 어긋나는 곳은 찾지 못했다. 토큰 확인·401·`Origin`·`no-store`의 순서와 SDK 인용은 임시 앱 재실행과 소스 대조로 맞았고, 남은 것은 Minor 3건(공유 한도 언급 누락, 메타데이터의 갱신 광고, SDK의 https·loopback 예외 서술)이다.
