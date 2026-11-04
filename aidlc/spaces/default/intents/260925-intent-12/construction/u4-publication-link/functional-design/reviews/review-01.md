## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-27T08:58:57Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/functional-design/rules.md > BR6.3 (비밀번호 통과) | BR6.3의 logic은 "비밀번호 틀림 → 401"을 "시도 제한 초과 → 429"보다 먼저 적는다. 그대로 따르면 차단 중인 주소·링크도 비밀번호를 확인하게 되어 시도 제한이 무력해진다. 10월 `link-access.service.ts`의 `unlock`은 링크 판정(404) → 본문 검사 → 차단·빈도 검사(429) → 비밀번호 확인(401/200) → 해시 직전 재확인 순이다. 또 10월은 비밀번호가 없는 링크에 unlock을 부르면 400 `INVALID_REQUEST`를 돌려주는데 BR6.3과 spec의 C-12 설명에는 이 경우가 없다. "10월 시도 제한을 그대로 쓴다"는 문장만 있고 순서는 반대로 적혀 있어 구현자가 어느 쪽을 따를지 갈린다. | BR6.3 logic을 10월 순서로 고친다. 링크 판정(404) → 비밀번호 없는 링크(10월 400 유지 또는 제외 사유 기록) → 차단·빈도(429) → 비밀번호 확인(401) → 맞으면 grant(만료는 링크 만료를 넘지 않음). 순서를 바꿀 뜻이 아니라면 "10월 `link-access.service.ts`의 unlock 순서 그대로"라고 못 박는다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/functional-design/functional-spec.md > Assumptions & Open Questions 머리말 | "아래는 모두 담당 확인 필요이며 합의 전에는 해당 부분을 구현하지 않는다"고 적었지만 OQ-U4-2(발행 빈도 1분 10회, BR4.8)와 OQ-U4-4(전체 글 60,000자, BR4.5)는 임시값으로 구현하는 항목이다. 구현하지 않는 항목은 OQ-U4-5(C-09 getIndexState, BR8.7)뿐이고 OQ-U4-3(share_link 정리)은 "건드리지 않음", OQ-U4-1·6은 절차·일정이다. 결정된 설계와 미결 항목의 경계가 문장과 표에서 어긋난다. | 머리말을 항목별로 나눠 다시 쓴다. "임시값으로 구현하고 합의 뒤 조정"(OQ-U4-2·4), "합의 전 구현하지 않음"(OQ-U4-5), "건드리지 않음"(OQ-U4-3), "절차·일정"(OQ-U4-1·6)처럼 처리 방식을 표의 한 칸으로 분리한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/functional-design/functional-spec.md > 작성자 API 표, 첫 AI-DLC 제출 범위 표 | `GET /publications`·`GET /publications/{id}`의 응답에 `indexState`가 필수 칸처럼 들어 있고 `POST .../reindex`도 있지만, C-09 getIndexState는 소비자 합의 전에는 구현하지 않는다고 했다(Q9). 합의가 늦어질 때 응답 모양이 어떻게 되는지(칸 생략, null, 고정값) 정해져 있지 않아 Unit 완료와 BR8.7 보류가 충돌한다. | 합의 전 상태의 응답 모양을 한 줄로 정한다(예: `indexState` 칸을 응답에서 빼고 reindex 경로도 만들지 않음). 합의 뒤 더하는 변경이 소비자(web)에 영향이 없다는 것도 적는다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/functional-design/entities.md > PublishedItem.snapshot, PublishedItem.position, PublishedItem.itemKind | C-07은 `snapshot jsonb`, `position CHECK (position >= 1)`, `item_kind varchar CHECK IN (...)`인데 entities.md는 `snapshot`을 `json`, `position`을 min 1 max 20, `item_kind`를 `enum`으로 적었다. 구현자가 Postgres `json`/native enum/위치 상한 CHECK를 만들면 계약 표와 달라질 수 있다. 계약 문서는 U4가 고치지 않는 규칙이다(Contract ownership rules). | 해당 칸을 계약 표기(`jsonb`, `varchar + CHECK IN`, `CHECK (position >= 1)`)로 맞추고, 20개 상한은 "API 검증이며 DB CHECK 아님"이라고 명시한다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/functional-design/functional-spec.md > W3 5단계, rules.md > BR5.1 | 발행 트랜잭션에서 고른 여러 원본을 "잠그고 다시 읽는다"고 하지만 잠그는 순서가 없다. 같은 Catch를 두 발행 요청이 서로 다른 순서로 고르면 교착이 생길 수 있고, 이 경우 오류가 500으로 보일 수 있다. 같은 회원이 동시에 두 번 발행하는 경우는 에러 대응 최소선 6의 범위라 허용되지만, 교착은 한 요청 실패로 이어진다. | 잠금 순서를 정한다(예: Catch를 `catch_id` 오름차순, 그다음 텍스트 자료를 `text_material_id` 오름차순). | New |
| R-06 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/functional-design/functional-spec.md > 첫 AI-DLC 제출 범위 (C-10 행) 및 작성자 API 표 `PUT /publications/{id}/stop` | (1) 첫 제출 범위가 C-10 인터페이스와 가짜만 포함하고 C-11 `RecipientSlotProps`·작성자 모드 props·C-12 경로 규칙은 뺐다. U5·U10이 붙는 자리 모양을 이 문서와 계약 글에서만 알 수 있어 타입으로 먼저 개발하기 어렵다. (2) 만료된 링크에 중지를 부르면 BR8.2는 쓰지 않는다고 하지만 응답 `{ state, stoppedAt }`의 값(EXPIRED와 null)은 정해져 있지 않다. | (1) 첫 제출에 `RecipientSlotProps`·`showEvidence` 타입 정의만 더할지 팀장과 정하거나, 제외 사유를 한 줄로 남긴다. (2) EXPIRED 중지 요청의 응답(200 `{state: EXPIRED, stoppedAt: null}` 등)을 정한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (none listed by stage) | Not run | 실행할 검증 도구가 정해져 있지 않다. 대신 stories.md의 U4 대응 수용 기준(AC1.4, 2.1, 2.2, 2.3, 3.1, 4.1, 4.3, 4.4, 5.1, 5.2) 44개가 traceability.json의 upstream_ids·coverage에 모두 있고, 모든 target BR 번호가 rules.md에 있음을 직접 대조했다. AC4.2.x는 story map상 U5 소관이라 빠진 것이 맞다. 정방향·역방향 모두 빠지거나 남는 항목은 없었다. |

### Summary

C-07·C-13·C-14의 표·칸·제약과 C-08 publish-sequence(동의 → 트랜잭션: consume → 쓰기 → 공개 전환 → chunkInTransaction → 커밋 → 작업 등록 두 건), C-10 판정 순서, C-12 오류 코드는 계약과 맞고 담당 확인 항목도 대체로 분리되어 있어 설계 전체는 구현 가능하다. 승인 전에 BR6.3의 unlock 판정 순서(10월 코드와 반대로 적힘)를 바로잡고, 미결 항목 머리말·`indexState` 보류 시 응답 모양·entities의 자료형 표기를 정리하길 권한다.
