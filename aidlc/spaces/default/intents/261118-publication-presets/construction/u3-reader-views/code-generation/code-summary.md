# Code Summary — u3-reader-views

근거: 승인된 계획 `code-generation-plan.md`(Step 1~10), 시험 안내 `unit-test-instructions.md`, 기능 설계·NFR 요구·NFR 설계(`construction/u3-reader-views/`).

## 만든 파일

| 파일 | 내용 |
|---|---|
| `web/src/components/tab-strip/tab-strip.tsx`·`tab-strip.module.css` | 공용 TabStrip: `tablist`·`tab`·`tabpanel`(`tabIndex=0`, `hidden`), 열린 탭만 Tab 순서, 화살표(돎)·Home·End·Enter·Space, `keepInactive`, `truncateLabels`(최대 폭 16em 말줄임), `tabTestId` 머리 글, `onChange(id) => boolean \| void`(`false`만 거절, 거절이면 초점을 열린 탭에 둠). 키 처리는 순수 함수 |
| `web/src/features/publications/snapshot-jump.ts` | `useSnapshotJump`: 열린 탭·출처 대상·알림을 한 상태로, 다른 탭 출처는 한 번에 바꿈, 그려진 뒤 초점·스크롤, 갱신 뒤 같은 순번 유지. 순수 함수 `jumpToEvidence`·`presetAfterRefresh`·`choosePreset` |
| `web/test/reader-tabs.test.mjs` | 19건 |

## 고친 파일

| 파일 | 내용 |
|---|---|
| `publications-api.ts` | `PublishedItem`에 `presetOrdinal`(정수 1~5)·`presetName`(공백 뺀 1자 이상) 검사 |
| `snapshot-view.tsx`, `publications.module.css` | `groupByPreset`(순번 순, 안은 position, 이름은 묶음 첫 항목), TabStrip(「발행본 자료」, 모든 패널 그려 두고 숨김), 패널 맨 위 이름 전체, 「발행본 자료」 제목 아래 알림 칸(`aria-live="polite"`) |
| `recipient-api.ts` | `pickItem`이 두 칸을 더 옮김 |
| `recipient-screen.tsx`, `publication-detail-screen.tsx`·`publication-detail-view.tsx` | `useSnapshotJump` |
| `recipient-view.tsx` | `RecipientSlots`를 `SummarySlot`(AI 요약)과 `QuestionSlots`(질문하기·JD)로 나눠 「발행 시각 → AI 요약 → 발행본 자료 → 질문하기 → JD」 |
| `materials-screen.tsx`, `materials-view.tsx`, `materials.module.css` | 두 return을 바깥 틀 하나로 합치고 TabStrip(「자료 종류」, 두 패널), `MaterialsTabs` 지움, 탭 CSS를 공용으로 옮김(`flex-wrap: wrap` 더함), 텍스트 지우기 확인 문장 끝에 「프리셋에 담겨 있으면 거기서도 빠집니다.」 |
| `pdf-materials-api.ts` | `PDF_DELETE_CONFIRM` 끝에 같은 문장 |
| README 셋(recipient·publications·materials) | 화면 순서·자리 표·탭·출처 이동·확인 문장, 낡은 시험 개수 |
| 시험 7개(recipient·recipient-pdf·publications-owner·materials-screen·pdf-materials-api·jd-recipient-binding·u9-recipient-claude) | 사본 고정 자료에 두 칸, 새 동작 시험, `RecipientSlots` → `QuestionSlots` |

지운 파일은 없다.

## 주요 판단

- interaction-spec의 `onChange: void`를 `boolean | void`로 넓혔다. `false`만 거절로 보고 `undefined`는 바뀐 것으로 본다(NFR 설계 Q1 A, 검토 Minor 1). TabStrip 머리 주석에도 적었다.
- 출처 이동 알림은 순번과 함께 두어 열린 탭과 순번이 같을 때만 보이고, 사람이 탭을 직접 바꾸면 지운다.
- `groupByPreset`은 `Array.from`을 쓴다. 시험 변환 대상(ES5)에서 Map 펼치기가 빈 배열이 되어 실제로 실패했다.
- `showEvidence`는 사본 객체가 바뀔 때만 새 함수가 된다. 받는 패널(요약·질의응답·JD)은 이 함수를 효과 의존값으로 쓰지 않음을 확인했다.

## 시험 결과

| 명령 | 결과 |
|---|---|
| 기준선(바꾸기 전, 6개 파일) | 118건 통과, 0건 실패 |
| 이 단위 명령(7개 파일) | 145건 통과, 0건 실패 |
| 이 단위 명령 + `test/u9-recipient-claude.test.mjs` | 157건 통과, 0건 실패(조정자가 다시 돌려 같은 결과) |
| `npm --prefix web test`(전체) | 1127건 통과, 0건 실패 |
| `npm --prefix web run lint`·`typecheck` | 오류 0 |

80% 줄 커버리지는 Build and Test가 전체 명령으로 잰다. 문턱 설정은 바꾸지 않았다.

## 기록 남기지 않기(NFR4.3, Step 7)

바뀐·새 web/src 파일 14개에 `console.` 호출 0건, diff에 새 `console.` 줄 없음.

## 이 단계에서 돌리지 않은 시험

브라우저에서만 보이는 것(Build and Test에서 확인): 출처 이동 뒤 실제 초점·스크롤, 숨긴 패널이 실제로 안 보이는지, 탭을 오갈 때 PDF를 다시 받지 않는지, 320px 폭에서 탭 줄바꿈, 자료 화면에서 확인 창을 거절하면 초점이 「텍스트 자료」 탭에 남는지.

## 계획과 다른 점

1. `pdf-materials-tab.tsx`는 고치지 않았다. 지금 `role="tabpanel"`은 `materials-screen.tsx`에 있었고 거기서 옮겼다.
2. 계획의 「함께 고칠 파일」에 없던 CSS 둘: `materials.module.css`(탭 CSS를 공용으로 옮기고 `flex-wrap` 더함), `publications.module.css`(`.presetName`).
3. 「탭 아래 이름 전체」는 각 패널 맨 위에 둔다(숨긴 패널의 이름은 함께 숨음).
4. 이 단위 명령에 `test/u9-recipient-claude.test.mjs`가 더 필요하다(사본 고정 자료를 고침). 시험 안내 「고친 파일 이름을 명령에 더해 돌린다」에 따랐다.
5. `reader-tabs.test.mjs`는 19건(계획 약 25건)으로, 시험 하나에 시나리오를 묶었고 시나리오 표의 모든 줄이 이 파일이나 고친 시험에 있다.

## 남는 것

- `web/src/features/recipient/README.md`의 낡은 서술 둘(4번 자리 「U10 `JdSummaryPanel` 제공 전 빈 자리」, 「범위 밖」의 「4번 자리는 U10이 제공한 뒤 단다」)은 이 단위 범위 밖이라 고치지 않았다. 실제 코드는 이미 `JdRecipientPanel`을 단다.
- 프리셋 칸이 없는 옛 사본은 조회 실패로 보인다. U1이 변경 전 발행본을 지운다는 계약 P-3에 기댄다.
