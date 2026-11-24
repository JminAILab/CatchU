# 업무 개요 — CatchU

> 기준: 2026-11-09 전체 다시 스캔(커밋 `a1d0fbb4`) 위에 2026-11-16 집중 스캔(커밋 `eb0d5a6c`)과 2026-11-19 집중 스캔(커밋 `aa241a4c`, intent `261118-publication-presets`)을 합쳤다. 11-19에 다시 읽은 것은 발행·사본·받은 사람 화면·작성자 발행본 상세·질의응답 근거·받은 링크 읽기·Catch 목록 조회·자료 지우기·탈퇴·개인정보처리방침·상단 메뉴이고, 그 자리를 말하는 줄에는 「11-19 확인」을 붙였다. 그 밖의 글은 11-09·11-16 기준 그대로다. 구성 요소 이름(`api.catches` 등)은 `component-inventory.md`의 제목이다.

## 무엇을 하는 서비스인가

CatchU는 개발자 구직자의 GitHub 활동에서 작업 단위의 기록 카드(**Catch**)를 만들어, 구직자에게는 면접 준비 자료로, 면접관에게는 서류·면접 판단 자료로 주는 서비스다(루트 `README.md`). 인공지능사관학교 기업연계 파이널 프로젝트이며 12월 10일 제출을 목표로 한다.

쓰는 사람은 둘이다.

| 사람 | 화면 | 로그인 |
|---|---|---|
| 구직자(작성자) | 홈, 내 자산(Catch 목록·상세), 텍스트 자료(텍스트·PDF 탭), 발행·발행본, JD 관리, 프로필·GitHub 연결·Claude 연결 | Google 로그인 |
| 면접관(받은 사람) | 발행본 링크 화면 `/s/[token]` — 사본, AI 기본 요약, 질의응답, JD 요약(로그인 시), Claude에서 분석하기(비밀번호 없는 링크) | 없음(비밀번호 링크면 비밀번호) |

## 주요 흐름

1. **가입과 연결**: Google로 로그인하고(`api.google-login`, `api.auth`), 프로필을 쓰고(`api.member-profile`), GitHub 계정을 연결한다(`api.github-connection`, 추가 권한 없는 OAuth App, 토큰은 암호화 파일로 보관).
2. **저장소 등록과 분석 요청**: 공개 저장소 주소를 직접 등록하고(`api.member-repositories`), 분석 고지(`catchu-real-analysis-notice-v3`)에 동의해 분석을 요청한다(`api.analysis-intake`). 하루 실행 횟수에 제한이 있다(`api.daily-run-limit`).
3. **분석**: api가 요청을 큐에 넣고(`api.analysis-queue`), worker가 받아 GitHub 커밋·PR·이슈를 모으고(`worker.collection`), 작업 단위를 정하고(`worker.candidates`), Claude로 설명 초안·생각해 볼 질문·제목 후보를 만들고 OpenAI·Claude 판정으로 거른다(`worker.generation`, `worker.judgement`). 결과는 큐로 돌아온다.
4. **Catch 등록**: api가 결과를 검사·저장하고(`api.analysis-receiver`) 한 트랜잭션에서 Catch로 등록한다(`api.result-application`, `api.catches`). 같은 작업 열쇠(`wi1`)면 새로 만들지 않고 기존 Catch를 참조한다. 이미 Catch에 속한 커밋은 소속 기록(`commit_assignment`)에 남아 재분석 때 빠진다.
5. **확인과 작성자 설명**: 구직자는 상세에서 작업 사실·나의 기여를 확인하고, 불일치를 표시하고, 작성자 설명(4,000자, 칸 제목별 입력)을 쓴다(`api.catches`, `web.assets`). 본인 목록은 마지막 작업 시각이 최근인 것부터 20개씩 오고, 저장소·작성자 설명 있음/없음으로 서버에서 거를 수 있다(11-19 확인, `owner-catch-store.ts`).
6. **발행(11-19 확인)**: 발행 화면(`/publications/new`)에서 Catch·텍스트 자료·PDF를 하나씩 골라 「위로」「아래로」로 순서를 정하고 제목·비밀번호를 정해 고정 발행본을 만든다(`api.publications`, `web.publications`). 항목은 1~20개, 같은 자료는 한 번만, 전체 글은 60,000자까지다. 고른 배열 순서가 항목 순서 번호(`position`)다. 확인이 안 된 Catch와 원본이 보호된 Catch는 고르기 목록에서 고를 수 없고, 발행 트랜잭션도 다시 막는다. 발행하면 고른 비공개 Catch가 공개로 바뀌고, 사본을 검색 조각으로 나누고(`api.published-index`), 임베딩과 AI 기본 요약을 백그라운드로 만든다(`api.ai-run`, `api.rag-answer`). 링크 수명은 90일이며 중지·삭제할 수 있다. **발행본 안에 묶음(프리셋) 개념은 없다.**
7. **면접관 열람(11-19 확인)**: 면접관은 링크로 사본을 본다. 화면은 위에서부터 발행본 제목 → 이 링크에서 할 수 있는 것 안내 → (비밀번호 없는 링크면) Claude에서 분석하기 → 발행 시각 → 발행본 자료(항목을 순서대로 한 줄에 모두 펼침) → AI 요약 → 질의응답 → JD 요약이다(`web.recipient`). 답·요약 항목마다 인용한 원문과 출처 딱지(「GitHub 기록 원문」·「작성자 자료 원문」), 그 옆에 근거가 속한 항목 제목이 붙고, 딱지를 누르면 사본의 해당 칸 범위로 옮겨 강조한다. 답으로 돌아가는 단추는 없다. 질의응답은 검색으로 맞은 조각 8개에 같은 Catch의 기록 줄을 더 붙이고(Catch마다 12줄, 전체 40줄 상한) 근거마다 「이 줄이 속한 작업」 머리글을 달아 Claude(Haiku)에 넘긴다(`api.rag-answer`). 질문 수는 링크당 하루 100개, 작성자당 하루 합계 300개다.
8. **Claude 연결**: 구직자 본인이 Claude 웹·Desktop에 자기 Catch·텍스트 자료를 읽는 MCP 도구 둘을 연결하고, 받은 사람은 같은 연결로 받은 링크를 읽는 도구 `read_shared_publication`을 쓴다(`api.claude-mcp`, 11-19 확인).
9. **자료 지우기(11-19 확인)**: 텍스트 자료·PDF는 하나씩 지울 수 있고 이미 만든 발행 사본은 남는다. Catch를 하나씩 지우는 기능은 없다(`api.materials`, `api.catches`).
10. **탈퇴**: 세션 폐기·발행 링크 중지·MCP 행 삭제 → 파일 삭제 → 자격정보 파일 삭제 → 회원 행 연쇄 삭제의 4단계(`api.withdrawal`, 11-19 확인).

## 업무 규칙 가운데 코드가 지키는 것

- **본인 기여의 뜻**: 연동 계정이 커밋 **작성자**로 기록된 커밋만 본인 기여다. PR을 연 것, 이슈를 쓴 것은 기여가 아니다(`worker/app/candidates/build.py` 모듈 설명).
- **AI 글과 사람 글을 나눈다**: 면접관 화면은 「AI 설명 초안」·「작성자 설명」·「기록에서 확인한 내용」을 다른 칸으로 보인다(`web/src/features/publications/snapshot-view.tsx`). 받은 사람 AI 근거 종류는 `GITHUB_RECORD`·`AUTHOR_MATERIAL` 둘이고, AI 초안·항목 제목·저장소 이름·작업 한계·본인 커밋 표지는 검색 조각과 모델 입력에 넣지 않는다(`api/src/published-index/chunker.ts` 104~128행, `api/src/rag-answer/summary-sources.ts` 2행, 질의응답 머리글도 같음 — `qna-sources.ts` 4행, 11-19 확인).
- **AI 답은 원문에 기대야 남는다**: 게이트가 항목마다 기계 대조를 한다. 인용 항목은 숫자·PR 번호·파일 이름·영어 표기가 그 항목이 인용한 줄에 있어야 하고, 인용 없는 「AI 해석」 항목은 숫자·PR 번호가 없어야 한다. 어기면 그 항목을 화면에 보내지 않는다(`api/src/ai-generation/fact-check.ts`, 11-16 확인). 그래서 질의응답 머리글의 항목 표 글자는 숫자 대신 한글 「가」~「버」다(`qna-sources.ts` 18~23행, 11-19 확인).
- **인용 위치는 사본 칸 하나 안**: 모든 인용 위치는 사본 문자열 칸 하나(`fieldPath`)의 UTF-16 범위다(계약 C-01, `citation-locator.ts`). 화면은 이 위치를 사본에 대조해 강조한다.
- **작업 사실에는 CatchU가 센 숫자를 쓰지 않는다**: 작업 사실은 1~2줄(단위 종류와, 쓸 만하면 PR 제목이나 본인 커밋 첫 줄)이다. 파일·줄 수 같은 원본 숫자는 근거의 관측 사실에만 있다(`build.py` 27~36행, `worker/app/collection/evidence.py`).
- **공개 조건**: 작업 사실과 나의 기여를 둘 다 확인해야 하고, 원본 저장소가 비공개로 관측되면(`SOURCE_PRIVATE`) 공개·발행할 수 없다(`owner-catch-store.ts`, `publish.service.ts`).
- **발행본은 고정 사본이다**: 발행 뒤 원본 Catch·자료를 고치거나 지워도 사본은 바뀌지 않는다. `published_item.source_id`는 원본을 외래 키로 가리키지 않는다. 받은 사람 경로는 사본만 읽는다(`db-publication-access.ts` `readSnapshotIn`). 검색 조각도 발행 때 한 번 나누고 다시 나누지 않는다(`published-index-writer.ts`, 11-19 확인).
- **원자료를 남기지 않는다**: worker는 GitHub 원자료를 메모리에만 두고 결과만 보낸다. 비밀값과 사용자 글은 로그에 남기지 않는다. 질의응답 로그도 질문·답·근거 글 없이 수와 이유만 남긴다(`rag-answer-log.ts`, `checked-gate.ts` `GateLog`).
- **개인정보처리방침 글은 확정 원문 그대로다(11-19 확인)**: `/privacy` 화면은 팀장 확정 문구(#496)를 글자 그대로 싣고 시험이 SHA-256으로 대조한다. 저장 항목 표와 「하나씩 지우기」 문장이 지금 저장하는 것을 나열한다(`web/src/features/privacy/README.md`).

## 지금 진행 중인 일과 이 intent

- **이 intent(`261118-publication-presets`, GitHub 이슈 #597, 범위 mvp)**: 발행 방식을 「자료를 하나씩 고르기」에서 「프리셋(이름 있는 Catch·텍스트 자료·PDF 묶음) 고르기」로 바꾼다. 지원자는 프리셋을 미리 만들고(이름, 안의 순서는 위로·아래로 단추), 발행할 때 프리셋을 최대 5개 고르고 그 순서를 정한다. 받은 사람 화면과 작성자 발행본 화면은 프리셋을 탭으로 나눠 보이고(프리셋이 하나여도 탭 줄을 보임), AI 요약과 질의응답은 탭 밖에 두며, 출처 단추가 다른 탭의 글을 가리키면 그 탭으로 바꿔 옮기고 답으로 돌아가는 단추를 둔다. 텍스트 자료·PDF 지우기, 탈퇴, 개인정보처리방침 문구, 받은 링크 읽기·JD 요약도 맞춘다. 이 변경 전 발행본은 버린다(승인된 범위 문서 S1~S9). 지금 코드의 자리와 함께 고칠 파일은 `code-quality-assessment.md` 「이 intent(#597)가 닿는 자리」에 적었다.
- **앞 intent(`261116-recipient-qa-fix`, #559, 11-16 기준 글 → 11-19 결과 확인)**: 면접관 질의응답이 틀리게 답한 자리를 고쳤다. 검색으로 맞은 Catch의 기록 줄을 상한 안에서 붙이고(`qna-sources.ts` `buildQnaSources`), 근거마다 「이 줄이 속한 작업」 머리글(`itemContext`)을 달고, 지시 앞 문장을 고치고(`QNA_INSTRUCTION`), 출처 딱지 옆에 항목 제목을 보이게 했다(`web/src/features/rag-answer/item-title.ts`). 게이트 실패 로그에도 줄 수·버린 이유 수가 더해졌다(커밋 `126ae048`, 게이트 파일은 이번에 다시 읽지 않음).
- **그 앞 intent(`261109-new-catch`, 「새 Catch」, 2026-11-09 기준 글)**: Catch를 「지원자가 골라 면접관에게 보내는 한 장」으로 다시 정의했다(`docs/ai-dlc-input-catch/CatchU_새_Catch_입력.md` §4-1). 11-19에 발행 쪽 결과를 확인했다: 사본 선택 칸(`repositoryName`·`authorDescriptionEditedMonth`·`workLimits`·근거 `ownCommit`), 목록 응답 `hasAuthorDescription`·작성자 설명 걸러 보기, 발행 화면 「작성자 설명을 쓴 Catch만 보기」와 확인 단계 안내가 들어가 있다. 그때 적은 나머지 자리는 `code-quality-assessment.md` 「그 앞 intent(261109-new-catch)가 닿던 자리」에 남겼다.

## 용어

| 말 | 뜻 |
|---|---|
| Catch | 작업 하나(PR, PR 없는 병합, 본인 커밋 묶음)에 대한 카드. 표 `catch_asset` |
| 작업 열쇠(`workIdentity`, `wi1`) | 같은 작업인지 가르는 값. 회원마다 유일 |
| 근거(evidence) | Catch를 받치는 GitHub 기록(커밋·PR·이슈) 하나의 주소·판본·관측 사실. 사본에서는 `evidence[i]`, 그 기록 줄은 `evidence[i].representedFacts[j]` |
| 기록의 글 | 작성자가 GitHub에 남긴 원문 한 줄(PR 제목 또는 본인 커밋 첫 줄) |
| 소속 기록 | 커밋 SHA가 어느 Catch에 속하는지. 표 `commit_assignment` |
| 발행본 | 고른 항목의 고정 사본과 링크 하나. 표 `publication`·`published_item` |
| 항목 순서 번호(`position`) | 발행본 안 항목의 1부터인 순서. 발행 요청 배열 순서 그대로이며 발행본마다 겹치지 않는다(`unique(publication_id, position)`). 조각 순서·요약 근거 순서·질의응답 표 글자·받은 링크 읽기 cursor가 이 값을 쓴다(11-19 확인) |
| 프리셋 | (이 intent에서 새로 만드는 것) 지원자가 이름을 붙여 미리 만드는 Catch·텍스트 자료·PDF 묶음. 지금 코드에는 없다 |
| 탭 | 화면에서 묶음마다 자료를 나눠 보이는 부품. 지금은 자료 화면(텍스트 자료·PDF 자료)에만 있다(`materials-view.tsx` `MaterialsTabs`) |
| 조각(chunk) | 발행 사본 문자열 칸 하나의 한 범위(1,000자 이하)와 그 임베딩. 표 `published_chunk`. 질의응답 검색 단위 |
| 머리글(`itemContext`) | 질의응답 근거마다 붙이는 「이 줄이 속한 작업/자료」 글. 항목 표 글자와 작업 사실 둘째 줄로 만든다(`qna-sources.ts`) |
| 출처 딱지 | 답 항목의 인용 아래 단추. 글자는 `sourceLabel`(「GitHub 기록 원문」·「작성자 자료 원문」), 옆에 항목 제목 |
| 면접관 | Catch 링크를 받아 보는 사람. 코드에서는 recipient(받은 사람) |
| 팀장 | 이 프로젝트의 intent를 정하는 우리 팀장 |
