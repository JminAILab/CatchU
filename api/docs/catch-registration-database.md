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

B 마이그레이션은 E 수신 테이블을 포함한 선행 테이블이 없으면 실패한다.
가짜 제품 테이블을 만들거나 FK를 생략하지 않는다.
down은 보호 판단→후보 연결→근거→Catch 순서이며 A/E 테이블을 지우지 않는다.
**E 마이그레이션을 결합할 때 timestamp 적용 순서를 함께 확인한다.**

Catch 소유자·원 요청, 보호 판단 소유자는 #104의 실제 MemberAccount·AnalysisRequest
엔티티에 외래 키 메타데이터로 연결하며 기존 마이그레이션의 제약 이름·동작을 유지한다.
CandidateRegistration의 E 수신 기록 참조는 실제 ResultApplicationRecord 엔티티를 결합할 때 연결한다.
이 참조의 DB 외래 키는 기존 마이그레이션에서 보장하므로
`migration:generate`가 삭제를 제안해도 채택하지 않는다.
B→B 관계는 엔티티에도 있다. synchronize로 스키마를 바꾸지 않는다.

## 검사 실행

전체 검사는 공통 DB 실행기를 사용하는 `npm test`이며, B DB 검사도 생략하지 않는다.
공통 실행기가 `.env`·환경변수·테스트 기본값으로 확정한 `DB_*`를 그대로 사용하고
DB 이름이 `_test`로 끝나는지 다시 확인한다.

B 저장 검사만 실행할 때는 `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`,
`TEST_DB_PASSWORD`, `TEST_DB_NAME`을 모두 지정하고 `npm run test:catches:db`를 실행한다.
설정 누락이나 잘못된 DB 이름은 실패한다.
전체 제품 마이그레이션에는 #104·E 선행 테이블이 필요하며, 제품 코드가 합성 테이블을 만들지 않는다.

전체 검사를 재현할 때는 **새로 만든 폐기 가능한 전용 테스트 DB**에 한해
아래 검사 전용 helper로 #104의 실제 기반 마이그레이션(적용 기록 포함)과
E 수신 테이블 대역을 먼저 준비한다.
`DB_*`와 전체 검사에 쓰는 `TEST_DB_*`를 같은 전용 `_test` DB로 지정한다.
기존 제품/개발 DB에는 실행하지 않는다. 대역 테이블이 이미 있으면 덮어쓰지 않고 실패한다.

```powershell
# api에서 npm run build 후, 위 전용 테스트 DB 설정으로 한 번만 실행
node -e "const {openTestDataSource}=require('./test/support/test-database.cjs'); const {createUpstreamTables}=require('./test/support/catch-db-fixture.cjs'); (async()=>{const db=await openTestDataSource(); try{await createUpstreamTables(db);}finally{await db.destroy();}})().catch(e=>{console.error(e);process.exitCode=1;});"
npm test
```

실제 E 수신 마이그레이션을 결합할 때 이 대역을 교체한다.
공통 실행기나 제품 마이그레이션에 대역 자동 준비를 넣지 않는다.

## 검사가 보장하는 범위

fixture는 임의 이름의 격리 스키마에 실제 회원·분석 기반→E 수신 테이블 대역→B 마이그레이션
순서로 적용한다. [PR #184](https://github.com/JminAILab/CatchU/pull/184)의 실제 기반이므로
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

입력 자료·보호 관찰과 E 수신 테이블·완료/실패 호출은 검사 대역이다.
실제 E 수신부·worker 통합 성공은 별도 연결 검증이 필요하다.
판본별 실행 명령·결과는 PR에 기록하며 여기에서 실행 상태를 복제하지 않는다.
