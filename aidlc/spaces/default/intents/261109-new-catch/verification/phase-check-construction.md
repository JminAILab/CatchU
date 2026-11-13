# 새 Catch — Construction 마무리 점검

**판정: 받은 실패가 있는 통과**(2026-11-12, CI Pipeline Q2 A).
- 세 Unit은 모두 만들어 시험했다.
- Unit 사이 추적 관문은 통과하지 못했다. 남은 세 행은 팀장이 Build and Test에서 Accept failure로 받았고, 처리 자리가 아래처럼 정해져 있다.
- 이 계획의 Operation 단계는 모두 SKIP이라, 이 점검 뒤로 이어지는 단계가 없다.

## Unit

| Unit | 코드 생성 추적표 | OK | Deferred | 미해결 | Deferred의 처리 |
|---|---|---|---|---|---|
| NC1 `nc1-sections-and-links` | `construction/nc1-sections-and-links/code-generation/traceability.json` | 112 | 0 | 0 | — |
| NC2 `nc2-snapshot-fields` | `construction/nc2-snapshot-fields/code-generation/traceability.json` | 65 | 1 | 0 | AC8.1.3: Build and Test에서 확인(오귀속 0건) |
| NC3 `nc3-revisit-facts` | `construction/nc3-revisit-facts/code-generation/traceability.json` | 61 | 2 | 0 | NFR4.1: Build and Test에서 확인(66줄 맞음). NFR7.4: 받은 실패, 아래 표 |

- 세 Unit 모두 코드 생성·Unit 확인을 승인받았다.
- 세 Unit의 Unit 시험 명령 11개와 서비스별 전체 시험이 Build and Test에서 통과했다(`construction/build-and-test/test-results.md`).

## Unit 사이 추적 관문

- 도구 판정은 `pass: false`다(`construction/build-and-test/cross-unit-traceability.md`).
- 덮이지 않은 10개 가운데 FR11.2·FR15.4·NFR3·NFR4·AC8.1.3은 Build and Test 측정으로 확인했다.
- 남은 것은 FR11.1(AC8.1.1·AC8.1.2), FR15.1~FR15.3, NFR7(NFR7.4)이다.

## 받은 실패와 처리 자리 (팀장 결정 2026-11-12)

| 행 | 처리 자리 |
|---|---|
| FR15.1 | 진행 중인 분석이 없을 때 api·worker를 함께 배포한다(배포 때 확인) |
| FR15.2 | 고지 4절 문구와 작업 시각을 넣을지는 NC3 PR에서 팀장이 승인한다 |
| FR15.3·NFR7.4 | 출시 직전 DB 초기화 전에 NC3 PR을 통합 브랜치에 병합한다 |
| AC8.1.1·AC8.1.2 | intent가 끝난 뒤 후속 이슈 하나로 넘긴다. 아래 두 가지를 담는다 |

AC8.1.1·AC8.1.2 후속 이슈에 담을 것:
1. 따옴표로 글자 그대로 옮긴 작성자 글은, 코드가 작성자 자료에서 그 글을 찾아 인용을 붙이게 고친다. 질의응답 3·8번이 이 경우다.
2. 기본 요약이 작성자 주장을 인용 항목으로 내도록 지시와 형식을 고친다. 요약 항목 5가 GitHub 기록을 작성자 주장처럼 쓴 것도 넣는다.

## CI 관문과 Build and Test 명령

- CI(`dev-ci`)는 Build and Test가 기록한 린트·타입·시험 명령을 같은 형태로 돌린다.
  - 커버리지는 CI가 재지 않고 Build and Test가 잰다.
  - 대응표는 `construction/ci-pipeline/quality-gates.md`에 있다.
- `dev` 병합 전에는 필수 검사 다섯 개가 막는다.
- 통합 브랜치에는 보호 규칙이 없다. 그래서 Unit PR은 CI 통과를 확인한 뒤 합친다.

## Sources

- 세 Unit `code-generation/traceability.json`
- `construction/build-and-test/cross-unit-traceability.md`, `test-results.md`, `build-and-test-summary.md`
- `construction/ci-pipeline/ci-config.md`, `quality-gates.md`, `ci-pipeline-questions.md`(Q2 A와 덧붙임)
- `aidlc-state.md` 「Stage Progress」
