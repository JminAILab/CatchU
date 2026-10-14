# 생성의 실제 제공자 — Anthropic Claude API (#120)

> [설명 초안·생각해볼 질문·Catch 제목 생성](generation.md)의 제공자 경계(`GenerationProvider`)에 붙이는 실제 제공자 어댑터다. 제공자·시작 모델·처리 위치는 [#119 결정](https://github.com/JminAILab/CatchU/issues/119#issuecomment-6159097353)(2026-10-14)을 따른다. 코드는 `app/generation/claude.py`다. 아직 실제 API를 부른 적이 없고(팀장의 별도 허가가 필요하다), 처리 순서에 잇지 않았다([#121](https://github.com/JminAILab/CatchU/issues/121)). 실제 회원 자료는 실제 자료용 고지([#138](https://github.com/JminAILab/CatchU/issues/138))와 [#37](https://github.com/JminAILab/CatchU/issues/37)의 조건을 갖춘 뒤에 보낸다.

## 요청 설정

| 항목 | 값 | 이유 |
|---|---|---|
| 접속 주소·자격정보 | `https://api.anthropic.com`을 코드에 고정하고 API 키와 함께 SDK 클라이언트에 직접 넘긴다. `ANTHROPIC_CUSTOM_HEADERS` 환경변수가 있으면 어댑터를 만들지 않는다 | `ANTHROPIC_BASE_URL`·`ANTHROPIC_API_KEY`·`ANTHROPIC_AUTH_TOKEN`이 주소·자격정보를 바꾸지 못하게 한다. SDK는 `ANTHROPIC_CUSTOM_HEADERS`를 머리글로 붙이고 그 머리글이 `x-api-key`·`Host`까지 덮어쓴다 |
| HTTP 전송 | 환경변수를 읽지 않는 전송을 직접 만들어 넘긴다(`HTTPS_PROXY` 같은 프록시 변수를 쓰지 않음). redirect를 따라가지 않는다(SDK 기본은 따라간다). 전송의 네트워크 백엔드를 감싸 호출 마감을 지킨다(아래 「시간 제한」) | [보안 점검](../../docs/CatchU_security_checks.md) 「외부 호출」. 인증서는 시스템 설정을 따르므로 Linux에서는 `SSL_CERT_FILE`도 따른다(GitHub 수집 전송과 같다) |
| 응답 크기 | 응답 본문을 256 KiB까지만 받고 넘으면 그 자리에서 끊는다(오류 응답도). 압축하지 않은 응답만 요청하고(`Accept-Encoding: identity`) 압축된 응답은 받지 않는다 | 「외부 호출」의 응답 크기 상한. SDK는 본문을 끝까지 읽은 뒤 해석하고, `max_tokens`는 HTTP 본문 크기를 막지 않는다. 압축된 응답은 풀린 크기를 미리 셀 수 없다 |
| SDK 재시도 | `max_retries=0`. SDK 기본은 2회이고 시간 초과·409·429·5xx·연결 오류를 다시 보낸다 | #120 「실제 제공자 SDK의 기본 재시도는 끈다」 |
| 시간 제한 | 요청의 시간 제한(생성 45초·고쳐 쓰기 20초)을 호출마다 넘기고, 같은 값을 호출 전체의 마감으로 쓴다. 연결·TLS·요청 쓰기·응답 읽기의 네트워크 대기마다 마감까지 남은 시간만 기다리고, 마감이 지났으면 바로 시간 초과로 끊는다. 머리글을 받은 직후·본문 조각마다·본문 끝에서도 지난 시간을 다시 본다 | 생성 흐름은 남은 시간이 그만큼 있을 때만 호출을 시작하므로 남은 시간 이하다. SDK에 넘긴 시간 제한은 네트워크 대기 한 번마다 새로 걸려, 서버가 머리글·청크 구분 정보·본문을 그보다 짧은 간격으로 조금씩 보내면 호출이 끝나지 않는다. HTTPX2 전송은 네트워크 백엔드를 받는 인자가 없어 만든 뒤 연결 풀의 백엔드를 감싼다(판본은 잠금 파일로 고정, 구조가 바뀌면 만들 때 멈추고 시험이 실패한다). 이름 조회(DNS)는 이 마감 밖이다. 시간 제한을 넘겨 끝난 호출은 거절·잘림·호출 오류로 끝났어도 생성 흐름이 시간 초과로 다룬다([생성 「응답과 판정」](generation.md#응답과-판정)) |
| 모델 | 생성 호출과 제목 고쳐 쓰기 호출을 각각 정한다(`ClaudeModels`). 기본은 둘 다 `claude-haiku-5-5` | 실패한 호출을 다른 모델로 다시 보내지 않는다(#120 「모델 대체」를 추가하지 않음). 표에 있는 모델(Haiku 5.5·Sonnet 5.5)만 받아, 30일 보관이 필수인 모델이나 단가가 큰 모델을 설정 실수로 쓰지 않게 한다 |
| 생각(thinking) | 끈다. Haiku 5.5는 `disabled`, Sonnet 5.5는 `disabled`를 400으로 거절해 `between_tools` | 고르기 위주의 짧은 JSON 응답이고, 생각 토큰도 출력으로 과금된다 |
| 최대 출력 | `max_tokens` = 최대 출력 바이트(4,000)와 4,000 가운데 큰 값 | 토큰 수와 응답 글 길이는 일대일이 아니어서(SDK 설명) 최대 출력 안의 응답이 잘리지 않는다고 보장하지는 못한다. 잘리면 `max_tokens` 멈춤으로 와 응답 전체를 쓰지 않는다 |
| 처리 위치 | 요청마다 `inference_geo="us"` | #119 결정(미국 처리). 작업 공간 쪽 미국 고정은 팀장의 Console 확인 몫이다 |
| 지시문·자료 | 지시문은 `system`, 자료는 `user` 칸 | 신뢰할 수 없는 자료를 지시문과 섞지 않는다 |

Sonnet 5.5 설정은 생성 호출의 품질 비교 후보(#119 결정 「호출 종류별 모델」)라서 넣었고, 실제 호출로 확인하지 않았다.

## 응답과 실패

| SDK 결과 | 어댑터가 내는 것 | 생성 흐름의 실패 코드 |
|---|---|---|
| 멈춘 이유 `end_turn` | 응답의 글(text 블록) | 응답 판정을 거친다 |
| `max_tokens`(최대 출력에서 잘림), 응답 본문이 받는 상한을 넘음 | `UnusableResponse("TOO_LARGE")` | `GENERATION_RESPONSE_TOO_LARGE` |
| `refusal`(정상 응답 안의 거절)과 그 밖의 멈춤 | `UnusableResponse("UNREADABLE")` | `GENERATION_RESPONSE_UNREADABLE` |
| SDK 시간 초과 | `TimeoutError` | `GENERATION_TIMEOUT` |
| 연결 실패, 오류 응답(400·401·402·403·404·409·413·429·500·504·529 등), 모양이 맞지 않는 응답(JSON이 아님·잘못된 UTF-8·자릿수 상한을 넘는 정수·너무 깊은 중첩·칸 누락·자료형이 다름), 압축된 응답 | `ProviderError` | `GENERATION_CALL_FAILED` |

- 어느 경우에도 다시 보내지 않는다. 504(Anthropic 쪽 처리 시간 초과)는 시간 초과가 아니라 호출 실패다.
- 시간 제한을 넘겨 끝난 호출은 거절·잘림·호출 오류로 끝났어도 `GENERATION_TIMEOUT`이다.
- SDK는 응답 모양을 엄격히 검사하지 않아 칸이 빠져도 응답 객체를 만들고, 본문 해석 오류(`ValueError`·`RecursionError`)는 감싸지 않고 그대로 낸다. 어댑터는 둘 다 받아 쓰는 칸(글·멈춘 이유·모델·사용량)의 모양을 확인하고, 맞지 않으면 다른 예외로 새지 않고 `ProviderError`로 끝낸다.
- 예외에는 원인 이름만 넣는다. SDK 예외에는 응답 원문·요청 본문·키 머리글이 들어 있어, 새 예외는 except 밖에서 내 원인(`__cause__`)으로도 문맥(`__context__`)으로도 잇지 않는다.
- `UnusableResponse`는 `ProviderError`의 하위라, 이를 모르는 쪽에서도 호출 실패로 처리된다.

## 운영 로그

`app.generation.claude`가 호출마다 한 줄 남긴다.

- 응답이 오면 「생성 제공자 응답」: 호출 종류, 응답의 모델 ID, 멈춘 이유, 거절 분류(거절일 때), 입력·출력 토큰 수, 추론 위치, 걸린 시간, Anthropic 요청 ID. 정상 끝은 INFO, 그 밖은 WARNING이다.
- 실패면 「생성 제공자 실패」(WARNING): 호출 종류, 요청한 모델, 원인 이름, 상태 코드, 오류 종류, 걸린 시간, Anthropic 요청 ID.
- 원인 이름은 `TIMEOUT`·`CONNECTION`·`INVALID_RESPONSE`·`RESPONSE_TOO_LARGE`와 상태 코드별 이름(`BAD_REQUEST`·`AUTHENTICATION`·`BILLING`·`PERMISSION`·`NOT_FOUND`·`CONFLICT`·`REQUEST_TOO_LARGE`·`RATE_LIMIT`·`SERVER_ERROR`·`SERVER_TIMEOUT`·`OVERLOADED`·`HTTP_ERROR`)이다. 모든 후보를 실패시키는 비용 원인 셋은 공식 문서(2026-10-14 확인)의 표시로 따로 가른다.
  - `CREDIT_EXHAUSTED`: 오류 메시지가 「Your credit balance is too low」로 시작한다. 월 크레딧 소진이며 상태 코드가 문서에 없어 어느 코드로 와도 이 이름이다.
  - `SPEND_CAP`: 429이고 `error.details.error_code`가 `enforced_spend_limit_reached`다. 등급의 월 지출 상한이며 다음 달 1일(UTC)까지 계속 실패한다.
  - `SPEND_LIMIT`: 400이고 메시지가 「You have reached your specified (workspace) API usage limits」로 시작한다. 직접 정한 지출 상한이다.
- 응답에서 온 멈춘 이유·거절 분류·오류 종류는 공식 값 목록에 있을 때만, 모델 ID·추론 위치·요청 ID는 영문·숫자·`._:-`로 된 128자 이하일 때만 그대로 적고, 아니면 `OTHER`·`INVALID`로 적는다. 원문이나 줄바꿈이 로그에 들어가지 않게 하기 위해서다.
- 지시문·자료·응답 글·오류 메시지 원문·거절 설명·API 키는 남기지 않는다. SDK는 DEBUG 수준에서 요청 본문 전체를 로그에 남긴다. 상위 로거 수준으로는 하위 로거가 만든 기록을 막지 못하므로, 어댑터를 만들 때 SDK 로거(`anthropic`과 그 하위) 모두에 INFO 아래 기록을 버리는 필터를 단다. 하위 로거에 DEBUG 수준·핸들러를 직접 달거나 `ANTHROPIC_LOG=debug`를 켜도 남지 않는다. HTTP 라이브러리도 HTTPX2는 INFO에 서버가 보낸 상태 설명을, HTTPCore2는 DEBUG에 응답 머리글과 프로토콜 오류의 원문(받은 바이트)을 남겨, 두 라이브러리 로거에는 WARNING 아래 기록을 버리는 필터를 단다. worker 코드에서 HTTPX2를 쓰는 곳은 이 SDK뿐이다(GitHub 수집은 표준 라이브러리 HTTP를 쓴다).
- 호출별 줄에는 CatchU 요청 ID가 없어 요청 단위 「생성 종료」 줄과 시각으로 잇는다. 여러 요청을 동시에 처리하게 되면 #121에서 호출별 줄에 요청 ID를 넣는다.

## 만들 때 넘길 것

`ClaudeProvider(api_key, models)`. `api_key`는 값을 문자열·repr에 드러내지 않는 `AccessToken`이다. 키를 어디에 두고 어떤 환경변수로 읽을지는 처리 순서 연결(#121)과 운영 설정([#276](https://github.com/JminAILab/CatchU/issues/276))에서 정한다. 운영 환경에 `ANTHROPIC_CUSTOM_HEADERS`를 두면 어댑터를 만들 때 실패한다. 프록시를 거쳐야 하는 운영 환경이면 이 어댑터와 GitHub 수집 전송 모두 바꿔야 한다.

## 의존성

`anthropic==1.13.0`(2026-10-09 게시, Python 3.10 이상, `httpx2>=2.0.0,<3`). worker의 HTTPX2 2.13.0을 그대로 쓰고, 잠금 파일에는 `anthropic`·`docstring-parser`·`jiter`·`sniffio`만 새로 들어갔다(기존 패키지 판본 변경 없음). 어댑터가 HTTPX2·HTTPCore2(2.13.0)를 직접 불러와, 둘을 개발 의존성이 아니라 실행 의존성으로 적었다.

## 시험

`tests/test_generation_claude.py`. SDK는 진짜를 쓰고 HTTP 전송만 가짜(`httpx2.MockTransport`)로 바꾸며 네트워크 연결은 막는다. 확인하는 것:

- 정상 응답: 요청 본문 전체(모델·최대 출력·지시문과 자료 칸·생각 끔·`inference_geo`), 압축하지 않은 응답 요청, 호출 시간 제한, 로그의 모델 ID·토큰 수·요청 ID가 응답에서 온 값인지
- `max_tokens` 하한, 호출 종류별 모델과 생각 설정(생성·고쳐 쓰기 각각), 받지 않는 모델 거부
- 환경변수로 주소·키가 바뀌지 않음, `ANTHROPIC_CUSTOM_HEADERS` 거부, 기본 전송이 프록시 환경변수를 쓰지 않음, redirect를 따라가지 않음
- SDK DEBUG 로그(루트·SDK 로거 DEBUG, 하위 로거에 직접 단 핸들러, 만든 뒤 DEBUG로 바꿈)에 자료가 남지 않음
- SDK가 기본으로 다시 보내는 409·429·500·504·529(재시도를 권하는 머리글 포함), 시간 초과, 연결 실패에도 요청이 한 번뿐임. 두 번째 요청이면 성공하는 API에서도 호출 종류·모델과 관계없이 정해진 모델로 한 번만 보냄
- 호출 전체의 마감: 조각을 천천히 계속 보내 마감을 넘기면 시간 초과(생성 45초·고쳐 쓰기 20초), 마감 안에 다 오면 정상, 머리글이 마감 뒤에 오면 본문을 읽지 않음, 본문 끝이 마감 뒤에 오면 시간 초과. 시계는 시험용 합성 시계로 바꿔 실제로 기다리지 않는다
- 실제 HTTP 해석(HTTPCore2 아래 가짜 네트워크): 정상 응답, 프록시 환경변수가 있어도 api.anthropic.com:443에 바로 연결, 머리글·청크 구분 정보를 조금씩 보내거나 마지막 청크가 늦어도(정상·오류 응답) 정확히 45초에 끊김, HTTP 라이브러리 로그에 상태 설명·프로토콜 오류 원문이 남지 않음
- 기본 전송: 프록시·인증서 파일 환경변수를 읽지 않고 네트워크 백엔드를 감쌈
- 상태 코드별 원인 이름·오류 종류, 여러 상태 코드의 크레딧 소진, 로그·예외에 원문이 없고 SDK 예외가 이어지지 않음
- 거절·출력 상한에서 잘림·그 밖의 멈춤, 응답 값 목록·모양 확인, 응답 본문 상한(넘음·딱 맞음·작은 조각의 합이 넘음), 압축된 응답, 모양이 맞지 않는 HTTP 200 응답(잘못된 UTF-8·큰 정수·깊은 중첩 포함)
- 생성 흐름과 이어 돌린 정상 생성과 원인별 전체 호출 실패

응답은 공식 문서 모양을 본뜬 합성 값이다. 실제 API의 응답 시간·토큰 수·결과 품질은 이 시험으로 알 수 없다.

## 남은 확인

| 남은 일 | 시작 조건 |
|---|---|
| 실제 API 호출로 응답 시간(생성 45초·고쳐 쓰기 20초 안), 토큰 수, 생각 끔·`inference_geo`·Sonnet `between_tools` 설정과 `Accept-Encoding: identity` 수용, 오류 응답 모양 확인 | 팀장의 호출 허가(자료 범위·비용 한도). 합성·비식별 자료로 한다 |
| 실제 결과의 판본·자료 출처·모델 정보·검사 결과·남은 품질 한계 기록(#120 완료 기준) | 위 호출과 개발용 품질 확인 자료 결정 |
| 처리 순서에 잇기, 키 읽기, 요청 전체 마감 | #121, #276 |
| 실제 회원 자료 전송 | #138 고지, #37 조건 |
| Console 조직·작업 공간(미국 고정·지출 상한)·등급 확인 | 팀장(#119의 남은 조치) |
