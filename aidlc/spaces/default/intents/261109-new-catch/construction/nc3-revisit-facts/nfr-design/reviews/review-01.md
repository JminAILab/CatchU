## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-11T05:38:40Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261109-new-catch/construction/nc3-revisit-facts/nfr-design/performance-design.md > 4. 확인 | 「종결 로그의 GitHub·AI 호출 수, elapsedSeconds, resultBytes」라고 적었다. 그러나 지금 worker 종결 로그(`worker/app/processing/pipeline.py`의 「종결 결과 생성」)에는 `candidates`·`resultBytes`·`elapsedSeconds` 등만 있고 GitHub·AI 호출 수 칸이 없다. GitHub 호출 수는 수집 로그 「수집 종료」(`calls=`)에, AI 호출 수는 생성 로그 「생성 종료」(`generationCalls`·`rewriteCalls` 등)에 따로 있다. 이대로 두면 바꾸기 전·후 비교 때 어느 로그에서 무엇을 읽는지 헷갈린다. | 비교에 쓰는 값을 로그별로 나눠 적는다. GitHub 호출 수는 「수집 종료」, AI 호출 수는 「생성 종료」, `elapsedSeconds`·`resultBytes`는 「종결 결과 생성」에서 읽는다고 고친다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261109-new-catch/construction/nc3-revisit-facts/nfr-design/security-design.md > 2. 결과 메시지 검사의 등록 입력 검사, 3. 요청 입력: 커서 | 계약의 시각 칸은 `date-time` 형식이라 `+09:00` 같은 오프셋과 밀리초 아래 소수도 통과한다. 반면 커서의 `lastWorkAt`은 `new Date(x).toISOString() === x` 꼴만 받고 SQL은 `c.last_work_at = $a`로 같음을 비교한다. 등록 입력 검사의 `firstWorkAt ≤ lastWorkAt`도 글자로 견줄지 Date로 견줄지 적혀 있지 않다. 지금 worker는 UTC 초 단위만 보내므로(BR4.1) 당장 어긋나지 않지만, 설계는 이 가정을 적지 않아 소수 초 값이 들어오면 다음 쪽 조건이 행을 건너뛰거나 되풀이할 수 있다. | 등록 입력 검사가 두 시각을 Date로 해석해 비교한다고 적는다. 저장 전에 시각을 UTC 밀리초 이하로 맞추거나(또는 worker가 UTC 초 단위만 보낸다는 가정을 명시해) 커서의 같음 비교와 어긋나지 않게 한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261109-new-catch/construction/nc3-revisit-facts/nfr-design/reliability-design.md > 3. 호환과 배포 (결과 판본) | 「api 시험의 고정 결과(`api/test/` 결과 예시)와 worker 고정 자료(`worker/fixtures/m1-synthetic/`)」로만 적었다. 실제로 판본 "3"이 박힌 곳은 `api/test/helpers/receiver-harness.cjs`, `api/test/u7-worker-context.test.cjs`, `worker/fixtures/m1-synthetic/results/` 아래 7개 파일(`succeeded-one-candidate.json` 등)이다. 고정 자료 하나를 빠뜨리면 판본 "4" 계약 아래에서 그 시험만 SCHEMA_INVALID로 깨진다. | 코드 생성 계획의 함께 고칠 파일에 위 파일을 구체 이름으로 넣고, 계획 때 `schemaVersion` "3" 글자를 api·worker·web 시험과 고정 자료에서 다시 찾아 빠진 곳이 없는지 확인한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 손 대조: `nfr-design/traceability.json` 대 NFR 요구 여섯 문서 | NFR1.1~1.6, 2.1, 4.1~4.3, 5.1, 5.2, 6.1, 7.1~7.4, 8.1~8.4 21개가 모두 `upstream_ids`와 `coverage`에 있고, 각 항목에 설계 문서 절 단위의 구체 목표가 있다. 요구 문서에 없는 ID와 빠진 ID는 없다. NFR3은 NC3 요구 문서가 NC2 몫으로 밝혀 둔 것이라 대상이 아니다. | 통과. NFR1.3의 목표는 「시간 숫자를 빼고 구조 요구로 확인」으로 사람 결정(Q1)을 그대로 담았다. |
| 손 대조: 사람 결정 반영 | (a) 「RevisitFacts 1초」 숫자는 NFR 설계 문서 어디에도 남지 않았고, 시험은 시간을 단정하지 않으며, 바꾸기 전·후 `elapsedSeconds`만 기록한다(성능 4절, 신뢰성 4절). (b) 함께 고칠 파일에 `performance-requirements.md` NFR1.3이 들어 있다(신뢰성 2절). 그 문서의 「1초」 글자는 이 한 곳뿐이다(`grep "1초"`로 확인). (c) 어긋나는 문장은 `functional-spec.md` 49행 하나뿐이고(`grep "삼키지\|생성 실패 갈래"`로 확인), rules.md BR2.1·BR4.1은 고치지 않는 것으로 정리했다. | 통과. 결정이 모순 없이 구현 가능한 꼴로 실렸다. |
| 현재 코드 대조: 본인만 보기 경계 | `catch-reader.ts`의 `READ_COLUMNS`는 본인·공개 목록·상세만 쓴다. `public-catch-store.ts`의 `publicResponse`는 허용 칸을 골라 담는다. `publish.service.ts`의 `CATCH_LOCK_SQL`과 `mcp-material-reader.ts`의 `READ_CATCHES`는 칸을 하나하나 적는다. `catch_asset`을 읽는 다른 자리(`author-description-store.ts`, `analysis-status.ts`)도 칸을 적거나 개수만 센다. | 보안 설계 1절의 주장이 코드와 맞는다. 새 칸이 공개·발행·Claude 연결로 새는 길이 없다. |
| 현재 코드 대조: worker 호출 자리와 기록 묶음 | `live.py`가 `build_candidates` 뒤 `run_generation` 앞에 끼울 자리가 있고, `flow.py`의 `replace(built, …)`는 새 칸을 바꾸지 않는다. `grouping.py`의 기록 묶음(`outcome.commits` + `relations.commits`)과 신뢰성 설계가 말한 묶음이 같다. `consumer/service.py`의 `type(error).__name__` 로그와 같은 꼴을 따른다. | 신뢰성·관측 설계가 구현 가능하다. |
| 현재 코드 대조: 목록 정렬·커서 | `owner-catch-store.ts`는 지금 `ORDER BY c.catch_id ASC`이고, `public-catch-store.ts`가 `ownerCatchQuery`·`nextOwnerCatchCursor`를 공유한다. 설계의 「공개 목록 커서 함수를 판본 2로 따로 남김」이 필요하고 가능하다. 다음 쪽 조건 두 꼴은 `ORDER BY last_work_at DESC NULLS LAST, catch_id ASC`와 논리가 맞다. | 통과. 위 Minor 둘째 건만 보완한다. |
| 명령 실행 | 시험·검증 명령은 실행하지 않았다(설계 단계라 코드 산출물이 없고 `--write-upstream`도 쓰지 않았다). 읽기 전용 `grep`과 파일 읽기만 했다. | 코드 생성 단계에서 Unit 확인 명령(api·web·worker, `--timeout-ms 3600000`)으로 확인한다. |

### Summary

사람 결정(1초 숫자 삭제, NFR1.3 문서 함께 고치기, functional-spec 49행 한 곳 정정)이 설계 문서와 함께 고칠 파일 목록에 모순 없이 실렸고, 추적표는 NFR 21개를 모두 구체 목표로 덮으며 현재 코드와의 대조에서 막는 결함은 찾지 못했다. 남은 것은 로그 출처 표기, 시각 형식 가정 명시, 고정 자료 파일 이름 보강 같은 Minor 셋뿐이라 코드 생성 계획에서 처리하면 된다.
