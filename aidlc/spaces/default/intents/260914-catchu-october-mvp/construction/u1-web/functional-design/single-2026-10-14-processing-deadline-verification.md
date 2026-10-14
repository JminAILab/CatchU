# u1-web 처리 시한 — 단독 검증 기록 (2026-10-14)

## 전체 작업의 커밋 전 보존·검사

이 대조 시점의 전체 추적 기준선 1,504개 중 감사 파일 하나만 추가됐고 나머지 1,503개는 SHA-256이 같다. 지정 산출물 5개는 7e3b92b와 바이트 동일, 계약 YAML 4개·기존 질문/검증/리뷰 등 87개·12월 intent 36개는 보존됐다. aidlc-state.md와 Unit 진행 파일, 본 흐름 Completed·Guard Policy relaxed, 버전·설정은 변경하지 않았다. 상태 파일은 커밋에서 제외한다.

계약 단독 실행은 2026-09-23T07:02:00Z 시작 1건만 있고 완료 없음이다. 새 계약 시작을 만들지 않았다. 세 단계의 별도 사람 요약 확인 3건과 서로 다른 확인 식별자를 확인했다. u2-api와 u1-web은 각각 신규 의견 없이 READY 및 done이다. review-09/10의 공식 JSON body 포함·SHA-256을 대조해 사본을 그대로 보존했다. traceability FAIL 23/43개는 10/9와 동일하며 PASS로 바꾸지 않았다.

감사 파일 macui-macbookpro-local-3cf6d8f9dcd7.md는 HEAD 179,235바이트에 이미 있던 미커밋 164,244바이트를 포함한 착수 343,479바이트를 그대로 앞에 두었다. 대조 시점 현재 376,770바이트, 착수 뒤 추가 33,291바이트다. 그 추가분의 CHANGE_ACCEPTED는 14건, SUMMARY_ARTIFACT_UNAUTHORIZED 사건은 0건이다. 아래 수치는 검증 시점의 관측이며 이 검증 기록 저장·후속 도구의 감사 추가는 별도다. 기존 감사 줄을 직접 편집하지 않았다.

문서 크기·git diff --check는 통과했다. 로컬 커밋에는 질문/검증/도구 기록 9개, 도구 리뷰 사본 2개, 기존 미커밋 줄 포함한 10월 감사 파일 1개를 명시 목록으로 담는다. .local-handoffs/·무시된 .aidlc-engine/ 원본·aidlc-state.md·산출물·docs/·서비스 소스·12월은 제외한다. 원격 push·이슈·PR·Project 변경은 없다. 본 기록 절차 완료와 #237 구현·실제 연결/배포·복원 시험·PR 승인은 별도다.

### final-preservation

````text
python3 - <<'PY'
from pathlib import Path
import subprocess,json,hashlib,re,collections
r=Path.cwd();t=Path('/private/tmp/catchu-processing-deadline-20261013');base='aidlc/spaces/default/intents/260914-catchu-october-mvp/';h=json.loads((t/'baseline.json').read_text())
changed=[p for p,v in h.items() if not (r/p).is_file() or hashlib.sha256((r/p).read_bytes()).hexdigest()!=v];unexpected=[p for p in changed if not p.startswith(base+'audit/')]
rels=['inception/contract-design/contract-summary.md','construction/u2-api/functional-design/functional-spec.md','construction/u2-api/functional-design/rules.md','construction/u2-api/functional-design/entities.md','construction/u1-web/functional-design/functional-spec.md'];checks=[{'path':p,'byte_equal_7e3b92b':(r/base/p).read_bytes()==subprocess.check_output(['git','show','7e3b92b:'+base+p])} for p in rels]
audit=[];contract_events=[];confirmations=[]
for p in (r/base/'audit').glob('*.md'):
 b=t/p.name;now=p.read_bytes()
 if b.exists():
  start=b.read_bytes();head=subprocess.check_output(['git','show','7e3b92b:'+str(p.relative_to(r))]);tail=now[len(start):].decode();timestamps=re.findall(r'\*\*Timestamp\*\*: (.*)',tail)
  audit.append({'path':str(p.relative_to(r)),'head_bytes':len(head),'start_bytes':len(start),'preexisting_uncommitted_bytes':len(start)-len(head),'current_bytes':len(now),'added_since_start_bytes':len(now)-len(start),'head_prefix_preserved':now.startswith(head),'start_prefix_preserved':now.startswith(start),'new_event_counts':dict(collections.Counter(re.findall(r'\*\*Event\*\*: (.*)',tail))),'new_timestamp_first':timestamps[0] if timestamps else None,'new_timestamp_last':timestamps[-1] if timestamps else None})
  for block in tail.split('\n---\n'):
   if '**Event**: SUMMARY_CONFIRMATION_RECORDED' in block:
    def get(key):
     m=re.search(r'\*\*'+re.escape(key)+r'\*\*: (.*)',block);return m[1] if m else None
    confirmations.append({'stage':get('Stage'),'questions_file':get('Questions File'),'authorization_id':get('Summary Authorization Id'),'timestamp':get('Timestamp')})
 for block in now.decode().split('\n---\n'):
  if '**Workflow**: single-stage:contract-design' in block and re.search(r'\*\*Event\*\*: STAGE_(STARTED|COMPLETED)',block):
   contract_events.append({'file':p.name,'event':re.search(r'\*\*Event\*\*: (.*)',block)[1],'timestamp':re.search(r'\*\*Timestamp\*\*: (.*)',block)[1]})
records=[];reviewchecks=[]
for unit,prefix,n in [('u2-api','single-2026-10-13-processing-deadline',9),('u1-web','single-2026-10-14-processing-deadline',10)]:
 data=json.loads((r/base/'construction'/unit/'functional-design'/(prefix+'-tools.json')).read_text());off=data['officialReview'];rep=json.loads(data['completion']['output']);copy=r/base/'construction/u1-web/functional-design/reviews'/f'review-{n:02}.md';body=copy.read_text()
 records.append({'unit':unit,'review_verdict':off['verdict'],'findings':off['findings'],'completion':rep['kind']})
 reviewchecks.append({'reviewed_unit':unit,'copy':str(copy.relative_to(r)),'sha256':hashlib.sha256(copy.read_bytes()).hexdigest(),'official_body_contained':off['body'] in body})
state=(r/base/'aidlc-state.md').read_text();yamlpaths=[base+'inception/contract-design/'+n for n in ['common.yaml','member-api.yaml','recipient-api.yaml','worker-messages.yaml']];historical=[p for p in h if p.startswith(base) and (re.search(r'(questions|verification|single-.*tools|reviews/review-0[1-8]\.md)',p))]
result={'head':subprocess.check_output(['git','rev-parse','HEAD']).decode().strip(),'tracked_baseline_count':len(h),'protected_unchanged_count':len(h)-len(changed),'changed_tracked':changed,'unexpected_tracked':unexpected,'target_byte_checks':checks,'yaml_files_unchanged':all(p not in changed for p in yamlpaths),'historical_record_count':len(historical),'historical_records_unchanged':not any(p in changed for p in historical),'december_files_count':sum(p.startswith('aidlc/spaces/default/intents/260925-intent-12/') for p in h),'december_unchanged':not any(p.startswith('aidlc/spaces/default/intents/260925-intent-12/') for p in changed),'state_unchanged':base+'aidlc-state.md' not in changed,'main_completed':bool(re.search(r'\*\*Status\*\*: Completed',state)),'guard_policy_relaxed':'**Guard Policy**: relaxed' in state,'active_intent':(r/'aidlc/spaces/default/intents/active-intent').read_text().strip(),'audit':audit,'contract_single_events':contract_events,'summary_confirmations':confirmations,'separate_summary_authorizations':len(confirmations)==3 and len({c['authorization_id'] for c in confirmations})==3,'unit_records':records,'review_copies':reviewchecks,'new_summary_artifact_unauthorized_events':sum(a['new_event_counts'].get('SUMMARY_ARTIFACT_UNAUTHORIZED',0) for a in audit)}
result['pass']=not unexpected and all(c['byte_equal_7e3b92b'] for c in checks) and result['historical_records_unchanged'] and result['december_unchanged'] and result['state_unchanged'] and result['main_completed'] and result['guard_policy_relaxed'] and all(a['start_prefix_preserved'] and a['head_prefix_preserved'] for a in audit) and result['separate_summary_authorizations'] and len(contract_events)==1 and contract_events[0]['event']=='STAGE_STARTED' and all(x['review_verdict']=='READY' and not x['findings'] and x['completion']=='done' for x in records) and all(x['official_body_contained'] for x in reviewchecks)
print(json.dumps(result,ensure_ascii=False,indent=2));raise SystemExit(0 if result['pass'] else 1)
PY
````

exit_code: 0

````text
{
  "head": "7e3b92b23cac43167c92f475c3b5ca69af9327bf",
  "tracked_baseline_count": 1504,
  "protected_unchanged_count": 1503,
  "changed_tracked": [
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md"
  ],
  "unexpected_tracked": [],
  "target_byte_checks": [
    {
      "path": "inception/contract-design/contract-summary.md",
      "byte_equal_7e3b92b": true
    },
    {
      "path": "construction/u2-api/functional-design/functional-spec.md",
      "byte_equal_7e3b92b": true
    },
    {
      "path": "construction/u2-api/functional-design/rules.md",
      "byte_equal_7e3b92b": true
    },
    {
      "path": "construction/u2-api/functional-design/entities.md",
      "byte_equal_7e3b92b": true
    },
    {
      "path": "construction/u1-web/functional-design/functional-spec.md",
      "byte_equal_7e3b92b": true
    }
  ],
  "yaml_files_unchanged": true,
  "historical_record_count": 87,
  "historical_records_unchanged": true,
  "december_files_count": 36,
  "december_unchanged": true,
  "state_unchanged": true,
  "main_completed": true,
  "guard_policy_relaxed": true,
  "active_intent": "260914-catchu-october-mvp",
  "audit": [
    {
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-565a7a100377.md",
      "head_bytes": 54155,
      "start_bytes": 54155,
      "preexisting_uncommitted_bytes": 0,
      "current_bytes": 54155,
      "added_since_start_bytes": 0,
      "head_prefix_preserved": true,
      "start_prefix_preserved": true,
      "new_event_counts": {},
      "new_timestamp_first": null,
      "new_timestamp_last": null
    },
    {
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-b4d6e5802feb.md",
      "head_bytes": 3924,
      "start_bytes": 3924,
      "preexisting_uncommitted_bytes": 0,
      "current_bytes": 3924,
      "added_since_start_bytes": 0,
      "head_prefix_preserved": true,
      "start_prefix_preserved": true,
      "new_event_counts": {},
      "new_timestamp_first": null,
      "new_timestamp_last": null
    },
    {
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md",
      "head_bytes": 179235,
      "start_bytes": 343479,
      "preexisting_uncommitted_bytes": 164244,
      "current_bytes": 376770,
      "added_since_start_bytes": 33291,
      "head_prefix_preserved": true,
      "start_prefix_preserved": true,
      "new_event_counts": {
        "HUMAN_TURN": 8,
        "ARTIFACT_CREATED": 11,
        "DECISION_RECORDED": 3,
        "ARTIFACT_UPDATED": 22,
        "SUMMARY_CONFIRMATION_RECORDED": 3,
        "CHANGE_ACCEPTED": 14,
        "ERROR_LOGGED": 1,
        "STAGE_STARTED": 2,
        "REVIEW_REQUESTED": 2,
        "REVIEW_COMPLETED": 2,
        "STAGE_COMPLETED": 2
      },
      "new_timestamp_first": "2026-10-13T14:19:18Z",
      "new_timestamp_last": "2026-10-14T00:03:19Z"
    },
    {
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-8fe439d2d737.md",
      "head_bytes": 17979,
      "start_bytes": 17979,
      "preexisting_uncommitted_bytes": 0,
      "current_bytes": 17979,
      "added_since_start_bytes": 0,
      "head_prefix_preserved": true,
      "start_prefix_preserved": true,
      "new_event_counts": {},
      "new_timestamp_first": null,
      "new_timestamp_last": null
    },
    {
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-de1289503add.md",
      "head_bytes": 329269,
      "start_bytes": 329269,
      "preexisting_uncommitted_bytes": 0,
      "current_bytes": 329269,
      "added_since_start_bytes": 0,
      "head_prefix_preserved": true,
      "start_prefix_preserved": true,
      "new_event_counts": {},
      "new_timestamp_first": null,
      "new_timestamp_last": null
    },
    {
      "path": "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-ad614c40ab56.md",
      "head_bytes": 13804,
      "start_bytes": 13804,
      "preexisting_uncommitted_bytes": 0,
      "current_bytes": 13804,
      "added_since_start_bytes": 0,
      "head_prefix_preserved": true,
      "start_prefix_preserved": true,
      "new_event_counts": {},
      "new_timestamp_first": null,
      "new_timestamp_last": null
    }
  ],
  "contract_single_events": [
    {
      "file": "macui-macbookpro-local-de1289503add.md",
      "event": "STAGE_STARTED",
      "timestamp": "2026-09-23T07:02:00Z"
    }
  ],
  "summary_confirmations": [
    {
      "stage": "contract-design",
      "questions_file": "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-13-processing-deadline-questions.md",
      "authorization_id": "3c322bd2550c51eb6497065c3fdf0b336cb9d34195f0cf7e0a8b12480227d31b",
      "timestamp": "2026-10-13T14:26:18Z"
    },
    {
      "stage": "functional-design",
      "questions_file": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-13-processing-deadline-questions.md",
      "authorization_id": "28fa9bc8e319459205d3dbfc080cfcd1d1f16c979fccf8af3f80b55b02331afb",
      "timestamp": "2026-10-13T22:17:03Z"
    },
    {
      "stage": "functional-design",
      "questions_file": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/single-2026-10-14-processing-deadline-questions.md",
      "authorization_id": "a5611f8808fe4165aaad937e3265908f7e6f1e6b042a4dd694a1e1d920fe72f8",
      "timestamp": "2026-10-13T23:59:33Z"
    }
  ],
  "separate_summary_authorizations": true,
  "unit_records": [
    {
      "unit": "u2-api",
      "review_verdict": "READY",
      "findings": [],
      "completion": "done"
    },
    {
      "unit": "u1-web",
      "review_verdict": "READY",
      "findings": [],
      "completion": "done"
    }
  ],
  "review_copies": [
    {
      "reviewed_unit": "u2-api",
      "copy": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/reviews/review-09.md",
      "sha256": "c519f4269f64de3cd3a6f5fb329b05db38aa97bf62308aae4e6a557be4629c0e",
      "official_body_contained": true
    },
    {
      "reviewed_unit": "u1-web",
      "copy": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/reviews/review-10.md",
      "sha256": "0be2fa027bbd74617b06b58bdc747eb2cb040f69569fb65c6c23f0a85353dd7e",
      "official_body_contained": true
    }
  ],
  "new_summary_artifact_unauthorized_events": 0,
  "pass": true
}
````

### doc-sizes

````text
bash .github/scripts/check-doc-sizes.sh
````

exit_code: 0

````text
통과    29540 / 36000  docs/CatchU_작업관리.md
통과    17998 / 19000  docs/CatchU_coding_procedures.md
통과    25604 / 36000  web/README.md
통과    30723 / 36000  api/README.md
통과    21778 / 36000  worker/README.md
통과    19806 / 36000  api/CONVENTIONS.md
통과     8443 / 36000  api/docs/analysis-receiver.md
통과     3916 / 36000  api/docs/auth-review.md
통과     8284 / 36000  api/docs/catch-owner-read-preparation.md
통과     5579 / 36000  api/docs/catch-registration-database.md
통과     5196 / 36000  api/docs/catch-registration-e-integration.md
통과     4152 / 36000  api/docs/catch-registration-proposal.md
통과     7237 / 36000  api/docs/catch-registration-rules.md
통과     6397 / 36000  api/docs/catch-visibility.md
통과     7780 / 36000  api/docs/environment.md
통과    17981 / 36000  api/docs/github-connection.md
통과    18153 / 36000  api/docs/google-login.md
통과    10984 / 36000  api/docs/member-analysis.md
통과    10353 / 36000  api/docs/member-profile.md
통과     6210 / 36000  api/docs/member-repositories.md
통과    10327 / 36000  api/docs/receiver-registration.md
통과     9421 / 36000  api/docs/result-application.md
통과     4825 / 36000  api/docs/security-events.md
통과    10516 / 36000  api/docs/share-links-integration-149.md
통과    26858 / 36000  api/docs/share-links.md
통과     4314 / 36000  api/docs/verification-records.md
통과    23553 / 36000  worker/docs/associated-pr-lookup.md
통과    12442 / 36000  worker/docs/candidate-checks.md
통과    34001 / 36000  worker/docs/candidate-decision.md
통과    12110 / 36000  worker/docs/candidate-text.md
통과    35010 / 36000  worker/docs/generation.md
통과     9590 / 36000  worker/docs/github-collection.md
통과    35906 / 36000  worker/docs/relation-collection.md
통과    20063 / 36000  web/src/features/assets/README.md
통과     4106 / 36000  web/src/features/repository-management/README.md
통과    11164 / 36000  web/src/features/share-links/README.md
통과    28930 / 36000  docs/CatchU_큐_기술검증.md
통과    20457 / 36000  docs/CatchU_queue_verification_results.md
통과    22486 / 36000  docs/CatchU_queue_requirements.md
통과    20287 / 36000  docs/CatchU_작업동일성_판별기준.md
통과    32424 / 36000  docs/CatchU_수집통제_임시자료.md
통과    28016 / 36000  docs/CatchU_통합검증표.md
통과    35067 / 36000  docs/CatchU_work_identity_cases.md
통과    33993 / 36000  docs/CatchU_work_identity_records.md
통과    21463 / 36000  docs/CatchU_work_identity_rules.md
통과    23484 / 36000  docs/CatchU_work_identity_unit.md
통과    17789 / 36000  docs/CatchU_collection_control_checks.md
통과    29268 / 36000  docs/CatchU_collection_control_scope.md
통과    10175 / 36000  docs/CatchU_collection_control_temp_data.md
통과    27697 / 36000  docs/CatchU_integration_rows_intake.md
통과    21514 / 36000  docs/CatchU_integration_rows_sharing.md
통과     6568 / 36000  docs/CatchU_security_checks.md
통과    13766 / 32768  AGENTS.md (루트부터 합산)
````

### record-diff-check

````text
git diff --check
````

exit_code: 0

````text

````


## u1-web 단독 완료 결과

READY·신규 의견 없음 확인 뒤 report --single --result completed를 한 번 실행했다. 응답은 kind:done이며 single-stage:functional-design의 완료를 기록하고 본 흐름 Current Stage를 건드리지 않았다고 명시한다. u1-web과 u2-api는 각각 별도 사람 요약 확인·독립 검토 1회·완료 요청 1회로 done이다. 계약 단독 실행은 열린 채 두며 재시도·우회·본 흐름 재개는 하지 않는다. 단계 기록 완료를 #237 구현·전체 추적성·제품 검증·PR 승인으로 계산하지 않는다.

```text
aidlc engine orchestrate report --single --stage functional-design --result completed
```

exit_code: 0

```text
{"kind":"done","reason":"Single-stage run of \"functional-design\" committed under synthetic workflow \"single-stage:functional-design\". The main workflow's Current Stage is untouched."}
```


## 2026-10-14 독립 검토 결과

독립 검토 1회는 READY·findings=[]·신규 의견/제안 없음이다. required-sections·upstream-coverage PASS와 기존 traceability FAIL 43개를 독립 재현했다. 시간 초과·반영 실패 CLOSED·현재 서버 retry.allowed와 새 동의 안내가 공유 API 계약에 맞는지 확인한 정적 문서 검토이며 실제 화면/제품 시험은 수행하지 않았다.

공식 리뷰 JSON은 .aidlc-engine/reviews/functional-design/stage/fbfbe103443151e9/1.json이다. 도구가 만든 읽기 사본 construction/u1-web/functional-design/reviews/review-10.md를 생성된 위치 그대로 보존한다. review-09는 u2-api, review-10은 u1-web 검토의 사본이다. unit:null인 단독 리뷰 기록을 본 흐름 Unit 승인으로 계산하지 않는다. 공식 JSON/body도 도구 기록에 보존한다.

```text
aidlc engine log review --stage functional-design --reviewer aidlc-architecture-reviewer-agent --single --iteration 1 --verdict 'READY' --project-dir /Users/ljm/Desktop/github/CatchU
```

exit_code: 0

```text
{"emitted":"REVIEW_COMPLETED","stage":"functional-design","reviewRecord":".aidlc-engine/reviews/functional-design/stage/fbfbe103443151e9/1.json","reviewMarkdown":"construction/u1-web/functional-design/reviews/review-10.md"}
```


## 2026-10-14 요약 확인·독립 검토 요청

이번 u1-web 단계에 새로 받은 Looks correct를 질문 파일에 기록하고 answer를 한 번 실행했다. SUMMARY_CONFIRMATION_RECORDED가 성공했으며 summary_authorization_id는 a5611f8808fe4165aaad937e3265908f7e6f1e6b042a4dd694a1e1d920fe72f8이다. 다른 단계의 응답/확인을 재사용하지 않았다.

검토 요청 --single·iteration 1은 1회 성공해 REVIEW_REQUESTED가 기록됐다. 요청 식별자는 review:27b920063996500a3590dc9b844496e5다. aidlc-architecture-reviewer-agent에 u1-web 현재 Q&A·기존 functional-spec/traceability와 공유 inception 계약을 전달해 독립 검토를 시작했다. 과거 u2 리뷰를 새 검토 결과로 사용하지 않는다. 아래 change_notices는 원문 그대로 보존하고 알림 제거 목적의 산출물 재저장·설정 변경은 하지 않는다.

### u1-summary-answer

````text
aidlc engine log answer --stage functional-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/single-2026-10-14-processing-deadline-questions.md --details 'Looks correct'
````

exit_code: 0

````text
{"emitted":"SUMMARY_CONFIRMATION_RECORDED","checkpoint":"summary-confirmation","stage":"functional-design","choice":"Looks correct","summary_authorization_id":"a5611f8808fe4165aaad937e3265908f7e6f1e6b042a4dd694a1e1d920fe72f8"}
````

### u1-review-request

````text
aidlc engine log review --stage functional-design --single --reviewer aidlc-architecture-reviewer-agent --iteration 1
````

exit_code: 0

````text
{"emitted":"REVIEW_REQUESTED","stage":"functional-design","requestId":"review:27b920063996500a3590dc9b844496e5","reviewFile":"aidlc/spaces/default/intents/260914-catchu-october-mvp/.aidlc-engine/reviews/functional-design/stage/fbfbe103443151e9/1.27b920063996500a3590dc9b844496e5.review.md","recordVerdict":"aidlc engine log review --stage functional-design --reviewer aidlc-architecture-reviewer-agent --single --iteration 1 --verdict '<READY|NOT-READY>' --project-dir /Users/ljm/Desktop/github/CatchU","change_notices":["aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md was saved before you confirmed the current summary; carrying on.","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/traceability.json was saved before you confirmed the current summary; carrying on."]}
````


## 대상·판본·요약 확인 전 상태

작업 위치 /Users/ljm/Desktop/github/CatchU, 브랜치 docs/분석-처리-시한-계약, 보존 HEAD 7e3b92b23cac43167c92f475c3b5ca69af9327bf. 실행 binary/runtime·하네스 frameworkVersion은 2.11.0이다. [질문·답](single-2026-10-14-processing-deadline-questions.md)의 답은 팀장이 제공한 사실에서 추출했고 Chat 방식이다. 기존 web 설계의 확인·센서 기록이며 실제 web 화면·api·DB·큐·worker·배포 검증이 아니다.

[u2-api 검증](../../u2-api/functional-design/single-2026-10-13-processing-deadline-verification.md)의 별도 요약 확인·독립 검토 READY·신규 의견 없음·report --single kind:done을 확인한 뒤에만 이번 실행을 열었다. 계약 단독 실행의 알려진 거부는 [계약 검증](../../../inception/contract-design/single-2026-10-13-processing-deadline-verification.md)에 원문 보존한 채 열린 상태로 둔다.

## 단독 실행의 시작·범위

명령은 aidlc engine orchestrate next --stage functional-design --single이다. load-steering part 1/2 뒤 지시된 continue dVfbCzpS, continue 6TOfwuOV를 각각 실행했다. 반환은 kind run-stage·stage functional-design·single true·gate false·summary_confirmation on이며 unit 필드 없음, produces는 {unit-name} 경로다. 작업·검토 입력을 u1-web 기존 functional-spec.md·traceability.json과 이번 Q&A로 한정한다. 시작/continue 원문 전체는 [도구 기록](single-2026-10-14-processing-deadline-tools.json)의 events에 보존한다.

inline_context_paths 11개를 읽고 현재 세션에서 확인한 동일 기능 설계 정의·Unit/요구/도메인/계약을 적용했다. inline 협력자 off이며 지원 에이전트 추가·diary/learnings·본 흐름 gate 없음. 기존 산출물·추적표를 재작성/재저장하지 않는다. 이번 단계의 별도 사람 요약 확인을 기다리며 독립 검토·완료 요청은 아직 실행하지 않았다.

## 보존·센서 결과

- 계약 검증의 전체 추적 SHA-256 1,504개 기준선과 대조했다. 변경된 추적 파일은 도구가 추가한 10월 감사 파일 하나뿐이다. 지정 산출물 5개·기존 질문/검증/리뷰·12월 intent 36개·aidlc-state.md·Unit 진행 파일은 보존됐다.
- required-sections: PASS, H2 7개, findings 0.
- upstream-coverage: PASS, unreferenced 없음, findings 0.
- traceability: FAIL, findings_count 43. missing_from_upstream_ids 20개·invalid_targets 22개·rules.md가 없다는 reason이며 나머지 gaps/orphans/missing_from_table/invalid_entries는 빈 배열이다. 10/9(2.10.0)의 결과 JSON 전체와 목록이 정확히 같다. 기존 UI-only W1~W8 추적과 rules 미제공을 유지하며 PASS로 바꾸지 않는다.
- YAML 파싱 PASS는 동일한 보호 판본에서 먼저 수행한 계약 YAML 4파일·문서 5블록의 [계약 검증](../../../inception/contract-design/single-2026-10-13-processing-deadline-verification.md)을 참조한다. 이후 산출물은 그대로여서 같은 파싱을 반복하거나 의존성을 바꾸지 않았다.
- linter/type-check: JS/TS 코드 또는 코드 블록 생성·수정 없음. 제품 검사·실행 시험은 수행하지 않았다.
- reviews/review-09.md는 도구가 u2-api 검토의 사본으로 만든 것이다. 이번 u1-web 검토로 세지 않고 파일을 그대로 둔다. 이번 리뷰 사본 경로·CHANGE_ACCEPTED·SUMMARY_ARTIFACT_UNAUTHORIZED·검토/완료 결과는 실제 후속 응답 뒤 추가한다.

## traceability 10/9 비교

```json
{
  "previous43Found": true,
  "exactResultEqual": true,
  "missingIdsEqual": true,
  "invalidTargetsEqual": true
}
```

비교는 이번 u1-traceability 출력과 아래 보존 검사에서 추출한 이전 원문을 JSON 객체로 읽어 실행했다. 같은 센서를 다시 호출해 비교하지 않았다.

## u1-web 요약 확인 요청

이 단계의 별도 사람 응답을 기다린다. 계약·u2-api 확인을 재사용하지 않는다. answer·독립 검토·완료 요청은 아직 실행하지 않았다.

```text
aidlc engine log decision --stage functional-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/single-2026-10-14-processing-deadline-questions.md --decision 'Does this all look correct before I generate the artifact?' --options 'Looks correct,Request changes'
```

exit_code: 0

```text
{"emitted":"DECISION_RECORDED","stage":"functional-design"}
```

## 실제 검사 명령과 원문

### u1-functional-required-sections

````text
aidlc engine sensor-required-sections --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md --stage functional-design
````

exit_code: 0

````text
{"pass":true,"h2_count":7,"headings":["## 적용 범위","## 화면 흐름","## 내 자산 화면 구조","## 화면 상태 전이","## API 소비 경계","## 담당자 확인 요청","## 추적 정보"],"findings_count":0}
````

### u1-upstream-coverage

````text
aidlc engine sensor-upstream-coverage --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md --stage functional-design --consumes unit-of-work,unit-of-work-story-map,requirements,components,contract-summary --deliverables functional-spec,traceability
````

exit_code: 0

````text
{"pass":true,"consumes":["unit-of-work","unit-of-work-story-map","requirements","components","contract-summary"],"unreferenced":[],"scanned_files":["/Users/ljm/Desktop/github/CatchU/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md"],"findings_count":0}
````

### u1-traceability

````text
aidlc engine sensor-traceability --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/traceability.json --stage functional-design
````

exit_code: 0

````text
{"pass":false,"gaps":[],"orphans":[],"missing_from_table":[],"missing_from_upstream_ids":["FR1.2","FR1.3","FR10","FR10.1","FR10.4","FR10.5","FR10.6","FR3.3","FR3.6","FR5","FR5.1","FR5.5","FR6.1","FR6.6","FR7.1","FR7.4","FR8.1","FR8.4","FR9.1","FR9.2"],"invalid_entries":[],"invalid_targets":["FR1.1: target must name at least one BRx.y ID","FR1.4: target must name at least one BRx.y ID","FR1.5: target must name at least one BRx.y ID","FR11.1: target must name at least one BRx.y ID","FR11.2: target must name at least one BRx.y ID","FR11.3: target must name at least one BRx.y ID","FR11: target must name at least one BRx.y ID","FR1: target must name at least one BRx.y ID","FR2.1: target must name at least one BRx.y ID","FR2.2: target must name at least one BRx.y ID","FR2: target must name at least one BRx.y ID","FR3.1: target must name at least one BRx.y ID","FR3.2: target must name at least one BRx.y ID","FR3.4: target must name at least one BRx.y ID","FR3.5: target must name at least one BRx.y ID","FR3: target must name at least one BRx.y ID","FR4.1: target must name at least one BRx.y ID","FR4.2: target must name at least one BRx.y ID","FR4.3: target must name at least one BRx.y ID","FR4.4: target must name at least one BRx.y ID","FR4.5: target must name at least one BRx.y ID","FR4: target must name at least one BRx.y ID"],"findings_count":43,"reason":"required upstream artifact is missing: /Users/ljm/Desktop/github/CatchU/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/rules.md"}
````

### u1-preservation-and-1009-traceability-source

````text
python3 - <<'PY'
import pathlib,json,hashlib,re
r=pathlib.Path.cwd();base='aidlc/spaces/default/intents/260914-catchu-october-mvp/';h=json.loads(pathlib.Path('/private/tmp/catchu-processing-deadline-20261013/baseline.json').read_text());changed=[p for p,v in h.items() if not (r/p).is_file() or hashlib.sha256((r/p).read_bytes()).hexdigest()!=v]
old=(r/base/'construction/u1-web/functional-design/single-2026-10-09-verification.md').read_text();previous=[json.loads(s) for s in re.findall(r'^\{[^\n]*"missing_from_upstream_ids"[^\n]*\}$',old,re.M)]
record=json.loads((r/base/'construction/u2-api/functional-design/single-2026-10-13-processing-deadline-tools.json').read_text())
print(json.dumps({'changed_tracked':changed,'unexpected_tracked':[p for p in changed if not p.startswith(base+'audit/')],'state_unchanged':base+'aidlc-state.md' not in changed,'december_unchanged':not any(p.startswith('aidlc/spaces/default/intents/260925-intent-12/') for p in changed),'u2_report':record['completion']['output'],'previous_traceability':next((p for p in previous if p.get('findings_count')==43),None)},ensure_ascii=False))
PY
````

exit_code: 0

````text
{"changed_tracked": ["aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md"], "unexpected_tracked": [], "state_unchanged": true, "december_unchanged": true, "u2_report": "{\"kind\":\"done\",\"reason\":\"Single-stage run of \\\"functional-design\\\" committed under synthetic workflow \\\"single-stage:functional-design\\\". The main workflow's Current Stage is untouched.\"}\n", "previous_traceability": {"pass": false, "gaps": [], "orphans": [], "missing_from_table": [], "missing_from_upstream_ids": ["FR1.2", "FR1.3", "FR10", "FR10.1", "FR10.4", "FR10.5", "FR10.6", "FR3.3", "FR3.6", "FR5", "FR5.1", "FR5.5", "FR6.1", "FR6.6", "FR7.1", "FR7.4", "FR8.1", "FR8.4", "FR9.1", "FR9.2"], "invalid_entries": [], "invalid_targets": ["FR1.1: target must name at least one BRx.y ID", "FR1.4: target must name at least one BRx.y ID", "FR1.5: target must name at least one BRx.y ID", "FR11.1: target must name at least one BRx.y ID", "FR11.2: target must name at least one BRx.y ID", "FR11.3: target must name at least one BRx.y ID", "FR11: target must name at least one BRx.y ID", "FR1: target must name at least one BRx.y ID", "FR2.1: target must name at least one BRx.y ID", "FR2.2: target must name at least one BRx.y ID", "FR2: target must name at least one BRx.y ID", "FR3.1: target must name at least one BRx.y ID", "FR3.2: target must name at least one BRx.y ID", "FR3.4: target must name at least one BRx.y ID", "FR3.5: target must name at least one BRx.y ID", "FR3: target must name at least one BRx.y ID", "FR4.1: target must name at least one BRx.y ID", "FR4.2: target must name at least one BRx.y ID", "FR4.3: target must name at least one BRx.y ID", "FR4.4: target must name at least one BRx.y ID", "FR4.5: target must name at least one BRx.y ID", "FR4: target must name at least one BRx.y ID"], "findings_count": 43, "reason": "required upstream artifact is missing: /Users/ljm/Desktop/github/CatchU/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/rules.md"}}
````
