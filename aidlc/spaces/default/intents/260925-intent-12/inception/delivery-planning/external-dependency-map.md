# CatchU 12월 범위 — 외부 의존

작성일: 2026-10-26. 입력: [재승인 요구사항](../requirements-analysis/requirements.md)(requirements), [컴포넌트 목록](../domain-design/components.md)(components), [Unit 정의](../units-generation/unit-of-work.md)(unit-of-work), [Unit 의존](../units-generation/unit-of-work-dependency.md)(unit-of-work-dependency), [계약 요약](../contract-design/contract-summary.md)(contract-summary), [납품 계획 질문·답변](delivery-planning-questions.md)(Q5).

Bolt는 구현 단계에서 한 번에 지어 실제로 돌아가는 결과까지 가는 작업 묶음이며, 이 계획에서는 Unit 하나가 Bolt 하나다([Bolt 계획](bolt-plan.md)). 아래는 Unit 밖에서 준비돼야 하는 것과 그것이 막는 Bolt다.

| 의존 | 주인 | 필요 시점 | 막는 Unit(Bolt) | 늦어지면 |
|---|---|---|---|---|
| Claude API 키·콘솔 지출 상한 | 팀장 | U1 실제 연결 | U1(B1), U5(B8), U7(B6), U10(B7) | 합성 제공자로 계속, 실제 연결 확인만 늦어짐 |
| Voyage AI 계정·자료 보존·학습 사용 조건 확인 | U3 담당(개발 담당 결정) | U3 실제 임베딩 | U3(B3), U5(B8) | 합성 임베딩으로 계속 |
| RDS·로컬·CI DB 이미지 pgvector, 새 환경변수 이름 | 팀장 | 11/2 전(요구사항 C07) | U3(B3) | U3 로컬 개발이 막힘 |
| S3 버킷·역할(#389) | 팀장 | U8 시작 때 | U8(B9) | U8은 로컬 저장소로 계속 |
| Google 로그인 외부 사용자 대상 설정 | 팀장(U2) | 외부 1명 사용 확인 전 | U2(B2, FR19.1) | 외부 사용자 확인이 늦어짐 |
| 시연 저장소 공개 결정(요구사항 OQ2) | 팀장 | 실제 분석 확인·RAG 평가 준비 전 | U7(B6), U5(B8) | 평가 대상을 다시 정함 |
| Claude 웹·Desktop 원격 연결 확인 계정 | U6 담당 | 개발 초기(기본 호환) | U6(B5), U9(B10) | 연결 확인이 늦어짐 |
| 외부에서 닿는 HTTPS 개발 서버(#304) | 팀장 | U6 실제 Claude 원격 연결 확인 때 | U6(B5), U9(B10) | 실제 연결 확인만 늦어짐 |
| 통합 확인 환경 | 팀장 | 11/13 1차 통합 확인, 12월 2차 통합 확인·시연 | 모든 Unit의 통합 확인 | 아래 참고 |

**통합 확인 환경:** 11/13 1차 통합 확인은 개발 서버(EC2 단일, `main` 반영 자동 배포 #313)에서 한다. EKS(#276·#342)는 12월 2차 통합 확인·시연 환경이다. 10월 목표는 내부 중간 지점이라 별도 AWS 확인을 하지 않으며, 11월 코드의 `main` 반영 시점에 10월 조건을 두지 않는다(Q5).

**팀 방식에 필요한 준비(팀 안):** 통합 브랜치 CI 트리거(`ci.yml`에 `intent/**` PR·push, 팀장 #389), 팀원별 AI-DLC 2.11.1 설치는 [담당 배정](team-allocation.md)에 있다.
