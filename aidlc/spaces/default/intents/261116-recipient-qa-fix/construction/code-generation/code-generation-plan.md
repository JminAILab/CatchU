# 코드 생성 계획 — #559 받은 사람 질의응답 고치기

## Summary

- Builds: 질의응답 근거 목록 함수(같은 Catch 줄 붙이기·Catch 머리글), 실패 로그 칸 셋, 지시 한 번 수정, 평가 스크립트 공용 함수 사용, 출처 딱지 옆 항목 제목
- Touches: `api/src/ai-generation/`(types·citation-request·checked-gate), `api/src/rag-answer/`(새 qna-sources·qna-service·qna.controller·config·log), `api/scripts/rag-eval/`, `web/src/features/rag-answer/`·`recipient/recipient-view.tsx`·`publications/publication-detail-view.tsx`, 서비스 문서 4개와 계약 C-01·C-11 한 줄씩
- Tests: 새 시험 파일 2개(api `qna-sources`, web `rag-answer-item-title`)와 기존 시험 5개 파일에 사례 추가, 약 17개(머리글 글자를 답에 옮겨도 남는지 포함). 실제 Claude·Voyage 측정 두 번(기준선, 다시 재기)은 팀장 확인 뒤

## 근거와 범위

- 요구사항: `aidlc/spaces/default/intents/261116-recipient-qa-fix/inception/requirements-analysis/requirements.md`(FR1~FR7, NFR1~NFR4). 이슈 #559 본문(2026-11-16 판)이 범위의 정본이다.
- 코드 기록: `aidlc/spaces/default/codekb/CatchU/`(`architecture.md` 「받은 사람 질의응답」·「답 항목 0개의 세 길」).
- 이 일은 Unit이 없는 bugfix다. 기능 설계·계약 설계 단계가 없으므로 계약은 12월 intent의 `contract-design/contract-summary.md`(C-01·C-09·C-10·C-11)를 따른다.
- 화면: 승인된 다듬은 화면 interaction-spec(`261109-new-catch/inception/refined-mockups/interaction-spec.md`)에는 답·요약 항목(`GatedItemView`)이 없다. 그래서 대조해 어긋날 자리가 없다. 제목은 Tab 순서 밖의 보이는 글자로 둔다(Step 12).

## 설계 결정

1. **붙일 줄은 사본에서 가져온다(계약 C-09 그대로).**
   - 검색 결과(`ChunkHit`)에는 맞은 줄만 있다. 같은 Catch의 다른 줄은 발행 사본에서 가져온다.
   - 사본은 C-10 `readSnapshot`으로 읽는다. 질의응답 컨트롤러가 이미 주입받아 쓰는 `PublicationAccess`다. 평가 스크립트도 이미 사본을 읽는다.
   - 사본 → 근거 바꾸기는 기본 요약이 쓰는 `buildSummarySources`(`api/src/rag-answer/summary-sources.ts`)를 그대로 다시 쓴다. 바꾸는 코드를 새로 베끼지 않는다.
   - 위치는 그 칸 전체 범위다(`[0, 길이)`). 같은 칸 하나 안이라 C-01 그대로다.
   - 검색으로 맞은 줄은 검색 결과의 범위를 그대로 쓴다. 같은 칸이 두 번 들어가지 않게, 항목 ID와 칸 이름이 같으면 하나만 남긴다.
2. **사본은 스트림을 열기 전에 읽는다.**
   - `admit`의 색인 확인 다음, 질문 수 세기 앞에서 읽는다.
   - 읽기가 `NotFound`이면, 판정 직후 삭제된 것이다. 그래서 C-10 deletion-rule대로 `404 LINK_UNAVAILABLE`로 거부한다. 이때는 세기 전이라 되돌릴 차감이 없다.
3. **Catch 머리글은 근거의 선택 칸 하나로 넘긴다(계약 C-01 더하는 변경).**
   - `AiSource`에 선택 칸 `itemContext?: string`을 더한다. 게이트는 인용 문서 `context`를 다음처럼 만든다: `자료 종류: …` + (값이 있으면 ` · ` + 값).
   - 기본 요약·JD 요약은 이 칸을 넣지 않으므로 지금과 같다.
   - 기계 대조는 인용한 줄만 보므로 바뀌지 않는다. 입력 길이 검사(`AI_INPUT_MAX_CHARS`)에는 이 칸도 센다.
4. **질의응답 근거 목록 함수 하나**: `api/src/rag-answer/qna-sources.ts`의 `buildQnaSources(hits, snapshot)`. 순수 함수이고, `{ sources, unattachedLineCount }`를 돌려준다.
   - 앱 `answerQuestion`과 평가 스크립트가 같이 부른다(FR7).
   - 값은 `rag-answer-config.ts`에 둔다: `QNA_ATTACH_PER_CATCH_LIMIT = 12`, `QNA_SOURCE_TOTAL_LIMIT = 40`, `QNA_ITEM_CONTEXT_MAX_LENGTH = 200`. 주석에 다음을 적는다: 11/12 위치에 맞춘 시작 값이고, 다시 잰 뒤 고치지 않는다.
5. **보내는 순서.**
   - Catch 순서: 그 Catch의 가장 높은 검색 순위 순
   - Catch 하나 안: 검색으로 맞은 줄(순위 순) → 붙인 줄(FR1.4 순서)
   - Catch가 아닌 항목(텍스트·PDF 자료)의 맞은 줄: 자기 순위 자리
   - 이렇게 같은 Catch의 줄이 모델에게 이어져 보인다.
6. **머리글 글자: 숫자와 영문자를 쓰지 않는다(코드 계획 변경 요청 1번).**
   - 이유: 답 검사는 답에 있는 숫자·영어 표기가 그 항목이 인용한 줄에 있어야 통과시킨다. 머리글은 인용할 수 없다. 그래서 「발행 항목 2번」이나 「Catch」·「PDF」 같은 낱말을 모델이 답에 따라 쓰면 그 항목이 버려진다.
   - 그래서 요구사항 FR2.2의 「발행 항목 순번」은 쓰지 않는다. 이 계획에서 정한 차이이고, code-summary에도 적는다.
   - 머리글은 항목 종류마다 다음과 같다. 고정 글자는 모두 한글이다.

     | 항목 | 머리글(`itemContext`) |
     |---|---|
     | 작업 사실 둘째 줄이 있는 Catch | `이 줄이 속한 작업: {workFacts[1]}` |
     | 둘째 줄이 없는 Catch | `이 줄이 속한 작업: 「{표}」 작업(기록 제목 없음)` |
     | 텍스트 자료 | `이 줄이 속한 자료: 「{표}」 텍스트 자료` |
     | PDF 자료 | `이 줄이 속한 자료: 「{표}」 올린 문서` |

   - `{표}`는 숫자 대신 쓰는 한글 한 글자다. 발행 순서대로 가·나·다·라·마·바·사·아·자·차·카·타·파·하·거·너·더·러·머·버를 매긴다. 발행본 항목은 최대 20개이므로(`publications-config.ts` `itemsMax: 20`) 20자로 모자라지 않는다. 화면 번호와 따로이므로 `position`이 0부터인지 1부터인지와 상관없다.
   - 둘째 줄이 있는 Catch는 그 줄로 가른다. 둘째 줄이 같은 Catch가 둘 이상이면 둘 다 `{표}`를 붙여 가른다: `이 줄이 속한 작업: 「{표}」 {workFacts[1]}`.
   - 한계: 둘째 줄(PR 제목·커밋 첫 줄)에는 숫자·영문자가 들어 있을 수 있다. 그 줄은 ② 작업 사실 줄로 붙여 보내므로 모델은 그 줄을 인용할 수 있다. 하지만 다른 줄을 인용한 답에 둘째 줄의 낱말을 섞으면 버려질 수 있다. 이것은 막지 않고 버린 항목 수로 본다(설계 결정 9).
   - 지금 있는 머리 글자 「자료 종류: GitHub 기록 원문」의 영어 「GitHub」는 이번 일 전부터 있던 것이라 그대로 둔다.
   - 둘째 줄 글 다듬기(코드 계획 변경 요청 3번). 작성자가 쓴 글이기 때문이다.
     - 줄바꿈(`\r`·`\n`·U+2028·U+2029)은 빈칸 하나로 바꾼다.
     - 그 밖의 제어 문자(유니코드 Cc)와 글 방향 제어 문자(U+200E·U+200F·U+202A~U+202E·U+2066~U+2069)는 지운다.
     - 겹친 빈칸을 하나로 줄이고 앞뒤 빈칸을 뗀 다음, 앞 200자(UTF-16)까지 자른다. 서로게이트 쌍은 가운데서 자르지 않는다. 다듬은 뒤 빈 글이면 둘째 줄이 없는 것으로 본다.
   - `workFacts[1]`은 칸 위치로만 고른다. worker 문장을 글자로 대조하지 않으므로 두 쪽 문장을 맞춰 보는 시험은 필요 없다(FR2.2).
7. **지시문(FR3.1).** `QNA_INSTRUCTION`의 앞 문장만 아래로 바꾼다. 끝의 `AUTHOR_MATERIAL_VOICE_INSTRUCTION`은 그대로 둔다.
   > 발행본 자료만으로 질문에 답하고 근거가 되는 줄을 인용한다. 첫 항목에는 질문에 대한 답을 쓴다. 찾은 자료로 답할 수 없으면 첫 항목에 「찾은 자료에서는 확인되지 않는다」고 쓰고, 발행본에 없다고 단정하지 않는다.

   FR5.3에 따라 기준선 결과가 항목 꼴 문제이면, 이 한 번의 수정 안에 그 고침을 함께 넣는다(Step 7). 그때는 문구를 팀장에게 보이고 정한다.
8. **화면 제목.**
   - 순수 도우미 `web/src/features/rag-answer/item-title.ts`를 둔다.
     - `itemTitleFinder(items)`: 사본 항목 목록에서 `publishedItemId → title` 찾기 함수를 만든다.
     - `citationItemTitle(location, finder)`: 인용 위치의 제목을 찾고, 없으면 `null`을 준다.
   - `GatedItemView`에 선택 prop `itemTitleOf`를 더하고, 두 패널(`BaseSummaryPanel`·`QnaPanel`)이 그 prop을 받아 넘긴다.
   - 받은 사람 화면은 `RecipientPublicationView`가 가진 사본으로 함수를 만들어 `RecipientSlots`에 넘긴다. `RecipientSlotProps` 모양은 그대로다.
   - 작성자 발행본 화면은 `PublicationDetailView`의 `detail.snapshot`으로 만든다.
   - `.tsx`는 시험이 불러오지 않으므로(README 「시험」), 판단은 순수 도우미에 두고 시험한다.
9. **버린 항목 수를 기준선과 다시 재기에 나란히 적는다(코드 계획 변경 요청 2번).**
   - 평가 스크립트가 질문마다 게이트 로그(`ai_gate_result`·`ai_gate_failed`)의 수 칸을 받아 원문 결과(`api/.rag-eval/*.json`)와 평가 기록에 적는다. 수 칸은 `itemCount`·`droppedCount`·`dropReasons`(`fact`·`location`·`truncated`)·`nonItemLineCount`·`stopReason`·`failure`이고, 글은 받지 않는다.
   - 받는 방법: 평가 스크립트 안에서만 Nest `Logger.overrideLogger`로 로그를 가로채 질문 번호에 묶는다. 게이트와 계약 모양(C-01 `GatedOutput`)은 바꾸지 않는다.
     - 가로채기가 Nest 판본 때문에 되지 않으면, 대신 `GatedOutput`에 로그용 선택 칸 `dropReasons`를 더한다. 이것은 C-01 더하는 변경이라 계약 문서에 한 줄을 더한다. 어느 쪽으로 했는지 code-summary에 적는다.
   - 이 기록은 단계 A에 넣는다. 기준선에서도 같은 칸이 남아야 하기 때문이다. 이것은 기록만 바꾸고, 모델에 보내는 요청 만들기(FR7)는 건드리지 않는다. 그래서 기준선은 11/12와 같은 조건이다.
   - 같은 장치로 FR5.4(로그 칸이 평가 경로에서도 찍히는지)도 기록에 남는다.
   - 다시 재기 기록에는 기준선과 다시 재기의 질문별 `dropReasons.fact`를 나란히 둔 표를 넣는다. 머리글 때문에 버린 항목이 늘었는지 보기 위해서다. 표는 빌드와 시험 단계에서 쓴다.

## 바뀌는 파일과 영향

| 파일 | 바꾸는 것 | 영향 |
|---|---|---|
| `api/src/ai-generation/checked-gate.ts` | `fail()` 로그에 칸 셋 더하기(FR5.1). 한 번 호출·스트리밍이 같은 `fail()`을 쓴다 | 세 AI 모두의 실패 로그 칸이 늘어난다(글 없음) |
| `api/src/ai-generation/ai-generation.types.ts` | `AiSource.itemContext?` | C-01 더하는 변경. 기존 호출 그대로 유효 |
| `api/src/ai-generation/citation-request.ts` | `context`에 `itemContext`를 덧붙임 | 값이 없는 기본 요약·JD는 그대로 |
| `api/src/ai-generation/gate-policy.ts` | 입력 길이에 `itemContext` 셈 | 상한 80,000자는 그대로 |
| `api/src/rag-answer/qna-sources.ts`(새) | `buildQnaSources` | 앱·평가 스크립트 공용 |
| `api/src/rag-answer/rag-answer-config.ts` | 상한 값 셋과 `QNA_INSTRUCTION` 앞 문장 | 기본 요약·JD 지시는 그대로 |
| `api/src/rag-answer/qna-service.ts` | 입력에 사본을 받아 `buildQnaSources`로 근거를 만들고, 결과에 `unattachedLineCount` | `chunkToSource`는 `buildQnaSources` 안에서 계속 씀 |
| `api/src/rag-answer/qna.controller.ts` | `admit`에서 사본 읽기, `NotFound`면 404 | 받은 사람 질문 한 번에 DB 읽기 하나 늘어남 |
| `api/src/rag-answer/rag-answer-log.ts` | `QnaCompleted.unattachedLineCount` | 로그 칸 하나 |
| `api/scripts/rag-eval/rag-eval.cjs`·`rag-eval-report.cjs` | 질의응답 요청을 `buildQnaSources`로 만들기, 질문별 못 붙인 줄 수 기록 | 검색 적중률 계산(12개)은 그대로 |
| `web/src/features/rag-answer/item-title.ts`(새)·`gated-item-view.tsx`·`base-summary-panel.tsx`·`qna-panel.tsx`·`rag-answer.module.css` | 제목 표시 | JD 화면(`JdItemView`)은 그대로 |
| `web/src/features/recipient/recipient-view.tsx` | `RecipientSlots`에 제목 찾기 함수 넘기기 | 받은 사람 화면 담당(팀원 3) 영역. PR 리뷰에서 맞춘다 |
| `web/src/features/publications/publication-detail-view.tsx` | 작성자 요약 패널에 제목 찾기 함수 넘기기 | 작성자 발행본 화면 |

## 함께 고칠 문서

같은 규칙을 적은 곳을 모두 찾았다. 찾은 방법은 `QNA_INSTRUCTION`·`SOURCE_KIND_CONTEXT`·`ai_gate_failed`·`chunkToSource`·`qna.completed`·`RecipientSlotProps`를 grep한 것이다.

- `api/docs/rag-answer.md`: 붙이기 규칙·상한·시작 값, 지시문, 로그 칸(`qna.completed`), 알려진 한계 둘(FR6.3), 12월 FR6.2 읽는 법 한 줄, 평가 스크립트가 같은 함수를 쓴다는 것(FR6.1)
- `api/docs/ai-generation.md`: 인용 문서 머리글(`itemContext`), 실패 로그 칸(FR5.1)
- `web/src/features/rag-answer/README.md`: 제목 표시와 새 선택 prop, 「붙이는 방법」
- `web/src/features/recipient/README.md`: 2·3번 자리에 넘기는 값 한 줄(현재 `RecipientSlotProps`를 적은 곳)
- 계약 `aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md`:
  - C-01 `AiSource`에 선택 칸 `itemContext` 한 줄. 제공 담당은 팀장이다.
  - C-11 2·3번 자리 설명에 선택 prop 한 줄(FR4.3). 팀원 3과 PR 리뷰에서 맞춘다.
  - 계약 수정 규칙(더하는 변경은 제공 쪽이 계약 문서와 함께 고친다)에 따른다. `reviews/` 아래 지난 검토 기록과 승인된 기능 설계는 고치지 않는다(FR6.4).
- 코드 머리 주석: `qna-service.ts`(「검색 조각을 그대로 근거로 옮긴다」), `citation-request.ts`(`SOURCE_KIND_CONTEXT`), `recipient-slots.ts`·`recipient-view.tsx`·두 패널의 C-11 주석

## 시나리오·기대 결과·실패 조건 (먼저 정함, 팀 Testing Posture)

| 번호 | 시나리오 | 기대 결과 | 실패 조건 | 요구 |
|---|---|---|---|---|
| S1 | 검색 8개 가운데 Catch A의 `evidence[1].representedFacts[0]` 하나가 맞음 | 같은 근거의 `evidence[1].representedFacts[1]`부터, 그다음 작업 사실·나의 기여, 그다음 `evidence[0]`·`evidence[2]`…를 사본 순서로 붙임 | 순서가 다르거나 같은 칸이 두 번 들어감 | FR1.2·FR1.4 |
| S2 | 줄이 31개인 큰 Catch가 맞음 | 그 Catch에는 12줄까지만 붙이고, 나머지 줄 수를 `unattachedLineCount`에 셈 | 13줄 이상 붙음 | FR1.3·FR1.6 |
| S3 | 세 Catch가 맞아 붙일 줄이 40줄을 넘음 | 보내는 줄은 모두 40줄 이하이고, 검색 8개는 늘 들어감 | 검색 줄이 빠지거나 40줄을 넘음 | FR1.1·FR1.3·NFR4 |
| S4 | 두 줄짜리 근거인데 남은 상한이 1줄 | 그 근거를 건너뛰고 2를 셈. 다음 한 줄짜리 근거는 붙임 | 근거를 잘라 한 줄만 붙임 | FR1.4 |
| S5 | 작업 사실·나의 기여 줄이 남은 상한보다 많음 | 줄 단위로 상한까지 붙이고 나머지를 셈 | 상한을 넘음 | FR1.4 |
| S6 | 작성자 설명·텍스트 자료가 검색에 맞지 않음 | 붙이지 않음 | 붙음 | FR1.2 |
| S7 | 다음 경우의 머리글: 둘째 줄이 있는 Catch, 없는 Catch, 둘째 줄이 같은 Catch 둘, 200자를 넘는 둘째 줄, 줄바꿈·제어 문자·글 방향 제어 문자가 든 둘째 줄, 다듬으면 빈 둘째 줄, 텍스트 자료, PDF 자료 | 설계 결정 6의 표대로 나온다. 고정 글자에 숫자(0-9)·영문자(A-Za-z)가 없다. 줄바꿈은 빈칸이 되고 제어 문자는 사라진다. 200자 이하이고 서로게이트 쌍이 깨지지 않는다. 빈 둘째 줄은 「기록 제목 없음」이 된다 | 제목·AI 초안·저장소 이름이 머리글에 들어감, 고정 글자에 숫자·영문자가 있음, 줄바꿈·제어 문자가 남음 | FR2.2·FR2.4 |
| S8 | `itemContext`가 있는 근거와 없는 근거로 인용 요청을 만듦 | 있는 것만 `context`가 `자료 종류: … · 머리글`이고, 없는 것은 지금 글자 그대로 | 기본 요약·JD 요청의 `context`가 바뀜 | FR2.1·FR3.2 |
| S9 | 모델이 `- ` 항목을 안 씀 / 쓴 항목이 모두 위치를 못 찾음, 한 번 호출과 스트리밍 각각 | `ai_gate_failed`에 `nonItemLineCount`·`stopReason`·위치 버림 수가 찍힘. 글은 없음 | 칸이 빠지거나 글이 들어감 | FR5.1·NFR3 |
| S10 | 받은 사람 질문 요청에서 판정 뒤 발행본이 지워져 사본 읽기가 `NotFound` | `404 LINK_UNAVAILABLE`, 질문 수를 세지 않음 | 200 스트림을 열거나 500 | 설계 결정 2 |
| S11 | 질문 한 번이 끝남 | `qna.completed`에 `unattachedLineCount`(수)가 있음 | 칸 없음 | FR1.6 |
| S12 | 평가 스크립트 synthetic 모드로 같은 검색 결과를 넣음 | 모델 요청의 근거 목록이 `buildQnaSources` 결과와 같고, 기록에 질문별 못 붙인 줄 수가 숫자로 있음 | 스크립트가 따로 요청을 만듦 | FR7.1~FR7.3 |
| S13 | 지시문 | `QNA_INSTRUCTION`에 두 지시가 있고 끝이 `AUTHOR_MATERIAL_VOICE_INSTRUCTION`. 기본 요약 지시는 그대로 | 공용 문장이 바뀜 | FR3.1·FR3.2 |
| S14 | 인용 위치의 `publishedItemId`가 사본에 있음 / 없음 / 찾기 함수 없음 | 제목 / `null` / `null` | 오류를 냄 | FR4.1·FR4.4 |
| S15 | 출처 단추 누르기 | 지금처럼 `showEvidence(location)`가 받은 위치 그대로 불림(붙인 줄은 그 칸 전체 범위) | 위치가 바뀌거나 칸 여러 개에 걸침 | FR1.5·NFR2 |
| S16 | 모델이 머리글의 고정 글자(「이 줄이 속한 작업」「「가」 작업(기록 제목 없음)」「텍스트 자료」「올린 문서」)를 답 항목에 옮겨 씀. 인용 항목과 인용 없는 「AI 해석」 항목 둘 다 | 두 항목 모두 대조를 통과해 남는다(`dropReasons.fact` 0) | 머리글 글자 때문에 항목이 버려짐 | 설계 결정 6 |
| S17 | 평가 스크립트 synthetic 모드에서 질문마다 게이트 로그가 나옴(항목 0개 실패 질문 포함) | 원문 결과와 기록에 질문별 `dropReasons.fact`·`nonItemLineCount`·`stopReason`이 숫자·이름으로 남고 글은 없다 | 칸이 빠지거나 다른 질문의 값이 묶임 | 설계 결정 9·FR5.4 |

## Steps

### 단계 A — 기준선 전까지(로그 칸만)

- [x] **Step 1. 구조와 시험 실행기 확인.**
  - 바꾸기 전에 `unit-test-instructions.md`의 범위 시험 명령을 그대로 한 번 돌려 기준을 남긴다(통과·실패 수). 안 바뀐 코드에서 돌린다.
  - Nest `Logger.overrideLogger`로 게이트 로그를 평가 스크립트 안에서 가로챌 수 있는지 확인한다. 설치된 `@nestjs/common`의 `Logger`가 인스턴스 로거를 정적 로거로 넘기는지를 본다. 이 결과로 설계 결정 9의 받는 방법을 정한다.
- [x] **Step 2. 시나리오 확정.** 위 S1~S15를 시험 이름으로 옮길 목록으로 확정한다. 시험 코드는 각 구현 뒤에 쓴다(팀 Testing Posture: custom).
- [x] **Step 3. 실패 로그 칸 셋(FR5.1).** `checked-gate.ts` `fail()`이 `log.nonItemLineCount`·`log.stopReason`·`log.dropReasons.location`을 함께 남기게 한다. 칸 이름은 `ai_gate_result`와 같게 한다. 한 번 호출·스트리밍 두 길이 모두 `fail()`을 거친다는 것도 확인한다.
- [x] **Step 4. Step 3 시험(S9).** `api/test/u2/ai-gate-checks.test.cjs`(한 번 호출)와 `api/test/u2/ai-gate-stream.test.cjs`(스트리밍)에 사례를 더한다: 항목 없음, 모든 항목 위치 버림. 각각 로그에 세 칸이 있고 글이 없음을 확인한 뒤 범위 시험을 돌린다.
- [x] **Step 4a. 평가 기록에 게이트 로그 수 칸(설계 결정 9).**
  - `api/scripts/rag-eval/rag-eval.cjs`가 질문마다 게이트 로그의 수 칸을 받는다.
  - `rag-eval-report.cjs`가 그 값을 원문 결과와 기록에 적는다.
  - 모델 요청을 만드는 코드는 건드리지 않는다.
  - 시험(S17)은 `api/test/rag-answer/rag-eval.test.cjs`에 더하고 범위 시험을 돌린다.
- [x] **Step 5. 단계 A 커밋과 멈춤.**
  - `fix:` 접두사로 단계 A만 커밋한다.
  - 그다음 개발 작업을 멈추고 진행 담당에게 돌아온다. 이어서 할 일은 Step 5a다.
- [x] **Step 5a. 기준선 실행(FR5.2·FR5.4·FR5.5).**
  - 팀장 확인을 받은 뒤 한다. Docker·로컬 DB를 켜고 실제 Claude·Voyage를 부르기 때문이다.
  - 11/12와 같은 경로인 `npm run rag-eval`의 measure 모드로, 11/12 발행본과 같은 질문 10개를 한 번 돌린다. 질문 수는 measure 모드가 10개만 받는다.
  - 다음을 평가 기록에 적는다: 5번의 원인(세 칸 값, 확인한 길은 한 번 호출), 스트리밍 길에서는 다르게 실패할 수 있다는 한계, 로그 칸이 이 경로에서 실제로 찍혔는지, 질문별 `dropReasons.fact`(Step 4a가 자동으로 적음).
  - 나온 두 파일(`api/docs/rag-evaluation/<날짜>.md`, `api/.rag-eval/<날짜>-measure.json`)은 이름을 `<날짜>-baseline`으로 바꾼다.
  - 11/12 발행본이 없으면 요구사항 「전제」대로 한다(같은 Catch 3개로 다시 발행, 또는 멈추고 팀장에게).
  - 이 실행은 기준선이고, 다시 재기가 아니다.

### 단계 B — 고치기

- [x] **Step 6. 머리글 칸(FR2.1, C-01 더하는 변경).**
  - `ai-generation.types.ts` `AiSource.itemContext?: string`
  - `citation-request.ts` `context` 만들기
  - `gate-policy.ts` 입력 길이에 셈
- [x] **Step 7. 지시문 한 번 수정(FR3, FR5.3).**
  - `rag-answer-config.ts` `QNA_INSTRUCTION`의 앞 문장을 설계 결정 7로 바꾼다.
  - Step 5a에서 항목 꼴 문제가 나왔으면 이 수정 안에 함께 넣고, 문구를 팀장에게 보여 정한다.
  - 항목 꼴이 아닌 코드 문제(예: 위치 계산)가 원인이면 범위가 바뀌므로 멈추고 돌아온다.
- [x] **Step 8. 근거 목록 함수(FR1.1~FR1.5, FR2.2·FR2.4, FR7.1).**
  - 새 `qna-sources.ts` `buildQnaSources`와 상한 값 셋, 한글 한 글자 표(가~버 20자), 둘째 줄 다듬기 함수를 만든다(설계 결정 1·4·5·6).
  - `buildSummarySources`로 사본을 근거로 바꾼 뒤, 맞은 Catch의 GitHub 기록 줄만 골라 붙이고 머리글을 단다.
- [x] **Step 9. 앱 연결(FR1.6·FR1.7).**
  - `qna-service.ts`: `QnaRunInput.snapshot`을 받고, `buildQnaSources`로 근거를 만들고, 결과에 `unattachedLineCount`를 둔다.
  - `qna.controller.ts`: `admit`에서 `readSnapshot`, `NotFound`면 `LINK_UNAVAILABLE`(설계 결정 2)
  - `rag-answer-log.ts`: `QnaCompleted.unattachedLineCount`
- [x] **Step 10. 평가 스크립트(FR7.1·FR7.2).**
  - `rag-eval.cjs`의 `qnaRequest`가 `buildQnaSources(top, snapshot)`로 요청을 만든다. 사본은 이미 읽은 것을 쓴다.
  - 검색 12개·적중률 계산과 Step 4a의 게이트 로그 기록은 그대로 둔다.
  - `rag-eval-report.cjs`는 원문 결과와 기록에 질문별 `unattachedLineCount`(숫자만)를 적는다.
- [x] **Step 11. api 시험(S1~S8, S10~S13, S15·S16 api 쪽).**
  - 새 `api/test/rag-answer/qna-sources.test.cjs`: S1~S7·S13·S15·S16(S16은 `buildQnaSources`가 만든 머리글로 인용 요청을 만들고, 합성 응답에 머리글 글자를 넣어 게이트 대조를 통과하는지 본다)
  - `api/test/ai-generation/citation-request.test.cjs`: S8
  - `api/test/rag-answer/qna-controller.test.cjs`: S10·S11
  - `api/test/rag-answer/rag-eval.test.cjs`: S12
  - 그다음 범위 시험을 돌린다.
- [x] **Step 12. 화면 제목(FR4).**
  - 새 `web/src/features/rag-answer/item-title.ts`
  - `gated-item-view.tsx`: 인용마다 출처 단추 뒤에 제목 글자를 둔다. `<span>`이고 Tab 순서 밖이며, `data-testid="{testId}-evidence-item-title"`를 단다. 단추 글자와 동작은 그대로다.
  - 두 패널 prop: `RecipientSummaryProps`·`OwnerSummaryProps`·`QnaPanelProps`에 선택 `itemTitleOf`
  - `recipient-view.tsx`: `RecipientSlots`에 함수를 넘긴다. JD 패널에는 넘기지 않는다.
  - `publication-detail-view.tsx`
  - `rag-answer.module.css`
- [x] **Step 13. web 시험(S14·S15 화면 쪽).** 새 `web/test/rag-answer-item-title.test.mjs`를 쓰고, 기존 `recipient.test.mjs`·`publications-owner.test.mjs`·`rag-answer-*.test.mjs`를 범위 시험으로 돌린다.
- [x] **Step 14. 문서·계약·주석(FR6).** 위 「함께 고칠 문서」를 모두 고친다.
- [x] **Step 15. 정적 검사와 범위 시험 전체.**
  - api·web 각각 `npm run lint`·`npm run typecheck`
  - `unit-test-instructions.md`의 범위 시험 명령 전부
  - 결과는 Step 1 기준과 비교한다.

### 이 단계 뒤(빌드와 시험 단계)

- 다시 재기(NFR1): 팀장 확인 뒤 11/12 발행본으로 10개를 한 번 다시 잰다. 사람 판정은 팀장이 한다. 기록에는 기준선과 나란히 둔 질문별 `dropReasons.fact` 표를 넣는다(설계 결정 9).
- api·web 전체 시험(DB 시험 포함)을 돌린다.

## 요구사항 대조

| 요구 | Step |
|---|---|
| FR1.1~FR1.5, FR1.7 | 8, 9, 11 |
| FR1.6 | 9, 10, 11 |
| FR2.1 | 6, 11 |
| FR2.2, FR2.4 | 8, 11 |
| FR3.1~FR3.3 | 7, 11 |
| FR4.1~FR4.5 | 12, 13 |
| FR5.1 | 3, 4 |
| FR5.2, FR5.4, FR5.5 | 4a, 5a |
| FR5.3 | 7 |
| FR6.1~FR6.4 | 14 |
| FR7.1~FR7.3 | 8, 10, 11 |
| NFR1 | 빌드와 시험 단계 |
| NFR2 | 4, 11, 13, 15 |
| NFR3 | 3, 4a, 8(둘째 줄 다듬기), 9, 10(수만 남김) |
| NFR4 | 8, 11(S3) |

## Testing Contract

```json
{
  "version": 1,
  "methodology": "custom",
  "source": "team",
  "ordering": "각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.",
  "scope": "bugfix",
  "test_strategy": "minimal",
  "project_type": "brownfield",
  "applicable_notes": [
    {
      "layer": "org",
      "text": "We treat tests as a first-class deliverable in every Bolt. The specific\nmethodology (TDD, BDD, ATDD, or classic test-after) is affirmed at\npractices-discovery and recorded in `team.md` under this heading with explicit\n`Methodology` and `Ordering` fields; Code Generation resolves those fields\nindependently from coverage, tooling, and scope notes.\n\nWhen no posture has been affirmed, our default per scope is:\n- **Methodology**: test-after\n- **Ordering**: implement each applicable testable layer, then write and run\n  that layer's tests.\n- `mvp`, `enterprise`, `feature`, `infra`, `classic` add an 80% line-coverage\n  floor and CI execution before merge.\n- `bugfix`, `security-patch` add a targeted regression for the specific\n  bug/vulnerability and require the existing suite to remain green.\n- `express` uses the Minimal strategy: requirement-driven unit tests (one per\n  requirement, with a happy-path floor per component); existing tests remain\n  green.\n- `poc`, `refactor`, `workshop` add no extra new-test floor and require the\n  existing suite to remain green.\n\nThe active `Test Strategy` still applies in every scope and determines test\nvolume/types. Scope floors are additive; they never reduce or replace the\nselected strategy.\n\nBuild and Test verifies defined coverage floors and affirmed quality targets;\nthey may not be weakened to make a step pass.\n\nAffirm a stricter posture in `team.md` if the team commits to one."
    },
    {
      "layer": "team",
      "text": "- **Methodology**: custom\n- **Ordering**: 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.\n- 커버리지 측정은 팀장이 공용 기반으로 넣은 서비스별 명령을 쓴다. 작업에서 측정 도구를 따로 들이거나 CI를 고치지 않고, 필요하면 팀장에게 요청한다."
    },
    {
      "layer": "project",
      "text": "- ALWAYS Unit 확인 명령은 --timeout-ms 3600000(60분)으로 돌린다. 시작 전에 pmset -g batt로 충전기 연결을, sysctl -n vm.loadavg로 부하(1분 평균 6 미만)를 보고, 끝나면 결과와 함께 api·web·worker 각각 걸린 시간을 알린다. 기본 상한 30분은 배터리로 돌 때 api 시험 도중에 걸려 멈췄다. (learned 2026-11-10)"
    }
  ],
  "obligations": {
    "strategy": "minimal",
    "strategy_volume": [
      "One verifiable test per requirement at the narrowest effective level.",
      "At least one happy-path unit test per component.",
      "Unit tests are the default; a bugfix/security scope floor may require an integration or E2E regression when that is the narrowest level that reproduces the defect."
    ],
    "scope_floor": [
      "Include a targeted regression for the bug or vulnerability.",
      "Keep the existing test suite green."
    ],
    "combination_rule": "Apply every selected-strategy obligation and every scope-floor obligation; neither replaces the other, and a targeted scope regression may add the narrowest necessary test type beyond the strategy default."
  },
  "plan_profile": {
    "methodology": "custom",
    "runner_step": "Verify the existing test runner/configuration and record the exact unit-scoped command.",
    "runner_ready_before_first_test": true,
    "testable_layers": [
      "Data model / database behavior",
      "Repository / data access",
      "Business logic",
      "API / endpoint",
      "Frontend behavior"
    ],
    "steps": [
      "Project structure and production configuration skeleton.",
      "Verify the existing test runner/configuration and record the exact unit-scoped command.",
      "Custom ordering - 각 담당자가 기존 요구사항과 화면 흐름을 바탕으로 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다.",
      "Implementation and tests - preserve that exact ordering; do not convert it to layer-local TDD.",
      "Environment/build configuration.",
      "Documentation and traceability."
    ]
  },
  "input_sha256": "sha256:54e757a6fe2a5d040cc42d1ca464a488bec7444fde6e51c16070760d39d327e0",
  "contract_sha256": "sha256:e71b1197595c81a7b8e9f20350d39731ba9b3753e6ebeeb5f8b1ef355ebf70aa"
}
```
