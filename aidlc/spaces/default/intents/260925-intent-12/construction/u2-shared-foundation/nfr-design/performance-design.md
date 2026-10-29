# U2 공용 기반 — 성능 설계

## Sources

작성일: 2026-10-27. 입력: [성능 요구사항](../nfr-requirements/performance-requirements.md)(performance-requirements) NFR4.1~4.6과 받아들인 지적 R-05, [기술 선택](../nfr-requirements/tech-stack-decisions.md)(tech-stack-decisions), [U2 기능 명세](../functional-design/functional-spec.md)(functional-spec), [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) C-01~C-03, [비기능 설계 질문·답변](nfr-design-questions.md) 요약 확인.

## 설계

| 요구사항 | 설계 |
|---|---|
| NFR4.1 새 수치 없음 | 성능 예산·캐시·연결 풀 조정을 새로 두지 않는다. 10월 TypeORM·Redis 연결 설정을 그대로 쓴다 |
| NFR4.2 입력 상한 | 게이트 입구에서 `sources[].text`와 `userText`의 문자열 길이를 더해 상수 `AI_INPUT_MAX_CHARS = 80000`과 비교한다. 넘으면 Claude를 부르지 않고 `AiInputTooLarge`. 값은 상수 하나이며, JD 요약 "전체 넣기"(NFR3)에서 걸리면 팀장이 값을 조정하고 그 사실을 통합 확인 표 메모에 남긴다(검토 R-05) |
| NFR4.3 하루 횟수 한 문장 | `INSERT … ON CONFLICT (member_id, usage_date) DO UPDATE SET count = count + 1 WHERE daily_execution_count.count < 30 RETURNING count` 한 문장. 행이 돌아오면 ALLOWED, 없으면 LIMIT_REACHED. 별도 SELECT·잠금 없음 |
| NFR4.4 동시 1 | AiRun BullMQ Worker의 `concurrency: 1` |
| NFR4.5 스트림 | generateStream은 Claude 스트림을 줄 단위로 모아 "- " 줄이 끝날 때마다 항목을 만들어 대조하고 내보낸다. 응답 전체를 모으지 않는다 |
| NFR4.6 잠금 대기 | 코드에서 `lock_timeout`을 걸지 않는다. 앱 계정 설정(3초)을 따른다. 탈퇴 1단계 트랜잭션은 세션·발행본·MCP 행만 건드려 짧게 둔다 |

## 쓰지 않는 것

캐시, CDN, 연결 풀 크기 조정, 페이지 나누기(U2에는 목록 API가 없다).
