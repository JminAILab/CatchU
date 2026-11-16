# 빌드 안내 — #559 받은 사람 질의응답 고치기

> **먼저 볼 것(코드 생성 리뷰 R-04):** `api/test/rag-answer/qna-controller.test.cjs`는 테스트 DB가 필요하다. 코드 생성 단계의 시험 안내(`construction/code-generation/unit-test-instructions.md`)에 적힌 「이 범위의 시험은 DB를 쓰지 않는다」는 틀린 문장이다. 그 파일을 돌릴 때는 아래 「테스트 DB」를 켜고, 범위 시험 명령 앞에 `DB_HOST=127.0.0.1 DB_PORT=5433 DB_USER=catchu DB_PASSWORD=catchu_local DB_NAME=catchu_test`를 붙인다. 이 값은 README 「DB 테스트」의 로컬 기본값이고 비밀값이 아니다.

## 준비

- Node와 npm은 저장소가 쓰는 판본이다(`api/package.json`·`web/package.json`).
- 의존성은 잠금 파일 그대로 설치한다. 새 의존성은 없다.

  ```bash
  npm --prefix api ci
  npm --prefix web ci
  ```

- 테스트 DB: README 「DB 테스트」의 로컬 컨테이너 `catchu-db-test`(127.0.0.1:5433, pgvector 이미지). 이미 있으면 `docker start catchu-db-test`로 켠다. `npm --prefix api test`가 마이그레이션을 적용하고 두 DB(`catchu_test`와 둘째 DB)를 쓴다.
- 다른 세션이 쓰는 컨테이너(예: `catchu-db-test-sec3`, 5441)는 건드리지 않는다.

## 빌드

```bash
npm --prefix api run build
npm --prefix web run build
```

- api: `dist/`를 지우고 `src/`를 다시 컴파일한다. api 시험은 `dist/`를 불러오므로 시험 전에 빌드한다.
- web: Next.js 운영 빌드.

## 빌드 확인

```bash
npm --prefix api run lint
npm --prefix api run typecheck
npm --prefix web run lint
npm --prefix web run typecheck
```

## 시험

1. 범위 시험(코드 생성 단계 안내의 명령 그대로, api는 테스트 DB 값을 붙임)

   ```bash
   DB_HOST=127.0.0.1 DB_PORT=5433 DB_USER=catchu DB_PASSWORD=catchu_local DB_NAME=catchu_test node --test api/test/u2/ai-gate-checks.test.cjs api/test/u2/ai-gate-stream.test.cjs api/test/ai-generation/citation-request.test.cjs api/test/rag-answer/qna-sources.test.cjs api/test/rag-answer/qna-controller.test.cjs api/test/rag-answer/rag-eval.test.cjs api/test/rag-answer/summary-sources.test.cjs
   node --test web/test/rag-answer-item-title.test.mjs web/test/rag-answer-api.test.mjs web/test/rag-answer-state.test.mjs web/test/rag-answer-sse-reader.test.mjs web/test/recipient.test.mjs web/test/publications-owner.test.mjs
   ```

2. 전체 시험(기존 시험이 깨지지 않았는지, bugfix 범위의 의무)

   ```bash
   npm --prefix api test
   npm --prefix web test
   ```

   worker는 이번 일에서 바꾸지 않았으므로 돌리지 않는다.

3. 질문 10개 다시 재기(요구사항 NFR1): 실제 Claude·Voyage를 부르므로 팀장 확인 뒤에 한 번만 돈다. 방법은 기준선과 같다.
   - 키와 측정 DB 값은 `~/catchu-local-live/secrets.env`와 `~/catchu-local-live/nc3-measure/db.env`를 셸에 불러와 쓴다. 파일을 복사하거나 새로 만들지 않고, 값을 화면에 찍지 않는다.
   - 측정 DB는 `catchu-nc3-measure-db`(127.0.0.1:55470)다.
   - 같은 날 기준선(`2026-11-16-baseline`)이 있으므로 나온 기록 이름을 다시 재기용으로 바꾼다.

   ```bash
   npm --prefix api run rag-eval -- measure --input /Users/ljm/Desktop/github/CatchU/api/.rag-eval/nc3-bt-input.json --target <커밋>-remeasure
   ```

## 막힐 때

- `Error: DB 설정이 없습니다`: 테스트 DB 값을 붙이지 않았다. 위 환경변수를 붙인다.
- `relation "member_account" does not exist`: 마이그레이션 없이 시험 파일을 따로 돌렸다. `npm --prefix api test`로 돌린다(마이그레이션을 먼저 적용한다).
- `measure 모드는 CATCHU_GENERATION_API_KEY가 있어야 합니다`: 키 파일을 셸에 불러오지 않았다.
