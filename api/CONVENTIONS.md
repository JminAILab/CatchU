# api 코딩 규약

api 코드를 고치기 전에 읽는 파일 배치·DB·트랜잭션·인증 사용·공통 오류 처리(ApiError·오류 코드 추가) 규약이다. 설치·실행·검사는 [api README](README.md), 기능별 동작과 연결은 `api/docs/<기능>.md`에 있다. 새 규약은 이 문서에 쓰고, 이미 있는 규약은 적힌 곳에서 고친다.

본문이 가리키는 다른 파일의 절: 「로컬 DB 준비」와 #87 절의 '앞의 초기화 기준'(「초기화 기준과 도구」)은 README, 「회원·분석 선행 테이블과 멱등 처리 — #104」는 [docs/member-analysis.md](docs/member-analysis.md), #87 절의 '날짜별 검증 기록'은 [docs/verification-records.md](docs/verification-records.md)에 있다.

## 파일 역할과 모듈 추가 위치

| 파일                                    | 역할                                               |
| --------------------------------------- | -------------------------------------------------- |
| `package.json` / `package-lock.json`    | 실행·검사 명령, 도구 버전, 재현 가능한 의존성 설치 |
| `src/main.ts`                           | 환경변수 검사, HTTP 서버 시작, 종료 훅, 주기 작업 시작(#237), 큐 연결 시작(#233) |
| `src/application.module.ts`             | main에서 호출하는 제품 조립. 기본 앱에 명시적으로 활성화한 실제 worker 컨텍스트 공급과, 큐 주소가 있을 때의 큐 연결(#233)을 붙이고 큐 실행을 시작 |
| `src/app.module.ts`                     | 기본 기능 모듈 묶음. 독립 시험에서도 사용하며 제품의 조건부 연결은 application.module.ts에서 처리 |
| `src/cors.ts`                           | 개발용 CORS. 개발/test에서만 정확한 허용 출처·쿠키를 지원하고 운영은 동일 출처(#250) |
| `src/common/http/request-id.ts`         | 요청별 서버 내부 식별자(#222). 응답·web으로 내보내지 않음 |
| `src/common/http/security-headers.ts`   | 모든 응답의 보안 헤더와 `X-Powered-By` 끄기. HSTS는 `NODE_ENV`가 development·test가 아닐 때만(#217) |
| `src/health/health.controller.ts`       | `GET /health` 응답                                 |
| `src/common/periodic-task.ts`           | api 안의 주기 실행 장치. 겹치지 않게 다음 실행 예약, 실패 뒤 계속, 종료 때 진행 중 실행 대기(#237) |
| `src/analysis-deadline/`                | 처리 시한을 넘긴 분석 요청과 반영 실패 요청을 닫는 판정과 그 주기 작업([docs/analysis-deadline.md](docs/analysis-deadline.md)) |
| `src/analysis-queue/`                   | 대기 시도를 요청 큐로 보내고 worker의 진행 알림·결과를 받아 E 수신 경로로 넘기는 큐 연결과 그 연결·주기·종료(#233, [docs/analysis-queue.md](docs/analysis-queue.md)). 큐 규격 값은 `queue-spec.ts` 한곳. 기본 앱에는 미등록 |
| `src/recipient/`                        | 비로그인 수신자 조회(#151, [docs/recipient-read.md](docs/recipient-read.md)). #150 링크·소유 회원 판정·B 공개 Catch 조회·A `OwnerProfileReader`를 재사용. 기본 앱에 등록 |
| `src/member-repositories/repository-selection.*.ts` | 현재 선정의 DB 정본(엔티티)과 목록·#323 접수 재확인·#232 worker 선정 공급(#252, [docs/repository-selection.md](docs/repository-selection.md)). 좌표는 같은 폴더의 #319 카탈로그에서 읽음 |
| `src/auth/auth.module.ts`              | 인증 설정과 토큰 서비스, 전역 `APP_GUARD` 등록 |
| `src/auth/access-token.guard.ts`       | Bearer 토큰 검증 후 요청에 인증 회원 정보 저장 |
| `src/auth/dev-login.guard.ts` / `dev-login.dto.ts` | 개발 로그인 실행 제한을 먼저 검사하고 기존 회원 ID 조건·추가 필드를 공통 입력 검증에 연결 |
| `src/auth/auth.decorators.ts`          | `@CurrentMemberId()` 접근자와 `@Public()` 제외 표시 |
| `src/auth/access-token.service.ts`     | JWT 서명·검증과 필수 claim 검사. 기능 코드와 분리 |
| `src/auth/auth.config.ts`              | 인증 환경설정 검증. 기본 키 없음, development·test에서만 명시적으로 켠 개발 로그인 허용 |
| `src/auth/dev-login.controller.ts`     | 개발 식별 문자열을 회원·기본 프로필에 연결하고 실제 회원 UUID로 토큰 발급. 기본 비활성 |
| `src/analysis-receiver/analysis-receiver.service.ts` | 진행/결과 수신, 맥락·중복·순서 검사, 커밋 이후 수신 확인 |
| `src/analysis-receiver/receiver.types.ts` | 메시지 타입과 DB 연결용 `ReceiverStore` 트랜잭션 경계 |
| `src/analysis-receiver/worker-message.validator.ts` | 계약 YAML에서 한 번 컴파일한 스키마 검사. 입력 보정·외부 참조 다운로드 없음 |
| `src/analysis-receiver/dev-analysis-injection.ts` | 본인 MOCK 요청에 공용 템플릿 채움·내부 주입, 환경 차단 |
| `src/analysis-receiver/analysis-receiver.module.ts` | 저장소와 계약 경로를 명시해 수신 모듈 조립. 기본 앱에는 미등록 |
| `test/analysis/` / `test/helpers/receiver-harness.cjs` | 수신·인증 연결·주입 검사와 테스트 전용 메모리 저장소. 실제 DB 구현 아님 |
| `test/health.test.cjs`                  | 빌드된 앱의 최소 HTTP 실행 검사                    |
| `test/auth.test.cjs`                    | 테스트 안에만 보호 컨트롤러 구성, 인증 정상·거부·보안 사건 기록 및 로그 비노출 검사 |
| `test/runtime/bootstrap.test.cjs`       | 소스/빌드 main의 실제 설정 로딩·기동·실패 종료 검사 |
| `src/database/database.config.ts`       | DB 환경설정 검증과 앱·마이그레이션 명령이 함께 쓰는 접속·매핑 설정(엔티티·마이그레이션 위치, `synchronize` 끔, 세션 UTC) |
| `src/database/database.module.ts`       | 앱의 DB 연결. 접속 실패 시 짧게 재시도한 뒤 기동 중단 |
| `src/database/data-source.ts`           | 마이그레이션 명령과 테스트 실행기가 쓰는 DataSource |
| `src/database/snake-naming.strategy.ts` | 테이블·칼럼 snake_case, 제약·인덱스의 결정적 이름 |
| `src/database/checks.ts`                | `@Check()`용 식: enum 허용 값, 문자열 길이 |
| `src/database/foreign-keys.ts`          | 외래 키 삭제 규칙. 회원 자료는 부모를 따라 지운다([탈퇴 연쇄 삭제](docs/member-withdrawal-deletion.md)) |
| `src/database/migrations/`              | 모든 마이그레이션의 한 위치 |
| `scripts/test-with-db.cjs`              | `npm test` 실행기: 테스트 DB 확인·마이그레이션 적용·테스트 실행(두 줄, README 「DB 테스트」) |
| `scripts/clean-dist.cjs`                | `npm run build`의 첫 단계: 이전 빌드 결과 `dist/` 삭제 |
| `test/support/test-database.cjs`        | 테스트 DB 접속, `_test` 이름 확인, 테스트 사이 자료 초기화 |
| `test/support/repository-selection.cjs` | 초기화로 지워진 #252 초기 선정 자료를 격리 스키마의 실제 마이그레이션 값으로 되돌림 |
| `test/db/*.test.cjs`                    | DB 규약으로 생성되는 SQL, 시각 왕복, 테스트 DB 격리, 트랜잭션 전달, 재빌드 뒤 지운 마이그레이션 미탐색 검사 |
| `test/worker-messages.test.cjs`         | M1 합성 결과 세트의 worker 메시지 스키마 v1 판정 검사 |
| `test/helpers/queue-harness.cjs` / `scripts/verify-analysis-queue.cjs` | 큐 연결 시험의 접수 기록 픽스처·메모리 요청 큐·worker 형식 메시지 / 큐 검증 키트·실제 worker와 한 번 왕복하는 수동 검증(CI 미실행). 운영 코드에서 쓰지 않음 |
| `test/helpers/worker-messages.cjs`      | 테스트 전용 메시지 검사 도우미. 계약 YAML·합성 세트를 원본 경로에서 읽음. 운영 코드에서 쓰지 않음 |
| `tsconfig.json` / `tsconfig.build.json` | 엄격한 타입 검사, 데코레이터, 빌드 설정            |
| `eslint.config.mjs`                     | TypeScript·JavaScript 정적 검사                    |
| `.env.example`                          | 인증·DB 필수 설정과 실행·테스트 DB 선택 설정. 인증 비밀값은 공란, DB 값은 로컬 컨테이너 전용 |
| `.gitignore`                            | 로컬 설정·의존성·빌드 결과 제외. 기존 내용 유지    |

후속 기능은 `src/<기능>/`에 모듈·컨트롤러·서비스와 엔티티(`*.entity.ts`)를 두고 `AppModule`의 `imports`에 해당 모듈을 연결한다. health 컨트롤러에 제품 기능을 추가하지 않는다. 기능별 정상·거부·실패 검사는 해당 이슈의 완료 기준에 맞춰 추가한다.

## 엔티티와 마이그레이션 — 기능 담당자 안내

- 엔티티: `src/<기능>/<이름>.entity.ts`. 이름이 `.entity.ts`로 끝나면 앱과 마이그레이션 명령이 자동으로 찾는다. 서비스에서 Repository를 주입받으려면 기능 모듈의 `imports`에 `TypeOrmModule.forFeature([엔티티])`를 넣는다.
- 마이그레이션: `src/database/migrations/` 한 곳. 파일은 생성 명령으로 만든다.
- 테이블은 승인된 ERD의 속성·필수 값·enum·유일성을 따른다(11월 Unit은 계약 설계의 공유 표와 그 Unit 기능 설계의 entities). 바꿀 때 계약 수정인지는 [코딩 운영](../docs/CatchU_coding_procedures.md#코딩-운영)의 계약 수정 규칙을 따른다.

순서:

1. `git fetch origin` 뒤 작업 브랜치를 합칠 대상 브랜치(보통 `origin/dev`, 11월 팀 방식은 통합 브랜치 `intent/260925-intent-12`) 기준으로 최신화한다([레포 컨벤션 §3](../docs/CatchU_레포_컨벤션.md)).
2. `npm run migration:run`: 다른 사람이 병합한 마이그레이션까지 개발 DB에 적용한다. 빼먹으면 다음 단계가 남의 테이블까지 다시 만드는 마이그레이션을 생성한다.
3. 엔티티를 추가하거나 고친다(「DB 물리 규약」).
4. `npm run migration:generate -- src/database/migrations/<변경이름>`: 개발 DB와 엔티티의 차이로 `<시각>-<변경이름>.ts`가 생긴다. 예: `CreateMemberAccount`.
5. 생성된 SQL을 읽는다. 규약의 타입·제약 이름인지, 의도하지 않은 `DROP`이나 다른 테이블 변경이 없는지 본다. 생성기가 표현하지 못하는 부분(예: 순환 FK의 DEFERRABLE)은 손으로 고친다.
6. `npm run migration:run`으로 적용하고, `npm run migration:revert`로 되돌린 뒤 다시 적용해 `down`도 확인한다.
7. 엔티티와 마이그레이션을 같은 PR에 넣는다. `npm test`가 테스트 DB에 새 마이그레이션을 적용해 함께 검사한다.

- **dev나 통합 브랜치에 합쳐진 마이그레이션은 고치지 않는다.** 이미 적용한 DB에는 고친 파일이 다시 실행되지 않으므로, 바꿀 것은 새 마이그레이션으로 추가한다.
- 두 작업이 각각 마이그레이션을 추가하면 나중에 합쳐지는 쪽이 최신화 뒤 2~6단계를 다시 한다. 실행 순서는 파일 이름의 시각이다.
- PostgreSQL 확장(pgvector의 `vector`)은 마이그레이션에서 `CREATE EXTENSION IF NOT EXISTS vector`로만 부르고, `down`에서 지우지 않는다. 이 확장은 슈퍼유저만 만들 수 있어 합성 DB·개발 서버·운영 DB에서는 관리자가 미리 만들어 두고(#389), 슈퍼유저 `catchu`로 마이그레이션하는 개발·테스트 DB에서는 그 자리에서 만들어진다.
- 다른 브랜치에서 적용한 마이그레이션이 개발 DB에 남아 있으면 4단계 결과에 그 테이블의 `DROP`이 섞인다. 그 브랜치에서 `migration:revert`로 되돌리거나 「로컬 DB 준비」의 볼륨 삭제 뒤 다시 적용한다.

## DB 물리 규약

[ERD v1](../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md)이 물리 매핑으로 넘긴 항목(ID 형식, 시각, enum 저장, 이름)을 PostgreSQL에서 이렇게 정한다. 이름은 `src/database/snake-naming.strategy.ts`가 만들고, `test/db/conventions.test.cjs`가 생성 SQL로 확인한다.

| 항목 | 규칙 |
| --- | --- |
| 테이블 | 엔티티 클래스 이름의 단수 snake_case(`MemberAccount` → `member_account`). 약어가 있으면 이름을 적는다: `@Entity('github_connection')`(자동 변환은 `git_hub_connection`) |
| 칼럼 | 속성 이름의 snake_case(`sourceRequestId` → `source_request_id`). 칼럼 이름은 따로 쓰지 않는다 |
| 내부 ID(ERD `id`) | `uuid`. `@PrimaryColumn({ type: 'uuid' })`로 두고 저장 전에 앱이 `randomUUID()`(`node:crypto`)로 채운다. DB 생성값(`@PrimaryGeneratedColumn`)은 쓰지 않는다. 요청·동의·첫 시도처럼 서로 참조하는 행을 한 트랜잭션에서 미리 연결해야 하기 때문이다 |
| 참조 | 참조 대상과 같은 `uuid` 칼럼 속성을 두고, 관계에는 `@JoinColumn({ name: '<그 칼럼>' })`을 붙인다. 회원이나 회원 자료를 참조하면 `deleteWithParent`(`ON DELETE CASCADE`)를 붙인다. 회원 탈퇴는 회원 행 하나를 지워 그 자료를 함께 지운다([탈퇴 연쇄 삭제](docs/member-withdrawal-deletion.md)) |
| 외부 ID(ERD `external-id`·`external-work-key`) | `text`. 서비스 DB의 FK를 걸지 않는다 |
| 문자열 길이 | ERD에 길이 제한이 있으면 `text` + `@Check(lengthBetween('<칼럼>', 최소, 최대))`. 예: 멱등 key 1~128 |
| 시각 | 모든 시각 칼럼에 `type: 'timestamptz'`를 적는다. `@CreateDateColumn`·`@UpdateDateColumn`도 `{ type: 'timestamptz' }`를 적는다(생략하면 시간대 없는 `timestamp`). 앱은 `Date`로 다루며, DB 세션 시간대는 UTC다 |
| enum | `varchar` + `@Check(inValues('<칼럼>', [허용 값]))`. DB 네이티브 enum(`type: 'enum'`)은 쓰지 않는다. 값 추가·제거가 마이그레이션에서 까다롭다. 허용 값을 바꾸면 CHECK 이름이 바뀌어 생성 명령이 교체 SQL을 만든다 |
| 제약 이름 | 규칙이 만든다: `pk_<테이블>`, `fk_<테이블>_<칼럼>`, `uq_<테이블>_<칼럼들>`, `ix_<테이블>_<칼럼들>[_<조건 해시>]`, `ck_<테이블>_<칼럼>_<식 해시>`. 63자를 넘으면 해시로 줄인다. 데코레이터에 제약 이름을 쓰지 않는다 |
| 복합 유일성 | `@Unique(['ownerId', 'workIdentity'])`(속성 이름) |
| 부분 유일성 | `@Index(['memberId'], { unique: true, where: `"status" = 'ACTIVE'` })`. `where` 안의 칼럼은 큰따옴표로 감싼 DB 이름으로 쓴다 |
| 시간에 따라 달라지는 유일성 | 정적 unique로 풀지 않는다(예: ShareLink의 유효 기간 안 제목 유일·개수 제한). 같은 회원 단위로 직렬화한 트랜잭션 안에서 판정하며, 방법은 해당 기능 이슈에서 정한다 |
| 순환 FK | 요청·동의·첫 시도처럼 서로 참조하면 FK를 `DEFERRABLE INITIALLY DEFERRED`로 두어 커밋 때 검사한다. 적용은 [#104](https://github.com/JminAILab/CatchU/issues/104)에서 한다. 같은 회원 자료끼리의 순환은 연쇄 삭제가 없어도 탈퇴 때 함께 지워진다 |
| ID 형식 확인 | 경로·메시지로 받은 ID가 uuid 형식이 아니면 조회 전에 걸러 명세의 응답(없는 자원과 같은 404 등)으로 돌려준다. 그대로 조회하면 PostgreSQL 오류(`22P02`)가 서버 오류(500)가 된다 |

```typescript
import { randomUUID } from 'node:crypto';
import { Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { inValues, lengthBetween } from '../database/checks';

const STATES = ['ACTIVE', 'CLOSED'] as const;

@Entity()
@Check(inValues('state', STATES))
@Check(lengthBetween('external_key', 1, 128))
@Unique(['ownerId', 'externalKey'])
@Index(['ownerId'], { unique: true, where: `"state" = 'ACTIVE'` })
export class ExampleItem {
  @PrimaryColumn({ type: 'uuid' })
  exampleItemId: string = randomUUID();

  @Column({ type: 'uuid' })
  ownerId!: string;

  @Column({ type: 'text' })
  externalKey!: string;

  @Column({ type: 'varchar' })
  state!: (typeof STATES)[number];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
```

## 트랜잭션 규약

팀장 결정(9/28): 여러 영역의 저장을 한 트랜잭션으로 묶을 때(예: [#105](https://github.com/JminAILab/CatchU/issues/105)의 E 반영 기록과 B 등록) 호출하는 쪽이 트랜잭션을 열고 그 `EntityManager`를 넘긴다. 넘겨받는 쪽 함수는 manager를 인자로 받고, 안의 DB 작업은 모두 그 manager로 한다(`manager.getRepository(...)`, `manager.query(...)`). 넘겨받은 함수 안에서 주입받은 전역 `DataSource`·`Repository`를 쓰면 다른 연결에서 따로 커밋되어, 바깥 트랜잭션이 실패해도 롤백되지 않는다. 확인 테스트는 `test/db/transaction.test.cjs`다.

```typescript
// 호출하는 쪽
await this.dataSource.transaction(async (manager) => {
  await manager.getRepository(MyRecord).save(record);
  await this.otherArea.save(manager, input);
});

// 넘겨받는 쪽
async save(manager: EntityManager, input: Input): Promise<void> {
  await manager.getRepository(OtherEntity).save(/* ... */); // 넘겨받은 manager만 쓴다
}
```

## 인증 기반 사용과 후속 경계 — #87

초기 인증 기반의 작업 브랜치는 `api/auth-foundation`, 구현 시작 기준은 `origin/dev`의 `9b67570a0e220a81de2e33f8a8deabb3b8e5d34e`다. 앞의 초기화 기준은 #83의 과거 기록이다. 아래 공통 오류 연결은 #132 병합 후 #87의 후속 보완이며, 기존 날짜별 검증 기록과 구분한다.

기준은 [회원 인증 계약 M](../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md)과 [#87의 #104 경계 안내](https://github.com/JminAILab/CatchU/issues/87#issuecomment-5815415143)다. `Authorization: Bearer <CatchU Access JWT>`를 검증해 회원 ID를 요청 내부에 저장한다. 인증 코드는 [#88의 공통 예외 사용법](https://github.com/JminAILab/CatchU/issues/88#issuecomment-5863346290)에 따라 `ApiError`를 던지고 기존 전역 필터가 응답 형식·상태·`no-store`를 적용한다.

| 상황 | 현재 응답 |
| --- | --- |
| Authorization 헤더 없음 | `401 AUTH_REQUIRED` |
| 헤더는 있으나 빈 값·Basic 방식·빈 Bearer·공백/쉼표로 잘못 구성된 Bearer | `401 AUTH_INVALID` |
| JWT 형식·서명·만료·발급자/대상·필수 회원 식별 값 오류 | `401 AUTH_INVALID` |
| 개발 로그인 회원 ID 오류·추가 필드 | `400 VALIDATION_FAILED`, `details.violations=[{field,reason}]` |

인증 오류의 응답·로그에 토큰이나 JWT 라이브러리의 원문 오류를 전달하지 않는다. 헤더 형식 오류의 세부 코드는 기존 명세에 없었던 경계로, 이번 후속 작업에서 사용자 확인을 받아 위처럼 구현했으며 PR의 연결 검토 대상이다. 개발 로그인 입력 검증은 기존 전역 ValidationPipe를 재사용한다. `memberId` 조건 위반의 reason은 `isMemberId`, 추가 필드는 `whitelistValidation`이며 입력값을 담지 않는다. 아래 날짜별 과거 검증 기록은 당시 상태를 나타낸다.

기능 컨트롤러에는 Guard를 다시 붙일 필요가 없다. `@CurrentMemberId()`만 사용하며 JWT claim, 개발 로그인 플래그, 요청 body/query의 회원 ID에 의존하지 않는다. #250 후속 Guard는 DB의 세션 유효성·ACTIVE 회원을 확인한다([세션 안내](docs/auth-sessions.md)). GitHub 연동·분석 동의·자원 소유권은 각 기능에서 따로 검사한다. 각 후속 기능에서 해당 계약에 따른 검사가 필요하다.

인증 없이 허용할 메서드에만 다음처럼 표시한다. 컨트롤러 클래스에 붙이면 그 클래스 전체가 공개되므로 범위를 신중히 선택한다. `/health`는 메서드에 명시되어 있다.

```typescript
import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';

@Controller('example-public')
export class ExamplePublicController {
  @Public()
  @Get()
  read() { return { public: true }; }
}
```

개발 전용 `POST /v1/auth/dev-login`은 JSON `{ "memberId": "검토용-회원-ID" }` 하나만 받아 `accessToken`, `tokenType: "Bearer"`, `expiresIn`(초)을 반환한다. 회원 ID는 비어 있지 않고 앞뒤 공백이 없는 문자열이어야 하며, 임의로 trim하거나 다른 타입을 문자열로 바꾸지 않는다. 누락·빈 값·앞뒤 공백·다른 타입·추가 필드는 `400 VALIDATION_FAILED`와 위반 필드/규칙으로 응답한다. JSON 해석 단계의 오류는 기존 공통 처리인 `400 INVALID_REQUEST`를 유지한다.

기본 비활성이며, `DEV_LOGIN_ENABLED=true`와 `NODE_ENV=development` 또는 `test`가 함께 지정된 경우만 허용한다([#216 개발 로그인 조건](https://github.com/JminAILab/CatchU/issues/216)). 미지정·공란·production·그 밖의 환경에서는 입력 DTO 검사보다 먼저 `403 INTERNAL_ERROR`로 거부하며 토큰을 발급하지 않는다. 설정 변경은 서버 재시작 후 반영된다. 이는 [9/28 팀장 결정](https://github.com/JminAILab/CatchU/issues/88#issuecomment-5861430583)의 코드 없는 403 처리이며, 개발 로그인 전용 거부 코드는 [기존 협의 항목](https://github.com/JminAILab/CatchU/issues/88#issuecomment-5863346527)으로 남아 있다. 새 오류 코드를 추가하거나 전용 코드 합의가 끝난 것으로 취급하지 않는다.

개발 로그인 Guard는 실행 제한 확인 후, DTO 변환기가 제거하는 `constructor`·`__proto__` 입력도 추가 필드 오류로 거부한다. 그 밖의 필드 검증은 기존 전역 ValidationPipe가 담당한다.

현재 내부 토큰 구현은 HS256, 발급자 `catchu-api`, 대상 `catchu-member-api`, `sub` 회원 UUID·`sid` 세션 UUID와 `iat`·`exp`를 서명·검증한다. 서명 알고리즘을 제한하고 비어 있는/공백 회원 ID, 누락된 만료·발급 시각, 잘못된 대상·발급자도 거부한다. 이는 #87 개발 기반의 내부 형식이며 기능 코드의 의존 대상이나 실제 OAuth 발급 계약이 아니다. 토큰 원문과 검증 라이브러리의 상세 오류는 로그·오류 응답에 포함하지 않는다.

[#104](https://github.com/JminAILab/CatchU/issues/104)의 개발 회원 공급자가 받은 문자열을 개발 전용 identityReference에 연결하고 회원·기본 프로필·최초 합성 연동을 준비한다. 토큰에는 실제 회원 UUID를 사용하며 기능 코드의 `@CurrentMemberId()` 사용 방식은 유지한다. 상세는 「회원·분석 선행 테이블과 멱등 처리 — #104」를 따른다. 이는 #104 당시 경계다. 현재 Google 발급은 [Google 안내](docs/google-login.md), 세션·재발급·로그아웃·쿠키·Origin 검사는 [#250 세션 안내](docs/auth-sessions.md)를 따른다. GitHub·자원 소유권은 별도 기능의 기준을 적용한다.

## 공통 오류 처리 — API 명세 v1

정본은 [API 명세 v1 공통 오류·요청 안전성](../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#공통-오류요청-안전성)과 [common.yaml의 Error](../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml)다. 오류 본문은 `{code, message, details?}`이며 화면은 문구 대신 `code`로 분기한다. `details`는 `violations: [{field, reason}]`와 `existingRequestId`만 허용한다. 입력값·SQL·stack·토큰을 응답에 넣지 않는다.

| 기본 구분 | HTTP | 코드 |
|---|---|---|
| 입력 | 400 | INVALID_REQUEST, VALIDATION_FAILED |
| 미인증·수신자 비밀번호 | 401 | AUTH_REQUIRED, AUTH_INVALID, LINK_PASSWORD_REQUIRED, LINK_PASSWORD_INVALID |
| 권한·선행 조건·요청 출처 | 403 | GITHUB_CONNECTION_REQUIRED, REPOSITORY_NOT_ALLOWED, CONSENT_REQUIRED, AUTH_ORIGIN_FORBIDDEN |
| 없음·열람 불가 | 404 | RESOURCE_UNAVAILABLE, LINK_UNAVAILABLE |
| 충돌 | 409 | ANALYSIS_IN_PROGRESS, RETRY_NOT_ALLOWED, REANALYSIS_DEFERRED, IDEMPOTENCY_CONFLICT, CONFIRMATION_REQUIRED, SOURCE_RESTRICTED, LINK_TITLE_CONFLICT, LINK_LIMIT_REACHED |
| 수신자 비밀번호 시도 제한 | 429 | LINK_UNLOCK_LIMITED (남은 초는 `Retry-After` 헤더, `new ApiError('LINK_UNLOCK_LIMITED', { retryAfterSeconds })`) |
| 회원 링크 발급 빈도 제한 | 429 | RATE_LIMITED (남은 초는 `Retry-After` 헤더, `new ApiError('RATE_LIMITED', { retryAfterSeconds })`) |
| 서버 오류 | 500 | INTERNAL_ERROR |

기능에서는 `src/common/errors`의 `ApiError`를 던진다. HTTP 상태는 코드에 따라 정해진다.

```typescript
import { ApiError } from '../common/errors'; // 현재 파일 위치에 맞게 상대 경로 조정

throw new ApiError('CONSENT_REQUIRED');
// 진행 중 요청을 안내할 때:
throw new ApiError('ANALYSIS_IN_PROGRESS', { details: { existingRequestId: requestId } });
```

새 오류 코드가 계약 수정인지는 [코딩 운영](../docs/CatchU_coding_procedures.md#코딩-운영)의 계약 수정 규칙을 따르고, 정해지면 `error-codes.ts`의 상태/기본 문구, 이 표, 기능 테스트를 함께 추가한다. #250의 `403 AUTH_ORIGIN_FORBIDDEN`(갱신·로그아웃 요청의 출처 거부)은 2026-10-14 API 명세에 반영됐다. 상태·의미는 위 공통 오류·요청 안전성 표와 [M — 회원 API](../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#m--회원-api)가 정본이고, 구현 동작은 [세션 안내](docs/auth-sessions.md)에 있다. 과거 승인 문서를 소급 수정하지 않는다. 기존 코드의 사용자 문구를 지정할 때도 내부 예외의 message를 그대로 전달하지 않는다.

전역 ValidationPipe는 class-validator 데코레이터가 있는 DTO 클래스의 검증 실패·추가 필드를 `400 VALIDATION_FAILED`와 필드/규칙 이름으로 응답한다. `unknown`·인터페이스·직접 수동 검증은 DTO 검증 대상이 아니다.

[9/28 팀장 결정](https://github.com/JminAILab/CatchU/issues/88#issuecomment-5861430583)에 따라 명세 밖 예외를 처리한다.

- 코드 없는 403·409는 상태를 유지하고 `INTERNAL_ERROR`와 경고 로그를 남긴다. 업무 코드가 있는 거부는 `ApiError`를 사용한다.
- 본문 크기 초과(413 예외 포함)는 `400 INVALID_REQUEST`, 안내는 `요청 본문이 너무 큽니다.`다.
- 없는 경로는 `404 RESOURCE_UNAVAILABLE`이다. `/v1` 밖에서도 HTML 대신 같은 형식으로 응답한다.
- 예상 밖 예외는 `500 INTERNAL_ERROR`와 일반 안내다. 5xx 로그는 `ApiError`를 포함해 예외 분류명과 코드 위치(`파일:줄:칸`)만 남긴다. 분류명은 `error.name` 원문이 아니라 `instanceof` 기반으로 고른 허용 목록의 고정 분류명(`ApiError`·`ForbiddenException`·`TypeError`·`Error` 등)이며, 목록 밖의 하위 클래스는 가장 가까운 상위 분류로 기록한다. 코드 위치는 stack 문자열이 아니라 V8의 구조화된 호출 위치에서 따로 수집하므로 원문 메시지가 섞이지 않으며, 함수 이름은 기록하지 않는다. 수집 기록이 없으면 위치를 생략한다(`src/common/errors/stack-frames.ts`). 요청 주소는 토큰이 들어가는 실제 경로 대신 등록된 경로 틀만 기록하고, 없으면 `[unmatched]`로 표시한다.
- 업무 코드가 있는 4xx 거부는 기본적으로 기록하지 않는다. 보안 사건 세 코드의 예외·기록 형식·검사는 [보안 사건 기록](docs/security-events.md)을 따른다.

전역 설정은 `configureApp`에 모았다. 기능 경로는 `/v1` 아래, `GET /health`는 접두사 없이 유지하며 성공·오류 응답에 `Cache-Control: no-store`를 붙인다. `/v1` 밖 오류와 CORS 사전 요청을 포함한 모든 응답에 보안 헤더 `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`·`X-Content-Type-Options: nosniff`·`Referrer-Policy: no-referrer`를 붙이고 `X-Powered-By`를 끈다. `Strict-Transport-Security: max-age=300`은 `NODE_ENV`가 development·test가 아닐 때(값이 없거나 다른 값 포함) 붙인다. 기간은 5분으로 시작해 도메인·인증서가 정해지면 늘린다(`src/common/http/security-headers.ts`, #217). `npm test`는 실제 로컬 HTTP 서버에서 위 상태/본문/헤더/로그, ValidationPipe, 인증 Guard를 검증한다. 오류 재현 전용 경로는 `test/errors.test.cjs`에만 있고 제품 앱에 추가하지 않는다.
