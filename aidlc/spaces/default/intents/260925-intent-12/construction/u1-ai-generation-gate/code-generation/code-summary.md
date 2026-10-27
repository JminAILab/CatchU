# U1 AI 생성 관문 최소 경로 — 코드 요약

## 만든·바꾼 파일

| 파일 | 내용 |
|---|---|
| `api/src/ai-generation/ai-generation.types.ts` | C-01 모양(`AiSource`·`AiGenerationRequest`·`GatedItem`·`GatedOutput`), 오류 `AiProviderError`(`reason`과 로그용 `failure`·`status`·`requestId`), `AiInputTooLarge`(이름만, U1은 던지지 않음) |
| `api/src/ai-generation/citation-lines.ts` | 줄 나누개(BR1.1~BR1.3) |
| `api/src/ai-generation/citation-request.ts` | 요청 만들개: 인용 문서·문서 번호 → 근거 대응표·지시·사용자 메시지, 빈 근거는 호출 안 함(BR1.4·BR2.1·BR2.3) |
| `api/src/ai-generation/guarded-fetch.ts` | 지키는 fetch: redirect 거부, 압축을 푼 뒤 본문 256 KiB 상한(NFR2.2 ②③) |
| `api/src/ai-generation/claude-citation-client.ts` | Claude 호출기: 고정 주소·키 명시·인증 토큰 비움·재시도 0·시간 제한·SDK 로그 수준 고정·모델·생각 끔·처리 위치 미국(BR2.2, NFR2.1·2.2·4.1·4.4) |
| `api/src/ai-generation/response-items.ts` | 응답 묶개: 중단 이유 판정, '- ' 줄 항목, 잘린 마지막 항목, 항목 아닌 줄 수, 항목 0개 오류(BR3·BR5.1~BR5.4) |
| `api/src/ai-generation/citation-locator.ts` | 인용 위치 찾개: 대응표·블록 범위 → 원문 위치·원문 인용문·출처 이름, 연결 안 되면 버림(BR4) |
| `api/src/ai-generation/ai-generation.gate.ts` | 게이트와 `createAiGenerationGate`(키 없으면 생성 거부, 기본 45초·4,000 토큰), 오류 바꾸기, 호출 로그 한 줄(W1, BR5.5, NFR6.2·6.3) |
| `api/test/ai-generation/*.test.cjs`, `fixtures.cjs` | 기록한 HTTP 응답 시험 5개 파일과 실제 호출 시험(S8), 시험 자료 도우미 |
| `api/package.json`, `api/package-lock.json` | `@anthropic-ai/sdk` 0.133.0 정확한 버전 고정 |
| `api/docs/ai-generation.md` | U1 동작, 앱 미등록과 U2에 넘기는 것, S8 실행법·결과 기록, PR 「리뷰 요청」에 적을 보안 점검 차이, SDK 시간 제한 확인 결과 |
| `api/CONVENTIONS.md` | 파일 역할 표에 `src/ai-generation/`(기본 앱 미등록) |
| `api/.env.example` | `CATCHU_GENERATION_API_KEY` 주석을 U1 게이트·실제 호출 시험이 읽는다고 고침 |

api 앱 모듈에는 등록하지 않았다(비기능 설계 Q1).

## 주요 구현 결정

- **SDK 판본:** 0.133.0으로 정했다. 계획 Step 1이 요구한 설정 8개를 모두 지원한다(고정 주소, fetch 바꿔 끼우기, 시간 제한, 재시도 0, 인증 토큰 비우기, 생각 끔, 처리 위치, 사용자 정의 내용 인용 문서). 1.0.0은 나온 지 얼마 안 되었고, 0.134.0은 자동 추적이 들어가서 고르지 않았다.
- **생각 끔:** HAIKU는 `disabled`로 끈다. Sonnet 5.5는 `disabled`를 거부하므로, SONNET에는 문서상 가장 낮은 설정 `between_tools`를 보낸다. 10월 사전 시험 도구와 같은 값이다. Sonnet은 NFR3 조정 때 질의응답에만 쓴다.
- **SDK 로그 수준:** `warn`으로 고정해, `ANTHROPIC_LOG=debug`가 요청·응답 본문을 로그에 남기지 못하게 했다(NFR6.3).
- **실패 세부 원인(`failure`):** `AiProviderError`에 로그 구분용 칸을 더했다. 값은 고정 이름(연결 시간 초과·연결 실패·API 상태·redirect 거부·응답 크기 초과·잘못된 응답·알 수 없음)이고, `status`·`requestId`와 함께 남긴다. C-01의 오류 이름은 그대로다.
- **항목 아닌 줄 수:** 글자가 있지만 항목으로 인정하지 않은 줄만 센다. 빈 줄은 세지 않는다.
- **S8:** 출력 상한 상수 160, 시도 번호 1로 시작했고, 팀장 실행 결과에 따라 140, 시도 번호 2로 고쳤다(아래 「S8 실제 Claude 호출 결과」). 합격 기준 ③을 대조하려고, 기본 fetch에 응답 사본을 남기는 덧씌움을 붙였다. 지키는 fetch는 그 바깥을 그대로 감싼다. ①·④를 판정할 수 없는 응답은 실패가 아니라 "재실행 필요"로 건너뛴다.

## 시험과 검사 결과

`api/`에서 미커밋 변경을 포함해 2026-10-27에 돌렸다.

| 검사 | 결과 |
|---|---|
| Unit 시험 명령(`unit-test-instructions.md`) | 58개 중 57개 통과, 1개 건너뜀(S8 미실행) |
| 커버리지(`TEST_COVERAGE_INCLUDE='dist/ai-generation/**'`) | `all files` 줄 99.30%. 기준 80%를 넘음. `src/ai-generation/`의 파일 8개가 모두 표에 있음 |
| `npm run lint`, `npm run typecheck` | 통과 |
| 전체 `npm test`(회귀 확인) | 1,271개 통과, 실패 0, 22개 건너뜀(S8 포함) |

## S8 실제 Claude 호출 결과

`test/ai-generation/live-citation.test.cjs`를 팀장이 2026-10-27에 키를 셸 환경변수로 넣고 돌렸다. 키 값과 근거 글·인용문은 기록하지 않는다.

| 차수 | 출력 상한 상수 | 결과 |
|---|---|---|
| 1차(시도 1) | 160 | ①②③⑤ 통과, ④ 재실행 필요. 항목 3개를 다 쓴 뒤 빈 '- ' 줄에서 끊겨 버릴 항목이 없었다(`nonItemLineCount` 1) |
| 2차(시도 2, 임시 사본으로 실행) | 140 | ①~⑤ 모두 통과. 항목 2, `droppedCount` 1, 인용 대조 2건, 1.9초 |

시험 파일의 상수를 2차 값(`LIVE_MAX_OUTPUT_TOKENS` 140, `LIVE_RUN_ATTEMPT` 2)으로 고쳤다. 다른 코드는 바꾸지 않았다.

## 이번 단계에서 실행하지 않은 시험

- **S8을 고친 상수 그대로의 시험 파일로 다시 돌린 것:** 2차는 임시 사본으로 돌렸고, 상수를 고친 시험 파일 자체로는 다시 돌리지 않았다.
- **CI:** CI에서 같은 시험이 도는지는 이 단계에서 확인하지 않았다. S8은 CI에서 키가 없어 건너뛴다.

## 계획과 다른 점과 알려 둘 점

- 계획과 다르게 만든 것은 없다. 위 「주요 구현 결정」은 계획 안에서 정한 세부다.
- **SDK 시간 제한:** 0.133.0의 시간 제한은 응답 머리글이 올 때까지만 걸린다. 머리글 뒤 본문을 천천히 보내면 45초를 넘겨 기다릴 수 있다. 계획대로 새 장치는 넣지 않았고, 이 확인 결과를 `api/docs/ai-generation.md`와 PR 「리뷰 요청」 항목에 적었다.
- **`ANTHROPIC_CUSTOM_HEADERS`:** SDK가 이 환경변수 값을 머리글로 더하며, U1은 막지 않는다. 문서에 한계로 적었다.
- **S8 합격 기준 ③:** "블록 범위 줄을 이어 붙인 글"을 구분자 없이 이어 붙인 것으로 구현했다. 실제 실행에서 어긋나면 이 대조부터 확인한다.
- **`api/docs/environment.md`:** `CATCHU_GENERATION_API_KEY` 행이 없다(#389에서 빠짐). 계획 범위 밖이라 고치지 않았다.
- **테스트 DB:** 시험을 돌리려고 로컬 테스트 DB 컨테이너(`catchu-db-test`, 5433)를 띄웠다.
