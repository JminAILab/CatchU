# Refined Mockups — 질문

근거: 승인된 화면 초안 `ideation/rough-mockups/wireframes.md`·`user-flow.md`, 이야기 `inception/user-stories/stories.md`, 요구사항 `inception/requirements-analysis/requirements.md`, 팀 관행 `inception/practices-discovery/team-practices.md`, 지금 코드(이 브랜치의 `web/src`).

지금 코드에서 확인한 것:

- 발행 화면의 자료 고르기는 체크박스가 아니라 누르는 단추다. 고르면 눌림 상태(`aria-pressed`)가 되고, 고를 수 없으면 단추가 막히고 단추 안에 이유 글자가 보인다(`web/src/features/publications/publish-view.tsx`). 화면 초안은 이것을 `[ ]`로 그렸다.
- 출처 단추를 누르면 그 항목으로 화면을 옮기고 초점을 그 항목에 둔다(`web/src/features/recipient/recipient-screen.tsx`).
- 텍스트 자료 화면은 저장하지 않은 입력이 있을 때 다른 곳으로 가려 하면 「저장하지 않은 입력이 있습니다. 이동하시겠습니까?」로 묻는다(`web/src/features/profile/use-unsaved-guard.ts`).
- 상단 메뉴는 높이가 정해진 한 줄이고 줄바꿈이 없다(`web/src/components/header/header.module.css`).

## Q1. [디자인] 프리셋과 자료를 고르는 방식

A. 지금 발행 화면처럼 누르는 단추로 고른다(눌림 상태, 막히면 단추 안에 이유 글자). 프리셋 편집의 자료 고르기와 발행 화면의 프리셋 고르기 모두 같다. 화면 초안의 `[ ]` 표기는 이 단추를 뜻하는 것으로 바로잡는다
B. 체크박스로 바꾼다
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Q2. [디자인] 출처로 옮겨 간 직후 초점과 [답으로 돌아가기]에 닿는 법

A. 지금처럼 초점을 옮겨 간 글(항목)에 둔다. [답으로 돌아가기]는 그 글 바로 위에 있어 Shift+Tab 한 번으로 닿는다
B. 초점을 [답으로 돌아가기]에 둔다(Tab 한 번이면 글로 들어간다)
C. Not yet defined
X. Other (please specify)

[Answer]: X. 초점은 지금처럼 옮겨 간 글(항목)에 둔다. [답으로 돌아가기]는 그 항목 안의 제목 바로 아래에 두어 Tab 한 번으로 닿게 한다. 긴 자료의 뒷부분을 가리키면 이 단추가 화면 밖에 남는데, 이것은 이 작업에서 풀지 않고 넓은 화면 좌우 배치 이슈 #615(팀원 담당)에서 함께 다듬는다.

## Q3. [디자인] 저장하지 않은 변경을 두고 프리셋 편집 화면을 떠날 때

A. 텍스트 자료 화면과 같은 경고(「저장하지 않은 입력이 있습니다. 이동하시겠습니까?」)를 같은 부품으로 쓴다
B. 경고 없이 떠난다(변경은 사라진다)
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Q4. [디자인] 상단 메뉴가 5개가 될 때

A. 지금 헤더 그대로 한 줄에 둔다. 「프리셋」은 세 글자라 지금 화면 폭 기준에 들어간다고 보고, 넘치는지는 팀원 3의 모양 다듬기에서 확인한다
B. 메뉴 이름을 줄이거나 배치를 바꾼다
C. Not yet defined
X. Other (please specify)

[Answer]: A. 지금 헤더 그대로 한 줄에 둔다. 다만 이 작업에서 320px 폭일 때 프로필 단추가 화면 밖으로 밀리지 않는지 한 번 확인한다(#397 전례). 밀리면 그때 배치를 정한다.

## Q5. [디자인] 프리셋을 저장한 뒤 어디에 있나

A. 편집 화면에 남고 「저장했습니다」가 보인다(새 프리셋이면 그 프리셋의 편집 화면으로 바뀐다)
B. 프리셋 목록으로 돌아간다
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- Q1: 프리셋 편집의 자료 고르기와 발행 화면의 프리셋 고르기는 지금처럼 누르는 단추(눌림 상태, 막히면 단추 안에 이유)로 고른다. 화면 초안의 `[ ]` 표기는 이 단추로 바로잡는다
- Q2: 출처로 옮겨 간 직후 초점은 그 항목에 둔다. [답으로 돌아가기]는 그 항목 안 제목 바로 아래에 두어 Tab 한 번으로 닿는다(화면 초안의 「글 바로 위」를 바꿈). 긴 자료 뒷부분을 가리킬 때 단추가 화면 밖에 남는 문제는 #615에서 다듬는다
- Q3: 프리셋 편집 화면을 저장 없이 떠나면 텍스트 자료 화면과 같은 경고를 같은 부품으로 쓴다
- Q4: 상단 메뉴는 지금 헤더 그대로 한 줄. 320px 폭에서 프로필 단추가 밀리지 않는지 이 작업에서 한 번 확인하고, 밀리면 그때 배치를 정한다
- Q5: 저장하면 편집 화면에 남고 「저장했습니다」가 보인다. 새 프리셋이면 그 프리셋의 편집 화면으로 바뀐다

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
