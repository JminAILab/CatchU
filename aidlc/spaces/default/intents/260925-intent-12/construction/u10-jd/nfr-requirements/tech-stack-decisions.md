# U10 기술 선택과 책임 경계

새 스택 선정 없이 승인된 기술과 공용 경계를 이어 쓴다. 버전 변경·의존성 설치·인프라 구성·구현 착수는 이번 문서 작업에 포함하지 않는다.

## 기술 결정과 요구사항 대응

아래 행은 기술을 새로 도입하는 요구가 아니라 앞 문서의 상세 요구사항을 기존 구성에 배정한 결정이다.

| 대응 ID | 기존 선택 | 이어 쓰는 이유와 경계 |
|---|---|---|
| NFR1.3·NFR7.1 | TypeScript·Next.js·React의 JD 관리 화면과 C-11 JdSummaryPanel | 기존 회원 인증·grant 도구·공용 동의 창·근거 강조를 소비한다. 별도 UI 프레임워크·공유 페이지·영구 결과 캐시를 만들지 않는다. |
| NFR1.1·NFR1.2·NFR1.4 | TypeScript·NestJS의 JD 관리·요약 모듈 | 기존 Guard와 C-10 접근 판정을 유지하고 U10이 소유한 API만 구현 대상으로 둔다. 인증·발행 접근 정책을 복제하지 않는다. |
| NFR5.1~NFR5.3·NFR6.4 | PostgreSQL·TypeORM의 U10 표·트랜잭션·외래 키 | 입력 사본·결과·삭제 관계와 공용 차감을 같은 DB 트랜잭션 경계에 둔다. 새 저장소·자료 이관·공유 스키마의 무단 변경을 요구하지 않는다. |
| NFR4.3·NFR4.5·NFR6.5 | api 내부 C-02 AiRun과 기존 Redis/BullMQ | 커밋 후 runId 등록·시도 1회·조회 시 시한 실패 규칙을 소비한다. FastAPI는 전체 시스템의 기존 배포 단위이나 U10 전용 처리기 배포 단위를 추가하지 않는다. |
| NFR2.1·NFR4.6 | U2의 C-03 DailyRunLimit·C-04 AiConsentGate | 한도 값·한국 시간 하루 경계·고지 판본을 U10이 별도로 정하지 않는다. JD 저장에는 AI 실행 정책을 적용하지 않는다. |
| NFR2.2~NFR2.4·NFR4.2 | C-01 AiGenerationGate의 HAIKU와 C-09 PublishedSearch | 승인된 Claude Haiku 5.5 정책과 Voyage 임베딩을 사용하는 공용 제공자를 소비한다. U10이 SDK·임베딩 모델·Sonnet 전환·검색 대체를 선택하지 않는다. pgvector 구성·제공자 조건 확인은 공용 책임이다. |
| NFR1.4·NFR6.2·NFR6.3 | 기존 인터페이스에 명시적으로 주입하는 U10 시험용 합성 제공자 | 정상·빈 결과·실패의 처리 흐름만 재현한다. 운영 자동 대체나 실제 외부 AI 품질의 증거로 쓰지 않는다. |
| NFR4.5·NFR6.1~NFR6.3 | 기존 AWS 배포·CI·로거 | 공용 인프라·CI·EKS 변경은 상류 C07의 팀장 책임이다. 새 관제·배포·자동 확장·복구 시스템을 U10 요구로 추가하지 않는다. |

## 연결 조건과 후속 설계

C-09 실제 검색 모듈과 합성 임베딩이 있다는 기능 설계 기준을 사용한다. C-10 실제 DB 접근 제공자와 C-11 슬롯·showEvidence의 실제 연결은 #416의 조건이다. JD 관리와 U10 합성 흐름은 준비 가능하지만 실제 연결 성공으로 기록하지 않는다.

공용 계약에 없는 변경이 필요하면 기존 계약·원하는 입출력·영향 Unit·최소 사례를 제공 Unit에 별도로 요청한다. U10이 C-01 검사·공용 의존 주입·운영 설정을 먼저 바꾸지 않는다.

후속 비기능 설계에서는 여기 정리한 요구사항을 기존 컴포넌트·트랜잭션·오류 처리에 배치한다. 이번 문서의 사용자 확인은 문서 작성 허용이며 비기능 요구사항 단계 승인·비기능 설계 승인·구현 계획 승인과 구분한다.

## 추적과 검증 지위

상류 NFR1~NFR7의 상세 요구사항 정본은 성능·보안·확장성·신뢰성·관측성 문서이며 [추적표](traceability.json)에 연결한다. 이 문서가 새 요구사항 ID나 기술 업그레이드를 만들지 않는다. 이번 단계에서는 문서 정합성과 추적 관계를 검토하며 코드 시험·부하 측정·실제 외부 호출은 실행하지 않았다.

## Sources

[상류 요구사항 C02·C06·C07·NFR1~NFR7](../../../inception/requirements-analysis/requirements.md), [기능 명세](../functional-design/functional-spec.md), [공유 계약](../../../inception/contract-design/contract-summary.md), [작성 전 확인](nfr-requirements-questions.md), [성능](performance-requirements.md), [보안](security-requirements.md), [확장성](scalability-requirements.md), [신뢰성](reliability-requirements.md), [관측성](observability-requirements.md).
