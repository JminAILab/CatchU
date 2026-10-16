from fastapi import FastAPI

app = FastAPI(title="CatchU worker")


@app.get("/health")
async def health() -> dict[str, str]:
    """외부 서비스 연결 없이 프로세스의 응답 여부를 확인한다."""
    return {"status": "ok"}
