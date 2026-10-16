# Catch 등록 — DB 적용과 검사

[등록 연결 안내](catch-registration-proposal.md) · [내부 호출과 저장 규칙](catch-registration-rules.md) · [E 연결 조건](catch-registration-e-integration.md)

## 테이블과 적용 순서

| 순서 | 정본 | 작성 책임 |
|---|---|---|
| 선행 | MemberAccount·AnalysisRequest·AnalysisAttempt | A/E, #104의 실제 기반(PR #184) |
| 1 | ResultApplicationRecord | E: 수신 메타데이터·마이그레이션 |
| 2 | CatchAsset | B: 본문·상태·등록 판단 |
| 3 | CatchEvidence | B: 근거 사본 |
| 4 | CandidateRegistration | B 작성, E 연결 관점 검토 |
| 5 | RepositoryProtection | B: 회원·저장소별 명시적 보호 판단 저장 공간 |

B 엔티티는 [`src/catches/entities`](../src/catches/entities), 마이그레이션은
[`CreateCatchAssets1790600000000`](../src/database/migrations/1790600000000-CreateCatchAssets.ts)와
[`CreateRepositoryProtection1790601000000`](../src/database/migrations/1790601000000-CreateRepositoryProtection.ts)다.
단수 snake_case 테이블/컬럼, 앱 발급 UUID, 외부 ID text, 배열 text[], 판단 jsonb,
enum varchar+CHECK를 사용한다. 공통 DB 규약과 동일한 TypeORM 1.1.1·pg 8.23.0을 고정했다.

제목 `null` 허용은 [`AllowNullCatchTitle1791784385918`](../src/database/migrations/1791784385918-AllowNullCatchTitle.ts)을 추가 적용한다. 기존 제목과 빈 문자열 거부 CHECK는 보존한다. `down`은 NOT NULL을 복원하므로 `null` 행이 있으면 실패하며, 제목을 임의로 채우거나 자료를 지우지 않는다. 해당 자료의 처리 방침을 정하기 전에는 되돌리지 않는다.

근거 표시 순서는 [`AddCatchEvidencePosition1792029036359`](../src/database/migrations/1792029036359-AddCatchEvidencePosition.ts)으로 저장한다. 기존 근거는 Catch마다 종전 UUID 오름차순으로 1부터 채워 ID·본문과 당시 표시 순서를 보존한다. `down`은 위치 칼럼만 제거하므로 이후 새로 저장한 입력 순서는 잃으며, 재적용 때는 UUID 순서로 다시 채운다.

B 마이그레이션은 E 수신 테이블을 포함한 선행 테이블이 없으면 실패한다.
가짜 제품 테이블을 만들거나 FK를 생략하지 않는다.
down은 보호 판단→후보 연결→근거→Catch 순서이며 A/E 테이블을 지우지 않는다.
**E 마이그레이션을 결합할 때 timestamp 적용 순서를 함께 확인한다.**

Catch 소유자·원 요청, 보호 판단 소유자는 #104의 실제 MemberAccount·AnalysisRequest
엔티티에 외래 키 메타데이터로 연결하며 기존 마이그레이션의 제약 이름·동작을 유지한다.
CandidateRegistration의 E 수신 기록 참조도 실제 ResultApplicationRecord 엔티티에 연결한다.
기존 DB 외래 키의 이름·대상·기본 동작을 유지하며, 전체 엔티티와 실제 마이그레이션의 차이가 없는지 검사한다.
B→B 관계는 엔티티에도 있다. synchronize로 스키마를 바꾸지 않는다.

## 검사 실행

전체 검사는 공통 DB 실행기를 사용하는 `npm test`이며, B DB 검사도 생략하지 않는다.
공통 실행기가 `.env`·환경변수·테스트 기본값으로 확정한 `DB_*`를 그대로 사용하고
DB 이름이 `_test`로 끝나는지 다시 확인한다.

B 저장 검사만 실행할 때는 `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`,
`TEST_DB_PASSWORD`, `TEST_DB_NAME`을 모두 지정하고 `npm run test:catches:db`를 실행한다.
설정 누락이나 잘못된 DB 이름은 실패한다.
전체 제품 마이그레이션에는 #104·E 선행 테이블이 필요하며, 제품 코드가 합성 테이블을 만들지 않는다.

전체 검사는 **폐기 가능한 전용 테스트 DB**에 실제 마이그레이션을 자동 적용한다.
E 수신 테이블을 별도 helper나 SQL 대역으로 미리 만들지 않는다.
`TEST_DB_*` 설정과 실행 환경은 [api README의 DB 테스트](../README.md#db-테스트)를 따른다.

```powershell
# api에서 전용 TEST_DB_* 설정 후 실행
npm test
# 실제 E 반영 서비스와 B 등록의 결합 검사만 실행
npm test -- test/integration/result-application-b.test.cjs
```

결합 검사도 기본 `npm test` 탐색에 포함되므로 같은 명령을 쓰는 CI에서 실행된다.

## 검사가 보장하는 범위

B fixture는 임의 이름의 격리 스키마에 실제 회원·분석/E 수신/공유 링크 기반과 B 마이그레이션을 적용한다. [PR #184](https://github.com/JminAILab/CatchU/pull/184)의 실제 기반이므로
동의·요청·시도의 필수 값과 순환 FK, 회원당 활성 요청 하나 제약을 유지한다.
같은 회원의 후속 요청 사례는 이전 요청 종료를 테스트에 명시하며 fixture가 자동 종료하지 않는다.
정상 등록 자료에는 합성 관측의 보호 판단을 명시적으로 준비한다.
종료 시 자신이 만든 스키마만 정리하며 기존 public 스키마나 제품 DB를 초기화하지 않는다.

주요 검사는 다음을 확인한다.

- 신규 PRIVATE 저장, 생성 실패 보존, 같은 작업/재전달의 중복 방지, 기존 내용 보존.
- 소유·시도 대조, 후보 거부·DB 실패·E 완료 기록 실패 시 전체 롤백, 커밋 전 비가시성.
- FK·유일성·CHECK 및 down.
- 같은 수신 기록의 동시 재전달과 종료된 요청의 재전달·후속 요청 경합.
  한 회원의 두 활성 분석을 허용한다는 뜻이 아니다.

B 단독 검사의 E 완료 호출은 대역이며, 결합 검사는 실제 E 반영 서비스와 B 등록 함수를 사용한다.
두 검사 모두 입력 자료·최초 수신 기록·보호 판단은 합성 준비물로 공급한다.
실제 수신 저장 어댑터·보호 판단 공급·worker까지의 전체 서비스 연결은 별도 검증이 필요하다.
판본별 실행 명령·결과는 PR에 기록하며 여기에서 실행 상태를 복제하지 않는다.
