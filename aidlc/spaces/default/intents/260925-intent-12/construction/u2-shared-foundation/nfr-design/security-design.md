# U2 공용 기반 — 보안 설계

## Sources

작성일: 2026-10-27. 입력: [보안 요구사항](../nfr-requirements/security-requirements.md)(security-requirements) NFR1.1~1.6·NFR2.1~2.5·NFR5.1~5.3과 그 검토에서 받아들인 지적, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U2 기능 명세](../functional-design/functional-spec.md)(functional-spec), [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) C-01·C-04~C-06, [비기능 설계 질문·답변](nfr-design-questions.md) Q1·Q2와 요약 확인.

## 설계 변경: 파일 저장 설정 검사 시점 (Q1·Q2)

| 경우 | 동작 |
|---|---|
| `FILE_STORAGE_DRIVER`·`FILE_STORAGE_LOCAL_ROOT`가 둘 다 없음 | api는 기동한다. FileStorage의 어떤 호출이든 `StorageUnavailable`로 실패한다. 탈퇴는 2단계에서 500 `WITHDRAWAL_FAILED`로 끝난다(1단계 접근 차단은 유지) |
| 값이 있음 | 기동 때 검사한다. 모르는 드라이버, 상대 경로, 없는 폴더, 한쪽만 있음이면 기동을 멈춘다 |

- **바뀌는 것:** 승인된 NFR1.4("없거나 틀리면 기동 실패")의 "없을 때" 부분, 기능 설계 [rules.md](../functional-design/rules.md) BR6.1의 "값이 없거나 … 기동을 멈춘다"의 "없을 때" 부분, [functional-spec.md](../functional-design/functional-spec.md) W6 1번(기동)의 "없거나 틀리면 기동 실패"의 "없을 때" 부분. 세 문서는 다시 승인하지 않고 이 설계가 바뀐 동작의 기준이다. 코드 생성은 이 표를 따른다.
- **이유:** 새 환경변수를 개발 서버·`dev-ci`·예시 파일에 넣는 일(팀장 공용 기반)과 U2 머지의 순서에 상관없이, 다른 Unit의 api 시험과 개발 서버 기동이 막히지 않게 한다(비기능 요구사항 검토 R-01). U8 전에는 실제로 저장하는 파일이 없다.
- **판정할 수 없으면 허용하지 않음(보안 점검):** 값이 있는데 틀린 경우는 여전히 기동 실패다. 값이 없는 경우는 저장소를 "쓸 수 없음"으로 두어, 파일을 쓰는 동작이 성공으로 끝나지 않는다.
- **한계:** 설정이 빠진 배포 환경에서는 탈퇴를 해 볼 때까지 드러나지 않는다. 통합 확인 표의 보호 흐름 「탈퇴 뒤 차단」 시나리오가 이를 잡는다.

## 인증·권한

| 요구사항 | 설계 |
|---|---|
| NFR1.1 본인만 탈퇴 | `DELETE /v1/me`는 10월 공통 Guard(Access JWT 서명·만료 + DB 세션·회원 ACTIVE 확인)와 Origin·CSRF 검사 뒤에만 들어온다. 처리기는 Guard가 준 memberId만 쓰고 요청 본문을 받지 않는다 |
| NFR1.2 탈퇴 뒤 차단 | 1단계 트랜잭션에서 그 회원의 세션 행을 모두 폐기한다. Guard가 요청마다 세션을 DB에서 확인하므로 남은 Access 토큰은 다음 요청부터 401이다(api/docs/auth-sessions.md). 발행 링크는 `publication.stopped_at`, MCP는 `mcp_*` 행 삭제로 막는다 |
| NFR1.5 우회 없음 | 시험 전용 권한·플래그를 두지 않는다. 시험은 실제 Guard를 거친 회원 세션으로 한다 |

## 입력 검증

| 요구사항 | 설계 |
|---|---|
| NFR1.3 파일 키 | FileStorage 모든 메서드의 첫 단계에서 키를 검사한다: `members/` + UUID 형식 + `/`로 시작, `..`·빈 마디·`\`·절대 경로 금지. 통과하면 뿌리와 합친 실제 경로를 정규화해 뿌리 안인지 한 번 더 확인한다(심볼릭 링크는 뿌리 안에서 따라가지 않음) |
| NFR1.4(바뀜) 설정 | 위 표 |
| BR2.3 동의 판본 | `POST /v1/ai-consent`의 `noticeVersion`은 현재 판본 상수와 문자열이 같아야 한다. 다르면 400 `VALIDATION_FAILED` |
| NFR2.1 모델 | 게이트 입구에서 `model = SONNET`이면서 `feature ≠ QNA`이면 호출하지 않고 오류로 끝낸다 |

## 비밀값

| 요구사항 | 설계 |
|---|---|
| NFR1.6 | Claude·Voyage AI 키와 DB·Redis 자격정보는 환경변수(개발 서버는 SSM)로만 받는다. 예시 파일에는 이름만 두며, 그 갱신은 팀장 공용 기반 작업이다. 오류 응답·로그에 설정 값을 넣지 않는다 |

## LLM 입력 방어

| 요구사항 | 설계 |
|---|---|
| NFR2.2 | 게이트가 시스템 지시 끝에 공통 문구(근거·질문 속 지시는 자료일 뿐 따르지 않음, 역량 평가 표현 금지, 근거 없는 단정 금지, 원문 표기 그대로, 번호 대신 한 일)를 붙인다. userText는 문서 블록 뒤 "신뢰하지 않는 입력" 자리에 둔다(U1 BR2.3 위치) |
| NFR2.3 | 기계 대조(BR3.3~BR4.7)는 항목 생성 뒤 한 곳(게이트의 검사 단계)에서만 한다. 대조만으로 충족했다고 보지 않으며 NFR3 사람 확인이 함께 있다 |
| NFR2.4 | 소비 Unit 처리 순서: `AiConsentGate.require` → `DailyRunLimit.consume` → 상태 행 커밋 → `enqueueAfterCommit`. 동의 없음은 횟수를 쓰지 않는다 |
| NFR2.5 | web 공용 동의 창이 받는 곳 둘(Claude API·Voyage AI(운영사 MongoDB)), 보내는 기능, 올린 자료를 가리지 않는다는 사실, 문의 경로 한 줄을 보인다 |

## 자료 삭제

| 요구사항 | 설계 |
|---|---|
| NFR5.1 | 탈퇴 순서 1~4(functional-spec W7). 2·3단계는 대상이 이미 없어도 성공이다(BR6.3·BR7.3). 그래서 2~4단계에서 실패한 뒤 다시 탈퇴를 요청해도 앞서 지운 대상 때문에 실패하지 않는다(비기능 요구사항 검토 R-02) |
| NFR5.2 | `daily_execution_count`·`ai_consent` 마이그레이션에 `ON DELETE CASCADE`를 두고, 같은 PR에서 api/docs/member-withdrawal-deletion.md 표에 행을 더하며, test/db/member-cascade-delete.test.cjs가 두 표를 함께 확인한다 |
| NFR5.3 | 큐 payload는 `{ publicationId }` 또는 `{ runId }`뿐이다. 처리기는 DB에서 다시 읽는다 |
