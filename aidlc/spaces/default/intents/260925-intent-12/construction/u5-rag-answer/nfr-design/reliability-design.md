# U5 RAG 응답 — 신뢰성 설계

## Sources

작성일: 2026-10-30. 입력: [성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[보안](../nfr-requirements/security-requirements.md)(security-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[관측](../nfr-requirements/observability-requirements.md)(observability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U5 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 W3~W7과 상태 전이, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-02·C-06과 「에러 대응 최소선」, [비기능 설계 질문·답변](nfr-design-questions.md) Q1.

## 실패 처리와 수명

| 요구사항 | 설계 |
|---|---|
| NFR5.1 연쇄 삭제(비기능 설계 수정 요청 R-01 반영) | U5 코드 PR에 `base_summary` 마이그레이션을 넣는다(Q1, 앱 등록을 기다리지 않음). 승인된 기능 명세 엔티티대로 `base_summary_id uuid` 기본 키(`pk_base_summary`), `publication_id uuid NOT NULL`(UNIQUE `uq_base_summary_publication_id`, 외래 키 `fk_base_summary_publication` → `publication(publication_id) ON DELETE CASCADE`), `status varchar NOT NULL CHECK IN ('PENDING','DONE','FAILED')`, `deadline_at timestamptz NOT NULL`, `items jsonb NOT NULL DEFAULT '[]'`, `generated_at timestamptz NULL`, `updated_at timestamptz NOT NULL`. 상태 값 제약은 `ck_base_summary_status`. 외래 키는 엔티티에서 `deleteWithParent`로 선언하고, 제약 이름은 `CreatePublicationTables`·U3 `publication_index`와 같은 `pk_`·`uq_`·`fk_`·`ck_` 규칙을 따른다. 같은 PR에서 `api/docs/member-withdrawal-deletion.md`에 행을 더하고 `test/db/member-cascade-delete.test.cjs`가 통과하는지 본다. U4의 `publication` 표는 이미 통합 브랜치에 있다(#422) |
| NFR5.2 늦은 결과 | 결과 쓰기는 조건부 UPDATE 한 번이다. 성공: `SET status='DONE', items=$, generated_at=now, updated_at=now WHERE publication_id=$ AND status<>'FAILED' AND deadline_at>now`. 0개·실패: `SET status='FAILED' … WHERE publication_id=$ AND status='PENDING' AND deadline_at>now`. 갱신 수 0이면 버림으로 로그를 남기고 끝낸다. 행이 지워졌으면 갱신 수가 0이다 |
| NFR5.3 처리 시한 | 처리기 시작 때 행이 없으면 `INSERT … ON CONFLICT (publication_id) DO NOTHING`으로 `PENDING`(`deadline_at = published_at + 10분`)을 만들고, 그 뒤 행을 다시 읽어 `PENDING`이고 마감 전일 때만 생성한다. 읽기 경로의 시한 판정은 C-02 `readStatus` 순수 함수와 조건부 UPDATE |
| NFR5.4 접수와 완료 | 다시 만들기 응답은 커밋과 `enqueueAfterCommit` 뒤 `202 {}`. `ENQUEUE_FAILED`면 경고 로그를 남기고 같은 `202` |
| NFR5.5 예외를 삼키지 않음 | 처리기는 생성 예외를 잡아 실패 종류를 로그로 남기고 조건부 `FAILED`를 쓴 뒤 정상 반환한다(AiRun 시도 1회). 조건부 UPDATE 자체가 실패하면(DB 오류) 로그를 남기고 예외를 다시 던져 AiRun이 실패로 기록하게 한다. 질의응답은 스트림 전 오류를 공통 예외 필터로, 스트림 뒤 오류를 `error` 이벤트와 로그로 드러낸다 |
| NFR5.6 의존 실패 범위 | 다시 쓰기·검색·생성 실패는 그 질문만 끝낸다. 회로 차단기·대체 응답·캐시 없음. Redis 실패는 통과. 색인 상태는 질의응답만 막고, 요약 읽기·열람은 색인을 보지 않는다 |
| NFR5.7 한계 | 기능 설계 가정 절의 한계를 그대로 받아들인다. 더해 연결이 끊긴 뒤 게이트 스트림 닫힘이 게이트 시간 제한(45초)까지 늦을 수 있고, 이미 시작한 다시 쓰기는 끝까지 돈다. Redis가 없거나 장애인 동안 질문 수 상한이 없다(질문당 약 $0.001) |

## RAG 품질 평가

| 요구사항 | 설계 |
|---|---|
| NFR3.1 측정 시점과 모드 | 평가 스크립트는 api의 `scripts/` 아래 하나로 두고 `package.json` 스크립트 이름 하나로 손으로 실행한다(CI 작업에 넣지 않음). 실행 인자로 모드(`synthetic`·`measure`)를 받는다. `measure`는 실제 게이트·검색(키가 있어야 함)과 실제 DB의 발행본으로만 돈다. `synthetic`은 합성 게이트·검색·메모리 사본으로 끝까지 돌고 결과에 `SYNTHETIC_CHECK`를 적는다 |
| NFR3.2 계산과 판정 | 스크립트가 정답 위치 찾기(사본 필드에서 글귀 전부 찾기), `search(…, 12)` 한 번과 앞 5·8·12 적중, 앞 8개로 QNA `generate` 한 번과 통과·버린 수를 계산한다. 판정(오귀속·비뒷받침·다른 곳의 맞는 근거)은 사람이 `docs/` 기록의 빈 칸에 적고, 조정·재측정 여부도 그 기록에 적는다 |
| NFR3.3 원문 보관 | 입력 파일과 원문 결과 파일은 저장소의 `.gitignore`가 덮는 로컬 폴더(예: `api/.rag-eval/`)에만 쓴다. `docs/` 기록에는 건수·위치·판정만 쓴다. JD 전체 넣기는 스크립트가 `published_chunk`를 `seq` 순서로 읽기 전용으로 읽는다(평가 스크립트에서만) |

## 화면에서의 구분

| 요구사항 | 설계 |
|---|---|
| NFR7.1 표시 | web `BaseSummaryPanel`·`QnaPanel`이 같은 항목 표시 컴포넌트 하나를 쓴다: `CITED`는 인용 원문과 출처 이름 단추(누르면 `showEvidence(location)`), `AI_INTERPRETATION`은 'AI 해석' 꼬리표. 요약 패널 머리는 'AI 요약' |
| NFR7.2 상태 문구 | 문구는 web 상수 표 하나에 두고(만드는 중·요약 없음·만들지 못함·한도·아직 쓸 수 없음·근거 없음·답 실패·500자), 패널이 상태·오류 코드로 고른다 |
