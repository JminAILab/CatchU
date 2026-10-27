# AI 생성 관문 최소 경로 — U1

12월 intent(11월 개발)의 첫 Unit U1이 만든 `src/ai-generation/`의 동작·시험·한계다. 공용 계약 C-01 `AiGenerationGate.generate()` 하나를 실제 Claude 인용 호출로 끝까지 돌려, 응답을 항목으로 묶기·인용 보존·원문 위치 연결·거부 사례 처리(잘린 응답, 거절·빈 응답)를 확인한다.

기준 문서: [계약 C-01](../../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md), [U1 기능 명세](../../aidlc/spaces/default/intents/260925-intent-12/construction/u1-ai-generation-gate/functional-design/functional-spec.md)·[업무 규칙](../../aidlc/spaces/default/intents/260925-intent-12/construction/u1-ai-generation-gate/functional-design/rules.md), [U1 비기능 설계](../../aidlc/spaces/default/intents/260925-intent-12/construction/u1-ai-generation-gate/nfr-design/). 규칙 ID(BR·NFR)는 그 문서의 것이다.

## 앱 미등록과 쓰는 조건

- `src/ai-generation/`은 api 앱 모듈(`AppModule`·`application.module.ts`)에 **등록하지 않는다**. 게이트는 `createAiGenerationGate(config)`로만 만들고, 지금은 시험만 만든다(비기능 설계 Q1).
- U2가 숨긴 지시 방어 문구·입력 상한·기계 대조를 붙이기 전에는 시험 밖에서 `generate()`를 쓰지 않는다. 키가 없거나 Claude가 멈춰도 api 기동과 다른 기능에는 영향이 없다.
- 최소 연결이나 기록한 응답 시험의 통과를 U2·U5·U10의 실제 처리 성공으로 보지 않는다.

## 구성 요소

| 파일 | 하는 일 | 규칙 |
|---|---|---|
| `ai-generation.types.ts` | C-01 모양(`AiSource`·`AiGenerationRequest`·`GatedItem`·`GatedOutput`·`AiGenerationGate`)과 오류 `AiProviderError`(원인 `reason`)·`AiInputTooLarge`(이름만, U1은 던지지 않음) | C-01 |
| `ai-generation.gate.ts` | `createAiGenerationGate`(설정 검사)와 게이트. W1 순서로 아래를 부르고 실패를 `AiProviderError`로 바꾸며 호출마다 로그 한 줄 | W1, BR2.4, BR5.5, NFR1.1, NFR6.2·6.3 |
| `citation-lines.ts` | 근거 글을 줄로 나누고 줄마다 UTF-16 위치 기록 | BR1.1~BR1.3 |
| `citation-request.ts` | 인용 문서·문서 번호 → 근거 대응표·시스템 지시·사용자 메시지 | BR1.4, BR2.1, BR2.3, NFR2.3 |
| `guarded-fetch.ts` | SDK에 넘기는 fetch를 감싸 redirect 거부·응답 본문 256 KiB 상한 | NFR2.2 ②③ |
| `claude-citation-client.ts` | 공식 SDK 클라이언트 설정과 한 번 호출, 응답을 `ProviderResponse`로 옮김 | BR2.2, NFR2.1, NFR2.2 ①④, NFR4.1·4.2·4.4 |
| `response-items.ts` | 중단 이유 판정, 조각을 줄로 이어 항목 고르기, 잘린 항목·항목 아닌 줄 셈 | BR3, BR5.1~BR5.4 |
| `citation-locator.ts` | 대응표로 근거 찾기, 블록 범위 → 원문 위치·원문 인용문·출처 이름 | BR4 |

## 동작

### 만들기

`createAiGenerationGate({ apiKey, maxOutputTokens?, timeoutMs?, fetch? })`

- `apiKey`: 호출하는 쪽이 `CATCHU_GENERATION_API_KEY`에서 읽어 넘긴다. 비었거나 공백뿐이면 게이트를 만들지 않고 오류로 멈춘다(오류에 키 값 없음). SDK가 스스로 읽는 `ANTHROPIC_API_KEY`·`ANTHROPIC_AUTH_TOKEN`은 쓰지 않는다(키를 늘 명시하고 `authToken: null`).
- `maxOutputTokens`: 출력 상한, 기본 4,000. `timeoutMs`: 시간 제한, 기본 45,000. 1 이상의 정수가 아니면 거부한다.
- `fetch`: 실제 전송 fetch(기본 전역 fetch). 무엇을 넘겨도 지키는 fetch로 감싼다. 기록한 응답 시험이 이 자리에 시험용 fetch를 넣는다.

### generate() 한 번(기능 설계 W1)

1. 근거마다 글을 `\n`에서만 나누고 줄바꿈 바로 앞 `\r`을 뺀다. 비었거나 공백뿐인 줄은 블록 번호 없이 건너뛰고, 넘기는 줄마다 근거 글 안 UTF-16 [시작, 끝)을 기록한다.
2. 줄이 있는 근거만 근거 순서대로 인용이 켜진 사용자 정의 내용 문서(줄마다 글 블록 하나, `context`는 `자료 종류: GitHub 기록 원문` / `자료 종류: 작성자 자료 원문`)로 만들고 문서 번호 → 근거 위치 대응표를 함께 만든다. 근거가 없거나 남은 문서가 없으면 부르지 않고 `{ items: [], droppedCount: 0 }`.
3. 시스템 지시 = 항목 형식 지시 + `instruction`. 사용자 메시지 = 문서들, 그 뒤 `userText`(있을 때). `publicationText`는 보내지 않는다.
4. Claude를 한 번 부른다: 주소 `https://api.anthropic.com` 고정(`ANTHROPIC_BASE_URL` 무시), 재시도 0, 모델 `HAIKU` → `claude-haiku-5-5`·`SONNET` → `claude-sonnet-5-5`, 처리 위치 `inference_geo: "us"`, 생각 끔. 생각 끔은 모델마다 값이 다르다: Haiku 5.5는 `{ type: "disabled" }`, Sonnet 5.5는 `disabled`에 400을 내므로 가장 낮은 설정인 `{ type: "between_tools" }`(도구가 없는 이 호출에서는 생각 없이 답함). 구조화된 출력은 쓰지 않는다(인용과 함께 쓸 수 없음).
5. 응답 처리(W2): 거절은 `REFUSED`, 정상 끝·출력 상한 밖의 중단 이유는 `UNEXPECTED_STOP`. 글 조각을 이어 줄로 나누고 조각의 인용을 그 조각의 첫 줄바꿈 아닌 글자가 놓인 줄에 붙인다. `'- '`로 시작하고 뒤에 글자가 있는 줄만 항목이다. 출력 상한에서 끝났으면 마지막 줄바꿈 뒤의 줄은 끝나지 않은 줄이라 그 줄이 항목이면 버리고 센다. 인용은 대응표로 근거를 찾아 블록 범위 [시작, 끝)의 첫 줄 시작~마지막 줄 끝을 `location.charStart`에 더한 위치, 그 범위의 원문(`quote`), 출처 이름으로 바꾼다. 연결되지 않는 인용이 하나라도 있으면 그 항목을 버리고 센다. 인용이 있으면 `CITED`, 없으면 `AI_INTERPRETATION`. 남은 항목이 0개면 `NO_ITEMS`.

### 실패

모두 `AiProviderError` 하나로 던지며 자동으로 다시 부르지 않는다. 메시지에는 원인 이름만 있고 근거 글·키·SDK 원문 메시지가 없다.

| 일어난 일 | `reason` | `failure` |
|---|---|---|
| 시간 초과 | `CALL_FAILED` | `CONNECTION_TIMEOUT` |
| 연결 실패 | `CALL_FAILED` | `CONNECTION_FAILED` |
| 오류 상태 응답(4xx·5xx, `status`에 상태 코드) | `CALL_FAILED` | `API_STATUS` |
| redirect 응답 | `CALL_FAILED` | `REDIRECT_REJECTED` |
| 응답 본문 256 KiB 초과(압축을 푼 뒤 바이트) | `CALL_FAILED` | `RESPONSE_TOO_LARGE` |
| 응답이 JSON·Messages API 모양이 아님 | `CALL_FAILED` | `INVALID_RESPONSE` |
| 그 밖의 호출 오류 | `CALL_FAILED` | `UNKNOWN` |
| 거절로 끝남 | `REFUSED` | — |
| 정상 끝·출력 상한·거절 밖의 중단 이유 | `UNEXPECTED_STOP` | — |
| 낼 항목이 0개 | `NO_ITEMS` | — |

### 로그

호출마다 Nest `Logger`(맥락 `ClaudeAiGenerationGate`)로 한 줄을 남긴다. 칸: `event`(`AI_GENERATION_COMPLETED`·`AI_GENERATION_DROPPED`·`AI_GENERATION_FAILED`), `feature`, `stopReason`, `failure`(예: `CALL_FAILED/API_STATUS:429`), `itemCount`, `droppedCount`, `nonItemLineCount`(글자가 있지만 항목으로 인정하지 않은 줄 수, 빈 줄은 세지 않음), `inputTokens`, `outputTokens`, `durationMs`, `requestId`(Anthropic 요청 ID). 정상은 정보, 버림·실패는 경고다. 근거 글·인용문·`userText`·키는 남기지 않는다. SDK 자체 로그는 `logLevel: 'warn'`으로 고정해 `ANTHROPIC_LOG=debug`가 요청·응답 본문을 남기지 못하게 했다.

## U2에 넘기는 것

- Nest 모듈 등록·주입, 숨긴 지시 방어·역량 평가 표현 금지 공통 문구, 입력 상한(`AiInputTooLarge`), 숫자·PR 번호·파일 이름·영어 표기 기계 대조와 버림(버림은 `droppedCount`에 더함), `generateStream`(QNA).
- 줄 규칙(BR1)과 위치 계산(BR4)은 U2가 그대로 쓴다.
- U5·U10은 C-01 모양 그대로 부르고, `AiProviderError`를 받으면 다시 부르지 않고 실패로 기록한다.

## 시험

`api/`에서 돌린다. 실행기가 시작할 때 테스트 DB에 마이그레이션을 적용하므로 테스트 DB가 떠 있어야 한다(README 「DB 테스트」). U1 시험 자체는 DB를 쓰지 않는다.

```bash
npm test -- test/ai-generation/citation-lines.test.cjs test/ai-generation/citation-request.test.cjs test/ai-generation/guarded-fetch.test.cjs test/ai-generation/response-items.test.cjs test/ai-generation/ai-generation-gate.test.cjs test/ai-generation/live-citation.test.cjs
TEST_COVERAGE_INCLUDE='dist/ai-generation/**' npm run test:coverage -- test/ai-generation/citation-lines.test.cjs test/ai-generation/citation-request.test.cjs test/ai-generation/guarded-fetch.test.cjs test/ai-generation/response-items.test.cjs test/ai-generation/ai-generation-gate.test.cjs
```

- 기록한 응답 시험(S1~S7·S9와 보안·신뢰성 항목)은 Claude Messages API 응답 모양의 JSON을 시험 파일 안에서 만들고, `createAiGenerationGate`에 시험용 fetch를 넘겨 돌린다. 전역 fetch를 바꾸지 않고 키는 가짜 값만 쓴다. 시험 자료 도우미는 `test/ai-generation/fixtures.cjs`다.
- 2026-10-27 로컬 결과(미커밋 변경 포함): 위 Unit 명령 58개 중 57개 통과·1개 건너뜀(실제 호출, 키 없음). 커버리지 `all files` 줄 99.30%(기준 80%), `src/ai-generation/`의 8개 파일이 모두 표에 있다. `npm run lint`·`npm run typecheck` 통과.

### 실제 호출 시험(S8)

`test/ai-generation/live-citation.test.cjs`. 셸 환경변수 `CATCHU_GENERATION_API_KEY`가 있을 때만 실제 Claude를 한 번 부르고, 없으면 건너뛰며 `{"test":"S8","status":"미실행",...}`을 출력한다(통과가 아니다). CI에는 키가 없어 건너뛴다.

```bash
# 키는 셸 환경변수로만 넣는다. 명령줄 기록·파일·로그·PR에 적지 않는다.
npm test -- test/ai-generation/live-citation.test.cjs
```

- 근거: 공개해도 되는 합성 글 2개(GitHub 기록 1, 작성자 자료 1, 각 10줄). 출력 상한은 시험 파일의 상수 `LIVE_MAX_OUTPUT_TOKENS`(처음 160, 2차부터 140)다. 게이트는 기본 fetch로 만들고, 합격 기준 ③ 대조를 위해 응답 사본만 따로 읽는다.
- 합격 기준(모양으로 본다): ① 중단 이유가 출력 상한 ② `CITED` 1개 이상 ③ 모든 `CITED` 인용에서 Claude가 돌려준 인용 글 = 블록 범위 줄을 이어 붙인 글, 사본 필드를 `location`으로 잘라 낸 글 = `quote` ④ 끝나지 않은 마지막 항목이 빠지고 `droppedCount`에 셈 ⑤ 예외 없음.
- 응답이 상한 전에 끝났거나 항목 중간에서 잘리지 않아 ①·④를 볼 수 없으면 실패가 아니라 "재실행 필요"로 건너뛴다. `LIVE_MAX_OUTPUT_TOKENS`를 낮추고 `LIVE_RUN_ATTEMPT`를 1 올려 다시 돌린다.
- 결과 기록: 시험이 JSON 한 줄로 출력한다. 칸은 `maxOutputTokens`(쓴 상한 상수), `attempt`(다시 돌린 횟수), `criteria`(①~⑤ 각각의 결과), `responseBodyBytes`(응답 본문 크기), `stopReason`, `itemCount`, `droppedCount`, `citationChecks`. 근거 글·인용문·키는 넣지 않는다. 팀장이 이 줄을 PR과 '최소 연결 첫 결과' 승인 자료에 붙인다.
- 결과(2026-10-27, 팀장 실행):
  - 1차(`LIVE_MAX_OUTPUT_TOKENS` 160, 시도 1): ①②③⑤ 통과, ④ 재실행 필요. 항목 3개를 다 쓴 뒤 빈 '- ' 줄에서 끊겨 버릴 항목이 없었다(`nonItemLineCount` 1).
  - 2차(140, 시도 2, 임시 사본으로 실행): ①~⑤ 모두 통과. 항목 2, `droppedCount` 1, 인용 대조 2건, 1.9초.
  - 시험 파일 상수는 2차 값(140, 시도 2)으로 고쳤다. 상수를 고친 시험 파일(140, 시도 2)로 2026-10-27 다시 돌려 ①~⑤ 모두 통과했다(항목 2, `droppedCount` 1, 인용 대조 2건). 키 값과 근거 글·인용문은 기록하지 않는다.

## SDK 확인 결과

- 판본: `@anthropic-ai/sdk` `0.133.0`(2026-10-09 배포, 정확한 버전과 잠금 파일). Haiku 5.5 모델 이름(0.132.0)과 `between_tools`(0.129.0)가 들어간 뒤의 판본이다. 0.134.0은 전역 추적 공급자가 있으면 SDK가 스스로 추적 구간을 만드는 기능을, 1.0.0(2026-10-21)은 새 API 판본을 넣어 이번에는 고르지 않았다.
- 계획 1단계의 설정을 모두 지원한다: 주소(`baseURL`), fetch 바꿔 끼우기(`fetch`), 시간 제한(`timeout`, 밀리초), 재시도(`maxRetries: 0`), 인증 토큰 자리 비우기(`authToken: null`), 생각 끔(`thinking`의 `disabled`·`between_tools`), 처리 위치(`inference_geo`), 인용 문서(`document`의 `source.type: "content"`, `citations.enabled`, `context`, 응답의 `content_block_location` 인용).
- **SDK 시간 제한은 응답 본문 읽기까지 걸리지 않는다.** 0.133.0 `src/client.ts`의 `fetchWithTimeout`은 fetch가 응답 머리글을 돌려줄 때까지만 타이머를 걸고 `finally`에서 지운다. 그 뒤 본문을 JSON으로 읽는 동안에는 시간 제한이 없다. 본문 크기는 지키는 fetch가 256 KiB로 막지만, 머리글 뒤 본문을 아주 천천히 보내는 응답은 45초를 넘겨 기다릴 수 있다. 비기능 요구사항이 단계별 마감을 두지 않기로 했으므로(NFR2.2) 새 장치를 더하지 않고 여기에 기록만 한다.
- `ANTHROPIC_CUSTOM_HEADERS` 환경변수는 SDK가 기본 머리글로 더한다. U1은 이 변수를 막지 않는다(배포 환경에 두지 않는다).

## PR 「리뷰 요청」에 적을 보안 점검 차이

[보안 점검](../../docs/CatchU_security_checks.md) 「LLM·검색 기능」 가운데 U1이 지키지 않는 것이다(비기능 NFR2.4).

- 숨긴 지시 방어 문구와 역량 평가 표현 금지는 U2가 넣는다. U1은 근거 글과 `userText`를 시스템 지시와 분리해 보내기만 한다.
- 입력 크기 상한(`AiInputTooLarge`)은 U2가 넣는다. U1은 출력 상한·응답 본문 상한·시간 제한만 둔다.
- 생성 문장과 근거의 대조(숫자·PR 번호·파일 이름·영어 표기)는 U2의 기계 대조다. U1은 인용과 원문 위치만 붙인다.
- 보내기 전 비밀값·개인정보 가리기는 근거를 모으는 호출 Unit 몫이다(구직자 본인 자료는 첫 이용 동의 아래 그대로 보낸다).
- U2가 붙기 전에는 게이트를 앱에 등록하지 않아 시험 밖에서 `generate()`를 쓰지 않는다.
- SDK 시간 제한은 본문 읽기에 걸리지 않는다(위 「SDK 확인 결과」).

## 한계

- 인용 조각 하나가 두 항목 줄에 걸치는 경우는 따로 막지 않는다. 조각의 첫 글자가 놓인 줄에 붙는다(사전 시험 0/215).
- 호출 Unit이 넘기는 `AiSource.text`가 사본 필드의 `[location.charStart, location.charEnd)` 원문 그대로라고 보고 따로 검사하지 않는다.
- 회로 차단기·대체 모델·캐시·지표·분산 추적은 두지 않는다. 거절에 대한 서버 쪽 대체 모델(`fallbacks`)도 쓰지 않는다.
