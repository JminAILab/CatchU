# NC1 칸 제목과 링크 이름 — 성능 설계

입력:
- NFR 요구 `construction/nc1-sections-and-links/nfr-requirements/performance-requirements.md`(NFR1.1·NFR1.2, NFR6.1~NFR8.1)
- 기능 설계 `construction/nc1-sections-and-links/functional-design/`(functional-spec.md, rules.md, frontend-components.md)
- 계약 `inception/contract-design/contract-summary.md` C1
- 이 단계의 답 `nfr-design-questions.md`(Q1 A, Q2 A)

NC1은 ui Unit이라 확장성·신뢰성·관측 설계를 두지 않는다. 화면 품질 요구(NFR6~NFR8)도 이 문서에서 설계한다.

## 1. 호출을 늘리지 않는 설계 (NFR1.1·NFR1.2)

- **GitHub·AI:** worker, AI 호출 모듈(`ai-generation`·`ai-run`·`rag-answer`), GitHub 클라이언트를 바꾸지 않는다. 링크 이름은 web 공통 함수(`github-link-name.ts`)가 원래 주소 글자만으로 계산하고 네트워크를 쓰지 않는다(NFR1.1).
  - PR 본문 문장: 「GitHub·AI 호출 없음(저장소 목록은 DB와 자격 정보 보관소만 읽음)」
- **발행 화면 저장소 목록:** 발행 화면을 담는 `publish-screen.tsx`가 화면을 열 때 `createRepositoryOptionsStore`를 한 번 만들어 `refresh()`를 한 번 부르고, 닫을 때 `dispose()`한다. 내 자산 화면(`assets-member-page.tsx`)과 같은 쓰임이다(Q2 A).
  - 이 부품은 `RepositoryApi`로 쪽마다 100개씩 `nextCursor`가 없을 때까지 읽는다.
  - 걸러 보기 체크 칸은 Catch 목록 불러오기만 다시 부르고 이 부품은 건드리지 않는다.
  - 실패하면 부품이 `error` 상태가 되고, 작은 줄에서 저장소 이름만 빠진다(BR6.2). 다시 부르는 단추는 두지 않는다.

```ts
// publish-screen.tsx(설계 수준, assets-member-page.tsx와 같은 꼴)
const options = useMemo(() => createRepositoryOptionsStore(repositories), []);
const snapshot = useSyncExternalStore(options.subscribe, options.getSnapshot, options.getSnapshot);
useEffect(() => { void options.refresh(); return () => options.dispose(); }, [options]);
// PublishView에는 options 스냅숏만 넘기고, writtenOnly 변경은 Catch 목록만 다시 부른다.
```

## 2. 본인 목록 읽기 (C1)

- **읽기 칸:** 공용 읽기 칸 `READ_COLUMNS`에 `c.author_description IS NOT NULL AS "hasAuthorDescription"` 하나를 더한다(Q1 A). 설명 원문은 목록·상세 질의에서 읽지 않으므로 쪽마다 읽는 바이트가 늘지 않는다.
- **조건:** `owner-catch-store.ts`의 조건 배열에 고정 SQL 조각 하나를 고른다.
  - `written` → `c.author_description IS NOT NULL`
  - `unwritten` → `c.author_description IS NULL`
  - 값은 SQL에 잇지 않는다. 두 조각 가운데 하나를 고를 뿐이다.
- **색인:** 더하지 않는다(NFR 요구 Q1 A). 지금 `c.owner_id = $1`과 `catch_id` 순서 읽기 그대로다.
- **쪽:** `limit + 1`개를 읽어 다음 쪽 여부를 정하는 지금 방식 그대로다. 걸러 본 결과도 같은 `limit`으로 자른다.

## 3. 화면 안 계산

- **편집 화면:** 칸 글이 바뀔 때마다 `joinSections`→`countCodePoints`와 `collectLinks`를 다시 계산한다. 글이 많아야 4,000자라 디바운스나 `useMemo` 밖 캐시를 두지 않는다. API는 부르지 않는다(BR3.3, AC2.3.7).
- **사본 보기:** `splitSections`는 사본을 그릴 때 한 번 계산한다(`useMemo`로 `authorDescription`이 바뀔 때만). 강조 범위 바꾸기는 칸 수(많아야 8)만큼만 돈다.
- **링크 이름:** 링크마다 `URL` 해석 한 번과 경로 마디 디코딩만 한다. 정규식은 지금 `splitGithubLinks`의 것을 그대로 쓴다.

## 4. 화면 품질 설계 (NFR6·NFR7·NFR8)

| 요구 | 설계 |
|---|---|
| NFR6.1 | `AuthorDescriptionPanel`은 칸마다 `useId()`로 만든 id를 `<label htmlFor>`와 `<textarea id>`에 쓴다. 안내 줄·「짚어 볼 곳」 안내 목록·합계 줄에도 id를 붙이고 BR4.5대로 `aria-describedby`로 잇는다. 링크 목록은 `<section>` 안의 h4와 `<ul>`이고 `aria-live`를 두지 않는다. |
| NFR6.2 | 내 자산 선택 칸은 지금 저장소·공개 상태 칸과 같은 `label`+`select` 꼴이다. 발행 화면 체크 칸은 `<label><input type="checkbox">…</label>`이다. 개수 줄은 두 화면 모두 하나의 `aria-live="polite"` 줄이다. |
| NFR6.3 | 사본 보기는 `splitSections`가 돌려준 칸만 그리므로 빈 칸의 h5가 DOM에 없다. 링크는 `GithubLink` 하나로 그려 숨은 「(새 탭)」을 늘 붙인다. |
| NFR7.1 | 칸 제목 줄이 없는 글은 `splitSections`가 「더 쓰기」 칸 하나로 돌려주고, `joinSections`가 「더 쓰기」만 있는 갈래로 원문을 그대로 돌려준다. 공통 함수 시험이 이 왕복을 지킨다. |
| NFR7.2 | api `ownerCatchQuery`가 `v`가 2가 아닌 커서를 400으로 거절한다. web은 지금 「더 보기」 실패 상태(`moreState: "error"`)를 그대로 쓰고, 걸러 보기나 화면을 바꾸면 첫 쪽부터 다시 부른다. |
| NFR8.1 | 시험 자리: web 공통 함수 시험은 새 시험 파일 하나(`web/test/author-description-sections.test.mjs` 꼴)와 링크 이름 시험 파일 하나, 화면 시험은 지금 `web/test/` 화면 시험에 더한다. api는 지금 `owner-catch` 시험에 조건·커서·응답 칸 시험을 더한다. 확인은 Unit 확인 명령을 60분 상한으로 돌린다. |

## Sources

- `construction/nc1-sections-and-links/nfr-requirements/performance-requirements.md`
- `construction/nc1-sections-and-links/functional-design/rules.md`(BR1.4~BR1.6, BR3.3, BR4.5, BR5.1~BR5.4, BR6.2, BR6.4, BR7.1), `frontend-components.md`
- `inception/contract-design/contract-summary.md` C1
- `nfr-design-questions.md` Q1 A, Q2 A
- 지금 코드: `api/src/catches/catch-reader.ts`(`READ_COLUMNS`), `api/src/catches/owner-catch-store.ts`, `web/src/features/assets/repository-options-store.ts`, `web/src/features/assets/assets-member-page.tsx`, `web/src/features/repository-management/repository-api.ts`
