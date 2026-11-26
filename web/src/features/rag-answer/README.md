# AI 기본 요약·질의응답 패널 — 12월 intent U5

받은 사람 화면(`/s/[token]`)의 붙는 자리 2·3(계약 C-11)에 다는 `BaseSummaryPanel`·`QnaPanel`과, 작성자 발행본 화면에 다는 `BaseSummaryPanel` 작성자 모드다. 화면 틀·grant 보관·근거 위치 강조(`showEvidence`)는 U4가 맡고, 이 폴더는 패널만 맡는다. 기준: U5 [기능 명세](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/functional-design/functional-spec.md) 「화면」, [업무 규칙](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u5-rag-answer/functional-design/rules.md) BR8, 계약 C-11·C-12. api 쪽 동작은 [api/docs/rag-answer.md](../../../../api/docs/rag-answer.md)에 있다.

## 붙이는 방법(U4)

받은 사람 화면 자리 2·3은 U4 제출 3 Step 22(2026-11-06)에서 `features/recipient/recipient-view.tsx`의 `RecipientSlots`가 아래 모양 그대로 단다. 작성자 발행본 화면의 작성자 모드는 `features/publications/publication-detail-view.tsx`의 요약 자리에 단다(#441). 근거 강조는 `publication-detail-screen.tsx`가 받은 사람 화면과 같은 규칙으로 처리한다.

```tsx
// 받은 사람 화면 자리 2·3. RecipientSlotProps(C-11) + showEvidence, 선택 itemTitleOf(#559).
<BaseSummaryPanel key={token} token={token} getGrant={getGrant} onAccessLost={onAccessLost} isLoggedIn={isLoggedIn} showEvidence={showEvidence}
  itemTitleOf={itemTitleFinder(snapshot.items)} />
<QnaPanel key={token} token={token} getGrant={getGrant} onAccessLost={onAccessLost} isLoggedIn={isLoggedIn} showEvidence={showEvidence}
  itemTitleOf={itemTitleFinder(snapshot.items)} />

// 작성자 발행본 화면(C-11 owner-summary). token·grant 없음.
<BaseSummaryPanel key={publicationId} publicationId={publicationId} showEvidence={showEvidence} itemTitleOf={itemTitleFinder(detail.snapshot.items)} />
```

`itemTitleOf`는 선택이다(#559 FR4.2). 패널을 다는 화면이 자기가 가진 사본으로 `itemTitleFinder(items)`(`item-title.ts`)를 만들어 넘긴다. `RecipientSlotProps` 모양은 그대로이고, 받은 사람 화면은 `RecipientSlots`에 사본에서 만든 함수를 따로 넘긴다. 4번 자리 JD 패널에는 넘기지 않는다.

| props | 뜻 |
|---|---|
| `token` | 경로의 링크 토큰. 요청 경로에만 쓰고 쿼리·로그에 싣지 않는다 |
| `getGrant()` | 비밀번호 링크 grant(없으면 null). `X-Link-Grant` 머리에 싣는다 |
| `onAccessLost(code)` | 401 `LINK_PASSWORD_REQUIRED`·404 `LINK_UNAVAILABLE`을 받으면 패널이 스스로 처리하지 않고 부른다. 그때 요약 패널은 숨는다 |
| `isLoggedIn` | C-11 모양으로 받지만 U5 패널은 쓰지 않는다(요약·질의응답은 로그인과 무관) |
| `showEvidence(location)` | 근거 출처 단추를 누르면 그 `citation.location`으로 부른다 |
| `publicationId` | 작성자 모드. 회원 토큰(`api.member`)으로 부른다 |
| `itemTitleOf(publishedItemId)`(선택, #559) | 인용 위치의 발행 항목 제목(`PublishedSnapshot.items[].title`)을 돌려준다. 있으면 인용마다 출처 단추 뒤에 제목을 보인다. 넘기지 않거나 그 항목이 사본에 없으면 지금처럼 딱지만 보인다 |

### 출처 딱지 옆 항목 제목 — #559

`CITED` 항목의 인용마다 출처 단추(글자 `sourceLabel`, 누르면 `showEvidence(location)`) 뒤에 그 인용 위치가 속한 발행 항목의 제목을 보이는 글자 `<span data-testid="{testId}-evidence-item-title">`로 둔다. 단추의 글자와 동작은 그대로이고, 제목은 Tab 순서 밖이며 React 글자로만 그린다(보안 점검 「화면 출력」). 기본 요약과 질의응답 항목에 함께 보이고 JD 요약 화면(`JdItemView`)은 그대로다. 제목은 화면에만 쓰고 모델에 보내지 않는다. 승인된 다듬은 화면 interaction-spec에는 답·요약 항목 표시가 없어 대조할 자리가 없다(코드 계획 「근거와 범위」).

### 질의응답 패널의 낭독 안내와 초점 — #543

화면 낭독기 사용자가 초점을 옮기지 않아도 답 준비를 알 수 있게 한다. 방식과 새 문구는 [#543 수정안](https://github.com/JminAILab/CatchU/issues/543#issuecomment-6847847524)을 [2026-11-16 팀장 결정](https://github.com/JminAILab/CatchU/issues/543#issuecomment-6913096102)으로 정했다. 기능 명세(BR8)는 다시 승인하지 않았고, 보이는 화면은 바꾸지 않는다.

- **초점:** 보내는 동안에도 [질문하기] 버튼과 입력란을 `disabled`로 끄지 않는다. 버튼은 `aria-disabled`, 입력란은 `readOnly`로 막고 흐린 모습은 CSS로 같게 그린다. 빈 질문·중복 전송은 제출 처리의 `canSendQuestion` 검사가 막는다. 그래서 입력란이 비어 있어도 Tab이 버튼에 멈추며, 눌러도 요청은 나가지 않는다.
- **알림 자리:** 패널 끝에 보이지 않는 `<p role="status" data-testid="qna-status">` 하나를 처음부터 둔다. 대화 영역·답 목록·답 자리 안내에는 알림 표시를 붙이지 않는다(답 조각마다 읽히거나 같은 문장이 두 번 읽히지 않게). 넣는 말은 `askAnnouncement`(`rag-answer-state.ts`)가 고른다.
- **답 찾기:** 초점은 옮기지 않는다. 대화의 질문 글은 3단계 제목(`<h3 data-testid="qna-question">`)이라, [질문하기] 버튼에서 "이전 제목"으로 가면 가장 최근 질문이고 그 아래가 답이다.

| 상황 | 알림 자리에 넣는 말 |
|---|---|
| 제출함 | 답변을 만들고 있습니다 |
| 답 항목이 1개 이상 오고 끝남 | 답변이 준비됐습니다 |
| 끝났는데 0건 | 발행본에서 이 질문의 근거를 찾지 못했습니다 |
| 도중 실패(일부 항목이 왔어도) | 답을 만들지 못했습니다. 다시 질문해 주세요 |
| 스트림 전 거부(409·429·400·통신 실패) | 비운다. 입력란 아래 기존 `role="alert"` 안내가 읽는다 |
| 화면을 떠나 끊김·링크 접근 상실 | 비운다 |

### 질문 패널의 모양 — 2026-11-26

「발행본에 질문하기」 패널만 홈 소개 화면의 카드 모양에 맞췄다. 이 패널의 스타일은 `rag-answer.module.css`의 `qna*` 클래스에만 두고, AI 요약 패널과 답 항목이 쓰는 클래스(`.panel`·`.heading`·`.notice`·`.items` 등)와 전역 색 변수는 바꾸지 않았다. 답 구조·출처 단추·낭독 안내(#543)는 그대로다.

- **머리글:** 제목 아래 설명 한 줄(`qnaDescription`, `data-testid="qna-description"`)을 둔다.
- **입력란:** 기본 높이는 답 전후가 같고(6rem), 세로 크기 조절은 그대로다.
- **버튼:** 누를 수 있을 때는 `#244ea3` 단색과 흰 글자, 누를 수 없을 때(`aria-disabled`)는 회색 바탕(`--color-line`)과 짙은 회색 글자다. 보내는 동안 글자는 「답변 만드는 중…」(`asking`)이다. 위 #543 절의 「흐린 모습」은 이 모양을 뜻한다.
- **색:** `#244ea3`와 카드 그림자 값은 `.qnaPanel`의 `--qna-action`·`--qna-shadow`에만 둔다. 화면 전체의 색 통일은 이 변경에 넣지 않았다.

## 파일

| 파일 | 역할 |
|---|---|
| `base-summary-panel.tsx` | 'AI 요약' 패널. 화면을 열 때 한 번 읽고 자동으로 다시 확인하지 않는다. 작성자 모드는 DONE·FAILED에서 [다시 만들기]를 보이고 PENDING이면 감춘다 |
| `qna-panel.tsx` | 질의응답 패널. 입력란 500자, 입력란 옆 U2 `<AiNoticeLine />`, 대화는 화면 메모리에만, 최근 6개 전송, 보내는 동안 버튼을 막는다(`aria-disabled`, #543). 낭독 전용 알림 자리와 질문 제목을 둔다. 자료 제외 선택은 없다 |
| `gated-item-view.tsx` | 항목 표시. `CITED`는 인용 원문과 출처 단추(`itemTitleOf`가 있으면 단추 뒤에 항목 제목), `AI_INTERPRETATION`은 'AI 해석' |
| `item-title.ts` | 사본 항목 → 제목 찾기 함수 `itemTitleFinder`, 인용 하나의 제목 `citationItemTitle`(순수, #559) |
| `rag-answer-api.ts` | 요약 GET·[다시 만들기] POST는 `createApiClient`(`recipient()`·`member()`)로, 질문 SSE만 같은 기준 주소 규칙의 직접 `fetch`로 부른다. 응답 모양 검사 |
| `sse-reader.ts` | SSE 덩어리 해석(순수) |
| `rag-answer-state.ts` | 상태·오류 코드 → 안내·버튼(순수) |
| `rag-answer-messages.ts` | 문구 표. 외부 AI 고지는 U2 문구를 쓰므로 여기에 없다 |

## 안내 문구

| 경우 | 문구 |
|---|---|
| 요약 PENDING | AI 요약을 만드는 중입니다. 새로고침하면 다시 확인합니다 |
| 요약 FAILED(받은 사람 / 작성자) | AI 요약이 없습니다 / AI 요약을 만들지 못했습니다 + [다시 만들기] |
| [다시 만들기] 202 / 429 | PENDING 안내로 바꿈 / 오늘 한도에 도달했습니다 |
| 질문 409 / 429 / 400 | 질의응답을 아직 쓸 수 없습니다 / 오늘 한도에 도달했습니다 / 질문은 500자까지 쓸 수 있습니다 |
| `done`까지 항목 0개 | 발행본에서 이 질문의 근거를 찾지 못했습니다 |
| `error` 이벤트·통신 실패 | 받은 항목은 두고 "답을 만들지 못했습니다. 다시 질문해 주세요" |
| 요약 통신 실패·예상 밖 응답 | AI 요약을 불러오지 못했습니다. 새로고침해 주세요 |

## 시험

`test/rag-answer-sse-reader.test.mjs`·`test/rag-answer-state.test.mjs`·`test/rag-answer-api.test.mjs`·`test/rag-answer-item-title.test.mjs`가 `.ts` 순수 함수와 API 함수를 직접 불러 시험한다. `.tsx` 패널은 시험이 불러오지 않아 커버리지 표에 들지 않는다. 다만 `rag-answer-item-title.test.mjs`는 `GatedItemView`를, `rag-answer-qna-panel.test.mjs`는 `QnaPanel`의 처음 그린 모양(알림 자리, 버튼·입력란이 `disabled`가 아님, #543)을 `test/u2-render.mjs`로 변환해 서버 렌더링으로 본다(실제 브라우저 확인이 아니다). 초점·낭독·보내는 중 동작은 서버 렌더링으로 볼 수 없어 브라우저와 화면 낭독기로 따로 확인한다. 화면에 붙인 실제 확인은 통합 확인에서 한다.

```bash
node --test test/rag-answer-sse-reader.test.mjs test/rag-answer-state.test.mjs test/rag-answer-api.test.mjs test/rag-answer-item-title.test.mjs test/rag-answer-qna-panel.test.mjs
node --test --experimental-test-coverage --test-coverage-include='src/features/rag-answer/**' test/rag-answer-sse-reader.test.mjs test/rag-answer-state.test.mjs test/rag-answer-api.test.mjs test/rag-answer-item-title.test.mjs test/rag-answer-qna-panel.test.mjs
```
