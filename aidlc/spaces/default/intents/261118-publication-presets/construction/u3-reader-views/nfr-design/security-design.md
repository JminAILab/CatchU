# Security Design — u3-reader-views

근거: NFR 요구 `construction/u3-reader-views/nfr-requirements/security-requirements.md`(NFR3.1·NFR3.2, NFR4.1~NFR4.3, NFR1.1)와 그 검토 review-01, 기능 설계 `functional-design/`(rules BR1·BR2·BR4·BR5, 검토 review-01 Major 1·Minor 1·2), 계약 `inception/contract-design/contract-summary.md` P-3, 다듬은 화면 `inception/refined-mockups/interaction-spec.md`, `docs/CatchU_security_checks.md` 「화면 출력」, 지금 코드 `web/src/features/recipient/recipient-api.ts`(`readPublishedSnapshot`·`pickItem`), `web/src/features/publications/publications-api.ts`(`isPublishedItem`), `web/src/features/recipient/recipient-view.tsx`(`RecipientSlots`).

## 1. 응답 해석 (NFR4.1·NFR4.2, 기능 설계 검토 Major 1)

```text
isPublishedItem(item)                       // 작성자 상세와 받은 사람이 함께 씀
  presetOrdinal: 정수 1~5
  presetName: 앞뒤 공백을 뺀 길이가 1 이상인 글자   // 빈 이름은 어긋남(NFR 요구 검토 Minor 1)
  나머지: 지금 검사 그대로
pickItem(item)                              // recipient-api.ts
  지금 옮기는 칸 + presetOrdinal + presetName 만 옮김
  isFirstCopy·원본 ID·그 밖의 칸은 옮기지 않음
```

- 받은 사람 열람은 `pickItem`이 칸을 골라 옮기므로 두 칸을 여기에 더해야 탭을 그릴 수 있다. 작성자 상세는 응답 객체를 그대로 쓰지만 같은 검사를 거친다.
- 같은 `presetOrdinal` 안에서 `presetName`이 서로 다르면(U1이 막는 경우라 정상 응답에서는 없음) 그 묶음의 첫 항목(가장 작은 `position`) 이름을 탭 이름으로 쓴다. 응답을 거부하지 않는다(NFR 요구 검토 Minor 1).
- 어긋난 응답은 지금처럼 조회 실패 화면이다.

## 2. 화면 출력 (NFR3.1·NFR3.2)

- 프리셋 이름은 탭 글자, 탭 아래 이름 전체, 알림 글 「(이름) 탭을 열었습니다」에 React 자식 글자로만 넣는다. 알림 글은 이름과 고정 글을 글자 조각으로 이어 그린다.
- 탭·패널 id는 `${idPrefix}-tab-${presetOrdinal}`·`${idPrefix}-panel-${presetOrdinal}`로 만들고 이름을 넣지 않는다. 항목 id는 지금 `publishedItemDomId(publishedItemId)`다.
- 시험: `<b>x</b>`·`<img src=x onerror=alert(1)>` 이름이 탭·이름 줄·알림에서 글자 그대로이고 태그가 그려지지 않는다. id에 이름이 없다.

## 3. 접근성 (NFR1.1, interaction-spec TabStrip·SourceJump)

| 요소 | 설계 |
|---|---|
| 탭 줄 | `role="tablist"`, `aria-label`(「발행본 자료」·「자료 종류」) |
| 탭 | `role="tab"`, `aria-selected`, `aria-controls`, 열린 탭만 `tabIndex=0`(나머지 -1). 키: 왼쪽·오른쪽(끝에서 돎)·Home·End는 바꾸기를 요청하고 바뀌었을 때만 초점을 옮김(Q1 A), Enter·Space·누름은 바꾸기 요청 |
| 패널 | `role="tabpanel"`, `aria-labelledby`, `tabIndex=0`(패널 안에 초점 요소가 없어도 Tab으로 패널에 닿도록, 기능 설계 검토 Minor 1), 열리지 않은 패널 `hidden` |
| 출처 이동 알림 | 탭 줄 근처에 늘 그려 둔 `aria-live="polite"` 칸 |
| 돌아가기 | 없음 |

## 4. 받은 사람 화면 자리 나누기 (기능 설계 검토 Minor 2)

지금 `RecipientSlots`는 2번(AI 요약)·3번(질문하기)·4번(JD 요약) 자리를 한꺼번에 그린다. AI 요약을 발행본 자료 위로 올리려고 2번 자리만 따로 그리는 부품과 3·4번을 그리는 부품으로 나눈다. 각 패널이 받는 값(`token`·`getGrant`·`onAccessLost`·`showEvidence`·`key`)은 그대로라, 접근 상실·grant 처리는 바뀌지 않는다.

## 5. 기록 남기지 않기 (NFR4.3)

이 단위가 만들거나 고치는 모든 web 파일(TabStrip, 사본 보기, 출처 이동 함수, 받은 사람·상세 화면, 응답 해석 두 곳, 자료 화면)에서 프리셋 이름·자료 제목을 `console`·오류 보고에 넘기지 않는다. 코드 생성의 검토가 바뀐 파일 전부에서 새 `console.` 호출을 찾아 본다.

## Assumptions & Open Questions

None.

## Sources

- NFR 요구 `security-requirements.md`, 검토 review-01(Minor 1)
- 기능 설계 rules, 검토 review-01(Major 1, Minor 1·2)
- 계약 P-3, interaction-spec TabStrip·SourceJump
- `docs/CatchU_security_checks.md` 「화면 출력」
- 지금 코드 `recipient-api.ts`, `publications-api.ts`, `recipient-view.tsx`
