# worker — Functional Design v1

## 범위와 흐름

F(팀원 1)의 제공자 비종속 결과 처리 설계다. [entities](entities.md)의 논리 모델·[rules](rules.md)의 규칙이 각각 정본이며 아래는 그 요약이다. 구현 방법은 개발 이슈로 보완한다.

| 순서 | 처리·상태 | 실패·경계 |
|---|---|---|
| 1 요청 검사 | E가 제공한 Request의 요청/시도·본인/저장소·동의/범위를 확인 | A/F 자격정보 상세는 OQ-F1. 맥락 ID를 권한으로 간주하지 않음 |
| 2 처리 | RECEIVED → RUNNING. MOCK은 가짜 생성기로 같은 계약 사용 | 실행 확인 불가 시 UNCERTAIN. 조회 오류/시간 경과로 새 분석·FAILED를 자동 확정하지 않음 |
| 3 후보·근거 | 관측 사실/기여·한계·묶음 이유를 연결. 실패와 분리한 적합 후보 제공 | 근거 부족/기준 미달 notProvided와 처리 오류 failures 구분. workIdentity 상세는 F 제안·B/E 검토 |
| 4 초안·최소 질문 | 각각 GENERATED/FAILED/NOT_GENERATED를 결과에 표현 | 초안 실패가 곧 등록 불가는 아님. 없는 초안은 null; 질문은 본인용이며 답변 저장 없음 |
| 5 결과 종결 | SUCCEEDED/EMPTY/PARTIAL_FAILED/FAILED는 BR3.3의 후보·실패 조합 | 종결 뒤 늦은 진행 이벤트로 결과를 되돌리지 않음. 자동 재분석/보완 없음 |
| 6 E 전달 | E가 schema·맥락·중복을 검사, B가 등록/정본·본인 열람 준비 판단 | Receipt ACCEPTED≠반영 완료. 같은 ID의 다른 내용/늦은 attempt는 기존 계약대로 거부, B 중복 등록 금지 |

수신 확인은 E 책임이다. resultId·requestId·attemptId가 모두 비어 있지 않은 문자열일 때만 ResultReceipt를 보낸다. 식별 불가는 Receipt 없이 거부 기록만 남기며 원문·비밀값이나 임의 식별자를 기록하지 않는다. 세 ID가 유효하더라도 그 밖의 형식/맥락 검사를 통과해야 수락한다. 수신 확인 지연/유실이 분석 재호출 허가가 되지 않는다.

## 모델·규칙 요약

텍스트 관계도(서비스 DB ERD 아님): AnalysisResult 1→0..N WorkCandidate; WorkCandidate N↔M AnalysisEvidence(후보별 최소 1); WorkCandidate 1→1 DraftOutcome. 근거의 후보 간 재사용과 전송 배열 내 투영은 분리한다. Mermaid 중복 도식 대신 이 관계표로 최소 표현한다.

| 규칙 | 책임 |
|---|---|
| BR3.1 | 요청·허용 범위 검사 |
| BR3.2·BR3.3 | 근거/기여 적합성과 결과/실패 의미 |
| BR3.4 | 초안·최소 질문의 생성 상태 |
| BR3.5 | E 전달과 B 등록/공개 분리 |

## 연결 확인과 개발 이슈

| 시나리오 | 기대 결과·실패 조건 |
|---|---|
| 합성 적합 후보 1개 | MOCK·후보/근거를 E로 전달. 실제 LLM 성공이나 B 등록 완료로 표시하면 실패 |
| 근거 부족 / 수집 오류 | 전자는 미제공 사유, 후자는 failures. 오류 없는 후보 0건만 EMPTY |
| 초안 생성 실패·기여 확인 | 적합 후보와 FAILED/null 초안을 분리. 후보 부재로 확정하거나 본문을 보충하면 실패 |
| 식별 불가 / 동일 결과 재전달 | 전자는 Receipt 없음·거부 기록, 후자는 기존 수신 확인/등록 참조. ID 생성·새 분석·중복 Catch 발생이면 실패 |

개발 이슈로 보완: F 임시 보존 위치/수명·A/F 자격정보 상세(OQ-F1), workIdentity 함수/충돌(OQ-F2), E/F 실제 전송(#77 이후), 생성 방법과 세부 테스트. 서비스 모델은 실제 제공자 연결 전 팀장 선정이다. F 엔티티 4개는 서비스 DB 밖이며 B의 CatchEvidence·초안·최소 질문이 등록 후 정본이다.

R-01·R-02 수정본 90bf289를 적용한다. 공식 Contract 단독 실행은 열린 상태로 보존하고 수정본의 확인은 PR #89 담당 리뷰로 진행한다. 보류 정책·추가 호출 금지와 기존 M1 첫 연결 결과 승인 1회를 유지한다.

## 담당자 확인 요청

- 1 F: 결과·근거/초안/질문 의미와 실제/모의 구분, 보존/생성 상세의 개발 이슈 확인.
- 2 A/E: 요청·동의·허용 범위와 수신 확인/반영 분리 확인.
- 4 B: 등록/정본·중복·본인 표시 경계 확인. PR #89 병합 전 필수.

## 추적 정보

[unit-of-work](../../../inception/units-generation/unit-of-work.md) · [unit-of-work-story-map](../../../inception/units-generation/unit-of-work-story-map.md) · [requirements](../../../inception/requirements-analysis/requirements.md) · [components](../../../inception/domain-design/components.md) · [contract-summary](../../../inception/contract-design/contract-summary.md) · [worker YAML](../../../inception/contract-design/worker-messages.yaml) · [공통 DTO](../../../inception/contract-design/common.yaml).

[작성 전 확인](functional-design-questions.md) · [단독 수정 상태](../../../inception/contract-design/single-r01-r02-verification.md). 자료 조건은 [#37](https://github.com/JminAILab/CatchU/issues/37).
