# 회원·분석 선행 테이블과 멱등 처리 — #104

[ERD v1](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md), [구현 계획](https://github.com/JminAILab/CatchU/issues/104#issuecomment-5896005086), [공유 링크 비교 조건](https://github.com/JminAILab/CatchU/issues/104#issuecomment-5884501159)을 구현한다. E 접수·조회 API, A 프로필·실제 연동 API, B/C 테이블·결과 수신 저장은 포함하지 않는다.

## 테이블 참조와 저장

[`member-analysis.entity.ts`](../src/member-analysis/member-analysis.entity.ts)의 엔티티를 import해서 **호출자가 넘긴 EntityManager**로 읽고 저장한다. 기능이 별도 DataSource나 중복 회원·멱등 테이블을 만들지 않는다.

| 엔티티 / 테이블 | 키·연결 |
| --- | --- |
| MemberAccount / member_account | member_id UUID, identity_reference 유일. account_state는 내부 인증 판단 값이며 새 공개 enum이 아님 |
| MemberProfile / member_profile | profile_id UUID, member_id FK·유일. 회원 생성 시 빈 문자열·빈 skills·SELF_REPORTED로 함께 준비 |
| GitHubConnection / github_connection | connection_id UUID, member_id FK·유일. 실제 토큰 없이 외부 계정·자격정보 참조만 저장 |
| AnalysisRequest / analysis_request | request_id UUID, member_id FK. ACTIVE 회원 부분 유일 인덱스. 동의·현재 시도 필수 |
| AnalysisConsent / analysis_consent | consent_id UUID, request_id 유일. 요청·회원·저장소를 복합 FK로 대조. accepted=true, 동의 판본·범위는 접수 뒤 변경 불가 |
| AnalysisAttempt / analysis_attempt | attempt_id UUID, request_id FK. processing/application 분리, source_mode·후보 수·안전한 failures·실패 확정 참조 |
| IdempotencyRecord / idempotency_record | idempotency_id UUID, (member_id, operation, key) 유일. operation별 request_id 또는 link_id 하나와 response_reference 필수 |

순환 FK는 `DEFERRABLE INITIALLY DEFERRED`다. 요청·새 동의·첫 시도를 모두 쓰지 않으면 **콜백 실행이 끝나도 커밋에서 실패**한다. `insertInitialAnalysis(manager, input)`은 ID를 먼저 만들고 세 행을 저장하는 내부 기반이며 접수 권한·현재 연동·고지/범위·ACTIVE 이력·재요청 자격 판정을 대신하지 않는다. 호출하는 E 접수 API가 그 판정을 수행한 뒤 사용한다. 이 함수는 신규 저장만 제공하며 재요청·worker 전송 API를 추가하지 않는다.

동의 불변성과 재요청 선행 참조 불변성은 마이그레이션의 트리거로도 보호한다. 재요청 참조는 이미 존재하는 요청만 가리킬 수 있고 이후 다른 선행 요청으로 바꿀 수 없어 자기 참조·순환을 만들 수 없다. 본인·같은 저장소는 복합 FK로 검사한다. **확정 실패·등록 결과 없음 등 재요청 허용 판단은 #138의 접수 로직**에 남는다. 트리거·enum 제약 통과를 재요청 허가로 취급하지 않는다.

## 개발 회원과 합성 GitHub 연결

개발 로그인 body의 `memberId` 이름은 유지하지만 값은 **개발 식별 문자열**이다. `catchu:dev-login:` 네임스페이스의 identityReference로 회원을 찾거나 생성하고, 커밋된 **실제 member_id UUID**를 JWT에 싣는다. 같은 문자열의 반복·동시 로그인은 같은 회원과 기본 프로필을 사용한다. 기존 프로필·연결 상태를 덮어쓰지 않으며, 기존 회원의 필수 프로필이 없으면 오류로 처리한다. 실제 제공자 연동 시 개발 네임스페이스와 분리해야 한다.

`DevMemberService`는 `AuthModule`에서 export한다. `readConnection(인증된 memberId)`은 개발 회원의 현재 합성 연결과 선정 저장소, sourceMode=MOCK을 반환한다. [지정 표본](../../worker/fixtures/m1-synthetic/context.sample.json)의 repositoryId=`synthetic-repo-0001`, allowedScopeRevision=`00000000-0000-4000-8000-000000000201`을 사용하며 테스트가 표본 일치를 검사한다. 요청·동의·시도 ID를 표본에서 복사하지 않는다. 현재 대역은 GitHub 네트워크 호출·실제 접근권한·분석 동의를 제공하지 않는다. #136과 E 접수에서 이 내부 공급자를 연결한다.

회원·기본 프로필·최초 합성 CONNECTED 행은 한 트랜잭션이다. 인증의 공통 설정을 공유하며, `DEV_LOGIN_ENABLED=true`와 `NODE_ENV=development` 또는 `test`가 함께 지정된 경우만 회원 준비와 대역 조회를 허용한다. 기본 비활성·환경 미지정·production·그 밖의 환경에서는 모두 거부한다. 기존 실제 연동을 합성 연결로 덮어쓰지 않는다. 토큰 검증 Guard는 매 요청 DB 조회를 추가하지 않았으므로, 기존 문자열 토큰은 다시 개발 로그인하여 UUID 토큰으로 바꿔야 한다. 기능은 여전히 `@CurrentMemberId()`만 사용하고 자원 존재·소유권을 별도로 확인한다.

## 멱등 생성 호출

[`runIdempotentCreation`](../src/member-analysis/idempotent-creation.ts)은 활성 **READ COMMITTED** 트랜잭션의 manager를 받는다. (회원, operation, key)의 트랜잭션 잠금으로 키를 예약한 후 자원 생성·멱등 기록·응답 구성을 함께 처리한다. 유일 인덱스가 최종 중복 방어다. 예약 중간 행을 커밋하지 않으며, 실패 후 동일 키로 다시 요청할 수 있다.

- operation: `createAnalysisRequest` 또는 `createShareLink`. key는 1~128자다.
- request_fingerprint: 작업별 정규화한 입력의 **SHA-256 소문자 64자리 hex text**. 링크는 C의 `shareCreateFingerprint`(제목·비밀번호 설정 여부)를 그대로 사용한다. 비밀번호 원문·해시를 지문에 넣지 않는다.
- 형식 오류는 값의 출처에 따라 구분한다. 사용자 입력인 `Idempotency-Key`는 `400 INVALID_REQUEST`, 서버가 정하는 operation·생성하는 requestFingerprint는 `500 INTERNAL_ERROR`다. 오류 응답에 내부 값이나 지문을 포함하지 않는다. 정상 형식의 지문이 기존 요청과 다르거나 `isSame`의 비동기 비교 결과가 false이면 기존 `409 IDEMPOTENCY_CONFLICT`를 유지한다.
- request_id/link_id: operation에 맞는 하나만 저장한다. 공통 함수가 연결 자원의 회원도 대조한다. request_id의 회원 일치는 DB 복합 FK로도 보장한다.
- response_reference: 안전한 응답 재구성 참조(text). 예를 들어 자원 UUID를 저장하고 readResponse에서 원본 자원을 다시 읽는다. 요청/응답 원문, 비밀번호·토큰을 이 열에 직렬화하지 않는다.
- isSame: 지문이 같은 재요청에서도 **항상 await하는 필수 비교 함수**다. 키 잠금과 DB 연결을 쥔 채 실행되므로 해시 계산 같은 무거운 연산은 하지 않는다. C는 같은 manager로 기존 링크를 조회해 `matchStoredShareCreate`로 본문·설정 여부를 확정하고, 읽은 저장 검증값을 트랜잭션 밖으로 넘겨 커밋 뒤 `verifyPendingPassword`로 비밀번호를 비교한다(#220). 비밀번호가 다르면 `replayed`여도 응답을 돌려주지 않고 `409 IDEMPOTENCY_CONFLICT`다. false만 `409 IDEMPOTENCY_CONFLICT`이며 DB 오류·기록 불일치는 서버 오류로 전달한다. 분석 접수(E)의 `isSame`에는 해시가 없어 이 구분이 필요하지 않다.
- create/readResponse: 모두 받은 manager를 사용한다. readResponse 실패도 신규 자원·멱등 기록을 함께 롤백한다. 예외를 트랜잭션 내부에서 삼키지 않는다.

다음은 기능 담당자가 채울 콜백의 호출 형태다(제품 API 추가 예시가 아님).

```typescript
let pendingPassword: PendingPasswordCheck | null = null;
const result = await dataSource.transaction('READ COMMITTED', (manager) =>
  runIdempotentCreation(manager, {
    memberId, operation: 'createShareLink', key, requestFingerprint,
  }, {
    create: async (sameManager) => {
      const link = await issueShareLink(sameManager, command);
      return { requestId: null, linkId: link.linkId, responseReference: link.linkId };
    },
    isSame: async (sameManager, record) => {
      const link = await sameManager.findOneByOrFail(ShareLink, { linkId: record.linkId! });
      const match = matchStoredShareCreate(input, {
        requestFingerprint: record.requestFingerprint,
        passwordVerifier: link.passwordProtectionReference,
      });
      if (!match.same) return false;
      pendingPassword = match.passwordCheck; // 해시 비교는 트랜잭션 밖에서 한다
      return true;
    },
    readResponse: async (sameManager, record) =>
      buildOwnerLinkResponse(sameManager, record.responseReference),
  }),
);
// 재요청이면 잠금·연결을 놓은 뒤: if (result.replayed && !await verifyPendingPassword(pendingPassword)) → 409 IDEMPOTENCY_CONFLICT.
// 여기까지 성공한 뒤 응답: result.replayed와 operation 계약에 맞는 HTTP 상태 사용.
```

C의 기존 회원 단위 발급 잠금은 create 안에서 획득한다. 호출 순서는 공통 멱등 키 잠금 → 작업별 회원 잠금이며, 밖에서 반대 순서로 잠그지 않는다. 다른 키의 동시 링크 발급 제한은 C 함수의 책임이다. E의 같은 저장소 ACTIVE 처리·다른 저장소 거부도 멱등 키가 다른 경우의 업무 판정으로 남는다.

## 적용 순서와 후속 연결

`1790500000000-CreateMemberAnalysisFoundation`은 [PR #143의 B 마이그레이션](https://github.com/JminAILab/CatchU/pull/143) `1790600000000`보다 먼저 적용된다. 고정 선행 순서를 위해 작성 시각 대신 이 순서 번호를 사용했다.

1. #104의 일곱 테이블.
2. #105 E 담당의 ResultApplicationRecord(이 PR에 미포함). timestamp는 위 두 마이그레이션 사이여야 한다.
3. PR #143 Catch/근거/후보 연결/보호 판단 테이블.
4. [PR #157 본인 조회·확인](https://github.com/JminAILab/CatchU/pull/157)의 원 요청→회원·저장소 대조와 실제 자료 연결.

B는 `member_account.member_id`, `analysis_request.request_id/member_id/repository_id/current_attempt_id`, `analysis_attempt.attempt_id/request_id/source_mode`를 참조할 수 있다. B의 외부 FK 엔티티 메타데이터 연결과 전체 적용 순서는 해당 연결 PR에서 다시 검사한다. ResultApplicationRecord·ReceiverStore·B 호출·보호 관찰 공급이 없으므로 이번 선행 테이블만으로 #143/#157 전체 연결 완료가 아니다.

ShareLink 생성 마이그레이션과 `idempotency_record.link_id → share_link.link_id` FK·엔티티 메타데이터는 C 담당으로 #147에서 추가했다([share-links.md](share-links.md), 복합 FK `(link_id, member_id)`). 되돌릴 때는 B/C·수신 기록의 종속 FK/테이블을 먼저 되돌린다. #104 down은 자기 일곱 테이블·트리거만 제거하며 CASCADE로 후속 테이블을 지우지 않는다.

## 검사와 검토

전용 `_test` DB에서 `npm test`를 실행한다. `test/db/member-analysis.test.cjs`는 빈 스키마 up/down/re-up·엔티티 일치, 필수/유일/FK/enum, 중간 요청 커밋 거부, 반복·동시 로그인과 ACTIVE·멱등 요청, 생성·응답·커밋 실패 롤백을 검사한다. 실제 HTTP 개발 로그인에서 얻은 UUID로 분석 FK 저장도 확인한다. 같은 지문·다른 비밀번호는 테스트용 C 최소 테이블/비교 콜백으로 검사하며 실제 링크 API·scrypt 연결 검증은 C PR에 남긴다. 기존 #87·#139 검사는 UUID 회원 연결에 맞춰 유지한다.

다른 담당자의 실제 E 접수/C 발급·B 등록·worker·OAuth 통합과 사람 리뷰는 자동 검사 통과로 대신하지 않는다.
