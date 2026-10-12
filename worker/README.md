# worker — 수집·분석 처리

> 기능별 동작·연결 안내는 이 README에 덧붙이지 않고 `worker/docs/<기능>.md`로 쓴다.

FastAPI 기반 worker의 최소 실행 골격이다. HTTP 경로는 `GET /health`뿐이며 HTTP `200`과 `{"status":"ok"}`를 반환한다. 분석 요청 검사와 합성(MOCK) 결과 생성([요청 검사와 합성 결과 생성](#요청-검사와-합성-결과-생성)), 허용 GitHub 자료 수집([허용 GitHub 자료 수집과 근거 정규화](docs/github-collection.md))과 후보 묶음·작업 동일성 판별([후보 묶음과 작업 동일성](docs/candidate-decision.md))은 내부 함수로만 있다. 둘 다 합성 자료로만 검사했고 실제 GitHub 연결은 검증 전이며, 후보 판별은 아직 처리 순서에 연결하지 않았다. 초안·질문 생성, 처리 순서에 실제 수집·후보 판별 연결, DB·큐·LLM 연결, Docker·AWS 배포는 후속 작업이다. worker 관련 파일(worker 폴더, 계약 폴더, 루트 `.gitignore`, CI 파일)이 바뀐 PR에서는 「변경 후 검사」의 명령을 CI가 실행한다.

작업 범위는 [#84](https://github.com/JminAILab/CatchU/issues/84), 공통 착수·브랜치·검사·PR 기준은 [코딩 운영](../docs/CatchU_작업관리.md#코딩-운영)을 따른다. worker 초기화 담당이 이후 분석 기능과 공통 환경까지 자동으로 맡는 것은 아니다.

## 도구와 버전

| 구분 | 기준 |
|---|---|
| Python | `3.12.10` (`.python-version`과 `requires-python`에 고정) |
| 가상환경·의존성 관리 | `uv` (`0.12.18` 기준) |
| 웹 앱·서버 | FastAPI `0.141.1`, Uvicorn `0.53.0` |
| 정적·서식·타입 검사 | Ruff `0.16.8`, mypy `2.3.1` |
| 테스트 | pytest `9.1.1`, HTTPX2 `2.13.0` |
| 메시지 스키마 검사 | jsonschema `4.26.0`, referencing `0.37.0`, PyYAML `6.0.3`, 형식 검사 rfc3339-validator `0.1.4`·rfc3986-validator `0.1.1` |

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

현재 필수·선택 환경변수는 모두 없다. `.env.example`에는 이 사실만 주석으로 적었으며, `.env`로 복사할 필요가 없다. GitHub 토큰·LLM 키·큐 접속 정보는 실제 연결을 구현하는 후속 작업에서 정의한다.

## 실행·확인·종료

`worker/`에서 개발 서버를 시작한다.

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

[#113](https://github.com/JminAILab/CatchU/issues/113)의 범위다. E가 보낸 분석 요청(`Request`)을 검사하고, 가짜 생성기로 [메시지 스키마 v1](../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml)에 맞는 종결 결과(`Result`)를 만든다. 외부 호출·제공자 SDK·API 키가 없고 결과는 항상 `sourceMode: MOCK`이다. 공개 HTTP 경로나 큐 없이 `app.processing.process_request` 함수로 부른다.

1. **요청 검사**: 스키마 v1을 검사한 뒤 E가 접수한 기록(요청·현재 시도·회원·저장소·동의·허용 범위·`sourceMode`)과 필드마다 대조한다. 하나라도 다르면 생성기를 부르지 않고 거부한다. 거부는 사유와 어긋난 위치만 호출한 쪽에 돌려주며, 계약에 요청 거부 메시지가 없으므로 E에 보내는 메시지는 없다. 따라서 E의 요청은 접수 상태(`QUEUED`)로 남는다.
2. **진행 알림**: 검사를 통과하면 `RECEIVED`, 생성 직전에 `RUNNING`을 알린다.
3. **생성**: 생성기를 한 번 부른다. 생성기가 실행 여부를 확인하지 못했거나(상태 조회 오류) 시간이 초과되면 `UNCERTAIN`만 알리고 결과를 만들지 않는다. 실패로 확정하지 않고 다시 생성하지도 않는다. 이 `UNCERTAIN`은 항상 `RUNNING` 뒤에 가고, E의 [상태 전이 정본](../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md#상태-전이-정본)에는 `RUNNING`에서 `UNCERTAIN`으로 가는 전이가 없으므로 E의 처리 상태는 `RUNNING`으로 남는다.
4. **결과 조합**: 요청의 식별자·맥락을 그대로 옮긴다. 종결값은 후보와 실패의 수로 정한다(후보만 있으면 SUCCEEDED, 둘 다 없으면 EMPTY, 둘 다 있으면 PARTIAL_FAILED, 실패만 있으면 FAILED). 근거 부족·기준 미달은 `notProvided`, 수집·생성 오류는 `failures`에 넣는다. 초안·질문을 만들지 못해도 후보는 남기고 초안 본문은 `null`, 실패는 `failures`에 넣는다. 후보에 제목이 없으면 `workFacts` 첫 항목을 제목에 넣는다. 지금 계약과 B·C·E가 빈 제목을 받지 않아 두는 임시 동작이며, 계약 정정과 B·C·E 수정 뒤 뺀다([결정 문서 「담당과 순서」](../docs/ai-dlc-input-mvp/2026-10-08_catch-decisions.md#담당과-순서) ③). 제목은 #118이 만들지 않고 [#120](https://github.com/JminAILab/CatchU/issues/120)이 만든다.

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
| `title-failed` | SUCCEEDED, 제목 없음(대체값 임시 동작으로 제목이 `workFacts` 첫 항목) |
| `execution-unknown` | 결과 없음(`null`), 마지막 알림 `UNCERTAIN` |

- 처음 다섯 개는 [M1 합성 결과 세트](fixtures/m1-synthetic/README.md)의 같은 이름 템플릿과 결과가 같다. 개발용 실행에서는 `finishedAt`·`observedAt`만 실행 시각이다. 나머지는 `succeeded-one-candidate` 템플릿에서 한 부분만 바꿨다.
- 요청 값은 `context.sample.json`을 쓰고, 표본에 없는 요청 필드(고지 판본·허용 자료 종류·선정 참조·자격정보 맥락 참조·시각)만 `app/processing/synthetic.py`의 합성 값으로 채운다.

### MOCK 범위와 남은 실제 연결

이 결과는 실제 분석 성공, 실제 자료 검증, Catch 저장·열람 준비 완료를 뜻하지 않는다. 수신 확인은 E, Catch 등록은 B가 판단한다.

| 남은 실제 연결 | 이슈 |
|---|---|
| 허용 GitHub 자료 수집의 실제 연결(A 자격정보 제공·실제 환경 통제 검사). 수집 모듈은 합성 검사까지 | [#117](https://github.com/JminAILab/CatchU/issues/117) · [#133](https://github.com/JminAILab/CatchU/issues/133) · [#37](https://github.com/JminAILab/CatchU/issues/37) |
| 후보 묶음·본인 기여 확인·작업 동일성 판별의 처리 순서 연결과 실제 자료 검수. 판별 모듈(`app/candidates/`)은 합성 검사까지 | [#118](https://github.com/JminAILab/CatchU/issues/118) · [#121](https://github.com/JminAILab/CatchU/issues/121) · [#122](https://github.com/JminAILab/CatchU/issues/122) |
| 초안·질문 생성과 서비스 LLM | [#119](https://github.com/JminAILab/CatchU/issues/119) · [#120](https://github.com/JminAILab/CatchU/issues/120) |
| 요청 수신, 진행 알림과 결과의 실제 전송 | [#121](https://github.com/JminAILab/CatchU/issues/121) · [#233](https://github.com/JminAILab/CatchU/issues/233)(api 쪽) · [#77](https://github.com/JminAILab/CatchU/issues/77) |
| E 수신·개발용 주입, B 등록 | [#139](https://github.com/JminAILab/CatchU/issues/139) · [#105](https://github.com/JminAILab/CatchU/issues/105) |

## 허용 GitHub 자료 수집과 근거 정규화

[docs/github-collection.md](docs/github-collection.md)에 있다. #118이 더한 관계 조회는 [docs/relation-collection.md](docs/relation-collection.md)에 있다.

## 후보 묶음과 작업 동일성

[docs/candidate-decision.md](docs/candidate-decision.md)에 있다. 후보 문장·근거·제목은 [docs/candidate-text.md](docs/candidate-text.md), 알려진 한계와 검사는 [docs/candidate-checks.md](docs/candidate-checks.md)에 있다.

## 변경 후 검사

다음 명령을 `worker/`에서 실행한다.

```sh
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked pytest
```

Ruff는 정적 오류와 코드 서식을 검사한다. 서식 수정이 필요하면 `uv run --locked ruff format .`을 실행한 뒤 다시 검사한다. mypy는 `app/`과 `tests/`를 strict 설정으로 검사한다. pytest는 외부 서비스 연결 없이 FastAPI `TestClient`로 `/health`의 상태 코드와 응답 본문을 확인하고, [M1 합성 결과 세트](fixtures/m1-synthetic/README.md)의 사례마다 메시지 스키마 v1 판정과 음성 대조를 확인한다. 요청 검사와 합성 결과 생성은 거부 조건, 시나리오별 결과, 실행 불명 처리를 확인하며, 네트워크 연결을 막은 상태에서도 모든 시나리오가 끝나는지 본다. 수집 검사는 합성 GitHub 응답으로 사전 거부·호출 통제·상한·실패 보존·정규화·근거·결과 조합 연결·정리와 비밀값 누출을 확인하고, 관계 조회의 단계·조회 대상·멈춤 처리를 확인한다. 후보 판별 검사는 작업 동일성 값([wi1 규칙](docs/candidate-decision.md)), 실제 git과 대조한 공백을 무시한 diff 값, 배정·보류·같은 변경·커밋 묶음·나누기·집계, 판별 기준 문서의 합성 사례를 수집부터 결과 조합까지 확인한다. 실제 git으로 만드는 시험은 git이 없으면 건너뛴다. 테스트는 실제 서버 기동 확인을 대신하지 않으므로 실행·확인 절차도 수행한다.

검사 결과·실행 환경·기준 커밋·작성자 외 재현 여부는 초기화 이슈·PR에 남긴다. 이 README의 명령과 기대 결과 자체가 검사 통과 기록은 아니다. 로컬 확인과 AWS 배포 검증은 각각 기록한다.

## 파일 역할과 다음 코드 위치

| 파일 | 역할 |
|---|---|
| `app/__init__.py` | 앱 Python 모듈의 경계 |
| `app/main.py` | FastAPI 앱과 `/health` 경로 |
| `tests/test_health.py` | 헬스체크 계약 검사 |
| `app/contract/` | api–worker 메시지 스키마 v1 검사(계약 YAML을 원본 경로에서 읽음), 세 ID 식별 판정, 합성 템플릿 채우기 |
| `fixtures/m1-synthetic/` | E·B 시험이 함께 쓰는 M1 합성 결과 세트와 사례별 기대 결과([안내](fixtures/m1-synthetic/README.md)) |
| `tests/test_worker_messages.py` | 합성 사례·음성 대조의 스키마 판정 검사 |
| `app/processing/` | 요청 검사(`request_check.py`), 제공자 비종속 생성 인터페이스(`generation.py`), 결과 조합(`result.py`), 처리 순서(`pipeline.py`), 가짜 생성기와 합성 요청(`fake_generator.py`·`synthetic.py`), 개발용 실행(`__main__.py`) |
| `tests/test_request_check.py` | 요청 형식·접수 맥락 불일치·지난 시도의 거부 검사 |
| `tests/test_processing.py` | 종결값·미제공과 실패 구분·초안/질문/제목 실패·진행 알림과 실행 불명·외부 호출 없음 검사 |
| `app/collection/` | 허용 GitHub 자료 수집. 순서 조립(`collect.py`), 자격정보 대조(`credentials.py`), 선택 범위(`selection.py`), 상한(`limits.py`·`budget.py`), 호출 통제(`gateway.py`), HTTPS 전송(`transport.py`), 경로 틀(`api_paths.py`), 식별 값 검사(`identifiers.py`), 종류별 수집(`collectors.py`), 관계 조회(`relations.py`), 기본 브랜치 커밋의 병합 계산(`graph.py`), 응답 정규화(`normalize.py`·`records.py`), 근거 재료(`evidence.py`), 실패 코드(`failures.py`) |
| `tests/github_synthetic.py` | 수집·후보 판별 검사용 합성 GitHub 응답(경로·PR·커밋·파일 항목)·자격정보와 선택 범위 대역·가짜 시계. M1 합성 결과 세트와 따로 둔다 |
| `tests/git_synthetic.py` | 실제 git으로 만든 합성 저장소와, 그 커밋을 GitHub 커밋 응답 모양으로 옮기는 시험 도구, 사례용 파일 내용·두 갈래 브랜치 도우미. 같은 변경 확인 시험과 후보 판별 사례 시험이 실제 git 결과와 대조할 때 쓰며, git이 없으면 그 시험을 건너뛴다 |
| `tests/conftest.py` | 여러 시험 파일이 함께 쓰는 고정값(시험마다 새로 만드는 합성 git 저장소 `repo`) |
| `tests/test_collection_*.py` | 첫 호출 전 거부(`boundary`), 호출 통제·상한·실패 응답(`controls`), 정상 수집·정규화·근거·결과 연결·정리(`flow`), 관계 조회(`relations`), HTTPS 전송(`transport`) |
| `app/candidates/` | 후보 묶음·본인 기여 확인·작업 동일성(#118). wi1 값(`identity.py`), 같은 변경의 재료(`same_change.py`), 소속·배정·커밋 묶음·나누기(`grouping.py`), 후보 자격·집계·문장·근거(`build.py`) |
| `tests/candidate_scenarios.py` | 후보 판별 사례 시험용 선언형 합성 저장소와, 수집부터 결과 조합까지 돌리는 실행 도구 |
| `tests/test_candidate_*.py` | wi1 값(`identity`), 공백을 무시한 diff 값·관계 근거(`same_change`), 수집 관측을 직접 만든 묶음·집계·근거(`grouping`), 판별 기준 문서의 합성 사례(`cases`), 수집·판별·결과 조합 연결(`flow`) |
| `pyproject.toml` | 프로젝트 의존성·개발 도구·검사 설정 |
| `uv.lock` | 실행·개발 의존성의 잠금 파일. 저장소에 함께 커밋 |
| `.python-version` | 로컬에서 사용할 Python 버전 |
| `.env.example` | 필요한 환경변수 안내. 현재는 없음 |

앱 코드는 `app/`, 그 동작을 확인하는 테스트는 `tests/`에 추가한다. API 경로나 처리 로직이 늘어나면 관련 모듈로 나누고 `app/main.py`에서 연결한다. 큐 작업 수신·결과 전달은 [#77](https://github.com/JminAILab/CatchU/issues/77) 판정과 관련 계약에 따라 [#121](https://github.com/JminAILab/CatchU/issues/121)에서 구현한다. `.venv/`와 검사 캐시는 커밋하지 않는다.
