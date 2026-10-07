# 2026-10-06 r2 계약 추가 기록 — 검증과 단독 실행 상태 (#219)

검사 위치는 `/Users/ljm/Desktop/github/CatchU`, 비교 기준은 `466a40272dfa0bbce64f807d563695690e47d58c`이다. [이번 질문](single-2026-10-06-r2-questions.md)의 팀장 결정을 [PR #235 Codex 지적](https://github.com/JminAILab/CatchU/pull/235#discussion_r4192563642) 및 두 보완 문장과 대조했다. 지시문에 적힌 `466a40253`은 로컬에서 해석되지 않는다. 실제 HEAD와 읽기 조회한 PR head가 같은 `466a40272dfa…`이고 a7f6ddd 이후 두 파일·각 한 줄 보완이 일치한다. PR은 읽기 조회 시 OPEN·미병합이며 원격 갱신은 하지 않았다.

## 결정·반영 대조

| 대상 | 확인한 내용 |
|---|---|
| contract-summary.md 117행 | 429는 처리하지 않은 요청이며 앞선 같은 키 요청의 결과를 알려 주지 않음. 응답 불명 요청은 키 유지, Retry-After 뒤 같은 키·같은 본문 재전송 |
| u1-web functional-spec.md 74행 | 429 RATE_LIMITED를 확정 결과로 보지 않고 키 유지, Retry-After 뒤 같은 키 재전송. 행 앞부분의 같은 사용자·operation·본문 유지와 결합해 같은 본문도 유지 |
| 두 문장의 의미 | 429 = 처리하지 않음, 키 유지, Retry-After 뒤 같은 키 재전송으로 일치 |
| 앞선 결정 | 회원 인증 다음·입력 검사·비밀번호 해시·저장보다 먼저 429/RATE_LIMITED 판정, 상한 값은 api 설계라는 문구 유지 |
| 팀장 판단 | 같은 키 비밀번호 재요청도 해시 비교가 필요하므로 제한에서 제외하면 해시 반복 경로가 생긴다는 결정. 제품 해시 성능 시험으로 세지 않음 |
| 후속 구현 | web의 키 유지 수정은 csyg0616에게 요청할 후속 작업이며 이번 기록에서 코드 수정·담당자 메시지 발송 없음 |

## 검증과 보존

Ruby YAML.safe_load·JSON 파서, 파일 및 JSON Pointer 참조 해석, Python/git 바이트 비교를 사용했다. 명령·결과 원문과 최종 검사 스크립트는 [도구 기록](single-2026-10-06-r2-tools.json)에 남긴다. 실제 API·DB·화면 동작이나 해시 성능, PR 승인·병합·배포 검증의 증거가 아니다.

| 항목 | 결과 |
|---|---|
| YAML·참조 | 계약 YAML 4개·요약 YAML 블록 3개 파싱 PASS, `$ref` 203개 해석 PASS |
| createShareLink 응답 | 200·201·400·401·403·404·409·429·500, a7f6ddd와 동일 |
| unlockLink 응답 | 200·400·401·404·429·500, a7f6ddd와 동일 |
| getPublicCollection·getPublicCatch 응답 | 각각 200·400·401·404·500, a7f6ddd와 동일 |
| 보완 diff | a7f6ddd 대비 두 파일의 지정 문장(구분 마침표 포함)을 제거하면 원문 바이트와 동일. 각 한 줄 보완만 존재 |
| required-sections | 계약 H2 11개, web H2 7개, 각각 findings 0·pass true |
| upstream-coverage | 계약 consumes 4개·deliverables contract-summary, web consumes 5개·deliverables functional-spec,traceability 명시. 각각 누락 0·pass true |
| web traceability | FAIL 43건: 전역 FR 20개 누락, BR 대상 요구 22개, rules.md 부재 1개. 9/24·9/30 기록과 동일. gaps·orphans·missing_from_table·invalid_entries 없음 |
| web 추적 내용 | coverage 22행의 모든 W1~W8 대상이 실제 흐름에 존재. FR4.3 → W6, FR4.4 → W6 W7 유지. 가짜 BR·rules 생성 없음 |
| 산출물 보존 | 계약 5개·세 Unit 기능 설계 10개, 합계 15개가 실제 보완 커밋과 바이트 동일 |
| 과거 기록 보존 | 질문·검증·review 40개가 실제 보완 커밋과 바이트 동일. 9/23·9/24·9/30·10/5·10/6 앞선 기록 포함 |
| 검사 스크립트 준비 오류 | git show에 절대경로 사용, recipient 경로의 /v1 접두사 가정, web 추가 문장 앞 구분 마침표 누락의 세 검사 작성 오류를 /tmp 스크립트에서 바로잡음. 제품 산출물·센서·검토·report 변경이나 재시도가 아님 |

## 단독 실행 연결과 결과

감사 전체에서 계약 single-stage:contract-design의 STAGE_STARTED는 2026-09-23T07:02:00Z 한 건이며 STAGE_COMPLETED는 없다. 새 시작을 실행하지 않고 기존 단독 실행에 이번 질문 확인을 연결한다. 이번 별도 사용자 응답 Looks correct를 질문 파일에 반영한 뒤 SUMMARY_CONFIRMATION_RECORDED가 성공했다. 확인 식별자는 `98fd1a17ea92b38c27cbbe47ceb458f7f240db86c6cf80df2c99d596dfe22ef9`다.

검토 요청과 report --single을 각각 한 번 실행했다. 검토 요청은 exit 1 및 SUMMARY_RECEIPT_MISSING으로 거부됐고, report는 exit 0이지만 kind: error로 완료를 거부했다. 앞선 10/6 기록과 같은 전체 질문 폴더 확인 한계이며 이번 확인 성공을 계약 단계 완료로 세지 않는다. 기존 9/23 실행을 열어 두고 재시도·질문 파일 이동·추가 영수증·설정 변경·우회를 하지 않았다. 거부가 반환한 restart-stage·restore-or-jump 및 본 흐름 next 제안도 실행하지 않았다. SUMMARY_ARTIFACT_UNAUTHORIZED는 발생하지 않았다.

## 환경·주변 상태

10월 intent를 `aidlc engine intent switch 260914-catchu-october-mvp`로 명시 선택했다. 본 흐름은 Completed·relaxed이며 recovery.md에도 마지막 기능 설계 및 유효한 상태 파일이 남아 있다. 2.10.0을 보존하고 refresh·--force·본 흐름 next·park·compose와 상태·감사 직접 편집을 하지 않았다. 착수 감사 133,491바이트와 기존 미커밋 세션 기록은 그대로 유지한다.

`aidlc doctor`는 binary 2.10.0을 확인했으며 exit 1(1 problem, 5 warnings)이었다. 기존 `.claude/worktrees/affectionate-edison-c38158` 중첩 저장소의 HEAD 해석 실패로 source boundary를 바인딩하지 못하는 문제와 오래된 pin 등록·업데이트 캐시·미커밋 기록·runtime graph·hook heartbeat 경고를 반환했다. 설정·중첩 저장소·runtime을 수정하거나 복구 명령을 실행하지 않았으며 결과 원문은 도구 기록에 보존한다.

요약 확인 전 재대조에서 기존 추적 파일 변경은 10월 감사뿐이고 착수 감사 전체 prefix·상태·12월 intent·docs/·코드를 보존했다. git diff --check는 PASS다. 현재 로컬 origin/dev 참조는 `baa128c8963a906e3d52e162f92dda18ebef4979`로 진행돼 있지만 HEAD와의 merge-base는 지시한 분기 기준 `729a52dd3e314ed70d00b28b39641cdea4179bbe`와 같다. fetch·merge·rebase는 하지 않았다.

## 요약 확인·검토 요청·완료 보고 원문

### 요약 확인

```text
aidlc engine log answer --stage contract-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-06-r2-questions.md --details 'Looks correct'
```

exit_code: 0

```json
{"emitted":"SUMMARY_CONFIRMATION_RECORDED","checkpoint":"summary-confirmation","stage":"contract-design","summary_authorization_id":"98fd1a17ea92b38c27cbbe47ceb458f7f240db86c6cf80df2c99d596dfe22ef9"}
```

### 검토 요청 — 1회

```text
aidlc engine log review --stage contract-design --single --reviewer aidlc-architecture-reviewer-agent --iteration 1
```

exit_code: 1

```json
{"error":"Cannot start review for \"contract-design\": no fresh human-backed consolidated summary confirmation is recorded. Present the summary, then run `aidlc-log.ts answer --checkpoint summary-confirmation --stage contract-design --single --details \"Looks correct\" after the human responds.\n{\"kind\":\"ask\",\"ask_type\":\"guard-recovery\",\"response_route\":\"execute-remedy\",\"question\":\"The next action for \\\"contract-design\\\" would be refused. Choose one authority-preserving recovery action.\",\"stage\":\"contract-design\",\"reason_codes\":[\"SUMMARY_RECEIPT_MISSING\"],\"remedies\":[{\"op\":\"restore-or-jump\",\"action\":\"This stage is already approved; restore the reviewed source state, or jump back with /aidlc --stage contract-design to redo it.\",\"operation\":{\"kind\":\"restart-stage\",\"stage\":\"contract-design\"},\"command\":\"aidlc engine orchestrate next --stage contract-design\",\"requiresHuman\":true,\"executableNow\":true,\"interaction\":\"command\"}]}"}
```

### 완료 보고 — 1회

```text
aidlc engine orchestrate report --single --stage contract-design --result completed
```

exit_code: 0

```json
{"kind":"error","message":"Refusing to complete \"contract-design\": no fresh human-backed consolidated summary confirmation is recorded. Present the summary, then run `aidlc-log.ts answer --checkpoint summary-confirmation --stage contract-design --single --details \"Looks correct\" after the human responds."}
```

## 커밋 전 최종 보존 확인

계약·설계 산출물 15개와 과거 질문·검증·review 40개 모두 실제 보완 커밋 466a40272dfa와 바이트 동일하며 변경된 기존 추적 파일은 10월 감사 하나다. 착수 감사 전체 prefix와 이미 붙어 있던 미커밋 세션 기록 548바이트를 보존한다. 상태 파일·12월 intent·설정·버전 스탬프·docs/·서비스 코드는 그대로다. 새 review-05.md는 공식 record의 body 및 완료 전에 확보한 리뷰 원문과 동일하다. aidlc-state.md 변경이 없어 커밋에 포함하지 않는다. 새 기록 5개·도구의 새 리뷰 사본 1개·10월 감사 1개만 단일 커밋에 포함하며 .local-handoffs/와 무시 대상 runtime은 제외한다. push하지 않는다.
