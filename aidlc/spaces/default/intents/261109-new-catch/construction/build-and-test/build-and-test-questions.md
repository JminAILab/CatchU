# 새 Catch — Build and Test 질문

## 질문의 범위

- 이 단계는 NC1~NC3를 합친 판(작업 브랜치 `worker/새-catch`, NC3 승인 커밋 `3bb20bb2`)에서 한 번 돈다.
- 시험 명령(각 Unit 명령, 서비스별 전체 커버리지 명령, 린트·타입)은 사람 결정 없이 돌린다. CI 실행 의무는 계획에 CI Pipeline 단계가 뒤에 있어 그 단계의 몫이다.
- 아래는 앞 단계가 이 단계로 넘긴 실측 가운데, 실제 키·실제 분석·사람 판정이 필요해 팀장이 정할 것이다.
  - NC3: 규칙별 붙은 Catch 수와 버림 기준(FR15.4, NFR4.2), 규칙 사실 30~50줄 사람 대조(NFR4.1), 분석 전체 호출 수·시간·결과 크기 바꾸기 전·후(NFR1.1·NFR1.3), 「다시 볼 곳 계산 실패」 로그 0줄(NFR4.3), 실제 커밋 링크 화면(AC9.1.4, 로컬에서는 GitHub 연결이 없어 못 봄)
  - NC2: 질의응답 10개 다시 재기(FR11.2, NFR3)와 답 말투(AC8.1.1~AC8.1.3). NC2 로컬 확인 때 Claude 키가 없어 실제 답을 보지 못했다.
- 가장 단순한 안을 A로 둔다.

## Q1. [운영] NC3 TheMe 실측을 어디서 어떻게 할까요?

**배경:** 규칙별 수·사람 대조·실패 로그·실제 링크는 TheMe를 NC3 판으로 실제(LIVE) 분석해야 나온다. cr1 DB의 TheMe Catch는 이미 소속 기록이 있어 같은 회원으로 다시 분석하면 새 Catch가 생기지 않는다. 바꾸기 전 호출 수는 11/8 cr1 TheMe 분석의 worker 로그(`~/catchu-local-live/cr1/logs/worker-20261108-*.log`, Catch 개편 판)에 있다. NC1·NC2는 worker 수집을 바꾸지 않았다.

A. 로컬에 새 측정용 DB 하나를 만들어(cr1 백업과 따로) Google 회원으로 들어가 GitHub를 연결하고, NC3 판으로 TheMe를 한 번 LIVE 분석한다. 바꾸기 전 값은 11/8 worker 로그의 「수집 종료」·「생성 종료」·「종결 결과 생성」 줄을 쓴다. 키는 `~/catchu-local-live/secrets.env`를 값 출력 없이 불러온다. 사람 대조 30~50줄은 팀장이 화면과 GitHub 원문으로 한다. (가장 단순, 분석 한 번)
B. A에 더해 바꾸기 전 판(NC1 앞 커밋)으로도 같은 날 같은 측정 DB에서 TheMe를 한 번 더 분석해 전·후를 같은 조건으로 잰다. 11/8 이후 GitHub 쪽 TheMe가 바뀌었을 가능성을 막는다. 대신 다른 판을 따로 빌드하고 DB를 한 번 더 비워야 해 약 1시간이 더 든다.
X. Other (please specify)

[Answer]: A, 조건부 B (2026-11-11, **Mode:** chat)

**덧붙임(사람 원문):** Q1은 A로 한다. 단 11/8 기준 로그 뒤인 11/9에 worker 생성 쪽 커밋(72bc2ac1·f283b7a5·362b2711·695ba1de·b6c3c751)이 들어왔으므로, NC3 판의 「수집 종료」 calls와 「생성 종료」 generationCalls·rewriteCalls가 11/8 값(calls=132, generationCalls=45)과 다르면 그때만 B처럼 바꾸기 전 판(NC1 앞)으로 같은 측정 DB에서 한 번 더 재서 원인을 가린다. elapsedSeconds·resultBytes는 기록만 한다. Google 로그인·GitHub 연결·분석 동의는 내가 한다.

## Q2. [운영] NC2 질의응답 10개 다시 재기(NFR3)는 어떻게 할까요?

**배경:** 다시 재기는 발행본 하나에 질문 10개를 받은 사람 AI(Claude)로 보내 근거와 말투를 사람이 본다(`api/scripts/rag-eval/rag-eval.cjs`). api의 받은 사람 AI는 Claude 키가 있어야 하고, 로컬 api 환경에는 그 키가 없다(NC2 로컬 확인 기록). worker 생성 키(`CATCHU_GENERATION_API_KEY`)와는 다른 설정이다.

A. 팀장이 이 측정에만 로컬 api에 Claude 키를 값 출력 없이 넣어(공용 비밀값 파일에 이름 하나 더함) Q1의 측정 DB에서 TheMe 발행본 하나로 잰다. 남의 기여를 본인 것으로 쓴 항목 0건이 합격 기준이고, 작성자 주장을 사실처럼 옮긴 항목 수는 기록만 한다. (가장 단순, 이 단계 안에서 끝남)
B. 이 단계에서는 재지 않고 「확인 안 됨」으로 남긴 채 멈춰 팀장 판단을 받는다(halt-and-ask). 개발 서버에서 실제 키로 재는 일은 배포 뒤로 미룬다. 대신 Build and Test가 통과로 끝나지 않는다.
X. Other (please specify)

[Answer]: A, 두 가지 고침 (2026-11-11, **Mode:** chat)

**덧붙임(사람 원문):** Q2는 A로 하되 두 가지를 고친다. (1) api의 받은 사람 AI도 worker와 같은 이름 CATCHU_GENERATION_API_KEY를 읽는다(rag-answer/question-rewriter.ts, ai-generation.module.ts). 새 키 이름을 더하지 말고, api를 띄울 때 secrets.env를 값 출력 없이 함께 불러온다. (2) CATCHU_EMBEDDING_API_KEY도 함께 불러온다. 없으면 개발 환경 api가 합성 임베딩(EMBEDDING_PROVIDER_SYNTHETIC)으로 조용히 바뀌어 검색이 달라지고 재측정이 의미가 없다. 키를 불러온 뒤에 TheMe 발행본을 발행하고, api 로그에 EMBEDDING_PROVIDER_SYNTHETIC이 없는지 확인한다. secrets.env는 키 이름이 있는지만 값 없이 확인하고, 값을 새로 넣어야 하면 내가 숨김 입력으로 넣는다.
아래 두 안내는 되돌리지 않는다. mcp-shared-text.test.cjs는 NC2가 깬 U9 S5 표지를 고친 faddde3a라 그대로 두고, 「Unit 밖에서 바뀐 파일」은 통합 브랜치를 들인 a1d0fbb4·4295de2c로 온 것이라 그대로 둔다.

**확인(2026-11-11):** `~/catchu-local-live/secrets.env`에 이름 `CATCHU_GENERATION_API_KEY`·`CATCHU_EMBEDDING_API_KEY`가 있다(값은 열지 않음).
