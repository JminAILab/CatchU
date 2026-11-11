# NC1 칸 제목과 링크 이름 — 기술 스택 결정

입력:
- 기능 설계 `construction/nc1-sections-and-links/functional-design/`(rules.md, frontend-components.md)
- 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`(커밋 `a1d0fbb4` 기준)
- 이 단계의 답 `nfr-requirements-questions.md`(Q1 A)

## 결정

NC1은 새 라이브러리, 새 서비스, 새 DB 칸, 마이그레이션을 더하지 않는다. 지금 판본을 그대로 쓴다.

| 대상 | 쓰는 것 | 까닭 |
|---|---|---|
| web 화면 | Next.js 16.4.1, React 19.2.8, CSS 모듈(지금 `assets.module.css`·발행 화면 모듈) | 지금 화면을 고치는 Unit이다. h5 모양은 CSS 모듈에 줄 하나를 더한다(BR7.6). |
| web 공통 함수 | TypeScript 표준 기능만(`String`·`Array.from`·`URL`·`decodeURIComponent`) | 칸 나누기는 줄 단위 글자 대조, 글자 수는 `Array.from(value).length`(코드 포인트, api와 같음), 위치는 문자열 길이(UTF-16)다. 링크 이름은 `URL`로 경로와 질의를 가르고 마디마다 `decodeURIComponent`를 감싸 실패하면 원문을 쓴다(BR2.5). 파서·마크다운 라이브러리를 들이지 않는다. |
| api 목록 | NestJS 12.0.4, TypeORM 1.1.1의 원본 SQL 질의, PostgreSQL 16 | 지금 `owner-catch-store.ts`의 매개변수 질의에 고정 조건 하나를 더한다. 색인은 더하지 않는다(Q1 A). |
| api 입력 검사 | 지금 `owner-catch-input.ts`의 손으로 쓴 검사(`object(input, [...])`, `BadRequestException`) | 지금 목록 질의 키 검사와 같은 방식으로 `authorDescription`을 더한다. `class-validator`로 바꾸지 않는다. |
| 커서 | 지금 커서 부호화와 범위 해시(sha256) | 판본만 `v: 2`로 올리고 범위에 조건 하나를 넣는다(C1). |
| 시험 | web `node:test`(`web/test/*.test.mjs`)와 지금 화면 시험 방식, api 지금 시험 틀, 커버리지는 각 서비스 `test:coverage` | 팀 규칙대로 측정 도구를 따로 들이지 않는다(team.md 「Testing Posture」). |

## 고르지 않은 안

- **마크다운 제목 줄과 마크다운 렌더러:** 칸 제목 줄은 겹낫표 줄로 정했고(기능 설계 Q1 A), 화면은 React 텍스트로만 그린다. HTML을 만드는 렌더러는 보안 점검 「화면 출력」에 어긋난다.
- **부분 색인:** 지금 이용자 규모에서는 차이를 잴 수 없고 마이그레이션만 늘린다(Q1 B를 고르지 않음).
- **링크 이름을 api에서 계산:** 화면에서만 계산해야 AI 재료와 저장된 글이 바뀌지 않는다(BR2.8, NFR2.1).

## Sources

- `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- `construction/nc1-sections-and-links/functional-design/rules.md`(BR2.5, BR2.8, BR5.1, BR5.2, BR7.6), `frontend-components.md`
- `inception/contract-design/contract-summary.md` C1
- `nfr-requirements-questions.md` Q1 A
- 지금 코드: `api/src/catches/owner-catch-input.ts`, `api/src/catches/owner-catch-store.ts`, `web/src/features/assets/author-description-panel.tsx`, `web/test/`
