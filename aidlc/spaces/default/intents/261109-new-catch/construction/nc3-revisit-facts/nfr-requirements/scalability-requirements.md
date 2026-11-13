# NC3 다시 볼 곳 사실과 작업 시각 — 확장성 요구사항

입력:
- 기능 설계 `construction/nc3-revisit-facts/functional-design/`(functional-spec.md, rules.md, entities.md)
- 요구사항 `inception/requirements-analysis/requirements.md`(NFR1)
- 계약 `inception/contract-design/contract-summary.md`(C2·C4)
- 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 이 단계의 답 `nfr-requirements-questions.md`(Q4 A)

NC3는 사용량 규모를 바꾸지 않는다. 분석 수, 회원 수, 동시 처리는 지금 그대로다(12월 사용 예상은 동료 수강생이 한 번씩 분석). 늘어나는 것은 저장 칸과 결과 메시지의 작은 크기뿐이고, 모두 상한이 있다.

## 크기 한계

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR1.4 | 한 Catch의 사실은 30개, 한 사실의 경로·커밋은 20개, 경로는 1,024자까지다(BR2.5). 그래서 `revisit_facts` 한 행과 후보 하나의 결과 메시지 증가에 끝이 있다. api 결과 검사와 DB 저장 모두 같은 상한을 쓴다. | api 시험: 31번째 사실, 21개 경로, 1,025자 경로가 든 결과가 거부된다(S19). | BR2.5, C4 |
| NFR1.5 | RevisitFacts의 메모리는 후보 하나의 본인 커밋 patch 줄에 비례하고, 후보가 끝나면 버린다. 저장소 전체나 여러 후보를 한꺼번에 담지 않는다. 수집 상한(커밋·응답 크기)은 지금 그대로라 입력 크기에도 끝이 있다. | 코드 검토: 판정 함수가 후보 하나의 커밋 기록만 받고 상태를 남기지 않는다. | NFR1, BR2.1 |
| NFR1.6 | 본인 목록 정렬에 새 인덱스를 더하지 않는다(Q4 A). 회원 한 명의 Catch는 수십~수백 개다. 회원 한 명이 수천 개를 갖는 규모가 되면 (`owner_id`, `last_work_at` DESC NULLS LAST, `catch_id`) 인덱스를 다시 판단한다. 그 규모는 이 intent의 사용 예상에 없다. | 코드 검토: 마이그레이션에 칸 셋과 검사만 있고 인덱스가 없다. | Q4 A, BR7.1 |

## 해당하지 않는 것

- 수평 확장, 샤딩, 캐시는 새로 두지 않는다. api·worker 배포 단위와 개수는 지금 그대로다.

## Sources

- `construction/nc3-revisit-facts/functional-design/rules.md`(BR2.1, BR2.5, BR7.1), `entities.md`
- `inception/requirements-analysis/requirements.md` NFR1
- `inception/contract-design/contract-summary.md` C2·C4
- `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- `construction/nc3-revisit-facts/nfr-requirements/nfr-requirements-questions.md` Q4
