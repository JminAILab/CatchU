## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-20T00:36:02Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/nfr-requirements/security-requirements.md > NFR2.1 | 「지금 회원 경로와 같은 인증(Bearer Access 토큰)과 CSRF 검사」라고 적었다. 지금 코드에서 Origin 검사(`assertSessionOrigin`)는 쿠키를 쓰는 세션 경로(`auth/session.controller.ts`)에만 있고, 발행 컨트롤러(`publications.controller.ts`) 같은 Bearer 회원 경로에는 CSRF 검사가 없다. 코드 생성이 이 문장대로 새 검사를 만들거나 시험 항목을 찾지 못해 헤맨다 | 「Bearer Access 토큰 인증만, 지금 발행 경로와 같음(쿠키 세션 경로의 Origin 검사는 해당 없음)」으로 고친다 | New |
| R-02 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/nfr-requirements/security-requirements.md > NFR4.2, tech-stack-decisions.md | 「오류 필터는 UUID와 정해진 kind 값만 옮긴다」고 하나, 지금 `api/src/common/errors/api-exception.filter.ts` `withDetails`는 `violations`·`existingRequestId`·`catchIds`(UUID만)만 복사하고 `blockedSources`는 버린다. 필터를 넓혀야 한다는 일이 어느 문서에도 없어, 막힘 응답의 details가 조용히 비어 나갈 수 있다 | NFR4.2에 「`withDetails`에 `blockedSources`(프리셋 ID UUID와 정해진 kind·UUID 항목만)를 더하고 그 외 값은 버린다」를 적고, 확인 방법에 필터 단위 시험(정의 밖 칸·UUID 아닌 값이 버려짐)을 넣는다 | New |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u1-preset-contract/nfr-requirements/reliability-requirements.md > NFR2.10 | 목록·상세·세기가 발행과 같은 판정을 쓰되 읽기 경로에서 「확인 필요」 409 이유와 500(기록 문제)이 한 Catch 집합에 함께 있을 때 어느 쪽이 먼저인지 적혀 있지 않다. 발행은 확인 판정을 보호 판정보다 먼저 하고 확인 안 된 Catch가 있으면 같은 집합의 기록 문제 Catch는 보기 전에 끝난다(`publish.service.ts` `assertCatchesEligible`). 읽기 경로는 항목마다 이유를 내므로 순서가 응답을 바꾼다 | NFR2.10에 「읽기 경로는 항목마다 이유를 정하되, 한 Catch라도 기록 문제면 요청 전체 500」이라고 순서를 한 줄로 적는다. 사람 결정(500 유지)은 바꾸지 않는다 | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 현재 코드 대조(`publish.service.ts` `assertCatchesEligible`, `owner-catch-response.ts` 무결성 검사, `api-exception.filter.ts`, `publications-log.ts`, `pdf-material-input.ts`) | 사람 결정의 근거(본인 Catch 목록의 500, 발행의 500, PDF 20벌, 로그 칸)는 코드와 일치. NFR2.1의 CSRF 문장과 NFR4.2의 필터 범위는 코드와 어긋남 | 위 Minor 두 건. 안전·동작을 깨는 결함은 아님 |
| 상류 대조(review-01 R-02~R-08, rules.md BR1.3·BR3.7, traceability.json NFR1~NFR6) | R-02~R-08이 reliability-requirements.md 표에 빠짐없이 옮겨졌고 NFR1~NFR6 추적이 모두 닫힘. position의 (presetId, position) 유일 제약이 NFR2.9의 동시 저장 설명을 받쳐 줌 | 문제 없음 |

### Summary

NFR 문서는 남의 자료 노출을 막는 소유 확인(NFR2.2~NFR2.5)과 로그·응답 보호(NFR4.x), 조회 수 일정 목표, R-02~R-08 반영까지 상류와 현재 코드에 맞게 닫혀 있다. 남은 것은 NFR2.1의 CSRF 문장, NFR4.2의 오류 필터 확장 누락, NFR2.10의 이유 순서 세 가지 Minor뿐이라 코드 생성이 잘못되거나 안전하지 않게 갈 결함은 없어 READY로 본다.
