# Functional Spec — u3-reader-views

이 단위는 읽는 쪽 화면을 바꾸는 web 단위다. 받은 사람 화면과 작성자 발행본 상세의 「발행본 자료」를 프리셋 탭으로 나누고, 출처 단추가 다른 탭의 글로 옮겨 가게 하며, 받은 사람 화면에서 AI 요약을 자료 위로 올린다. 텍스트 자료 화면의 탭을 같은 탭 부품으로 바꾸고, 자료 지우기 확인 문장에 프리셋 말을 더한다. 이 단위가 구현하는 이야기는 `inception/user-stories/stories.md`의 US2.3, US3.1~US3.5, US4.1, US4.4다(이야기 지도 `inception/units-generation/unit-of-work-story-map.md`). 서버 쪽(사본의 프리셋 칸, 앞선 사본, 연쇄 삭제)은 U1이 했다.

화면의 순서·글자·역할·키보드는 다듬은 화면 `inception/refined-mockups/mockups.md` M5~M7과 `interaction-spec.md`(TabStrip·PresetNameDisplay·SourceJump)를 따른다. 규칙의 정본은 `rules.md`, 부품은 `frontend-components.md`다.

## 맡는 것과 경계

- 구성 요소(`inception/domain-design/components.md`): TabStrip(새, 자료 화면 탭을 일반화), SnapshotViewer, RecipientScreen, PublicationDetailScreen, MaterialsScreen.
- 계약(`inception/contract-design/contract-summary.md`) P-3의 소비자다. 받은 사람 열람(C-12)과 작성자 상세 응답의 사본 항목마다 `presetOrdinal`(1~5)·`presetName`이 온다. `isFirstCopy`·원본 ID는 오지 않는다.
- 하지 않는 것: 「이 링크에서 할 수 있는 것」 안내(dev의 기본 접힘을 따름), [답으로 돌아가기](2026-11-19 팀장 결정, 좁은 화면의 돌아오기는 #615), 받은 링크 읽기(U1), 모양 다듬기.
- 팀원 3의 화면 정리가 이 단위 코드를 만들 때 dev에 들어와 있으면 그 위에서 만든다(단위 정의 U3).

## 흐름 1. 발행본 자료 탭 (M5·M6, US2.3·US3.1·US3.2·US3.5)

1. 사본 응답을 읽을 때 항목마다 `presetOrdinal`·`presetName`이 있어야 한다. 없거나 모양이 다르면 지금처럼 응답 모양 어긋남(조회 실패 화면)이다(BR2.4).
2. 사본 항목을 `presetOrdinal` 오름차순으로 묶는다. 묶음 하나가 탭 하나이고, 탭 이름은 그 묶음의 `presetName`, 탭 안 항목은 `position` 오름차순이다(BR2.1). 같은 자료의 사본이 두 프리셋에 있으면 두 탭에 각각 그린다(BR2.3, `publishedItemId`가 다르다).
3. 「발행본 자료」(h2, 지금 이름) 아래에 탭 줄(이름 「발행본 자료」)을 그린다. 프리셋이 하나여도 탭 줄과 탭 하나가 보인다. 처음 열면 첫 탭이 열려 있다. 탭 옆에 자료 개수는 없다(BR2.2).
4. 탭 이름은 탭 하나의 최대 폭(16em)을 넘으면 CSS로 뒤를 「…」로 줄인다. 글자는 자르지 않아 화면 낭독기에는 이름 전체가 읽힌다(BR1.5, 기능 설계 Q1). 탭 줄 아래에 열린 탭의 프리셋 이름 전체를 글자로 보인다(M5). 이름은 글자로만 그린다(BR2.5).
5. 모든 탭의 패널(`tabpanel`)을 그려 두고 열리지 않은 패널은 `hidden`이다. 탭을 오가도 패널을 다시 만들지 않아, PDF 뷰어가 받은 파일과 보던 쪽이 남고 다시 받지 않는다(BR1.4, 기능 설계 Q2). 패널 안 항목 그리기는 지금 `PublishedSnapshotView`의 항목 그리기를 그대로 쓴다.
6. 키보드(BR1.2·BR1.3): 탭에 초점이 있으면 왼쪽·오른쪽 화살표로 옆 탭을 열고 초점을 옮긴다(끝에서 처음으로 돈다). Home·End는 처음·끝 탭. Enter·Space·누름은 그 탭을 연다. 열린 탭만 `tabindex=0`이라 Tab으로 들어오면 열린 탭에 초점이 가고, 다시 Tab이면 열린 패널로 들어간다. 탭을 바꿔도 초점은 탭에 남는다.
7. 화면 낭독기에는 「탭, 2개 중 1번째, 선택됨」처럼 역할·위치·선택 상태가 읽힌다(기본 `tab` 역할과 `aria-selected`).
8. 사본을 다시 받는 갱신(받은 사람 화면의 다시 조회)이 와도 열린 탭은 같은 `presetOrdinal`이면 그대로 둔다. 그 순번이 없어졌으면 첫 탭을 연다.

작성자 발행본 상세(M6)의 「발행본 자료」도 같은 부품으로 같게 보이고 움직인다. 상세 화면의 그 밖의 구성은 그대로다.

## 흐름 2. 받은 사람 화면 순서 (M5, US3.1·US3.3)

판정 통과 화면의 순서를 「제목 → 이 링크에서 할 수 있는 것 안내 → Claude 연결 → 발행 시각 → AI 요약 → 발행본 자료 → 발행본에 질문하기 → JD 요약」으로 바꾼다(BR3.1). 지금은 발행본 자료가 AI 요약보다 위다(`recipient-view.tsx`). 안내(기본 접힘), Claude 연결, 발행 시각, 질문하기, JD 요약 자리의 내용은 바꾸지 않는다. 질문하기는 탭 밖이라 탭을 바꿔도 대화가 남는다(BR3.2).

이 변경 전 발행본 링크는 U1이 행을 지워, 지금의 접근 불가 화면(「이 링크는 열람할 수 없습니다.」)이 보인다(AC3.1.4). 이 단위는 그 화면을 바꾸지 않는다.

## 흐름 3. 출처 이동 (SourceJump, US3.4·US3.5)

1. 답이나 요약의 출처 단추를 누르면 지금 `resolveEvidenceTarget`으로 가리킨 사본 항목(`publishedItemId`)과 강조 범위를 찾는다.
2. 그 항목의 `presetOrdinal`이 열린 탭과 다르면, 열린 탭과 옮길 대상(항목·강조·`seq`)을 한 번의 상태 바뀜에서 함께 바꾼다(BR4.1, interaction-spec SourceJump 1). 모든 패널이 그려져 있어 대상 항목은 늘 화면에 있다. 이 설계에서는 interaction-spec SourceJump의 「다른 탭 항목은 그려져 있지 않다」는 전제만 바뀌고(기능 설계 Q2 B), 탭 바꾸기와 대상 정하기를 한 번에 하는 동작은 그대로다.
3. 그려진 뒤 지금처럼 항목에 초점(`preventScroll`)을 두고, 강조가 있으면 첫 강조가 화면 가운데에, 없으면 항목 시작이 보이게 옮긴다(지금 `recipient-screen.tsx`·`publication-detail-screen.tsx`).
4. 탭이 바뀌었으면 탭 줄 근처의 알림 칸(`aria-live="polite"`)에 「(프리셋 이름) 탭을 열었습니다」를 보인다. 같은 탭이면 알림 글을 바꾸지 않는다(BR4.2).
5. [답으로 돌아가기]는 만들지 않는다(BR4.3).

받은 사람 화면과 작성자 상세가 같은 출처 이동 함수를 쓴다(단위 정의 U3 「출처 이동 공용 함수」).

## 흐름 4. 텍스트 자료 화면 (M7, US4.1·US4.4)

1. 「텍스트 자료」「PDF 자료」 탭을 지금 `MaterialsTabs` 대신 TabStrip으로 그린다. 탭 줄 이름 「자료 종류」, 탭 이름과 자리는 그대로다(BR5.1). 화살표·Home·End로 옮기면 바로 열린다. 지금은 PDF 탭에만 `tabpanel`이 있어 텍스트 쪽에도 둔다.
2. 이 화면은 지금처럼 열린 탭의 내용만 그려도 된다(PDF 업로드 진행 같은 상태는 지금 화면 상태가 갖는다). 다만 `tabpanel`은 두 탭 모두 있어야 `aria-controls`가 가리킬 곳이 있다. 열리지 않은 패널은 비어 있고 `hidden`이다.
3. 지우기 확인 문장 끝에 「프리셋에 담겨 있으면 거기서도 빠집니다.」를 더한다(BR5.2).
   - 텍스트 자료: 「이 자료를 삭제할까요? 이미 발행한 사본은 그대로 남고, 삭제한 자료는 되살릴 수 없습니다. 프리셋에 담겨 있으면 거기서도 빠집니다.」
   - PDF(`PDF_DELETE_CONFIRM`): 「이 PDF를 삭제할까요? 이미 발행한 사본은 그대로 남고, 삭제한 PDF는 되살릴 수 없습니다. 프리셋에 담겨 있으면 거기서도 빠집니다.」
   지운 자료가 프리셋에서 빠지는 일과 발행본 사본이 남는 일은 U1이 한다(연쇄 삭제·사본).

## 시나리오(시험 전에 정하는 것)

| 묶음 | 시나리오 | 기대 결과 | 실패 조건 |
|---|---|---|---|
| 탭 묶음 | P1(2개)·P2(3개) 사본 | 탭 둘(P1·P2 이름), P1에 1·2, P2에 3·4·5 | 섞임 |
| 탭 묶음 | 프리셋 하나 | 탭 줄과 탭 하나 | 탭 줄 없음 |
| 탭 묶음 | 같은 Catch가 P1·P2 | 두 탭에 각각 | 한 탭에만 |
| 탭 이름 | 50자 이름 | 탭은 CSS 말줄임(글자 그대로), 탭 아래 이름 전체 | 글자가 잘림 |
| 탭 이름 | `<b>x</b>` 이름 | 글자 그대로 | 태그로 그려짐 |
| 탭 이름 | 탭 옆 | 개수 없음 | 개수 보임 |
| 처음 | 화면 열기 | 첫 탭 열림, 다른 패널 `hidden` | 다른 탭이 열림 |
| 키보드 | 오른쪽·왼쪽·끝에서 오른쪽·Home·End | 옆·옆·처음·처음·끝 탭이 열리고 초점이 감 | 열리지 않음 |
| 키보드 | 열린 탭만 `tabindex=0` | 나머지 -1 | 모두 0 |
| 접근성 | 역할 | `tablist`·`tab`(`aria-selected`·`aria-controls`)·`tabpanel`(`aria-labelledby`) | 빠짐 |
| 패널 | 탭을 오감 | 패널이 다시 만들어지지 않음(PDF 다시 받지 않음) | 다시 받음 |
| 응답 | `presetOrdinal` 없음·0·6·글자, `presetName` 없음 | 응답 모양 어긋남 | 그대로 그림 |
| 순서 | 받은 사람 화면 | AI 요약이 발행본 자료 위, 나머지 순서 그대로 | 요약이 아래 |
| 대화 | 질문·답 하나 뒤 탭 바꿈 | 그대로 보임 | 사라짐 |
| 출처 | 첫 탭 열림, 출처가 둘째 탭 PDF | 둘째 탭 열림, 그 항목 초점·강조, 「(이름) 탭을 열었습니다」 | 탭만 바뀜 |
| 출처 | 같은 탭 항목 | 탭 그대로, 항목으로, 알림 없음 | 알림이 뜸 |
| 출처 | 돌아가기 | 단추 없음 | 단추 보임 |
| 상세 | 작성자 상세 | 같은 탭 줄·이름·키보드, 요약 출처로 다른 탭 | 다름 |
| 갱신 | 다시 조회 뒤 | 같은 순번이면 열린 탭 그대로 | 첫 탭으로 돌아감 |
| 자료 화면 | 화살표 | 「텍스트 자료」「PDF 자료」가 옮겨 가며 열림, 이름·자리 그대로, 텍스트 쪽 `tabpanel` 있음 | 화살표 안 됨 |
| 자료 화면 | 지우기 확인 | 텍스트·PDF 문장 끝에 「프리셋에 담겨 있으면 거기서도 빠집니다.」 | 말 없음 |

## 파생 보기

- 엔티티 관계도: 이 단위는 저장하는 엔티티가 없다(ui 단위). 화면이 다루는 값은 U1이 실어 주는 사본 항목(`presetOrdinal`·`presetName`·`position`·`publishedItemId`)이다.
- 업무 규칙 요약(`rules.md`가 정본): BR1 탭 줄, BR2 발행본 자료 탭, BR3 받은 사람 화면 순서, BR4 출처 이동, BR5 자료 화면.

## Assumptions & Open Questions

- interaction-spec SourceJump의 「다른 탭 항목은 그려져 있지 않다」 전제는 기능 설계 Q2 B로 바뀐다(모든 패널을 그려 두고 숨김). 탭 바꾸기와 대상 정하기를 한 번의 상태 바뀜에서 하는 동작은 그대로다.
- 탭 최대 폭 16em은 Q1 A의 예시 값을 그대로 쓴 것이다. 모양 다듬기는 팀원 3이 한다.
- 탭 바뀜 알림 글 「(프리셋 이름) 탭을 열었습니다」는 interaction-spec의 예시 글을 그대로 쓴다.
- 갱신 뒤 열린 탭을 같은 순번으로 두는 것(흐름 1의 8)은 요구사항에 없고, 다시 조회 때 읽던 탭이 첫 탭으로 튀지 않게 하려는 가장 단순한 처리다.

## Sources

- 단위 정의: `inception/units-generation/unit-of-work.md` U3, 이야기 지도 `inception/units-generation/unit-of-work-story-map.md`
- 이야기: `inception/user-stories/stories.md` US2.3, US3.1~US3.5, US4.1, US4.4
- 요구사항: `inception/requirements-analysis/requirements.md` FR2.7, FR3.1~FR3.7, FR4.1, FR6.1, FR7.1, NFR1, NFR3
- 구성 요소: `inception/domain-design/components.md` TabStrip, SnapshotViewer, RecipientScreen, PublicationDetailScreen, MaterialsScreen
- 계약: `inception/contract-design/contract-summary.md` P-3
- 다듬은 화면: `inception/refined-mockups/mockups.md` M5~M7, `interaction-spec.md`
- 답: `construction/u3-reader-views/functional-design/functional-design-questions.md` Q1·Q2(2026-11-20 팀장)
- 지금 코드: `web/src/features/materials/materials-view.tsx`(`MaterialsTabs`)·`materials-screen.tsx`·`pdf-materials-api.ts`(`PDF_DELETE_CONFIRM`), `web/src/features/recipient/recipient-screen.tsx`·`recipient-view.tsx`·`recipient-slots.ts`, `web/src/features/publications/snapshot-view.tsx`·`publication-detail-screen.tsx`·`publication-detail-view.tsx`·`publications-api.ts`
