# CR2 소속 저장 — 업무 규칙

입력: 요구사항 FR1·NFR4·NFR6, 스토리 US1.1~US1.3, ADR-001~003, 계약 C1·C2, 이 단계의 답 `functional-design-questions.md`(Q1 A, Q2 A), 지금 코드(`worker/app/candidates/grouping.py`·`build.py`, `worker/app/generation/material.py`, `api/src/catches/registration-service.ts`).

BR1은 worker의 소속 커밋 빼기와 열쇠, BR2는 worker가 주고받는 메시지, BR3은 api의 소속 기록, BR4는 배포다.

```yaml
rules:
  # BR1 worker — 소속 커밋 빼기와 열쇠 (CandidateGrouping)
  - id: BR1.1
    statement: 단위의 변경 하나가 소속 변경인지는 그 변경의 SHA 가운데 하나라도 소속 커밋 집합에 있는지로 정한다.
    category: calculation
    applies_to: CandidateGrouping의 변경(AssignedChange)
    trigger: 단위를 다 정한 뒤
    logic: >
      IF 변경의 관측 커밋(commits)이나 본인 기여 커밋(own_commits) 가운데 하나라도 소속 커밋 집합에 있다
      THEN 그 변경 전체를 소속 변경으로 본다(같은 변경은 하나로 센다는 지금 규칙).
    violation: 해당 없음(계산)
    source: FR1.3

  - id: BR1.2
    statement: 소속 변경은 단위를 지금 규칙대로 다 정한 뒤 각 단위에서 뺀다. 단위를 정하는 규칙(병합·관계·묶기·보류)은 소속 커밋을 그대로 본다.
    category: policy
    applies_to: CandidateGrouping
    trigger: 후보 판정과 생성 재료 찾기에서 단위를 만들 때
    logic: >
      단위·보류를 지금과 같이 만든다. 그다음 각 단위에서 BR1.1의 소속 변경을 지운다.
      보류한 변경(held)과 관측 기록은 바꾸지 않는다.
    violation: 해당 없음
    source: FR1.3 (Q1 A)

  - id: BR1.3
    statement: PR 단위와 PR 없이 합친 병합 단위는 열쇠를 그대로 두고, 커밋 묶음 단위는 남은 커밋으로 열쇠를 새로 만든다.
    category: calculation
    applies_to: 뺀 뒤 단위의 작업 동일성 열쇠
    trigger: BR1.2 뒤
    logic: >
      IF 단위가 PR이나 병합 THEN 열쇠는 지금처럼 PR 번호나 병합 커밋으로 만든다.
      IF 단위가 커밋 묶음 THEN 남은 변경의 관측 커밋만으로 커밋 묶음 값을 만들어 열쇠를 낸다
      (열쇠 만드는 법 wi1은 그대로, 넣는 커밋만 남은 것).
    violation: 해당 없음
    source: FR1.5, FR1.8, FR1.7

  - id: BR1.8
    statement: 소속 변경을 뺀 커밋 묶음은 남은 커밋 사이의 연결만 근거로 적고, 남은 커밋이 소속 커밋을 거쳐 이어졌으면 그것을 고정 문장으로 적는다. 연결이 비어도 분석을 멈추지 않는다.
    category: calculation
    applies_to: 뺀 뒤 커밋 묶음 단위의 묶음 근거(부모·같은 변경 연결)와 묶음 설명
    trigger: BR1.2에서 커밋 묶음 단위의 변경을 하나 이상 뺐을 때
    logic: >
      부모 연결과 같은 변경 연결은 두 끝이 모두 남은 커밋인 쌍만 남긴다.
      남은 커밋이 둘 이상이면 묶음 설명에 고정 문장 「이미 다른 Catch에 속한 커밋을 거쳐 이어진 커밋도 한 묶음에 두었다.」를 더한다
      (남은 연결이 없으면 이 문장이 연결 근거의 전부다). 남은 커밋이 하나면 지금의 「본인 커밋 하나」 문장을 쓴다.
      같은 변경으로 하나로 센 수는 남은 변경만으로 다시 센다. 묶음 제한 메모(notes)는 그대로 둔다.
      PR·병합 단위의 단위 수준 값(다른 PR로 보낸 수, 안쪽 병합 배정 수, 메모)은 단위 전체 성질이라 그대로 둔다.
    violation: 해당 없음(빼기 뒤에는 연결 없는 여러 커밋 묶음이 정상이므로 지금의 결함 처리를 타지 않는다)
    source: FR1.8, FR1.3

  - id: BR1.4
    statement: 소속 변경을 하나 이상 뺀 단위에 본인 기여 변경이 남지 않으면 그 단위는 후보가 아니며, 미제공 수에도 세지 않는다.
    category: constraint
    applies_to: 뺀 뒤 단위
    trigger: BR1.2 뒤
    logic: >
      IF 이 단위에서 소속 변경을 하나 이상 뺐고, 남은 변경 가운데 기여 근거이면서 본인 커밋이 있는 변경이 없다
      THEN 단위를 버린다. 후보도 미제공 사유(근거 부족·기준 미달·판정 불가)도 아니다.
      IF 뺀 변경이 없다 THEN 지금 판정을 그대로 한다(미제공 집계 포함).
    violation: 해당 없음
    source: FR1.3, FR1.7

  - id: BR1.5
    statement: 뺀 뒤 단위로 후보를 만들 때 본인 기여 판정·기록의 글·작업 사실·근거는 남은 변경으로만 정한다. 판정하는 법은 바꾸지 않는다.
    category: policy
    applies_to: 후보 만들기(build)
    trigger: 뺀 뒤 단위가 남았을 때
    logic: >
      남은 변경의 본인 커밋으로 기여 판정·기록의 글(단위 안 첫 본인 커밋 첫 줄)·작업 사실·근거 20건을 지금 방법 그대로 정한다.
      PR을 연 계정의 PR 제목, 다른 계정 커밋이 섞였는지(other_authors)처럼 PR·병합 전체의 성질은 지금처럼 단위 전체로 본다.
    violation: 해당 없음
    source: FR1.3, FR1.7

  - id: BR1.6
    statement: 후보 판정과 생성 재료 찾기는 같은 수집 결과와 같은 소속 커밋 집합으로 같은 빼기를 해, 같은 단위·열쇠를 얻는다.
    category: constraint
    applies_to: CandidateGrouping, DraftGeneration 재료 찾기
    trigger: 요청 하나를 처리할 때
    logic: >
      소속 커밋 집합은 그 시도의 맥락 조회에서 한 번 받아 두 곳에 같은 값으로 넘긴다.
      빼기는 한 함수가 한다. 같은 수집 결과와 같은 집합이면 몇 번을 돌려도 열쇠·본인 커밋 목록이 같다.
    violation: 생성 재료 찾기에서 후보에 맞는 단위가 없으면 지금처럼 결함(ValueError)으로 멈춘다
    source: NFR4, FR1.3

  - id: BR1.7
    statement: 소속 커밋 집합이 비면(첫 분석, 합성 요청, FR10 확인 명령) 결과는 지금과 같다.
    category: policy
    applies_to: CandidateGrouping
    trigger: 집합이 빈 요청
    logic: IF 소속 커밋 집합이 비었다 THEN 뺄 것이 없어 단위·후보·열쇠·미제공 수가 지금과 같다
    violation: 해당 없음
    source: FR1.7

  # BR2 worker — 메시지 (AnalysisProcessing·AnalysisMessageContract)
  - id: BR2.1
    statement: 후보마다 본인 커밋 목록 전체를 결과 메시지의 ownCommitShas에 싣는다.
    category: calculation
    applies_to: 결과 메시지의 후보
    trigger: 결과를 조합할 때
    logic: >
      ownCommitShas는 근거 20건을 고르던 본인 커밋 목록 전체다(최근 것부터, 중복 없음).
      같은 열쇠의 후보를 하나로 합칠 때는 남긴 후보의 목록 뒤에 다른 후보의 새 SHA를 처음 나온 순서로 잇는다.
      다른 계정 커밋은 넣지 않는다. 합성(MOCK) 요청도 같은 규칙으로 합성 수집 결과의 본인 커밋 SHA를 싣는다(실제 방식과 다른 길을 두지 않는다).
    violation: 비거나 3,000개를 넘으면 지금 결과 검사가 결과를 거부한다(계약 C2)
    source: FR1.4

  - id: BR2.2
    statement: 결과 메시지의 판본은 "3"이고, 요청·진행 상태·수신 응답의 판본은 "2" 그대로다.
    category: constraint
    applies_to: worker 결과 조합, api 수신 검사, 공유 계약 파일
    trigger: 결과를 보내고 받을 때
    logic: worker는 "3"으로 보내고 api는 "3"만 받는다. "2" 결과는 지금의 스키마 거부로 끝난다
    violation: api가 REJECTED·SCHEMA_INVALID로 응답한다
    source: FR1.4, NFR6

  - id: BR2.3
    statement: worker는 맥락 조회 응답의 assignedCommitShas를 반드시 읽고, 칸이 없거나 모양이 틀리면 응답을 받지 않는다.
    category: validation
    applies_to: worker 맥락 조회 해석(request_context)
    trigger: 시도마다 맥락 조회 응답을 받을 때
    logic: >
      칸 목록이 정확히 맞아야 받는 지금 규칙에 assignedCommitShas를 더한다.
      값은 소문자 16진수 40자 SHA의 중복 없는 배열이다. 빈 배열은 정상이다.
    violation: 지금 맥락 조회 해석 실패와 같이 CONTEXT_RESPONSE_INVALID로 끝난다(응답 원문을 남기지 않음)
    source: FR1.2, NFR6

  # BR3 api — 소속 기록 (WorkerContext·CatchRegistry·ResultReceiving)
  - id: BR3.1
    statement: 맥락 조회는 그 시도의 회원과 분석 요청 저장소 ID의 소속 기록 SHA 전체를 돌려준다.
    category: policy
    applies_to: WorkerContext 응답
    trigger: worker가 시도마다 맥락 조회를 부를 때
    logic: >
      회원 = 분석 요청의 회원, 저장소 = 분석 요청의 저장소 ID. 순서는 정하지 않고 상한을 두지 않는다.
      소속이 없으면 빈 배열이다. 소속 기록은 읽기만 한다.
    violation: 소속 기록 조회가 실패하면 지금처럼 500 INTERNAL_ERROR다
    source: FR1.2

  - id: BR3.2
    statement: Catch 등록은 Catch를 만들거나 잇는 같은 트랜잭션에서, 등록하는 후보의 본인 커밋 목록을 그 Catch의 소속으로 쓴다.
    category: policy
    applies_to: CatchRegistry 등록
    trigger: 결과 반영이 후보를 등록할 때
    logic: >
      같은 열쇠의 후보마다(새로 만든 Catch든 기존 Catch에 이은 것이든) Catch를 찾은 뒤
      그 열쇠 후보들의 ownCommitShas 합집합을 (회원, 분석 요청 저장소 ID, SHA, 그 Catch)로 쓴다.
      결과의 후보는 모두 적합 후보라 모두 등록되고, 부적합 후보가 오면 지금처럼 등록 묶음 준비가 오류로 결과 반영을 실패시킨다.
      합성(MOCK) 결과도 같은 규칙으로 소속을 쓴다.
    violation: 쓰기가 DB 오류로 실패하면 결과 반영 전체가 롤백되고 지금처럼 반영 실패로 기록된다
    source: FR1.1, FR1.4, FR1.5

  - id: BR3.3
    statement: 이미 기록된 (회원, 저장소, SHA)가 다시 오면 같은 Catch든 다른 Catch든 조용히 건너뛰고, 저장된 소속을 바꾸지 않는다.
    category: constraint
    applies_to: 소속 기록 쓰기
    trigger: BR3.2
    logic: 유일 조건이 걸리는 행은 쓰지 않고 넘어간다. 결과 반영을 실패시키지 않는다
    violation: 해당 없음(무시가 정상 동작)
    source: FR1.1, NFR4

  - id: BR3.4
    statement: 기존 Catch에 이을 때 Catch의 제목·작업 사실·근거·초안·작성자 설명 두 칸·저장 시각은 쓰지 않는다.
    category: constraint
    applies_to: CatchRegistry 등록의 기존 Catch 경로
    trigger: 같은 열쇠의 Catch가 이미 있을 때
    logic: 지금처럼 참조 등록만 하고, 이 경로에서 더하는 쓰기는 BR3.2의 소속 행뿐이다
    violation: 해당 없음
    source: FR1.5

  - id: BR3.5
    statement: 같은 수신 기록의 등록을 다시 부르면(이미 저장된 등록 묶음 재응답) 소속을 다시 쓰지 않는다.
    category: policy
    applies_to: CatchRegistry 등록의 재응답 경로
    trigger: 같은 결과 수신 기록에 등록이 이미 있을 때
    logic: 소속은 처음 등록한 트랜잭션에서 이미 써졌다. 재응답은 지금처럼 저장된 묶음만 돌려준다
    violation: 해당 없음
    source: FR1.1

  - id: BR3.6
    statement: 소속 기록은 그 Catch의 주인 회원으로만 쓸 수 있다.
    category: authorization
    applies_to: 소속 기록 쓰기
    trigger: BR3.2
    logic: >
      소속 행의 회원은 등록 입력의 주인 회원이다. (Catch ID, 회원)이 Catch의 (catchId, ownerId)와 맞아야 하며,
      맞지 않으면 DB 외래 키가 거부한다.
    violation: DB 거부 → 결과 반영 롤백(결함)
    source: FR1.1

  - id: BR3.7
    statement: 소속 기록은 Catch를 따라서만 지워지고, 탈퇴 때 회원의 소속 기록은 0건이 된다.
    category: policy
    applies_to: 소속 기록 삭제
    trigger: 회원 탈퇴 또는 분석 요청 삭제로 Catch가 지워질 때
    logic: Catch가 지워지면 연쇄 삭제로 그 소속 기록이 지워진다. 탈퇴 서비스 코드는 바꾸지 않고 삭제 목록 문서에 행만 더한다
    violation: 탈퇴 연쇄 삭제 시험이 연쇄 삭제가 아닌 외래 키를 잡는다
    source: FR1.6

  # BR4 배포
  - id: BR4.1
    statement: 맥락 조회 응답과 결과 판본 변경은 api·worker를 같은 배포에 넣고, 진행 중인 분석이 없을 때 배포한다.
    category: policy
    applies_to: CR2 배포
    trigger: CR2를 통합 브랜치·개발 서버에 넣을 때
    logic: 옛 판본을 함께 받는 처리는 만들지 않는다. 큐에 남은 옛 판본 작업은 실패로 끝나도 된다
    violation: 판본이 어긋나면 맥락 조회 해석 실패(BR2.3)나 결과 스키마 거부(BR2.2)로 그 분석이 실패한다
    source: NFR6
```

## 규칙 요약

| ID | 범주 | 규칙 | 출처 |
|---|---|---|---|
| BR1.1 | calculation | 변경의 SHA 하나라도 소속이면 그 변경 전체가 소속 변경 | FR1.3 |
| BR1.2 | policy | 단위를 다 정한 뒤 각 단위에서 소속 변경을 뺀다(Q1 A) | FR1.3 |
| BR1.3 | calculation | PR·병합은 열쇠 그대로, 커밋 묶음은 남은 커밋으로 새 열쇠 | FR1.5·FR1.8·FR1.7 |
| BR1.8 | calculation | 뺀 커밋 묶음은 남은 연결만, 소속 커밋을 거친 이음은 고정 문장, 연결이 비어도 멈추지 않음 | FR1.8·FR1.3 |
| BR1.4 | constraint | 뺀 뒤 본인 기여 변경이 없으면 후보 아님, 미제공에도 안 셈 | FR1.3·FR1.7 |
| BR1.5 | policy | 기여·기록의 글·작업 사실·근거는 남은 변경으로, 판정법은 그대로 | FR1.3·FR1.7 |
| BR1.6 | constraint | 후보 판정과 재료 찾기가 같은 집합·같은 함수로 뺀다 | NFR4 |
| BR1.7 | policy | 집합이 비면 지금과 같다 | FR1.7 |
| BR2.1 | calculation | 결과의 후보에 본인 커밋 목록 전체(ownCommitShas) | FR1.4 |
| BR2.2 | constraint | 결과 판본 "3", 나머지 "2" | FR1.4·NFR6 |
| BR2.3 | validation | worker가 assignedCommitShas를 필수로 읽음 | FR1.2·NFR6 |
| BR3.1 | policy | 맥락 조회가 회원·저장소의 소속 SHA 전체를 줌 | FR1.2 |
| BR3.2 | policy | 등록과 같은 트랜잭션에서 소속 쓰기(새 Catch·기존 Catch 모두) | FR1.1·FR1.4·FR1.5 |
| BR3.3 | constraint | 이미 있는 소속은 조용히 건너뜀, 바꾸지 않음 | FR1.1·NFR4 |
| BR3.4 | constraint | 기존 Catch 내용·설명은 쓰지 않음 | FR1.5 |
| BR3.5 | policy | 등록 재응답은 소속을 다시 쓰지 않음 | FR1.1 |
| BR3.6 | authorization | 소속은 Catch 주인 회원으로만, DB가 막음 | FR1.1 |
| BR3.7 | policy | 소속은 Catch를 따라서만 지워짐, 탈퇴 뒤 0건 | FR1.6 |
| BR4.1 | policy | api·worker 함께, 진행 중 분석 없을 때 배포 | NFR6 |
