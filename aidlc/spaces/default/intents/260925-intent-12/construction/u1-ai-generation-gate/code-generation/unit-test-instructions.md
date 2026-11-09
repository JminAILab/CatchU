# U1 AI 생성 관문 최소 경로 — Unit 시험 안내

## 시험 틀

- 실행기: api의 기존 실행기 `scripts/test-with-db.cjs`(Node 기본 `node:test`, `test/**/*.test.cjs`, 빌드된 `dist/`를 불러옴). 새 시험 도구나 설정 파일은 더하지 않는다.
- U1 시험은 DB를 쓰지 않지만, 실행기가 시작할 때 테스트 DB에 마이그레이션을 적용하므로 테스트 DB가 떠 있어야 한다(api README 「DB 테스트」).
- 시험 파일 위치: `api/test/ai-generation/`. 파일 이름은 `*.test.cjs`.

## 이 Unit만 돌리는 명령

`api/` 폴더에서 돌린다. 파일을 지정하면 실행기는 그 파일만 첫째 테스트 DB에서 돈다.

```bash
npm test -- test/ai-generation/citation-lines.test.cjs test/ai-generation/citation-request.test.cjs test/ai-generation/guarded-fetch.test.cjs test/ai-generation/response-items.test.cjs test/ai-generation/ai-generation-gate.test.cjs test/ai-generation/live-citation.test.cjs
```

`live-citation.test.cjs`(S8)는 `CATCHU_GENERATION_API_KEY`가 비었으면 건너뛰고 "미실행"을 출력한다. 실제로 돌릴 때는 키를 셸 환경변수로만 넣고 명령줄·파일·로그에 적지 않는다.

## 커버리지

팀장이 넣은 서비스 명령으로 U1 폴더만 잰다. 기준은 80% 줄이며 맨 아래 `all files` 줄로 본다.

```bash
TEST_COVERAGE_INCLUDE='dist/ai-generation/**' npm run test:coverage -- test/ai-generation/citation-lines.test.cjs test/ai-generation/citation-request.test.cjs test/ai-generation/guarded-fetch.test.cjs test/ai-generation/response-items.test.cjs test/ai-generation/ai-generation-gate.test.cjs
```

시험이 한 번도 불러오지 않은 파일은 표에 들어가지 않으므로 `src/ai-generation/`의 파일이 모두 표에 있는지 함께 본다. 실제 호출 시험은 커버리지에 넣지 않는다(키가 없으면 돌지 않음).

## 시나리오·기대 결과·실패 조건

팀 시험 순서대로 구현 전에 정한 기준이다(기능 설계 S1~S9, 비기능 설계 시험 절). 시험 수는 구성 요소마다 5~8개, 합계 약 40개다.

| 파일 | 시나리오 | 기대 결과 | 실패 조건 |
|---|---|---|---|
| citation-lines | S1 `\r\n`·빈 줄·공백만 있는 줄·한글·이모지가 섞인 근거, 줄바꿈 없는 한 줄, 끝 줄바꿈, 빈 글 | 빈 줄은 블록 없음, 줄 위치가 원문 UTF-16과 맞음 | 위치가 한 글자라도 어긋남 |
| citation-request | S2 근거 없음·모든 근거가 빈 줄뿐, S9 앞 근거가 빈 줄뿐인 경우의 대응표, 문서 context의 출처 종류, 지시·문서·`userText` 분리, `publicationText` 없음 | 호출하지 않음 표시, 대응표가 근거 위치를 가리킴 | 빈 근거가 문서가 됨, 문서 번호를 근거 위치로 씀 |
| guarded-fetch | redirect 응답, 본문 256 KiB 딱 맞음·넘음·작은 조각 합이 넘음, 정상 본문 | redirect·초과는 실패, 딱 맞음과 정상은 그대로 | redirect를 따라감, 상한을 넘겨 다 읽음 |
| response-items | S3 인용 있는 '- ' 줄·없는 줄·머리말, S4 여러 줄 블록 범위, S5 범위 밖 인용, S6 잘린 응답(남는 항목 있음·없음), 항목이 아닌 줄 수, 줄바꿈 뒤 시작하는 조각의 인용 | CITED·AI_INTERPRETATION 분류, 위치·원문 인용문·출처 이름, 버림 수, 잘림 처리 | 머리말이 항목이 됨, 인용이 다른 항목에 붙음, 잘린 항목이 나옴 |
| ai-generation-gate | 시험용 fetch로 기록한 HTTP 응답: 정상, S6 잘림, S7 거절·항목 없는 정상 끝·예상 밖 중단·연결 실패·오류 상태·시간 초과(짧은 시간 제한), S9 끝까지, 키 없음으로 생성 거부, 요청 본문(고정 주소·모델·생각 끔·처리 위치·재시도 0·인증 머리글이 키 하나), 로그 칸과 로그·오류에 근거 글·인용문·`userText`·키 없음 | 정상은 `GatedOutput`, 실패는 원인별 `AiProviderError`, 요청은 한 번뿐 | 빈 결과로 성공 처리, 다시 보냄, 로그에 원문 |
| live-citation(S8) | 근거 2개(GitHub 기록 1·작성자 자료 1, 각 10줄 안팎의 공개 가능한 합성 글), 시험 상수 출력 상한 | ① 중단 이유 출력 상한 ② CITED 1개 이상 ③ 모든 CITED 인용에서 Claude가 돌려준 인용 글 = 블록 범위 줄을 이어 붙인 글, location으로 자른 원문 = quote ④ 끝나지 않은 마지막 항목이 빠지고 `droppedCount`에 셈 ⑤ 예외 없음 | ①~⑤ 중 하나라도 어긋남. ①만 아니면 실패가 아니라 상수를 낮춰 다시 돌림 |

## 바꿔 끼우기와 시험 자료

- 기록한 응답은 Claude Messages API 응답 모양의 JSON을 시험 파일 안에 직접 만든다(인용은 블록 범위 모양). 실제 응답·실제 사용자 자료를 붙이지 않는다.
- 게이트 시험은 `createAiGenerationGate`에 시험용 fetch를 넘긴다. 지키는 fetch가 그 fetch를 감싸므로 redirect·본문 상한도 같은 방식으로 시험된다. 전역 `fetch`를 바꾸지 않는다.
- 시간 초과 시험은 짧은 시간 제한을 넘겨 실제로 오래 기다리지 않는다.
- 키는 `FAKE_GENERATION_KEY` 같은 가짜 값만 쓴다. 로그를 잡아 원문·키가 없는지 확인한다.
