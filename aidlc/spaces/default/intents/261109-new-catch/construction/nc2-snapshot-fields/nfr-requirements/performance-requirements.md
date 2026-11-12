# NC2 면접관 사본 칸과 표지 — 성능 요구사항

입력:
- 기능 설계 `construction/nc2-snapshot-fields/functional-design/`(functional-spec.md, rules.md, entities.md)
- 요구사항 `inception/requirements-analysis/requirements.md`(NFR1, NFR6)
- 계약 `inception/contract-design/contract-summary.md`(C3, 2026-11-10 덧붙임 포함)
- 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 이 단계의 답 `nfr-requirements-questions.md`(Q1 A, Q2 A와 덧붙임)

NC2는 발행 트랜잭션에서 조금 더 읽고, 사본 보기에서 조금 더 그린다. 새 외부 호출은 없다. 접근성(NFR6)도 이 문서 끝에 둔다.

## 인셉션 NFR1(호출과 수집)에서 물려받는 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR1.1 | NC2는 GitHub 호출을 늘리지 않는다. worker와 GitHub 클라이언트 코드는 바꾸지 않는다. 사본 새 칸은 이미 DB에 있는 값(저장소 등록, 작성자 설명 시각, 근거 한계, 소속 기록)에서만 만든다. 표지는 화면에서만 계산한다. | 코드로 확인한다(NC1과 같은 방식). PR 본문에 「GitHub 호출 없음, worker 변경 없음」을 적는다. 분석 전·후 호출 수 측정은 NC3 빌드와 시험에서 한 번만 한다(bolt-plan B3). | NFR1, BR1.1~BR1.4, BR4.7 |
| NFR1.2 | NC2는 AI 호출 수를 바꾸지 않는다. 기본 요약·질의응답·JD 요약 지시에 문장 하나가 붙어 지시 글만 길어진다(BR5.1). 호출 수 상한과 하루 한도는 그대로다. | 코드로 확인한다. 지시 상수 셋 말고 AI 호출 경로를 바꾸지 않았음을 PR에 적는다. | NFR1, BR5.1 |

## 확인 사항 (인셉션 NFR이 없는 성능 제약)

- **발행 읽기:** 발행 트랜잭션에서 더 읽는 것은 셋이다.
  - 잠금 조회에 저장소 등록을 `registration_id`로 잇는다. 등록 표는 `registration_id`가 고유라 색인으로 찾는다.
  - 근거 조회에 `coverage_limits` 칸 하나를 더한다(같은 질의).
  - 소속 기록(`commit_assignment`)을 고른 Catch 전체에 한 번의 질의로 읽는다(`catch_id = ANY($n)`, 회원도 같음). 이미 `(catch_id, member_id)` 색인이 있다. Catch마다 따로 부르지 않는다.
  - 새 색인·마이그레이션은 더하지 않는다.
  - 확인: 발행 시험이 질의를 Catch 수만큼 늘리지 않는다(코드 검토). 지금 발행 시험이 그대로 통과한다.
- **사본 크기:** `workLimits`는 상한이 없지만(기능 설계 Q2 A), 근거 한계 가운데 두 종류만 고르고 같은 문장은 한 번만 담는다. 발행 글자 수 합산(60,000자 상한)에는 새 칸을 넣지 않는다(BR1.5).
- **화면 안 계산:** 표지 판정은 링크마다 본인 커밋 목록(사본 근거라 많아야 20여 개)과 앞부분을 견주는 것이다. 미리 계산해 두지 않는다.

## 그 밖의 품질 요구 (접근성)

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR6.1 | 표지는 꾸밈 요소가 아닌 글자 「이 작업의 본인 커밋」으로 읽히고 색만으로 나타내지 않는다. 링크 밖에 있어 따로 눌리지 않고 초점을 받지 않는다. | 화면 시험: 표지를 글자로 찾을 수 있고, 링크 요소 안에 없으며, `tabIndex`·`aria-hidden`이 없다(AC7.1.3). | NFR6, BR4.4, BR4.5 |
| NFR6.2 | 작성 시점은 h4 「작성자 설명」 안의 작은 글자라 화면 낭독기가 제목과 함께 읽는다. h4의 접근 이름이 바뀌므로, 이 h4를 「작성자 설명」 글자로 찾는 기존 시험을 코드 계획에서 모두 찾아 고칠 목록에 넣는다(기능 설계 검토 지적). | 화면 시험: 작성 시점이 h4 안에 있다. 코드 계획에 찾은 시험 목록이 있다. | NFR6, BR3.2 |
| NFR6.3 | 「이 기록으로 알 수 없는 것」은 굵은 글자와 `ul`이고 접힘 안에 숨지 않는다. | 화면 시험(AC6.3.4). | NFR6, BR3.3 |

## Sources

- `construction/nc2-snapshot-fields/functional-design/rules.md`(BR1.1~BR1.5, BR3.2, BR3.3, BR4.4, BR4.5, BR4.7, BR5.1), `functional-spec.md`, `entities.md`, `reviews/review-01.md`
- `inception/requirements-analysis/requirements.md` NFR1, NFR6
- `inception/contract-design/contract-summary.md` C3
- `inception/delivery-planning/bolt-plan.md` B2·B3
- `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- `nfr-requirements-questions.md` Q1 A, Q2 A와 덧붙임
- 지금 코드: `api/src/publications/publish.service.ts`, `api/src/catches/entities/commit-assignment.entity.ts`, `api/src/member-repositories/repository-registration.entity.ts`, `api/src/rag-answer/rag-answer-config.ts`, `api/src/jd-summary/jd-generation-request.ts`
