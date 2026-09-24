# Functional Design 단독 정정 — 2026-09-24 R-01 트랜잭션·복구 설명

## 사용자 결정과 수정 범위

기준은 `dce0223`이다. 사용자는 이전 정정 대조에 문제가 없음을 확인했고, 그 검토의 R-01을 PR #89 병합 전에 해결하도록 지시했다. 이전 `single-stage:functional-design`은 2026-09-24T08:38:56Z에 완료됐으며, 이번에는 08:49:16Z의 새 STAGE_STARTED로 진입했다. 이전 질문·검증·검토·감사 기록은 소급 수정하지 않는다.

### Q1. F4와 실패·복구 설명은 어떻게 바꾸는가?

[Answer]: 사용자 지시대로 api functional-spec.md의 F4 3~5단계(B의 Catch·근거·초안/질문·등록 연결 저장 또는 기존 참조, catchId·본인 열람 준비 반환, E의 등록 ID·준비·반영·종결 기록)를 한 트랜잭션으로 묶는다고 명시한다. 수신 기록은 그 전에 E가 저장한다는 OQ-B1과 F3를 유지한다. 실패/경계 칸과 「동시성과 일관성」의 기존 “B 저장 뒤 E 장애” 행은 다음 두 경우로 구분한다.

- 반영 트랜잭션 실패: 해당 트랜잭션의 변경을 전부 되돌리고 APPLY_FAILED로 기록한다. 복구는 같은 결과로 반영을 처음부터 다시 하며 기존 유일성 키로 Catch 중복을 막는다. F 재실행은 없다.
- 커밋 뒤 응답·확인 유실: 재전달·재시도는 기존 등록 연결을 참조해 같은 catchId를 돌려준다.

일부 후보만 처리한 상태를 APPLIED/CLOSED로 만들지 않는 기존 조건은 유지한다. 실패한 트랜잭션의 롤백을 그 전에 저장된 수신 기록 삭제로 해석하지 않는다.

### Q2. 엔티티 설명과 보존 범위는 무엇인가?

[Answer]: CandidateRegistration 설명의 “B 저장 뒤 E 실패의 재진입 키”를 “재전달·반영 복구 때의 재진입 키”로 바꾼다. 관계·유일성·속성·계약 YAML·rules·traceability는 바꾸지 않는다. contract-summary.md 90행의 재진입 요구는 계약 요구로 그대로 유지한다.

동일 파일의 「물리 스키마 전환 제약」 등록·반영 행(기준 232행)에도 “B의 … 원자 저장 뒤 E 반영 실패”가 남아 있다. R-01을 남기지 않도록 이 설명만 “B의 Catch+근거+CandidateRegistration과 E 반영 완료 기록은 F4의 한 트랜잭션으로 저장한다. 실패·커밋 뒤 응답·확인 유실은 functional-spec.md의 두 경우를 따른다”로 맞춘다. 앞뒤의 동일 Catch 수렴·payload fingerprint 제약은 유지한다. 이는 관계·유일성 변경이 아닌 같은 원자성 결정의 설명 정정이다.

## 검증·기록·마무리

- 지정 두 파일의 설명 정정만 수행한다. YAML 파싱과 변경 전후 구조 비교로 CandidateRegistration description 외 모델·관계·유일성 보존을 확인한다. 계약 YAML·contract-summary.md, 다른 유닛, 기존 기록은 바이트 비교한다.
- F4 정상 커밋·트랜잭션 실패/동일 결과 복구·커밋 뒤 확인 유실의 문서 조건을 대조한다. 제품 구현·DB 시험으로 보고하지 않는다. 적용되는 센서 결과와 기존 traceability 한계를 구분한다.
- 독립 reviewer에게 앞선 R-01과 이번 수정본을 전달해 해결 여부를 검토받는다. 이전 New 기록을 소급 수정하지 않고 새 검토·검증 문서에서 R-01 Resolved 여부를 남긴다. 정상 검토·단독 완료까지 진행하며 거부되면 기존 지시대로 재호출·질문 이동·추가 영수증·우회 없이 기록한다.
- AI-DLC 2.8.1과 본 흐름 Completed를 유지한다. 산출물 두 파일·이번 질문/검증·이번 260914 intent 감사/상태 기록만 커밋·푸시한다. intents.json·260920 web-mock-demo 관련 변경, docs·하네스·PR #89 본문은 보존하며 병합하지 않는다.

## Consolidated Summary Confirmation

api F4의 3~5단계를 한 트랜잭션으로 묶고, 실패 전체 롤백·같은 결과 복구와 커밋 뒤 응답·확인 유실을 구분한다. CandidateRegistration 설명과 같은 파일의 등록·반영 설명을 이에 맞춘다. 계약 요구·관계·유일성을 유지하며 새 단독 실행에서 R-01 해결 검토와 완료를 기록한다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
