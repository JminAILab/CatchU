# NC1 칸 제목과 링크 이름 — 기능 명세

입력:
- Unit `inception/units-generation/unit-of-work.md` NC1(`nc1-sections-and-links`, ui)과 `unit-of-work-story-map.md`
- 사용자 이야기 `inception/user-stories/stories.md` US1.1~US5.4(16개, 수락 기준 58개)
- 요구사항 `inception/requirements-analysis/requirements.md` FR1~FR8, NFR5~NFR7
- 구성 요소 `inception/domain-design/components.md`(AuthorDescriptionSections, GithubLinkName, AssetsScreen, PublishScreen, SnapshotView, Catches)
- 계약 `inception/contract-design/contract-summary.md` C1·C7
- 다듬은 화면 `inception/refined-mockups/mockups.md`·`interaction-spec.md`
- 이 단계의 답 `functional-design-questions.md`(Q1~Q5)

이 Unit은 화면(ui) Unit이지만 api 본인 목록 조건(C1)도 바꾸므로 규칙은 `rules.md`에 따로 둔다. 새로 저장하는 칸이 없어 엔티티 문서는 두지 않는다. 이 문서는 동작 흐름과 화면 상태의 정본이다. 화면 부품의 구조는 `frontend-components.md`에 있다. 이 Unit이 맡는 이야기는 US1.1~US1.5, US2.1~US2.3, US3.1·US3.2, US4.1·US4.2, US5.1~US5.4다.

**면접관 화면도 이 Unit에 든다.** 칸 제목별 보기(US1.4·US1.5)와 링크 이름(US2.2)은 받은 사람 화면과 작성자 발행본 상세가 함께 쓰는 사본 보기(`snapshot-view.tsx`)를 바꾼다. NC1을 확인할 때 면접관 화면도 본다.

## 1. 규칙

규칙의 정본은 `rules.md`의 YAML이다(BR1.1~BR7.6). 아래 흐름과 화면 상태는 그 규칙 번호를 가리키고, 4절은 `rules.md`에서 옮긴 요약이다. 새로 저장하는 칸이 없어 엔티티 관계도는 두지 않는다.

## 2. 흐름

### W1 작성자 설명 열기·쓰기·저장 (US1.1~US1.3, US2.1, US3.2)

1. 지원자가 Catch 상세를 연다. 편집 영역은 지금처럼 작성자 설명을 읽는 동안 「작성자 설명을 불러오고 있습니다.」를 보인다.
2. 읽기에 성공하면 저장된 글을 BR1.2로 8칸에 채운다. 실패하면 지금처럼 실패 안내와 [다시 불러오기]다.
3. 지원자가 칸을 고친다. 고칠 때마다 합친 글(BR1.4)의 합계 글자 수(BR1.5)와 링크 목록(BR3)을 다시 계산한다. 처음 나눈 칸 글과 달라진 칸이 있으면 「저장하지 않은 변경이 있습니다」를 보인다(BR1.6).
4. [설명 저장]을 누른다. 합계가 4,000자를 넘으면 저장하지 않고 상한 안내를 보인다.
5. 넘지 않으면 합친 글 하나를 지금 저장 경로(`PUT /v1/catches/{catchId}/description`)로 보낸다. 저장 중에는 8칸을 쓸 수 없다.
6. 성공하면 「저장됨」, 실패하면 지금처럼 입력을 남기고 실패 안내다. 저장 중 더 친 글은 서버 값으로 덮지 않는다(지금 동작).

### W2 본인 목록 걸러 보기 (US4.1, US4.2)

1. 지원자가 「작성자 설명」 칸을 고른다.
2. web이 `authorDescription` 조건으로 첫 쪽을 요청한다(BR5.1).
3. 결과가 있으면 카드와 개수 줄을, 빈 목록이면 BR5.5 안내를 보인다.
4. 「더 보기」는 `v: 2` 커서로 다음 쪽을 부른다. 400이면 지금 실패 안내다(BR5.2).
5. 상세에서 설명을 저장하고 닫아도 지금 쪽은 그대로다(BR5.6).

### W3 발행 화면 고르기·확인 (US5.1~US5.4)

1. 발행 화면을 열면 고르기 목록과 저장소 목록을 함께 불러온다(BR6.2).
2. 항목마다 작은 줄을 보인다(BR6.3).
3. 지원자가 「작성자 설명을 쓴 Catch만 보기」를 켜면 첫 쪽부터 다시 불러온다. 고른 자료는 그대로다(BR6.4, BR6.5).
4. 고른 자료로 확인 단계에 가면 설명 없는 Catch 수를 보인다(BR6.6).
5. [발행]은 지금 그대로다.

### W4 면접관 발행본 보기 (US1.4, US1.5, US2.2)

1. 면접관이 받은 사람 링크를 연다(또는 지원자가 작성자 발행본 상세를 연다).
2. 사본의 작성자 설명을 칸별로 그린다(BR7.1~BR7.3).
3. 칸 글 속 GitHub 링크는 이름으로 그린다(BR2).
4. AI 답의 근거 단추를 누르면 강조 범위를 칸 안 범위로 바꿔 강조한다. 이은 칸은 강조하지 않는다(BR7.5).

### 한계 (FR1.6)

- 지원자가 칸 안에 칸 제목과 똑같은 줄을 쓰면, 다시 열 때 그 줄부터 그 칸으로 읽힌다.
- 이때 생긴 이은 칸에서는 AI 답의 근거를 강조하지 않는다.
- 이은 칸이 있는 글은 저장하면 칸 순서로 옮겨진다. 옮겨진 모습은 편집 화면에 그대로 보인다.
- 브랜치 이름에 `/`가 든 주소는 첫 마디만 브랜치 이름으로 보일 수 있다. 링크 대상은 맞다(BR2.2).

## 3. 화면 상태

| 화면 | 상태 | 보이는 것 |
|---|---|---|
| 편집 영역 | 불러오는 중 / 실패 / 준비 / 저장 중 / 상한 넘음 / 저장됨 / 저장 실패 | W1. 저장 중만 8칸 모두 쓸 수 없음 |
| 링크 목록 | 링크 있음 / 없음 | BR3.2 |
| 본인 목록 | 불러오는 중 / 실패 / 걸러 본 빈 결과 / 공개 상태 빈 결과 / 전체 빈 결과 / 목록 / 더 보기 실패 | BR5.5, BR5.2 |
| 발행 고르기 | 불러오는 중 / 실패 / 걸러 본 빈 결과 / 고를 것 없음 / 목록 / 발행 중 / 최대 개수 | BR6.4~BR6.5 |
| 발행 확인 | 설명 없는 Catch 있음 / 없음 | BR6.6 |
| 발행본 작성자 설명 | 칸별 / 글만(더 쓰기만·옛 글) / 없음 | BR7.1~BR7.3 |

## 4. 규칙 요약(`rules.md`에서 옮김)

| 묶음 | 규칙 | 구성 요소 | 요구사항 |
|---|---|---|---|
| BR1 | 칸 제목 줄·나누기·시작 위치·합치기·글자 수·왕복 | AuthorDescriptionSections | FR1.1~FR1.6, FR3.5 |
| BR2 | 링크 이름·판본·다른 저장소·질의·인코딩·위치·요소 | GithubLinkName | FR3, NFR5, NFR6 |
| BR3 | 발행하면 열릴 링크 목록 | AssetsScreen | FR5 |
| BR4 | 상세 순서·질문 문구·편집 안내·짚어 볼 곳·편집 칸 | AssetsScreen | FR1.1, FR1.7, FR4, FR6 |
| BR5 | 목록 조건·커서·응답 칸·선택 칸·빈 결과·저장 뒤 | Catches, AssetsScreen | FR7, FR8.6 |
| BR6 | 발행 권장 안내·저장소 이름·작은 줄·걸러 보기·고른 자료·확인 안내 | PublishScreen | FR8 |
| BR7 | 발행본 칸별 보기·더 쓰기·없음·순서·강조 | SnapshotView | FR2, FR3.5 |

## 5. 연결 지점

- api: `GET /v1/catches`에 조건 `authorDescription`, 응답 칸 `hasAuthorDescription`, 커서 `v: 2`가 더해진다(계약 C1). 목록 조건·응답 칸·커서 계약은 NC3이 이어받아 정렬을 바꾼다.
- web 공통 부품 둘(AuthorDescriptionSections, GithubLinkName)의 함수 모양은 `frontend-components.md`에 적는다. NC2가 GithubLinkName에 표지 판정을 더한다(계약 C7).
- 작성자 설명 저장 경로와 4,000자 상한은 바꾸지 않는다.

## Sources

- `inception/units-generation/unit-of-work.md`, `inception/units-generation/unit-of-work-story-map.md`
- `inception/user-stories/stories.md` US1.1~US5.4
- `inception/requirements-analysis/requirements.md` FR1~FR8, NFR5~NFR7, 가정 A6
- `inception/domain-design/components.md`, `inception/domain-design/decisions.md` ADR-001
- `inception/contract-design/contract-summary.md` C1·C7
- `inception/refined-mockups/mockups.md`, `inception/refined-mockups/interaction-spec.md`
- `construction/nc1-sections-and-links/functional-design/functional-design-questions.md` Q1~Q5
- 지금 코드: `web/src/lib/github-source-url.ts`, `web/src/features/publications/snapshot-view.tsx`, `web/src/features/assets/author-description-panel.tsx`, `api/src/catches/owner-catch-input.ts`, `api/src/catches/owner-catch-store.ts`, `api/src/catches/author-description-input.ts`
