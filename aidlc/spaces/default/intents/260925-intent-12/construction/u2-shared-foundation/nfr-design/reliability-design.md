# U2 공용 기반 — 신뢰성 설계

## Sources

작성일: 2026-10-27. 입력: [신뢰성 요구사항](../nfr-requirements/reliability-requirements.md)(reliability-requirements) NFR5.4·5.5·NFR6.1~6.5·NFR7.1·7.2와 받아들인 지적 R-02·R-03, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U2 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 상태 전이, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) C-02·C-06과 「에러 대응 최소선」.

## 원칙

회로 차단기·재시도·장애 조치·백업 설계를 두지 않는다. 실패는 그대로 드러내고, 끝나지 않은 일은 시한으로 실패가 되며, 다시 시도는 사람이 한다(에러 대응 최소선 1~4).

## 설계

| 요구사항 | 설계 |
|---|---|
| NFR5.4 늦은 결과 | AiRun은 처리기 공통 도우미 하나를 준다: 부모 행을 다시 읽어 없거나 FAILED이거나 `deadline_at`이 지났으면 "버림"을 돌려준다. 저장 중 외래 키 위반(23503)은 잡아 "버림"으로 바꾸고 로그를 남긴다. 처리기는 이 도우미를 쓴다(BR5.7) |
| NFR5.5 탈퇴 실패 | 1단계는 트랜잭션 하나, 2~4단계는 각각 따로. 어느 단계든 예외면 단계 번호를 붙여 500 `WITHDRAWAL_FAILED`로 응답한다. 2·3단계는 대상이 없으면 성공이라 재요청이 같은 자리에서 막히지 않는다(검토 R-02) |
| NFR6.1 등록 실패 | `enqueueAfterCommit`은 Redis 오류를 잡아 `ENQUEUE_FAILED`를 돌려준다. 상태 행은 이미 커밋돼 있으므로 `readStatus`가 시한 뒤 FAILED로 판정한다 |
| NFR6.2 시도 1회 | 작업 옵션 `attempts: 1`, backoff 없음. Worker는 `maxStalledCount: 0`(멈춘 작업을 다시 처리하지 않음), 완료·실패 보관 7200초(10월 queue-spec.ts와 같은 방식) |
| NFR6.3 처리기 예외 | Worker의 `failed` 이벤트에서 kind·runKey·오류 이름만 로그로 남긴다 |
| NFR6.4 오류 전달 | 게이트는 `AiProviderError`·`AiInputTooLarge`를, FileStorage는 `FileNotFound`·`StorageUnavailable`을 그대로 던진다. 소비 Unit이 자기 상태 행에 FAILED를 쓴다 |
| NFR6.5 시험 범위 | 보호 흐름 3개 + U2 계약 핵심 둘(하루 횟수 동시 consume S3, 늦은 결과 버림 S21). 그 밖의 동시성·재전송 세부 시험은 두지 않는다 |
| NFR7.1 안내 구분 | 오류 코드 셋을 web 공용 처리에 둔다: 429 `DAILY_LIMIT_REACHED` → "오늘 한도에 도달했습니다", 403 `AI_CONSENT_REQUIRED` → 동의 창, 500 `WITHDRAWAL_FAILED` → "탈퇴를 끝내지 못했습니다. 팀에 알려 주세요" |
| NFR7.2 항목 구분 | GatedItem.kind(CITED·AI_INTERPRETATION·SERVER_NOTICE 제안)로 내보낸다. 표시는 소비 Unit |

## 번호에 대한 비고 (검토 R-03)

요구사항 번호는 상위 NFR의 범위에 맞춰 붙였다. NFR6.1~6.5는 "실패·미실행을 숨기지 않고 실제 결과대로 남긴다"(NFR6 검증 가능성)를 코드 동작으로 받친 것이고, NFR3.1(observability-design)은 NFR3 평가에 필요한 버림 건수만 남기는 것이다. U2는 NFR3의 통과 기준(질의응답 10개 평가)을 두지 않으며 그 평가는 U5가 한다.
