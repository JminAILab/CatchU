# Integration Test Instructions — 261118-publication-presets

근거: 시험 전략 Standard, 네 단위의 `unit-test-instructions.md`, 계약 `inception/contract-design/contract-summary.md`(P-1 프리셋 경로, P-2 발행, P-3 사본 칸), U1 시험 `api/test/integration/preset-publish-chain.test.cjs`.

## 경계와 시험

| 경계 | 무엇을 보나 | 시험(실행 위치) |
|---|---|---|
| api 프리셋 저장 → 발행 → 사본 → 받은 사람 열람 | 프리셋 둘로 발행하면 사본 항목에 `presetOrdinal`·`presetName`이 붙고, 받은 사람 응답에 원본 ID·`isFirstCopy`가 없다 | `api/test/integration/preset-publish-chain.test.cjs`(Node, 실제 PostgreSQL 5433) |
| api 발행 막힘 → web 응답 해석 → 발행 화면 안내 | `details.blockedSources` 세 칸이 web으로 옮겨져 막힘 안내에 쓰인다 | `api/test/publications/publish-presets.test.cjs`(Node+DB), `web/test/api-response.test.mjs`·`web/test/publish.test.mjs`(Node, 서버 렌더링) |
| api 본인 Catch 목록 `publishable=true` → web 고르기 목록 | 발행할 수 있는 Catch만 오고 커서가 조건을 지킨다 | `api/test/catches/publishable-filter.test.cjs`·`owner-catch-http.test.cjs`(Node+DB), `web/test/presets.test.mjs`(Node) |
| 사본 응답(U1 칸) → web 응답 검사 → 탭 화면(U3) | 칸이 없거나 어긋나면 조회 실패, 있으면 순번별 탭 | `web/test/reader-tabs.test.mjs`·`recipient.test.mjs`·`publications-owner.test.mjs`(Node, 서버 렌더링) |
| 사본 칸을 쓰는 다른 기능(요약·질의응답·받은 링크 읽기·JD) | 새 칸을 넣은 사본으로 기존 기능이 그대로 돈다 | U1 회귀 묶음(`unit-test-instructions.md` 둘째 명령), `web/test/jd-recipient-binding.test.mjs`·`u9-recipient-claude.test.mjs` |

## 명령

각 단위 `unit-test-instructions.md`의 명령을 그대로 쓴다(Build and Test가 한 번씩 돌림). api 명령은 `TEST_DB_PORT=5433`이 필요하다.

## 브라우저에서만 볼 수 있는 것

아래는 Node 서버 렌더링으로는 볼 수 없어, 실제 브라우저(로그인한 회원·받은 링크)에서 사람이 확인한다. 이 기계의 Build and Test는 로그인(Google)을 자동으로 할 수 없어 돌리지 않았다.

| 단위 | 확인 |
|---|---|
| U2 | 첫 저장(201) 뒤 주소가 `/presets/{id}`로 바뀌어도 화면이 다시 불러오지 않고 고치기 상태가 된다. 담기·순서 바꾸기 뒤 초점. 320px 폭에서 머리글 메뉴(「프리셋」)가 넘치지 않는다 |
| U3 | 출처가 다른 탭이면 그 탭이 열리고 대상 항목에 초점·스크롤. 숨긴 패널이 보이지 않는다. 탭을 오가도 열어 둔 PDF를 다시 받지 않는다(개발자 도구 네트워크). 320px 폭에서 탭이 다음 줄로 넘어간다. 자료 화면에서 저장하지 않은 입력이 있을 때 확인 창을 거절하면 초점이 「텍스트 자료」 탭에 남는다 |
| U4 | `/privacy` 본문이 사본과 같게 보인다(서버 렌더링 시험이 글자를 대조함) |

## 시험 자료

DB 시험은 시험이 직접 회원·Catch·자료를 만든다. 실제 회원 자료를 쓰지 않는다.
