## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-24T14:48:20Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md > C-08 publish-sequence 3~4단계, C-02 table-convention | 발행 트랜잭션이 만드는 상태 행은 `publication_index`(PENDING, deadline_at) 하나뿐이다. 그런데 4단계는 커밋 뒤 `BASE_SUMMARY` 작업도 등록한다. `base_summary`의 PENDING 행과 deadline_at을 누가 언제 만드는지 어디에도 없다. 등록이 실패(ENQUEUE_FAILED)하거나 작업이 유실되면 행이 없어 시한 판정(`readStatus`)을 할 수 없고, "등록 실패가 대기로 남지 않는다"는 C-02의 목적이 기본 요약에서는 지켜지지 않는다. C-12 `GET .../summary`의 PENDING/FAILED 응답도 근거 행이 없다. 늦게 온 결과를 버리는 부모 행 확인(late-result)도 마찬가지다. | `base_summary` PENDING 행(status·deadline_at)을 발행 트랜잭션 안에서 쓰는 주체를 정한다. 가장 단순한 안은 `chunkInTransaction`이 `publication_index`와 함께 쓰는 것이다. 또는 U5가 호출하는 `BaseSummaryWriter.initInTransaction` 같은 자리를 하나 더 둔다. `jd_summary_run` 행은 202를 돌려주기 전에 만든다는 것도 한 줄 적는다. | New |
| R-02 | Major | aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md > C-03, C-08 publish-sequence | C-03은 기본 요약 "생성"을 하루 실행 제한에 세고(FR6.6), 접수 때 `consume`한다고 적는다. 그런데 발행 순서 1~5단계에는 `consume` 호출이 없다. 발행이 기본 요약을 자동으로 시작하므로 이 첫 생성이 횟수에 드는지 안 드는지 읽는 사람마다 달라진다. 센다면 한도에 도달한 날 발행 자체가 429로 막히는지, 발행은 되고 요약만 생략되는지도 정해지지 않았다. U4(발행)와 U5(요약)가 서로 다르게 만들 수 있는 경계다. | 발행 때 자동 시작되는 기본 요약이 횟수에 드는지(발행 순서 1단계에 `consume(BASE_SUMMARY)`를 넣을지, 안 센다고 못 박을지)를 정한다. 센다면 한도 도달 때 발행 전체 거부(429 `DAILY_LIMIT_REACHED`)인지 요약만 FAILED로 두고 발행은 성공인지 한 줄로 정한다. 값(횟수)이 아니라 판정 자리만 정하면 된다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md > C-02 RunStatus, C-09 `getIndexState`, C-12 `/summary` | 실행 상태의 이름이 둘이다. C-02의 표 상태는 `PENDING \| DONE \| FAILED`이고 C-09의 `getIndexState`와 C-12 `/summary` 응답은 `PENDING \| READY \| FAILED`다. 둘 사이 변환(DONE→READY)이 적혀 있지 않아 U3·U5가 각자 이름을 고르면 컬럼 값과 응답 값이 어긋난다. | 표 컬럼은 DONE, 인터페이스·응답은 READY인지 한 줄로 변환 규칙을 적거나 한쪽으로 통일한다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md > C-12 `/jd-summaries` 401, C-11 `onAccessLost` | `/jd-summaries`의 401은 `AUTH_REQUIRED`와 `LINK_PASSWORD_REQUIRED` 두 코드가 같은 상태 번호를 쓴다. 그런데 C-11의 `onAccessLost`는 `LINK_*` 두 코드만 다루고, 슬롯 4에서 로그인 만료(`AUTH_REQUIRED`)가 오면 누가 처리하는지 없다. 10월 코드에는 두 코드가 모두 있어 모양은 맞지만 화면 쪽 처리 주체가 비어 있다. | `JdSummaryPanel`이 `AUTH_REQUIRED`를 받으면 로그인 안내로 바꾼다는 것(U7 몫)을 C-11 규칙에 한 줄 더한다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md > 공통 전제 첫 항목 | "분석·수신 계약은 U7이 바꾸는 부분(등록 때 관계 검사 없음·수집 상한)만 고친다"고 하지만 계약 표나 명세에 해당 항목이 없다. 어떤 10월 계약 파일의 어느 부분이 바뀌는지, 누가 어느 PR에서 고치는지 알 수 없다. U7 안 변경이라 경계 계약 범위 밖일 수 있어 막는 정도는 아니다. | U7 안에서만 쓰는 변경이면 "U7 기능 설계에서 정하고 10월 계약 파일은 그 PR에서 고친다"로 바꿔 적는다. worker와 맞닿는 수집 상한이면 C-16 옆에 계약 한 줄을 더한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (none listed for this stage) | n/a | 도구 없음. 10월 코드 대조로 대신했다. `api/src`에서 `LINK_UNAVAILABLE`, `LINK_PASSWORD_REQUIRED`, `LINK_PASSWORD_INVALID`, `LINK_UNLOCK_LIMITED`, `AUTH_REQUIRED`, `RATE_LIMITED`가 실제로 있음을 확인했다. 질문 횟수의 "Redis로 셀 수 없으면 통과·기록"은 domain-design/components.md와 일치한다. 요약이 10월 코드·상류 문서와 어긋나는 곳은 위 표 밖에서 찾지 못했다. |

### Summary

Q1 A의 경계 계약 범위를 지키고 있고, 계약 17건은 Unit 의존 문서의 계약 의존 표와 통합 지점을 빠짐없이 덮는다. 의존 그래프에 순환은 없고, 탈퇴 연쇄 삭제 표(FR14.9)와 90일 기간(OQ4)도 일관된다. 다만 기본 요약의 상태 행 생성 책임과 발행 때 하루 제한 적용 여부는 U4와 U5가 서로 다르게 구현할 수 있어 승인 전에 정해 두는 것이 좋다. 두 건 모두 한두 줄로 닫히는 수정이며 Major 2건이라 READY 기준 안이다.
