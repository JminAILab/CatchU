# 검토자 재현 — README만 보고 보호 API 추가·호출

> 1단계의 설치·인증 설정 준비와 「로컬 DB 준비」는 [api README](../README.md)에 있다. 개발 로그인 재현에는 `DEV_LOGIN_ENABLED=true`와 `NODE_ENV=development` 또는 `test`가 함께 필요하다. 환경 미지정·공란·그 밖의 값에서는 플래그가 켜져 있어도 403이다.

아래 절차는 **다른 팀원의 실행 확인이 아직 필요**하다. 자동 테스트의 보호 컨트롤러는 테스트 프로세스에만 있으므로 일반 개발 서버에서 호출할 제품 API를 추가한 것으로 보지 않는다.

1. 별도 검토 작업본에서 위 설치·인증 설정 준비와 「로컬 DB 준비」를 수행한다.
2. 검토용 `src/auth-check/auth-check.controller.ts`를 아래 내용으로 만들고, `AppModule`에 해당 클래스를 import해 기존 `controllers` 배열에 추가한다. 기존 `imports`와 health는 유지한다. 실제품 기능은 해당 기능 모듈에 같은 접근자를 사용한다.

```typescript
import { Controller, Get } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';

@Controller('auth-check')
export class AuthCheckController {
  @Get()
  read(@CurrentMemberId() memberId: string) {
    return { memberId };
  }
}
```

3. `npm run start:dev`로 실행한다. 별도 PowerShell에서 아래 명령을 실행한다. 실제 토큰 문자열을 명령 인수에 붙여 넣거나 출력하지 않고 변수로 전달한다.

```powershell
# 토큰 없이 보호 경로: HTTP 401 확인
try {
  Invoke-RestMethod -Uri http://127.0.0.1:3001/v1/auth-check
} catch {
  Write-Output ('HTTP ' + [int]$_.Exception.Response.StatusCode)
}

# 개발 로그인 응답 전체를 출력하지 않는다.
$authReply = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/v1/auth/dev-login `
  -ContentType 'application/json' -Body '{"memberId":"review-member-87"}'
$authHeaders = @{ Authorization = 'Bearer ' + $authReply.accessToken }
try {
  Invoke-RestMethod -Uri http://127.0.0.1:3001/v1/auth-check -Headers $authHeaders
} finally {
  Remove-Variable authReply, authHeaders -ErrorAction SilentlyContinue
}
```

4. 인증 후 `memberId`가 UUID이고 같은 `review-member-87` 문자열로 재로그인해도 동일한 UUID인지, 토큰 없이 `/health`는 200인지 확인한다. 아래 검증 전에 `NODE_ENV`와 `DEV_LOGIN_ENABLED`의 기존 값·설정 유무를 터미널 환경변수와 `.env`별로 기록하고, 검토 후 원래 상태로 복원한다. 필수 인증 키와 토큰 수명 설정은 유지하며, 비밀값이나 환경변수 전체를 출력하지 않는다. **기본 비활성화:** 서버를 종료하고 터미널 환경변수와 `.env` 양쪽에서 `DEV_LOGIN_ENABLED`를 제거한 뒤 재시작하여 개발 로그인이 403인지 확인한다. **운영 환경 거부:** 서버를 종료하고 터미널에서 `NODE_ENV=production`, `DEV_LOGIN_ENABLED=true`로 설정한 뒤 재시작하여 개발 로그인이 403인지 확인한다.
5. 검토용 컨트롤러와 등록만 제거하고 검사 명령을 실행한다. 기존 파일은 통째로 되돌리지 않는다. 서버를 `Ctrl+C`로 종료하고 이 재현에서 추가한 환경변수만 정리하거나 터미널을 닫는다. 비밀값·토큰 없이 검토 환경, 검토 판본, HTTP 상태와 ID 일치 여부만 공유한다. 작성자 외 재현 완료 여부는 실제 검토자의 확인을 기다린다.
