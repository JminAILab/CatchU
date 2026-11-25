# Logical Components — u1-preset-contract(U1)

근거: NFR 요구 `construction/u1-preset-contract/nfr-requirements/performance-requirements.md`·`security-requirements.md`·`scalability-requirements.md`·`reliability-requirements.md`·`observability-requirements.md`·`tech-stack-decisions.md`, 기능 설계 `construction/u1-preset-contract/functional-design/functional-spec.md`, 계약 `inception/contract-design/contract-summary.md`, 이 단계 질문 `nfr-design-questions.md`, 지금 코드. 구성 요소 `inception/domain-design/components.md`.

| 구성 요소 | api 안 자리 | 고장 범위 | 공유 자원 |
|---|---|---|---|
| PresetLibrary | 새 `api/src/presets/` 모듈(경로·입력·저장소·로그) | 프리셋 경로만. 실패해도 발행본 열람·질의응답은 그대로 | PostgreSQL(preset·preset_item) |
| PublishableSource | 발행 모듈에서 뗀 규칙 모듈(자격 판정·사본 내용·글자 수, 잠금 없는 읽기와 잠근 행용 함수) | 이 규칙의 오류는 프리셋 경로와 발행 둘 다에 닿는다 | PostgreSQL(Catch·자료 표 읽기) |
| SnapshotContract | `published-snapshot.ts`(사본 모양, isFirstCopy 판정 함수) | 사본을 읽는 넷(열람·요약·질의응답 머리글·받은 링크 읽기)에 닿는다 | 없음 |
| Publications | 지금 발행 모듈(요청 입력·펴기·트랜잭션·사본 읽기·응답 변환) | 발행과 열람 | PostgreSQL, 파일 저장소 |
| PublishedIndex·RagAnswer·SharedLinkReader | 지금 모듈, 앞선 사본 거르기만 더함 | 각 기능 | 지금 그대로 |
| 오류 필터 | `api-exception.filter.ts` | 모든 오류 응답 | 없음 |

- 고장 범위가 넓은 것은 PublishableSource와 SnapshotContract다. 지금 발행·열람 시험이 그대로 통과하는지로 지킨다(Bolt 계획 B1 완료 조건).
