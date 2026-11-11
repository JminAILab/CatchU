# worker — 수집·분석 처리

현행 메시지 v2, 본인 커밋 관측·운영 상한·합성 경계는 [U7 본인 관측](docs/repository-analysis-u7.md)을 따른다. 원본 10월 계약은 보존하며 런타임 정본은 `api/contracts/repository-analysis`다.

> 기능별 동작·연결 안내는 이 README에 덧붙이지 않고 `worker/docs/<기능>.md`로 쓴다.

분석 요청을 큐에서 받아 처리하는 worker다. 운영 실행은 분석 요청 큐 소비자(`python -m app.consumer`, [분석 요청 큐 소비자](#분석-요청-큐-소비자))이며, 같은 포트로 상태 확인 `GET /health`만 연다. LIVE 요청은 내부 api에 요청 정보를 한 번 조회한 뒤 허용 GitHub 자료 수집([허용 GitHub 자료 수집과 근거 정규화](docs/github-collection.md)) → 후보 묶음·작업 동일성 판별([후보 묶음과 작업 동일성](docs/candidate-decision.md)) → 설명 초안·질문·제목 생성([설명 초안·생각해볼 질문·Catch 제목 생성](docs/generation.md))으로 처리하고, MOCK 요청은 개발·시험 설정에서만 가짜 생성기로 처리한다([요청 검사와 합성 결과 생성](#요청-검사와-합성-결과-생성)). FastAPI 앱(`app.main`)은 HTTP 경로가 `GET /health`뿐이며 HTTP `200`과 `{"status":"ok"}`를 반환한다. LIVE 처리는 합성 조회 API·합성 GitHub 응답·합성 생성 제공자로만 검사했다. 실제 api·GitHub·Claude API와 이은 확인과 AWS 배포는 후속 작업이다([#121](https://github.com/JminAILab/CatchU/issues/121) 실제 연결 확인). 운영 이미지와 한 호스트 실행은 [배포 안내](../deploy/README.md)에 있다. worker 관련 파일(worker 폴더, 계약 폴더, 루트 `.gitignore`, CI 파일)이 바뀐 PR에서는 「변경 후 검사」의 명령을 CI가 실행한다.

작업 범위는 [#84](https://github.com/JminAILab/CatchU/issues/84), 공통 착수·브랜치·검사·PR 기준은 [코딩 운영](../docs/CatchU_coding_procedures.md#코딩-운영)을 따른다. worker 초기화 담당이 이후 분석 기능과 공통 환경까지 자동으로 맡는 것은 아니다.

## 도구와 버전

| 구분 | 기준 |
|---|---|
| Python | `3.12.10` (`.python-version`과 `requires-python`에 고정) |
| 가상환경·의존성 관리 | `uv` (`0.12.18` 기준) |
| 웹 앱·서버 | FastAPI `0.141.1`, Uvicorn `0.53.0` |
| 정적·서식·타입 검사 | Ruff `0.16.8`, mypy `2.3.1` |
| 테스트 | pytest `9.1.1`, 커버리지 pytest-cov `7.1.0`(coverage `7.17.0`) |
| 생성 LLM 제공자 SDK | anthropic `1.13.0`, HTTP는 HTTPX2 `2.13.0`·HTTPCore2 `2.13.0`(FastAPI 시험 클라이언트도 HTTPX2를 쓴다, [생성의 실제 제공자](docs/generation-provider.md)) |
| 메시지 스키마 검사 | jsonschema `4.26.0`, referencing `0.37.0`, PyYAML `6.0.3`, 형식 검사 rfc3339-validator `0.1.4`·rfc3986-validator `0.1.1` |
| 큐 | bullmq `3.3.0`, redis(redis-py) `7.4.1`. 큐 검증 키트와 같은 판본이어야 한다([분석 요청 큐 소비자](docs/queue-consumer.md#큐-규격-233과-공동)) |

직접 의존성과 검사 설정은 `pyproject.toml`, 전체 의존성의 해석 결과는 `uv.lock`에 둔다. `--locked`는 두 파일이 맞지 않으면 실행을 중단하여 의존성이 조용히 바뀌지 않게 한다. 패키지 배포를 하지 않는 앱(`package = false`)이므로 별도 빌드 명령은 없다.

## 설치와 가상환경

먼저 아래 방법 중 하나로 uv를 설치한다. 자세한 내용은 [uv 공식 설치 안내](https://docs.astral.sh/uv/getting-started/installation/)를 참고한다.

macOS·Linux에서 기준 버전을 설치한다면:

```sh
curl -LsSf https://astral.sh/uv/0.12.18/install.sh | sh
```

Windows PowerShell에서 기준 버전을 설치한다면:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/0.12.18/install.ps1 | iex"
```

macOS에서 Homebrew를 사용한다면:

```sh
brew install uv
```

설치 후 새 터미널을 열고 `uv --version`으로 확인한다. Homebrew는 설치 시점의 버전을 사용한다. 기준 버전으로 재현해야 할 때는 위 버전 지정 설치 방법을 사용한다.

이후 모든 명령은 **저장소의 `worker/` 디렉터리**에서 실행한다.

```sh
# 저장소 루트에서 시작
cd worker
uv python install
uv sync --locked
```

`uv python install`은 `.python-version`의 Python을 준비한다. 생략해도 기본 설정의 `uv sync`가 필요한 Python을 자동으로 내려받는다. 처음 설치할 때는 Python과 의존성을 다운로드할 인터넷 연결이 필요하다.

`uv sync --locked`는 `worker/.venv`를 만들고 실행·개발 의존성을 함께 설치한다. 아래의 `uv run` 명령은 이 가상환경을 자동으로 사용하므로 별도 활성화가 필요 없다. 편집기에서도 `worker/.venv`의 Python을 선택한다.

직접 가상환경을 활성화하고 싶다면 macOS·Linux에서는 `source .venv/bin/activate`, Windows PowerShell에서는 `.venv\Scripts\Activate.ps1`을 사용한다. 작업 후 `deactivate`로 활성화만 해제한다. PowerShell 실행 정책 때문에 활성화가 막히면 활성화 없이 `uv run`을 사용해도 된다.

분석 요청 큐 소비자의 환경변수(큐 주소·접두사·동시 수·MOCK, LIVE 처리의 조회 주소·키와 생성 키)는 [분석 요청 큐 소비자 「설정」](docs/queue-consumer.md#설정)에 있다. 운영에서는 큐 주소와 LIVE 설정이 필수이고, 개발·시험(`NODE_ENV=development`·`test`)에서는 큐 주소가 없으면 소비자를 끈 채 상태 확인만 띄우고 LIVE 설정이 없으면 LIVE 요청을 처리 전에 거부한다. `.env.example`에 이름을 적었으며 `.env`를 자동으로 읽지 않는다. 요청 정보 조회의 설정·운영 http의 한계는 [내부 API 요청 정보 조회 「설정」](docs/request-context.md#설정)에 있다.

## 실행·확인·종료

분석 요청 큐 소비자의 실행·종료는 [분석 요청 큐 소비자 「실행」](docs/queue-consumer.md#실행)에 있다. 아래는 FastAPI 앱(`app.main`)의 개발 서버다. `worker/`에서 시작한다.

```sh
uv run --locked uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

터미널에 `Application startup complete`가 출력되면 다른 터미널에서 응답을 확인한다.

```sh
curl -i http://127.0.0.1:8000/health
```

Windows PowerShell에서는 `curl.exe -i http://127.0.0.1:8000/health`를 사용한다. 기대 결과는 HTTP `200 OK`와 다음 본문이다.

```json
{"status":"ok"}
```

이 응답은 worker 앱이 응답한다는 뜻이다. DB·큐·외부 서비스 연결 상태를 검사하지 않는다. 로컬 API 문서는 [Swagger UI](http://127.0.0.1:8000/docs), [ReDoc](http://127.0.0.1:8000/redoc), [OpenAPI JSON](http://127.0.0.1:8000/openapi.json)에서 확인한다. 배포 환경에서 문서를 노출할지는 후속 배포 작업에서 결정한다.

종료할 때는 **서버를 실행한 터미널에서 `Ctrl+C`**를 누른다. 종료 로그를 확인한 뒤에는 `/health`에 연결되지 않아야 한다. `--reload`는 코드 변경 시 개발 서버를 다시 띄우는 옵션이다.

| 증상 | 확인할 항목 |
|---|---|
| `uv` 명령을 찾을 수 없음 | 설치 후 새 터미널을 열었는지, 설치 경로가 `PATH`에 있는지 확인 |
| `app` 모듈을 찾을 수 없음 | 현재 디렉터리가 저장소의 `worker/`인지 확인 |
| `Address already in use` | 이전에 띄운 worker나 다른 프로세스가 `8000` 포트를 쓰는지 확인하고 해당 실행을 종료 |
| 잠금 파일 불일치 | 브랜치의 `pyproject.toml`과 `uv.lock`을 함께 받았는지 확인. 의존성 변경 시 두 파일을 함께 갱신하여 리뷰 |

## 요청 검사와 합성 결과 생성

[#113](https://github.com/JminAILab/CatchU/issues/113)의 범위다. E가 보낸 분석 요청(`Request`)을 검사하고, 가짜 생성기로 [현행 메시지 스키마 v2](../api/contracts/repository-analysis/worker-messages.yaml)에 맞는 종결 결과(`Result`)를 만든다. 외부 호출·제공자 SDK·API 키가 없고 결과는 항상 `sourceMode: MOCK`이다. 공개 HTTP 경로나 큐 없이 `app.processing.process_request` 함수로 부른다.

1. **요청 검사**: 스키마 v2을 검사한 뒤 E가 접수한 기록(요청·현재 시도·회원·저장소·동의·허용 범위·`sourceMode`)과 필드마다 대조한다. 하나라도 다르면 생성기를 부르지 않고 거부한다. 거부는 사유와 어긋난 위치만 호출한 쪽에 돌려주며, 계약에 요청 거부 메시지가 없으므로 E에 보내는 메시지는 없다. 따라서 E의 요청은 접수 상태(`QUEUED`)로 남는다.
2. **진행 알림**: 검사를 통과하면 `RECEIVED`, 생성 직전에 `RUNNING`을 알린다.
3. **생성**: 생성기를 한 번 부른다. 생성기가 실행 여부를 확인하지 못했거나(상태 조회 오류) 시간이 초과되면 `UNCERTAIN`만 알리고 결과를 만들지 않는다. 실패로 확정하지 않고 다시 생성하지도 않는다. 이 `UNCERTAIN`은 항상 `RUNNING` 뒤에 가고, E의 [상태 전이 정본](../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#상태-전이-정본)에는 `RUNNING`에서 `UNCERTAIN`으로 가는 전이가 없으므로 E의 처리 상태는 `RUNNING`으로 남는다.
4. **결과 조합**: 요청의 식별자·맥락을 그대로 옮긴다. 종결값은 후보와 실패의 수로 정한다(후보만 있으면 SUCCEEDED, 둘 다 없으면 EMPTY, 둘 다 있으면 PARTIAL_FAILED, 실패만 있으면 FAILED). 근거 부족·기준 미달은 `notProvided`, 수집·생성 오류는 `failures`에 넣는다. 생성이 실패해 초안·질문을 만들지 못해도 후보는 남기고 초안 본문은 `null`, 그 실패는 `failures`에 넣는다. 재료가 없어 만들지 않은 것(`NOT_GENERATED`)은 실패가 아니다([생성 「상태와 실패」](docs/generation.md#상태와-실패)). 후보에 제목이 없으면 대체값 없이 `title: null`로 보낸다. 빈 문자열·공백만인 제목도 null이다([후보 문장과 근거 「제목」](docs/candidate-text.md#제목)). 제목은 #118이 만들지 않고 생성 단계가 정한다. 쓸 만한 기록의 글(PR 제목·본인 커밋 첫 줄)이 있으면 그 글, 없으면 [#120](https://github.com/JminAILab/CatchU/issues/120) 생성 모듈의 조각 제목이다([생성 「제목」](docs/generation.md#제목)).

1번 거부나 3번 실행 불명으로 E에 남은 요청은 E의 처리 시한(접수 후 60분)이 지나면 처리 `FAILED`로 닫힌다. worker는 이 요청을 다시 처리하지 않는다. 이 닫기는 처리 시한 계약 PR이 병합된 뒤 적용되며, 구현은 [#237](https://github.com/JminAILab/CatchU/issues/237)이다([10/6 팀장 결정](https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296)).

`credentialContextReference`는 형식만 확인해 넘긴다. 이 값이 있다고 요청을 받아들이지 않으며, 해석과 대조는 수집 모듈이 첫 GitHub 호출 전에 한다([허용 GitHub 자료 수집과 근거 정규화](#허용-github-자료-수집과-근거-정규화)).

### 개발용 실행

`worker/`에서 합성 요청 하나를 처리해 진행 알림과 결과를 JSON으로 출력한다. 아무 데도 보내거나 저장하지 않는다.

```sh
uv run --locked python -m app.processing succeeded-one-candidate
```

| 시나리오 | 기대 결과 |
|---|---|
| `succeeded-one-candidate` | SUCCEEDED, 후보 1건 |
| `empty` | EMPTY, 근거 부족 1건(`notProvided`) |
| `partial-failed` | PARTIAL_FAILED, 후보 1건과 수집 실패 1건 |
| `failed` | FAILED, 수집 실패만 |
| `two-candidates-same-work` | SUCCEEDED, 같은 작업의 후보 2건. 두 번째 후보는 초안 미생성(`null`) |
| `draft-failed` | PARTIAL_FAILED, 후보 유지·초안 `null`·초안 실패 1건 |
| `reflection-failed` | PARTIAL_FAILED, 후보 유지·질문 없음·질문 실패 1건 |
| `title-failed` | SUCCEEDED, 제목 `null`·실패 없음 |
| `execution-unknown` | 결과 없음(`null`), 마지막 알림 `UNCERTAIN` |

- 처음 다섯 개는 [M1 합성 결과 세트](fixtures/m1-synthetic/README.md)의 같은 이름 템플릿과 결과가 같다. 개발용 실행에서는 `finishedAt`·`observedAt`만 실행 시각이다. 나머지는 `succeeded-one-candidate` 템플릿에서 한 부분만 바꿨다.
- 요청 값은 `context.sample.json`을 쓰고, 표본에 없는 요청 필드(고지 판본·허용 자료 종류·선정 참조·자격정보 맥락 참조·시각)만 `app/processing/synthetic.py`의 합성 값으로 채운다.

### MOCK 범위와 남은 실제 연결

이 결과는 실제 분석 성공, 실제 자료 검증, Catch 저장·열람 준비 완료를 뜻하지 않는다. 수신 확인은 E, Catch 등록은 B가 판단한다.

| 남은 실제 연결 | 이슈 |
|---|---|
| 허용 GitHub 자료 수집의 실제 연결(A 자격정보 제공·실제 환경 통제 검사). 수집 모듈은 합성 검사까지 | [#117](https://github.com/JminAILab/CatchU/issues/117) · [#133](https://github.com/JminAILab/CatchU/issues/133) · [#37](https://github.com/JminAILab/CatchU/issues/37) |
| 후보 묶음·본인 기여 확인·작업 동일성 판별의 처리 순서 연결과 실제 자료 검수. 판별 모듈(`app/candidates/`)은 합성 검사까지 | [#118](https://github.com/JminAILab/CatchU/issues/118) · [#121](https://github.com/JminAILab/CatchU/issues/121) · [#122](https://github.com/JminAILab/CatchU/issues/122) |
| 초안·질문·제목 생성의 실제 LLM 제공자 연결과 품질 확인. 생성 모듈(`app/generation/`)은 합성 제공자 검사까지 | [#119](https://github.com/JminAILab/CatchU/issues/119) · [#120](https://github.com/JminAILab/CatchU/issues/120) |
| 큐 연결과 LIVE 처리 조립은 있음([분석 요청 큐 소비자](docs/queue-consumer.md), 합성 검사까지). 실제 api 조회·GitHub·Claude·E 수신과 이은 확인 | [#121](https://github.com/JminAILab/CatchU/issues/121) · [#233](https://github.com/JminAILab/CatchU/issues/233)(api 쪽) · [#252](https://github.com/JminAILab/CatchU/issues/252)(선정 공급자) · [#77](https://github.com/JminAILab/CatchU/issues/77) |
| E 수신·개발용 주입, B 등록 | [#139](https://github.com/JminAILab/CatchU/issues/139) · [#105](https://github.com/JminAILab/CatchU/issues/105) |

## 허용 GitHub 자료 수집과 근거 정규화

[docs/github-collection.md](docs/github-collection.md)에 있다. #118이 더한 관계 조회는 [docs/relation-collection.md](docs/relation-collection.md), 그 가운데 연결 PR 묶음 조회(#267, GraphQL)와 요청당 호출 수의 근거는 [docs/associated-pr-lookup.md](docs/associated-pr-lookup.md)에 있다.

## 내부 API 요청 정보 조회

[docs/request-context.md](docs/request-context.md)에 있다. LIVE 요청마다 한 번 조회해 접수 기록으로 요청을 대조하고, 같은 응답의 자격정보·선택 범위를 기존 수집 검사에 넘긴다. 조회가 모름·실패면 진행 알림 없이 실패 결과 하나를 보낸다.

## 후보 묶음과 작업 동일성

[docs/candidate-decision.md](docs/candidate-decision.md)에 있다. 후보 문장·근거·제목은 [docs/candidate-text.md](docs/candidate-text.md), 알려진 한계와 검사는 [docs/candidate-checks.md](docs/candidate-checks.md), 재분석 때 이미 다른 Catch에 속한 커밋을 빼는 규칙(Catch 개편 CR2)은 [docs/commit-assignment.md](docs/commit-assignment.md)에 있다.

## 설명 초안·질문·제목 생성

[docs/generation.md](docs/generation.md)에 있다. 재료 순서·변경 묶음·한 파일 상한은 [docs/generation-material.md](docs/generation-material.md), 호출 한도와 운영 로그는 [docs/generation-limits.md](docs/generation-limits.md), 실제 제공자 어댑터(Anthropic Claude API)와 판정 공급자(OpenAI Decisions·Claude) 호출 설정은 [docs/generation-provider.md](docs/generation-provider.md)에 있다. AI 쪽(CR3: Claude가 쓰는 제목 후보·설명 문장과 판정, FR10 확인 명령)은 [docs/generation-judgement.md](docs/generation-judgement.md)에 있다.

## 분석 요청 큐 소비자

[docs/queue-consumer.md](docs/queue-consumer.md)에 있다(구조·실행·설정·상태 확인·큐 규격·처리 결과와 큐 완료/실패·시간 상한·종료 순서·수신 확인).

### 보장하지 않는 범위

[10/6 팀장 결정](https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296)에 따라 서버·worker·큐가 끊기는 장애는 앱에서 복구하지 않는다. 끝나지 않은 요청은 E가 접수 후 60분에 실패로 닫고([#237](https://github.com/JminAILab/CatchU/issues/237)) 회원이 다시 요청한다. 그래서 worker는 다음을 보장하지 않는다.

- **큐 자료가 사라지면 같은 시도가 한 번 더 실행될 수 있다.** 큐 서버가 자료 없이 다시 뜨면 api가 대기 시도를 다시 넣고, worker는 그것을 새 작업으로 받는다. 분석 비용이 한 번 더 든다.
- **큐 서버 장애 중에는** 60분 상한의 실패 기록, 25초 안의 정상 종료(실패 기록 포함), 진행 알림·결과 전송을 보장하지 못한다. 상한·종료 자체는 지키지만(자식을 끝내고 프로세스를 끝낸다) 그 사실이 큐에 남지 않을 수 있다. 장애 중 잠금이 끝나면 큐는 그 작업을 실패로 보지만, 자식은 끝까지 돌아 결과를 보낼 수 있다.
- **부모 프로세스가 죽은 작업**(강제 종료·노드 장애)은 소비자가 다시 떠서 정체 검사를 돌아야 큐에 실패로 남는다. 다시 실행하지는 않는다(정체 복구 0회). 그 사이 E의 요청은 대기·실행 중으로 보이다 처리 시한에 닫힌다.
- **소비자 둘이 겹치면 동시 1건이 깨진다.** 교체 중 새 worker가 뜨기 전에 옛 worker가 내려가야 한다(실행 설정은 [#275](https://github.com/JminAILab/CatchU/issues/275)). worker가 상한을 넘겨 멈춘 사이 재요청이 오면 분석이 두 번 돌 수 있다.
- **자식을 강제로 끝내도 이미 보낸 LLM 요청은 취소되지 않는다.** 비용이 중복될 수 있다.
- **결과를 보낸 뒤의 수신·반영.** 결과는 한 번 보내면 끝이고 보존하지 않는다. 수신 확인을 못 봤거나 E가 거부(`REJECTED`)해도 다시 보내거나 분석을 다시 하지 않고 기록만 한다. 수신 확인 `ACCEPTED`는 E가 받았다는 뜻이지 회원 화면 반영 완료가 아니다. E가 처리하지 않은 결과 작업은 큐에 남는다(큐의 보관 정리는 다른 작업이 끝날 때 돈다).
- **종료 25초를 넘기면** 남은 자식과 프로세스를 SIGKILL로 끝낸다(종료 코드 137). 그때 분석 중이던 작업의 실패 기록은 남지 않을 수 있고, 다음 기동의 정체 검사가 실패로 남긴다.

## PDF 글 추출 소비자

12월 U8. 작성 회원이 올린 PDF에서 쪽별 글을 뽑아 api로 돌려준다. 분석 요청 큐 소비자와 **같은 프로세스**(`python -m app.consumer`)에서 둘째 Worker로 돌며, 아래 설정이 없으면 띄우지 않는다. api 쪽 규격과 수신 판정은 [api PDF 자료 문서](../api/docs/pdf-materials.md#추출-요청과-결과-수신-c-16)에 있다.

### 처리

1. 큐 `pdf-extraction-requests`의 작업 `PdfExtract`를 받는다. 봉투(`schemaVersion "2"`·`messageId`·`pdfMaterialId`·`memberId`·`storageKey` 다섯 필드, 작업 ID = `pdfMaterialId`, 저장 키가 두 ID에서 나온 값과 같음)를 검사하고, 틀리면 결과 없이 작업을 실패로 끝낸다(`PDF_REQUEST_INVALID`).
2. 작업마다 자식 프로세스 하나를 띄운다. 자식은 읽기 경로와 제한값만 받고 큐 접속 정보·LIVE 키는 받지 않는다.
3. 자식이 원본을 읽고(읽기만, 쓰기·삭제 호출 없음) pypdf로 쪽마다 글을 뽑는다. 글에서는 NUL만 빼고 가공하지 않으며, 공백·제어 문자뿐인 쪽은 `readable: false`·빈 글이다. OCR은 하지 않는다.
4. 결과를 큐 `worker-messages`에 작업 `PdfExtractionResult`(작업 ID `message-pdf-{pdfMaterialId}-result`)로 한 번 넣고, api의 수신 확인은 기록만 한다. 거부되거나 확인을 못 봐도 다시 보내거나 다시 추출하지 않는다.

| 경우 | 결과 |
|---|---|
| 파싱 실패, 쪽 수 0, 어느 한 쪽의 읽기·글 추출 예외 | `FAILED`/`UNREADABLE_FILE` |
| 암호화된 PDF | `FAILED`/`ENCRYPTED` |
| 51쪽 이상(글을 뽑기 전에 판정) | `FAILED`/`PAGE_LIMIT_EXCEEDED` |
| 쪽 글 합계가 60,000자(코드 포인트)를 넘음(그 쪽에서 멈춤, 부분 결과 없음) | `FAILED`/`TEXT_LIMIT_EXCEEDED` |
| 자식의 시간·메모리 제한 초과, 원인 모를 자식 종료 | `FAILED`/`UNREADABLE_FILE`(10분 시한보다 일찍 확정) |
| 저장소 장애, 자식 코드 결함, 내부 결과 메시지 손상 | 결과 없이 작업 실패. 자료는 api의 10분 시한으로 `FAILED`(`DEADLINE_EXCEEDED`)가 된다 |

상한 값(20 MB·50쪽·60,000자)은 api와 같은 값이며 `app/pdf_extraction/settings.py`에 있다. 한쪽만 바꾸지 않는다.

### 설정

이름과 설명은 `.env.example`에 있다. 큐 주소·접두사는 분석 소비자 설정을 함께 쓴다([docs/queue-consumer.md](docs/queue-consumer.md) 「설정」).

| 이름 | 기본 | 내용 |
|---|---|---|
| `PDF_FILE_ROOT` | 없음 | 로컬·시험용 읽기 경로. api의 `FILE_STORAGE_LOCAL_ROOT`와 같은 폴더(읽기 전용으로 붙임)의 절대 경로 |
| `FILE_STORAGE_S3_BUCKET` | 없음 | 배포용 읽기 경로. api와 같은 버킷 이름. 접근 키는 넣지 않고 AWS 기본 자격 체인(역할)을 쓰며, 지역은 boto3가 읽는 `AWS_DEFAULT_REGION`으로 준다 |
| `CATCHU_WORKER_PDF_CONCURRENCY` | 1 | 동시 추출 수. 지금은 1만 받는다 |
| `CATCHU_WORKER_PDF_CHILD_TIMEOUT_SECONDS` | 120 | 자식의 총 시간(1~600) |
| `CATCHU_WORKER_PDF_CHILD_MEMORY_MB` | 512 | 자식 메모리 제한(64~16384). Linux에서만 적용되고 그 밖에서는 시간 제한이 주 수단이다 |

- 두 읽기 경로를 모두 비우면 PDF 소비자를 띄우지 않는다(분석 소비자는 그대로 뜬다). 둘 다 넣으면 기동하지 않는다. 읽기 경로 없이 나머지 값만 넣어도 기동하지 않는다.
- 기동 로그의 `pdf=enabled(concurrency=1)`로 떴는지 확인한다.
- 로컬 합성 구성(`deploy/compose.local-db.yaml`)은 볼륨 `files`를 api에 쓰기, worker에 읽기 전용으로 붙여 둔다. 쓰려면 환경 파일에 위 `PDF_FILE_ROOT`와 api의 로컬 저장 설정을 넣는다.
- 로그에는 `pdfMaterialId`·결과·쪽 수만 남기고 저장 키·경로·쪽 글은 남기지 않는다.

### 확인 범위

- 자동 시험: `tests/test_pdf_extraction.py`(32, 추출·원본 읽기·설정), `tests/test_pdf_consumer.py`(19, 처리 함수와 실제 자식 프로세스, 가짜 출력 큐), `tests/test_pdf_service.py`(10, 서비스 연결·기동·종료. 뒤 절은 실제 Redis가 있어야 돌고 없으면 건너뛴다). 시험 도구는 `tests/pdf_synthetic.py`(합성 PDF)·`tests/pdf_children.py`(시험용 자식)다.
- 로컬 파일 읽기 경로 + 실제 큐 + 현재 작업본으로 빌드한 worker 컨테이너에서 api 업로드부터 `DONE`까지 **확인됨**(2026-11-11). 20·30·40·50·50쪽 합성 PDF 5건(마지막 파일은 쪽마다 그림 포함) 연속 업로드가 약 2.2~2.5초에 모두 `DONE`으로 관측됐고, 건당 추출은 약 0.3~0.6초였다. 실제 사용자 문서·스캔본으로는 재지 않았다([U8 코드 요약 §17.5](../aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/code-generation/code-summary.md)).
- **미검증**: 실제 S3 읽기, Compose 전체 스택 기동 안에서의 추출. Windows에서는 소비자 서비스가 뜨지 않아(신호 처리기) Linux 컨테이너로 확인했다.

## 변경 후 검사

다음 명령을 `worker/`에서 실행한다.

```sh
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked pytest
```

커버리지는 `uv run --locked pytest --cov --cov-report=term-missing`으로 잰다. `app/` 파일별 줄 비율과 빠진 줄을 표로 내고, 시험이 불러오지 않은 파일도 0%로 넣으며, 큐 소비자 시험이 띄우는 자식 프로세스의 실행도 함께 센다(`pyproject.toml`의 `[tool.coverage.run]`). Unit의 비율은 `--cov=app/<폴더>`로 범위를 그 Unit 폴더로 좁혀 잰 맨 아래 `TOTAL` 줄로 본다(여러 폴더는 `--cov`를 폴더마다 준다). 강제 종료(SIGKILL·`os._exit`)로 끝난 자식의 실행은 저장되지 않아 그만큼 낮게 나올 수 있다. CI는 재지 않는다.

Ruff는 정적 오류와 코드 서식을 검사한다. 서식 수정이 필요하면 `uv run --locked ruff format .`을 실행한 뒤 다시 검사한다. mypy는 `app/`과 `tests/`를 strict 설정으로 검사한다. pytest는 외부 서비스 연결 없이 FastAPI `TestClient`로 `/health`의 상태 코드와 응답 본문을 확인하고, [M1 합성 결과 세트](fixtures/m1-synthetic/README.md)의 사례마다 메시지 스키마(진행 알림 v2, 결과 v3) 판정과 음성 대조를 확인한다. 요청 검사와 합성 결과 생성은 거부 조건, 시나리오별 결과, 실행 불명 처리를 확인하며, 네트워크 연결을 막은 상태에서도 모든 시나리오가 끝나는지 본다. 수집 검사는 합성 GitHub 응답으로 사전 거부·호출 통제·상한·실패 보존·정규화·근거·결과 조합 연결·정리와 비밀값 누출을 확인하고, 관계 조회의 단계·조회 대상·멈춤 처리와 연결 PR 묶음 조회(GraphQL)의 요청 본문·응답 대응·실패 분류·묶음 경계·호출 수를 확인한다. 후보 판별 검사는 작업 동일성 값([wi1 규칙](docs/candidate-decision.md)), 실제 git과 대조한 공백을 무시한 diff 값, 배정·보류·같은 변경·커밋 묶음·집계·기록의 글, 판별 기준 문서의 합성 사례를 수집부터 결과 조합까지 확인한다. 생성 검사는 합성 제공자로 재료 고르기·patch 확인·가리기·크기 선별·응답 판정·문장 틀·제목·상태와 실패·호출 한도와 시간·제목 고쳐 쓰기·근거 한계 문구를 수집부터 결과 조합까지 확인하고, 제공자 입력·결과·로그에 가린 값이 남지 않는지 본다. 실제 제공자 어댑터는 진짜 SDK에 가짜 HTTP 전송을 붙여 요청 설정·재시도 끔·오류 변환을 확인한다. 실제 git으로 만드는 시험은 git이 없으면 건너뛴다. LIVE 처리 검사는 loopback 합성 조회 API·합성 GitHub·합성 제공자로 조회 1회·요청 대조·수집부터 생성까지·생성 마감·조회 모름과 실패의 실패 결과·자격정보 해제를 확인한다. 큐 소비자 검사는 가짜 큐와 실제 자식 프로세스로 작업 봉투·자체 검사·MOCK과 LIVE 종결·실행 불명·상한 초과·자식 회수·통신 경계·결과 전송 상한·수신 확인·설정·로그를 확인하고, `CATCHU_TEST_REDIS_URL`이 있으면 실제 Redis로 종료 신호 경쟁·정체 0회·잠금 갱신·Node가 넣은 요청 옵션·보관 정리·상태 확인·실패 사유를 확인한다(CI는 Valkey 8.1.6으로 늘 돈다, [검사](docs/queue-consumer.md#검사)). 테스트는 실제 서버 기동 확인을 대신하지 않으므로 실행·확인 절차도 수행한다.

검사 결과·실행 환경·기준 커밋·작성자 외 재현 여부는 초기화 이슈·PR에 남긴다. 이 README의 명령과 기대 결과 자체가 검사 통과 기록은 아니다. 로컬 확인과 AWS 배포 검증은 각각 기록한다.

## 파일 역할과 다음 코드 위치

| 파일 | 역할 |
|---|---|
| `app/__init__.py` | 앱 Python 모듈의 경계 |
| `app/main.py` | FastAPI 앱과 `/health` 경로 |
| `tests/test_health.py` | 헬스체크 계약 검사 |
| `app/contract/` | api–worker 메시지 스키마 v2 검사(api/contracts/repository-analysis 정본을 읽음), 세 ID 식별 판정, 합성 템플릿 채우기 |
| `fixtures/m1-synthetic/` | E·B 시험이 함께 쓰는 M1 합성 결과 세트와 사례별 기대 결과([안내](fixtures/m1-synthetic/README.md)) |
| `tests/test_worker_messages.py` | 합성 사례·음성 대조의 스키마 판정 검사 |
| `app/processing/` | 요청 검사(`request_check.py`), 제공자 비종속 생성 인터페이스(`generation.py`), 결과 조합(`result.py`), 처리 순서(`pipeline.py`), 큐 소비자 자식이 부르는 요청 처리(`runner.py`), LIVE의 수집·후보·생성 조립(`live.py`), 가짜 생성기와 합성 요청(`fake_generator.py`·`synthetic.py`), 개발용 실행(`__main__.py`), FR10 확인 명령(`confirm.py`)과 수집 결과 파일(`collection_file.py`) |
| `app/consumer/` | 분석 요청 큐 소비자. 실행(`__main__.py`), 설정(`settings.py`), 큐 규격(`queues.py`), 서비스·종료 순서(`service.py`), 처리 함수(`parent.py`), 자식 관리(`children.py`), 자식 진입점(`child.py`), 부모·자식 프레임(`frames.py`), 수신 확인 조회(`receipts.py`), 상태 확인(`health.py`) |
| `tests/test_consumer_*.py`, `tests/consumer_*.py`, `tests/node_add_request.cjs` | 큐 소비자 검사(가짜 큐 `processor`·`receipts`·`settings`, 실제 Redis `redis`)와 시험 도구(가짜 큐·짧은 상한, 시험용 자식, 별도 프로세스 실행, Node로 요청 넣기) |
| `tests/test_request_check.py` | 요청 형식·접수 맥락 불일치·지난 시도의 거부 검사 |
| `tests/test_processing.py` | 종결값·미제공과 실패 구분·초안/질문/제목 실패·진행 알림과 실행 불명·외부 호출 없음 검사 |
| `app/collection/` | 허용 GitHub 자료 수집. 순서 조립(`collect.py`), 자격정보 대조(`credentials.py`), 선택 범위(`selection.py`), 상한(`limits.py`·`budget.py`), 호출 통제(`gateway.py`), HTTPS 전송(`transport.py`), 경로 틀(`api_paths.py`), 연결 PR 묶음 조회의 GraphQL 쿼리 틀(`graphql.py`), 식별 값 검사(`identifiers.py`), 종류별 수집(`collectors.py`), 관계 조회(`relations.py`), 기본 브랜치 커밋의 병합 계산(`graph.py`), 응답 정규화(`normalize.py`·`records.py`), 근거 재료(`evidence.py`), 실패 코드(`failures.py`) |
| `tests/github_synthetic.py` | 수집·후보 판별 검사용 합성 GitHub 응답(경로·PR·커밋·파일 항목, 연결 PR 묶음 조회의 GraphQL 요청 검사와 응답)·자격정보와 선택 범위 대역·가짜 시계. M1 합성 결과 세트와 따로 둔다. 연결 PR은 SHA마다 `associated_key`로 정하고, 정하지 않은 SHA를 물으면 시험 실패다 |
| `tests/git_synthetic.py` | 실제 git으로 만든 합성 저장소와, 그 커밋을 GitHub 커밋 응답 모양으로 옮기는 시험 도구, 사례용 파일 내용·두 갈래 브랜치 도우미. 같은 변경 확인 시험과 후보 판별 사례 시험이 실제 git 결과와 대조할 때 쓰며, git이 없으면 그 시험을 건너뛴다 |
| `tests/conftest.py` | 여러 시험 파일이 함께 쓰는 고정값(시험마다 새로 만드는 합성 git 저장소 `repo`) |
| `tests/test_collection_*.py` | 첫 호출 전 거부(`boundary`), 호출 통제·상한·실패 응답(`controls`), 정상 수집·정규화·근거·결과 연결·정리(`flow`), 관계 조회(`relations`), 연결 PR 묶음 조회의 쿼리·응답 대응·실패 분류·점수(`graphql`)와 묶음 경계·순서(`lookup_batches`), HTTPS 전송(`transport`) |
| `tests/call_budget_shapes.py`·`tests/test_lookup_call_budget.py` | 요청당 호출 수를 비교할 합성 저장소 모양과, 운영 제안 상한으로 후보 판정까지 가는지·종류별 호출 수 시험. 같은 모양을 기준 판본에서 돌려 REST와 비교할 수 있다 |
| `app/request_context/`·`tests/test_request_context*.py` | 요청 단위 내부 api HTTP 조회(찾음·모름·실패), 고정 resolver, 이유 코드와 회원 문구(`reasons.py`), 설정과 합성 HTTP 경계 검사([연결 안내](docs/request-context.md)) |
| `tests/live_synthetic.py`·`tests/test_live_processing.py` | LIVE 처리 시험 도구(합성 요청·조회 응답·저장소·제공자)와, 조회부터 수집·후보·생성·결과까지와 조회 모름·실패 시험 |
| `app/candidates/` | 후보 묶음·본인 기여 확인·작업 동일성(#118). wi1 값(`identity.py`), 같은 변경의 재료(`same_change.py`), 소속·배정·커밋 묶음(`grouping.py`), 기록의 글(`record_text.py`), 후보 자격·집계·문장·근거(`build.py`) |
| `app/redact.py` | 비밀값·개인정보 가리기. 생성 재료와 후보 판정의 기록의 글 검사가 함께 쓴다 |
| `tests/candidate_scenarios.py` | 후보 판별 사례 시험용 선언형 합성 저장소와, 수집부터 결과 조합까지 돌리는 실행 도구 |
| `tests/test_candidate_*.py` | wi1 값(`identity`), 공백을 무시한 diff 값·관계 근거(`same_change`), 수집 관측을 직접 만든 묶음·집계·근거(`grouping`), 판별 기준 문서의 합성 사례(`cases`), 수집·판별·결과 조합 연결(`flow`) |
| `app/generation/` | 설명 초안·질문·제목 생성(#120). 입구(`flow.py`), 재료 찾기(`material.py`), patch 확인(`patch.py`), 입력 만들기·크기 선별(`request.py`), 재료 순서·변경 묶음(`groups.py`), 응답 판정(`response.py`), 문장 틀(`render.py`), 제목(`title.py`), 실패 코드·한계 문구(`outcome.py`), 상한(`limits.py`), 제공자 경계(`provider.py`), 실제 제공자 어댑터(`claude.py`), AI 쪽 판정 질문·적용(`judged.py`, CR3) |
| `app/judgement/` | 판정 공급자 자리(CR3). 규약(`provider.py`), 요청 조립·재료 판정 답 정리(`questions.py`), 호출 한 번과 답 읽기(`answers.py`), 기계 대조(`factcheck.py`), 합성·OpenAI·Claude 어댑터(`synthetic.py`·`openai_judge.py`·`claude.py`) |
| `tests/test_judgement*.py` | 판정 요청·답·어댑터(`judgement`), 기계 대조(`factcheck`), FR10 확인 명령(`confirmation`) |
| `tests/generation_scenarios.py` | 생성 시험용 합성 제공자(받은 요청 기록, 정해 둔 응답·예외·늦은 응답)와, 수집부터 생성·결과 조합까지 돌리고 후보 보존을 확인하는 실행 도구 |
| `tests/test_generation_*.py` | patch 확인(`patch`), 가리기(`redact`), 재료 찾기(`material`), 변경 묶음(`groups`), 응답 판정·문장 틀(`response`), 제목(`title`), 상태·실패·호출 한도(`flow`), 고쳐 쓰기·근거 한계·가리기 끝까지(`rewrite_coverage`), 실제 제공자 어댑터(`claude`) |
| `pyproject.toml` | 프로젝트 의존성·개발 도구·검사 설정 |
| `uv.lock` | 실행·개발 의존성의 잠금 파일. 저장소에 함께 커밋 |
| `.python-version` | 로컬에서 사용할 Python 버전 |
| `app/pdf_extraction/`·`tests/test_pdf_*.py` | PDF 글 추출 소비자(U8). 설정(`settings.py`), 봉투 검사·결과 조립·수신 확인 분류(`envelope.py`), 원본 읽기(`reader.py`), pypdf 추출(`extract.py`), 자식 진입점(`child.py`), 처리 함수(`worker.py`)와 그 검사 |
| `.env.example` | 큐 소비자(LIVE 처리 설정, PDF 추출 설정 포함)에 주입할 환경변수 안내 |

앱 코드는 `app/`, 그 동작을 확인하는 테스트는 `tests/`에 추가한다. API 경로나 처리 로직이 늘어나면 관련 모듈로 나누고 `app/main.py`에서 연결한다. 큐 작업 수신·결과 전달은 `app/consumer/`에 있다([#121](https://github.com/JminAILab/CatchU/issues/121), [#77](https://github.com/JminAILab/CatchU/issues/77) 판정). `.venv/`와 검사 캐시는 커밋하지 않는다.
