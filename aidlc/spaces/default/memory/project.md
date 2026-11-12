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

- ALWAYS AI-DLC 단계를 승인하면 바로 그 단계의 커밋을 하나 만든다. 커밋에는 그 단계 폴더 파일과 그 단계 승인까지의 작업 기록, 그 단계에서 더한 규칙을 넣고, 다음 단계 폴더 파일은 넣지 않는다. (learned 2026-11-10) <!-- cid:261109-new-catch:domain-design:10ccff94f4da77a0c332bc4f59ec11d78a33c0f0a18b163266982409c3deba72 -->

- ALWAYS 승인 관문이 없는 Unit 단계(기능 설계·NFR 요구·NFR 설계·코드 생성 등)도 그 단계가 끝나면 바로 그 단계 커밋을 하나 만든다(Catch 개편 CR1 때처럼). 다음 단계 폴더 파일은 넣지 않는다. (learned 2026-11-10) <!-- cid:261109-new-catch:nfr-requirements:420ed285cf30adb0ebdec6be94bc9711aa77f0ebb181337a16b51092f9aa9d77 -->

## Walking Skeleton

<!-- Project-specific specialisation. Example: -->
<!-- The walking skeleton must exercise the legacy service adapter as well -->
<!-- as the new service boundary. -->

## Testing Posture

<!-- Project-specific specialisation. -->

- ALWAYS Unit 확인 명령은 --timeout-ms 3600000(60분)으로 돌린다. 시작 전에 pmset -g batt로 충전기 연결을, sysctl -n vm.loadavg로 부하(1분 평균 6 미만)를 보고, 끝나면 결과와 함께 api·web·worker 각각 걸린 시간을 알린다. 기본 상한 30분은 배터리로 돌 때 api 시험 도중에 걸려 멈췄다. (learned 2026-11-10) <!-- cid:261109-new-catch:delivery-planning:9c6d45282a5337181f1f3011840d1bd610328597830e0cede0b6abf544128e5b -->

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
- ALWAYS 문서에서 Catch를 받아 보는 쪽은 「면접관」으로 부르고, 「팀장」은 intent를 정하는 우리 팀장만 뜻하게 쓴다. 면접관을 「기술 팀장」으로 부르면 두 뜻이 섞인다. (learned 2026-11-09) <!-- cid:261109-new-catch:intent-capture:9344035d773b4a8fa5a3b31de73df7a612946e0898a6f34dc3841ca6d5703cf3 -->
- ALWAYS 본인 기여를 말하는 표시는 근거의 기여 범위가 본인 커밋인 근거만 기준으로 삼는다. 병합 커밋·PR·이슈 근거의 판본이나 주소와 맞는다고 붙이지 않는다. (learned 2026-11-09) <!-- cid:261109-new-catch:requirements-analysis:71c5cc19bec041ef92062d1d8c923421dc5cc5614ac1a79937e20c47985f225b -->
- ALWAYS 화면 초안·수락 기준·설계에 지금 화면의 표시를 적을 때는 지금 코드가 어떻게 그리는지 확인해 그대로 쓰고, 바꾸는 곳은 바꾼다고 적는다(화면에 보이는 글자인지 화면 낭독기에만 읽히는 글자인지, 링크 글자가 주소 전체인지 등). (learned 2026-11-10) <!-- cid:261109-new-catch:user-stories:66de5f7a4cafcf61e94e4ef7c7106183a0e36d1947dc088af1e5da7a1b65ff84 -->
- ALWAYS 기능 설계에서 화면 요소(역할·키보드·Tab 순서)를 정할 때 승인된 다듬은 화면 interaction-spec과 대조하고, 다르면 다른 동작을 쓰지 말고 어긋남을 사람에게 올린다. NC1에서 링크 목록 항목을 링크로 적어 interaction-spec(글자, Tab 순서 밖)과 어긋났다. (learned 2026-11-10) <!-- cid:261109-new-catch:code-generation:c837a2dcbe457072b040ad4cd5080f7aec8c442bc63b3b5f92943dba14a0d6b3 -->
- ALWAYS 본인 커밋 여부 같은 판정은 worker 문장을 api에 베껴 대조하지 말고, DB에 이미 저장된 기록(소속 기록 commit_assignment 등)으로 정한다. 문장 대조는 worker 문구가 바뀌면 판정이 조용히 사라진다(NC2 NFR 요구 때 팀장 결정). (learned 2026-11-11) <!-- cid:261109-new-catch:nfr-requirements:e3e3e8569334a22213a106b72c10b4eb7a3cccf43aaa8aa4cebacea3d036a853 -->
- ALWAYS (바로 위 「본인 커밋 같은 판정」 규칙의 덧붙임) 저장된 기록이 없어 문장 대조를 쓸 때는 두 쪽 문장을 맞춰 보는 시험으로 묶는다. (learned 2026-11-11) <!-- cid:261109-new-catch:functional-design:6210c594285c4d1174cd35497c262c2464b5d083ba99d061673ec8a6f9f8f940 -->
