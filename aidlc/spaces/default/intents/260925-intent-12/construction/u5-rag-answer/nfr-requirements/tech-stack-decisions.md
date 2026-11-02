# U5 RAG 응답 — 기술 선택

## Sources

작성일: 2026-10-30. 입력: [U5 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U5 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 C02·C07·NFR2, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-01·C-02·C-03·C-09·C-10·C-11·C-12, [보안 점검](../../../../../../../docs/CatchU_security_checks.md) 「외부 호출」·「의존성 추가·갱신」, `api/package.json`(`@anthropic-ai/sdk` 0.133.0, `ioredis` 6.0.0, `bullmq` 6.3.11), `api/src/analysis-queue/analysis-queue.config.ts`, [비기능 질문·답변](nfr-requirements-questions.md) Q1~Q4.

## 선택

| 영역 | 선택 | 이유 |
|---|---|---|
| 위치 | api(NestJS, TypeScript)의 새 모듈(예: `api/src/rag-answer`)에 질의응답·기본 요약을 두고, 받은 사람 경로는 `/v1/public/links/{token}/questions`·`/summary`, 작성자 경로는 `/v1/publications/{publicationId}/summary`·`…/regenerate`. web은 C-11 자리에 `BaseSummaryPanel`·`QnaPanel` | C-11·C-12, 기능 설계 「범위」. 새 배포 단위를 만들지 않는다 |
| 저장 | PostgreSQL + TypeORM 마이그레이션으로 `base_summary` 표 하나(발행본 외래 키 `ON DELETE CASCADE`) | C-06, 기능 설계 entities.md |
| AI 생성 | U2 게이트(C-01 `generate`·`generateStream`)를 Nest 주입으로 쓴다 | C-01, ADR-002 |
| 질문 다시 쓰기 | U5 모듈 안의 `QuestionRewriter` 인터페이스와 U5가 정한 주입 토큰. 실제 구현은 기존 `@anthropic-ai/sdk`(새 의존성 없음), 키 `CATCHU_GENERATION_API_KEY`, `createGuardedFetch`(기본 256 KiB), 재시도 0, 10초, 출력 200토큰, 모델 ID는 `CLAUDE_MODEL_IDS`·`THINKING_OFF` 상수. 시험은 합성 구현 | 기능 설계 BR4.1, security-requirements NFR2.2·NFR2.3, Q1 |
| 검색·링크 판정·하루 제한·백그라운드 | C-09 `PublishedSearch`(U3), C-10 `PublicationAccess`(U4), C-03 `DailyRunLimit`·C-02 `AiRun`(U2)을 주입으로 쓰고, 개발 초기에는 계약 모양의 합성 제공자로 돌린다 | 납품 계획 B8, 계약 요약 「첫 주 선합치」 |
| 질문 횟수 | 기존 `ioredis`로 질문 횟수 전용 연결 하나. 주소·검사는 `CATCHU_QUEUE_REDIS_URL`(`readAnalysisQueueConfig`와 같은 검사), 키 앞붙이 `CATCHU_QUEUE_PREFIX`. 명령 시간 제한 1초, 끊긴 동안 명령 쌓지 않음. 주소가 비면 세지 않고 통과·기록. 새 환경변수 없음 | Q3, performance-requirements NFR4.4 |
| SSE | Nest 응답 스트림에 직접 쓴다. 머리 `text/event-stream`·`no-cache`·`X-Accel-Buffering: no`, 15초 keep-alive 주석 | Q2, performance-requirements NFR4.3 |
| 질의응답 모델 | 환경변수 없이 코드 상수 하나(기본 `HAIKU`). NFR3 조정으로 Sonnet에 바꿀 때는 그 상수를 고치는 PR로 한다. 배포 설정과 CI 합성 `api.env`는 바뀌지 않는다. 기능 설계 BR4.7의 "환경 설정 하나"는 이 상수로 구현한다 | 기능 설계 BR4.7, NFR3 조정, 비기능 수정 요청(R-04) |
| 평가 스크립트 | api 안의 CI 밖 스크립트(손으로 실행). 실제 제공자 키가 있을 때만 측정 모드. 입력·결과 원문은 저장소 밖 로컬 파일 | 기능 설계 BR10, reliability-requirements NFR3.3 |
| 시험 | api·web의 기존 시험 묶음. 합성 게이트·합성 검색·합성 링크 판정·메모리 Redis 대역으로 늘 돌고, 실제 연결은 통합 확인에서 본다. 커버리지는 팀장이 넣은 서비스별 명령 | team.md Testing Posture, 기능 설계 「주요 시나리오와 확인」 |
| 의존성 | 새 런타임 의존성 없음 | 보안 점검 「의존성 추가·갱신」 |

## 채택하지 않은 것

- 질의응답용 Redis 주소를 따로 두는 안: 새 비밀값·배포 설정이 는다(Q3 B).
- 키가 없으면 기동을 멈추는 안: 게이트와 판정이 갈린다(Q1 B).
- 질문 전체 상한(90초): 단계별 시간 제한과 겹친다(Q2 C).
- `ClaudeCitationClient`를 다시 쓰기에 쓰는 안: U1·U2 내부에 기대게 된다(기능 설계 수정 요청 R-01).
