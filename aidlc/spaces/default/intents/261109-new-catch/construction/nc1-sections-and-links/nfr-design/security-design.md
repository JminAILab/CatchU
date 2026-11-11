# NC1 칸 제목과 링크 이름 — 보안 설계

입력:
- NFR 요구 `construction/nc1-sections-and-links/nfr-requirements/security-requirements.md`(NFR2.1, NFR5.1~NFR5.4와 확인 사항)
- 기능 설계 `construction/nc1-sections-and-links/functional-design/`(rules.md, frontend-components.md)
- 계약 `inception/contract-design/contract-summary.md` C1·C7
- 보안 점검 `docs/CatchU_security_checks.md`
- 이 단계의 답 `nfr-design-questions.md`(Q1 A, Q2 A)

NC1은 인증 방식, 비밀값, 외부 호출, 저장 칸을 바꾸지 않는다. 아래는 화면 출력, 입력 검사, 응답 범위의 설계다.

## 1. 화면 출력 (NFR5.1~NFR5.4)

### 1.1 그리기 경로 하나

작성자 글이 화면에 나오는 길은 둘이다. 편집 화면의 링크 목록과 사본 보기의 칸별 글이다. 두 길 모두 다음 순서만 지난다.

1. `splitSections`: 줄 단위 글자 대조
2. `splitGithubLinks`: 지금 판별 규칙
3. 글 조각은 React 텍스트로, 링크 조각은 `GithubLink`로 그린다

- `dangerouslySetInnerHTML`, `innerHTML`, 마크다운·HTML 렌더러를 쓰지 않는다(NFR5.1).
- 칸 제목 h5는 `SECTION_TITLES` 상수에서만 오고 저장된 글에서 오지 않는다. 저장된 글의 칸 제목 줄은 어느 칸인지 고르는 데만 쓴다.

### 1.2 `GithubLink`

```tsx
// 설계 수준
<a href={url} title={url} target="_blank" rel="noopener noreferrer">
  {githubLinkName(url, evidenceRepository)}<span className={visuallyHidden}>(새 탭)</span>
</a>
```

- `url`은 `splitGithubLinks`가 링크로 고른 조각뿐이다. 판별 규칙(`isGithubSourceUrl`: https, `github.com`, 계정 정보 없음)은 바꾸지 않는다(NFR5.3).
- `href`·`title`은 React 속성 값이라 글자 그대로 들어간다.

### 1.3 `githubLinkName`의 방어 순서

1. `new URL(url)`이 실패하거나, `port`가 비어 있지 않거나, 경로가 BR2.2 표의 꼴과 맞지 않으면 주소 전체를 돌려준다(NFR5.3·NFR5.4).
2. 경로 마디마다 `decodeURIComponent`를 시도한다. 실패하면 그 마디는 원문으로 둔다(NFR5.2).
3. 만든 이름에서 제어 문자와 보이지 않는 서식 문자를 지운다(NFR5.2).
   - 지울 범위: 유니코드 범주 `Cc`(제어)와 `Cf`(서식). 줄바꿈·탭·영폭 공백·영폭 결합자·방향 바꿈(U+202A~U+202E, U+2066~U+2069)·BOM을 포함한다.
   - 정규식 `/[\p{Cc}\p{Cf}]/gu` 하나로 지운다.
4. 다른 저장소면 앞에 「소유자/저장소 · 」를 붙인다. 소유자와 저장소도 같은 지우기를 거친다(NFR5.4).

- 주소 전체를 돌려주는 갈래도 화면에서는 React 텍스트다. 원래 주소는 `isGithubSourceUrl`을 통과했으므로 제어 문자를 품을 수 없다(`URL` 해석이 거부하거나 퍼센트 인코딩으로 남는다).

### 1.4 AI 재료와 따로 두기 (NFR2.1)

- 링크 이름과 칸 제목 h5는 web 안에서만 만든다.
- api 응답, 사본(`publication_item` 스냅숏), 검색 조각, 요약 근거에 들어가는 값은 지금처럼 저장된 `authorDescription` 원문이다.
- web은 저장할 때 `joinSections`의 결과(칸 제목 줄이 든 원문)만 보낸다.

## 2. 입력 검사 (보안 점검 「요청·메시지 입력」)

- **질의 키:** `ownerCatchQuery`가 받는 키 목록에 `authorDescription`을 더한다. 목록 밖 키는 지금처럼 400이다.
- **값:** 문자열 `written`·`unwritten`만 받는다. 빈 값, 배열(같은 키 두 번), 대소문자 다른 값은 400이다. 오류 응답에는 받은 값을 싣지 않는다.
- **SQL:** 값에 따라 고정 SQL 조각 둘 가운데 하나를 고른다. 사용자 값은 SQL 글자에 들어가지 않는다.
- **커서:**
  - `nextOwnerCatchCursor`는 `{ v: 2, scope, after }`를 만든다.
  - `scope`는 `sha256([memberId, repositoryId, sourceRequestId, authorDescription ?? null])`이다.
  - 받을 때 `v !== 2`이거나 `scope`가 다르면 400이다. 지금 검사 자리(`cursor.v !== 1 || cursor.scope !== …`)를 고친다.

## 3. 권한과 응답 범위

- **회원 범위:** 본인 목록·상세는 지금처럼 전역 인증 Guard 뒤에서 `c.owner_id = $1`로 읽는다. 새 조건은 이 조건 배열에 덧붙일 뿐이고, 바꾸지 않는다.
- **읽기 칸(Q1 A):**
  - 공용 `READ_COLUMNS`에 `c.author_description IS NOT NULL AS "hasAuthorDescription"`을 더한다.
  - `ReadRow`와 `OwnerCatchReadSource`에 그 칸을 더하고, `toOwnerCatchResponse`가 응답 칸 `hasAuthorDescription`으로 싣는다.
- **공개 응답:**
  - 공개 Catch 응답은 `publicResponse`가 칸을 하나씩 골라 담는다(`catchId`·`title`·`workFacts`·`subjectContribution`·`evidence`·`draft`). 그래서 `hasAuthorDescription`이 나가지 않는다.
  - 공개 목록도 같은 함수를 지난다. 공개 쪽 코드는 바꾸지 않는다.
  - 시험: 공개 Catch 응답·공개 목록 응답의 키 집합이 지금과 같다.
- **회원 두 명 시험:** 회원 A의 `authorDescription=written` 목록과 커서에 회원 B의 Catch가 나오지 않는다. B의 커서를 A가 보내면 400이다.

## 4. 로그와 오류

- 작성자 설명 원문, 칸 글, 링크 주소를 api·web 로그에 남기지 않는다. 새 코드에 `console.*`·`Logger` 호출로 이 값들을 넘기지 않는다.
- 400 응답은 지금 `BadRequestException()` 모양 그대로이고 입력 값을 싣지 않는다.
- 저장 실패·목록 실패 안내는 지금 화면 문구 그대로이고 서버 오류 원문을 보이지 않는다.

## 5. 위협과 막는 자리

| 위협 | 막는 자리 |
|---|---|
| 칸 글·경로에 태그 꼴 글 | 1.1 React 텍스트 |
| 방향 바꿈·영폭 문자로 파일 이름 속이기 | 1.3의 3단계 |
| 포트·이상한 꼴 주소로 그럴듯한 이름 만들기 | 1.3의 1단계(주소 전체) |
| 새 탭이 원래 창 바꾸기 | 1.2 `rel="noopener noreferrer"` |
| `javascript:`·다른 호스트 링크 | 지금 판별 규칙(바꾸지 않음) |
| 질의 값으로 SQL 바꾸기 | 2 고정 조각 고르기 |
| 커서로 다른 조건·남의 목록 읽기 | 2 커서 범위 해시, 3 회원 범위 |
| 공개 응답으로 설명 여부 새기 | 3 `publicResponse` 골라 담기와 키 집합 시험 |

## Sources

- `construction/nc1-sections-and-links/nfr-requirements/security-requirements.md`
- `construction/nc1-sections-and-links/functional-design/rules.md`(BR1.1, BR2.1~BR2.8, BR5.1~BR5.3, BR7.1), `frontend-components.md`
- `inception/contract-design/contract-summary.md` C1·C7
- `docs/CatchU_security_checks.md`
- `nfr-design-questions.md` Q1 A
- 지금 코드: `web/src/lib/github-source-url.ts`, `api/src/catches/catch-reader.ts`, `api/src/catches/owner-catch-input.ts`, `api/src/catches/owner-catch-store.ts`, `api/src/catches/owner-catch-response.ts`, `api/src/catches/public-catch-store.ts`
