# Frontend Components — u4-privacy-policy

새 부품은 없다. 지금 부품 셋의 글자만 바꾼다. 바꿀 글은 `functional-spec.md` 「확정 문구」 C1~C5다.

## 부품과 바꾸는 곳

| 파일 | 지금 그리는 방식(지금 코드 확인) | 바꾸는 것 |
|---|---|---|
| `web/src/app/(guest)/privacy/page.tsx` | 주소 `/privacy`와 문서 제목(원문 제목 「CatchU 개인정보 처리방침」). 비로그인 헤더 묶음 `(guest)` | 없음 |
| `web/src/features/privacy/privacy-policy.tsx` | 원문 글을 React 텍스트로 직접 적어 그린다. 표 줄은 `<tr>` 안 `<td>` 셋(첫 줄은 `<th>`), 목록은 `<ul>` 안 `<li>`. 마크다운을 해석하지 않는다 | C1: 「자료·JD를 올리고 발행할 때」 줄 둘째 `<td>` 글. C2·C3: 2번 `<ul>`의 첫째·둘째 `<li>` 글. C4: 5번 「하나씩 지우기」 `<li>` 글. C5: 9번 `<ul>`의 「이 방침은 2026년 11월 16일부터 적용합니다.」 `<li>` 바로 다음에 새 `<li>` 하나 |
| `web/src/features/privacy/privacy-policy.md` | 원문 사본. 화면은 이 파일을 읽지 않고, 시험만 읽어 화면과 대조한다 | C1~C5를 같은 글자로 |
| `web/src/features/privacy/privacy-policy.module.css` | 읽기 폭과 표 모양, 좁은 폭에서 칸 안 줄바꿈 | 없음 |

화면에 보이는 글자다. 화면 낭독기 전용 글자, 링크, 강조는 없고 더하지 않는다. 바뀐 표 칸은 글이 조금 길어질 뿐이고, 좁은 폭에서는 지금 CSS가 칸 안에서 줄을 바꾼다.

## 시험과 안내

| 파일 | 바꾸는 것 |
|---|---|
| `web/test/privacy-policy.test.mjs` | 머리 주석의 원문 출처를 이 단위의 `functional-spec.md` 「확정 문구」와 C5 날짜로, `SOURCE_SHA256`을 새 사본 값으로. 대조 방식은 그대로 |
| `web/src/features/privacy/README.md` | 「근거」의 출처를 같은 문서로. #496 확정 문구는 앞 판본 기록으로 남긴다 |

## 상태·입력·API

없다. 이 화면은 입력을 받지 않고 api를 부르지 않는다.

## 확인

- `npm --prefix web test`의 `test/privacy-policy.test.mjs`가 화면과 사본의 글자·순서를 대조하고 SHA-256을 본다.
- 표 배치는 지금 README의 확인대로 브라우저에서 320px 폭까지 가로 넘침이 없는지 본다.
