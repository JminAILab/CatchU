# Worker 분석 시도 컨텍스트 — #232

worker가 분석 `attemptId`로 접수 회원·동의·선정 범위와 GitHub 자격정보를 조회하는 내부 연결이다. [수집 통제의 A→F 인계](../../docs/CatchU_collection_control_scope.md#3-af-자격정보-인계), [회원·분석 저장 모델](member-analysis.md), [#231/#254 단일 자격정보 함수](github-connection.md#토큰-보관과-232-접점)를 사용한다. 아래 HTTP 형식은 #232의 구현 연결안이며 승인된 `aidlc/` 계약을 소급 수정하지 않는다.

## 조립 조건과 후속 공급자

`WorkerContextModule.register({ selectionSource })`는 실제 PostgreSQL과 `GitHubConnectionModule`을 연결한다. 공급자가 없으면 조립을 거부한다. **기본 AppModule에는 자동 등록하지 않는다.** #252의 실제 선정 저장소 목록과 접수 동의 범위를 해석하는 공급자가 준비되지 않았기 때문이다. 기존 `consentedScope`의 `synthetic: true`·자료 종류 목록을 전체 저장소 동의로 추정하지 않는다. 환경변수만 켜도 경로가 생기지 않는다.

`WorkerRepositorySelectionSource.resolve(manager, context)`는 접수 기록의 attemptId·requestId·memberId·repositoryId·scopeRevision·consentedScope를 받아 아래를 확인해야 한다.

- 현재 선정된 공개 저장소의 ID·좌표와 범위 판본이 접수 기록과 일치한다.
- 저장된 동의가 해당 저장소의 전체 선정임을 명시적으로 뜻한다. 알 수 없는 구조·부분 선정·철회·미지원 판본은 `null`이다.
- 반환값은 같은 attemptId·requestId·memberId·repositoryId·scopeRevision, `repository: { owner, name }`, `wholeRepository: true`다. 토큰을 받거나 반환하지 않는다.

제공받은 `EntityManager`로 조회하고 외부 통신을 하지 않는다. 자격정보 조회 전후 두 번 호출하며, 최종 호출은 분석·회원·동의의 짧은 읽기 잠금 안에서 수행한다. 조회 장애는 예외로 전달해 `500 INTERNAL_ERROR`로 남긴다. 서비스는 공급자 반환 식별자와 좌표 형식도 검사한다. 실제 공급자는 이 인터페이스의 새 구현으로 #252의 저장소 선정 근거에 연결해야 하며 테스트 공급자를 앱에 등록해서는 안 된다.

후속 실제 공급자를 마련한 뒤 실행 모듈을 조립하는 형태다. `selectedRepositories`는 실제 공급자를 준비해 전달하는 값이며 이 문서가 구현을 제공하지 않는다.

```typescript
import { Module } from '@nestjs/common';
import { AppModule } from './app.module';
import { WorkerContextModule } from './worker-context/worker-context.module';
import { WorkerRepositorySelectionSource } from './worker-context/worker-context.types';

export function workerContextApplication(selectedRepositories: WorkerRepositorySelectionSource) {
  @Module({ imports: [AppModule, WorkerContextModule.register({ selectionSource: selectedRepositories })] })
  class WorkerContextApplication {}
  return WorkerContextApplication;
}
// NestFactory.create(workerContextApplication(실제공급자)) 후 기존 configureApp(app), listen을 사용한다.
```

이 조립과 `WORKER_CONTEXT_ENABLED=true`, 별도 `WORKER_CONTEXT_API_KEY`가 모두 필요하다. 키는 안전한 난수 32바이트의 64자리 hex이며 기본값이 없다. AUTH JWT·링크 grant·GitHub 보관 암호화 키와 같으면 기동을 거부한다. 잘못된 활성화 값·키는 development/test/staging/production을 포함해 어느 환경에서도 기동을 거부한다. 기능 자체는 운영용 내부 조회이므로 개발 환경으로 제한하지 않는다. 배포에서는 HTTPS 내부 통신·worker에서만 접근할 네트워크 제한과 비밀 주입을 별도로 준비한다. 자세한 목록은 [환경변수 표](environment.md)에 있다.

## HTTP 입력과 응답

`GET /v1/internal/analysis-attempts/{attemptId}/context`에 `X-Worker-Key`를 보낸다. 경로의 attemptId만 받고 query와 GET body는 거부한다. 전역 AccessTokenGuard의 **메서드 전용 서비스 인증 분기**가 키를 상수 시간 비교한다. `@Public()`을 쓰지 않으며 회원 Bearer는 본인·타인 모두 거부하고 키와 혼용해도 거부한다. 일반 회원 API에는 기존 JWT 인증을 유지한다.

성공은 200이며 다음 모양이다. 모든 응답은 `Cache-Control: no-store`다.

```typescript
{
  attemptId: string,
  requestId: string,
  credential: {
    memberId: string,
    repositoryId: string,
    scopeRevision: string,
    repository: { owner: string, name: string },
    linkedAccount: { login: string, externalAccountId: string },
    accessToken: string,
    expiresAt: string
  },
  selection: { repositoryId: string, wholeRepository: true }
}
```

externalAccountId는 정밀도 손실 없는 양의 십진 문자열이다. expiresAt은 GitHub 발급 토큰의 확인된 만료를 ISO UTC로 옮긴 값이다. 분석 처리 시한이나 CatchU JWT 수명이 아니다. 토큰 원문은 이 인증된 응답을 만들 때만 `reveal()`하며 DB·큐·로그·일반 회원 응답에 넣지 않는다. worker는 메모리에서만 사용하고 요청과 회원·저장소·판본을 다시 대조한다.

| 상황 | 응답 |
|---|---|
| 키 없음 | 401 AUTH_REQUIRED |
| 틀린 키·형식 오류·회원 Authorization 포함 | 401 AUTH_INVALID |
| 추가 query/body | 400 INVALID_REQUEST |
| 잘못된/없는 attemptId, 지난 시도, 닫힌 요청, QUEUED/RUNNING이 아닌 상태 | 404 RESOURCE_UNAVAILABLE |
| 비활성 회원, 불일치/미확인 동의·선정, 사용 불가 GitHub 자격정보 | 404 RESOURCE_UNAVAILABLE |
| DB·선정 공급자·GitHub 일시 장애 | 500 INTERNAL_ERROR |

이용 불가 본문은 `{ "code": "RESOURCE_UNAVAILABLE", "message": "현재 열람할 수 없는 자료입니다." }`다. worker는 이 코드의 404만 미해석으로 취급하고 인증/5xx/비정상 응답은 오류로 처리한다. 예상 밖 5xx의 기존 안전한 로그와 AUTH_INVALID 보안 로그에는 토큰·키·원문을 넣지 않는다.

## 유효성 재확인

현재 요청의 ACTIVE·ACCEPTED, 현재 시도의 QUEUED/RUNNING, 활성 회원, accepted 동의의 requestId·memberId·repositoryId 일치를 하나의 DB 조회에서 확인한다. 처리 시한으로 FAILED가 된 시도와 UNCERTAIN은 인계하지 않는다. 이 경로가 자체 처리 시한이나 상태 전이를 새로 정의하지는 않는다.

선정을 확인한 뒤 **GitHubConnectionService.resolveCredential(memberId)만 한 번 호출**한다. 이 함수가 실제 보관·만료·GitHub 신원/권한·해제·재연결을 확인한다. 외부 확인이 끝나면 API가 분석·회원·동의·선정을 다시 확인해 도중 종결·비활성화·선정 변경의 인계를 막는다. 이 함수 직전의 연결 참조는 불투명한 비교값으로만 보관하고, 두 번째 선정 확인이 끝난 뒤 같은 트랜잭션에서 GitHub 연결 행을 읽기 잠금으로 확인한다. 연결 상태·참조·계정이 달라졌으면 같은 GitHub 계정으로 재연결했더라도 이전 토큰을 반환하지 않는다. 연결 참조로 토큰을 직접 읽거나 해석하지 않는다. 이미 worker에 인계한 토큰을 이후 로컬 해제만으로 회수하지는 못하며 이 경계는 기존 GitHub 연결 기능과 같다.

## 검사

API README의 전용 테스트 DB를 준비한 뒤 `api/`에서 기존 검사 명령을 사용한다.

```powershell
npm run lint
npm run typecheck
npm test -- test/worker-context-auth.test.cjs test/db/worker-context-api.test.cjs
```

시험은 실제 Nest HTTP·PostgreSQL·암호문 보관과 기존 자격정보 함수를 사용한다. GitHub 응답과 선정 공급자만 합성 대역이다. 활성 시도·키/JWT 거부·회원 두 명·동의/선정 불일치·지난/종결 시도·만료/해제/재연결·외부 확인 중 종결 경쟁·자격정보 조회가 끝난 뒤 최종 선정 확인 대기 중 해제/동일 계정 재연결 경쟁·오류/로그 비노출을 검사한다. 실제 GitHub 승인·실제 #252 선정 공급·운영 내부 네트워크 검증을 대신하지 않는다. `npm test`가 두 파일을 자동 탐색한다.
