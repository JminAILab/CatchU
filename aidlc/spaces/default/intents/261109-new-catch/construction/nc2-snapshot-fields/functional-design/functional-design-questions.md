# NC2 면접관 사본 칸과 표지 — 기능 설계 질문

## 질문의 범위

- 입력:
  - Unit `inception/units-generation/unit-of-work.md` NC2(service), 이야기 US6.1~US6.5, US7.1·US7.2, US8.1(8개)
  - 요구사항 FR9·FR10·FR11.1, NFR2·NFR5·NFR6·NFR7, 다듬은 화면 `inception/refined-mockups/` 4절·interaction-spec 4절·9절
  - 구성 요소 Publications·SnapshotView·GithubLinkName·RecipientScreen·RagAnswer·PublishedIndex
  - 계약 C3·C6·C7, NC1 기능 설계 `construction/nc1-sections-and-links/functional-design/`
- 이미 정해진 것은 묻지 않는다.
  - 사본 선택 칸 넷(`repositoryName`·`authorDescriptionEditedMonth`·`workLimits`·`evidence[].ownCommit`)과 모양(C3)
  - 한계 문장 골라내기는 api 상수 여섯과의 문장 대조(C6), worker 문장은 바꾸지 않음
  - 표지 비교 규칙(FR10.3), 화면 자리(다듬은 화면 4절·9절), 작성 시점은 한국 시간 달
- 아래는 계약 「Open questions」와 요구사항·다듬은 화면이 기능 설계로 넘긴 것 가운데 사람이 정할 것이다.
- 가장 단순한 안을 A로 둔다.

## Q1. [설계] 발행할 때 저장소 이름을 어디서 읽고, 못 읽으면 어떻게 할까요?

**배경:** 계약 C3은 「발행 때 저장소 등록에서 읽는다」까지만 정했다. 지금 발행은 Catch의 분석 요청(`analysis_request.repository_id`)까지 읽고, 저장소 식별값이 없으면 이미 발행을 거부한다(`PublishIntegrityError('sourceRequest')`). 저장소 등록 표(`repository_registration`)에는 회원·저장소 식별값마다 `owner`·`name`이 하나씩 있고, 지금 코드에는 등록을 지우는 길이 없다(회원 탈퇴 때만 함께 지워진다).

A. 발행 잠금 조회에 저장소 등록 표를 (회원, 저장소 식별값)으로 이어 `owner/name`을 읽는다. 등록 행이 없으면 그 Catch 사본에 `repositoryName` 칸을 넣지 않고 발행은 그대로 한다(면접관 화면에 저장소 줄만 없다). (가장 단순)
B. A처럼 읽되, 등록 행이 없으면 지금 `sourceRequest`처럼 발행을 거부한다. 저장소 줄이 빠진 사본이 생기지 않는다. 대신 지금 코드로는 생기지 않는 경우를 위한 오류 갈래와 시험이 하나 더 든다.
C. 등록 표를 읽지 않고 첫 GitHub 근거 주소의 `소유자/저장소`를 쓴다(web의 `evidenceRepositoryOf`와 같은 셈). 조인이 없다. 대신 계약 C3의 「저장소 등록에서 읽는다」를 바꿔야 하고, GitHub 근거가 없는 Catch는 이름이 없다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

**덧붙임(사람 원문):** 등록 행이 없는 경우는 DB가 막는다. analysis_request.registration_id는 NOT NULL이고 (member_id, registration_id, repository_id)로 repository_registration을 가리키는 외래 키가 있다. 칸을 빼는 갈래는 안전망으로만 두고 시험은 하나면 된다.

**확인:** 마이그레이션 `api/src/database/migrations/1793245460352-AddRepositoryRegistration.ts`에서 `analysis_request.registration_id uuid NOT NULL`과 외래 키 `fk_analysis_request_member_id_registration_id_repository_id`(ON DELETE CASCADE)를 확인했다. 그래서 조인은 `analysis_request.registration_id`로 한다.

## Q2. [설계] 「이 기록으로 알 수 없는 것」 목록에 개수 상한을 둘까요?

**배경:** 같은 작업 경고는 괄호 안(PR 번호·커밋 식별값)이 달라 「같은 문장은 한 번」만으로는 수가 정해지지 않는다. 결과 메시지 계약에도 `coverageLimits` 수 상한이 없다. 계약은 「시연 저장소의 실제 개수를 보고 정한다」고 했지만, 지금 로컬 DB가 떠 있지 않아 실제 개수는 재지 못했다. 경고는 같은 작업 후보 한 쌍마다 하나가 생긴다.

A. 상한을 두지 않는다. 모든 근거의 한계를 근거 순서대로 읽어 대조에 맞는 문장을 고르고, 같은 문장은 처음 것 하나만 둔다. (가장 단순)
B. 앞에서부터 5개까지만 담는다. 경고가 많은 작업에서 목록이 길어지는 것을 막는다. 대신 자르는 규칙과 시험이 더 들고, 몇 개를 뺐는지 알리지 않으면 면접관이 빠진 한계를 모른다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Q3. [화면] 「이 작업의 본인 커밋」 표지를 링크 안에 둘까요, 링크 밖에 둘까요?

**배경:** FR10.3은 표지를 「판본·커밋 이름 바로 뒤」에 둔다. NC1에서 더한 커밋 화면 바뀐 줄 링크는 이름이 「커밋 ba6bba8 · 바뀐 줄 16–23」이라, 「커밋 ba6bba8」 바로 뒤는 링크 글자 한가운데다(NC1 코드 `github-link-name.ts`의 주석도 「줄 꼬리 앞」으로 적었다). 한편 승인된 interaction-spec 4절은 「표지는 누르는 것이 아님」이라고 적었다. 링크 안에 두면 표지 글자를 눌러도 링크가 열린다(따로 초점을 받지는 않는다).

A. 표지를 링크 글자 안, 판본·커밋 이름 바로 뒤에 둔다. 바뀐 줄 링크는 「커밋 ba6bba8 [표지] · 바뀐 줄 16–23」이다. 표지는 링크의 접근 이름에 함께 읽히고 따로 초점을 받지 않는다. 링크를 하나로 둔 채 FR10.3 자리를 지킨다. 표지 글자를 누르면 링크가 열리는 것은 interaction-spec 4절 「누르는 것이 아님」과 어긋나므로, 그 문장을 「따로 누르는 것이 아님(링크와 함께 눌림)」으로 읽는다. (가장 단순)
B. 표지를 링크 밖, 링크 바로 뒤에 둔다. 표지는 눌리지 않는다. 대신 바뀐 줄 링크는 표지가 「바뀐 줄 16–23」 뒤로 가서 FR10.3 「커밋 이름 바로 뒤」와 어긋나고, 그 링크만은 이름을 둘로 나눠 그리는 갈래가 하나 더 든다.
X. Other (please specify)

[Answer]: B (2026-11-10, **Mode:** chat)

**덧붙임(사람 원문):** 표지는 늘 링크 밖, 링크 바로 뒤에 둔다(interaction-spec 4절 「표지는 누르는 것이 아님」). 바뀐 줄 링크도 이름을 나누지 않고 링크 전체 뒤에 붙인다. 파일·커밋 링크는 이름 끝이 판본·커밋 이름이라 FR10.3 자리와 같고, 바뀐 줄 링크는 본인 커밋의 바뀐 줄을 가리키므로 링크 뒤 표지도 뜻이 같다. 이 읽기를 기능 설계에 적는다.

## Q4. [화면] 표지를 작성자가 글로 쓴 「[이 작업의 본인 커밋]」과 어떻게 구별할까요?

**배경:** NFR5는 작성자가 글로 표지를 흉내 내도 진짜 표지와 화면 모양이 달라야 한다고 한다(AC7.2.6). 작성자 글은 React 텍스트로만 그리므로 흉내 글은 늘 일반 글자다. 새 색은 더하지 않는다(다듬은 화면 공통). 지금 사본 화면에는 테두리 있는 작은 표지 모양(Catch 종류 표지 `kindBadge`, 불일치 표지 `warningBadge`)이 있다.

A. 진짜 표지는 지금 종류 표지와 같은 테두리 상자 모양으로 그리고, 글자는 대괄호 없이 「이 작업의 본인 커밋」이다. 화면에서는 상자와 일반 글자로 갈린다. 화면 낭독기는 둘 다 같은 글자로 읽으므로 낭독기에서는 구별되지 않는다(한계로 적는다). (가장 단순)
B. A에 더해 진짜 표지 앞에 화면 낭독기만 읽는 숨은 글자 「CatchU 표시:」를 붙인다. 낭독기에서도 흉내 글과 갈린다. 대신 링크의 접근 이름이 길어지고, 숨은 글자 시험이 하나 더 든다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

**덧붙임(사람 원문):** B의 숨은 「CatchU 표시:」는 작성자가 같은 글자를 쳐 넣으면 낭독기에서 똑같이 들려 구별이 되지 않으므로, A와 한계 기록으로 한다.

## Q5. [AI] 기본 요약·질의응답 지시에 더할 문장을 이렇게 할까요?

**배경:** 지금 지시는 질의응답 「발행본 자료만으로 질문에 답하고, 근거가 되는 줄을 인용하며, 자료에 없는 일은 없다고 말한다.」, 기본 요약 「자료를 다 읽기 전에 발행본 전체를 파악하도록 핵심을 7개 이하 항목으로 요약하고 근거 줄을 인용한다.」다(`api/src/rag-answer/rag-answer-config.ts`). 각 인용 문서에는 이미 「자료 종류: 작성자 자료 원문」이 붙는다. FR11.1은 작성자 자료를 「작성자는 …라고 적었다」로 옮기게 한다. 지시를 바꾼 뒤 질의응답 10개 다시 재기는 빌드와 시험에서 한다(FR11.2).

A. 두 지시 끝에 같은 문장 하나를 더한다: 「자료 종류가 작성자 자료 원문인 내용은 '작성자는 …라고 적었다'처럼 작성자의 말로 옮기고, 확인된 사실처럼 쓰지 않는다.」 (가장 단순)
B. A에 더해 「작성자 자료에 적힌 본인 기여도 GitHub 기록으로 확인된 것처럼 쓰지 않는다.」를 붙인다. 남의 기여를 지원자 것으로 쓰는 답(AC8.1.3)을 한 번 더 막는다. 대신 지시가 길어지고, 재측정 때 이 문장의 효과를 따로 가리기 어렵다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

**덧붙임(사람 원문):** JD 요약 지시(api/src/jd-summary/jd-generation-request.ts)에도 같은 문장을 붙인다. JD 요약도 작성자 자료를 근거로 쓰므로, 면접관 화면의 세 AI(기본 요약·질의응답·JD 요약)가 같은 말투를 쓰게 하기 위해서다. U10 영역이라 NC2 PR에서 U10 담당 확인을 받는다. JD 요약은 질의응답 10개 다시 재기 대상이 아니므로 효과는 따로 재지 않는다고 기록한다.

## Q6. [개발] worker·api 문장 대조 시험(C6)을 어디에 두고 어떻게 worker 원본을 읽을까요?

**배경:** 계약 C6은 api 상수 여섯이 worker `build.py`의 원본 문장과 글자까지 같은지 시험 하나로 보게 했다. 지금 CI(`ci.yml`)는 `worker/app/*`가 바뀌어도 api 시험을 돈다(U7 연결 시험 때문에 이미 그렇다). 그래서 worker 문장만 바뀐 PR에서도 api 쪽 시험이 돌고, CI는 고치지 않아도 된다. 여섯 문장은 모두 `build.py` 안에 이어진 글자 하나로 적혀 있다(같은 작업 경고 둘은 f-string 앞부분).

A. api 시험이 `worker/app/candidates/build.py` 파일 글자를 읽어 여섯 상수가 그대로 들어 있는지 찾는다. CI는 고치지 않는다. 문장이 줄 바꿈으로 나뉘게 고쳐지면 시험이 틀렸다고 실패하므로, 그때는 시험이 알려 주는 대로 맞춘다. (가장 단순)
B. api 시험이 worker의 Python 환경(이미 api job에 준비됨)으로 `build.py`를 불러와 상수 값을 받아 견준다. 줄 바꿈 모양과 상관없다. 대신 같은 작업 경고 두 앞부분은 상수가 아니라 f-string 안 글자라 B로도 꺼낼 수 없어, 그 둘은 결국 A처럼 파일 글자를 찾아야 한다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
