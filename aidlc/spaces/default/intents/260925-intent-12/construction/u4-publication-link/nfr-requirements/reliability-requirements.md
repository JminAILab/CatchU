# U4 발행·링크 — 신뢰성 요구사항

## Sources

작성일: 2026-10-29. 입력: [U4 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U4 업무 규칙](../functional-design/rules.md)(rules)의 BR2.3·BR5.1·BR5.2·BR5.5·BR8.2·BR8.4~BR8.6, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4·NFR5·NFR6, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) 「공통 전제」의 에러 대응 최소선·C-02·C-05·C-06·C-08, [비기능 질문·답변](nfr-requirements-questions.md) Q2(설명 정정 포함).

## 범위

NFR4는 가동률·복구 수치를 새로 만들지 않는다. U4의 신뢰성 요구사항은 수치가 아니라 실패했을 때 남는 것과 응답의 정직함이다. 기능 사이 실패 시험은 보호 흐름 3개만 둔다(NFR6).

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR5.1 | 발행은 하나의 트랜잭션이다(하루 횟수 1회 → 원본 잠금·재확인 → 발행본·항목 쓰기 → PRIVATE Catch 공개 전환 → `chunkInTransaction`). 어느 단계든 실패하면 전체 롤백해 발행본·항목·공개 전환·하루 횟수가 남지 않는다. 4xx는 해당 코드, 그 밖은 500 `INTERNAL_ERROR` | S5·S6(LIMIT_REACHED, `chunkInTransaction` 예외) | BR5.1, BR5.2, C-08, 에러 대응 최소선 5 |
| NFR5.2 | 커밋 뒤 작업 등록(`EMBED_PUBLICATION`·`BASE_SUMMARY`)이 실패해도 발행은 성공(201)이다. 실패는 로그로만 남기고(observability NFR6.2) 다시 등록하지 않는다. 그 발행본의 색인·요약은 처리 시한으로 실패가 확정되고, 하루 횟수 1회는 돌려주지 않는다 | S7 | BR5.5, C-02, 에러 대응 최소선 2·3 |
| NFR5.3 | 발행본 삭제는 파일 저장소 접두어를 먼저 지운다(`FileStorage.deletePrefix`, 접두어가 없으면 성공). 접두어 삭제가 실패하면 **500 `INTERNAL_ERROR`를 돌려주고 DB 행을 지우지 않는다**. 로그만 남기고 성공으로 처리하지 않는다. 화면은 "삭제되지 않았습니다"와 다시 시도를 보인다 | S11(성공 204·연쇄 삭제, 실패 500·DB 유지) | BR8.4, C-05, Q2 설명 정정 |
| NFR5.4 | 접두어 삭제가 성공하면 `publication` 행을 지워 항목·PDF 쪽(U8)·색인·조각(U3)·요약(U5)·JD 요약(U10)을 외래 키 연쇄로 함께 지운다. 원본 자료와 다른 발행본은 건드리지 않는다 | S11, 회원 연쇄 삭제 시험(C-06) | BR8.4, NFR5, C-06 |
| NFR5.5 | 삭제 뒤 늦게 도착한 AI·색인 결과는 부모 행이 없어 외래 키가 거부한다. U4는 행을 실제로 지우는 것까지 하고, 거부된 결과를 버리는 것은 각 처리기(U3·U5·U10) 몫이다 | 해당 Unit 시험 | BR8.5, C-02 late-result, FR14.10 |
| NFR5.6 | 발행본은 자동 파기하지 않는다. 만료는 접근만 막고 행을 지우지 않는다. 지우는 것은 작성자 삭제와 탈퇴(U2)뿐이다 | 만료 발행본이 작성자 목록에 남는지 확인(S9) | BR8.6, NFR5 |
| NFR5.7 | 링크 중지는 되돌릴 수 없고, 반복 중지는 처음 시각을 유지하며, 만료된 링크에는 쓰지 않는다(200 `{EXPIRED, null}`) | S13 | BR8.2 |
| NFR6.1 | 작성자 화면은 응답이 성공한 뒤에만 "저장됨"·"발행됨"·"삭제됨"을 보인다. 저장 실패 때 입력을 지우지 않는다 | S1·S11 화면 확인 | BR2.3, BR5.2, team.md Code Style |
| NFR6.4 | 기능 사이 실패 시험은 보호 흐름 3개(FR19.1)의 U4 부분만 둔다: 회원 자료 격리(S3·S12), 링크 중지 뒤 웹 차단(S9), 탈퇴 뒤 차단(U2 연쇄 삭제가 새 표를 확인, C-06 check). 동시 요청·재전송·늦은 결과의 세부 시험은 두지 않는다 | FR19.2 확인 표 | NFR6, FR19.1 |

## 하지 않는 것

- 가동률·RTO·RPO·백업 주기를 두지 않는다(NFR4). DB 백업은 공용 기반 몫이다.
- 작업 등록 실패의 자동 재등록, 접두어 삭제의 자동 재시도는 하지 않는다(에러 대응 최소선 2). 다시 시도는 사람이 한다.

## Assumptions & Open Questions

- U2 실제 `FileStorage`·`AiRun` 연결 전에는 시험 쪽 가짜로 NFR5.2·NFR5.3을 시험한다. 그 결과를 실제 연결 성공으로 보고하지 않는다(team.md Walking Skeleton). U2 제공 시점은 OQ-U4-6이다.
- `share_link`·`idempotency_record` 정리(OQ-U4-3)는 미결이다. 새 흐름은 그 표를 쓰지 않는다.
