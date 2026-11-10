# CR2 소속 저장 — 신뢰성 설계

입력: `nfr-requirements/reliability-requirements.md`(NFR4.1·NFR4.2·NFR4.3·NFR4.12·NFR6.1·NFR6.2), `nfr-requirements/tech-stack-decisions.md`(NFR6.4·NFR6.5·NFR6.6·NFR7.1), 기능 설계 `functional-design/functional-spec.md`·`rules.md`, 계약 `inception/contract-design/contract-summary.md` C2.

| ID | 설계 |
|---|---|
| NFR4.1 | 빼기는 `group(outcome, assigned)` 안 한 함수다. `build_candidates(request, outcome, assigned=...)`와 생성 재료 찾기(`material.py`의 `group` 호출)가 `LiveGenerator`가 넘긴 같은 frozenset을 쓴다. 집합의 순서에 기대지 않고, 커밋 묶음 열쇠는 지금처럼 SHA를 정렬해 만든다. 시험: 같은 입력으로 두 번 돌려 열쇠·`ownCommitShas`가 같고, 재료 찾기가 모든 후보를 찾는다. |
| NFR4.2 | 소속 삽입은 충돌 무시(`orIgnore`)라 이미 있는 (회원, 저장소, SHA)는 쓰지 않고 넘어간다. 갱신(upsert)을 쓰지 않는다. 시험: 다른 Catch를 가리키는 같은 SHA 재등록 뒤에도 저장된 `catch_id`가 그대로다. |
| NFR4.3 | 소속 삽입은 등록 함수가 받은 같은 트랜잭션 manager로 한다. 등록 함수는 오류를 삼키지 않으므로(지금 계약) DB 오류는 결과 반영의 롤백·반영 실패 기록으로 이어진다. 시험: 삽입이 실패하도록 만든 대역에서 Catch·등록 연결·소속이 모두 남지 않는다. |
| NFR4.12 | 빼기 뒤 커밋 묶음은 연결 쌍을 남은 커밋끼리만 남기고, 묶음 설명 함수는 「소속 커밋을 거친 이음」 표시가 있으면 연결이 비어도 고정 문장으로 설명한다(지금의 「이은 근거가 없다」 결함은 빼기가 없을 때만 남는다). 빈 집합이면 빼기 함수가 아무것도 바꾸지 않는다. 시험: 기능 명세 W5, 빈 집합 회귀. |
| NFR6.1 | 결과 판본 "3"은 계약 YAML(`Result.schemaVersion` enum)·api 수신 타입(`receiver.types.ts`의 Result)·worker 결과 조합(`result.py`의 `_envelope`) 세 곳에 쓴다. 진행 상태(`pipeline.py`)·합성 요청(`synthetic.py`)·수신 응답은 "2"로 둔다. api 시험 보조 검사기의 결과 시험 자료를 "3"과 `ownCommitShas`로 고친다. |
| NFR6.2 | 배포 안내를 코드 요약 「운영에 넣을 때」에 적는다: api·worker를 같은 배포로, 진행 중 분석이 없을 때. 옛 판본 호환 코드는 만들지 않는다. |
| NFR6.4 | 마이그레이션 하나에 (1) `catch_asset` 유일 조건 (2) `commit_assignment` 표·유일 조건·외래 키를 넣는다. 되돌리기(down)는 역순으로 지운다. 엔티티·DDL 대조 시험이 새 표를 잡는다. |
| NFR6.5 | 삽입은 지금 등록이 쓰는 TypeORM 질의 빌더의 `insert().values([...]).orIgnore()`로 한다. |
| NFR6.6 | worker 해석·빼기는 표준 라이브러리(frozenset, dataclass)만 쓴다. |
| NFR7.1 | 빼기 규칙 설명은 새 문서 `worker/docs/commit-assignment.md`에 쓴다. `worker/docs/candidate-decision.md`·`generation.md`·`generation-material.md`·`candidate-text.md`에는 그 문서 링크와 한두 줄만 더하고, 문서 크기 검사(36,000 B)를 돌린다. |

## 실패 처리 표

| 실패 | 처리 | 다시 시도 |
|---|---|---|
| 소속 조회 실패(api) | 500 | 없음(지금 worker 처리) |
| 새 칸 없음·모양 틀림(worker) | `CONTEXT_RESPONSE_INVALID` | 없음 |
| 응답 1 MiB 초과(worker) | `CONTEXT_RESPONSE_TOO_LARGE` | 없음 |
| 소속 삽입 DB 오류 | 결과 반영 롤백, 반영 실패 기록 | 없음 |
| 결과 판본 "2" 도착 | `SCHEMA_INVALID` 거부 | 없음 |
