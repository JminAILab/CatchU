## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-07T11:48:48Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr2-commit-assignment/nfr-design/observability-design.md > NFR4.5 (끝 문장: 이른 종료 로그에는 둘 다 0) | `assignedShas`를 「받은 소속 집합의 크기」로 정의하고 「`assignedShas=0`이면 첫 분석이거나 합성 요청」이라고 읽으라 했는데, 저장소를 확인하지 못해 일찍 끝나는 길(`build.py`의 `_log(request, outcome, 0, tally, 0)`)에서는 집합을 받은 재분석이어도 0을 찍는다고 적었다. 같은 칸이 두 뜻을 가져 로그를 읽는 사람이 재분석을 첫 분석으로 오해한다. | 이른 종료 로그에도 받은 집합의 실제 크기를 싣고 `assignedUnits`만 0으로 두거나, 이른 종료는 칸이 0이어도 「첫 분석」으로 읽지 않는다고 「읽는 법」에 적는다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr2-commit-assignment/nfr-design/scalability-design.md > NFR6.3 | 응답 상한을 64 KiB에서 1 MiB로 바꾸는데, 같은 값을 적은 `worker/docs/request-context.md` 74행(「응답 본문 64 KiB다」)이 이 설계에 고칠 문서로 올라 있지 않다. 신뢰성 설계 NFR7.1은 worker 문서 네 개만 적는다. 기능 설계 7절은 이 파일을 「새 칸」 때문에만 올렸다. 값 하나가 바뀐 채 문서에 옛 값이 남는다. | 확장성 설계(또는 NFR7.1)에 `worker/docs/request-context.md` 74행의 상한 값 수정을 함께 고칠 문서로 더한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr2-commit-assignment/nfr-design/performance-design.md > NFR4.4·NFR4.8 (새 색인은 없다) | `commit_assignment`의 `(catch_id, member_id)` 외래 키는 ON DELETE CASCADE인데 이 열 쌍을 앞에 둔 색인이 없다(유일 조건은 `member_id, github_repository_id, commit_sha`). 탈퇴·분석 요청 삭제로 Catch가 지워질 때마다 PostgreSQL은 소속 표를 Catch마다 훑는다. 성능 설계는 읽기 경로만 따지고 이 삭제 경로를 다루지 않았다. 포트폴리오 규모에서는 문제 없을 가능성이 크다. | 삭제 경로는 표가 작아 색인을 두지 않는다고 한 줄 근거를 적거나, `(catch_id, member_id)` 색인을 마이그레이션에 더한다. 어느 쪽이든 선택을 적는다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261103-catch-redesign/construction/cr2-commit-assignment/nfr-design/performance-design.md > NFR4.4 및 logical-components.md > 소속 쓰기 | 등록 함수가 「열쇠 후보들의 `ownCommitShas` 합집합」을 쓴다고 하지만, 지금 `registration-batch.ts`의 `RegistrationCandidate`와 `PreparedWorkGroup.candidates`에는 이 칸이 없고 `prepareRegistrationBatch`가 후보 필드를 골라 옮긴다. 이 타입·준비 함수의 변경이 논리 구성 요소 표와 설계 어디에도 없다. 또 값 「5개×1,000」은 엔티티 칸(`assignedAt`은 기본값)과 맞지 않아 4개로 보인다. | 논리 구성 요소의 「소속 쓰기」 행에 `RegistrationCandidate`·`PreparedWorkGroup`에 `ownCommitShas`를 싣는 변경을 더하고, 묶음당 값 개수는 실제 칸 수로 고친다. 매개변수 한도 계산은 그대로 안에 든다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (단계 정의에 검증 도구 없음) | 실행 없음 | 현재 코드와 직접 대조했다. 확인한 것: `worker/app/request_context/settings.py`의 64 KiB 기본값과 `client.py`의 `CONTEXT_RESPONSE_TOO_LARGE`·운영 로그(`runner.py` 143행), `registration-service.ts`의 `orIgnore` 삽입과 트랜잭션 검사, `catch_asset`의 기존 외래 키(`deleteWithParent`)·유일 조건, 수신기의 Ajv 계약 검사(`worker-message.validator.ts`), 결과 판본 "2" 위치(`result.py`·`pipeline.py`·`synthetic.py`·`receiver.types.ts`), 접수의 회원당 진행 요청 하나(가정 A4). 설계가 코드에 대해 한 주장은 모두 맞았다. |

### Summary

필수 항목은 요구사항(NFR4.1~4.12, NFR6.1~6.5)에 모두 대응했고, 쓰기 한 곳·DB 제약·같은 트랜잭션·같은 집합 전달 같은 핵심 구조도 지금 코드와 맞는다. 순환·끊어진 참조·빠진 실패 경로는 찾지 못했고, 남은 것은 로그 칸 정의, 옛 상한 값이 남는 문서 하나, 삭제 경로 색인 근거, 등록 입력 타입 변경 누락의 Minor 네 건이다.
