# Logical Components — u2-applicant-screens

근거: 기능 설계 `functional-design/frontend-components.md`, 구성 요소 `inception/domain-design/components.md`(PresetScreens·PublishScreen·CatchLibrary), 계약 `inception/contract-design/contract-summary.md` P-1·P-2, 이 단계 `performance-design.md`·`security-design.md`, NFR 요구 `tech-stack-decisions.md`.

새 배포 단위·새 인프라는 없다. web과 api의 지금 배포에 들어간다(단위 정의 U2: web에 들어감, api 조회 조건 하나).

## 부품과 실패 범위

| 논리 부품 | 자리 | 기대는 것 | 실패하면 | 영향 범위 |
|---|---|---|---|---|
| 프리셋 호출(`presets-api`) | web `features/presets/` | U1 `/v1/presets…`, `api.member` | 화면별 실패 글, 입력 남김 | 그 화면 하나 |
| 프리셋 목록 화면 | web `/presets` | 프리셋 호출 | 「불러오지 못했습니다」+다시 불러오기 | 목록 화면 |
| 프리셋 편집 화면 | web `/presets/new`·`/presets/{id}` | 프리셋 호출, 고르기 목록 셋, 저장소 목록, 세기 | 목록·세기·저장 실패가 서로 따로 보임(세기 실패는 막지 않음) | 편집 화면 |
| 고르기·순서 부품(공용) | web(발행 화면에서 옮김) | 없음(입력·그리기만) | — | 발행 화면·편집 화면 둘 다 그린다. 바꾸면 두 화면 시험을 함께 돌린다 |
| 발행 화면 | web `/publications/new` | 프리셋 목록, 발행 요청 | 지금 실패 처리 + 막힘 안내 | 발행 화면 |
| web 응답 해석 | web `lib/api-response.ts` | — | 모양 어긋남은 알 수 없는 실패 | 모든 회원 API 호출(공용). 다른 칸 처리는 바꾸지 않는다 |
| 상단 메뉴 | web `components/header/member-header.tsx` | 주소 | — | 모든 회원 화면 |
| 본인 Catch 목록 조건 | api `catches/owner-catch-input.ts`·`owner-catch-store.ts` | DB(PostgreSQL) | 400(쿼리), 지금 500(기록 문제) | 본인 Catch 목록(내 자산 화면 포함). `publishable`이 없는 요청과 그 커서는 그대로 |

## 공유하는 것

- `lib/api-response.ts`와 상단 메뉴는 모든 회원 화면이 쓴다. 그래서 바꾸는 범위를 `blockedSources` 더하기·`catchIds` 지우기, 메뉴 한 줄로 좁히고, 지금 web 시험 전체를 돌려 다른 화면이 깨지지 않았는지 본다(Unit 확인 명령).
- 본인 Catch 목록은 내 자산 화면도 쓴다. `publishable`이 없을 때 쿼리·SQL·커서 범위가 지금과 같게 해, 내 자산 화면의 동작과 커서가 바뀌지 않는다(security-design 1).
- 고르기·순서 부품은 발행 화면과 편집 화면이 함께 쓴다. 옮길 때 발행 화면의 지금 시험을 먼저 돌려 기준선을 남긴다.

## U1과의 경계

- 이 단위는 U1 API를 부르기만 하고 고치지 않는다. U1 응답 모양이 바뀌면 `presets-api`의 모양 검사가 「알 수 없는 실패」로 드러낸다.
- 발행 막힘의 판정은 U1이 한다. 화면은 받은 `blockedSources`를 보이고 목록을 다시 불러 단추 막힘을 맞출 뿐이다.

## Assumptions & Open Questions

None.

## Sources

- 기능 설계 `frontend-components.md`
- 구성 요소 PresetScreens·PublishScreen·CatchLibrary
- 계약 P-1·P-2
- 이 단계 `performance-design.md`·`security-design.md`
- NFR 요구 `tech-stack-decisions.md`
