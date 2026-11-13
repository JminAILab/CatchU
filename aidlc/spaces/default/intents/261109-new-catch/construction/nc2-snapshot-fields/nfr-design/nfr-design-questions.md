# NC2 면접관 사본 칸과 표지 — NFR 설계 질문

## 질문의 범위

- 입력:
  - NC2 NFR 요구 `construction/nc2-snapshot-fields/nfr-requirements/`(여섯 문서)와 그 검토 `reviews/review-01.md`(Minor R-01~R-04)
  - NC2 기능 설계 `construction/nc2-snapshot-fields/functional-design/`
  - 계약 C3·C6(2026-11-10 덧붙임 포함)
- 이미 정해진 것은 묻지 않는다.
  - 새 라이브러리·색인·마이그레이션 없음, 사본 선택 칸만 더함, 표지는 화면에서만 계산
  - 안전망 경고 한 줄(발행본 ID·회원 ID), 한계 문장 넷 따옴표 경계 대조
- 검토 지적 가운데 R-03(다른 Catch에 이미 배정된 커밋)과 R-04(시험이 새로 `build.py`를 읽는다는 표현과 경로 기준)는 사람이 정할 것이 없어 설계 문서에 바로 적는다.
- 가장 단순한 안을 A로 둔다.

## Q1. [관측] 안전망 경고 줄은 언제 남길까요?

**배경:** NFR 요구 검토 R-02가 지적했다. 저장소 이름을 못 읽는 갈래는 발행 트랜잭션 안에서 생긴다. 그 자리에서 발행본 ID를 찍으면, 뒤에서 발행이 롤백될 때 없는 발행본 ID가 로그에 남는다. 지금 로그도 그래서 `publishFailed`에는 발행본 ID를 싣지 않고, `publishSucceeded`는 트랜잭션이 끝난 뒤(`publish.service.ts` 122행)에 남긴다.

A. 트랜잭션 안에서는 칸을 뺀 Catch가 있었는지만 기억하고, 트랜잭션이 끝나 발행이 성공한 뒤 `publishSucceeded` 옆에서 경고 한 줄(발행본 ID·회원 ID)을 남긴다. 롤백되면 남기지 않는다(그때는 지금처럼 `PUBLISH_FAILED`가 남는다). (가장 단순)
B. 트랜잭션 안 그 자리에서 바로 남기되 회원 ID만 싣는다. 기억해 둘 값이 없다. 대신 어느 발행본인지 알 수 없고, 롤백된 발행에도 경고가 남는다.
X. Other (please specify)

[Answer]: A (2026-11-11, **Mode:** chat)

## Q2. [성능] 발행 때 소속 기록은 어디까지 읽을까요?

**배경:** NFR 요구 검토 R-01이 지적했다. 소속 기록에는 상한이 없고 발행은 Catch를 20개까지 고른다. Catch마다 소속 기록 전체를 읽으면 한 번에 읽는 행 수가 열려 있다. 판정에 필요한 것은 근거 주소에 든 커밋 식별값뿐이다(Catch마다 근거 20여 개).

A. 고른 Catch의 근거 가운데 커밋 주소(`/commit/<40자>`)의 식별값만 모아, 소속 기록에서 그 식별값들만 한 번에 읽는다(`catch_id = ANY($n) AND commit_sha = ANY($m)`, 회원 조건 포함). 읽는 행 수가 근거 수를 넘지 않는다. 기본 키(회원·저장소·식별값)와 `(catch_id, member_id)` 색인을 쓴다. (가장 단순)
B. 고른 Catch의 소속 기록 전체를 한 번에 읽는다. 질의가 조금 더 짧다. 대신 본인 커밋이 많은 작업이면 쓰지 않을 행을 많이 읽고, 읽기 크기의 근거를 따로 적어야 한다.
X. Other (please specify)

[Answer]: A (2026-11-11, **Mode:** chat)

**덧붙임(사람 원문, 앞 단계에서 물은 것):** bolt-plan.md B2 「확인하는 가설」에 같은 ID 덧붙임으로 「본인 커밋 표지는 소속 기록(commit_assignment)으로 정한다(2026-11-10 NC2 NFR 요구 때 결정)」를 더한다. 요구사항 FR10.2는 「정할 수 있다」는 가능한 방법을 적은 문장이라 고치지 않는다.

**반영:** `inception/delivery-planning/bolt-plan.md` B2 「확인하는 가설」에 덧붙였다(2026-11-11). FR10.2는 그대로 둔다.

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
