# U7 저장소·분석 — 코드 구현과 검증 기록

## 결과와 판정 범위

2026-10-29, 담당 leechaeah, [이슈 #424](https://github.com/JminAILab/CatchU/issues/424). 기준 HEAD는 `5551cf8c43a468d71293932979c856e9a18132ab`이며 아래 결과는 그 위의 미커밋 U7 변경을 검사한 것이다. 현재 브랜치는 `intent/260925-intent-12`다. 커밋·푸시·PR·원격 CI·배포·병합은 수행하지 않았다.

공개 저장소 직접 등록, 요청별 불변 동의 범위, 하루 제한 소비 경계, 본인 커밋 관측, 기존 모달의 결과 확인을 구현했다. 자동 검사는 합성 외부 응답과 전용 PostgreSQL·Valkey를 사용했다. **실제 GitHub → 실제 생성 → DB → 본인 화면 확인과 실제 약 500개 실측은 미실행이며 U7 전체는 미완료다.**

[승인 계획](code-generation-plan.md)과 [검사 지침](unit-test-instructions.md)을 따른다. [추적표](traceability.json)는 수용 기준 12개·세부 NFR 20개·BR 12개, 총 44개를 열거한다. 구현 파일로 연결된 항목 32개와 고지·실제 C-03·실측·실제 완료 증거가 남은 GAP 12개를 구분했다. 사용자가 제외한 요구사항은 없어 Deferred로 처리하지 않았다.

## 변경 파일과 구현 결정

전체 제품·시험·설정·기능 문서 변경 128개 경로는 [source-manifest.json](source-manifest.json)이 정본이다. 최초 126개 경로를 보존하고 동시 삭제·수신 시험과 기존 수신 연결 설명 문서의 변경을 추가했다. 기존 다른 단계 memory·승인 기록을 제품 변경으로 포함하지 않았다. 제품 의존성·잠금 파일·AI-DLC 판본은 변경하지 않았다.

| 영역 | 변경과 근거 |
|---|---|
| 회원별 등록 | `api/src/member-repositories/`에 주소 해석, 고정 GitHub 메타데이터 조회, 등록 엔티티·서비스·API를 추가했다. 소유·기여 사전 검사 없이 공개 저장소 ID를 확인한다. 입력 오류·private 확인·지원 불가·확인 불가를 구별한다. |
| DB | 생성한 `1793245460352-AddRepositoryRegistration.ts`에 회원별 유일성·CASCADE·요청의 복합 소유 FK·관측 필드를 넣었다. 전용 DB의 up/down/up, 기존 자료 준비 조건 거부를 검사했다. 과거 동의를 사후 생성하거나 기존 자료를 자동 삭제하지 않는다. |
| 접수·재요청 | 외부 확인은 트랜잭션 밖, 연결·등록·범위 재대조는 기존 잠금 안에서 한다. 요청에 당시 등록 ID·GitHub ID·좌표·자료 종류·범위 판본을 고정한다. 같은 키 선판정과 기존 두 실패 재요청 분기를 유지한다. |
| 하루 제한 | 같은 접수 EntityManager에서 C-03 consume을 호출하는 소비 경계를 만들었다. **U2 실제 제공자가 없어 제품 신규 접수는 INTERNAL_ERROR로 닫힌다.** 시험용 ALLOWED 제공자는 제품 모듈에 등록하지 않았다. 등록·조회·같은 요청은 새 소비가 아니다. |
| 메시지·컨텍스트 | `api/contracts/repository-analysis/{common,worker-messages}.yaml`이 현행 v2다. 네 메시지 모두 v2이며 관측 조합·필수값을 검사하고 v1을 거부한다. 과거 10월 승인 YAML은 보존했다. DB 사본 6개 필드와 큐 범위 4개 필드를 분리하고 요청 당시 좌표를 복원한다. |
| worker | 숫자 GitHub 계정 ID로 본인 커밋을 관측한다. 완전 조회의 본인 0개는 NONE·Catch 없음, 하나 이상은 FOUND, 나머지는 UNKNOWN이다. 후보 0개를 본인 커밋 부재로 해석하지 않는다. 관측·한계를 조기 종료·부분 실패·생성 결과까지 전달한다. |
| 반영·상태 | 수신과 DB 반영을 구분하고 관측을 회원 상태에 전달한다. 회원·등록·요청 삭제 후 늦은 결과, 타 회원, 지난 시도, 같은 작업, 반영 롤백 보호를 유지한다. 수신은 부모를 먼저 잠그고 요청의 소유 관계·현재 시도를 다시 확인해 부모 삭제와의 교착을 방지한다. |
| web | 기존 모달 상단 이력·상태·Catch 보기는 유지하고 하단을 주소 등록으로 바꿨다. 등록 뒤 새 동의로만 요청한다. 오류·본인 기록 없음·확인 불가·부분 결과·한도를 구별한다. 닫기/재열기에서 주소 초안과 응답 불명의 요청 키를 보존하며 주소를 바꾸면 이전 선택을 해제한다. |
| 패키징 | 두 Dockerfile·.dockerignore·기존 CI의 계약 감지·이미지 검사 경로를 함께 변경했다. 새 CI 체계·자동 증설·분석 자동 재시도는 추가하지 않았다. |

기능 안내는 [API U7 문서](../../../../../../../../api/docs/repository-analysis-u7.md), [worker U7 문서](../../../../../../../../worker/docs/repository-analysis-u7.md), [web 기능 README](../../../../../../../../web/src/features/repository-management/README.md)에 반영했다.

## 고지 문구와 실제 실행 조건

사용자는 OQ2를 **CatchU 공개 전환**으로 결정했다. 결정 확인 당시 원격 저장소는 private이고 연결 계정에는 관리자 권한이 없었다. 실제 공개 적용은 완료 증거가 아니다.

고지 문구에 대한 사용자 답변은 **“아직 미확정 — 수정안을 남겨 주세요”**다. `REAL_NOTICE` v1과 검사 지문을 보존했고, [고지 문서](../../../../../../../../api/docs/analysis-intake.md)와 #424에 다음 초안을 남겼다.

> 직접 등록한 공개 저장소 하나를 읽고, 분석에서 연결 계정의 커밋을 확인합니다.
>
> 확인된 실패에 한해 다시 요청할 수 있으며, 이미 생성된 Catch를 교체하는 재분석은 제공하지 않습니다.

이 문구는 승인된 고지가 아니다. 팀장이 문구를 확정한 뒤 본문·새 판본·지문을 함께 적용하고 PR 승인을 받아야 한다. 실제 분석은 공개 상태, 실제 C-03, 고지, 계정·자료·외부 전송·비용·실행 환경 조건을 확인한 후 수행한다.

## 실행한 검사와 실패 후 재확인

Node 24.21.0/npm 11.19.0, uv 0.12.18/Python 3.12.10과 기존 잠금 의존성을 사용했다. 전용 로컬 시험 DB는 `127.0.0.1:5433/catchu_u7_test`, Valkey는 `127.0.0.1:6380`이다. 기존 사용자 DB·실제 외부 자료를 초기화하지 않았다.

| 검사 | 최종 관측과 한계 |
|---|---|
| API 정적·타입·빌드 | api/에서 `npm.cmd run lint`, `npm.cmd run typecheck`, 아래 test 명령의 build 통과. |
| API 전체 + 커버리지 | api/에서 `npm.cmd run test:coverage`. 준비 build-output 1개 통과는 별도. 본시험 **1,386개: 1,378 통과·7 실패·1 skip**, 723.3초. 아래 두 재검사를 합쳐 판단하며 한 번의 전체 녹색 실행으로 쓰지 않는다. |
| API 잠금 회귀 재검사 | `npm.cmd test -- test/integration/lock-wait-limit-application.test.cjs`: **11/11 통과**, 0 skip, 40.64초. 전체 실행의 6개 실패는 기존 시험 AppModule에 합성 C-03 주입이 빠진 500 응답이었다. 시험 준비 1줄만 보완했고 제품·기대값·시간 상한은 유지했다. 해당 파일 ESLint도 통과했다. |
| API 기동·공유 fixture 재검사 | `npm.cmd test -- test/runtime/bootstrap.test.cjs test/analysis/shared-fixtures.check.cjs`: **37/37 통과**, 0 skip, 67.66초. 전체 커버리지 실행의 소스 기동 12초 초과 1건은 이 실행에서 9.86초로 통과했다. 제한 시간은 변경하지 않았다. |
| API 새 경계 통합 | `npm.cmd test -- test/integration/u7-analysis-chain.test.cjs`: **8/8 통과**, 0 skip, 12.8초. 전체 커버리지 실행에서도 8개 통과. I2는 합성 소비 경계이며 실제 C-03/KST 통합이 아니다. I7은 실제 Nest/DB와 web 응답 해석, 별도 합성 화면 검사를 합친 것이며 실제 회원 여정이 아니다. |
| 기존 API 회귀 보완 | 회원 목록·동의 사본·삭제 FK·컨텍스트·수신·큐의 기존 fixture를 새 등록 관계와 v2로 갱신했다. 별도 묶음 92/92와 111개 기존 시험 통과 뒤 전체 실행에도 포함했다. 과거 실패 기대값을 지우지 않았다. |
| Web 전체 | web/에서 `npm.cmd run check`: **668/668 통과**, 0 skip, ESLint·타입 검사·Next build·HTTP 200·보안 헤더·정상 종료 통과. 기존 MODULE_TYPELESS_PACKAGE_JSON 경고가 남는다. |
| Web Unit | [검사 지침](unit-test-instructions.md)의 정확한 8개 파일을 Node test/coverage로 실행: **106/106 통과**, 0 skip. TSX 렌더·모달 콜백 포함. |
| Worker 정적 | `uv run --locked ruff format --check .`: 128개 파일 통과. `uv run --locked ruff check .`: 통과. Linux `uv run --locked mypy`: 114개 파일 통과. |
| Worker 전체 | 아래 Linux COPY 환경에서 **2,268/2,268 통과**, 0 skip, 166.95초. Starlette/AnyIO의 기존 deprecation 경고 1개. 이후 9개 파일의 Ruff 서식 변경만 추가했고 서식·정적 검사를 다시 통과했다. |
| 변경 형식 | `git diff --check` 통과. |

API 전체 실행의 PowerShell try/finally 환경 복원 때문에 도구 종료값은 0이었지만 Node 출력의 실패 7개를 그대로 기록했다. 후속 명령은 native 종료값을 명시적으로 반환했다. 종료값만으로 전체 통과를 판단하지 않았다.

Windows worker 전체 실행의 13개 실패·4개 skip 및 mypy의 플랫폼 관련 오류는 SIGKILL·signal handler·/proc·경로 처리 차이로 구분했다. 초기 Linux 검사 이미지의 Git/Node 키트 누락은 환경을 보완했다. 이후 Windows bind 경로에서 커버리지 큐 시험 1개가 실패(2,267 통과)했고 단독 plain 재실행은 통과, 같은 큐 묶음 coverage는 다시 실패했다. **같은 코드·동일 시간 제한을 Linux 파일시스템으로 복사한 전체 실행에서 모두 통과**했다. 이 관측을 Windows 환경의 완전한 지원 보장으로 일반화하지 않는다.

Linux 검사 스냅샷은 로컬 전용 `catchu-u7-worker-test-snapshot:20261029`, 이미지 ID `sha256:bdb7fe2ac1eb4c4f7c0e7e3682c10d19d4d9318ced1e8f867930761b8dd7e0ef`였다. 제품의 고정 Python/uv 기반에 잠금 dev 의존성, Git·Node·큐 검증 키트를 준비하고 당시 worker/app·tests·fixtures와 현행 계약만 복사했다. 실행 명령은 다음과 같다(저장소 루트).

```powershell
docker run --rm --name catchu-u7-linux-snapshot-final-20261029 -e CATCHU_TEST_REDIS_URL=redis://host.docker.internal:6380 -e CATCHU_TEST_REQUIRE_NODE=1 -e PYTHONDONTWRITEBYTECODE=1 catchu-u7-worker-test-snapshot:20261029 /bin/sh -c 'uv run --locked ruff check . && uv run --locked mypy && uv run --locked pytest --cov=app/collection --cov=app/candidates --cov=app/generation --cov=app/processing --cov=app/contract --cov=app/request_context --cov=app/consumer --cov-report=term-missing --cov-fail-under=80 -rs'
```

## 줄 커버리지와 측정 누락

기준은 80%이며 낮추지 않았다. 실행하지 않은 변경 파일은 0으로 포함했다. 아래 표는 최초 구현 검사 당시 수치다. API 잠금 보완 이후 수치는 다음 절에 별도로 기록하며 서로 다른 실행의 분모·분자를 합치지 않는다. 커버리지는 실제 외부 분석 품질이나 제품 요구사항 충족률이 아니다.

| 서비스 | 측정 범위와 보수적 값 | 변경 파일만 |
|---|---|---|
| API | 승인 7개 기능 디렉터리 + application.module·error-codes·새 migration. dist 기준 4,387/4,436줄 = **98.90%**. Node 보고서에서 빠진 타입 전용 receiver.types.js 3줄을 0%로 더했다. 전체 실행의 실패·skip은 위 표대로 별도다. | 변경 JS 22개, 1,995/2,018줄 = 98.86%; 누락 1개도 0 포함 |
| Web | 승인 2개 기능 디렉터리 + repository-options-store. 1,818/2,096줄 = **86.74%**. 로더 대역이 실행했다고 센 CSS 25줄을 전부 0으로 재계산했다. TSX 변환 후 원본 줄 대응에는 한계가 있다. | 변경 9개 파일, 1,641/1,797줄 = 91.32%; 누락 0 |
| Worker | collection·candidates·generation·processing·contract·request_context·consumer. 7,126/7,356 statement = **96.87%**. | 변경 제품 Python 9개 모두 측정됨. 1,154/1,188 statement = 97.14%; 누락 0 |

API에서 일시 설정한 범위는 다음과 같으며 명령 후 환경값을 복원했다.

```text
TEST_COVERAGE_INCLUDE=dist/{member-repositories/**,analysis-intake/**,member-analysis/**,worker-context/**,analysis-queue/**,analysis-receiver/**,result-application/**,application.module.js,common/errors/error-codes.js,database/migrations/1793245460352-AddRepositoryRegistration.js}
```

파일별 API/web 분모·분자 기록은 이 클론의 `.aidlc-engine/u7-api-coverage-evidence.json`, `.aidlc-engine/u7-web-coverage-evidence.json`에 있다. 공유 기록에는 위 산식·누락·명령·한계를 남겼으며 임시 도구/캐시는 소스 목록에서 제외했다.

## 동시 삭제·수신 보완과 재검증

2026-10-29 담당자가 요청한 교착 결함 보완으로 `api/src/analysis-receiver/database-receiver.store.ts`, 새 `api/test/integration/receiver-parent-locking.test.cjs`, `api/docs/analysis-receiver.md`, `api/docs/receiver-registration.md`를 수정했다. 기존 구현을 재작성하지 않았고 새 재시도·복구 장치·스키마·고지 변경은 없다.

수신은 처음에 요청의 부모 식별값만 비잠금으로 읽고, 회원 → 회원별 등록 → 요청 → 현재 시도 → 수신 기록 순서로 잠근다. 부모를 잠근 후 다시 읽은 요청의 소유 관계가 최초 값과 다르면 기존 맥락 거부로 끝낸다. 현재 시도와 동의는 잠금 뒤 자료를 사용한다. 결과 반영·시한 처리의 기존 요청 → 시도 → 수신 기록 순서는 유지하며, 모든 서비스의 전체 잠금 순서가 같다고 일반화하지 않는다.

전용 tmpfs PostgreSQL·Valkey를 새로 준비하고 기준 Node 24.21.0/npm 11.19.0으로 검사했다. 실행 위치는 api/이며 각 명령은 exit 0이었다.

| 검사 | 명령·관측 |
|---|---|
| 준비 회귀 | `npm.cmd test -- test/integration/receiver-registration.test.cjs`: 42/42 통과, 실패·skip 0, 15.03초. 새 DB에 기존 15개 마이그레이션 적용. |
| 신규 동시성 | `npm.cmd test -- test/integration/receiver-parent-locking.test.cjs`: 상위 시나리오 11개와 L9의 두 하위 검사, 총 13/13 통과, 실패·skip 0, 3.61초. |
| 영향 경계 회귀 | 검사 지침의 동시 삭제·수신 절에 있는 정확한 8개 파일 명령: 127/127 통과, 실패·skip 0, 21.91초. 기존 중복 수신·커밋 실패·삭제·Catch 반영 포함. |
| 정적·타입·빌드 | `npm.cmd run lint`, `npm.cmd run typecheck`, test와 test:coverage 선행 `npm.cmd run build` 모두 통과. |
| API Unit 커버리지 | 검사 지침의 기존 API 20개 파일에 신규 부모 잠금 시험·기존 receiver-registration 시험을 더한 22개 파일로 `npm.cmd run test:coverage -- …` 실행: 347/347 통과, 실패·skip 0, 125.06초. 최초 전체 1,386개 실행의 재실행이 아닌 지정 Unit 묶음이다. |

L1~L8은 회원/등록 × 진행/결과 × 삭제 선행/수신 선행이다. 시험 장벽과 실제 `pg_blocking_pids`를 사용했다. 첫 단독 실행에서 삭제 선행 4건은 수신 PID 108이 삭제 PID 107을 기다렸고, 수신 선행 4건은 삭제 PID 107이 수신 PID 108을 기다렸다. 관련 회귀 실행에서도 같은 방향의 대기를 확인했다. 삭제는 모두 정상 커밋됐고, 수신은 선행 순서에 따라 정상 수신 또는 CONTEXT_MISMATCH로 끝났으며 40P01 등 SQLSTATE 오류가 없었다. 삭제 후 요청·동의·시도·수신 기록·해당 Catch가 없고 타 회원 자료는 보존됨을 검사했다.

L9는 최초 조회 뒤 회원/등록 삭제를 각각 검사했다. L10은 동일 요청 ID를 다른 부모 아래 다시 생성해 오래된 부모 조회를 쓰지 않는지 확인했고, L11은 현재 시도를 바꿔 지난 시도 메시지가 새 시도를 오염시키지 않는지 확인했다. 시험 자료는 생성 전에 식별자를 정한 합성 자료이며 자기 자료만 정리했다.

커버리지는 위에 명시한 기존 API 측정 범위를 유지했다. 전체 지정 범위는 4,121/4,450줄 = **92.61%**, 수신 디렉터리는 673/705줄 = **95.46%**, U7 변경 JS 22개는 1,974/2,032줄 = **97.15%**다. 보고서에 없는 타입 전용 receiver.types.js 3줄은 각각 해당 분모에 0%로 포함했다. 이번에 바꾼 database-receiver.store.js는 **79/79줄 = 100%**이며 미포함 변경 제품 파일은 없다. 실제 명령·파일별 분모·분자는 이 클론의 `.aidlc-engine/u7-parent-locking-evidence.json`에 기록했다. PowerShell 환경 복원 전에 native 종료값을 보관하고 반환했다.

변경 없는 web·worker 전체 검사와 합성 화면 결과는 이전 기록을 재사용했다. 기존 Step 1~9의 완료 체크는 그 기록과 현재 구현이 유지되는 항목만 복원했으며 이번에 모두 재실행했다는 뜻이 아니다. 실제 C-03·고지·외부 분석·500개 실측·원격 CI·병합의 미완료 상태는 그대로다.

## 화면·이미지와 합성 연결 증거

합성 preview에서 760·1024·1536px 모달, 입력 오류·private 안내·주소 보존, 등록 후 별도 동의, 202 접수 안내, 응답 불명 재열기, 주소 수정 시 선택 해제, Esc 닫기와 초점 복귀, Catch 필터 이동을 확인했다. 본인 기록 없음·확인 불가·부분 결과를 서로 구분했다. 관련 브라우저 오류/경고는 0개였다. 실사용 API·로그인·실제 GitHub/LLM을 연결한 화면 증거는 아니다.

로컬 화면 증거: `.aidlc-engine/ui/u7-accepted-760.png`, `u7-private-error-760.png`, `u7-draft-preserved.png`. 닫기/재열기의 주소 소실을 발견해 저장 객체 수명을 모달 밖으로 옮긴 뒤 재검사했다.

API 이미지 `catchu-u7-api:20261029-schema-r2`와 최종 worker 이미지 `catchu-u7-worker:20261029-schema-r4` 빌드가 통과했다. 최종 worker는 서식 정리까지 포함한다. 네트워크 차단·읽기 전용·capability 제거 조건에서 두 이미지의 현행 YAML 해시 일치와 v2 허용/v1 거부를 확인했다. API/worker r2 간 4개 합성 처리 결과와 진행 메시지 교차 판정도 통과했다. worker r3의 관측/집계 보완은 Linux 전체 시험에서 확인했으며 r4는 서식 변경뿐이다.

위 API 이미지는 동시 삭제·수신 보완 전 판본이다. 이번 잠금 수정은 Node 빌드와 실제 PostgreSQL 회귀로 검사했으며, 수정 후 API 이미지 재빌드·배포는 수행하지 않았다. 메시지 정본은 변경하지 않았다.

| 정본 | 두 이미지에서 확인한 SHA256 |
|---|---|
| common.yaml | `4dff78419d7389ffbf88b4ea3d3ff8729db931345b668604b8cb4b22cb6d235d` |
| worker-messages.yaml | `cf2447e799c389bccfa35f0915e1f19dc5df165e15d74873e9ff9be4a916b7e0` |

합성 I8은 실제 Python 함수와 PostgreSQL로 다음 수를 대조했다. 목록 500, 상세 200, 필수 관계 500, 후보 200, 합성 생성 호출 200, GitHub 대역 호출 209, 수신 697,330 bytes, Result 349,962 bytes, DB Catch 200. 가짜 시계 0.209초는 실제 처리 시간으로 쓰지 않는다. 기존 상세·생성 상한 200과 수집 한계를 유지했으며 **500개 전체 분석 성공이 아니다.**

## 미실행·계획과의 차이·다음 행동

| 남은 항목 | 이유·필요 조치 |
|---|---|
| U2 실제 C-03·KST 통합 | [#414](https://github.com/JminAILab/CatchU/issues/414)의 실제 제공자가 필요하다. 소비 경계와 합성 검사는 준비했으며 실제 연결 후 동시성·거부·롤백·KST 경계를 확인한다. |
| U7 고지 적용 | 사용자 답변대로 초안만 남겼다. 팀장 확정·새 판본/지문·PR 승인이 필요하다. 기존 문구로 실제 분석을 수행하지 않았다. |
| 실제 분석·거부 1~2종 | CatchU 공개 적용과 계정·자료·외부 전송·비용·환경 조건, 위 두 선행 조건을 확인한 뒤 새 등록부터 본인 Catch·근거까지 한 실행의 증거로 남긴다. |
| 약 500개 실측·최종 상한 | 합성은 500 관측/200 반영 경계만 확인했다. 실제 목록·상세·관계·묶음/제외·생성·전달·반영·시간/크기를 대조해 상한을 결정한다. |
| 실제 Claude 인용 시험 S8 | api/test/ai-generation/live-citation.test.cjs의 “S8 실제 Claude 인용 호출: 합격 기준 ①~⑤”는 실행 키가 없어 **0 통과·0 실패·1 skip**. 일반 합성 검사와 구분하며 실제 호출 증거로 쓰지 않는다. |
| 기존 자료 전환·배포 | analysis_request가 있으면 새 migration이 거부한다. 구판 진행 요청·큐와 자료 보존/전환·되돌리기, 양쪽 이미지 동시 교체를 검토해야 한다. 운영 자료 삭제·구판 큐 삭제·배포는 수행하지 않았다. |
| 원격 CI·PR·통합 병합 | 원격에 코드를 제출하지 않았다. 공식 검토 뒤 #419 결정대로 통합 브랜치 대상 PR을 준비하고 팀장 merge commit 및 실제 완료 증거를 확인해야 한다. |

검사 환경의 경로·신호 차이는 Linux 검증으로 보완했고, 테스트 대역·기존 회귀를 새 등록/v2에 맞춰 수정했다. 제품 요구사항·잠금 시간·검사 기준·상한을 낮춰 실패를 없애지 않았다. 실제 조건이 준비되지 않은 계획 항목은 체크하지 않았으며 U7 이슈와 Project를 완료로 바꾸지 않았다.

