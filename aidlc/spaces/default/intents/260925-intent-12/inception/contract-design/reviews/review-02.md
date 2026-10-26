## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-24T15:44:22Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md > C-08 publish-sequence 3~4단계, C-02 table-convention | 발행 트랜잭션이 만드는 상태 행은 `publication_index`(PENDING, deadline_at) 하나뿐이다. 그런데 4단계는 커밋 뒤 `BASE_SUMMARY` 작업도 등록한다. `base_summary`의 PENDING 행과 deadline_at을 누가 언제 만드는지 어디에도 없다. 등록이 실패(ENQUEUE_FAILED)하거나 작업이 유실되면 행이 없어 시한 판정(`readStatus`)을 할 수 없고, "등록 실패가 대기로 남지 않는다"는 C-02의 목적이 기본 요약에서는 지켜지지 않는다. C-12 `GET .../summary`의 PENDING/FAILED 응답도 근거 행이 없다. 늦게 온 결과를 버리는 부모 행 확인(late-result)도 마찬가지다. | `base_summary` PENDING 행(status·deadline_at)을 발행 트랜잭션 안에서 쓰는 주체를 정한다. 가장 단순한 안은 `chunkInTransaction`이 `publication_index`와 함께 쓰는 것이다. 또는 U5가 호출하는 `BaseSummaryWriter.initInTransaction` 같은 자리를 하나 더 둔다. `jd_summary_run` 행은 202를 돌려주기 전에 만든다는 것도 한 줄 적는다. | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md > C-03, C-08 publish-sequence | C-03은 기본 요약 "생성"을 하루 실행 제한에 세고(FR6.6), 접수 때 `consume`한다고 적는다. 그런데 발행 순서 1~5단계에는 `consume` 호출이 없다. 발행이 기본 요약을 자동으로 시작하므로 이 첫 생성이 횟수에 드는지 안 드는지 읽는 사람마다 달라진다. 센다면 한도에 도달한 날 발행 자체가 429로 막히는지, 발행은 되고 요약만 생략되는지도 정해지지 않았다. U4(발행)와 U5(요약)가 서로 다르게 만들 수 있는 경계다. | 발행 때 자동 시작되는 기본 요약이 횟수에 드는지(발행 순서 1단계에 `consume(BASE_SUMMARY)`를 넣을지, 안 센다고 못 박을지)를 정한다. 센다면 한도 도달 때 발행 전체 거부(429 `DAILY_LIMIT_REACHED`)인지 요약만 FAILED로 두고 발행은 성공인지 한 줄로 정한다. 값(횟수)이 아니라 판정 자리만 정하면 된다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md > C-02 RunStatus, C-09 `getIndexState`, C-12 `/summary` | 실행 상태의 이름이 둘이다. C-02의 표 상태는 `PENDING \| DONE \| FAILED`이고 C-09의 `getIndexState`와 C-12 `/summary` 응답은 `PENDING \| READY \| FAILED`다. 둘 사이 변환(DONE→READY)이 적혀 있지 않아 U3·U5가 각자 이름을 고르면 컬럼 값과 응답 값이 어긋난다. | 표 컬럼은 DONE, 인터페이스·응답은 READY인지 한 줄로 변환 규칙을 적거나 한쪽으로 통일한다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md > C-12 `/jd-summaries` 401, C-11 `onAccessLost` | `/jd-summaries`의 401은 `AUTH_REQUIRED`와 `LINK_PASSWORD_REQUIRED` 두 코드가 같은 상태 번호를 쓴다. 그런데 C-11의 `onAccessLost`는 `LINK_*` 두 코드만 다루고, 슬롯 4에서 로그인 만료(`AUTH_REQUIRED`)가 오면 누가 처리하는지 없다. 10월 코드에는 두 코드가 모두 있어 모양은 맞지만 화면 쪽 처리 주체가 비어 있다. | `JdSummaryPanel`이 `AUTH_REQUIRED`를 받으면 로그인 안내로 바꾼다는 것(U7 몫)을 C-11 규칙에 한 줄 더한다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md > 공통 전제 첫 항목 | "분석·수신 계약은 U7이 바꾸는 부분(등록 때 관계 검사 없음·수집 상한)만 고친다"고 하지만 계약 표나 명세에 해당 항목이 없다. 어떤 10월 계약 파일의 어느 부분이 바뀌는지, 누가 어느 PR에서 고치는지 알 수 없다. U7 안 변경이라 경계 계약 범위 밖일 수 있어 막는 정도는 아니다. | U7 안에서만 쓰는 변경이면 "U7 기능 설계에서 정하고 10월 계약 파일은 그 PR에서 고친다"로 바꿔 적는다. worker와 맞닿는 수집 상한이면 C-16 옆에 계약 한 줄을 더한다. | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md > C-02 table-convention / row-creation / late-result | 표 규칙은 `deadline_at NOT NULL`을 "등록 시각 + 처리 시한"이라 하지만, base_summary 행은 처리기가 결과를 쓸 때 늦게 만들어진다. 이때 `deadline_at`을 무엇으로 채우는지 없다. late-result 규칙은 부모 행(발행본)이 없거나 FAILED일 때만 버린다. 행이 없는 상태에서 시한이 이미 지난 뒤 도착한 결과를 쓸지 버릴지 적혀 있지 않다. 읽는 쪽은 시한이 지나면 FAILED로 보므로, 늦게 쓰인 DONE 행이 화면과 어긋날 수 있다. | 한 줄을 더한다. base_summary 행의 `deadline_at`은 `published_at` + 기본 요약 시한으로 채운다. 처리기는 결과를 쓰기 전에 now가 이 시한을 넘었는지 확인하고, 넘었으면 버린다. | New |
| R-07 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md > C-03 consume / C-08 publish-sequence 1단계 | `consume(BASE_SUMMARY)`는 발행 1단계에서 호출하고 "실패해도 돌려주지 않는다"고 했다. 그 뒤 PDF 복사(2단계)나 발행 트랜잭션(3단계)이 실패해 발행 자체가 실패하면, 기본 요약은 돌지 않았는데 그날 횟수가 하나 줄어든다. 하루 한도가 낮으면 재시도 때 손해가 생긴다. 한도 값은 개발 담당 결정이라 크기는 알 수 없다. | 단순한 안(기본값)은 이대로 두고 "발행 실패 때도 횟수는 돌려주지 않는다"고 한 줄 적어 의도임을 밝히는 것이다. 더 막으려면 consume을 3단계 커밋 직후로 옮기면 된다. 이러면 발행 성공과 횟수 사용이 어긋나지 않지만 호출 자리가 하나 바뀌고, 한도 도달 때 base_summary FAILED 행을 만드는 자리도 함께 옮겨야 한다. 팀장이 고른다. | New |

> R-01 Reviewer note: C-02 `row-creation`이 표별 생성 주체를 정했다. publication_index는 발행 트랜잭션 안에서 chunkInTransaction이 만든다. base_summary는 행이 없으면 `published_at` + 기본 요약 처리 시한으로 판정한다. jd_summary_run은 202 전에 PENDING 행을 만들고 커밋한 뒤 작업을 등록한다. 등록 실패나 유실이 "대기"로 남지 않는다. 남은 작은 틈은 아래 새 지적 1에 적었다.

> R-02 Reviewer note: C-03이 발행 때 자동으로 만드는 첫 기본 요약도 하루 제한에 센다고 정했다. C-08 publish-sequence 1단계가 `consume(BASE_SUMMARY)`를 부르고, 한도에 도달해도 발행은 계속한다. 4단계가 이때 base_summary 행을 FAILED로 두고 작업을 등록하지 않으며, 작성자가 다음 날 다시 만들기로 만든다. 두 절의 내용이 서로 맞는다.

> R-03 Reviewer note: C-02 `status-names`가 표 값 DONE을 인터페이스·HTTP 응답에서는 READY로 바꿔 보인다고 정했고, C-09 `getIndexState`와 C-12 `/summary`를 가리킨다.

> R-04 Reviewer note: C-11 `auth-rule`이 401 AUTH_REQUIRED는 받은 컴포넌트가 처리하고 JdSummaryPanel(U7)이 로그인 안내로 바꾼다고 적었다.

> R-05 Reviewer note: 공통 전제가 분석·수신의 바뀌는 부분은 U7 안 변경이라 U7 기능 설계에서 정하고 10월 계약 파일은 그 변경 PR에서 고친다고 바꿔 적었다. 이 계약 문서에 대응 항목이 없는 문제는 사라졌다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (없음) | 이 단계에 등록된 검증 도구가 없다 | 산출물과 Q&A·상류 문서의 대조로 갈음했다 |

### Summary

앞선 지적 다섯 건(Major 2, Minor 3)은 모두 고쳐졌고, 고친 내용끼리 서로 맞는다. 새로 찾은 것은 Minor 두 건뿐이다. 하나는 늦게 만드는 base_summary 행의 시한 처리, 다른 하나는 발행 실패 때 하루 횟수 처리다. 둘 다 구현 중 한 줄로 정할 수 있어 승인을 막지 않는다. 경계 계약만 고정한다는 Q1 A의 조건 1~5와도 맞는다.
