# 내부 API 자격정보·선택 범위 조회 — #232

검사된 요청(`CheckedRequest`)의 `attemptId`로 내부 api에 한 번 묻고, 기존 수집 경계인 `check_credential`·`check_selection`에 넘긴다. `credentialContextReference`와 `allowedScope.selectionReference`는 모두 그 `attemptId`와 같아야 한다. 참조 자체는 권한이나 GitHub 토큰이 아니다. 기준은 [수집 통제 §3 A→F 자격정보 인계](../../docs/CatchU_collection_control_scope.md#3-af-자격정보-인계)이며, 이 구현은 [#232](https://github.com/JminAILab/CatchU/issues/232)의 내부 연결이다.

## 호출과 응답

고정 경로 `GET /v1/internal/analysis-attempts/{attemptId}/context`를 `X-Worker-Key`로 인증한다. 회원 JWT나 GitHub 토큰을 이 머리글에 쓰지 않는다. 목적지는 기동 때 받은 신뢰된 설정에서만 정하며, 요청·응답의 URL로 바꿀 수 없다. api의 조회 모듈을 실제 선정 공급자와 조립한 내부 서버가 선행 조건이다.

성공 응답은 아래 필드만 가진 JSON이다. 중첩 객체의 누락·추가·중복 키, 잘못된 타입, 요청/시도 식별자 불일치를 거부한다.

| 객체 | 필드 |
|---|---|
| 최상위 | `requestId`, `attemptId`, `credential`, `selection` |
| `credential` | `memberId`, `repositoryId`, `scopeRevision`, `repository`, `linkedAccount`, `accessToken`, `expiresAt` |
| `credential.repository` | `owner`, `name` |
| `credential.linkedAccount` | `login`, `externalAccountId` |
| `selection` | `repositoryId`, `wholeRepository` |

`externalAccountId`는 양의 십진 **문자열**이어야 하며 Python 정수로 바꾼다. JavaScript 안전 정수 범위 밖의 값도 반올림하지 않는다. `expiresAt`은 UTC ISO 시각(`Z` 또는 `+00:00`)이어야 한다. 저장소 좌표·계정·토큰 형식은 기존 수집 타입으로 검사한다. 회원·저장소·허용 범위 판본·수집 종료까지의 만료 여유는 기존 `check_credential`이 대조하고, `check_selection`은 선택 저장소가 요청과 같고 `wholeRepository`가 true인 경우만 허용한다. 선택 범위를 넓혀 보정하지 않는다.

`404`와 공통 오류 코드 `RESOURCE_UNAVAILABLE`이면 두 resolver 모두 `None`이다. 그 밖의 HTTP 상태, 잘못된 404, 연결 오류, 시간·크기 초과, 손상 응답은 원문 없는 `CredentialLookupError` 또는 `SelectionLookupError`다. `CONTEXT_HTTP_<상태>`·`CONTEXT_TIMEOUT`·`CONTEXT_TRANSPORT_FAILED`·`CONTEXT_RESPONSE_TOO_LARGE`·`CONTEXT_RESPONSE_INVALID`로 원인을 구분한다. 기존 수집 검사는 이 예외를 기존 수집 실패 코드로 변환한다. redirect·재시도·자격정보 갱신은 하지 않는다.

## 설정

헬스체크 서버와 합성 처리에는 설정이 필요 없다. 실제 내부 조회를 조립할 때 `ContextApiSettings.from_environment()`를 먼저 호출하면 누락·잘못된 값은 연결 전에 실패한다. `.env` 파일을 자동으로 읽지 않으므로 실행 환경에서 주입한다.

| 환경변수 | 값 |
|---|---|
| `WORKER_CONTEXT_API_URL` | 내부 api의 신뢰된 origin. 경로·query·fragment·사용자 정보 없는 `https://호스트[:포트]`. `/v1`은 넣지 않는다 |
| `WORKER_CONTEXT_API_KEY` | api와 같은 worker 전용 32바이트 난수의 64자리 16진수. 회원 인증·다른 서비스 비밀키와 공유하지 않는다 |
| `NODE_ENV` | 기본은 `production`. `development`·`test`에서만 숫자 loopback(`127.0.0.1`·`[::1]` 등)의 HTTP를 허용한다. `localhost` 같은 DNS 이름에는 HTTP 예외가 없다 |

클라이언트 기본 상한은 연결 5초, 응답 전체 5초, 응답 본문 64 KiB다. 조금씩 계속 오는 응답도 응답 마감으로 끊고, Content-Length 유무와 관계없이 크기 상한을 적용한다. HTTPS 인증서·호스트 검사를 끄지 않는다. 연결마다 소켓을 닫는다. 이 값은 내부 조회 구현의 기본값이며 GitHub 수집 상한과 별개다.

## 요청 수명과 조립

`RequestContextClient`는 설정만 장기 보관한다. `for_request`는 요청마다 새 pair를 만들고, credential/selection 어느 쪽을 먼저 조회해도 HTTP는 한 번뿐이다. 404와 실패 상태도 공유하여 두 번째 resolver가 재시도하지 않는다. pair를 다른 요청에 재사용하지 않는다. `with` 종료 또는 `close()`는 성공·거부·예외 모두 context와 요청 참조를 놓고, 닫힌 pair는 다시 조회하지 못한다. Python 메모리를 안전하게 덮어쓰는 기능을 보장하는 것은 아니다.

실제 조립 함수는 `app.request_context.collection.collect_with_context`다. 내부에서 다음 형태로 기존 `collect`를 호출하며 GitHub transport와 시계는 호출부가 공급한다.

```python
from app.request_context import ContextApiSettings, RequestContextClient
from app.request_context.collection import collect_with_context

# 기동 시 한 번 구성. 요청이나 큐 메시지에서 설정을 읽지 않는다.
context_client = RequestContextClient(ContextApiSettings.from_environment())

# check_request를 통과한 request를 처리할 때 호출한다.
outcome = collect_with_context(
    request,
    context_client=context_client,
    open_transport=open_github_transport,
    clock=clock,
)
```

첫 GitHub 연결까지의 경계만 확인하려면 `with context_client.for_request(request) as pair:` 안에서 기존 `check_credential(request, pair.credentials, ...)`과 `check_selection(request, pair.selections)`을 호출한다. 두 검사 통과 후에만 GitHub 호출을 시작한다. 이 모듈은 HTTP 경로나 큐 처리에 자동 연결되지 않는다. 처리 순서 전체 연결은 #121에서 한다.

새 모듈은 전용키·GitHub 토큰·응답 원문·참조를 로그·디스크·오류 체인에 기록하지 않는다. 설정·pair의 repr에도 넣지 않으며 `CredentialContext`는 기존처럼 토큰을 repr에서 뺀다. 기존 수집의 운영 식별자 `requestId`·`attemptId` 로그는 그대로다. `attemptId`와 참조값이 같아도 운영 식별자 기록과 자격정보 원문 기록을 구분한다.

## 검사 범위

`tests/test_request_context.py`·`test_request_context_settings.py`는 loopback 합성 HTTP 서버로 정상 대조, 두 resolver의 단일 조회, 거부·실패 공유, 시도/요청 불일치, 손상·중복·추가 필드, 숫자 정밀도, redirect, 시간·크기 상한, 설정 거부, 비밀값·예외 체인 누출, context 해제를 검사한다. 회원·저장소·판본·만료·선택 불일치에서는 기존 수집 조립 함수를 통해 GitHub 호출 0회를 확인한다. 실제 GitHub나 운영 비밀값을 쓰지 않는다. api·DB와의 통합 검증 결과는 PR의 별도 실행 증거에서 확인한다. 이 시험은 실제 TLS·배포 환경의 나가는 방향 제한·실제 GitHub 권한 검증을 대신하지 않는다.
