# Build Instructions — 261118-publication-presets

근거: 네 단위의 `code-generation/unit-test-instructions.md`·`code-summary.md`(u1-preset-contract·u2-applicant-screens·u3-reader-views·u4-privacy-policy), 단위 확인 명령(`aidlc-state.md`의 Unit 확인 명령), `api/package.json`·`web/package.json`, `api/scripts/test-with-db.cjs`.

이 intent는 api와 web만 바꾼다. worker·인프라·CI 설정은 바꾸지 않는다.

## 준비

| 항목 | 내용 |
|---|---|
| Node | 저장소의 지금 판(각 서비스 README) |
| 의존성 | `npm --prefix api ci`, `npm --prefix web ci`. 이 intent는 새 의존성을 들이지 않았다 |
| 시험 DB | pgvector가 있는 로컬 PostgreSQL. 이 기계에서는 `catchu-db-test`(127.0.0.1:5433). 파일을 골라 돌리는 단위 명령은 `TEST_DB_PORT=5433`을 붙인다(`api/.env`의 5435에는 pgvector가 없다). 실행기가 마이그레이션을 먼저 적용한다 |
| 환경변수 | 새 환경변수 없음. 비밀값을 명령·문서에 적지 않는다 |
| 배포 전 사람이 할 일 | U1 마이그레이션이 변경 전 발행본 행을 지운다. 발행본 파일(`members/*/publications/`)은 사람이 지운다(U1 NFR2.15, S3는 `--dryrun`으로 먼저 목록 확인). 이 안내는 dev PR 본문에 적는다 |

## 빌드

```bash
npm --prefix api run lint
npm --prefix api run typecheck
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run build
```

api 빌드(`tsc`)는 `npm --prefix api test`·`test:coverage`가 먼저 돌린다.

## 빌드 확인

- 위 명령이 모두 0으로 끝난다.
- `web run build`가 `/presets`·`/presets/new`·`/presets/[presetId]`·`/privacy` 경로를 만든다.

## 전체 시험과 커버리지

```bash
npm --prefix api run test:coverage
npm --prefix web run test:coverage
```

두 명령은 단위 확인 명령에 든 것과 같다. 커버리지 문턱 설정은 저장소에 없고, 범위(mvp) 바닥 80% 줄 커버리지를 각 명령 출력 맨 아래 「all files」 줄로 판정한다.

## 자주 걸리는 것

| 증상 | 원인과 조치 |
|---|---|
| api 시험이 `vector` 형식 오류로 멈춤 | 5435 DB를 씀. `TEST_DB_PORT=5433` |
| 배터리로 돌 때 api 시험 도중 멈춤 | 충전기를 꽂고, 부하(1분 평균 6 미만)를 본 뒤 돌린다(프로젝트 규칙) |
| web 시험에서 Map 펼치기 결과가 빈 배열 | 시험이 tsx를 ES5로 바꾼다. `Array.from`을 쓴다(U3 코드 요약) |
