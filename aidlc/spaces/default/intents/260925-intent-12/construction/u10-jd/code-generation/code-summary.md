# U10 JD 관리·요약 구현 및 검사 기록

작성일: 2026-11-04. 기준 커밋은 `fdf5b787b25159c8edab9e97663129b5b3569e59`이며 아래 결과는 그 위의 현재 로컬 변경을 검사한 것이다.

## 현재 상태와 승인 범위

사용자의 **Approve Plan**(메시지 `695e0de9`)이 공식 Plan Approval 기록으로 남은 뒤 구현했다. 승인된 기능 설계·NFR 요구사항·NFR 설계와 기존 문서는 유지했다. 계획 본문과 검사 지침을 바꾸지 않고 완료한 체크박스만 표시했다.

독립 구현과 관련 검사는 완료했다. **전체 계획은 32/37 항목 완료이며 U10 전체 완료가 아니다.** 공용 web PATCH·Bearer와 링크 grant 동시 전달, #416 실제 C-10 제공자·C-11 슬롯이 남아 있다. 기존 JD 수정 저장은 제품 화면에서 비활성이며 요약 패널은 실제 공유 화면과 AppModule에 연결하지 않았다.

Step 4의 실제 PATCH 연결 항목, Step 8의 세 항목, Step 9의 공식 완료 검토가 미완료다. 실제 연결이 남은 상태에서 Code Generation 완료·Unit 완료·승인·다음 단계 진입을 기록하지 않는다. 실제 제공 판본을 확인하고 남은 연결·검사를 마친 뒤 공식 완료 검토를 진행한다.

## 변경 파일과 구현 결정

전체 47개 파일(API 27개, web 20개)의 정확한 목록은 [source-manifest.json](source-manifest.json)에 있다.

| 범위 | 주요 파일·변경 |
|---|---|
| JD 관리 API | `api/src/jd/` 6개: 본인 CRUD, 입력 검증, 20개 cursor, controller/module. `app.module.ts`에 관리 모듈 등록 |
| 요약 API | `api/src/jd-summary/` 10개: 실행·결과, 접수·조회, 순차 처리, 조건부 저장, 안전 로그, 명시적 C-10 주입 경계 |
| DB | `1793762571117-CreateJdSummary.ts`: JD 3개 표와 인덱스·CHECK·복합 FK·CASCADE. 기존 migration 변경 없음 |
| API 검사 | `api/test/jd/`의 관리·요약·통합 검사 3개 및 합성 fixture 1개 |
| 공용 오류·문서 | 승인된 422 INVALID_INPUT/INPUT_TOO_LARGE 추가, API 규약·README·삭제 책임표 및 `api/docs/jd.md` |
| web | `web/src/features/jd/`의 API/파서·상태·화면·CSS·README와 `/jds` 라우트 |
| 탐색·web 검사 | 회원 메뉴·복귀 허용 경로·README, JD 검사 2개와 기존 탐색 검사 보완 |

주요 동작은 다음과 같다.

- JD 원문과 UTF-16 저장/실행 상한을 보존한다. 공백만인 값·추가 필드를 거부하며 조용히 잘라 저장하지 않는다. 목록은 필요한 필드만 명시적으로 반환한다.
- 접수는 C-10 접근, 본인 입력, C-04 동의, C-09 DONE 확인 후 짧은 JD 잠금에서 재검증한다. C-03 소비와 실행·사본·PENDING 결과를 같은 트랜잭션에 저장하고 커밋 뒤 C-02에 등록한다.
- 요구사항별 검색·생성은 순차이고 각 최대 한 번이다. C-01 HAIKU와 공용 입력·출력 검사를 사용하며 위치·인용·역할을 보존한다. 정상 EMPTY와 실패를 구분한다.
- R-01의 개별 생성 시간 초과·제공자 오류는 GENERATION_FAILED와 “이 요구사항을 처리하지 못했습니다.”로 통일했다. 전체 20분 시한은 DEADLINE_EXCEEDED와 별도 안내를 유지한다.
- 실행 행 잠금을 취득한 뒤에도 시각을 다시 확인한다. 남은 PENDING만 종료하고 이미 저장한 DONE을 보존한다. 기존 행만 UPDATE하며 삭제된 부모·결과를 되살리지 않는다.
- 로그는 승인 O1의 허용 필드와 고정 분류만 구성한다. 실제 상태 변경 커밋 뒤 완료·시한 확정을 기록한다.
- web은 계정/token/run 변경, 접근 상실, 늦은 조회·접수 응답을 처리한다. 접수 대기 중 선택한 과거 실행을 늦은 응답이 덮지 않는다. React 텍스트와 받은 citation.location을 사용하고 동의 뒤 한 번만 재요청한다.

공용 `web/src/lib/api-client.ts`·`auth-api.ts`, U2 계약/운영 제공자, 의존성·잠금 파일·CI·새 환경설정은 변경하지 않았다. 직접 fetch·토큰 복제·운영 합성 대체를 추가하지 않았다. 새로운 성능·가동률·복구 목표도 추가하지 않았다.

## 실행 환경과 검사 결과

Docker의 기존 `catchu-u7-api:20261029-schema-r2` 이미지에서 Node **24.21.0**, npm **11.19.0**을 사용했다. 로컬 호스트의 다른 Node 판본을 성공 근거로 사용하지 않았다. 저장소를 `/workspace`에 연결하고 API는 `/workspace/api`, web은 `/workspace/web`에서 검사했다.

DB는 U10 전용 PostgreSQL/pgvector(`pgvector/pgvector:0.8.7-pg16-trixie`)의 빈 개발 DB `catchu_u10_dev`와 검사 DB `catchu_u10_test`다. 큐는 전용 `valkey/valkey:8.1.6-alpine`을 사용했다. 기존 다른 Unit 컨테이너·자료는 사용하지 않았다. 이미지의 SSL 기본값 때문에 최초 로컬 연결이 거부되어 **검사 프로세스에만** `PGSSLMODE=disable`을 지정했고 이후 정상 실행했다.

검사 종료 후 U10 전용 DB·Valkey 컨테이너 두 개를 종료했다. 재검사가 필요하면 `catchu-u10-db-20261104`, `catchu-u10-valkey-20261104`를 시작하고 같은 전용 네트워크 `catchu-u10-test-20261104`에서 검사한다.

| 검사 | 최종 결과 | 한계 |
|---|---|---|
| API 관리 7·요약 7·핵심 통합 6 | 20/20 통과, 실패 0·skip 0, exit 0 | C-10·검색/생성 응답은 합성 |
| 기존 API 회귀 5파일 | 33/33 통과, 실패 0·skip 0, exit 0 | 연쇄 삭제·C-01/C-02/C-03/C-04 범위 |
| web 관리 7·요약 7·탐색 회귀 8 | 22/22 통과, 실패 0·skip 0 | 상태 모델·합성 transport·정적 렌더 |
| API lint / typecheck / build | 통과, exit 0 | build는 최종 coverage·회귀 명령의 선행 단계에서도 실행 |
| web lint / typecheck / production build | 통과, exit 0 | 빌드에 /jds 포함. 실제 브라우저 검사는 아님 |
| DB migration | 기존 22개 적용, 새 1개 생성, up/down/up 모두 통과 | 새 migration에 U10 외 DROP/변경 없음. 격리 개발 DB만 사용 |
| API·web diff 공백 검사 | 통과 | 전체 diff의 엔진 소유 감사 기록에는 공백 경고가 있어 원문을 수정하지 않음 |

새 시나리오 34개와 관련 회귀 41개, **합계 75개가 통과**했다. 초기 실패는 목록 DTO의 undefined 필드 노출 모양과 최신 로그 변경 전 dist/검사 조합이었다. 명시적 DTO 매핑과 최신 재빌드로 해결했으며 기대값을 낮추지 않았다. 잠금 대기 중 시한·개발 모드 재활성화·늦은 접수 응답 경합 보완까지 최종 검사에 포함했다.

고정 의존성 설치는 성공했다. npm은 기존 잠금 판본에 API moderate 11개·web moderate 16개의 감사 알림과 선택 설치 스크립트 경고를 출력했다. 자동 수정·패키지/런타임 갱신은 하지 않았으며 이 알림은 U10 코드 검사 통과와 별개다.

### 커버리지 범위

| 대상 | 줄 / 분기 / 함수 | 측정 범위와 제외 |
|---|---|---|
| API | 99.01% / 86.83% / 96.80% | `dist/{jd,jd-summary}/**`, 신규 제품 소스 16개 모두 포함. migration·기존 AppModule/error-codes와 전체 서비스는 범위 밖 |
| web | 91.10% / 82.02% / 85.16% | `src/features/jd/**`, 해당 TS/TSX 누락 없음. TSX 변환 결과·CSS stub 0% 포함. /jds 라우트·기존 메뉴는 범위 밖 |

위 수치는 **전체 프로젝트 80% 충족 증거가 아니다.** web 수치는 실제 브라우저 effect·클릭·초점·배치·통합 인증 hook 검증을 대신하지 않는다. 전체 서비스 검사·조립된 커버리지와 CI는 Build and Test 및 병합 전 확인 대상으로 남긴다.

### 실행 명령

API 작업 위치에서, 위 Docker 판본과 전용 DB/Valkey 환경으로 실행했다.

```sh
npm run migration:generate -- src/database/migrations/CreateJdSummary
npm run migration:run
npm run migration:revert
npm run migration:run
npm run lint
npm run typecheck
TEST_COVERAGE_INCLUDE='dist/{jd,jd-summary}/**' npm run test:coverage -- test/jd/jd-management.test.cjs test/jd/jd-summary.test.cjs test/jd/jd-integration.test.cjs
npm test -- test/db/member-cascade-delete.test.cjs test/u2/ai-gate-jd.test.cjs test/u2/ai-run.test.cjs test/u2/daily-run-limit.test.cjs test/u2/ai-consent.test.cjs
```

web 작업 위치에서 실행했다. 빌드는 `NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1`을 사용했다.

```sh
node --test --experimental-test-coverage --test-coverage-include="src/features/jd/**" test/jd-management.test.mjs test/jd-summary.test.mjs test/member-navigation.test.mjs
npm run lint
npm run typecheck
npm run build
```

## FR19 확인 결과와 미실행

| 대상·방식 | 실제 확인 결과 | 근거·추가 조건 |
|---|---|---|
| 실제 Nest Guard/HTTP + 격리 PostgreSQL | 본인 CRUD, 원자 차감·rollback, 사본 불변, 복합 FK·부모 삭제, 늦은 저장·시한 경합 통과 | `api/test/jd/` 20개와 기존 회귀. 회원·발행본은 합성 자료 |
| C-09 상태 / 검색 | getIndexState는 실제 모듈·DB로 확인. 검색 hit은 합성 주입 | 실제 외부 임베딩·운영 검색 품질 미실행 |
| C-01 직접 대역 / 공용 검사 관문 | 합성 GatedOutput을 쓰는 흐름과 실제 CheckedAiGenerationGate에 합성 Messages 응답을 넣는 조합을 구분해 통과 | 공용 검사 통과는 실제 의미적 근거 품질·속도 보장이 아님 |
| C-02 실제 로컬 Valkey | 커밋 후 등록·전달과 공용 실행 회귀 통과, 관련 skip 0 | 합성 payload. 개발 서버·배포 큐 완료를 뜻하지 않음 |
| U10 화면·상태 | 합성 transport·C-11 props·정적 렌더, 세션/선택 경합·R-01·텍스트 escaping·location 전달 통과 | 실제 공유 슬롯·원문 강조·브라우저 효과/초점/760·1024·1536px 확인 미실행 |
| 실제 C-10/C-11·제품 web↔api | **미연결·미실행** | #416 제공 판본, 실제 주입 토큰/슬롯과 공용 PATCH·Bearer+grant 지원 필요 |
| 동일 JD 한 건의 전체 입력/검색 기반 비교 | **미실행** | 승인 관측성 설계 O3·계획 Step 9의 후속 검증. 실제 자료·외부 호출·비용 허용이 필요 |
| 실제 외부 AI·배포·전체 CI/커버리지 | **미실행** | 현재 결과로 완료를 주장하지 않음. U7·#450 검사를 반복하거나 대체하지 않음 |

## 추적표와 다음 작업

[traceability.json](traceability.json)은 AC 13개·BR 16개·상세 NFR 28개를 기록한다. 도구가 생성한 53개에 승인 관측성 설계의 NFR3.1·3.2·6.2·6.3을 추가해 총 57개를 보존했다. `OK`는 해당 독립 구현·검사 또는 기능 문서의 대응을 뜻하며 제품 통합 완료가 아니다.

AC6.1.1·AC6.1.3·AC6.1.8·AC6.5.1은 실제 화면/제공자 연결이 남아 `GAP`으로 두었다. NFR3.1의 실제 비교도 `GAP`이다. 나머지의 상세 실행 범위는 위 FR19 표를 함께 읽어야 한다.

다음 작업은 승인 계획을 유지한 채 제공 판본을 확인·반영하고 Step 4의 PATCH 연결과 Step 8을 마치는 것이다. 실제 web↔api·C-11·근거 강조·접근 상실을 확인하고 첫 실제 연결 결과의 사용자 확인을 받은 뒤 공식 완료 검토를 수행한다. 공용 기능의 의미를 바꾸거나 계획의 소유 범위를 넘는 변경이 필요하면 해당 연결을 멈추고 먼저 알린다.

#416의 [연결 순서 답변](https://github.com/JminAILab/CatchU/issues/416#issuecomment-6593877292)을 기준으로 독립 구현 시점에는 실제 제공자가 없었다. 이후 제공 판본과 미결 사항은 아래 사전 연결 준비에 기록한다. U10 소스·기존 설계와 승인 기록은 보존하며 다른 Unit을 release하지 않는다.

## C-10 사전 연결 준비 — 2026-11-04

사용자 메시지 `727a8ede`에 따라 [#416 제공자 답변](https://github.com/JminAILab/CatchU/issues/416#issuecomment-6622737535)을 승인 U10 설계 및 현재 소스와 대조했다. 이 절은 연결 준비와 **미확정 의견**이며 공용 계약 변경·설계 재승인·실제 연결 완료가 아니다. 승인 계획·시험 지침의 본문과 기존 설계 원본은 수정하지 않았다.

### 확인한 제공 경계

- C-10 사전 연결 기준은 [#468의 5e8a173](https://github.com/JminAILab/CatchU/pull/468)이다. 확인 시 Draft·미병합이며, 제공자는 DB 구현을 #468 병합 뒤 사용한다고 명시했다. 병합 전 실제 제품 등록·부분 소스 복사는 하지 않는다. 병합 판본이 달라지면 C-10 관련 차이만 확인한다.
- [PublicationsModule](https://github.com/JminAILab/CatchU/blob/5e8a173cb481f184a35ec47e9ea710d4733f0a64/api/src/publications/publications.module.ts)이 `PUBLICATION_ACCESS`를 내보내며, 형은 `api/src/publications/publication-access.ts`다. 현재 U10의 `JdSummaryModule.register`는 아래 등록 모양을 이미 수용한다. 아래는 적용 전 준비 예시이며 AppModule에 쓰지 않았다.

```typescript
JdSummaryModule.register({
  publicationAccess: { useExisting: PUBLICATION_ACCESS },
  imports: [PublicationsModule],
})
```

- C-10 API 연결은 C-11 및 공용 web 전송 제공과 분리해서 진행할 수 있다. **실제 등록 전 조건은 #468 병합과 OQ-U4-NFR-5·6의 결정 확인**이다. U4 내부의 계약 밖 메서드 `resolveForRecipientIn`·`readSnapshotIn`을 U10에서 호출하지 않는다.
- C-11은 #468 병합 후 **제출 3 대기**다. 제공 예정 위치는 `web/src/features/recipient/recipient-screen.tsx`의 4번 JD 자리와 `recipient-grants.ts`이며, 날짜는 미정이다. props는 U4 화면 내부 형으로 제공한다. 아직 존재하지 않는 슬롯·형을 U10에서 선행 작성하거나 실제 연결로 표시하지 않는다.

### 두 미결 사항과 U10 의견

근거: [U10 기능 명세 W2·W3·W4](../functional-design/functional-spec.md), [보안 설계 S1·S3](../nfr-design/security-design.md), [신뢰성 설계 R1~R3](../nfr-design/reliability-design.md), [U4 보안 설계의 판정 시점·소유 회원 처리](../../u4-publication-link/nfr-design/security-design.md), [C-10 제공자 코드](https://github.com/JminAILab/CatchU/blob/5e8a173cb481f184a35ec47e9ea710d4733f0a64/api/src/publications/db-publication-access.ts).

| 미결 | U10 대조 결과 | 제안 및 결정 필요 사항 |
|---|---|---|
| OQ-U4-NFR-5: 접근 판정 뒤 중지·삭제 | U10 제품 코드는 `readSnapshot`을 호출하지 않는다. 그러나 `accept/list/detail`은 `resolveForRecipient`가 끝난 뒤 별도 DB 작업을 하므로, 판정 이후 중지가 커밋돼도 그 요청의 접수·조회가 진행될 수 있다. 접수는 차감·실행 생성이 따르므로 단순 사본 조회와 동일하게 설명해서는 안 된다. 승인 설계는 매 요청 판정과 별도 짧은 저장 트랜잭션을 정하며, 이 경합의 허용 시점까지 정하지 않았다. | **요청별 판정 시점을 기준으로 이미 통과한 한 요청의 진행을 허용하고 다음 요청부터 차단하는 방식을 제안한다.** 특히 POST에서 판정 뒤·접수 커밋 전 중지의 경우에도 차감·실행 생성이 가능한지 U4·U10 및 팀장이 명시적으로 결정해야 한다. 이미 접수된 작업은 저장된 publicationId로 C-09를 사용하며 grant를 큐에 싣거나 매 줄 C-10을 재판정하지 않는 기존 설계를 유지하는 쪽을 제안한다. 이것을 수락된 정책으로 간주하지 않는다. |
| OQ-U4-NFR-5: 삭제와 사본 부재 | 발행본 삭제는 실행·사본·결과를 CASCADE 삭제하고 늦은 저장은 기존 행 UPDATE로만 처리한다. 판정 뒤·접수 저장 전 삭제는 FK로 접수 트랜잭션이 실패할 수 있고 차감도 롤백된다. 현재 구현은 이 저장 예외를 일반 500으로 전파하므로 이를 404로 보장하지 않는다. `readSnapshot` 부재의 `NotFound`는 U10에서 직접 소비하지 않는다. | 삭제를 성공·빈 사본으로 대체하거나 실행을 재생성하지 않는다. 접수 경합의 외부 오류를 404 `LINK_UNAVAILABLE`로 통일할지도 위 결정에서 구분해야 한다. `readSnapshot` 실패 이름·호출자별 매핑은 U4가 C-10 계약에 명시하고 소비자와 합의할 사항이다. U10은 계약을 먼저 바꾸거나 불필요한 사본 읽기를 추가하지 않는다. |
| OQ-U4-NFR-6: 소유 회원 비활성·회원 없음 | 승인 U10은 실행 회원의 AUTH 오류와 링크 오류를 분리하지만, 발행본 **작성자**의 비활성·회원 없음 정책을 따로 정하지 않았다. 제공자는 동일 읽기 전용 REPEATABLE READ 안에서 중지·만료 다음, grant 전에 작성자를 확인한다. 비활성은 `LinkUnavailable`이어서 U10의 404 `LINK_UNAVAILABLE`로 매핑된다. 유효 발행본의 작성자 행 없음은 `PublicationOwnerMissing`이 전파되어 공통 필터의 고정 500 `INTERNAL_ERROR`가 된다. | **기존 비활성 404·회원 없음 500을 유지하는 쪽을 제안한다.** 실행 회원의 401로 바꾸거나 로그인 갱신으로 복구하려 하지 않는다. 없는 작성자 행은 정상 탈퇴와 구분한 데이터 불일치로 취급하고 토큰·SQL·내부 메시지를 노출하지 않는다. U4 제안·U2 회원 상태/탈퇴 확인 후 팀장이 결정하고 C-10 판정 순서·실패 의미를 문서화해야 한다. U10에서 작성자 조회·상태 검사를 복제하지 않는다. |

판정과 후속 작업을 원자적으로 묶거나 이미 진행 중인 요청·작업까지 즉시 취소해야 한다는 결정이면, 현재 공용 계약과 U10 승인 설계에 영향을 준다. 이 경우 공용 제공자·계약 소유자와 변경 범위를 먼저 합의하며, 반복 판정만 추가해 원자성을 확보했다고 보고하지 않는다.

### 연결 후 필요한 검사 범위 — 이번에는 미실행

1. 실제 모듈·토큰으로 U10 접수/목록/상세를 구성하고, 유효한 grant에서 본인 실행·발행본 조건과 202 접수가 유지되는지 확인한다. C-11 브라우저 연결은 이 검사에 포함됐다고 하지 않는다.
2. 새 C-10 경계가 중지·만료·삭제·grant 거부를 U10의 링크 오류로 전달하는지 확인한다. 실행 회원 인증 실패와 작성자 비활성은 별개로 구분한다.
3. 합의된 OQ5의 판정 뒤 중지·삭제 시점에 대해서만 U10 접수·조회 경합을 확인한다. 삭제된 부모의 차감 롤백·새 실행 부재 및 늦은 결과 폐기는 기존 FK/저장 검사 증거를 재사용하고 새 연결로 달라지는 부분만 보완한다.
4. OQ6 결정대로 작성자 비활성·재활성 응답과 회원 행 없음의 고정 오류를 U10 HTTP 경계에서 확인한다. 회원 행 없음은 FK가 있는 정상 DB 상태와 구분하여 필요한 대역 검사로 명시한다. 기존 U4의 판정 순서·grant·DB 검사 전체는 반복하지 않는다.

제공자가 보고한 `5e8a173` CI의 API 1,740 통과·3 건너뜀·0 실패는 **U4의 기존 증거**이며 U10 실제 앱 연결 검사 결과가 아니다. 이번 작업은 문서·코드 읽기와 준비 기록만 수행했다. 기존 U10 75개 검사, U4 검사, 전체 빌드·커버리지는 다시 실행하지 않았고 소스·등록부·승인·Unit 상태도 바꾸지 않았다. 두 미결에 대한 새 의견은 이 문서에 준비했으며 기존 #416 연결 요청 댓글은 반복하지 않았다.

## 공용 호출 PR #471 확인 — 2026-11-04

사용자 메시지 `e237b081`의 순서에 따라 최신 [#471](https://github.com/JminAILab/CatchU/pull/471) head `e81d15381f696a6b99bc14f39f0261ac3c90248b`를 확인했다. 변경 5개는 web 파일이며, [api/src/cors.ts 39행](https://github.com/JminAILab/CatchU/blob/e81d15381f696a6b99bc14f39f0261ac3c90248b/api/src/cors.ts#L39)의 허용 메서드는 GET·POST·PUT·DELETE로 **PATCH가 빠져 있다**. 교차 출처 브라우저의 PATCH 사전 요청이 통과할 수 없어 1단계 중단 조건에 해당한다. `X-Link-Grant` 허용 헤더는 이미 있다.

[기존 CORS 시험](https://github.com/JminAILab/CatchU/blob/e81d15381f696a6b99bc14f39f0261ac3c90248b/api/test/cors.test.cjs#L52)은 POST 사전 요청이며 91행 이후에도 허용 메서드의 PATCH 포함을 검사하지 않는다. PR의 web fetch 대역 검사 통과는 이 브라우저 CORS 문제를 검증하지 못한다. 필요한 보완은 API 허용 메서드에 PATCH를 넣고 PATCH 사전 요청·허용 메서드를 확인하는 검사 증거를 제공하는 것이다. [기존 지적](https://github.com/JminAILab/CatchU/pull/471#discussion_r4464915099)을 반복 게시하지 않았다.

소스·시험·PR 증거를 읽기만 했으며 검사를 실행하지 않았다. 최신 CI·나머지 기능의 승인 판단은 다음 단계로 넘기지 않았고 Approve 리뷰·병합·로컬 통합 반영·U10 어댑터 변경도 하지 않았다. 본인 계정 웹 제출을 위한 Chrome 창 선택은 앱 접근 승인 시간 초과로 열리지 않았으며 웹 제출은 없었다. 기존 U10 작업·승인·Unit 상태·#452 열린 상태와 C-10/C-11의 별도 연결 조건을 유지한다.

## GitHub 소통 기준

2026-11-04 사용자 지시(메시지 `4ae14d65`)부터 U10의 GitHub 진행 댓글은 다른 사람의 답이 필요한 새 요청, 중요한 막힘, PR 제출·완료 결과에만 사용한다. 단계별 진행·작은 수정·검사 상세는 기존 AI-DLC 문서에 기록하고 승인·감사 기록은 기존 절차대로 유지한다. 변화 없는 대기와 이미 전달한 내용은 반복 게시하지 않으며 기존 댓글을 삭제하지 않는다.

- #416의 [기존 C-10/C-11 연결 요청](https://github.com/JminAILab/CatchU/issues/416#issuecomment-6622424634)은 반복하지 않는다.
- 공용 PATCH·회원 인증과 링크 권한 동시 전달은 [기존 팀장 요청](https://github.com/JminAILab/CatchU/issues/452#issuecomment-6622422944)과 그 답변을 먼저 확인한다. 담당 확인이 새로 필요한 경우에만 질문을 한 댓글로 모은다.
- 구현은 기존 승인 범위대로 이어가며 실제로 준비된 제공자부터 연결한다. 새 연결의 영향 범위만 검사하고 합성 검사와 실제 연결 검사를 구분한다.
- 이번 지시는 소통 방식의 변경이며 구현 범위 변경, 단계 승인 또는 U10 완료 승인이 아니다.

## 기록 저장 확인

기존 `M` 표시와 별개로 U10 감사 shard의 새 이벤트를 확인했다. 아래는 원문이 아닌 시각·종류의 요약이다.

| 산출물 | 새 기록(UTC) |
|---|---|
| source-manifest.json | 2026-11-04T03:57:10Z ARTIFACT_CREATED |
| traceability.json | 2026-11-04T03:57:19Z ARTIFACT_UPDATED |
| code-summary.md | 2026-11-04T03:58:51Z ARTIFACT_CREATED |

