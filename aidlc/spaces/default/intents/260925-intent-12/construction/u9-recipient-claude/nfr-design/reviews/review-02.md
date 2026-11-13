## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-09T07:49:22Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u9-recipient-claude/nfr-design/performance-design.md > 쪽 만들기 > 조각 채우기, 비용 | 이분 탐색의 위 끝을 "남은 자리의 글자 수"로 잡으면서, 같은 절의 「비용」은 "한 번에 재는 것은 쪽 하나 크기"라고 적었다. 두 줄이 맞지 않는다. 남은 글이 수 MB인 PDF 쪽이면 앞쪽 탐색 후보가 수 MB이고, 그 후보 전체를 JSON.stringify한다. 호출마다 이 일이 log₂(남은 글자 수)번 반복되고 쪽마다 처음부터 다시 한다. 분당 60회 한도(scalability-design)는 큐 연결이 없는 개발 서버·EKS에서는 걸리지 않는다. 한 글자는 직렬화해도 한 글자 이상이므로 40,000자를 넘는 후보는 처음부터 볼 필요가 없다. | 탐색의 위 끝을 min(남은 글자 수, 쪽 상한에서 이미 찬 길이를 뺀 값)으로 바꾸고 「비용」 문장을 그에 맞게 고친다. 코드 생성이 이 상한을 쓰도록 시험(긴 PDF 한 쪽)도 둔다. | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u9-recipient-claude/nfr-design/scalability-design.md > 부담의 크기 / performance-design.md > 글로 펴기와 메모리 | 사본 크기가 두 경계("PDF 밖 글 60,000자, PDF 50쪽·20 MB")로 묶인다고 적었다. 20 MB는 파일 크기이고 추출한 글의 길이가 아니다. api 코드에 PDF 글 길이 상한은 없다(검색 결과: 상한 상수는 `MCP_PAGE_CHARS`와 `AI_INPUT_MAX_CHARS`뿐). 그래서 호출 하나의 메모리와 글로 펴는 일은 사실상 묶여 있지 않다. | 문서에서 "묶는다"를 "PDF 글은 길이 상한이 없다"로 바로잡아 받아들이는 위험으로 적는다. 가능하면 U8 담당에게 쪽별 또는 합계 글 길이 상한을 확인하고, 없으면 그 사실을 알려진 한계에 올린다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u9-recipient-claude/nfr-design/logical-components.md > U6 파일의 모양 변경(mcp-log.ts) / observability-design.md > 기록 항목 | `McpLogger` 인터페이스에 `log`를 필수 칸으로 더하면, 이 인터페이스를 받는 U6의 다른 쓰는 곳(`mcp-rate-limiter.ts`, `mcp.controller.ts`, `mcp-oauth.provider.ts`)과 시험용 기록 logger가 모두 새 모양을 따라야 한다. 문서는 시험용 logger를 고치지 않는다고 하지만 필수 칸이면 타입 검사 대상 코드에서 깨질 수 있다. | `log`를 선택 칸으로 두거나 `mcp_link_denied`를 보내는 쪽만 `log` 있는 별도 모양을 받게 한다. 코드 PR 완료 기준 "U6 기존 시험 무수정 통과"를 타입 검사까지 포함해 적는다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u9-recipient-claude/nfr-design/logical-components.md > U6 파일의 모양 변경 | 이 절은 `log`를 필수 칸으로 더해도 안전한 이유를 `.cjs` 시험이 타입 검사 밖이라는 것으로 댄다. 그런데 `.cjs` 시험이 넘기는 기록용 logger에 `log`가 없으면 `mcp_link_denied` 사건을 시험할 때 런타임에서 `logger.log is not a function`이 난다. 타입 검사로는 이것을 잡지 못한다. 이 절은 새 사건 시험이 이 logger에 `log`를 갖춰야 한다는 점을 적지 않았다. | 코드 생성 때 `mcp_link_denied` 시험(S9·S11 계열)이 쓰는 기록용 logger에 `log`가 있어야 한다는 한 줄을 이 절이나 관찰 설계에 더한다. 그러면 코드 PR 리뷰에서 확인할 수 있다. | New |

> R-01 Reviewer note: performance-design.md 「조각 채우기」가 탐색의 위 끝을 "남은 글 길이와 남은 자리 중 작은 값"으로 바꿨다. 남은 자리는 쪽 상한 40,000자에서 content를 비운 후보의 직렬화 길이를 뺀 값이다. 「비용」도 이에 맞게 고쳐져 두 줄이 맞는다. 긴 PDF 한 쪽 시험을 따로 더하지 않기로 한 선택은 받아들인다. 기능 명세 P7에 쪽별 글이 긴 PDF가 이미 있다.

> R-02 Reviewer note: performance-design.md 「글로 펴기와 메모리」와 scalability-design.md 「부담의 크기」·「알려진 한계」가 "PDF 글은 길이 상한이 없다"고 바로잡았고, 큐 연결이 없으면 막는 것이 없다는 점까지 알려진 한계로 적었다. U8 담당에게 따로 묻지 않기로 한 선택은 받아들인다.

> R-03 Reviewer note: logical-components.md 「U6 파일의 모양 변경」이 근거를 적었다. 확인한 사실이다. (1) `McpLogger`를 받는 U6 쓰는 곳 네 군데(`mcp-tools.ts`, `mcp.controller.ts`, `mcp-rate-limiter.ts`, `mcp-oauth.provider.ts`)는 모두 `createMcpLogger()`로 만든 logger를 쓴다. (2) `api/tsconfig.json`의 include는 `src/**/*.ts`뿐이다. (3) 시험은 `api/test/claude-mcp/*.test.cjs`라 타입 검사 밖이다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| aidlc engine sensor-traceability --stage nfr-design | pass: true, gaps/orphans/missing_from_table/invalid_entries/invalid_targets 모두 빈 값, findings_count 0 | 대응표에 끊긴 곳이 없다 |

### Summary

앞선 세 지적이 모두 문서와 코드 근거로 고쳐졌다. 열린 Critical과 Major는 없다. 남은 것은 새 사건 시험용 logger에 `log`를 갖춰야 한다는 Minor 한 건뿐이어서 승인을 막지 않는다.
