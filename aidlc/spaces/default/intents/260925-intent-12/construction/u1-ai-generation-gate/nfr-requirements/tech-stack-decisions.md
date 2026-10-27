# U1 AI 생성 관문 최소 경로 — 기술 선택

## Sources

작성일: 2026-10-27. 입력: [U1 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U1 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 C02·C07·FR6.9, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-01(`api/src/ai-generation`), [보안 점검](../../../../../../../docs/CatchU_security_checks.md) 「의존성 추가·갱신」, [비기능 질문·답변](nfr-requirements-questions.md).

## 선택

| 영역 | 선택 | 이유 |
|---|---|---|
| 위치 | api(NestJS, TypeScript)의 AI 생성 공통 모듈. C-01이 정한 자리(`api/src/ai-generation`) | ADR-002, C-01. 새 배포 단위를 만들지 않는다(Unit 정의 공통 전제) |
| 제공자 | Claude API 공식 TypeScript SDK. 모델 Haiku 5.5(요청이 SONNET이면 Sonnet 5.5), 생각 출력 끔, 처리 위치 미국, 재시도 0 | FR6.9, C02, 사전 시험과 같은 호출 모양, 10월 worker와 같은 처리 위치(#119) |
| 인용 | 인용을 켠 문서. 내용은 줄마다 블록 하나(사용자 정의 내용 문서). 구조화된 출력은 쓰지 않는다 | FR6.4, 기능 설계 BR1·BR2, 인용과 구조화된 출력은 함께 쓸 수 없다(사전 시험 ④) |
| 전송 | SDK에 API 주소를 코드로 넘기고, redirect를 따라가지 않으며 압축을 푼 뒤 기준으로 본문 크기를 세는 fetch를 넘긴다. 시간 제한 45초 | 보안 요구사항 NFR2.2, 성능 요구사항 NFR4.1 |
| 키 | 환경변수 `CATCHU_GENERATION_API_KEY` | #389, 보안 요구사항 NFR1.1 |
| 시험 | api의 기존 시험 묶음. 기록한 응답 시험은 늘 돌고, 실제 호출 시험(S8)은 키가 있을 때만 돈다. 커버리지 측정은 팀장이 넣은 서비스별 명령을 쓴다 | 기능 설계 Q5, team.md Testing Posture |
| 의존성 | SDK는 정확한 버전으로 넣고 잠금 파일을 함께 바꾼다. 알려진 취약점은 CI `deps-audit`가 본다 | 보안 점검 「의존성 추가·갱신」 |

## 채택하지 않은 것

- SDK 없이 HTTP를 직접 부르기: 인용 응답 해석과 오류 분류를 직접 만들어야 해 공수가 크다.
- 10월 worker(Python) 전송 계층 이식: 비기능 질문 Q1에서 최소 네 가지(주소 고정·redirect·크기·시간)만 지키기로 했다.
- worker에 AI 생성 공통을 두기: ADR-002에서 채택하지 않았다.

## Assumptions & Open Questions

- SDK가 fetch를 바꿔 끼우는 설정과 주소 설정을 지원한다고 본다. 코드 생성 단계에서 고른 판본으로 확인하고, 지원하지 않으면 멈추고 묻는다.
