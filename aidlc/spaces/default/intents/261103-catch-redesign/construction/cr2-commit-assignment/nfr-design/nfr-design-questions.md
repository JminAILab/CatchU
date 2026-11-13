# CR2 소속 저장 — 비기능 설계 질문

입력: CR2 비기능 요구사항(`nfr-requirements/*.md`), 기능 설계(`functional-design/functional-spec.md`·`rules.md`), 계약 C1·C2, 지금 코드(`worker/app/request_context/`, `worker/app/processing/live.py`, `worker/app/candidates/`, `worker/app/generation/material.py`, `api/src/catches/registration-service.ts`).

이 단계는 요구사항과 지금 코드로 모두 정해져 사람에게 물을 질문이 없다. 정한 내용은 아래와 같다.

## 질문 없이 정한 것

- **소속 집합이 흐르는 길:** worker 맥락 해석이 `assignedCommitShas`를 frozenset으로 `ContextFound`에 싣고, `LiveGenerator`가 같은 값을 후보 판정(`build_candidates`)과 생성 재료 찾기(`material.py`의 `group`)에 넘긴다. 합성 요청과 FR10 확인 명령은 빈 집합 기본값이다.
- **빼기 자리:** `group(outcome, assigned)`가 단위를 지금처럼 정한 뒤 빼고, 버린 단위 수를 함께 돌려준다.
- **소속 쓰기:** 등록 함수가 Catch를 찾은 뒤 같은 트랜잭션에서 1,000행씩 충돌 무시 삽입(`orIgnore`)을 한다. 3,000행 쓰기 시간은 코드 생성 때 한 번 재는 참고 기록이고 통과 조건이 아니다(비기능 요구사항 검토 Minor).
- **마이그레이션:** 하나에 `catch_asset`의 (catch_id, owner_id) 유일 조건과 `commit_assignment` 표·유일 조건·한 쌍 외래 키(ON DELETE CASCADE)를 넣는다.
- **응답 상한:** worker `max_response_bytes` 기본값을 1 MiB로 바꾼다. 넘으면 지금 이유 코드 `CONTEXT_RESPONSE_TOO_LARGE`로 끝나고 로그로 알아본다. 이 한계를 코드 요약에 적는다(비기능 요구사항 검토 Minor).
- **로그:** 후보 판정 종료 로그에 `assignedShas`·`assignedUnits` 정수 두 칸만 더한다. 버린 단위는 미제공 집계에 넣지 않는다.
- **결과 판본:** "3"은 계약 YAML·api 수신 타입·worker `_envelope` 세 곳, 진행 상태·합성 요청·수신 응답은 "2" 그대로다.
- **문서:** 빼기 규칙은 새 문서 `worker/docs/commit-assignment.md`에 쓰고, 큰 worker 문서에는 링크와 한두 줄만 더한다.

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
