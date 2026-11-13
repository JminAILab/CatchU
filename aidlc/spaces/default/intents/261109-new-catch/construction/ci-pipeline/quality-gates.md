# 새 Catch — 품질 관문

이 intent는 새 관문을 만들지 않는다(Q1 A). 아래는 이 intent의 변경이 지나는 관문과, 관문마다 무엇이 막고 누가 확인하는지다.

## 관문

| 관문 | 어디서 | 막는 것 | 막는 방식 |
|---|---|---|---|
| G1 Unit 확인 | 로컬, Unit 체크포인트 | Unit 시험·intent 검증 명령 실패 | AI-DLC Unit 확인(60분 상한, 충전기·부하 확인) |
| G2 Build and Test | 로컬, 이 intent의 Build and Test | 서비스별 전체 시험 실패, 줄 커버리지 80% 미만, NFR·측정 목표 미충족 | 팀장 승인 관문. 이번에는 받은 실패 세 행이 있다(아래 「받은 실패」) |
| G3 Unit PR → 통합 브랜치 | GitHub `dev-ci` | 린트·타입·시험·빌드·문서 크기·의존성 취약점 | 통합 브랜치에 보호 규칙이 없어 자동으로 막지 않는다. Unit PR은 CI 통과를 확인한 뒤 합친다(팀장 운영 메모) |
| G4 통합 브랜치 → `dev` | GitHub `dev-ci` | G3과 같음 | 필수 검사 다섯 개(`changes`·`web`·`api`·`worker`·`deps-audit`), PR 승인 1건, merge commit만 |
| G5 `dev` → `main` | GitHub `images.yml` | 운영 이미지·배포 스크립트 이상 | `main` PR 검사 |

## 검사와 Build and Test 명령의 대응

Build and Test가 기록한 명령을 CI가 어떻게 돌리는지:

| Build and Test 명령 | CI |
|---|---|
| `npm --prefix api run lint` · `typecheck` | `api` job `npm run lint` · `npm run typecheck` |
| `npm --prefix api run test:coverage` | `api` job `npm test`(같은 시험, 커버리지 없이) + `test/analysis/shared-fixtures.check.cjs` |
| `npm --prefix web run lint` · `typecheck` · `test:coverage` | `web` job `npm run check`(린트·타입·시험·빌드·기동) |
| `uv run --locked ruff check .` · `ruff format --check .` · `mypy` · `pytest --cov` | `worker` job 같은 명령(`pytest`는 커버리지 없이) |
| 문서 크기 확인 | `changes` job `check-doc-sizes.sh` |

- 커버리지 하한 80%는 CI가 재지 않는다. Build and Test(G2)가 잰다.
- Testing Contract의 「병합 전에 CI에서 시험을 돌린다」는 G3·G4가 지킨다.

## 받은 실패 (G2, 팀장 Accept failure 2026-11-12)

| 행 | 처리 자리 |
|---|---|
| FR15.1 | 진행 중인 분석이 없을 때 api·worker를 함께 배포한다(배포 때 확인) |
| FR15.2 | 고지 4절 문구와 작업 시각을 넣을지는 NC3 PR에서 팀장이 승인한다 |
| FR15.3·NFR7.4 | 출시 직전 DB 초기화 전에 NC3 PR을 통합 브랜치에 병합한다 |
| AC8.1.1·AC8.1.2 | intent가 끝난 뒤 후속 이슈 하나로 넘긴다. 아래 「후속 이슈에 넣을 것」 |

**후속 이슈에 넣을 것:**
1. 따옴표로 글자 그대로 옮긴 작성자 글은, 코드가 작성자 자료에서 그 글을 찾아 인용을 붙이게 고친다. 질의응답 3·8번이 이 경우다.
2. 기본 요약이 작성자 주장을 인용 항목으로 내도록 지시와 형식을 고친다. 요약 항목 5가 GitHub 기록을 작성자 주장처럼 쓴 것도 여기에 넣는다.

## Sources

- `ci-config.md`
- `construction/build-and-test/test-results.md` 「Target Verification Matrix」·「실패 처리」
- `ci-pipeline-questions.md` Q1 A·Q2 A와 덧붙임
- `docs/CatchU_레포_컨벤션.md`(브랜치·병합 규칙), `aidlc/spaces/default/memory/team.md` 「Way of Working」
