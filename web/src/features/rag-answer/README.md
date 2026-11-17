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

## 파일

| 파일 | 역할 |
|---|---|
| `base-summary-panel.tsx` | 'AI 요약' 패널. 화면을 열 때 한 번 읽고 자동으로 다시 확인하지 않는다. 작성자 모드는 DONE·FAILED에서 [다시 만들기]를 보이고 PENDING이면 감춘다 |
| `qna-panel.tsx` | 질의응답 패널. 입력란 500자, 입력란 옆 U2 `<AiNoticeLine />`, 대화는 화면 메모리에만, 최근 6개 전송, 보내는 동안 버튼을 막는다. 자료 제외 선택은 없다 |
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

`test/rag-answer-sse-reader.test.mjs`·`test/rag-answer-state.test.mjs`·`test/rag-answer-api.test.mjs`·`test/rag-answer-item-title.test.mjs`가 `.ts` 순수 함수와 API 함수를 직접 불러 시험한다. `.tsx` 패널은 시험이 불러오지 않아 커버리지 표에 들지 않는다. 다만 `rag-answer-item-title.test.mjs`는 `GatedItemView`를 `test/u2-render.mjs`로 변환해 서버 렌더링으로 제목 자리·단추 글자·단추 동작을 본다(실제 브라우저 확인이 아니다). 화면에 붙인 실제 확인은 통합 확인에서 한다.

```bash
node --test test/rag-answer-sse-reader.test.mjs test/rag-answer-state.test.mjs test/rag-answer-api.test.mjs test/rag-answer-item-title.test.mjs
node --test --experimental-test-coverage --test-coverage-include='src/features/rag-answer/**' test/rag-answer-sse-reader.test.mjs test/rag-answer-state.test.mjs test/rag-answer-api.test.mjs test/rag-answer-item-title.test.mjs
```
