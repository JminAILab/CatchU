# U10 엔터티 모델

U10은 JdManagement의 JD와 JdSummary의 실행·요구사항 결과를 소유한다. 회원·발행본은 외부 참조이며 이 Unit이 새로 정의하지 않는다. 아래 YAML이 데이터 모양의 정본이다. 논리 모델이며 물리 스키마·마이그레이션은 이후 단계에서 작성한다.

## 논리 데이터 모델 정본

```yaml
entities:
  - name: Jd
    description: 회원이 저장한 JD 원본
    owner: JdManagement
    attributes:
      - { name: jdId, type: uuid, required: true, unique: true }
      - { name: memberId, type: uuid, required: true, references: Member.memberId }
      - { name: title, type: text, required: true, min: 1, max: 200, constraints: 공백만인 값 거부 }
      - { name: body, type: text, required: true, min: 1, max: 20000, constraints: 공백만인 값 거부 }
      - { name: createdAt, type: timestamp, required: true }
      - { name: updatedAt, type: timestamp, required: true }
    constraints:
      - 길이는 UTF-16 코드 단위이며 본문 원문과 줄 경계를 보존한다
      - memberId와 jdId 조합은 유일하다
      - 회원 삭제 시 실제 연쇄 삭제한다
  - name: JdSummaryRun
    description: 특정 발행본에 대해 회원이 접수한 새 요약 실행
    owner: JdSummary
    attributes:
      - { name: runId, type: uuid, required: true, unique: true }
      - { name: memberId, type: uuid, required: true, references: Member.memberId }
      - { name: jdId, type: uuid, required: true, references: Jd.jdId }
      - { name: publicationId, type: uuid, required: true, references: Publication.publicationId }
      - { name: status, type: enum, required: true, allowed: [PENDING, DONE, FAILED], default: PENDING }
      - { name: deadlineAt, type: timestamp, required: true }
      - { name: inputCopy, type: JdInputCopy, required: true }
      - { name: failureCode, type: enum, required: false, allowed: [DEADLINE_EXCEEDED, ALL_REQUIREMENTS_FAILED, PROCESSING_FAILED] }
      - { name: createdAt, type: timestamp, required: true }
    constraints:
      - memberId와 jdId의 복합 참조로 JD와 실행자의 소유 일치 보장
      - deadlineAt은 createdAt부터 20분 뒤
      - runId를 콜론 없는 새 runKey로 사용
      - publicationId의 소유자와 memberId는 달라도 된다
      - 회원·JD·발행본 삭제 시 실행과 입력 사본을 실제 연쇄 삭제
  - name: JdSummaryResult
    description: 원문 요구사항 하나와 처리 결과의 일대일 대응
    owner: JdSummary
    attributes:
      - { name: resultId, type: uuid, required: true, unique: true }
      - { name: runId, type: uuid, required: true, references: JdSummaryRun.runId }
      - { name: requirementIndex, type: integer, required: true, min: 0, max: 19 }
      - { name: sourceLineNumber, type: integer, required: true, min: 1 }
      - { name: jdLine, type: text, required: true, min: 1, max: 2000 }
      - { name: status, type: enum, required: true, allowed: [PENDING, DONE, FAILED], default: PENDING }
      - { name: resultKind, type: enum, required: false, allowed: [CONTENT, EMPTY] }
      - { name: evidenceItems, type: "GatedItem[]", required: true, default: [] }
      - { name: unconfirmedPoints, type: "GatedItem[]", required: true, default: [] }
      - { name: interviewQuestions, type: "GatedItem[]", required: true, default: [] }
      - { name: failureCode, type: enum, required: false, allowed: [SEARCH_FAILED, GENERATION_FAILED, INPUT_TOO_LARGE, CONTRACT_INVALID, DEADLINE_EXCEEDED, PROCESSING_FAILED] }
    constraints:
      - runId와 requirementIndex 조합은 유일하다
      - DONE에만 resultKind가 있으며 FAILED에는 failureCode가 있다
      - 개별 생성 호출 시간 초과는 일반 생성 실패와 같은 GENERATION_FAILED로 저장·조회한다
      - 전체 실행 시한 초과로 미처리된 요구사항은 DEADLINE_EXCEEDED로 구분한다
      - EMPTY는 상태가 아니라 정상 완료한 결과의 분류다
      - 서버 안내는 unconfirmedPoints에 보존하되 AI 생성 내용으로 세지 않는다
      - 실행 삭제 시 실제 연쇄 삭제한다
value_objects:
  - name: JdInputCopy
    description: 접수 당시 수정 불가능한 JD 입력
    attributes: [title, body, jdUpdatedAt, orderedRequirements]
    constraints:
      - orderedRequirements는 requirementIndex·sourceLineNumber·jdLine을 가진다
      - 비어 있지 않은 모든 줄을 원문 순서대로 포함한다
      - 이후 JD 수정으로 바뀌지 않는다
      - 회원·JD·발행본과 분리된 보존 사본을 만들지 않는다
  - name: GatedItem
    description: C-01의 출력 항목을 변형 없이 보존
    attributes: [kind, text, citations, jdRole]
    constraints:
      - kind는 CITED·AI_INTERPRETATION·SERVER_NOTICE
      - jdRole은 EVIDENCE·UNCONFIRMED·INTERVIEW_QUESTION
      - citations의 sourceId·quote·sourceLabel·location을 그대로 유지한다
      - location은 발행 사본 필드의 UTF-16 반열린 범위와 선택적 PDF 쪽이다
relationships:
  - { from: Member, to: Jd, cardinality: "1:N", direction: parent_to_child, deletion: CASCADE }
  - { from: Member, to: JdSummaryRun, cardinality: "1:N", direction: parent_to_child, deletion: CASCADE }
  - { from: Jd, to: JdSummaryRun, cardinality: "1:N", direction: parent_to_child, deletion: CASCADE, key: "memberId,jdId" }
  - { from: Publication, to: JdSummaryRun, cardinality: "1:N", direction: parent_to_child, deletion: CASCADE }
  - { from: JdSummaryRun, to: JdSummaryResult, cardinality: "1:N", direction: parent_to_child, deletion: CASCADE }
```

JD 원본은 저장한 회원의 자산이다. 실행은 그 회원의 JD와 별도 회원일 수 있는 발행본 작성자 양쪽에 의존한다. C-06에 맞춰 실행의 `(memberId,jdId)`가 JD의 같은 조합을 참조하도록 하며, 발행본과 실행자의 소유 일치를 강제하지 않는다. 참조를 비우거나 삭제를 거부하는 방식으로 결과를 남기지 않는다.

## 출처

[컴포넌트](../../../inception/domain-design/components.md), [C-02·C-06](../../../inception/contract-design/contract-summary.md), [작성 전 확인](functional-design-questions.md). 기존 도메인 필드에 생성 시각·줄 번호·빈 결과 분류·고정 오류 식별자를 보완했다.

