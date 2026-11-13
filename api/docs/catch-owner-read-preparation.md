# 본인 Catch 조회·확인·불일치 API — #130·#131

> 2026-10-07 · 실제 NestJS 라우트와 PostgreSQL 조회/저장 구현. #104의 실제 회원·분석 테이블을 사용하며 E 수신·완료 호출과 보호 관찰 공급은 별도 연결 사항이다.

## 동작

| API | 입력과 결과 |
|---|---|
| GET /v1/catches | 본인 목록. repositoryId·sourceRequestId·authorDescription(`written`·`unwritten`, 새 Catch C1) AND 필터, limit 기본20/1~100, cursor. `{items, page:{nextCursor}}` 반환 |
| GET /v1/catches/{catchId} | 본인 Catch·근거·생성 상태·현재 보호 판단 반환 |
| PUT /v1/catches/{catchId}/confirmation | workFactsConfirmed:true·contributionConfirmed:true 두 필드만 받아 함께 저장 |
| PUT /v1/catches/{catchId}/mismatch | mismatch:boolean 한 필드만 저장. true/false 반복 요청 가능 |

[`OwnerCatchesController`](../src/catches/owner-catches.controller.ts)는 공통 Guard가 검증한 `CurrentMemberId`만 받는다. 입력 ownerId로 권한을 바꿀 수 없다. [`OwnerCatchStore`](../src/catches/owner-catch-store.ts)는 DB 조회/수정 자체를 해당 회원으로 제한하고, [`toOwnerCatchResponse`](../src/catches/owner-catch-response.ts)가 원 요청·근거·보호 판단의 소유자/연결을 다시 확인한다.

AppModule에 CatchesModule을 등록했다. /v1, 공통 오류 응답, 성공/실패 no-store는 #132 코드를 그대로 사용하고 DataSource는 #159 공통 DB 모듈이 제공한다. 제품 DB를 별도로 구성하는 B 전용 연결은 없다.

## 목록과 응답

- Catch의 repositoryId는 원 AnalysisRequest에서 읽는다. CatchAsset에 저장소 칼럼을 추가하지 않는다.
- 목록 순서는 마지막 작업 시각(`catch_asset.last_work_at`)이 최근인 것부터이고, 시각 없는 Catch(3단계 전 Catch)는 맨 아래, 같으면 catchId UUID 오름차순이다(`ORDER BY last_work_at DESC NULLS LAST, catch_id ASC`, 새 Catch NC3 C2·BR7.1). 정렬 선택 칸은 없고 색인은 더하지 않았다.
- 커서 판본은 `v: 3`이고 위치는 마지막 항목의 `after: {lastWorkAt, catchId}`다. `lastWorkAt`은 DB 값을 `toISOString()`으로 옮긴 밀리초 ISO 글이거나, 시각 없는 Catch까지 갔으면 null이다. 다시 `toISOString()`했을 때 같은 글이 아니면 400이다. 다음 쪽 조건은 정렬과 같은 순서의 고정 SQL 조각 둘(시각 있음·없음) 가운데 하나이고 값은 `$n`으로만 넘긴다. 범위 값은 내부 ownerId와 필터 문맥(repositoryId·sourceRequestId·authorDescription)의 해시로 매 요청 같은 범위를 확인한다. 다른 조건으로 만든 커서와 이전 판본(`v: 1`·`v: 2`) 커서는 400이다(NFR7.2). 커서를 권한 증명으로 쓰지 않으며 SQL은 항상 본인으로 다시 제한한다. limit 변경은 허용한다.
- 수신자용 공개 Catch 목록(`PublicCatchStore`)은 이 정렬·커서를 쓰지 않는다. 지금처럼 catchId 오름차순이고 커서도 `v: 2`, `after`는 catchId 글이다(`publicCatchQuery`·`nextPublicCatchCursor`, NC3 BR7.3). 범위 값 앞에 `public:`을 붙여 본인 커서와 섞이지 않는다.
- 목록·상세의 Catch마다 `revisitFacts`(다시 볼 곳 사실 배열, 새 Catch NC3 C2)를 싣는다. 3단계 전 Catch와 사실 없는 Catch는 빈 배열이다. 저장된 값을 등록 검사와 같은 모양 규칙(종류·종류별 경로·커밋 수·경로 1~1,024자·식별값 40자·한 사실 안 겹침 없음, 최대 30개)으로 다시 보고, 틀리면 응답 무결성 오류(500)다. 첫·마지막 작업 시각은 응답에 싣지 않는다(FR14.3). 마지막 작업 시각은 정렬과 커서에만 쓴다. 수신자용 PublicCatch는 허용 필드만 골라 담아 사실도 시각도 내보내지 않는다.
- `authorDescription=written`은 작성자 설명이 있는 Catch(`author_description IS NOT NULL`), `unwritten`은 없는 Catch다. 빈 설명은 저장 때 null이 되므로 이 판정과 같다. 값은 SQL에 잇지 않고 고정 조건 둘 가운데 하나를 고른다. 빈 값·같은 키 두 번·대소문자가 다른 값·그 밖 값은 400이고 받은 값을 오류에 싣지 않는다. 색인은 더하지 않았다.
- 목록·상세의 Catch마다 `hasAuthorDescription`(참·거짓)을 싣는다. `written` 조건과 같은 판정이고 설명 원문은 이 조회에서 읽지 않는다. 수신자용 PublicCatch는 허용 필드만 골라 담아 이 칸을 내보내지 않는다.
- 다른 회원의 Catch·없는 Catch는 똑같은 `404 RESOURCE_UNAVAILABLE`다. 계약상 ID는 비어 있지 않은 문자열이므로 저장 UUID에 해당하지 않는 Catch ID도 같은 404이며 SQL cast 오류로 노출하지 않는다.
- 잘못된 커서·중복/추가 쿼리·허용 범위 밖 limit·잘못된 PUT 본문은 400이다. 인증이 없거나 서명이 잘못되면 공통 Guard가 401로 거부한다. 서명이 유효해도 회원 ID가 UUID가 아니거나 같은 트랜잭션에서 회원 행을 찾지 못하면 `401 AUTH_INVALID`다. 회원 조회 자체의 DB 오류는 500으로 구분하며 빈 목록·자원 404로 바꾸지 않는다.
- 본인 응답은 제목·사실·기여·근거·최소 질문과 원 결과/후보·생성 상태·MOCK/LIVE를 보존한다. 내부 ownerId·작업 키·등록 판단은 응답하지 않는다.
- [PR #262](https://github.com/JminAILab/CatchU/pull/262)에 따라 `title:null`도 정상 응답이며 필드를 생략하거나 대체 제목으로 채우지 않는다. 같은 매퍼를 사용하는 수신자용 PublicCatch에도 적용한다. 본인 권한·공개/숨김·원본 보호 판단은 그대로 검사한다.
- SOURCE_PRIVATE여도 본인은 응답을 받는다. 수신자 공개나 PUBLIC 설정을 바꾸는 기능은 아니다.
- 조회·응답 매핑은 REPEATABLE READ 트랜잭션 안에서 수행한다. 연결 누락·DB 오류를 정상 빈 결과로 변환하지 않는다.

## 확인·불일치 저장

확인은 두 값이 모두 true일 때만 저장한다. false·필드 누락·다른 필드는 거부한다. 불일치는 boolean 값만 받고 다른 필드는 거부한다. 공통 인증 뒤 소유자 조건의 행 잠금을 잡고 지정된 칼럼만 바꾼다.

변경 후 같은 트랜잭션에서 현재 Catch 응답을 읽는다. 저장 실패뿐 아니라 근거·보호 판단 조회/매핑 실패도 변경을 롤백한다. 확인은 PRIVATE를 PUBLIC으로 바꾸지 않고, 불일치는 확인·공개·본문·근거·생성 상태를 바꾸지 않는다. 제목/설명 편집·재생성·확인 취소·내부 품질 공유는 추가하지 않는다.

## 선행 연결과 보호 판단

B 저장 테이블/등록은 #105(PR #143), A/E 회원·원 요청·시도는 #104, 공통 오류는 #88(PR #132), 공통 DB는 #86(PR #159)을 사용한다. 선행 저장 구현은 dev에 반영되었으며 이 문서는 본인 조회·확인·불일치 API만 설명한다.

[`RepositoryProtection`](../src/catches/entities/repository-protection.entity.ts)과 [`CreateRepositoryProtection1790601000000`](../src/database/migrations/1790601000000-CreateRepositoryProtection.ts)은 B의 명시적인 보호 판단 저장 공간이다. 관측/판정이 없다고 NONE 행을 만들어 채우지 않는다. 같은 소유자·원 저장소의 보호 행과 확인 상태·출처·시각이 모두 있어야 조회할 수 있다. 행이나 관측 값이 없으면(JSON null 포함) 조회는 500으로 실패하고 확인·불일치 변경도 롤백한다. 이전 유효 관측이 있으면 최근 조회 실패 기록만으로 그 판단을 무효화하지 않는다. 이 초기 판단의 실제 공급과 원본 관측/복구는 후속 연결 사항이다. 테스트는 합성 관측을 명시해서 NONE/SOURCE_PRIVATE를 넣는다.

적용 순서는 #104 회원·분석 기반 → E 수신 기록 → B Catch·근거·후보 연결·보호 판단 테이블이다. #143에서 Catch 소유자·원 요청·보호 판단 소유자의 외래 키 메타데이터를 실제 회원·분석 엔티티와 연결했다. E 수신 기록도 실제 엔티티와 마이그레이션을 사용하며 후보 연결의 외부 FK를 유지한다. `migration:generate`의 FK 삭제 제안을 검토 없이 적용하지 않는다.

10월의 [명시적 정책 기록](october-registration-policy.md)은 상태·출처·시각을 가진 유효한 등록 입력으로 사용한다. ‘관측 안 함’의 NONE을 공개 확인으로 표시하지 않으며, 조회 시 누락된 보호 기록을 새로 만들어 채우지 않는다. 본인 조회·확인·공개 선택의 분리는 유지한다.

## 검사

`api/`에서 `npm run typecheck`, `npm run lint`, `npm run test:catches:db`를 실행한다. 명시 DB 검사는 TEST_DB_HOST/PORT/USER/PASSWORD/NAME 다섯 값을 요구하며 이름은 `_test`로 끝나야 한다. 임의 스키마에 실제 회원·동의·요청·시도 기반 마이그레이션, 실제 E 수신 기록·B 등록·보호 마이그레이션을 순서대로 적용하고 종료 시 자신의 스키마만 정리한다.

[`owner-catch-http.test.cjs`](../test/catches/owner-catch-http.test.cjs)는 실제 JWT Guard·공통 오류·Nest 라우트·PostgreSQL을 연결한다. 본인/타인/미인증, 필터/페이지/입력 거부, 상태 분리·반복 요청, DB 조회/변경 실패·응답 무결성 실패 롤백을 검사한다. 저장소는 처음 동의·요청을 만들 때 지정하며 이후 동의와 다른 저장소로 바꾸지 않는다. 같은 회원의 후속 요청은 앞선 요청의 완료·종료를 시험에서 명시한다. 입력·보호 관측은 합성 자료이며 수신 기록과 분석 완료 상태는 시험 준비에서 직접 넣는다. 실제 E 수신·완료 호출을 이 HTTP 시험에서 실행한 것은 아니다. 실제 Google/GitHub 로그인·E 수신·worker 전체 연결을 검증한 것은 아니다.

공통 `npm test`는 폐기 가능한 `_test` DB에 실제 제품 마이그레이션을 적용한 뒤 모든 API 검사를 실행한다. 별도 E 대역 테이블을 미리 만들지 않는다. 판본별 결과와 재현 조건은 PR에 남긴다.

개발 로그인 HTTP가 실제 회원 행의 UUID로 발급한 토큰을 그대로 사용해 본인 목록·상세·확인 저장과 다른 회원의 접근 거부를 확인한다. 테스트 환경에서만 개발 로그인을 켜며, 테스트가 끝나면 설정을 복원한다. 이는 실제 외부 OAuth 또는 브라우저의 로그인 화면 검증과 구분한다.

## 근거

- [회원 API](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml): 주소·입력·필터·상태 변경.
- [Catch 응답](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml): 본인 응답과 독립 상태.
- [ERD](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md), [API 기능 설계](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md): 조회 일관성·소유자·커서·보호 관계.
