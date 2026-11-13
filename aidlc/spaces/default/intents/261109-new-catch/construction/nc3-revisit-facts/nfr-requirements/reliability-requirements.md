# NC3 다시 볼 곳 사실과 작업 시각 — 신뢰성 요구사항

입력:
- 기능 설계 `construction/nc3-revisit-facts/functional-design/`(functional-spec.md, rules.md, entities.md)
- 요구사항 `inception/requirements-analysis/requirements.md`(NFR7, NFR8, FR13.1, FR15.1, FR15.3)
- 계약 `inception/contract-design/contract-summary.md`(C2·C4)
- 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 이 단계의 답 `nfr-requirements-questions.md`(Q1 B와 덧붙임, Q2 B와 덧붙임)

## 판정 실패 처리 (Q1 B)

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR8.3 | RevisitFacts 판정 안에서 예외가 나면 그 후보의 `revisitFacts`만 빈 배열로 두고 분석을 이어간다. 그 후보의 작업 시각, 다른 후보, 결과 판본은 그대로다. 본인 커밋 식별값의 기록(기본 브랜치 창 커밋과 관계 조회 커밋을 함께 찾음)이 없는 결함도 같은 갈래다. 실패마다 오류 로그 한 줄을 남긴다(관측 요구사항 NFR4.3). 다른 단계의 예외는 지금처럼 올린다. | worker 시험: 판정 함수가 예외를 내게 한 후보 하나와 정상 후보 하나로 결과를 만들면, 앞 후보는 사실이 빈 배열이고 뒤 후보는 그대로이며 오류 로그가 한 줄이다. 기록이 없는 식별값을 넣은 경우도 같다. | Q1 B, 기능 설계 점검 지적 1 |

## 판정 규칙 보정 (Q2 B)

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR8.4 | 「시험 파일 있음」(BR3.5)은 상태가 `removed`인 시험 파일을 치지 않는다. 지운 시험 파일만 있는 후보에는 사실이 없다. 기능 설계 BR3.5(점검을 마친 판)는 파일 상태를 가리지 않으므로, 코드 생성 계획의 함께 고칠 파일에 `functional-design/rules.md` BR3.5와 `functional-spec.md` S10을 넣어 같은 PR에서 맞춘다. | worker 시험: `src/__tests__/a.test.ts`를 지우기만 한 후보에 TEST_FILES_PRESENT가 없고, 지운 것과 고친 것이 섞이면 고친 경로만 담긴다. 코드 검토: 위 두 문서가 이 규칙으로 바뀌었다. | Q2 B, FR13.1, 프로젝트 규칙 「규칙을 바꿀 때 같은 규칙을 적은 다른 문서를 모두 찾는다」 |

## 인셉션 NFR7(호환)에서 물려받는 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR7.1 | 마이그레이션 전 Catch(사실 빈 배열, 시각 null)는 오류 없이 보인다. 목록 맨 아래에 지금 순서(`catch_id`)로 있고, 상세에는 「다시 볼 곳」 칸이 없다. | api 시험: 시각 없는 Catch가 섞인 목록 순서(AC11.1.1). 화면 시험: 빈 배열 상세(AC9.1.3). | NFR7, BR6.2, BR7.1, BR9.1 |
| NFR7.2 | 본인 목록 커서는 판본 3이다. 배포 전에 web이 가진 판본 1·2 커서는 400이고, web은 지금 「더 보기」 실패 안내를 보인다. 걸러 보기를 바꾸거나 화면을 다시 열면 첫 쪽부터 다시 부른다. 공개 Catch 목록의 커서와 순서는 그대로다. | api 시험: 판본 1·2 커서 400, 공개 목록 커서가 지금 모양 그대로 다음 쪽을 읽는다(S18, BR7.3). | NFR7, BR7.2, BR7.3, NC1 BR5.2 |
| NFR7.3 | 결과 메시지 Result 판본은 "4"이고 api와 worker를 함께 배포한다. 판본 "3" 결과는 SCHEMA_INVALID로 거부한다. 배포는 진행 중인 분석이 없을 때 하고, 그때 끝나지 못한 분석은 다시 한다(출시 전·DB 초기화 전). | api 시험: 판본 "3" 결과 거부(S19). 배포 절차: PR 「리뷰 요청」에 함께 배포와 진행 중 분석 확인을 적는다. | NFR7, FR15.1, C4 |
| NFR7.4 | 3단계 변경은 출시 직전 DB 초기화 전에 통합 브랜치(이미 dev로 합쳐졌으면 dev)에 들어간다. 초기화 뒤 모든 Catch에 사실과 시각이 생긴다. 옛 Catch에 값을 채우는 경로(「Catch 재생성」)는 만들지 않는다. | PR 병합 시점이 초기화보다 앞선다(팀장 확인, 날짜와 무관). | FR15.3 |

## 인셉션 NFR8(시험)에서 물려받는 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR8.1 | 기능 명세 10절 시나리오 S1~S20(기대 결과·실패 조건)을 먼저 정했다. 세부 시험 코드는 구현 뒤 작성·실행하고, 기존 시험은 계속 통과한다. 커버리지 측정은 팀장이 공용 기반으로 넣은 서비스별 명령을 쓴다. | Unit 확인 명령(api·web·worker)이 통과한다. 프로젝트 규칙대로 `--timeout-ms 3600000`, 충전기·부하 확인, 서비스별 시간 보고를 한다. | NFR8, team.md 「Testing Posture」, project.md 「Testing Posture」 |
| NFR8.2 | 저장 무결성은 DB가 함께 지킨다. `revisit_facts`는 jsonb 배열이고, `first_work_at`·`last_work_at`은 둘 다 null이거나 둘 다 있으며 앞이 뒤보다 늦지 않다. 어기면 등록 트랜잭션 전체가 롤백된다. | api 시험: 검사를 어기는 쓰기가 거부되고 그 결과의 Catch가 하나도 없다. | BR6.2 |

## 해당하지 않는 것

- 가용성 목표(SLA/SLO), 백업·복구 절차는 새로 두지 않는다. 지금 서비스와 같고, 새 칸은 등록 때 한 번 쓰는 값이다.

## Sources

- `construction/nc3-revisit-facts/functional-design/rules.md`(BR3.5, BR5.1, BR5.2, BR6.1, BR6.2, BR7.1~BR7.3, BR9.1), `functional-spec.md` 10절, `entities.md`
- `inception/requirements-analysis/requirements.md` NFR7, NFR8, FR13.1, FR15.1, FR15.3
- `inception/contract-design/contract-summary.md` C2·C4
- `construction/nc1-sections-and-links/functional-design/rules.md` BR5.2
- `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- `construction/nc3-revisit-facts/nfr-requirements/nfr-requirements-questions.md` Q1·Q2
