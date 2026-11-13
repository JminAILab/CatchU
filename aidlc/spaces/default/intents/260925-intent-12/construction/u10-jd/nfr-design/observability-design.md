# U10 관측성·검증 설계

기존 api 로거와 FR19 확인 결과 표를 사용한다. 접수·실제 완료·실패를 추적하되 사용자 자료와 비밀값을 남기지 않는다.

## O1 로그 필드와 기록 위치

대응: NFR6.1.

공통 로깅 책임은 허용된 필드만 새 객체로 구성한다. 기본 필드는 시각·수준·서비스·처리 단계·결과이며, 접수 후에는 runId를 연결한다. 요구사항 처리 로그에는 requirementIndex와 고정 failureCode, 필요한 소요 시간·공용 droppedCount만 추가한다. 접수 전에는 기존 안전한 요청 식별자가 있을 때만 쓰며 새 분산 trace 계약을 만들지 않는다.

| 기록 위치 | 단계 구분 | 남길 안전한 결과 |
|---|---|---|
| 접수 저장 커밋 후 | accepted | runId, 접수됨 |
| C-02 등록 반환 | enqueue | runId, ENQUEUED/ENQUEUE_FAILED |
| 처리기 시작·행 처리 종료 | processing / requirement-finished | runId, requirementIndex, DONE/FAILED, resultKind 또는 failureCode |
| 실행 최종 상태 커밋 후 | completed / failed | runId, 실제 최종 상태와 고정 실패 코드 |
| 조회에서 만료 상태 커밋 후 | deadline-finalized | runId, DEADLINE_EXCEEDED |
| 부모 부재·조건 불충족으로 저장 폐기 | result-discarded | runId, 안전하게 판정된 고정 사유 |
| 저장 실패 | persistence-failed | 처리 단계·안전한 분류, 완료됐다는 표시는 없음 |

이 단계 이름은 U10 내부 로그 설계이며 외부 API·공용 오류 코드 계약을 추가하지 않는다. 동일 상태의 모든 조회마다 완료 로그를 반복하지 않고 실제 상태 변경·실패 지점에서 기록한다. 검색과 생성의 단계는 구분하지만 공급자 오류 원문을 분류명으로 쓰지 않는다. 개별 생성 시간 초과는 저장·화면에서 GENERATION_FAILED를 유지한다. 공용 제공자가 안전한 고정 사유를 제공할 때만 그 사유를 부가한다.

JD 제목·본문·원문 줄·발행본·조각·생성 응답·quote, 토큰·grant·전체 URL·SQL·stack·전체 오류 객체를 기록하지 않는다. 요청/응답·함수 인자를 통째로 로그에 넘기지 않는다. 브라우저 개발 로그에도 민감자료를 출력하지 않으며 이슈·PR에 공유하는 증거에도 같은 기준을 적용한다.

## O2 결과 증거와 실제 연결

대응: NFR6.2, NFR6.3.

기존 확인 결과 표의 각 사례에 대상·실행 방식·명령/절차·실제 결과·실패·미실행·관련 산출물·한계를 남긴다. 아래 구분을 상태명으로 새 서비스에 구현하는 것이 아니라 검사 보고에 사용한다.

| 증거 범위 | 주장 가능한 것 | 추가로 필요한 근거 |
|---|---|---|
| 합성 C-01/C-09·props | U10 정상·EMPTY·실패의 흐름과 원문 대응 | 실제 외부 AI 품질·속도는 별도 |
| 실제 DB·공용 모듈 | 본인 저장·조회·삭제와 접수 원자성 | 실제 링크 제공자·화면 연결은 별도 |
| C-10 실제 제공자·C-11 화면 | 매 요청 접근 판정·슬롯·근거 강조 연결 | #416 제공 및 연결 결과 |
| 실제 AI·시연 자료 | 허용 범위 안의 실제 관찰 | 자료·비용 허용과 기존 평가/실측 결과 |

실행하지 않은 항목은 미실행으로 둔다. #416 미연결은 합성 성공으로 덮지 않는다. 완료된 U7 검사나 #450 실제 분석·실측은 재수행하지 않고 해당 증거를 연결한다. 기능 사이 실패 시험은 기존 핵심 보호 흐름과 기능 명세 §11 범위를 유지한다. 문서 정합성 검사를 코드·배포 시험으로 보고하지 않는다.

## O3 품질과 검증 증거

대응: NFR3.1, NFR3.2.

JD는 동일 JD 한 건의 전체 입력 방식과 검색 기반 방식 결과를 나란히 기록하는 상류 범위를 유지한다. 이것은 후속 비교 기록이며 제품에 전체 입력 실행 모드·품질 점수·반복 튜닝·평가 CI를 추가하는 설계가 아니다. 실제 자료·호출 허용이 없으면 미실행으로 남긴다.

공용 기계 대조 통과와 의미적으로 근거가 뒷받침하는지는 구분한다. 진짜 인용을 붙인 남의 기여·뜻 뒤집기·부풀림까지 막았다고 주장하지 않는다. 질의응답 10개 평가·합격 수치·Sonnet 조정은 U5 쪽 상류 범위이며 JD에 적용하지 않는다. #450 실측과 사람 평가의 담당 증거를 U10 자체 품질 완료로 대체하지 않는다.

## O4 운영 범위

새 로그 플랫폼·분산 tracing·SLI/SLO·알림 임계값·대시보드·당직/에스컬레이션·자동 배포를 추가하지 않는다. 필요 소요 시간은 원인 확인 정보이며 새 성능 합격선으로 사용하지 않는다. 로그 보관·보안 전송은 기존 공용 운영 정책을 따르고 U10에서 기간·보관소를 새로 정하지 않는다.

## Sources

[성능 요구사항](../nfr-requirements/performance-requirements.md), [보안 요구사항](../nfr-requirements/security-requirements.md), [확장성 요구사항](../nfr-requirements/scalability-requirements.md), [신뢰성 요구사항](../nfr-requirements/reliability-requirements.md), [관측성 요구사항](../nfr-requirements/observability-requirements.md), [기술 결정](../nfr-requirements/tech-stack-decisions.md), [기능 명세](../functional-design/functional-spec.md), [공유 계약](../../../inception/contract-design/contract-summary.md), [작성 전 확인](nfr-design-questions.md).
