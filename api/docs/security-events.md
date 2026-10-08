# 보안 사건 최소 기록 — #222

[10/4 팀장 결정](https://github.com/JminAILab/CatchU/issues/88#issuecomment-5975854431)에 따라 공통 오류 필터가 다음 세 코드만 `SecurityEvent` 경고 한 줄로 기록한다.

- `AUTH_INVALID`: 회원 토큰 변조·만료·형식 오류(401)
- `LINK_PASSWORD_INVALID`: 링크 비밀번호 불일치(401)
- `LINK_UNLOCK_LIMITED`: 링크 비밀번호 시도 제한(429)

`AUTH_REQUIRED`·`LINK_PASSWORD_REQUIRED`는 정상 진입에서도 발생하므로 제외한다. 발급 빈도 제한 `RATE_LIMITED`를 포함한 나머지 업무 4xx도 보안 사건으로 기록하지 않는다.

형식은 `<분류 코드> <메서드> <등록된 경로 틀> requestId=<UUID> at=<ISO 시각>`이다. 실제 URL·토큰·비밀번호·요청 본문·헤더·쿼리·예외 원문은 기록하지 않는다. 등록 경로가 없으면 `[unmatched]`를 사용한다. 요청 식별자는 서버 내부에서 요청마다 생성하며 응답·web으로 전달하지 않는다.

구현은 `src/common/errors/api-exception.filter.ts`와 `src/common/http/request-id.ts`다. 기존 오류 응답·차단 정책·해시 순서는 바꾸지 않는다.

검사 위치:
- `test/security-events.test.cjs`: 기록·제외 및 합성 민감정보의 로그 비노출 단위 검사.
- `test/auth.test.cjs`: 실제 회원 인증 실패·정상 진입의 로그 검사.
- `test/db/public-links-unlock.test.cjs`: 실제 HTTP·PostgreSQL에서 비밀번호 실패·시도 제한과 로그 검사.

실행은 api 폴더의 `npm test`를 사용하며 테스트 DB 준비는 [README](../README.md#db-테스트)를 따른다. 합성 자료만 사용하고 운영 로그 저장·보관 환경은 별도 검증한다.
