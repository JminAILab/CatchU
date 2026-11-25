# Tech Stack Decisions — u1-preset-contract

근거: 코드 지식 기록 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`, 요구사항 `inception/requirements-analysis/requirements.md`(Constraints: 지금 스택, 새 라이브러리 없음, migration으로 DB 변경), 기능 설계 `construction/u1-preset-contract/functional-design/functional-spec.md`와 `rules.md`, 구성 요소 결정 `inception/domain-design/decisions.md`(ADR-001).

새 기술을 들이지 않는다. 지금 api 스택 안에서 모듈 하나를 더하고 규칙을 옮긴다.

| 영역 | 결정 | 이유 |
|---|---|---|
| 언어·프레임워크 | TypeScript, NestJS(지금 api) | requirements Constraints |
| 새 모듈 | api `presets` 모듈(PresetLibrary)과, 발행 모듈에서 뗀 발행 자격·사본 내용·글자 수 규칙(PublishableSource) | ADR-001 |
| DB | PostgreSQL, TypeORM 엔티티 + 손으로 쓴 SQL(지금 발행 코드와 같은 방식) | 지금 코드 |
| DB 변경 | `api/src/database/migrations/`에 마이그레이션 하나(프리셋 표 둘, published_item 칸 둘, 변경 전 발행본 행 지우기). 제약 이름은 지금 규칙(`pk_`·`uq_`·`ck_`·`fk_`·`ix_`)을 따른다 | requirements Constraints, 스캔 기록 §9 |
| 외래 키 삭제 규칙 | 모두 ON DELETE CASCADE, 엔티티는 지금처럼 부모를 따라 지우는 표시. `api/docs/member-withdrawal-deletion.md` 표에 행을 더한다 | C-06, ADR-004 |
| 시험 | 지금 api 시험 방식(`api/test/` 아래 node 시험, pgvector가 있는 로컬 DB 5433). 새 시험 도구를 들이지 않는다 | 팀 관행 Testing Posture |
| 새 라이브러리 | 없음 | requirements Constraints |
