# U2 공용 기반 — 확장성 요구사항

## Sources

작성일: 2026-10-27. 입력: [U2 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U2 업무 규칙](../functional-design/rules.md)(rules)의 BR1·BR5·BR6, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-02·C-03·C-05, [비기능 질문·답변](nfr-requirements-questions.md) Q1·Q2, team.md Deployment(11/13 EC2, 12월 EKS).

## 규모 전제

12월 이용자는 팀원과 소수의 외부 사용자다(11월 범위 결정). 확장 장치(자동 확장, 분산 잠금, 큐 분리)는 만들지 않는다. 다만 12월 EKS에서 api가 여러 개 떠도 틀리지 않아야 하는 것만 정한다.

## 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR4.7 | 하루 실행 횟수는 DB의 조건부 쓰기로 세므로 api가 여러 개여도 한도를 넘지 않는다. 메모리 계수기를 쓰지 않는다 | 시나리오 S3 | BR1.3, C-03 |
| NFR4.8 | AiRun은 Redis(BullMQ) 큐 하나를 쓰고 api마다 동시 1로 소비한다. api가 N개면 동시 처리는 최대 N개다 | 설정 확인 | Q1(비기능), C-02 |
| NFR4.9 | 같은 runKey는 큐에 2시간 남아 있는 동안 다시 등록돼도 무시되므로, api 여러 개가 같은 자동 작업을 등록해도 한 번만 실행된다 | 시험: 같은 키 두 번 등록 | Q2(비기능), C-02 |
| NFR4.10 | FileStorage 로컬 구현은 api 한 대(개발 서버 EC2) 기준이다. api가 여러 개인 EKS에서 파일을 실제로 저장하려면 U8의 S3 구현을 쓴다. U8 전에는 저장하는 파일이 없다 | 문서 확인 | BR6.1, ADR-003, functional-spec 가정 3 |

## 늘어나는 자료

| 자료 | 늘어나는 속도 | 정리 |
|---|---|---|
| `daily_execution_count` | 실행한 회원 × 날짜당 한 행 | 지우지 않는다(시연 규모). 탈퇴 때 연쇄 삭제 |
| `ai_consent` | 회원 × 고지 판본당 한 행 | 탈퇴 때 연쇄 삭제 |
| 큐 작업 | 실행마다 하나 | 2시간 뒤 자동 삭제 |
