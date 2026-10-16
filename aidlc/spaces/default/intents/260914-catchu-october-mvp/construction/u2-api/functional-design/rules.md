# api — 업무 규칙 v1

## 규칙 정본

기존 API 계약과 제품 결정을 연결한다. 세부 함수·검사 구현은 담당 개발 이슈로 보완한다.

```yaml
rules:
  - id: BR2.1
    statement: "본인 소유권과 자가 입력 출처를 지킨다"
    category: authorization
    applies_to: ["MemberAccount","MemberProfile","GitHubConnection"]
    trigger: "회원 API 요청"
    logic: "IF Access JWT의 현재 회원이 대상 소유자이면 수행; 프로필은 SELF_REPORTED 허용 필드만 저장/공개"
    violation: "인증 실패 401, 타인/없는 자료 404 RESOURCE_UNAVAILABLE; 비밀·검증되지 않은 공개 필드 제외"
    source: ["FR11","FR11.1","FR11.2","FR11.3"]
  - id: BR2.2
    statement: "새 동의·지원 저장소·허용 범위를 요청에 묶는다"
    category: authorization
    applies_to: ["AnalysisRequest","AnalysisConsent"]
    trigger: "신규 접수"
    logic: "IF 현재 연동/대상/고지/범위와 accepted=true가 유효하면 새 요청·동의·시도를 함께 저장"
    violation: "403 GITHUB_CONNECTION_REQUIRED/REPOSITORY_NOT_ALLOWED/CONSENT_REQUIRED; 저장 실패는 접수 성공 아님"
    source: ["FR1","FR1.1","FR1.4"]
  - id: BR2.3
    statement: "사용자당 진행 중 요청은 하나다"
    category: constraint
    applies_to: ["AnalysisRequest"]
    trigger: "분석 POST와 활성 해제"
    logic: "IF 같은 저장소 ACTIVE이면 기존 작업 200; 다른 저장소 ACTIVE이면 거부; 그 외 허용 이력일 때만 원자 생성 202"
    violation: "409 ANALYSIS_IN_PROGRESS; 자동 대기열/새 시도/동의 재사용 없음"
    source: ["FR1.1","FR1.4"]
  - id: BR2.4
    statement: "등록 Catch 없이 실패 확정·반영 실패로 닫힌 요청만 새 동의 재요청을 허용한다"
    category: policy
    applies_to: ["AnalysisRequest","AnalysisAttempt"]
    trigger: "새 분석 POST의 retry 판정"
    logic: "IF (FAILED/APPLIED/CLOSED이고 적합 후보0·등록0·실패확정근거(F 실패 결과 또는 E 처리 시한 판정)) 또는 (APPLY_FAILED/CLOSED이고 등록0, 처리 결과·적합 후보 수 무관)이면 retry.allowed=true·reason FAILURE_WITHOUT_RESULTS; 본인/저장소 이력에 새 동의·요청·시도 ID와 retryOfRequestId 연결"
    violation: "409 RETRY_NOT_ALLOWED/REANALYSIS_DEFERRED; 요청 ID 생략 우회 금지, HTTP·조회 timeout/조회 실패는 근거 아님(E의 처리 시한 초과 판정은 근거)"
    source: ["FR1.4"]
  - id: BR2.5
    statement: "Result 수신 식별·맥락·중복 검사와 반영 완료를 분리한다"
    category: validation
    applies_to: ["AnalysisAttempt","ResultApplicationRecord"]
    trigger: "F Result 수신"
    logic: "IF resultId/requestId/attemptId 세 ID가 비어 있지 않은 문자열이고 스키마/요청/시도/본인/저장소/동의/범위가 맞으면 수락; 동일 ID/의미는 중복으로 수렴"
    violation: "식별 불가면 Receipt 없이 비원문 거부 기록만; 식별 가능 오류는 REJECTED; 충돌/늦은 시도는 보존·격리, ACCEPTED는 등록 완료 아님"
    source: ["FR1.4"]
  - id: BR2.6
    statement: "처리·반영·열람 준비와 조회 실패를 구분한다"
    category: constraint
    applies_to: ["AnalysisAttempt","CandidateRegistration"]
    trigger: "상태 조회·결과 반영·E 주기 판정"
    logic: "IF 결과가 검증되면 적합 후보수/실패로 SUCCEEDED·EMPTY·PARTIAL_FAILED·FAILED를 정하고 반영 상태는 별도; B 준비 확인만 ownerResultsReady; E 주기 판정이 접수(submittedAt) 후 처리 시한(값은 계약)을 넘긴 ACTIVE를 실행 멈춤 증거 없이 닫음: 처리 중(QUEUED·RUNNING·UNCERTAIN)은 FAILED/APPLIED/CLOSED와 실패 stage DISPATCH, 반영 대기(PENDING)는 APPLY_FAILED/CLOSED와 stage APPLICATION, code는 둘 다 PROCESSING_DEADLINE_EXCEEDED; APPLY_FAILED는 시한을 기다리지 않고 다음 판정에서 CLOSED"
    violation: "조회 오류 500/클라이언트 LOOKUP_FAILED; 반영 실패·조회 오류를 처리 결과 EMPTY/FAILED로 치환 금지(반영 대기에서 닫혀도 처리 결과는 유지); 시한 전 처리 중·반영 대기는 시간 경과/조회 실패로 FAILED/CLOSED 안 함; RECOVERING·반영 복구 없음"
    source: ["FR1.4"]
  - id: BR2.7
    statement: "적합 후보를 B 정본으로 중복 없이 등록한다"
    category: validation
    applies_to: ["CatchAsset","CatchEvidence","CandidateRegistration"]
    trigger: "E에서 B로 후보 전달"
    logic: "IF 근거·본인 기여와 다른 기준이 실패 영향과 분리돼 확인되면 PRIVATE 등록; 동일 작업은 기존 참조, 서로 다른 작업의 일부 근거 중첩은 허용"
    violation: "근거 부족/기준 미달은 수집·생성 오류와 구분; 없는 이유/성과 추정·제목 변형 중복·커밋마다 생성 금지"
    source: ["FR3.5","FR1.4","FR2.1"]
  - id: BR2.8
    statement: "초안·최소 질문 상태와 공개 조건은 독립적이다"
    category: policy
    applies_to: ["CatchAsset"]
    trigger: "등록·본인 조회·수신자 투영"
    logic: "IF 초안 실패여도 다른 등록 조건 충족이면 등록; 생성 본문과 질문은 B 정본으로 보유하며 최소 질문은 본인만 제공"
    violation: "없는 초안을 생성 본문처럼 보이지 않게 null/상태 유지; 질문의 수신자 공개·답변 저장·자동 재호출 없음"
    source: ["FR3.5","FR2.1","FR2.2"]
  - id: BR2.9
    statement: "확인과 별도 공개 선택을 구분한다"
    category: authorization
    applies_to: ["CatchAsset"]
    trigger: "confirmation/visibility/mismatch PUT"
    logic: "IF 본인 근거·기여 확인과 보호 조건 충족 후 별도 PUBLIC 요청이면 공개; 확인 완료 화면은 지금 공개 제안; PRIVATE 요청은 다음 조회부터 반영"
    violation: "409 CONFIRMATION_REQUIRED/SOURCE_RESTRICTED; 생성/확인만으로 자동 공개 금지; mismatch는 별도 본인 표시"
    source: ["FR4","FR4.1","FR3.5"]
  - id: BR2.10
    statement: "확인된 원본 비공개는 수신 접근을 막는다"
    category: authorization
    applies_to: ["RepositoryProtection","CatchAsset"]
    trigger: "현재 자료 접근 판정"
    logic: "IF 확인된 SOURCE_PRIVATE이면 관련 Catch를 현재 수신자 허용 집합에서 제외; 단순 원본 조회 실패는 비공개 확정 아님"
    violation: "기존 보호 상태를 조회 오류로 해제하지 않음; 원본 재공개에 따른 자동 복원·연동 해제 처리 결정은 보류"
    source: ["FR1.5","FR3.4"]
  - id: BR2.11
    statement: "링크는 현재 공개 Catch 전체를 대상으로 한다"
    category: constraint
    applies_to: ["ShareLink","CatchAsset"]
    trigger: "링크 발급·자료 조회"
    logic: "IF 유효 링크 접근이면 소유자의 현재 PUBLIC·제한 없음 Catch만 페이지 제공; 대표나 공개 Catch 없이도 발급 가능"
    violation: "링크–자산 연결/스냅샷/수신자 선택 목록 금지; 직접 숨김/타인/없음은 404 RESOURCE_UNAVAILABLE"
    source: ["FR3","FR3.1","FR3.2","FR3.4","FR4.2"]
  - id: BR2.12
    statement: "발급 입력의 길이를 확인하고 유효 링크의 개수·제목을 원자적으로 제한하며 중단 응답을 정한다"
    category: constraint
    applies_to: ["ShareLink"]
    trigger: "링크 POST·중단 PUT"
    logic: "같은 회원의 발급 요청이 빈도 상한을 넘으면 입력 검사·비밀번호 해시·저장 없이 거부; 발급 본문은 trim 제목 1~50자, 선택 비밀번호는 입력 그대로 8~64자(유니코드 코드 포인트로 셈); IF stoppedAt=null AND t<expiresAt인 본인 링크가 5개 미만이고 trim 제목이 유일하면 원자 발급; 만료는 발급+30*24시간; 중단 PUT은 소유를 상태보다 먼저 검사해 본인 링크면 첫 중단·반복 중단·만료 링크 모두 200으로 현재 ShareLink 반환(중단은 만료 뒤에도 STOPPED, 만료 링크는 EXPIRED 유지); 중단은 자산 상태를 바꾸지 않음"
    violation: "빈도 상한 초과 429 RATE_LIMITED(남은 초는 Retry-After 헤더); 길이 위반 400 VALIDATION_FAILED; 409 LINK_LIMIT_REACHED/LINK_TITLE_CONFLICT; 중단/만료된 링크는 검사 집합에서 제외; 중단 PUT의 타인·없는 링크는 404 RESOURCE_UNAVAILABLE이고 403·409를 쓰지 않음"
    source: ["FR4.3","FR4.4"]
  - id: BR2.13
    statement: "없는 링크·중단·만료는 공통 안내하고 비밀번호 분기와 시도 제한을 유지한다"
    category: authorization
    applies_to: ["ShareLink"]
    trigger: "모든 수신자 조회/unlock"
    logic: "IF 링크 불가면 먼저 공통 404; 유효 링크이면 unlock 시도 제한을 먼저 확인하고 차단 중이면 비밀번호를 검사하지 않고 거부; 차단이 아니면 비밀번호/grant 검사 후 현재 자료 확인"
    violation: "404 LINK_UNAVAILABLE, 비밀번호 401 LINK_PASSWORD_REQUIRED/INVALID, 차단 429 LINK_UNLOCK_LIMITED(남은 초는 Retry-After 헤더); grant만으로 중단/만료 우회 금지"
    source: ["FR3.2","FR4.2","FR4.4","FR4.5"]
  - id: BR2.14
    statement: "재전송 안전성과 응답 경계를 지킨다"
    category: constraint
    applies_to: ["IdempotencyRecord","AnalysisRequest","ShareLink"]
    trigger: "생성 POST·모든 응답"
    logic: "IF 본인+operation+키+정규화 본문 동일이면 기존 응답/자원, 다르면 거부; 회원 목록 items/page, 수신자 목록 profile/catches/page; 모든 응답 no-store"
    violation: "409 IDEMPOTENCY_CONFLICT; 원문/토큰/비밀번호/내부 스택 제외, 0건과 오류 구분, 응답 불명 새 키 자동 재전송 없음"
    source: ["FR1.4","FR4.3","FR11.1"]
  - id: BR2.15
    statement: "ProcessingEvent는 자체 필드와 요청 맥락으로 검사한다"
    category: validation
    applies_to: ["AnalysisAttempt"]
    trigger: "F ProcessingEvent 수신"
    logic: "IF schemaVersion=1, 비어 있지 않은 messageId/requestId/attemptId, state=RECEIVED/RUNNING/UNCERTAIN, date-time observedAt 및 추가 필드 금지 검사를 통과하고 요청/현재 시도 맥락이 맞으면 F 진행 관측으로 반영; 순서가 뒤바뀌어도 종결 상태를 되돌리지 않음"
    violation: "자체 스키마/맥락 오류는 진행 상태에 반영하지 않음. resultId를 요구하거나 Result의 세 ID·ResultReceipt 조건을 적용하지 않으며 ResultReceipt를 생성하지 않음"
    source: ["FR1.4"]
```

## 규칙 요약

| 규칙 | 경계 |
|---|---|
| BR2.1·BR2.2 | A 본인/연동, E 새 동의·접수 |
| BR2.3~BR2.6·BR2.15 | E 동시 요청·재요청·Result 수신/반영과 ProcessingEvent 처리 |
| BR2.7~BR2.10 | B 등록·근거·생성 상태·확인/공개·보호 |
| BR2.11~BR2.13 | C 현재 자료·링크 제약·접근 분기 |
| BR2.14 | API 멱등·오류·회원/수신자 DTO 경계 |

## 추적 정보

[requirements](../../../inception/requirements-analysis/requirements.md) · [Unit 매핑](../../../inception/units-generation/unit-of-work-story-map.md) · [API 계약](../../../inception/contract-design/contract-summary.md) · [entities](entities.md) · [추적표](traceability.json).
