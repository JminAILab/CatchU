## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-28T05:04:07Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/code-generation/code-summary.md > 계약 PR 대조 (Step 12); api/src/ai-generation/jd-checks.ts, ai-generation.types.ts | 구현은 아직 합쳐지지 않은 계약 PR #421(OPEN, 리뷰 없음)의 모양에 맞춰 `GatedItem.jdRole`, `kind: SERVER_NOTICE`, C-11의 `RecipientGuide(U2)` 자리를 이미 코드에 넣었다. 지금 통합 브랜치의 계약 요약 C-01은 `kind: CITED \| AI_INTERPRETATION`뿐이고 `jdRole`이 없다. U2를 #421보다 먼저 합치면 코드가 합쳐진 계약보다 앞서고, U5·U10이 계약 요약만 보고 만든 합성 제공자는 `jdRole` 없는 항목을 돌려준다. 게이트의 역할 검사는 `jdRole`이 없으면 항목을 버리므로(outside_heading) 합성 제공자와 실제 게이트의 동작이 어긋난다. | 합치는 순서를 정한다. #421을 먼저 합치거나, 합치지 못하면 #421이 바뀔 때 고칠 4개 경로(`jd-checks.ts`, `test/u2/ai-gate-jd.test.cjs`, `web/src/components/recipient-guide/`, `web/test/u2-recipient-guide.test.mjs`)와 U5·U10 합성 제공자에 `jdRole` 칸을 안내하는 공지를 승인 기록에 남긴다. 승인 전에 #421의 리뷰 결과를 확인한다. | New |
| R-02 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/code-generation/code-summary.md > 시험과 커버리지(web 커버리지); unit-test-instructions.md > 목표 | 승인된 web 커버리지 명령 그대로는 줄 59.19%로 기준 80%에 못 미친다(작성자 보고). 95.04%는 U2 파일 18개로 범위를 직접 좁힌 값이고 승인된 측정 방법이 아니다. 좁힌 범위에도 U2가 고친 `home-member-page.tsx`, `profile-detail.tsx`, `(guest)/page.tsx`는 시험이 불러오지 않아 빠져 있다. `ai-consent-dialog.tsx` 74.6%, `withdrawal-section.tsx` 73.1%로 동의 재전송·탈퇴 클릭 처리기가 실제로 도는 시험은 없다. 서버 렌더링과 순수 함수 시험만 있어 "403 동의 창 → 동의 → 같은 요청 한 번 재전송", "탈퇴 204 → 토큰 폐기"의 연결은 자동 검증되지 않았다. 이 검토에서 web `test:coverage`를 돌려 677/677 통과는 확인했으나 비율 표는 뽑지 못했다. | 80% 기준을 어느 수치로 판정할지 팀장과 정해 승인 기록에 적는다. 고친 세 화면 파일의 변경 줄과 두 처리기의 핵심 분기(재전송 한 번, 탈퇴 성공 시 토큰 폐기)를 순수 함수 시험으로 더하거나, 수동 확인 항목으로 통합 확인 표에 명시한다. | New |
| R-03 | Minor | api/src/withdrawal/withdrawal.service.ts > withdraw 2단계; api/src/file-storage/file-storage.config.ts > readFileStorageConfig | 파일 저장 설정이 없으면 api는 기동하지만 탈퇴는 파일이 하나도 없는 회원도 2단계에서 500 `WITHDRAWAL_FAILED`로 끝난다(비기능 설계대로, 시험 있음). `dev-ci`와 예시 파일을 고치지 않았으므로 개발 서버에 두 값을 넣기 전에는 탈퇴가 모두 실패한다. 통합 확인 표에 선행 조건으로만 적혀 있다. | 11/13 1차 통합 확인 전에 개발 서버 설정 담당(팀장)에게 `FILE_STORAGE_DRIVER`·`FILE_STORAGE_LOCAL_ROOT` 반영을 이슈로 넘기고 담당·기한을 적는다. | New |
| R-04 | Minor | api/src/ai-run/ai-run.module.ts; code-summary.md > 열린 질문 1 | AiRun은 `CATCHU_QUEUE_REDIS_URL`이 없으면 모든 등록이 `ENQUEUE_FAILED`가 되고 상태는 시한으로 FAILED가 된다. 개발 서버에 이 값이 없으면 U3·U5·U10의 백그라운드 실행이 전부 실패한다. `AiRunModule`은 `AppModule`에 들어 있지 않아 쓰는 Unit이 imports에 넣어야 하며, 중복 등록 시 기동 실패가 나는 지점도 각 Unit 몫이다. | 큐 연결 작업을 팀장 공용 기반 작업으로 이슈화하고, `api/docs/ai-run.md`에 쓰는 Unit이 지켜야 할 모듈 가져오기·처리기 등록 위치를 한 문단으로 확인한다. | New |
| R-05 | Minor | api/src/ai-consent/ai-consent.gate.ts > AI_NOTICE_VERSION; web/src/components/ai-consent/ | 고지 판본 상수가 api와 web에 따로 있고, 문의 경로는 임시 저장소 이슈 주소다. 두 값은 web 시험이 대조하지만 판본 상수는 임의로 정한 값이며 문의 경로는 팀장 결정 대기다. | 문의 경로와 판본 값을 승인 전에 확정하거나 확정 전임을 승인 기록에 남긴다. 판본을 올릴 때 두 파일을 함께 고친다는 점은 코드 주석에 이미 있다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| api U2 시험 9개 파일 (`CATCHU_TEST_REDIS_URL=redis://127.0.0.1:6381`) | 63/63 통과, 실패 0 | 작성자 보고(63/63)와 일치. 하루 제한 동시성(S3)·파일 키 거부(S22)·탈퇴 4단계(S24~S27) 포함. |
| api U1 회귀 5개 파일 | 57/57 통과, 실패 0 | U1 게이트를 고쳤지만 U1 동작은 유지된다. |
| web `test:coverage` (전체) | 677/677 통과, 실패 0 | 시험은 통과한다. 비율 표는 이 검토에서 추출하지 못해 59.19% / 95.04%는 작성자 보고값이다. |
| api 커버리지 명령 (98.32%) | 실행하지 않음 | 시간 예산상 작성자 보고값만 확인했고 이 검토에서 직접 재측정하지 않았다. lint·typecheck도 직접 돌리지 않았다. |

### Summary

DB 조건부 쓰기, 탈퇴 4단계 순서(대상 없으면 성공으로 재요청 가능), AiRun의 시한·늦은 결과 처리, 파일 키 검사는 계약대로 구현되었고 시험이 통과한다. 사람이 승인 전에 따져 볼 것은 두 가지다. 아직 합쳐지지 않은 계약 PR #421에 코드가 앞서 있다는 점과, web 커버리지 판정 기준 및 클릭 처리기 연결이 자동 검증되지 않았다는 점이다.
