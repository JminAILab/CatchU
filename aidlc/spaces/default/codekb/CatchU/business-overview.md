# 업무 개요 — CatchU

> 기준: 2026-11-09 전체 다시 스캔(커밋 `a1d0fbb4`) 위에 2026-11-16 집중 스캔(커밋 `eb0d5a6c`, intent `261116-recipient-qa-fix`)을 합쳤다. 이번에 다시 읽은 것은 받은 사람 AI(조각·검색·인용 게이트·질의응답·요약 패널)뿐이고, 그 밖의 글은 11-09 기준 그대로다. 구성 요소 이름(`api.catches` 등)은 `component-inventory.md`의 제목이다.

## 무엇을 하는 서비스인가

CatchU는 개발자 구직자의 GitHub 활동에서 작업 단위의 기록 카드(**Catch**)를 만들어, 구직자에게는 면접 준비 자료로, 면접관에게는 서류·면접 판단 자료로 주는 서비스다(루트 `README.md`). 인공지능사관학교 기업연계 파이널 프로젝트이며 12월 10일 제출을 목표로 한다.

쓰는 사람은 둘이다.

| 사람 | 화면 | 로그인 |
|---|---|---|
| 구직자(작성자) | 홈, 내 자산(Catch 목록·상세), 텍스트 자료, 발행·발행본, 프로필·GitHub 연결·Claude 연결 | Google 로그인 |
| 면접관(받은 사람) | 발행본 링크 화면 `/s/[token]` — 사본, AI 기본 요약, 질의응답, JD 요약(로그인 시) | 없음(비밀번호 링크면 비밀번호) |

## 주요 흐름

1. **가입과 연결**: Google로 로그인하고(`api.google-login`, `api.auth`), 프로필을 쓰고(`api.member-profile`), GitHub 계정을 연결한다(`api.github-connection`, 추가 권한 없는 OAuth App, 토큰은 암호화 파일로 보관).
2. **저장소 등록과 분석 요청**: 공개 저장소 주소를 직접 등록하고(`api.member-repositories`), 분석 고지(`catchu-real-analysis-notice-v3`)에 동의해 분석을 요청한다(`api.analysis-intake`). 하루 실행 횟수에 제한이 있다(`api.daily-run-limit`).
3. **분석**: api가 요청을 큐에 넣고(`api.analysis-queue`), worker가 받아 GitHub 커밋·PR·이슈를 모으고(`worker.collection`), 작업 단위를 정하고(`worker.candidates`), Claude로 설명 초안·생각해 볼 질문·제목 후보를 만들고 OpenAI·Claude 판정으로 거른다(`worker.generation`, `worker.judgement`). 결과는 큐로 돌아온다.
4. **Catch 등록**: api가 결과를 검사·저장하고(`api.analysis-receiver`) 한 트랜잭션에서 Catch로 등록한다(`api.result-application`, `api.catches`). 같은 작업 열쇠(`wi1`)면 새로 만들지 않고 기존 Catch를 참조한다. 이미 Catch에 속한 커밋은 소속 기록(`commit_assignment`)에 남아 재분석 때 빠진다.
5. **확인과 작성자 설명**: 구직자는 상세에서 작업 사실·나의 기여를 확인하고, 불일치를 표시하고, 작성자 설명(4,000자 한 칸)을 쓴다(`api.catches`, `web.assets`).
6. **발행**: Catch와 텍스트 자료를 골라 순서·제목·비밀번호를 정해 고정 발행본을 만든다(`api.publications`, `web.publications`). 링크 수명은 90일이며 중지·삭제할 수 있다. 발행하면 고른 비공개 Catch가 공개로 바뀌고, 사본을 검색 조각으로 나누고(`api.published-index`), 임베딩과 AI 기본 요약을 백그라운드로 만든다(`api.ai-run`, `api.rag-answer`).
7. **면접관 열람**: 면접관은 링크로 사본을 보고, AI 기본 요약과 질의응답(SSE, 링크당 하루 질문 100개)을 쓴다(`web.recipient`, `web.rag-answer`, `api.rag-answer`). 답 항목마다 인용한 원문과 출처 딱지(「GitHub 기록 원문」·「작성자 자료 원문」)가 붙고, 딱지를 누르면 사본의 해당 칸 범위가 강조된다. 질의응답은 질문마다 발행본 조각 가운데 가까운 8개만 Claude(Haiku)에 넘긴다. 자세한 흐름은 `architecture.md` 「받은 사람 질의응답」.
8. **Claude 연결**: 구직자 본인이 Claude 웹·Desktop에 자기 Catch·텍스트 자료를 읽는 MCP 도구 둘을 연결한다(`api.claude-mcp`).
9. **탈퇴**: 세션 폐기·발행 링크 중지·MCP 행 삭제 → 파일 삭제 → 자격정보 파일 삭제 → 회원 행 연쇄 삭제의 4단계(`api.withdrawal`).

## 업무 규칙 가운데 코드가 지키는 것

- **본인 기여의 뜻**: 연동 계정이 커밋 **작성자**로 기록된 커밋만 본인 기여다. PR을 연 것, 이슈를 쓴 것은 기여가 아니다(`worker/app/candidates/build.py` 모듈 설명).
- **AI 글과 사람 글을 나눈다**: 면접관 화면은 「AI 설명 초안」·「작성자 설명」·「기록에서 확인한 내용」을 다른 칸으로 보인다(`web/src/features/publications/snapshot-view.tsx`). 받은 사람 AI 근거 종류는 `GITHUB_RECORD`·`AUTHOR_MATERIAL` 둘이고, AI 초안·항목 제목·저장소 이름·작업 한계·본인 커밋 표지는 검색 조각과 모델 입력에 넣지 않는다(`api/src/published-index/chunker.ts` 104~128행, `api/src/rag-answer/summary-sources.ts` 2행, 11-16 확인).
- **AI 답은 원문에 기대야 남는다**: 게이트가 항목마다 기계 대조를 한다. 인용 항목은 숫자·PR 번호·파일 이름·영어 표기가 그 항목이 인용한 줄에 있어야 하고, 인용 없는 「AI 해석」 항목은 숫자·PR 번호가 없어야 한다. 어기면 그 항목을 화면에 보내지 않는다(`api/src/ai-generation/fact-check.ts`, 11-16 확인).
- **인용 위치는 사본 칸 하나 안**: 모든 인용 위치는 사본 문자열 칸 하나(`fieldPath`)의 UTF-16 범위다(계약 C-01, `citation-locator.ts`). 화면은 이 위치를 사본에 대조해 강조한다.
- **작업 사실에는 CatchU가 센 숫자를 쓰지 않는다**: 작업 사실은 1~2줄(단위 종류와, 쓸 만하면 PR 제목이나 본인 커밋 첫 줄)이다. 파일·줄 수 같은 원본 숫자는 근거의 관측 사실에만 있다(`build.py` 27~36행, `worker/app/collection/evidence.py`).
- **공개 조건**: 작업 사실과 나의 기여를 둘 다 확인해야 하고, 원본 저장소가 비공개로 관측되면(`SOURCE_PRIVATE`) 공개·발행할 수 없다(`owner-catch-store.ts`, `publish.service.ts`).
- **발행본은 고정 사본이다**: 발행 뒤 원본 Catch를 고쳐도 사본은 바뀌지 않는다. 받은 사람 경로는 사본만 읽는다(`db-publication-access.ts` `readSnapshotIn`). 검색 조각도 발행 때 한 번 나누고 다시 나누지 않는다(`published-index-writer.ts`, 11-16 확인).
- **원자료를 남기지 않는다**: worker는 GitHub 원자료를 메모리에만 두고 결과만 보낸다. 비밀값과 사용자 글은 로그에 남기지 않는다. 질의응답 로그도 질문·답·근거 글 없이 수와 이유만 남긴다(`rag-answer-log.ts`, `checked-gate.ts` `GateLog`).

## 지금 진행 중인 일과 이 intent

- **이 intent(`261116-recipient-qa-fix`, GitHub 이슈 #559)**: 면접관 질의응답이 틀리게 답한 자리를 고친다. 계획된 변경은 다섯이다. ① 같은 근거(커밋·PR)의 기록 줄이 따로 떨어지지 않고 함께 모델에 가게 한다(`chunker.ts`), ② 조각마다 어느 Catch의 것인지 검색과 모델이 알게 한다(`citation-request.ts`), ③ 질의응답 지시 `QNA_INSTRUCTION` 수정(`rag-answer-config.ts`), ④ 화면 출처 딱지 옆에 근거가 속한 항목 제목 표시(`gated-item-view.tsx`, 받은 사람·작성자 화면 공통, 제목은 화면이 가진 사본에서 찾고 모델엔 안 보냄, 계약 C-11), ⑤ 답 항목 0개 실패 원인 확인(게이트 로그 `ai_gate_result`). 지키는 경계: 인용 위치는 사본 칸 하나 안(C-01), Catch의 AI 설명 초안·제목은 조각·모델 입력에 넣지 않음(FR6.4), JD 요약도 같은 조각·검색을 씀. 지금 코드의 자리와 함께 고칠 파일은 `code-quality-assessment.md` 「이 intent(#559)가 닿는 자리」에 적었다.
- **앞 intent(`261109-new-catch`, 「새 Catch」, 2026-11-09 기준 글)**: Catch를 「지원자가 골라 면접관에게 보내는 한 장」으로 다시 정의했다(`docs/ai-dlc-input-catch/CatchU_새_Catch_입력.md` §4-1). 그때 적은 자리는 `code-quality-assessment.md` 「앞 intent(261109-new-catch)가 닿던 자리」에 남겼고 이번에 다시 확인하지 않았다. 사본에는 그 뒤 `repositoryName`·`authorDescriptionEditedMonth`·`workLimits`(Catch), `ownCommit`(근거) 칸이 생겼다(`api/src/publications/published-snapshot.ts`, 11-16 훑음).

## 용어

| 말 | 뜻 |
|---|---|
| Catch | 작업 하나(PR, PR 없는 병합, 본인 커밋 묶음)에 대한 카드. 표 `catch_asset` |
| 작업 열쇠(`workIdentity`, `wi1`) | 같은 작업인지 가르는 값. 회원마다 유일 |
| 근거(evidence) | Catch를 받치는 GitHub 기록(커밋·PR·이슈) 하나의 주소·판본·관측 사실. 사본에서는 `evidence[i]`, 그 기록 줄은 `evidence[i].representedFacts[j]` |
| 기록의 글 | 작성자가 GitHub에 남긴 원문 한 줄(PR 제목 또는 본인 커밋 첫 줄) |
| 소속 기록 | 커밋 SHA가 어느 Catch에 속하는지. 표 `commit_assignment` |
| 발행본 | 고른 항목의 고정 사본과 링크 하나. 표 `publication`·`published_item` |
| 조각(chunk) | 발행 사본 문자열 칸 하나의 한 범위(1,000자 이하)와 그 임베딩. 표 `published_chunk`. 질의응답 검색 단위이자 모델에 넘기는 근거 단위 |
| 출처 딱지 | 답 항목의 인용 아래 단추. 글자는 `sourceLabel`(「GitHub 기록 원문」·「작성자 자료 원문」) |
| 면접관 | Catch 링크를 받아 보는 사람. 코드에서는 recipient(받은 사람) |
| 팀장 | 이 프로젝트의 intent를 정하는 우리 팀장 |
