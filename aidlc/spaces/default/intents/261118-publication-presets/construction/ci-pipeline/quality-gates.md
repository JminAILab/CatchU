# Quality Gates — 261118-publication-presets

근거: `ci-config.md`, `ci-pipeline-questions.md`(Q1 A), `.github/workflows/ci.yml`, `docs/CatchU_레포_컨벤션.md`(dev PR 승인 1건·merge commit), `construction/build-and-test/test-results.md`(Target Verification Matrix), Testing Contract `scope_floor`.

## 병합 전 관문(dev PR)

| 관문 | 판정 | 어디서 | Build and Test에서의 결과 |
|---|---|---|---|
| web lint·typecheck | 오류 0 | CI `web` | 통과 |
| web 전체 시험 | 실패 0 | CI `web`(`npm run check`) | 1,131건 통과 |
| web build·시작 확인 | 성공 | CI `web` | build 통과(시작 확인은 CI에서만) |
| api lint·typecheck | 오류 0 | CI `api` | 통과 |
| api 전체 시험(pgvector DB, 마이그레이션 포함) | 실패 0 | CI `api` | 1,994건 통과, 38건 조건부 건너뜀 |
| 문서 크기 | 상한 36,000 B 안 | CI `changes` | `web/README.md` 35,722 B |
| 의존성 감사 | 새 취약 의존성 없음 | CI | 새 의존성 없음 |
| 리뷰 승인 | 작성자 외 1건, merge commit | GitHub 보호 규칙 | dev PR에서 |

Testing Contract의 「고른 시험을 병합 전 CI에서 돈다」는 위 web·api 관문이 맡는다. 이 intent의 단위 명령에 든 시험 파일은 모두 그 범위 안이다.

## CI 밖의 관문(사람)

| 관문 | 판정 | 언제 |
|---|---|---|
| 줄 커버리지 80% | Build and Test 로컬 측정으로 판정(api 98.46%, web 92.87%). CI는 재지 않음(Q1 A) | Build and Test |
| 실제 브라우저 확인 | 팀장 확인(2026-11-22). 못 본 것: U3 다른 탭 출처 이동, 화면 낭독기 읽힘, U2 개발 모드, 자료 화면 거절 초점 | Build and Test, dev PR 본문에 적음 |
| dev PR 본문 | 배포 전 파일 지우기 안내(U1 NFR2.15), 받아들인 한계(320px 회원 머리글 넘침, U2 검토 Minor 1·3) | dev PR 작성 때 |
| 배포 전 파일 지우기 | `members/*/publications/`만, S3는 `--dryrun` 먼저 | main 배포 전 |
