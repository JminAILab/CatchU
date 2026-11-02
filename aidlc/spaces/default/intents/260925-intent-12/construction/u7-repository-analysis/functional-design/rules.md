# U7 저장소·분석 — 업무 규칙
## 근거와 적용 범위

작성일: 2026-10-29. [확인한 작성안](functional-design-questions.md)을 상세화한 U7 기능 설계다. 구현·실측 완료 기록이 아니다.

입력: [unit-of-work.md](../../../inception/units-generation/unit-of-work.md)(U7), [unit-of-work-story-map.md](../../../inception/units-generation/unit-of-work-story-map.md)(US1.2·US1.3), [stories.md](../../../inception/user-stories/stories.md)(수용 기준 12개), [requirements.md](../../../inception/requirements-analysis/requirements.md)(FR1.2·1.3·1.6·1.7·19.1), [components.md](../../../inception/domain-design/components.md)(RepositoryAnalysis), [contract-summary.md](../../../inception/contract-design/contract-summary.md)(공통 전제·C-03·C-04·C-06).

## 규칙 정본

```yaml
rules:
  - id: BR1.1
    statement: "공개 저장소를 회원이 직접 등록한다"
    category: "validation"
    applies_to: "RepositoryRegistration"
    trigger: "등록 요청"
    logic: "IF GitHub 저장소 루트 주소를 해석하고 공개 저장소 ID를 확인했으면 THEN 회원별 등록을 저장하거나 같은 ID의 기존 등록을 반환한다. 소유·기여 관계는 등록 조건이 아니다."
    violation: "입력 오류 또는 확인 실패를 알리고 분석을 시작하지 않는다."
    source: "FR1.2"
  - id: BR1.2
    statement: "등록·조회·분석의 회원과 저장소를 일치시킨다"
    category: "authorization"
    applies_to: "RepositoryRegistration, AnalysisRequest"
    trigger: "등록 조회·접수·실행·결과 반영"
    logic: "IF 인증 회원의 등록과 연결 계정, 요청·동의·시도·결과의 참조가 일치하면 THEN 그 회원의 흐름만 처리한다."
    violation: "다른 회원 또는 없는 참조는 같은 자원 접근 불가로 거부하고 비밀값을 노출하지 않는다."
    source: "FR1.2, NFR1, C-06"
  - id: BR1.3
    statement: "비공개와 지원 불가를 실행 전에 구분한다"
    category: "validation"
    applies_to: "RepositoryRegistration, AnalysisRequest"
    trigger: "등록 및 신규 분석 접수"
    logic: "IF 공개임을 확인했고 기존 수집기가 지원하는 저장소 전체 범위와 현재 동의 범위를 해석할 수 있으면 THEN 실행 조건을 통과한다. 소유·기여 관계나 팀 선정 목록 포함 여부는 검사하지 않는다."
    violation: "비공개 확인은 비공개로, 지원 불가는 지원 조건 밖으로 알린다. 404·권한 부족·외부 장애는 확인 불가로 알리며 비공개로 추정하지 않는다."
    source: "FR1.2"
  - id: BR1.4
    statement: "요청마다 현재 고지와 범위에 새로 동의한다"
    category: "authorization"
    applies_to: "AnalysisConsent"
    trigger: "신규 분석·허용된 실패 재요청"
    logic: "IF accepted가 참이고 현재 고지·범위 판본과 일치하면 THEN 요청에 고정된 동의를 함께 저장한다. 주소 등록이나 과거 동의는 새 분석 동의가 아니다."
    violation: "CONSENT_REQUIRED로 실행을 거부한다. 재요청은 새 동의를 받는다."
    source: "FR1.2, FR1.3, C-04, ADR-008"
  - id: BR2.1
    statement: "본인 커밋이 없는 정상 결과와 확인 불가를 구별한다"
    category: "policy"
    applies_to: "AnalysisAttempt"
    trigger: "수집 결과 판정"
    logic: "IF 필요한 조회가 완료되고 판정을 막는 수집 범위 한계가 없고 연결 GitHub 계정의 커밋이 0이면 THEN ownCommitObservation=NONE으로 종결하고 Catch를 만들지 않는다. 본인 커밋이 하나라도 확인되면 FOUND다. 나머지는 UNKNOWN이다."
    violation: "수집 장애·범위 제한·조회 실패를 본인 기록 없음으로 안내하지 않는다. NONE은 정상 EMPTY이며 자동 또는 수동 재분석 허용 근거가 아니다."
    source: "FR1.2"
  - id: BR2.2
    statement: "수집·생성 상한을 함께 측정하고 한계를 남긴다"
    category: "constraint"
    applies_to: "AnalysisAttempt"
    trigger: "목록·상세·관계 수집 및 생성"
    logic: "IF 설정된 상한 안이면 THEN 기존 후보 판정·생성을 수행한다. 개수 범위를 넘은 자료는 한계로 기록하고 필요한 조회의 호출·시간·총량 상한으로 중단되면 기존 실패 의미를 보존한다."
    violation: "일부만 읽고 전체를 분석했다고 표시하지 않는다. 약 500개 커밋의 실제 반영 여부와 상한 값을 실측으로 확인한다."
    source: "FR1.6, NFR4"
  - id: BR2.3
    statement: "기존 비밀값 가리기와 기여 판정을 유지한다"
    category: "policy"
    applies_to: "AnalysisAttempt, Catch"
    trigger: "수집 근거를 외부 생성 제공자에 전달하거나 결과를 반영할 때"
    logic: "IF 허용 범위의 기록이면 THEN 기존 비밀값·개인정보 가리기, 후보 묶음·작업 동일성·본인 기여 판정을 거쳐 처리한다. 등록 가능하다는 이유로 다른 사람의 기록을 본인 것으로 바꾸지 않는다."
    violation: "가리지 않은 비밀값을 외부 입력·저장 결과·로그로 내보내지 않는다. 확인할 수 없는 기여는 확인했다고 표시하지 않는다."
    source: "FR1.7, FR1.2"
  - id: BR3.1
    statement: "하루 실행 한도는 접수 시 공용 계약으로 소비한다"
    category: "constraint"
    applies_to: "AnalysisRequest"
    trigger: "새 요청을 생성하기 직전"
    logic: "IF 모든 접수 조건을 통과하고 C-03 consume(memberId, ANALYSIS, now, manager)가 ALLOWED이면 THEN 같은 접수 트랜잭션에 요청과 동의를 저장한다. 동일 요청 응답·상태 조회·주소 등록은 소비하지 않는다."
    violation: "LIMIT_REACHED이면 429 DAILY_LIMIT_REACHED로 거부한다. 실패한 실행의 횟수는 반환하지 않고 남은 횟수를 보여 주지 않는다."
    source: "FR6.6, AC1.2.8, C-03"
  - id: BR4.1
    statement: "진행·결과 반영·조회 실패를 구분한다"
    category: "policy"
    applies_to: "AnalysisRequest, AnalysisAttempt"
    trigger: "접수 응답과 상태 표시"
    logic: "IF 202를 받으면 THEN 접수로 알린다. 완료는 검증된 처리 결과와 반영 상태를 함께 읽어 알린다. HTTP 조회 실패는 요청 상태를 변경하지 않는다."
    violation: "조회 실패나 응답 불명으로 새 분석을 자동 실행하지 않는다. 헤더 알림을 추가하지 않는다."
    source: "FR1.3"
  - id: BR4.2
    statement: "재요청은 최신 종료 실패 중 기존 조건을 만족할 때만 허용한다"
    category: "authorization"
    applies_to: "AnalysisRequest, AnalysisConsent"
    trigger: "실패 재요청"
    logic: "IF 같은 회원·저장소의 최신 요청이 CLOSED이고 등록 Catch·유효 결과가 없으며 실패 확정 또는 닫힌 반영 실패 조건을 만족하고 다른 ACTIVE가 없으면 THEN 현재 연결·등록·범위·새 동의·하루 한도를 확인해 새 요청을 만들고 원 요청을 참조한다."
    violation: "진행·복구·실행 불명은 RETRY_NOT_ALLOWED, 기존 결과는 REANALYSIS_DEFERRED로 거부한다. 상세 분기는 기능 명세의 재요청 표를 따른다."
    source: "FR1.3"
  - id: BR4.3
    statement: "정상 완료와 부분 결과를 다시 생성하지 않는다"
    category: "constraint"
    applies_to: "AnalysisRequest"
    trigger: "새 접수·재요청·재전송"
    logic: "IF 정상 완료·EMPTY·유효 부분 결과 또는 등록 Catch가 있으면 THEN 새 분석을 받지 않는다. 같은 키·본문의 재응답은 기존 상태 확인이며 새 실행이 아니다."
    violation: "자동 분석 재시도, 정상 완료 재분석, 부분 결과 추가 생성을 제공하지 않는다."
    source: "FR1.3"
  - id: BR5.1
    statement: "실제 분석 증거 없이는 U7 완료로 보지 않는다"
    category: "policy"
    applies_to: "RepositoryAnalysis"
    trigger: "U7 완료 판정"
    logic: "IF 새 등록 경로의 실제 GitHub 수집·실제 생성·결과 반영·본인 화면 Catch 확인과 실제 거부 사례 기록 및 통합 브랜치 병합 증거가 있으면 THEN U7 완료 조건을 충족한다."
    violation: "합성 시험·구 선정 경로 성공·접수 성공만으로 완료하지 않는다. 실패·미실행과 외부 AWS 통합 확인 미실시를 구분해 남긴다."
    source: "FR19.1, U7 Unit 정의, 2026-10-29 사용자 수정 요청"
```

## 규칙 요약

| 규칙 | 적용 결과 |
|---|---|
| BR1.1 | 공개 저장소를 회원이 직접 등록한다 |
| BR1.2 | 등록·조회·분석의 회원과 저장소를 일치시킨다 |
| BR1.3 | 비공개와 지원 불가를 실행 전에 구분한다 |
| BR1.4 | 요청마다 현재 고지와 범위에 새로 동의한다 |
| BR2.1 | 본인 커밋이 없는 정상 결과와 확인 불가를 구별한다 |
| BR2.2 | 수집·생성 상한을 함께 측정하고 한계를 남긴다 |
| BR2.3 | 기존 비밀값 가리기와 기여 판정을 유지한다 |
| BR3.1 | 하루 실행 한도는 접수 시 공용 계약으로 소비한다 |
| BR4.1 | 진행·결과 반영·조회 실패를 구분한다 |
| BR4.2 | 재요청은 최신 종료 실패 중 기존 조건을 만족할 때만 허용한다 |
| BR4.3 | 정상 완료와 부분 결과를 다시 생성하지 않는다 |
| BR5.1 | 실제 분석 증거 없이는 U7 완료로 보지 않는다 |

규칙은 [functional-spec.md](functional-spec.md)의 순서·상태 전이와 함께 읽는다. BR5.1은 U7 완료 증거를 구체화하며, U2의 전체 통합 진행 책임을 가져오지 않는다. 새 복구 장치·별도 관제·동시성 기능은 추가하지 않고 기존 접수·수신의 보호를 재사용한다.

