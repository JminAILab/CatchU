# U9 받은 사람의 Claude 연결 — 관찰 요구사항

## Sources

작성일: 2026-11-09. 입력:
- [U9 기능 명세](../functional-design/functional-spec.md)(functional-spec)
- [U9 업무 규칙](../functional-design/rules.md)(rules)
- [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR6·FR13.6·FR19.1
- [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-15 common-errors
- [U6 관찰 요구사항](../../u6-claude-mcp/nfr-requirements/observability-requirements.md)
- [비기능 질문·답변](nfr-requirements-questions.md)의 Q1과 요약 확인

코드: `api/src/claude-mcp/mcp-log.ts`, `api/src/claude-mcp/mcp-tools.ts`, `api/src/rag-answer/rag-answer-log.ts`(U5 `qna.rejected`의 수준).

## 범위

관찰 요구는 두 가지를 다룬다.
- 서버 로그에 무엇을 남기고 무엇을 남기지 않는가.
- 확인 결과를 어떻게 남기는가.

새 지표·알림·관제 화면은 만들지 않는다(NFR6).

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR6.1 | `read_shared_publication`은 세 사건만 로그에 남긴다. 빈도 거부(`mcp_rate_limited`, U6 그대로), 내부 오류(`mcp_tool_failed`, U6 그대로), 링크 거부(`mcp_link_denied`, 새로 더함)다. 링크 거부는 `LINK_UNAVAILABLE`·`LINK_PASSWORD_REQUIRED`를 돌려줄 때이고, 도구 이름과 오류 이름을 담는다. 거부는 중지·만료 같은 정상 결과이므로 링크 거부는 정보(`log`) 수준으로 남긴다. U5 `qna.rejected`와 같은 수준이다. 정상 호출, 입력 오류, `INVALID_CURSOR`는 남기지 않는다(U6과 같다). U6 `mcp-log.ts`의 `McpToolName`과 `McpLogEntry`에 이름과 사건 종류를 더하고, 지금 `warn`·`error`만 있는 `McpLogger`에 `log`를 더하는 모양 변경이다. U6 사건의 내용과 수준은 바뀌지 않는다 | 거부 로그의 모양과 수준을 확인하는 시험, 기능 설계 S9·S17·S19 | Q1, FR13.6, C-15 INTERNAL_ERROR, rules BR5.3 |
| NFR6.2 | 로그에는 사건 이름·도구 이름·오류 이름만 남긴다. 링크·토큰·발행본 글·cursor·입력 원문·회원 ID·SQL·stack은 남기지 않는다 | 기능 설계 S19 | 보안 점검 「로그·오류 응답」, team.md Code Style, rules BR5.3 |
| NFR6.3 | 확인 결과는 두 단계로 남긴다. 시험 묶음(S1~S22)은 api·web의 기존 시험과 `test:coverage`로 돌린다. 코드 PR은 U6의 기존 시험을 고치지 않고 통과해야 한다. 실제 Claude 확인(S23)은 U9가 `main`에 오른 뒤 개발 서버에서 하고, 결과를 FR19 확인 표에 실제 결과·실패·미실행으로 나눠 적는다. S23에서 링크 중지 뒤 차단을 볼 때 개발 서버 로그의 `mcp_link_denied`도 함께 본다. 그때 개발 서버의 큐 연결 여부(빈도 제한이 켜졌는지)도 확인 표에 적는다. 합성 클라이언트 시험의 통과를 실제 Claude 연결 성공으로 보고하지 않는다 | 기능 설계 S1~S23 | NFR6, FR19.1, team.md Walking Skeleton, functional-spec 「주요 시나리오와 확인」 |
| NFR6.4 | 새 지표·알림·관제 화면·기간별 사용 횟수 기록을 두지 않는다 | 해당 없음 | NFR6, FR13.6 |

## 기록 항목

| 사건 | 언제 | 수준 | 담는 것 | 담지 않는 것 |
|---|---|---|---|---|
| `mcp_rate_limited` | 회원당 1분 60회를 넘었을 때 | warn(U6 그대로) | 도구 이름 | 회원 ID, 링크, 입력 |
| `mcp_tool_failed` | DB 실패, 작성자 회원 행 없음, 그 밖의 예외 | error(U6 그대로) | 도구 이름, 오류 이름 | 오류 메시지, SQL, stack, 링크 |
| `mcp_link_denied` | `LINK_UNAVAILABLE`·`LINK_PASSWORD_REQUIRED`를 돌려줄 때 | log | 도구 이름, 오류 이름 | 링크, 토큰, 발행본 ID, 이유 구분 |

## 채택하지 않은 것

- **`INVALID_CURSOR` 기록:** U6 도구와 모양이 달라진다. 서버가 준 cursor를 그대로 쓰는 한 생기지 않는다(Q1).
- **정상 호출 기록과 읽은 발행본 수:** FR13.6이 기간별 사용 횟수를 기록하지 않는다.
- **거부 이유 구분(없음·중지·만료 등):** 받은 사람 경로는 이유를 구분하지 않는다(C-10). 로그에서도 나누지 않는다.
