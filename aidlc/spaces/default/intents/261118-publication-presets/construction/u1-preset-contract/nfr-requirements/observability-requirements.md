# Observability Requirements — u1-preset-contract

근거: 기능 설계 `construction/u1-preset-contract/functional-design/functional-spec.md`와 `rules.md`(BR7.1), 요구사항 `inception/requirements-analysis/requirements.md`(NFR4), 팀 관행 Code Style(예외를 삼키지 않음, 접수와 완료를 구분), 코딩 절차 `docs/CatchU_coding_procedures.md`(실행 로그 규칙), 지금 코드(`api/src/publications/publications-log.ts`).

새 지표·대시보드·알림은 두지 않는다. 지금 api의 구조화 로그와 같은 방식으로 남긴다.

| ID | 요구 | 확인 방법 |
|---|---|---|
| NFR4.5 | 프리셋 만들기·고치기·지우기는 성공과 실패를 한 줄씩 남긴다. 칸은 회원 ID, 프리셋 ID(있을 때), 오류 코드다. 이름과 자료 내용은 남기지 않는다(NFR4.1) | 로그 함수 시험 |
| NFR4.6 | 발행 로그는 지금처럼 성공·실패를 남기고, 실패의 오류 코드에 새 코드(CATCH_PRIVATE)가 그대로 찍힌다. 막힌 프리셋·자료 ID는 로그에 넣지 않는다(응답에만 실음) | 지금 발행 로그 시험에 새 코드 경우를 더함 |
| NFR4.7 | 목록·상세·세기의 500(기록 문제, NFR2.10)은 지금 공통 오류 필터의 서버 오류 로그로 남는다. 따로 경고 로그를 더하지 않는다 | 설계 결정 |
| NFR4.8 | 예외를 삼키지 않는다. 읽기 경로에서 원본 하나를 못 읽으면 그 요청 전체가 실패로 드러난다(이유를 조용히 비우지 않는다) | NFR2.10 시험 |
