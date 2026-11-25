# Functional Design Questions — u3-reader-views

근거: 단위 `inception/units-generation/unit-of-work.md` U3, 이야기 지도 `unit-of-work-story-map.md`(US2.3, US3.1~US3.5, US4.1, US4.4), 이야기 `inception/user-stories/stories.md`, 요구사항 `inception/requirements-analysis/requirements.md` FR3·FR4.1·FR7.1·NFR1·NFR3, 구성 요소 `inception/domain-design/components.md` TabStrip·SnapshotViewer·RecipientScreen·PublicationDetailScreen·MaterialsScreen, 계약 `inception/contract-design/contract-summary.md` P-3, 다듬은 화면 `inception/refined-mockups/mockups.md` M5~M7·`interaction-spec.md`(TabStrip·PresetNameDisplay·SourceJump), 지금 코드(`web/src/features/materials/materials-view.tsx`의 `MaterialsTabs`, `web/src/features/recipient/recipient-screen.tsx`·`recipient-view.tsx`, `web/src/features/publications/snapshot-view.tsx`·`publication-detail-screen.tsx`).

다듬은 화면과 interaction-spec이 정한 화면 순서·글자·역할·키보드(화살표·Home·End, 열린 탭만 Tab 순서, 돌아가기 단추 없음)는 다시 묻지 않는다. 아래 둘만 비어 있다.

## Q1. [디자이너] 긴 탭 이름을 줄이는 기준

다듬은 화면은 「탭 이름이 탭 너비를 넘으면 뒤를 「…」로 줄인다」(PresetNameDisplay)고만 정했다. 프리셋 이름은 1~50자라 줄이는 기준이 있어야 한다. 줄인 탭도 화면 낭독기에는 이름 전체가 읽혀야 한다(interaction-spec TabStrip Label).

A. CSS로 탭 하나의 최대 폭을 정하고(예: 16em) 한 줄을 넘으면 「…」로 보인다. 글자는 자르지 않으므로 화면 낭독기에는 전체 이름이 그대로 읽힌다. 폭에 따라 줄이는 곳이 달라진다(권장, 가장 단순)
B. 글자 수로 자른다(예: 20자 넘으면 앞 20자 + 「…」). 어느 폭에서나 같게 보이지만, 화면 글자가 잘리므로 전체 이름을 `aria-label`로 따로 읽혀야 한다
X. Other (please specify)

[Answer]: A

## Q2. [개발자] 열리지 않은 탭의 자료를 화면에 그려 둘지

탭마다 그 프리셋의 사본 항목을 그린다. 출처 단추가 다른 탭의 항목을 가리키면 탭을 바꾼 뒤 그 항목으로 옮긴다(SourceJump: 「다른 탭 항목은 그려져 있지 않아 지금처럼 화면 id로 찾으면 못 찾는다」를 전제로 탭 바꾸기와 옮기기를 한 상태 바뀜에서 한다).

A. 열린 탭의 자료만 그린다. 다른 탭의 항목은 탭을 바꾼 다음 그려진 뒤에 찾아 옮긴다(interaction-spec SourceJump가 전제한 방식). PDF 사본 보기 같은 항목 안의 상태는 탭을 바꾸면 처음으로 돌아간다(권장, 가장 단순)
B. 모든 탭의 자료를 그려 두고 열리지 않은 탭은 숨긴다(`hidden`). 탭을 바꿔도 항목 안의 상태가 남고 항목을 바로 찾을 수 있지만, 같은 항목의 화면 id가 겹치지 않게 사본마다 id를 따로 매겨야 하고(같은 자료가 두 프리셋에 있으면 두 번 그려짐) 처음 그리는 양이 늘어난다
X. Other (please specify)

[Answer]: B — B로 하되, 화면 id는 지금처럼 publishedItemId로 쓴다(사본마다 이미 다르다). 탭을 오가도 PDF 뷰어가 받은 파일과 보던 쪽이 남아 다시 받지 않게 하려는 것이다. 출처 이동은 interaction-spec SourceJump 동작대로 한 번의 상태 바뀜에서 탭 바꾸기와 대상 정하기를 하고, 명세의 「다른 탭 항목은 그려져 있지 않다」 전제만 바뀐다고 기록한다.

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
