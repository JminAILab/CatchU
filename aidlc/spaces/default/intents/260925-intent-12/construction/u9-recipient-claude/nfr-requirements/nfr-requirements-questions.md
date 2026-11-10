# U9 받은 사람의 Claude 연결 — 비기능 요구사항 질문

입력:
- [U9 기능 명세](../functional-design/functional-spec.md)·[업무 규칙](../functional-design/rules.md)
- [요구사항](../../../inception/requirements-analysis/requirements.md)의 NFR1~NFR7·FR13.3·FR19.1
- [계약 요약](../../../inception/contract-design/contract-summary.md)의 C-07·C-10·C-11·C-15
- [U6 비기능 요구사항 질문](../../u6-claude-mcp/nfr-requirements/nfr-requirements-questions.md)의 요약 확인
- [보안 점검](../../../../../../../docs/CatchU_security_checks.md)
- 코드: `api/src/claude-mcp/mcp-tools.ts`, `api/src/claude-mcp/mcp-log.ts`

## 이미 정해져 묻지 않는 것

- **성능:**
  - 한 쪽 응답은 직렬화 길이 40,000자 이하다. 쪽을 채울 때 nextCursor 자리는 1,024자로 잡는다.
  - 입력 상한은 cursor 1,024자, link 2,048자다.
  - 쪽마다 사본 전체를 다시 읽고 펴며, 그 비용은 받아들인다(BR3.5, BR4.1, BR4.2).
  - 처리 시간·가동률·복구 수치는 새로 만들지 않는다(NFR4).
- **보안:**
  - 쪽마다 C-10 판정을 grant 없이 한다. 비밀번호 링크는 웹에서 열라고 안내한다. 응답은 웹과 같은 범위이고 aiDraft와 내부 ID를 뺀다.
  - 모든 쪽 첫 칸에 `notice`를 두고, 도구 설명에 고지 셋을 둔다. 남는 위험은 받아들인다(BR5.4).
  - 입력은 엄격한 모양으로만 받는다.
  - 로그·오류에 토큰·링크·글·cursor를 싣지 않는다.
  - U6의 접근 토큰 확인과 `/v1/mcp`의 `Origin` 확인을 그대로 쓴다.
- **규모:** 시연 규모다. 빈도 제한은 회원당 분당 60회를 세 도구가 함께 센다(BR5.1).
- **신뢰성:**
  - DB 실패와 작성자 회원 행 없음은 `INTERNAL_ERROR`다. 다시 시도하지 않는다.
  - Redis가 없거나 오류이면 U6처럼 통과시킨다.
  - 판정을 통과한 호출은 그 뒤의 중지·만료로 취소하지 않는다(BR2.5).
- **기술:** 새 의존성은 없다. U6의 `@modelcontextprotocol/sdk` 1.32.2와 `zod` 4.6.7, U4의 `PublicationAccess`, web의 기존 `copyText`를 쓴다.

## Q1. [운영] 링크 거부와 잘못된 cursor를 서버 로그에 남길까요?

링크 거부는 `LINK_UNAVAILABLE`·`LINK_PASSWORD_REQUIRED`이고, 잘못된 cursor는 `INVALID_CURSOR`입니다.

U6과 기능 설계는 이렇게 정했습니다.
- U6 요약 확인은 "실패와 거부만 사건 이름·도구 이름·오류 이름으로 남긴다"고 정했습니다.
- 그런데 U6 코드가 남기는 것은 빈도 거부(`mcp_rate_limited`)와 내부 오류(`mcp_tool_failed`)뿐입니다. `INVALID_CURSOR`는 응답으로만 알리고 로그를 남기지 않습니다(`mcp-tools.ts:72`).
- U9의 링크 거부는 중지·만료된 링크 같은 정상적인 결과입니다.
- FR19.1의 "링크 중지 뒤 MCP 차단" 확인(S23)은 Claude가 받은 응답으로 판단합니다.

A. 남기지 않는다. U6의 `INVALID_CURSOR`처럼 응답으로만 알린다. 코드와 시험이 늘지 않는다. S23의 차단 확인은 Claude 응답으로 한다.
B. 링크 거부만 사건 이름(`mcp_link_denied`)·도구 이름·오류 이름으로 남기고, `INVALID_CURSOR`는 U6처럼 남기지 않는다.
   - 더 막는 것: S23에서 서버가 막았다는 증거가 개발 서버 로그에 남는다.
   - 늘어나는 공수: 로그 종류 하나와 시험 하나다.
   - 토큰·링크는 남기지 않는다.
C. B에 더해 `INVALID_CURSOR`도 남긴다.
   - U6 도구의 `INVALID_CURSOR`와 모양이 달라지므로, U6도 함께 바꿀지 정해야 한다.
   - 공수는 B보다 시험 하나가 더 는다.
X. Other (please specify)

[Answer]: B

## Consolidated Summary Confirmation

담당 답변

- **링크 거부 로그(Q1):**
  - `LINK_UNAVAILABLE`·`LINK_PASSWORD_REQUIRED`를 돌려줄 때 사건 이름 `mcp_link_denied`, 도구 이름, 오류 이름만 남긴다.
  - 토큰·링크·글·cursor는 남기지 않는다. `INVALID_CURSOR`는 U6처럼 남기지 않는다.
  - U6 `mcp-log.ts`의 `McpLogEntry`에 사건 종류 하나를 더한다. U6 동작은 바꾸지 않는 모양 변경이다.
  - 거부 로그의 모양을 확인하는 시험 하나를 더한다.
  - S23에서 링크 중지 뒤 차단을 확인할 때 개발 서버 로그의 이 사건도 함께 본다.

이미 정해져 그대로 따르는 것

- **성능:** 쪽당 직렬화 40,000자(nextCursor 자리 1,024자), cursor 1,024자, link 2,048자. 쪽마다 사본 전체를 다시 읽는 비용은 받아들인다.
- **보안:** 쪽마다 C-10 판정, 비밀번호 링크는 웹 안내, 웹과 같은 범위. `notice`와 도구 설명 고지 셋을 두고 남는 위험은 받아들인다. 입력은 엄격한 모양이고, 로그에 토큰·링크·글·cursor는 없다. U6의 토큰 확인과 `Origin` 확인을 쓴다.
- **규모:** 회원당 분당 60회를 세 도구가 함께 센다.
- **신뢰성:** DB 실패는 `INTERNAL_ERROR`이고 다시 시도하지 않는다. Redis가 없거나 오류이면 통과시킨다. 판정 뒤에는 취소하지 않는다.
- **기술:** 새 의존성 없음. U6 SDK 1.32.2와 `zod` 4.6.7, U4 `PublicationAccess`, web `copyText`를 쓴다.

질문하지 않고 가장 단순한 안으로 정한 것

- **수치 목표:** 응답 시간·처리량·동시 사용자·가용성 목표를 새로 두지 않는다(NFR4). 상한은 쪽 크기와 입력 길이만 둔다.
- **관찰:** 정상 호출은 남기지 않는다(FR13.6). 새 지표·알림·관제 화면은 없다(NFR6).
- **배포:** 기존 api·web 배포를 그대로 쓴다. 새 설정 값과 인프라 변경이 없다.
- **web:** 버튼과 안내는 API를 부르지 않아 성능 요구가 없다. 접근성은 기능 설계 BR6.5 그대로다.
- **시험:**
  - api·web의 기존 시험 묶음과 `test:coverage`를 쓴다.
  - 코드 PR은 U6의 기존 시험을 고치지 않고 통과해야 한다.
  - 실제 Claude 확인(S23)은 `main` 반영 뒤 개발 서버에서 하며, 완료 기준에는 넣지 않는다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
