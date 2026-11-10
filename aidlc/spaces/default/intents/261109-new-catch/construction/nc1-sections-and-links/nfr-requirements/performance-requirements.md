# NC1 칸 제목과 링크 이름 — 성능 요구사항

입력:
- 기능 설계 `construction/nc1-sections-and-links/functional-design/`(functional-spec.md, rules.md, frontend-components.md)
- 요구사항 `inception/requirements-analysis/requirements.md`(NFR1, NFR6~NFR8)
- 계약 `inception/contract-design/contract-summary.md`(C1·C7)
- 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 이 단계의 답 `nfr-requirements-questions.md`(Q1 A, Q2 A와 덧붙임)

NC1은 화면(ui) Unit이다. 이 Unit에는 확장성·신뢰성·관측 문서를 두지 않는다. 그래서 화면 품질 요구(접근성·호환·시험)도 이 문서 끝에 함께 둔다.

## 인셉션 NFR1(호출과 수집)에서 물려받는 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR1.1 | NC1은 GitHub 호출도 AI 호출도 늘리지 않는다. worker와 AI 호출 코드는 바꾸지 않는다. 링크 이름은 화면에서만 계산하고 GitHub를 다시 읽지 않는다. | 코드로 확인한다(Q2 A). PR 본문에 「GitHub·AI 호출 없음(저장소 목록은 DB와 자격 정보 보관소만 읽음)」을 적는다. 분석 전·후 호출 수 측정은 NC3 빌드와 시험에서 한 번만 한다(bolt-plan B3). | NFR1, BR2.8 |
| NFR1.2 | 발행 화면이 새로 부르는 것은 저장소 목록(`GET /me/repositories`)이다. 저장소 목록은 쪽으로 나뉘므로(api 기본 20·최대 100, web `RepositoryApi`는 쪽마다 100개) 화면을 열 때 한 번, 쪽을 끝까지 읽는다(내 자산 화면과 같은 `RepositoryApi`). 걸러 보기 체크 칸을 바꿀 때는 다시 부르지 않는다. 이 요청은 목록 전에 `refreshStatus`로 보관된 GitHub 자격 정보의 만료만 확인한다. 만료되면 연결 상태를 바꾸고 보관소에서 지울 뿐 GitHub는 부르지 않는다(`github-connection.service.ts`). 개발용 회원은 `refreshStatus`를 거치지 않는다. | 화면 시험: 화면을 연 뒤 체크 칸을 켜고 꺼도 저장소 목록 요청이 더 일어나지 않는다. 코드 검토로 `refreshStatus`가 GitHub 클라이언트를 부르지 않음을 PR에 적는다. | NFR1, BR6.2, Q2 덧붙임 |

## 확인 사항 (인셉션 NFR이 없는 성능 제약)

- **본인 목록 읽기:** 새 조건 `author_description IS [NOT] NULL`은 지금 회원 범위(`c.owner_id = $1`)와 `catch_id` 순서 읽기에 조건 하나를 더할 뿐이다. 색인과 마이그레이션은 더하지 않는다(Q1 A).
  - 까닭: 12월까지 이용자는 팀 관련자와 동료 수강생이고, 회원 한 명의 Catch는 많아야 수백 개다. 이 규모에서는 색인의 차이를 잴 수 없다.
  - 확인: 지금 본인 목록 시험이 그대로 통과하고, 조건 셋(없음·`written`·`unwritten`) 시험의 응답 쪽 크기가 지금 `limit` 그대로다.
- **쪽 크기:** 「더 보기」의 쪽 크기와 상한은 지금 그대로다. 걸러 본 결과도 같은 `limit`으로 자른다(C1).
- **화면 안 계산:** 합계 글자 수와 링크 목록은 글자를 칠 때마다 화면 안에서 다시 계산하고 API를 부르지 않는다(BR3.3). 글은 많아야 4,000자이므로 입력 지연 처리(디바운스)는 두지 않는다.
  - 확인: AC2.3.7 시험(링크를 쓰는 동안 API 요청 0건).

## 그 밖의 품질 요구 (접근성·호환·시험)

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR6.1 | 편집 화면 칸 제목 8개는 각 글칸의 보이는 `label`이다. 첫 글칸·「짚어 볼 곳」 글칸·[설명 저장]의 `aria-describedby` 연결은 BR4.5대로다. 「발행하면 면접관에게 열릴 링크」는 h4 제목이고 알림 영역이 아니다. | 화면 시험: `getByLabelText`로 8칸을 찾고, h4 제목을 찾으며, 링크 목록에 `aria-live`가 없다(AC1.1.4, AC2.3.6). | NFR6, BR3.3, BR4.5 |
| NFR6.2 | 새 선택 칸(「작성자 설명: 전체/씀/안 씀」)과 체크 칸(「작성자 설명을 쓴 Catch만 보기」)은 보이는 `label`이 있고, 걸러 본 개수는 `aria-live="polite"`로 알린다. | 화면 시험(AC4.1.4, AC5.3.4). | NFR6, BR5.4, BR6.4 |
| NFR6.3 | 발행본의 빈 칸은 h5째 그리지 않아 화면 낭독기에도 나오지 않는다. 링크 이름 뒤에는 화면 낭독기용 숨은 「(새 탭)」이 붙는다. | 화면 시험(AC1.4.4, AC2.2.7). | NFR6, BR2.7, BR7.1 |
| NFR7.1 | 칸 제목 줄이 없는 옛 작성자 글은 편집 화면에서 「더 쓰기」 칸 하나로 열리고, 그대로 저장하면 글이 바뀌지 않는다. 발행본에서는 칸 제목 없이 지금처럼 보인다. | 공통 함수 시험(옛 글 왕복)과 화면 시험(AC1.3.1, AC1.5.1). | NFR7, BR1.6, BR7.2 |
| NFR7.2 | 이번 배포 전에 받은 「더 보기」 커서(`v: 1`)는 400이 되고, web은 지금 실패 안내를 보인다. 걸러 보기를 바꾸거나 화면을 다시 열면 첫 쪽부터 다시 부른다. | api 시험(v1 커서 400)과 화면 시험(더 보기 실패 안내). | NFR7, BR5.2, 기능 설계 Q4 A |
| NFR8.1 | 수락 기준(US1~US5)을 시나리오로 먼저 두고, 세부 시험 코드는 구현 뒤 작성·실행한다. 기존 시험은 계속 통과한다. 커버리지는 팀장이 넣은 서비스별 명령(`test:coverage`)으로 잰다. | Unit 확인 명령(`verification-command.txt`)이 60분 상한 안에서 통과한다. | NFR8, team.md 「Testing Posture」 |

## Sources

- `construction/nc1-sections-and-links/functional-design/functional-spec.md`, `rules.md`(BR2.8, BR3.3, BR4.5, BR5.2, BR5.4, BR6.2, BR6.4, BR7.1, BR7.2), `frontend-components.md`
- `inception/requirements-analysis/requirements.md` NFR1, NFR6~NFR8
- `inception/contract-design/contract-summary.md` C1
- `inception/delivery-planning/bolt-plan.md` B3
- `nfr-requirements-questions.md` Q1 A, Q2 A와 덧붙임
- 지금 코드: `api/src/member-repositories/member-repositories.service.ts`, `api/src/github-connection/github-connection.service.ts`(`refreshStatus`·`invalidate`), `api/src/catches/owner-catch-store.ts`
