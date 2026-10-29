# 회원 저장소 등록과 분석 — U7 / #424

이 문서는 12월 공개판 U7의 현행 구현을 설명한다. [승인 기능 명세](../../aidlc/spaces/default/intents/260925-intent-12/construction/u7-repository-analysis/functional-design/functional-spec.md)가 동작 근거다. 기존 10월 선정 목록 문서·계약은 승인 당시 기록이며 실제 회원의 새 등록·접수에는 아래 경계를 적용한다.

## 회원 등록과 접수

회원 인증 후 `POST /v1/me/repositories`에 `{ "url": "https://github.com/owner/repository" }`만 보낸다. 서버는 HTTPS GitHub 저장소 루트만 받고 공백·마지막 `/`·`.git`을 정규화한다. userinfo·포트·query·fragment·하위 경로·다른 호스트는 거부한다. GitHub 고정 API 호스트, redirect 금지, 10초 및 65,536 bytes 제한으로 공개 메타데이터를 확인한다. 소유·기여 여부는 등록 전 검사하지 않는다.

성공은 201이며 `registrationId`, 서버 확인 `repositoryId`, `ownerLogin`, `name`, `url`, `allowedScopeRevision`을 돌려준다. 같은 회원·GitHub ID는 같은 등록을 갱신하고, 다른 회원은 별도 등록을 가진다. 새 등록은 전역 `repository_selection`에 추가하지 않는다. `GET /v1/me/repositories`는 본인 등록의 기존 페이지 응답을 반환한다. 개발 회원의 합성 목록은 개발 기능 조건에서만 유지한다.

| 상황 | 응답 |
|---|---|
| 주소 형식 오류 | 400 `REPOSITORY_URL_INVALID` |
| private 확인 | 403 `REPOSITORY_PRIVATE` |
| 지원하지 않는 저장소 | 403 `REPOSITORY_UNSUPPORTED` |
| 404·외부 오류·redirect·시간/크기 초과 등 확인 불가 | 422 `REPOSITORY_UNVERIFIED` |
| 연결 부재·변경·재인증 필요 | 403 `GITHUB_CONNECTION_REQUIRED` |
| 본인 등록 없음 | 404 `RESOURCE_UNAVAILABLE` |
| 하루 제한 도달 | 429 `DAILY_LIMIT_REACHED` |

등록은 분석을 접수하지 않는다. 현재 고지와 등록의 범위 판본을 읽고 새 동의를 받아 기존 `POST /v1/analysis-requests`로 접수한다. 같은 키·같은 본문이면 먼저 저장된 요청의 현재 상태를 반환한다. 새 접수는 외부 공개 확인을 트랜잭션 밖에서 하고, 회원·연결·등록·범위를 기존 회원 잠금 안에서 재대조한다. 등록 ID·GitHub ID·확인 좌표·자료 종류·범위 판본을 불변 동의 사본에 저장한다. 이후 등록 이름을 바꿔도 과거 요청의 좌표는 바뀌지 않는다.

`ANALYSIS_DAILY_RUN_LIMIT` 소비 경계는 모든 조건을 통과한 뒤 같은 `EntityManager`에서 C-03 `consume(memberId, 'ANALYSIS', now, manager)`를 호출한다. 등록·조회·동일 키·같은 ACTIVE 재응답은 소비하지 않고 접수 롤백은 소비도 롤백한다. 실행 실패는 환급하지 않는다. 현재 U2 #414 실제 제공자가 연결되지 않아 제품 신규 접수는 `500 INTERNAL_ERROR`로 닫힌다. 시험용 제공자 통과는 KST 계산·실제 C-03 통합 증거가 아니다. 무제한 제품 대체 구현은 없다.

기존 두 실패 재요청 분기와 새 키·새 동의·현재 한도 조건을 유지한다. `FAILED/APPLIED/CLOSED`는 실패 확정·후보/등록 Catch 없음이 필요하다. `APPLY_FAILED/CLOSED`는 처리 상태와 무관하게 등록 Catch가 없어야 한다. 정상·EMPTY·유효 부분 결과·실행 불명·복구 중에는 재생성하지 않는다.

## 메시지와 결과

현행 정본은 `api/contracts/repository-analysis/{common,worker-messages}.yaml`이다. 원본은 `260914-catchu-october-mvp/inception/contract-design`의 두 YAML이며 그 승인 파일은 보존했다. Request·ProcessingEvent·Result·ResultReceipt 모두 `schemaVersion: '2'`이고 v1은 거부한다. DB 동의의 여섯 칸과 큐의 네 칸 범위는 별도 검사한다. 큐 `selectionReference`·`credentialContextReference`는 `attemptId`이고 토큰·좌표 사본은 넣지 않는다.

Result와 회원 상태에 `ownCommitObservation`, `observedOwnCommitCount`, `collectionLimitNotes`가 있다. `NONE/0/[]`은 완전 조회에서 본인 커밋 0개로 결과·실패·Catch가 없는 EMPTY다. `FOUND`는 양수 관측 수이며 후보 수와 다르다. `UNKNOWN/null`은 조회 불명·한계 또는 관측 전 상태다. FOUND에도 수집 한계가 있을 수 있다. 수신·처리·반영·lifecycle·ownerResultsReady는 각각 보존하며 Receipt ACCEPTED만으로 Catch 열람 준비를 뜻하지 않는다.

등록·회원·요청이 삭제되면 관련 요청/동의/시도는 CASCADE로 제거된다. 실행 컨텍스트·늦은 결과 반영은 삭제된 부모나 타 회원의 등록을 복원하지 않는다. 현재 시도·중복/다른 내용·동일 작업·반영 트랜잭션 보호는 기존 검사를 유지한다.

## 배포와 되돌리기 조건

1. 구판 진행 요청, 요청/결과 대기 큐와 처리 중 작업을 운영자가 확인한다. v1/v2를 혼합 소비하지 않는다. 이 작업은 구판 큐 삭제나 운영 자료 초기화를 수행하지 않는다.
2. 새 마이그레이션 `1793245460352-AddRepositoryRegistration.ts`는 기존 `analysis_request`가 있으면 명확히 거부한다. 과거 동의로 새 등록·좌표 사본을 추측하지 않는다. 기존 자료가 있는 환경은 보존/전환 결정을 별도로 검토해야 한다.
3. 전용 시험 DB에서 up/down/up을 확인한다. down도 등록 자료가 남아 있으면 거부하며 자동 삭제하지 않는다. 운영 적용 전 백업·검증된 자료 준비와 별도 되돌리기 계획이 필요하다.
4. API·worker 이미지를 함께 교체하고 이미지 안 두 YAML 해시와 네 메시지 동등 판정을 확인한다. `.dockerignore`, 두 Dockerfile, 기존 CI 변경 감지와 `deploy/scripts/check-images.mjs`는 새 정본 경로를 사용한다.
5. C-03 실제 제공자, 고지 v2 확정, CatchU 공개 적용과 자료·외부 전송·비용 조건을 확인한 뒤 실제 분석을 검증한다. 조건 미충족 환경의 배포·실제 실행은 미실행이다.

## 검사와 현재 남은 증거

`npm.cmd test -- test/repository-registration.test.cjs test/db/repository-registration.test.cjs test/db/u7-analysis-intake.test.cjs test/u7-worker-context.test.cjs test/analysis/u7-receiver.test.cjs test/integration/u7-analysis-chain.test.cjs`는 전용 `_test` PostgreSQL에 실행한다. `CATCHU_TEST_REDIS_URL`은 전용 시험 Valkey로 지정한다. 미설정 skip은 통과가 아니다. 전체 명령·커버리지 대상은 [Unit 검사 지침](../../aidlc/spaces/default/intents/260925-intent-12/construction/u7-repository-analysis/code-generation/unit-test-instructions.md)을 따른다.

실제 GitHub·LLM 분석, 실제 거부 1~2종, 약 500개 실측은 합성 외부 응답 검사와 별개다. 사용자는 CatchU 공개 전환을 선택했지만 공개 적용, 실제 C-03, 고지 확정 및 실행 조건이 남아 있다. 합성 500개에서 기존 상세·생성 상한 200을 유지하며 전체 500개 분석 성공으로 기록하지 않는다. 상한 확정은 실제 측정 후 결정한다.
