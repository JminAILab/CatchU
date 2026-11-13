# NC3 다시 볼 곳 사실과 작업 시각 — 확장성 설계

입력:
- NFR 요구 `construction/nc3-revisit-facts/nfr-requirements/scalability-requirements.md`(NFR1.4~NFR1.6)
- 기능 명세 `construction/nc3-revisit-facts/functional-design/functional-spec.md`, 규칙 `rules.md`(BR2.5, BR7.1)
- 계약 `inception/contract-design/contract-summary.md` C2·C4

배포 단위, 개수, 큐, 동시 처리는 바꾸지 않는다. 확장성 설계는 크기 상한을 어디서 지키는지와, 무엇이 오면 다시 판단하는지다.

## 1. 크기 상한을 지키는 자리 (NFR1.4)

| 상한 | worker(만들 때) | 계약(Ajv) | api 등록 검사 | DB |
|---|---|---|---|---|
| 사실 30개 | 정렬 뒤 앞 30개만 담음(BR2.5) | `revisitFacts.maxItems: 30` | — | 배열 검사만 |
| 경로 1~1,024자 | 넘는 경로의 사실은 만들지 않음 | `paths.items.minLength 1`, `maxLength 1024` | — | — |
| 경로·커밋 20개 | 시험 파일 사실에서 앞 20개만 담음 | `paths.maxItems 20`, `commits.maxItems 20` | 종류별 개수 | — |

- 계약 상한과 worker 상한은 같은 숫자다. worker는 결과를 보내기 전에 지금처럼 같은 계약으로 자기 검사를 한다. 그래서 어긋나면 worker 시험에서 먼저 드러난다.
- `maxLength 1024`는 JSON Schema 글자 수(코드 포인트)이고, worker는 Python `len()`(코드 포인트)으로 같은 수를 센다.

## 2. 메모리 (NFR1.5)

- RevisitFacts는 후보 하나의 기록만 받고, 사전은 함수가 끝나면 버린다. 후보 사이에 상태를 남기지 않는다.
- 입력 크기는 지금 수집 상한(커밋 수·응답 크기)이 막는다. 새 상한은 두지 않는다.

## 3. 다시 판단할 조건 (NFR1.6)

- 본인 목록 정렬용 인덱스는 두지 않는다.
- 회원 한 명의 Catch가 수천 개가 되는 사용(이 intent의 예상 밖)이 생기면 (`owner_id`, `last_work_at` DESC NULLS LAST, `catch_id`) 인덱스를 더하는 마이그레이션을 판단한다.

## Sources

- `construction/nc3-revisit-facts/nfr-requirements/scalability-requirements.md`
- `construction/nc3-revisit-facts/functional-design/functional-spec.md`, `rules.md`(BR2.5, BR7.1)
- `inception/contract-design/contract-summary.md` C2·C4
- 지금 코드: `worker/app/processing/pipeline.py`(`_require_valid` 결과 검사), `api/contracts/repository-analysis/worker-messages.yaml`
