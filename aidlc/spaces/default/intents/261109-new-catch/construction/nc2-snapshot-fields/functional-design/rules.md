# NC2 면접관 사본 칸과 표지 — 업무 규칙

입력:
- 요구사항 `inception/requirements-analysis/requirements.md` FR9·FR10·FR11.1, NFR2·NFR5·NFR6·NFR7, 가정 A1·A7
- 이야기 `inception/user-stories/stories.md` US6.1~US6.5, US7.1·US7.2, US8.1
- 구성 요소 `inception/domain-design/components.md`, 계약 `inception/contract-design/contract-summary.md` C3·C6·C7
- 다듬은 화면 `inception/refined-mockups/mockups.md` 4절, `interaction-spec.md` 4절·9절
- NC1 기능 설계 `construction/nc1-sections-and-links/functional-design/`(링크 이름 BR2, 링크 요소 `GithubLink`)
- 이 단계의 답 `functional-design-questions.md` Q1~Q6

아래 YAML이 규칙의 정본이다. 사본 칸 모양은 `entities.md`, 흐름과 화면 상태는 `functional-spec.md`가 맡는다.

```yaml
rules:
  # BR1 발행 때 사본 칸 담기 (Publications)
  - id: BR1.1
    statement: 발행할 때 Catch의 저장소 등록에서 「소유자/저장소」를 읽어 사본 repositoryName에 담는다.
    category: calculation
    applies_to: Publications
    trigger: 발행 트랜잭션 안에서 Catch를 잠그고 읽을 때
    logic: 지금 발행 잠금 조회(catch_asset → analysis_request)에 repository_registration을 analysis_request.registration_id로 잇고(회원도 같아야 함) owner와 name을 읽는다. IF 등록 행이 있다 THEN repositoryName = owner + "/" + name. ELSE 그 Catch 사본에 repositoryName 칸을 넣지 않고 발행은 그대로 한다.
    violation: 등록 행이 없는 경우는 DB가 막는다(analysis_request.registration_id NOT NULL과 외래 키). 칸을 빼는 갈래는 안전망이고 시험 하나로 확인한다(Q1 A와 덧붙임). 분석 요청이 없거나 다른 회원이면 지금처럼 PublishIntegrityError('sourceRequest')다.
    source: FR9.1
  - id: BR1.2
    statement: 작성자 설명이 있으면 마지막으로 고친 시각의 한국 시간 해와 달을 사본 authorDescriptionEditedMonth에 담는다.
    category: calculation
    applies_to: Publications
    trigger: 발행할 때
    logic: IF catch_asset.author_description이 null이 아니다 THEN author_description_updated_at에 9시간을 더한 시각의 해와 달을 "YYYY-MM"으로 담는다(예 2026-11-30T16:00Z → "2026-12"). ELSE 칸을 넣지 않는다. 발행 뒤에 작성자 설명을 고쳐도 사본은 바뀌지 않는다(지금 사본을 고치는 경로가 없음).
    violation: 해당 없음(DB 검사가 설명이 있으면 시각도 있게 한다)
    source: FR9.2
  - id: BR1.3
    statement: 근거 한계 가운데 작업 전체 한계 두 가지만 문장 대조로 골라 사본 workLimits에 담는다.
    category: calculation
    applies_to: Publications
    trigger: 발행할 때
    logic: Catch의 모든 근거를 지금 근거 순서(position)대로, 근거마다 coverage_limits를 적힌 순서대로 읽는다. IF 문장이 api 상수 「커밋 목록 미확인」 두 문장(worker _LISTS_INCOMPLETE·_EARLIER_LIST_INCOMPLETE)과 글자까지 같거나, 같은 작업 경고 앞부분 둘(「같은 작업을 다시 낸 것일 수 있다(」·「cherry-pick으로 옮긴 같은 변경일 수 있다(」)로 시작한다 THEN 고른다. 이미 고른 문장과 글자까지 같으면 다시 담지 않는다. 개수 상한은 두지 않는다(Q2 A). IF 고른 문장이 없다 THEN 칸을 넣지 않는다. 그 밖의 한계(근거마다의 조회 상태, 「본인 커밋이 20건을 넘어…」 등)는 담지 않는다.
    violation: worker 문장이 바뀌어 대조가 어긋나면 한계가 조용히 빠지므로 BR1.6 시험이 막는다.
    source: FR9.3, FR9.4
  - id: BR1.4
    statement: 사본 근거마다 본인 커밋 근거인지를 ownCommit에 담는다.
    category: calculation
    applies_to: Publications
    trigger: 발행할 때
    logic: IF catch_evidence.contribution_scope가 api 상수 본인 커밋 기여 범위 두 문장(worker _OWN_COMMIT_SCOPE·_OWN_COMMIT_ELSEWHERE_SCOPE)과 글자까지 같다 THEN ownCommit = true. ELSE false. 새 사본은 모든 근거에 이 칸을 담는다. 병합 커밋 근거(「PR 없이 병합한 병합 커밋…」)·PR 근거·이슈 근거는 false다.
    violation: 해당 없음
    source: FR10.1, FR10.2
  - id: BR1.5
    statement: 새 사본 칸 넷은 AI 재료와 글자 수 합산에 넣지 않는다.
    category: constraint
    applies_to: Publications, PublishedIndex, RagAnswer
    trigger: 발행할 때, 조각을 만들 때, 요약 근거를 고를 때
    logic: 조각 나누기(chunker.ts)와 요약 근거(summary-sources.ts)는 지금처럼 workFacts·subjectContribution·evidence[].representedFacts·authorDescription만 고른다. 발행 글자 수 합산(snapshotTextLength)에도 새 칸을 넣지 않는다. 동작은 바꾸지 않고, 새 칸 넷과 표지 글자가 조각과 요약 근거에 0건이라는 시험을 더한다.
    violation: 해당 없음
    source: FR9.5
  - id: BR1.6
    statement: api 상수 여섯이 worker 원본 문장과 글자까지 같은지 api 시험 하나가 본다.
    category: constraint
    applies_to: Publications
    trigger: api 시험을 돌릴 때
    logic: api 시험이 worker/app/candidates/build.py 파일 글자를 읽어, 상수 여섯(한계 문장 둘, 같은 작업 경고 앞부분 둘, 본인 커밋 기여 범위 둘)이 각각 그 글자 그대로 들어 있는지 찾는다. 지금 CI는 worker/app/* 가 바뀌어도 api 시험을 돌리므로 CI를 고치지 않는다(Q6 A).
    violation: 하나라도 없으면 시험이 실패하고 어느 상수인지 알린다. worker 문장이 줄 바꿈으로 나뉘게 고쳐져도 실패하며, 그때는 시험이 알려 주는 대로 맞춘다.
    source: FR9.3, FR10.1

  # BR2 사본 읽어 옮기기 (RecipientScreen, 작성자 발행본 web)
  - id: BR2.1
    statement: web의 사본 모양 검사는 새 칸이 없어도 받아들이고, 있으면 모양을 검사한다.
    category: validation
    applies_to: RecipientScreen, PublishScreen(publications-api.ts isCatchSnapshot)
    trigger: 받은 사람 응답이나 작성자 발행본 응답을 받을 때
    logic: IF 칸이 없다 THEN 통과(옛 사본). IF repositoryName이 있다 THEN 비어 있지 않은 글. IF authorDescriptionEditedMonth가 있다 THEN "YYYY-MM"(01~12월). IF workLimits가 있다 THEN 비어 있지 않은 글의 배열. IF evidence[].ownCommit이 있다 THEN 참·거짓.
    violation: 있는 칸의 모양이 틀리면 지금 다른 칸이 틀렸을 때처럼 사본 전체를 올바르지 않은 응답으로 본다.
    source: FR9.6, FR9.7
  - id: BR2.2
    statement: 받은 사람 web의 칸 고르기(pickItem)는 새 칸 넷을 있을 때만 빠뜨리지 않고 옮긴다.
    category: policy
    applies_to: RecipientScreen
    trigger: 받은 사람 응답을 화면에 넘길 때
    logic: repositoryName·authorDescriptionEditedMonth·workLimits는 있으면 그대로 옮기고 없으면 칸을 만들지 않는다. evidence 항목마다 ownCommit이 있으면 옮긴다. 화면은 ownCommit이 없으면 false로 읽는다. 계약 밖 칸은 지금처럼 옮기지 않는다.
    violation: 해당 없음
    source: FR9.7, FR10.2

  # BR3 사본 세 칸 그리기 (SnapshotView)
  - id: BR3.1
    statement: 사본에 repositoryName이 있으면 Catch 제목(h3) 바로 아래 작은 글자 한 줄로 보인다.
    category: policy
    applies_to: SnapshotView
    trigger: Catch 사본을 그릴 때
    logic: h3 다음, 불일치 표지보다 앞에 p 하나로 그린다. 글 모양은 지금 작은 글자(.small, 12px, 흐린 색)다. 글은 React 텍스트로만 그린다. IF 칸이 없다 THEN 그리지 않는다. 받은 사람 화면과 작성자 발행본 상세가 같은 표시를 쓴다.
    violation: 해당 없음
    source: FR9.1, FR9.6, FR9.7
  - id: BR3.2
    statement: 사본에 authorDescriptionEditedMonth가 있으면 h4 「작성자 설명」 안 옆에 「YYYY년 M월에 마지막으로 고침」을 작은 글자로 보인다.
    category: policy
    applies_to: SnapshotView
    trigger: Catch 사본을 그릴 때
    logic: 달은 앞의 0을 뺀다("2026-11" → 「2026년 11월에 마지막으로 고침」, "2027-01" → 「2027년 1월에…」). 시간대 계산은 다시 하지 않는다(사본의 달이 이미 한국 시간). h4 안에 두어 화면 낭독기가 제목과 함께 읽는다. IF 칸이 없다 THEN 그리지 않는다.
    violation: 해당 없음
    source: FR9.2
  - id: BR3.3
    statement: 사본에 workLimits가 있으면 「기록에서 확인한 내용」 안 작업 사실 바로 아래에 「이 기록으로 알 수 없는 것」 목록을 펼친 채 보인다.
    category: policy
    applies_to: SnapshotView
    trigger: Catch 사본을 그릴 때
    logic: 작업 사실 목록(없으면 「기록에서 확인된 작업 사실이 없습니다.」) 다음, 「근거 자세히 보기」 접힘 앞에 굵은 글자 「이 기록으로 알 수 없는 것」과 ul을 둔다. 지원자 상세의 「이 근거로 알 수 없는 것」과 같은 꼴(strong + ul)이다. 항목은 사본 순서 그대로, React 텍스트로만 그린다. IF 칸이 없다 THEN 그리지 않는다.
    violation: 해당 없음
    source: FR9.4
  - id: BR3.4
    statement: 세 칸이 없는 사본(이 변경 전 사본)은 세 칸 없이 지금 그대로 보인다.
    category: policy
    applies_to: SnapshotView
    trigger: Catch 사본을 그릴 때
    logic: 칸마다 따로 있는지 보고, 없는 칸은 그리지 않는다. 나머지 칸과 순서는 바뀌지 않는다. 오류를 내지 않는다.
    violation: 해당 없음
    source: FR9.6, NFR7

  # BR4 「이 작업의 본인 커밋」 표지 (GithubLinkName, SnapshotView)
  - id: BR4.1
    statement: 표지 판정에 쓰는 본인 커밋 목록은 사본 근거 가운데 ownCommit이 true인 근거만으로 만든다.
    category: calculation
    applies_to: GithubLinkName
    trigger: Catch 사본의 작성자 설명을 그릴 때
    logic: IF 근거의 ownCommit === true이고 sourceUrl이 GitHub 주소(지금 판별 규칙)이며 sourceRevision이 16진수 40자다 THEN (sourceUrl의 「소유자/저장소」, 소문자로 바꾼 sourceRevision)을 목록에 넣는다. ownCommit이 없거나 false인 근거, 다른 꼴의 근거는 넣지 않는다. 같은 (저장소, 식별값)은 하나로 둔다. 사본 근거는 본인 커밋 최근 20건까지라 그보다 오래된 커밋은 목록에 없다.
    violation: 해당 없음
    source: FR10.1, FR10.3
  - id: BR4.2
    statement: 표지는 판본·커밋 이름이 있는 링크만, 그 판본이 커밋 식별값일 때만 판정한다.
    category: validation
    applies_to: GithubLinkName
    trigger: 작성자 설명 속 링크마다
    logic: 링크 이름 표(NC1 기능 설계, 요구사항 FR3.1)의 꼴 가운데 파일 줄·줄 범위 없는 파일·폴더·커밋·커밋 화면 바뀐 줄 링크이고, 판본 자리가 16진수 7~40자일 때만 판정한다. PR 링크, 브랜치 판본(「브랜치 main」), 표의 꼴에 맞지 않아 주소 전체로 보이는 링크는 판정하지 않는다(표지 없음).
    violation: 해당 없음
    source: FR10.3
  - id: BR4.3
    statement: 링크의 저장소와 식별값이 본인 커밋 하나와만 맞을 때 표지를 붙인다.
    category: calculation
    applies_to: GithubLinkName
    trigger: BR4.2를 지난 링크마다
    logic: 본인 커밋 목록에서 「저장소가 링크 저장소와 대소문자 무시로 같고, 식별값이 링크 식별값(소문자)으로 시작하는」 항목을 센다. IF 정확히 1개 THEN 표지를 붙인다. IF 0개 또는 2개 이상 THEN 붙이지 않는다. 줄 범위는 보지 않는다.
    violation: 맞지 않으면 아무것도 붙이지 않는다. 「CatchU가 확인하지 않은 주소」 같은 부정 표지는 없다.
    source: FR10.3, FR10.4
  - id: BR4.4
    statement: 표지는 늘 링크 요소 밖, 링크 바로 뒤에 둔다.
    category: policy
    applies_to: SnapshotView
    trigger: 표지를 붙일 링크를 그릴 때
    logic: 링크(이름 글자와 숨은 「(새 탭)」)가 닫힌 바로 뒤에 표지를 둔다. 커밋 화면 바뀐 줄 링크도 이름을 나누지 않고 링크 전체 뒤에 붙인다(Q3 B). FR10.3 「판본·커밋 이름 바로 뒤」는 이렇게 읽는다. 파일·폴더·커밋 링크는 이름 끝이 판본·커밋 이름이라 링크 바로 뒤가 곧 그 자리다. 바뀐 줄 링크는 본인 커밋의 바뀐 줄을 가리키므로 링크 뒤 표지도 같은 뜻이다. 표지는 눌리지 않고 초점을 받지 않는다(interaction-spec 4절 「표지는 누르는 것이 아님」). AI 답 근거 강조가 링크와 겹치면 지금처럼 링크만 강조로 감싸고 표지는 감싸지 않는다. 표지는 저장된 글에 없는 글자라 강조 위치 세기(원문 주소 길이, NC1 기능 설계의 링크 위치 규칙)에 들지 않는다.
    violation: 해당 없음
    source: FR10.3, FR10.5, NFR6
  - id: BR4.5
    statement: 표지는 지금 Catch 종류 표지와 같은 모양의 글자 「이 작업의 본인 커밋」이다.
    category: policy
    applies_to: SnapshotView
    trigger: 표지를 그릴 때
    logic: 모양은 지금 종류 표지(kindBadge, 둥근 배경 상자, 12px 굵은 글자)와 같고 새 색을 더하지 않는다. 글자는 대괄호 없이 「이 작업의 본인 커밋」이고, 꾸밈 요소가 아닌 글자로 읽힌다(색만으로 나타내지 않음). 작성자가 글에 「[이 작업의 본인 커밋]」을 써도 React 텍스트로만 그려지므로 상자가 없고 대괄호가 보여 화면 모양이 다르다.
    violation: 화면 낭독기는 진짜 표지와 흉내 글을 같은 글자로 읽어 구별하지 못한다. 숨은 앞말을 붙여도 작성자가 같은 글자를 쳐 넣으면 똑같이 들리므로 두지 않고 한계로 적는다(Q4 A와 덧붙임).
    source: NFR5, NFR6
  - id: BR4.6
    statement: 표지는 그 판본·커밋이 이 작업의 본인 커밋이라는 뜻이고, 링크가 가리키는 줄을 본인이 썼다는 뜻이 아니다.
    category: policy
    applies_to: SnapshotView
    trigger: 해당 없음(뜻의 기록)
    logic: 면접관 화면에 뜻을 푸는 안내 문장을 더하지 않는다. 뜻은 이 기능 설계 문서와 web 발행 기능 README(web/src/features/publications/README.md)에 적는다.
    violation: 해당 없음
    source: FR10.5
  - id: BR4.7
    statement: 표지와 판정은 사본 보기의 작성자 설명에만 쓰고 화면에서만 계산한다.
    category: constraint
    applies_to: GithubLinkName, SnapshotView
    trigger: 해당 없음
    logic: 편집 화면의 「발행하면 면접관에게 열릴 링크」(NC1)와 텍스트 자료 본문에는 표지를 쓰지 않는다. 판정은 순수 함수이고 API·저장된 글·사본을 바꾸지 않는다. 받은 사람 화면과 작성자 발행본 상세가 같은 표시를 쓴다.
    violation: 해당 없음
    source: FR10.1, FR10.6

  # BR5 받은 사람 AI 지시 (RagAnswer, JD 요약)
  - id: BR5.1
    statement: 기본 요약·질의응답·JD 요약 지시 끝에 작성자 자료를 작성자의 말로 옮기라는 같은 문장을 더한다.
    category: policy
    applies_to: RagAnswer, JD 요약(U10)
    trigger: 요약·답·JD 요약을 만들 때
    logic: 「자료 종류가 작성자 자료 원문인 내용은 '작성자는 …라고 적었다'처럼 작성자의 말로 옮기고, 확인된 사실처럼 쓰지 않는다.」를 QNA_INSTRUCTION·BASE_SUMMARY_INSTRUCTION(api/src/rag-answer/rag-answer-config.ts)과 JD 요약 지시(api/src/jd-summary/jd-generation-request.ts) 끝에 붙인다. 근거 딱지는 지금처럼 'GitHub 기록 원문'과 '작성자 자료 원문' 둘이다. 면접관 화면의 세 AI가 같은 말투를 쓰게 하려고 JD 요약에도 붙인다(Q5 덧붙임).
    violation: 해당 없음
    source: FR11.1, NFR2
  - id: BR5.2
    statement: 지시를 바꾼 뒤의 확인은 질의응답 10개 다시 재기로 하고, JD 요약은 따로 재지 않는다.
    category: policy
    applies_to: RagAnswer, JD 요약(U10)
    trigger: 빌드와 시험
    logic: 질의응답 10개 다시 재기(FR11.2, NFR3)는 빌드와 시험에서 한다. JD 요약은 그 대상이 아니므로 효과를 따로 재지 않는다고 기록한다. JD 요약 지시는 U10 영역이라 NC2 PR에서 U10 담당 확인을 받는다.
    violation: 해당 없음
    source: FR11.1, FR11.2
```

## 규칙 요약

| 묶음 | 규칙 | 구성 요소 | 요구사항 |
|---|---|---|---|
| BR1 | 저장소 이름, 작성 시점, 작업 전체 한계 고르기, 근거별 본인 커밋, AI 재료에서 빼기, 문장 대조 시험 | Publications | FR9.1~FR9.5, FR10.1·FR10.2 |
| BR2 | web 사본 모양 검사, 받은 사람 칸 옮기기 | RecipientScreen, PublishScreen | FR9.6·FR9.7, FR10.2 |
| BR3 | 저장소 줄, 작성 시점, 이 기록으로 알 수 없는 것, 옛 사본 | SnapshotView | FR9.1·FR9.2·FR9.4·FR9.6, NFR7 |
| BR4 | 본인 커밋 목록, 판정하는 링크, 하나와만 맞음, 링크 밖 자리, 모양, 뜻, 쓰는 곳 | GithubLinkName, SnapshotView | FR10, NFR5·NFR6 |
| BR5 | 세 AI 지시 문장, 재측정 | RagAnswer, JD 요약 | FR11.1·FR11.2, NFR2 |

## 한계

- 화면 낭독기는 진짜 표지와 작성자가 쓴 「[이 작업의 본인 커밋]」을 같은 글자로 읽는다(BR4.5).
- 본인 커밋 최근 20건 밖의 오래된 본인 커밋 링크에는 표지가 붙지 않는다(BR4.1).
- 같은 작업 경고가 많은 Catch는 「이 기록으로 알 수 없는 것」 목록이 길어질 수 있다(BR1.3, 상한 없음).

## Sources

- `inception/requirements-analysis/requirements.md` FR9·FR10·FR11, NFR2·NFR5·NFR6·NFR7, 가정 A1·A7
- `inception/user-stories/stories.md` US6.1~US8.1
- `inception/domain-design/components.md`
- `inception/contract-design/contract-summary.md` C3·C6·C7
- `inception/refined-mockups/mockups.md` 4절, `inception/refined-mockups/interaction-spec.md` 4절·9절
- `construction/nc1-sections-and-links/functional-design/rules.md` BR2, `frontend-components.md` 2.2·2.3
- `construction/nc2-snapshot-fields/functional-design/functional-design-questions.md` Q1~Q6
- 지금 코드: `api/src/publications/publish.service.ts`, `api/src/publications/snapshot-builder.ts`, `api/src/published-index/chunker.ts`, `api/src/rag-answer/summary-sources.ts`, `api/src/rag-answer/rag-answer-config.ts`, `api/src/jd-summary/jd-generation-request.ts`, `worker/app/candidates/build.py`, `.github/workflows/ci.yml`, `web/src/lib/github-link-name.ts`, `web/src/features/publications/github-link.tsx`, `web/src/features/publications/snapshot-view.tsx`, `web/src/features/publications/publications-api.ts`, `web/src/features/recipient/recipient-api.ts`, `web/src/features/publications/publications.module.css`
