## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-05T02:43:35Z
**Iteration:** 2
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/functional-design/entities.md > MaterialFile.bytes, functional-spec.md > 3. 시나리오 「실패 조건」, rules.md > BR5.6 | 한 파일 6,000 B 상한의 적용 범위가 문서마다 다르다. BR5.6과 MaterialFile.group 설명은 큰 후보에서만이라고 하는데, MaterialFile.bytes는 `max: 6000`을 무조건 건다. 시나리오의 실패 조건은 「한 파일이 6,000 B를 넘는다」를 조건 없이 적는다. 작은 후보(전체가 24,000 B 안)는 W3 3단계에서 상한 없이 담으므로, 12 KB짜리 파일 하나만 바뀐 작은 후보는 이 실패 조건에 걸린다. 「차지하는 양」을 무엇으로 재는지도 없다. 지금 `select`는 줄 조각 크기에 커밋·파일 머리글 크기를 더해 계산하는데, 줄 조각 합인지 머리글 포함인지 정해져 있지 않아 6,000 B 시험의 경계값이 구현마다 달라진다. 24,000 B ÷ 묶음 수(Q5 A로 상한 없음)가 머리글 한 벌보다 작아지는 경우에 첫 번째 채우기가 무엇을 담는지도 적혀 있지 않다. | 상한은 큰 후보에서만 적용한다고 entities.md의 `max: 6000`과 시나리오 실패 조건에 같은 말로 맞춘다. 「한 파일이 차지하는 양」을 한 가지로 정한다. 줄 조각 합만 잴지 머리글을 포함할지 고른다. 몫이 머리글 한 벌에 못 미치면 첫 번째 채우기는 아무것도 담지 못하고 두 번째 채우기가 받는다는 점을 BR5.6에 한 줄 적는다. 작은 후보와 큰 후보의 경계에서 파일이 갑자기 잘리는 점은 한계 절에 적는다. | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/functional-design/entities.md > Candidate.recordText, WorkFact; functional-spec.md > 6. 다른 Unit과의 접점 | 계약 C6·C7은 접점의 칸 이름과 모양을 CR1 기능 설계가 정한다고 했는데, 정한 모양이 실제 자료에 닿지 않는다. entities.md는 `RecordText`와 `WorkFact.line(KIND\|RECORD_TEXT)`를 말한다. 그러나 지금 후보 자료 `EligibleCandidate`(worker/app/processing/generation.py)는 `work_facts: tuple[str, ...]`뿐이고 기록의 글 칸이 없다. 그래서 줄 구분 표식은 담을 곳이 없다. Candidate.workFacts는 `list<string>`인데 WorkFact가 따로 있어 두 정의가 이어지지 않는다. CR3은 둘째 줄을 지워야 하는데 어떤 값으로 그 줄을 찾는지(위치인지, 표식인지)가 없다. 생성 단계가 `gather`에서 `group()`을 다시 불러 단위를 찾으므로 기록의 글을 후보에 실어 넘길지 그때 다시 계산할지도 열려 있다. `_merge_same_identity`가 첫 후보만 남기므로 합칠 때 어느 기록의 글이 남는지도 정해져야 한다. 계산하는 곳이 둘이면 W1(둘째 줄)과 W2(제목)의 부실·가리기 판단이 어긋날 수 있다. | 기록의 글을 한 번만 계산해 후보 자료의 한 칸(예: 기록의 글과 부실 여부)으로 싣는다고 정한다. 둘째 줄은 `work_facts`의 두 번째 항목이고 기록의 글이 있으며 부실이 아닐 때만 있다고 적는다. 그렇게 해서 CR3의 둘째 줄 지우기가 위치만으로 동작하게 하고 WorkFact 표식 열거는 쓰지 않거나 삭제한다. 같은 열쇠 후보를 합칠 때는 첫 후보의 기록의 글을 남긴다고 적는다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/functional-design/functional-spec.md > 7. 지금 코드와의 대응 (W1 가리기 검사) | 가리기 검사를 W1(후보 판정)에서 `app.generation.redact.mask_text`로 하라고 짝지었다. 지금 `app/candidates`는 `app/generation`을 불러오지 않는 순수 처리다. `candidates/build.py`가 `app.generation.redact`를 불러오면 `app/generation/__init__` → `flow` → `material`이 이어지고, `material.py`의 `from app.candidates import group, work_identity`가 아직 다 만들어지지 않은 `app.candidates`에서 이름을 찾지 못해 불러오기 순환이 날 수 있다. | `mask_text` 검사를 후보 판정이 부르지 않게 한다. 방법은 검사 결과(가림 여부)를 생성 단계에서 정하거나, 순수 함수 `mask_text`를 양쪽이 쓰는 모듈로 옮기는 것이다. 어느 쪽이든 설계에 한 줄 적는다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/functional-design/rules.md > BR4.4, entities.md > Candidate.groupingBasis, functional-spec.md > W1 4단계 | 지금 코드와 어긋난 설명이 있다. 다른 계정 문장은 `build.py`에서 `facts`(작업 사실)에만 들어가고 묶음 설명(`basis`)에는 없다. 그런데 groupingBasis에서 「다른 계정 문장이 빠진다」고 적었다. BR4.4는 다른 계정 커밋 여부를 「BR2.1의 판단에만 쓴다」고 하는데, 이 값(`GroupedUnit.other_authors`)은 `generation/material.py`와 `title.py`의 `_chain`(조각 제목 전후 비교)도 쓴다. 문장만 지우는 대신 값까지 지우면 조각 제목이 달라진다. | 지우는 것은 작업 사실의 문장이고, `other_authors` 값과 그 소비자는 남긴다고 BR4.4와 W1에 적는다. groupingBasis·W1 4단계에서 「다른 계정 문장」 언급을 빼 사실에 맞춘다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/functional-design/rules.md > BR4.5 | 같은 열쇠 후보를 합칠 때 「줄 순서를 지키고 같은 줄은 한 번만 둔다」고 했다. 지금 `_merge_same_identity`는 두 후보의 `work_facts`를 이어 붙인 뒤 중복만 지우므로, 첫 줄이 서로 다르면 3~4줄이 된다. 같은 열쇠면 같은 단위라 거의 없지만, 같은 단위에 대응하는 단위가 여럿(`gather`의 `matched` 목록)인 경우의 규칙이 없다. 「작업 사실은 최대 2줄」이라는 규칙과 어긋날 수 있다. | 합칠 때 첫 후보의 작업 사실을 그대로 남기고 둘째 후보의 줄은 더하지 않는다고 적는다. 시험으로 2줄 초과를 확인한다. | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/functional-design/functional-spec.md > 7. 지금 코드와의 대응 (함께 고칠 문서) | 함께 고칠 곳의 목록이 빠졌다. `worker/docs/candidate-checks.md`(나누기·다른 계정 문장 시험 설명, 19·21·32·43행), `worker/docs/relation-collection.md` 103행(「이슈 번호는 필수 조회의 나누기 신호에만 쓴다」, 35,793 B로 상한에 가까움), `web/src/features/recipient/README.md`·`assets/README.md`(10/8 안내 문장), 문구를 단정하는 시험(`web/test/assets-view.test.mjs`, `web/test/recipient.test.mjs`, `worker/tests/candidate_scenarios.py`, `test_candidate_grouping.py`, `test_generation_material.py`)이다. 같은 파일에서 `candidate-text.md`의 첫 항목 문장·후보 순서 항목도 바뀐다. | 목록에 위 문서와 시험 파일을 더하고, 지우는 쪽(나누기 코드·`NOT_SPLIT_*` 한계·`parts`·경로 허용 목록)을 삭제할지 남길지도 한 줄 정한다. | Resolved (reviewer) |
| R-07 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/functional-design/rules.md > BR6.3, functional-spec.md > W4 3단계 | FR8.4와 AC4.3.1은 구직자 「상세」의 안내 한 낱말만 고친다고 했다. BR6.3은 같은 컴포넌트(`GeneratedContentNotice`)를 쓰는 목록 안내도 함께 바꾼다. 목록은 요구사항 문장 밖이고 시나리오 S15도 상세만 본다. | 목록에도 바뀐다는 점을 결정 기록에 분명히 하거나(같은 컴포넌트라 갈라 쓰기 어렵다는 이유), 목록은 그대로 두도록 BR6.3을 좁힌다. 시나리오 S15에 목록을 넣는다. | Resolved (reviewer) |
| R-08 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/functional-design/rules.md > BR3.3, functional-spec.md > W2 | 기록의 글이 제목으로 정해진 후보에도 지금 흐름은 조각 제목을 고쳐 쓰는 호출(`_rewrite_title`)을 시도한다. 그 결과는 쓰이지 않는데 호출 예산·시간을 쓴다. 운영 로그의 `titleOnlyNull`·`titlesRewritten` 집계가 무엇을 세는지도 바뀐다. | 기록의 글이 제목이면 고쳐 쓰기를 건너뛰고, `titleOnlyNull`은 최종 제목이 null인 경우만 센다고 적는다. | Resolved (reviewer) |
| R-09 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/functional-design/rules.md > BR4.1, BR2.2 | AC2.2.1은 첫 줄을 세 가지 꼴로 제한하는데 BR4.1은 PR 조회가 허용되지 않은 요청에서 「병합 없이 들어간 본인 커밋」을 쓴다(사실에는 맞는다). 이 예외가 AC와 어긋난다고 적혀 있지 않다. BR2.2는 「본인 기여 커밋」이라 같은 변경으로 다른 곳에서 배정받은 커밋도 포함될 수 있는데, FR5.1과 AC2.1.2는 「단위 안 본인 커밋」이라고 한다. | 두 곳 모두 한 줄로 의도를 밝힌다. 기록의 글 고르기를 단위 안 커밋에 한정할지 정하고, 한정하지 않으면 이유를 적는다. | Resolved (reviewer) |
| R-10 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr1-readable-catch/functional-design/functional-spec.md > 3. 시나리오 | 시나리오가 갈래 일부만 덮는다. 다른 계정이 연 PR, 다른 계정 커밋이 섞인 PR, 병합만 있는 단위(본인 일반 커밋 없음), 첫 줄이 빈 커밋, 병합 단위·커밋 묶음의 첫 줄, 계층 이름 폴더(BR5.4)와 시험 붙이기(BR5.5), 같은 열쇠 후보 합치기에 기대 결과가 없다. S13의 「2줄 말줄임」은 문자열 렌더링 시험으로는 확인되지 않는다(CSS). | 위 갈래를 시나리오에 더한다. S13은 어떤 방법으로 확인할지(클래스 단언과 화면 확인)를 적는다. | Resolved (reviewer) |

> R-01 Reviewer note: 6,000 B 상한이 큰 후보에만 적용된다는 말이 BR5.6, entities.md의 MaterialFile.bytes, 시나리오 실패 조건, S27에서 같다. 양은 머리글을 포함한 직렬화 UTF-8 바이트로 정했다. 몫이 머리글보다 작으면 첫 채우기는 비고 두 번째 채우기가 받는다(S26). 작은·큰 후보 경계는 한계 절에 있다.

> R-02 Reviewer note: 기록의 글을 후보 자료의 한 칸(종류·글·부실)으로 한 번만 계산해 싣는다(BR2.7, entities.md Candidate.recordText). 둘째 줄은 work_facts의 두 번째 항목이라 CR3이 위치로 지운다. WorkFact 표식 열거는 없어졌다. 합칠 때 첫 후보의 기록의 글이 남는다.

> R-03 Reviewer note: mask_text를 후보 판정과 생성이 함께 쓰는 모듈로 옮긴다고 BR2.4와 명세 7절에 적었다. 불러오기 순환 이유도 있다.

> R-04 Reviewer note: BR4.4가 작업 사실의 문장만 지우고 other_authors 값과 소비자(BR2.1, 재료·조각 제목)는 둔다고 적었다. groupingBasis에서도 다른 계정 문장 언급이 빠졌다. 현재 코드 `_other_authors_fact`(build.py)·`material.py`와 맞다.

> R-05 Reviewer note: BR4.5와 S28이 합칠 때 첫 후보의 작업 사실(최대 2줄)과 기록의 글을 남긴다고 정한다.

> R-06 Reviewer note: 명세 7절에 candidate-checks.md, relation-collection.md(늘리지 않음), 두 README, 두 web 시험, worker 시험 목록이 있다. 나누기 코드와 한계 문장은 삭제로 정했다(BR7.2).

> R-07 Reviewer note: W4 3단계와 BR6.3에 목록도 바뀌는 이유(같은 안내 컴포넌트)를 적었고 S15에 목록을 넣었다.

> R-08 Reviewer note: 기록의 글이 제목이면 조각 제목 고쳐 쓰기 호출을 건너뛰고(W2 4단계, BR3.3) 「제목만 없음」은 최종 제목이 없는 경우만 센다. S16이 확인한다.

> R-09 Reviewer note: 한계 절과 BR4.1에 PR 조회 불허 요청의 첫 줄 예외를 적었다. 기록의 글은 단위 안 본인 커밋에서만 고른다(BR2.2, S29).

> R-10 Reviewer note: S19~S29가 빠졌던 갈래(다른 계정 PR, 섞인 PR, 병합뿐, 빈 첫 줄, 병합·묶음 첫 줄, 계층 이름, 시험 붙이기, 합치기)를 더한다. S13은 클래스 단언과 화면 확인으로 나눴다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| traceability.json 대조 | PASS | 인수 기준 21개가 BR에 대응한다. 새 BR(BR2.7, BR4.4~4.6, BR7.2)과 어긋난 대상이 없다. |
| 코드 대조 (build.py, grouping.py, material.py의 other_authors) | 일치 | 값과 소비자를 남긴다는 BR4.4가 현재 코드와 맞다. |

### Summary

팀장이 정한 R-01~R-10의 수정이 명세·규칙·엔티티 세 문서에 서로 어긋남 없이 반영됐다. 새로 생긴 문제가 없어 구현을 시작할 수 있다.
