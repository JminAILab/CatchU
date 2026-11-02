# U2 공용 기반 — 관측 요구사항

## Sources

작성일: 2026-10-27. 입력: [U2 기능 명세](../functional-design/functional-spec.md)(functional-spec)의 W11 통합 확인, [U2 업무 규칙](../functional-design/rules.md)(rules)의 BR3.6·BR5·BR7.4·BR9.4, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR3·NFR6과 FR19, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 「에러 대응 최소선」, team.md Code Style.

## 원칙

별도 관제 화면·경보·추적 시스템은 만들지 않는다(NFR6). 관측은 api 로그와 통합 확인 표로 한다. SLI/SLO는 두지 않는다(NFR4).

## 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR3.1 | 게이트는 호출마다 기능 이름, 남은 항목 수, 버린 수(droppedCount), 버린 이유 종류별 수만 로그로 남긴다. NFR3 평가 때 "맞는데 버려진 항목" 건수를 셀 수 있게 한다 | 로그 확인 | BR3.6, NFR3 (c) |
| NFR6.6 | AiRun은 등록 실패·처리기 예외·등록되지 않은 kind를 kind·runKey·오류 종류로 로그에 남긴다 | 로그 확인 | BR5.1·BR5.2·BR5.6 |
| NFR6.7 | 탈퇴 실패는 실패 단계 번호(1~4)와 오류 종류만 로그로 남겨 팀이 확인할 수 있게 한다 | 시나리오 S25 로그 | BR7.4, FR14.1 "팀이 확인한다" |
| NFR6.8 | 통합 확인 결과는 `docs/CatchU_통합확인.md` 한 표에 날짜·차수·시나리오·대상 버전·환경·결과(통과·실패·미실행)·메모로 남긴다. 헬스체크·로컬 성공·승인 문서로 대신하지 않는다 | 문서 확인 | BR9.4, FR19.2, NFR6 |
| NFR6.9 | 로그에는 비밀값·인증정보·사용자 자료(AI 입력·출력 글, 근거 글, 질문, 파일 내용, 이메일)를 남기지 않는다 | 코드 리뷰 | team.md Code Style, security-requirements.md |
| NFR6.10 | 로그는 기존 api 로거 형식을 그대로 쓴다. 새 로그 수집·저장 장치는 만들지 않는다 | 코드 리뷰 | NFR6 |

## 남기지 않는 것

경보·대시보드·추적 ID 전파·지표 수집기. 시연 규모에서는 api 로그와 확인 표로 충분하다는 범위 결정을 따른다.
