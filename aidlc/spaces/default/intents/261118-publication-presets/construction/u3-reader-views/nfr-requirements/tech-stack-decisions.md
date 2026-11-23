# Tech Stack Decisions — u3-reader-views

근거: 요구사항 `inception/requirements-analysis/requirements.md` Constraints(지금 스택, 새 라이브러리 없음, 탭은 자료 화면 탭 부품을 고쳐 다시 씀 C-T1·C-T2), 코드 지식 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`, 기능 설계 `construction/u3-reader-views/functional-design/frontend-components.md`, 팀 관행 `team.md` Testing Posture.

새 기술은 들이지 않는다.

| 영역 | 고른 것 | 이유 |
|---|---|---|
| 탭 부품 | 자료 화면의 `MaterialsTabs`를 일반 부품 TabStrip으로 바꿔 세 화면이 씀. 탭 라이브러리를 들이지 않음 | C-T1·C-T2 |
| 말줄임 | CSS `text-overflow: ellipsis`(최대 폭 16em) | 기능 설계 Q1 A. 글자를 자르지 않아 화면 낭독기에 전체가 읽힘 |
| 출처 이동 | 지금 받은 사람 화면·작성자 상세의 `useState`·`useEffect` 방식을 공용 함수로 묶음 | 지금 동작(초점·스크롤)을 그대로 씀 |
| 시험 | 지금 web `node --test`와 `test/u2-render.mjs` 서버 렌더링, 순수 함수 단위 시험(묶기·키 처리·출처 대상) | 새 도구 없음. 커버리지는 `npm --prefix web run test:coverage` |

## 하지 않는 것

- 브라우저 끝까지 잇는 시험 도구(지금 없음). 키보드·초점·320px 폭은 사람이 로컬 브라우저에서 확인한다.
- 모양 다듬기(팀원 3).

## Assumptions & Open Questions

None.

## Sources

- 이 단계 전제 확인 `nfr-requirements-questions.md`(2026-11-20 팀장 A)
- 요구사항 Constraints
- `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 기능 설계 `frontend-components.md`
- `team.md` Testing Posture
