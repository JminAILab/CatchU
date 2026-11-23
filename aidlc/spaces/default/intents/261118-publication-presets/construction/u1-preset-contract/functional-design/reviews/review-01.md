## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-20T00:07:01Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/functional-design/rules.md > BR2.2, BR2.3, BR2.4 | 목록·상세·세기 경로에서 Catch의 「보호」 이유를 어떻게 정하는지, 보호 관측이 없거나 불완전한 경우와 분석 요청 불일치 경우를 어떻게 다루는지 적혀 있지 않다. 지금 코드(`api/src/publications/publish.service.ts` `assertCatchesEligible` 331~335행, 322행)는 이 경우를 `PublishIntegrityError`(500)로 던진다. 읽기 경로가 같은 함수를 그대로 쓰면 Catch 하나의 데이터 문제로 프리셋 목록 전체와 세기 호출이 500이 되고, 새로 짜면 이유가 null로 조용히 빠져 발행에서만 500이 난다 | BR2.2에 읽기 경로(목록·상세·세기)가 보호 관측이 없거나 불완전한 Catch, 요청 회원이 맞지 않는 Catch를 어떻게 보이는지(예: 500으로 둠 / 이유 없음으로 둠) 한 줄로 정하고 시험 항목에 넣는다 | New |
| R-02 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/functional-design/entities.md > PresetItem.position 와 rules.md > BR6.1 | entities.md는 position을 「1부터 빈틈없이」라 하고, BR6.1·functional-spec W7은 자료를 지운 뒤 position을 다시 매기지 않고 빈자리를 둔다고 한다. 두 문장이 서로 맞지 않는다(DB가 빈틈없음을 강제할 수도 없다) | entities.md를 「저장할 때 1부터 빈틈없이 매기고, 원본 삭제의 연쇄로 빈자리가 생길 수 있다. 읽을 때 position 순으로 본다」로 고친다 | New |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/functional-design/functional-spec.md > W5 4번, rules.md > BR4.5 | 받은 링크 열람 응답에서만 isFirstCopy를 뺀다고 했고, 작성자 상세 응답(`publication-manage.service.ts` 91~105행이 `readSnapshotIn` 결과를 그대로 `snapshot`으로 돌려줌)은 isFirstCopy를 싣는지 빼는지 정하지 않았다. 계약 P-3은 isFirstCopy를 「api 안 소비자만 본다」고 한다 | 작성자 상세 응답에서도 isFirstCopy를 뺀다고 적거나(권장), 싣는다면 계약 P-3과 다름을 적는다 | New |
| R-04 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/functional-design/rules.md > BR4.3, BR4.4 | isFirstCopy 값이 없는 사본을 요약 근거·머리글·받은 링크 읽기가 어떻게 읽는지 정해 두지 않았다. 지금 시험(`api/test/rag-answer`, `api/test/claude-mcp`, `api/test/jd` 등)은 isFirstCopy 없이 만든 사본 객체를 쓰므로 「참인 항목만」으로 구현하면 기존 시험이 빈 근거로 깨진다 | 칸을 필수로 하고 시험 사본을 함께 고친다고 적거나, 「없으면 참으로 본다」처럼 읽는 규칙을 정한다 | New |
| R-05 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/functional-design/rules.md > BR3.4, functional-spec.md > W4 5번 | 같은 PDF가 두 프리셋에 있으면 글자 수를 두 번 센다고 했으나, 지금 코드의 PDF 합계는 중복을 없앤 Map(`publish.service.ts` 232행 `lockedPdfs.values()`)으로 계산해 한 번만 센다. 텍스트 자료·Catch는 편 항목마다 세는데 PDF만 그대로 두면 어긋난다 | W4 5번에 「PDF 쪽 글 합계도 편 항목마다 더한다(잠금 Map을 그대로 합하지 않는다)」를 적고, 같은 PDF가 두 프리셋에 있는 발행의 상한 시험을 넣는다 | New |
| R-06 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/functional-design/rules.md > BR1.4, BR3.3, BR3.4 | 400 violations에서 `field` 값이 BR3.3(`presetIds[i]`)에만 있고, BR1.4(maxItems·arrayUnique·maxTotalLength)와 BR3.4(발행의 maxItems·maxTotalLength)에는 없다. 지금 코드는 `field: 'items'`(235행)였고 새 요청에는 `items` 칸이 없다. U2가 칸별 안내를 이 값에 기대므로 추측하게 된다 | BR1.4·BR3.4에 violations의 `field` 이름(예: `items`, `presetIds`)을 적는다 | New |
| R-07 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/functional-design/entities.md > ItemMeasure.title | title을 필수 text로 했으나 Catch의 title은 null일 수 있다(`snapshot-builder.ts` CatchSourceRow.title, 발행은 `UNTITLED_CATCH_TITLE`로 대체, `publish.service.ts` 221행). 프리셋·세기 응답이 null이거나 다른 대체 글을 쓰면 발행본 제목과 어긋난다 | ItemMeasure.title에 「Catch 제목이 없으면 발행과 같은 `UNTITLED_CATCH_TITLE`」을 적는다 | New |
| R-08 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/functional-design/rules.md > BR1.7 | 고치기는 프리셋 행을 잠그지 않고 항목을 모두 지운 뒤 다시 쓰는데, 같은 프리셋을 동시에 두 번 저장하면 둘째가 (presetId, position) 유일 제약에 걸려 500이 될 수 있고, 소유 확인 뒤 자료가 지워지면 외래 키 오류도 500이다. 동시 요청을 막지 않는다는 결정(BR1.3)은 51번째 프리셋에만 적혀 있다 | BR1.7에 프리셋 행을 `FOR UPDATE`로 잠그고 시작하는지, 아니면 동시 저장의 500을 받아들이는지 한 줄로 적는다 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (없음) | 이 단계의 정의와 호출문에 지정된 검증 도구가 없어 실행하지 않았다 | 대신 지금 코드(`publish.service.ts`, `pdf-publish.ts`, `snapshot-builder.ts`, `db-publication-access.ts`, `published-snapshot.ts`, `published-index-writer.ts`, `summary-sources.ts`, `qna-sources.ts`, `mcp-shared-*.ts`, `api-exception.filter.ts`, 발행 관련 마이그레이션)를 직접 읽어 설계 주장과 대조했다 |

### Summary

계약(P-1~P-6)과 규칙 BR1~BR7이 서로 맞고, 승인된 계약과 달라진 곳(Q1 세기 경로, Q3 트랜잭션 밖 읽기)은 앞 단계와 달라지는 곳 표에 밝혀 두었다. 발행 순서(PDF 확인과 복사가 트랜잭션 앞)와 연쇄 삭제, 조각·요약·받은 링크 읽기의 앞선 사본 규칙은 지금 코드와 어긋나지 않는다. 읽기 경로의 보호 관측 불완전 처리 한 가지가 정해지지 않았고 나머지는 문장 보강이라 READY다.
