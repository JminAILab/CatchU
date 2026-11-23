# Unit Test Instructions — u2-applicant-screens

근거: `code-generation-plan.md`(Testing Contract, Step 1·Step 2·Step 8·Step 9·Step 11), 기능 설계 `functional-design/functional-spec.md` 「시나리오」·`rules.md` BR1~BR5, NFR 요구 `nfr-requirements/`, NFR 설계 `nfr-design/`.

## 실행기와 준비

- web: Node 내장 시험 실행기(`node --test`), 서버 렌더링은 `web/test/u2-render.mjs`. 새 도구·설정 없음. 미리 `npm --prefix web ci`.
- api: `api/scripts/test-with-db.cjs`(인자로 준 파일만, 마이그레이션 먼저 적용). pgvector가 있는 로컬 시험 DB 5433을 쓰도록 `TEST_DB_PORT=5433`을 붙인다(`api/.env`의 5435에는 pgvector가 없다).
- 외부 호출 없음. web 시험은 `api.member` 대신 기록용 가짜 호출을 넣어 요청 수·쿼리·응답 순서를 정한다.

## 이 단위 명령

web(이 단위가 만들거나 고치는 시험):

```bash
(cd web && node --test test/presets.test.mjs test/publish.test.mjs test/api-response.test.mjs)
```

api:

```bash
TEST_DB_PORT=5433 npm --prefix api test -- test/catches/publishable-filter.test.cjs test/catches/owner-catch-http.test.cjs
```

Step 1 기준선(바꾸기 전 트리, 지금 있는 파일만):

```bash
(cd web && node --test test/publish.test.mjs test/api-response.test.mjs)
```

```bash
TEST_DB_PORT=5433 npm --prefix api test -- test/catches/owner-catch-http.test.cjs
```

## 기대 커버리지

- 범위(mvp)의 80% 줄 커버리지는 Build and Test가 전체 시험(`npm --prefix web run test:coverage`, `npm --prefix api run test:coverage`)으로 잰다. 위 단위 명령은 문턱을 판정하지 않는다. 문턱 설정을 바꾸지 않는다.
- 이 단위의 새 web 파일(`src/features/presets/`)은 `presets.test.mjs`가 화면 모델과 서버 렌더링으로 덮는다.

## 시나리오(Step 2에서 시험 코드보다 먼저 확정)

| 묶음 | 시나리오 | 기대 결과 | 실패 조건 |
|---|---|---|---|
| 메뉴 | 회원 화면, `/presets`·`/presets/new`·`/presets/{id}` | 「내 자산 · 텍스트 자료 · 프리셋 · 발행본 · JD 관리」, 「프리셋」만 `aria-current` | 「발행본」도 켜짐 |
| 목록 | 3개·50개·0개·실패·불러오는 중 | 모두 한 번에 / 0개 안내 / 실패 안내와 [다시 불러오기] / 불러오는 글 | 실패가 0개로 보임 |
| 목록 | `unpublishableCount 1`, `overLimit` | 「발행할 수 없는 자료 1개」「상한을 넘었습니다」 글자, 쉼표 글자 수 | 표시 없음 |
| 목록 | 50개 | [새 프리셋] 단추 `disabled`와 안내 | 막히지 않음 |
| 목록 | `<b>x</b>` 이름 | 글자 그대로, <고치기> 읽히는 이름 「(이름) 고치기」 | 태그로 그려짐 |
| 편집 | 열기(고치기·새) | 요청 수: 상세 1(고치기만) + 저장소 목록 1 + 목록 3 + 세기 ≤ 3 | 수가 다름 |
| 편집 | Catch 목록 요청 | `publishable=true`, 걸러 보기 켜면 `authorDescription=written`도 | 조건 빠짐 |
| 편집 | 같은 단추 두 번 | 담겼다가 빠짐, `aria-pressed` 바뀜 | 두 번 담김 |
| 편집 | 20개 담음 | 안 담긴 단추 막힘·「항목은 20개까지 담을 수 있습니다」 | 21개째 |
| 편집 | 담으면 60,000자 넘음 | 막힘·「전체 글이 60,000자를 넘습니다」 | 담김 |
| 편집 | 세기 실패·늦음 | 단추 먼저 그림, 글자 이유 없음, 담으면 「글자 수를 세지 못했습니다」 | 단추 모두 막힘 |
| 편집 | 걸러 보기를 바꾼 뒤 옛 목록·옛 세기 응답이 늦게 옴 | 버려짐 | 옛 목록이 덮어씀 |
| 편집 | 셋째 [위로], 첫째·끝 | 둘째로, 첫 [위로]·끝 [아래로] 막힘 | 순서 어긋남 |
| 편집 | 상세 이유 PRIVATE·SOURCE_RESTRICTED·CONFIRMATION_REQUIRED·EXTRACTION_INCOMPLETE | 줄마다 이유 글자 | 줄이 사라짐 |
| 편집 | 글자 합 61,200 | 머리 안내, [저장] 막지 않음 | 안내 없음 |
| 저장 | 빈 이름·51자 | 요청 없음, 「이름을 1~50자로 써 주세요.」, `aria-invalid`, 담은 자료 남음 | 요청이 감 |
| 저장 | 새 프리셋 201 | 주소 `/presets/{id}`(replaceState), 「저장했습니다.」 `role="status"`, h1 「프리셋 고치기」, [프리셋 지우기] 보임, 불러온 목록 남음 | 화면이 새로 그려짐 |
| 저장 | 첫 저장 뒤 두 번째 저장 | `PUT /v1/presets/{id}`, 프리셋 수 그대로(POST 다시 안 감) | POST가 다시 감 |
| 저장 | 저장 중 | 입력·단추 모두 막힘, 「저장하고 있습니다.」 | 저장 중 입력이 바뀜 |
| 저장 | 저장 뒤 상세 | 담긴 목록 그대로, 같은 항목의 글자 수·이유만 바뀜 | 사이에 더한 항목이 사라짐 |
| 저장 | 409·400 maxTotalLength·400 그 밖·404·5xx·끊김 | 이유별 글(`role="alert"`, 초점 [저장]), 입력 남음, 404는 <프리셋 목록으로> | 입력 사라짐 |
| 이탈 | 바꾼 뒤 목록으로·다른 화면으로 | 「저장하지 않은 입력이 있습니다. 이동하시겠습니까?」 | 경고 없음 |
| 지우기 | 확인·취소·204·404·실패 | 목록으로 / 그대로 / 목록 / 목록 / 안내, 지우기 전 상태 | 확인 없이 지워짐 |
| 발행 | 프리셋 2개 골라 순서 바꿔 발행 | 요청 `{ title, password?, presetIds }` 고른 순서, `items` 없음 | `items`를 보냄 |
| 발행 | 항목 0개·발행할 수 없는 자료 3개·더하면 21개·더하면 60,001자·혼자 overLimit | 이유 하나씩, 「… Catch C 외 2개」 | 고를 수 있음·이유 둘 |
| 발행 | 5개 고름 | 안 고른 단추 막힘, 안내 한 번(`aria-live`), 상한 이유 숨김 | 6번째 |
| 발행 | 0개·실패·불러오는 중 | <프리셋 만들러 가기>만 / [다시 불러오기] / 불러오는 글 | 실패가 0개로 보임 |
| 발행 | [다음]: 0개 | 「프리셋을 하나 이상 골라 주세요.」 | 확인 단계로 감 |
| 발행 | 확인 단계 | 제목·비밀번호·만료, 「고른 프리셋과 순서」 이름, 작성자 설명 없는 Catch 안내 없음 | 자료 목록 |
| 발행 | 409 CATCH_PRIVATE `blockedSources` 한 줄 | 목록 1번 다시 불러옴, 「‘P’ 프리셋의 ‘Catch C’ 때문에 발행할 수 없습니다.」, 입력·고른 프리셋 남음, 편집 단계 | 어느 자료인지 없음 |
| 발행 | 이름 못 찾음·다시 불러오기 실패 | 종류(Catch)로, 「고른 프리셋」으로, 지금 목록으로 찾기 | 빈 따옴표 |
| 발행 | 404·400 `presetIds` | 안내, 목록 다시, 없어진 프리셋 빠짐 | 그대로 고른 상태 |
| 발행 | 비공개 안내 | `PRIVATE_CATCH_NOTICE` 없음 | 공개 전환 안내 |
| 응답 해석 | `blockedSources` 옳은 모양·남는 속성·어긋난 kind·빈 ID·배열 아님, `catchIds` | 세 칸만 / 버림 / 어긋남 / 어긋남 / 어긋남 / 옮기지 않음 | 막힘 칸이 버려짐 |
| api | `publishable=true` | 공개·확인·비보호만 | 비공개 나옴 |
| api | `false`·빈 값·두 번·공개 목록 | 400 | 200 |
| api | 남의 Catch | 섞이지 않음 | 섞임 |
| api | 옛 커서(`publishable` 없음) / 조건 다른 커서 | 그대로 다음 쪽 / 400 | 옛 커서 400 |
| api | 보호 관측 없는 Catch가 있음 | 500(지금처럼) | 조용히 빠짐 |
| api | 같은 Catch 묶음 | `publishable=true` ID 집합 = `eligibility.ts` 이유 없음 ID 집합 | 둘이 다름 |

## 모의·시험 자료

- web: 기록용 가짜 `api.member`가 경로별 응답을 정하고 요청 순서·쿼리·몸통을 기록한다. 늦은 응답은 약속(Promise)을 나중에 풀어 만든다. 실제 회원 자료를 쓰지 않는다.
- api: 지금 `api/test/catches/` 도우미처럼 시험 DB에 회원·저장소·Catch·근거·보호 관측을 직접 만든다. 같은 결과 시험은 U1 `src/publishable-source/eligibility.ts`를 빌드 결과(`dist`)에서 불러 같은 묶음에 돌린다.
