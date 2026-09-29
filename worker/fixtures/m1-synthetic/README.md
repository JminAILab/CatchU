# M1 합성 결과 세트

api의 E 수신 처리와 B 등록 시험이 함께 쓰는 worker 메시지 합성 사례다. 사례와 기대 결과의 정본은 [`cases.json`](cases.json)이고, 이 문서는 사람이 읽는 안내다. 작업 범위는 [#103](https://github.com/JminAILab/CatchU/issues/103)이다.

## 전달 방식과 이유

- **api 안 주입**: E의 개발 전용 경로가 이 폴더의 템플릿을 실제로 접수한 요청의 값으로 채워 E 수신 처리에 넣는다. worker 실행과 서비스 간 연결은 필요 없다. 주입 경로와 수신 처리는 [#139](https://github.com/JminAILab/CatchU/issues/139)에서 만든다.
- 이유: 실제 전송(큐·HTTP)은 [#77](https://github.com/JminAILab/CatchU/issues/77) 검증 뒤에 정하며 그 전에는 전송 방식을 고정하지 않는다([Unit 의존](../../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/units-generation/unit-of-work-dependency.md)). E 수신 처리는 전달 경로와 분리되어 있으므로, #77 뒤에는 전달 경로만 바뀐다.
- 개발 전용 주입 경로는 운영 환경에서 거부되도록 만든다(#139 완료 기준).

## 폴더 구성

| 파일 | 역할 |
|---|---|
| `cases.json` | 사례 9개, 사례별 메시지 파일·전달 순서·기대 결과, 음성 대조 |
| `context.sample.json` | 합성 접수 맥락 표본(채울 값 6개)과 합성 선정 저장소 |
| `results/*.json` | 종결 결과(Result) 템플릿 7개 |
| `events/*.json` | 진행 관측(ProcessingEvent) 템플릿 2개 |

스키마 원본은 복사하지 않고 경로로 읽는다: [`worker-messages.yaml`](../../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml), [`common.yaml`](../../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml). 검사 코드는 worker `app/contract/`와 api `test/helpers/worker-messages.cjs`에 있다.

## 사례표

각 사례는 새로 접수한 요청(처리 상태 QUEUED)에서 시작한다. 기대 결과는 **초안**이다. 처리 종결값·수신 확인은 E 담당, 등록은 B 담당이 확인해야 확정된다.

| 사례 ID | #103 본문 이름 | 메시지와 전달 순서 | 처리 종결값 | 수신 확인 | 등록 |
|---|---|---|---|---|---|
| `succeeded-one-candidate` | 적합 후보 1건(SUCCEEDED) | `results/succeeded-one-candidate.json` 1회 | SUCCEEDED | ACCEPTED/OK | 새 PRIVATE Catch 1개 |
| `empty` | 정상 0건(EMPTY) | `results/empty.json` 1회 | EMPTY | ACCEPTED/OK | 없음 |
| `partial-failed` | 부분 실패(PARTIAL_FAILED) | `results/partial-failed.json` 1회 | PARTIAL_FAILED | ACCEPTED/OK | 적합 후보 1건만 새 Catch |
| `failed` | 실패(FAILED) | `results/failed.json` 1회 | FAILED | ACCEPTED/OK | 없음 |
| `unidentifiable` | 식별 불가(세 ID 중 누락) | `results/unidentifiable-missing-attempt-id.json` 1회 | QUEUED 유지 | 없음(거부 기록만) | 없음 |
| `redelivery` | 같은 결과 재전달 | `results/succeeded-one-candidate.json`을 같은 채움 값으로 2회 | SUCCEEDED | 1회 ACCEPTED/OK, 2회 DUPLICATE/ALREADY_RECEIVED | 1회 새 Catch, 2회 같은 catchId |
| `same-id-different-content` | 같은 ID의 다른 내용 | `results/succeeded-one-candidate.json` → `results/same-id-different-content.json`(같은 resultId) | SUCCEEDED 유지 | 1회 ACCEPTED/OK, 2회 REJECTED/PAYLOAD_CONFLICT | 1회 새 Catch, 2회 없음(첫 Catch 유지) |
| `two-candidates-same-work` | 두 후보가 같은 작업 | `results/two-candidates-same-work.json` 1회 | SUCCEEDED | ACCEPTED/OK | 두 후보가 Catch 1개를 참조 |
| `progress-events` | 진행 알림(RUNNING·UNCERTAIN) | `events/running.json`, `events/uncertain.json`을 서로 다른 새 요청에 1회씩 | RUNNING / UNCERTAIN | 없음(진행 알림에는 만들지 않음) | 없음 |

- 진행 알림 두 개를 한 요청에 이어 보내지 않는 이유: 상태 전이표에 QUEUED → RUNNING·UNCERTAIN만 있고 RUNNING → UNCERTAIN은 없다.
- `cases.json`의 `registration` 값은 테스트 기대값 이름이다: `NONE`(이 메시지로 등록 없음), `NEW_CATCH`(적합 후보마다 새 Catch), `SAME_CATCH`(새 Catch 없이 앞 등록과 같은 catchId), `SHARED_CATCH`(두 후보가 Catch 하나를 참조). `catchesAfter`는 그 메시지까지 처리한 뒤 이 요청에서 나온 Catch 수다.
- 수신 확인의 disposition·code와 처리 종결값은 계약 enum이다.

## 스키마 검사 판정

api와 worker는 같은 메시지에 같은 판정을 내야 한다(`cases.json`의 `check`).

| 판정 | 뜻 |
|---|---|
| `VALID` | 스키마 v1 통과 |
| `UNIDENTIFIABLE` | resultId·requestId·attemptId 중 비어 있지 않은 문자열이 아닌 것이 있다. 수신 확인 없이 거부 기록만 남긴다. 문제 필드 목록을 함께 비교한다 |
| `SCHEMA_INVALID` | 세 식별자는 읽히지만 다른 필드가 스키마에 맞지 않는다 |

- 세 이름은 새 계약 코드가 아니라 양쪽 테스트가 비교하는 기대값 이름이다. 식별 가능성은 Result에만 따지고, 그다음에 스키마를 검사한다.
- OpenAPI `nullable: true`는 검사 전에 null 허용으로 바꾼다. date-time·uri 형식도 검사하며, date-time은 RFC 3339대로 날짜와 시각 사이에 `T`만 허용한다. 음성 대조(`negativeControls`)가 형식 검사가 실제로 동작하는지 확인한다.
- 오류는 위치(JSON Pointer)와 어긴 키워드만 남기고 원문 값은 남기지 않는다.

## ID 채우기

템플릿의 문자열 안에 있는 `{{이름}}` 자리를 채운다. 값이 없는 자리가 남으면 채우기 함수가 오류를 낸다.

| 자리 | 출처 |
|---|---|
| `requestId`, `attemptId`, `memberId`, `repositoryId`, `consentId`, `scopeRevision` | E가 접수한 요청·현재 시도·회원·저장소·동의와 동의의 허용 범위 판본. E는 접수 맥락과 맞지 않는 결과를 거부하므로 반드시 실제 접수 값으로 채운다 |
| `caseId` | `cases.json`의 사례 ID |

- worker가 만드는 ID는 결정적으로 정해진다: messageId `message-{{caseId}}-{{attemptId}}-…`, resultId `result-{{caseId}}-{{attemptId}}`, candidateId `candidate-{{caseId}}-{{attemptId}}-<n>`, evidenceId `evidence-{{caseId}}-{{attemptId}}-<n>-<m>`. 한 사례 안의 결과 메시지는 같은 resultId를 쓴다. 계약에서 이 ID들은 외부 ID(불투명 문자열)다.
- workIdentity는 `synthetic-work-{{caseId}}-<작업>`이라 사례끼리 겹치지 않는다. 같은 회원으로 여러 사례를 이어 시험해도 다른 사례의 Catch를 참조하지 않는다.
- 시각은 고정된 합성 시각(`2026-10-01T00:…Z`)이다.
- `context.sample.json`의 내부 ID 표본은 UUID 모양으로 두어 문자열·UUID 칼럼 어디에도 들어가게 했다. 개발 연동 대역의 합성 선정 저장소는 이 파일의 `repository` 값과 맞춘다.

## 수집 실패 코드

`Failure.code`는 계약에서 자유 문자열이다. 이 세트는 수집 단계(`stage: COLLECTION`) 실패에 `COLLECTION_FETCH_FAILED`를 쓴다. 다른 문서·코드에서 합성 수집 실패를 가리킬 때도 이 이름을 쓴다.

## 이 세트에 없는 사례 — 맥락 불일치·늦은 진행 이벤트

별도 파일을 두지 않고 기존 템플릿으로 만든다. 기대 결과는 계약의 수신 확인 코드와 상태 전이표를 따르며 E가 정본이다.

- 맥락 불일치: 결과 템플릿을 접수 값과 다른 값(예: 다른 회원 ID나 이전 시도 ID)으로 채워 보낸다.
- 늦은 진행 이벤트: 종결 결과를 반영한 뒤 `events/running.json`을 같은 요청 값으로 채워 보낸다. 종결 상태가 되돌아가지 않아야 한다.

## 자료 제한

- 모든 값은 합성 값이다. URL은 예약 도메인 `example.invalid`만 쓰고, 실제 저장소 자료·과거 실험 자료를 쓰지 않는다([#37](https://github.com/JminAILab/CatchU/issues/37)).
- `sourceMode`는 항상 `MOCK`이다. 합성 연결의 통과는 실제 분석 성공, 실제 자료 검증, Catch 저장·열람 준비 완료를 뜻하지 않는다.

## 검사

- worker(`worker/`에서): `uv run --locked pytest`가 `tests/test_worker_messages.py`로 사례·음성 대조를 검사한다.
- api(`api/`에서): `npm test`가 `test/worker-messages.test.cjs`로 같은 사례·음성 대조를 검사한다.
