# U10 JD 관리·요약 구현 및 검사 기록

최초 작성일: 2026-11-04. 독립 구현과 기존 75개 검사 기준은 `fdf5b787b25159c8edab9e97663129b5b3569e59`다. 2026-11-05 통합 반영과 추가 변경·검사는 아래 별도 절에서 구분한다.

## 현재 상태와 승인 범위

사용자의 **Approve Plan**(메시지 `695e0de9`)이 공식 Plan Approval 기록으로 남은 뒤 구현했다. 승인된 기능 설계·NFR 요구사항·NFR 설계와 기존 문서는 유지했다. 계획 본문과 검사 지침을 바꾸지 않고 완료한 체크박스만 표시했다.

독립 구현과 관련 검사, #474 삭제 처리 보완 및 #471 공용 호출 어댑터 연결을 완료했다. **전체 계획은 35/37 항목 완료이며 U10 전체 완료가 아니다.** 2026-11-06에는 JD 실제 브라우저 9개 시나리오와 실제 C-10 영향 검사 9개를 확인했다. 사용자 `de47f2f4`가 C-11 대기를 해제한 뒤 #482 제공 판본을 통합하고 공유 화면 4번 자리에 U10 패널을 연결했다. 새 C-11/통합 영향 검사 16개·정적 검사와 실제 브라우저의 접수/PENDING·합성 저장 DONE 재열람·원문 강조·접근 상실을 확인했다. 실제 큐 처리·외부 AI 생성과 구분하며 첫 실제 연결 결과의 사용자 확인은 아직 받지 않았다.

Step 4의 공용 PATCH와 Step 8의 제공 판본/실제 등록·슬롯 경계 확정(작업 31·32)은 완료했다. Step 8 작업 33은 최초 실제 연결 결과의 사용자 확인과 실제 제품 큐 연결 검사가 남았고, Step 9 작업 37의 공식 검토·보고는 conductor가 진행한다. Code Generation 완료·Unit 완료·다음 단계 진입이나 새로운 승인을 기록하지 않는다.

## 변경 파일과 구현 결정

U10 변경 파일의 정확한 최신 목록은 [source-manifest.json](source-manifest.json)에 있다. 기존 49개 파일(API 28개, web 21개)에 이후의 좁은 연결·검사 파일을 더해 관리하며, 통합 브랜치에서 받은 다른 Unit의 구현 전체를 U10 구현으로 세지 않는다. C-11을 붙인 U4 화면과 기존 검사 파일은 4번 자리 composition·그 기대값의 변경만 U10 범위다.

| 범위 | 주요 파일·변경 |
|---|---|
| JD 관리 API | `api/src/jd/` 6개: 본인 CRUD, 입력 검증, 20개 cursor, controller/module. `app.module.ts`에 관리 모듈 등록 |
| 요약 API | `api/src/jd-summary/` 10개: 실행·결과, 접수·조회, 순차 처리, 조건부 저장, 안전 로그, 명시적 C-10 주입 경계 |
| DB | `1793762571117-CreateJdSummary.ts`: JD 3개 표와 인덱스·CHECK·복합 FK·CASCADE. 기존 migration 변경 없음 |
| API 검사 | `api/test/jd/`의 관리·요약·통합·접수 경합 검사 4개 및 합성 fixture 1개 |
| 공용 오류·문서 | 승인된 422 INVALID_INPUT/INPUT_TOO_LARGE 추가, API 규약·README·삭제 책임표 및 `api/docs/jd.md` |
| web | `web/src/features/jd/`의 API/파서·상태·화면·CSS·README와 `/jds` 라우트 |
| 탐색·web 검사 | 회원 메뉴·복귀 허용 경로·README, JD 검사 3개와 기존 탐색 검사 보완 |

주요 동작은 다음과 같다.

- JD 원문과 UTF-16 저장/실행 상한을 보존한다. 공백만인 값·추가 필드를 거부하며 조용히 잘라 저장하지 않는다. 목록은 필요한 필드만 명시적으로 반환한다.
- 접수는 C-10 접근, 본인 입력, C-04 동의, C-09 DONE 확인 후 짧은 JD 잠금에서 재검증한다. C-03 소비와 실행·사본·PENDING 결과를 같은 트랜잭션에 저장하고 커밋 뒤 C-02에 등록한다.
- 요구사항별 검색·생성은 순차이고 각 최대 한 번이다. C-01 HAIKU와 공용 입력·출력 검사를 사용하며 위치·인용·역할을 보존한다. 정상 EMPTY와 실패를 구분한다.
- R-01의 개별 생성 시간 초과·제공자 오류는 GENERATION_FAILED와 “이 요구사항을 처리하지 못했습니다.”로 통일했다. 전체 20분 시한은 DEADLINE_EXCEEDED와 별도 안내를 유지한다.
- 실행 행 잠금을 취득한 뒤에도 시각을 다시 확인한다. 남은 PENDING만 종료하고 이미 저장한 DONE을 보존한다. 기존 행만 UPDATE하며 삭제된 부모·결과를 되살리지 않는다.
- 로그는 승인 O1의 허용 필드와 고정 분류만 구성한다. 실제 상태 변경 커밋 뒤 완료·시한 확정을 기록한다.
- web은 계정/token/run 변경, 접근 상실, 늦은 조회·접수 응답을 처리한다. 접수 대기 중 선택한 과거 실행을 늦은 응답이 덮지 않는다. React 텍스트와 받은 citation.location을 사용하고 동의 뒤 한 번만 재요청한다.

U10 보완에서 공용 `web/src/lib/api-client.ts`·`auth-api.ts`, U2 계약/운영 제공자, 의존성·잠금 파일·CI·새 환경설정은 직접 변경하지 않았다. 공용 호출 제공 변경은 #471 병합본에서 받았다. 직접 fetch·토큰 복제·운영 합성 대체를 추가하지 않았다. 새로운 성능·가동률·복구 목표도 추가하지 않았다.

## 최초 독립 구현의 실행 환경과 검사 결과 — 2026-11-04

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

아래 표는 독립 구현과 2026-11-05 보완 당시의 확인 범위를 보존한 기록이다. 이후 실제 C-10·JD 브라우저·C-11 연결 결과는 이 문서 말미의 날짜별 절을 따른다.

| 대상·방식 | 실제 확인 결과 | 근거·추가 조건 |
|---|---|---|
| 실제 Nest Guard/HTTP + 격리 PostgreSQL | 본인 CRUD, 원자 차감·rollback, 사본 불변, 복합 FK·부모 삭제, 늦은 저장·시한 경합 통과 | `api/test/jd/` 20개와 기존 회귀. 회원·발행본은 합성 자료 |
| C-09 상태 / 검색 | getIndexState는 실제 모듈·DB로 확인. 검색 hit은 합성 주입 | 실제 외부 임베딩·운영 검색 품질 미실행 |
| C-01 직접 대역 / 공용 검사 관문 | 합성 GatedOutput을 쓰는 흐름과 실제 CheckedAiGenerationGate에 합성 Messages 응답을 넣는 조합을 구분해 통과 | 공용 검사 통과는 실제 의미적 근거 품질·속도 보장이 아님 |
| C-02 실제 로컬 Valkey | 커밋 후 등록·전달과 공용 실행 회귀 통과, 관련 skip 0 | 합성 payload. 개발 서버·배포 큐 완료를 뜻하지 않음 |
| U10 화면·상태 | 합성 transport·C-11 props·정적 렌더, 세션/선택 경합·R-01·텍스트 escaping·location 전달 통과 | 실제 공유 슬롯·원문 강조·브라우저 효과/초점/760·1024·1536px 확인 미실행 |
| 실제 C-10/C-11·제품 web↔api | **미연결·미실행** | 현재 #471 공용 PATCH·Bearer+grant 어댑터는 연결됨. 제품 C-10 등록은 OQ6 결정, 공유 화면은 C-11 제공 및 실제 검사 필요 |
| 동일 JD 한 건의 전체 입력/검색 기반 비교 | **미실행** | 승인 관측성 설계 O3·계획 Step 9의 후속 검증. 실제 자료·외부 호출·비용 허용이 필요 |
| 실제 외부 AI·배포·전체 CI/커버리지 | **미실행** | 현재 결과로 완료를 주장하지 않음. U7·#450 검사를 반복하거나 대체하지 않음 |

## 추적표와 다음 작업

[traceability.json](traceability.json)은 AC 13개·BR 16개·상세 NFR 28개를 기록한다. 도구가 생성한 53개에 승인 관측성 설계의 NFR3.1·3.2·6.2·6.3을 추가해 총 57개를 보존했다. `OK`는 해당 독립 구현·검사 또는 기능 문서의 대응을 뜻하며 제품 통합 완료가 아니다.

현재 `GAP`은 AC6.1.1(새 접수부터 실제 큐 처리·생성 완료까지), AC6.1.3(실행 중 브라우저 종료 뒤 실제 큐 지속 처리), NFR3.1(실제 비교)이다. AC6.1.8의 유효 링크 재열람·중지 차단과 AC6.5.1의 JD CRUD는 2026-11-06 실제 브라우저 증거에 따라 `OK`로 갱신했다. 실제·합성 범위는 날짜별 결과와 함께 읽어야 한다.

다음 작업은 현재 연결 범위의 공식 검토 결과를 보고하고 첫 실제 연결 결과의 사용자 확인을 받는 것이다. 실제 제품 큐·외부 호출 조건과 남은 `GAP`은 별도로 남긴다. 공용 기능의 의미를 바꾸거나 계획의 소유 범위를 넘는 변경이 필요하면 해당 연결을 멈추고 먼저 알린다.

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

## 통합 반영과 연결 보완 — 2026-11-05

사용자 메시지 `5815dc58`에 따라 기존 미커밋 애플리케이션 47개와 Code Generation 산출물 6개·U10 감사 기록을 로컬 커밋 `e31c5376`으로 보존했다. 이어 통합 브랜치 `intent/260925-intent-12`의 `e84e70c6`을 merge commit `46bdaa73`으로 반영했다. 이 커밋들은 작업 보존과 로컬 통합이며 단계 승인·PR 병합·원격 제출이 아니다. 기존 승인 기록과 계획 본문·검사 지침은 유지한다.

- [#468](https://github.com/JminAILab/CatchU/pull/468)의 실제 C-10 제공자와 [#474](https://github.com/JminAILab/CatchU/pull/474)의 결정이 통합본에 포함됐다. #474 병합 커밋은 `a11ad963`이다.
- [#471](https://github.com/JminAILab/CatchU/pull/471)은 착수 시 미병합이었지만 작업 중 `2026-11-05T05:49:09Z`에 `e84e70c6`으로 병합됐다. 제공 head는 `c44b53d6`이다. 현재 공용 회원 호출에는 PATCH와 linkGrant가 있고 API CORS 허용 목록·검사에 PATCH가 포함된다. 기존 11월 4일의 미제공·CORS 보완 대기 기록은 당시 상태다.
- 병합 충돌은 API AppModule, web README·routes·member-navigation의 양쪽 추가를 보존해 해결했다. JD 관리와 발행본 모듈·경로를 함께 유지하고 제품 AppModule의 JdSummary 등록은 추가하지 않았다.
- [#416의 확정 삭제 안내](https://github.com/JminAILab/CatchU/issues/416#issuecomment-6647902634)에 따라 U10 접수의 `23503` 및 정확한 `fk_jd_summary_run_publication_id` 조합만 삭제로 처리한다. 다른 DB 오류는 500을 유지한다. 판정 뒤 중지·만료의 현재 요청 허용과 다음 요청 차단도 확정 결정에 포함된다.
- OQ6의 작성자 비활성·회원 없음 정책은 [기존 답변](https://github.com/JminAILab/CatchU/issues/416#issuecomment-6626574160)의 합의 전 처리와 최종 결정을 구분한다. [실제 등록 조건](https://github.com/JminAILab/CatchU/issues/416#issuecomment-6622737535)에 따라 OQ6 결정 확인 전 제품 C-10 등록은 대기다. 확정된 삭제 처리 보완은 전체 C-10 연결 완료가 아니다.
- C-11 공유 화면은 제출 3 대기다. U10이 슬롯이나 공용 제공자 파일을 대신 만들지 않는다. 새 질문·중요한 막힘이 없어 GitHub 진행 댓글을 추가하지 않는다.

### 변경과 좁은 검사 결과

이번 소스·시험·서비스 문서 변경은 API 3개와 web 7개다. API는 `jd-summary.service.ts`에서 TypeORM 트랜잭션의 롤백이 끝난 후 `driverError.code`와 `driverError.constraint`의 정확한 조합만 변환한다. SQL·메시지·상위 속성·유사 제약 이름을 해석하지 않으며 다른 오류는 원래 객체로 전파한다. 기존 저장 순서·공용 제공자·마이그레이션은 수정하지 않았고 `readSnapshot`을 추가하지 않았다.

web은 `memberTransport`·`createMemberJdApi`를 통해 기존 공용 결과 객체의 미전송·폐기·갱신 후 거부 표식을 보존한다. 관리 페이지의 PATCH를 활성화하고 요약 접수·목록·상세에 동일 factory를 제공한다. 회원 Bearer와 요청 시점 grant를 함께 전달하며 갱신·재전송은 공용 코드가 소유한다. C-11 슬롯의 실제 등록은 하지 않았다.

| 이번 검사 | 결과 | 증거 범위 |
|---|---|---|
| `api/test/jd/jd-acceptance-race.test.cjs` | 6/6 통과, 실패·skip 0 | 실제 PostgreSQL의 발행본 FK/다른 FK/일반 DB 오류, 저장·사본·결과·차감 롤백과 큐 미등록. C-10/검색/큐는 합성, 공용 오류 응답 함수에 응답 어댑터를 주입 |
| `web/test/jd-member-binding.test.mjs` | 7/7 통과 | 실제 공용 api-client/auth-api와 U10 adapter/model, 합성 fetch·갱신 세션. PATCH·Bearer/grant·LINK/AUTH 401·GET 1회 재조회·POST/PATCH 무재전송·입력 보존·계정 교체 |
| 기존 web 관리·요약의 1·4번 사례 선택 | 4/4 통과 | 미제공 기대를 제거한 관련 정적 화면 검사만 선택 |
| API build / typecheck / lint | 모두 exit 0 | build는 좁은 `npm test`의 선행 단계. DB migration 추가 적용 0개 |
| web typecheck / 변경 파일 lint | 모두 exit 0 | 전체 제품 연결·실제 브라우저 검사의 대체 증거가 아님 |
| 병합 보존·공백 검사 | 통과 | 충돌 4개 파일의 양쪽 추가 보존·충돌 표식 없음, API/web `git diff --check` 통과 |

신규 13개와 관련 선택 회귀 4개, **총 17개 통과**다. Docker `catchu-u7-api:20261029-schema-r2`의 Node 24.21.0·npm 11.19.0과 기존 잠금 의존성으로 실행했다. 전용 `catchu_u10_test` DB만 사용했고 검사 종료 후 이번에 시작한 `catchu-u10-db-20261104`를 종료했다. Valkey는 이번 검사에 필요하지 않아 시작하지 않았다. 초기 Docker/WSL 준비 문제는 해결한 후 검사를 실행했으며 실패를 skip으로 처리하지 않았다.

API 명령(`api/`):

```sh
npm test -- test/jd/jd-acceptance-race.test.cjs
npm run typecheck
npm run lint
```

web 명령(`web/`):

```sh
node --test test/jd-member-binding.test.mjs
node --test --test-name-pattern='^[14]\.' test/jd-management.test.mjs test/jd-summary.test.mjs
npm run typecheck
npm run lint -- src/features/jd/jd-api.ts src/features/jd/jd-management-page.tsx src/features/jd/jd-summary-panel.tsx test/jd-member-binding.test.mjs test/jd-management.test.mjs test/jd-summary.test.mjs
```

기존 75개 전체 검사·U7 검사·전체 커버리지·web production build·CI·실제 외부 AI는 이번에 실행하지 않았다. 위 좁은 검사는 실제 제품 C-10 등록, HTTP 서버 연결, web↔api 브라우저, C-11 공유 화면·근거 강조의 완료 증거가 아니다. 실제 비교·성능/품질 확인도 기존 후속 조건으로 남는다. 새로운 승인·완료 기록, PR 병합·push·#452 종료·GitHub 진행 댓글은 남기지 않았다.

산출물 검증에서 manifest 49개 경로 존재·중복 없음, 추적표 57개와 GAP 5개 유지, OK 대상 경로 존재를 확인했다. 승인 계획은 체크박스 외 본문 차이가 없다. 최신 소스·검사 변경은 `46bdaa73` 위의 로컬 미커밋 작업이며, 기존 작업 보존 커밋과 구분한다.

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

11월 5일에도 같은 U10 shard에서 새 `ARTIFACT_UPDATED` 이벤트를 확인했다. source-manifest는 `06:08:41Z`, traceability는 `06:15:03Z`, 계획 체크박스는 `06:16:14Z`, 코드 요약은 `06:17:10Z`에 기록됐다(모두 UTC). 기존 `M` 표시만으로 저장 성공을 판단하지 않았다. 승인된 기능 설계·NFR 요구사항·NFR 설계 파일은 보존 커밋과 통합 후 사이에 변경이 없다.

## JD 브라우저 검사 환경 기동 진단 — 2026-11-06

사용자 메시지 `e0b7a9da`의 승인 범위에서 U10 API·web 컨테이너 두 개만 만들고 상태·HTTP를 확인한 뒤 생성 ID를 지정해 정리했다. 기존 이미지 `sha256:ca31ea5bd429e78cbd4f02206bbdf4703ff5fb400957bf61a9cb6eb4e000348f`를 고정해 사용했다. Node 24.21.0 검사 뒤 web bootstrap의 `process.execArgv=[]`를 적용했다. API는 제품 `AppModule`·`configureApp`을 사용하고 분석 시한 스케줄러를 시작하지 않는 검사 bootstrap이며, 제품 `main.ts`·실제 큐 기동 검증과 구분한다.

| 대상 | 관측 결과 |
|---|---|
| API 생성·기동 | `docker run` exit 0, 최초 상태 running. 생성 ID `6e6c0fa9705f2afd85ffe42ea44174a239868aa028e27cecbbd0ec4acc6cbe60` |
| web 생성·기동 | `docker run` exit 0, 최초 상태 running. 생성 ID `1fa2700a83785ac355735781d1006b08abcbfa5a7414a1e0098256e73e35b004` |
| API `/health` 첫 HTTP | `ResponseEnded`, HTTP 상태 없음. `Invoke-WebRequest` 비종료 오류로 셸 exit 0이었으나 HTTP 성공이 아님 |
| web `/login` 첫 HTTP | `ResponseEnded`, HTTP 상태 없음, 셸 exit 1. 후속 결과 참조에서 null 오류도 발생 |
| 후속 컨테이너 상태·로그 | API running·ExitCode 0, web exited·ExitCode 1·OOMKilled false. web은 `EACCES: permission denied, mkdir '/workspace/web/.next/dev'`. `Ready in 32.5s` 로그도 있었으나 정상 기동으로 판정하지 않음. API 선별 시작 로그에는 성공·실패 표식이 없어 HTTP 실패 원인 미확인 |

HTTP를 다시 요청하거나 실패한 기동을 반복하지 않았다. 두 컨테이너의 사용자는 `1000:1000`, API bind는 읽기 전용, web bind는 `RW=true`였다. 호스트의 `web`·`.next`는 일반 디렉터리로 ReadOnly·ReparsePoint·Offline 속성이 없고 현재 사용자에게 FullControl이 있다. 공통 ACL에 `Everyone: Deny DeleteSubdirectoriesAndFiles`가 있으나 삭제 제한만으로 이번 `mkdir` 거부 원인을 단정할 수 없다. `.next/dev`는 없고 기존 디렉터리 시각은 11월 4일 그대로였다. Docker 내부 사용자·호스트 마운트의 권한 대응을 포함한 원인은 미확정이다.

web의 추적 파일과 기존 미추적 파일 323개의 기동 전·후 SHA256은 모두 같았다(추가·삭제·변경 각각 0). 기존 제품 코드·승인 기록·계획 본문은 보존했다.

정리는 생성 ID 두 개에 한정했다. `docker stop --time 20 <두 생성 ID>`는 exit 0이며 `--time` 사용 중단 예정 경고가 있었다(향후 `--timeout` 사용). 종료 조회는 API exited·ExitCode 0, web exited·ExitCode 1이었다. `docker rm <두 생성 ID>`와 삭제 확인용 ID 조회는 모두 exit 0이고 조회 결과가 비어 삭제를 확인했다. 기존 U10 DB·Valkey는 running이며 네트워크·DB 볼륨 보존 조회도 exit 0이다. DB 접속값은 출력하거나 별도 파일로 저장하지 않았으나 API 컨테이너의 `Config.Env`에 보관됐으며, 해당 컨테이너 삭제를 확인했다.

정상 기동을 확인하지 못해 `UNIT_PAUSED`를 재개하지 않았다. 구현·JD 브라우저 검사·실제 C-10 등록·제품 검사는 미실행이다. 기존 75개·17개 결과를 재사용하며 재실행하지 않았고, C-11은 별도 대기다. 외부 AI 호출·PR 병합·#452 종료·U10 전체 완료·GitHub 게시도 수행하지 않았다.

후속 제안은 기존 ACL·`.next`를 변경하지 않고 web의 `.next`에 `type=tmpfs,destination=/workspace/web/.next,tmpfs-mode=1777` 임시 마운트를 추가하는 것이다. 이 변경은 아직 승인·실행되지 않았으며 성공 근거가 아니다. 동일 오류의 반복 실행·자동 복구는 하지 않는다.

## API 준비 대기와 web 임시 출력 경로 기동 확인 — 2026-11-06

사용자 메시지 `f6b07cf9`의 별도 승인에 따라 API를 한 번 생성하고 최대 180초 안에서 준비 표식을 관찰했다. API `/health` 성공 뒤에만 web을 한 번 생성했다. 앞 절의 당시 미승인·미실행 기록은 유지하며 이번 허용 범위와 결과를 구분한다.

| 대상 | 관측 결과 |
|---|---|
| API | 생성 ID `f2e9e27e25eb8a714c2d5d46280af889ce963496a8b77cf1f2a0b35a714882b7`, `docker run` exit 0. 166초에 첫 로그, 176초에 `U10_JD_BROWSER_API_READY`·running 확인. 호스트 `/health`를 `-ErrorAction Stop`으로 조회해 exit 0, HTTP 200·`{"status":"ok"}` 확인 |
| web | 생성 ID `b37529e3e3fd18722b208c2892b1400ea30ecb0ecbd65d3166ebaaf93bbdd7b4`, `docker run` exit 0. 승인된 `.next` tmpfs(mode 1777)와 `process.execArgv=[]` 적용. `Ready in 19.3s`, 26초 관찰 시 running·실패 표식 없음 |
| web 호스트 HTTP | `/login` 요청은 60초 뒤 시간 초과, exit 1. 선별 로그에서 `EACCES: permission denied, open '/workspace/web/next-env.d.ts'`와 `UnhandledRejection` 확인. 상태는 running·ExitCode 0·OOMKilled false였으나 정상 HTTP 응답으로 판단하지 않음 |
| 같은 web 컨테이너의 허용된 진단 | Node 파일 메타데이터·쓰기 접근 조회: 프로세스 UID/GID 1000, web 부모 `0:0`·mode 777·쓰기 가능, `.next` tmpfs `0:0`·mode 777·쓰기 가능, `next-env.d.ts`는 `0:0`·mode 644·쓰기 불가(`EACCES`). 내부 `127.0.0.1:3000/login` 조회도 10초 `TimeoutError`, exit 1 |

`next-env.d.ts`에 대한 실제 쓰기 거부는 확인했다. API의 긴 준비 시간 원인이나 web 시간 초과의 다른 원인은 추가 관측 없이 단정하지 않는다. 실패 후 재생성·설정 변경·권한 수정은 하지 않았다.

생성 ID 두 개만 종료했다(`docker stop` exit 0). 두 컨테이너의 exited·ExitCode 0을 확인한 뒤 삭제했고(`docker rm` exit 0), ID 조회의 빈 결과(exit 0)로 삭제를 확인했다. 기존 U10 DB·Valkey는 running이며 기존 네트워크·DB 볼륨 보존 조회도 exit 0이다. API 접속값은 컨테이너 `Config.Env`에 보관됐으나 값 출력·별도 파일 저장은 없었고 해당 컨테이너 삭제를 확인했다.

api/web의 추적 파일과 기존 미추적 파일 867개(API 544개·web 323개)의 전후 SHA256은 모두 같다(추가·삭제·변경 각각 0). 호스트 생성 파일도 다음과 같이 보존됐다.

| 보존 대상 | 전후 동일한 SHA256 |
|---|---|
| 호스트 `.next` 731개 파일의 집계 | `67925D6CECEEEE5309FACFAEAB75D44E6363B69EFC3DE8991F747FE10F34A88C` |
| 호스트 `next-env.d.ts` | `1862AC4BBBC5192D4BF562161DF66EA547ED3E67173100656AB606AE9797DB2B` |

web 정상 응답을 확인하지 못해 `UNIT_PAUSED`를 재개하지 않았다. JD 브라우저 검사·실제 C-10 연결·제품 검사는 미실행이며 C-11은 별도 대기다. 기존 75개·17개 결과를 재사용하고 반복하지 않았다. 이번 API 기동 성공을 제품 `main.ts`의 스케줄러·큐·외부 AI 통합 통과로 보고하지 않는다. 기존 설계·계획·승인 기록을 유지하며 PR 병합·#452 종료·U10 전체 완료·GitHub 게시를 하지 않았다.

다음 준비에는 호스트 `next-env.d.ts`·ACL을 보존하면서 web 생성 파일을 UID 1000이 쓸 수 있는 임시 작업 공간으로 분리할 필요가 있다. 구체적 방법은 아직 승인·실행되지 않았다.

## 임시 web 실행 사본 기동과 JD 브라우저 진입 중단 — 2026-11-06

사용자 `fd007a9c`가 승인한 임시 실행 사본 방식으로 API와 web을 각각 한 번 기동했다. 아래 결과는 root가 직접 관측해 전달한 사실이며, 기존 설계·계획·승인과 75개·17개 검사 결과는 유지한다.

| 확인 대상 | 관측 결과 |
|---|---|
| API 기동 | 컨테이너 `a8d8f51d4aba17a763c441b1ef4c2205a91af1b112e81e2418313784b29f94fc` 생성 종료 코드 0. 175초에 READY, 253초에 `/health` HTTP 200과 `{status:ok}` 확인(승인한 300초 이내). |
| web 기동 | 컨테이너 `97d04b56459f6248d605f39fbc46fca1893d432454447aed967ca2d606cb6174` 생성 종료 코드 0. 원본은 `/source-web` 읽기 전용, 실행 경로 `/workspace/web`는 mode 1777 tmpfs, `node_modules`는 별도 읽기 전용 마운트다. Node 24.21.0 검사와 `process.execArgv=[]` 뒤 `fs.cpSync`로 `.next`·`node_modules`·`.git`·`.env*`·`next-env.d.ts`를 제외한 사본을 만들었다. 원본 권한은 변경하지 않았다. |
| 사본과 HTTP | `U10_WEB_COPY_READY`: 323개 파일, SHA256 `a9448eef9107973dcfbaad7a2ac2df2c6026170b56fe6789560dca47d52f2558`, 쓰기 가능, UID 1000. 37초 관찰에서 Ready 확인·오류 표식 없음. 실제 `GET /login`은 HTTP 200이며 로그인 문구가 있었다. 이후 원본과 사본 323개 내용 비교도 차이 0이었다. |
| 공식 재개 | 06:15:33 UTC에 `UNIT_RESUMED`. `next` → steering 로드 2회 → Code Generation Step 8 task 31의 `run-stage` → Unit 시작과 승인된 testing brief를 확인했다. 기존 brief·규칙과 내용이 같았다. |
| IAB 로그인 진입 | `/login?next=%2Fjds`에서 “로그인 상태를 확인하고 있습니다.”에 머물렀다. `readyState=complete`, console error/warn 없음. 같은 IAB에서 API `/health`를 직접 열면 정상 응답이었다. JD 조작이나 합성 계정·자료 생성은 시작하지 않았다. |
| 별도 API 확인 | 호스트에서 Origin `http://127.0.0.1:3310`, 본문·Bearer·쿠키 없이 `POST /v1/auth/refresh`를 한 번 호출했다. 401 `AUTH_INVALID`, 허용 Origin 일치, `Access-Control-Allow-Credentials: true`, 명령 종료 코드 0을 확인했다. 브라우저 내부 복원 요청이 완료됐다는 증거는 아니다. |
| 진단 한계와 중단 | 잠금 조회 도구의 읽기 전용 DOM 범위에 `navigator`가 노출되지 않아 실제 잠금 상태는 미확인이다. 페이지에 `navigator`가 없다고 판단하지 않았다. Chrome 비교를 위한 `getApp`에서 컴퓨터 사용 도구가 현재 브라우저 URL을 정책상 검증할 수 없어 중단을 지시했고, 반복하거나 우회하지 않았다. 초기 인증 대기의 원인은 미확정이다. |
| 공식 보류 | 06:29:32 UTC에 `UNIT_PAUSED`. 공용 코드 수정·실제 C-10 등록·새 제품 검사 없이 재개 작업을 보류했다. |

읽기 전용 코드 대조에서는 로그인 복원 effect에 cleanup 취소가 없고, 런타임의 한 번 시작 플래그가 중복 호출을 막는 것을 확인했다. 복원 fetch와 Web Lock 대기에 자체 시간 제한이 없지만, 이를 이번 현상의 원인으로 확정하지 않는다. C-10은 실제 DB 제공자와 U10 등록 방식·승인 설계만 대조했으며 등록이나 신규 검사 파일 작성은 하지 않았다.

이번에 만든 두 컨테이너만 중지해 각각 `exited 0`을 확인한 뒤 제거했다. 제거 종료 코드 0, 해당 ID 조회 빈 결과·종료 코드 0으로 정리를 확인했다. 기존 U10 DB·Valkey는 실행 중이며 네트워크와 DB 볼륨 보존 조회도 종료 코드 0이었다. DB 접속값은 출력하거나 파일에 저장하지 않았지만 API 컨테이너의 `Config.Env`에는 보관됐으며, 해당 컨테이너의 삭제를 확인했다.

기동 전후 api/web 추적 파일과 기존 미추적 파일 867개(api 544개·web 323개)의 내용 해시는 추가·삭제·변경 모두 0이었다. 호스트 `.next` 731개 파일의 집계 SHA256 `67925D6CECEEEE5309FACFAEAB75D44E6363B69EFC3DE8991F747FE10F34A88C`와 `next-env.d.ts` SHA256 `1862AC4BBBC5192D4BF562161DF66EA547ED3E67173100656AB606AE9797DB2B`도 같았다.

이번 기동은 기존 `AppModule`·`configureApp`을 사용하되 큐·분석 스케줄러·외부 AI를 비활성화한 범위다. 제품 `main` 전체나 실제 큐·외부 AI 통합 통과가 아니다. JD 브라우저 CRUD와 실제 C-10 연결은 미실행이며 C-11은 별도 대기다. 기존 75개·17개 및 U7 검사를 반복하지 않았고 PR 병합·#452 종료·U10 전체 완료 처리는 하지 않았다. 다음 조치는 주소를 확인할 수 있는 브라우저 환경에서 초기 인증 대기의 위치를 구분한 뒤 JD 조작과 C-10 연결을 재개하는 것이다.

## 수동 Chrome 비교를 위한 임시 개발 출처 허용 — 2026-11-06

사용자는 수동 Chrome에서도 초기 로그인 확인 문구가 유지되고 `/v1/auth/refresh` 요청이 없으며, 서버 로그에 `127.0.0.1`의 HMR·개발 도구 폰트 차단이 나타났다고 보고했다. 이는 사용자 관찰이며 로그인 대기의 원인이 확정됐다는 뜻은 아니다. 사용자 메시지 `431e8a3a`는 web 임시 실행 사본의 `next.config.ts`에만 `allowedDevOrigins: ['127.0.0.1']`을 추가하고 이번 web 컨테이너를 한 번 교체하도록 허용했다. 원본 제품 코드·인증 설정·승인·계획은 변경하지 않는다.

[Next.js 공식 allowedDevOrigins 문서](https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins)의 개발 서버 출처 허용 방식에 따라 hostname을 지정했다. 공식 문서의 설정 설명을 이번 로그인 대기의 원인 확정이나 해소 증거로 사용하지 않는다.

| 대상 | root가 직접 확인한 결과 |
|---|---|
| 기존 web 정리 | `44865e1fad6e7ec6c2c8efcf39aaf1737723f682905172949e6dcfd45d8a0d2e`를 종료(종료 코드 0)하고 삭제를 확인했다. |
| API 유지 | `03b30eebf7a3634431b10c2c24c1966cbcc1dc080500513ef50de3fdc4e306b0`를 유지했다. 최종 `/health` HTTP 200이며 시작 시각 `06:48:43 UTC`가 그대로임을 확인했다. |
| web 한 번 교체 | 새 ID `b15e96064d570765ea156926d88b9975374632714e87009fb58944feb7833093`을 한 번 생성했다. 36초에 사본·설정 확인과 Next Ready를 관측했으며 `/login` HTTP 200, 응답 길이 15,607을 확인했다. |
| 임시 사본 차이 | 323개 원본 사본의 SHA256 `a9448eef9107973dcfbaad7a2ac2df2c6026170b56fe6789560dca47d52f2558` 일치를 확인한 뒤 `next.config.ts` 한 줄만 추가했다. 원본 설정 SHA256은 `8df8354f2534587d94a1eb506ecb656cb495719b577cfd2bf2b3843acd103ded`, 임시 설정은 `6f85089582f74d954fe654d32f5a973812702b976126bf6ef964645b87dbce2f`다. 다른 사본 파일은 원본과 일치했다. |
| 원본 보존 | api/web 867개 파일 재해시에서 변경 0을 확인했다. 기동용 `.aidlc-engine/u10-web-runtime-start-431e8a3a.ps1`은 Git 제외 경로에 보관하며 비밀값을 넣지 않았다. 실행 순서는 사본 복사·해시 확인 → 한 줄 추가·차이 확인 → Next 기동이다. |

API와 새 web은 사용자의 수동 Chrome 재확인을 위해 유지한다. HMR·폰트 차단 해소와 초기 로그인 대기 해소는 각각 아직 미확인이다. `UNIT_PAUSED`를 유지하며 JD 조작·실제 C-10 등록·제품 검사·Chrome 자동 조작은 수행하지 않았다. 기존 75개·17개 및 U7 검사도 반복하지 않았고, C-11은 별도 대기다. 다음 조치는 사용자가 새 화면의 개발 로그인 폼과 `/v1/auth/refresh` 요청 여부·상태를 확인한 결과를 받는 것이다.

## 수동 Chrome 초기 인증 확인과 공식 재개 — 2026-11-06

앞선 수동 Chrome 결과 질문은 conductor가 비단계 질문으로 `DECISION_RECORDED`에 기록하고, 사용자 응답 전문을 details-file로 전달해 `QUESTION_ANSWERED` 기록을 마쳤다. 이는 설계·단계 완료 승인이 아니며 응답 원문은 여기 복제하지 않는다.

사용자 메시지 `b7d0b905`는 임시 개발 출처 허용을 적용한 환경에서 수동 Chrome의 HMR 101·폰트 200·`/v1/auth/refresh` 401과 개발용 로그인 폼 표시를 확인했다. 앞선 초기 로그인 대기가 해소됐다는 사용자 관찰이며, JD CRUD나 C-10 통합 검사 결과는 아니다. 해당 응답도 공식 `log answer`에 기록됐다.

conductor는 07:29:42 UTC에 `UNIT_RESUMED`를 확인하고 새 `next`와 `continue` 2회를 거쳐 승인된 Code Generation Step 8 작업 31의 `run-stage`를 받았다. Unit 시작은 `already_active`였으며 testing brief(26,981자)와 규칙 묶음이 기존 전문과 동일함을 확인했다. 기존 계획·설계·승인은 유지한다.

기존 API `03b30eebf7a3634431b10c2c24c1966cbcc1dc080500513ef50de3fdc4e306b0`와 web `b15e96064d570765ea156926d88b9975374632714e87009fb58944feb7833093` 환경에서 JD 실제 브라우저 조작을 먼저 확인한다. 그 결과를 확인하기 전에는 C-10 제품 등록이나 새 검사를 진행하지 않는다. 현재는 C-10 등록 파일·DB 전체 초기화 없는 합성 fixture·연결 영향 검사만 준비하며, 기존 75개·17개·U7 검사는 재사용한다. 외부 AI·큐·분석 스케줄러 차단과 C-11 별도 대기를 유지한다.

## JD 관리 실제 브라우저 확인과 작업 보존 대기 — 2026-11-06

root가 IAB·로컬 실제 API(포트 3311)·기존 `catchu_u10_dev`에서 이번 확인용 합성 회원과 프로필을 생성해 아래 9개 시나리오를 확인했다. 브라우저에서 발견해 보완한 제품 문제는 없으며 이 확인 중 제품 코드를 변경하지 않았다.

| 번호 | 시나리오 | 직접 관측한 결과 |
|---|---|---|
| 1 | 개발용 로그인과 최초 프로필 저장 | 합성 회원으로 로그인하고 합성 표시 이름을 저장해 JD 관리에 진입했다. |
| 2 | 새 JD 저장 | 합성 제목·본문을 저장하고 저장된 JD를 확인했다. |
| 3 | JD 수정 저장 | 제목과 본문을 바꿔 저장했다. 기존 PATCH 어댑터를 사용하는 화면 흐름이다. |
| 4 | 수정 내용 재조회 | 페이지를 reload한 뒤 목록에서 JD를 선택해 수정한 제목·본문이 다시 조회되는 것을 확인했다. |
| 5 | 제목 길이 실패 안내 | 제목 201자를 입력하고 저장하면 제한 안내가 나타나며 입력 원문을 유지했다. |
| 6 | 목록 새로고침 중 입력 보존 | 실패한 201자 미저장 입력을 둔 채 목록을 새로고침해도 draft가 유지됐다. |
| 7 | 삭제 취소 | 관련 요약 기록도 함께 삭제된다는 확인을 연 뒤 취소하면 draft가 유지됐다. |
| 8 | 다른 탭에서 같은 JD 삭제 | 새 로그인 없이 쿠키 세션을 복원한 두 번째 탭에서 같은 합성 JD를 삭제했고 목록에서 사라졌다. |
| 9 | 삭제된 JD의 수정 실패와 입력 보존 | 첫 탭에 남은 미저장 입력으로 저장하자 “이 JD 또는 실행을 열 수 없습니다. 목록을 다시 확인해 주세요.”가 나타났다. 제목 21자·본문 50자의 입력은 그대로 유지됐다. |

9번의 HTTP 상태 코드는 네트워크에서 직접 캡처하지 않았다. `404 RESOURCE_UNAVAILABLE`은 설계·코드 대응에 따른 예상이며, 이번 직접 관측 증거는 UI 오류 안내와 입력 보존이다. 이 구분을 실제 상태 코드 캡처로 바꿔 보고하지 않는다. 이번 합성 JD는 삭제됐고 합성 회원·프로필은 기존 DB 보존 조건에 따라 남아 있다. 외부 AI·요약 접수·C-11 화면 연결은 실행하지 않았으며 기존 75개·17개·U7 검사도 반복하지 않았다.

최신 [#416 답변](https://github.com/JminAILab/CatchU/issues/416#issuecomment-6677766344)에서 U4 제출 3의 #482가 2026-11-06 14:26 KST에 통합 브랜치로 병합됐음(`af5fbf3`)과 OQ6 문서 #478 병합(`ad58c6f`)을 확인했다. OQ6의 A/예 결정과 기존 C-10 제공자 코드 유지 근거는 유효하다. C-11은 이제 “미제공”이 아니라 “U4 제출 3 병합 확인, U10 C-11 연결은 사용자 지시에 따라 별도 대기”로 구분한다. 이 기록은 해당 병합판의 현 U10 체크아웃 반영이나 C-11 연결 완료를 뜻하지 않는다.

기존 변경 코드와 이번 브라우저 기록의 커밋 보존을 먼저 진행한다. 보존 확인 전까지 C-10 제품 등록과 신규 검사 파일 작성은 대기하며, 이전 설계·승인·계획 본문은 유지한다. PR 병합·#452 종료·U10 전체 완료 처리는 하지 않는다.

## C-10 실제 등록과 신규 영향 검사 준비 — 2026-11-06

기존 코드·JD 브라우저 결과·기록은 커밋 `6c4ec503`(15개 파일)으로 보존했다. 그 확인 뒤 승인 범위에서 `AppModule`에 `JdSummaryModule.register`를 추가하고 `PublicationsModule`의 `PUBLICATION_ACCESS`를 `useExisting`으로 주입했다. #468 제공 코드와 OQ5·OQ6 결정에 따른 실제 `DbPublicationAccess` 연결이며, 공용 제공자·U4 화면·이전 설계와 승인 본문은 변경하지 않았다. U10에서 사용하지 않는 `readSnapshot`도 추가하지 않았다.

기존 `jd-integration.test.cjs`는 두 번째 요약 모듈을 조립하지 않고 실제 AppModule 하나를 사용하도록 정리했다. 기존 합성 판정은 그 검사 프로세스의 제공자 메서드에만 적용하고 종료 때 복원한다. 기존 검사 본문과 과거 결과는 유지하며 이번에 재실행하지 않는다.

새 `api/test/jd/jd-publication-access.test.cjs`에는 다음 9개 영향 시나리오를 작성했다. 아래는 작성 범위이며 실행 통과 기록이 아니다.

| 번호 | 신규 영향 검사 |
|---|---|
| 1 | 실제 C-10 인스턴스 주입과 `JD_SUMMARY` 처리기 1회 등록, 43자 token·서명 grant로 접수·목록·상세 연결 |
| 2 | 각 HTTP 경로의 회원 401과 링크 401 구분, Bearer와 grant 동시 요구 |
| 3 | 실행 회원·JD 소유·발행본 경계의 자료 격리 |
| 4 | 요청 전 중지·만료·작성자 비활성의 404 판정을 grant 검사보다 먼저 적용 |
| 5 | C-10 통과 뒤 발행본 삭제 시 실제 `23503`·`fk_jd_summary_run_publication_id` 확인, 404와 실행·입력 사본·결과·차감 롤백 및 큐 접수 없음 |
| 6 | C-10 통과 뒤 중지는 현재 접수·차감을 허용하고 다음 요청부터 차단 |
| 7 | C-10 통과 뒤 만료는 현재 접수·차감을 허용하고 다음 요청부터 차단 |
| 8 | C-10 통과 뒤 작성자 비활성은 현재 접수·차감을 허용하고 다음 요청부터 차단 |
| 9 | 정상 FK로 구성할 수 없는 회원 행 부재만 `OwnerProfileReader` 대역으로 주입해 고정 500과 내부 정보 미노출 확인 |

실제 AppModule·인증 Guard·C-10·C-09 상태 조회·PostgreSQL을 사용하며, 경합 시점은 실제 C-09 조회 뒤 검사 hook으로 고정한다. 회원·세션·발행본·JD·동의는 새 UUID와 합성 identity로 생성한다. 정리는 생성 전에 기록한 회원 ID와 identity가 함께 일치하는 행 및 그 자식에 한정한다. 기존 자료 ID 사용·DB 전체 초기화·TRUNCATE·마이그레이션은 하지 않는다. 임시 서명 키는 검사 프로세스에서만 생성하며 외부 AI·큐·Google 로그인·GitHub 연결·worker context를 해당 프로세스에서 차단한다.

읽기 전용 소스 마운트의 별도 Node 프로세스에서 `DB_NAME=catchu_u10_test`, `CATCHU_U10_SOURCE_TEST=true`와 `node --require ts-node/register --test --test-concurrency=1 test/jd/jd-publication-access.test.cjs`를 사용할 준비를 마쳤다. 코드 변경을 감시하지 않는 기존 포트 3311 API에는 새 등록이 반영되지 않으며, 신규 검사는 소스를 새로 읽는 임시 HTTP 서버의 결과로 구분한다. 소스 기반 검사 결과는 실행 후 덧붙인다.

기존 75개·17개·U7 검사는 반복하지 않는다. 다른 DB 오류가 삭제 오류로 바뀌지 않는 기존 검사 결과도 재사용한다. 비밀번호 unlock·C-11 공유 화면·외부 AI·실제 큐·분석 스케줄러·성능 비교는 이번 범위 밖이다. U4 제출 3 병합과 U10 C-11 연결 대기를 구분하며, task 31 전체 완료·PR 병합·#452 종료·U10 전체 완료로 처리하지 않는다.

## C-10 신규 영향 검사 결과 — 2026-11-06

root가 기존 API 컨테이너 안의 별도 Node 프로세스에서 아래 명령을 실행했다. 앞 절의 작성·실행 대기 기록을 보존하고 이번 실행 결과를 추가한다.

```powershell
docker exec --workdir /workspace/api --env DB_NAME=catchu_u10_test --env CATCHU_U10_SOURCE_TEST=true 03b30eebf7a3634431b10c2c24c1966cbcc1dc080500513ef50de3fdc4e306b0 node --require ts-node/register --test --test-concurrency=1 test/jd/jd-publication-access.test.cjs
```

| 확인 | 결과 |
|---|---|
| 신규 영향 검사 | 종료 코드 0, tests 9 / pass 9 / fail 0 / cancelled 0 / skipped 0 / todo 0. 보고 시간 160,968.293657ms는 초기 소스 로딩을 포함한 실행 시간이며 성능 비교 결과가 아니다. |
| 실제 등록·HTTP | 동일 실제 C-10 인스턴스와 `JD_SUMMARY` 처리기 1회 등록, 접수 202·PENDING, 목록·상세 200, `no-store`를 확인했다. |
| 권한·오류 경계 | 회원/링크 401 구분과 소유 격리, 매 요청의 중지·만료·비활성 작성자 404가 통과했다. 회원 행 부재의 고정 500은 명시한 `OwnerProfileReader` 대역 사례다. |
| 삭제·판정 이후 경계 | 실제 DB의 정확한 `23503`·`fk_jd_summary_run_publication_id`에 대한 404와 저장·입력 사본·결과·차감 롤백을 확인했다. 판정 뒤 중지·만료·작성자 비활성은 현재 요청 접수·차감을 허용하고 다음 요청부터 차단했다. 접근 허용 뒤 상태 변경을 순서대로 삽입한 통제 검사이며 실제 동시 부하 검사는 아니다. |
| 합성 자료 정리 | 각 fixture에서 이번에 생성한 회원 ID·identity에 한정한 삭제와 남은 회원 0 확인이 통과했다. 기존 DB 자료·스키마는 초기화하지 않았다. |
| 문법 검사 | `jd-publication-access.test.cjs`와 조립만 보완한 `jd-integration.test.cjs`의 `node --check`가 각각 종료 코드 0이었다. 기존 통합 검사 본문은 실행하지 않았다. |
| web 문서 사본 | root가 변경된 JD README만 임시 실행 사본으로 동기화했다. 323개 사본의 재검증은 종료 코드 0, 최신 원본 집계 SHA256은 `3b66e895e7475606000b470ae9deaefb956c89fa0022b9eee2acf5112e32024b`였다. `next.config.ts`의 승인된 `allowedDevOrigins` 한 줄 외에는 원본과 같고 원본 쓰기는 없었다. |

이 결과는 새 소스를 읽은 별도 HTTP 검사 서버의 실제 C-10 연결 근거다. 기존 포트 3311 API 프로세스에 변경이 반영됐거나 제품 `main`·공용 큐·분석 스케줄러·외부 AI 전체 연결이 완료됐다는 뜻은 아니다. 비밀번호 unlock·C-11 공유 화면·외부 AI·성능 비교는 미실행이며 기존 75개·17개·U7 검사를 반복하지 않았다.

U4 제출 3 병합은 확인됐지만 U10 C-11 연결은 사용자 지시에 따라 별도 대기다. 따라서 C-11을 포함하는 Step 8 작업 31을 완료로 체크하지 않으며 전체 공식 완료 검토·PR 제출·PR 병합·#452 종료·U10 전체 완료 처리를 하지 않는다. 기존 설계·계획·승인·완료 검사 원문은 보존한다.

## C-11 대기 해제와 실제 슬롯 연결 준비 — 2026-11-06

사용자 `de47f2f4`가 C-11 연결과 그 영향 검사·실제 브라우저 확인 후 공식 검토를 요청했다. conductor는 08:18:56 UTC에 `UNIT_RESUMED`를 확인하고 같은 승인 계획의 Step 8 작업 31 `run-stage`를 받았다. Unit 시작은 `already_active`였으며 testing-posture brief는 직전과 바이트 단위로 동일했다. 이 요청은 이전 설계·계획 승인을 대체하거나 U10 완료를 승인한 것이 아니다.

conductor가 통합 브랜치의 #482 병합판 `af5fbf363912ded9d957a1b20348074a788c1c36`을 merge commit `8b5bd1bf`로 반영했다. 기존 보존 커밋 `6c4ec503`·C-10 변경 `8df9a6f1`·감사 보존 `cf8df5dd`를 유지했다. 충돌 4개는 U10 JD 메뉴·관리/실제 C-10 등록을 유지하면서 U4의 옛 공유 화면 제거·Publications와 U5 RagAnswer 조립을 함께 반영했다. 새 통합 상태에서 U4가 제공한 경계만 사용한다.

| 변경 | 책임과 확인 범위 |
|---|---|
| `jd-recipient-panel.tsx` | U4의 다섯 props를 받아 공용 `api.member` 기반 `JdSummaryPanel`을 4번 자리에 붙인다. 공유 페이지의 직접 진입에서는 통합 전환이 이미 켜진 경우에만 기존 `authRuntime.ensureRestored()`를 사용한다. 인증 정책·설정·저장 방식을 변경하지 않는다. |
| `jd-recipient-binding.ts` | 링크별 콜백 묶음이 최신 U4 제공자를 참조한다. U4 근거 강조 재렌더로 함수가 바뀌어도 JD 선택·결과가 초기화되지 않게 하며 grant 값 자체를 복사하거나 보관하지 않는다. 링크 교체는 keyed 자식의 해제로 분리한다. |
| U4 `recipient-view.tsx` | import와 기존 4번 자리의 U10 자식 composition만 추가했다. U4 screen/store/grants/slots와 강조 로직은 수정하지 않았다. |
| 신규 연결 검사 | `jd-recipient-binding.test.mjs`에 7개를 작성했다. 실제 U4 composition/store/grants·위치 대조와 U10 모델·공용 호출을 연결하되 fetch 응답은 합성이다. 다섯 props·비로그인, unlock 후 JD 접수/재열람, 콜백 교체, 링크 상실·늦은 응답, 회원 상실·계정 교체, 링크 교체, 원문 강조 전달을 확인한다. |
| 기존 검사 영향 | `recipient.test.mjs`의 자리 순서 검사 하나에서 빈 자리 기대만 U10 로그인 안내로 바꿨다. 통합 충돌을 해결한 회원 메뉴 검사와 함께 해당 범위만 실행한다. 기존 75개·17개·C-10 9개·U7 검사는 반복하지 않는다. |

새 검사 명령은 `node --test --test-concurrency=1 test/jd-recipient-binding.test.mjs`, 기존 자리 검사는 `node --test --test-name-pattern="^판정 통과 화면 순서:" test/recipient.test.mjs`다. 대상 lint와 `tsc --noEmit --incremental false`도 확인한다. 이 작성 시점에는 실행 대기이며 실제 브라우저의 effect·세션 복원·초점·스크롤·접수·재열람은 정적 렌더나 합성 fetch 통과로 대체하지 않는다.

conductor가 기존 API 컨테이너를 같은 설정·DB로 재시작한 뒤 새 READY와 `/health` 200·status ok를 확인했다(관찰 209초, 성능 비교 아님). 실제 브라우저의 완료 요약은 합성 저장 자료로 준비하며 외부 AI·실제 큐 처리는 차단한다. C-11 대기 해제와 구현 착수를 작업 31 완료 체크·PR 병합·#452 종료·U10 전체 완료로 처리하지 않는다.

## C-11 연결 영향 검사와 브라우저 확인 중간 결과 — 2026-11-06

root가 `8b5bd1bf` 이후 미커밋 C-11 연결 소스에서 아래 검사를 실행했다. 기존 75개·17개·C-10 9개·U7 검사를 반복하지 않았다.

| 실행 범위 | 결과·한계 |
|---|---|
| `jd-recipient-binding.test.mjs` 신규 7개 | pass 7 / fail 0, 2,692ms. 실제 U4 composition/store/grants·위치 대조와 U10을 연결했으며 fetch 응답은 합성이다. 브라우저 effect·인증 복원·실제 초점/스크롤의 완료 증거는 아니다. |
| `recipient.test.mjs` 자리 순서 1개 선택 | pass 1 / fail 0, 2,130ms. 빈 4번 자리에서 U10 로그인 안내로 바뀐 기대만 확인했다. U4 전체 검사를 반복하지 않았다. |
| `member-navigation.test.mjs` 8개 | pass 8 / fail 0, 194ms. 통합 충돌 해결로 JD 메뉴를 유지하고 옛 공유 링크 메뉴를 제거한 변경 영향이다. |
| 대상 ESLint 3개 파일 | wrapper·binding·`recipient-view.tsx`를 검사해 종료 코드 0. |
| `tsc --noEmit --incremental false` | 종료 코드 0. 제품 파일이나 증분 캐시를 출력하지 않았다. |

합계 16개 통과다. 표의 시간은 해당 명령의 보고 값이며 성능 비교가 아니다. web 임시 실행 사본 321개는 byte parity를 확인했고 원본 `next.config.ts`는 그대로, 임시 설정은 승인된 `allowedDevOrigins` 한 줄만 달랐다. `/login` 200과 최신 source API `/health` 200을 확인했다.

브라우저용 DB 자료는 이번에 만든 합성 실행회원·작성자, 비밀번호 보호 발행본·사본 항목·JD·DONE index와 미리 저장한 DONE 요약이다. DONE 결과는 합성 저장 자료이며 실제 AI 생성 결과가 아니다. 실제 브라우저에서 비밀번호 unlock에 성공했고, 먼저 복원된 기존 합성 세션에는 JD가 없음을 확인했다. 다른 탭에서 로그아웃하자 U4 자료와 grant를 유지한 채 U10이 로그인 안내로 바뀌는 것을 직접 관측했다. 새 합성 계정 로그인 뒤 재조회, 실제 접수·재열람·근거 강조·링크 접근 상실은 이 기록 시점에 진행 중이며 완료로 표시하지 않는다.

## C-11 실제 브라우저 결과와 확인 범위 — 2026-11-06

root가 최신 통합 소스와 C-10 등록을 실행하는 로컬 실제 API(3311), 기존 `catchu_u10_dev`, 최신 web 임시 사본으로 다음 동작을 직접 확인했다. 실행 환경의 외부 AI·임베딩·큐 worker·분석 스케줄러 차단은 유지했다. 발행본·자료·회원·JD와 완료 결과는 이번 합성 fixture이며 미리 저장한 DONE을 실제 AI 생성 완료로 보고하지 않는다.

| 번호 | 실제 브라우저 관측 |
|---|---|
| 1 | 비밀번호 보호 링크에서 실제 unlock 뒤 U4 자료와 U10 패널을 표시했다. 먼저 이전 합성 회원 세션이 복원됐고 해당 회원의 JD 없음 안내를 확인했다. |
| 2 | 다른 탭의 로그아웃이 반영되자 공유 U4 자료와 grant는 유지되고 U10만 로그인 안내로 전환됐다. |
| 3 | 새 합성 실행회원으로 개발 로그인을 한 뒤 공유 페이지를 reload했다. 기존 grant와 회원 세션이 복원됐고 본인 합성 JD 1개·직접 저장한 DONE 기록 1개를 조회했다. |
| 4 | JD를 선택하고 DONE을 다시 열어 요구사항 원문과 근거·자료로 확인되지 않는 점·면접 질문의 세 칸을 확인했다. |
| 5 | 근거의 「원문에서 확인」을 누르자 U4의 실제 `<mark>` 내용이 인용과 일치했다. 강조 영역은 viewport top 351px~bottom 369px에 보이고 해당 항목에 초점이 놓였다. JD 선택·결과는 유지됐다. |
| 6 | 새 요약 실행을 눌러 접수 성공 안내와 PENDING을 확인했다. DB 대조는 DONE 1개·PENDING 1개·입력 사본 2개·이번 실행 차감 1회였다. 실제 큐 실행·생성 완료까지 진행하지 않았다. |
| 7 | 기존 DONE을 다시 선택하고 같은 근거를 반복해서 눌러도 재열람·강조·선택 보존이 정상 동작했다. |
| 8 | 이번 합성 발행본을 중지한 뒤 U10의 상태 새로고침을 누르자 U4 접근 불가 화면으로 전환됐다. 접근 불가 h1에 초점이 가고 자료와 패널이 제거됐다. |

제품 수정이나 브라우저 오류 없이 위 확인을 마쳤다. 브라우저 Network의 실제 헤더·HTTP 상태 코드를 직접 캡처하지 않았다. 따라서 실제 회원·grant가 제품 Guard를 통과했다는 행동 근거와 합성 fetch 검사에서 Bearer/X-Link-Grant를 직접 단언한 근거를 구분한다. 로컬 합성 화면 증거는 Git 제외 경로 `.aidlc-engine/u10-c11-browser-proof.jpg`에 있다. 760·1024·1536px 각각의 전체 레이아웃 확인, 실제 브라우저 종료 중 큐 지속 처리, 실제 임베딩/색인 생성·외부 AI·성능 비교·전체 80% 커버리지는 미실행이다. 발행본 삭제의 정확한 23503 분류·저장/차감 롤백은 앞선 실제 C-10 9개 결과를 재사용하고 이번 C-11 검사에서 반복하지 않았다.

fixture 표식 `u10-c11-20261106-de47f2f4`의 새 실행회원·작성자 2행만 정확한 ID와 identity를 함께 확인해 삭제했다. FK 자식 정리와 남은 회원 0을 확인했으며 기존 합성 회원·DB·컨테이너는 보존했다. 최초 정리 명령은 컨테이너 ID 오타로 `No such container`·종료 코드 1이었고 컨테이너 내부에서는 실행되지 않았다. 이미 확인된 ID로 명령 오타를 바로잡은 정리는 종료 코드 0이었다. 제품·환경 오류나 같은 제품 오류의 반복 실행으로 해석하지 않는다.

최종 JD README를 실행 사본에 동기화한 뒤 321개 파일의 byte parity를 다시 확인했다. 원본 집계 SHA256은 `836f507a97601b8d838afb19fa243af4ebc03ab95544539f8564c38cdce8522b`이며 실행 사본의 차이는 승인된 `allowedDevOrigins` 한 줄뿐이었다. 이 문서 동기화 때문에 제품 검사를 반복하지 않았다.

제공 판본·실제 C-10 등록·C-11 composition과 연결 증거가 갖춰져 승인 계획 Step 8 작업 31·32의 체크만 완료로 바꿨다. 작업 33은 최초 실제 연결 결과의 사용자 확인과 실제 제품 큐 연결 검사가 남아 미완료이며, 작업 37은 공식 검토·보고가 끝나기 전까지 미완료다. 기존 승인 문구·계획 본문·검사 결과는 유지하고 PR 병합·#452 종료·U10 전체 완료를 처리하지 않는다.
