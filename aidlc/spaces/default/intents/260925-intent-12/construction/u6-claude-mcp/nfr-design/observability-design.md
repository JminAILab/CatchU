# U6 Claude MCP 본인 연결 — 관측 설계

## Sources

작성일: 2026-11-01. 입력: [관측 요구사항](../nfr-requirements/observability-requirements.md)(observability-requirements)의 NFR6.1~NFR6.5와 「기록 항목」, [성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U6 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 S20·S22~S24와 「주요 시나리오와 확인」, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 「에러 대응 최소선」, [비기능 설계 질문·답변](nfr-design-questions.md)의 요약 확인, [통합 확인](../../../../../../../../docs/CatchU_통합확인.md) 「실제 Claude 연결」, [코딩 절차](../../../../../../../../docs/CatchU_coding_procedures.md) 「자료와 실행 로그」, api 현재 코드(`api/src/ai-run/ai-run.ts`, `api/src/ai-run/ai-run-spec.ts`, `api/src/common/errors/api-exception.filter.ts`).

## 범위

NFR6은 별도 관제 화면을 만들지 않고, FR13.6은 기간별 사용 횟수를 기록하지 않는다. U6의 관측은 실패·거부 때 남기는 api 로그 몇 줄과, 실제 Claude 확인을 합성 시험과 구분해 보고하는 것이다. NFR4가 새 수치를 막으므로 SLI·SLO·경보 기준은 두지 않는다.

## 로그 방식

`AiRun`과 같이 Nest `Logger`에 객체 하나를 넘긴다(`logger.warn({ event, ... })`). 오류 이름은 기존 `errorName`으로 형식을 확인한 값만 쓴다. 로그 객체는 아래 표의 칸만 가진 타입 하나로 만들어 토큰·코드·자료 글·`cursor`·회원 ID가 들어갈 자리가 없게 한다(NFR6.3).

## 기록 항목

| 사건 `event` | 수준 | 칸 | 남기는 자리 |
|---|---|---|---|
| `mcp_rate_limit_off` | warn | 문구 「MCP 빈도 제한 꺼짐」 | 빈도 집계를 만들 때 큐 주소가 없으면 한 번 |
| `mcp_rate_limit_error` | warn | `error` | 셈 명령의 오류·1초 초과, 연결 자체의 첫 오류 |
| `mcp_rate_limited` | warn | `tool` | 도구 감싸기에서 한도를 넘은 호출 |
| `mcp_tool_failed` | error | `tool`, `error` | 도구 감싸기에서 예상하지 못한 오류 |
| `mcp_token_check_failed` | error | `error` | 토큰 확인 함수의 DB 실패 |
| `mcp_origin_rejected` | warn | 없음 | `rejectForeignOrigin` |
| `mcp_token_exchange_refused` | warn | `reason`(코드 없음·만료·이미 씀·돌아갈 주소·클라이언트·`resource`) | 코드 challenge 읽기의 거부, 코드 교환이 되돌린 뒤. 응답은 모두 `invalid_grant`다 |
| `mcp_oauth_failed` | error | `step`(`register`·`client`·`token`), `error` | 저장 단계 감싸기 |

**단계 이름.** 요구사항 표의 `register`·`authorize`·`token`에서 `authorize`를 `client`로 바꿨다. `getClient`는 `/authorize`와 `/token`이 함께 부르므로 어느 쪽인지 알 수 없고, `/authorize`의 DB 작업은 이 조회뿐이다. `token`은 코드 challenge 읽기와 코드 교환이다(요약 확인).

남기지 않는 것: `/v1/mcp`의 401, 입력 오류, `INVALID_CURSOR`, 정상 도구 호출·승인·토큰 발급. 만료된 토큰으로 호출할 때마다 로그가 쌓이지 않는다. SDK가 먼저 거부하는 PKCE 틀림은 남길 자리가 없다.

Nest 처리기 안에서 끝나는 실패(상태 조회·승인·해제)와 본문 파서 오류는 기존 `ApiExceptionFilter`가 메서드·등록 경로·예외 분류만 남긴다. `Origin` 거부의 `AUTH_ORIGIN_FORBIDDEN`은 그 필터가 남기지 않으므로 위 표에 있다.

## 실제 연결 확인 (NFR6.1·NFR6.5)

- S1~S21은 합성 Claude(SDK 클라이언트 흐름을 따르는 시험 도우미)로 api·web 시험 묶음에서 돈다. PR 검사 보고에 합성 시험으로 적고 실제 연결 성공으로 적지 않는다.
- S22~S24는 사람이 실제 Claude로 한다. 결과는 통과·실패·미실행을 나눠 `docs/CatchU_통합확인.md` 표에 남긴다. S22의 첫 연결이 '최소 연결 첫 결과'의 승인 자료다.
- 승인 주소·`state`·토큰·응답 글은 이슈·PR·AI에 남기지 않고 결과만 적는다. 터널은 합성 자료로만 쓰고 확인 뒤 바로 닫는다.
- 시작 값 분당 60회의 조정은 S22에서 `mcp_rate_limited`가 나오는지로 판단한다(NFR6.4).

## 시험으로 확인하는 것

- 로그 내용 시험: 사건마다 남긴 객체의 칸이 위 표와 같다. 정상 호출에는 U6 로그가 없다(NFR6.4).
- S20: 모든 시나리오의 로그 출력과 오류 응답에 합성 코드·토큰·해시·`state`·자료 글이 없다. 쿼리에 토큰을 실은 요청, `Origin`이 다른 요청, 정의하지 않은 입력 이름을 보낸 요청도 포함한다.
- 저장 단계 합성 DB 실패 시험: `/register`, `/authorize`(클라이언트 조회), `/token`, `/v1/mcp`마다 500과 로그 한 줄(NFR4.10).

## 두지 않는 것

지표 수집, 경보, 대시보드, 분산 추적, 상관 ID, 정상 호출·회원별 기록은 두지 않는다(observability-requirements 「채택하지 않은 것」).
