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

[#474](https://github.com/JminAILab/CatchU/pull/474)의 접수 경합 결정에 따라, C-10 판정 후 발행본이 삭제되어 TypeORM `QueryFailedError.driverError`가 `code=23503`과 `constraint=fk_jd_summary_run_publication_id`를 함께 반환한 경우만 전체 트랜잭션 롤백 후 `404 LINK_UNAVAILABLE`로 바꾼다. 실행·결과·입력 사본·하루 차감은 남지 않는다. 다른 FK·DB 오류는 기존 `500 INTERNAL_ERROR`를 유지하며 SQL·오류 메시지를 문자열로 판별하지 않는다. `readSnapshot` 재조회는 추가하지 않는다. 접근 판정 후의 중지·만료는 현재 요청의 접수와 차감을 허용하고 다음 요청의 C-10 판정부터 차단한다.

[#416 OQ6 결정](https://github.com/JminAILab/CatchU/issues/416#issuecomment-6651073856)에 따라 C-10의 작성자 비활성은 `404 LINK_UNAVAILABLE`, 유효한 발행본의 회원 행 부재는 고정 `500 INTERNAL_ERROR`로 전달한다. 작성자 상태 판정은 중지·만료 다음, grant 확인 전이다. 판정 통과 뒤 작성자가 비활성화돼도 현재 요청의 접수·차감은 취소하지 않고 다음 요청부터 차단한다. 이 판정은 U4의 기존 DB 제공자를 그대로 사용한다.

요구사항을 순차 처리하며 C-09 검색 limit 6, C-01 HAIKU/JD_SUMMARY를 사용한다. 원문 위치·인용·역할을 그대로 저장한다. U2의 `assertGenerationRequest`가 실제 sources.text + userText 길이를 검사한다. 6개 초과·조각 1,000자 초과는 CONTRACT_INVALID이며 공용 80,000 초과는 INPUT_TOO_LARGE다. 입력을 잘라 호출하거나 자동 재시도하지 않는다.

정상 빈 반환/서버 안내만은 DONE/EMPTY다. NO_ITEMS 예외·개별 호출 시간 초과는 FAILED/GENERATION_FAILED이며 화면은 “이 요구사항을 처리하지 못했습니다.”를 쓴다. 전체 접수 시한 20분 초과는 DEADLINE_EXCEEDED로 구분한다. 이 값은 SLO가 아니다. 실행 행 잠금 안에서 PENDING 요구사항만 시한 실패로 바꾸고 이미 저장한 DONE은 보존한다. 쓰기는 기존 행 UPDATE만 사용한다. 전 행 terminal이고 하나라도 DONE이면 실행 DONE, 전 행 실패면 ALL_REQUIREMENTS_FAILED다.

로그는 stage/outcome/runId/requirementIndex/고정 실패 코드·사유/resultKind/durationMs/droppedCount만 허용한다. 시한 확정은 실제 커밋 때 한 번 기록하고 재열람마다 반복하지 않는다. JD·인용·생성 글·토큰·grant·전체 URL·SQL·제공자 오류 원문을 기록하지 않는다.

## 조립과 검사 범위

`JdManagementModule`과 `JdSummaryModule`을 AppModule에 등록한다. 요약은 `JdSummaryModule.register({ publicationAccess: { useExisting: PUBLICATION_ACCESS }, imports: [PublicationsModule] })`로 U4의 실제 `DbPublicationAccess`를 받는다. #468 병합과 #416 OQ5·OQ6 결정에 따른 등록이며 기본 앱에 합성 구현을 넣지 않는다. 공용 web PATCH/Bearer+grant 어댑터는 연결돼 있다. [U4 제출 3 병합](https://github.com/JminAILab/CatchU/issues/416#issuecomment-6677766344) 뒤 사용자 대기 해제에 따라 C-11 4번 슬롯에 U10 wrapper도 연결했다. 신규 web 영향 검사 16개와 실제 브라우저의 접수/PENDING·합성 저장 DONE 재열람·근거 강조·접근 상실을 확인했다. 이를 외부 AI·실제 큐 처리 완료 근거로 사용하지 않으며 상세 범위는 U10 코드 요약에 있다.

`test/jd/*.test.cjs`는 합성 회원·발행본·제공자와 격리 PostgreSQL을 사용한다. HTTP Guard/한도/동의/연쇄 삭제와 실제 U2 검사 게이트에 합성 Messages 응답을 넣는 조합, `CATCHU_TEST_REDIS_URL`이 있으면 전용 로컬 Valkey 큐를 검사한다. 합성 게이트 통과를 실제 AI 품질·실제 공유 화면 연결·배포 완료로 해석하지 않는다. 실제 외부 AI 호출은 수행하지 않는다.

`test/jd/jd-acceptance-race.test.cjs`는 #474의 삭제 롤백·정확한 오류 분류·중지/만료 경계만 좁게 검사한다. PostgreSQL과 공용 오류 응답 함수는 실제 구현이며 C-10·검색·큐와 응답 어댑터는 시험 대역이다. 제품 C-10 등록, HTTP 서버 연결, 외부 AI 검사의 완료 증거가 아니다. 해당 변경만 재검사할 때는 `npm.cmd test -- test/jd/jd-acceptance-race.test.cjs`를 사용한다.

`test/jd/jd-publication-access.test.cjs`는 실제 AppModule·인증 Guard·C-10·C-09 상태 조회·DB를 사용하는 영향 검사 9개다. 새 UUID·합성 identity로 만든 회원과 그 자식만 정리하며 전체 DB 초기화·마이그레이션을 하지 않는다. 정상 FK로 만들 수 없는 회원 행 부재만 `OwnerProfileReader` 대역을 사용한다. 판정 후 변경의 시점은 실제 C-09 상태 조회 뒤 시험용 hook으로 고정한다. 비밀번호 unlock·C-11·생성·실제 큐 실행은 대상이 아니다.

읽기 전용 소스 환경에서는 `DB_NAME=catchu_u10_test`, `CATCHU_U10_SOURCE_TEST=true`를 해당 검사 프로세스에만 전달하고 `node --require ts-node/register --test --test-concurrency=1 test/jd/jd-publication-access.test.cjs`를 사용한다. 검사 파일은 source/dist를 명시적으로 선택하며, 자체 시험 프로세스에 임시 인증 키와 외부 AI·큐 차단 설정을 적용한다. 기존 3311 API 프로세스를 갱신하거나 운영 인증 설정을 바꾸지 않는다. 신규 결과는 실행 후 U10 코드 요약에 별도로 기록하며 기존 75개·17개 결과를 재실행한 것으로 처리하지 않는다.

```powershell
npm.cmd test -- test/jd/jd-management.test.cjs test/jd/jd-summary.test.cjs test/jd/jd-integration.test.cjs
$env:TEST_COVERAGE_INCLUDE='dist/{jd,jd-summary}/**'
npm.cmd run test:coverage -- test/jd/jd-management.test.cjs test/jd/jd-summary.test.cjs test/jd/jd-integration.test.cjs
```

검사 DB는 반드시 U10 고유 이름이며 `_test`로 끝나야 한다. `TEST_DB_*`를 전용 DB에 지정한다. 마이그레이션 생성은 최신 기존 마이그레이션을 적용한 빈 개발 DB에서 `npm.cmd run migration:generate -- src/database/migrations/CreateJdSummary`를 사용한다. up/down/up은 그 격리 개발 DB만 대상으로 한다. Unit 커버리지와 전체 프로젝트 80% gate는 구분하며 전체 gate는 Build and Test에서 검증한다.
