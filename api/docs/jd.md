# JD 관리·개인 요약 — U10 / #452

승인된 [기능 설계](../../aidlc/spaces/default/intents/260925-intent-12/construction/u10-jd/functional-design/functional-spec.md)와 [비기능 설계](../../aidlc/spaces/default/intents/260925-intent-12/construction/u10-jd/nfr-design/logical-components.md)를 구현한다. JD는 회원 본인의 자산이며 요약은 회원과 발행본을 함께 확인하는 비공개 실행이다.

## 경로와 입력

모든 경로는 전역 회원 인증 Guard를 통과한다. 성공·오류는 공용 `no-store` 응답을 사용한다.

| 경로 | 응답 |
| --- | --- |
| GET `/v1/jds?cursor=...` | `{items:[{jdId,title,updatedAt}],nextCursor}` |
| POST `/v1/jds` | 201 `{jdId,title,body,createdAt,updatedAt}` |
| GET/PATCH `/v1/jds/:jdId` | 200 위 상세 모양 |
| DELETE `/v1/jds/:jdId` | 204. 실행·결과·입력 사본도 삭제 |
| POST `/v1/public/links/:token/jd-summaries` | `{jdId}` → 202 `{runId}` |
| GET `/v1/public/links/:token/jd-summaries?cursor=...` | `{items:[{runId,title,createdAt,status,requirementCount,emptyCount,failedCount}],nextCursor}` |
| GET `/v1/public/links/:token/jd-summaries/:runId` | `{status,failureCode,requirements:[...]}` |

JD 생성·수정 본문은 `{title,body}`다. 제목 1~200, 본문 1~20,000 UTF-16 코드 단위이며 공백만인 값과 추가 필드는 거부한다. 저장은 동의·AI 한도와 무관하다. 실행은 원문 CRLF/LF의 빈 줄만 제외하고 최대 20줄, 한 줄 2,000자를 검사한다. 각 결과는 원문 `requirementIndex,sourceLineNumber,jdLine`과 `status,resultKind,failureCode,evidenceItems,unconfirmedPoints,interviewQuestions`를 반환한다. 목록은 최신순 20개 cursor이며 본문은 상세에서만 반환한다.

U10 경계 입력 오류는 `422 INVALID_INPUT / INPUT_TOO_LARGE`, 남의/없는 JD·실행은 `404 RESOURCE_UNAVAILABLE`다. 공용 ValidationPipe는 바꾸지 않는다. 링크는 매번 C-10 `resolveForRecipient(token, X-Link-Grant, now)`로 판정한다. 작성자도 중지·만료를 우회하지 않는다.

## 접수·처리·시한

본인 입력 → C-04 동의 → C-09 DONE 확인 후 짧은 JD 행 잠금에서 최신 입력을 재검증한다. 같은 EntityManager에 C-03 하루 횟수와 실행·입력 사본·PENDING 결과를 저장한다. 커밋 후 C-02에 `JD_SUMMARY, runId, {runId}`만 등록한다. 등록 실패는 차감을 유지하고 PENDING으로 응답한다.

요구사항을 순차 처리하며 C-09 검색 limit 6, C-01 HAIKU/JD_SUMMARY를 사용한다. 원문 위치·인용·역할을 그대로 저장한다. U2의 `assertGenerationRequest`가 실제 sources.text + userText 길이를 검사한다. 6개 초과·조각 1,000자 초과는 CONTRACT_INVALID이며 공용 80,000 초과는 INPUT_TOO_LARGE다. 입력을 잘라 호출하거나 자동 재시도하지 않는다.

정상 빈 반환/서버 안내만은 DONE/EMPTY다. NO_ITEMS 예외·개별 호출 시간 초과는 FAILED/GENERATION_FAILED이며 화면은 “이 요구사항을 처리하지 못했습니다.”를 쓴다. 전체 접수 시한 20분 초과는 DEADLINE_EXCEEDED로 구분한다. 이 값은 SLO가 아니다. 실행 행 잠금 안에서 PENDING 요구사항만 시한 실패로 바꾸고 이미 저장한 DONE은 보존한다. 쓰기는 기존 행 UPDATE만 사용한다. 전 행 terminal이고 하나라도 DONE이면 실행 DONE, 전 행 실패면 ALL_REQUIREMENTS_FAILED다.

로그는 stage/outcome/runId/requirementIndex/고정 실패 코드·사유/resultKind/durationMs/droppedCount만 허용한다. 시한 확정은 실제 커밋 때 한 번 기록하고 재열람마다 반복하지 않는다. JD·인용·생성 글·토큰·grant·전체 URL·SQL·제공자 오류 원문을 기록하지 않는다.

## 조립과 검사 범위

`JdManagementModule`은 AppModule에 등록한다. `JdSummaryModule.register({publicationAccess,imports})`는 실제 C-10 제공 모듈과 토큰을 받는 경계이며 기본 앱에 합성 구현을 등록하지 않는다. #416 실제 DB C-10 및 C-11 슬롯, web 공용 PATCH/Bearer+grant 전달 보완이 완료된 뒤 제품 연결 검사를 수행해야 한다.

`test/jd/*.test.cjs`는 합성 회원·발행본·제공자와 격리 PostgreSQL을 사용한다. HTTP Guard/한도/동의/연쇄 삭제와 실제 U2 검사 게이트에 합성 Messages 응답을 넣는 조합, `CATCHU_TEST_REDIS_URL`이 있으면 전용 로컬 Valkey 큐를 검사한다. 합성 게이트 통과를 실제 AI 품질·실제 공유 화면 연결·배포 완료로 해석하지 않는다. 실제 외부 AI 호출은 수행하지 않는다.

```powershell
npm.cmd test -- test/jd/jd-management.test.cjs test/jd/jd-summary.test.cjs test/jd/jd-integration.test.cjs
$env:TEST_COVERAGE_INCLUDE='dist/{jd,jd-summary}/**'
npm.cmd run test:coverage -- test/jd/jd-management.test.cjs test/jd/jd-summary.test.cjs test/jd/jd-integration.test.cjs
```

검사 DB는 반드시 U10 고유 이름이며 `_test`로 끝나야 한다. `TEST_DB_*`를 전용 DB에 지정한다. 마이그레이션 생성은 최신 기존 마이그레이션을 적용한 빈 개발 DB에서 `npm.cmd run migration:generate -- src/database/migrations/CreateJdSummary`를 사용한다. up/down/up은 그 격리 개발 DB만 대상으로 한다. Unit 커버리지와 전체 프로젝트 80% gate는 구분하며 전체 gate는 Build and Test에서 검증한다.
