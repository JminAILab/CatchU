# U6 Claude MCP 본인 연결 — 성능 설계

## Sources

작성일: 2026-11-01. 입력: [성능 요구사항](../nfr-requirements/performance-requirements.md)(performance-requirements)의 NFR4.1~NFR4.4, [보안](../nfr-requirements/security-requirements.md)(security-requirements)·[규모](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[관측](../nfr-requirements/observability-requirements.md)(observability-requirements) 요구사항, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U6 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 W4와 S14~S16, [업무 규칙](../functional-design/rules.md)의 BR5.2~BR5.5·BR6.1·BR6.3·BR6.5, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-13·C-14·C-15, [비기능 설계 질문·답변](nfr-design-questions.md)의 요약 확인, api 현재 코드(`api/src/catches/catch-reader.ts`, `api/src/catches/owner-catch-input.ts`, `api/src/catches/entities/catch-evidence.entity.ts`, `api/src/materials/text-material.entity.ts`, `api/node_modules/ioredis/built/redis/RedisOptions.d.ts`).

## 범위

NFR4는 응답 시간 목표를 새로 만들지 않는다. 성능 설계는 호출 한 번이 읽는 양의 상한, 부르지 않아도 되는 DB 조회를 하지 않는 순서, Redis가 멈춰도 호출이 걸리지 않는 상한 세 가지다.

## 설계

| 요구사항 | 설계 |
|---|---|
| NFR4.1 시간 목표 없음 | 응답 시간 목표와 시간 측정을 두지 않는다. OAuth 주소와 도구는 외부 서비스를 부르지 않고 DB만 쓴다(도구 호출의 빈도 집계만 Redis). 메타데이터·등록·토큰 10초, 도구 240초 안에 드는지는 S22에서 본다 |
| NFR4.2 50행·40,000자 | 상수 `MCP_PAGE_ROWS = 50`, `MCP_PAGE_CHARS = 40_000`을 한 파일에 둔다. 아래 「쪽 만들기」와 「조회」대로 읽고 나눈다. U4의 본문 상한이 정해지면 최악의 메모리(50행 × 본문 상한)를 다시 본다 |
| NFR4.3 빈도 먼저 | 도구 처리는 빈도 → `cursor` 해석 → DB 순서다. 61번째 호출과 잘못된 `cursor`는 DB를 읽지 않는다. 빈도 명령은 `commandTimeout: 1000`으로 묶여 1초가 넘으면 오류로 치고 통과한다(reliability-design). 없는 도구와 입력 오류는 SDK가 이 처리 전에 거부하므로 세지 않고 DB도 읽지 않는다 |
| NFR4.4 토큰 확인 | `mcp_access_token` 기본 키 조회와 `member_account` 기본 키 잇기 한 문장이다. 회원의 자료 양과 상관없다. 캐시하지 않는다 |

## 쪽 만들기

```text
// 설명용 모양(의사 코드). size(x) = JSON.stringify(x).length + 1
const rows = await read(memberId, position, MCP_PAGE_ROWS);
let used = MCP_PAGE_RESERVE;                  // 봉투와 nextCursor 몫 200자
const items = [];
for (const row of rows) {
  let item = toItem(row);
  if (size(item) + MCP_PAGE_RESERVE > MCP_PAGE_CHARS) item = omitBody(row);     // BR6.5
  if (items.length > 0 && used + size(item) > MCP_PAGE_CHARS) break;            // 다음 쪽으로
  items.push(item); used += size(item);
}
const more = items.length < rows.length || rows.length === MCP_PAGE_ROWS;
return { [listName]: items, nextCursor: more ? cursorOf(last(items)) : null };
```

- **`LIMIT 50`이다.** 저장소의 `limit+1` 방식(`owner-catch-store.ts`)은 쓰지 않는다. NFR4.2가 "최대 50행"이고, 51번째 행이 큰 본문이면 쓰지 않을 글을 읽기 때문이다. 그래서 50행이 모두 들어가면 다음이 있는지 모른 채 `nextCursor`를 준다. 자료 수가 50의 배수면 마지막 호출이 빈 목록과 `null`을 돌려준다. BR5.5와 S14에 어긋나지 않고 호출이 한 번 늘 뿐이다.
- **쪽의 첫 항목은 언제나 넣는다.** 같은 항목에서 멈추지 않게 하기 위해서다(S15). 글을 뺀 항목이 상한을 넘으면 그 쪽이 상한을 넘는다. 이 경우는 기능 명세의 가정("글을 뺀 항목은 상한보다 훨씬 작다")이 틀린 때이고, U4 상한이 정해지면 다시 본다.
- **글자 수**는 BR6.5대로 직렬화한 응답 글의 길이(`String.length`)다. 봉투 `{"materials":[],"nextCursor":"..."}`와 `cursor` 글이 200자를 넘지 않으므로 200자를 미리 뺀다. S15가 `JSON.stringify(page).length`가 40,000 이하인지 본다.
- **결과 모양**은 글 하나에 `JSON.stringify(page)`를 담는다. `structuredContent`·`outputSchema`는 두지 않는다. 같은 글이 두 벌 나가면 Claude 쪽 크기 한도를 두 배로 쓰기 때문이다. 칸은 C-15와 U6이 더하는 `bodyOmitted`·`omitted`다.

## 조회

| 도구 | 읽는 칸 | 조건과 순서 |
|---|---|---|
| `list_my_catches` | `catch_id`, `title`, `visibility`, `work_facts`, `subject_contribution`, `author_description`, `mismatch` | `WHERE owner_id = $1 [AND catch_id > $2] ORDER BY catch_id ASC LIMIT 50` |
| 그 행들의 근거 주소 | `catch_id`, `source_url` | `catch_asset`과 이어 `c.owner_id = $1 AND e.catch_id = ANY($2::uuid[]) ORDER BY e.catch_id, e.position, e.catch_evidence_id`(`catch-reader.ts`와 같은 정렬). 조회 한 번이다 |
| `list_my_text_materials` | `text_material_id`, `title`, `body`, `updated_at`, `created_at`의 마이크로초 글자 | `WHERE member_id = $1 [AND (created_at, text_material_id) > ($2::timestamptz, $3::uuid)] ORDER BY created_at, text_material_id LIMIT 50` |

Catch와 근거 주소를 트랜잭션으로 묶지 않는다. 그 사이에 Catch가 지워지면 근거 주소가 덜 나올 뿐이고 남의 자료가 나오지 않는다(에러 대응 최소선 6). 두 조회 모두 `cursor`의 값은 매개변수로만 넘긴다.

## `cursor`

`owner-catch-input.ts`와 같은 base64url JSON이다.

| 도구 | 담는 값 | 확인 |
|---|---|---|
| `list_my_catches` | `{ v: 1, after }` | 칸이 정확히 이것뿐이고 `after`가 UUID다 |
| `list_my_text_materials` | `{ v: 1, createdAt, id }` | 칸이 정확히 이것뿐이고 `id`가 UUID이며 `createdAt`이 `YYYY-MM-DDTHH:MM:SS.ffffffZ` 형식의 실제 날짜다 |

- 공통으로 길이 1,024자 이하이고 base64url 왕복이 같아야 한다. 하나라도 어긋나면 `INVALID_CURSOR`다. 그래서 DB가 날짜 오류를 내 `INTERNAL_ERROR`가 되는 일이 없다.
- `createdAt`은 `to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`로 읽은 글자를 그대로 쓴다. JS `Date`는 밀리초로 잘려 같은 행이 다시 나올 수 있기 때문이다.
- 회원에 묶지 않는다. 위치만 담고 회원 조건은 토큰에서 온다(BR5.2, S12).

## 요청 본문

새 상한을 두지 않는다. Nest 파서의 100KB 하나로 정해진다(security-design 「본문 파서가 앱 전체에 걸리는 데서 오는 것」). 도구 입력은 `cursor`뿐이라 충분하다.

## 두지 않는 것

토큰 확인·도구 응답 캐시, 응답 시간 목표, 연결 묶음 조정, 응답 압축, 읽기 전 글 길이 조회는 두지 않는다. 앞의 셋은 performance-requirements 「채택하지 않은 것」과 시연 규모로 정해졌고, 나머지 둘은 요구사항에 근거가 없다.
