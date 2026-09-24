# CatchU — Unit 정의

## Unit 경계

기존 배포 단위 세 개에 승인된 구성요소를 매핑한다. 새 서비스·Unit을 추가하지 않는다. Unit ID는 추적 식별자, Directory는 AI-DLC construction 아래의 문서 경로이며 실제 코드 경로와 구분한다. YAML name과 Directory는 동일하게 사용한다.

| Unit ID | Unit | Directory | 코드 경로 | kind | 배포 모델 | 상대 복잡도 |
|---|---|---|---|---|---|---|
| U1 | web | u1-web | web/ | ui | standalone: Next.js | M |
| U2 | api | u2-api | api/ | service | standalone: NestJS | L |
| U3 | worker | u3-worker | worker/ | service | standalone: FastAPI | L |

복잡도는 책임·연결 수에 따른 상대 설계 추정이며 소요 시간이나 담당 가용량 확약이 아니다. standalone은 기존 배포 단위 구분이며 서버 수·새 배포 환경을 정하지 않는다.

| Unit | 구성요소 | 소유·제공 경계 | 담당 |
|---|---|---|---|
| U1 web | MemberExperience, RecipientExperience | 회원의 입력·진행·확인·공개 관리 화면, 비로그인 수신자 표시. 업무 정본·접근 판정은 api | 팀원 2 A 화면, 3 C/D(내 자산 저장소 연결 관리 포함), 4 B(내 자산 페이지·Catch 목록·상세) |
| U2 api | IdentityProfile, AnalysisCoordinator, CatchRegistry, ShareAccess | A 계정/연동, E 요청–동의/처리·반영 진행, B Catch/근거·초안/최소 질문 서비스 정본, C 링크/현재 접근 판단 | 팀원 2 A/E, 3 C, 4 B |
| U3 worker | EvidenceAnalysis | F의 허용 범위 분석·근거/기여·후보·초안·최소 질문 생성과 결과 의미. Catch 등록·서비스 DB 저장은 api | 팀원 1 F |

## 설계·계약 적용

- web→api는 회원 API와 비로그인 수신자 API를 분리한다. api↔worker는 요청·결과 스키마만 Contract에서 확정한다. 전송 방식은 #77 이후이며 BullMQ 연결을 앞당기지 않는다.
- api는 PostgreSQL·TypeORM(마이그레이션 포함)·Redis를 전제로 ERD v1을 작성한다. F의 AnalysisResult·WorkCandidate·AnalysisEvidence·DraftOutcome은 서비스 DB 밖에 두고 외부 식별자로만 참조한다. worker 보존 위치·수명은 Open question이다.
- Functional 기본 Unit 반복: web은 functional-spec·traceability, api는 ERD를 포함한 entities·rules·functional-spec·traceability 전체, worker는 entities·rules·functional-spec·traceability를 계약 참조와 개발 이슈 보완 중심으로 최소 작성한다. kind 변경이나 단독 실행으로 생략하지 않는다.
- worker 계약은 제공자 비종속이고 가짜 생성기를 연결할 수 있어야 한다. 서비스 LLM은 팀장이 개발 중후반 실제 제공자 연결 전에 선정한다.
- 구현/첫 연결 순서는 Delivery에서 정한다. 이 Unit 목록은 구현·CI·뼈대 착수 또는 API/ERD v1 완성을 뜻하지 않는다. FR 범위·보류 정책은 [요구사항 매핑](unit-of-work-story-map.md)을 유지한다.

## 담당자 확인 요청

- 팀원 1 F: worker 결과 책임·A/F 인증 제공·임시 보존/전송 Open questions 확인.
- 팀원 2 A/E·3 C/D: api 업무 정본과 web 표시의 분리, 요청/동의·상태·수신자 접근 연결 확인.
- 팀원 4 B: 등록·서비스 정본·본인 표시 및 E/F/C 경계 확인. [이연 결정](https://github.com/JminAILab/CatchU/pull/80#issuecomment-5789132567)에 따라 후속 「API 명세 v1·ERD v1」 PR 병합 전 본인 확인 필수; 경계 문제는 이슈→AI-DLC 수정.

## Sources

[components](../domain-design/components.md) · [decisions](../domain-design/decisions.md) · [requirements](../requirements-analysis/requirements.md) · [확인한 작성안](units-generation-questions.md) · [9/23 진행 결정](../domain-design/2026-09-23-followup.md).

자료 사용·잔여 조건: [#37](https://github.com/JminAILab/CatchU/issues/37).

