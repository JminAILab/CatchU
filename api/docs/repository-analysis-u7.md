# 회원 저장소 등록과 분석 — U7 / #424

이 문서는 12월 공개판 U7의 현행 구현을 설명한다. [승인 기능 명세](../../aidlc/spaces/default/intents/260925-intent-12/construction/u7-repository-analysis/functional-design/functional-spec.md)가 동작 근거다. 기존 10월 선정 목록 문서·계약은 승인 당시 기록이며 실제 회원의 새 등록·접수에는 아래 경계를 적용한다.

## 회원 등록과 접수

회원 인증 후 `POST /v1/me/repositories`에 `{ "url": "https://github.com/owner/repository" }`만 보낸다. 서버는 HTTPS GitHub 저장소 루트만 받고 공백·마지막 `/`·`.git`을 정규화한다. userinfo·포트·query·fragment·하위 경로·다른 호스트는 거부한다. GitHub 고정 API 호스트, redirect 금지, 10초 및 65,536 bytes 제한으로 공개 메타데이터를 확인한다. 소유·기여 여부는 등록 전 검사하지 않는다.

성공은 201이며 `registrationId`, 서버 확인 `repositoryId`, `ownerLogin`, `name`, `url`, `allowedScopeRevision`을 돌려준다. 같은 회원·GitHub ID는 같은 등록을 갱신하고, 다른 회원은 별도 등록을 가진다. 새 등록은 전역 `repository_selection`에 추가하지 않는다. `GET /v1/me/repositories`는 본인 등록의 기존 페이지 응답을 반환한다. 개발 회원의 합성 목록은 개발 기능 조건에서만 유지한다.

| 상황 | 응답 |
|---|---|
| 주소 형식 오류 | 400 `REPOSITORY_URL_INVALID` |
| private 확인 또는 GitHub 404 | 403 `REPOSITORY_PRIVATE` |
| 지원하지 않는 저장소 | 403 `REPOSITORY_UNSUPPORTED` |
| 외부 오류·redirect·시간/크기 초과 등 확인 불가 | 422 `REPOSITORY_UNVERIFIED` |
| 연결 부재·변경·재인증 필요 | 403 `GITHUB_CONNECTION_REQUIRED` |
| 본인 등록 없음 | 404 `RESOURCE_UNAVAILABLE` |
| 하루 제한 도달 | 429 `DAILY_LIMIT_REACHED` |

등록은 분석을 접수하지 않는다. 현재 고지와 등록의 범위 판본을 읽고 새 동의를 받아 기존 `POST /v1/analysis-requests`로 접수한다. 같은 키·같은 본문이면 먼저 저장된 요청의 현재 상태를 반환한다. 새 접수는 외부 공개 확인을 트랜잭션 밖에서 하고, 회원·연결·등록·범위를 기존 회원 잠금 안에서 재대조한다. 등록 ID·GitHub ID·확인 좌표·자료 종류·범위 판본을 불변 동의 사본에 저장한다. 이후 등록 이름을 바꿔도 과거 요청의 좌표는 바뀌지 않는다.

`ANALYSIS_DAILY_RUN_LIMIT` 소비 경계는 모든 조건을 통과한 뒤 같은 `EntityManager`에서 C-03 `consume(memberId, 'ANALYSIS', now, manager)`를 호출한다. 제품 `AnalysisIntakeModule`이 `DailyRunLimitModule`을 가져오고 소비 토큰을 U2 `DailyRunLimit`에 `useExisting`으로 연결한다. 등록·조회·동일 키·같은 ACTIVE 재응답은 소비하지 않고 접수 롤백은 소비도 롤백한다. 실행 실패는 환급하지 않는다. 분석·기본 요약·JD 요약은 회원별 KST 날짜의 같은 횟수를 사용한다([C-03 안내](daily-run-limit.md)). 별도 조립에서 제공자를 누락하면 `500 INTERNAL_ERROR`로 거부하며 무제한 제품 대체 구현은 없다.

GitHub 연결 권한으로는 404 응답의 비공개 저장소와 없는 저장소를 구분할 수 없다. 두 경우는 "비공개이거나 없는 저장소라 확인할 수 없습니다. 공개 저장소 주소인지 확인해 주세요."로 안내한다. 그 밖의 확인 장애는 "GitHub에서 저장소를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."로 안내하며 분석 접수에서도 같은 구분을 쓴다.

### 기존 Catch를 보존하는 재분석

[2026-10-30 #424 팀장 결정](https://github.com/JminAILab/CatchU/issues/424)에 따라 승인 요구사항 FR1.3·U7 설계 BR4.3의 정상 완료 재분석 금지를 대체한다. 과거 승인 원본은 보존한다. 같은 저장소의 최신 요청이 `CLOSED`이고 반영이 `APPLIED` 또는 `APPLY_FAILED`로 끝났으면 결과·기존 Catch 유무와 무관하게 재분석할 수 있다. 진행·반영·복구 중이거나 반영 완료를 확인하지 못한 요청에는 허용하지 않는다. 접수 때 최신 본인 요청의 `retryOfRequestId`, 새 키·현재 고지/범위에 대한 새 동의·하루 제한을 다시 확인한다. 동일 키 재전송과 같은 ACTIVE 재응답은 새 요청·동의·소비를 만들지 않는다. 자동 재시도는 없다.

기존 Catch 등록의 회원+`workIdentity` 중복 판정을 재사용한다. 같은 작업은 기존 Catch ID·최초 내용·작성자 설명·공개 상태·근거를 유지하고 새 작업만 비공개 Catch로 추가한다. 진행·실패에도 기존 Catch를 삭제하지 않으며 이미 발행한 발행본을 변경하지 않는다. 상태의 `retry.allowed`는 최신 종료 요청에서 참이며 일반 종료 허용 이유는 `ANALYSIS_FINISHED`, 기존 결과 없는 확정 실패 이유는 `FAILURE_WITHOUT_RESULTS`다. 옛 요청은 후속 요청이 있으면 허용하지 않는다.

실제 고지는 #424 본문에서 확정한 네 줄과 판본 `catchu-real-analysis-notice-v2`를 적용한다. [PR #433](https://github.com/JminAILab/CatchU/pull/433)의 팀장 승인이 고지 승인 기록이며, 문구 확정과 실제 실행 완료는 구분한다.

## 메시지와 결과

현행 정본은 `api/contracts/repository-analysis/{common,worker-messages}.yaml`이다. 원본은 `260914-catchu-october-mvp/inception/contract-design`의 두 YAML이며 그 승인 파일은 보존했다. Request·ProcessingEvent·Result·ResultReceipt 모두 `schemaVersion: '2'`이고 v1은 거부한다. DB 동의의 여섯 칸과 큐의 네 칸 범위는 별도 검사한다. 큐 `selectionReference`·`credentialContextReference`는 `attemptId`이고 토큰·좌표 사본은 넣지 않는다.

Result와 회원 상태에 `ownCommitObservation`, `observedOwnCommitCount`, `collectionLimitNotes`가 있다. `NONE/0/[]`은 완전 조회에서 본인 커밋 0개로 결과·실패·Catch가 없는 EMPTY다. `FOUND`는 양수 관측 수이며 후보 수와 다르다. `UNKNOWN/null`은 조회 불명·한계 또는 관측 전 상태다. FOUND에도 수집 한계가 있을 수 있다. 수신·처리·반영·lifecycle·ownerResultsReady는 각각 보존하며 Receipt ACCEPTED만으로 Catch 열람 준비를 뜻하지 않는다.

등록·회원·요청이 삭제되면 관련 요청/동의/시도는 CASCADE로 제거된다. 실행 컨텍스트·늦은 결과 반영은 삭제된 부모나 타 회원의 등록을 복원하지 않는다. 현재 시도·중복/다른 내용·동일 작업·반영 트랜잭션 보호는 기존 검사를 유지한다.

## 배포와 되돌리기 조건

1. 구판 진행 요청, 요청/결과 대기 큐와 처리 중 작업을 운영자가 확인한다. v1/v2를 혼합 소비하지 않는다. 이 작업은 구판 큐 삭제나 운영 자료 초기화를 수행하지 않는다.
2. 새 마이그레이션 `1793245460352-AddRepositoryRegistration.ts`는 기존 `analysis_request`가 있으면 명확히 거부한다. 과거 동의로 새 등록·좌표 사본을 추측하지 않는다. 기존 자료가 있는 환경은 보존/전환 결정을 별도로 검토해야 한다.
3. 전용 시험 DB에서 up/down/up을 확인한다. down도 등록 자료가 남아 있으면 거부하며 자동 삭제하지 않는다. 운영 적용 전 백업·검증된 자료 준비와 별도 되돌리기 계획이 필요하다.
4. API·worker 이미지를 함께 교체하고 이미지 안 두 YAML 해시와 네 메시지 동등 판정을 확인한다. `.dockerignore`, 두 Dockerfile, 기존 CI 변경 감지와 `deploy/scripts/check-images.mjs`는 새 정본 경로를 사용한다.
5. C-03 실제 제공자, 확정 고지 v2 반영 PR의 팀장 승인, CatchU 공개 적용과 자료·외부 전송·비용 조건을 확인한 뒤 실제 분석을 검증한다. 조건 미충족 환경의 배포·실제 실행은 미실행이다.

## 실제 분석 준비와 실행 증거

실제 분석은 [#424의 2026-11-01 상한 결정](https://github.com/JminAILab/CatchU/issues/424)과 [고지 v2 승인 및 후속 확인 결정](https://github.com/JminAILab/CatchU/pull/433#pullrequestreview-5731151180)을 따른다. 수집·생성 상한의 현행 값과 계수 방식은 [worker U7 안내](../../worker/docs/repository-analysis-u7.md)에 있다. 호출·생성 건수 상한은 유료 계정의 금액 예산을 대신하지 않는다.

1. CatchU의 실제 공개 상태, 이번 실행 환경·배포 판본, 사용할 유료 계정·금액 상한과 자료 취급 조건을 확인한다. 비공개 저장소를 우회하지 않는다. 로컬 확인을 AWS 외부 통합 확인으로 기록하지 않는다. 준비 여부와 미결은 #424와 후속 PR에 기록한다.
2. 실제 자료용 DB·큐·자격정보 보관 위치를 합성 시험과 분리한다. 기존 자료·진행 요청·큐와 마이그레이션 전제는 위 배포 조건을 확인하며 삭제해 맞추지 않는다. `_test` DB 초기화 실행기나 `verify-analysis-queue.cjs`는 실제 자료 환경에서 사용하지 않는다.
3. API의 실제 Google 로그인·GitHub 연결·worker 컨텍스트·큐 설정과 worker의 LIVE 설정을 준비한다([GitHub 연결](github-connection.md), [분석 큐](analysis-queue.md), [worker 큐 소비자](../../worker/docs/queue-consumer.md)). worker는 `python -m app.consumer`로 하나만 실행한다. `app.main`의 health 성공은 분석 실행 증거가 아니며 worker는 `.env`를 자동으로 읽지 않는다. web의 통합 인증 설정과 OAuth 콜백·출처도 같은 환경에 맞춘다. 비밀값을 실행 증거에 넣지 않는다.
4. 실제 Google 회원으로 로그인하고 `GET /v1/me`에서 GitHub 연결 계정이 팀장 `ljm0850`인지 확인한다. 개발 로그인은 합성 회원이므로 대신 쓰지 않는다. 만료 시각이 있는 GitHub 토큰은 worker 시작 시점에 30분보다 오래 유효해야 하며 정확히 30분인 경우도 수집 전에 거부된다. API는 발급된 만료 시각을 연장하지 않으므로 새 연결 뒤 이 조건의 충족 여부를 토큰 원문 없이 확인한다. 저장소 등록 후 현재 고지 v2와 등록의 범위 판본을 읽고 실행별 동의를 받아 새 키로 분석을 접수한다. 재측정도 새 동의·하루 제한을 적용하며 소비 기록을 지우거나 한도를 우회하지 않는다.
5. 접수 식별자부터 큐·worker·수신·DB·본인 화면까지 같은 요청과 시도로 연결한다. `sourceMode: LIVE`만으로 실호출을 입증하지 않는다(합성 연결 시험도 LIVE 맥락을 쓴다). 실제 제공자 종류·안전한 호출 집계, 최종 처리/반영 상태와 `ownerResultsReady`, 본인 Catch 목록·상세의 근거를 대조한다. #410·#423·#429 등 대상 Unit PR의 근거 URL과 해당 Catch ID를 각각 기록하며, 다른 작업으로 잘못 합쳐지거나 빠진 항목은 성공으로 세지 않는다.
6. 거부 사례는 허용된 대상 안에서 1~2종을 실행한다. 예를 들어 주소 형식 거부와 허용 저장소의 비공개 상태 거부를 구분해 요청·안내·미접수 결과를 남긴다. 합성 응답을 실제 거부 사례로 세지 않는다. 상한 때문에 빠진 항목이 있으면 해당 값만 조정하고 다시 측정한다. GitHub 시간당 5,000회 또는 전체 처리 시한 60분 안에 넣을 수 없으면 원인·실측·선택지를 팀장에게 요청한다.

후속 PR의 실행 증거에는 날짜·시간대, 환경과 코드 판본, 저장소/분석 대상 리비전, 요청·시도 식별자, 목록·상세·관계·생성·Catch/근거 수, 소요 시간, 안전한 제공자 호출·토큰/비용 집계, 최종 결과와 수집 한계를 남긴다. 원자료·diff·토큰·모델 응답 전체는 첨부하지 않는다. 수집 한계와 생성 한도를 따로 기록하고, 실패·미실행은 그대로 남긴다. 실제 자료 정리와 로그 보호는 [자료와 실행 로그](../../docs/CatchU_coding_procedures.md#자료와-실행-로그), [임시 자료 규칙](../../docs/CatchU_collection_control_temp_data.md)을 따른다.

## 검사와 현재 남은 증거

`npm.cmd test -- test/repository-registration.test.cjs test/db/repository-registration.test.cjs test/db/u7-analysis-intake.test.cjs test/u7-worker-context.test.cjs test/analysis/u7-receiver.test.cjs test/integration/u7-analysis-chain.test.cjs`는 전용 `_test` PostgreSQL에 실행한다. `CATCHU_TEST_REDIS_URL`은 전용 시험 Valkey로 지정한다. 미설정 skip은 통과가 아니다. 전체 명령·커버리지 대상은 [Unit 검사 지침](../../aidlc/spaces/default/intents/260925-intent-12/construction/u7-repository-analysis/code-generation/unit-test-instructions.md)을 따른다.

`u7-analysis-chain.test.cjs`는 실제 worker Python 함수를 합성 자료로 호출하므로 먼저 `worker/`에서 `uv python install`, `uv sync --locked`로 [worker의 고정 도구·잠금 의존성](../../worker/README.md)을 준비한다. 기본 실행 파일은 Windows에서 `worker/.venv/Scripts/python.exe`, 그 밖에서는 `worker/.venv/bin/python`이다. 다른 위치의 동일 환경을 쓰면 `CATCHU_TEST_WORKER_PYTHON`을 지정한다. API CI도 worker와 같은 도구·잠금 의존성을 준비하며, 실행 파일이 없을 때 시험을 건너뛰지 않는다.

`npm.cmd test -- test/integration/u7-c03-product.test.cjs`는 제품 `createApplicationModule()`·인증·HTTP 접수·U2 실제 C-03·PostgreSQL 연결을 확인한다. 회원/연결 자료와 GitHub 응답은 합성이며 큐·worker·외부 생성은 실행하지 않는다. 등록·조회·동의 거부의 미소비, 동시 접수·재응답의 1회 소비, 요약과 합산한 한도 거부, KST 자정, 접수 저장 실패의 전체 롤백, 확정 실패 뒤 재요청 소비를 검사한다. C-03 연결은 [팀장 결정](https://github.com/JminAILab/CatchU/issues/424#issuecomment-6491890788)에 따라 AI-DLC 승인 뒤 직접 수정했으며, [새 폴더에서 검사·PR을 진행하는 후속 결정](https://github.com/JminAILab/CatchU/issues/424#issuecomment-6511087844)을 따른다. 실행 결과는 제출 PR에 기록한다.

실제 GitHub·LLM 분석, 실제 거부 1~2종과 팀장 Unit PR별 Catch 확인은 합성 외부 응답 검사와 별개다. 고지 v2 승인은 위 결정으로 확인하며, 실제 공개 상태·환경·계정·비용·실행별 동의는 실행할 때 확인한다. 새 상한의 합성 500개 연결 검사는 상세·후보·Result·Catch 500건과 생성 300건·미생성 200건을 구분한다. 수집 한계가 없어도 생성 한도로 부분 실패할 수 있으므로 전체 500개 분석 성공으로 기록하지 않는다. 실제 측정과 남은 한계는 후속 PR에 기록한다.
