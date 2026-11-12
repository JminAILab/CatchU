# NC2 면접관 사본 칸과 표지 — Unit 시험 안내

## 시험 틀

- **web:** Node 내장 시험 실행기(`node --test`). 지금 `web/test/*.test.mjs`처럼 합성 응답과 서버 렌더링, 원본 tsx를 변환해 부르는 방식을 쓴다. 새 설정·새 의존성은 없다.
- **api:** 지금 실행기 `node scripts/test-with-db.cjs`(`npm --prefix api test -- <파일>`). 시험 DB에 마이그레이션을 적용한 뒤 준 파일만 돌린다. 시험 DB `catchu-db-test`(127.0.0.1:5433, README 「DB 테스트」의 값)가 있어야 한다. 새 설정은 없다.
- worker는 이 Unit에서 바뀌지 않는다. api 시험 하나가 `worker/app/candidates/build.py` 글자를 읽기만 한다.

## 이 Unit의 시험 명령

저장소 맨 위에서 돌린다.

web(표지 판정·사본 보기·받은 사람·작성자 발행본):

```bash
(cd web && node --test test/github-link-name.test.mjs test/publications-owner.test.mjs test/recipient.test.mjs test/publish.test.mjs)
```

api(발행 사본 칸·안전망 로그·문장 대조·AI 재료·지시):

```bash
npm --prefix api test -- test/publications/publish-api.test.cjs test/publications/publications-logging.test.cjs test/publications/work-limit-sentences.test.cjs test/published-index/chunker.test.cjs test/rag-answer/summary-sources.test.cjs test/rag-answer/qna-controller.test.cjs test/rag-answer/base-summary-handler.test.cjs test/jd/jd-summary.test.cjs
```

Step 2(고치기 전 확인)에서는 새 시험 파일(`test/publications/work-limit-sentences.test.cjs`)을 뺀 api 명령과 위 web 명령을 돌린다.

Step 4에서 사본 만들기 순수 함수 시험을 새 파일로 두면, 그 파일도 같은 api 명령 뒤에 이어 적어 돌리고 파일 이름을 `code-summary.md`에 적는다.

## 실패 조건 (먼저 정하는 것)

시험 이름에 수락 기준 번호를 적는다. 아래는 통과하지 않으면 Unit이 끝나지 않는 조건이다.

- 사본 칸: 새 사본에 저장소 이름이 없거나 등록과 다르다. 작성 달이 UTC 기준으로 정해진다(2026-11-30T16:00Z가 "2026-11"). 설명 없는 Catch에 작성 달이 담긴다. 같은 한계 문장이 두 번 담긴다. 근거별 조회 상태 문장이 담긴다. 한계 없는 Catch에 빈 `workLimits`가 담긴다.
- 본인 커밋: 병합 커밋·PR·이슈 근거, 다른 Catch나 다른 회원에 속한 커밋, 다른 저장소의 같은 식별값에 `ownCommit`이 참이다.
- 안전망: 저장소 이름을 못 읽으면 발행이 실패한다. 롤백된 발행에 경고 줄이 남는다. 경고 줄에 저장소 이름·제목·글이 실린다.
- 문장 대조: worker 원본 한 문장만 바꿨는데 시험이 통과한다. 실패 메시지에 바뀐 상수 이름과 `worker/app/candidates/build.py`·`api/src/publications/work-limit-sentences.ts`를 함께 고치라는 말이 없다.
- AI 재료: 조각·요약 근거에 새 칸 값이나 「이 작업의 본인 커밋」이 나온다. 근거 딱지가 둘이 아니다. 세 지시 가운데 하나라도 문장이 붙지 않았다.
- 화면: 옛 사본이 오류를 내거나 모양이 바뀐다. 모양 틀린 새 칸이 받아들여진다. 받은 사람 화면에서 새 칸이 빠진다. 표지가 링크 요소 안에 있거나 초점을 받는다. 맞지 않는 링크에 어떤 표지든 붙는다. 작성자가 쓴 흉내 글이 표지 모양이다. 한계 목록이 접힘 안에 있다. 태그 꼴 글이 HTML로 해석된다.

## 시험 양

Standard 전략: 구성 요소마다 5~8개.

| 구성 요소 | 시험 파일 | 새로 더할 수 |
|---|---|---|
| Publications(사본 칸·안전망) | `api/test/publications/publish-api.test.cjs`, `publications-logging.test.cjs`, 사본 만들기 순수 함수 시험 | 약 12 |
| 한계 문장 상수(C6) | `api/test/publications/work-limit-sentences.test.cjs`(새것) | 약 5 |
| PublishedIndex·RagAnswer·JD 요약 | `api/test/published-index/chunker.test.cjs`, `api/test/rag-answer/summary-sources.test.cjs`, `qna-controller.test.cjs`, `base-summary-handler.test.cjs`, `api/test/jd/jd-summary.test.cjs` | 약 6 |
| GithubLinkName(표지 판정) | `web/test/github-link-name.test.mjs` | 약 9 |
| SnapshotView·RecipientScreen | `web/test/recipient.test.mjs`, `web/test/publications-owner.test.mjs` | 약 13 |

경계 시험(통합): api 발행 시험은 실제 PostgreSQL에 HTTP로 부른다(저장소 등록·소속 기록·회원 범위). web은 합성 HTTP 응답으로 API 연결부를 본다. `web/test/publish.test.mjs`는 고치지 않지만 사본 형이 바뀌므로 함께 돌려 그대로 통과하는지 본다.

## 커버리지 목표

- 프로젝트 전체 80% 줄 커버리지 기준(Testing Contract)은 Build and Test가 조립된 전체 시험에서 잰다. Unit 명령으로는 판정하지 않는다.
- 이 Unit의 새 파일은 확인용으로 따로 본다. 판정용이 아니며, 다른 명령 뒤에 두지 않는다.

```bash
(cd web && node --test --experimental-test-coverage --test-coverage-include='src/lib/github-link-name.ts' test/github-link-name.test.mjs)
```

- 측정 도구를 새로 들이거나 CI 설정을 바꾸지 않는다(팀 규칙).

## 대역과 합성 자료

- web: API는 지금 시험처럼 합성 `transport`·합성 응답으로 바꾼다. 외부 네트워크를 쓰지 않는다.
- GitHub 주소와 식별값은 모두 합성이다(`https://github.com/o/r/commit/ba6bba8c…`, `other/lib`). 실제 저장소 주소를 시험에 넣지 않는다.
- api: 지금 `publish-api.test.cjs`의 합성 회원·분석 요청·저장소 등록·Catch 만들기 도우미를 쓰고, 소속 기록(`commit_assignment`) 행과 `catch_evidence.coverage_limits`·`author_description_updated_at`을 함께 넣는다(작성자 설명과 시각은 함께 null이거나 함께 값이 있어야 하는 DB 제약).
- AI 호출은 지금 시험의 합성 게이트를 쓰고 실제 Claude를 부르지 않는다.

## 시험 자료 관리

- web 시험 자료는 각 시험 파일 안에 둔다.
- api 시험은 시험마다 새 회원으로 자료를 만들고, 지금 시험의 정리 방식을 따른다.
- 비밀값·실제 사용자 자료·토큰을 시험 자료나 출력에 넣지 않는다.
