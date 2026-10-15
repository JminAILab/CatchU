"""분석 소비자 프로세스의 상태 확인(`GET /health`, 포트 8000).

이 프로세스에는 상태 확인 외 HTTP 기능을 넣지 않는다(문서 화면도 끈다). 판정은 앱이 쥔 실행
작업의 상태로 하고 Redis 명령을 기다리지 않는다.
"""

from collections.abc import Callable
from typing import Literal

from fastapi import FastAPI
from fastapi.responses import JSONResponse

ConsumerState = Literal["disabled", "starting", "running", "stopped", "stopping"]
HEALTHY: frozenset[str] = frozenset({"disabled", "running"})


def create_health_app(state: Callable[[], ConsumerState]) -> FastAPI:
    app = FastAPI(
        title="CatchU analysis consumer",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    @app.get("/health")
    async def health() -> JSONResponse:
        consumer = state()
        if consumer in HEALTHY:
            return JSONResponse({"status": "ok", "consumer": consumer})
        return JSONResponse(
            {"status": "unavailable", "consumer": consumer}, status_code=503
        )

    return app
