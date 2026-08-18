# worker — 분석 워커

GitHub 수집 → 증거카드 추출 파이프라인. FastAPI.

API 서버와 분리한 이유: GitHub API rate limit와
LLM 호출에 묶여 레포당 수 분이 걸린다. 요청 경로에 둘 수 없다.