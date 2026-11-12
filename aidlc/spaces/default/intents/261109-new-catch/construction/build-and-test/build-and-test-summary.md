# 새 Catch — 빌드·시험 요약

## 상태

- **빌드:** api·web 린트·타입 검사·api 빌드가 모두 종료 코드 0이다. worker ruff·형식·mypy도 통과했다.
- **시험:**
  - 세 Unit의 Unit 시험 명령 11개가 모두 통과했다.
  - 전체 시험·커버리지도 통과했다.
    - api: 1,799 통과·0 실패·38 건너뜀. 건너뛴 것은 모두 실제 Redis가 필요한 시험이다.
    - web: 1,026개 통과.
    - worker: 2,636개 통과.
- **커버리지:** api 98.49%, web 93.65%, worker 96%다. 하한 80%를 모두 넘었다.
- **실제 연결:** 로컬 측정 환경에서 실제 키와 실제 GitHub로 쟀다.
  - NC3: TheMe LIVE 분석 한 번. 호출 수가 같고 실패 로그는 0줄이다. 사실 66줄이 모두 맞고, 버릴 규칙 셋을 찾아 껐다.
  - NC2: 질의응답 10개 재측정. 오귀속 0건이다.
- **이 단계에서 고친 코드:**
  - FR15.4 규칙 끄기(`ENABLED_KINDS`)
  - 되돌림 규칙을 끈 때 되돌림 쌍 처리(A2)
  - 평가 스크립트의 답 실패 기록
  - 각각 시험과 문서를 함께 고쳤다.

## 만든 시험 종류

| 종류 | 파일 |
|---|---|
| 빌드 안내 | `build-instructions.md` |
| 통합 시험(경계) | `integration-test-instructions.md` |
| Unit 사이 추적 | `cross-unit-traceability.md` |
| 결과·확인 표 | `test-results.md` |
| NC3 사람 대조 | `nfr4-1-human-check.md` |
| NC2 질의응답 재측정 | `nfr3-qna-measurement.md` |

시험 전략이 Standard라 성능·보안 시험 안내 파일은 따로 만들지 않았다. 성능·보안 목표는 확인 표의 각 행이 Unit 시험과 측정으로 확인한다.

## 커버리지 기대

- 서비스마다 줄 커버리지 80% 이상이다(Testing Contract). 서비스 전체 시험으로 잰다.
- Unit마다 따로 정한 커버리지 목표는 없다.
- Unit 명령의 커버리지(NC1·NC2 web 공통 함수, NC3 `revisit.py`)는 확인용이다.

## Target Verification Matrix

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| TC-COV-api·web·worker | Testing Contract | 80% 이상 | 98.49%·93.65%·96% | `test-results.md` 전체 시험 | build-and-test | Met |
| TC-CI | Testing Contract | CI에서 시험 | — | ci-pipeline `[ ]` EXECUTE | ci-pipeline | N/A — CI Pipeline, later in this plan, sets up CI to run these tests before merge |
| TC-UNIT·TC-BUILD | 세 Unit 시험 안내, 검증 명령 | 모두 통과 | 11개 명령과 린트·타입 종료 코드 0 | `test-results.md` | build-and-test | Met |
| NC1·NC2·NC3 NFR(Unit 시험으로 확인하는 43개) | 세 Unit nfr-requirements | 각 확인 방법 | 시험 통과·코드 확인 | `test-results.md` NFR 행 | build-and-test | Met |
| NC3 NFR1.1·1.3·4.1~4.3, FR15.4 | NC3 nfr-requirements, requirements | 측정 기준 | 호출 수 같음, 66줄 맞음, 실패 로그 0, 규칙 셋 버림 | `test-results.md` 실제 연결 측정 | build-and-test | Met |
| AC9.1.4, AC12.7·FR14.3 | stories, requirements | 실제 링크, 사본·조각에 사실 없음 | 팀장 확인, 0건 | `test-results.md`, `nfr3-qna-measurement.md` | build-and-test | Met |
| NFR3·FR11.2·AC8.1.3 | requirements, stories | 질의응답 재측정, 오귀속 0건 | 오귀속 0, 비뒷받침 0 | `nfr3-qna-measurement.md` | build-and-test | Met |
| AC8.1.1 | stories, FR11.1 | 「작성자는 …라고 적었다」+딱지 | 3·8번 딱지 없음, 1번 꼴 다름 | `nfr3-qna-measurement.md` | build-and-test | Not Met |
| AC8.1.2 | stories, FR11.1 | 기본 요약 같은 꼴+딱지 | 꼴 4/4, 딱지 0/6 | 같음 | build-and-test | Not Met |
| FR15.1~FR15.3·NC3 NFR7.4 | requirements, NC3 reliability-requirements | 함께 배포, 고지 승인, 초기화 전 병합 | 아직 | NC3 `traceability.json`(Deferred) | NC3 PR(이 계획에 맡을 단계 없음) | Unverified |

행마다의 판정은 `test-results.md`에 있다.

## 준비 상태

- **빌드 준비:** 됨.
- **시험 준비:** 됨. 실패한 명령은 없다. 확인 표의 Not Met 2행·Unverified 1행은 팀장이 Accept failure로 받았다(2026-11-12, `test-results.md` 「실패 처리」).
- **배포 준비:** 코드 쪽은 됨. 배포 단계는 이 계획 밖이다. 배포 때 지킬 것:
  - api·worker를 같은 배포에 넣고(결과 판본 "4"), 진행 중인 분석이 없을 때 배포하며, 마이그레이션을 먼저 적용한다.
  - 고지 4절 한 줄은 NC3 PR에서 팀장이 승인한다.
  - NC3 PR은 출시 직전 DB 초기화 전에 합친다.

## 알려진 한계·남은 일

- **AC8.1.1·AC8.1.2(받은 사람 AI 딱지):**
  - 원인: 답과 요약이 작성자 글을 인용 없는 AI 해석 항목으로 옮기면 '작성자 자료 원문' 딱지가 붙지 않는다. 항목 형식의 문제다.
  - 기본 요약 항목 5는 GitHub 기록을 작성자 주장처럼 썼다.
  - 팀장 결정(2026-11-12): AC8.1.2는 고치지 않고 불충족으로 기록한다. 이 기록과 NC3 PR 「수행하지 못한 검증」에 남기고 intent가 끝난 뒤 후속으로 다룬다.
- **질의응답 기록만 한 것:**
  - 5번은 답 실패(답 0개)다.
  - 7번은 병합 커밋을 변경으로 세지 않는다는 구분을 하지 못했다. 검색 조각에 「본인 커밋」 표시와 그 구분 문장이 없다.
  - 1·2번은 작성자 주장을 사실처럼 썼다.
- **PR·배포 때 확인할 것:** FR15.1~FR15.3, NC3 NFR7.4.
  - NC1·NC2·NC3 NFR1.1·1.2의 「PR 본문에 적는다」(GitHub·AI 호출 없음 등)도 이때 한다.
  - NC3 NFR7.3의 「리뷰 요청」에 함께 배포를 적는 것도 이때 한다.
  - NC3 PR에는 고지 4절 팀장 승인, api·worker 함께 배포, 판정 예외 한 곳(Q1 B)을 함께 적는다.
- **화면 시험:** Node에서 돌렸다(`react-dom/server`). 실제 브라우저로 본 것은 팀장이 측정 환경에서 본 실제 커밋 링크와 NC3 Unit 확인 때 본 화면뿐이다.
- **커버리지가 낮은 파일:** web `assets-connected.tsx` 21.14%다. 미리보기 두 파일은 시험이 불러오지 않는다. 서비스 하한에는 영향이 없다.
- **팀장 정리 몫:** 측정 환경(`~/catchu-local-live/nc3-measure/`, 컨테이너 `catchu-nc3-measure-db`·`-valkey`)이 남아 있다. 측정 원문 `api/.rag-eval/2026-11-12-measure.json`도 git 밖에 있다.
