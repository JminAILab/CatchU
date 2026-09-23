# Delivery Planning — Minimal 작성 전 확인

## 재사용할 결정

- 9/23 사용자 진행안과 [현행 team.md](../../../../memory/team.md)를 적용한다. 코딩은 이슈 → 영역/작업내용 브랜치 → dev PR → 작성자 외 리뷰 → merge commit이며 AI-DLC 코드 생성·CI·Operation 단계는 진행하지 않는다.
- 담당은 팀원 1 F/H/I, 2 A/E, 3 C/D, 4 B다. 각자의 설계·구현·테스트 책임을 유지한다. 미배정 지원·운영/복구 검토·가용량·날짜를 새로 확정하지 않는다.
- Unit web(ui)·api(service)·worker(service), Contract → Delivery → Functional 기본 순서를 유지한다. Functional은 기본 Unit 반복이며 api ERD v1 전체와 web/worker 최소 문서를 작성한다.
- Contract v1은 승인 완료다. R-01(worker 식별 불가능 메시지 거부 경계)·R-02(목록 필드 설명)는 Accepted risk이며 해결로 바꾸지 않는다. B 담당 확인은 PR #89 병합 전 필수다.
- 별도 코딩 게이트를 만들지 않고 담당 조각이 처음 연결될 때 ‘최소 연결 첫 결과’ 마일스톤 승인 한 번을 기록한다. 전체 MVP 완료·실제 처리·배포 성공과 구분한다.
- 자료 사용·잔여 조건: [#37](https://github.com/JminAILab/CatchU/issues/37).

## 담당과 첫 연결 순서

| 순서 | 범위·담당 | 연결 기준 |
|---|---|---|
| 0 | 기존 뼈대 #81~#84, 각 지정 담당 | 이 세션은 뼈대를 만들지 않음. #83 api 골격 선행, web 관련 부분은 #82 선행 |
| 1 | #86 DB·마이그레이션 / 1, #87 인증 기반·개발용 로그인 / 2, #88 공통 오류 / 3 | #83 이후 기능 개발 앞 공통 기반. 실제 의존 범위에서 병행, #88 web 부분은 #82도 필요. 코드 작업의 실제 완료는 해당 이슈 증거로 판단 |
| 2 | 합성 F 결과 계약 / 1 → 요청·동의·상태 E / 2 → Catch 등록·본인 열람 준비 B / 4 | 제공자 비종속 가짜 생성기·합성 메시지 대역부터 연결. worker 전송을 먼저 선택하지 않음. #77 이후 실제 전송, 실제 제공자 연결 전 모델 선정은 별도 |
| 3 | D 상태/결과 진입 / 3 → B 본인 확인·별도 공개 / 4 → C 링크·수신자 / 3, A 회원 식별 / 2 | 합성 입력의 접수→반영→본인 확인→별도 공개→비로그인 열람과 숨김 후 접근 거부의 최소 연결. 각 영역 PR과 연결 검토는 담당자가 수행 |
| M1 | ‘최소 연결 첫 결과’ 승인 / 팀장, 각 담당 근거 제출 | 처음 함께 연결한 판본·실제/모의 경계·기대/실제 결과·남은 문제를 묶어 한 번 마일스톤으로 승인. 이후 일반 코딩은 이슈/PR 리뷰로 진행 |

공통 세션은 연결 구간·누락/충돌만 정리한다. Unit의 계약 의존 DAG(web→api→worker)는 유지하며, 계약 대역을 이용한 담당별 병행 작업을 실제 의존 제거로 해석하지 않는다. 기간/공수 점수표와 새로운 팀 편성은 만들지 않는다.

## 최소 산출물과 인계

| 공식 파일 | 담을 내용 |
|---|---|
| bolt-plan.md | 위 첫 연결 순서와 M1 승인 지점. 제목은 첫 연결 순서로 쓰고 코드 실행 게이트로 사용하지 않음 |
| team-allocation.md | 담당 4명의 기존 영역·공통 기반 이슈·연결 검토 상대 |
| risk-and-sequencing-rationale.md | 공통 기반 우선·합성 계약 연결 후 실제 연결의 이유, Accepted risk 및 담당/실제 연결 미결만 |
| external-dependency-map.md | #77·인증·실제 제공자/자료·B 검토 등 실제로 막는 작업과 담당/해소 시점. NCP/복구·통합 검증은 #24, 자료 조건은 #37 링크 |
| verification/phase-check-inception.md | 기존 Domain/Units FR 추적표를 재사용해 누락/고아/유효 대상만 대조. User Stories SKIP 및 알려진 advisory 센서 결함은 그대로 구분 |

새 제품 정책 질문은 없다. 기존 정책·Unit·계약·검토를 재사용하며 상류 재개/수정을 하지 않는다. 추적성에 새 문제가 나오면 원인·영향만 먼저 보고한다. 이번 계획 승인 뒤 Functional을 진행하되 구현·CI·PR 병합/base 변경 허가로 확대하지 않는다.

## 추적 정보

- [Unit 정의](../units-generation/unit-of-work.md) · [의존](../units-generation/unit-of-work-dependency.md) · [FR 매핑](../units-generation/unit-of-work-story-map.md) · [components](../domain-design/components.md) · [requirements](../requirements-analysis/requirements.md) · [contract-summary](../contract-design/contract-summary.md).
- [승인 당시 team-practices](../practices-discovery/team-practices.md)는 이력으로 재사용하며 차이는 #92의 현행 team.md와 9/23 코딩 운영을 우선한다.
- [PR #92](https://github.com/JminAILab/CatchU/pull/92) dev 272905b를 #89 브랜치에 merge commit f71d8a8로 병합했다. 미커밋 intents.json·260920-web-mock-demo와 별도 인계 파일 총 11개는 내용 해시 유지·병합 커밋 제외를 확인했다.
- 병합 후 새 next가 현행 team.md를 포함한 규칙 bundle `sha256:f7736c68999b8d8f6e575f1a0a81ca4353440913974554989eec49dde8c9440c`로 Delivery Planning을 반환했다.

## Consolidated Summary Confirmation

위 담당·첫 연결 순서와 M1 한 번의 마일스톤 승인만 최소 문서로 작성한다. 기존 승인/Accepted risk·보류·B 병합 전 확인을 유지하며 다음 Functional의 기본 Unit 반복·api ERD v1 범위는 바꾸지 않는다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]:
