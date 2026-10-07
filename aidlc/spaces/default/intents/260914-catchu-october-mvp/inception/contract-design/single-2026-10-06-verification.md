# 2026-10-06 계약 변경 기록 — 검증과 단독 실행 상태 (#219)

검사 위치는 `/Users/ljm/Desktop/github/CatchU`, 판본은 `37b50f055847f27d549f53e89029486dabd529c1`이다. 브랜치 `docs/링크-발급-빈도-제한-계약`의 PR·병합 전 변경을 [이번 질문](single-2026-10-06-questions.md)의 2026-10-06 팀장(ljm0850) 결정과 대조했다. 분기 기준은 `origin/dev`의 `729a52dd3e314ed70d00b28b39641cdea4179bbe`다. 계약·설계 산출물을 다시 쓰거나 저장하지 않았다.

## 결정·반영 대조

| 대상 | 확인한 내용 |
|---|---|
| contract-summary.md 117행 | 같은 회원 발급 빈도 상한 초과는 회원 인증 다음, 입력 검사·비밀번호 해시·저장보다 먼저 429/RATE_LIMITED. 남은 초는 Retry-After. 값은 api 설계. 거부 시 링크·멱등 기록을 남기지 않아 같은 키의 재요청 가능 |
| 같은 파일 131행 | 공통 429 표에 기존 LINK_UNLOCK_LIMITED와 회원 링크 발급 빈도 제한 RATE_LIMITED를 함께 기재 |
| 같은 파일 188행 OQ-C1 | 수신자 경로의 429는 기존 unlock 시도 제한에만 사용한다는 경계 유지 |
| common.yaml 241행 RetryAfter | 다시 보낼 수 있을 때까지 남은 초이며 비밀번호 시도 차단·발급 빈도 제한에 공통 적용. schema는 integer·minimum 1 |
| member-api.yaml createShareLink | 429 응답이 `./common.yaml#/components/responses/Error429`를 참조. Error429의 Retry-After는 공통 RetryAfter 참조 |
| u2-api BR2.12·F6 | logic 앞의 해시·저장 전 빈도 판정, violation 앞의 429 RATE_LIMITED, F6의 발급 0단계가 계약과 일치 |
| 결정 근거와 범위 | #219(상위 #212), NFR5 비용 통제. 상한 예정값 회원당 1분 10회는 계약에 없음. api 배치와 앞단을 택하지 않은 근거는 팀장 판단으로 기록하며 배포 실험으로 세지 않음. N=2^15·r=8·p=3 해시 강화는 내부 구현 |

#219를 `gh issue view 219 --repo JminAILab/CatchU --json number,title,body,state,url,assignees`로 읽기 조회했다. 제목은 「[공통] 요청 빈도 제한과 링크 비밀번호 해시 강화」, 담당은 ljm0850이다. 이슈의 해시 호환·계산 시간/메모리 측정·발급/비밀번호 확인 제한의 구현 완료 기준은 이번 계약 문서 검증으로 충족했다고 계산하지 않는다. 이슈 본문에 남은 배치 위치 미정·옛 429 설명은 이번 사용자 결정과 판본의 경과로 구분하며 원격 본문을 고치지 않았다.

## 검증과 보존

Ruby YAML.safe_load·JSON 파서, 파일 경로 및 JSON Pointer 참조 해석, Python/git 바이트 비교를 사용했다. 명령과 센서 결과 원문은 [도구 기록](single-2026-10-06-tools.json)에 남긴다. API·DB 실행 시험, 해시 성능 측정, PR 승인·병합 또는 배포 검증의 증거가 아니다.

| 항목 | 결과 |
|---|---|
| YAML·참조 | 계약 YAML 4개·요약 YAML 블록 3개 파싱 PASS, 모든 `$ref` 203개 해석 PASS |
| 발급 createShareLink | 200·201·400·401·403·404·409·429·500 일치 |
| 수신자 unlockLink | 200·400·401·404·429·500 그대로 |
| getPublicCollection·getPublicCatch | 각각 200·400·401·404·500 그대로 |
| required-sections | contract-summary H2 11개, findings 0, pass true |
| upstream-coverage | consumes 4개·deliverables contract-summary 명시. unreferenced 빈 배열, pass true |
| 산출물 보존 | 계약 5개·각 Unit 기능 설계 10개, 합계 15개가 37b50f0과 바이트 동일 |
| 과거 기록 보존 | 계약·기능 설계 폴더의 질문·검증·review 33개가 37b50f0과 바이트 동일. 9/23·9/24·9/30·10/5 포함 |
| 감사 보존 | 착수 시 감사 전체를 prefix로 보존. 시작 시 미커밋 2,740바이트도 그대로 유지. HEAD 감사의 prefix도 동일 |
| 주변 파일 | 착수 시 추적 파일 939개 SHA-256 대조에서 기존 변경은 10월 감사뿐. aidlc-state.md·12월 intent·docs/·하네스 무변경 |
| 공백 검사 | 검토 전 git diff --check PASS |

```text
aidlc engine sensor-required-sections --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md --stage contract-design
aidlc engine sensor-upstream-coverage --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md --stage contract-design --consumes unit-of-work,unit-of-work-dependency,components,requirements --deliverables contract-summary
```

## 요약 확인·검토·완료 상태

감사 전체에서 계약 단독 실행의 STAGE_STARTED는 `audit/macui-macbookpro-local-de1289503add.md`의 2026-09-23T07:02:00Z 한 건이며 해당 단독 실행의 STAGE_COMPLETED는 없다. 새 계약 차수를 만들지 않았다. 이번 질문의 요약 확인 뒤 검토 요청·report --single을 각각 한 번만 실행한 결과는 아래에 기록한다.

10월 intent를 명시적으로 선택했다. 2.10.0·설정·본 흐름 Completed·relaxed·Unit 상태를 보존한다. 상태·감사는 직접 편집하지 않았다. refresh·--force·본 흐름 next·park·compose를 실행하지 않는다. 기존 미커밋 세션 기록을 포함한 10월 감사와 새 기록을 지정 메시지의 한 커밋으로 남기고 push하지 않는다.

## 이번 요약 확인·검토·완료 결과

사용자의 별도 응답 `Looks correct`를 계약 질문 파일에 기록한 뒤 요약 확인 영수증은 성공했다. 검토 요청·완료 요청은 각각 한 번만 실행했으며 모두 알려진 SUMMARY_RECEIPT_MISSING으로 거부됐다. 독립 검토는 시작하지 않았고 9/23 단독 실행은 완료되지 않았다.

요약 확인 원문:

```json
{"emitted":"SUMMARY_CONFIRMATION_RECORDED","checkpoint":"summary-confirmation","stage":"contract-design","summary_authorization_id":"2c27e7fb92ad2512b2385a877ed5ec2d1da187def3e15c60bb833bc0c7017d3d"}
```

검토 요청 원문 (`aidlc engine log review --stage contract-design --single --reviewer aidlc-architecture-reviewer-agent --iteration 1`, exit 1):

```json
{"error":"Cannot start review for \"contract-design\": no fresh human-backed consolidated summary confirmation is recorded. Present the summary, then run `aidlc-log.ts answer --checkpoint summary-confirmation --stage contract-design --single --details \"Looks correct\" after the human responds.\n{\"kind\":\"ask\",\"ask_type\":\"guard-recovery\",\"response_route\":\"execute-remedy\",\"question\":\"The next action for \\\"contract-design\\\" would be refused. Choose one authority-preserving recovery action.\",\"stage\":\"contract-design\",\"reason_codes\":[\"SUMMARY_RECEIPT_MISSING\"],\"remedies\":[{\"op\":\"restore-or-jump\",\"action\":\"This stage is already approved; restore the reviewed source state, or jump back with /aidlc --stage contract-design to redo it.\",\"operation\":{\"kind\":\"restart-stage\",\"stage\":\"contract-design\"},\"command\":\"aidlc engine orchestrate next --stage contract-design\",\"requiresHuman\":true,\"executableNow\":true,\"interaction\":\"command\"}]}"}
```

완료 요청 원문 (`aidlc engine orchestrate report --single --stage contract-design --result completed`, 프로세스 exit 0이지만 kind:error):

```json
{"kind":"error","message":"Refusing to complete \"contract-design\": no fresh human-backed consolidated summary confirmation is recorded. Present the summary, then run `aidlc-log.ts answer --checkpoint summary-confirmation --stage contract-design --single --details \"Looks correct\" after the human responds."}
```

이번 질문의 확인 기록 성공과 단계 전체의 확인 부재 거부를 구분한다. 반환된 복구·재진입 제안은 실행하지 않았다. 재시도·질문 파일 이동·추가 영수증·우회 없이 계약 단독 실행을 열어 둔다. 계약 검토·완료 요청에 CHANGE_ACCEPTED 및 SUMMARY_ARTIFACT_UNAUTHORIZED는 반환되지 않았다.

## 최종 보존·커밋 범위

검토·단독 완료 처리 후에도 계약·각 Unit 설계 산출물 15개와 과거 질문·검증·review 33개는 37b50f0과 바이트 동일하다. 착수 시 추적 파일 939개 중 기존 변경은 10월 감사 파일 한 개이며 그 착수 prefix와 기존 미커밋 세션 기록은 그대로다. 12월 intent 및 과거 도구 review 기록 39개도 착수 SHA-256과 동일하다. 본 흐름 aidlc-state.md·Completed·relaxed·Unit 상태·docs/·하네스·2.10.0은 변경하지 않았다. aidlc-state.md를 커밋 대상에 넣지 않는다.

커밋 범위는 이번 질문 2개·검증 2개·공통 도구 기록 1개·도구의 u2-api 검토 읽기용 사본 1개·10월 감사 1개, 총 7개 파일이다. 별도 `.local-handoffs/`는 제외한다. 사용자 지정 메시지로 한 커밋을 남기며 push하지 않는다. 계약 단독 실행은 열린 상태, u2-api 단독 실행은 완료 상태로 구분한다.
