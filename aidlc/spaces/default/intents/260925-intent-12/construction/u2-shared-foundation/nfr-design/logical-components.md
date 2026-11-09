# U2 공용 기반 — 논리 컴포넌트

## Sources

작성일: 2026-10-27. 입력: [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [보안](../nfr-requirements/security-requirements.md)(security-requirements)·[성능](../nfr-requirements/performance-requirements.md)(performance-requirements)·[확장성](../nfr-requirements/scalability-requirements.md)(scalability-requirements)·[신뢰성](../nfr-requirements/reliability-requirements.md)(reliability-requirements)·[관측](../nfr-requirements/observability-requirements.md)(observability-requirements) 요구사항, [U2 기능 명세](../functional-design/functional-spec.md)(functional-spec), [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) C-01~C-06.

## 컴포넌트

배포 단위는 기존 api·web 그대로다. 새 서비스·인프라는 없다.

| 컴포넌트 | 위치 | 공유 자원 | 실패 범위 | 비기능 패턴 |
|---|---|---|---|---|
| AiGenerationGate(U2 부분) | api `ai-generation` | Claude API | 그 호출 하나 | 입력 상한, 공통 지시, 기계 대조, 재시도 없음 |
| AiRun | api `ai-run` | Redis 큐 `ai-run` | 그 작업 하나(상태는 시한으로 FAILED) | 동시 1, 시도 1, 2시간 보관, 늦은 결과 버림 도우미 |
| DailyRunLimit | api `daily-run-limit` | PostgreSQL `daily_execution_count` | 그 접수 하나 | 조건부 쓰기 한 문장 |
| AiConsentGate | api `ai-consent` + web 동의 창·한 줄 안내 | PostgreSQL `ai_consent` | 그 접수 하나 | 동의 → 횟수 순서 |
| FileStorage(로컬) | api `file-storage` | api 서버 디스크 | 그 호출 하나 | 키 검사, 임시 이름 쓰기, 설정 없으면 쓰는 순간 실패 |
| Withdrawal | api `withdrawal` + web 탈퇴 확인창 | PostgreSQL(세션·발행본·MCP·회원), FileStorage, GitHub 자격정보 파일 | 그 회원 하나 | 1단계 트랜잭션 후 단계별 실행, 대상 없음은 성공 |
| StartGuide | web 회원 홈·받은 사람 안내 묶음·`not-found`·`error` | 없음 | 화면 하나 | 정적 안내 |

## 공유 자원과 영향

| 자원 | 쓰는 U2 컴포넌트 | 다른 Unit | 장애 때 |
|---|---|---|---|
| PostgreSQL | DailyRunLimit, AiConsentGate, Withdrawal | 모두 | 접수·탈퇴 500, 상태는 그대로 |
| Redis | AiRun | U5 질문 횟수, U6 빈도, 10월 분석 큐 | 등록 실패 → 시한으로 FAILED |
| Claude API | Gate | U5·U10 | 그 실행 FAILED |
| 서버 디스크 | FileStorage | U8(PDF, S3로 바뀜) | 탈퇴 2단계 실패 |

## 경계

- U2 탈퇴는 U4 `publication.stopped_at`, U6 `mcp_*` 표를 계약 이름으로 직접 갱신한다(functional-spec 가정 4).
- 게이트 코드(`ai-generation`)는 U1과 같은 모듈이며 U2가 JD_SUMMARY 경로를 더한다.
