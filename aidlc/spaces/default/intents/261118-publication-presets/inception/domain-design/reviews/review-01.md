## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-19T12:18:31Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261118-publication-presets/inception/domain-design/components.md > SnapshotContract, RagAnswer, SharedLinkReader, Publications | 「앞선 사본 고르기」는 사본의 원본(종류 + 원본 ID)을 알아야 하는데, 그 값이 어느 경계로 흐르는지 적혀 있지 않다. 지금 `readSnapshot`이 돌려주는 `PublishedSnapshotItem`(`api/src/publications/published-snapshot.ts`)에는 `sourceId`가 없고, 이 응답을 받은 링크 열람(`recipient-access.service.ts`), 기본 요약(`summary-sources.ts`), MCP 읽기(`mcp-shared-publication-reader.ts`)가 함께 쓴다. 조각 나누기(`published-index-writer.ts`)가 읽는 열에도 `source_id`가 없다. 「원본 ID는 받은 사람 응답에 내보내지 않는다」는 제약과 겹쳐, 공용 사본 계약(C-07·C-10)을 넓히는 일이 되는데 ADR-002의 PR 먼저 리뷰 대상(받은 링크 읽기·JD 요약 담당)에도, 「앞 단계와 달라지는 곳」 표에도 없다. 「겹친 사본 표시 방법」을 기능 설계 몫으로만 남겨 둔 것으로는 이 계약 변경이 가려진다. | SnapshotContract에 「앞선 사본 고르기」의 입력(내부용 원본 식별값)과 그것을 실어 나르는 사본 읽기 계약 변경을 적고, 받은 사람에게 가는 응답에서는 그 값을 빼는 자리(응답 변환)를 구성 요소 하나에 지정한다. ADR-002·ADR-006의 Consequences에 이 계약 변경과 리뷰 대상을 더한다. | New |
| R-02 | Major | aidlc/spaces/default/intents/261118-publication-presets/inception/domain-design/traceability.json > US4.3, aidlc/spaces/default/intents/261118-publication-presets/inception/domain-design/components.md > 「이 작업이 건드리지만 구성 요소가 바뀌지 않는 곳」 | FR4.3(개인정보처리방침에 프리셋 저장 반영)과 US4.3을 실현하는 구성 요소가 없다. 방침 파일(`privacy-policy.md`·`.tsx`)은 「구성 요소가 바뀌지 않는 곳」 표에만 있고 주인이 없다. traceability의 US4.3 행은 `status: "Deferred"`에 target이 문장이라, 단계 규칙이 정한 `OK`+구성 요소/엔터티 이름 또는 `GAP` 형식이 아니다. 팀장 확정 문구를 기다리는 것과 어느 구성 요소가 반영하는지는 별개다. | 방침 화면·문서를 맡을 구성 요소(예: web `privacy` 기능을 PrivacyPolicy 구성 요소로 한 줄 추가)를 카탈로그에 더하고 US4.3 행을 그 이름의 `OK`로 쓴다. 문구 확정 대기는 Assumptions & Open Questions에 남긴다. 아니면 `GAP`으로 적고 이유를 따로 적는다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/domain-design/components.md > CatchLibrary behaviour, PresetItem 참조 | 「Catch를 지우는 경로는 지금처럼 없다」는 요구사항의 「Catch가 지워지는 길은 지금 탈퇴뿐」과 어긋나고, PresetItem→CatchAsset 외래 키의 삭제 규칙은 어디에도 적혀 있지 않다. `api/src/database/foreign-keys.ts`는 탈퇴가 NO ACTION에 막히지 않도록 부모를 따라 지우는 규칙만 허용하는데, 탈퇴 때 Catch가 지워지므로 이 칸이 연쇄 삭제가 아니면 탈퇴가 막힌다. | 문장을 「탈퇴 말고는 없다」로 바로잡고, PresetItem의 Catch 칸도 연쇄 삭제임을 ADR-004에 적는다(기능 설계가 이를 시험으로 묶는다). | New |
| R-04 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/domain-design/components.md > PresetLibrary·Publications behaviour | 발행 트랜잭션 안에서 프리셋 행을 읽어 「그 사이에 바뀌지 않게」 한다고 했지만 잠금 방식과 잠금 순서에서의 자리(지금은 Catch → 텍스트 자료 → PDF, `publish.service.ts` store())를 정하지 않았다. 프리셋 저장·지우기와 발행이 동시에 도는 경우의 결과가 열려 있다. | 프리셋 행을 맨 앞에서 잠그는지(순서 최상위)와 FOR SHARE 여부를 기능 설계 질문으로 올리거나 한 줄로 정한다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/261118-publication-presets/inception/domain-design/components.md > Publications behaviour | 같은 자료가 두 프리셋에 있을 때 지금의 `lockCatches`·`lockTextMaterials`·`lockPdfsForPublish`가 중복 ID 입력을 어떻게 다루는지, 사본 PDF 파일 복사가 프리셋마다 따로 일어나는지는 적혀 있지 않다(현재는 항목 한 번만 받는다고 가정한 코드, `publish-input.ts`·`pdf-publish.ts`). | 잠그는 ID는 중복을 없앤 집합이고 사본·PDF 복사는 프리셋마다 따로임을 한 줄로 적는다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| yaml 카탈로그 점검(직접 파싱) | 구성 요소 17개, 이름 중복 없음, depends_on과 dependents 대칭, 순환 없음 | 구조상 통과 |
| references.entity 점검 | 모든 참조가 선언된 엔터티와 owned_by에 맞음 | 통과 |
| 현재 코드 대조(`publish.service.ts`, `published-snapshot.ts`, `materials-view.tsx`, `api-exception.filter.ts`, `foreign-keys.ts`, `withdrawal.service.ts`) | 발행 자리·잠금 순서·`source_id`가 외래 키 없음·두 화면의 출처 이동·자료 화면 탭·오류 필터 허용 목록 설명이 모두 사실과 맞음 | 코드 주장은 정확. 비공개 Catch를 공개로 바꾸는 동작(`publish.service.ts` 253행)이 지금 있다는 점도 FR2.9와 맞음 |
| traceability.json 대조 | 이야기 21개 모두 행이 있음. US4.3만 `Deferred` | 위 Major 두 번째 항목 |

### Summary

경계(새 프리셋 모듈, 규칙 분리, 앞선 사본 고르기)는 순환 없이 닫히고 코드 주장도 정확하다. 다만 겹친 사본을 걸러내는 데 필요한 원본 식별값이 공용 사본 계약으로 어떻게 흐르는지, 그리고 방침 반영을 맡을 구성 요소가 비어 있다는 두 가지를 승인 전에 비교해 보라. 둘 다 Major이지만 개수 기준(2개 이하)과 Critical 없음으로 READY다.
