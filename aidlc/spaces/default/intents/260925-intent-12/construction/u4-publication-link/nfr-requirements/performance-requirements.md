# U4 발행·링크 — 성능 요구사항

## Sources

작성일: 2026-10-29. 입력: [U4 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U4 업무 규칙](../functional-design/rules.md)(rules)의 BR3.2·BR4.1·BR4.5·BR4.8·BR5.1·BR5.4·BR6.1, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR4·C06, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) 「공통 전제」의 제한 값·C-10, [비기능 질문·답변](nfr-requirements-questions.md) 「이미 정해진 것」, 10월 api 문서 `api/docs/lock-wait-limit.md`.

## 범위

NFR4는 처리 시간·가동률·복구 수치를 새로 만들지 않는다고 정했다. U4의 성능 요구사항은 응답 목표가 아니라 입력·요청의 상한과 잠금 대기 상한이다. 값마다 **확정**(기능 설계 승인·10월 결정)과 **임시**(회의 후 조정)를 구분한다.

## 요구사항

| ID | 요구사항 | 지위 | 확인 | 근거 |
|---|---|---|---|---|
| NFR4.1 | 응답 시간 목표(p95 등)·처리량 목표·가동률 수치를 두지 않는다. 시연 규모에서 발행·열람이 동작하는지를 FR19의 통합 확인으로 본다 | 확정 | 통합 확인 표(FR19.2) | NFR4, NFR6 |
| NFR4.2 | 입력 상한: Catch 설명 0~4,000자, 텍스트 자료 제목 1~100자·본문 1~20,000자, 발행본 제목 1~50자, 비밀번호 8~64자, 발행 항목 1~20개. 길이는 코드 포인트로 센다. 넘으면 400 `VALIDATION_FAILED` | 확정(기능 설계 Q5의 U4 초기 설계값, 비밀번호는 10월) | S1·S3 경계값 시험(상한 딱 맞음·하나 넘음) | BR1.2, BR3.2, BR4.1, BR4.5 |
| NFR4.3 | 발행본 전체 글(SnapshotTextTotal)은 60,000자 이하다. 트랜잭션 안에서 잠그고 다시 읽은 원본으로 센다. 넘으면 400 `VALIDATION_FAILED`, 발행하지 않는다 | **임시값**(BR4.5, OQ-U4-4). AI 입력 한도(U2·U5)에 맞는지 검증하지 않았다. 합의 뒤 값만 바꾼다 | 60,000자·60,001자 경계 시험 | BR4.5, OQ-U4-4 |
| NFR4.4 | 회원별 발행 요청 빈도는 1분 10회다. 입력 검사 전에 판정하고 넘으면 429 `RATE_LIMITED`와 `Retry-After`. 10월 `issue-rate-limit`·요청 빈도 제한기를 그대로 쓴다 | **임시값**(BR4.8, OQ-U4-2). 공용 계약 변경 없이 값만 바꾼다 | 11번째 요청 429 시험(시계 주입) | BR4.8, OQ-U4-2 |
| NFR4.5 | 잠금 대기 상한은 10월 공통 설정(앱 DB 계정 `lock_timeout = '3s'`)을 그대로 쓴다. 넘으면 `55P03` → 500 `INTERNAL_ERROR`이고 발행 트랜잭션은 전체 롤백된다(BR5.2). U4가 따로 상한을 두지 않는다 | 확정(10월 #220) | 따로 시험하지 않음. 롤백 자체는 S6이 본다 | `api/docs/lock-wait-limit.md`, BR5.2 |
| NFR4.6 | 발행 트랜잭션의 잠금 시간을 줄인다. 토큰·비밀번호 검증값(scrypt)은 트랜잭션 전에 만들고, 원본은 정해진 순서(Catch `catch_id` 오름차순 → 텍스트 자료 `text_material_id` 오름차순)로 잠근다 | 확정 | 코드 검토, S4 | BR5.1, BR5.4 |
| NFR4.7 | 받은 사람 판정(`resolveForRecipient`)은 호출마다 DB를 다시 읽고 캐시하지 않는다. 열람 응답 속도를 위해 판정 결과를 저장하지 않는다 | 확정 | S9(중지 직후 다음 요청이 404) | BR6.1, C-10 |

## 하지 않는 것

- 발행·열람의 응답 시간 측정·부하 시험은 하지 않는다(NFR4, NFR6).
- 조각 나누기(`chunkInTransaction`)의 처리 시간은 U3 몫이다. U4는 그 호출이 같은 트랜잭션 안에 있다는 것만 지킨다.
- 받은 사람 화면의 AI 패널 응답 속도는 U5·U10 몫이다.

## Assumptions & Open Questions

- NFR4.3(OQ-U4-4)·NFR4.4(OQ-U4-2)는 임시값이다. 각각 W3 발행 전에 회의에서 정한다. 바뀌어도 상한 값만 바꾸고 판정 자리·거부 모양은 그대로다.
