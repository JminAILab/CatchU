# Catch 개편 — 빌드·시험 요약

## 상태

- **빌드:** api·web 빌드 종료 코드 0, worker 린트·타입 검사 통과.
- **시험:**
  - 세 Unit의 Unit 시험 명령 7개가 모두 통과했다.
  - 전체 시험·커버리지도 모두 통과했다: api 1,758 pass·0 fail, web 905, worker 2,581.
  - 첫 실행에서 CR과 관계없는 기동 시험 1건이 시간 초과로 실패했다. 다시 돌려 통과했다(`test-results.md`).
- **커버리지:** api 98.39%, web 95.45%, worker 96%. 하한 80%를 모두 넘었다.
- **실제 연결:** Unit마다 로컬 실제 분석으로 확인했다. CR1은 다섯 가지, CR3은 FR10 확인 20개, CR2는 같은 저장소 세 번 분석이다.

## 만든 시험 종류

| 종류 | 파일 |
|---|---|
| 빌드 안내 | `build-instructions.md` |
| 통합 시험(경계) | `integration-test-instructions.md` |
| Unit 사이 추적 | `cross-unit-traceability.md` |
| 결과·확인 표 | `test-results.md` |

시험 전략이 Standard라 성능·보안 시험 안내 파일은 따로 만들지 않았다. 성능·보안 목표는 확인 표의 각 행이 Unit 시험으로 확인한다.

## 커버리지 기대

- 서비스마다 줄 커버리지 80% 이상(Testing Contract). 서비스 전체 시험으로 잰다.
- Unit마다 따로 정한 커버리지 목표는 없다. CR3 판정 패키지는 CR3에서 줄 100%를 쟀다.

## Target Verification Matrix

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| TC-COV-api·web·worker | Testing Contract | 80% 이상 | 98.39%·95.45%·96% | `test-results.md` 전체 시험 | build-and-test | Met |
| TC-CI | Testing Contract | CI에서 시험 | — | ci-pipeline SKIP | — | N/A — the plan runs no CI Pipeline |
| TC-UNIT | 세 Unit 시험 안내 | 모두 통과 | 7개 명령 종료 코드 0 | `test-results.md` | build-and-test | Met |
| CR1 NFR 7개 | CR1 nfr-requirements | 각 확인 기준 | 모두 충족 | `test-results.md` CR1 표 | build-and-test | Met |
| CR2 NFR 19개 | CR2 nfr-requirements | 각 확인 기준 | 모두 충족 | `test-results.md` CR2 표 | build-and-test | Met |
| CR3 NFR 19개 | CR3 nfr-requirements | 각 확인 기준 | 모두 충족 | `test-results.md` CR3 표 | build-and-test | Met |

행마다의 판정은 `test-results.md`에 있다. `Not Met`·`Unverified`는 없다.

## 준비 상태

- **빌드 준비:** 됨.
- **시험 준비:** 됨.
- **배포 준비:** 코드 쪽은 됨. 배포 단계는 이 계획 밖이다. 배포 때 지킬 것은 아래와 같다.
  - CR2: api·worker를 같은 배포에 넣고, 진행 중인 분석이 없을 때 배포하며, 마이그레이션을 먼저 적용한다.
  - CR3: 판정 키·`claude` 공급자 설정은 고지 v3 배포 뒤에만 넣는다.
  - 상세는 각 Unit 코드 요약 「운영에 넣을 때」와 `worker/docs/generation-judgement.md`에 있다.

## 알려진 한계·남은 일

- **Unit 사이 추적:** NFR7(문서 크기)이 추적 연결에서 빠졌다. 세 Unit의 NFR7.1이 「기술 선택」 파일에 있어 비기능 설계 추적표로 이어지지 않았다. 문서 크기 검사는 통과했다(`cross-unit-traceability.md`).
- **화면 시험:** Node에서 돌렸다. 실제 브라우저 시험은 없고, 화면은 팀장이 로컬 실제 분석 때 브라우저로 봤다.
- **CR2 「같은 PR에 커밋이 더해진」 경우:** 합성 시험 W3으로 갈음했다.
- **팀장 정리 몫:** CR3 FR10 확인표 원문(`~/catchu-local-live/cr3-fr10/`)과 cr1 로컬 환경이 남아 있다.
- **각 Unit 코드 요약의 「한계」:** CR2의 1 MiB 응답 상한, CR3의 OpenAI 기본 보관 등.
