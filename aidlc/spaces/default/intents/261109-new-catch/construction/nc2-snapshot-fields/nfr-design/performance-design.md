# NC2 면접관 사본 칸과 표지 — 성능 설계

입력:
- NFR 요구 `construction/nc2-snapshot-fields/nfr-requirements/performance-requirements.md`(NFR1.1·NFR1.2·NFR6.1~NFR6.3), `scalability-requirements.md`, `tech-stack-decisions.md`와 검토 R-01
- 기능 설계 `construction/nc2-snapshot-fields/functional-design/functional-spec.md`(W1·W3), `rules.md`
- 계약 `inception/contract-design/contract-summary.md` C3
- 이 단계의 답 `nfr-design-questions.md`(Q2 A)

## 발행 읽기 설계 (W1)

발행 트랜잭션 안에서 지금 읽는 두 질의에 칸을 더하고, 질의 하나를 새로 둔다. Catch 수만큼 질의를 늘리지 않는다.

| 질의 | 바뀌는 것 | 읽는 크기 |
|---|---|---|
| 잠금 조회(`CATCH_LOCK_SQL`) | `c.author_description_updated_at`을 더 읽고, `repository_registration`을 `r.registration_id`(그리고 `r.member_id`)로 LEFT JOIN 해 `owner`·`name`을 읽는다 | 고른 Catch 수(최대 20)만큼. 등록 표는 `registration_id` 고유 열쇠로 찾는다 |
| 근거 조회(`EVIDENCE_SQL`) | `e.coverage_limits`를 더 읽는다 | 지금 그대로(근거 수) |
| 소속 기록 조회(새것) | 근거 가운데 커밋 주소의 식별값만 모아 한 번에 읽는다(Q2 A) | 많아야 그 식별값 수(근거 수). 근거 수를 넘지 않는다 |

새 질의의 모양(설계 수준):

```sql
SELECT catch_id, commit_sha FROM commit_assignment
WHERE member_id = $1 AND catch_id = ANY($2::uuid[]) AND commit_sha = ANY($3::char(40)[])
```

- `$3`은 근거 `sourceUrl`이 `/<소유자>/<저장소>/commit/<16진수 40자>`인 것의 식별값(소문자)이다. 비어 있으면 질의를 보내지 않는다.
- 결과를 (catch_id, commit_sha) 집합으로 두고, 근거마다 「자기 Catch의 집합에 자기 식별값이 있는가」로 `ownCommit`을 정한다(BR1.4).
- 색인: 기본 키(member_id, github_repository_id, commit_sha)와 `(catch_id, member_id)` 색인이 이미 있다. 새 색인은 두지 않는다.
- 소속 기록에는 상한이 없지만(NFR 요구 검토 R-01), 이 질의는 근거 식별값으로 좁혀 읽으므로 읽는 행 수가 근거 수에 묶인다. 그래서 「소속 기록은 많아야 수백 행」 같은 가정이 필요 없다.

## 사본 크기와 글자 수

- 새 칸은 사본 jsonb에만 붙고 발행 글자 수 합산(`snapshotTextLength`, 60,000자 상한)에는 넣지 않는다(BR1.5). 상한 판정이 바뀌지 않는다.
- `workLimits`는 상한이 없다(기능 설계 Q2 A). 고르는 문장이 두 종류뿐이고 같은 글자는 한 번이라, 따로 줄이지 않는다.

## 호출 수 (NFR1.1·NFR1.2)

- GitHub: 발행과 화면이 GitHub를 부르지 않는다. worker 코드는 바꾸지 않는다.
- AI: 지시 상수 셋에 문장 하나를 붙일 뿐 호출 경로·횟수·하루 한도는 그대로다. 확인은 코드로 하고 PR 본문에 적는다. 분석 전·후 측정은 NC3 빌드와 시험에서 한 번 한다.

## 화면 계산 (W3)

- 표지 판정은 사본 보기가 사본을 받을 때 본인 커밋 목록(`ownCommitsOf`)을 한 번 만들고, 링크마다 그 목록과 앞부분을 견준다. 목록은 많아야 사본 근거 수다. 미리 계산해 저장하지 않는다.
- 작성 시점 글은 사본의 "YYYY-MM"에서 바로 만든다. 날짜 객체를 만들지 않는다.

## 접근성 (NFR6.1~NFR6.3)

- 표지: `GithubLink`의 `<a>`가 닫힌 뒤 형제 요소로 `span` 하나를 둔다. `tabIndex`·`role`·`aria-hidden`을 두지 않아 글자로 읽히고 초점을 받지 않는다(NFR6.1).
- 작성 시점: h4 「작성자 설명」 안에 작은 글자 `span`으로 둔다. h4의 접근 이름이 「작성자 설명 2026년 11월에 마지막으로 고침」으로 바뀌므로, 코드 계획에서 이 h4를 이름으로 찾는 기존 web 시험(`getByRole('heading', { name: '작성자 설명' })` 꼴과 `snapshot-catch-description` 안 h4 글자 대조)을 모두 찾아 고칠 목록에 넣는다(NFR6.2).
- 「이 기록으로 알 수 없는 것」: `strong`과 `ul`을 작업 사실 다음, `details` 앞에 둔다. 접힘 밖이다(NFR6.3).

## Sources

- `construction/nc2-snapshot-fields/nfr-requirements/performance-requirements.md`, `scalability-requirements.md`, `tech-stack-decisions.md`, `reviews/review-01.md`(R-01)
- `construction/nc2-snapshot-fields/functional-design/functional-spec.md`, `rules.md`(BR1.4, BR1.5, BR3.2, BR3.3, BR4.4)
- `inception/contract-design/contract-summary.md` C3
- `nfr-design-questions.md` Q2 A
- 지금 코드: `api/src/publications/publish.service.ts`(`CATCH_LOCK_SQL`·`EVIDENCE_SQL`), `api/src/publications/snapshot-builder.ts`, `api/src/catches/entities/commit-assignment.entity.ts`, `web/src/features/publications/snapshot-view.tsx`, `web/src/features/publications/github-link.tsx`
