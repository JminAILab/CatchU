# U1 AI 생성 관문 최소 경로 — 비기능 요구사항 질문

입력: [U1 기능 명세](../functional-design/functional-spec.md)·[업무 규칙](../functional-design/rules.md), [요구사항](../../../inception/requirements-analysis/requirements.md)의 NFR1~NFR7·C02·C07, [계약 요약](../../../inception/contract-design/contract-summary.md)의 C-01과 「에러 대응 최소선」, [보안 점검](../../../../../../../docs/CatchU_security_checks.md)의 「외부 호출」·「LLM·검색 기능」·「로그·오류 응답」, 10월 worker의 [생성 제공자 문서](../../../../../../../worker/docs/generation-provider.md).

이미 정해진 것(다시 묻지 않음): 키 이름은 `CATCHU_GENERATION_API_KEY`(#389, `api/.env.example`). SDK가 스스로 읽는 이름은 쓰지 않는다. 처리 위치는 미국(#119, 10월 worker와 같음). 자동 재시도 없음(C-01, 「에러 대응 최소선」 2). 모델은 Haiku 5.5(FR6.9). 처리 시간·가동률·복구 수치는 새로 만들지 않는다(NFR4). U2의 방어 문구·입력 상한이 붙기 전에 `generate()`를 시험 밖에서 쓸지는 기능 설계 승인 때 감수한 위험으로 두었다.

## Q1. [보안] 외부 호출의 상한을 어디까지 U1에서 지킬까

보안 점검 「외부 호출」은 redirect를 따라가지 않고 응답 크기·시간에 상한을 두라고 한다. 10월 worker는 이를 위해 전송 계층을 직접 감쌌다(호출 전체 마감, redirect 금지, 응답 본문 256 KiB 상한, 프록시 변수 무시, 압축 응답 거부).

A. U1은 SDK 설정만 쓴다: 호출 시간 제한 하나, 재시도 0, 출력은 `max_tokens`로 제한. redirect·응답 본문 크기·프록시 변수는 SDK 기본에 맡기고, 보안 점검과의 차이는 U1 PR 「리뷰 요청」에 쟁점으로 적는다. U2가 실제 기능에 붙일 때 다시 본다.
B. A에 redirect 금지와 응답 본문 크기 상한만 더한다 — 보안 점검의 두 항목을 지킨다. 전송 설정 공수가 조금 는다.
C. 10월 worker 방식을 TypeScript로 옮긴다(호출 전체 마감·redirect 금지·본문 상한·프록시 변수 무시·압축 응답 거부) — 보안 점검을 그대로 지키지만 공수가 크고, 천천히 보내는 응답까지 막는 시험이 더해진다.
X. Other (please specify)

[Answer]: X. B로 하되 주소 고정을 더한다. SDK 설정은 시간 제한 하나·재시도 0·max_tokens. 여기에 더해 ① 주소를 코드에서 직접 넘겨(baseURL) ANTHROPIC_BASE_URL 같은 환경변수로 바뀌지 않게 하고 ② redirect를 따라가지 않으며 ③ 응답 본문 크기에 상한을 둔다(압축을 푼 뒤 기준으로 세고, 넘으면 그 자리에서 끊어 AiProviderError). 상한 값은 10월 worker와 같은 256 KiB에서 시작한다. 프록시 변수 무시·압축 거부·단계별 마감은 하지 않는다(보안 점검 「외부 호출」 행의 주소 고정·redirect·크기·시간 네 가지를 지키는 최소한).

## Q2. [성능] 호출 시간 제한과 기본 출력 상한 값

C-01과 요구사항은 이 값을 개발 담당 결정으로 두었다. 기본 출력 상한은 기능 설계 BR2.2에서 "게이트를 만들 때 주는 설정"으로만 정했다. 실제 호출 시험(S8)은 이와 별도로 시험 상수를 쓴다.

A. 10월 worker 생성과 같은 값: 시간 제한 45초, 기본 출력 상한 4,000 토큰.
B. 시간 제한 60초, 기본 출력 상한 4,000 토큰 — 질의응답·JD 요약처럼 근거가 많은 호출에 여유를 더 둔다. 사람이 기다리는 시간이 길어질 수 있다.
C. U1은 값을 두지 않고 게이트를 만드는 쪽(U2·호출 Unit)이 반드시 넘기게 한다 — U1 시험은 시험 상수만 쓴다. 기본값이 없어 빠뜨리면 만들 때 멈춘다.
X. Other (please specify)

[Answer]: A

## Q3. [운영] 호출 기록에 남길 항목

기능 설계 BR5.5는 기능 이름·중단 이유·실패 원인·항목 수·`droppedCount`만 남기고 근거 글·질문·키는 남기지 않는다고 정했다. 10월 worker는 여기에 토큰 수·걸린 시간·Anthropic 요청 ID·추론 위치도 남긴다.

A. BR5.5에 입력·출력 토큰 수, 걸린 시간, Anthropic 요청 ID를 더한다 — 비용·지연과 제공자 쪽 문의에 쓴다. 모두 응답에서 온 값이며 글 원문은 없다.
B. BR5.5 그대로 둔다 — 가장 단순하지만 비용·지연을 로그로 볼 수 없다.
C. 10월 worker와 같은 항목 전부(A + 추론 위치·거절 분류, 값 목록 밖의 값은 `OTHER`로 적기).
X. Other (please specify)

[Answer]: X. A로 하되 숫자 하나를 더한다. 입력·출력 토큰 수, 걸린 시간, Anthropic 요청 ID에 더해, '- '로 시작하지 않아 항목으로 인정하지 않은 줄 수를 남긴다(줄 내용은 남기지 않고, droppedCount에는 세지 않는다. 기능 설계 검토 R-04). 원문·인용문·userText·키는 지금처럼 남기지 않는다.

## Consolidated Summary Confirmation

- 외부 호출(Q1): SDK 설정은 시간 제한 하나·재시도 0·`max_tokens`. 더해서 ① 주소를 코드에서 직접 넘겨 환경변수(`ANTHROPIC_BASE_URL` 등)로 바뀌지 않게 하고 ② redirect를 따라가지 않으며 ③ 응답 본문을 압축을 푼 뒤 기준 256 KiB까지만 받고 넘으면 그 자리에서 끊어 `AiProviderError`로 낸다. 프록시 변수 무시·압축 거부·단계별 마감은 하지 않는다.
- 값(Q2): 호출 시간 제한 45초, 기본 출력 상한 4,000 토큰(10월 worker 생성과 같음). S8은 별도 시험 상수를 쓴다.
- 기록(Q3): 기존 항목(기능 이름·중단 이유·실패 원인·항목 수·`droppedCount`)에 입력·출력 토큰 수, 걸린 시간, Anthropic 요청 ID, 항목으로 인정하지 않은 줄 수를 더한다(`droppedCount`에는 세지 않음). 원문·인용문·`userText`·키는 남기지 않는다.
- 이미 정해진 것: 키 `CATCHU_GENERATION_API_KEY`, 처리 위치 미국, 자동 재시도 없음, Haiku 5.5, 새 처리 시간·가동률 수치 없음.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
