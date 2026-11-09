# U4 발행·링크 — 단위 시험 안내

## Sources

입력: [코드 생성 계획](code-generation-plan.md)의 Testing Contract와 Steps, [U4 기능 명세](../functional-design/functional-spec.md) 「주요 시나리오와 확인」 S1~S15, [U4 비기능 설계](../nfr-design/) 보안·신뢰성·관측 설계, api 시험 실행기 `api/scripts/test-with-db.cjs`(인자로 준 파일만 실행), web `package.json`의 `node --test`.

## 시험 도구와 설정

- api: Node 내장 `node:test`(`.test.cjs`), 테스트 DB는 `api/scripts/test-with-db.cjs`가 격리 스키마로 준비한다. 준비 방법은 `api/README.md` 「DB 테스트」. 새 설정 파일·도구를 들이지 않는다.
- web: Node 내장 `node:test`(`.test.mjs`)와 기존 시험 도우미. 새 도구를 들이지 않는다.
- 커버리지: 팀장이 넣은 서비스별 명령(`npm run test:coverage`)만 쓴다. CI·측정 도구를 고치지 않는다(team.md Testing Posture).

## 이 Unit의 시험 실행 명령

모두 이 Unit 파일만 지정한다. 프로젝트 전체 `npm test`는 쓰지 않는다. 각 제출은 그때까지 만든 파일만 실행한다.

시험 실행기 확인(Step 1, 첫 시험 전):

```bash
cd api && npm test -- test/db/publication-tables.test.cjs
```

```bash
cd web && node --test test/recipient.test.mjs
```

제출 1:

```bash
cd api && npm test -- test/catches/author-description-api.test.cjs test/materials/text-materials-api.test.cjs
```

```bash
cd web && node --test test/author-description.test.mjs test/materials.test.mjs
```

제출 2(제출 1 파일 포함):

```bash
cd api && npm test -- test/catches/author-description-api.test.cjs test/materials/text-materials-api.test.cjs test/publications/in-memory-publication-access.test.cjs test/publications/publication-access-db.test.cjs test/publications/publish-api.test.cjs test/publications/publications-manage-api.test.cjs test/publications/publications-logging.test.cjs test/publications/publications-module.test.cjs
```

```bash
cd web && node --test test/author-description.test.mjs test/materials.test.mjs test/publish.test.mjs test/publications-owner.test.mjs
```

제출 3(전체):

```bash
cd api && npm test -- test/catches/author-description-api.test.cjs test/materials/text-materials-api.test.cjs test/publications/in-memory-publication-access.test.cjs test/publications/publication-access-db.test.cjs test/publications/publish-api.test.cjs test/publications/publications-manage-api.test.cjs test/publications/publications-logging.test.cjs test/publications/publications-module.test.cjs test/publications/recipient-api.test.cjs test/publications/recipient-unlock-policy.test.cjs test/publications/app-routes.test.cjs test/db/member-cascade-delete.test.cjs
```

```bash
cd web && node --test test/author-description.test.mjs test/materials.test.mjs test/publish.test.mjs test/publications-owner.test.mjs test/recipient.test.mjs
```

커버리지(각 제출 끝, 위 api 파일 목록과 같음):

```bash
cd api && npm run test:coverage -- test/publications/publication-access-db.test.cjs test/publications/publish-api.test.cjs test/publications/publications-manage-api.test.cjs test/publications/recipient-api.test.cjs
```

## 시험 범위 (구성 요소별 5~8개, 표준 전략)

| 구성 요소 | 시험 파일 | 주요 사례 |
|---|---|---|
| Catch 설명 API | `api/test/catches/author-description-api.test.cjs` | S1·S2, 4,000/4,001자, 공백만 NULL, 남의 Catch·형식 오류 UUID 404, 정의 밖 필드 400, 로그에 본문 없음 |
| 텍스트 자료 API | `api/test/materials/text-materials-api.test.cjs` | S3, 제목·본문 경계, cursor, 회원 두 명 교차 접근 404, 삭제 뒤 사본 유지(제출 2에서 S10과 함께) |
| C-10 DB 구현 | `api/test/publications/publication-access-db.test.cjs` | 판정 순서, 형식 오류 토큰 404, 중지·만료·삭제 404, 비밀번호 링크 grant(없음·틀림·다른 발행본) 401, 비활성 소유자 404, 회원 없음 500, `resolveForOwner` 중지·만료 뒤 허용·남의 것 NotFound, `readSnapshot` 발행본 없음 실패 |
| 발행 API | `api/test/publications/publish-api.test.cjs` | S4~S7, 빈도 429·`Retry-After`, 입력 400, 동의 403, 하루 한도 429·롤백, 자격 409 `details.catchIds`·다른 비공개 Catch 그대로, 전체 글 60,000/60,001자, `chunkInTransaction` 예외 롤백, 등록 실패 201 |
| 작성자 관리 API | `api/test/publications/publications-manage-api.test.cjs` | S9(작성자 쪽)·S10~S13, 목록 최신순·cursor·`indexState` 없음, 중지 반복·만료 중지, 삭제 성공 연쇄·접두어 실패 500 DB 유지, 남의 발행본 404 |
| 로그 | `api/test/publications/publications-logging.test.cjs` | 결과 분류별 한 줄, 정해진 칸만, 합성 토큰·grant·비밀번호·본문 비노출, 등록 실패와 접두어 삭제 실패 분류 구분 |
| 모듈 구성 | `api/test/publications/publications-module.test.cjs` | 공급자 선언, 운영 설정에서 `LINK_GRANT_SECRET` 없음·64자 hex 아님·http 주소면 기동 실패, `share-links.service` 미import |
| 받은 사람 경로 | `api/test/publications/recipient-api.test.cjs` | S8·S9·S14, 비밀번호 없는 링크 unlock 400, 판정 뒤 중지 커밋 때 진행 중 요청과 다음 요청, 비활성 소유자 열람·unlock 404와 재활성, **회원 없음 열람·unlock 500과 응답·로그 비노출**, `no-store` |
| unlock 제한 | `api/test/publications/recipient-unlock-policy.test.cjs` | 10월 unlock·주소 제한 사례를 발행본 경로로: 429·차단 중 비밀번호 확인 안 함·다른 링크 비차단 |
| 경로 경계 | `api/test/publications/app-routes.test.cjs` | (메서드, 경로) 중복 없음, 받은 사람 두 경로가 새 컨트롤러 하나에만, 옛 경로 없음, `@Public()` 메서드 단위, 미지정 경로 인증 요구 |
| 회원 연쇄 삭제 | `api/test/db/member-cascade-delete.test.cjs`(#422에서 확장) | 탈퇴 연쇄 삭제가 새 표를 확인(보호 흐름) |
| 설명·자료 화면 | `web/test/author-description.test.mjs`·`web/test/materials.test.mjs` | 저장 성공 뒤에만 "저장됨", 실패 입력 유지, 로그인 만료 안내, 이탈 경고, 민감 정보 안내 |
| 발행·관리 화면 | `web/test/publish.test.mjs`·`web/test/publications-owner.test.mjs` | 작성자 실패 안내 표의 각 경우, 입력 유지, 빈도 초과 버튼 잠금, 발행 중 버튼 잠금, 삭제 실패 안내 |
| 받은 사람 화면 | `web/test/recipient.test.mjs`(고쳐 씀) | G1~G4, 사본 표지 구분, 근거 링크만 GitHub, `aiDraft` 글자, 404·401·429·grant 유지 묶음 |

## 기대 커버리지

- 제출 3 끝에 U4 api 코드(`dist/publications`·`dist/materials`와 설명 API) 줄 커버리지 80% 이상. 미달이면 낮추지 않고 원인과 빠진 사례를 PR에 적는다.
- web 화면은 행동 시험으로 확인하고 수치는 팀장 명령의 결과를 그대로 적는다.

## 가짜·대역

- U2(`AiRun`·`DailyRunLimit`·`AiConsentGate`·`FileStorage`)·U3(`PublishedIndexWriter`)는 계약 모양 가짜로 결과(ENQUEUED·ENQUEUE_FAILED, ALLOWED·LIMIT_REACHED, 동의 있음·없음, 성공·StorageUnavailable, 정상·예외)를 고른다. 운영 코드에는 두지 않는다.
- 소유 회원 없음은 정상 DB에서 만들 수 없으므로 10월 `recipient-http.test.cjs`처럼 `OwnerProfileReader.readOwnerState` 결과만 시험 안에서 대역으로 바꾼다.
- 시계는 `PUBLICATIONS_CLOCK`을 시험 시계로 바꿔 만료·빈도를 기다리지 않고 시험한다.

## 시험 자료

- 합성 회원·Catch·자료만 쓴다. 실제 사용자 자료·비밀값을 쓰지 않는다.
- 비밀값 비노출 시험은 합성 토큰·grant·비밀번호 문자열을 넣고 로그·응답에 없는지 본다.
- U2·U3 가짜로 돌린 결과는 '합성 연결을 포함한 사전 확인'으로 기록한다.
