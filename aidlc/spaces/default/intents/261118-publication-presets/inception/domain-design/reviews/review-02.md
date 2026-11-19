## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-19T12:28:42Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261118-publication-presets/inception/domain-design/components.md > SnapshotContract, RagAnswer, SharedLinkReader, Publications | 「앞선 사본 고르기」는 사본의 원본(종류 + 원본 ID)을 알아야 하는데, 그 값이 어느 경계로 흐르는지 적혀 있지 않다. 지금 `readSnapshot`이 돌려주는 `PublishedSnapshotItem`(`api/src/publications/published-snapshot.ts`)에는 `sourceId`가 없고, 이 응답을 받은 링크 열람(`recipient-access.service.ts`), 기본 요약(`summary-sources.ts`), MCP 읽기(`mcp-shared-publication-reader.ts`)가 함께 쓴다. 조각 나누기(`published-index-writer.ts`)가 읽는 열에도 `source_id`가 없다. 「원본 ID는 받은 사람 응답에 내보내지 않는다」는 제약과 겹쳐, 공용 사본 계약(C-07·C-10)을 넓히는 일이 되는데 ADR-002의 PR 먼저 리뷰 대상(받은 링크 읽기·JD 요약 담당)에도, 「앞 단계와 달라지는 곳」 표에도 없다. 「겹친 사본 표시 방법」을 기능 설계 몫으로만 남겨 둔 것으로는 이 계약 변경이 가려진다. | SnapshotContract에 「앞선 사본 고르기」의 입력(내부용 원본 식별값)과 그것을 실어 나르는 사본 읽기 계약 변경을 적고, 받은 사람에게 가는 응답에서는 그 값을 빼는 자리(응답 변환)를 구성 요소 하나에 지정한다. ADR-002·ADR-006의 Consequences에 이 계약 변경과 리뷰 대상을 더한다. | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/261118-publication-presets/inception/domain-design/traceability.json > US4.3, aidlc/spaces/default/intents/261118-publication-presets/inception/domain-design/components.md > 「이 작업이 건드리지만 구성 요소가 바뀌지 않는 곳」 | FR4.3(개인정보처리방침에 프리셋 저장 반영)과 US4.3을 실현하는 구성 요소가 없다. 방침 파일(`privacy-policy.md`·`.tsx`)은 「구성 요소가 바뀌지 않는 곳」 표에만 있고 주인이 없다. traceability의 US4.3 행은 `status: "Deferred"`에 target이 문장이라, 단계 규칙이 정한 `OK`+구성 요소/엔터티 이름 또는 `GAP` 형식이 아니다. 팀장 확정 문구를 기다리는 것과 어느 구성 요소가 반영하는지는 별개다. | 방침 화면·문서를 맡을 구성 요소(예: web `privacy` 기능을 PrivacyPolicy 구성 요소로 한 줄 추가)를 카탈로그에 더하고 US4.3 행을 그 이름의 `OK`로 쓴다. 문구 확정 대기는 Assumptions & Open Questions에 남긴다. 아니면 `GAP`으로 적고 이유를 따로 적는다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/domain-design/components.md > CatchLibrary behaviour, PresetItem 참조 | 「Catch를 지우는 경로는 지금처럼 없다」는 요구사항의 「Catch가 지워지는 길은 지금 탈퇴뿐」과 어긋나고, PresetItem→CatchAsset 외래 키의 삭제 규칙은 어디에도 적혀 있지 않다. `api/src/database/foreign-keys.ts`는 탈퇴가 NO ACTION에 막히지 않도록 부모를 따라 지우는 규칙만 허용하는데, 탈퇴 때 Catch가 지워지므로 이 칸이 연쇄 삭제가 아니면 탈퇴가 막힌다. | 문장을 「탈퇴 말고는 없다」로 바로잡고, PresetItem의 Catch 칸도 연쇄 삭제임을 ADR-004에 적는다(기능 설계가 이를 시험으로 묶는다). | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/domain-design/components.md > PresetLibrary·Publications behaviour | 발행 트랜잭션 안에서 프리셋 행을 읽어 「그 사이에 바뀌지 않게」 한다고 했지만 잠금 방식과 잠금 순서에서의 자리(지금은 Catch → 텍스트 자료 → PDF, `publish.service.ts` store())를 정하지 않았다. 프리셋 저장·지우기와 발행이 동시에 도는 경우의 결과가 열려 있다. | 프리셋 행을 맨 앞에서 잠그는지(순서 최상위)와 FOR SHARE 여부를 기능 설계 질문으로 올리거나 한 줄로 정한다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/domain-design/components.md > Publications behaviour | 같은 자료가 두 프리셋에 있을 때 지금의 `lockCatches`·`lockTextMaterials`·`lockPdfsForPublish`가 중복 ID 입력을 어떻게 다루는지, 사본 PDF 파일 복사가 프리셋마다 따로 일어나는지는 적혀 있지 않다(현재는 항목 한 번만 받는다고 가정한 코드, `publish-input.ts`·`pdf-publish.ts`). | 잠그는 ID는 중복을 없앤 집합이고 사본·PDF 복사는 프리셋마다 따로임을 한 줄로 적는다. | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/domain-design/components.md > RagAnswer behaviour, 그리고 decisions.md > ADR-007 Consequences | 「질의응답은 조각 검색을 쓰므로 코드가 바뀌지 않는다」고 적었으나, 질의응답 머리글을 만드는 `rag-answer/qna-sources.ts`의 `buildItemContexts`는 사본의 모든 항목을 position 순으로 훑어 표 글자를 매기고, 둘째 줄(workFacts[1])이 같은 Catch 수를 센다. 같은 Catch가 두 프리셋에 있으면 둘째 사본이 이 센 값에 들어가 앞선 사본에도 표 글자가 붙고, 표 글자가 건너뛴다. 외부 AI로 보내는 머리글이 지금과 달라질 수 있어 ADR-007의 「머리글은 그대로」와 어긋난다. 조각 검색 결과는 앞선 사본만 가리키므로 오답은 아니다. | 머리글 만들기가 「앞선 사본인가」가 참인 항목만 쓰는지, 모든 항목을 쓰는지 정해 RagAnswer 설명과 ADR-007에 적는다. 모든 항목을 쓴다면 달라지는 머리글이 외부 AI 절·개인정보처리방침에 영향이 없다는 점을 적고, 기능 설계에서 시험으로 묶는다. | New |

> R-01 Reviewer note: SnapshotContract가 사본을 읽을 때 항목마다 「앞선 사본인가」 값을 계산하고, 원본 ID는 사본에 싣지 않는다. 요약 근거와 받은 링크 읽기는 이 값만 보고, 조각 나누기(PublishedIndex)는 source_id를 더 읽어 같은 함수를 부른다. Publications가 받은 사람 응답에서 값을 뺀다. 계약 넓힘이 ADR-002·006의 PR 리뷰 대상에 적혔다. 현재 코드(`db-publication-access.ts` readSnapshotIn)가 item_kind까지만 읽고 있어 source_id를 더하는 자리가 확인되며, published_item에 (종류, 원본 ID) 유일 조건이 없어 겹친 사본 저장도 막히지 않는다. 값의 칸 이름과 빼는 코드 위치는 기능 설계 질문에 올라 있다.

> R-02 Reviewer note: PrivacyPolicy 구성 요소가 카탈로그·요약표·그림·근거 표에 들어갔고, traceability.json의 US4.3이 PrivacyPolicy를 가리키는 OK로 바뀌었다. 확정 문구는 팀장 몫으로 남겼다.

> R-03 Reviewer note: ADR-004와 CatchLibrary·PresetItem 항목 표에 「Catch를 지우는 경로는 탈퇴 말고는 없고 Catch 칸도 연쇄 삭제」가 적혔다.

> R-04 Reviewer note: 프리셋 행 잠금 방식과 순서, 프리셋 저장·지우기와 발행이 함께 돌 때의 결과가 기능 설계 질문(Assumptions & Open Questions)으로 올라갔다.

> R-05 Reviewer note: ADR-002와 Publications에 잠금 원본 ID 중복 제거, 사본·PDF 사본 파일은 프리셋(항목)마다, 글자 수는 사본마다 더한다고 한 줄로 적혔다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 정의된 검증 도구 | 실행하지 않음(이 검토는 단일 자문 검토이고 지시에 도구 실행이 없었음) | 대신 현재 코드(`api/src/publications/db-publication-access.ts`, `publication.entity.ts`, `rag-answer/qna-sources.ts`)와 대조해 R-01 흐름과 위 새 발견을 확인했다. 구성 요소 의존 고리는 문서의 의존 목록에서 찾지 못했다(PresetLibrary → PublishableSource → CatchLibrary·MaterialLibrary, Publications → 넷, PublishedIndex·RagAnswer·SharedLinkReader → SnapshotContract, 모두 한 방향). |

### Summary

이전 라운드의 다섯 발견은 모두 고쳐졌다. 특히 「앞선 사본인가」 값의 흐름과 받은 사람 응답에서 빼는 자리, 계약 넓힘의 PR 리뷰 대상 등재가 분명하다. 남은 것은 질의응답 머리글 만들기가 겹친 사본을 어떻게 다루는지 적히지 않은 Minor 하나뿐이라 설계를 구현 가능한 상태로 본다.
