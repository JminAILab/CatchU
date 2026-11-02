# Claude 연결 화면 — 12월 intent U6

Claude가 보낸 승인 화면(`/profile/claude/authorize`)과 회원의 연결 관리 화면(`/profile/claude`). 기준: U6 [기능 명세](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/functional-spec.md) W2·W6·S21, [업무 규칙](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u6-claude-mcp/functional-design/rules.md) BR3·BR7, api [Claude 연결 안내](../../../../api/docs/claude-mcp.md).

| 파일 | 하는 일 |
|---|---|
| `claude-connection.ts` | 문구, 쿼리 읽기, 상태 조회·승인·취소·복사·해제의 요청과 결과 판정. 화면 없는 함수 |
| `use-connection-lookup.ts` | 두 화면이 함께 쓰는 연결 상태 조회. 세션·재조회별로 읽고 이전 세션의 응답은 쓰지 않는다 |
| `claude-authorize-view.tsx` | 승인 화면 표시(상태 없음) |
| `claude-authorize-screen.tsx` | 승인 화면의 쿼리 읽기, 요청과 그 뒤 이동 |
| `claude-connection-view.tsx` | 연결 관리 표시(상태 없음) |
| `claude-connection-panel.tsx` | 연결 관리의 복사, 해제 요청과 그 뒤 처리 |
| `claude-connection.module.css` | 두 화면의 스타일 |

승인 화면:

- 쿼리는 브라우저에서 `window.location.search`로만 읽는다. 필수 값이 없거나 돌아갈 주소가 http(s)가 아니면 요청 없이 오류를 보인다. 그 주소를 믿을지는 api가 다시 확인한다.
- 상태가 `NONE`이면 동의 안내를, 그 밖이면 재승인 안내를 돌아갈 주소의 호스트와 함께 보이고, 둘 다 "직접 시작한 연결이 아니면 취소하세요"를 보인다. Claude가 스스로 적은 `clientName`은 쓰지 않는다. 값은 React 텍스트로만 그린다.
- 상태 조회가 실패하면 동의 여부를 모르는 채 안내를 고르지 않는다. 조회 실패 안내와 [다시 불러오기]만 보이고 승인·취소 버튼을 두지 않는다.
- 승인·취소는 회원 토큰으로 `fetch`하고 응답의 `redirectTo`가 http(s) 주소일 때만 `window.location.assign`으로 이동한다. 쿼리의 주소로 직접 이동하지 않는다. 동의 안내를 보였을 때만 `consent: true`를 보낸다.
- `MCP_CONSENT_REQUIRED`면 동의 안내로 바꾸고 회원이 다시 누르게 한다. 그 밖의 실패는 안내만 보이고 어디로도 이동하지 않으며 자동으로 다시 보내지 않는다. 이동하면 버튼을 막아 둔 채 끝낸다.

연결 관리 화면:

- 복사 주소는 api의 `mcpUrl` 그대로이고 web이 만들지 않는다. 복사 실패도 표시한다.
- [전체 연결 해제] → 확인창 → `DELETE /v1/me/mcp-connection`. 204만 성공이고 성공하면 상태를 다시 읽는다. 실패와 결과 불명은 각각 다른 안내를 보이고 다시 보내지 않는다.
- 해제 버튼은 상태와 상관없이 둔다. `NONE`이어도 승인만 하고 교환하지 않은 코드를 지울 수 있고 반복해도 204다.
- 조회 중과 조회 실패를 `NONE`으로 보이지 않는다.

주소는 `/profile/claude*`이므로 기존 회원 가드가 로그인 뒤 같은 쿼리로 돌려보낸다. 헤더는 web 전체의 보안 헤더를 그대로 쓴다.
