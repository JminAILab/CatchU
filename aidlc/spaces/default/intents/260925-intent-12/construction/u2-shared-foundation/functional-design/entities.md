# U2 공용 기반 — 엔티티

## Sources

작성일: 2026-10-27. 입력: [Unit 정의](../../../inception/units-generation/unit-of-work.md)(unit-of-work)의 U2, [스토리 대응](../../../inception/units-generation/unit-of-work-story-map.md)(unit-of-work-story-map), [사용자 스토리](../../../inception/user-stories/stories.md)(stories), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 FR6.4~6.8·FR14·FR19·FR20, [컴포넌트 목록](../../../inception/domain-design/components.md)(components)의 AiUsageLimit·AiConsent·AiRun·FileStorage·Withdrawal·MemberAccount·GitHubConnection, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-01~C-06, [U1 엔티티](../../u1-ai-generation-gate/functional-design/entities.md), [기능 설계 질문·답변](functional-design-questions.md) Q1~Q10, [업무 규칙](rules.md).

## 범위

U2가 저장하는 표는 둘(`daily_execution_count`, `ai_consent`)이며 모양은 계약 C-03·C-04 그대로다. 나머지는 저장하지 않는 값 객체다: AI 생성 게이트의 입출력(C-01, U1이 만든 모양에 U2가 쓰는 칸만 더함), 백그라운드 실행 값(C-02), 파일 키(C-05), 탈퇴 단계(C-06), 통합 확인 표 행(DB가 아니라 문서의 표 행). 기존 MemberAccount·AuthSession·GitHubConnection은 10월 그대로 쓰고 바꾸지 않는다. 자료형은 논리 자료형이며 특정 언어를 가리키지 않는다.

`GatedItem.jdRole`과 `GatedItem.kind`의 값 `SERVER_NOTICE`는 계약 C-01에 아직 없다(Q9, 기능 설계 1차 수정 요청). 이 설계는 계약 문서를 고치지 않고, 이 모양을 통합 브랜치 대상 계약 수정 PR로 U2 코드 생성 전에 올려 U10 담당의 PR 리뷰로 맞춘다(functional-spec.md 「계약 변경 제안」).

```yaml
entities:
  # 저장하는 표 (U2 소유)
  - name: DailyExecutionCount
    description: 회원 한 명의 하루 실행 횟수(C-03 표 daily_execution_count)
    owner: AiUsageLimit(U2)
    attributes:
      - { name: memberId, type: uuid, required: true, references: MemberAccount.memberId, constraints: "ON DELETE CASCADE" }
      - { name: usageDate, type: date, required: true, constraints: "한국 시간 날짜(BR1.2)" }
      - { name: count, type: integer, required: true, min: 0, max: 30, default: 1, constraints: "CHECK count >= 0. 30은 코드 상수로 판정하며 DB 제약은 두지 않는다(BR1.3·BR1.7)" }
    constraints:
      - "primary key (memberId, usageDate)"
    relationships:
      - { to: MemberAccount, cardinality: "many-to-one", direction: "DailyExecutionCount -> MemberAccount" }
  - name: AiConsent
    description: 외부 AI 전송 첫 이용 동의 한 건(C-04 표 ai_consent)
    owner: AiConsent(U2)
    attributes:
      - { name: consentId, type: uuid, required: true, unique: true }
      - { name: memberId, type: uuid, required: true, references: MemberAccount.memberId, constraints: "ON DELETE CASCADE" }
      - { name: noticeVersion, type: string, required: true, constraints: "동의할 때의 고지 판본. 현재 판본은 코드 상수(BR2.1)" }
      - { name: consentedAt, type: timestamp, required: true }
    constraints:
      - "unique (memberId, noticeVersion)"
    relationships:
      - { to: MemberAccount, cardinality: "many-to-one", direction: "AiConsent -> MemberAccount" }

  # 기존 엔티티 (10월, U2가 탈퇴·로그인에서 쓰기만 함)
  - name: MemberAccount
    description: 회원 계정(10월 member_account). 행 삭제가 연쇄 삭제의 기점(BR7.3)
    owner: MemberAccount(10월)
    attributes:
      - { name: memberId, type: uuid, required: true, unique: true }
      - { name: googleSubject, type: string, required: true, unique: true, constraints: "탈퇴 뒤 같은 값으로 로그인하면 새 행(BR7.6)" }
      - { name: createdAt, type: timestamp, required: true }
  - name: AuthSession
    description: 로그인 세션(10월). 탈퇴 1단계에서 회원의 모든 세션을 폐기한다(BR7.2)
    owner: MemberAccount(10월)
    attributes:
      - { name: sessionId, type: uuid, required: true, unique: true }
      - { name: memberId, type: uuid, required: true, references: MemberAccount.memberId }
      - { name: expiresAt, type: timestamp, required: true }
  - name: GitHubConnection
    description: GitHub 연결(10월). 자격정보 파일은 DB 밖이라 탈퇴 3단계에서 따로 지운다(BR7.3)
    owner: GitHubConnection(10월)
    attributes:
      - { name: connectionId, type: uuid, required: true, unique: true }
      - { name: memberId, type: uuid, required: true, references: MemberAccount.memberId }
      - { name: credentialRef, type: string, required: true, constraints: "DB 밖 자격정보 파일 위치" }

  # AI 생성 게이트 값 객체 (C-01, 저장 안 함)
  - name: AiGenerationRequest
    description: 생성 요청(C-01 그대로, U1 엔티티와 같음). U2는 sources·userText 길이 합으로 입력 상한을 판정하고 publicationText를 대조에 쓴다
    attributes:
      - { name: feature, type: enum, required: true, allowed: [BASE_SUMMARY, QNA, JD_SUMMARY] }
      - { name: instruction, type: string, required: true }
      - { name: sources, type: list<AiSource>, required: true, constraints: "text 길이 합 + userText 길이 <= 80000(BR3.1)" }
      - { name: userText, type: string, required: false, default: null, constraints: "질문 또는 JD 요구사항 줄. 신뢰하지 않는 입력. JD_SUMMARY는 한 호출에 요구사항 한 줄(BR4.5). JD 면접 질문 영어 표기 허용과 '찾지 못함' 후보에 쓴다(BR4.5·BR4.7)" }
      - { name: publicationText, type: string, required: false, default: null, constraints: "모델에 보내지 않음. 없으면 sources 글 전체를 발행본 글로 본다(BR3.5)" }
      - { name: model, type: enum, required: true, allowed: [HAIKU, SONNET], default: HAIKU }
  - name: AiSource
    description: 근거 글 하나(C-01·U1 그대로). U2는 catchEvidenceUrls에서 Catch PR 번호를 뽑는다
    attributes:
      - { name: sourceId, type: string, required: true }
      - { name: sourceKind, type: enum, required: true, allowed: [GITHUB_RECORD, AUTHOR_MATERIAL] }
      - { name: text, type: string, required: true }
      - { name: location, type: SourceLocation, required: true }
      - { name: catchEvidenceUrls, type: list<string>, required: true, default: "[]", constraints: "'/pull/{n}'의 n을 Catch PR 번호로 허용(BR3.4)" }
  - name: GatedItem
    description: 대조를 통과한 항목 하나(C-01). jdRole과 kind의 SERVER_NOTICE는 계약 변경 제안
    attributes:
      - { name: kind, type: enum, required: true, allowed: [CITED, AI_INTERPRETATION, SERVER_NOTICE], constraints: "SERVER_NOTICE는 서버가 만든 '찾지 못함' 안내(BR4.7)에만 쓰며 'AI 해석' 표시를 붙이지 않는다(제안 값)" }
      - { name: text, type: string, required: true }
      - { name: citations, type: list<ItemCitation>, required: true, default: "[]", constraints: "CITED만 비지 않음(U1)" }
      - { name: jdRole, type: enum, required: false, default: null, allowed: [EVIDENCE, UNCONFIRMED, INTERVIEW_QUESTION], constraints: "feature가 JD_SUMMARY일 때만 채움(BR4.2·BR4.8). 계약 수정 PR 전까지는 U2 안에서만 쓰는 제안 칸" }
  - name: ItemCitation
    description: 항목의 인용 하나(C-01·U1 그대로). quote는 대조 대상 글이다(BR3.4)
    attributes:
      - { name: sourceId, type: string, required: true }
      - { name: quote, type: string, required: true }
      - { name: location, type: SourceLocation, required: true }
      - { name: sourceLabel, type: enum, required: true, allowed: ["GitHub 기록 원문", "작성자 자료 원문"] }
  - name: GatedOutput
    description: 게이트 결과(C-01). 남은 항목이 0개여도 정상 결과(BR3.7)
    attributes:
      - { name: items, type: list<GatedItem>, required: true }
      - { name: droppedCount, type: integer, required: true, min: 0, constraints: "U1 버림 + U2 대조·역할 버림. 서버가 만든 '찾지 못함' 항목은 세지 않음(BR4.7). 화면에 보이지 않음" }
  - name: CheckTokens
    description: 한 글에서 뽑은 대조 낱말 묶음. 게이트 안에서만 쓴다(BR3.3)
    attributes:
      - { name: numbers, type: set<string>, required: true }
      - { name: prNumbers, type: set<string>, required: true }
      - { name: fileNames, type: set<string>, required: true }
      - { name: englishTerms, type: set<string>, required: true, constraints: "소문자. 예외 약어 15개 제외. 한 글자 포함" }

  # 백그라운드 실행 값 (C-02, 상태 행은 호출 Unit 표에 있음)
  - name: AiRunJob
    description: 큐 작업 하나. 저장 표가 없고 상태는 호출 Unit의 실행 상태 표가 가진다
    attributes:
      - { name: kind, type: enum, required: true, allowed: [EMBED_PUBLICATION, BASE_SUMMARY, JD_SUMMARY] }
      - { name: runKey, type: string, required: true, unique: true, constraints: "콜론 없음, 비지 않음. 작업 ID로 씀(BR5.3)" }
      - { name: payload, type: object, required: true, constraints: "EMBED_PUBLICATION·BASE_SUMMARY: { publicationId }, JD_SUMMARY: { runId }" }
  - name: RunStatusRow
    description: 호출 Unit 표(publication_index·base_summary·jd_summary_run)의 실행 상태 칸 규약
    attributes:
      - { name: status, type: enum, required: true, allowed: [PENDING, DONE, FAILED] }
      - { name: deadlineAt, type: timestamp, required: true, constraints: "등록 시각 + 그 종류의 처리 시한(값은 각 Unit)" }

  # 파일 키 (C-05)
  - name: StorageKey
    description: 파일 저장 키. 계약의 키 배치만 허용(BR6.2)
    attributes:
      - { name: value, type: string, required: true, constraints: "members/{memberId}/ 로 시작. '..'·빈 마디·역슬래시·절대 경로 금지" }

  # 탈퇴 단계 (C-06, 저장 안 함)
  - name: WithdrawalStep
    description: 탈퇴 순서의 한 단계. 실패 단계 번호만 로그에 남긴다(BR7.4)
    attributes:
      - { name: step, type: enum, required: true, allowed: [BLOCK_ACCESS, DELETE_FILES, DELETE_GITHUB_CREDENTIAL, DELETE_MEMBER] }

  # 통합 확인 표 행 (문서, DB 아님)
  - name: IntegrationCheckRow
    description: docs/CatchU_통합확인.md 확인 표의 한 행(BR9.4)
    attributes:
      - { name: date, type: date, required: true }
      - { name: round, type: enum, required: true, allowed: ["1차", "2차", "추가"] }
      - { name: scenario, type: string, required: true, constraints: "표 위 시나리오 목록의 이름" }
      - { name: targetVersion, type: string, required: true, constraints: "커밋 SHA 또는 배포 태그" }
      - { name: environment, type: string, required: true, constraints: "예: 개발 서버(EC2), EKS" }
      - { name: result, type: enum, required: true, allowed: ["통과", "실패", "미실행"] }
      - { name: note, type: string, required: false, constraints: "막힌 곳·대신하지 않은 이유. 비밀값·사용자 자료 금지" }
```

## 요약

- 저장 표는 `daily_execution_count`(회원·한국 날짜별 실행 횟수)와 `ai_consent`(회원·고지 판본별 동의) 둘이고, 둘 다 회원 행을 따라 지워진다.
- 게이트 값 객체는 C-01과 U1 모양 그대로이며, U2가 더하는 것은 대조 낱말 묶음(`CheckTokens`, 게이트 안에서만 씀)과 계약 변경 제안인 `GatedItem.jdRole` 칸·`kind` 값 `SERVER_NOTICE`다.
- 실행 상태 행·발행본·MCP 표는 다른 Unit 소유다. U2는 상태 판정 함수와 탈퇴 1단계의 갱신·삭제만 한다.
- 통합 확인 표는 DB가 아니라 저장소 문서의 표다.
