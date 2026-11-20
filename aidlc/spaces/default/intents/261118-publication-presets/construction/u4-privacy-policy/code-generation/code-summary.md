# Code Summary — u4-privacy-policy

근거: 승인된 계획 `code-generation-plan.md`(Step 1~10), 시험 안내 `unit-test-instructions.md`, 기능 설계 `functional-design/functional-spec.md` 「확정 문구」 C1~C5(C5 날짜는 2026-11-20 팀장 답 30일).

## 바꾼 파일

| 파일 | 바꾼 것 |
|---|---|
| `web/src/features/privacy/privacy-policy.md` | 13·23·24·56행을 C1~C4로, 83행 다음에 C5 줄(2026년 11월 30일). 84행 → 85행, 줄 끝 LF |
| `web/src/features/privacy/privacy-policy.tsx` | 같은 글자로 C1(1번 표 둘째 `<td>`), C2·C3(2번 첫째·둘째 `<li>`), C4(5번 「하나씩 지우기」 `<li>`), C5(9번 시행일 `<li>` 다음 새 `<li>`). 태그 구조·CSS·링크·강조는 그대로 |
| `web/test/privacy-policy.test.mjs` | 머리 주석의 원문 출처를 U4 기능 설계 「확정 문구」와 C5 날짜로, `SOURCE_SHA256`을 `3224f6c899ea3a00506e920cb911c0beb7083c28f76afaa0af333c3b35eb9346`(앞 값 `83f9a28e…`)로, 첫 시험 이름을 「원문 사본은 확정 문구 그대로다(SHA-256)」로, 목록 항목 수 기대값 33 → 34와 그 주석. 대조 방식은 그대로 |
| `web/src/features/privacy/README.md` | 「근거」를 U4 기능 설계 「확정 문구」로, #496 결정·확정 문구 댓글은 「앞 판본의 기록」으로. 「검사」의 SHA-256 문장을 새 출처로 |

바꾸지 않은 것: 4번 외부 AI 절, 11월 16일 시행일 줄, `web/src/app/(guest)/privacy/page.tsx`, `privacy-policy.module.css`.

## 주요 판단

- 새 시험을 더하지 않았다. 지금 시험 5건의 차례·글자 대조가 C1~C5를 잡고, 기능 설계가 새 대조 방식을 더하지 말라고 했다.
- C5가 9번 절에 `<li>` 하나를 더해 원문에서 뽑은 목록 항목 수가 34가 된다. 기대값만 바꿨다(팀장 계획 수정 요청, U4 기능 설계 검토의 Major).

## 사본과 확정 문구의 차이 확인(Step 7)

- `git diff -- web/src/features/privacy/privacy-policy.md`의 차이는 다섯 곳뿐이다: 바뀐 줄 넷(13·23·24·56행)과 새 줄 하나(84행).
- 각 줄을 functional-spec 「확정 문구」 표의 새 글(`○○` → `30`)과 대조해 글자 그대로 같다(C1=13행, C2=23행, C3=24행, C4=56행, C5=84행). 85행은 「- 방침이 바뀌면 이 페이지에 바뀐 날짜와 내용을 적습니다.」로 차례도 맞다.

## 시험

명령: `(cd web && node --test test/privacy-policy.test.mjs)`

| 시점 | 결과 |
|---|---|
| 바꾸기 전(Step 2 기준선) | 5건 통과, 0건 실패 |
| 바꾼 뒤(Step 8) | 5건 통과, 0건 실패 |

## 이 단계에서 돌리지 않은 시험

- 범위(mvp)의 80% 줄 커버리지(`npm --prefix web run test:coverage`)와 Unit 확인 명령 전체(api·web 검사·빌드): Unit 확인과 Build and Test에서 돈다.
- 브라우저 320px 폭 가로 넘침 확인: 브라우저가 필요해 Build and Test에서 한다(frontend-components 「확인」).

## 계획과 다른 점

- 없음.

## 남는 것

- C5 날짜 30일은 main 배포일이다. 30일에 main 배포가 안 되면 사본·화면·SHA-256을 함께 다시 고쳐야 한다.
- `privacy-policy.tsx` 머리 주석의 「(#496). 글은 팀장 확정 문구 그대로이며」는 계획에 고칠 곳으로 없어 그대로 두었다. 틀린 말은 아니지만, 출처를 맞추려면 손볼 후보다.
