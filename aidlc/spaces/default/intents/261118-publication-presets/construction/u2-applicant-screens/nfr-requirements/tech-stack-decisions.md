# Tech Stack Decisions — u2-applicant-screens

근거: 요구사항 `inception/requirements-analysis/requirements.md` Constraints(지금 스택, 새 라이브러리 없음), 코드 지식 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`(2026-11-19 스캔), 기능 설계 `construction/u2-applicant-screens/functional-design/frontend-components.md`, 팀 관행 `team.md` Testing Posture.

새 기술은 들이지 않는다. 이 단위는 지금 web·api 스택 안에서 화면 셋과 조회 조건 하나를 바꾼다.

| 영역 | 고른 것 | 이유 |
|---|---|---|
| web 화면 | 지금 Next.js(App Router) + React, 새 주소 파일 `app/(member)/presets/…` | 지금 회원 화면과 같은 묶음 `(member)`에 두면 회원 경로 가드와 상단 메뉴가 그대로 붙는다 |
| web 상태 | 지금 화면들이 쓰는 저장소 꼴(`view-store.ts`)과 화면 모델 함수 | 발행 화면·텍스트 자료 화면과 같은 꼴이라 시험 방식도 같다 |
| web 호출 | 지금 `api.member`(Bearer·401·`api-response.ts`) | 새 호출 계층을 만들지 않는다(NFR2.1) |
| 이탈 경고 | 지금 `useUnsavedGuard`·`useUnsavedTraverseGuard`·`useUnsavedChanges`와 `UNSAVED_MESSAGE` | 텍스트 자료 화면과 같은 경고(기능 설계 BR3.10) |
| 고르기·순서 부품 | 지금 발행 화면의 고르기 단추·순서 목록을 옮겨 공용으로 | 새 부품을 만들지 않는다(다듬은 화면 ToggleOptionButton·ReorderList) |
| api 조건 | 지금 NestJS 본인 Catch 목록의 쿼리 해석과 SQL에 조건 하나 | 새 경로를 만들지 않는다(기능 설계 Q2 A) |
| web 시험 | 지금 Node 내장 시험 실행기(`node --test`)와 `test/u2-render.mjs` 서버 렌더링, 화면 모델 단위 시험 | 새 도구 없음. 커버리지는 지금 `npm --prefix web run test:coverage` |
| api 시험 | 지금 `api/scripts/test-with-db.cjs`(pgvector 5433 시험 DB) | 판정이 U1 PublishableSource와 같은지 같은 Catch 묶음으로 맞춰 본다 |

## 하지 않는 것

- 드래그, 화면 모양 다듬기, 새 UI 라이브러리(C-O4·C-T5).
- 브라우저 끝까지 잇는 시험 도구(지금 없음). 화면 확인은 지금처럼 로컬에서 사람이 한다(320px 폭 포함).

## Assumptions & Open Questions

None.

## Sources

- 요구사항 Constraints
- `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 기능 설계 `frontend-components.md`
- `team.md` Testing Posture
