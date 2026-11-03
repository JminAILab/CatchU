# U4 발행·링크 — 확장성 설계

## Sources

작성일: 2026-10-29. 입력: [U4 비기능 요구사항](../nfr-requirements/)(performance-requirements·security-requirements·scalability-requirements·reliability-requirements·observability-requirements·tech-stack-decisions) 가운데 특히 [확장성 요구사항](../nfr-requirements/scalability-requirements.md)(scalability-requirements) NFR4.8~NFR4.13과 배포 전제 대조, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U4 기능 명세](../functional-design/functional-spec.md)(functional-spec), [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) 「공통 전제」, [비기능 설계 질문·답변](nfr-design-questions.md).

## 설계

| 영역 | 설계 | 요구사항 |
|---|---|---|
| 배포 단위 | 기존 api·web 안에 둔다. 새 서비스·worker 변경 없음 | NFR4.8 |
| 상태 위치 | 발행본·항목·링크 상태는 PostgreSQL에만 둔다. 링크 판정은 DB, grant는 서명 검증이라 서버 메모리 상태가 없다 | NFR4.9 |
| 데이터 증가 | 발행본당 항목 1~20, 전체 글 60,000자(임시). 링크 개수 한도 없음, 자동 파기 없음 | NFR4.10 |
| 목록 | 10월 cursor(발행 시각 최신순, 같은 시각은 ID). 한 번에 한 쪽만 읽는다 | NFR4.11 |
| 동시 요청 | 따로 막지 않는다. web은 발행 중 버튼을 막는다. 재전송 중복은 한계로 기록 | NFR4.12 |
| 제한기 | 발행 빈도·unlock 시도 제한기는 10월 구현 그대로 api 프로세스 메모리. 기록 상한 각 1만 개 | NFR4.13 |

- 제한기 저장 방식은 api 하나 전제(개발 서버 `deploy/compose.single.yaml`, EKS `replicas: 1`·`Recreate`·HPA 없음)에 기대고 있다. api 복제 수를 늘리는 결정은 팀장 몫이며, 그때 제한기를 공유 저장소로 옮길지 함께 정한다. U4는 이번 범위에서 바꾸지 않는다.
- 발행 빈도 제한기는 10월 발급 제한기와 같은 설정 모양(`RateLimitOptions`)으로 새 인스턴스를 만든다. 10월 발급 경로가 W6에서 사라지므로 키 공간이 겹치지 않는다.

## 하지 않는 것

- 자동 확장·샤딩·읽기 복제·캐시 계층(NFR4, NFR6).
- 부하 시험과 용량 계획.
