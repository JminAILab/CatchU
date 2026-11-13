# NC2 면접관 사본 칸과 표지 — NFR 요구 질문

## 질문의 범위

- 입력:
  - NC2 기능 설계 `construction/nc2-snapshot-fields/functional-design/`(`functional-spec.md`·`rules.md`·`entities.md`)와 그 검토 `reviews/review-01.md`
  - 요구사항 NFR1~NFR8, 계약 C3·C6, 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 이미 정해진 것은 묻지 않는다.
  - 사본 칸 넷의 모양과 고르는 규칙, 한계 개수 상한 없음, 표지 자리·모양·한계(기능 설계 Q1~Q6)
  - 화면 출력 안전(React 텍스트로만), 접근성(NFR6), 옛 사본 호환(NFR7), 시험 방식(NFR8)
  - 기술 스택: 새 라이브러리 없이 지금 web(Next.js·React)과 api(NestJS·TypeORM·PostgreSQL)만 쓴다
  - NFR1 확인은 NC1과 같은 방식이다. NC2는 worker·GitHub 호출 코드를 건드리지 않고, AI 호출 수도 바꾸지 않는다(지시 글만 길어진다). PR에 그렇게 적고, 분석 전·후 호출 수 측정은 NC3 빌드와 시험에서 한 번 한다.
  - NFR3(질의응답 10개 다시 재기)은 빌드와 시험에서 한다.
- 가장 단순한 안을 A로 둔다.

## Q1. [관측] 발행 때 저장소 이름을 못 읽어 칸을 뺀 경우(안전망)를 로그에 남길까요?

**배경:** 기능 설계 BR1.1은 저장소 등록 행이 없으면 `repositoryName` 칸만 빼고 발행을 이어 간다. DB 외래 키 때문에 지금은 생기지 않는 갈래다. Construction 규칙은 「조용한 실패를 두지 않는다」이고, 지금 발행 로그(`publications-log.ts`)는 사건마다 객체 한 줄(`PUBLISH_SUCCEEDED`·`PUBLISH_FAILED` 등)을 남긴다.

A. 그 갈래에서 경고 한 줄을 남긴다. 새 사건 이름 하나(예: `SNAPSHOT_REPOSITORY_NAME_MISSING`)에 발행본 ID·회원 ID만 싣고, 저장소 이름이나 글은 싣지 않는다. 생기면 DB 쪽 문제라 알아챌 수 있다. 로그 함수 하나와 시험 한 줄이 는다. (가장 단순)
B. 로그를 남기지 않는다. 코드가 가장 적다. 대신 그 갈래가 실제로 생겨도 면접관 화면에서 저장소 줄이 빠진 것을 보기 전에는 모른다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat)

## Q2. [신뢰성] 문장 대조 시험(C6)이 파일 글자를 찾을 때 따옴표 경계까지 볼까요?

**배경:** 기능 설계 검토가 이렇게 지적했다(Major). `build.py`의 본인 커밋 기여 범위 첫 문장 「연동 계정이 작성자로 기록된 커밋」은 같은 파일의 둘째 문장(`_OWN_COMMIT_ELSEWHERE_SCOPE`)과 이슈 문장(`_ISSUE_SCOPE`) 안에도 그대로 들어 있다(99·101·107행). 그래서 부분 문자열로만 찾으면 worker가 첫 문장만 바꿔도 시험은 통과하고, 발행 때 `ownCommit`이 조용히 false가 되어 표지가 사라진다. 찾는 방식(파일 글자, Q6 A)은 그대로 두고 찾는 글자만 정하는 질문이다.

A. 상수를 큰따옴표째 찾는다(`"연동 계정이 작성자로 기록된 커밋"`). 같은 작업 경고 앞부분 둘은 f-string 시작째 찾는다(`f"같은 작업을 다시 낸 것일 수 있다(`). 「첫 문장만 바꾼 글자」로는 실패하는 반례를 시험에 넣는다. 찾는 글자만 바뀌고 품이 거의 늘지 않는다. (가장 단순)
B. 대입문을 정규식으로 찾는다(`_OWN_COMMIT_SCOPE = "…"`). 상수 이름까지 묶여 더 엄격하다. 대신 같은 작업 경고 둘은 대입문이 아니라 f-string이라 A처럼 따로 찾아야 하고, 정규식 시험이 하나 더 든다.
X. Other (please specify)

[Answer]: A (2026-11-10, **Mode:** chat). 다만 아래 설계 바꿈으로 문장 대조 대상은 한계 문장 넷(_LISTS_INCOMPLETE, _EARLIER_LIST_INCOMPLETE, 같은 작업 경고 앞부분 둘)만 남는다.

**덧붙임(사람 원문, 설계 바꿈):** 사본의 ownCommit은 기여 범위 문장 대조 대신 DB의 commit_assignment(등록 때 그 Catch의 ownCommitShas로 쓰는 본인 커밋 목록)로 정한다. 근거 주소가 /commit/<40자>이고 그 식별값이 이 Catch의 commit_assignment(회원·저장소·catch_id)에 있으면 참, 아니면 거짓이다. 병합 커밋은 이 목록에 없고 PR·이슈 근거는 커밋 주소가 아니므로 FR10.1과 같은 결과다. 그래서 api의 본인 커밋 기여 범위 상수 둘과 그 대조는 뺀다. 까닭: 문장을 베끼지 않으므로 worker 문구가 바뀌어도 표지가 조용히 사라지지 않고, 표지 이름 「이 작업의 본인 커밋」과 판단 근거(이 Catch에 속한 본인 커밋)가 그대로 맞는다. NC2 기능 설계(표지 규칙)와 계약 요약 C3·C6의 해당 줄을 이 까닭과 함께 고친다(같은 ID에 덧붙임).

**반영:** NC2 기능 설계 `rules.md` BR1.4·BR1.6·BR4.1, `entities.md`(SnapshotEvidence·CatchEvidence·CommitAssignment·OwnCommitReference), `functional-spec.md` W1·5절·6절, 계약 요약 `inception/contract-design/contract-summary.md` 「한눈에」·C3·C6에 같은 ID 덧붙임으로 고쳤다(2026-11-10).

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
