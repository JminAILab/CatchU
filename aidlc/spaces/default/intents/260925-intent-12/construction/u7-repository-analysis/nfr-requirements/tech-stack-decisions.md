# U7 저장소·분석 — 기술 선택
## 근거와 적용 범위

작성일: 2026-10-29. [사용자가 확인한 작성안](nfr-requirements-questions.md)을 상세화한다. 코드 구현·실측·실제 분석 완료 기록이 아니다.

직접 근거: [기능 명세](../functional-design/functional-spec.md)(functional-spec), [업무 규칙](../functional-design/rules.md)(rules), [재승인 요구사항](../../../inception/requirements-analysis/requirements.md)(requirements), [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary). 세부 NFR ID는 이 Unit 안에서 해당 상위 NFR을 구체화하며, 전체 대응은 [traceability.json](traceability.json)에 둔다.

기술 기준은 재승인 요구사항 C02·C07과 기존 10월 분석 경로다. 새 플랫폼을 비교·도입하는 단계가 아니라, 승인된 기능을 현재 구성에 연결할 경계를 정한다. 아래 버전은 기준 커밋 `5551cf8c43a468d71293932979c856e9a18132ab`의 선언값이며 최신 버전 권고가 아니다.

## 유지할 기술과 이유

| 영역 | 선택·근거 | 이유·관련 NFR |
|---|---|---|
| 화면 | Next.js 16.4.1, React 19.2.8, TypeScript. [web/package.json](../../../../../../../../web/package.json)과 잠금 파일 | 기존 RepositoryManagement 모달과 상태·동의 흐름을 재사용한다. NFR1.1·NFR2.3·NFR7.1~NFR7.2 |
| 회원 API·접수·반영 | NestJS 12.0.4, TypeORM 1.1.1, PostgreSQL. [api/package.json](../../../../../../../../api/package.json)과 잠금 파일 | 회원 소유자·동의·접수 트랜잭션, 기존 결과 수신/반영과 외래 키 삭제를 유지한다. NFR1.1·NFR4.5~NFR4.6·NFR5.1~NFR5.2 |
| 수집·생성 worker | Python 3.12.10, FastAPI 0.141.1. [worker/pyproject.toml](../../../../../../../../worker/pyproject.toml)과 uv.lock | 기존 수집·기여·후보·생성 알고리즘과 자식 프로세스 실행 경계를 사용한다. NFR2.2~NFR2.3·NFR4.1~NFR4.4 |
| 비동기 연결 | Redis/BullMQ, api bullmq 6.3.11, worker bullmq 3.3.0 | 기존 분석 메시지·진행 알림·결과 receipt를 이어 쓴다. NFR4.4·NFR4.6·NFR6.2 |
| 생성 제공자 | 기존 ClaudeProvider, anthropic 1.13.0, 생성과 제목 교정 모두 claude-haiku-5-5 | 기존 가리기·출력 검증·고정 호스트·재시도 0 설정을 유지한다. NFR2.2~NFR2.4 |
| 배포·검사 | 기존 AWS 배포 기반, 서비스별 기존 검사와 CI | 환경 신설을 U7 착수 조건으로 만들지 않는다. 실제 외부 AWS 확인은 별도 증거로 남긴다. NFR6.1~NFR6.3 |

제공자 선택의 직접 근거는 [생성 제공자](../../../../../../../../worker/docs/generation-provider.md), [기존 모델 결정·실측](../../../../../../../../worker/docs/generation-limits.md#모델)이다. 과거 비용·응답 시간은 당시 표본의 관측이며 새 실행의 보장이 아니다. 모델 자동 대체·SDK 자동 재시도를 추가하지 않는다. 의존성 업그레이드는 이 단계에서 수행하지 않는다.

## 연결과 변경 경계

| 연결 | U7의 책임 | 유지할 경계 |
|---|---|---|
| web → api | 모달 하단 직접 등록, 요청별 고지·동의, 상태·오류 안내 | 신규 화면·헤더 알림을 만들지 않음. 기존 회원 인증·오류 형식 유지 |
| api 등록 → 접수 → worker 컨텍스트 → 결과 반영 | 전역 선정 카탈로그 참조를 회원별 서버 확인 등록·불변 요청 범위로 연결 | 화면 입력만 바꾸지 않고 모든 조회·좌표 대조 지점을 맞춤. 내부 관측 필드는 송신·검증·저장을 같은 U7 변경에서 맞춤 |
| U2 C-03 → U7 접수 | DailyRunLimit.consume(memberId, ANALYSIS, now, manager)를 새 접수 트랜잭션에서 호출 | U2 인터페이스·공유 표를 임의 변경하지 않음. 독립 개발의 합성 제공자와 실제 통합 결과를 구분 |
| C-04 분석 동의 예외 | 기존 analysis_consent를 요청별로 유지 | 첫 이용 AiConsentGate로 대체하지 않음 |
| C-06 → U7 새 표 | 회원·요청 부모 관계와 연쇄 삭제, 필요한 동일 소유자 복합 외래 키 | U2 탈퇴 순서 변경을 가져오지 않음. 새 표·부모는 같은 PR의 삭제 표에 추가 |
| 생성·검색 | 기존 worker 생성과 사실·기여 검사 유지 | U2 AiGenerationGate/AiRun으로 분석 전체를 옮기지 않음. Voyage·발행 색인·JD는 다른 Unit 경계 |

## 선택의 대가와 한계

- 현재 실행 구조를 쓰므로 개수 상한만 올려서는 약 500개 반영을 보장할 수 없다. 상세·관계 호출·시간·생성 상한의 실측이 필요하다.
- worker 프로세스당 동시 분석 1을 유지하므로 여러 요청은 대기할 수 있다. 큐 대기와 접수 처리 시한을 함께 관측하고 완료 시간 보장은 새로 두지 않는다.
- 실제 제공자를 재사용해도 새 직접 등록 경로의 끝까지 연결은 아직 별도로 확인해야 한다. 10월 합성·로컬 결과가 새 경로의 완료 증거가 되지 않는다.
- 필요한 연결이 공유 계약의 이름·자료형·의미·오류를 바꾸는 경우에는 코드로 우회하지 않고 제공 Unit과 계약 수정 절차를 따른다.

## 구현과 검증 인계

신규 의존성 없이 현재 모듈 경계를 우선 사용한다. 구현 중 의존성 변경이 필요해지면 그 이유·정확한 버전·잠금 파일을 같은 U7 PR에 포함하고 기존 deps-audit 정책을 따른다. 이 문서는 그런 변경을 미리 했다고 기록하지 않는다.

구현 때 서비스 README의 현재 검사 명령과 공용 테스트 기준을 따르며, 이번 문서 단계에서 애플리케이션 시험을 실행한 것으로 보고하지 않는다. 변경한 등록·권한·동의·상태·상한 검증은 합성 자료로 먼저 확인하고, 실제 자료 검증은 [관측 요구사항](observability-requirements.md)의 준비 조건과 완료 기준을 따른다.

