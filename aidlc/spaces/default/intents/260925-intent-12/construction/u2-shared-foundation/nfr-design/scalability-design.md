# U2 공용 기반 — 확장성 설계

## Sources

작성일: 2026-10-27. 입력: [확장성 요구사항](../nfr-requirements/scalability-requirements.md)(scalability-requirements) NFR4.7~4.10, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U2 기능 명세](../functional-design/functional-spec.md)(functional-spec), [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) C-02·C-03·C-05.

## 설계

| 요구사항 | 설계 |
|---|---|
| NFR4.7 api 여러 개의 하루 횟수 | 계수는 DB 조건부 쓰기 한 문장(performance-design NFR4.3)뿐이다. 프로세스 메모리에 횟수를 두지 않는다 |
| NFR4.8 큐 소비 | 큐 `ai-run` 하나를 모든 api가 공유한다. api마다 Worker 하나, 동시 1. 확장은 api 수로만 한다(자동 확장 규칙 없음) |
| NFR4.9 같은 runKey 한 번 | BullMQ 작업 ID = runKey. 완료·실패 작업을 상수 `AI_RUN_JOB_RETENTION_SECONDS = 7200`(2시간) 동안 남겨, 그동안 같은 ID 등록은 BullMQ가 무시한다. 어느 Unit이 처리 시한을 2시간보다 길게 정하면 이 상수를 그 시한 이상으로 함께 올린다(검토 R-04). 이 조건은 소비 Unit 안내(api/docs의 AiRun 문서)에 적는다 |
| NFR4.10 로컬 저장 | 로컬 드라이버는 api 한 대(개발 서버 EC2) 기준이다. EKS에서 api가 여러 개면 파일 저장이 필요한 시점(U8)에 S3 드라이버로 바꾼다. U8 전에는 저장 파일이 없다 |

## 상태가 없는 설계

api 프로세스는 요청 사이 상태를 갖지 않는다. 하루 횟수·동의·실행 상태는 DB, 작업은 Redis에 있다. 그래서 api를 늘리거나 다시 띄워도 동작이 바뀌지 않는다.
