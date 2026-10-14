# 인증 API 명세 반영 — u2-api 기능 설계 검증 기록 (2026-10-14)

## 커밋 직전 공백 검사 예외

지정한 8개 파일을 스테이징한 뒤 git diff --cached --check는 exit 2였다. 새 기록 6개의 파일 끝 빈 줄(new blank line at EOF)만 지적했고, 산출물·기존 기록·감사 원문에는 지적이 없다. 확인된 질문 파일의 요약 바이트와 기록을 보존하기 위해 공백 제거·추가 확인·재검토는 하지 않는다. 앞서 git diff --check PASS는 당시 tracked 감사 diff에 대한 결과이며 새 미추적 파일을 포함한 전체 통과로 확대하지 않는다.

````text
git diff --cached --check
````

exit_code: 2

````text
aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-14-auth-contract-questions.md:52: new blank line at EOF.
aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-14-auth-contract-tools.json:219: new blank line at EOF.
aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-14-auth-contract-verification.md:478: new blank line at EOF.
aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-14-auth-contract-questions.md:55: new blank line at EOF.
aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-14-auth-contract-tools.json:146: new blank line at EOF.
aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-14-auth-contract-verification.md:314: new blank line at EOF.
````

최종 커밋 대상은 새 질문/검증/도구 파일 6개, 팀장 미커밋 기록을 포함한 감사 파일 1개, 도구 생성 review-11.md 사본 1개로 제한한다. 원격 push·PR 본문/이슈/Project 갱신 없음. 원래 커서 260914-catchu-october-mvp(LF)는 그대로다.


## 최종 검증과 로컬 커밋 대상

새 기록 6개·10월 감사 파일 1개·도구 생성 review-11.md 사본 1개, 합계 8개만 허용 목록으로 확인했다. .local-handoffs/는기존 미추적 항목으로 제외한다. 보호 산출물 5개·api/docs 3개는 14508db와 바이트 동일하며 이전 추적 파일은 감사 외 전부 동일하다. 감사 착수 원문 앞부분(팀장 미커밋 꼬리 포함)·상태·12월·원래 커서 보존 PASS다. 두 단계의 summary_authorization_id는 별도이고 공식 READY JSON body와 도구 사본은 바이트 동일하다. 공식 JSON unit은 null인 synthetic stage이며 검토 내용은 u2-api에 한정했다.

문서 크기 검사 PASS. 현재 tracked diff의 git diff --check PASS. 새 파일·리뷰 사본 포함 staged 공백 검사는 커밋 직전에 실행한다. 제품 검사는 해당 없음(기록 전용), 실제 OAuth·브라우저·DB·배포 검증은 수행하지 않았다.

최초 final-scope 검사에서 latest_functional_single_completion은 감사 조각 열거 순서의 마지막 항목을 반환해 9/24를 표시했다. 최신 시각 판정으로 고친 별도 functional-completion-boundary-by-timestamp 결과를 권위 있는 최신 완료 증거로 사용한다. report를 다시 실행하지 않았다.

### doc-size-check

````text
bash .github/scripts/check-doc-sizes.sh
````

exit_code: 0

````text
통과    29540 / 36000  docs/CatchU_작업관리.md
통과    17998 / 19000  docs/CatchU_coding_procedures.md
통과    25866 / 36000  web/README.md
통과    31662 / 36000  api/README.md
통과    22388 / 36000  worker/README.md
통과    20053 / 36000  api/CONVENTIONS.md
통과    13674 / 36000  api/docs/analysis-intake.md
통과     8443 / 36000  api/docs/analysis-receiver.md
통과     3916 / 36000  api/docs/auth-review.md
통과    22725 / 36000  api/docs/auth-sessions.md
통과     8284 / 36000  api/docs/catch-owner-read-preparation.md
통과     5579 / 36000  api/docs/catch-registration-database.md
통과     5196 / 36000  api/docs/catch-registration-e-integration.md
통과     4152 / 36000  api/docs/catch-registration-proposal.md
통과     7237 / 36000  api/docs/catch-registration-rules.md
통과     6397 / 36000  api/docs/catch-visibility.md
통과     8273 / 36000  api/docs/environment.md
통과    18090 / 36000  api/docs/github-connection.md
통과    18237 / 36000  api/docs/google-login.md
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
통과    14146 / 36000  worker/docs/generation-provider.md
통과    35538 / 36000  worker/docs/generation.md
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

### working-diff-whitespace

````text
git diff --check
````

exit_code: 0

````text
````

### head-and-origin-check

````text
git rev-parse HEAD origin/docs/인증-api-명세
````

exit_code: 0

````text
14508dbb840bea09f641122768dd9342a59e963d
14508dbb840bea09f641122768dd9342a59e963d
````

### pre-review-protection

````text
python3 - <<'PY'
import pathlib,json,hashlib,subprocess
r=pathlib.Path.cwd();tmp=pathlib.Path('/private/tmp/catchu-auth-contract-20261014');b=json.loads((tmp/'baseline.json').read_text());base='aidlc/spaces/default/intents/260914-catchu-october-mvp/';changed=[p for p,h in b['hashes'].items() if not (r/p).is_file() or hashlib.sha256((r/p).read_bytes()).hexdigest()!=h]
protected=['inception/contract-design/member-api.yaml','inception/contract-design/common.yaml','inception/contract-design/contract-summary.md','construction/u2-api/functional-design/entities.md','construction/u2-api/functional-design/functional-spec.md','api/docs/google-login.md','api/docs/github-connection.md','api/docs/auth-sessions.md'];rows=[]
for p in protected:
 p=p if p.startswith('api/') else base+p;data=(r/p).read_bytes();original=subprocess.check_output(['git','show','14508db:'+p]);rows.append({'file':p,'byte_identical_to_14508db':data==original,'sha256':hashlib.sha256(data).hexdigest()})
print(json.dumps({'protected':rows,'changed_tracked':changed,'unexpected_tracked':[p for p in changed if not p.startswith(base+'audit/')],'audit_prefixes_preserved':all((r/base/'audit'/p.name).read_bytes().startswith(p.read_bytes()) for p in tmp.glob('*.md')),'state_unchanged':base+'aidlc-state.md' not in changed,'december_unchanged':not any(p.startswith('aidlc/spaces/default/intents/260925-intent-12/') for p in changed),'cursor_unchanged':(r/'aidlc/spaces/default/intents/active-intent').read_text()==b['original_cursor']},ensure_ascii=False,indent=2))
PY
````

exit_code: 0

````text
{
  "protected": [
    {
      "file": "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml",
      "byte_identical_to_14508db": true,
      "sha256": "c26933568b61ad603b3f5e266530182c1ba386e575d61a53549b1a6dba0b3136"
    },
    {
      "file": "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml",
      "byte_identical_to_14508db": true,
      "sha256": "feef452831fac07956e289e8dfaaedb123da180bbfe572a88a49c19534107ad6"
    },
    {
      "file": "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md",
      "byte_identical_to_14508db": true,
      "sha256": "9eeb0caa393be2777e662a4a4275107344eb021f59d5fcf93b5fe1830a86a323"
    },
    {
      "file": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md",
      "byte_identical_to_14508db": true,
      "sha256": "a5bcb6cc15be6431ecc57bb3c23439b9a6cbb6efd71a1c187d1c3c4623fe9157"
    },
    {
      "file": "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md",
      "byte_identical_to_14508db": true,
      "sha256": "f4e98945a750cd37ad6905c5fc89264074f7f405921d8be93cf53b87b19b7171"
    },
    {
      "file": "api/docs/google-login.md",
      "byte_identical_to_14508db": true,
      "sha256": "56a714cd15223e4ac4588af0b7fe35fb96b99bd6f3f232a9aa53726e4fd4cae8"
    },
    {
      "file": "api/docs/github-connection.md",
      "byte_identical_to_14508db": true,
      "sha256": "e47e25654623cf082e1544df69e8be050624ee22bd9c59fd28084bd8cc1971fa"
    },
    {
      "file": "api/docs/auth-sessions.md",
      "byte_identical_to_14508db": true,
      "sha256": "f3fb299a07f5be5c81c5827593891d470a88dffcdddf3d0d7ff08e613147defd"
    }
  ],
  "changed_tracked": [
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md"
  ],
  "unexpected_tracked": [],
  "audit_prefixes_preserved": true,
  "state_unchanged": true,
  "december_unchanged": true,
  "cursor_unchanged": true
}
````

### final-scope-preservation-and-review-copy

````text
python3 - <<'PY'
import pathlib,json,hashlib,subprocess,re
r=pathlib.Path.cwd();tmp=pathlib.Path('/private/tmp/catchu-auth-contract-20261014');b=json.loads((tmp/'baseline.json').read_text());base='aidlc/spaces/default/intents/260914-catchu-october-mvp/';fd=r/base/'construction/u2-api/functional-design';cd=r/base/'inception/contract-design';changed=[p for p,h in b['hashes'].items() if not (r/p).is_file() or hashlib.sha256((r/p).read_bytes()).hexdigest()!=h];new=[]
for folder in [cd,fd]:
 for ext in ['questions.md','verification.md','tools.json']:new.append(str((folder/('single-2026-10-14-auth-contract-'+ext)).relative_to(r)))
copy=base+'construction/u1-web/functional-design/reviews/review-11.md';audit=base+'audit/macui-macbookpro-local-3cf6d8f9dcd7.md';allowed=set(new+[copy,audit]);untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard','-z']).decode().split('\0');unexpected=[p for p in changed+untracked if p and p not in allowed and not p.startswith('.local-handoffs/')]
d=json.loads((fd/'single-2026-10-14-auth-contract-tools.json').read_text());official=json.loads(next(e['output'] for e in d['events'] if e['id']=='u2-official-review-record'));copytext=(r/copy).read_text();cdtools=json.loads((cd/'single-2026-10-14-auth-contract-tools.json').read_text());cdanswer=json.loads(next(e['output'] for e in cdtools['events'] if e['id']=='contract-summary-answer'));fdanswer=json.loads(next(e['output'] for e in d['events'] if e['id']=='u2-summary-answer'));contract=[];functional=[]
for p in (r/base/'audit').glob('*.md'):
 for block in re.split(r'(?=^## )',p.read_text(),flags=re.M):
  if '**Workflow**: single-stage:contract-design' in block and ('**Event**: STAGE_STARTED' in block or '**Event**: STAGE_COMPLETED' in block):contract.append(block)
  if '**Workflow**: single-stage:functional-design' in block and '**Event**: STAGE_COMPLETED' in block:functional.append(block)
result={'allowed_commit_files':sorted(allowed),'unexpected_files':unexpected,'all_six_records_exist':all((r/p).is_file() for p in new),'state_unchanged':base+'aidlc-state.md' not in changed,'december_unchanged':not any(p.startswith('aidlc/spaces/default/intents/260925-intent-12/') for p in changed),'historical_tracked_unchanged_except_audit':not any(not p.startswith(base+'audit/') for p in changed),'audit_prefixes_preserved':all((r/base/'audit'/p.name).read_bytes().startswith(p.read_bytes()) for p in tmp.glob('*.md')),'cursor_preserved':(r/'aidlc/spaces/default/intents/active-intent').read_text()==b['original_cursor'],'independent_summary_ids':cdanswer['summary_authorization_id']!=fdanswer['summary_authorization_id'],'review_verdict':official['verdict'],'review_findings':official['findings'],'engine_review_scope_unit':official['unit'],'copy_body_equals_official':copytext==official['body'],'copy_body_equals_official_after_outer_whitespace':copytext.strip()==official['body'].strip(),'copy_sha256':hashlib.sha256((r/copy).read_bytes()).hexdigest(),'contract_single_started':sum('STAGE_STARTED' in x for x in contract),'contract_single_completed':sum('STAGE_COMPLETED' in x for x in contract),'latest_functional_single_completion':functional[-1] if functional else None}
print(json.dumps(result,ensure_ascii=False,indent=2));assert not unexpected;assert result['independent_summary_ids'];assert result['copy_body_equals_official_after_outer_whitespace'];assert result['historical_tracked_unchanged_except_audit'];assert result['audit_prefixes_preserved']
PY
````

exit_code: 0

````text
{
  "allowed_commit_files": [
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u1-web/functional-design/reviews/review-11.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-14-auth-contract-questions.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-14-auth-contract-tools.json",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-14-auth-contract-verification.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-14-auth-contract-questions.md",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-14-auth-contract-tools.json",
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/single-2026-10-14-auth-contract-verification.md"
  ],
  "unexpected_files": [],
  "all_six_records_exist": true,
  "state_unchanged": true,
  "december_unchanged": true,
  "historical_tracked_unchanged_except_audit": true,
  "audit_prefixes_preserved": true,
  "cursor_preserved": true,
  "independent_summary_ids": true,
  "review_verdict": "READY",
  "review_findings": [],
  "engine_review_scope_unit": null,
  "copy_body_equals_official": true,
  "copy_body_equals_official_after_outer_whitespace": true,
  "copy_sha256": "63dad9af202ceeef444bfb03b576d982bf81542c68242a54682eda96b97fbf70",
  "contract_single_started": 1,
  "contract_single_completed": 0,
  "latest_functional_single_completion": "## Stage Completion\n**Timestamp**: 2026-09-24T10:17:00Z\n**Event**: STAGE_COMPLETED\n**Stage**: functional-design\n**Details**: Single-stage run of functional-design completed\n**Workflow**: single-stage:functional-design\n\n---\n\n"
}
````

### final-protected-byte-diff

````text
git diff --exit-code 14508db -- aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md api/docs/google-login.md api/docs/github-connection.md api/docs/auth-sessions.md
````

exit_code: 0

````text
````

### functional-completion-boundary-by-timestamp

````text
python3 - <<'PY'
import pathlib,re,json
root=pathlib.Path('aidlc/spaces/default/intents/260914-catchu-october-mvp/audit');rows=[]
for p in root.glob('*.md'):
 for block in re.split(r'(?=^## )',p.read_text(),flags=re.M):
  if '**Workflow**: single-stage:functional-design' in block and '**Event**: STAGE_COMPLETED' in block:
   stamp=re.search(r'^\*\*Timestamp\*\*: (.+)$',block,re.M).group(1);rows.append({'file':str(p),'timestamp':stamp,'block':block})
print(json.dumps({'latest_functional_single_completion_by_timestamp':max(rows,key=lambda x:x['timestamp'])},ensure_ascii=False,indent=2))
PY
````

exit_code: 0

````text
{
  "latest_functional_single_completion_by_timestamp": {
    "file": "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md",
    "timestamp": "2026-10-14T11:26:36Z",
    "block": "## Stage Completion\n**Timestamp**: 2026-10-14T11:26:36Z\n**Event**: STAGE_COMPLETED\n**Stage**: functional-design\n**Details**: Single-stage run of functional-design completed\n**Workflow**: single-stage:functional-design\n\n---\n\n"
  }
}
````


## 단독 완료의 실제 결과

READY 검토 수신과 REVIEW_COMPLETED 이후 report --single을 한 번 실행해 exit 0, kind:done을 받았다. synthetic workflow single-stage:functional-design만 완료됐고 본 흐름의 Current Stage는 바뀌지 않았다. 계약의 열린 단독 실행은 완료하지 않았다.

````text
aidlc engine orchestrate report --single --stage functional-design --result completed
````

exit_code: 0

````text
{"kind":"done","reason":"Single-stage run of \"functional-design\" committed under synthetic workflow \"single-stage:functional-design\". The main workflow's Current Stage is untouched."}
````

## 독립 검토 실제 결과

별도 aidlc-architecture-reviewer-agent의 1회 검토 판정 READY, Prior/New findings 모두 빈 표다. 주제 범위는 u2-api의 이번 인증 변경과 상류 계약·명시 인증 코드/문서다. 기존 traceability FAIL 23건은 실제 실패로 보존했고 실제 OAuth·브라우저·다중 탭·DB·AWS·#251 완료로 확대하지 않았다.

도구의 recordVerdict 명령을 READY로 한 번 실행해 REVIEW_COMPLETED를 받았다. 공식 JSON: .aidlc-engine/reviews/functional-design/stage/6d382aa64ee8389c/1.json. 도구가 만든 Markdown 사본: construction/u1-web/functional-design/reviews/review-11.md. 사본이 u1-web 폴더에 있으나 검토 내용·의뢰 대상은 u2-api다. 이 파일을 이동·재작성하거나 u1-web 단계를 열지 않았다. report 전에 공식 JSON과 reviewFile 원문을 tools.json에 확보했다.

### u2-review-verdict

````text
aidlc engine log review --stage functional-design --reviewer aidlc-architecture-reviewer-agent --single --iteration 1 --verdict READY --project-dir /Users/ljm/Desktop/github/CatchU
````

exit_code: 0

````text
{"emitted":"REVIEW_COMPLETED","stage":"functional-design","reviewRecord":".aidlc-engine/reviews/functional-design/stage/6d382aa64ee8389c/1.json","reviewMarkdown":"construction/u1-web/functional-design/reviews/review-11.md"}
````

최종 완료 보고는 다음 한 번의 report --single 결과로 기록한다.


## u2-api 요약 확인과 검토 요청 이후

팀장의 별도 Looks correct 응답을 질문 파일에 기록한 뒤 log answer를 한 번 실행했다. SUMMARY_CONFIRMATION_RECORDED 성공, summary_authorization_id 4ceec71e4d324f4ee67c03d98a8dd78eeff31e4837be1ff294e4ce3ddb451143이다. 계약 단계의 확인을 재사용하지 않았다.

독립 검토 요청을 한 번 실행해 REVIEW_REQUESTED를 받았다. requestId review:13f86e61ded15ac77af9f2c8b8aa8ab3이며 도구가 지정한 reviewFile에 별도의 aidlc-architecture-reviewer-agent가 검토한다. 검토 범위는 u2-api와 상류 계약 및 명시한 인증 코드/문서에 한정한다. u1-web·u3-worker를 읽거나 실행하지 않는다. 요청에서 나온 change_notices는 원문 그대로 도구 기록에 보존하고 사람에게 한 번 전달했다.

최종 판정·완료는 검토 응답을 받은 뒤에만 기록한다. 산출물 재작성이나 거부 재시도는 하지 않는다.

### u2-summary-answer

````text
aidlc engine log answer --stage functional-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-14-auth-contract-questions.md --details 'Looks correct'
````

exit_code: 0

````text
{"emitted":"SUMMARY_CONFIRMATION_RECORDED","checkpoint":"summary-confirmation","stage":"functional-design","choice":"Looks correct","summary_authorization_id":"4ceec71e4d324f4ee67c03d98a8dd78eeff31e4837be1ff294e4ce3ddb451143"}
````

### u2-review-request

````text
aidlc engine log review --stage functional-design --single --reviewer aidlc-architecture-reviewer-agent --iteration 1
````

exit_code: 0

````text
{"emitted":"REVIEW_REQUESTED","stage":"functional-design","requestId":"review:13f86e61ded15ac77af9f2c8b8aa8ab3","reviewFile":"aidlc/spaces/default/intents/260914-catchu-october-mvp/.aidlc-engine/reviews/functional-design/stage/6d382aa64ee8389c/1.13f86e61ded15ac77af9f2c8b8aa8ab3.review.md","recordVerdict":"aidlc engine log review --stage functional-design --reviewer aidlc-architecture-reviewer-agent --single --iteration 1 --verdict '<READY|NOT-READY>' --project-dir /Users/ljm/Desktop/github/CatchU","change_notices":["aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md, aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md changed after the api Unit was reviewed; carrying on.","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md was saved before you confirmed the current summary; carrying on.","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md was saved before you confirmed the current summary; carrying on.","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md was saved before you confirmed the current summary; carrying on.","aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/traceability.json was saved before you confirmed the current summary; carrying on."]}
````


## 판본·단독 실행

브랜치 docs/인증-api-명세, HEAD/origin 14508dbb840bea09f641122768dd9342a59e963d, merge-base 383ada9dbfbd609ea37828d903e299e32f5114d4. aidlc 2.11.0 (runtime 2.11.0). 원래 intent 커서 260914-catchu-october-mvp(LF), 변경 없음.

다음 명령으로 새 단독 실행을 열었다: aidlc engine orchestrate next --stage functional-design --unit u2-api --single. 반환된 continue dVfbCzpS와 continue 6TOfwuOV를 그대로 실행해 single:true, gate:false의 run-stage를 받았다. 원문은 tools.json의 u2-single-next·u2-single-continue-part1·u2-single-continue-part2에 보존한다. run-stage의 generic produces는 {unit-name} 템플릿이며 이번 요청의 명시 대상 u2-api로 범위를 한정한다. 별도 Unit start/complete·본 흐름 next·상태 편집·일지/학습 의식은 실행하지 않는다.

앞 단계에서 계약 요약 확인 성공 이후 검토·완료 요청은 각각 한 번 실행했고 실행은 열린 상태다. 원문 위치는 inception/contract-design/single-2026-10-14-auth-contract-verification.md의 「계약 요약 확인 이후의 실제 결과」와 같은 tools.json이다. 계약 답을 이 단계에 재사용하지 않는다.

## 검사 결과와 한계

10/13과 비교한 센서 5개 전체 JSON 결과가 모두 동일하다. traceability FAIL 23건의 missing_from_upstream_ids 목록도 동일하다. 보호 산출물 5개와 api/docs 3개에 대한 git diff --exit-code 14508db는 빈 출력/exit 0이다. 상태·12월 intent·기존 기록 변경 없음, 감사 착수 앞부분 보존, 원래 커서 보존을 확인했다. 계약 단독 실행은 STAGE_STARTED 1건/STAGE_COMPLETED 0건이다.

### u2-sensor-comparison-and-preservation

````text
python3 - <<'PY'
import pathlib,json,hashlib,re
r=pathlib.Path.cwd();tmp=pathlib.Path('/private/tmp/catchu-auth-contract-20261014');b=json.loads((tmp/'baseline.json').read_text());base='aidlc/spaces/default/intents/260914-catchu-october-mvp/';fd=r/base/'construction/u2-api/functional-design'
def records(v):
 if isinstance(v,dict):
  if 'id' in v and 'output' in v:yield v
  for x in v.values():yield from records(x)
 elif isinstance(v,list):
  for x in v:yield from records(x)
old={e['id']:e for e in records(json.loads((fd/'single-2026-10-13-processing-deadline-tools.json').read_text()))};new={e['id']:e for e in records(json.loads((fd/'single-2026-10-14-auth-contract-tools.json').read_text()))}
keys=['u2-entities-required-sections','u2-rules-required-sections','u2-functional-required-sections','u2-upstream-coverage','u2-traceability'];same={k:json.loads(old[k]['output'])==json.loads(new[k]['output']) for k in keys};trace=json.loads(new['u2-traceability']['output']);changed=[p for p,h in b['hashes'].items() if not (r/p).is_file() or hashlib.sha256((r/p).read_bytes()).hexdigest()!=h];boundaries=[]
for p in (r/base/'audit').glob('*.md'):
 for block in re.split(r'(?=^## )',p.read_text(),flags=re.M):
  if '**Workflow**: single-stage:contract-design' in block and ('**Event**: STAGE_STARTED' in block or '**Event**: STAGE_COMPLETED' in block):boundaries.append(block)
print(json.dumps({'sensor_results_equal_to_1013':same,'traceability_still_fail':not trace['pass'],'traceability_findings_count':trace['findings_count'],'traceability_missing_ids_equal':json.loads(old['u2-traceability']['output'])['missing_from_upstream_ids']==trace['missing_from_upstream_ids'],'changed_tracked':changed,'unexpected_tracked':[p for p in changed if not p.startswith(base+'audit/')],'state_unchanged':base+'aidlc-state.md' not in changed,'december_unchanged':not any(p.startswith('aidlc/spaces/default/intents/260925-intent-12/') for p in changed),'audit_prefixes_preserved':all((r/base/'audit'/p.name).read_bytes().startswith(p.read_bytes()) for p in tmp.glob('*.md')),'original_cursor_preserved':(r/'aidlc/spaces/default/intents/active-intent').read_text()==b['original_cursor'],'contract_single_start_count':sum('STAGE_STARTED' in x for x in boundaries),'contract_single_complete_count':sum('STAGE_COMPLETED' in x for x in boundaries)},ensure_ascii=False,indent=2))
PY
````

exit_code: 0

````text
{
  "sensor_results_equal_to_1013": {
    "u2-entities-required-sections": true,
    "u2-rules-required-sections": true,
    "u2-functional-required-sections": true,
    "u2-upstream-coverage": true,
    "u2-traceability": true
  },
  "traceability_still_fail": true,
  "traceability_findings_count": 23,
  "traceability_missing_ids_equal": true,
  "changed_tracked": [
    "aidlc/spaces/default/intents/260914-catchu-october-mvp/audit/macui-macbookpro-local-3cf6d8f9dcd7.md"
  ],
  "unexpected_tracked": [],
  "state_unchanged": true,
  "december_unchanged": true,
  "audit_prefixes_preserved": true,
  "original_cursor_preserved": true,
  "contract_single_start_count": 1,
  "contract_single_complete_count": 0
}
````

required-sections entities H2 4개·rules 3개·functional-spec 10개와 upstream-coverage 모두 PASS, findings 0. traceability는 FAIL 23건이며 missing_from_upstream_ids만 존재하고 gaps·orphans·invalid entries·invalid targets는 없다. 10/13의 결과·목록과 대조한다. 이 실패를 PASS로 바꾸지 않는다.

계약 YAML 4개·요약 3블록·ERD 1블록 파싱 PASS, $ref 234개 해석 PASS는 같은 보존 판본에 대한 앞 단계 검증이다. 인증 경로·필드·세션/쿠키/Origin·수명은 병합된 코드·결정과 문서로 대조했으며 서버·실제 브라우저·OAuth·DB·배포 동작 검증은 수행하지 않는다. linter·type-check는 이번 설계 변경 영역에 TS/JS 코드 생성/수정이 없어 해당 없음이다. 제품 검사는 해당 없음(코드 변경 없음).

## 보존 기준선

/private/tmp/catchu-auth-contract-20261014/baseline.json의 추적 파일 1,552개 SHA-256과 감사 원문 6개를 사용한다. 12월 36개·상태·기존 단독 질문/검증/도구·기존 리뷰·traceability는 보호 대상이다. 미커밋 감사 꼬리도 원문 앞부분에 포함한다. 보존 대조 결과와 10/13 센서 비교는 아래 추가한다.

## 요약 확인 요청 당시 상태

### u2-summary-decision

````text
aidlc engine log decision --stage functional-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-14-auth-contract-questions.md --decision 'Does this all look correct before I generate the artifact?' --options 'Looks correct,Request changes'
````

exit_code: 0

````text
{"emitted":"DECISION_RECORDED","stage":"functional-design"}
````

별도의 u2-api 요약 확인 요청을 등록했다. 답은 비워 두었고 팀장 응답을 기다린다.

u2-api의 별도 팀장 답을 기다린다. log answer·독립 검토 요청·완료 보고는 아직 실행하지 않았다. 예상 READY·완료를 실제 결과로 미리 기록하지 않는다.

## 센서 명령·원문

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


