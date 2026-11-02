# U6 Claude MCP 본인 연결 — 기술 선택

## Sources

작성일: 2026-10-31. 입력: [U6 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U6 업무 규칙](../functional-design/rules.md)(rules), [U6 엔티티](../functional-design/entities.md)(entities), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 FR13.1·NFR4, [컴포넌트 목록](../../../inception/domain-design/components.md)(components)의 ClaudeMcp, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-06·C-15, [결정 기록](../../../inception/domain-design/decisions.md)의 ADR-009, [보안 점검](../../../../../../../../docs/CatchU_security_checks.md) 「의존성 추가·갱신」, team.md Testing Posture, [비기능 질문·답변](nfr-requirements-questions.md) Q1·Q4와 요약 확인. 외부 근거: [TypeScript SDK README](https://github.com/modelcontextprotocol/typescript-sdk), npm의 `@modelcontextprotocol/sdk` 1.32.2와 그 안의 `server/webStandardStreamableHttp`·`server/requestBody`·`types`, `api/package.json`·`api/package-lock.json`·`api/tsconfig.json`, `api/node_modules/body-parser/lib/utils.js`, `.github/workflows/ci.yml`.

## 선택

| 영역 | 선택 | 이유 |
|---|---|---|
| 위치 | api(NestJS, TypeScript)에 ClaudeMcp 모듈을 새로 둔다. web은 `/profile/claude`와 `/profile/claude/authorize`다. 새 배포 단위는 없다 | components ClaudeMcp, 기능 설계 BR1.1·BR7.5 |
| MCP SDK | `@modelcontextprotocol/sdk` 1.32.2 정확한 판본 | Q4. 인증 도구와 Streamable HTTP가 패키지 하나에 있고, 기능 설계 때 코드를 읽어 확인했으며, 지금 api 설정(CommonJS, `moduleResolution: Node`)에 맞는 CommonJS 빌드와 타입 경로가 있다 |
| 입력 스키마 | `zod` 4.6.7 정확한 판본, 직접 의존성 | SDK의 필수 짝 의존성이다(Q4). 지금 api에 없어 새로 더한다 |
| MCP 판 | 2025-11-25까지 | SDK 1.32.2가 구현하는 판이다. Claude 인증 문서도 이 판을 인용한다 |
| 전송 | 세션 없는 Streamable HTTP. 요청마다 새 서버·전송 객체를 만들고 SSE 없이 JSON으로 답한다(`sessionIdGenerator: undefined`, `enableJsonResponse: true`) | 기능 설계 BR5.6, 요약 확인. 빈도는 도구 처리 자리에서 세어 한 요청에 묶어 보낸 호출도 하나씩 센다 |
| OAuth | SDK의 `mcpAuthRouter`와 U6의 저장 단계. 해지 처리를 구현하지 않아 `/revoke`가 생기지 않는다. 기존 끝처리 앞에 올린다(`api/src/app.setup.ts`) | ADR-009, 기능 설계 BR1.1 |
| `Origin` 확인 | SDK 옵션 대신 작은 자체 확인 | Q1. `enableDnsRebindingProtection`·`allowedOrigins`는 1.32.2에서 `@deprecated`다 |
| 저장 | PostgreSQL, 새 표 넷. 기존 TypeORM 마이그레이션 방식으로 U6 PR에 넣는다 | entities, C-06, C-15 |
| 빈도 집계 | 기존 `ioredis` 6.0.0, 기존 `readAnalysisQueueConfig()`. 새 환경변수 없이 U6의 연결을 따로 연다 | 기능 설계 BR6.2·BR6.3 |
| 난수·해시 | `node:crypto`. 새 라이브러리 없음 | 보안 점검 「인증·비밀번호·토큰」, 기능 설계 BR4.1·BR4.2 |
| 로그 | Nest `Logger`의 객체 형식과 기존 `errorName` | observability-requirements |
| 요청 본문 상한 | 새로 두지 않는다. Nest 파서로 읽으면 100KB(`body-parser` 기본값)이고, SDK 전송 객체가 직접 읽으면 4MiB·묶음 100개(`DEFAULT_MAX_REQUEST_BODY_SIZE`·`MAX_BATCH_SIZE`)다. 어느 쪽을 거치는지는 NFR Design에서 정한다 | 보안 점검 「LLM·검색 기능」(입력 크기 상한), 도구 입력은 `cursor`뿐이다 |
| 시험 | api `npm test`·`npm run test:coverage`(시험용 DB), web `npm test`·`npm run test:coverage`. Redis 시험은 `CATCHU_TEST_REDIS_URL`이 있을 때 돌고(CI는 Valkey 8.1.6), 없으면 통과가 아니라 미실행으로 적는다. 측정 도구를 따로 들이거나 CI를 고치지 않는다 | team.md Testing Posture, 요약 확인 |
| 의존성 확인 | 정확한 판본과 잠금 파일을 함께 바꾸고 CI `deps-audit`로 확인한다. 2026-10-31에 잠금 파일만 시험 삼아 만든 npm audit에서 SDK 쪽 취약점은 없었다. api의 express 5.2.1이 SDK의 `^5.2.1`을 만족하므로 잠금 파일에 express가 한 벌인지 코드 때 확인한다 | 보안 점검 「의존성 추가·갱신」 |

## 채택하지 않은 것

- SDK v2 패키지 셋(`server`·`server-legacy`·`express`): 지원이 더 길고 MCP 2026-07-28을 구현하지만, 패키지가 셋이 되고 기능 설계에서 읽은 동작을 다시 확인해야 하며 타입 파일이 `.d.mts`라 지금 설정에서 되는지 확인하지 않았다. 더 막는 것은 v1 지원이 끝난 뒤의 위험인데 12/10 제출 뒤의 일이다(Q4).
- SDK의 DNS 보호 옵션: `@deprecated`다(Q1).
- CIMD: 공식 문서가 등록이 많을 때 권하지만 ADR-009의 클라이언트 등록 표와 다르다(기능 설계 「Assumptions & Open Questions」).
- 외부 인증 서비스, 서명 토큰, 갱신 토큰, SSE: ADR-009와 기능 설계 BR4.2·BR4.5·BR5.6이 정했다.

## Assumptions & Open Questions

- 기능 설계의 「판본은 코드 생성 계획에서 정한다」를 이 단계에서 앞당겨 정했다(Q4). 다음 단계가 SDK 모양을 전제로 하기 때문이다.
- SDK README에 따르면 v1.x는 v2 출시(2026-07-27) 뒤 최소 6개월 동안 버그·보안 수정을 받는다. 12/10 제출은 그 안에 든다.
- 쓰지 않는 `hono` 등이 SDK 의존성으로 함께 들어온다. 받아들인다(Q4).
- 미결(S22): Claude 요청에 `Origin`이 있는지. 있으면 그 값을 허용 목록에 더한다(security-requirements NFR1.6).
- 미결(U4 납품 때): 텍스트 자료 본문·제목의 길이 상한. `api/src/materials/text-material.entity.ts`가 U4 API 검증에 맡겼고 아직 없다(performance-requirements NFR4.2).
- SDK 라우터·토큰 확인을 어떻게 붙일지(`requireBearerAuth`인지 자체 확인인지, Nest 처리기 안인지 밖인지)는 NFR Design에서 정한다.
