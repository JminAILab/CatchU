# U6 Claude MCP 본인 연결 — 관측 요구사항

## Sources

작성일: 2026-10-31. 입력: [U6 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U6 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR6·FR13.6·FR19.1·FR19.2, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 「에러 대응 최소선」, [납품 계획](../../../inception/delivery-planning/bolt-plan.md)의 B5, [보안 점검](../../../../../../../../docs/CatchU_security_checks.md) 「로그·오류 응답」, [코딩 절차](../../../../../../../../docs/CatchU_coding_procedures.md) 「자료와 실행 로그」, [통합 확인](../../../../../../../../docs/CatchU_통합확인.md) 「실제 Claude 연결」, team.md Walking Skeleton·Code Style, `api/src/ai-run/ai-run.ts`, `api/src/ai-run/ai-run-spec.ts`, `api/src/common/errors/api-exception.filter.ts`.

## 범위

NFR6은 별도 관제 화면을 만들지 않는다고 정했다. FR13.6은 기간별 사용 횟수를 기록하지 않는다고 정했다. U6의 관측은 실패·거부 때 남기는 api 로그 몇 줄과, 실제 Claude 확인을 합성 시험과 구분해 보고하는 것이다.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR6.1 | 실제 Claude 확인(기능 설계 S22~S24)과 합성 시험(S1~S21)을 구분해 보고한다. S1~S21 통과를 실제 연결 성공으로 보고하지 않는다. S22의 첫 연결이 '최소 연결 첫 결과'의 승인 자료다. 결과는 실패·미실행을 포함해 FR19.2 확인 표에 남긴다 | PR 검사 보고, `docs/CatchU_통합확인.md` 표 | NFR6, FR19.1, FR19.2, team.md Walking Skeleton, 납품 계획 B5 |
| NFR6.2 | 실패와 거부는 아래 「기록 항목」의 사건 이름과 정해진 칸으로만 남긴다 | 로그 내용 확인 시험 | 에러 대응 최소선 1, 기능 설계 BR5.7·BR6.2·BR6.3·BR8.1, 보안 점검 「로그·오류 응답」 |
| NFR6.3 | 로그와 오류 응답에 코드, 토큰과 그 해시, `state`, `code_challenge`, 돌아갈 주소, 요청 주소의 쿼리, `Origin` 값, `cursor`, 회원 ID, 자료 글, Redis 주소를 넣지 않는다. 오류 메시지를 로그에 옮기지 않고 오류 이름만 남긴다. 설정 오류는 값 대신 설정 이름을 적는다 | 기능 설계 S20(합성 토큰·코드·자료 글이 로그와 응답에 없음) | 기능 설계 BR1.4·BR8.1, team.md Code Style, 코딩 절차 「자료와 실행 로그」 |
| NFR6.4 | 정상 흐름은 남기지 않는다. 도구 호출·승인·토큰 발급의 성공을 로그에 쌓지 않고 호출 횟수를 어디에도 저장하지 않는다. 시작 값 분당 60회의 조정은 S22에서 `mcp_rate_limited`가 나오는지로 판단한다 | 로그 내용 확인 시험(정상 호출에 로그 없음), S22 | FR13.6, 기능 설계 BR6.1·BR6.4 |
| NFR6.5 | 실제 Claude 확인의 기록은 결과만 공유한다. 승인 주소·`state`·토큰·응답 글을 이슈·PR·AI에 남기지 않고, 터널은 합성 자료로만 쓰고 확인 뒤 바로 닫는다 | PR 검사 보고 | 기능 설계 S22·S24, 코딩 절차 「자료와 실행 로그」 |

## 기록 항목

로그는 기존 코드(`api/src/ai-run/ai-run.ts`)와 같은 객체 형식이고 오류 이름은 형식을 확인한 값만 남긴다(`errorName`). 상태 조회·승인·해제처럼 Nest 처리기 안에서 끝나는 실패는 기존 `ApiExceptionFilter`가 메서드·등록 경로·예외 분류만 남기므로 사건을 더하지 않는다. 아래는 그 필터를 거치지 않거나 응답만으로 원인을 알 수 없는 것이다.

| 사건 | 수준 | 칸 | 남기는 때 |
|---|---|---|---|
| `mcp_rate_limit_off` | warn | 없음(문구 「MCP 빈도 제한 꺼짐」) | 기동 때 큐 주소가 없으면 한 번 |
| `mcp_rate_limit_error` | warn | 오류 이름 | 빈도 집계 오류·1초 초과 |
| `mcp_rate_limited` | warn | 도구 이름 | 분당 한도를 넘은 호출 |
| `mcp_tool_failed` | error | 도구 이름, 오류 이름 | 도구의 DB 실패 |
| `mcp_token_check_failed` | error | 오류 이름 | 토큰 확인 중 DB 실패 |
| `mcp_origin_rejected` | warn | 없음 | `/v1/mcp`의 `Origin` 거부 |
| `mcp_token_exchange_refused` | warn | 이유 종류(코드 없음·만료·이미 씀·돌아갈 주소·클라이언트·`resource`) | U6 코드가 내는 토큰 교환 거부. 응답은 모두 `invalid_grant`다 |
| `mcp_oauth_failed` | error | 단계(`register`·`authorize`·`token`), 오류 이름 | SDK에 넘긴 저장 단계의 DB 실패(reliability-requirements NFR4.10) |

남기지 않는 것: `/v1/mcp`의 401, 입력 오류, `INVALID_CURSOR`처럼 응답으로 충분한 것. 만료된 토큰으로 호출할 때마다 로그가 쌓이지 않게 한다. SDK가 먼저 거부하는 PKCE 틀림은 U6 코드를 거치지 않아 남길 자리가 없다.

## 채택하지 않은 것

- 지표 수집·경보·대시보드: NFR6이 별도 관제 화면을 만들지 않는다고 정했다.
- 정상 호출과 회원별 기록: FR13.6과 기능 설계 BR6.4가 기간별 사용 횟수를 기록하지 않는다고 정했다.
