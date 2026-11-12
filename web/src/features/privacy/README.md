# 개인정보 처리방침 (`/privacy`, #496)

로그인 없이 여는 개인정보 처리방침 화면이다. 첫 화면(`/`) 바닥글의 [개인정보 처리방침] 링크가 이 주소로 오고, Google 로그인 앱 Branding에 적는 방침 주소다([#496](https://github.com/JminAILab/CatchU/issues/496)).

## 근거

- 글·주소: [#496 팀장 결정](https://github.com/JminAILab/CatchU/issues/496#issuecomment-6788199337)(2026-11-11)과 [고친 확정 문구](https://github.com/JminAILab/CatchU/issues/496#issuecomment-6810581294)(2026-11-12). 고친 댓글의 「개인정보 처리방침 확정 문구(2026-11-12 수정)」 접힌 칸을 그대로 싣고, 표는 표로·제목 단계도 그대로 둔다. 주소는 `/privacy`다. 앞 결정 댓글의 확정 문구는 기록으로 남아 있다.
- 같은 폴더의 `privacy-policy.md`가 그 접힌 칸을 글자 그대로 옮긴 원문 사본이다.

## 구성

| 파일 | 내용 |
|---|---|
| `src/app/(guest)/privacy/page.tsx` | 주소와 문서 제목(원문 제목). 비로그인 헤더 묶음 `(guest)`에 두어 회원 경로 가드 없이 열린다 |
| `privacy-policy.tsx` | 본문. 원문의 `#`·`##`는 h1·h2, 문단·목록·표(첫 줄은 머리 칸)·코드 표시는 그대로이고, 표 칸 안의 `<br>`은 줄바꿈이다 |
| `privacy-policy.module.css` | 읽기 폭과 표 모양. 좁은 폭에서는 칸 안에서 줄을 바꿔 표가 화면 밖으로 넘치지 않게 한다 |

## 지키는 것

- 원문에 없는 문장·링크·강조를 더하지 않는다. 메일 주소도 링크 없이 글자로 둔다.
- 글은 React 텍스트로만 그린다. 화면에서 마크다운을 해석하거나 HTML 문자열을 넣지 않는다([보안 점검](../../../../docs/CatchU_security_checks.md) 「화면 출력」).
- 글을 바꿀 때(예: 팀장이 알려 준 시행일)는 `privacy-policy.md`와 `privacy-policy.tsx`를 함께 고치고, 시험에 적은 원문 출처와 SHA-256도 바꾼 글에 맞춘다.

## 검사

- `npm test`의 `test/privacy-policy.test.mjs`가 화면의 제목 단계·문단·목록 항목·표 칸·코드 표시·줄바꿈을 원문 사본과 같은 순서·글자로 대조하고, 사본이 확정 문구 그대로인지(SHA-256), 첫 화면 바닥글이 `/privacy`로 링크하는지 본다.
- 표 배치는 브라우저에서 320px 폭까지 가로 넘침이 없는지 본다.
