# U6 Claude MCP 본인 연결 — 신뢰성 설계

## Sources

작성일: 2026-11-01. 입력: [신뢰성 요구사항](../nfr-requirements/reliability-requirements.md)(reliability-requirements)의 NFR4.9~NFR4.13·NFR5.1~NFR5.3과 「알려진 한계」, [성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[관측](../nfr-requirements/observability-requirements.md)(observability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U6 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 W2·W3·W6·W7과 S6~S9·S16·S17·S19·S21, [업무 규칙](../functional-design/rules.md)의 BR3.7·BR4.3·BR4.4·BR6.2·BR6.3·BR7.2·BR7.4, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-06·C-15와 「에러 대응 최소선」, [비기능 설계 질문·답변](nfr-design-questions.md)의 요약 확인, SDK 1.32.2의 `server/auth/middleware/bearerAuth.js`, api 현재 코드(`api/src/ai-run/ai-run.ts`, `api/src/common/errors/api-exception.filter.ts`, `api/src/withdrawal/withdrawal.service.ts`).

## 범위

가동률·복구 수치는 새로 만들지 않는다(NFR4). U6의 신뢰성 설계는 실패가 어디서 드러나는지, 함께 바뀌어야 하는 것의 트랜잭션 경계, Redis가 없거나 멈출 때의 동작 세 가지다.

## 설계

| 요구사항 | 설계 |
|---|---|
| NFR4.9 실패를 숨기지 않음 | 아래 「실패와 결과」대로 드러낸다. 어디에도 자동 재시도가 없고 다시 시도는 회원이나 Claude를 쓰는 사람이 한다 |
| NFR4.10 SDK에 넘기는 저장 단계 | 저장 단계를 작은 감싸기 하나로 지난다. `OAuthError`는 의도한 거부라 그대로 던지고, 그 밖의 오류는 사건을 남긴 뒤 다시 던진다. SDK가 처음 보는 오류를 로그 없이 500으로 바꾸기 때문이다(`bearerAuth.js:84-87`, 임시 앱으로 확인). 사건과 단계는 observability-design 「기록 항목」이다. Nest 처리기 안의 실패에는 더하지 않는다 |
| NFR4.11 Redis | 아래 「빈도 집계의 실패」 |
| NFR4.12 트랜잭션 | 아래 「트랜잭션 경계」 |
| NFR4.13 재기동 | 토큰·연결·코드·등록은 DB에 있고 MCP 세션은 서버에 없어 재기동으로 끊기지 않는다. 쌓아 둘 작업이 없어 기동 때 복구할 것이 없다 |
| NFR5.1 탈퇴 표 | 마이그레이션이 세 표를 `withdrawal.service.ts`가 부르는 이름과 `member_id` 칸 그대로 만들고, 회원·등록·연결을 가리키는 외래 키를 모두 `ON DELETE CASCADE`로 건다. 같은 PR에서 `api/docs/member-withdrawal-deletion.md` 행과 `test/db/member-cascade-delete.test.cjs`의 `MEMBER_ROWS`를 더한다 |
| NFR5.2 사본 없음 | 도구가 읽은 행은 응답을 만들고 나면 버리는 지역 변수다. 캐시·파일·다른 표를 쓰지 않는다. Redis에는 횟수만 있다 |
| NFR5.3 해제·탈퇴 차단 | 토큰 확인이 요청마다 DB를 읽으므로 해제·탈퇴가 커밋되면 다음 호출이 401이다. 쓰지 않은 코드는 지워져 `invalid_grant`다(S17·S19) |

## 실패와 결과

| 일어난 일 | 응답 | 로그 | 그 뒤 |
|---|---|---|---|
| 토큰 확인 중 DB 실패 | 500 `server_error`(SDK) | `mcp_token_check_failed` | 쓰는 사람이 다시 시도한다. 401이 아니므로 Claude의 재승인이 시작되지 않는다 |
| 도구의 DB 실패 | 도구 오류 `INTERNAL_ERROR` | `mcp_tool_failed` | 쓰는 사람이 다시 묻는다 |
| 등록·클라이언트 조회·코드 교환의 DB 실패 | 500 `server_error`(SDK) | `mcp_oauth_failed` | Claude에서 연결을 다시 시작한다 |
| 승인·상태·해제의 DB 실패 | 500 `INTERNAL_ERROR` | 기존 필터 | 화면이 오류를 보여 주고 회원이 다시 누른다 |
| 트랜잭션 안의 실패 | 위와 같음 | 위와 같음 | 되돌아가 코드·토큰·행이 남지 않는다 |
| Redis 주소 없음 | 통과 | 기동 때 `mcp_rate_limit_off` 한 번 | 제한이 꺼진 채 돈다(받아들인 위험) |
| Redis 오류·1초 초과 | 통과 | `mcp_rate_limit_error` | 그 호출은 세지 않는다 |

도구 처리에서 잡는 곳은 하나다. 빈도·`cursor`·조회를 부르는 감싸기가 예상한 거부를 도구 오류로 바꾸고, 그 밖의 오류는 `mcp_tool_failed`를 남기고 `INTERNAL_ERROR`로 바꾼다. 오류 메시지는 옮기지 않는다.

## 트랜잭션 경계

| 일 | 트랜잭션(READ COMMITTED) | 되돌림 |
|---|---|---|
| 승인(BR3.7) | `approved_at = COALESCE(approved_at, now())`로 등록 행을 갱신하고 코드를 넣는다. 이미 승인에 쓰인 등록도 갱신되어 처음 값이 그대로 남는다. 등록 행이 없을 때만(정리로 지워짐) `MCP_AUTHORIZATION_INVALID` | 코드가 남지 않는다 |
| 토큰 교환(BR4.3·BR4.4) | 조건부 `UPDATE`로 코드 소비 → 돌아갈 주소·클라이언트·`resource` 확인 → 연결 쓰기 → 그 짝의 토큰 교체 → 그 회원의 만료 행 삭제 | 확인이 틀리면 되돌리고 `invalid_grant`. 코드는 쓰지 않은 채 남는다 |
| 전체 해제(BR7.2) | `used_at`이 빈 코드 → 토큰 → 연결 순으로 삭제 | 실패하면 그대로이고 회원이 다시 누른다 |

- 트랜잭션 안에 외부 호출이 없다. `InvalidGrantError`를 트랜잭션 안에서 던져 되돌리고, 로그(`mcp_token_exchange_refused`)는 되돌린 뒤 남긴다. 코드 challenge 읽기에서 없는 코드를 거부할 때도 같은 사건을 남긴다.
- SDK가 PKCE를 트랜잭션 밖에서 먼저 확인하므로 PKCE가 틀린 요청은 코드를 소비하지 않는다.
- 해제와 진행 중 교환의 겹침(기능 명세 W6의 추론)은 실제 DB로 S17이 확인한다. 승인과 해제의 겹침은 회원이 직접 승인한 결과이고 남의 자료 노출이 아니라 막지 않는다(에러 대응 최소선 6).

## 빈도 집계의 실패 (NFR4.11)

- 주소는 기존 `readAnalysisQueueConfig()`로 읽는다. `null`이면 연결을 만들지 않고 기동 때 `mcp_rate_limit_off`를 한 번 남긴다. 셈 함수는 언제나 통과를 돌려준다.
- 주소가 있으면 전용 연결을 하나 연다. 옵션은 `AiRun`의 등록 연결과 같은 `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`에 `commandTimeout: 1000`을 더한다. 끊긴 동안에는 명령이 바로 실패하고 멈춘 Redis에는 1초 뒤 실패한다.
- 셈은 `EVAL` 한 번이다. 스크립트가 `INCR`하고 값이 1이면 만료 120초를 건다. 두 명령 사이에서 멈춰 만료 없는 키가 남는 일이 없다. BullMQ가 같은 Redis에 이미 Lua를 쓰므로 새 전제가 아니다.
- 연결 자체의 오류는 `AiRun`의 `watch`와 같이 같은 끊김에서 첫 오류만 남긴다. 사건 이름은 `mcp_rate_limit_error`다. `watch`는 `AiRun`의 비공개 함수라 고치지 않고 같은 짧은 함수를 U6에 둔다.
- 연결은 `onApplicationShutdown`에서 닫는다.

## 회복 방법

- 다시 시도는 사람이 한다. 토큰이 만료되거나 끊기면 Claude가 재승인을 안내하고, 승인·해제 실패는 화면에서 다시 누른다(에러 대응 최소선 2).
- U6 마이그레이션의 `down`은 네 표를 지운다. 연결이 모두 사라지므로 회원은 다시 동의하고 승인한다. 원본 자료(Catch·텍스트 자료)는 잃지 않는다.

## 알려진 한계 (그대로 둠)

- EKS에도 지금은 큐 주소가 없어 큐 연결을 켜기 전까지 빈도 제한이 꺼진다. 개발 서버의 받아들인 위험과 함께 #389·#276에 알린다(reliability-requirements).
- SDK 안에서 끝나는 실패(PKCE 틀림, 요청 형식 오류, 등록 IP 한도)는 U6 코드를 거치지 않아 로그가 없다. 응답으로는 드러난다.
- 토큰이 지워지는 순간과 진행 중인 도구 호출이 겹치면 이미 통과한 그 호출은 끝까지 돈다. 다음 호출부터 막는다는 요구(NFR5.3)에 들어맞는다.

## 두지 않는 것

재시도·backoff, 회로 차단기, 대체 경로, 큐, 주기 정리 작업, 새 상태 확인 경로는 두지 않는다. 다시 시도는 사람이 하고(에러 대응 최소선 2) 시연 규모에서 연쇄 실패가 일어날 호출이 없다.
