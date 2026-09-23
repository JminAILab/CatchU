# worker — 서비스 DB 밖의 논리 모델

## 모델 정본

아래는 F 결과의 최소 논리 모델이다. 메시지 필드·required·enum은 기존 worker YAML과 공통 DTO를 참조하며 새 전송 필드를 추가하지 않는다. F의 소유는 생성·의미 책임이다. 서비스 DB 테이블·영속 저장 책임이 아니며 보존 위치/수명은 OQ-F1이다.

```yaml
entities:
  - name: AnalysisResult
    description: 요청/시도에 귀속된 결과와 실패 범위
    attributes:
      - {name: resultId, type: identifier, required: true, unique: true}
      - {name: requestId, type: external-identifier, required: true, references: E.AnalysisRequest}
      - {name: attemptId, type: external-identifier, required: true, references: E.AnalysisAttempt}
      - {name: subjectAndScope, type: request-context, required: true, constraints: "Result의 memberId/repositoryId/consentId/scopeRevision을 원 요청에 연결"}
      - {name: outcome, type: enum, required: true, allowed_values: [SUCCEEDED, EMPTY, PARTIAL_FAILED, FAILED]}
      - {name: candidates, type: "WorkCandidate[]", required: true}
      - {name: failuresAndNotProvided, type: result-classification, required: true, constraints: "Result.failures와 notProvided를 분리"}
    constraints: ["같은 resultId는 같은 의미의 결과", "서비스 DB에 저장하지 않음"]
  - name: WorkCandidate
    description: 근거와 본인 기여로 등록 기준을 충족한 작업 후보
    attributes:
      - {name: candidateId, type: identifier, required: true, unique: true}
      - {name: resultReference, type: identifier, required: true, references: AnalysisResult}
      - {name: candidateData, type: contract-Candidate, required: true, constraints: "workIdentity/사실/기여/묶음 이유와 한계/eligibility는 Candidate 스키마"}
      - {name: evidence, type: "AnalysisEvidence[]", required: true, min: 1}
      - {name: draft, type: DraftOutcome, required: true}
      - {name: reflection, type: contract-Reflection, required: true, constraints: "생성 상태와 질문 목록. 답변 자료 아님"}
    constraints: ["실패 영향과 분리해 적합성을 확인한 후보만 제공", "같은 작업을 표현만 바꿔 새 작업으로 취급하지 않음"]
  - name: AnalysisEvidence
    description: 관측 사실과 귀속/발췌 한계를 연결하는 근거
    attributes:
      - {name: evidenceId, type: identifier, required: true, unique: true}
      - {name: evidenceData, type: contract-Evidence, required: true, constraints: "sourceUrl/sourceRevision/representedFacts/contributionScope/coverageLimits"}
    constraints: ["관측하지 않은 동기·성과·의사결정을 추정해 보충하지 않음", "일부 근거 공유가 곧 같은 작업임을 뜻하지 않음"]
  - name: DraftOutcome
    description: 후보의 초안 생성 상태와 내용
    attributes:
      - {name: draftOutcomeId, type: logical-identifier, required: true, unique: true, constraints: "Domain의 내부 식별자. 전송 DTO 필드로 추가하지 않음"}
      - {name: candidateReference, type: identifier, required: true, references: WorkCandidate}
      - {name: status, type: enum, required: true, allowed_values: [GENERATED, FAILED, NOT_GENERATED]}
      - {name: content, type: nullable-string, required: true, constraints: "GENERATED일 때 문자열, 그 외 null"}
    constraints: ["실패 상세는 Result.failures의 해당 후보와 연결", "초안 실패만으로 후보 부재/등록 불가로 바꾸지 않음"]
relationships:
  - {from: AnalysisResult, to: WorkCandidate, cardinality: "1:0..N", direction: "result -> candidates"}
  - {from: WorkCandidate, to: AnalysisEvidence, cardinality: "N:M", direction: "candidate -> evidence", constraints: "후보별 1개 이상; 메시지에서는 후보별 evidence 배열로 투영"}
  - {from: WorkCandidate, to: DraftOutcome, cardinality: "1:1", direction: "candidate -> draft"}
```

## 정본·보완 경계

네 논리 엔티티는 모두 F 처리 영역이다. 등록된 CatchEvidence·초안·최소 질문은 B 정본으로 관리하며 F 자료의 영구 접근에 의존하지 않는다. 내부 식별자 생성/표현과 보존 구현, workIdentity 판별 함수는 F가 개발 이슈로 제안하고 E/B와 검토한다. 실제 서비스 DB ERD는 api Unit에서 작성한다.

## 추적 정보

[unit-of-work](../../../inception/units-generation/unit-of-work.md) · [unit-of-work-story-map](../../../inception/units-generation/unit-of-work-story-map.md) · [requirements](../../../inception/requirements-analysis/requirements.md) · [components](../../../inception/domain-design/components.md) · [contract-summary](../../../inception/contract-design/contract-summary.md) · [worker YAML](../../../inception/contract-design/worker-messages.yaml) · [공통 DTO](../../../inception/contract-design/common.yaml).
