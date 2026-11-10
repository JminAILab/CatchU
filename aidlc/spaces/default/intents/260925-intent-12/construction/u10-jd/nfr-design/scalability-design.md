# U10 확장성 설계

기존 api 프로세스·DB·공용 큐를 사용한다. 규모는 승인된 시연 범위이며 처리량·동시 사용자·자동 확장 임계값을 새로 정하지 않는다.

## C1 실행과 호출 경계

대응: NFR4.5, NFR4.6.

JdSummary의 접수와 실행 처리기는 같은 배포 단위 안에서 역할을 나누고 C-02가 연결한다. 실행마다 새 runId를 사용하며 payload는 runId 하나다. 상태·사본·결과는 DB가 보유하므로 브라우저 종료가 접수를 취소하지 않는다.

한 실행은 최대 20줄을 순서대로 처리한다. 각 줄은 C-09 검색과 C-01 생성 최대 한 번이며 재시도·중간 재개·병렬 fan-out이 없다. 여러 실행 사이의 동시성은 공용 큐 정책을 따른다. 별도 U10 worker·큐 서비스·전역 세마포어·분산 잠금을 추가하지 않는다.

공용 C-03 차감은 접수 트랜잭션에 참여하며 인증된 실행 회원의 하루 횟수 1회를 소비한다. 값과 한국 시간 날짜 경계는 U2 정책을 사용한다. 새 실행은 새 차감이며 실패·등록 유실을 이유로 환급하지 않는다. JD CRUD에는 차감을 적용하지 않는다.

## C2 저장 증가와 조회 경계

대응: NFR4.7, NFR4.4.

JD 원본과 접수 사본은 서로 다른 수명이다. 수정은 원본만 바꾸고 기존 사본을 덮어쓰지 않는다. 결과 재사용·중복 제거 저장소·자동 만료를 추가하지 않는다. 삭제는 회원·JD·발행본의 승인된 관계를 따른다.

목록은 [P2](performance-design.md#p2-db-조회와-페이지-경계)의 소유자·발행본 조건과 정렬 키로 20개씩 반환한다. 원문과 생성 항목은 권한을 통과한 상세에서만 읽는다. 이로써 목록 전송량과 개별 호출 크기를 제한하지만 전체 보관량이나 시스템 처리량을 보장하지 않는다.

DB 샤딩·읽기 복제본·캐시 계층·아카이브·저장 총량 한도는 만들지 않는다. 데이터 증가가 실제 한계를 드러내면 기존 요구사항·공용 기반 변경 절차로 판단한다.

## C3 공유 자원과 장애 영향

api·PostgreSQL·Redis/BullMQ는 다른 Unit과 공유한다. U10의 논리 모듈 분리가 독립 프로세스 장애 격리를 뜻하지 않는다. DB 장애는 JD 관리와 요약 저장·조회에 함께 영향을 주고, 큐/AI/검색 장애는 주로 요약 처리에 영향을 준다. 세부 실패 대응은 [논리 컴포넌트](logical-components.md)의 영향 표와 [신뢰성 설계](reliability-design.md)를 따른다.

별도 bulkhead·자동 확장·load balancer·새 연결 풀을 추가하지 않는다. 기존 연결·배포 정책과 입력·차감 한도를 사용한다. 공용 인프라·CI·EKS 변경은 팀장 담당이며 U10 문서가 그 변경의 승인이 아니다. 합성 흐름 성공을 실제 공유 자원의 용량 검증으로 보고하지 않는다.

## Sources

[성능 요구사항](../nfr-requirements/performance-requirements.md), [보안 요구사항](../nfr-requirements/security-requirements.md), [확장성 요구사항](../nfr-requirements/scalability-requirements.md), [신뢰성 요구사항](../nfr-requirements/reliability-requirements.md), [관측성 요구사항](../nfr-requirements/observability-requirements.md), [기술 결정](../nfr-requirements/tech-stack-decisions.md), [기능 명세](../functional-design/functional-spec.md), [공유 계약](../../../inception/contract-design/contract-summary.md), [작성 전 확인](nfr-design-questions.md).
