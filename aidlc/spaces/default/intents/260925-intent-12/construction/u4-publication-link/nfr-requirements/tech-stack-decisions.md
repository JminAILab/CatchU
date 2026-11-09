# U4 발행·링크 — 기술 선택

## Sources

작성일: 2026-10-29. 입력: [U4 기능 명세](../functional-design/functional-spec.md)(functional-spec) 「범위」·「의존 처리」, [U4 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 C02·C07, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-10(`api/src/publications`)·C-11(`web/src/app/s/[token]`, `recipient-grants`), [보안 점검](../../../../../../../docs/CatchU_security_checks.md) 「의존성 추가·갱신」, 현재 `api/package.json`·`web/package.json`, team.md Testing Posture.

## 선택

새 언어·프레임워크·라이브러리를 들이지 않는다. 10월 구현을 이어 쓴다.

| 영역 | 선택 | 이유 |
|---|---|---|
| api | 기존 NestJS·TypeORM·PostgreSQL. 발행본 모듈은 C-10이 정한 `api/src/publications`. 10월 `share-links`·`recipient` 모듈을 발행본 흐름으로 바꾼다 | C02, C-10, BR9.1. 새 배포 단위를 만들지 않는다 |
| web | 기존 Next.js·React. 받은 사람 화면은 `web/src/app/s/[token]`, grant 보관은 10월 `sessionStorage`·`recipient-grants` 도구 | C-11 |
| 링크 값 | Node `crypto` 난수(토큰 256비트), 10월 scrypt 검증값·grant 서명 | BR5.4, BR6.2, security NFR1.5·NFR1.6 |
| 빈도 제한 | 10월 `issue-rate-limit`·요청 빈도 제한기(프로세스 메모리, api 하나 전제) | BR4.8, performance NFR4.4, scalability NFR4.13 |
| 링크 만들기(Q1) | 정규식·URL 해석으로 `https://github.com/`만 고르는 작은 함수를 web에 직접 둔다. 자동 링크 라이브러리를 들이지 않는다 | security NFR1.11. 허용 범위가 한 호스트라 라이브러리가 필요 없다 |
| U2·U3 경계 | U2(`AiRun`·`DailyRunLimit`·`AiConsentGate`·`FileStorage`)·U3(`PublishedIndexWriter`) 인터페이스를 받아 쓴다. U4 운영 코드에 임시 구현을 두지 않고 시험 쪽 가짜만 쓴다 | 기능 명세 「의존 처리」 Q2 A |
| 시험 | api `npm test`(node:test, 테스트 DB), web `npm test`(node:test). 커버리지는 팀장이 넣은 서비스별 `test:coverage` 명령을 쓴다 | team.md Testing Posture |
| 의존성 | 더하지 않는다. 더할 일이 생기면 정확한 버전과 잠금 파일을 함께 바꾸고 CI `deps-audit`를 따른다 | 보안 점검 「의존성 추가·갱신」 |

## 채택하지 않은 것

- 응답 캐시(받은 사람 판정·사본): 판정은 매번 해야 한다(BR6.1). 시연 규모라 필요 없다(NFR4).
- 자동 링크·마크다운 라이브러리: HTML을 만드는 렌더링을 쓰지 않는다(보안 점검 「화면 출력」).
- 로그 수집·지표 도구 추가: 관제 화면을 만들지 않는다(NFR6).

## Assumptions & Open Questions

- U2·U3 실제 구현 제공 시점은 OQ-U4-6이다. U2는 #423 병합 뒤 실제 구현 연결이 가능하고(일정 별도 확인), U3 C-08 조각 나누기·C-09 색인 상태의 제공 시점은 미정이다.
- C-09 `getIndexState` 소비자에 U4를 더하는 것은 U3 담당과 합의 전이다(OQ-U4-5).
