# U5 RAG 응답 — 관측 요구사항

## Sources

작성일: 2026-10-30. 입력: [U5 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U5 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR6·FR19.2, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 「에러 대응 최소선」, [보안 점검](../../../../../../../docs/CatchU_security_checks.md)의 「로그·오류 응답」, [비기능 질문·답변](nfr-requirements-questions.md) Q4.

## 범위

별도 관제 화면·경보는 이 intent에서 만들지 않는다(NFR6). 관측은 api의 기존 구조화 로그 한 줄씩과, FR19의 확인 표에 실제 결과를 남기는 것으로 한다. 게이트와 U3 검색은 자기 로그(토큰 수·걸린 시간·요청 ID)를 따로 남긴다.

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR6.1 | 질문 하나가 끝날 때(성공·실패 모두) 로그 한 줄: 발행본 ID, 끝난 단계, 결과 종류(성공·실패 이유 종류·Redis 통과), 다시 쓰기 여부, 검색 조각 수, 보낸 항목 수, 버린 수, 단계별 걸린 시간(다시 쓰기·검색·생성, 밀리초), 다시 쓰기 토큰 수(입력·출력). 확인 단계에서 거부된 요청(400·401·404·409·429)은 결과 종류와 발행본 ID(알 때만)만 남긴다 | 로그 칸 시험(합성 제공자) | Q4, 기능 설계 BR1.4 |
| NFR6.2 | 기본 요약 처리기가 끝날 때 로그 한 줄: 발행본 ID, 결과(DONE·FAILED·버림·건너뜀), 실패 종류, 항목 수, 버린 수, 걸린 시간. [다시 만들기] 접수는 발행본 ID와 작업 등록 결과(ENQUEUED·ENQUEUE_FAILED)를 남긴다 | 로그 칸 시험 | Q4, 기능 설계 BR5.4·BR5.5·BR7.3 |
| NFR6.3 | 로그·오류에는 질문·앞 대화·다시 쓴 질문·답 항목 글·근거 글·인용 원문·링크 토큰·grant·키·Redis 주소를 넣지 않는다. 회원 ID는 작성자 경로에서만, 발행본 ID는 그대로 남긴다. U5는 요청 주소(링크 토큰이 든 경로)를 로그에 직접 남기지 않는다. 그 밖의 경로 기록은 이미 막혀 있어 새 작업이 없다: api 예외 로그는 실제 주소 대신 등록된 경로 틀만 남기고(`api-exception.filter.ts` `safePath`), 개발 서버 Caddy는 접근 로그를 쓰지 않고 오류 로그의 요청 주소·헤더를 지우며(`Caddyfile`), EKS ALB는 접근 로그를 켜지 않는다(`ingress.yaml`) | 로그에 금지 글이 없는지 확인하는 시험 | 보안 점검 「로그·오류 응답」, team.md Code Style, 기능 설계 BR1.4, 비기능 수정 요청(R-01) |
| NFR6.4 | Redis 통과(장애·주소 없음)는 경고 로그로 남겨 질문 횟수를 세지 못한 사실을 알 수 있게 한다 | Redis 실패 합성 시험 | 기능 설계 BR3.2 |
| NFR6.5 | 통합 확인(FR19)에서 U5 몫은 받은 링크에서 기본 요약을 보고 질문해 근거 강조가 붙은 답을 받는 흐름, 링크 중지 뒤 질의응답 차단이다. 날짜·대상 버전·결과(실패·미실행 포함)를 확인 표에 남기며 합성 제공자 통과나 로컬 성공으로 대신하지 않는다 | FR19.2 확인 표 | NFR6, FR19.1·FR19.2, team.md Walking Skeleton, 납품 계획 B8 |
| NFR6.6 | 새 지표 수집·대시보드·경보는 두지 않는다 | 해당 없음 | NFR6 |
