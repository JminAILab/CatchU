# Catch 개편 — 작업 단위(Unit)

입력:
- 구성 요소 `inception/domain-design/components.md`, 설계 결정 `inception/domain-design/decisions.md`(ADR-001~005)
- 요구사항 `inception/requirements-analysis/requirements.md`, 스토리 `inception/user-stories/stories.md`
- 이 단계의 답 `units-generation-questions.md`(Q1 B, Q2 B, Q3 A)와 계획 승인

## Unit 목록

| Unit ID | Directory | 이름 | 종류 | 크기 | 배포 |
|---|---|---|---|---|---|
| CR1 | `cr1-readable-catch` | 규칙 쪽 Catch | service | M | 기존 worker·web에 함께 들어감(shared) |
| CR2 | `cr2-commit-assignment` | 소속 저장 | service | M | 기존 api·worker에 함께 들어감(shared). api·worker 동시 배포 |
| CR3 | `cr3-ai-drafts` | AI 쪽 | service | L | 기존 api·worker·web에 함께 들어감(shared). AI 쪽은 설정으로 켬 |

- **이름:** 12월 intent의 U1~U10과 같은 통합 브랜치를 쓰므로, 번호가 겹치지 않게 `CR`(Catch Redesign) 접두를 쓴다(계획 승인 때 팀장 결정). ID는 폴더 이름의 앞부분이다.
- **종류:** 세 Unit 모두 배포되는 실행 코드(api·worker·web)를 고치므로 `service`다. 새로 생기는 배포 단위는 없다.
- **크기:** CR1·CR2는 고치는 구성 요소가 규칙 코드와 저장에 한정된다(M). CR3은 새 구성 요소(Judgement)와 외부 공급자 둘, 확인 절차(FR10)가 있다(L).

## CR1 규칙 쪽 Catch (`cr1-readable-catch`)

- **설명:** 외부 AI 없이 규칙만으로, 제목과 작업 사실만 보고 무슨 작업인지 알 수 있는 Catch를 만든다. 첫 Unit 골격이다(아래 「첫 Unit 골격」).
- **경계:** worker의 후보 판정, 생성 단계의 재료 고르기·제목 결정·가리기 적용, web의 구직자·받은 사람 화면. 계약·DB·api 코드는 바꾸지 않는다.
- **맡는 것:**
  - 이슈 번호로 PR·병합을 나누지 않기(FR2.1)
  - 기록의 글(본인 PR 제목, 단위 안 첫 본인 커밋 첫 줄) 고르기, 가리기 규칙, 규칙 부실 기준(FR5.1·FR5.2). AI 쪽이 꺼져 있을 때의 제목(FR5.7)
  - 작업 사실 첫 줄은 종류만(SHA·날짜 없음), 둘째 줄은 규칙으로 정한 기록의 글(FR6.1·FR6.2·FR6.3)
  - 재료 순서(코드 → 시험 → 설정 → 문서 → 그 밖), 변경 묶음, 한 파일 상한(FR3.1~FR3.3)
  - 목록 카드 제목 2줄 제한과 접근 이름(FR8.1), 받은 사람 자동 생성 안내 문장(FR8.3), 구직자 상세의 「설명 초안」 낱말(FR8.4)
- **고치는 구성 요소:** CandidateGrouping(`worker.candidates`), DraftGeneration의 재료 고르기(`worker.generation`의 `select`)·제목 결정(AI 쪽을 껐을 때 기록의 글과 조각 제목 가운데 고르기, `title.py`와 생성 흐름)·기록의 글 가리기 적용(`redact.py`의 가리기 규칙), SeekerCatchScreens(`web.assets`), RecipientScreens(`web.recipient`)
- **구현 메모·제약:**
  - 작업 사실 둘째 줄은 CandidateGrouping이 정한다. 생성은 이 Unit에서 작업 사실을 바꾸지 않는다(ADR-005).
  - 이슈 나누기를 끄면 지금 나뉘던 단위의 작업 동일성 열쇠가 달라진다. 요구사항 FR1.7의 예외로 받아들였다.
  - 안내 문장 변경(FR8.3)은 AI 쪽 켜기와 묶지 않고 이 Unit에 넣는다(화면 초안 승인).

## CR2 소속 저장 (`cr2-commit-assignment`)

- **설명:** 커밋마다 소속 Catch를 저장해, 재분석해도 같은 커밋이 새 Catch를 만들지 않게 한다.
- **경계:** api의 Catch 등록·결과 반영·worker 맥락 조회, 공유 결과 메시지 계약, worker의 요청 처리와 단위·열쇠 계산. 화면은 바꾸지 않는다.
- **맡는 것:**
  - 소속 기록 표(CommitAssignment)와 마이그레이션, `catch_asset`의 (catch_id, owner_id) 유일 조건(ADR-002)
  - Catch 등록과 같은 트랜잭션에서 소속 쓰기, 이미 기록된 SHA는 조용히 건너뛰기(FR1.1, ADR-001)
  - 맥락 조회 응답의 소속 커밋 목록(FR1.2, ADR-003)
  - 소속 커밋 제외와 단위 종류별 열쇠 규칙(FR1.3·FR1.8), 같은 목록으로 생성 단계의 단위·열쇠 다시 계산(NFR4)
  - 결과 메시지의 후보별 소속 커밋 칸과 판본 올림(FR1.4)
  - 기존 Catch에 이을 때 Catch 내용·작성자 설명 두 칸 보존(FR1.5)
  - 탈퇴 연쇄 삭제 시험과 삭제 목록 문서 행(FR1.6), 기존 작업 동일성 시험 유지(FR1.7)
- **고치는 구성 요소:** CatchRegistry(`api.catches`), WorkerContext(`api.worker-context`), ResultReceiving(`api.analysis-receiver`·`api.result-application`), AnalysisMessageContract(`contract.repository-analysis`), AnalysisProcessing(`worker.processing`·`worker.request_context`), CandidateGrouping(`worker.candidates`), DraftGeneration의 단위·열쇠 다시 계산 자리(`worker.generation`)
- **구현 메모·제약:**
  - 큐 요청 메시지는 바꾸지 않는다. 결과 메시지만 판본을 올린다. api·worker는 같은 새 판본만 받으므로 함께 배포하고, 진행 중인 분석이 없을 때 배포한다(NFR6).
  - 시한: 출시 전 마지막 DB 초기화 전.
  - 기존 PR Catch에 커밋이 더해진 후보에도 생성 호출이 나가고(CR3이 들어온 뒤 AI 쪽이 켜져 있으면 판정 호출도) 결과는 버려진다. 이 낭비는 받아들였다(ADR-001).

## CR3 AI 쪽 (`cr3-ai-drafts`)

- **설명:** 기록의 글이 부족할 때 근거로 확인된 AI 제목을 쓰고, 판정을 넘은 설명 문장만 남긴다. FR10 확인 기준을 넘을 때만 켠다.
- **경계:** worker의 새 판정 구성 요소와 생성·조립, api·web의 고지와 설명 칸. 결과 메시지 계약은 바꾸지 않는다(`NOT_GENERATED`는 이미 있다).
- **맡는 것:**
  - 판정 공급자 자리와 OpenAI·Claude·합성 어댑터, 켜고 끄기, 실패 시 다시 부르지 않기, 판정 입력 제한(FR4.1·FR4.3·FR4.4·FR4.5, NFR1·NFR2)
  - 큰 후보의 재료 판정과 그 답 적용(FR4.2)
  - Claude 제목 후보·근거 줄 지목·기계 대조, 판정으로 제목 고르기(FR5.3~FR5.6), AI 쪽이 켜진 때의 제목 우선순위(FR5.7)
  - 판정이 부실이라고 할 때 작업 사실 둘째 줄 지우기(FR6.2의 AI 쪽 부분, ADR-005)
  - 설명 문장 쓰기·판정 거르기와 AI 쪽을 껐을 때의 동작(FR7.1~FR7.5)
  - 설명 초안이 없으면 설명 칸 숨기기(FR8.2)
  - 분석 고지 v3(FR9.1), 첫 이용 고지 받는 곳·판본(FR9.2)
  - 합치기 전 확인 20개 Catch와 기준 판정(FR10.1·FR10.2, NFR3)
- **고치는 구성 요소:** Judgement(새, worker), DraftGeneration(`worker.generation`), AnalysisProcessing의 LIVE 조립(`worker.processing`), AnalysisNotice(`api.analysis-intake`), AiConsentNotice(`api.ai-consent`·`web.ai-consent`), SeekerCatchScreens(`web.assets`), RecipientScreens(`web.recipient`)
- **구현 메모·제약:**
  - OpenAI 판정 키는 SSM에 넣는다(NFR5). 공유 인프라 변경은 팀장이 맡는다.
  - 고지 v3와 첫 이용 고지 판본은 AI 쪽을 켜는 배포와 함께 넣는다. 문구는 그 PR에서 팀장이 승인한다.
  - FR10 기준에 못 미치면 지시문은 한 번까지만 고치고, Claude 판정으로 다시 잰다. 그래도 못 넘으면 AI 쪽을 끈 채 합친다.
  - 시험은 합성 판정 어댑터로 외부 호출 없이 한다.

## 첫 Unit 골격

CR1이 의존 그래프의 첫 Unit이고, 가장 작은 실제 연결 조각이다. 고친 후보 판정이 실제 분석 흐름에서 이어진다. 바뀐 제목·작업 사실은 결과 반영과 Catch 등록을 거쳐 구직자·받은 사람 화면에 보인다. 이 흐름은 CR2·CR3 없이 돌아간다. 계약·DB를 바꾸지 않으므로 지금의 api와 그대로 맞물린다. 무엇을 실제로 확인할지는 납품 계획에서 정한다.
