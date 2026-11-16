# 시험 결과 — #559

- 날짜: 2026-11-16
- 코드: 커밋 `71f4d662`(코드는 `624005b9`까지), 브랜치 `api/질의응답-조각-답문구`
- 환경: macOS, 전원 연결, 1분 부하 평균 4.26(시작 전 `pmset -g batt`·`sysctl -n vm.loadavg`)
- 쓴 컨테이너: `catchu-db-test`(127.0.0.1:5433, 테스트 DB), `catchu-nc3-measure-db`(127.0.0.1:55470, 측정 DB). 둘 다 켜 둔 채로 둔다.

## 빌드

| 명령 | 결과 | 걸린 시간 |
|---|---|---|
| `npm --prefix api run build` | 성공 | 6초 |
| `npm --prefix web run build` | 성공(Next.js 운영 빌드) | 8초 |
| `npm --prefix api run lint` / `typecheck` | 종료 코드 0 / 0 | - |
| `npm --prefix web run lint` / `typecheck` | 종료 코드 0 / 0 | - |

## 시험

| 명령 | 결과 | 걸린 시간 |
|---|---|---|
| api 범위 시험 7개 파일(테스트 DB 값 붙임, 마지막 코드) | 76/76 통과 | 2초 |
| web 범위 시험 6개 파일 | 100/100 통과 | 1초 |
| `npm --prefix web test`(web 전체) | 1,063/1,063 통과, 건너뜀 0 | 15초 |
| `npm --prefix api test`(api 전체, 마이그레이션 포함) | **종료 코드 1.** 1,948개 가운데 1,906 통과, 4 실패, 38 건너뜀(사전 1/1, 첫째 줄 1,876/1,918, 둘째 줄 30/30) | 338초 |
| └ 다시: `CATCHU_TEST_WORKER_PYTHON=<메인 폴더 worker/.venv/bin/python> PYTHONDONTWRITEBYTECODE=1 npm --prefix api test -- test/integration/u7-analysis-chain.test.cjs` | 7 통과, 1 건너뜀, 실패 0 | 17초 |
| └ 다시: `npm --prefix api test -- test/publications/recipient-unlock-policy.test.cjs` | 29/29 통과 | 103초 |
| worker | 바꾸지 않아 돌리지 않음 | - |

- 서비스별 걸린 시간: api 전체 338초, web 전체 15초, worker 없음
- 커버리지: 이 범위에 정한 커버리지 목표가 없다(bugfix는 목표 회귀 시험과 기존 시험 통과가 의무). 커버리지 명령은 돌리지 않았다.

### api 전체 시험 실패 4건

| 시험 | 파일 | 실패 메시지 | 판단 |
|---|---|---|---|
| I4·I6·I8 | `api/test/integration/u7-analysis-chain.test.cjs` | `AssertionError: worker 잠금 의존성과 CATCHU_TEST_WORKER_PYTHON 실행 파일 필요` | 환경 문제다. 이 폴더에 `worker/.venv`가 없다. 팀장 허락을 받고 메인 폴더 worker 파이썬으로 그 파일만 다시 돌려 통과했다(`worker/uv.lock` 해시는 두 폴더가 같음, 팀장 확인). 메인 폴더에 파이썬 캐시는 쓰지 않았다 |
| 신뢰 프록시 미설정: 꾸민 X-Forwarded-For는 무시하고 직접 연결 주소 하나로 센다 | `api/test/publications/recipient-unlock-policy.test.cjs` | `TimeoutError: The operation was aborted due to timeout`(시험 33초) | 아래 「신뢰 프록시 시험」 |

### 신뢰 프록시 시험이 전체 실행에서 실패한 까닭

- 실패 메시지는 받은 사람 비밀번호 확인 요청(`POST /v1/public/links/:token/unlock`) 하나가 시험 도구의 요청 제한 15초를 넘었다는 뜻이다(`api/test/publications/support.cjs` 199행 `AbortSignal.timeout(15000)`). 이 시험은 틀린 비밀번호를 10번 보낸 뒤 두 번 더 보내고, 요청마다 비밀번호 해시를 계산한다.
- 이번 변경과는 부딪히지 않았다.
  - 바꾼 파일에 `api/src/publications`·`share-links`·`common`·`app.module.ts`가 없다(`git diff 429cc456..HEAD`로 확인).
  - 이번에 더한 시험은 같은 첫째 줄에서 한 파일씩 차례로 돌므로(`--test-concurrency=1`) 이 시험과 시간이 겹치지 않는다.
- 같은 시각에 둘째 줄(잠금 대기 시험, 다른 DB)이 동시에 돌고 있었다. 비밀번호 해시는 CPU를 많이 쓰므로, 부하가 몰리면 한 요청이 15초를 넘을 수 있는 시험으로 판단한다.
- 그 파일만 다시 돌리니 29/29 통과했다.

## 질문 10개 다시 재기(NFR1)

- 기록: `api/docs/rag-evaluation/2026-11-16-remeasure.md`(대상 버전 `71f4d662-remeasure`). 기준선은 `api/docs/rag-evaluation/2026-11-16-baseline.md`다. 원문 결과는 `api/.rag-eval/` 아래(git 밖)에 있다.
- 실제 호출은 measure 한 번이다. 기준선 한 번과 다시 재기 한 번, 모두 팀장 확인 뒤에 했다.
- 수치는 아래와 같다.

  | | 기준선 | 다시 재기 |
  |---|---|---|
  | 검색 적중률(앞 5·8·12) | 70·80·80% | 70·80·80% |
  | 통과 항목 | 29 | 30 |
  | 대조 버림(fact) | 1 | 5 |
  | 답 실패(`NO_ITEMS` + 통과 0개) | 1 | 0 |

- 팀장 판정(2026-11-16): (c)·(d)·(f)·(g)는 채움, (a)·(b)·(e)는 **못 채움**. 자세한 내용은 기록의 「#559 완료 기준 판정」에 있다.

## 목표 대조표

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| TC-REG | Testing Contract `scope_floor` | 버그를 다시 내는 목표 회귀 시험이 있다 | S1~S17 시험(api 76, web 100 범위 시험) 통과 | 위 「시험」 범위 시험 두 줄 | 빌드와 시험 | Met |
| TC-GREEN | Testing Contract `scope_floor` | 기존 시험이 모두 통과한다 | web 전체 통과. api 전체 명령은 종료 코드 1(실패 4). 그 4건은 환경(worker 파이썬)과 부하 시간 초과이고, 다시 돌려 통과 | 위 「api 전체 시험 실패 4건」 | 빌드와 시험 | Not Met(명령 실패. 원인은 이번 변경 밖이며 팀장이 받아들임) |
| TC-STRATEGY | Testing Contract `strategy_volume` | 요구마다 시험 하나, 부품마다 정상 경로 하나 | 새 시험 파일 2개와 기존 5개 파일에 사례를 더함 | `construction/code-generation/code-summary.md` 「시험」 | 코드 생성 | Met |
| NFR1-RUN | 요구사항 NFR1 | 질문 10개를 한 번 다시 재고 기록하며, 사람이 판정한다 | 한 번 잼, 팀장 판정 기록 | `2026-11-16-remeasure.md` | 빌드와 시험 | Met |
| NFR1-a | 요구사항 NFR1(a) | 3번이 그 커밋의 변경 파일·줄 수를 인용 | 다른 커밋의 규모만 인용 | 같은 기록 「#559 완료 기준 판정」 | 빌드와 시험 | Not Met(한계로 기록) |
| NFR1-b | 요구사항 NFR1(b) | 7번이 어느 커밋인지 함께 말함 | 커밋 규모라고는 말하나 식별값은 없음 | 같음 | 빌드와 시험 | Not Met(한계로 기록) |
| NFR1-c | 요구사항 NFR1(c) | 9·10번 Catch 섞임 없음 | 섞임 없음 | 같음 | 빌드와 시험 | Met |
| NFR1-d | 요구사항 NFR1(d) | 단정한 답 1개 이하 | 1개 | 같음 | 빌드와 시험 | Met |
| NFR1-e | 요구사항 NFR1(e) | 첫 항목이 답이 아닌 답 1개 이하 | 3개(2·3·6번) | 같음 | 빌드와 시험 | Not Met(한계로 기록) |
| NFR1-f | 요구사항 NFR1(f) | 답 실패 0개 | 0개 | 같음 | 빌드와 시험 | Met |
| NFR1-g | 요구사항 NFR1(g)·12월 NFR3 | 오귀속 0건, 비뒷받침 1건 이하 | 오귀속 0, 비뒷받침 1 | 같음 | 빌드와 시험 | Met |
| NFR2 | 요구사항 NFR2 | 출처 단추를 누르면 카드의 그 줄이 강조되는 동작 유지 | `recipient.test.mjs`·`publications-owner.test.mjs`·`qna-sources.test.cjs`(S15) 통과 | 위 「시험」. Node에서만 확인했다(실제 브라우저 아님) | 빌드와 시험 | Met(Node 시험 근거, 실제 브라우저로는 보지 않음) |
| NFR3 | 요구사항 NFR3 | 새 로그 칸은 수와 이름만 | S9·S11·S17 시험 통과, 평가 기록 표가 수와 이름뿐 | 위 「시험」, 두 평가 기록 | 빌드와 시험 | Met |
| NFR4 | 요구사항 NFR4 | 보내는 줄 40줄 이하 | S3 시험 통과, 다시 재기에서 질문마다 16~18줄을 붙이지 못함(상한 동작) | 위 「시험」, `2026-11-16-remeasure.md` | 빌드와 시험 | Met |
| CI | Testing Contract | 이 계획에는 CI Pipeline 단계가 없다 | - | `aidlc-state.md`에 `ci-pipeline` 단계 없음 | - | N/A(the plan runs no CI Pipeline) |

## 실패 처리

- 실패 조건에 걸렸다. 목표 대조표에 `Not Met`가 넷 있다(TC-GREEN, NFR1-a, NFR1-b, NFR1-e).
- 팀장 결정(2026-11-16): 실패를 받아들인다(Accept failure). 그래서 코드 생성으로 되돌아가지 않았다.
  - (a)·(b)·(e)는 한계로 적고, 정한 대로 지시와 상한을 더 고치지 않는다. 기준을 낮춰 통과로 적지 않는다(12월 NFR3·#559).
  - 대조(fact)가 질문의 핵심 답 항목을 지우는 문제(3번 본 커밋 항목, 3·6번 첫 항목으로 추정)는 후속 이슈 #581로 넘긴다.
  - api 전체 시험 실패 4건은 이번 변경 밖의 환경·부하 문제다. 다시 돌린 결과로 통과를 확인했다.
- 되돌아간 기록(Loop-Back Log)은 없다.
