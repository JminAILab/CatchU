# Contract Design 단독 후속 기록 — 2026-10-13 처리 시한 계약 (#237)

## 기록 지위·응답 방식·판본

이번 기록은 팀장(ljm0850)이 2026-10-13 Chat으로 제공한 사실과 기록 지시를 질문·답으로 정리한다. 이미 커밋된 산출물을 다시 쓰지 않는다. 아래 답은 이번 지시문에서 추출했으며, 질문별 제품 결정을 새로 선택하거나 답 방식을 다시 묻지 않는다. 원격 댓글·리뷰의 내용과 당시 상태는 팀장이 제공한 근거로 기록하며 이번 기록에서 원격 조회로 재검증했다고 주장하지 않는다. 로컬 판본·감사 이력·바이트 보존·파싱·센서 결과는 별도 검증 기록의 실제 실행 결과다.

- 대상: `260914-catchu-october-mvp`, 브랜치 `docs/분석-처리-시한-계약`, HEAD `7e3b92b23cac43167c92f475c3b5ca69af9327bf`.
- 실행 binary/runtime와 `.codex/tools/data/aidlc-manifest.json`의 frameworkVersion은 모두 `2.11.0`이다. 10월 intent를 `aidlc engine intent switch 260914-catchu-october-mvp`로 명시적으로 선택했다.
- 본 흐름은 functional-design / Completed, Guard Policy relaxed다. 본 흐름·Unit 상태·설정·버전은 변경하지 않는다. 12월 intent는 대상이 아니다.
- 분기 기준 `729bb9c`, 변경 커밋 `fe3bf99`. 2026-10-12 #262(Catch 제목 계약)가 병합된 dev `336252b`를 병합한 커밋은 `e9b3455`다. 2026-10-13 AI-DLC 2.11.0 dev `0bfe9bf`를 병합한 커밋은 `7e3b92b`이며, 팀장이 충돌 없음을 제공했다. 로컬 비교에서 `e9b3455` 대비 10월 intent 파일 변화 없음, `0bfe9bf` 대비 5파일 42줄 교체·줄 수 증감 0을 확인했다. YAML은 수정하지 않았다. 팀장 제공 상태는 PR·병합 전이다.

## 질문·답

### Q1. 장애 복구와 처리 시한의 결정은 무엇인가?

[Answer]: 2026-10-06 팀장(ljm0850)의 [#23 댓글 6011538296](https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296)에 따라 서버·worker·큐·DB가 끊기는 흔치 않은 장애는 앱 코드에서 복구하지 않는다. 접수(submittedAt) 후 60분 안에 끝나지 않은 ACTIVE 요청은 E(api)가 주기 판정으로 실패로 닫는다. 실행이 멈췄다는 증거는 요구하지 않는다. 결과를 받았지만 반영이 끝나지 않은 요청도 같다. 반영 실패는 시한을 기다리지 않고 닫는다. CLOSED는 E가 더 처리·반영하지 않는다는 표시이며 worker 실행 중단의 증거가 아니다.

### Q2. 2026-10-07에 정한 실패 항목·증거·반영 실패의 세부는 무엇인가?

[Answer]: 60분 숫자는 계약 요약 「공통 오류·요청 안전성」에 한 번만 적고 다른 산출물은 계약의 값을 참조한다. 처리 중 시간 초과는 stage DISPATCH·code PROCESSING_DEADLINE_EXCEEDED·message "정해진 시간 안에 분석을 마치지 못했습니다."다. 반영 대기 시간 초과는 stage APPLICATION·같은 code·message "정해진 시간 안에 결과를 반영하지 못했습니다."다. 처리 중에는 FAILED/APPLIED/CLOSED, 반영 대기에는 processing 결과를 유지한 APPLY_FAILED/CLOSED다. 서버의 실패 확정 증거는 처리 중 시간 초과일 때만 남긴다. 반영 실패(APPLY_FAILED)는 E의 다음 주기 판정에서 CLOSED가 되며 RECOVERING은 목록에 남기고 쓰지 않는다. RUNNING → UNCERTAIN 전이는 추가하지 않는다.

### Q3. 재요청을 허용하는 요청과 사유는 무엇인가?

[Answer]: 등록 Catch가 0건이고 CLOSED인 두 경우만 허용한다. ① 실패 확정: FAILED/APPLIED/CLOSED·적합 후보 0·등록 0이며 F 실패 결과 또는 E 처리 시한 판정의 실패 확정 근거가 있다. ② 반영 실패로 닫힘: APPLY_FAILED/CLOSED·등록 0이며 processing 결과·적합 후보 수는 보지 않는다. 둘 다 retry.allowed=true·reason FAILURE_WITHOUT_RESULTS다. 새 동의·requestId·attemptId를 만들고 retryOfRequestId로 실패 이력을 연결한다. 정상 EMPTY, 유효 결과가 반영된 부분 실패, 아직 닫히지 않은 요청은 대상이 아니다. 기존 Catch·공개·링크를 바꾸거나 요청 ID 생략으로 우회하지 않는다.

### Q4. 제거한 복구 동작과 시도 식별자는 무엇인가?

[Answer]: 결과 보존·재전달·반영 복구, 큐에서 사라진 요청 다시 보내기, worker 실행 차단 기록, RUNNING → UNCERTAIN 전이를 두지 않는다. 같은 작업을 큐가 다시 주는 횟수는 0이다. worker는 결과를 보내면 끝이다. E 담당 yeongyeon1802는 2026-10-07 [PR #240](https://github.com/JminAILab/CatchU/pull/240) 리뷰에서 10/6 결정에 이견이 없다고 밝혔다. [#23 댓글 6032920990](https://github.com/JminAILab/CatchU/issues/23#issuecomment-6032920990)의 답에 따라 E DB 시도 ID·attemptId·큐 작업 ID에 같은 UUID를 사용한다. 이 확인은 담당자의 당시 의견이며 이번 기록의 단독 완료나 PR 승인으로 바꾸어 계산하지 않는다.

### Q5. 상위 요구사항의 자료 보존·복구·운영 통제는 어떻게 해석하는가?

[Answer]: 요구사항 문서는 소급 수정하지 않는다. 계약 요약 L201의 해석을 질문·답에 연결한다. 10월 M05의 '자료 손실 없음'과 FR1.4의 '기존 자료/링크 보존'은 이미 저장된 Catch·공개·링크를 뜻한다. 반영 전 결과는 처리 시한 초과 실패 뒤 재요청으로 다룬다. M07·NFR4의 '합의한 복구 시나리오'는 재시작·재배포 뒤 DB 자료와 공개·숨김·링크 상태 유지, 관리형 DB 자동 백업 켜짐과 보관 기간 확인이다. 근거는 [#24 댓글 6012203241](https://github.com/JminAILab/CatchU/issues/24#issuecomment-6012203241)의 10/6 운영 백업 결정이며 배포 대상은 [PR #241](https://github.com/JminAILab/CatchU/pull/241)의 AWS다. 복원 시험은 12월이다. NFR7에 따라 드문 중복·남은 자료를 운영자가 정리할 때는 식별자·상태·시각만 본다. 이번 기록은 백업·복원·배포·운영 시험을 실행한 증거가 아니다.

### Q6. 고르지 않은 안과 철회 이유는 무엇인가?

[Answer]: 시간이 지났다는 것만으로 실패를 확정하지 않는 기존 원칙(E 의견 1·2번, [PR #207](https://github.com/JminAILab/CatchU/pull/207)의 재전달·결과 복구 제안, F 답변 Q4·Q5)을 채택하지 않는다. 근거를 확인한 뒤 닫으려면 worker 시도 기록·결과 보존·운영자 확인 절차가 모두 필요하고, 이 셋이 이번에 줄이려는 앱 안 복구이기 때문이다. 같은 날 오후 고른 반영 복구용 결과 원문 보관 1-가와 E가 제안한 1-나도 같은 원칙으로 거뒀으며 #234는 닫혔다(팀장 제공 당시 상태). RUNNING → UNCERTAIN 추가도 고르지 않았다. 화면은 60분까지 실행 중이고 그 뒤 서버 판정으로 닫힌다. 9/29의 결과 보존 14일 결정은 철회했으며 worker는 결과를 보내면 끝이다.

### Q7. 받아들인 위험과 중복 등록 방어는 무엇인가?

[Answer]: 큐 자료가 사라져 같은 시도가 드물게 한 번 더 실행될 수 있고, 처리 시한으로 닫힌 뒤 앞 시도가 아직 도는 중에 재요청이 들어올 수 있다. 큐 재전달 횟수 0은 이런 자료 유실 위험까지 없애는 보장이 아니다. 한 시도에는 먼저 받은 결과 하나만 수락하며 닫힌 시도의 결과는 PAYLOAD_CONFLICT로 거부해 Catch가 늘지 않는다. 시간 초과 닫기와 결과 수신·반영이 경합하면 요청→시도 순서의 잠금 아래 현재 ACTIVE·시한 조건을 다시 판정한다. 이는 커밋된 u2-api 설계의 명시 내용이며 실제 구현·동시성 시험 통과를 뜻하지 않는다.

### Q8. 이미 바뀐 산출물과 검증 경과는 무엇인가?

[Answer]: 계약 요약과 u2-api/u1-web 기능 설계의 아래 5개 산출물만 이미 고쳐 커밋됐다. 계약 요약의 세 곳에는 처리 시한 문장과 #262의 제목 고쳐 쓰기·제목 null 문장을 함께 남겼다. 이번에는 산출물을 재작성·재저장하지 않는다. 팀장 제공 경과로 Codex 교차검증 두 번(독립 점검, 수정안 검토)과 재검증을 거쳤으며 그 검증에서 고친 줄은 rules L53, contract-summary L90, u1-web L37이다. 이 과거 교차검증과 이번 AI-DLC 독립 검토는 별도다.

| 산출물(10월 intent 상대 경로) | 팀장이 제공한 변경 행 |
|---|---|
| inception/contract-design/contract-summary.md | L59·L60·L62·L68·L69·L74·L75·L90·L140·L159·L168·L185·L203 |
| construction/u2-api/functional-design/functional-spec.md | L36·L39·L43·L45·L53·L54·L55·L56·L57·L65·L75·L76·L107 |
| construction/u2-api/functional-design/rules.md | L34·L38·L39·L53·L54·L55 |
| construction/u2-api/functional-design/entities.md | L65·L93·L128·L198·L238 |
| construction/u1-web/functional-design/functional-spec.md | L18·L34·L37·L58·L61 |

### Q9. 이번에 정하지 않거나 고치지 않는 것은 무엇인가?

[Answer]: 구현은 [#237](https://github.com/JminAILab/CatchU/issues/237)(시간 초과 닫기, 담당 ljm0850, 상위 [#134](https://github.com/JminAILab/CatchU/issues/134))에서 한다. worker 요청당 총 처리 상한은 #121에서 60분보다 충분히 짧게 정한다(20분은 제안). 끝난 시도(시한으로 닫힌 시도 포함)를 worker가 물으면 '모름'으로 답하는 것은 #232에서 맞춘다. api/src/result-application/result-application.service.ts L50~57의 ACTIVE 동안 APPLY_FAILED를 다시 반영하는 옛 복구 길은 #237 구현 때 닫는다. u3-worker 기능 설계는 이번에 고치지 않으며 entities L5·L52, functional-spec L38·L44의 결과 보존 문장은 후속 정리다. api/docs/·api/README.md·docs/CatchU_collection_control_temp_data.md·docs/CatchU_queue_requirements.md·에이전트 문서(코딩 절차)는 이번에 고치지 않는다. 12월 intent에는 설계 재개 때 입력으로 옮기며 이번에는 손대지 않는다.

### Q10. 기존 단독 실행과 후속 Unit 검토를 어떻게 연결하는가?

[Answer]: 감사 조각 macui-macbookpro-local-de1289503add.md에 있는 2026-09-23T07:02:00Z의 single-stage:contract-design 시작 한 건에 이어 붙인다. 전체 감사 조각에서 해당 단독 실행의 완료 기록은 없다. 9/24·9/30·10/5·10/6·10/9와 같은 방식으로, 새 시작 기록 없이 이번 질문·검증을 추가한다. 이 단계의 별도 사람 요약 확인 뒤 검토 요청과 report --single 완료 요청을 각각 한 번만 실행한다. SUMMARY_RECEIPT_MISSING이면 결과 원문을 보존하고 실행을 열어 두며 재시도·질문 파일 이동·추가 확인 기록·제안된 단계 재시작 등 우회는 하지 않는다. SUMMARY_ARTIFACT_UNAUTHORIZED면 한 번 기록하고 모든 진행을 멈춘다.

u2-api는 새 functional-design 단독 실행을 열어 별도 요약 확인 뒤 aidlc-architecture-reviewer-agent의 독립 검토 --single을 한 번 실행한다. READY일 때만 report --single을 한 번 실행한다. NOT-READY·의견·거부면 산출물을 고치지 않고 원문을 남긴 뒤 멈춘다. u2-api의 done 뒤에만 u1-web을 열고 같은 절차를 따른다. traceability는 실제 결과 그대로 기록하며 10/9의 u2-api missing_from_upstream_ids 23개 FAIL과 비교한다. 도구가 construction/u1-web/functional-design/reviews/review-09부터 리뷰 사본을 만들면 이동하지 않고 공식 대상 Unit과 사본 경로를 구분한다. 한 사람 답을 둘 이상의 요약 확인에 사용하지 않는다.

## 검증·보존·커밋 경계

- 지정 산출물 5개를 `7e3b92b`와 바이트 비교한다. 다르면 고치지 않고 보고한다. 계약 YAML 4개와 contract-summary.md·rules.md·entities.md의 YAML 블록을 파싱하고 required-sections·upstream-coverage 센서를 실행한다. Unit 단계에서는 traceability도 실행한다.
- 기존 9/23·9/24·9/30·10/5·10/6·10/9 질문·검증·도구 기록, review-01~08을 보존한다. 전체 추적 파일 1,504개와 12월 intent 36개의 착수 SHA-256 기준선을 저장소 밖에 확보했다. 기존 감사 꼬리는 앞부분 바이트를 보존한 채 도구만 추가한다.
- CHANGE_ACCEPTED는 원문 그대로 기록한다. 알림 제거 목적의 재저장·설정 변경은 하지 않는다. 상태·감사는 직접 편집하지 않는다. refresh·aidlc config·--force·본 흐름 next·park·compose·버전 변경은 실행하지 않는다.
- 최종 로컬 커밋 하나에는 새 질문·검증·도구 기록, 도구 리뷰 사본, 이미 있던 미커밋 줄을 포함한 10월 감사 파일을 담는다. aidlc-state.md는 도구가 바꾼 경우만 포함하고 내용을 보고한다. .local-handoffs/ 제외, push·이슈·PR·Project 변경 없음.
- 커밋 제목: `docs: 처리 시한 계약의 AI-DLC 기록 (#237)`
- 커밋 본문: `이미 반영된 처리 시한 결정을 산출물 재작성 없이 확인·검증 기록과 연결해 보존한다.`

## Consolidated Summary Confirmation

이미 커밋된 처리 시한·반영 실패·실패 재요청 계약을 산출물 재작성 없이 기록한다. 접수 후 60분을 넘긴 ACTIVE는 실행 멈춤 증거 없이 E가 닫고, 처리 중과 반영 대기의 실패 stage/message를 구분한다. 반영 실패는 다음 주기 판정에서 닫는다. 등록 0건인 실패 확정·반영 실패 CLOSED만 FAILURE_WITHOUT_RESULTS로 새 동의 재요청을 허용한다. 앱 안 복구·결과 보존·재전달·RUNNING → UNCERTAIN은 두지 않는다. 상위 요구의 자료 보존은 저장된 Catch·공개·링크이며, 운영 복구는 재시작·재배포 후 DB 상태 유지와 관리형 DB 자동 백업·보관 기간 확인으로 해석하고 복원 시험은 12월이다. 기각 이유·받아들인 위험·#121/#232/#237 후속과 u3-worker·파생 문서 유보를 위 답에 보존한다. 산출물 5개와 기존 기록을 보존한 채 9/23의 열린 계약 단독 실행에 검토 요청·완료 요청을 각각 한 번만 연결하며 거부 원문을 남기고 우회하지 않는다. 이 확인은 계약 설계 단계의 요약에만 적용되며 u2-api·u1-web에는 각각 새 요약 확인을 받는다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
