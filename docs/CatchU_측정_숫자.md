# CatchU 측정 숫자 — 커버리지·분석 한 건·이용 수 (2026-11-16)

> 지위: **기록**. 이력서·면접에서 말할 숫자를 잰 날·판본·명령·한계와 함께 한곳에 모았다([#566](https://github.com/JminAILab/CatchU/issues/566)). 숫자는 그 날·그 판본·그 명령에서만 맞다. 다시 재면 날짜와 함께 행을 더하고 앞선 행은 고치지 않는다.
> 품질 목표 달성이나 배포 환경(EKS) 성능을 확인한 문서가 아니다. 커버리지는 로컬에서 쟀고, 분석 한 건은 팀장 PC에서 실제 GitHub·Claude로 한 번 돌린 값이다.

## 1. 한눈에

| 숫자 | 값 | 잰 날·판본 | 말할 때 붙일 조건 |
|---|---|---|---|
| api 시험 커버리지 | 줄 98.68%(분기 90.30%, 함수 97.74%), 시험 1,923개 | 2026-11-16, `dev` `61ce82b4` | 컴파일한 JS 기준이다. 실제 Claude·Voyage를 부르는 시험 2개는 건너뛰었다. 시험이 불러오지 않은 파일(4개, 17줄)을 0%로 넣어도 약 98.6% |
| web 시험 커버리지 | 줄 93.37%(분기 90.37%, 함수 88.24%), 시험 1,059개 | 같음 | 화면 파일 57개(전체 줄의 11%)가 빠진 값이다. 0%로 넣으면 약 83%. 실제 브라우저 시험이 아니다 |
| worker 시험 커버리지 | 97%(실행문 9,613개 중 296개 빠짐), 시험 2,753개 | 같음 | 불러오지 않은 파일도 0%로 넣은 값이다. 커버리지를 켜면 큐 소비자 시험 4개가 시간 초과로 실패한다(끄면 통과) |
| 분석 한 건의 시간 | 접수부터 반영까지 27분 6초 | 2026-11-14, `dev` `5ded74b8` + 총량 상한 128MB | CatchU 저장소(커밋 1,636·PR 363) 한 건, 팀장 PC 로컬. 작은 저장소는 20초\~9분이었다 |
| 분석 한 건의 Claude 비용 | 약 0.28달러(Catch 199개, 개당 약 0.0014달러) | 같음 | 생성(Claude Haiku 5.5)만 센 값이다. 판정(OpenAI)·서버 비용은 들어 있지 않다 |
| 실제 이용 수 | 아직 세지 않음 | 12/8과 자원 삭제 직전에 센다(5절) | 탈퇴한 회원과 14일 지난 질문은 셀 수 없다 |

## 2. 시험 커버리지

세 서비스는 세는 방식이 달라 숫자를 서로 바로 비교하지 않는다. api·web은 시험이 한 번도 불러오지 않은 파일을 표에서 빼고, worker는 0%로 넣는다.

판본은 `dev` `61ce82b4`(커밋하지 않은 변경 없음), 실행은 2026-11-16 macOS 로컬이다. 의존성은 잠금 파일대로 새로 설치했다(`npm ci`, `uv sync --locked`). CI는 커버리지를 재지 않는다.

| 서비스 | 명령(서비스 폴더에서) | 시험 결과 | 맨 아래 줄 | 걸린 시간 |
|---|---|---|---|---|
| api | `CATCHU_TEST_REDIS_URL=<시험용 Valkey> npm run test:coverage` | 1,923개 중 1,920 통과·0 실패·3 건너뜀 | `all files` 줄 98.68%·분기 90.30%·함수 97.74% | 452초 |
| web | `npm run test:coverage` | 1,059개 모두 통과 | `all files` 줄 93.37%·분기 90.37%·함수 88.24% | 16초 |
| worker | `CATCHU_TEST_REDIS_URL=<시험용 Valkey> uv run --locked pytest --cov --cov-report=term-missing` | 2,746 통과·4 실패·3 건너뜀 | `TOTAL` 97%(실행문 9,613개 중 296개 빠짐) | 683초 |

시험용 DB는 `pgvector/pgvector:0.8.7-pg16-trixie`, 시험용 큐는 `valkey/valkey:8.1.6-alpine` 컨테이너다(api README 「DB 테스트」, api `docs/analysis-queue.md` 「시험」의 명령).

**이 숫자에 들어가지 않은 것**

- api
  - 시험이 한 번도 불러오지 않은 파일 4개(`dist/` 300개 가운데, 합쳐 17줄). 타입만 있는 파일 3개와 마이그레이션 명령이 따로 불러오는 `database/data-source.js`다. 0%로 넣어 다시 계산해도 약 98.6%다(파일 줄 수로 어림한 값).
  - 표는 컴파일한 `dist/`의 JS 기준이다. `src/`의 TypeScript 줄 수와 다르다.
  - 실제 Claude·Voyage를 부르는 시험 2개는 키가 없어 건너뛰었다(나머지 1개는 지금 스키마로는 만들 수 없는 탈퇴 경우다). 실제 GitHub·Google 연결도 시험에 없다.
  - `dist/`를 다시 만드는 시험(`test/db/build-output.test.cjs`)은 먼저 따로 돌고 표에 들지 않는다.
- web
  - 시험이 한 번도 불러오지 않은 파일 57개(`src/` 197개 가운데, 줄 수로 11%). 대부분 페이지·레이아웃과 로그인·프로필·헤더 같은 화면 컴포넌트다. 0%로 넣어 다시 계산하면 약 83%다(파일 줄 수로 어림한 값).
  - 시험은 Node에서 `react-dom/server`로 그린 글자를 본다. 실제 브라우저에서 누르고 입력하는 동작은 재지 않는다.
- worker
  - 실제 GitHub·Claude·OpenAI 호출은 없다. 합성 응답과 가짜 HTTP 전송으로 돈다.
  - 강제 종료로 끝난 자식 프로세스의 실행은 저장되지 않아 그만큼 낮게 나온다.
  - 비율은 줄이 아니라 실행문 기준이다(빈 줄·주석은 세지 않는다).

**worker 시험 4개가 커버리지를 켰을 때만 실패한다.** 모두 큐 소비자가 자식 프로세스를 띄우고 5\~10초 안에 반응을 기다리는 시험이다(`test_consumer_processor.py`의 부모 종료 1개, `test_consumer_redis.py`의 종료 신호 2개와 부모 종료 1개). 같은 판본에서 커버리지 없이 돌리면 2,750개가 모두 통과한다(3개 건너뜀, 250초). 커버리지를 켜면 큐 소비자 모듈을 불러오는 데 약 1초가 약 10초로 늘어 대기 시간을 넘긴다(2026-11-16 이 컴퓨터에서 잰 값). 97%는 이 4개가 중간에 멈춘 채로 잰 값이라 조금 낮게 나왔을 수 있다. 시험을 고치는 일은 이 문서 범위가 아니다.

**앞선 측정과의 차이**: 2026-11-11\~12 새 Catch 작업의 [빌드·시험 결과](../aidlc/spaces/default/intents/261109-new-catch/construction/build-and-test/test-results.md)는 api 98.49%·web 93.65%·worker 96%였다. 그 뒤 서비스 코드 커밋이 api 7·web 13·worker 7개 더 들어왔다. 그때 api는 실제 큐 시험 38개를, worker는 실제 Redis 시험을 건너뛰었고 이번에는 둘 다 돌렸다.

## 3. 분석 한 건의 시간과 비용

대표 숫자는 2026-11-14 CatchU 저장소 실측이다(2026-11-16 팀장 결정). 출처는 [#480의 측정 댓글](https://github.com/JminAILab/CatchU/issues/480#issuecomment-6858512396)과 [#450의 실측 기록](https://github.com/JminAILab/CatchU/issues/450#issuecomment-6858511860)이다.

| 항목 | 값 |
|---|---|
| 대상 | 공개 저장소 `JminAILab/CatchU`(커밋 1,636·PR 363·이슈 183) |
| 판본·환경 | `dev` `5ded74b8`에 총량 상한 128MB([#547](https://github.com/JminAILab/CatchU/pull/547))를 더한 판본. 팀장 PC(macOS) 로컬, 실제 GitHub·Claude·OpenAI 연결. EKS가 아니다 |
| 걸린 시간 | 접수부터 반영까지 27분 6초. worker 처리 1,619초 = 수집 645초 + 생성·판정 974초 |
| GitHub 호출 | 1,155회, 받은 양 약 78MB |
| Claude 호출 | `claude-haiku-5-5` 198회, 입력 1,949,553토큰·출력 116,983토큰(호출당 평균 입력 약 9,850·출력 약 590토큰) |
| 판정 호출 | OpenAI 307회(Catch 판정 198 + 재료 판정 109) |
| 결과 | Catch 199개, 부분 실패 2(질문 형식 위반) |

**Claude 비용 계산식**

- 단가: Claude Haiku 5.5 입력 100만 토큰당 0.10달러, 출력 100만 토큰당 0.50달러. worker가 추론 위치를 미국으로 고정해(`inference_geo="us"`, `worker/app/generation/claude.py`) 1.1배가 붙는다. [F 실제 결과 검수 기록](CatchU_F실제결과_검수기록.md) 「실행」과 같은 단가다.
- 입력: 1,949,553 × 0.10 ÷ 1,000,000 = 0.1950달러
- 출력: 116,983 × 0.50 ÷ 1,000,000 = 0.0585달러
- 합계: (0.1950 + 0.0585) × 1.1 = **0.2788달러, 약 0.28달러**
- Catch 하나에 약 0.0014달러(0.2788 ÷ 199)다.

**한계**

- 한 번 잰 값이다. 같은 저장소를 다시 재도 Claude 응답 길이에 따라 달라진다.
- 큰 저장소 한 곳의 값이다. 10월 판본(판정 없음)으로 작은 저장소 5곳을 8번 돌렸을 때는 Claude 호출 0\~159회, 건당 약 0.09달러 이하였고([F 실제 결과 검수 기록](CatchU_F실제결과_검수기록.md) 「실행」), 걸린 시간은 20초\~9분이었다([#480](https://github.com/JminAILab/CatchU/issues/480) 본문의 로컬 실측).
- 판정(OpenAI) 비용은 없다. 판정 호출의 토큰 합을 기록하지 않았다.
- 서버·DB·임베딩(Voyage) 비용은 들어 있지 않다.
- 단가와 1.1배는 2026-11-16에 Anthropic 가격 안내(platform.claude.com 문서의 Pricing)와 대조했다. 입력이 10만 토큰을 넘는 호출은 단가가 5배지만 호출당 평균 입력이 약 9,850토큰이라 해당하지 않는 것으로 계산했다(호출별 최댓값은 기록에 없다).

## 4. 질문 한 번의 시간과 토큰

잰 값이 없다. 받은 사람의 질문 한 번은 api 로그에만 남는다.

- `qna.completed` 줄: 질문 고쳐 쓰기 시간과 토큰, 검색 시간, 답 생성 시간(`api/src/rag-answer/rag-answer-log.ts`)
- `ai_gate_result` 줄: 답 생성의 입력·출력 토큰과 걸린 시간(`api/src/ai-generation/checked-gate.ts`)

숫자가 필요하면 5절의 세는 날에 로그에서 이 두 줄을 함께 읽는다. 새 기록 장치는 만들지 않는다.

## 5. 실제 이용 수 — 언제 어떻게 셀지

지금은 세지 않았다. 개발 서버의 가입·자료는 EKS로 옮기지 않으므로([전환 절차](../deploy/aws/cutover.md)) 세는 대상은 EKS로 옮긴 뒤의 이용이다.

**남는 것과 사라지는 것**

| 셀 것 | 어디에 남나 | 사라지는 때 |
|---|---|---|
| 가입(회원 수) | DB `member_account` 행. 가입 시각 열은 없다 | 회원이 탈퇴하면 행이 지워진다 |
| 분석 | DB `analysis_request`(접수 시각 `submitted_at`)와 `analysis_attempt`(끝난 상태) | 회원 탈퇴 때 함께 지워진다 |
| Catch | DB `catch_asset` | 같음 |
| 발행 | DB `publication`(발행 시각 `published_at`) | 같음. 발행을 중지해도 행은 남는다 |
| 질문 | api 로그의 `qna.completed` 줄(CloudWatch 로그 그룹 `/catchu/eks/app`) | 14일 뒤. 하루 횟수 계수기(Redis)는 한국 시간 자정에 지워져 쓰지 않는다 |
| 링크 열람 | 남기지 않는다 | 셀 수 없다. 세는 기능을 만들지 않는다 |

제출 확인 뒤 자원을 지우면 DB와 로그가 모두 없어진다([배포 안내](../deploy/aws/README.md) 「삭제 순서」).

**세는 날**

1. **12/8(화)**, 동결 전날. 조회만 하므로 서비스에 영향이 없다.
2. **자원 삭제 직전**. 이 값을 마지막 값으로 쓴다.
3. 질문은 로그가 14일만 남는다. 동료에게 링크를 알린 날이 11/24보다 이르면, 알린 날부터 13일째에 질문 수만 한 번 더 센다.

센 값은 이 문서 1절 표에 날짜와 함께 행으로 더한다. 회원을 알아볼 수 있는 값(계정 주소·회원 ID·저장소 이름)은 적지 않는다.

**세는 방법**

DB는 읽기만 하는 아래 SQL을 쓴다. EKS에서는 이 내용을 `deploy/aws/db/` 아래 `.sql` 파일로 두고 DB 관리 Pod로 실행한다([k8s 안내](../deploy/aws/k8s/README.md) 「DB 관리 Pod」).

```sql
-- 회원 수(지금 남아 있는 회원)
SELECT count(*) AS members FROM member_account;
-- 실제 분석 수: 끝난 상태별, 분석한 회원 수
SELECT a.processing, count(*) AS requests, count(DISTINCT r.member_id) AS members
  FROM analysis_request r JOIN analysis_attempt a ON a.attempt_id = r.current_attempt_id
 WHERE a.source_mode = 'LIVE' GROUP BY a.processing ORDER BY a.processing;
-- Catch 수와 Catch가 있는 회원 수
SELECT count(*) AS catches, count(DISTINCT owner_id) AS members FROM catch_asset;
-- 발행 수와 발행한 회원 수
SELECT count(*) AS publications, count(DISTINCT member_id) AS members FROM publication;
```

질문 수는 CloudWatch Logs Insights에서 로그 그룹 `/catchu/eks/app`, 기간 14일로 센다.

```
filter @message like /qna\.completed/ | stats count() as questions
```

**이 숫자의 한계**

- 팀원 4명과 시험 계정이 섞여 있다. 빼려면 팀원이 자기 계정 수를 알려 줘야 한다.
- 탈퇴한 회원의 가입·분석·발행은 세어지지 않는다.
- 가입 시각이 없어 날짜별 가입 수는 낼 수 없다. 분석·발행은 시각 열로 날짜별 수를 낼 수 있다.
- 질문 수는 스트림을 연 질문만 센다(열기 전 거부는 `qna.rejected`로 따로 남는다). api 로그 형식이 바뀌면 검색 글자도 바꿔야 한다.
- SQL은 로컬 시험 DB의 표·열 이름으로 확인했고, EKS에서 실행해 보지는 않았다.

## 6. 재지 못한 것

| 무엇 | 이유 |
|---|---|
| 판정(OpenAI) 비용 | 2026-11-14 실측 기록에 판정 호출의 토큰 합이 없다. worker 로그에는 호출마다 입력·출력 토큰이 남으므로(`판정 공급자 응답` 줄) 다음 실측 때 함께 더하면 된다 |
| 질문 한 번의 시간·토큰 | api 로그에만 남고 모아 둔 값이 없다(4절) |
| EKS에서의 분석 시간 | 2026-11-14 실측은 로컬이다. EKS 측정은 [#480](https://github.com/JminAILab/CatchU/issues/480)의 남은 완료 기준이다 |
| 실제 이용 수 | 5절의 날에 센다 |
| 실제 브라우저에서의 web 동작 범위 | 브라우저 시험 도구를 쓰지 않는다 |
