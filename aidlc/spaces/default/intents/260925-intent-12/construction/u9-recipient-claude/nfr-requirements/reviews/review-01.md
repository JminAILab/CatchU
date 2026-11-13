## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-09T06:20:46Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u9-recipient-claude/nfr-requirements/performance-requirements.md > NFR4.3 | 사본 크기를 "항목 20개, 텍스트 자료 본문 20,000자, PDF 50쪽"으로만 묶고 "PDF 쪽별 글 길이 상한은 없다"고 적었다. 그러나 `api/src/publications/publications-config.ts:28`에 발행본 전체 글 상한 `SNAPSHOT_TEXT_TOTAL_MAX = 60_000`(임시값)이 있고 `publish.service.ts:167-170`이 발행 트랜잭션에서 이를 검사한다. 이 상한은 쪽 수 × 사본 크기 비용의 실제 위쪽 경계인데 적히지 않았다. 지금 `snapshotTextLength`는 PDF 쪽 글을 세지 않는 것으로 보이며(U8 합류 뒤 달라질 수 있음), 그 경우 PDF 글은 이 상한 밖이다 | NFR4.3에 `SNAPSHOT_TEXT_TOTAL_MAX`(임시값)를 비용 경계로 적고, PDF 쪽 글이 이 합계에 드는지 U8 코드 합류 뒤 확인한다고 한 줄 남긴다 | New |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u9-recipient-claude/nfr-requirements/performance-requirements.md > NFR4.1 | 첫 조각 최소 진행이 40,000자를 넘기지 않는 근거로 "발행본 제목 50자, 텍스트 자료 제목 100자"만 든다. Catch 항목의 제목 길이 상한은 적히지 않았고(`snapshot-builder.ts`의 `title: string \| null`), 근거 줄(sourceUrl·판본)과 머리말도 항목 머리 칸에 들지 않는다. 이 상한이 막으려는 것은 최소 진행이 상한을 깨는 경우인데, 그 전제가 Catch 제목에 대해서는 확인되지 않았다 | Catch 제목의 상한 출처를 확인해 NFR4.1에 더하거나, 상한이 없다면 "고정 칸이 짧다"는 문장을 제목 길이 상한 확인 시험(S12·S13)으로 대신한다 | New |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u9-recipient-claude/nfr-requirements/scalability-requirements.md > NFR4.5 와 「알려진 한계」 | NFR4.5는 "넘으면 `RATE_LIMITED`이고 DB를 읽지 않는다"를 요구사항으로 쓰지만, 「알려진 한계」는 큐 주소가 없으면 빈도 제한이 꺼진다고 적는다. 이 도구는 쪽마다 사본 전체를 다시 읽고(NFR4.3) 개발 서버에서 큐 연결 전에는 한도가 전혀 없다. 한계로는 적혀 있으나 NFR4.5의 확인 방법이 켜진 경우만 다룬다 | NFR4.5의 확인에 "큐 연결이 있을 때"라는 조건을 적고, 큐가 꺼진 상태는 알려진 한계로만 두되 S23 개발 서버 확인 때 큐 연결 여부를 함께 적도록 한다 | New |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u9-recipient-claude/nfr-requirements/security-requirements.md > NFR2.2 | 남는 위험(작성자 글이 받은 사람의 비공개 자료 도구와 같은 대화에 놓임)의 수용을 "C-15 계약 PR에서 팀장에게 확인받는다"로 미룬다. 이 NFR 단계 승인 시점에는 수용 근거가 기능 설계 BR5.4(승인됨)뿐이고, 팀장 확인은 아직 일어나지 않았다. 확인 칸의 근거가 "계약 PR 리뷰 기록"인데 그 기록은 아직 없다 | 승인 전에 이 수용이 NFR 단계의 결정인지 계약 PR의 선행 조건인지 정해 두고, 팀장이 거부하면 되돌아갈 자리(도구 설명 문구 강화 또는 동의 문구 변경)를 한 줄 적는다 | New |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u9-recipient-claude/nfr-requirements/observability-requirements.md > NFR6.1 | 새 로그 사건 `mcp_link_denied`는 요구사항 NFR6(FR19 확인 표, 별도 관제 화면 없음)에 직접 근거가 없고 Q1 답변 B가 근거다. 담당이 명시적으로 고른 안이라 범위 위반은 아니지만, 거부는 중지·만료 같은 정상 결과이고 `LINK_UNAVAILABLE` 호출마다 warn 로그가 남는다. 토큰·링크는 싣지 않으므로 보안 문제는 없다 | 조치 불필요. 승인 때 이 사건이 S23 확인 증거 하나를 위한 것임을 알고 가면 된다 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (none listed in stage definition) | not run | 구조 점검은 직접 대조했다. NFR1~NFR7이 traceability.json에서 모두 다뤄진다(NFR3만 N/A, 이유 있음). NFR 행 ID는 파일 사이에 겹치지 않는다. 코드 대조: `DbPublicationAccess.resolveForRecipient`와 `readSnapshot`은 각각 읽기 전용 REPEATABLE READ 트랜잭션(`db-publication-access.ts:83-84,188-189`), `PublicationOwnerMissing`·`NotFound` 존재(`:45,144,167`), `PublicationsModule`은 `PUBLICATION_ACCESS`를 내보냄(`publications.module.ts:55`), `ClaudeMcpModule`은 아직 `PublicationsModule`을 가져오지 않음(변경 예정으로 적힘), `encodeCursor`·`decodeCursor`는 아직 내보내지 않음(`mcp-page.ts:45,50`, 내보내기 변경으로 적힘), U6 `INVALID_CURSOR`는 로그를 남기지 않음(`mcp-tools.ts:72`), `McpLogEntry`에 `mcp_link_denied` 없음(추가 예정), `MCP_PAGE_CHARS`·`MCP_CURSOR_MAX_LENGTH`·60회/분 상수 일치(`mcp-limits.ts`), `NoStoreInterceptor`·`Origin` 확인 존재(`mcp.controller.ts`). |

### Summary

U9 비기능 요구사항은 기능 설계(BR1~BR7)와 C-10·C-15에 맞고, 인용한 U6·U4 코드 사실도 대부분 확인된다. 요구사항 근거 없는 수치 목표나 운영 장치도 더하지 않았다. 남은 것은 사본 크기 경계(`SNAPSHOT_TEXT_TOTAL_MAX`)와 Catch 제목 상한이 적히지 않은 점, 큐가 꺼진 상태의 확인 조건, 위험 수용 확인 시점의 정리 정도이며 모두 구현을 막지 않는다.
