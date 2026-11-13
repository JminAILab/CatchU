# U10 업무 규칙

아래 YAML이 규칙의 정본이다. 흐름·상태 전이는 [기능 명세](functional-spec.md)에 있다.

## 업무 규칙 정본

```yaml
rules:
  - id: BR1.1
    statement: "본인 JD만 관리한다"
    category: "authorization"
    applies_to: "Jd"
    trigger: "목록·상세·저장·수정·삭제"
    logic: "로그인 회원과 소유자가 같을 때만 처리한다. 목록은 본인 조건을 강제한다."
    violation: "미인증 401, 타인·없는 자원은 동일한 404 RESOURCE_UNAVAILABLE"
    source: "FR6.7"
  - id: BR1.2
    statement: "JD 저장 입력을 검증한다"
    category: "validation"
    applies_to: "Jd"
    trigger: "생성·수정"
    logic: "제목 1~200자, 본문 1~20000자이며 공백만인 값은 거부한다. 원문을 잘라 저장하지 않는다."
    violation: "422 INPUT_TOO_LARGE 또는 INVALID_INPUT, 화면 입력 보존"
    source: "FR6.7"
  - id: BR1.3
    statement: "JD 원본과 실행 사본의 생명주기를 분리한다"
    category: "policy"
    applies_to: "Jd,JdSummaryRun"
    trigger: "수정·삭제·회원 탈퇴"
    logic: "JD 수정은 실행 사본에 영향을 주지 않는다. 본인 JD 삭제·본인 탈퇴는 JD를 삭제한다. 다른 발행본 작성자 탈퇴는 이 JD를 삭제하지 않는다."
    violation: "삭제 실패를 성공으로 응답하지 않는다"
    source: "FR6.7,FR14.9"
  - id: BR2.1
    statement: "실행 전 입력 전부를 검사한다"
    category: "validation"
    applies_to: "JdSummaryRun"
    trigger: "접수"
    logic: "비어 있지 않은 원문 줄을 순서대로 분리하여 1~20개·각 2000자 이내인지 검사한다. 접수 시 검색 6개와 조각 1000자 상한을 기준으로 생성 입력의 최대 8000자를 확인한다."
    violation: "초과는 접수·횟수 차감 전에 422 INPUT_TOO_LARGE, 부분 실행 금지"
    source: "FR6.1"
  - id: BR2.2
    statement: "매 요청 링크 접근과 실행자 소유를 확인한다"
    category: "authorization"
    applies_to: "JdSummaryRun"
    trigger: "실행·목록·단건 조회"
    logic: "C-10으로 유효한 링크와 발행본을 확인하고 로그인 회원 본인의 JD·실행만 사용한다. 단건은 실행 publicationId도 일치해야 한다."
    violation: "C-10 링크 오류 또는 404 RESOURCE_UNAVAILABLE"
    source: "FR6.1,FR4.2"
  - id: BR2.3
    statement: "동의와 공용 하루 한도를 적용한다"
    category: "policy"
    applies_to: "JdSummaryRun"
    trigger: "접수"
    logic: "C-04 동의와 C-09 색인 DONE 확인 뒤 실행 저장과 같은 트랜잭션에서 C-03을 실행자 기준 1회 소비한다. JD 저장에는 적용하지 않는다."
    violation: "403 AI_CONSENT_REQUIRED, 409 INDEX_NOT_READY, 429 DAILY_LIMIT_REACHED"
    source: "FR6.6,FR20"
  - id: BR2.4
    statement: "재실행은 독립된 새 실행이다"
    category: "constraint"
    applies_to: "JdSummaryRun"
    trigger: "요약 실행"
    logic: "항상 새 runId·입력 사본·PENDING 결과 행을 만들고 커밋 뒤 C-02에 등록한다. 접수 후 실패해도 횟수를 환급하지 않는다."
    violation: "저장 실패는 롤백, 등록 실패는 시한에 따라 실패 확정"
    source: "FR6.1,FR6.8"
  - id: BR3.1
    statement: "요구사항별 순차 검색·생성을 수행한다"
    category: "policy"
    applies_to: "JdSummaryResult"
    trigger: "백그라운드 처리"
    logic: "같은 발행본에 각 jdLine으로 C-09 검색 후 C-01 JD_SUMMARY·HAIKU generate를 최대 한 번 호출한다. 근거 없는 입력은 공용 관문이 호출을 생략한다."
    violation: "해당 요구사항을 FAILED로 기록하고 다음 요구사항 진행, 자동 재시도 없음"
    source: "FR6.1,FR6.9"
  - id: BR3.2
    statement: "공용 입력 계산과 출력 검사를 그대로 소비한다"
    category: "validation"
    applies_to: "JdSummaryResult"
    trigger: "각 생성 직전"
    logic: "sources.text 길이 합과 userText 길이를 UTF-16으로 합산한다. publicationText와 instruction은 제외한다. 80000 초과는 생성 호출 전에 거부한다. 원문·인용 위치·출처·역할을 변형하지 않는다."
    violation: "접수 후 비정상 반환 초과는 해당 요구사항 FAILED/INPUT_TOO_LARGE, 잘라 호출 금지"
    source: "FR6.1,FR6.4,FR6.5"
  - id: BR3.3
    statement: "결과 없음과 처리 실패를 구분한다"
    category: "policy"
    applies_to: "JdSummaryResult"
    trigger: "정상 출력·예외 수신"
    logic: "정상 반환 중 CITED·AI_INTERPRETATION 항목이 없으면 DONE/EMPTY, 있으면 DONE/CONTENT다. SERVER_NOTICE는 보여 주되 내용 존재 판정에서 제외한다. 검색·호출 예외는 FAILED다. 개별 생성 호출 시간 초과는 GENERATION_FAILED와 일반 요구사항 처리 실패 안내로 통일하고, 전체 실행 시한 초과는 BR4.1의 DEADLINE_EXCEEDED로 구분한다."
    violation: "빈 결과를 오류로 표현하거나 호출 예외를 EMPTY로 감추지 않는다"
    source: "FR6.1,FR6.4"
  - id: BR3.4
    statement: "원문 대응과 일부 결과를 보존한다"
    category: "constraint"
    applies_to: "JdSummaryRun,JdSummaryResult"
    trigger: "결과 저장·조회"
    logic: "실행 전 만든 요구사항 행의 순서·원문을 유지한다. 모든 행 처리 후 하나라도 DONE이면 실행 DONE, 전부 FAILED면 실행 FAILED다. EMPTY도 DONE이다."
    violation: "일부 실패와 결과 없음을 각각 표시한다"
    source: "FR6.1"
  - id: BR3.5
    statement: "표기 미발견을 역량 부재로 쓰지 않는다"
    category: "policy"
    applies_to: "JdSummaryResult"
    trigger: "확인되지 않는 점 표시"
    logic: "U2 SERVER_NOTICE를 해당 칸에 표시한다. 검색 조각 0개이면 원문 줄 옆에 이번에 찾은 자료가 없어 이 요구사항의 표기를 찾지 못했습니다라는 고정 안내를 쓴다. 별도 영어 추출·역량 판정을 하지 않는다."
    violation: "근거 없는 단정·평가 표현 표시 금지"
    source: "FR6.4"
  - id: BR4.1
    statement: "시한과 늦은 결과를 통제한다"
    category: "constraint"
    applies_to: "JdSummaryRun,JdSummaryResult"
    trigger: "처리 시작·각 호출·저장·상태 조회"
    logic: "접수부터 20분을 시한으로 둔다. PENDING이며 시한 전이고 부모가 있을 때만 저장한다. 상태 조회는 C-02로 만료 PENDING을 조건부 FAILED로 저장한다. 남은 요구사항은 시한 실패로 표시한다."
    violation: "늦은 결과는 버리고 재시도·중간 재개하지 않는다"
    source: "FR6.8,FR14.10"
  - id: BR4.2
    statement: "브라우저와 무관하게 처리하고 유효 링크에서 다시 연다"
    category: "authorization"
    applies_to: "JdSummaryRun"
    trigger: "브라우저 종료·재열람"
    logic: "접수는 브라우저 종료로 취소하지 않는다. 본인 실행 목록과 새로고침 조회는 매번 C-10을 거친다. 링크 중지·만료는 열람 차단이며 삭제 사유가 아니다."
    violation: "로그인·링크 오류 안내, 결과 비공개 유지"
    source: "FR6.1,FR6.8"
  - id: BR4.3
    statement: "의존 부모 삭제 시 사본과 결과도 삭제한다"
    category: "constraint"
    applies_to: "JdSummaryRun,JdSummaryResult"
    trigger: "JD·회원·발행본 삭제"
    logic: "C-06 복합 참조와 연쇄 삭제로 실행·입력 사본·결과를 삭제한다. 늦은 저장은 부모 부재·외래 키 거부로 버린다."
    violation: "삭제 자료 부활·타인 JD 원본 삭제 금지"
    source: "FR6.1,FR14.9,FR14.10"
  - id: BR5.1
    statement: "합성 생성은 U10 시험에 한정한다"
    category: "policy"
    applies_to: "시험용 생성 어댑터"
    trigger: "시험 구성"
    logic: "기존 C-01 인터페이스로만 명시적 주입한다. U2의 계약·검사·운영 바인딩을 수정하지 않는다. 필요 변경은 별도 요청한다."
    violation: "운영 자동 대체 금지, 계약 변경 필요 시 해당 연결 보류"
    source: "NFR1,NFR2"
```

## 규칙 요약

| 규칙 | 요약 |
|---|---|
| BR1.1 | 본인 JD만 관리한다 |
| BR1.2 | JD 저장 입력을 검증한다 |
| BR1.3 | JD 원본과 실행 사본의 생명주기를 분리한다 |
| BR2.1 | 실행 전 입력 전부를 검사한다 |
| BR2.2 | 매 요청 링크 접근과 실행자 소유를 확인한다 |
| BR2.3 | 동의와 공용 하루 한도를 적용한다 |
| BR2.4 | 재실행은 독립된 새 실행이다 |
| BR3.1 | 요구사항별 순차 검색·생성을 수행한다 |
| BR3.2 | 공용 입력 계산과 출력 검사를 그대로 소비한다 |
| BR3.3 | 결과 없음과 처리 실패를 구분한다 |
| BR3.4 | 원문 대응과 일부 결과를 보존한다 |
| BR3.5 | 표기 미발견을 역량 부재로 쓰지 않는다 |
| BR4.1 | 시한과 늦은 결과를 통제한다 |
| BR4.2 | 브라우저와 무관하게 처리하고 유효 링크에서 다시 연다 |
| BR4.3 | 의존 부모 삭제 시 사본과 결과도 삭제한다 |
| BR5.1 | 합성 생성은 U10 시험에 한정한다 |

근거: [요구사항](../../../inception/requirements-analysis/requirements.md), [공유 계약](../../../inception/contract-design/contract-summary.md), [사용자 확인](functional-design-questions.md). BR5.1은 이번 사용자의 시험 경계 지시를 함께 반영한다.

