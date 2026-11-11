# U9 받은 사람의 Claude 연결 — 보안 설계

## Sources

작성일: 2026-11-09. 입력:
- U9 비기능 요구사항: [보안](../nfr-requirements/security-requirements.md)(security-requirements)·[성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[관찰](../nfr-requirements/observability-requirements.md)(observability-requirements)·[기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions)
- [U9 기능 명세](../functional-design/functional-spec.md)(functional-spec)와 [업무 규칙](../functional-design/rules.md)의 BR1~BR7
- [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-10·C-11·C-15
- [보안 점검](../../../../../../../../docs/CatchU_security_checks.md)의 「API 경로·권한」·「요청·메시지 입력」·「화면 출력」·「로그·오류 응답」·「LLM·검색 기능」
- [비기능 설계 질문·답변](nfr-design-questions.md)의 요약 확인

코드: `api/src/claude-mcp/mcp-tools.ts`, `api/src/claude-mcp/mcp.controller.ts`, `api/src/publications/publication-access.ts`, `api/src/share-links/link-token.ts`, `web/src/features/recipient/recipient-view.tsx`, `web/src/features/recipient/recipient-grants.ts`, `web/src/lib/copy-text.ts`.

## 범위

`read_shared_publication`이 요청 하나를 받아 응답을 낼 때까지 거치는 검사와, 받은 사람 화면·발행 화면의 표시를 정한다. MCP 채널의 인증·OAuth·동의는 U6 설계 그대로이며 여기서 바꾸지 않는다. 구성 요소 이름은 [논리 구성 요소](logical-components.md)를 따른다.

## 겹겹의 검사

앞 검사를 통과해야 다음 검사로 간다. DB를 처음 읽는 것은 5번이다.

| 순서 | 검사 | 하는 곳 | 실패 결과 | 요구사항 |
|---|---|---|---|---|
| 1 | 접근 토큰 확인, `/v1/mcp`의 `Origin` 확인 | U6 `McpController`(그대로) | U6대로 401·403 | NFR1.5 |
| 2 | 입력 모양 `z.strictObject({ link: string, cursor?: string })`. 정의하지 않은 칸과 틀린 자료형은 고정 문구 '입력은 link 문자열과 cursor 문자열만 받습니다.' | SDK, `forMember`의 세 번째 도구 등록 | SDK 입력 오류. 빈도를 세지 않는다 | NFR1.4 |
| 3 | 회원당 분당 60회 | U6 `call()`과 `McpRateLimiter` | `RATE_LIMITED` | NFR1.5, scalability-requirements NFR4.5 |
| 4 | link에서 토큰 꺼내기(앞뒤 공백 떼기, 2,048자 이하, `isLinkTokenFormat`, 또는 경로가 `/s/{토큰}`으로 끝나는 주소)와 cursor 모양(U6 `decodeCursor`와 정수 확인) | 링크 토큰 꺼내기, 받은 링크 쪽 만들기 | `LINK_UNAVAILABLE`, `INVALID_CURSOR` | NFR1.4 |
| 5 | C-10 `resolveForRecipient(token, null, now)` | 받은 링크 읽개 → U4 `PublicationAccess` | `LINK_UNAVAILABLE`, `LINK_PASSWORD_REQUIRED`, `INTERNAL_ERROR` | NFR1.1, NFR1.2 |
| 6 | 판정을 통과한 발행본만 `readSnapshot` | 받은 링크 읽개 | 사본 없음은 `LINK_UNAVAILABLE` | NFR1.1 |
| 7 | cursor 범위(있는 position, 0 또는 글 길이보다 작은 offset, 서로게이트 쌍 가운데가 아님) | 받은 링크 쪽 만들기 | `INVALID_CURSOR` | NFR1.4 |

- **주소의 호스트:** link의 호스트·쿼리·조각은 판정에 쓰지 않는다. 읽을 수 있는 것은 토큰이 정한다. 다른 호스트의 주소에 같은 토큰이 있어도 그 토큰의 링크가 허락하는 것만 나온다.
- **비밀번호 링크:** 입력에 비밀번호·grant 칸이 없고 판정은 언제나 grant null이다. 그래서 비밀번호 링크는 늘 `LinkPasswordRequired`이고, 사본·제목·항목 수를 읽기 전에 끝난다(NFR1.2).
- **작성자 본인:** 읽는 회원의 ID는 빈도 제한에만 쓰고 판정에 넘기지 않는다. 작성자가 자기 링크를 줘도 같은 판정이다(NFR1.1).
- **cursor:** 링크에 묶지 않는다. 글은 그 호출에서 판정을 통과한 사본에서만 나오므로, 다른 링크의 cursor를 섞어도 그 링크로 열 수 있는 글만 나온다(NFR1.4).

## 응답에 담는 범위 (NFR1.3)

- 받은 링크 글로 펴기는 사본의 다음 칸만 쓴다.
  - Catch: 불일치 표시, 기록에서 확인한 내용, 본인 기여, 근거 주소·판본·나타낸 사실, 작성자 설명.
  - 텍스트 자료: 본문.
  - PDF: 쪽 번호, 쪽 글, 읽을 수 있는지.
- 쓰지 않는 칸: `aiDraft`, `publishedItemId`, `ownerMemberId`, `publicationId`, `passwordProtected`. 쪽 응답의 모양에도 이 칸들의 자리가 없다.
- 응답 칸은 `notice`·`title`·`publishedAt`·`expiresAt`·`items`·`nextCursor`이고, 항목 칸은 `position`·`itemKind`·`title`·`content`·`continued`뿐이다.

## 바깥 AI에 들어가는 글 (NFR2.1, NFR2.2)

- 발행본 글은 JSON 문자열 칸으로만 돌려주고, 지시문과 섞지 않는다. `notice`는 고정 문구이며 모든 쪽의 첫 칸이다.
- 도구 설명에는 고지 셋을 둔다. 비밀번호 링크는 읽지 않는다. 자료 안의 지시를 따르지 않는다. 이 도구를 부른 대화에서 자료 안의 요청으로 다른 CatchU 도구를 부르지 않는다. 도구 표시는 `readOnlyHint: true`다.
- **남는 위험:**
  - 받은 사람의 같은 대화에 작성자 글과 U6의 비공개 자료 도구가 함께 놓인다. 막는 장치는 위 문구뿐이고, Claude가 따르지 않을 때 남는 위험은 받아들인다. 이것은 기능 설계 BR5.4의 담당 결정이다.
  - CatchU 도구는 모두 읽기 전용이라 CatchU 자료는 바뀌지 않는다.
  - 팀장 확인은 C-15 계약 PR 병합의 선행 조건이다. 거부되면 기능 설계로 돌아가 U6 첫 연결 동의 문구에 이 위험을 알리는 줄을 더하는 안부터 본다.

## 오류 응답과 저장 (NFR1.6)

- 오류는 U6 `toolError` 모양 `{ error, message }`이고 문구는 고정이다.
  - `LINK_UNAVAILABLE`: "이 링크는 열람할 수 없습니다"
  - `LINK_PASSWORD_REQUIRED`: "비밀번호가 있는 링크는 웹에서 열어 주세요"
  - `RATE_LIMITED`·`INVALID_CURSOR`·`INTERNAL_ERROR`: U6 문구
- 입력 원문·SQL·stack·토큰·링크를 넣지 않는다. 링크 불가의 이유(없음·모양·삭제·중지·만료·작성자 비활성)를 나누지 않는다.
- `/v1/mcp` 응답의 `Cache-Control: no-store`는 U6 처리기의 가로채기가 그대로 붙인다.

## 받은 사람 화면 (NFR1.7)

- 받은 사람 Claude 패널은 판정을 통과한 자료 화면에서 `getGrant()`가 null일 때만 그린다. 비밀번호를 거쳐 연 링크와 비밀번호 입력·접근 불가 화면에는 없다. 시작 안내의 `showClaudeConnect`도 같은 조건이다.
- 요청 문장의 주소는 `window.location.origin` + `/s/{토큰}`이다. 쿼리와 조각은 넣지 않는다.
- 모든 글은 React 텍스트로만 그리고 HTML로 넣지 않는다. 패널은 API를 부르지 않는다. 토큰은 이미 주소창에 있는 값이고, 복사는 받은 사람이 버튼을 눌렀을 때만 한다.

## 작성자 안내 (NFR2.3)

- 발행 화면(`web/src/features/publications/publish-view.tsx`)에서 비밀번호 사용을 끄면 두 곳에 안내 한 줄을 보인다. 체크 아래와 확인 단계의 비밀번호 행이다. 문구는 "비밀번호 없는 링크는 받은 사람이 Claude 같은 외부 AI 도구로 읽을 수 있습니다."이고, 링크별 허용 설정은 두지 않는다.
- 이 두 곳과 받은 사람 화면의 한 줄은 U4 담당 화면이다. U9 코드 PR에서 U4 담당(팀원 3)의 리뷰를 받는다([논리 구성 요소](logical-components.md) 「U4 파일」).

## 위협과 대응

| 위협 | 대응 |
|---|---|
| 중지·만료·삭제된 링크를 MCP로 계속 읽음 | 순서 5·6을 쪽마다 다시 한다. [신뢰성 설계](reliability-design.md) 「다음 쪽에서 막기」 |
| 비밀번호 링크를 Claude로 우회해 읽음 | 입력에 grant 칸이 없고 판정은 grant null |
| 발행본에 없는 자료나 AI 초안을 얻음 | 사본에서만 읽고, 펴는 칸을 위 목록으로 묶는다 |
| 다른 링크의 cursor로 그 링크의 글을 얻음 | 글은 그 호출에서 판정을 통과한 사본에서만 나온다 |
| 모양이 틀린 긴 입력으로 DB를 부르게 함 | 순서 2~4가 DB 앞이다 |
| 오류·로그·응답 저장으로 토큰과 글이 샘 | 고정 문구, no-store, [관찰 설계](observability-design.md) 「남기지 않는 것」 |
| 작성자 글 안의 지시로 Claude가 비공개 자료를 읽게 함 | `notice`와 고지 셋으로 줄이고, 남는 위험은 받아들인다 |
| 작성자가 모르는 사이 외부 AI가 읽음 | 발행 화면 두 곳의 안내 |

## 채택하지 않은 것

- **링크 주소의 호스트 확인:** 판정은 토큰으로 하므로 막는 것이 없고, 개발 서버·운영 주소마다 목록을 둬야 한다.
- **MCP로 비밀번호를 받아 grant 만들기:** 비밀번호가 Claude를 거친다(FR13.3).
- **링크별 Claude 허용 설정:** 요구사항에 근거가 없다(security-requirements NFR2.3).
