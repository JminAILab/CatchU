# worker Functional Design — Minimal 작성 전 확인

## 재사용과 작성 범위

| 파일 | 작성할 내용 |
|---|---|
| entities.md | AnalysisResult·WorkCandidate·AnalysisEvidence·DraftOutcome 4개의 최소 논리 모델과 관계. 기존 Domain/worker 계약 참조, 서비스 DB 밖의 처리 결과로 구분 |
| rules.md | 허용 요청 범위·근거/기여와 실패 분리·제공자 비종속 결과·E 전달 경계의 최소 규칙. 생성 방법·묶음 판별 함수 상세는 개발 이슈로 보완 |
| functional-spec.md | 요청 검사 → 허용 범위 처리 → 후보/근거·초안/최소 질문 결과 → E 전달의 짧은 흐름과 실패 상태. 합성 MOCK 연결과 실제 처리 미결 구분 |
| traceability.json | worker에 배정된 FR2·FR2.1·FR2.2와 기존 책임을 최소 규칙에 연결. 새 US ID나 제품 요구사항을 만들지 않음 |

새 제품 정책 질문은 없다. F(팀원 1)가 결과 생성·의미를 책임지고 E(팀원 2)가 요청/동의·전달을, B(팀원 4)가 등록된 Catch·근거·초안·최소 질문의 서비스 정본을 관리한다. F 엔티티는 서비스 DB에 저장하지 않으며 F 자료 보존 위치/수명은 Open question으로 남긴다.

실제 제공자 SDK·API 키 없는 가짜 생성기 계약을 재사용한다. 전송 방식은 #77 이후, 서비스 모델은 실제 제공자 연결 전 팀장 선정이다. 상세 생성/중복 판별·보관·구현·테스트는 담당자가 개발 이슈에서 제안·검토한다. 보류 정책·추가 호출 금지는 유지한다.

## 적용 계약·담당 확인

- R-01·R-02 수정본 90bf289를 사용한다. 식별 불가 메시지는 Receipt 없이 거부 기록만 남기며, 본문과 worker YAML의 현재 의미를 재정의하지 않는다. 공식 단독 실행은 엔진 결함으로 열린 상태이고 수정본은 PR #89 담당 리뷰로 확인한다.
- F/1과 A/E/2는 허용 범위·결과 의미·인증/전송 경계를, B/4는 등록/정본 연결을 확인한다. B의 PR #89 병합 전 확인은 필수다.
- 기본 Unit 반복의 현재 대상은 worker다. 다음 api에서는 ERD v1 전체, web은 최소 문서를 작성한다. 이번에는 SQL·구현·CI·뼈대를 생성하지 않으며 PR 본문은 갱신하지 않는다.

## 추적 정보

[unit-of-work](../../../inception/units-generation/unit-of-work.md) · [unit-of-work-story-map](../../../inception/units-generation/unit-of-work-story-map.md) · [requirements](../../../inception/requirements-analysis/requirements.md) · [components](../../../inception/domain-design/components.md) · [contract-summary](../../../inception/contract-design/contract-summary.md) · [worker 메시지](../../../inception/contract-design/worker-messages.yaml) · [단독 수정 상태](../../../inception/contract-design/single-r01-r02-verification.md). 자료 조건은 [#37](https://github.com/JminAILab/CatchU/issues/37).

## Consolidated Summary Confirmation

worker 문서 4개를 기존 계약 참조 중심으로 최소 작성한다. F 엔티티의 서비스 DB 제외·보존 위치 Open question·개발 이슈 보완과 기존 담당/보류를 유지하고, R-01·R-02 수정본을 적용한다. 이번 확인은 문서 작성 범위의 확인이며 실제 처리·구현·PR 병합 허가가 아니다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
