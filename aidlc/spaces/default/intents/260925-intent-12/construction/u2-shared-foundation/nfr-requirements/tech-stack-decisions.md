# U2 공용 기반 — 기술 선택

## Sources

작성일: 2026-10-27. 입력: [U2 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U2 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 C02·C07, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-01~C-06, 저장소의 api/src(10월 모듈), [비기능 질문·답변](nfr-requirements-questions.md).

## 원칙

새 라이브러리를 들이지 않는다. 10월 저장소의 기술을 그대로 쓴다(C02: Next.js·NestJS·FastAPI, AWS). 공유 인프라·CI 변경은 팀장 공용 기반 작업이며 U2 코드 PR에 넣지 않는다(C07).

## 선택

| 영역 | 선택 | 이유 | 버린 안 |
|---|---|---|---|
| api 모듈 | NestJS 모듈 `ai-run`, `daily-run-limit`, `ai-consent`, `file-storage`, `withdrawal`. 게이트는 U1의 `api/src/ai-generation`에 더한다 | 계약 C-01~C-06의 모듈 경로와 같다 | 공용 기반 하나의 큰 모듈: 계약 경계가 흐려진다 |
| DB | PostgreSQL, TypeORM 마이그레이션(기존 `npm run migration:generate`) | 10월과 같다. 새 표 둘 | 없음 |
| 하루 횟수 원자성 | `INSERT ... ON CONFLICT (member_id, usage_date) DO UPDATE SET count = count + 1 WHERE count < 30` 한 문장 | api 여러 개에서도 맞고 잠금이 짧다 | Redis 계수기: 탈퇴 연쇄 삭제·외래 키 규칙(C-06) 밖이 된다 |
| 한국 날짜 | UTC 시각에 9시간을 더한 날짜(서머타임 없음) | 날짜 라이브러리 없이 충분하다 | 시간대 라이브러리: 새 의존성 |
| 백그라운드 실행 | 기존 Redis + BullMQ, 큐 `ai-run` 하나, 동시 1, 시도 1, 완료·실패 2시간 보관, maxStalledCount 0 | 10월 큐 규칙과 같다(Q1·Q2) | 종류별 큐: 시연 규모에 불필요 |
| 파일 저장 | Node 파일 시스템(로컬), `FILE_STORAGE_DRIVER`·`FILE_STORAGE_LOCAL_ROOT` 환경변수 | U8 전에는 저장 파일이 없고, S3는 U8이 더한다(ADR-003) | U2가 S3까지: U8 범위를 당겨 온다 |
| AI 호출 | U1의 Claude 호출 경로(guarded fetch, Haiku 5.5) 그대로 | U1에서 확인됐다 | SDK 교체: 범위 밖 |
| 낱말 나누기 | 정규식으로 숫자·PR·파일 이름·영어 표기를 뽑는 코드(BR3.3), 약어 15개 고정 목록 | 사전 시험에서 쓴 방식, 의존성 없음 | 형태소 분석기: 새 의존성, 한국어에는 불필요 |
| web | Next.js 공용 컴포넌트: 동의 창, 한 줄 안내, 받은 사람 안내 묶음, 회원 홈 시작 안내, `not-found`·`error` 화면 | 10월 web 구조와 같다 | 없음 |
| 시험 | 기존 api 시험 실행기(`npm test`, 테스트 DB), 커버리지는 팀장이 넣은 서비스별 명령(`npm run test:coverage`) | team.md Testing Posture | 새 시험 도구: 금지 |

## 환경변수(이름만, 값은 SSM·로컬 .env)

| 이름 | 쓰는 곳 | 비고 |
|---|---|---|
| `FILE_STORAGE_DRIVER` | FileStorage | `local`(U2), `s3`(U8) |
| `FILE_STORAGE_LOCAL_ROOT` | FileStorage | 절대 경로 |

Claude·Voyage AI 키 이름은 U1·U3가 이미 정한 이름을 쓴다. 새 이름을 예시 파일에 더하는 일은 팀장 공용 기반 작업(C07)이다.
