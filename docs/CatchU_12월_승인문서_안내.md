# CatchU 12월 승인 문서 안내

12월 목표의 요구사항과 사용자 스토리는 2026-09-28에 처음 승인됐고, [11월 개발 범위 결정](CatchU_11월_범위_결정.md)을 반영해 **2026-10-24 재승인**됐다. 이어 도메인 설계(10-24), Unit 나누기·계약 설계·납품 계획(10-26)까지 승인하고 기능 설계 직전에 park했다. 아래는 팀이 승인 원본을 찾아 읽기 위한 안내다. 요구사항·답변·검토·승인 기록은 `aidlc/`의 원문을 사용한다.

재승인판은 9월 승인판과 같은 경로에 있다. 9월 승인판은 커밋 `f552efab`의 같은 경로에서 읽는다(예: `git show f552efab:aidlc/spaces/default/intents/260925-intent-12/inception/requirements-analysis/requirements.md`). 11월 개발 범위 결정은 그 문서에 적힌 대로 재승인 뒤에는 결정 이유를 남긴 기록으로 읽는다.

## 읽는 순서

| 확인할 내용 | 문서 | 먼저 볼 부분 |
|---|---|---|
| 목표·필수와 후순위·일정·미결 | [12월 요구사항](../aidlc/spaces/default/intents/260925-intent-12/inception/requirements-analysis/requirements.md) | 「지위와 일정」 → 「기능 요구사항」 → 「후속 미결」 |
| 사용자 행동과 완료 기준 | [사용자 스토리](../aidlc/spaces/default/intents/260925-intent-12/inception/user-stories/stories.md) · [사용자군](../aidlc/spaces/default/intents/260925-intent-12/inception/user-stories/personas.md) | 「읽는 방법과 공통 기준」 → 담당 기능의 스토리와 수용 기준 |
| 요구사항과 스토리 연결 | [추적표](../aidlc/spaces/default/intents/260925-intent-12/inception/user-stories/traceability.json) | 해당 요구사항의 연결 스토리 |
| 결정 이유와 9월 기준에서 바뀐 것 | [질문·답변](../aidlc/spaces/default/intents/260925-intent-12/inception/requirements-analysis/requirements-analysis-questions.md) · 요구사항 「입력 추적」 | 요구사항이 인용한 질문, 「9월 요구사항 → 현행」 |
| 기능이 놓이는 곳과 설계 결정 | [컴포넌트 목록](../aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/components.md) · [설계 결정 기록](../aidlc/spaces/default/intents/260925-intent-12/inception/domain-design/decisions.md) | 「Component Summary」·「Entity Ownership」, 관련 결정 |
| Unit과 연결 순서 | [Unit 정의](../aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work.md) · [Unit 의존](../aidlc/spaces/default/intents/260925-intent-12/inception/units-generation/unit-of-work-dependency.md) | 「공통 전제」 → 해당 Unit 절, 「계약 의존 (DAG 밖)」 |
| Unit 사이 약속 | [계약 요약](../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md) | 「공통 전제」 → 「Contracts」 → 해당 Unit이 주거나 받는 계약 |
| 착수 순서·담당·합치기(11월 당시 운영 기록, 지금은 적용하지 않음) | [Bolt 계획](../aidlc/spaces/default/intents/260925-intent-12/inception/delivery-planning/bolt-plan.md) · [담당 배정](../aidlc/spaces/default/intents/260925-intent-12/inception/delivery-planning/team-allocation.md) · [순서 근거](../aidlc/spaces/default/intents/260925-intent-12/inception/delivery-planning/risk-and-sequencing-rationale.md) · [외부 의존](../aidlc/spaces/default/intents/260925-intent-12/inception/delivery-planning/external-dependency-map.md) | 「착수 규칙」 → 「합치기와 dev 반영」, 담당 배정 「팀 방식 준비」 |
| Unit마다 돌릴 검사 | [검사 명령](../aidlc/spaces/default/intents/260925-intent-12/verification-command.txt) | 전체 |
| 승인과 정지 | [상태 파일](../aidlc/spaces/default/intents/260925-intent-12/aidlc-state.md) · [재승인 감사 기록](../aidlc/spaces/default/intents/260925-intent-12/audit/macui-macbookpro-local-abc1112aa5fb.md) | 단계별 체크와 「Parked」, 단계마다 마지막 `Gate Approved` |

## 적용 범위와 마감

개발 목표의 관계와 확정 산출물의 선반영은 [문서 안내의 「개발 목표와 마일스톤」](README.md#개발-목표와-마일스톤)을 따른다.

- 10월 MVP 구현은 [10월 승인 요구사항](../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md)과 해당 설계·계약을 따른다. 12월 계약은 10월 계약 파일을 고치지 않고, 10월 계약에서 이어 쓰는 것과 대체하는 것을 계약 요약 「공통 전제」의 표에 적었다. 대체는 해당 Unit을 구현할 때 적용한다.
- **링크 정책의 차이:** 10월은 Catch 숨김·확인된 GitHub 저장소 비공개 전환을 기존 링크에도 반영해 해당 Catch의 수신자 열람을 막는다(10월 FR3.4·FR4.1·FR1.5). 12월은 발행 당시 내용을 고정 보존한다(12월 요구사항 FR4.1·FR4.5). 10월 링크는 옮기지 않고, 12월 전에 10월 데이터를 모두 초기화해 새 발행본 정책으로 시작한다(같은 문서 C04).
- 일정은 11월 개발 → 11/13 1차 통합 확인 → **11/30 개발 완료** → 12월 1~9일 시연 리허설·제출 자료 정리(기능 개발 없음) → **12월 10일 제출**이다(요구사항 「지위와 일정」). 일정 안에 구현할 수 있는지는 미검증이다.
- 프로젝트 목표에서 제외한 기능과 채택하지 않은 안은 요구사항 「범위 밖과 채택하지 않은 항목」에 있다. 9월 원문의 당시 지위 기록은 보존한다.

## 승인 원본과 후속 작업

산출물 본문의 ‘요약 확인은 최종 승인이 아니다’ 같은 문장은 작성 당시의 경계를 적은 것이다. 단계 승인과 정지 여부는 위 상태 파일과 감사 기록에서 확인한다. 9월 승인의 감사 기록은 [`macui-macbookpro-local-09cc8fc17dfe.md`](../aidlc/spaces/default/intents/260925-intent-12/audit/macui-macbookpro-local-09cc8fc17dfe.md)이고, `verification/`의 요구사항·사용자 스토리 승인·정지·검증 기록 네 개는 9월 승인판에 대한 기록이다. 모두 고치지 않고 보존한다.

기능 설계부터 시작한 Construction은 AI-DLC 팀 방식으로 진행해 끝났다. Unit은 [#494](https://github.com/JminAILab/CatchU/pull/494)와 [#533](https://github.com/JminAILab/CatchU/pull/533)으로 `dev`에 들어갔고, 12월 intent는 2026-11-14에 보관했다([#550](https://github.com/JminAILab/CatchU/issues/550)). 보관한 intent는 AI-DLC로 더 이어 가지 않는다. 마무리 검증은 [2차 통합 확인](CatchU_통합확인.md)으로 한다.

재승인 입력은 [12월 재승인 입력](ai-dlc-input-december/CatchU_12월_재승인_입력.md)이다. 기존 [12월 입력](ai-dlc-input-december/CatchU_12월_범위_보완.md)은 9월 결정의 출처로 보존한다.

## 공유 판본

- 재승인 기록: 브랜치 `docs/12월-재승인`. AI-DLC 2.11.1로 진행했고 저장소 판본과 같다. 문서 열람에 도구 실행은 필요하지 않다.
- 9월 승인 기록: 원본 브랜치 `docs/december-requirements`, 원본 커밋 `47bf74a370622ecb4755fb562f86162d97101986`. 당시 AI-DLC 2.10.0으로 작성·승인했다([2.10.0 적용·검증 기록](ai-dlc/2026-09-29_2.10.0_dev_적용검증.md)).

## 결정 이력

- **2026-09-29** — 승인된 12월 요구사항·사용자 스토리를 GitHub에서 공유하기 위해 원본 링크·적용 범위·정지 및 인계 기록의 읽기 순서를 안내했다. 제품 결정과 기존 승인 원본은 변경하지 않았다.

- **2026-09-29** — 사용자 요청에 따라 같은 PR에 기존 AI-DLC 2.10.0 갱신을 포함했다. 승인 원본과 정지 상태는 보존하며 후속 단계는 재개하지 않았다.

- **2026-10-17** — 10월 내부 중간 마일스톤과 12월 공개 목표의 관계 및 확정 산출물의 선반영 기준을 공통 문서로 연결했다. 요구사항·사용자 스토리·정지 기록과 실행 계약은 변경하지 않는다.

- **2026-10-21** — 팀장 결정인 [11월 개발 범위 결정](CatchU_11월_범위_결정.md)을 읽는 순서·적용 범위·후속 작업에 연결했다. 마감 비필수·후순위 기능을 프로젝트 목표에서 제외하고, 11월 전 요구사항 재승인 방식과 11월 기능 구현을 재승인 뒤 시작한다는 것을 기록했다. 승인 원본·감사·정지 기록은 변경하지 않았다.

- **2026-10-23** — 11월 개발 범위 결정의 2026-10-22·23 변경(PDF 포함·외부 URL 자료 제외, AI-DLC 2.11.1로 올린 뒤 재승인, 구현은 AI-DLC 팀 방식)에 맞춰 제외 목록 문장과 재개 방식을 고쳤다. 같은 날 자동 리뷰 지적에 따라 제외 범위를 그 문서의 제외 목록으로 한정하는 문장으로 고쳤다. 승인 원본·감사·정지 기록은 고치지 않았다.

- **2026-10-26** — 2026-10-24~26 재승인(요구사항부터 납품 계획까지)을 반영해 읽는 순서를 재승인판과 설계·Unit·계약·납품 계획 문서로 바꾸고, 9월 승인판을 읽는 위치와 일정을 고쳤다. 9월 승인 원본·감사·정지 기록은 고치지 않았다.

- **2026-11-14** — 11월 개발이 끝나 12월 intent를 보관한 것([#550](https://github.com/JminAILab/CatchU/issues/550))에 맞춰 후속 작업 문장을 고치고, 읽는 순서 표의 착수·합치기 줄을 당시 운영 기록으로 표시했다([#551](https://github.com/JminAILab/CatchU/issues/551)). 승인 원본·감사 기록은 고치지 않았다.
