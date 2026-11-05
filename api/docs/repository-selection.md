# 실제 회원의 선정 저장소 공급 — #252

현재 선정의 저장소 ID·활성 여부·범위 판본·선정 참조를 DB에 두고, [저장소 목록](member-repositories.md)·[#323](https://github.com/JminAILab/CatchU/issues/323) 접수 재확인·[#232](https://github.com/JminAILab/CatchU/issues/232) worker 선정 판정이 그 한 근거를 읽는다. 저장소 좌표(소유자·이름·주소)는 DB에 복사하지 않고 선정 참조로 [#319 좌표 카탈로그](selected-repository-coordinates.md)에서 읽는다. 과거 분석의 좌표 조회(#105)도 같은 카탈로그를 쓴다.

활성 실제 회원 모두에게 같은 현재 선정을 허용한다(2026-10-17 팀장 결정, #252 본문 「범위」). GitHub 연결·요청별 분석 동의·본인 기여 판정은 그대로 필요하며, 공통 허용이 기여나 Catch 생성을 보장하지 않는다. 목록에 GitHub 소유·기여 조회를 더하지 않았다. 개발 회원은 실제 GitHub 연결이 있어도 [#104 개발 공급](member-analysis.md#개발-회원과-합성-github-연결)을 유지한다. 실제·개발 구분은 [#322 회원 구분](member-analysis.md#실제개발-회원-구분--322) 하나만 쓴다.

이 작업은 #323 접수 API, #232 앱 등록·worker 연결, 화면, 관리 화면·회원별 허용표를 만들지 않는다. `AppModule`에는 목록 공급과 [#323 접수](analysis-intake.md#실제-회원의-접수--323)의 재확인이 연결됐다.

## 선정 근거 테이블

| 테이블 | 칼럼 | 규칙 |
|---|---|---|
| `repository_selection` | `repository_id`(PK)·`selection_reference`(유일)·`scope_revision`(FK)·`active` | 저장소 ID는 GitHub 숫자 ID 문자열이다. 선정 참조는 카탈로그 판본이고, 카탈로그의 저장소 ID와 다르면 공급 장애다. 제외는 `active=false`로 하고 행을 지우지 않는다 |
| `allowed_scope_revision` | `scope_revision`(PK)·`allowed_resource_types`·`whole_repository`·`collection_terms` | 범위 판본 하나가 허용 자료 종류·수집 범위·한도·전체 선정 의미를 식별한다. 행은 고치거나 지울 수 없다(트리거, `23514`). 10월은 저장소 전체 선정만 정의한다(`whole_repository = true` CHECK) |

`collection_terms`는 `method`·`range`·`limits`·`retries` 각각을 `{ status, value }`로 적는다. `status`는 `DECIDED`(팀장 결정)·`PROPOSED`(실측 전 제안)·`CONTRACT`(현행 계약)다. api는 이 값을 해석하지 않고 판본의 의미로 보존한다. 세 공급은 자료 종류 목록이 아니라 이 정의의 `whole_repository`로 전체 선정을 판정한다.

두 테이블은 [ERD v1](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md)에 없다. 기존 엔티티와 외래 키로 잇지 않는 내부 근거 테이블이다. ERD 반영은 팀장이 별도 PR로 한다. 두 테이블과 관계·불변 조건만 넣고 초기 자료 값·좌표 카탈로그는 넣지 않으며, 동의의 범위 판본은 외래 키 없이 대조 관계로 적는다([2026-10-19 팀장 결정](https://github.com/JminAILab/CatchU/pull/346#pullrequestreview-5568166382)).

## 초기 자료와 출처

| 저장소 | `repository_id` | 선정 참조 |
|---|---|---|
| [ljm0850/TheMe](https://github.com/ljm0850/TheMe) | `570342307` | `catchu:selected-repository:2026-10-16:570342307:v1` |
| [ljm0850/BEASTA-ZOO](https://github.com/ljm0850/BEASTA-ZOO) | `547322698` | `catchu:selected-repository:2026-10-16:547322698:v1` |

- 선정 대상: [#105의 2026-10-16 댓글](https://github.com/JminAILab/CatchU/issues/105#issuecomment-6210778022)이 두 저장소를 로그인한 모든 회원의 선정 대상으로 쓴다고 답했고, 2026-10-17 팀장 결정이 그 범위를 활성 실제 회원 공통 허용으로 정했다.
- 저장소 ID·선정 참조: PR #319 카탈로그(`selected-repository-catalog.ts`)의 판본을 그대로 쓴다. 2026-10-19 GitHub 공개 메타데이터로 두 ID가 같고 공개·비보관 상태임을 다시 확인했다. 분석 시점의 공개 관측이나 분석 허가가 아니다.
- 범위 판본 `catchu:allowed-scope:2026-10-19:v1`: 두 저장소가 함께 쓴다. 값과 지위는 아래 표다.

| 항목 | 값 | 지위·근거 |
|---|---|---|
| 허용 자료 종류 | `COMMIT`·`PULL_REQUEST`·`ISSUE` | 확정. #252·#323 본문 |
| 전체 선정 | 저장소 전체(`whole_repository`) | 확정. #232 본문 "10월 선택 범위는 선정 저장소 전체 하나" |
| 수집 방식(`method`) | GitHub API(`GITHUB_API`). 저장소 복제 없음, 연결 PR 조회만 GraphQL | `DECIDED`. 2026-09-29·10-10 팀장 결정([수집 통제 1.1](../../docs/CatchU_collection_control_scope.md#11-수집-방식--api만-쓴다)) |
| 수집 범위(`range`) | 기본 브랜치 최근 커밋 500, 연동 계정 커밋 상세 200, 최근 PR 100, 연동 계정 PR의 커밋 목록 30, 이슈 목록 최근 항목 100 | `PROPOSED`. 현재 worker 실행값([수집 통제 2.3](../../docs/CatchU_collection_control_scope.md#23-자원시간-상한) "이 표의 상한 수치는 모두 제안") |
| 한도(`limits`) | 호출 300회, 수집 600초, 총량 50MB, 단일 응답 10MB, 연결 5초·응답 15초, 비교 10쪽, 기준 브랜치 커밋 100, 연결 PR 묶음 100 | `PROPOSED`. 같은 표, worker `CollectionLimits` 기본값 |
| 재시도(`retries`) | 하지 않음(`NONE`) | `CONTRACT`. 현행 계약을 따르며 제안이 아니다 |

수치는 정의 시점(2026-10-19) [worker 기본값](../../worker/app/collection/limits.py)의 사본이며 확정 정책이 아니다. worker는 이 행을 읽지 않으므로 worker 기본값이 바뀌어도 이 판본은 바뀌지 않는다. 둘의 일치를 자동으로 검사하지 않는다. 수치가 바뀌면 아래 절차로 새 범위 판본을 추가한다. 값이 그대로 확정되면 새 범위 판본을 만들지 않고 [수집 통제 문서](../../docs/CatchU_collection_control_scope.md)에만 기록한다([2026-10-19 팀장 결정](https://github.com/JminAILab/CatchU/pull/346#pullrequestreview-5568166382)). 판본 행은 고칠 수 없으므로 `status`도 정의 시점 값 그대로다.

## 입력 방식과 초기화·갱신

초기 자료는 마이그레이션 `1792383899264-CreateRepositorySelection`이 테이블과 함께 넣는다. 제품 스키마와 자료 변경은 마이그레이션으로만 하고([api 규약](../CONVENTIONS.md#엔티티와-마이그레이션--기능-담당자-안내)), 배포는 별도 migration 이미지를 migration 계정으로 한 번 실행한 뒤 새 api를 시작한다(앱 계정은 자료 읽기·쓰기만, [배포 안내 「migration」](../../deploy/README.md#migration)). 그래서 변경이 PR 검토와 DB `migrations` 기록에 남고, 시험 DB도 `npm test`가 같은 자료를 넣는다. 코드 상수로 기동 때 채우는 방식은 코드 목록이 두 번째 현재 정본이 되고, 수동 SQL은 검토·기록이 없어, 관리 API는 이번 범위가 아니어서 택하지 않았다.

- 초기화: 로컬은 전용 `DB_*`를 명시해 `npm run migration:run`, 배포는 `replace-single.sh --migrate`다.
- 모든 갱신은 새 마이그레이션을 담은 PR로 한다. dev에 병합된 마이그레이션은 고치지 않는다.

| 바꿀 것 | 절차 | 진행 중·과거 분석 |
|---|---|---|
| 선정 추가 | 카탈로그에 새 판본을 더하고(같은 PR) `repository_selection`에 행을 넣는다 | 영향 없음 |
| 선정 제외 | `active = false`로 바꾼다 | 실행 전 최종 확인에서 `SCOPE_UNVERIFIED`. 종결된 분석의 좌표는 그대로 읽힌다 |
| 좌표(이름·소유자) | 카탈로그에 **새 선정 참조**의 판본을 더하고 행의 `selection_reference`를 바꾼다. 이전 판본은 고치거나 지우지 않는다 | 이전 참조에 동의한 시도는 `SCOPE_UNVERIFIED`, 그 결과·과거 분석은 이전 좌표로 등록·조회된다 |
| 범위 의미(자료 종류·범위·한도) | `allowed_scope_revision`에 새 판본을 넣고 행의 `scope_revision`을 바꾼다 | 이전 판본에 동의한 시도는 `SCOPE_UNVERIFIED` |

고지 판본은 #322가 따로 관리한다. 선정 대상과 수집 한도는 팀장이 정하고, 바꿀 때 마이그레이션 PR도 팀장이 올려 A 담당 리뷰를 받는다. 좌표 카탈로그를 바꾸면 B 담당 리뷰도 받는다([2026-10-19 팀장 결정](https://github.com/JminAILab/CatchU/pull/346#pullrequestreview-5568166382)).

## 세 공급

### 목록 — `GET /v1/me/repositories`

`MemberRepositoriesService`가 회원 구분으로 공급을 고른다. 실제 회원은 #231 `refreshStatus`로 보관 자격정보의 만료·이용 불가를 연결 상태에 먼저 반영한 뒤([GET /me와 같다](github-connection.md)), 한 `REPEATABLE READ` 스냅샷에서 회원 → 연결 → 활성 선정·범위 정의를 읽고 기존 다섯 필드·페이지·커서([목록 문서](member-repositories.md#페이지와-오류))로 돌려준다. 토큰은 읽지 않는다. 개발 로그인 설정(`DEV_LOGIN_ENABLED`·`NODE_ENV`)과 관계없다.

| 상황 | 응답 |
|---|---|
| 활성 실제 회원·실제 연결 | `200`. 실제 회원 모두 같은 목록 |
| 활성 선정 없음 | `200` 빈 `items` |
| 연결 없음·해제·재인증 필요·보관 자격정보(`github-v1:`) 없는 연결 | `403 GITHUB_CONNECTION_REQUIRED` |
| 개발 회원 | 기존 개발 공급 그대로(합성 목록, 개발 기능 꺼짐 `403 INTERNAL_ERROR`, 실제 연결은 보정 없이 `500 INTERNAL_ERROR`) |
| 미지원 출처·비활성 회원 | `403 INTERNAL_ERROR` |
| 선정이 카탈로그·범위 정의와 어긋남, 자격정보 보관소·DB 오류 | `500 INTERNAL_ERROR`. 빈 목록·합성 저장소·재인증 필요로 바꾸지 않는다 |

### 접수 재확인 — #323

```ts
// #323은 MemberRepositoriesModule을 가져와 주입한다. 트랜잭션 밖에서 github.refreshStatus(memberId)를 먼저 부른다.
const selection = await selections.confirmForIntake(manager, memberId, input.repositoryId);
if (input.consent.scopeRevision !== selection.scopeRevision ||
    input.consent.noticeRevision !== notices.real().noticeRevision) throw new ApiError('CONSENT_REQUIRED');
// insertInitialAnalysis(manager, { ..., scopeRevision: selection.scopeRevision, consentedScope: selection.consentedScope, sourceMode: 'LIVE' })
```

- 입력: #323 생성 트랜잭션(`READ COMMITTED`)의 `EntityManager`, 인증 회원 ID, 요청 저장소 ID. 다른 격리 수준·트랜잭션 없음은 판정 전에 예외다.
- 반환: `{ memberId, repositoryId, selectionReference, scopeRevision, allowedResourceTypes, wholeRepository: true, repository: { owner, name, url }, consentedScope }`. `consentedScope`는 동의 행에 그대로 저장할 네 칸 `{ revision, repositoryId, allowedResourceTypes, selectionReference }`다.
- 거부: 개발·미지원·비활성 회원은 `ForbiddenException`(`403 INTERNAL_ERROR`), 연결 상태는 목록과 같은 `GITHUB_CONNECTION_REQUIRED`, 현재 선정에 없거나 제외한 저장소는 `REPOSITORY_NOT_ALLOWED`.
- 장애: 선정 자료 불일치·DB 오류는 그대로 던진다. 합성 자료·선정 없음으로 바꾸지 않는다.
- 회원 → GitHub 연결 → 선정 → 범위 정의를 읽기 잠금하고 그 트랜잭션이 끝날 때까지 유지한다. `refreshStatus`의 상태 변경은 같은 연결 행을 고치므로 트랜잭션 안에서 부르지 않는다.
- 사용처: `AnalysisIntakeService`가 실제 회원의 새 접수·실패 재요청에 쓰고 같은 키 재전송에는 부르지 않는다. 판정·응답·검사는 [분석 접수 「실제 회원의 접수 — #323」](analysis-intake.md#실제-회원의-접수--323).

### worker 선정 — #232

`DatabaseRepositorySelectionSource`가 `WorkerRepositorySelectionSource`를 구현한다. 앱 등록과 worker 연결은 [PR #348](https://github.com/JminAILab/CatchU/pull/348)(#232)로 제품 조립에 들어갔다. 조립 조건은 [worker 컨텍스트 「조립 조건과 후속 공급자」](worker-context.md#조립-조건과-후속-공급자)를 따른다.

```ts
WorkerContextModule.register({ selectionSource: new DatabaseRepositorySelectionSource() });
```

받은 manager로만 읽고 외부 통신·별도 연결·독립 트랜잭션을 만들지 않는다. `lock: 'pessimistic_read'`이면 같은 트랜잭션에서 회원 → 선정 → 범위 정의를 읽기 잠금한 뒤 최신 자료로 판정한다. 저장 동의가 정확히 네 칸이고, 실제 활성 회원이며, 현재 활성 선정의 선정 참조·범위 판본·자료 종류가 동의와 같을 때만 카탈로그 좌표와 `wholeRepository: true`를 준다. 정의되지 않은 칸·부분 자료 종류·다른 좌표 판본·다른 범위 판본·제외·개발 회원은 `null`(`SCOPE_UNVERIFIED`), 선정 자료 불일치와 DB 오류는 예외다. 잠금 순서와 두 단계 확인은 [worker 컨텍스트](worker-context.md#조립-조건과-후속-공급자)를 따른다.

### 과거 좌표 — #105

등록 공급(`SelectedRepositoryRegistrationSource`)은 현재 선정과 관계없이 저장 동의의 원래 `selectionReference`를 카탈로그로 읽는다. worker 공급과 같은 참조를 같은 좌표로 해석한다. 큐 메시지의 두 참조는 `attemptId`이며 좌표 판본이 아니다.

## 재현

전용 DB에 `DB_*`를 명시해 마이그레이션을 적용한 뒤 현재 선정을 확인한다.

```sql
SELECT s.repository_id, s.selection_reference, s.scope_revision, s.active, d.allowed_resource_types, d.whole_repository
FROM repository_selection s JOIN allowed_scope_revision d USING (scope_revision) ORDER BY s.repository_id;
```

실제 회원의 HTTP 목록은 Google 로그인([google-login.md](google-login.md))과 GitHub 연결([github-connection.md](github-connection.md)) 설정이 있어야 재현된다. 개발 로그인 토큰은 개발 공급을 받는다. 설정이 없으면 아래 실제 공급 검사로 확인한다.

## 검사

| 구분 | 파일 | 내용 |
|---|---|---|
| 실제 공급 | `test/db/repository-selection.test.cjs` | 마이그레이션 up/down·DDL 일치·불변·CHECK, 초기 자료, 접수 재확인(회원·연결·저장소·트랜잭션 조건·읽기 잠금 대기), worker 공급 판정, 선정 자료 불일치·DB 오류 |
| 실제 공급 | `test/db/repository-selection-list-api.test.cjs` | HTTP 목록: 연결이 다른 실제 회원의 같은 목록, 개발 로그인 설정 무관, 개발 회원 경로 유지, 연결 상태·`refreshStatus` 반영(만료·파일 없음 403, 보관소 오류 500), 커서·페이지 사이 선정·연결 변경, 정상 빈 목록, 공급 장애 |
| 실제 공급 | `test/db/repository-selection-worker-api.test.cjs` | 실행 조회 HTTP: 접수 재확인 동의의 좌표, 최종 확인 전 커밋된 제외·범위 판본·좌표 판본 변경 거부, 최종 잠금 뒤 변경의 커밋까지 대기(`pg_blocking_pids`) |
| 실제 공급 | `test/integration/repository-selection-chain.test.cjs` | 큐 메시지 조립 → 실행 조회 → Catch 등록, 제외·새 좌표 판본·시도 종결 뒤 원래 좌표 조회 |
| 합성 대역 | `test/member-repositories.test.cjs`·`test/db/worker-context-api.test.cjs`·`test/integration/selected-repository-version-chain.test.cjs` | 개발 공급·페이지 계약, 시험용 선정 공급자로 본 worker 계약·좌표 연쇄 |

실제 공급 검사의 시험 대역은 GitHub OAuth·사용자 조회 응답, 연쇄 검사의 `resolveCredential`, 이름 변경을 가정한 새 좌표 판본, 경쟁 시점을 만드는 멈춤 지점뿐이다. 실제 GitHub·Google 호출, 큐·worker 실제 왕복은 검증하지 않았다. #323 접수 API의 공급 연결 검사는 [분석 접수 「개발 재현과 검사」](analysis-intake.md#개발-재현과-검사)에 있다.
