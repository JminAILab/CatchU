# Catch 개편 — 도메인 설계 질문

## 질문의 범위

- 입력: 요구사항(`inception/requirements-analysis/requirements.md`), 스토리(`inception/user-stories/stories.md`), 코드 지식(`aidlc/spaces/default/codekb/CatchU/architecture.md`·`component-inventory.md`).
- 새로 생기는 것은 소속 기록(엔티티)과 판정 공급자다. 나머지는 기존 구성 요소(worker 후보·생성·처리, api Catch·맥락 조회·결과 반영·탈퇴·고지, web 화면)를 고친다.
- 요구사항이 도메인 설계로 넘긴 열린 질문: 소속 표의 모양(저장소 식별, Catch 외래 키, 연쇄 삭제 경로).
- 가장 단순한 안을 A로 둔다.

## Q1. [설계] 소속 기록은 누가 소유하고 언제 쓸까요?

**배경:** 소속 기록은 (회원, 저장소, 커밋 SHA) → Catch다. 지금 Catch 등록(`api.catches`의 `registerCandidates`)은 결과 반영(`api.result-application`)이 연 한 트랜잭션 안에서 돈다.

A. Catch 등록(`api.catches`)이 소유하고, Catch를 만들거나 잇는 같은 트랜잭션에서 소속 기록을 쓴다. 맥락 조회(`api.worker-context`)는 읽기만 한다.
B. 소속 기록만 맡는 새 api 구성 요소를 두고, 결과 반영이 등록 뒤에 따로 부른다(트랜잭션 경계 하나 더).
C. Not yet defined — 아직 정하지 않았다.
X. Other (please specify)

[Answer]: A

**답변 시각:** 2026-11-03T15:07:45Z
**Mode:** guided

## Q2. [설계] 소속 기록은 저장소와 회원을 어떻게 가리키고, 탈퇴 때 어떻게 지울까요?

**배경:** 코드 분석에서 `catch_asset`에는 저장소 칸이 없다는 것이 드러났다. 탈퇴는 회원 행을 지워 연쇄 삭제로 회원 자료를 지운다. 연쇄 삭제가 아닌 외래 키는 탈퇴 시험이 잡는다.

A. 소속 기록에 저장소 식별 칸을 두고(분석 요청이 이미 가진 저장소 식별을 그대로 씀), Catch를 외래 키로 가리키며 Catch가 지워지면 함께 지운다(Catch는 회원 연쇄 삭제로 지워진다). `catch_asset`은 바꾸지 않는다.
B. A에 더해 회원도 외래 키로 직접 가리켜 회원 연쇄 삭제를 따로 건다(지우는 길이 둘).
C. `catch_asset`에 저장소 칸을 더하고, 소속 기록은 Catch만 가리킨다.
D. Not yet defined — 아직 정하지 않았다.
X. Other (please specify)

[Answer]: X — B를 고친 안으로 한다. 소속 기록은 (회원, 저장소, 커밋 SHA)를 유일 조건으로 두고, 저장소는 분석 요청이 가진 GitHub 저장소 ID를 쓴다. Catch는 (Catch ID, 회원) 한 쌍으로 가리키는 외래 키로 묶어, 소속 기록의 회원이 그 Catch의 주인과 다르면 DB가 거부하게 한다. 지우는 길은 하나다(회원 연쇄로 Catch가 지워지고 Catch를 따라 소속 기록이 지워진다). 이를 위해 catch_asset에 (catch_id, owner_id) 유일 조건 하나만 더하고 칸은 바꾸지 않는다.

**답변 시각:** 2026-11-03T15:07:45Z
**Mode:** guided
**사용자 원문 중 이유:** 같은 GitHub 계정을 두 회원이 연결할 수 있어(github_connection은 회원마다 하나만 막음) 같은 저장소에서 두 회원의 본인 커밋 SHA가 겹칠 수 있다. 회원을 유일 조건에 넣어야 FR1.1을 지키고 회원끼리 서로 영향을 주지 않는다. 같은 회원 일치를 한 쌍 외래 키로 막는 것은 분석 요청이 저장소 등록을 가리키는 방식과 같다.

## Q3. [설계] worker의 새 일은 어느 구성 요소에 둘까요?

**배경:** 새로 생기는 일은 판정 공급자(OpenAI·Claude·합성, 키로 켜고 끔)와 재료 순서·변경 묶음이다. 지금 재료 고르기(`select`)와 생성 공급자(`GenerationProvider`)는 `worker.generation` 안에 있다.

A. 판정은 새 구성 요소(판정 공급자 자리와 어댑터)로 따로 두고, 재료 순서·변경 묶음은 지금처럼 `worker.generation` 안에 둔다.
B. 둘 다 `worker.generation` 안에 둔다.
C. 둘 다 새 구성 요소로 따로 둔다.
D. Not yet defined — 아직 정하지 않았다.
X. Other (please specify)

[Answer]: A

**답변 시각:** 2026-11-03T15:07:45Z
**Mode:** guided

## Q4. [설계] 작업 사실 둘째 줄(기록의 글 한 줄)은 어디서 정할까요?

**배경:** 지금은 후보 판정(`worker.candidates`, #118)이 작업 사실을 만들고, 생성(`worker.generation`, #120)은 작업 사실을 바꾸지 않는다는 경계가 있다. 그런데 둘째 줄을 더할지는 부실 판정에 달렸고, AI 쪽을 켜면 그 판정은 생성 뒤에 나온다(요구사항 FR6.2·FR4.3).

A. 후보 판정이 첫 줄(종류)과 기록의 글 고르기를 맡는다. 생성 단계가 부실 판정(AI 쪽이면 판정, 끄면 규칙) 뒤 둘째 줄을 더하고 제목을 정한다. "생성은 작업 사실을 바꾸지 않는다"는 경계를 "생성은 기록의 글 한 줄만 더할 수 있다"로 고친다.
B. 후보 판정이 규칙만으로 둘째 줄까지 정하고, 생성 단계는 판정이 부실이라고 하면 그 줄을 지울 수만 있다.
C. Not yet defined — 아직 정하지 않았다.
X. Other (please specify)

[Answer]: B — 후보 판정이 첫 줄(종류)과 기록의 글 고르기, 규칙 부실 기준(FR5.2)에 따른 둘째 줄까지 정한다. AI 쪽이 켜져 있고 판정이 "무엇을 했는지 알려 주나" 0.5 미만이면 생성 단계가 그 둘째 줄을 지운다. 생성이 작업 사실에 하는 일은 이 줄 지우기 하나뿐이다.

**답변 시각:** 2026-11-03T15:07:45Z
**Mode:** guided
**사용자 원문 중 이유:** 부실은 규칙 부실이거나 판정 부실이라 판정은 줄을 지우는 쪽으로만 작동한다(FR5.2·FR5.3). AI 쪽이 꺼졌거나 생성·판정이 실패해도 규칙 결과가 남고, 생성이 작업 사실에 글을 더하는 길이 없어 FR6.3이 구조로 지켜진다.

## Consolidated Summary Confirmation

- Q1: 소속 기록은 Catch 등록(`api.catches`)이 소유하고, Catch를 만들거나 잇는 같은 트랜잭션에서 쓴다. 맥락 조회는 읽기만 한다.
- Q2: 소속 기록의 유일 조건은 (회원, GitHub 저장소 ID, 커밋 SHA)다. Catch는 (Catch ID, 회원) 한 쌍 외래 키로 가리켜 회원이 Catch 주인과 다르면 DB가 거부한다. 지우는 길은 회원 → Catch → 소속 기록 연쇄 하나다. `catch_asset`에는 (catch_id, owner_id) 유일 조건 하나만 더하고 칸은 바꾸지 않는다.
- Q3: 판정은 worker의 새 구성 요소(공급자 자리와 OpenAI·Claude·합성 어댑터)로 따로 두고, 재료 순서·변경 묶음은 `worker.generation` 안에 둔다.
- Q4: 후보 판정이 작업 사실 첫 줄, 기록의 글 고르기, 규칙 부실 기준에 따른 둘째 줄까지 정한다. AI 쪽이 켜져 있고 판정이 부실이면 생성 단계가 둘째 줄을 지운다. 생성이 작업 사실에 하는 일은 이것 하나뿐이다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
