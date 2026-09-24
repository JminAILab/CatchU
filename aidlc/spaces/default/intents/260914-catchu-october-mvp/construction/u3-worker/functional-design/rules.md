# worker — 최소 업무 규칙

## 규칙 정본

기존 제품 결정과 메시지 계약의 worker 책임만 연결한다. 상세 알고리즘·함수·시험 코드는 담당자의 개발 이슈로 보완한다.

```yaml
rules:
  - id: BR3.1
    statement: 요청에 연결된 허용 범위 안에서만 결과를 생성한다
    category: authorization
    applies_to: AnalysisResult
    trigger: 요청 수신과 결과 전달
    logic: "IF 요청/시도·본인/저장소·동의/범위가 유효하면 그 범위만 처리; 자격정보 맥락 ID 자체를 권한으로 신뢰하지 않음"
    violation: "처리/반영 거부. F가 새 동의나 추가 범위를 만들어 진행하지 않음"
    source: [FR2, FR2.1, FR1.1, FR1.4]
  - id: BR3.2
    statement: 확인 가능한 작업 사실과 본인 기여가 있는 후보만 제공한다
    category: validation
    applies_to: [WorkCandidate, AnalysisEvidence]
    trigger: 후보 구성
    logic: "IF 근거·기여와 등록 기준을 실패 영향과 분리해 확인하면 제공; 이유/성과 부재·작은 변경/단일 커밋만으로 제외하지 않음. title은 ‘무엇을 했나’를 짧은 명사구로 생성하며 평가하는 말과 workFacts에 없는 사실을 넣지 않음. 제목 생성 실패 시 workFacts 첫 항목으로 채워 항상 비어 있지 않은 값을 제공"
    violation: "근거 부족/기준 미달은 notProvided, 수집/생성 오류는 failures로 구분; 없는 사실을 추정하지 않음"
    source: [FR2.1]
  - id: BR3.3
    statement: 정상 0건과 부분/전체 실패를 구분한다
    category: constraint
    applies_to: AnalysisResult
    trigger: 처리 결과 종결
    logic: "후보>=1·실패0이면 SUCCEEDED; 후보0·실패0이면 EMPTY; 후보>=1·실패>=1이면 PARTIAL_FAILED; 후보0·실패>=1이면 FAILED"
    violation: "조회 실패/실행 불명을 EMPTY나 확정 실패로 치환하지 않음; 정상 결과로 위장하지 않음"
    source: [FR2.1, FR1.4]
  - id: BR3.4
    statement: 초안·최소 질문 생성 상태를 후보 적합성과 분리한다
    category: policy
    applies_to: [WorkCandidate, DraftOutcome]
    trigger: 초안·최소 질문 생성 결과 구성
    logic: "초안 실패여도 적합 후보 제공; GENERATED일 때만 초안 본문 제공. 최소 질문은 F가 생성해 E를 통해 B로 전달"
    violation: "실패 상태를 보존하고 없는 본문을 만들지 않음; 답변 저장/수신자 공개/자동 재호출을 추가하지 않음"
    source: [FR2.1, FR2.2]
  - id: BR3.5
    statement: 결과 전달과 Catch 등록·공개를 분리한다
    category: constraint
    applies_to: AnalysisResult
    trigger: E로 결과 전달 및 수신 확인
    logic: "ResultReceipt는 식별 가능한 세 ID가 있을 때만 사용; E의 형식/맥락 확인과 B 등록은 별개. 같은 결과 재전달은 기존 결과 참조"
    violation: "식별 불가 메시지는 Receipt 없이 거부 기록만 남기고 ID를 추정하지 않음; F가 DB 저장/공개 또는 새 분석 재시도를 수행하지 않음"
    source: [FR2, FR2.2, FR1.4]
```

## 규칙 요약

| 규칙 | 확인할 경계 |
|---|---|
| BR3.1 | E 요청·동의 연결, F 허용 범위 |
| BR3.2·BR3.3 | 적합 후보/근거와 미제공 사유·오류·0건 구분. title은 작업 사실의 짧은 명사구이며 생성 실패 시 workFacts 첫 항목 사용 |
| BR3.4 | 초안 실패와 등록 기준 분리, 최소 질문 F→E→B |
| BR3.5 | F 결과 의미 / E 수신·반영 / B 정본·공개 분리 |

## 추적 정보

[unit-of-work](../../../inception/units-generation/unit-of-work.md) · [unit-of-work-story-map](../../../inception/units-generation/unit-of-work-story-map.md) · [requirements](../../../inception/requirements-analysis/requirements.md) · [components](../../../inception/domain-design/components.md) · [contract-summary](../../../inception/contract-design/contract-summary.md) · [worker YAML](../../../inception/contract-design/worker-messages.yaml) · [공통 DTO](../../../inception/contract-design/common.yaml).
