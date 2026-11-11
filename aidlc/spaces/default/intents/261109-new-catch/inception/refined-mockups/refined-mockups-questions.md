# 새 Catch — 다듬은 화면 질문

입력: 승인된 대략 화면 `ideation/rough-mockups/wireframes.md`·`user-flow.md`, 사용자 이야기 `inception/user-stories/stories.md`(US1~US11), 요구사항 `inception/requirements-analysis/requirements.md`.

대략 화면이 배치·문구·접근성 대부분을 정했다. 반응형과 접근성 기준은 기존 화면 그대로다(대략 화면 Q6). 표지 모양·제어 문자 처리(NFR5)와 칸 제목 줄 모양(FR1.6)은 요구사항에서 기능 설계로 넘겼으므로 여기서 묻지 않는다. 아래는 지금 코드를 확인하다 나온 것 가운데 사람이 정할 것만 묻는다.

지금 코드에서 확인한 것:

- 지원자 상세의 작성자 설명은 글칸 하나다. 그 글칸의 `label`(「작성자 설명」)은 화면에 보이지 않고 화면 낭독기에만 읽힌다(`web/src/features/assets/author-description-panel.tsx`).
- 발행 화면 「내 Catch」 항목은 체크 칸이 아니라 누르면 골라지는 단추(`aria-pressed`)다. 항목 안에는 제목 아래 작은 줄 「공개」 또는 「비공개」와 「· 불일치 표시됨」이 이미 있다(`web/src/features/publications/publish-view.tsx`). 대략 화면은 이 줄을 그리지 않았다.
- 면접관 화면의 Catch 안 구역 제목은 h4이고, h5는 아직 어디에도 없다(`web/src/features/publications/snapshot-view.tsx`).

## Q1. [디자인] 편집 화면에서 칸 제목을 어디에 둘지

지금 글칸 하나의 이름표는 화면에 보이지 않는다. 8칸이 되면 칸 제목이 보여야 한다(FR1.1, NFR6). 대략 화면은 칸 제목을 글칸 왼쪽에 그렸다.

A. 칸 제목을 글칸 위에 두고 글칸은 그 아래 한 줄을 다 쓴다. 지금 발행 화면의 「발행본 제목」 입력과 같은 모양이고 좁은 화면에서도 그대로다. 글칸 높이는 3줄로 시작한다. (가장 단순)
B. 칸 제목을 글칸 왼쪽 같은 줄에 둔다(대략 화면 그림). 넓은 화면에서 한눈에 들어온다. 「AI가 낸 것 가운데 받아들이지 않았거나 고친 것」처럼 긴 제목 때문에 칸 너비를 따로 정해야 하고, 좁은 화면 배치를 하나 더 만들어야 한다(대략 화면 Q6 B에서 채택하지 않은 별도 배치).
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Q2. [디자인] 발행 화면 항목에 저장소 이름과 「설명 안 씀」을 어떻게 붙일지

항목 안에는 이미 「비공개 · 불일치 표시됨」 같은 작은 줄이 있다(FR8.2).

A. 저장소 이름을 그 작은 줄 맨 앞에, 「설명 안 씀」을 공개 상태 뒤에 이어 붙인다. 예: 「ljm0850/TheMe · 비공개 · 설명 안 씀 · 불일치 표시됨」. 줄이 하나 그대로다. (가장 단순)
B. 저장소 이름은 제목 아래 새 줄에 두고, 「설명 안 씀」은 기존 작은 줄에 붙인다. 저장소가 더 잘 보인다. 항목마다 한 줄이 늘어 한 쪽에 보이는 항목이 줄어든다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Q3. [디자인] 면접관 화면에서 칸 제목의 모양

대략 화면은 칸 제목을 h4 「작성자 설명」 아래의 h5로 두는 것을 가정으로 남겼다.

A. h5 제목으로 둔다. 화면 낭독기 사용자가 제목 이동으로 칸을 찾을 수 있다. 지금 코드에 h5 모양이 없으므로 글자 크기 하나를 정해 더한다. (대략 화면 가정)
B. 제목이 아닌 굵은 글자 한 줄로 둔다. 새 글자 모양이 필요 없다. 화면 낭독기에서 제목 이동으로는 찾을 수 없다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Q4. [디자인] 발행 화면에서 「작성자 설명을 쓴 Catch만 보기」를 켰는데 맞는 Catch가 없을 때

요구사항은 본인 목록의 빈 결과 안내만 정했다(FR7.3). 발행 화면의 빈 결과는 정하지 않았다.

A. 본인 목록과 같은 문장 「작성자 설명을 쓴 Catch가 없습니다」를 「내 Catch」 아래에 보인다. 이미 고른 항목은 그대로다(FR8.4). (가장 단순)
B. 같은 문장 뒤에 「칸을 끄면 모든 Catch를 볼 수 있습니다」를 덧붙인다. 다음 할 일이 보인다. 문구가 하나 늘어난다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
