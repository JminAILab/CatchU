# Catch 공개·숨김과 수신자 자료 조회 — #165

기준은 [회원 API](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml)의 visibility PUT, [공통 응답](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml)의 PublicCatch·PublicEvidence, [기능 규칙](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md)의 BR2.9~2.11이다. 기존 계약을 구현하며 새 권한·공개 조건을 정하지 않는다.

## 본인 공개·숨김

`PUT /v1/catches/{catchId}/visibility`에 `{ "visibility": "PUBLIC" }` 또는 `{ "visibility": "PRIVATE" }`만 보낸다. 응답은 현재 본인용 Catch다. 회원 ID는 공통 인증 Guard가 공급하며 body/query로 받지 않는다.

- 타인·없는 Catch는 공통 `404 RESOURCE_UNAVAILABLE`, 잘못된 본문·추가 키·쿼리는 `400 INVALID_REQUEST`다.
- PUBLIC은 Catch 행을 잠그고 두 확인 항목이 true인지 검사한다. 미확인은 `409 CONFIRMATION_REQUIRED`다.
- 같은 원 요청 저장소·소유자의 RepositoryProtection을 공유 잠금으로 읽는다. SOURCE_PRIVATE는 `409 SOURCE_RESTRICTED`, 보호 자료와 확인 상태·출처·시각 누락(SQL/JSON null 포함)·무결성 실패는 공통 500이다. 행 부재를 NONE으로 만들지 않는다. 이전 유효 관측에 최근 조회 실패만 추가된 경우는 기존 판단을 유지한다.
- 보호 판단 잠금은 공개 저장과 응답 검사가 끝날 때까지 유지한다. READ COMMITTED로 잠금 대기 중 커밋된 보호 변경을 확인한다. 다른 트랜잭션의 원본 보호 갱신은 같은 행의 DB 잠금과 직렬화된다.
- PRIVATE은 확인·공개 자격 조건 없이 숨긴다. 반복 요청은 동일 상태이며, 확인·불일치·본문·근거를 변경하지 않는다. DB 변경 또는 응답 무결성 검사 실패 시 전체를 롤백한다.
- 불일치, 초안·질문 생성 실패는 별도 상태다. 공개를 자동 변경하거나 추가 공개 차단 조건으로 사용하지 않는다.
- 성공·오류의 `Cache-Control: no-store`와 오류 응답은 공통 모듈을 사용한다.

## C가 연결할 내부 조회

C 모듈은 `CatchesModule`을 import하고 `PublicCatchStore`를 주입한다. C에서 **링크 유효성·만료·중단·비밀번호를 먼저 검증한 뒤**, 저장된 링크에서 얻은 소유자 ID로 호출한다. 수신자가 보낸 ownerId를 그대로 넘기면 안 된다. 이 서비스는 링크를 검증하지 않으며 별도 공개 HTTP 경로나 인증 예외를 만들지 않는다.

```typescript
// 링크 접근이 허용된 뒤, C가 보유한 link.ownerId를 전달한다.
const { catches, page } = await publicCatches.list(link.ownerId, query);
const catchDetail = await publicCatches.get(link.ownerId, catchId);
```

- `list(ownerId, query)`: query는 HTTP 문자열 `limit?`·`cursor?`만 받는다. limit은 기본 20, 최대 100. 반환은 `{ catches: PublicCatchResponse[], page: { nextCursor: string | null } }`다. C가 별도로 A의 공개 프로필과 결합한다.
- `get(ownerId, catchId)`: PublicCatchResponse 하나를 반환한다. 숨김·다른 소유자·없는 자료·원본 제한은 모두 같은 NotFoundException이며 공통 필터가 `404 RESOURCE_UNAVAILABLE`로 변환한다.
- 매 호출의 DB 트랜잭션에서 현재 PUBLIC이고 보호 제한이 NONE인 자료만 반환한다. 링크별 Catch 스냅샷이나 캐시를 만들지 않는다. 숨김·보호 변경 커밋 후 시작한 다음 조회부터 제외된다.
- 목록·근거는 같은 REPEATABLE READ 스냅샷에서 읽는다. 커서는 Catch UUID 오름차순의 위치이며 권한 증명이 아니다. 다음 페이지도 현재 공개 조건을 다시 검사한다. 본인용 커서·다른 소유자의 커서는 거절한다.
- 정상 빈 목록은 200에 사용할 빈 catches 배열이다. 보호 판단 누락·DB 조회·응답 자료 오류는 예외로 전달하며 빈 목록으로 바꾸지 않는다.
- 허용 필드만 새 객체로 만든다: catchId, title, workFacts, subjectContribution, evidence, draft. 근거에서는 sourceUrl, sourceRevision, representedFacts, contributionScope, coverageLimits만 전달한다. 본인 질문·확인·불일치·내부 등록/근거 식별자·sourceMode를 제외한다. 생성되지 않은 초안 content는 null이다.

## 검증과 남은 연결

`api/`에서 `TEST_DB_HOST/PORT/USER/PASSWORD/NAME`을 설정한 뒤 `npm run test:catches:db`로 실행한다. DB 이름은 `_test`로 끝나야 한다. 기존 등록 테스트의 공용 worker 합성 자료까지 검사하려면 `CATCH_WORKER_FIXTURE_ROOT`도 설정한다.

검사는 실제 Nest HTTP·개발 로그인·PostgreSQL과 회원·분석·E 수신 기록 및 B 마이그레이션을 사용한다. 개발 로그인으로 생성된 회원 UUID와 발급 토큰으로 미확인 공개 거절 → 확인 후 PRIVATE 유지 → 별도 PUBLIC 변경 → 타인 변경 거절 → PRIVATE 변경을 검사하고, 공개·숨김이 다음 수신자 내부 조회에 반영되는지 확인한다.

분석 요청·동의·시도는 실제 기반 엔티티에 합성 자료를 넣으며, E 수신 기록도 실제 엔티티·마이그레이션을 사용한다. 수신 기록과 분석 완료 상태는 시험에서 직접 준비하며 실제 수신·완료 호출은 이 HTTP 검사에 포함하지 않는다. 분석 후보·근거·원본 보호 관찰도 명시적인 합성 자료다. PublicCatchStore는 링크 접근이 허용된 C 호출부 대신 직접 호출한다. 이 밖에 공개·숨김 반복, 권한, 공개 필드, 페이지 중 숨김/보호 변경, 저장/조회 실패, 보호 갱신과 공개 요청의 동시성을 검사한다.

실제 Google/GitHub·분석 결과·원본 관찰 공급, C의 링크·비밀번호 HTTP 경로와의 종단 연결, 화면 연결·실제 배포는 이 검사에 포함하지 않는다. C 수신자 API 연결은 #151, 실제 원본 보호 관찰 공급은 #129 B08에서 이어간다.
