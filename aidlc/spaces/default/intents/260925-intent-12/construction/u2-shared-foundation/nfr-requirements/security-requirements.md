# U2 공용 기반 — 보안 요구사항

## Sources

작성일: 2026-10-27. 입력: [U2 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U2 업무 규칙](../functional-design/rules.md)(rules)의 BR2·BR3·BR6·BR7·BR9, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR1·NFR2·NFR5와 FR14·FR20, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-01·C-04~C-06, 저장소의 [보안 점검](../../../../../../../../docs/CatchU_security_checks.md)과 api/docs/auth-sessions.md(10월 세션 확인), team.md Code Style.

## 위협과 대응 범위

U2가 다루는 위험은 다섯이다: 남의 자료 접근(탈퇴·파일), 탈퇴 뒤 접근이 남는 일, AI 입력 속 숨긴 지시, 비밀값·사용자 자료가 로그로 새는 일, 동의 없이 외부 AI로 자료가 가는 일. 새 인증 방식은 만들지 않고 10월 인증(Bearer Access + Refresh 쿠키, 공통 Guard의 세션·회원 확인, Origin·CSRF 검사)을 그대로 쓴다.

## 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR1.1 | 탈퇴 API는 인증된 본인만 탈퇴시킨다. 회원 ID를 입력으로 받지 않고 10월 Origin·CSRF 검사를 통과해야 한다 | 시험: 인증 없음 401, Origin 다름 403 | BR7.1, NFR1 |
| NFR1.2 | 탈퇴 1단계 커밋 뒤에는 그 회원의 모든 세션·발행 링크·MCP 접근이 막힌다. Access 토큰이 남아 있어도 공통 Guard가 세션을 확인해 401이다 | 시나리오 S24·S26, 보호 흐름 3 「탈퇴 뒤 차단」 | BR7.2, FR14.1, FR19.1 |
| NFR1.3 | 파일 저장 키는 `members/{uuid}/`로 시작해야 하고 `..`·빈 마디·역슬래시·절대 경로를 거부하며, 실제 경로가 저장 뿌리 밖이면 거부한다 | 시나리오 S22 | BR6.2, C-05 |
| NFR1.4 | 저장 뿌리·드라이버 설정이 없거나 틀리면 api 기동을 멈춘다(판정할 수 없으면 허용하지 않음) | 시험: 잘못된 설정으로 기동 실패 | BR6.1, 보안 점검 「설정·개발용 기능」 |
| NFR1.5 | 시험 전용 권한 우회를 두지 않는다. 개발용 로그인은 NODE_ENV가 development·test일 때만 켜진다(10월 그대로) | 코드 리뷰 | NFR1, BR9.2 |
| NFR1.6 | 비밀값(Claude API 키, Voyage AI 키, DB·Redis 자격정보)은 환경변수·SSM으로만 받고 Git·예시 파일·로그·화면·PR에 남기지 않는다. 예시 파일에는 이름만 둔다 | 코드 리뷰, PR 보안 점검 | team.md Code Style, 보안 점검 |
| NFR2.1 | 게이트가 부르는 모델은 Haiku 5.5이고, SONNET은 질의응답(NFR3 조정)에서만 허용한다. 판정 AI는 없다 | 시험: feature가 QNA가 아닌데 SONNET이면 거부 | NFR2, FR6.9, C-01 |
| NFR2.2 | 모든 생성 호출에 숨긴 지시 방어·역량 평가 표현 금지 공통 문구를 붙이고, 질문·JD 줄(userText)은 문서 뒤의 신뢰하지 않는 입력으로 넘긴다(U1 BR2.3 위치 그대로) | 시험: 지시문 구성 확인 | BR3.2, AC6.3.7, 보안 점검 LLM 기준 |
| NFR2.3 | 생성 문장의 숫자·PR 번호·파일 이름·영어 표기를 근거와 기계 대조하고 맞지 않으면 버린다. 이것만으로 NFR2의 "근거에 없는 사실은 확정하지 않는다"를 충족했다고 보지 않으며, NFR3의 사람 확인과 함께 본다 | 시나리오 S8~S16d | BR3.4~BR4.7, NFR2 |
| NFR2.4 | 동의 전에는 외부 AI로 자료를 보내는 실행을 접수하지 않는다(403 `AI_CONSENT_REQUIRED`). 동의 확인은 하루 횟수보다 먼저 한다 | 시나리오 S5 | BR2.2, FR20.1 |
| NFR2.5 | 고지는 Claude API(Anthropic)·Voyage AI(운영사 MongoDB)와 문의 경로 한 줄을 보이고, 올린 자료를 가리지 않고 보낸다는 사실을 적는다 | 화면 확인 | BR2.4, FR20.1~20.3 |
| NFR5.1 | 탈퇴는 즉시 실제 삭제한다: 1 접근 차단 → 2 회원 파일 → 3 GitHub 자격정보 파일 → 4 회원 행 연쇄 삭제. 실패하면 성공으로 응답하지 않는다 | 시나리오 S24·S25 | BR7.2~BR7.5, NFR5, FR14.1 |
| NFR5.2 | U2의 새 표(`daily_execution_count`, `ai_consent`)는 회원 외래 키를 ON DELETE CASCADE로 두고, 연쇄 삭제 시험(test/db/member-cascade-delete.test.cjs)에 포함한다 | DB 시험 | BR7.7, C-06, FR14.8 |
| NFR5.3 | 큐 작업의 payload에는 ID만 둔다(`publicationId`, `runId`). 사용자 글·근거 글은 큐에 넣지 않는다 | 코드 리뷰 | C-02, team.md Code Style |

## 로그에 남기지 않는 것

AI 입력·출력 글, 근거 글, 질문·JD 줄, 파일 내용, 토큰·키, 이메일. 남기는 것은 기능 이름·건수·오류 종류·실패 단계 번호·runKey뿐이다(observability-requirements.md).
