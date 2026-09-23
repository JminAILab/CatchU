# worker — 수집·분석 처리

FastAPI 기반 worker의 최소 실행 골격이다. 현재 구현은 `GET /health`이며 HTTP `200`과 `{"status":"ok"}`를 반환한다. 실제 GitHub 수집·분석, DB·큐·LLM 연결, Docker·CI·NCP 배포는 후속 작업이다.

작업 범위는 [#84](https://github.com/JminAILab/CatchU/issues/84), 공통 착수·브랜치·검사·PR 기준은 [코딩 운영](../docs/CatchU_작업관리.md#코딩-운영)을 따른다. worker 초기화 담당이 이후 분석 기능과 공통 환경까지 자동으로 맡는 것은 아니다.

## 도구와 버전

| 구분 | 기준 |
|---|---|
| Python | `3.12.10` (`.python-version`과 `requires-python`에 고정) |
| 가상환경·의존성 관리 | `uv` (`0.12.18` 기준) |
| 웹 앱·서버 | FastAPI `0.141.1`, Uvicorn `0.53.0` |
| 정적·서식·타입 검사 | Ruff `0.16.8`, mypy `2.3.1` |
| 테스트 | pytest `9.1.1`, HTTPX2 `2.13.0` |

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

## 변경 후 검사

다음 명령을 `worker/`에서 실행한다.

```sh
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked pytest
```

Ruff는 정적 오류와 코드 서식을 검사한다. 서식 수정이 필요하면 `uv run --locked ruff format .`을 실행한 뒤 다시 검사한다. mypy는 `app/`과 `tests/`를 strict 설정으로 검사한다. pytest는 외부 서비스 연결 없이 FastAPI `TestClient`로 `/health`의 상태 코드와 응답 본문을 확인한다. 테스트는 실제 서버 기동 확인을 대신하지 않으므로 실행·확인 절차도 수행한다.

검사 결과·실행 환경·기준 커밋·작성자 외 재현 여부는 초기화 이슈·PR에 남긴다. 이 README의 명령과 기대 결과 자체가 검사 통과 기록은 아니다. 로컬 확인과 NCP 배포 검증은 각각 기록한다.

## 파일 역할과 다음 코드 위치

| 파일 | 역할 |
|---|---|
| `app/__init__.py` | 앱 Python 모듈의 경계 |
| `app/main.py` | FastAPI 앱과 `/health` 경로 |
| `tests/test_health.py` | 헬스체크 계약 검사 |
| `pyproject.toml` | 프로젝트 의존성·개발 도구·검사 설정 |
| `uv.lock` | 실행·개발 의존성의 잠금 파일. 저장소에 함께 커밋 |
| `.python-version` | 로컬에서 사용할 Python 버전 |
| `.env.example` | 필요한 환경변수 안내. 현재는 없음 |

앱 코드는 `app/`, 그 동작을 확인하는 테스트는 `tests/`에 추가한다. API 경로나 처리 로직이 늘어나면 관련 모듈로 나누고 `app/main.py`에서 연결한다. 큐 작업 수신·결과 전달은 [#77](https://github.com/JminAILab/CatchU/issues/77) 검증과 관련 계약을 확인한 후 구현한다. `.venv/`와 검사 캐시는 커밋하지 않는다.
