# U1 AI 생성 관문 최소 경로 — 보안 요구사항

## Sources

작성일: 2026-10-27. 입력: [U1 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U1 업무 규칙](../functional-design/rules.md)(rules), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR1·NFR2·C02·C07, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 C-01, [보안 점검](../../../../../../../docs/CatchU_security_checks.md)의 「설정·개발용 기능」·「외부 호출」·「로그·오류 응답」·「LLM·검색 기능」, [비기능 질문·답변](nfr-requirements-questions.md) Q1·Q3.

## 범위

U1은 회원 요청을 직접 받지 않고, HTTP 경로도 저장하는 자료도 없다. 보안 요구사항은 비밀값, Claude 외부 호출, 모델에 보내는 입력, 로그에 관한 것이다. 권한 판정과 링크 조건은 호출 Unit이 맡는다(C-10).

## 요구사항

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR1.1 | Claude API 키는 환경변수 `CATCHU_GENERATION_API_KEY`에서만 읽는다. SDK가 스스로 읽는 이름(`ANTHROPIC_API_KEY`)은 쓰지 않는다. 키는 코드·시험 자료·로그·오류 메시지·결과 기록에 넣지 않는다. 키가 비었으면 게이트를 만들 때 멈춘다(판정할 수 없으면 허용하지 않음). 실제 호출 시험(S8)은 키가 없으면 건너뛰고, 그 결과는 통과가 아니라 미실행으로 보고한다 | 키 없음으로 게이트 생성 거부 시험. 로그·오류에 키가 없는지 확인 | NFR1, 보안 점검 「설정·개발용 기능」, `api/.env.example`(#389) |
| NFR1.2 | U1은 요청에 담긴 근거 글·`userText`·`instruction`만 보낸다. 다른 회원 자료를 스스로 읽거나 모으지 않는다. 무엇을 근거로 넣을지는 호출 Unit이 링크 조건과 권한을 확인한 뒤 정한다(C-01 caller-rule) | 기능 설계 W1 그대로. 시험은 요청 밖 자료를 보내지 않는지 확인 | NFR1, 보안 점검 「LLM·검색 기능」 |
| NFR2.1 | 생성은 Claude API로만 한다. 모델은 요청의 `model` 값(기본 Haiku 5.5)이고, 처리 위치는 미국으로 고정한다(10월 worker와 같은 #119 결정) | 요청 본문의 모델·처리 위치 확인 시험 | NFR2, FR6.9, C02 |
| NFR2.2 | 외부 호출 네 가지 상한을 지킨다. ① API 주소를 코드에서 직접 넘겨 환경변수(`ANTHROPIC_BASE_URL` 등)로 바뀌지 않게 한다. ② redirect를 따라가지 않는다. ③ 응답 본문은 압축을 푼 뒤 기준으로 256 KiB까지만 받고, 넘으면 그 자리에서 끊고 `AiProviderError`로 낸다. ④ 호출 시간 제한은 45초, 재시도는 0이다(performance-requirements NFR4.1). 프록시 변수 무시·압축 응답 거부·단계별 마감은 하지 않는다 | 주소 고정·redirect 응답·본문 상한 초과(딱 맞음 포함)·시간 초과를 합성 응답으로 시험 | 보안 점검 「외부 호출」, Q1 |
| NFR2.3 | 근거 글과 `userText`는 인용 문서와 사용자 메시지로 보내고 시스템 지시에 섞지 않는다(기능 설계 BR2.3). `publicationText`는 모델에 보내지 않는다 | 요청 본문 구성 시험 | 보안 점검 「LLM·검색 기능」, C-01 |
| NFR2.4 | 보안 점검 「LLM·검색 기능」 가운데 U1이 지키지 않는 것을 쟁점으로 남긴다. 숨긴 지시 방어 문구와 역량 평가 표현 금지는 U2, 입력 크기 상한(`AiInputTooLarge`)은 U2, 근거 대조는 U2의 기계 대조다. 보내기 전 비밀값·개인정보 가리기는 근거를 모으는 호출 Unit 몫이다(구직자 본인 자료는 첫 이용 동의 아래 그대로 보낸다). U1 PR 「리뷰 요청」에 이 차이와 "U2가 붙기 전에는 시험 밖에서 `generate()`를 쓰지 않는다"를 적는다 | PR 「리뷰 요청」 기재 | 보안 점검 「검사와 보고」, 기능 설계 승인 때 감수한 위험 |
| NFR6.3 | 로그와 오류 메시지에는 근거 글·인용문·`userText`·키를 넣지 않는다. 응답에서 온 값(중단 이유·요청 ID)만 정해진 칸으로 남긴다(observability-requirements NFR6.2) | 로그 내용 확인 시험 | 보안 점검 「로그·오류 응답」, team.md Code Style, 기능 설계 BR5.5 |

## 위협과 대응

| 위협 | 대응 |
|---|---|
| 키 노출 | NFR1.1·NFR6.3 |
| 설정으로 호출 주소를 바꿔 자료를 다른 곳으로 보냄 | NFR2.2 ① |
| redirect·큰 응답으로 메모리·시간 소모 | NFR2.2 ②③④ |
| 근거 글 속 숨긴 지시 | U1은 근거를 지시와 분리해 보낸다(NFR2.3). 방어 문구는 U2(NFR2.4) |
| 근거에 없는 사실 단정 | U1은 인용과 원문 위치만 붙인다. 대조·버림은 U2, 사람 확인은 NFR3(U5) |
