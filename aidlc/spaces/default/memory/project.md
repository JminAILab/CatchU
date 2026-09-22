# Project-Level Rules

> Project-specific specialisation and corrections. Loaded after `org.md` and
> `team.md` as strict-additive guidance; contradictions with broader policy
> are rejected. Populated by practices-discovery and the self-learning loop.
>
> Use sparingly: most teams don't need a project layer. Reach for it
> only when this specific project needs stable, durable guidance beyond the
> team practice (for example, package-specific release checks or an additional
> regression suite for a legacy component).

## Way of Working

<!-- Project-specific specialisation. Example: -->
<!-- This monorepo requires package-scoped branch names and a package owner -->
<!-- review in addition to the team's normal merge policy. -->

## Walking Skeleton

<!-- Project-specific specialisation. Example: -->
<!-- The walking skeleton must exercise the legacy service adapter as well -->
<!-- as the new service boundary. -->

## Testing Posture

<!-- Project-specific specialisation. -->

## Deployment

<!-- Project-specific specialisation. -->

## Code Style

<!-- Project-specific specialisation. -->

## Tech Stack

<!-- Technology choices locked for this project. -->

## Decided

<!-- Decisions made in earlier stages that should not be re-asked. -->
<!-- Format: DECIDED: [decision] (Stage [slug], [date]) -->

## Scope Overrides

<!-- Custom scope rules for this project. -->

## Forbidden

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: NEVER [behavior] (affirmed [date]) -->
<!-- Example: NEVER throw exceptions across service layer boundaries (affirmed 2026-05-17) -->

- NEVER 이번 Practices Discovery 재개를 구현·CI·환경 구축·자동 CD·버전 변경 승인으로 확대한다. (affirmed 2026-09-22)
- NEVER 기존 승인·감사 기록을 소급 수정하거나 복구 입력의 존재 차이에 따른 approval-handoff 안내를 없애려고 인계 재승인·초기화 재수행을 한다. (affirmed 2026-09-22)
- NEVER 이번 관행 확인을 추가 LLM/PoC 호출·원문 복구·튜닝·모델 교체 허가로 사용하거나 세션 변경을 호출·시간 예산 초기화로 해석한다. 기존 금지는 별도 명시적 허용 전까지 유지한다. (affirmed 2026-09-22)
- NEVER PR 병합·문서 재사용·관행 초안만으로 C01/C02 조건 해소, 상세 계약 합의, 실제 실행/CI 통과 또는 전체 MVP 완료를 선언한다. (affirmed 2026-09-22)
- NEVER 미배정 공통 설계·구현·시험·지원·운영을 팀원 1이나 초기화 담당자에게 자동 배정한다. (affirmed 2026-09-22)
- NEVER 보호 브랜치 반영에 squash·rebase 머지를 사용한다. (affirmed 2026-09-22)
- NEVER 예외를 삼키거나 비동기 요청 접수를 실제 완료로 기록하고, 비밀값·원문·인자/반환값·오류 객체 전체를 로그·환경 예시·화면·AI/이슈/PR 공유에 노출한다. (affirmed 2026-09-22)
- NEVER 최소 연결 성공을 첫 MVP 전체 완료로 처리한다. (affirmed 2026-09-22)
## Mandated

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: ALWAYS [behavior] (affirmed [date]) -->
<!-- Example: ALWAYS use Result<T,E> for fallible operations in service layer (affirmed 2026-05-17) -->

- ALWAYS 이번 실제 MVP에서 팀원 1 F/H/I, 팀원 2 A/E, 팀원 3 C/D, 팀원 4 B의 자기 설계·구현·시험 책임을 유지하고, 공통 세션은 제출물 통합·충돌 정리를 맡는다. (affirmed 2026-09-22)
- ALWAYS 기존 제출물·PR #72를 출처와 지위를 붙여 재사용하고 미합의 연결·지원·가용량을 미확인으로 남긴다. (affirmed 2026-09-22)
- ALWAYS 보호 브랜치 `dev`·`main`에는 PR·승인 1건·merge commit을 사용하고, 커밋은 영문 접두사 5종과 한국어 이유를 남긴다. (affirmed 2026-09-22)
- ALWAYS 실제 MVP의 NCP 수동 배포·자료 영속/복구·정상/거부/실패 검증과 로컬/모의 시연의 증거를 구분한다. (affirmed 2026-09-22)
- ALWAYS 이 intent의 C01/C02 관련 착수 전에는 해당 수용 기준·예외의 공식 적용·독립 대조·시간 상한 확인을 증거와 대조하고, 필요한 후속 결정 전에는 현재 미달·미확인을 해소로 간주하지 않는다. (affirmed 2026-09-22)
- ALWAYS 이 intent의 발행 후 Catch 구성/본문 변화에 대한 기존 링크 영향은 후속 정책 결정 전까지 보류하고, 그와 무관한 설계를 계속할 수 있도록 경계를 구분한다. (affirmed 2026-09-22)
- ALWAYS 이 intent의 해당 실험 사본은 기존 기한인 2026-09-23 23:59 KST 또는 domain-design 승인/관련 구현 착수 중 먼저 오는 시점 전에 삭제 조건을 이행하고, 대상 종류·세션 식별자·완료 시각·확인 방법·미확인 사본 여부의 증거로 완료 상태를 갱신한다. 로컬 삭제와 공급자 보관/삭제는 구분하며 증거 확보 전 완료로 간주하지 않는다. (affirmed 2026-09-22)
- ALWAYS 담당자가 기존 요구사항·화면 흐름에서 주요 시나리오·기대 결과·실패 조건을 먼저 정하고 세부 테스트 코드는 구현 후 작성·실행하며, 공통 세션은 연결·누락·충돌을 검토한다. (affirmed 2026-09-22)
- ALWAYS 각 담당자가 자기 영역의 최소 전체 연결 흐름을 먼저 확인하고 첫 결과의 별도 승인을 유지하며, 구체 범위·순서·연결 방식은 후속 설계·계약에서 정한다. (affirmed 2026-09-22)
- ALWAYS 공통 파일·계약·의존성 변경은 영향받는 담당과 조율하고 검사 결과·실제/모의 연결·미실행을 구분하며 서비스 README에는 확인된 명령·준비 상태를 남긴다. (affirmed 2026-09-22)
- ALWAYS 이 intent의 기존 실험 사본 삭제 의무는 9/22 승인된 자료 사용 구분과 함께 적용한다. 실제 관련 사본 미처리의 의무·기한은 유지하고, 관련성 미확인 보조 7개의 식별 미완료만 Domain Design 문서 승인 차단에서 제외한다. 과거 자료 사용은 불허하며 과거 자료 비의존 새 코드·시험·모의 연결은 같은 식별 불확실성만으로 차단하지 않고, 새 실제 자료 처리는 기존 동의·모델·계약·안전성·별도 실행 조건을 따른다. 기존 담당 설계/계약 검토에 입력·fixture 출처와 과거 자료 의존 유무를 연결하고, 같은 불확실성으로 구현 직전 같은 판단을 반복하지 않으며 새 사실이 확인된 영향 범위만 재검토한다. 이를 삭제 완료·관련 없음·포괄 면제나 구현/외부 처리 허가로 사용하지 않는다. (affirmed 2026-09-22)
## Corrections

<!-- Project-specific corrections from human feedback. -->
<!-- Format: NEVER/ALWAYS [behavior] (learned [date]) -->
