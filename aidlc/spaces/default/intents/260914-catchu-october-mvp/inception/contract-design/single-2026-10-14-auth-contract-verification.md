# 인증 API 명세 반영 — 계약 설계 검증 기록 (2026-10-14)

## 계약 요약 확인 이후의 실제 결과

팀장의 별도 응답 Looks correct를 질문 파일에 기록한 뒤 log answer를 한 번 실행했다. SUMMARY_CONFIRMATION_RECORDED 성공, summary_authorization_id 312fa823ac5208c99fa1ff6c5935db5df6e9b5c26750b940c02e00a39de12326이다.

검토 요청은 한 번 실행했고 exit 1, SUMMARY_RECEIPT_MISSING으로 거부됐다. 독립 검토는 시작되지 않았고 READY 판정·리뷰 사본은 없다. report --single도 한 번 실행했고 exit 0이지만 kind:error다. 원문은 아래와 tools.json의 동일 id에 보존한다. 9/23 단독 실행은 열린 채 둔다. 재시도·질문 파일 이동·추가 요약 확인·restart-stage·본 흐름 next 등 우회는 하지 않았다.

report 직후 세션 제어가 즉시 응답을 끝내도록 해 원문 저장 전에 중단됐다. 후속 대화에서 원문 파일 저장과 원래 허용된 u2-api 작업을 이어 간다. 계약 명령은 다시 실행하지 않는다. 이 계약 확인을 u2-api 확인으로 사용하지 않는다.

### contract-summary-answer

````text
aidlc engine log answer --stage contract-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-14-auth-contract-questions.md --details 'Looks correct'
````

exit_code: 0

````text
{"emitted":"SUMMARY_CONFIRMATION_RECORDED","checkpoint":"summary-confirmation","stage":"contract-design","choice":"Looks correct","summary_authorization_id":"312fa823ac5208c99fa1ff6c5935db5df6e9b5c26750b940c02e00a39de12326"}
````

### contract-review-request

````text
aidlc engine log review --stage contract-design --single --reviewer aidlc-architecture-reviewer-agent --iteration 1
````

exit_code: 1

````text
{"error":"Cannot start review for \"contract-design\": no fresh human-backed consolidated summary confirmation is recorded. Present the summary and record it with `aidlc engine log decision --checkpoint summary-confirmation --stage contract-design --single --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-design-questions.md --decision 'Does this all look correct?' --options 'Looks correct,Request changes'`, end the turn, then after the human responds run `aidlc engine log answer --checkpoint summary-confirmation --stage contract-design --single --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-design-questions.md --details 'Looks correct'`.\n{\"kind\":\"ask\",\"ask_type\":\"guard-recovery\",\"response_route\":\"execute-remedy\",\"question\":\"Contract Design can't go ahead as things stand: which way would you like to go on?\",\"stage\":\"contract-design\",\"reason_codes\":[\"SUMMARY_RECEIPT_MISSING\"],\"remedies\":[{\"op\":\"restore-or-jump\",\"label\":\"Reopen the approved stage\",\"description\":\"Contract Design is already approved. I'll reopen it and redo it from the top. To keep the approval instead, put the files back the way they were when it was reviewed.\",\"action\":\"This stage is already approved; restore the reviewed source state, or jump back with $aidlc --stage contract-design to redo it.\",\"operation\":{\"kind\":\"restart-stage\",\"stage\":\"contract-design\"},\"command\":\"aidlc engine orchestrate next --stage contract-design\",\"requiresHuman\":true,\"executableNow\":true,\"interaction\":\"command\"}]}"}
````

### contract-report

````text
aidlc engine orchestrate report --single --stage contract-design --result completed
````

exit_code: 0

````text
{"kind":"error","message":"Refusing to complete \"contract-design\": no fresh human-backed consolidated summary confirmation is recorded. Present the summary and record it with `aidlc engine log decision --checkpoint summary-confirmation --stage contract-design --single --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-design-questions.md --decision 'Does this all look correct?' --options 'Looks correct,Request changes'`, end the turn, then after the human responds run `aidlc engine log answer --checkpoint summary-confirmation --stage contract-design --single --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-design-questions.md --details 'Looks correct'`."}
````


## 센서 비교와 확인 요청 이후 보존 검사

required-sections와 upstream-coverage의 전체 JSON 결과는 10/13 계약 기록과 각각 동일하다. 착수 기준선과 비교한 추적 파일 변경은 허용된 10월 감사 파일 하나뿐이다. 상태·12월 intent·기존 기록 변경 없음, 감사 원문 앞부분 모두 보존을 확인했다. 새 파일은 계약 질문·검증·도구 기록 3개이며 u2-api 실행은 아직 열지 않았다.

첫 비교 스크립트는 이전 도구 JSON의 센서 기록이 events 외 위치에도 있는 것을 놓쳐 StopIteration으로 종료했다. 비교기만 모든 중첩 기록을 읽도록 수정해 재실행했고 일치 결과를 확인했다. 센서·확인·검토·완료 명령을 재시도한 것이 아니다. 두 실행 원문을 보존한다.

### contract-sensor-comparison-and-preservation

````text
python3 - <<'PY'
import pathlib,json,hashlib
r=pathlib.Path.cwd();b=json.loads(pathlib.Path('/private/tmp/catchu-auth-contract-20261014/baseline.json').read_text());base='aidlc/spaces/default/intents/260914-catchu-october-mvp/';cd=r/base/'inception/contract-design'
old=json.loads((cd/'single-2026-10-13-processing-deadline-tools.json').read_text());new=json.loads((cd/'single-2026-10-14-auth-contract-tools.json').read_text());comparisons={}
for key in ['required-sections','upstream-coverage']:
 a=next(e for e in old['events'] if e.get('id')=='contract-'+key);c=next(e for e in new['events'] if e.get('id')=='contract-'+key);comparisons[key]=json.loads(a['output'])==json.loads(c['output'])
changed=[p for p,h in b['hashes'].items() if not (r/p).is_file() or hashlib.sha256((r/p).read_bytes()).hexdigest()!=h]
print(json.dumps({'previous_contract_sensor_results_equal':comparisons,'changed_tracked':changed,'unexpected_tracked':[p for p in changed if not p.startswith(base+'audit/')],'state_unchanged':base+'aidlc-state.md' not in changed,'december_unchanged':not any(p.startswith('aidlc/spaces/default/intents/260925-intent-12/') for p in changed),'audit_prefixes_preserved':all((r/base/'audit'/p.name).read_bytes().startswith(p.read_bytes()) for p in pathlib.Path('/private/tmp/catchu-auth-contract-20261014').glob('*.md'))},ensure_ascii=False,indent=2))
PY
````

exit_code: 1

````text
Traceback (most recent call last):
  File "<stdin>", line 5, in <module>
StopIteration
````

### contract-sensor-comparison-and-preservation-corrected

````text
python3 - <<'PY'
import pathlib,json,hashlib
r=pathlib.Path.cwd();b=json.loads(pathlib.Path('/private/tmp/catchu-auth-contract-20261014/baseline.json').read_text());base='aidlc/spaces/default/intents/260914-catchu-october-mvp/';cd=r/base/'inception/contract-design'
old=json.loads((cd/'single-2026-10-13-processing-deadline-tools.json').read_text());new=json.loads((cd/'single-2026-10-14-auth-contract-tools.json').read_text());comparisons={}
def flatten(v):
 if isinstance(v,dict):
  if 'id' in v and 'output' in v:yield v
  for x in v.values():yield from flatten(x)
 elif isinstance(v,list):
  for x in v:yield from flatten(x)
for key in ['required-sections','upstream-coverage']:
 a=next(e for e in flatten(old) if e.get('id')=='contract-'+key);c=next(e for e in flatten(new) if e.get('id')=='contract-'+key);comparisons[key]=json.loads(a['output'])==json.loads(c['output'])
changed=[p for p,h in b['hashes'].items() if not (r/p).is_file() or hashlib.sha256((r/p).read_bytes()).hexdigest()!=h]
print(json.dumps({'previous_contract_sensor_results_equal':comparisons,'changed_tracked':changed,'unexpected_tracked':[p for p in changed if not p.startswith(base+'audit/')],'state_unchanged':base+'aidlc-state.md' not in changed,'december_unchanged':not any(p.startswith('aidlc/spaces/default/intents/260925-intent-12/') for p in changed),'audit_prefixes_preserved':all((r/base/'audit'/p.name).read_bytes().startswith(p.read_bytes()) for p in pathlib.Path('/private/tmp/catchu-auth-contract-20261014').glob('*.md'))},ensure_ascii=False,indent=2))
PY
````

exit_code: 0

````text
{
  "previous_contract_sensor_results_equal": {
    "required-sections": true,
    "upstream-coverage": true
  },
  "changed_tracked": [
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md"
  ],
  "unexpected_tracked": [],
  "state_unchanged": true,
  "december_unchanged": true,
  "audit_prefixes_preserved": true
}
````


## 판본과 실행 범위

작업 위치 /Users/ljm/Desktop/github/CatchU, 브랜치 docs/인증-api-명세. HEAD/origin: 14508dbb840bea09f641122768dd9342a59e963d. merge-base HEAD origin/dev: 383ada9dbfbd609ea37828d903e299e32f5114d4. aidlc 2.11.0 (runtime 2.11.0). 원래 intent 커서 260914-catchu-october-mvp(LF), 변경하지 않았다.

PR #297 본문과 6862652·14508db 메시지, #250·#212 지정 댓글을 GitHub CLI/API로 현재 조회했다. #257·#254·#269는 MERGED로 확인했으며 현재 google-login·github-connection·auth 코드는 dev 383ada9와 diff가 없다. 서비스 동작·실제 브라우저·외부 OAuth·DB·AWS 배포 검증은 이번 기록 작업의 대상이 아니다. 제품 검사는 해당 없음(코드 변경 없음). OpenAPI 구조 검사는 수행하지 않았다. YAML 파싱·참조 해석은 OpenAPI 구조 검사나 실제 연결 증거를 대신하지 않는다.

## 기존 단독 실행과 보존 기준선

전체 10월 audit 조각에서 Workflow single-stage:contract-design의 STAGE_STARTED 2026-09-23T07:02:00Z 한 건, STAGE_COMPLETED 없음이다. 새 계약 실행은 열지 않았다. 상태 파일은 functional-design / Completed이며 보호한다.

기준선: /private/tmp/catchu-auth-contract-20261014/baseline.json, 추적 파일 1,552개 SHA-256(12월 36개 포함). 감사 조각 6개의 착수 원문을 같은 폴더에 복사했다. 기존 미커밋 감사 꼬리도 이 기준선에 포함된다. 첫 보존 대조에서 착수 이후 추적 파일 변경 없음, 모든 감사 앞부분 보존을 확인했다.

## 검사 결과

- 보호 산출물 5개: git diff --exit-code 14508db 빈 출력, exit 0. api/docs 3개도 동일.
- 계약 YAML 4개 + 요약 YAML 3블록 + ERD YAML 1블록: 8개 파싱 PASS. 기존 api yaml 모듈 사용, 설치 없음.
- 계약 파일의 $ref 234개 실제 위치 해석 PASS. 인증 경로 7개의 응답 코드 목록 대조 PASS.
- required-sections: PASS, H2 11개, findings 0. 10/13 결과와 비교한다.
- upstream-coverage: PASS, unreferenced 없음, findings 0. 10/13 결과와 비교한다.
- traceability: 실행했으나 exit 1, contract-design/traceability.json 없음. 계약 단계 선언은 required-sections·upstream-coverage만 포함하고 traceability upstream resolver도 없다. 10/13 계약 기록에서는 해당 없음으로 두었다. 통과로 기록하거나 파일을 새로 만들지 않는다.
- u2-api의 10/13 traceability FAIL 23건 비교는 별도 단독 실행에서 한다.

## 요약 확인 요청 당시 상태

질문 파일을 다시 읽어 요약 답이 공백이고 도구 JSON이 유효함을 확인했다. 첫 readback의 endswith('[Answer]:\n') 검사는 파일 끝의 추가 LF 때문에 AssertionError였다. 문서를 바꾸지 않고 끝 공백을 허용한 읽기 검사로 확인했다. 확인·검토·완료 명령은 실행하지 않았다.

````text
{"questions_summary_answer_blank": true, "tool_json_valid": true, "events": 11, "no_answer_review_report_attempted": true}
````

요약 확인 요청을 등록한 뒤 팀장 답을 기다린다. log answer·검토 요청·완료 보고는 아직 실행하지 않았다. 성공이나 예상 거부를 실제 결과로 기록하지 않는다. 응답 후 각 명령은 한 번만 실행하고 원문을 여기에 추가한다.

## 실제 명령과 출력

### contract-summary-decision

````text
aidlc engine log decision --stage contract-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-14-auth-contract-questions.md --decision 'Does this all look correct before I generate the artifact?' --options 'Looks correct,Request changes'
````

exit_code: 0

````text
{"emitted":"DECISION_RECORDED","stage":"contract-design"}
````

DECISION_RECORDED 성공. 질문 파일의 요약 답은 비워 두었고 별도의 팀장 응답을 기다린다.

### contract-required-sections

````text
aidlc engine sensor-required-sections --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md --stage contract-design
````

exit_code: 0

````text
{"pass":true,"h2_count":11,"headings":["## 계약의 지위와 경계","## M — 회원 API","## 분석 접수·상태·재요청","## B 등록·공개 및 E/F 반영 경계","## P — 수신자 API","## 공통 오류·요청 안전성","## W — worker 메시지 계약","## Contract ownership rules","## Open questions","## 담당자 확인 요청","## 추적 정보"],"findings_count":0}
````

### contract-upstream-coverage

````text
aidlc engine sensor-upstream-coverage --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md --stage contract-design --consumes unit-of-work,unit-of-work-dependency,components,requirements --deliverables contract-summary
````

exit_code: 0

````text
{"pass":true,"consumes":["unit-of-work","unit-of-work-dependency","components","requirements"],"unreferenced":[],"scanned_files":["/Users/ljm/Desktop/github/CatchU/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md"],"findings_count":0}
````

### contract-traceability

````text
aidlc engine sensor-traceability --output-path aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/traceability.json --stage contract-design
````

exit_code: 1

````text
aidlc-sensor-traceability: --output-path not found: aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/traceability.json
````

### protected-five-diff

````text
git diff --exit-code 14508db -- aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md
````

exit_code: 0

````text
````

### api-docs-diff

````text
git diff --exit-code 14508db -- api/docs/google-login.md api/docs/github-connection.md api/docs/auth-sessions.md
````

exit_code: 0

````text
````

### merged-code-diff

````text
git diff --exit-code 383ada9 -- api/src/google-login api/src/github-connection api/src/auth
````

exit_code: 0

````text
````

### yaml-and-auth-response-validation

````text
node <<'JS'
const fs=require('fs'),path=require('path'),assert=require('assert');
const YAML=require(require.resolve('yaml',{paths:[path.join(process.cwd(),'api')]}));
const root='aidlc/spaces/default/intents/260914-catchu-october-mvp/';const cd=root+'inception/contract-design/';const fd=root+'construction/u2-api/functional-design/';
const parsed=[],docs={};
function parse(label,text){const d=YAML.parseDocument(text);assert.equal(d.errors.length,0,JSON.stringify(d.errors));parsed.push(label);return d.toJSON();}
for(const n of ['common.yaml','member-api.yaml','recipient-api.yaml','worker-messages.yaml'])docs[cd+n]=parse(cd+n,fs.readFileSync(cd+n,'utf8'));
for(const [p,count] of [[cd+'contract-summary.md',3],[fd+'entities.md',1]]){const b=[...fs.readFileSync(p,'utf8').matchAll(/```yaml\s*\n([\s\S]*?)\n```/g)];assert.equal(b.length,count);b.forEach((m,i)=>parse(p+'#yaml-'+(i+1),m[1]));}
let refs=0;function walk(v,file){if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){if(k==='$ref'){const [rel,ptr]=x.split('#');const target=rel?path.normalize(path.join(path.dirname(file),rel)):file;assert(docs[target],'ref file: '+x);let t=docs[target];for(const seg of (ptr||'').split('/').slice(1))t=t?.[seg.replace(/~1/g,'/').replace(/~0/g,'~')];assert(t!==undefined,'ref pointer: '+x);refs++;}else walk(x,file);}}
for(const [p,d] of Object.entries(docs))walk(d,p);
const expected={'POST /auth/google/authorization':['200','400','404','500'],'POST /auth/google/login':['200','400','401','404','500'],'POST /auth/refresh':['200','400','401','403','500'],'POST /auth/logout':['204','400','403','500'],'POST /me/github/authorization':['200','400','401','403','404','500'],'POST /me/github/connection':['200','400','401','403','404','500'],'DELETE /me/github/connection':['200','400','401','403','404','500']};
const member=docs[cd+'member-api.yaml'];for(const [key,codes] of Object.entries(expected)){const [method,p]=key.split(' ');assert.deepEqual(Object.keys(member.paths[p][method.toLowerCase()].responses).sort(),codes);}
console.log(JSON.stringify({pass:true,parser:'existing api yaml module',parsed,count:parsed.length,resolved_refs:refs,auth_operations:Object.keys(expected)},null,2));
JS
````

exit_code: 0

````text
{
  "pass": true,
  "parser": "existing api yaml module",
  "parsed": [
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/recipient-api.yaml",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#yaml-1",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#yaml-2",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#yaml-3",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#yaml-1"
  ],
  "count": 8,
  "resolved_refs": 234,
  "auth_operations": [
    "POST /auth/google/authorization",
    "POST /auth/google/login",
    "POST /auth/refresh",
    "POST /auth/logout",
    "POST /me/github/authorization",
    "POST /me/github/connection",
    "DELETE /me/github/connection"
  ]
}
````

### baseline-and-open-contract

````text
python3 - <<'PY'
import pathlib,subprocess,json,hashlib,re
r=pathlib.Path.cwd();t=pathlib.Path('/private/tmp/catchu-auth-contract-20261014');b=json.loads((t/'baseline.json').read_text());changed=[p for p,h in b['hashes'].items() if not (r/p).is_file() or hashlib.sha256((r/p).read_bytes()).hexdigest()!=h]
base='aidlc/spaces/default/intents/260914-catchu-october-mvp/';found=[]
for p in (r/base/'audit').glob('*.md'):
 for block in re.split(r'(?=^## )',p.read_text(),flags=re.M):
  if '**Workflow**: single-stage:contract-design' in block and ('**Event**: STAGE_STARTED' in block or '**Event**: STAGE_COMPLETED' in block):found.append({'file':str(p.relative_to(r)),'block':block})
previous=json.loads((r/base/'inception/contract-design/single-2026-10-13-processing-deadline-tools.json').read_text());print(json.dumps({'head':b['head'],'merge_base':b['merge_base'],'original_cursor':b['original_cursor'],'tracked_count':len(b['hashes']),'changed_since_baseline':changed,'contract_single_boundaries':found,'audit_prefixes_preserved':all((r/base/'audit'/p.name).read_bytes().startswith(p.read_bytes()) for p in t.glob('*.md')),'december_files':sum(p.startswith('aidlc/spaces/default/intents/260925-intent-12/') for p in b['hashes'])},ensure_ascii=False,indent=2))
PY
````

exit_code: 0

````text
{
  "head": "14508dbb840bea09f641122768dd9342a59e963d",
  "merge_base": "383ada9dbfbd609ea37828d903e299e32f5114d4",
  "original_cursor": "260914-catchu-october-mvp\n",
  "tracked_count": 1552,
  "changed_since_baseline": [],
  "contract_single_boundaries": [
    {
      "file": "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-de1289503add.md",
      "block": "## Stage Start\n**Timestamp**: 2026-09-23T07:02:00Z\n**Event**: STAGE_STARTED\n**Stage**: contract-design\n**Agent**: aidlc-architect-agent\n**Workflow**: single-stage:contract-design\n\n---\n\n"
    }
  ],
  "audit_prefixes_preserved": true,
  "december_files": 36
}
````


