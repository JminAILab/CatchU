# 처리 시한 계약 — 검증 기록 (2026-10-13)

## 계약 요약 확인 이후 결과

사람의 이 단계 응답 Looks correct를 질문 파일에 쓰고 summary-confirmation answer를 한 번 실행했다. SUMMARY_CONFIRMATION_RECORDED가 성공했고 summary_authorization_id는 3c322bd2550c51eb6497065c3fdf0b336cb9d34195f0cf7e0a8b12480227d31b다.

검토 요청은 1회, exit 1 및 SUMMARY_RECEIPT_MISSING으로 거부됐다. 독립 검토는 시작되지 않았으며 READY 판정·리뷰 사본은 없다. 완료 요청도 1회, exit 0이지만 kind:error로 거부됐다. 두 거부 응답은 이번 processing-deadline 질문 파일 대신 기존 contract-design-questions.md의 확인을 요구했다. 알려진 결함과 부합하며 실제 결과를 성공으로 바꾸지 않는다. 계약 단독 실행은 9/23의 시작에 이어 열린 채 유지한다.

완료 응답 직후 실행 환경이 오류가 이미 표시됐으므로 즉시 응답을 끝내라고 지시해 원문 파일 저장 전 중단됐다. 후속 대화에서 원문 보존과 원래 허용된 Unit별 기록 작업을 이어 간다. 계약 재시도·질문 파일 이동·추가 확인 기록·응답이 제안한 단계 재시작 등 우회는 하지 않았다. 산출물·설정·버전·상태를 직접 수정하지 않았다. 이 계약 확인을 다른 Unit의 확인으로 쓰지 않는다.

### contract-summary-answer

````text
aidlc engine log answer --stage contract-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-13-processing-deadline-questions.md --details 'Looks correct'
````

exit_code: 0

````text
{"emitted":"SUMMARY_CONFIRMATION_RECORDED","checkpoint":"summary-confirmation","stage":"contract-design","choice":"Looks correct","summary_authorization_id":"3c322bd2550c51eb6497065c3fdf0b336cb9d34195f0cf7e0a8b12480227d31b"}
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


## 대상과 요약 확인 전 상태

작업 위치: /Users/ljm/Desktop/github/CatchU. 브랜치 docs/분석-처리-시한-계약, HEAD 7e3b92b23cac43167c92f475c3b5ca69af9327bf. 산출물 재작성 없는 기록 작업이며 제품 코드·DB·worker·실제 큐·배포 검증은 수행하지 않았다. 결정과 기각 이유, 상위 요구 해석, 범위 유보는 [질문·답](single-2026-10-13-processing-deadline-questions.md)에 있다.

실행 binary/runtime: aidlc 2.11.0 (runtime 2.11.0). .codex/tools/data/aidlc-manifest.json frameworkVersion: 2.11.0. 10월 intent 명시 선택 명령은 aidlc engine intent switch 260914-catchu-october-mvp이며 출력은 Now working on `catchu-october-mvp`. 본 흐름은 functional-design / Completed, Guard Policy relaxed이며 이번 기록에서 바꾸지 않았다.

macui-macbookpro-local-de1289503add.md 및 전체 10월 감사 조각을 Workflow=single-stage:contract-design으로 확인했다. STAGE_STARTED 2026-09-23T07:02:00Z 한 건, STAGE_COMPLETED 없음이다. 이번 계약 단계는 새 next/시작 기록을 만들지 않는다. 계약 요약 확인을 대기하며 검토 요청·완료 보고는 아직 실행하지 않았다. Unit 단독 실행도 아직 열지 않았다.

## 보존 기준선

착수 전체 추적 파일 SHA-256 1,504개를 /private/tmp/catchu-processing-deadline-20261013/baseline.json에 확보했다. 그중 12월 intent 추적 파일 36개를 포함한다. 기존 10월 감사 파일은 동일 임시 디렉터리에 착수 원문을 복사해 앞부분 바이트 보존을 확인할 수 있게 했다. 기존 미커밋 감사 줄은 사용자가 커밋 포함을 명시한 예외이며 .local-handoffs/는 제외한다.

지정 산출물 5개는 전부 git show 7e3b92b:<path> 결과와 바이트 동일하다.

| 파일 | SHA-256 |
|---|---|
| contract-summary.md | 4402ae9ec680f88035478983a57c97ae0d008210a060b53fd69ba47c606da225 |
| u2-api/functional-spec.md | 94b0ad5715405521eda29b425b12f77b02105450e851a950c21b788f2f2b5bcb |
| u2-api/rules.md | 4c077e8e81f99b8b7219f7b17f1186f55a1ce2f21196b3856b1b9a1b6efe0a9a |
| u2-api/entities.md | 033bf297f383b0054fb6534da82d44a78747992e38c8654ac240911073e084a7 |
| u1-web/functional-spec.md | 01766cd11b14271f59fd47d0b4de7280c2999f0588d04dd300259f80e5ecbd5c |

## 검증 결과

- 계약 required-sections: PASS, H2 11개, findings 0.
- 계약 upstream-coverage: PASS, unreferenced 없음, findings 0.
- YAML: 계약 4파일과 contract-summary 3블록·rules 1블록·entities 1블록, 합계 9개 파싱 PASS. 첫 Python 검증은 PyYAML 미설치(ModuleNotFoundError)로 실행하지 못했고, 기존 api/node_modules/yaml로 파싱했다. 산출물·의존성을 고치지 않았다. 두 실행의 원문을 아래 보존한다.
- dev 0bfe9bf 대비: 5파일 42줄 교체, 추가 42·삭제 42, 줄 수 증감 0. e9b3455 대비 7e3b92b의 10월 intent 차이는 없다.
- 계약 요약의 60분은 1회이며 제목 고쳐 쓰기·제목 null 문장이 유지된다.
- traceability: 이번 계약 검증 대상 센서가 아니다. u2-api/u1-web 단계에서 실행하며 기존 FAIL을 PASS로 바꾸지 않는다.
- CHANGE_ACCEPTED·SUMMARY_ARTIFACT_UNAUTHORIZED 및 최종 보존 대조: 후속 도구 실행 결과를 이 문서에 추가하며 현재 검토·완료 결과를 미리 만들지 않는다.

## 계약 요약 확인 요청

아래 요청을 한 번 실행했다. 사람의 답은 아직 없으며 질문 파일의 Consolidated Summary Confirmation 답은 비워 두었다. answer·검토 요청·완료 보고는 실행하지 않았다.

```text
aidlc engine log decision --stage contract-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-13-processing-deadline-questions.md --decision 'Does this all look correct before I generate the artifact?' --options 'Looks correct,Request changes'
```

exit_code: 0

```text
{"emitted":"DECISION_RECORDED","stage":"contract-design"}
```

## 실제 명령과 원문

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

### yaml-validation

````text
python3 - <<'PY'
import pathlib,re,json,yaml
base=pathlib.Path('aidlc/spaces/default/intents/260914-catchu-october-mvp')
c=base/'inception/contract-design'
parsed=[]
for name in ['common.yaml','member-api.yaml','recipient-api.yaml','worker-messages.yaml']:
 yaml.safe_load((c/name).read_text()); parsed.append(str(c/name))
for rel in ['inception/contract-design/contract-summary.md','construction/u2-api/functional-design/rules.md','construction/u2-api/functional-design/entities.md']:
 p=base/rel
 blocks=re.findall(r'```yaml\s*\n(.*?)\n```',p.read_text(),re.S)
 for i,b in enumerate(blocks,1): yaml.safe_load(b); parsed.append(str(p)+'#yaml-'+str(i))
print(json.dumps({'pass':True,'parsed':parsed,'count':len(parsed)},ensure_ascii=False,indent=2))
PY
````

exit_code: 1

````text
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
ModuleNotFoundError: No module named 'yaml'
````

### yaml-validation-node

````text
node <<'JS'
const fs=require('fs'),path=require('path');
const yaml=require(require.resolve('yaml',{paths:[path.join(process.cwd(),'api')]}));
const base='aidlc/spaces/default/intents/260914-catchu-october-mvp/',c=base+'inception/contract-design/';
const parsed=[];
for(const n of ['common.yaml','member-api.yaml','recipient-api.yaml','worker-messages.yaml']){const d=yaml.parseDocument(fs.readFileSync(c+n,'utf8'));if(d.errors.length)throw d.errors[0];parsed.push(c+n)}
for(const rel of ['inception/contract-design/contract-summary.md','construction/u2-api/functional-design/rules.md','construction/u2-api/functional-design/entities.md']){
 let i=0;for(const m of fs.readFileSync(base+rel,'utf8').matchAll(/```yaml\s*\n([\s\S]*?)\n```/g)){const d=yaml.parseDocument(m[1]);if(d.errors.length)throw d.errors[0];parsed.push(base+rel+'#yaml-'+(++i))}
 if(!i)throw new Error('No YAML blocks: '+rel);
}
console.log(JSON.stringify({pass:true,parser:'api/node_modules/yaml',parsed,count:parsed.length},null,2));
JS
````

exit_code: 0

````text
{
  "pass": true,
  "parser": "api/node_modules/yaml",
  "parsed": [
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/recipient-api.yaml",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#yaml-1",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#yaml-2",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#yaml-3",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md#yaml-1",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md#yaml-1"
  ],
  "count": 9
}
````

### branch-provenance

````text
git log -5 --format='%h %s'
````

exit_code: 0

````text
7e3b92b2 chore: AI-DLC 2.11.0 반영 뒤의 dev를 처리 시한 계약 브랜치에 병합
0bfe9bfe Merge pull request #290 from JminAILab/chore/aidlc-211-claude
9941430c docs: Windows 안내의 hook 적용 범위 설명을 바로잡는다
6eafa486 docs: Windows Claude Code에서 AI-DLC 확인이 동작하는 개인 설정을 안내한다
613287b8 chore: Claude AI-DLC 실행 제한을 되돌려 공식 2.11.0 설정을 그대로 쓴다
````

### changed-artifacts

````text
git diff --numstat 0bfe9bf 7e3b92b -- aidlc/spaces/default/intents/260914-catchu-october-mvp
````

exit_code: 0

````text
5	5	aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/functional-spec.md
5	5	aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md
13	13	aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md
6	6	aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md
13	13	aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md
````

### merge-preservation

````text
git diff --name-only e9b3455 7e3b92b -- aidlc/spaces/default/intents/260914-catchu-october-mvp
````

exit_code: 0

````text

````

### contract-detail-count

````text
python3 - <<'PY'
import pathlib,json
p=pathlib.Path('aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md');s=p.read_text();print(json.dumps({'60분_occurrences':s.count('60분'),'deadline_error_code_occurrences':s.count('PROCESSING_DEADLINE_EXCEEDED'),'title_rewrite_retained':'한 분석 안의 제목 고쳐 쓰기는 분석 재시도가 아니다.' in s,'null_title_retained':'제목이 없으면 null' in s},ensure_ascii=False))
PY
````

exit_code: 0

````text
{"60분_occurrences": 1, "deadline_error_code_occurrences": 1, "title_rewrite_retained": true, "null_title_retained": true}
````
