# u2-api 처리 시한 — 단독 검증 기록 (2026-10-13)

## u2-api 단독 완료 결과

READY·신규 의견 없음 확인 뒤 report --single --result completed를 한 번 실행했다. 응답은 kind:done이며 single-stage:functional-design의 완료를 기록하고 본 흐름 Current Stage는 건드리지 않았다고 명시한다. u2-api 기록 절차는 이 done으로 완료됐으며, 이후에만 u1-web의 새 단독 실행을 연다. 계약의 열린 단독 실행은 그대로이며 u2-api done을 계약 완료로 계산하지 않는다.

```text
aidlc engine orchestrate report --single --stage functional-design --result completed
```

exit_code: 0

```text
{"kind":"done","reason":"Single-stage run of \"functional-design\" committed under synthetic workflow \"single-stage:functional-design\". The main workflow's Current Stage is untouched."}
```


## 2026-10-14 독립 검토 결과

독립 검토 1회는 READY이며 findings=[]·신규 의견/제안 없음이다. 단독 검토의 대상은 u2-api 기존 산출물과 확인된 이번 Q&A이며 다른 Unit 검토를 수행한 것이 아니다. 검토자는 required-sections 3개와 명시 consumes/deliverables의 upstream-coverage PASS, 기존 traceability FAIL 23개를 독립 재현했다. 상류 인자가 없던 최초 upstream 센서 출력은 검증 근거에서 제외했다고 리뷰에 밝혔다. 제품 코드·DB·큐·worker·배포 시험은 수행하지 않았다.

공식 리뷰 기록은 .aidlc-engine/reviews/functional-design/stage/cab38d371b8c06fd/1.json이며 도구가 만든 읽기 사본은 construction/u1-web/functional-design/reviews/review-09.md다. 사본은 생성된 위치에 그대로 두고 u2-api 검토 사본으로 센다. unit:null인 단독 리뷰 기록을 본 흐름 Unit 승인으로 계산하지 않는다. 공식 JSON·body를 도구 기록에 보존한다.

```text
aidlc engine log review --stage functional-design --reviewer aidlc-architecture-reviewer-agent --single --iteration 1 --verdict 'READY' --project-dir /Users/ljm/Desktop/github/CatchU
```

exit_code: 0

```text
{"emitted":"REVIEW_COMPLETED","stage":"functional-design","reviewRecord":".aidlc-engine/reviews/functional-design/stage/cab38d371b8c06fd/1.json","reviewMarkdown":"construction/u1-web/functional-design/reviews/review-09.md"}
```


## 2026-10-14 요약 확인·독립 검토 요청

사람의 u2-api 단계 응답 Looks correct를 이 단계 질문 파일에만 기록했다. summary-confirmation answer 1회가 성공했고 summary_authorization_id는 28fa9bc8e319459205d3dbfc080cfcd1d1f16c979fccf8af3f80b55b02331afb다. 계약 확인 응답을 재사용하지 않았다. 기존 실행·파일의 2026-10-13 이름은 유지한다.

검토 요청 --single·iteration 1을 1회 실행해 REVIEW_REQUESTED가 기록됐다. requestId는 review:2558904ccedf5195ee50da74b4ac374e다. 요청이 반환한 공식 reviewFile을 aidlc-architecture-reviewer-agent에 전달해 u2-api 대상 독립 검토를 시작했다. 이 요청은 Unit 필드 없는 단계 단독 요청이며, 다른 Unit의 검토·상태 변경으로 세지 않는다. 도구 change_notices를 아래 원문 그대로 보존한다. 알림 제거를 위한 재저장·설정 변경은 없다.

### u2-summary-answer

````text
aidlc engine log answer --stage functional-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-13-processing-deadline-questions.md --details 'Looks correct'
````

exit_code: 0

````text
{"emitted":"SUMMARY_CONFIRMATION_RECORDED","checkpoint":"summary-confirmation","stage":"functional-design","choice":"Looks correct","summary_authorization_id":"28fa9bc8e319459205d3dbfc080cfcd1d1f16c979fccf8af3f80b55b02331afb"}
````

### u2-review-request

````text
aidlc engine log review --stage functional-design --single --reviewer aidlc-architecture-reviewer-agent --iteration 1
````

exit_code: 0

````text
{"emitted":"REVIEW_REQUESTED","stage":"functional-design","requestId":"review:2558904ccedf5195ee50da74b4ac374e","reviewFile":"aidlc/spaces/default/intents/260914-catchu-october-mvp/.aidlc-engine/reviews/functional-design/stage/cab38d371b8c06fd/1.2558904ccedf5195ee50da74b4ac374e.review.md","recordVerdict":"aidlc engine log review --stage functional-design --reviewer aidlc-architecture-reviewer-agent --single --iteration 1 --verdict '<READY|NOT-READY>' --project-dir /Users/ljm/Desktop/github/CatchU","change_notices":["aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md, aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md changed after the api Unit was reviewed; carrying on.","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md changed after the web Unit was reviewed; carrying on.","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md changed after the worker Unit was reviewed; carrying on.","The written review for Functional Design (unit u2-api) is not on this machine; using its recorded verdict.","The written review for Functional Design (unit u1-web) is not on this machine; using its recorded verdict.","The written review for Functional Design (unit u3-worker) is not on this machine; using its recorded verdict.","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md was saved before you confirmed the current summary; carrying on.","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md was saved before you confirmed the current summary; carrying on.","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md was saved before you confirmed the current summary; carrying on.","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/traceability.json was saved before you confirmed the current summary; carrying on."]}
````


## 대상·판본·기록 지위 (요약 확인 전)

작업 위치 /Users/ljm/Desktop/github/CatchU, 브랜치 docs/분석-처리-시한-계약, HEAD 7e3b92b23cac43167c92f475c3b5ca69af9327bf. 실행 binary/runtime·하네스 frameworkVersion은 모두 2.11.0이다. [이번 질문·답](single-2026-10-13-processing-deadline-questions.md)의 답은 팀장이 제공한 사실에서 추출했으며 Chat 방식이다. 이 문서는 기존 설계의 확인·센서 기록이며 제품 구현·실제 연결·DB·worker·큐·배포 검증이 아니다.

계약의 요약 확인 성공과 검토·완료 요청 각각 1회 거부 원문은 [계약 검증](../../../inception/contract-design/single-2026-10-13-processing-deadline-verification.md)에 보존했다. 계약 실행을 우회/재시작하지 않은 채 별도 u2-api 단독 실행을 시작했다.

## 단독 실행의 시작·범위

실행 명령: aidlc engine orchestrate next --stage functional-design --unit u2-api --single. load-steering part 1/2 뒤 지시된 continue dVfbCzpS와 continue 6TOfwuOV를 각각 한 번 실행했다. 최종 반환은 kind run-stage·stage functional-design·single true·gate false·summary_confirmation on이다. 반환에는 unit 필드가 없고 produces 경로는 {unit-name} 형태다. 따라서 실제 작업 대상과 검토 입력은 u2-api의 기존 entities.md·rules.md·functional-spec.md·traceability.json과 이번 질문 파일로 한정한다. 기존 단독 실행 기록과 같은 단계 단위 단독 검토/완료 방식이며, Unit 상태나 본 흐름을 새로 승인했다고 주장하지 않는다. 시작·continue 원문 전체는 [도구 기록](single-2026-10-13-processing-deadline-tools.json)의 events에 보존한다.

반환된 inline_context_paths 11개를 읽은 뒤 기능 설계 단계 파일과 적용 Unit·상류 요구/계약/도메인 경계를 확인했다. 협력자 off인 inline 작업이며 지원 에이전트는 추가하지 않았다. single 실행의 diary·learnings·본 흐름 gate는 수행하지 않는다. u1-web 단독 실행은 열지 않았다. 독립 검토·완료 요청은 이 단계의 별도 사람 요약 확인 뒤에만 수행한다.

## 보존·센서 결과

- 보호 기준선은 계약 검증의 전체 추적 파일 SHA-256 1,504개와 동일하다. 지정 산출물 5개·기존 질문/검증/review-01~08·12월 intent 36개·aidlc-state.md·Unit 진행 파일은 그대로다. 추적 파일 중 착수 이후 변한 것은 도구가 추가한 10월 감사 파일 하나이며 착수 앞부분 바이트는 보존됐다.
- entities·rules·functional-spec required-sections: 전부 PASS, findings 0.
- upstream-coverage: PASS, unreferenced 없음, findings 0.
- traceability: FAIL, missing_from_upstream_ids 23개. 10/9 결과 JSON 전체와 목록이 정확히 같음. findings_count=23이며 gaps·orphans·missing_from_table·invalid_entries·invalid_targets는 빈 배열. 기존 FAIL을 PASS로 바꾸거나 traceability.json을 수정하지 않는다.
- 계약 YAML 4개·contract-summary 3블록·rules 1블록·entities 1블록 파싱 PASS는 앞서 동일한 보존 판본으로 실행한 [계약 검증](../../../inception/contract-design/single-2026-10-13-processing-deadline-verification.md)의 결과를 참조한다. 이번에 다시 파싱하거나 의존성을 바꾸지 않았다.
- linter·type-check: 이번 변경은 질문/검증/도구 기록이고 JS/TS 코드·코드 블록 생성/수정 없음. 제품 linter/type-check·시험은 실행하지 않았다. 설계 판정과 실제 동작 증거를 구분한다.
- CHANGE_ACCEPTED·SUMMARY_ARTIFACT_UNAUTHORIZED·리뷰 사본 경로·검토/완료 결과는 실제 후속 응답이 나온 뒤 추가한다. 현재 READY·done·검토 사본 생성 결과는 없다.

## u2-api 요약 확인 요청

별도 사람 응답을 기다린다. 계약 단계의 Looks correct를 재사용하지 않으며 answer·독립 검토·완료 요청은 아직 실행하지 않았다.

```text
aidlc engine log decision --stage functional-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-13-processing-deadline-questions.md --decision 'Does this all look correct before I generate the artifact?' --options 'Looks correct,Request changes'
```

exit_code: 0

```text
{"emitted":"DECISION_RECORDED","stage":"functional-design"}
```

## 실제 검사 명령과 원문

### u2-entities-required-sections

````text
aidlc engine sensor-required-sections --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md --stage functional-design
````

exit_code: 0

````text
{"pass":true,"h2_count":4,"headings":["## 모델 정본","## 물리 스키마 전환 제약","## 담당자 확인 요청","## 추적 정보"],"findings_count":0}
````

### u2-rules-required-sections

````text
aidlc engine sensor-required-sections --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md --stage functional-design
````

exit_code: 0

````text
{"pass":true,"h2_count":3,"headings":["## 규칙 정본","## 규칙 요약","## 추적 정보"],"findings_count":0}
````

### u2-functional-required-sections

````text
aidlc engine sensor-required-sections --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md --stage functional-design
````

exit_code: 0

````text
{"pass":true,"h2_count":10,"headings":["## 적용 범위","## ERD — 파생 뷰","## 업무 흐름","## 상태 전이 정본","## 동시성과 일관성","## DTO와 저장 모델 연결","## 규칙 요약 — 파생 뷰","## Open questions · 개발 이슈로 보완","## 담당자 확인 요청","## 추적 정보"],"findings_count":0}
````

### u2-upstream-coverage

````text
aidlc engine sensor-upstream-coverage --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md --stage functional-design --consumes unit-of-work,unit-of-work-story-map,requirements,components,contract-summary --deliverables entities,rules,functional-spec
````

exit_code: 0

````text
{"pass":true,"consumes":["unit-of-work","unit-of-work-story-map","requirements","components","contract-summary"],"unreferenced":[],"scanned_files":["/Users/ljm/Desktop/github/CatchU/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md","/Users/ljm/Desktop/github/CatchU/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md","/Users/ljm/Desktop/github/CatchU/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md"],"findings_count":0}
````

### u2-traceability

````text
aidlc engine sensor-traceability --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/traceability.json --stage functional-design
````

exit_code: 0

````text
{"pass":false,"gaps":[],"orphans":[],"missing_from_table":[],"missing_from_upstream_ids":["FR1.2","FR1.3","FR10","FR10.1","FR10.4","FR10.5","FR10.6","FR2","FR2.1","FR2.2","FR3.3","FR3.6","FR5","FR5.1","FR5.5","FR6.1","FR6.6","FR7.1","FR7.4","FR8.1","FR8.4","FR9.1","FR9.2"],"invalid_entries":[],"invalid_targets":[],"findings_count":23}
````

### u2-preservation-and-1009-traceability-comparison

````text
python3 - <<'PY'
import pathlib,json,hashlib,re,subprocess
r=pathlib.Path.cwd();t=pathlib.Path('/private/tmp/catchu-processing-deadline-20261013');h=json.loads((t/'baseline.json').read_text());changed=[p for p,v in h.items() if not (r/p).is_file() or hashlib.sha256((r/p).read_bytes()).hexdigest()!=v]
base='aidlc/spaces/default/intents/260914-catchu-october-mvp/'
old=(r/base/'construction/u2-api/functional-design/single-2026-10-09-verification.md').read_text()
previous=[json.loads(s) for s in re.findall(r'^\{[^\n]*"missing_from_upstream_ids"[^\n]*\}$',old,re.M)]
current=json.loads(subprocess.check_output(['aidlc','engine','sensor-traceability','--output-path',base+'construction/u2-api/functional-design/traceability.json','--stage','functional-design']))
first23=next((p for p in previous if p.get('findings_count')==23),None)
a=base+'audit/macui-macbookpro-local-3cf6d8f9dcd7.md'
print(json.dumps({'changed_tracked':changed,'unexpected_tracked':[p for p in changed if not p.startswith(base+'audit/')],'state_unchanged':base+'aidlc-state.md' not in changed,'december_unchanged':not any(p.startswith('aidlc/spaces/default/intents/260925-intent-12/') for p in changed),'historical_traceability_comparison':{'previous_23_found':first23 is not None,'exact_result_equal':current==first23,'missing_ids_equal':current.get('missing_from_upstream_ids')==(first23 or {}).get('missing_from_upstream_ids')},'audit_start_prefix_preserved':(r/a).read_bytes().startswith((t/pathlib.Path(a).name).read_bytes())},ensure_ascii=False,indent=2))
json.loads((r/base/'inception/contract-design/single-2026-10-13-processing-deadline-tools.json').read_text())
PY
````

exit_code: 0

````text
{
  "changed_tracked": [
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md"
  ],
  "unexpected_tracked": [],
  "state_unchanged": true,
  "december_unchanged": true,
  "historical_traceability_comparison": {
    "previous_23_found": true,
    "exact_result_equal": true,
    "missing_ids_equal": true
  },
  "audit_start_prefix_preserved": true
}
````
