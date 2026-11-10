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

## Mandated

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: ALWAYS [behavior] (affirmed [date]) -->
<!-- Example: ALWAYS use Result<T,E> for fallible operations in service layer (affirmed 2026-05-17) -->

## Corrections

<!-- Project-specific corrections from human feedback. -->
<!-- Format: NEVER/ALWAYS [behavior] (learned [date]) -->
- 승인된 요구사항을 재승인으로 다시 쓸 때 요구사항 ID를 새로 매기지 않는다. 바뀐 항목은 같은 ID에 새 내용을 적고, 제외한 ID는 재사용하지 않고 제외 표에 남기며, 새 항목은 묶음의 다음 번호나 새 묶음 번호를 쓴다. (learned 2026-10-24) <!-- cid:260925-intent-12:requirements-analysis:88856121707618f894629c8d871491362371c7047e5645d1b720a6f19d880ead -->
- ALWAYS 12월 intent(11월 개발)는 포트폴리오 MVP로 설계한다. 요구사항·재승인 입력에 근거가 없는 기능·화면·운영 장치·검증 절차는 넣지 말고 질문으로 올리며, 선택지는 가장 단순한 안을 기본값으로 내고 더 무거운 안은 무엇을 더 막는지와 늘어나는 공수를 함께 적는다. 제외한 기능과 채택하지 않은 안은 되살리지 않는다. (learned 2026-10-24) <!-- cid:260925-intent-12:requirements-analysis:ebd083a76b506f1776b327a9642875dcfc9feb547387bbcd52f96958c26192e8 -->
- ALWAYS 코드 계획에서 규칙을 바꿀 때는 같은 규칙을 적은 다른 문서를 모두 찾아 계획의 함께 고칠 파일 목록에 넣는다. 한 문서만 고치면 문서끼리 어긋난다. (learned 2026-11-05) <!-- cid:261103-catch-redesign:code-generation:3d0736d971c0bef67a689474e0e24d3436f111846ebc1f946f7349d5add61ace -->
