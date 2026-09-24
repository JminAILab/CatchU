# CatchU — 요구사항과 Unit 매핑

## 적용 기준

User Stories 산출물이 없으므로 승인 requirements의 FR을 사용한다. 상위 묶음 11개·하위 48개를 모두 보존한다. 주 Unit은 업무 정본 또는 생성 책임이며 관련 Unit은 화면·연결 책임이다. OK는 책임 추적이며 개발 완료가 아니다. Deferred/N/A는 기존 적용 지위를 유지하고 가짜 구현 Unit을 배정하지 않는다.

| Story ID | Status | Unit ID | Directory | 관련 Unit | 적용 경계 |
|---|---|---|---|---|---|
| FR1 | OK | U2 | u2-api | U1 / u1-web, U3 / u3-worker | 상위 묶음의 첫 MVP 적용 부분만 연결. 개별 FR 행의 Deferred/N/A 및 부분 적용을 함께 따른다. |
| FR2 | OK | U3 | u3-worker | U2 / u2-api, U1 / u1-web | 상위 묶음의 첫 MVP 적용 부분만 연결. 개별 FR 행의 Deferred/N/A 및 부분 적용을 함께 따른다. |
| FR3 | OK | U2 | u2-api | U1 / u1-web | 상위 묶음의 첫 MVP 적용 부분만 연결. 개별 FR 행의 Deferred/N/A 및 부분 적용을 함께 따른다. |
| FR4 | OK | U2 | u2-api | U1 / u1-web | 상위 묶음의 첫 MVP 적용 부분만 연결. 개별 FR 행의 Deferred/N/A 및 부분 적용을 함께 따른다. |
| FR5 | Deferred | — | — | — | 후속 기능 묶음. 현재 도메인 카탈로그에 구현 구성요소를 추가하지 않는다. |
| FR6 | Deferred | — | — | — | 후속 기능 묶음. 현재 도메인 카탈로그에 구현 구성요소를 추가하지 않는다. |
| FR7 | Deferred | — | — | — | 후속 기능 묶음. 현재 도메인 카탈로그에 구현 구성요소를 추가하지 않는다. |
| FR8 | Deferred | — | — | — | 후속 기능 묶음. 현재 도메인 카탈로그에 구현 구성요소를 추가하지 않는다. |
| FR9 | Deferred | — | — | — | 후속 기능 묶음. 현재 도메인 카탈로그에 구현 구성요소를 추가하지 않는다. |
| FR10 | Deferred | — | — | — | FR10.1~FR10.4는 10월 미제공, FR10.5는 후속 재검토, FR10.6은 별도 조사 계획. 개별 행을 따른다. |
| FR11 | OK | U2 | u2-api | U1 / u1-web | 상위 묶음의 첫 MVP 적용 부분만 연결. 개별 FR 행의 Deferred/N/A 및 부분 적용을 함께 따른다. |
| FR1.1 | OK | U2 | u2-api | U1 / u1-web, U3 / u3-worker | AnalysisCoordinator |
| FR1.2 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR1.3 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR1.4 | OK | U2 | u2-api | U1 / u1-web, U3 / u3-worker | AnalysisCoordinator |
| FR1.5 | OK | U2 | u2-api | U1 / u1-web | RepositoryProtection |
| FR2.1 | OK | U3 | u3-worker | U2 / u2-api, U1 / u1-web | 후보·근거·최소 생각해볼 질문: EvidenceAnalysis가 WorkCandidate.reflectionQuestions를 생성·제공하고 AnalysisCoordinator가 해당 요청의 결과와 함께 CatchRegistry로 전달한다. CatchRegistry는 CatchAsset.reflectionQuestions의 서비스 자료 관리·본인 화면 제공을, MemberExperience의 B 담당 화면은 표시를 맡는다. components.md의 FR2.1 제공 경계를 따른다. 생성 방법·API·보관·표시 상세는 후속 설계이며 수신자 공개·답변 저장은 포함하지 않는다. |
| FR2.2 | OK | U3 | u3-worker | U2 / u2-api, U1 / u1-web | DraftOutcome |
| FR3.1 | OK | U2 | u2-api | U1 / u1-web | 첫 MVP 적용은 대표 없는 발급 경로만. 대표 작성/구성은 첫 MVP 이후. |
| FR3.2 | OK | U2 | u2-api | U1 / u1-web | ShareAccess |
| FR3.3 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR3.4 | OK | U2 | u2-api | U1 / u1-web | 첫 MVP 적용은 현재 숨김/권한 보호. 발행 시 대표 구성 보존은 후속이며 본문/구성 변화의 기존 링크 영향은 보류. |
| FR3.5 | OK | U2 | u2-api | U1 / u1-web | CatchRegistry |
| FR3.6 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR4.1 | OK | U2 | u2-api | U1 / u1-web | CatchRegistry |
| FR4.2 | OK | U2 | u2-api | U1 / u1-web | ShareAccess |
| FR4.3 | OK | U2 | u2-api | U1 / u1-web | ShareLink |
| FR4.4 | OK | U2 | u2-api | U1 / u1-web | ShareLink |
| FR4.5 | OK | U2 | u2-api | U1 / u1-web | ShareLink |
| FR5.1 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR5.2 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR5.3 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR5.4 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR5.5 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR6.1 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR6.2 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR6.3 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR6.4 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR6.5 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR6.6 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR7.1 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR7.2 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR7.3 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR7.4 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR8.1 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR8.2 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR8.3 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR8.4 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR9.1 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR9.2 | Deferred | — | — | — | 현재 첫 MVP 범위 밖. 원 FR ID·후속 계획/미결을 보존하며 가짜 구현 대상을 만들지 않는다. |
| FR10.1 | N/A | — | — | — | G 품질 신호·선택 공유·운영 조회·전체 중단/재개는 10월 제외. H/I 또는 B 불일치 표시로 대체 충족하지 않는다. |
| FR10.2 | N/A | — | — | — | G 품질 신호·선택 공유·운영 조회·전체 중단/재개는 10월 제외. H/I 또는 B 불일치 표시로 대체 충족하지 않는다. |
| FR10.3 | N/A | — | — | — | G 품질 신호·선택 공유·운영 조회·전체 중단/재개는 10월 제외. H/I 또는 B 불일치 표시로 대체 충족하지 않는다. |
| FR10.4 | N/A | — | — | — | G 품질 신호·선택 공유·운영 조회·전체 중단/재개는 10월 제외. H/I 또는 B 불일치 표시로 대체 충족하지 않는다. |
| FR10.5 | Deferred | — | — | — | 운영 경고는 후속 재검토; 날짜/담당/구현 미정. |
| FR10.6 | Deferred | — | — | — | 조사 구상과 OQ15 보존. 현재 도메인 설계가 조사 수행·참여자 확보를 완료하지 않으며 업무 코드 구성요소를 임의 추가하지 않는다. |
| FR11.1 | OK | U2 | u2-api | U1 / u1-web | IdentityProfile |
| FR11.2 | OK | U2 | u2-api | U1 / u1-web | GitHubConnection |
| FR11.3 | OK | U2 | u2-api | U1 / u1-web | MemberProfile |

## 교차 책임과 순서 경계

- FR2.1: U3 생성 → U2 E 전달/B 서비스 정본 → U1 B 본인 화면. 최소 질문을 수신자에게 공개하거나 답변 저장 기능을 추가하지 않는다.
- FR4.1: U2 B 확인/공개 판단과 U1 본인 화면의 ‘지금 공개’ 제안. 사용자 별도 공개 선택을 유지한다.
- FR3/4: U2의 현재 권한·링크 판단과 U1 수신자 표시. 링크–자산 연결 모델은 만들지 않는다.
- U1은 FR1·FR2·FR3·FR4·FR11의 화면 책임을, U2는 회원/요청/등록/링크를, U3는 FR1 처리 연결·FR2 생성을 맡는다. 각 Unit에 현재 적용 FR이 연결된다.
- 구현 순서·Unit 내 기능 순서는 Delivery의 첫 연결 계획과 이후 개발 이슈로 정한다. 목록 순서를 구현 우선순위로 읽지 않는다.

## Sources

[components](../domain-design/components.md) · [decisions](../domain-design/decisions.md) · [requirements](../requirements-analysis/requirements.md) · [확인한 작성안](units-generation-questions.md) · [9/23 진행 결정](../domain-design/2026-09-23-followup.md).

자료 사용·잔여 조건: [#37](https://github.com/JminAILab/CatchU/issues/37).
