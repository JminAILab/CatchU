# U4 발행·링크 — 관측 설계

## Sources

작성일: 2026-10-29. 입력: [U4 비기능 요구사항](../nfr-requirements/)(performance-requirements·security-requirements·scalability-requirements·reliability-requirements·observability-requirements·tech-stack-decisions) 가운데 특히 [관측 요구사항](../nfr-requirements/observability-requirements.md)(observability-requirements) NFR6.2·NFR6.3·NFR6.5~NFR6.8, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U4 기능 명세](../functional-design/functional-spec.md)(functional-spec) 「주요 시나리오와 확인」, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) 「에러 대응 최소선」 1, [비기능 설계 질문·답변](nfr-design-questions.md), 10월 api 문서 `api/docs/security-events.md`.

## 설계

지표·대시보드·알림·SLI/SLO·분산 추적은 두지 않는다(NFR6). 관측은 api 서버 로그와 FR19.2 확인 표뿐이다.

### 로그 줄

- 10월 api 방식대로 Nest `Logger`(이름 `Publications`)로 한 줄씩 남긴다. 칸은 정해진 것만 쓴다.
- 필수 칸: 발행본 ID, 회원 ID, 오류 코드(BR10.2). 여기에 결과 분류 칸 하나를 더한다(NFR6.2).

| 사건 | 결과 분류(값 표기는 **임시**, NFR6.3) | 함께 남기는 칸 |
|---|---|---|
| 발행 성공 | 발행 성공 | 발행본 ID, 회원 ID |
| 발행 실패 | 발행 실패 | 회원 ID, 오류 코드(발행본 ID는 롤백돼 없음) |
| 커밋 뒤 작업 등록 | `ENQUEUED` / `ENQUEUE_FAILED` | 발행본 ID, 작업 종류(`EMBED_PUBLICATION`·`BASE_SUMMARY`) |
| 발행본 삭제의 접두어 삭제 실패 | 접두어 삭제 실패 | 발행본 ID, 회원 ID, 오류 코드 `INTERNAL_ERROR` |

- 칸 이름과 값 표기는 코드 생성 때 정하며 위 항목 범위는 바꾸지 않는다(NFR6.3).
- 작업 등록 실패는 로그만 남고 응답은 201이다. 접두어 삭제 실패는 로그와 함께 500 응답이다. 두 분류를 같은 값으로 묶지 않는다(NFR6.5).
- 항목 수·처리 시간·받은 사람 열람 판정 결과는 남기지 않는다(Q2 A).

### 남기지 않는 것

토큰·grant·비밀번호·자료 본문·SQL·stack은 어떤 로그 줄에도 넣지 않는다. 시험에서 합성 비밀값을 넣고 로그에 없는지 확인한다(NFR6.6).

### 보안 기록

비밀번호 실패(401)·unlock 제한(429)·회원 인증 실패는 10월 `security-events`가 오류 코드 기준으로 남긴다. U4는 새 기록 종류를 더하지 않는다(NFR6.7).

### 확인 표

S1~S15와 최소 연결 첫 결과를 FR19.2 확인 표에 날짜·대상 버전·결과(실패·미실행 포함)로 적는다. 가짜 연결 결과는 '합성 연결을 포함한 사전 확인'으로, S15는 C-09 합의 전까지 미실행으로 적는다(NFR6.8).
