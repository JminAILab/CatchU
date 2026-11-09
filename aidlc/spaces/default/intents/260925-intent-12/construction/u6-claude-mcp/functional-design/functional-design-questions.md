# u6-claude-mcp 기능 설계 질문

입력: `unit-of-work.md`, `unit-of-work-story-map.md`, `stories.md`(US13.1·US13.2), `requirements.md`(FR13), `components.md`(ClaudeMcp), `contract-summary.md`(C-13·C-14·C-15), `decisions.md`(ADR-009), 이슈 #389, Claude 커넥터 공식 문서.

요구사항에서 "개발 담당 결정"으로 남긴 값과, 근거가 없어 담당이 정해야 하는 것만 묻는다. 나머지는 기능 설계에 기본값으로 적고 요약 확인 때 함께 보인다.

## Q1. [보안] Claude 연결을 얼마나 자주 다시 승인하게 할까요?

자동 갱신이 없으므로(FR13.1, 갱신 토큰 없음) 접근 토큰 수명이 곧 재승인 주기다. 수명은 설정값으로 두어 실제 Claude의 만료 재승인을 확인할 때는 짧게 줄인다. 어느 값이든 공수는 같다.

A. 30일. 한 달에 한 번 다시 승인한다. 토큰이 새면 최대 30일 노출되지만 전체 해제로 바로 막을 수 있다.
B. 7일. 노출 기간이 줄어드는 대신 매주 다시 승인한다.
C. 1일. 노출 기간이 가장 짧지만 매일 다시 승인해야 해 쓰기 번거롭다.
X. Other (please specify)

[Answer]: B. 7일. 웹 로그인 세션 최대 7일(#250 팀장 결정, api/docs/auth-sessions.md)과 맞춘다.

## Q2. [보안] Claude 연결에 등록할 수 있는 돌아갈 주소(redirect URI)를 어디까지 허용할까요?

Claude는 자기를 동적 클라이언트 등록(DCR)으로 등록하므로 등록 주소는 인증 없이 열린다. 아무 주소나 받으면 누군가 자기 서버를 돌아갈 주소로 등록한 뒤 회원에게 승인 화면 링크를 보내 승인 코드를 받아 갈 수 있다. Claude 공식 문서상 웹·Desktop·모바일은 `https://claude.ai/api/mcp/auth_callback` 하나를 쓰고, 이 주소가 `https://claude.com/api/mcp/auth_callback`으로 바뀔 수 있다.

A. Claude 콜백 두 개만 허용한다. 위 가짜 등록을 막고 공수는 등록 때 비교 한 번이다. 로컬 시험은 개발 환경 설정으로 localhost 콜백을 더한다. Claude Code에서는 연결할 수 없다(FR13.1 범위 밖).
B. https 주소면 모두 허용한다. 다른 MCP 클라이언트도 연결할 수 있지만 가짜 등록을 막지 못하고 승인 화면의 안내에만 기대게 된다. 요구사항에 근거가 없다.
C. Claude 콜백과 Claude Code의 localhost 콜백(포트 무시)을 허용한다. Claude Code에서도 연결할 수 있지만 포트를 무시하는 비교와 그 시험이 늘고, 로컬 프로그램이 콜백을 가로채는 위험을 승인 화면 경고로 다뤄야 한다. 요구사항에 근거가 없다.
X. Other (please specify)

[Answer]: X. 1번 기준으로 한다. 운영은 https://claude.ai/api/mcp/auth_callback 하나만 정확히 일치로 받는다(근거: Anthropic 연결 개발 문서 「Callback URLs」 https://claude.com/docs/connectors/building/authentication#callback-urls — 웹·Desktop·모바일은 이 콜백 하나를 쓴다). 같은 절은 Claude Code용 localhost 콜백도 받으라고 하지만 Claude Code는 FR13.1(Claude 웹·Desktop) 범위 밖이라 운영에서 받지 않고, localhost는 로컬 시험용으로 개발 환경 설정에서만 더한다. 승인 화면에 돌아갈 주소의 호스트를 보여 준다(MCP 명세 https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#localhost-redirect-uri-risks)

## Q3. [백엔드] 요청 빈도 제한은 무엇을 세고 어떤 형태로 거부할까요?

제한 값과 거부 형태는 개발 담당 결정이다(FR13.6, 입력 §3 "실제 Claude 호출량을 보고 넉넉하게"). 시작 값은 회원당 분당 60회로 두고 첫 실제 연결 때 호출량을 보고 조정한다.

A. 도구 호출만 회원 기준으로 세고, 넘으면 도구 오류 결과(`RATE_LIMITED`)로 돌려준다. Claude가 이유를 문장으로 전할 수 있고, 연결 절차 요청(초기화·도구 목록)이 제한에 걸려 연결이 끊긴 것처럼 보이지 않는다.
B. 모든 MCP 요청을 세고, 넘으면 HTTP 429로 돌려준다. 표준 형태이고 앞단 한 곳에서 처리하지만, 연결 절차 요청도 막혀 Claude 화면에 일반 오류처럼 보일 수 있다.
X. Other (please specify)

[Answer]: A

## Q4. [백엔드] Redis가 없는 환경에서 빈도 제한을 어떻게 할까요?

빈도 집계는 Redis에 두기로 했다(components, C-06). 그런데 개발 서버 실행 설정(`deploy/compose.single.yaml`)에는 Redis가 없고, 이슈 #389에서 개발 서버 api는 큐 연결을 켜지 않기로 했다(2026-10-27 팀장 결정). 11/13 1차 통합 확인은 개발 서버에서 한다.

A. 제한을 건너뛰고 기동 로그에 한 번 남긴다. 기존 AiRun의 "큐 주소가 없으면 연결하지 않는다"와 같은 방식이고 새 설정이 없다. 개발 서버에서는 제한이 돌지 않으며, 확인은 자동 시험과 EKS에서 한다. 통합 확인표에 빈도 제한 행은 없다.
B. 메모리 카운터로 대신한다. 개발 서버에서도 제한이 돈다. 코드 약 20~30줄과 시험이 늘고, 프로세스가 여럿이면 따로 센다(EKS에는 Redis가 있어 해당 없음).
C. Redis가 없으면 도구 호출을 거부한다. 제한 없는 상태를 막지만 개발 서버에서 실제 Claude 연결을 확인할 수 없어, 팀장에게 Redis 추가를 요청해야 한다.
X. Other (please specify)

[Answer]: X. 1번 기준으로 한다. 빈도 집계는 큐와 같은 Redis(CATCHU_QUEUE_REDIS_URL)를 쓰고, 이 값이 없으면 연결하지 않고 기동 로그에 "MCP 빈도 제한 꺼짐"을 한 번 남긴 뒤 제한 없이 돈다(새 환경변수 없음). AiRun과 같은 것은 큐 주소가 없으면 연결하지 않는다는 점뿐이고, AiRun은 작업이 실패하지만 여기서는 보호가 꺼진다는 점이 다르다. EKS는 AI 처리에 같은 Redis가 필요해 제한이 함께 켜진다. 개발 서버에서 제한이 꺼지는 것은 받아들인 위험으로, #389에 알려 개발 서버 README에 적게 한다(#392와 같은 방식).

## Consolidated Summary Confirmation

답변

- 재승인 주기(Q1): 접근 토큰 수명 7일. 웹 로그인 세션 최대 7일(#250)과 맞춘다.
- 돌아갈 주소(Q2): 운영은 `https://claude.ai/api/mcp/auth_callback` 하나만 정확히 일치로 받는다. Claude Code는 FR13.1 범위 밖이라 운영에서 받지 않고, localhost는 로컬 시험용으로 개발 환경 설정에서만 더한다. 승인 화면에 돌아갈 주소의 호스트를 보여 준다.
- 빈도 제한(Q3): 도구 호출만 회원 기준으로 세고, 넘으면 도구 오류 `RATE_LIMITED`로 돌려준다. 시작 값은 회원당 분당 60회이고 첫 실제 연결 때 호출량을 보고 조정한다.
- Redis 없는 환경(Q4): 큐와 같은 Redis(`CATCHU_QUEUE_REDIS_URL`)를 쓴다. 값이 없으면 연결하지 않고 기동 로그에 "MCP 빈도 제한 꺼짐"을 한 번 남긴 뒤 제한 없이 돈다. 새 환경변수는 없다. EKS는 AI 처리에 같은 Redis가 필요해 제한이 함께 켜진다. 개발 서버에서 꺼지는 것은 받아들인 위험으로, #389에 알려 개발 서버 README에 적게 한다(#392와 같은 방식).
- Redis 오류(Q5): Redis 주소가 있는데 Redis 오류가 나면 U5(BR3.2)와 같게 세지 않고 통과시키고 경고 로그만 남긴다. 그동안은 제한이 꺼진다. 처음에 거부로 정했다가 U5와의 차이와 장애 영향을 확인하고 바꾼 담당 결정이다. Redis가 멈춰 응답하지 않을 때 호출이 걸리지 않게 빈도 집계 명령에 1초 상한을 두고, 넘으면 같은 오류로 친다.
- 인증 전 주소(Q6): 회원을 아직 모르므로 SDK 기본 IP 제한을 유지한다(등록 시간당 20회, 토큰 15분 50회, 승인 시작 15분 100회). FR13.6·C-15의 "IP로 세지 않음"에 대한 예외로 기능 설계에 적는다. `request.ip`는 `TRUST_PROXY_CIDRS`가 있어야 실제 주소이고, 없으면 Caddy 뒤 모든 요청이 앞단 주소 하나로 보여 한도 하나를 나눠 쓴다(개발 서버·EKS에는 값이 있다). 등록·토큰 요청은 Claude 서버에서 오므로 모든 회원이 Claude 송신 주소(`160.79.104.0/21`)의 한도를 함께 쓴다. 등록 한도를 넘으면 모든 회원의 새 연결이 최대 1시간 막히고, 이미 연결된 회원의 도구 호출은 영향이 없다. 승인 시작은 회원 브라우저 주소로 센다. 집계는 프로세스 메모리에 있어 프로세스마다 따로 세고 api를 다시 띄우면 풀린다.

질문하지 않고 가장 단순한 안으로 정한 것

- 주소: Claude에 넣는 MCP 주소는 `https://<도메인>/v1/mcp`다(앞단이 이미 `/v1`을 api로 보낸다). 운영의 공개 주소는 기존 `AUTH_WEB_ORIGIN`을 그대로 써서 필수 설정을 늘리지 않는다(운영은 web/api 동일 출처). 앱 루트에 둘 주소는 `/authorize`, `/token`, `/register`, `/.well-known/oauth-protected-resource*`, `/.well-known/oauth-authorization-server*`이고 이 목록을 #389·#276에 넘긴다. #389 본문에 있는 해지 주소(`/revoke`)는 두지 않는다. 해제는 CatchU 화면의 전체 해제뿐이다(FR13.1).
- 로컬의 api 주소: 로컬은 web(3000)과 api(3001)의 주소가 달라 `AUTH_WEB_ORIGIN`을 쓰면 `/authorize`·`/token`·`/v1/mcp`가 web을 가리킨다. 그래서 `NODE_ENV`가 `development`·`test`일 때는 `MCP_DEV_PUBLIC_ORIGIN`으로 api 주소를 주고, 없으면 `http://127.0.0.1:{PORT}`를 쓴다. 승인 화면으로 보내는 주소만 어느 환경이든 `AUTH_WEB_ORIGIN`이다. 화면의 복사 주소는 web이 만들지 않고 api 응답(`mcpUrl`)으로 받는다. FR19.1의 "기본 호환은 개발 초기에 먼저 확인"은 이 값에 https 터널 주소를 줘서 할 수 있다(합성 자료만, 확인 뒤 바로 닫는다).
- 승인 흐름: Claude가 `/authorize`로 오면 api가 클라이언트와 돌아갈 주소를 확인한 뒤 web의 `/profile/claude/authorize`로 넘긴다. 로그인이 안 됐으면 기존 로그인 화면을 거쳐 돌아온다. web은 회원 토큰을 메모리에만 두므로 승인·거절 버튼은 `fetch`로 토큰을 실어 `POST /v1/me/mcp-connection/authorizations`를 보낸다. api는 클라이언트와 돌아갈 주소를 다시 확인한 뒤 그 주소에 코드·state를 붙여 JSON(`redirectTo`)으로 응답하고, web이 그 주소로 이동한다. 승인 대기 표는 두지 않는다.
- 표: `mcp_access_token`·`mcp_authorization_code`·`mcp_connection`·`mcp_client`를 둔다. 탈퇴 코드(`api/src/withdrawal/withdrawal.service.ts`)가 앞의 셋을 `member_id`로 지우고 표가 없으면 건너뛰므로 이 세 표 이름과 `member_id` 칸을 그대로 쓴다. 이름이 달라지면 탈퇴가 오류 없이 건너뛰어 토큰이 남는다. 새 외래 키는 모두 연쇄 삭제이고(C-06, `test/db/member-cascade-delete.test.cjs`), 같은 PR에서 `api/docs/member-withdrawal-deletion.md`에 행을 더한다.
- 승인에 쓰이지 않은 등록 정리: `mcp_client`에 `approved_at`을 두고 승인 버튼으로 코드를 만들 때 한 번 채운다. 등록 요청을 받을 때 `approved_at`이 비어 있고 등록한 지 7일이 지난 행을 함께 지운다(타이머 없음). 승인에 쓰인 적 있는 등록은 지우지 않는다. 이 표를 가리키는 외래 키가 연쇄 삭제(C-06)라 지우면 그 연결·토큰까지 사라지고, Claude가 저장한 `client_id`를 재승인 때 다시 쓰는지 문서에 없기 때문이다. 등록 자체를 없애는 CIMD(공식 문서가 등록이 많을 때 권함)는 ADR-009의 클라이언트 등록 표와 달라 쓰지 않는다.
- 동의: 회원 단위로 판단한다. 그 회원의 연결 행이 하나라도 있으면 동의한 것이다. Claude는 새 연결마다 자기를 새 클라이언트로 등록하므로 클라이언트 단위로는 "한 번 동의"(AC13.2.1)를 지킬 수 없다. 전체 해제 뒤에는 다시 동의한다. 만료 뒤 재승인도 버튼을 눌러야 하고 자동 발급은 없다. 동의·재승인 화면 모두 "직접 시작한 연결이 아니면 취소하세요"를 보여 준다.
- 코드·토큰: 승인 코드는 5분·한 번만 쓴다. 접근 토큰은 불투명 난수이고 코드·토큰 모두 SHA-256만 저장하며 로그에 남기지 않는다. 요청마다 저장된 토큰·만료·연결(C-15)과 회원 상태(ACTIVE, 기존 세션 확인과 같은 기준)를 확인한다. 연결 행은 토큰 교환 때 만들고 같은 회원·클라이언트의 토큰은 교체하며, 그 회원의 만료된 토큰·연결·승인 코드를 함께 지운다. 갱신 토큰·`offline_access`·권한 범위(scope)는 없다. 공개 클라이언트로만 등록한다(비밀값 없음). `resource`를 보내면 MCP 주소와 같아야 한다.
- 새 설정은 선택값 셋뿐이다: `MCP_ACCESS_TOKEN_TTL_SECONDS`(기본 7일, 만료 재승인을 확인할 때 줄이는 용도로 7일을 넘기면 기동 실패), `MCP_DEV_REDIRECT_URIS`(정확히 일치 목록), `MCP_DEV_PUBLIC_ORIGIN`(위 「로컬의 api 주소」). 뒤의 둘은 `NODE_ENV`가 `development`·`test`가 아닐 때 값이 있으면 기동 실패다.
- 도구: `list_my_catches`, `list_my_text_materials` 둘만 두고 입력은 `cursor`뿐이다. 회원은 토큰에서만 정한다. 세션 없는 Streamable HTTP로 요청마다 독립 처리한다.
- 응답 크기: 한 페이지 40,000자 상한(Claude 도구 결과 한도 25,000토큰을 고려). 넘을 항목은 다음 페이지로 넘긴다. 항목 하나가 상한을 넘으면 글을 빼고 `bodyOmitted: true`(Catch는 `omitted: true`)로 표시해 다음으로 넘어가게 한다. 말없이 자르지 않는다.
- 오류: 도구 오류는 `RATE_LIMITED`, `INVALID_CURSOR`, `INTERNAL_ERROR`(DB 실패, 로그 남김)다. 토큰 없음·만료·해제는 HTTP 401과 `WWW-Authenticate`로 돌려줘 Claude가 재승인을 안내하게 한다.
- 연결 관리: `/profile/claude` 화면에 MCP 주소 복사, 상태(없음·연결됨·만료), 전체 연결 해제(확인 후)를 두고 `/profile`과 시작 안내 단계에서 이어 준다. API는 `GET /v1/me/mcp-connection`과 `DELETE /v1/me/mcp-connection`(204, 반복해도 같음)이다. 해제는 C-15 문구대로 그 회원의 접근 토큰·연결과 쓰지 않은 승인 코드를 한 트랜잭션으로 지운다. 진행 중인 토큰 교환과 겹쳐도 토큰이 남지 않게 승인 코드를 먼저 지운다. 쓴 코드 행은 다시 토큰으로 바꿀 수 없어 접근 차단과 상관없고, 그 회원의 다음 토큰 교환 때 만료 행으로 지워지거나 탈퇴 때 지워진다. 웹 로그아웃은 Claude 연결을 끊지 않는다.
- 계약 C-15 수정: 오류 `INVALID_CURSOR`·`INTERNAL_ERROR`, 필드 `bodyOmitted`·`omitted`는 C-15에 없으므로 더하고, Catch `title`을 실제 칸대로 `string|null`로 적는다. 해제 문구는 고치지 않는다. 레포 컨벤션 §2.1 「경계·계약 PR」대로 Unit 제출과 따로 통합 브랜치 대상 PR로 낸다. C-15의 소비자는 외부인 Claude라 가져다 쓰는 Unit이 없고 U9 담당은 11/13에 정하므로, 리뷰는 팀장에게 요청하고 팀장이 merge commit으로 합친다. 승인·상태·해제 API와 승인 코드 표의 칸은 Unit 안 세부라 계약 문서에 넣지 않고 기능 설계에 적는다(계약 「Unit 안 세부」, C-15 "엔드포인트 경로와 OAuth 세부는 U6 기능 설계에서 정한다").
- 받아들이는 한계: 처음 가입한 회원은 프로필 설정을 거치며 승인 흐름을 잃어 Claude에서 다시 시작해야 한다. Claude 쪽에서 연결을 지워도 서버는 알 수 없어 토큰은 만료나 전체 해제까지 유효하다. 승인에 쓰인 적 있는 `mcp_client` 행은 남는다(회원 참조 없음). Claude가 콜백을 `claude.com`으로 바꾸면 등록이 거부되므로 코드의 상수를 고쳐야 한다.
- 첫 실제 연결 때 확인: 갱신 토큰 없이 만료될 때 Claude의 표시, 공개 클라이언트 응답 수용, SDK 기본 메타데이터에 `refresh_token`이 보이는 것의 영향, 도구 오류가 Claude 화면에 어떻게 보이는지(공식 문서 두 곳의 설명이 다르다), Claude에서 넘어온 직후 `SameSite=Strict` 쿠키로 로그인이 복원되는지, 지워진 등록으로 다시 시도할 때 Claude가 새로 등록하는지. SDK 인증 도구는 동결·비권장 상태이고 판본(v1 또는 v2+legacy)은 코드 생성 계획에서 정한다(ADR-009).

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct

## Requested Changes Feedback

무엇을 바꿀까요?

[Answer]: 아래 지적과 결정이 맞는지 해당 파일과 승인 문서를 직접 열어 확인하고, 문제없는 것은 반영하고, 틀리거나 문제가 있는 것은 반영하기 전에 근거와 함께 알려 줘. ③·⑥은 내가 정한 것이지만, 요구사항·계약·기존 코드와 어긋나거나 놓친 위험이 있으면 마찬가지로 먼저 알려 줘. ① 탈퇴 코드(api/src/withdrawal/withdrawal.service.ts)가 mcp_access_token·mcp_authorization_code·mcp_connection을 member_id로 지우고 표가 없으면 건너뛰니, 이 세 표 이름과 member_id 칸을 그대로 쓴다고 적어 줘. ② 공개 주소를 AUTH_WEB_ORIGIN으로 쓰면 로컬은 web(3000)과 api(3001) 주소가 달라 /authorize·/token·/v1/mcp가 web을 가리킨다. 로컬 시험에서 api 주소를 어떻게 줄지 정해 줘. ③ Redis 주소가 있는데 Redis 오류가 나면 도구 호출을 거부하기로 정했다. 묻지 않고 정한 기본값이 아니라 내가 확인한 결정으로 기록해 줘. ④ INVALID_CURSOR·INTERNAL_ERROR와 bodyOmitted·omitted는 계약 C-15에 없으니, C-15 수정을 Unit 제출과 따로 PR로 낸다고 적어 줘(레포 컨벤션 §2.1 경계·계약 PR). ⑤ web은 회원 토큰을 메모리에만 두므로 승인 POST는 fetch로 보내고, api가 돌아갈 주소(코드·state 포함)를 응답하면 web이 그 주소로 이동한다고 고쳐 줘. ⑥ 인증 전 경로(등록·토큰 발급)는 IP별로 센다는 해석에 동의한다. 다만 request.ip는 TRUST_PROXY_CIDRS가 있어야 실제 주소이고 없으면 Caddy 뒤 모든 요청이 한도 하나를 나눠 쓴다는 점과, 모든 회원의 Claude 요청이 Claude 송신 주소를 함께 쓴다는 점을 적어 줘. ⑦ 승인에 쓰이지 않은 클라이언트 등록을 정리하는 규칙을 넣어 줘. ⑧ 요약의 "인증 전 주소" 항목이 화면에서 잘려 보이니, 고친 요약을 다시 보여 줄 때 그 항목은 끝까지 보여 줘.

## Q5. [백엔드] Redis 주소가 있는데 Redis 오류가 나면 도구 호출을 어떻게 할까요?

담당 결정은 거부다. 요구사항·계약·기존 코드와 어긋나지는 않는다. 계약 「에러 대응 최소선」 1(실패는 숨기지 않는다)과 코딩 절차 「기술」(끊기는 장애는 앱에서 복구하지 않는다)에 맞는다. 다만 반영 전에 알릴 점이 셋 있다.

- U5(#442, 리뷰 중) BR3.2는 같은 Redis 장애에서 반대로 통과·경고 로그다. 그쪽 이유는 "전체 지출 상한은 Claude 콘솔이 막는다"이고, MCP 빈도 제한에는 그런 바깥 보호가 없어 다르게 둘 이유가 있다.
- Redis가 멈춰 응답하지 않으면 오류가 나지 않고 도구 호출이 걸린다. 응답 없음도 오류로 치는 시간 상한이 있어야 결정대로 동작한다.
- EKS에서 Redis가 죽으면 DB가 멀쩡해도 MCP 읽기가 모두 막힌다. AI 처리도 같은 Redis라 함께 멈춘다.

A. 거부를 유지한다. 응답 없음도 오류로 친다(시간 상한은 AiRun 등록과 같은 값). 연결은 기동 때 연다.
B. U5와 같게 통과시키고 경고 로그만 남긴다. Redis 장애에도 읽기가 되지만 그동안 제한이 꺼진다.
X. Other (please specify)

[Answer]: B

## Q6. [보안] 인증 전 주소의 IP 제한을 FR13.6과 어떻게 맞출까요?

담당이 지적한 두 사실은 맞다. `request.ip`는 `TRUST_PROXY_CIDRS`가 있어야 실제 주소이고 없으면 앞단 주소 하나로 보여 모든 요청이 한도 하나를 나눠 쓴다(`api/src/trust-proxy.ts`, 개발 서버·EKS에는 값이 있다). 등록·토큰 요청은 Claude 서버(`160.79.104.0/21`)에서 오므로 모든 회원이 같은 송신 주소의 한도를 나눠 쓴다. EKS WAF에는 이 경로를 세는 규칙이 없다(`deploy/aws/waf/rules.json`).

어긋나는 점: FR13.6은 "회원 기준으로 짧은 시간의 요청 빈도와 응답 크기만 제한한다", "원격 연결 요청은 Claude 쪽 서버에서 오므로 IP가 아니라 회원 기준으로 센다"이고 C-15도 "IP로 세지 않음"이다. 등록·토큰이 바로 Claude 서버에서 오는 요청이라 같은 이유가 걸린다. 다만 이 요청에는 아직 회원이 없어 회원 기준으로 셀 수 없다.

놓친 위험: SDK 기본값은 등록 시간당 20회, 토큰 15분 50회, 승인 시작 15분 100회다(승인 시작은 회원 브라우저 주소로 센다). 등록 한도를 넘으면 모든 회원의 새 연결이 최대 1시간 막힌다. 이미 연결된 회원의 도구 호출은 영향이 없다. 실제 연결을 되풀이해 확인할 때 팀이 먼저 닿을 수 있다. 집계는 프로세스 메모리에 있어 프로세스마다 따로 세고 다시 띄우면 풀린다.

A. IP로 세기를 유지하고 "회원을 아직 모르는 경로의 예외"로 기능 설계에 적는다. 코드가 늘지 않는다.
B. 토큰 제한만 끄고 등록만 IP로 센다. 재승인이 공유 한도에 막히지 않는다. 옵션 한 줄이지만 인증 없는 토큰 요청의 DB 조회에 제한이 없어진다.
C. 등록 제한까지 끈다. FR13.6 문구에 그대로 맞지만 누구나 등록 표를 늘릴 수 있고 7일 뒤에야 지워진다.
X. Other (please specify)

[Answer]: A

## Requested Changes Feedback

무엇을 바꿀까요?

[Answer]: title은 C-15 PR에 넣고, 해제 문구 변경은 빼서 승인된 문구(쓰지 않은 승인 코드만 지움)를 따른다. C-15 PR 리뷰는 팀장에게 요청한다. 이 결정에 문제가 있으면 반영 전에 알려 주고, 없으면 요약에 반영해 다시 보여 줘.
