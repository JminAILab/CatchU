# 회원 탈퇴의 DB 연쇄 삭제 — #387

[11월 범위 결정 「회원 탈퇴」](../../docs/CatchU_11월_범위_결정.md#회원-탈퇴)에 따라 회원 행(`member_account`) 하나를 지우면 그 회원의 자료가 DB에서 함께 지워진다. 이 작업은 표 관계만 바꾼다. 탈퇴 API·확인창·로그인·링크·MCP 접근 차단·DB 밖 GitHub 자격정보 파일 삭제는 11월 탈퇴 기능에서 만든다. 지금 api 코드에는 DB 행을 지우는 곳이 없어 기존 기능의 동작은 바뀌지 않는다.

## 삭제 규칙

회원에 딸린 자료와 그 자료에 딸린 행의 외래 키는 `ON DELETE CASCADE`다(엔티티는 [`deleteWithParent`](../src/database/foreign-keys.ts)). 마이그레이션은 기존 마이그레이션 묶음별 격리 시험에 맞춰 영역별 넷(`src/database/migrations/1792817978011`~`…014`: 회원·분석·공유 링크, E 수신 기록, 세션, B Catch)으로 나눴다. 외래 키 이름·지연 확인 설정은 그대로 두고 삭제 규칙만 바꿨다.

| 표 | 따라 지워지는 부모 |
| --- | --- |
| `member_profile`, `github_connection`, `auth_session`, `share_link`, `repository_protection` | 회원 |
| `session_refresh_token` | 세션 |
| `analysis_request` | 회원 |
| `analysis_consent` | 회원, 분석 요청 |
| `analysis_attempt` | 분석 요청 |
| `result_application_record` | 분석 시도 |
| `idempotency_record` | 회원, 분석 요청, 공유 링크 |
| `catch_asset` | 회원, 분석 요청 |
| `catch_evidence` | Catch |
| `candidate_registration` | 결과 수신 기록, Catch |
| `daily_execution_count`, `ai_consent` | 회원(12월 intent U2, 계약 C-03·C-04·C-06. 마이그레이션 `1793161114211-CreateU2UsageAndConsent`) |

공유 링크를 지우면 그 링크를 가리키는 중복 요청 방지 기록도 함께 지워진다. 전에는 이 기록이 링크 삭제를 막았다(#147). 어느 쪽이든 없는 링크를 가리키는 기록은 생기지 않는다.

연쇄 삭제가 아닌 외래 키는 넷뿐이다.

- 분석 요청의 순환 참조 3개(동의·현재 시도·재요청 원본): 같은 탈퇴에서 함께 지워지는 행끼리라 지금처럼 커밋 때 확인한다(`DEFERRABLE INITIALLY DEFERRED`, 지우기 거부).
- `repository_selection` → `allowed_scope_revision`: 모든 회원이 함께 쓰는 선정 목록이라 회원 자료가 아니다.

새 표를 만들 때 회원이나 회원 자료를 참조하는 외래 키는 연쇄 삭제로 둔다. 지우기 거부(NO ACTION)는 탈퇴를 막고, 참조 비우기(SET NULL)는 주인 없는 자료를 남긴다. DB 밖에 둔 파일은 연쇄 삭제로 지워지지 않으므로 탈퇴 기능에서 따로 지운다.

## 늦게 도착한 분석 결과

탈퇴 뒤 도착한 결과는 저장되지 않는다. 코드는 바꾸지 않았고 아래를 시험으로 확인했다.

- 탈퇴 뒤 결과가 오면 수신이 요청을 찾지 못해 `REJECTED`·`CONTEXT_MISMATCH` 수신 확인을 돌려준다. 큐 작업은 완료로 끝나고 worker는 거부된 결과를 다시 보내지 않는다([worker 수신 확인](../../worker/app/consumer/receipts.py)).
- 수신이 커밋된 뒤 Catch 반영 전에 탈퇴하면 반영이 요청을 찾지 못해 Catch를 만들지 않고, 수신 기록은 요청을 따라 이미 지워졌다. 큐 소비자는 받아 둔 수신 확인으로 작업을 완료로 끝내고 반영 실패만 로그에 남긴다.
- 탈퇴 뒤 진행 알림도 요청을 찾지 못해 `CONTEXT_MISMATCH`로 거부하고 저장하지 않는다.

한계: 반영 트랜잭션이 요청 행을 잡은 채 Catch를 넣는 순간과 탈퇴 삭제가 겹치면 PostgreSQL이 교착을 감지해 어느 한쪽을 실패시킬 수 있고, 어느 쪽일지는 정해져 있지 않다. 반영이 실패하고 탈퇴가 커밋되면 지운 회원의 자료는 남지 않는다(반영 실패 기록도 요청이 없어 `FAILURE_RECORDING_FAILED` 로그로 남을 수 있다). 탈퇴가 실패하면 회원과 자료가 그대로 남으므로 탈퇴 기능은 이를 성공으로 응답하지 않고 오류를 보여 준다. 11월 범위에서 경합 시험은 빼기로 했으므로 이 경우는 시험하지 않았다.

## 시험

[`test/db/member-cascade-delete.test.cjs`](../test/db/member-cascade-delete.test.cjs)가 실제 테스트 DB에서 확인한다.

- 지금 있는 회원 자료를 모두 가진 회원 둘 중 하나를 지우면, 그 회원의 행은 위 표 모두에서 0이 되고 다른 회원의 행과 선정 표는 그대로다.
- 위 늦은 결과·진행 알림 경우. 수신·반영 서비스와 DB는 실제로 쓰고, 큐·worker는 돌리지 않는다.
- DB의 외래 키 중 회원을 참조하는 것은 모두 연쇄 삭제이고, 연쇄 삭제가 아닌 것은 위 넷뿐이다. 새 표의 외래 키가 연쇄 삭제가 아니면 이 시험이 실패한다. 외래 키를 아예 빠뜨린 표는 잡지 못하므로 새 표의 부모 관계는 설계에서 확인한다.
