# worker 운영 이미지(#275). 빌드 맥락은 저장소 루트다. 사용법·검사는 deploy/README.md.
#   docker build -f worker/Dockerfile -t <worker 이미지> .
# Python 3.12.10은 uv가 관리하는 CPython을 쓴다. 공식 python:3.12.10 이미지는 2025-05 이후 다시 빌드되지 않아
# 그 뒤의 기반 OS 패키지 갱신(보안 갱신 포함)이 들어 있지 않으므로, 갱신되는 Debian(trixie) 위에 고정 판본 Python을 둔다(Python 판본은 그대로).
# 한계: 이 Python에 묶여 들어온 OpenSSL(3.0.16)·SQLite 등은 Debian 갱신으로 바뀌지 않는다. Python 패치 판본을 올릴 때만 바뀐다.
ARG DEBIAN_IMAGE=debian:trixie-slim@sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.12.18@sha256:3adc3706091ce7c2fe595e669628caedd6d951551b92b258b7e7dbe06d9440bc
ARG CONTRACT_DIR=api/contracts/repository-analysis

FROM ${UV_IMAGE} AS uv

FROM ${DEBIAN_IMAGE} AS build
COPY --from=uv /uv /usr/local/bin/uv
# 실행 단계와 같은 경로에 Python과 가상환경을 만든다(.venv의 python이 이 경로를 가리킨다).
ENV UV_PYTHON_INSTALL_DIR=/opt/uv-python \
    UV_PYTHON_PREFERENCE=only-managed \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_NO_CACHE=1
WORKDIR /app/worker
COPY worker/.python-version worker/pyproject.toml worker/uv.lock ./
# .python-version(3.12.10)을 설치하고, 잠금 파일 그대로 개발 그룹(ruff·mypy·pytest 등)을 뺀 의존성만 넣는다.
# uv가 남기는 잠금 파일(누구나 쓸 수 있는 권한)은 실행에 쓰지 않으므로 지운다.
RUN uv python install && uv sync --locked --no-dev && rm -f /opt/uv-python/.lock .venv/.lock
COPY worker/app ./app
COPY worker/fixtures/m1-synthetic ./fixtures/m1-synthetic
RUN .venv/bin/python -m compileall -q app

FROM ${DEBIAN_IMAGE} AS runtime
ARG CONTRACT_DIR
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.title="catchu-worker" \
      org.opencontainers.image.revision="${SOURCE_REVISION}"
# GitHub 수집(app/collection/transport.py)은 시스템 CA 목록으로 HTTPS를 검증한다. 실행 사용자는 숫자 UID 1000이다.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 catchu \
    && useradd --uid 1000 --gid 1000 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin catchu
COPY --from=build /opt/uv-python /opt/uv-python
COPY --from=build /app/worker /app/worker
# 계약 YAML은 저장소와 같은 상대 위치에 둔다. worker_messages.py가 parents[3](=/app) 기준으로 찾는다.
COPY ${CONTRACT_DIR}/common.yaml ${CONTRACT_DIR}/worker-messages.yaml /app/${CONTRACT_DIR}/
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app/worker
USER 1000:1000
EXPOSE 8000
# 분석 소비자(#121). 큐 설정은 실행할 때 주입한다(worker/docs/queue-consumer.md). 같은 포트로 /health만 연다.
# 이 프로세스(컨테이너 PID 1)가 작업마다 띄운 자식을 직접 회수하고, SIGTERM을 받으면 25초 안에 끝낸다.
CMD ["/app/worker/.venv/bin/python", "-m", "app.consumer"]
