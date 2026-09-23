# R-01·R-02 단독 수정 — 검증과 미완료 상태

## 반영·검증

| 항목 | 결과 |
|---|---|
| R-01 | contract-summary.md와 worker-messages.yaml에 세 식별자가 모두 유효할 때만 Receipt, 식별 불가 시 Receipt 없이 거부 기록만 남기는 경계 명시. 임의 식별자 생성 금지 |
| R-02 | 본문에서 회원 items/page와 수신자 profile/catches/page 구분. 수신자 YAML required/properties와 일치 |
| 구조 | YAML 4개 파싱 성공. worker는 ResultReceipt.description 추가만이며 기존 필수 필드·enum·스키마 구조 동일 |
| 보존 | common/member/recipient YAML의 HEAD 대비 바이트 동일. 기존 review.md·질문/확인·Delivery 승인본 미수정. 보호한 별도 intent 등 11개 파일 해시 동일 |
| 문서 검사 | contract-summary의 H2 11개 required-sections 통과, 변경 공백 검사 통과. 실제 제품 실행/외부 호출 없음 |

검증 스크립트의 첫 바이트 비교는 Ruby 문자열 인코딩 차이로 중단됐다. bytes 비교로 고쳐 실제 내용 동일을 확인했으며 산출물 수정으로 검사를 맞추지 않았다.

## 공식 검토 요청 거부 — 2026-09-23

현재 상태는 **수정 반영·자체 검증 완료 / 독립 검토·단독 완료 미완료**다. 지적을 공식 해결 완료로 표시하지 않는다.

- 07:06:17Z: `--single` 요약 확인 등록 성공. 식별자 `0d0b6eea631db0607d4c5b084ae4dde347a94043c8d03d40b58da10657a8c03e`, 질문 파일은 [single-r01-r02-questions.md](single-r01-r02-questions.md).
- 07:06:54Z: 본문·worker YAML의 자동 ARTIFACT_UPDATED가 위 식별자로 연결됨.
- 07:07:02Z: `log review --stage contract-design --single --reviewer aidlc-architecture-reviewer-agent --iteration 1`이 SUMMARY_RECEIPT_MISSING으로 거부됨. 재호출·재확인·대체 리뷰 완료 기록 없음.
- 읽기 전용으로 확인한 영수증에는 workflow=`single-stage:contract-design`, attempt=`unstarted`, choice=`Looks correct`와 현재 질문 파일/식별자가 있다. 합성 STAGE_STARTED는 07:02:00Z에 별도로 존재한다. 등록/파일 저장과 검토 판정 사이 불일치는 확인됐으나, 회차 판정이나 질문 경로 선택 중 무엇이 원인인지는 확정하지 못했다.
- `aidlc doctor`: 문제 0건, 경고는 2.8.2 업데이트 안내와 미커밋 기록 2종. 2.8.1 유지. 코드·훅·상태·감사 직접 수정/초기화·검사 우회 없음.

## 필요한 후속

거부 응답은 승인본 복원 또는 일반 contract-design 단계 재개를 복구안으로 제시했다. 이는 이번 단독 수정만 수행하고 상류를 재개하지 않는 범위에 맞지 않아 실행하지 않았다. 현재 확인과 수정본을 보존한 채 공식 --single 확인 연결 복구 경로를 확인해야 한다. 같은 확인/검토 호출을 원인 확인 없이 반복하지 않는다.

기존 main-workflow의 Accepted risk 이력과 과거 검토는 보존한다. Functional의 본 흐름 포인터는 Delivery 승인으로 이동했지만 Functional 작업은 아직 시작하지 않았다. PR #89 본문도 변경하지 않았다.

## 사용자 확인 원인과 후속 결정 — 2026-09-23

사용자가 별도 조사로 확인한 원인: aidlc-lib.ts의 summaryQuestionFiles/questionFilesInDir는 단계 폴더의 모든 *-questions.md를 검사 대상으로 삼는다. 단독 실행에서는 각 파일에 single-stage 워크플로 영수증을 요구한다. 본 흐름 승인 기록인 contract-design-questions.md에는 single-stage 영수증이 없으므로, 이 폴더에서는 --single의 검토 기록과 report --single이 항상 거부된다. 이번 확인·수정의 결함이 아니라 엔진 결함이다. 이 세션에서 코드를 추가 조사하거나 거부 호출을 재실행한 결과가 아니라 사용자가 제공한 원인 확인을 기록한다. 앞 절의 당시 미확정 진단은 이력으로 보존한다.

**공식 단독 완료 불가, R-01·R-02 수정본(90bf289)은 PR #89 담당 리뷰로 확인.**

단독 실행은 완료 처리하지 않고 열린 상태로 둔다. 재호출·질문 파일 이동·영수증 추가 생성·검사 우회는 하지 않는다. 사용자 지시에 따라 본 흐름의 next로 Functional Design을 시작하며, 열린 단독 실행 때문에 차단되면 우회 없이 중단한다. PR #89 본문과 과거 승인·위험 수용·감사 기록은 수정하지 않는다.

실행 결과: 본 흐름 next는 열린 단독 실행으로 차단되지 않았다. contract-design·delivery-planning 변경 감지는 advisory로 남겼으며 상류를 재개하지 않았다. Functional Design의 기본 Unit 반복은 u3-worker부터 반환됐다. 코딩 게이트를 두지 않는 기존 결정에 맞춰 내장 walking-skeleton 코딩 절차는 off로 기록했고, Delivery의 M1 첫 연결 결과 승인 1회와 Functional 단계 최종 승인은 그대로 유지한다.
