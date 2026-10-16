# 내부 API 요청 정보 조회 — #232, #121

LIVE 요청마다 `attemptId`로 내부 api에 한 번 묻는다. 응답의 접수 기록으로 요청 메시지를 대조하고, 같은 응답의 자격정보·선택 범위를 기존 수집 경계(`check_credential`·`check_selection`)에 넘긴다. 요청의 `credentialContextReference`와 `allowedScope.selectionReference`는 모두 그 `attemptId`와 같아야 한다(조회 전 자체 검사, [큐 소비자 「구조」](queue-consumer.md#구조)). 참조 자체는 권한이나 GitHub 토큰이 아니다. 기준은 [수집 통제 §3 A→F 자격정보 인계](../../docs/CatchU_collection_control_scope.md#3-af-자격정보-인계)이고, api 쪽은 [Worker 분석 시도 컨텍스트](../../api/docs/worker-context.md)다.

## 호출과 세 가지 결과

고정 경로 `GET /v1/internal/analysis-attempts/{attemptId}/context`를 `X-Worker-Key`로 인증한다. 회원 JWT나 GitHub 토큰을 이 머리글에 쓰지 않는다. 목적지는 기동 때 받은 신뢰된 설정에서만 정하며, 요청·응답의 URL로 바꿀 수 없다. 경로에 넣기 전에 시도 ID가 uuid인지 본다. redirect·재시도·자격정보 갱신은 하지 않는다.

`RequestContextClient.lookup(attemptId)`는 셋 중 하나를 돌려준다.

| 결과 | 언제 | 처리 순서가 하는 일 |
|---|---|---|
| 찾음(`ContextFound`) | 200이고 응답이 아래 모양에 맞으며 응답의 `attemptId`가 물은 값과 같음 | 응답의 접수 기록으로 요청을 대조한다(`check_request`). 다르면 진행 알림도 결과도 없이 거부하고, 같으면 수집·후보·생성으로 간다 |
| 모름(`ContextUnknown`, 이유) | 404 `RESOURCE_UNAVAILABLE` | 수집 없이, 진행 알림 없이 FAILED 결과 하나 |
| 실패(`ContextLookupFailed`, 원인) | 그 밖의 상태, 잘못된 404 본문, 연결 오류, 시간·크기 초과, 손상 응답, 응답의 `attemptId`가 다름 | 모름과 같다(이유 `REQUEST_CONTEXT_UNAVAILABLE`) |

조회 모름·실패의 결과를 받을지는 E가 정한다. E는 결과의 맥락 일곱 개를 접수 기록과 대조해 닫힌 요청·지난 시도의 결과를 거부한다. 이 결과에는 대조하지 않은 메시지 값이 들어가므로, 고지 판본·허용 자료 종류만 접수 기록과 다른 요청도 곧바로 실패로 닫힐 수 있다(10/15 팀장 결정, [수집 통제 1.2](../../docs/CatchU_collection_control_scope.md#12-요청의-허용-범위를-적용하는-순서)). 원인 코드는 `CONTEXT_HTTP_<상태>`·`CONTEXT_TIMEOUT`·`CONTEXT_TRANSPORT_FAILED`·`CONTEXT_RESPONSE_TOO_LARGE`·`CONTEXT_RESPONSE_INVALID`·`CONTEXT_REFERENCE_INVALID`이며 운영 로그에만 남긴다.

## 응답 모양

성공 응답은 아래 필드만 가진 JSON이다. 중첩 객체의 누락·추가·중복 키, 잘못된 타입을 거부한다.

| 객체 | 필드 |
|---|---|
| 최상위 | `requestId`, `attemptId`, `consentId`, `noticeRevision`, `allowedResourceTypes`, `sourceMode`, `credential`, `selection` |
| `credential` | `memberId`, `repositoryId`, `scopeRevision`, `repository`, `linkedAccount`, `accessToken`, `expiresAt` |
| `credential.repository` | `owner`, `name` |
| `credential.linkedAccount` | `login`, `externalAccountId` |
| `selection` | `repositoryId`, `wholeRepository` |

- 접수 기록: 요청·시도 ID, `credential`의 회원·저장소·허용 범위 판본, 최상위의 동의 ID·고지 판본·허용 자료 종류(계약의 `COMMIT`·`PULL_REQUEST`·`ISSUE`만)·`sourceMode`(`LIVE`·`MOCK`). 선정 참조의 기대값은 시도 ID다. 요청 메시지의 열 개 항목을 이 값과 대조한다. 응답의 `requestId`가 요청과 달라도 손상으로 보지 않고 대조에서 거부한다(진행 알림·결과 없음).
- `externalAccountId`는 양의 십진 **문자열**이어야 하며 Python 정수로 바꾼다. JavaScript 안전 정수 범위 밖의 값도 반올림하지 않는다. `expiresAt`은 UTC ISO 시각(`Z` 또는 `+00:00`)이어야 한다. 저장소 좌표·계정·토큰 형식은 기존 수집 타입으로 검사한다.
- 수집 종료까지의 만료 여유는 기존 `check_credential`이, 선택 저장소가 요청과 같고 `wholeRepository`가 true인지는 `check_selection`이 본다. 어긋나면 GitHub 호출 없이 수집 실패 결과다. 선택 범위를 넓혀 보정하지 않는다.

404 본문은 `{code, message}` 또는 `{code, message, details}`이고 `code`가 `RESOURCE_UNAVAILABLE`이어야 한다. 이유는 `details.violations`가 한 칸이고 그 칸이 `{field: "attemptId", reason}`일 때만 읽으며, 허용 목록 밖의 값이나 다른 모양은 `REQUEST_CONTEXT_UNRESOLVED`다. api의 조회 경로가 아직 등록되지 않았을 때도 같은 404라 이 이유가 된다.

## 이유 코드와 실패 문구

회원 화면은 실패 문구를 "실패한 부분: …"으로 그대로 보여 준다. 문구는 10/15 팀장 결정(회원용 존댓말, 다음 행동)이고 코드는 `app/request_context/reasons.py` 한 곳에 있다. 결과 실패 1건의 `stage`는 `COLLECTION`, `code`는 이유 코드다.

| 이유 코드 | 고르는 쪽·조건 | 문구 |
|---|---|---|
| `ATTEMPT_NOT_ACTIVE` | api: 없는·지난 시도, 닫힌 요청, 대기·실행 중이 아님, MOCK 시도 | 이 분석 요청은 이미 끝났거나 새 요청으로 바뀌어 처리하지 않았습니다. |
| `MEMBER_INACTIVE` | api: 회원 비활성 | 회원 상태를 확인할 수 없어 분석하지 않았습니다. |
| `SCOPE_UNVERIFIED` | api: 동의·선정 불일치·미확인, 동의 범위 JSON의 판본·저장소가 동의 행·요청과 다름 | 동의한 저장소 범위를 확인하지 못해 분석하지 않았습니다. 다시 동의한 뒤 요청해 주세요. |
| `GITHUB_NOT_CONNECTED` | api: GitHub 연결 없음·해제 | GitHub 연결이 없어 분석하지 않았습니다. GitHub를 연결한 뒤 다시 요청해 주세요. |
| `GITHUB_REAUTH_REQUIRED` | api: 자격정보 사용 불가·만료·재인증 필요, 조회 중 연결이 바뀜 | GitHub 연결을 다시 확인해야 해서 분석하지 않았습니다. GitHub를 다시 연결한 뒤 요청해 주세요. |
| `REQUEST_CONTEXT_UNRESOLVED` | worker: 404인데 이유가 없거나 모르는 값 | 분석 요청 정보를 확인하지 못해 분석하지 않았습니다. |
| `REQUEST_CONTEXT_UNAVAILABLE` | worker: 조회 실패 | 분석 요청 정보를 잠시 확인하지 못해 분석하지 않았습니다. 잠시 후 다시 요청해 주세요. |

`ATTEMPT_NOT_ACTIVE`는 대개 E가 그 결과를 거부해 화면에 나오지 않는다.

## 설정

헬스체크 서버와 합성 처리에는 설정이 필요 없다. 큐 소비자는 기동 때 아래 값을 읽어 검사하고(운영에서 없으면 기동 실패), 키를 환경변수에서 지운 뒤 자식에 설정 객체로 넘긴다([큐 소비자 「설정」](queue-consumer.md#설정)). `.env` 파일을 자동으로 읽지 않으므로 실행 환경에서 주입한다.

| 환경변수 | 값 |
|---|---|
| `WORKER_CONTEXT_API_URL` | 내부 api의 신뢰된 origin. 경로·query·fragment·사용자 정보 없는 `https://호스트[:포트]`. `/v1`은 넣지 않는다 |
| `WORKER_CONTEXT_API_KEY` | api와 같은 worker 전용 32바이트 난수의 64자리 16진수. 회원 인증·다른 서비스 비밀키와 공유하지 않는다 |
| `WORKER_CONTEXT_API_ALLOW_CLUSTER_HTTP` | 선택(`true`·`false`, 기본 꺼짐). 켜면 클러스터 안 서비스 이름 `<서비스>.<네임스페이스>.svc.cluster.local`에 한해 운영에서도 `http://`를 받는다. 그 밖의 http 주소는 켜도 기동 때 거부한다 |
| `NODE_ENV` | 기본은 `production`. `development`·`test`에서만 숫자 loopback(`127.0.0.1`·`[::1]` 등)의 HTTP를 허용한다. `localhost` 같은 DNS 이름에는 HTTP 예외가 없다 |

**운영 http의 한계(10/15 팀장 결정 질문 4).** api는 평문 HTTP로 듣고 TLS는 바깥 ALB에서 끝난다. 그래서 운영에서 worker는 클러스터 안 주소로 api를 부르고, 응답의 GitHub 토큰이 클러스터 안 Pod 사이 망을 평문으로 지난다. 이 결정에는 조건이 셋 붙었다.

1. NetworkPolicy가 실제로 동작한다: 기본 차단, api 3001은 ALB·worker에서만, worker의 나가는 연결은 api·큐·GitHub·Anthropic 대역만([#276](https://github.com/JminAILab/CatchU/issues/276), 시험 Pod로 확인).
2. Pod를 특권 없이 띄운다: 호스트 망 금지, 권한 전부 제거, root 아님, 네임스페이스에 Pod Security `restricted`([#275](https://github.com/JminAILab/CatchU/issues/275) EKS 실행 파일).
3. http 허용을 좁힌다: 위 설정을 켰고 주소가 클러스터 안 서비스 이름일 때만. 그 밖의 http 주소는 기동 때 거부한다(이 설정).

노드·망을 엿볼 수 있는 쪽에는 토큰이 보인다. 노드를 다른 서비스와 같이 쓰게 되거나 구간이 VPC 밖으로 나가거나 외부 점검이 내부 암호화를 요구하면 다시 본다.

클라이언트 기본 상한은 연결 5초, 응답 전체 5초, 응답 본문 64 KiB다. 조금씩 계속 오는 응답도 응답 마감으로 끊고, Content-Length 유무와 관계없이 크기 상한을 적용한다. HTTPS 인증서·호스트 검사를 끄지 않는다. 연결마다 소켓을 닫는다. 이 값은 GitHub 수집 상한과 별개다. api 안의 GitHub 확인 시간이 이 안에 드는지는 실제 연결 확인에서 잰다.

## 요청 수명

`RequestContextClient`는 설정만 장기 보관한다. `ContextFound`는 조회로 받은 값을 그대로 돌려주는 고정 resolver 한 쌍(`credentials`·`selections`)을 가져, 수집이 몇 번 물어도 HTTP는 조회 한 번뿐이다. 시도 ID가 아닌 참조에는 `None`(모름)이다. 처리 순서는 `with`로 쓰고, 성공·거부·예외 어느 쪽이든 끝나면 자격정보와 선택 범위를 놓는다. 닫힌 resolver는 다시 돌려주지 않는다(`CONTEXT_CLOSED`). Python 메모리를 안전하게 덮어쓰는 기능을 보장하는 것은 아니다.

전용키·GitHub 토큰·응답 원문을 로그·디스크·오류 체인에 기록하지 않고 설정·결과의 repr에도 넣지 않는다. `CredentialContext`는 기존처럼 토큰을 repr에서 뺀다. 운영 식별자 `requestId`·`attemptId` 로그와 이유·원인 코드는 남긴다.

## 검사 범위

`tests/test_request_context.py`·`test_request_context_settings.py`는 loopback 합성 HTTP 서버로 접수 기록 옮기기, 고정 resolver의 조회 1회·다른 참조·해제, 404 이유 읽기와 모르는 값, 상태·손상·누락·추가·중복 필드, 숫자 정밀도, redirect, 시간·크기 상한, 연결 거부, 잘못된 시도 ID의 호출 0회, 설정 거부와 클러스터 안 http 허용 조건, 비밀값 누출을 검사한다. 만료 여유·선택 범위 불일치는 기존 수집으로 GitHub 호출 0회를 확인한다. 처리 순서와 이은 시험은 `tests/test_live_processing.py`다. 실제 GitHub나 운영 비밀값을 쓰지 않고, 실제 TLS·배포 환경의 망 제한·실제 GitHub 권한 검증을 대신하지 않는다.
