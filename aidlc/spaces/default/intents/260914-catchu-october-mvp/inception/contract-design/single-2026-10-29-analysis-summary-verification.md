# 홈용 분석 접수 이력 유무 조회 — 계약 설계 단독 실행 중단 기록·인계 (2026-10-29)

## 결론

[#428](https://github.com/JminAILab/CatchU/issues/428) 계약 변경을 10월 intent(`260914-catchu-october-mvp`)의 계약 설계 단독 실행으로 기록하려 했으나, 담당자의 요약 확인 답을 기록할 수 없어 산출물을 쓰기 전에 중단했다. 계약 파일(member-api.yaml·contract-summary.md)은 바꾸지 않았다. 2026-09-23T07:02:00Z의 단독 실행 시도는 열린 채 두었다. 담당자 지시(2026-10-29)에 따라 추가 실행·재시도는 하지 않았다.

명령과 출력 원문은 [도구 기록](single-2026-10-29-analysis-summary-tools.json)의 같은 id에 있다.

## 확인된 사실

### 판본과 실행 환경

- 작업 위치 `C:\labs\catchu-428-contract`(worktree), 브랜치 `docs/홈-접수이력-조회-계약`, HEAD `62ce6960e4c7c76dc4e14925bae27c3b636f7c3e`(로컬 `origin/dev`와 같음). 커밋 없음.
- Claude Code, aidlc 2.11.1 (runtime 2.11.1), 세션 `e1e88bcd-ca99-46f1-8ef1-4ad99d209c4d`. 이 폴더에서 대화를 시작했다.
- 시작 때 커서: `aidlc/active-space`는 `default`(LF 포함 8바이트, 2026-10-29 15:26:33 KST 생성)로 이미 있었다. `aidlc/spaces/default/intents/active-intent`는 없었다.
- 10월 intent의 `aidlc-state.md` Status는 `Completed`다.

### 실행 순서와 결과

| 시각(UTC) | 단계 | 결과 |
|---|---|---|
| 06:43~06:44 | doctor | 문제 0건, 경고 2건(업데이트 확인 기록 오래됨, 커밋 안 한 doctor 기록). hook 마지막 실행에 record-human-turn 06:43:53Z 포함 |
| 06:47:40 | `aidlc engine intent 260914-catchu-october-mvp` | active-intent 생성 |
| 06:47~06:48 | 계약 설계 단독 실행 시작 | 거부되지 않음. 규칙 2부 전달 뒤 run-stage. 새 STAGE_STARTED 없이 9/23 시도로 이어짐 |
| 06:50:32 | 산출물 재사용 기록(Modify) | ARTIFACT_REUSED(단독 실행) |
| 06:50:39~45 | 답변 방식 질문·답(Chat, 담당자 요청 문장) | DECISION_RECORDED, QUESTION_ANSWERED |
| 06:52:34 | 요약 확인 질문 기록 | DECISION_RECORDED(단독 실행, 요약 확인) |
| 07:05:28 | 요약 확인 답 기록 1회차(선택창에서 Looks correct 직후) | exit 1, 거부 |
| 07:08:26 | 요약 확인 답 기록 2회차(채팅 `Looks correct` 직후) | exit 1, 같은 거부. 같은 명령은 여기서 멈춤 |
| 07:08:50 | doctor --verbose | 문제 0건, 경고 3건. 아래 참고 |

검토 요청과 report --single은 요약 확인이 없어 실행하지 않았다. 10/13~10/15에 기록된 SUMMARY_RECEIPT_MISSING 단계까지는 가지 못했다.

### 실패한 명령과 오류 원문

두 회차 모두 같은 명령이다.

````text
aidlc engine log answer --stage contract-design --single --checkpoint summary-confirmation --questions-file "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-29-analysis-summary-questions.md" --details "Looks correct"
````

exit_code: 1

````text
{"error":"Cannot record the summary choice because no human reply has arrived since their last answer. End the turn, wait for the human's choice, then try again."}
````

감사 조각 `aica-hrd-5b7b5ec8be9e.md`에 같은 오류가 ERROR_LOGGED 두 건(07:05:28Z, 07:08:26Z)으로 자동 기록됐다.

### 사람 응답 기록

`aidlc engine audit history --event HUMAN_TURN --limit 3`의 최근 3건은 모두 2026-10-20 다른 세션(`4017b556-…`)의 것이다. 이번 세션의 사람 응답(선택창·채팅)은 10월 intent에 한 건도 기록되지 않았다.

### doctor 전후 차이

- 전(06:44): hook 마지막 실행 = continue-workflow 06:43:01Z, plan-approval-guard 06:44:07Z, rebuild-stage-graph 06:42:53Z, record-human-turn 06:43:53Z, review-freeze 06:44:07Z, reviewer-scope 06:44:07Z.
- 후(07:08): hook 마지막 실행 = plan-approval-guard 07:08:46Z, rebuild-stage-graph 06:50:33Z, review-freeze 07:08:46Z, reviewer-scope 07:08:46Z. record-human-turn·continue-workflow가 빠졌다.
- 후에 새 경고: `[runtime-graph-missing] runtime-graph.json is missing for the active workflow.` 안내된 `aidlc engine runtime compile`은 실행하지 않았다.

### 소스에서 확인한 동작 (읽기만, 실행·재현 없음)

읽은 것은 프로젝트에 설치된 `.claude/` 사본이다. hook은 설치된 aidlc 2.11.1 명령으로 실행되며, doctor는 판본 2.11.1 일치와 AI-DLC 파일 무변경을 보고했다.

- `.claude/tools/aidlc-lib.ts` 7820~7843행
  - `selectedRecordIsFinished`는 선택된 기록의 Status가 `Completed` 또는 `Archived`면 true다.
  - `hookStandsOutside`는 대화가 그 기록에 참여하지 않았거나, 참여했어도 `selectedRecordIsFinished`가 true면 true다. 주석은 "완료된 기록에서 뒤에 오는 대화 이벤트는 그 작업의 일부가 아니다"라고 설명한다.
- `.claude/hooks/aidlc-record-human-turn.ts` 623~697행: `hookStandsOutside`가 true면 대화 메시지 저장소(기록 밖)에 메시지만 남기고 `return 0`한다. HUMAN_TURN 기록과 `record-human-turn.last` 실행 표시는 그 뒤에 있어 쓰이지 않는다.
- 단독 실행 예외: 두 함수는 단독 실행 여부를 입력으로 받지 않고 조건 안에 예외도 없다. record-human-turn의 `single` 관련 코드는 선택창 처리와, 검토 알림에서 단독 실행 검토 행을 건너뛰는 부분(317행)뿐이다.
- 참여 판정 `workflowParticipation`(7717~7754행): 사용자 커서가 그 intent를 가리키면 참여자다.
- 이력: `selectedRecordIsFinished`는 28913ede(2026-10-23, 하네스를 AI-DLC 2.11.1로 갱신)에서 들어왔다. 그 전 f8156be6(2.11.0)의 `hookStandsOutside`는 참여 여부만 봤다. 10/13~10/15 단독 실행 기록은 aidlc 2.11.0에서 실행됐다.

## 원인 추정 (재현으로 확인하지 않음)

- **유력 원인:** 10월 intent가 Completed라 2.11.1의 사람 응답 hook이 이번 대화의 응답을 HUMAN_TURN으로 남기지 않았다. 그래서 log answer가 "사람 응답 없음"으로 거부했다. 근거는 네 가지다.
  - 소스의 조건
  - Status Completed
  - 이번 세션의 HUMAN_TURN 0건
  - doctor 실행 목록에서 record-human-turn이 빠진 것(실행 표시가 바깥 판정 뒤에 쓰이는 구조와 맞음)
- **앞서 낸 '대화 도중 커서를 정한 것' 추정 재검토:** 소스상 커서가 intent를 가리키면 참여자로 판정되므로, 커서를 정한 시점은 원인으로 보기 어렵다. 다만 세션 시작 때의 연결이 선택 결과(`resolveWorkflowSelection`)에 주는 영향은 읽지 않아 완전히 배제하지는 못한다. 어느 쪽이든 Completed 조건만으로 결과가 같다. 그래서 앞서 권했던 '새 대화로 이어 가기'로는 풀리지 않았을 것이며, 그 권고는 철회한다.
- **영향:** 2.11.1에서는 완료 intent의 단독 실행이 요약 확인에서 막힌다. 다른 담당의 10월 계약 변경도 같다.
- runtime-graph-missing 경고의 원인은 확인하지 않았다. 완료 intent를 선택한 동안 나타났고, 커서를 지운 뒤에는 다시 보지 않았다.

## 현재 상태

- tracked 파일 변경 없음. `aidlc/` 아래 추적 파일 전체 해시가 작업 전 기준선과 같다. 10월 aidlc-state.md·intents.json·계약 설계 memory.md·member-api.yaml·contract-summary.md 해시도 기준선과 같다.
- untracked(커밋하지 않음)
  - `aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/aica-hrd-5b7b5ec8be9e.md`: 이번 감사 조각. ARTIFACT_REUSED, 질문·답, 요약 확인 질문, ERROR_LOGGED 2건, doctor의 GUARDRAIL_LOADED·HEALTH_CHECKED
  - `…/inception/contract-design/single-2026-10-29-analysis-summary-questions.md`: 확인 칸에 `Looks correct`가 적혔지만 기록 receipt는 없다
  - `…/inception/contract-design/single-2026-10-29-analysis-summary-tools.json`
  - `…/inception/contract-design/single-2026-10-29-analysis-summary-verification.md`(이 문서)
  - `aidlc/spaces/default/intents/audit/aica-hrd-5b7b5ec8be9e.md`: doctor 기록. 커밋 대상 아님
- gitignore 대상 런타임: `aidlc/.aidlc-sessions/`, `aidlc/spaces/default/intents/.aidlc-engine/`, `…/260914-catchu-october-mvp/.aidlc-engine/` 등. 손대지 않았다.
- 커서: 이번에 만든 `active-intent`(내용 `260914-catchu-october-mvp`)만 지웠다. `active-space`(`default`)는 그대로다.
- 9/23 시도: STAGE_STARTED만 있고 완료 기록은 없다. 열린 채 두었다.
- 주의: 앞으로 이 폴더에서 10월 단독 실행을 다시 열면, 이번 질문 파일도 단계 폴더의 `*-questions.md`로 요약 확인 대상에 잡힐 수 있다(10/13~10/15의 알려진 결함과 같은 구조).

## 다음 진행안: 별도 변경 intent

[9/23 진행 결정](../domain-design/2026-09-23-followup.md)은 완료 intent의 단독 실행이 실제로 막히면 변경 intent를 제안하도록 한다. 이번에는 시작은 됐지만 요약 확인을 남길 수 없어 단독 실행을 끝낼 수 없으므로 같은 경우로 본다.

1. **새 intent:** 이 worktree에서 새 intent를 만든다. 초기 설명에는 다음을 적는다.
   - #428 계약 범위: `GET /v1/me/analysis-summary`의 경로·응답·오류와 의미
   - 10월 기준 적용
   - `aidlc/` 기록만 담는 dev PR, `Refs #428`, D(csyg0616) 리뷰
   - 새 intent는 Status가 진행 중이므로 이번 hook 조건에 걸리지 않을 것으로 본다(소스 기준 추정).
2. **계획:** 계약 설계 단계만 도는 계획을 제안받아 승인 전에 확인한다. 계약 설계는 Unit 정의(unit-of-work·unit-of-work-dependency)를 필수 입력으로 요구하는데, 새 intent 기록에는 그 파일이 없다. 계획 제안에서 두 가지를 먼저 본다.
   - 10월 intent의 Unit 정의를 입력으로 쓸 수 있는지
   - Unit 나누기 같은 상류 단계가 덧붙는지
   - 상류 단계가 붙어 범위가 커지면 승인 전에 멈추고 다시 판단한다.
3. **산출물 위치:**
   - 새 intent 기록: 이번 변경의 계약 요약(경로·응답·의미와 10월 정본 링크)과 질문·검토·감사 기록
   - 10월 정본: member-api.yaml·contract-summary.md를 같은 PR에서 이번에 확인한 내용으로 고친다. 정본 위치는 코딩 절차의 10월 기준 문서 링크가 가리키므로 옮기지 않는다.
   - 다른 intent 폴더의 파일을 고칠 때 hook이 막는지는 확인하지 않았다.
4. **PR:** dev 대상. 다음만 담는다.
   - 새 intent 기록과 `intents.json` 행
   - 10월 정본 두 파일
   - 원하면 이번 중단 기록(위 untracked 4개 중 doctor 기록 제외)
   - 새 intent의 aidlc-state.md를 커밋할지는 10월 관례(커밋)와 12월 팀 방식(커밋 안 함) 중 정해야 한다.
5. **공유:** intent 생성은 공유 기록이 바뀌므로 팀장에게 알린다. 2.11.1에서 완료 intent 단독 실행이 막히는 점은 하네스 담당인 팀장에게 이슈로 보고하기를 권한다.

기각한 안

| 안 | 기각 이유 |
|---|---|
| aidlc 2.11.0으로 되돌려 실행 | 진행 중 계획되지 않은 aidlc 버전 변경 금지(AGENTS.md 「규칙」) |
| 10월 intent를 다시 열기(Completed 해제) | 상태 수동 수정 금지, 완료 intent 기록 변경 |
| 12월 intent에서 기록 | #428은 10월 기준 작업이고 12월 intent는 11월 개발 기준이라 범위가 다름 |
| AI-DLC 없이 일반 PR | 10월 기준은 계약 수정을 AI-DLC 기록으로 반영하도록 정함. 팀장 예외 결정이 있어야 가능 |

담당자가 정할 것

- 새 intent를 만들어 진행할지
- 이번 중단 기록을 그 PR에 넣을지
- 결함 보고를 할지
