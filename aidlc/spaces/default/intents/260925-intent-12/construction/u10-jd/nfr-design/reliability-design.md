# U10 신뢰성·자료 수명 설계

접수와 완료를 구분하고, 승인된 시한·부분 실패·실제 삭제를 DB와 처리기 책임으로 구체화한다. 자동 복구·가동률·RTO·RPO·백업 목표는 추가하지 않는다.

## R1 접수 트랜잭션과 큐 등록

대응: NFR4.6, NFR6.4, NFR6.5.

접수 서비스는 기존 기능 명세 W2 순서로 인증·링크·본인 JD·입력·동의·색인 준비를 확인한다. 저장 트랜잭션에서는 JD를 소유자 조건으로 다시 읽고 판본을 확인하며, 저장할 입력 사본과 같은 판본을 사용한다. 수정과 사본 생성이 엇갈리지 않도록 이 짧은 구간에서 JD 행을 잠그고, 달라진 입력은 한도를 다시 검사한다. C-03 consume에 같은 manager를 넘겨 차감·새 실행·사본·PENDING 결과 행을 함께 커밋한다.

접수 트랜잭션이 실패하면 모두 롤백하며 큐에 등록하지 않는다. 커밋 뒤 enqueueAfterCommit(JD_SUMMARY, runId, {runId})를 한 번 호출한다. ENQUEUE_FAILED여도 접수된 실행은 유지하고 202와 runId로 조회할 수 있게 한다. 실패를 완료로 기록하지 않는다. 등록 실패·유실은 R2의 조회 시 시한 판정으로 드러난다.

동의·권한·색인 확인이나 외부 검색·생성 호출 동안 DB 트랜잭션을 열어 두지 않는다. 수동 재실행은 새 접수 흐름을 밟으며 새 키·새 차감을 사용한다. outbox·재등록·재개·자동 환급을 추가하지 않는다.

## R2 시한과 결과 저장

대응: NFR4.3, NFR5.3, NFR6.5.

deadlineAt은 createdAt+20분이다. 처리 시작과 각 검색·생성 호출 전, 결과 저장 직전에 실행 존재·PENDING·현재 시각 < deadlineAt을 확인한다. 외부 호출은 트랜잭션 밖에서 수행한다.

결과 저장 책임은 짧은 트랜잭션에서 실행 행을 잠근 뒤 상태·시한·부모 관계를 다시 확인하고 해당 결과 행을 조건부 갱신한다. 같은 실행의 시한 확정·완료 집계도 같은 실행 행 기준으로 직렬화한다. 저장 명령은 기존 행의 UPDATE이며 삭제된 실행·결과를 INSERT/upsert로 재생성하지 않는다. 외래 키 위반이나 부모 부재로 저장할 수 없는 결과는 버리고 재시도하지 않는다. 잠금은 외부 호출 구간까지 확장하지 않는다.

조회 서비스는 요청 권한을 먼저 확인한 뒤 C-02 readStatus를 사용한다. 만료된 PENDING이면 짧은 트랜잭션에서 실행을 조건부 FAILED/DEADLINE_EXCEEDED로, 아직 PENDING인 요구사항만 같은 실패 코드로 바꾼다. 이미 저장된 DONE 결과는 그대로 둔다. 완료 직전 최종 집계도 시한을 다시 검사한다.

조회 시 판정이므로 시한 정각에 자동 정리하는 스케줄러는 없다. 이미 진행 중인 외부 호출의 취소를 보장하지 않지만 시한 뒤 결과는 저장하지 않는다. DONE/FAILED 상태를 늦은 응답으로 PENDING이나 다른 결과로 되돌리지 않는다. 드문 중복 전달을 완전히 막는 새 실행 임대·멱등 프로토콜은 만들지 않는다.

## R3 삭제 관계와 부활 방지

대응: NFR5.1, NFR5.2, NFR5.3.

| U10 자료 | 참조·삭제 조건 |
|---|---|
| jd | memberId가 회원을 참조하며 회원 삭제에 CASCADE. (memberId, jdId)는 유일 |
| jd_summary_run | 실행 회원·publicationId가 각 부모를 CASCADE 참조. (memberId, jdId)가 jd의 같은 짝을 복합 참조 |
| jd_summary_result | runId를 CASCADE 참조. (runId, requirementIndex)는 유일 |
| inputCopy | 실행에 속한 사본. 실행과 별도로 보관하지 않음 |

발행본 삭제는 그 발행본에 대한 다른 회원의 실행까지 지우지만 그 회원의 JD 원본을 지우지 않는다. JD 삭제는 관련 실행·사본·결과를 지우고, JD 수정은 과거 사본을 바꾸지 않는다. 링크 중지·만료는 접근만 차단한다. 새 보관 기한·자동 삭제 정책은 없다.

회원 탈퇴는 C-06의 세션 무효화·링크 중지와 최종 회원 삭제 순서를 그대로 따른다. U10은 새 테이블이 공용 연쇄 삭제에 참여하도록 한다. 삭제 실패는 성공으로 응답하지 않는다. 구현 PR에서 기존 member-withdrawal-deletion.md의 부모 표를 함께 갱신하는 C-06 의무를 따른다.

삭제와 결과 저장이 겹쳐도 R2의 기존 행 갱신과 외래 키가 자료 부활을 막는다. 별도 삭제 완료 후 복원 경로나 재시도는 없다. 추가 경쟁 상황 시험 묶음을 만들지 않고 기존 삭제 보호 흐름·FK 검사·조건부 저장 검토에 연결한다.

## R4 결과 분류와 실패 안내

대응: NFR7.2, NFR7.3.

| 결과 | 저장 분류 | 최초 조회·재열람 |
|---|---|---|
| 정상 반환의 CITED·AI_INTERPRETATION 내용 있음 | DONE/CONTENT | 역할별 내용·출처 |
| 정상 반환의 내용 없음, 서버 안내만 있거나 검색 조각 0개 | DONE/EMPTY | 기존 결과 없음 안내와 해당 SERVER_NOTICE/검색 조각 없음 안내 |
| 생성 제공자 오류·개별 생성 호출 시간 초과 | FAILED/GENERATION_FAILED | “이 요구사항을 처리하지 못했습니다.” |
| 검색 오류 | FAILED/SEARCH_FAILED | 일반 요구사항 처리 실패 안내 |
| 제공자 계약 위반·실제 입력 초과 | FAILED/CONTRACT_INVALID 또는 INPUT_TOO_LARGE | 고정 실패 안내, 원문 예외 미노출 |
| 전체 시한 후 미처리 행 | FAILED/DEADLINE_EXCEEDED | “전체 처리 시한이 지나 완료하지 못했습니다.” |
| 처리기 전체 오류로 남은 PENDING | FAILED/PROCESSING_FAILED | 기존 처리 실패 안내 |

AiProviderError(NO_ITEMS)도 정상 빈 반환과 구분한다. 개별 호출 시간 초과 전용 코드·문구를 만들지 않는다.

전 행이 종료됐고 하나라도 DONE이면 실행 DONE, 전부 FAILED이면 FAILED/ALL_REQUIREMENTS_FAILED다. EMPTY도 DONE에 포함한다. 일부 실패는 실행 DONE과 함께 행별로 표시한다. 시한 초과는 실행 FAILED/DEADLINE_EXCEEDED, 처리기 전체 오류는 실행 FAILED/PROCESSING_FAILED이며 이전 정상 결과를 유지한다. 저장 장애로 실패 상태를 쓰지 못하면 완료를 보고하지 않고 이후 조회의 시한 판정으로 남은 PENDING을 끝낸다.

## R5 선택 이유와 한계

기존 트랜잭션·조건부 저장·외래 키로 승인된 무결성을 구현한다. 외부 제공자 장애에는 회로 차단기·backoff·대체 생성·failover를 추가하지 않는다. DB·큐 장애의 자동 복구나 서비스 연속성을 약속하지 않는다. 물리 백업·복제·건강 검사·배포 운영은 기존 공용 책임이며 여기서 새 정책을 만들지 않는다.

## Sources

[성능 요구사항](../nfr-requirements/performance-requirements.md), [보안 요구사항](../nfr-requirements/security-requirements.md), [확장성 요구사항](../nfr-requirements/scalability-requirements.md), [신뢰성 요구사항](../nfr-requirements/reliability-requirements.md), [관측성 요구사항](../nfr-requirements/observability-requirements.md), [기술 결정](../nfr-requirements/tech-stack-decisions.md), [기능 명세](../functional-design/functional-spec.md), [공유 계약](../../../inception/contract-design/contract-summary.md), [작성 전 확인](nfr-design-questions.md).
