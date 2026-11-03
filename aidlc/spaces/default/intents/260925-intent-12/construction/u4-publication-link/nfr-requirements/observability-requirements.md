# U4 발행·링크 — 관측 요구사항

## Sources

작성일: 2026-10-29. 입력: [U4 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U4 업무 규칙](../functional-design/rules.md)(rules)의 BR5.5·BR8.4·BR10.2, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR6·FR19.2, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) 「공통 전제」의 에러 대응 최소선 1, [보안 점검](../../../../../../../docs/CatchU_security_checks.md) 「로그·오류 응답」, [비기능 질문·답변](nfr-requirements-questions.md) Q2. Q2 답은 2026-10-29 [#416 팀장 답변](https://github.com/JminAILab/CatchU/issues/416#issuecomment-6485884167)이 출처다. 10월 api 문서 `api/docs/security-events.md`.

## 범위

NFR6은 자동 배포·별도 관제 화면을 이 intent에서 만들지 않는다고 정했다. U4의 관측은 api 서버 로그와 FR19.2 확인 표뿐이다. 지표·대시보드·알림·분산 추적은 두지 않는다.

## 요구사항

| ID | 요구사항 | 지위 | 확인 | 근거 |
|---|---|---|---|---|
| NFR6.2 | 로그 필수 항목은 BR10.2대로 발행본 ID·회원 ID·오류 코드다. 여기에 **결과 분류만 더한다**: ① 발행 성공·실패 코드, ② 커밋 뒤 작업 등록 결과와 작업 종류(등록 성공·등록 실패, `EMBED_PUBLICATION`·`BASE_SUMMARY`), ③ 발행본 삭제의 접두어 삭제 실패. 항목 수·처리 시간·받은 사람 열람 판정 결과(통과·404·401)는 남기지 않는다 | 항목 범위는 **확정**(Q2 A) | 각 결과에서 로그 한 줄이 정해진 칸만 갖는지 시험 | Q2(A, #416 팀장 답변), BR10.2 |
| NFR6.3 | NFR6.2 결과 분류의 세부 식별자(로그 칸 이름, 값 표기 `ENQUEUED`·`ENQUEUE_FAILED`, 작업 종류 표기, 접두어 삭제 실패를 나타내는 값)는 **임시**다. 코드 생성 때 정하고, 바뀌어도 NFR6.2의 항목 범위는 그대로다 | **임시** | 코드 검토 | Q2(A는 분류 범위만 정함), 비기능 질문 Q2 설명 정정 |
| NFR6.5 | 작업 등록 실패(BR5.5)는 로그만 남기고 발행은 성공 응답이다. 접두어 삭제 실패(BR8.4)는 로그를 남기는 데서 끝나지 않고 500 `INTERNAL_ERROR` 응답이다(reliability NFR5.3). 두 실패를 같은 분류로 묶지 않는다 | 확정 | S7·S11에서 응답 코드와 로그 분류 확인 | BR5.5, BR8.4, 보안 점검 「로그·오류 응답」 |
| NFR6.6 | 로그·오류 응답에 링크 토큰·grant·비밀번호·자료 본문(설명·텍스트 자료·사본)·SQL·stack을 넣지 않는다(security NFR1.9). 예외를 삼키지 않는다 | 확정 | 합성 비밀값으로 로그 비노출 시험 | BR10.2, team.md Code Style, 보안 점검 「로그·오류 응답」 |
| NFR6.7 | 비밀번호 실패(401)·unlock 시도 제한(429)·회원 인증 실패의 보안 기록은 10월 `security-events` 방식을 그대로 쓴다. U4가 새 기록 종류를 더하지 않는다 | 확정 | 10월 시험 재사용 | `api/docs/security-events.md`, 질문 파일 Q2 앞 설명 |
| NFR6.8 | U4 시나리오(S1~S15)와 최소 연결 첫 결과의 실행 결과를 FR19.2 확인 표에 날짜·대상 버전·결과(실패·미실행 포함)로 남긴다. 계약 가짜로 돌린 것은 '합성 연결을 포함한 사전 확인'으로 적는다. S15는 C-09 합의 전까지 미실행으로 적는다 | 확정 | 확인 표 | NFR6, FR19.2, 기능 명세 「주요 시나리오와 확인」 |

## 하지 않는 것

- 지표 수집·대시보드·알림·SLI/SLO·분산 추적(NFR6).
- 받은 사람 열람 추이 기록(Q2 C를 채택하지 않음). 필요해지면 그때 근거를 두고 더한다.
- 발행 처리 시간·항목 수 기록(Q2 B를 채택하지 않음).
