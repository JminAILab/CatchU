# Design System Mapping — 발행 프리셋

근거: `mockups.md`, `interaction-spec.md`, 승인된 화면 초안 `ideation/rough-mockups/wireframes.md`, 이야기 `inception/user-stories/stories.md`, 요구사항 `inception/requirements-analysis/requirements.md`, 팀 관행 `inception/practices-discovery/team-practices.md`(새 라이브러리 없음, 모양 다듬기는 팀원 3), 지금 코드(`web/src`).

CatchU에는 따로 디자인 시스템 패키지가 없고, 화면마다 CSS 모듈과 공용 부품을 쓴다. 이 작업은 지금 부품과 클래스를 그대로 쓰고, 새 모양을 만들지 않는다.

| 화면 요소 | 쓰는 지금 부품·클래스 | 바꿈 |
|---|---|---|
| 상단 메뉴 「프리셋」 | `web/src/components/header/member-header.tsx`의 `navItems`, `header.module.css`의 `.menuItem`·`.menuItemActive` | 항목 하나 더함 |
| 탭 줄 | `web/src/features/materials/materials-view.tsx`의 `MaterialsTabs`, `materials.module.css`의 `.tabs`·`.tab`·`.tabActive` | 일반 부품으로 바꾸고 화살표 키·`tabpanel`을 더함(공용 위치로 옮김) |
| 고르기 단추 | `publish-view.tsx`의 고르기 단추(`aria-pressed`), `publications.module.css`의 `.option`·`.optionActive`·`.itemTitle`·`.subline`·`.small` | 그대로 |
| 순서 단추 | `publish-view.tsx` 「고른 항목과 순서」의 [위로][아래로][빼기], `.secondaryButton` | 그대로 |
| 주 단추·보조 단추 | `.primaryButton`·`.secondaryButton` | 그대로 |
| 저장 안내 | `role="status"` 글자(예: `assets/catch-actions.tsx`의 「변경 내용을 저장했습니다.」 방식) | 글자만 「저장했습니다.」 |
| 이탈 경고 | `web/src/features/profile/use-unsaved-guard.ts`(`UNSAVED_MESSAGE`), `components/auth/use-unsaved-changes.ts`, `lib/unsaved-traverse-guard.ts`(텍스트 자료 화면이 쓰는 세 가지) | 그대로 |
| 불러오기 실패 | 지금 `LookupFailedState`와 [다시 불러오기] 방식 | 그대로 |
| 발행 막힘 안내 | 지금 발행 화면의 「발행되지 않았습니다」 안내 자리(`publish-screen.tsx`) | 글자에 프리셋·자료 이름 |
| 항목 그리기 | `snapshot-view.tsx`의 항목 머리(`h3`, 종류 표시)와 본문 | 탭별로 나눠 그림 |
| 강조와 이동 | `recipient-screen.tsx`의 근거 강조·초점 이동 | 탭 바꾸기를 더함(돌아가기 단추는 만들지 않음) |
| 접근 불가 화면 | `recipient-format.ts`의 `LINK_UNAVAILABLE_TEXT` 「이 링크는 열람할 수 없습니다.」 | 그대로 |

## 새로 만드는 것

- 프리셋 목록·편집 화면의 틀: 텍스트 자료 화면처럼 `h1` 화면 이름 + `h2` 구역 + 지금 단추·글자 클래스를 쓴다. 새 클래스가 필요하면 기존 이름 꼴(`.list`, `.items` 등)을 따른다.

## 하지 않는 것

- 색·간격·글자 크기 바꾸기, 박스 크기 맞추기, 드래그(팀원 3의 다듬기 몫).
- 새 UI 라이브러리(constraint-register C-T1).

## Assumptions & Open Questions

None.
