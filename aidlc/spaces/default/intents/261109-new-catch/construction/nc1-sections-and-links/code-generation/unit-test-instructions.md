# NC1 칸 제목과 링크 이름 — Unit 시험 안내

## 시험 틀

- **web:** Node 내장 시험 실행기(`node --test`). 지금 `web/test/*.test.mjs`처럼 합성 응답과 서버 렌더링, 원본 tsx를 변환해 부르는 방식을 쓴다. 새 설정·새 의존성은 없다.
- **api:** 지금 실행기 `node scripts/test-with-db.cjs`(`npm --prefix api test -- <파일>`). 시험 DB에 마이그레이션을 적용한 뒤 준 파일만 돌린다. 시험 DB `catchu-db-test`(127.0.0.1:5433, README 「DB 테스트」의 값)가 있어야 한다. 새 설정은 없다.
- worker는 이 Unit에서 바뀌지 않는다.

## 이 Unit의 시험 명령

저장소 맨 위에서 돌린다.

web(공통 함수·내 자산·발행·사본·받은 사람):

```bash
(cd web && node --test test/author-description-sections.test.mjs test/github-link-name.test.mjs test/author-description.test.mjs test/author-description-editor.test.mjs test/assets-description-reload.test.mjs test/assets-api.test.mjs test/assets-view.test.mjs test/repository-options-store.test.mjs test/publish.test.mjs test/publications-owner.test.mjs test/recipient.test.mjs)
```

api(본인 목록·응답 칸·공개 응답 그대로):

```bash
npm --prefix api test -- test/catches/owner-catch-http.test.cjs test/catches/owner-catch-response.test.cjs
```

Step 2(고치기 전 확인)에서는 새 시험 파일 둘(`author-description-sections.test.mjs`, `github-link-name.test.mjs`)을 뺀 web 명령과 위 api 명령을 돌린다.

Step 6에서 고친 `api/test/integration/` 시험이 있으면 그 파일도 같은 api 명령 뒤에 이어 적어 돌리고, 돌린 파일 이름을 `code-summary.md`에 적는다.

## 실패 조건 (먼저 정하는 것)

시험 이름에 수락 기준 번호를 적는다. 아래는 통과하지 않으면 Unit이 끝나지 않는 조건이다.

- 칸: 빈 칸의 칸 제목이 저장된 글에 남는다. 「더 쓰기」만 쓴 글에 칸 제목이 붙는다. 옛 글을 그대로 저장했는데 글이 바뀐다. 4,001자가 저장 요청으로 나간다. 옛 글을 열자마자 「저장하지 않은 변경」이 보인다.
- 링크 이름: 이름이 원래 주소와 다른 곳을 가리킨다. 이름에 제어·방향 바꿈 문자가 보인다. 포트·표 밖 꼴 주소가 이름으로 바뀐다. 텍스트 자료 본문 링크가 이름으로 바뀐다. 링크 대상에서 질의가 빠진다.
- 강조: 이름으로 바꾼 뒤 강조 범위가 다른 글자에 걸린다. 칸 제목 줄이나 이은 칸이 강조된다.
- 목록: 「씀」 조건에 설명 없는 Catch가 나온다. 다른 회원의 Catch가 나온다. 다른 조건의 커서나 v1 커서가 받아들여진다. 공개 Catch 응답·공개 목록에 `hasAuthorDescription`이 나온다.
- 발행: 걸러 보기를 켜면 고른 자료가 빠진다. 체크 칸을 바꿀 때 저장소 목록을 다시 부른다. 저장소 목록 실패로 고르기·발행이 막힌다. 설명 없는 Catch 수 안내가 [발행]을 막는다.
- 화면 출력: 칸 글의 태그 꼴 글이 HTML로 해석된다. 숨긴 빈 칸의 h5가 DOM에 있다.

## 시험 양

Standard 전략: 구성 요소마다 5~8개.

| 구성 요소 | 시험 파일 | 새로 더할 수 |
|---|---|---|
| AuthorDescriptionSections | `web/test/author-description-sections.test.mjs`(새것) | 약 14 |
| GithubLinkName·GithubLink | `web/test/github-link-name.test.mjs`(새것) | 약 16 |
| AssetsScreen(목록) | `web/test/assets-view.test.mjs`, `web/test/assets-api.test.mjs` | 약 10 |
| AssetsScreen(상세·편집) | `web/test/author-description.test.mjs`, `web/test/author-description-editor.test.mjs`, `web/test/assets-view.test.mjs` | 약 12 |
| SnapshotView | `web/test/publications-owner.test.mjs`, `web/test/recipient.test.mjs` | 약 10 |
| PublishScreen | `web/test/publish.test.mjs` | 약 10 |
| Catches(api) | `api/test/catches/owner-catch-http.test.cjs`, `api/test/catches/owner-catch-response.test.cjs` | 약 12 |

경계 시험(통합): api 시험은 실제 PostgreSQL에 HTTP로 부른다(조건·커서·회원 범위·공개 응답). web은 합성 HTTP 응답으로 API 연결부를 본다.

## 커버리지 목표

- 프로젝트 전체 80% 줄 커버리지 기준(Testing Contract)은 Build and Test가 조립된 전체 시험에서 잰다. Unit 명령으로는 판정하지 않는다.
- 새 공통 함수 둘은 이 Unit의 코드이므로 따로 본다. 판정용이 아니라 확인용이며, 다른 명령 뒤에 두지 않는다.

```bash
(cd web && node --test --experimental-test-coverage --test-coverage-include='src/lib/author-description-sections.ts' --test-coverage-include='src/lib/github-link-name.ts' test/author-description-sections.test.mjs test/github-link-name.test.mjs)
```

- 측정 도구를 새로 들이거나 CI 설정을 바꾸지 않는다(팀 규칙).

## 대역과 합성 자료

- web: API는 지금 시험처럼 합성 `transport`·합성 응답으로 바꾼다. 저장소 목록은 `RepositoryApi`의 `repositories`를 합성 함수로 넘기고 부른 횟수를 센다. 외부 네트워크를 쓰지 않는다.
- GitHub 주소는 모두 합성이다(`https://github.com/o/r/…`, `other/lib`). 실제 저장소 주소를 시험에 넣지 않는다.
- api: 지금 `owner-catch-http.test.cjs`의 합성 회원·요청·Catch 만들기 도우미를 쓴다. 작성자 설명은 `author_description`·`author_description_updated_at`을 함께 넣는다(둘이 함께 null이거나 함께 값이 있어야 하는 DB 제약).

## 시험 자료 관리

- web 시험 자료는 각 시험 파일 안에 둔다. 고정 자료 `fixtures.ts`의 `previewCatches`는 미리보기 화면용이고, 시험이 그것에 기대면 `hasAuthorDescription` 값을 함께 확인한다.
- api 시험은 시험마다 새 회원으로 자료를 만들고, 지금 시험의 정리 방식을 따른다.
- 비밀값·실제 사용자 자료·토큰을 시험 자료나 출력에 넣지 않는다.
