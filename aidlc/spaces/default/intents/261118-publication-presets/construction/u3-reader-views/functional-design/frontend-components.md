# Frontend Components — u3-reader-views

부품 나눔과 상태다. 동작은 `functional-spec.md`, 규칙은 `rules.md`가 정본이다. 모양은 지금 CSS를 쓰고 다듬지 않는다(C-O4). 역할·키보드는 `inception/refined-mockups/interaction-spec.md`와 맞췄다.

## 새 부품 TabStrip

| 항목 | 내용 |
|---|---|
| 자리 | `web/src/components/tab-strip/`(받은 사람 화면·작성자 상세·텍스트 자료 화면이 함께 씀) |
| 입력 | `tabs: { id, label }[]`, `active`, `onChange(id)`, `label`(탭 줄 이름), `idPrefix`(화면 id 겹침 방지), `panels: Record<id, ReactNode>`, `keepInactive`(열리지 않은 패널도 그려 둠, 기본 false) |
| 그리기 | `div role="tablist" aria-label={label}` 안에 탭 `button role="tab" id aria-selected aria-controls tabIndex`(열린 탭만 0), 탭마다 `div role="tabpanel" id aria-labelledby hidden`. `keepInactive`가 false면 열리지 않은 패널은 빈 채로 `hidden`, true면 내용을 그린 채로 `hidden` |
| 키보드 | 왼쪽·오른쪽(끝에서 돈다)·Home·End는 새 탭을 열고 그 탭에 초점, Enter·Space·누름은 연다 |
| 탭 이름 | 글자로만. 발행본 자료는 CSS 클래스로 최대 폭 16em 한 줄 말줄임(`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`) |

지금 `web/src/features/materials/materials-view.tsx`의 `MaterialsTabs`는 이 부품을 쓰도록 바꾸고 지운다. 탭 이름·자리·`data-testid`는 지금 값을 그대로 쓴다(시험이 본다).

## 발행본 자료 `web/src/features/publications/snapshot-view.tsx` (바뀜)

| 부품 | 바뀌는 것 |
|---|---|
| `PublishedSnapshotView` | 항목을 `presetOrdinal`로 묶어 TabStrip(`label` 「발행본 자료」, `keepInactive: true`)에 넘긴다. 열린 탭은 부모가 준다(`activePreset`, `onPresetChange`). 탭 줄 아래 열린 탭 이름 전체(글자). 탭 바뀜 알림 칸(`aria-live="polite"`, 글은 부모가 줌). 패널 안 항목 그리기는 지금 그대로 |
| 묶기 함수 | `groupByPreset(snapshot)`: `presetOrdinal` 오름차순 묶음, 묶음 안 `position` 오름차순. 순수 함수라 따로 시험 |

## 출처 이동 공용 함수 (바뀜)

| 부품 | 바뀌는 것 |
|---|---|
| 새 `web/src/features/publications/snapshot-jump.ts` | `useSnapshotJump(snapshot)`: 열린 탭(`activePreset`)과 옮길 대상(`target`)을 한 상태로 갖는다. `showEvidence(location)`은 `resolveEvidenceTarget`로 항목을 찾아 그 `presetOrdinal`과 대상을 한 번에 바꾼다. 효과에서 지금처럼 항목 초점·스크롤. 탭이 바뀐 출처 이동이면 알림 글 「(이름) 탭을 열었습니다」를 낸다. 갱신 뒤 같은 순번이 없으면 첫 탭 |
| `web/src/features/recipient/recipient-screen.tsx` | 지금의 `target`·`showEvidence`·효과를 이 함수로 바꾼다 |
| `web/src/features/publications/publication-detail-screen.tsx` | 같다 |

## 받은 사람 화면 `web/src/features/recipient/recipient-view.tsx` (바뀜)

판정 통과 화면에서 1번 자리(발행본 자료)와 2번 자리(AI 요약)의 순서를 바꾼다. 머리 주석의 자리 표도 고친다. 나머지는 그대로다.

## 작성자 상세 `web/src/features/publications/publication-detail-view.tsx` (바뀜)

`PublishedSnapshotView`에 열린 탭·바꾸기·알림 글을 넘긴다. 순서(요약 위, 자료 아래)는 지금 그대로다.

## 응답 검사 `web/src/features/publications/publications-api.ts` (바뀜)

`PublishedItem` 타입에 `presetOrdinal: number`·`presetName: string`을 더하고, `isPublishedItem`이 정수 1~5와 글자를 요구한다(BR2.4). 받은 사람 열람 응답(`features/recipient/`)이 같은 검사를 쓰는지 확인해 같이 맞춘다.

## 텍스트 자료 화면 `web/src/features/materials/` (바뀜)

| 파일 | 바뀌는 것 |
|---|---|
| `materials-view.tsx` | `MaterialsTabs` 지움 |
| `materials-screen.tsx` | TabStrip(`label` 「자료 종류」, `keepInactive: false`)로 탭과 두 패널, 텍스트 지우기 확인 문장 끝에 「프리셋에 담겨 있으면 거기서도 빠집니다.」 |
| `pdf-materials-api.ts` | `PDF_DELETE_CONFIRM` 끝에 같은 문장 |
| `pdf-materials-tab.tsx` | 지금 `role="tabpanel"`을 TabStrip 패널로 옮김(겹치지 않게) |

## 상태 한눈에

| 화면 | 상태 | 입력 |
|---|---|---|
| 받은 사람 화면 | 지금 단계 + 열린 탭(`presetOrdinal`), 출처 대상, 알림 글 | 탭 누름·화살표, 출처 단추 |
| 작성자 상세 | 같다 | 같다 |
| 텍스트 자료 화면 | 지금 `tab`(`text`·`pdf`) | 탭 누름·화살표 |

## 접근성(interaction-spec 대조)

| 요소 | 역할·키보드 | interaction-spec |
|---|---|---|
| 탭 줄 | `tablist`(이름 있음), `tab`(`aria-selected`·`aria-controls`), `tabpanel`(`aria-labelledby`) | TabStrip 그대로 |
| 키보드 | 화살표(돎)·Home·End, Enter·Space | TabStrip 그대로 |
| Tab 순서 | 열린 탭만, 다시 Tab이면 패널 | TabStrip 그대로 |
| 탭 이름 | 글자 그대로, 화면만 CSS 말줄임 | TabStrip Label·PresetNameDisplay 그대로 |
| 출처 이동 | 옮긴 뒤 초점은 항목, 탭이 바뀌면 `aria-live="polite"` 알림 | SourceJump 그대로 |
| 돌아가기 | 없음 | SourceJump(만들지 않음) 그대로 |

interaction-spec과 다른 동작은 없다. 달라지는 전제 하나(열리지 않은 탭 항목도 그려져 있음)는 `functional-spec.md` 「Assumptions」에 적었다.
