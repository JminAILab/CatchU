# U9 받은 사람의 Claude 연결 — 비기능 설계 질문

입력:
- U9 비기능 요구사항: [성능](../nfr-requirements/performance-requirements.md)·[보안](../nfr-requirements/security-requirements.md)·[규모](../nfr-requirements/scalability-requirements.md)·[신뢰성](../nfr-requirements/reliability-requirements.md)·[관찰](../nfr-requirements/observability-requirements.md)·[기술 선택](../nfr-requirements/tech-stack-decisions.md)
- [U9 기능 명세](../functional-design/functional-spec.md)의 처리 순서·응답 모양·주요 시나리오·「다른 Unit에 넘기는 것」
- [계약 요약](../../../inception/contract-design/contract-summary.md)의 C-10·C-11·C-15
- [U6 논리 구성 요소](../../u6-claude-mcp/nfr-design/logical-components.md)
- 코드: `api/src/claude-mcp/mcp-tools.ts`, `api/src/claude-mcp/mcp-page.ts`, `api/src/claude-mcp/mcp-log.ts`, `api/src/publications/publication-access.ts`, `api/src/publications/published-snapshot.ts`

이번 단계에서 담당에게 물을 질문은 없다. 비기능 요구사항이 승인되어 설계가 고를 것은 아래 「질문하지 않고 가장 단순한 안으로 정한 것」뿐이다. 다른 안을 원하면 요약 확인에서 바꾼다.

## 이미 정해져 묻지 않는 것

- **성능:**
  - 한 쪽은 직렬화 길이 40,000자 이하다. nextCursor 자리는 1,024자로 잡는다.
  - 최소 진행 쪽만 상한을 넘을 수 있다. Catch 제목만으로 남은 자리를 넘을 때다.
  - 호출마다 읽기 전용 트랜잭션 둘(판정, 사본 읽기)을 쓰고 캐시는 두지 않는다.
  - PDF가 아닌 글은 60,000자(임시값)가 경계이고, PDF는 50쪽·20 MB가 경계다.
- **보안:**
  - 쪽마다 C-10 판정을 grant 없이 한다. 비밀번호 링크는 읽지 않는다.
  - 웹과 같은 범위만 담는다. 입력은 엄격한 모양으로만 받는다.
  - 모든 쪽 첫 칸에 `notice`를 두고, 도구 설명에 고지 셋을 둔다.
  - 남는 위험의 팀장 확인은 C-15 계약 PR 병합 전에 받는다.
- **규모:** 세 도구가 회원당 분당 60회를 함께 센다. 서버는 상태를 두지 않는다.
- **신뢰성:**
  - 다음 쪽 재판정에서 막는다. 판정 뒤에는 취소하지 않는다.
  - 판정 뒤 사본 없음은 `LINK_UNAVAILABLE`, DB 실패와 작성자 행 없음은 `INTERNAL_ERROR`다. 다시 시도하지 않는다.
- **관찰:**
  - 링크 거부는 `mcp_link_denied`(log 수준)로 남긴다. 빈도 거부와 내부 오류는 U6 그대로다.
  - 새 지표·알림은 없다. S23 때 큐 연결 여부를 적는다.
- **기술:** 새 의존성·설정·표가 없다.

## 질문하지 않고 가장 단순한 안으로 정한 것

- **쪽 길이 재기와 자를 자리:**
  - 후보 쪽 전체를 `JSON.stringify`해 잰다. 이때 nextCursor 칸은 1,024자 문자열로 채운다.
  - 자를 자리는 코드 포인트 경계 위에서 이분 탐색으로 찾는다. 서로게이트 쌍 가운데는 후보에 넣지 않는다.
  - 기능 설계의 확인(S12)이 재는 값과 같은 값을 재므로 어긋날 곳이 없다.
  - 채택하지 않은 안 하나는 글자마다 이스케이프 길이를 더해 가는 방식이다. 한 번에 끝나지만 `JSON.stringify`의 이스케이프 규칙을 따로 옮겨 적어야 해서 어긋날 위험이 있다.
  - 채택하지 않은 다른 안은 조각마다 따로 재서 더하는 방식이다. 시연 규모에서는 아끼는 시간이 작다.
- **코드 자리:**
  - api는 U9 전용 새 파일을 `api/src/claude-mcp/`에 둔다. 링크에서 토큰 꺼내기, 사본을 글로 펴기, 쪽 만들기와 cursor 범위 확인을 맡고, 모두 DB가 없는 순수 함수다.
  - U6 파일의 모양 변경은 logical-components.md에 한 목록으로 모은다. 기능 설계 목록에 비기능 요구사항에서 늘어난 둘을 더한다.
    - 기능 설계 목록: `mcp-page.ts`의 `encodeCursor`·`decodeCursor` 내보내기, `McpToolName`, `McpToolError`, `call()` 오류 대응, `forMember` 등록과 맨 위 주석, `claude-mcp.module.ts`의 `PublicationsModule` 가져오기.
    - 늘어난 둘: `McpLogEntry`의 `mcp_link_denied` 사건, `McpLogger`의 `log`.
  - web은 U4 받은 사람 화면의 C-11 새 자리에 U9 패널 하나를 둔다. 작성자 안내 한 줄은 U4 발행 화면(`web/src/features/publications/publish-view.tsx`) 두 곳에 더한다.
  - 받은 사람 화면의 한 줄과 발행 화면 두 곳의 안내 줄은 모두 U4 담당 화면이다. 그래서 U9 코드 PR에서 U4 담당(팀원 3)의 리뷰를 받는다.
- **링크 거부가 오류 응답이 되는 길:**
  - U9 처리 함수는 링크 거부를 오류 코드를 담은 이름 붙은 오류로 던진다. 토큰 모양 실패(DB 앞)도 같다.
  - U6 `call()`이 이 오류를 받아 `mcp_link_denied`를 남기고 `toolError`로 바꾼다.
  - 그 밖의 예외는 지금처럼 `mcp_tool_failed`와 `INTERNAL_ERROR`다.
- **판정 시각:** `now`는 호출마다 `new Date()`다. 시계를 바꿔 끼우지 않고, 만료는 시험 DB에 지난 시각 행을 넣어 만든다(U6과 같다).
- **시험에서 바꿔 끼우는 자리:**
  - api는 시험 DB와 U6의 합성 MCP 클라이언트로 한다. 정상 DB로 만들 수 없는 경우만 `PublicationAccess` 쪽을 시험 대역으로 바꾼다.
    - 판정 뒤 중지 커밋과 판정 뒤 사본 삭제(S11).
    - 작성자 회원 행 없음과 판정·사본 읽기 중 DB 오류(S9). 작성자 회원 행 없음은 외래 키 때문에 정상 DB에서 만들 수 없어 U4 시험(`api/test/publications/publication-access-db.test.cjs`)도 대역을 쓴다.
  - Redis는 `CATCHU_TEST_REDIS_URL`이 있을 때만 실제로 돈다.
  - web(S20~S22)은 web의 기존 화면 시험으로 하고, 복사 실패(S21)는 클립보드 자리를 바꿔 끼운다.

## Consolidated Summary Confirmation

질문 없이 따르는 것(승인된 비기능 요구사항)

- **성능:** 쪽당 직렬화 40,000자(nextCursor 자리 1,024자), 최소 진행 쪽만 예외. 호출마다 읽기 전용 트랜잭션 둘이고 캐시가 없다. PDF가 아닌 글은 60,000자, PDF는 50쪽·20 MB가 경계다.
- **보안:** 쪽마다 grant 없는 C-10 판정, 비밀번호 링크는 읽지 않음, 웹과 같은 범위, 엄격한 입력, `notice`와 고지 셋. 남는 위험의 팀장 확인은 C-15 계약 PR 병합 전이다.
- **규모·신뢰성:** 세 도구가 분당 60회를 함께 센다. 상태가 없다. 다음 쪽에서 막고 판정 뒤에는 취소하지 않는다. 사본 없음은 `LINK_UNAVAILABLE`, DB 실패는 `INTERNAL_ERROR`이고 다시 시도하지 않는다.
- **관찰·기술:** `mcp_link_denied`는 log 수준이다. 새 지표·의존성·설정·표가 없다.

가장 단순한 안으로 정한 설계

- **쪽 길이:** 후보 쪽 전체를 nextCursor 1,024자 자리와 함께 `JSON.stringify`해 재고, 자를 자리는 코드 포인트 경계 위에서 이분 탐색으로 찾는다.
- **코드 자리:**
  - api는 `api/src/claude-mcp/`의 U9 전용 새 파일(순수 함수)에 둔다.
  - U6 파일의 모양 변경은 logical-components.md에 한 목록으로 모은다. 기능 설계 목록에 `McpLogEntry`의 `mcp_link_denied` 사건과 `McpLogger`의 `log`를 더한 것이다.
  - web은 C-11 새 자리의 U9 패널과 발행 화면(`publish-view.tsx`) 두 곳의 안내 줄이다. 받은 사람 화면의 한 줄과 함께 U9 코드 PR에서 U4 담당(팀원 3)의 리뷰를 받는다.
- **오류 길:** 링크 거부는 이름 붙은 오류로 던지고 U6 `call()`이 로그와 오류 응답으로 바꾼다.
- **시각·시험:**
  - `now`는 호출마다 `new Date()`다.
  - api는 시험 DB와 합성 MCP 클라이언트로 한다. 정상 DB로 만들 수 없는 S9(작성자 회원 행 없음, DB 오류)와 S11(판정 뒤 변화)만 `PublicationAccess` 쪽을 대역으로 바꾼다.
  - web은 기존 화면 시험으로 하고, S21의 클립보드만 바꿔 끼운다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct

## Requested Changes Feedback

What should change?

[Answer]: 두 가지를 더해 줘. 1) 발행 화면(web/src/features/publications/publish-view.tsx) 두 곳의 작성자 안내 줄도 U4 담당 화면이므로, 받은 사람 화면 한 줄과 같이 U9 코드 PR에서 U4 담당(팀원 3) 리뷰를 받는다고 적는다. 2) U6 파일 모양 변경을 logical-components.md에 한 목록으로 모은다: 기능 설계 목록(mcp-page.ts export, McpToolName, McpToolError, call() 오류 대응, forMember 등록)에 NFR에서 늘어난 McpLogEntry의 mcp_link_denied 사건과 McpLogger의 log를 더한다.
