# 본인 Catch 조회·확인·불일치 API — #130·#131

> 2026-09-29 · 실제 NestJS 라우트와 PostgreSQL 조회/저장 구현. A/E 선행 자료 및 보호 판단 공급은 해당 담당 코드와 연결해야 한다.

## 동작

| API | 입력과 결과 |
|---|---|
| GET /v1/catches | 본인 목록. repositoryId·sourceRequestId AND 필터, limit 기본20/1~100, cursor. `{items, page:{nextCursor}}` 반환 |
| GET /v1/catches/{catchId} | 본인 Catch·근거·생성 상태·현재 보호 판단 반환 |
| PUT /v1/catches/{catchId}/confirmation | workFactsConfirmed:true·contributionConfirmed:true 두 필드만 받아 함께 저장 |
| PUT /v1/catches/{catchId}/mismatch | mismatch:boolean 한 필드만 저장. true/false 반복 요청 가능 |

[`OwnerCatchesController`](../src/catches/owner-catches.controller.ts)는 공통 Guard가 검증한 `CurrentMemberId`만 받는다. 입력 ownerId로 권한을 바꿀 수 없다. [`OwnerCatchStore`](../src/catches/owner-catch-store.ts)는 DB 조회/수정 자체를 해당 회원으로 제한하고, [`toOwnerCatchResponse`](../src/catches/owner-catch-response.ts)가 원 요청·근거·보호 판단의 소유자/연결을 다시 확인한다.

AppModule에 CatchesModule을 등록했다. /v1, 공통 오류 응답, 성공/실패 no-store는 #132 코드를 그대로 사용하고 DataSource는 #159 공통 DB 모듈이 제공한다. 제품 DB를 별도로 구성하는 B 전용 연결은 없다.

## 목록과 응답

- Catch의 repositoryId는 원 AnalysisRequest에서 읽는다. CatchAsset에 저장소 칼럼을 추가하지 않는다.
- 커서는 catchId UUID 오름차순의 다음 위치다. 내부 ownerId와 필터 문맥의 해시를 포함하고 매 요청 같은 범위를 확인한다. 커서를 권한 증명으로 쓰지 않으며 SQL은 항상 본인으로 다시 제한한다. limit 변경은 허용한다.
- 다른 회원의 Catch·없는 Catch는 똑같은 `404 RESOURCE_UNAVAILABLE`다. 계약상 ID는 비어 있지 않은 문자열이므로 저장 UUID에 해당하지 않는 Catch ID도 같은 404이며 SQL cast 오류로 노출하지 않는다.
- 잘못된 커서·중복/추가 쿼리·허용 범위 밖 limit·잘못된 PUT 본문은 400이다. 인증이 없거나 잘못되면 공통 Guard가 401로 거부한다.
- 본인 응답은 제목·사실·기여·근거·최소 질문과 원 결과/후보·생성 상태·MOCK/LIVE를 보존한다. 내부 ownerId·작업 키·등록 판단은 응답하지 않는다.
- SOURCE_PRIVATE여도 본인은 응답을 받는다. 수신자 공개나 PUBLIC 설정을 바꾸는 기능은 아니다.
- 조회·응답 매핑은 REPEATABLE READ 트랜잭션 안에서 수행한다. 연결 누락·DB 오류를 정상 빈 결과로 변환하지 않는다.

## 확인·불일치 저장

확인은 두 값이 모두 true일 때만 저장한다. false·필드 누락·다른 필드는 거부한다. 불일치는 boolean 값만 받고 다른 필드는 거부한다. 공통 인증 뒤 소유자 조건의 행 잠금을 잡고 지정된 칼럼만 바꾼다.

변경 후 같은 트랜잭션에서 현재 Catch 응답을 읽는다. 저장 실패뿐 아니라 근거·보호 판단 조회/매핑 실패도 변경을 롤백한다. 확인은 PRIVATE를 PUBLIC으로 바꾸지 않고, 불일치는 확인·공개·본문·근거·생성 상태를 바꾸지 않는다. 제목/설명 편집·재생성·확인 취소·내부 품질 공유는 추가하지 않는다.

## 선행 연결과 보호 판단

B 저장 테이블/등록은 #105(PR #143), A/E 회원·원 요청·시도는 #104, 공통 오류는 #88(PR #132), 공통 DB는 #86(PR #159)을 사용한다. 이 작업 브랜치는 해당 PR 커밋을 연결해 실행 검증하며 dev에 직접 병합하지 않는다. **선행 PR을 먼저 반영해야 B 자체 변경만 남는다.**

[`RepositoryProtection`](../src/catches/entities/repository-protection.entity.ts)과 [`CreateRepositoryProtection1790601000000`](../src/database/migrations/1790601000000-CreateRepositoryProtection.ts)은 B의 명시적인 보호 판단 저장 공간이다. 관측/판정이 없다고 NONE 행을 만들어 채우지 않는다. 같은 소유자·원 저장소의 보호 행이 없으면 조회는 500으로 실패한다. 이 초기 판단의 실제 공급과 원본 관측/복구는 후속 연결 사항이다. 테스트는 합성 관측을 명시해서 NONE/SOURCE_PRIVATE를 넣는다.

마이그레이션은 회원 및 B Catch 선행 테이블 이후 적용한다. 실제 A/E 엔티티가 추가되면 외부 FK 메타데이터와 마이그레이션 timestamp 순서를 대조한다. `migration:generate`의 FK 삭제 제안을 검토 없이 적용하지 않는다.

## 검사

`api/`에서 `npm run typecheck`, `npm run lint`, `npm run test:catches:db`를 실행한다. 명시 DB 검사는 TEST_DB_HOST/PORT/USER/PASSWORD/NAME 다섯 값을 요구하며 이름은 `_test`로 끝나야 한다. 임의 스키마에 A/E 최소 테스트 테이블, 실제 B 등록·보호 마이그레이션을 적용하고 종료 시 자신의 스키마만 정리한다.

[`owner-catch-http.test.cjs`](../test/catches/owner-catch-http.test.cjs)는 실제 JWT Guard·공통 오류·Nest 라우트·PostgreSQL을 연결한다. 본인/타인/미인증, 필터/페이지/입력 거부, 상태 분리·반복 요청, DB 조회/변경 실패·응답 무결성 실패 롤백을 검사한다. A/E 자료는 합성 대역이며 실제 로그인·E 수신·worker 전체 연결을 검증한 것은 아니다.

공통 `npm test`는 테스트 실행 전 제품 마이그레이션을 적용한다. 아직 실제 A/E 테이블이 없는 환경에서는 먼저 **폐기 가능한 빈 테스트 DB에 테스트용 선행 테이블**을 준비해야 한다. 제품 DB에 이 대역을 적용하지 않는다. 판본별 결과와 재현 조건은 PR에 남긴다.

## 근거

- [회원 API](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml): 주소·입력·필터·상태 변경.
- [Catch 응답](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml): 본인 응답과 독립 상태.
- [ERD](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md), [API 기능 설계](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md): 조회 일관성·소유자·커서·보호 관계.
