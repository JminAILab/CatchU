# 2026-10-05 계약 변경 기록 — 검증과 단독 실행 상태

PR·병합 전 `f1cb8d9deeae09b68d534f3437895cc9ff7fe8b1`의 변경을 [이번 질문 파일](single-2026-10-05-questions.md)의 팀장 결정과 대조했다. 브랜치는 `docs/링크-발급-입력-길이-계약`, 분기 기준은 `00e9753cd9b26e76d3de09beac9de4412de4ed6f`다. 이번 실행에서 계약·설계 산출물을 수정하거나 다시 저장하지 않았다.

## 결정·반영 대조

| 대상 | 확인한 내용 |
|---|---|
| contract-summary.md 117행 | 제목 trim 후 1~50자, 선택 비밀번호 trim·정규화 없이 8~64자, 유니코드 코드 포인트 계산, 길이 위반 400/VALIDATION_FAILED. unlock에는 발급 길이 제한을 적용하지 않고 빈 값만 400 |
| common.yaml ShareCreate | title은 minLength 1과 trim 후 1~50자 설명. password는 minLength 8·maxLength 64와 원문 입력 설명. required는 title뿐 |
| 회원 발급 POST | createShareLink 요청이 ShareCreate를 참조하며 400이 Error400을 참조 |
| 수신자 unlock | password는 type string·minLength 1이며 maxLength 없음. #195 입력 조건 유지 |
| 결정 근거 | 2026-10-05 ljm0850 사용자 지시. #221 담당 csyg0616·상위 #212·DB 칼럼 상한을 구현 PR에서 정하는 범위를 GitHub 읽기 조회로 대조 |
| 표준과 팀장 판단 | NIST SP 800-63B-4 §3.1.1.2와 ASVS 5.0 §6.2.1·6.2.9 원문을 확인. 표준의 조건과 링크에 8~64자를 선택한 서비스 판단은 질문 Q2에서 구분. NIST 다중 요소 인증·표준 전체 준수로 계산하지 않음 |
| 제외 | unlock 길이 검사, 흔한 비밀번호 목록 대조, 정규화, ERD 제목 상한 추가. 제목은 FR4.2의 수신자 비표시 관리용 이름 |

원문: [NIST Password Verifiers](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver), [OWASP ASVS v5.0.0 Authentication](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x15-V6-Authentication.md). 공개 기준은 참고 근거이며 이번 계약 선택의 승인 주체는 팀장이다.

## 검증과 보존

검사 위치는 `/Users/ljm/Desktop/github/CatchU`, 검사 판본은 `f1cb8d9`와 동일한 산출물이다. Ruby YAML.safe_load와 JSON 파서, Python/git 바이트 비교를 사용했다. API·DB 실행 시험 또는 #221 구현 완료의 증거는 아니다.

| 항목 | 결과 |
|---|---|
| YAML | 계약 YAML 4개·요약 YAML 블록 3개 파싱 통과 |
| 참조 | 파일 경로·JSON Pointer로 모든 `$ref` 202개 해석 성공 |
| ShareCreate·발급·unlock | 위 입력 조건, POST의 400 응답, unlock의 minLength 1 대조 통과 |
| required-sections | contract-summary H2 11개, findings 0, pass true |
| upstream-coverage | 상류 4개·산출물 contract-summary를 명시해 실행. 누락 0, pass true |
| ERD | u2-api entities.md는 `git show 00e9753:<path>`와 바이트 동일. 오래된 로컬 dev는 비교에 사용하지 않음 |
| 산출물 보존 | 계약 5개와 각 Unit 기능 설계 10개, 합계 15개가 f1cb8d9와 바이트 동일 |
| 기존 기록 보존 | 계약·기능 설계 폴더의 질문·검증·review 기록 30개가 f1cb8d9와 바이트 동일. 9/23·9/24·9/30 포함 |
| 기존 파일 보존 | 착수 시 추적 파일 706개 SHA-256과 대조한 기존 파일 변경은 10월 감사뿐. aidlc-state.md·12월 intent·docs/·하네스 무변경 |
| 공백 검사 | `git diff --check` 통과 |

센서는 아래 인자로 실행했다. 도움말 탐색에서 output-path 없이 거부된 호출은 검증 결과로 계산하지 않았다.

```text
aidlc engine sensor-required-sections --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md --stage contract-design
aidlc engine sensor-upstream-coverage --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md --stage contract-design --consumes unit-of-work,unit-of-work-dependency,components,requirements --deliverables contract-summary
```

u2-api 규칙·추적 센서 결과는 같은 날짜의 u2-api 검증 문서에 별도로 기록한다. 기존 missing_from_upstream_ids 실패를 PASS로 바꾸지 않는다.

## 요약 확인·검토·완료 결과

2026-09-23T07:02:00Z부터 열린 `single-stage:contract-design`을 유지했다. 새 계약 차수와 본 흐름 진행은 실행하지 않았다.

| 절차 | 결과 |
|---|---|
| 요약 확인 | 사용자 “둘 다 Looks correct”의 2026-10-05T01:05:56Z HUMAN_TURN 뒤 01:06:14Z SUMMARY_CONFIRMATION_RECORDED 성공. 확인 식별자 `498d14bf8682582e5d1665495fe7b3e350898e79a4eaef26f57c9d0e09cabd4f` |
| 검토 요청 1회 | `aidlc engine log review --stage contract-design --single --reviewer aidlc-architecture-reviewer-agent --iteration 1` 거부. SUMMARY_RECEIPT_MISSING이며 독립 검토를 시작하지 않음 |
| 완료 요청 1회 | `aidlc engine orchestrate report --single --stage contract-design --result completed`가 kind:error 반환. 단독 완료되지 않음 |

검토 요청 결과 원문:

```json
{"error":"Cannot start review for \"contract-design\": no fresh human-backed consolidated summary confirmation is recorded. Present the summary, then run `aidlc-log.ts answer --checkpoint summary-confirmation --stage contract-design --single --details \"Looks correct\" after the human responds.\n{\"kind\":\"ask\",\"ask_type\":\"guard-recovery\",\"response_route\":\"execute-remedy\",\"question\":\"The next action for \\\"contract-design\\\" would be refused. Choose one authority-preserving recovery action.\",\"stage\":\"contract-design\",\"reason_codes\":[\"SUMMARY_RECEIPT_MISSING\"],\"remedies\":[{\"op\":\"restore-or-jump\",\"action\":\"This stage is already approved; restore the reviewed source state, or jump back with /aidlc --stage contract-design to redo it.\",\"operation\":{\"kind\":\"restart-stage\",\"stage\":\"contract-design\"},\"command\":\"aidlc engine orchestrate next --stage contract-design\",\"requiresHuman\":true,\"executableNow\":true,\"interaction\":\"command\"}]}"}
```

완료 요청 결과 원문:

```json
{"kind":"error","message":"Refusing to complete \"contract-design\": no fresh human-backed consolidated summary confirmation is recorded. Present the summary, then run `aidlc-log.ts answer --checkpoint summary-confirmation --stage contract-design --single --details \"Looks correct\" after the human responds."}
```

이번 질문 파일의 요약 확인은 성공했으나 단계 전체 질문 파일 확인을 요구하는 9/24·9/30의 알려진 한계와 동일한 SUMMARY_RECEIPT_MISSING을 받았다. 직접 확인한 사실은 이번 확인 성공 및 같은 거부 사유이며, 결함의 내부 구현은 재조사하지 않았다. 반환된 본 흐름 복구·재진입 제안은 실행하지 않았다. 재시도·질문 이동·추가 확인 영수증·우회 없이 실행을 열어 둔다. 이번 계약 검토·완료 요청에는 CHANGE_ACCEPTED와 SUMMARY_ARTIFACT_UNAUTHORIZED가 반환되지 않았다.

본 흐름 Completed·relaxed와 2.10.0을 유지했다. 상태·감사 파일을 직접 편집하지 않았다. 새 기록과 도구가 추가한 10월 감사에는 사용자가 지정한 9/30~10/4 미커밋 세션 기록도 포함한다. 커밋은 u2-api 기록 종료 뒤 한 번 수행하며 push하지 않는다.
