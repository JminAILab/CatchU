# U6 Claude MCP 본인 연결 — 신뢰성 요구사항

## Sources

작성일: 2026-10-31. 입력: [U6 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U6 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4·NFR5·FR14.1·FR14.6·FR14.8·FR19.1, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-06·C-15와 「에러 대응 최소선」, [보안 점검](../../../../../../../../docs/CatchU_security_checks.md) 「로그·오류 응답」, team.md Code Style, SDK 1.32.2의 `server/auth/handlers/token.js`·`register.js`·`authorize.js`, `server/auth/middleware/bearerAuth.js`, `api/src/common/errors/api-exception.filter.ts`, `api/src/ai-run/ai-run.ts`, `deploy/aws/k8s/api.yaml`.

## 범위

가동률·복구 수치는 새로 만들지 않는다(NFR4). U6의 신뢰성은 "실패는 숨기지 않고 사람이 다시 시도한다", "함께 바뀌어야 하는 것은 한 트랜잭션이다", "지운 자료와 끊은 연결이 남지 않는다" 세 가지다. 기능 설계의 「받아들이는 한계」(functional-spec)는 그대로 두고, 여기에는 이 단계에서 더한 것만 적는다.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR4.9 | 실패를 숨기지 않고 자동으로 다시 돌리지 않는다. 토큰 확인 중 DB 실패는 401로 바꾸지 않고 500이다. 도구의 DB 실패는 `INTERNAL_ERROR`이고, 승인·상태·해제의 DB 실패는 500이며 화면이 오류를 보여 준다. 다시 시도는 회원이나 Claude를 쓰는 사람이 한다 | 기능 설계 S9·S21, 도구 DB 실패 합성 시험 | 기능 설계 BR4.8·BR5.7·BR7.2·BR7.5, 에러 대응 최소선 1·2 |
| NFR4.10 | SDK의 OAuth 처리기와 토큰 확인은 처음 보는 오류를 로그 없이 500으로 바꾼다. 그래서 U6이 SDK에 넘기는 저장 단계(클라이언트 조회·저장, 코드·토큰 처리, 토큰 확인)는 DB 오류의 오류 이름을 로그에 남긴 뒤 다시 던진다. `invalid_grant`처럼 의도한 OAuth 오류는 여기에 들지 않는다. Nest 처리기 안의 실패(상태 조회·승인·해제)는 기존 `ApiExceptionFilter`가 이미 남기므로 더하지 않는다 | `/register`·`/authorize`(클라이언트 조회)·`/token`·`/v1/mcp`의 합성 DB 실패 시험: 500과 로그 한 줄 | team.md Code Style(예외를 삼키지 않음), 보안 점검 「로그·오류 응답」, 위 SDK 파일 |
| NFR4.11 | Redis가 없거나 멈춰도 읽기는 돈다. 주소가 없으면 연결하지 않고 기동 로그를 한 번 남긴다. 오류나 1초 초과면 세지 않고 통과시키며 오류 이름만 경고로 남긴다. 연결은 끊긴 동안 명령을 쌓지 않고 앱이 끝날 때 닫는다. 연결 자체의 오류는 같은 끊김이 이어지면 첫 오류만 남긴다(`AiRun`의 `watch`와 같다). 그동안 제한이 꺼지는 것은 담당이 받아들인 결정이다 | 기능 설계 S16 | 기능 설계 BR6.2·BR6.3 |
| NFR4.12 | 함께 바뀌어야 하는 것은 한 트랜잭션이다. 승인(등록 갱신·코드 생성), 토큰 교환(코드 소비·연결·토큰 교체·만료 행 정리), 전체 해제(쓰지 않은 코드·토큰·연결)가 그렇다. 해제와 진행 중 교환이 겹쳐도 토큰이 남지 않는다는 추론은 실제 DB로 확인한다 | 기능 설계 S6·S7·S8·S17 | 기능 설계 BR3.7·BR4.3·BR4.4·BR7.2, 에러 대응 최소선 5·6 |
| NFR4.13 | api를 다시 띄워도 연결이 끊기지 않는다. 토큰과 연결은 DB에 있고 MCP 세션은 서버에 없다. SDK IP 집계만 풀린다 | 코드 검토, 기능 설계 S13(서버에 세션이 생기지 않음) | 기능 설계 BR2.5·BR5.6 |
| NFR5.1 | 탈퇴가 부르는 세 표의 이름과 `member_id` 칸을 그대로 쓰고, 새 외래 키는 모두 연쇄 삭제다. 표를 만드는 PR에서 `api/docs/member-withdrawal-deletion.md` 행과 `test/db/member-cascade-delete.test.cjs`의 `MEMBER_ROWS`를 더한다. 표가 합쳐지면 U2 담당이 탈퇴 통합 시험을 실제 표로 다시 돌린다 | 기능 설계 S19 | NFR5, FR14.1, FR14.8, C-06, 기능 설계 BR7.4 |
| NFR5.2 | Catch·텍스트 자료의 사본을 두지 않는다. 도구는 요청마다 원본 표를 읽고 캐시·파일·다른 표에 저장하지 않으므로 지운 자료는 다음 호출에서 나오지 않는다. Redis에는 횟수만 있고 키는 만료로 사라진다 | 기능 설계 S10·S11, 코드 검토 | NFR5, C-06, 기능 설계 BR6.4 |
| NFR5.3 | 해제·탈퇴는 다음 호출부터 막는다. 다음 도구 호출은 401이고 쓰지 않은 코드는 `invalid_grant`다. 재가입하면 새 회원이라 다시 동의한다. S19가 U6 쪽의 보호 흐름 「탈퇴 뒤 차단」이다 | 기능 설계 S17·S19 | FR14.1, FR14.6, FR19.1, 기능 설계 BR3.3·BR4.7·BR7.2 |

## 알려진 한계

- EKS에도 지금은 큐 주소가 없다(`deploy/aws/k8s/api.yaml` 「꺼 둔 기능」). 큐 연결을 켜기 전까지는 EKS에서도 빈도 제한이 꺼지고 기동 로그가 남는다. 기능 설계 BR6.2의 「함께 켜진다」는 켠 뒤의 이야기다. 개발 서버의 받아들인 위험과 함께 #389·#276에 알린다.
- SDK 안에서 끝나는 실패(PKCE 틀림, 요청 형식 오류, 등록 IP 한도)는 U6 코드를 거치지 않아 로그가 남지 않는다. 응답으로는 드러난다.

## 채택하지 않은 것

- 재시도·회로 차단기·대체 경로: 다시 시도는 사람이 하고(에러 대응 최소선 2) 시연 규모에 근거가 없다.
- 만료 행을 지우는 주기 작업: 다음 토큰 교환과 등록 요청 때 지운다(기능 설계 BR2.4·BR4.4).
