# Units Generation — 작성 전 확인

## 기존 결정 재사용

- 9/23 승인 진행안: 기존 배포 단위 web(Next.js)·api(NestJS)·worker(FastAPI)만 사용한다. kind는 각각 ui·service·service다.
- 구성요소 매핑: MemberExperience·RecipientExperience → web, IdentityProfile(A)·AnalysisCoordinator(E)·CatchRegistry(B)·ShareAccess(C) → api, EvidenceAnalysis(F) → worker.
- 담당: 팀원 1 F/H/I, 2 A/E, 3 C/D, 4 B의 설계·구현·테스트 책임을 유지한다. 회원 화면은 A/B/C/D의 기존 책임으로 나누며 D 독점으로 처리하지 않는다.
- Contract → Delivery → Functional 기본 순서. Delivery는 담당·첫 연결 순서만, Functional은 기본 Unit 반복으로 api ERD 전체와 web/worker 최소 문서를 작성한다.
- BullMQ 전송 방식은 #77 이후, worker 메시지는 제공자 비종속 계약으로 정한다. 이 단계에서 구현 순서·전송 방식·서비스 LLM을 새로 결정하지 않는다.
- 자료 사용·잔여 조건: [#37](https://github.com/JminAILab/CatchU/issues/37).

## 작성 계획

| Unit | kind | 구성요소 | 책임 검토 |
|---|---|---|---|
| web | ui | MemberExperience, RecipientExperience | 팀원 2·3·4의 화면 영역 |
| api | service | IdentityProfile, AnalysisCoordinator, CatchRegistry, ShareAccess | 팀원 2 A/E, 3 C, 4 B |
| worker | service | EvidenceAnalysis | 팀원 1 F |

- 산출물은 Unit 정의·의존 DAG·요구사항 매핑·traceability.json 네 개다. User Stories 단계 산출물이 없으면 승인 FR을 사용한다.
- 의존 DAG는 소비자가 필요로 하는 제공 계약 방향으로 web → api → worker를 기록한다. 양방향 메시지·결과 반영·A/F 인증 경계는 연결 표로 별도 표현한다. worker의 인증 제공 경계는 계약에서 정하며, api 실행체 완성을 worker 설계의 선행 조건으로 추가하지 않는다. 계약과 모의 경계로 독립 작업 가능한 범위를 명시하고 실제 통합 의존은 감추지 않는다.
- 새 Unit·배포 방식은 추가하지 않는다. Unit ID·디렉터리 식별자를 일치시키고 기존 7개 구성요소와 FR의 누락·중복 소유를 검사한다. 구현/첫 연결 순서 선택은 Delivery에 남긴다.
- 후속 PR은 #80 위의 docs/api-erd-v1-20260923에서 「API 명세 v1·ERD v1」로 분리한다. [B 검토 이연](https://github.com/JminAILab/CatchU/pull/80#issuecomment-5789132567)에 따라 그 PR 병합 전 팀원 4의 B 영역 확인을 필수로 유지한다.

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
