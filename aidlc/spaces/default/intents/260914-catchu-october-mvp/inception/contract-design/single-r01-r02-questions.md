# Contract Design 단독 수정 — R-01·R-02

## 사용자 결정과 수정 범위

2026-09-23 Delivery 승인 뒤 Functional 작업 전에 contract-design --single로 반영한다. 기존 Q1/Q2·경계·Open questions·담당·B의 PR #89 병합 전 확인은 재사용한다.

| 지적 | 확정한 변경 | 수정 파일 |
|---|---|---|
| R-01 | ResultReceipt는 resultId·requestId·attemptId 세 식별자를 모두 식별할 수 있는 메시지에만 보낸다. 식별할 수 없는 메시지는 Receipt 없이 거부 기록만 남긴다. Receipt를 만들려고 누락 식별자를 임의 생성하거나 복구 추정하지 않는다 | contract-summary.md의 W 경계 설명, worker-messages.yaml의 ResultReceipt 설명 |
| R-02 | items·page 규칙은 회원 목록에만 적용된다. 수신자 응답은 profile·catches·page임을 본문에 명시한다. 기존 수신자 YAML 응답 구조는 바꾸지 않는다 | contract-summary.md의 목록 설명 |

R-01의 식별 가능은 세 필드가 각각 스키마상 유효한 비어 있지 않은 문자열로 읽히는 경우다. 맥락 일치는 기존 별도 검사이며, 식별 가능하다고 결과를 수락하는 것은 아니다. 식별자는 있지만 다른 필드가 잘못된 메시지는 기존 SCHEMA_INVALID 거부 Receipt 경계에 둔다. 원문·비밀값을 거부 기록에 남기지 않는 기존 로그 규칙을 유지하며 저장소·전송 방식·보관 정책을 새로 정하지 않는다.

기존 Receipt 필수 필드와 상태 코드는 유지한다. common.yaml·member-api.yaml·recipient-api.yaml은 내용 그대로 재사용한다. 과거 review.md와 Accepted risk 기록을 소급 수정하지 않고 이번 단독 검토의 결과로 수정 지적 해결 여부를 구분한다. 승인된 Delivery 문서도 재작성하지 않는다.

## 검증과 진행

- 변경 전후 차이, YAML/참조, 식별자 유무에 따른 Receipt 가능 여부와 목록 문구/실제 스키마 정합성을 확인하고 독립 재검토한다. 구현·실제 메시지 전송·외부 호출은 수행하지 않는다.
- 단독 실행의 확인/검토/완료 기록을 남기며 본 흐름의 Functional 작업은 이 수정 완료 전 시작하지 않는다. 이 수정은 PR #89 담당 리뷰를 대신하지 않는다.
- PR #89 본문은 API·ERD를 함께 리뷰 요청할 때 사용자 기준에 따라 한 번 갱신한다.

## 추적 정보

[기존 질문·확인](contract-design-questions.md) · [기존 독립 검토](review.md) · [계약 본문](contract-summary.md) · [worker 스키마](worker-messages.yaml). 기존 질문 파일·확인은 보존하고 이 파일을 이번 단독 실행의 확인 대상으로 사용한다.

## Consolidated Summary Confirmation

R-01의 Receipt 식별 가능 경계를 본문·worker 스키마 설명에 연결하고, R-02의 회원/수신자 목록 형식을 본문에서 구분한다. 그 밖의 계약과 과거 기록은 유지한 채 검증·독립 재검토 후 단독 완료를 기록한다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
