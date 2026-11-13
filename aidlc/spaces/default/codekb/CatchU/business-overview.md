# 업무 개요 — CatchU

> 기준: 2026-11-09 전체 다시 스캔, 커밋 `a1d0fbb4`. 구성 요소 이름(`api.catches` 등)은 `component-inventory.md`의 제목이다.

## 무엇을 하는 서비스인가

CatchU는 개발자 구직자의 GitHub 활동에서 작업 단위의 기록 카드(**Catch**)를 만들어, 구직자에게는 면접 준비 자료로, 면접관에게는 서류·면접 판단 자료로 주는 서비스다(루트 `README.md`). 인공지능사관학교 기업연계 파이널 프로젝트이며 12월 10일 제출을 목표로 한다.

쓰는 사람은 둘이다.

| 사람 | 화면 | 로그인 |
|---|---|---|
| 구직자(작성자) | 홈, 내 자산(Catch 목록·상세), 텍스트 자료, 발행·발행본, 프로필·GitHub 연결·Claude 연결 | Google 로그인 |
| 면접관(받은 사람) | 발행본 링크 화면 `/s/[token]` — 사본, AI 기본 요약, 질의응답 | 없음(비밀번호 링크면 비밀번호) |

## 주요 흐름

1. **가입과 연결**: Google로 로그인하고(`api.google-login`, `api.auth`), 프로필을 쓰고(`api.member-profile`), GitHub 계정을 연결한다(`api.github-connection`, 추가 권한 없는 OAuth App, 토큰은 암호화 파일로 보관).
2. **저장소 등록과 분석 요청**: 공개 저장소 주소를 직접 등록하고(`api.member-repositories`), 분석 고지(`catchu-real-analysis-notice-v3`)에 동의해 분석을 요청한다(`api.analysis-intake`). 하루 실행 횟수에 제한이 있다(`api.daily-run-limit`).
3. **분석**: api가 요청을 큐에 넣고(`api.analysis-queue`), worker가 받아 GitHub 커밋·PR·이슈를 모으고(`worker.collection`), 작업 단위를 정하고(`worker.candidates`), Claude로 설명 초안·생각해 볼 질문·제목 후보를 만들고 OpenAI·Claude 판정으로 거른다(`worker.generation`, `worker.judgement`). 결과는 큐로 돌아온다.
4. **Catch 등록**: api가 결과를 검사·저장하고(`api.analysis-receiver`) 한 트랜잭션에서 Catch로 등록한다(`api.result-application`, `api.catches`). 같은 작업 열쇠(`wi1`)면 새로 만들지 않고 기존 Catch를 참조한다. 이미 Catch에 속한 커밋은 소속 기록(`commit_assignment`)에 남아 재분석 때 빠진다.
5. **확인과 작성자 설명**: 구직자는 상세에서 작업 사실·나의 기여를 확인하고, 불일치를 표시하고, 작성자 설명(4,000자 한 칸)을 쓴다(`api.catches`, `web.assets`).
6. **발행**: Catch와 텍스트 자료를 골라 순서·제목·비밀번호를 정해 고정 발행본을 만든다(`api.publications`, `web.publications`). 링크 수명은 90일이며 중지·삭제할 수 있다. 발행하면 고른 비공개 Catch가 공개로 바뀌고, 사본을 검색 조각으로 나누고(`api.published-index`), 임베딩과 AI 기본 요약을 백그라운드로 만든다(`api.ai-run`, `api.rag-answer`).
7. **면접관 열람**: 면접관은 링크로 사본을 보고, AI 기본 요약과 질의응답(SSE, 링크당 하루 질문 수 제한)을 쓴다(`web.recipient`, `api.rag-answer`). 답의 근거를 누르면 사본의 해당 칸이 강조된다.
8. **Claude 연결**: 구직자 본인이 Claude 웹·Desktop에 자기 Catch·텍스트 자료를 읽는 MCP 도구 둘을 연결한다(`api.claude-mcp`).
9. **탈퇴**: 세션 폐기·발행 링크 중지·MCP 행 삭제 → 파일 삭제 → 자격정보 파일 삭제 → 회원 행 연쇄 삭제의 4단계(`api.withdrawal`).

## 업무 규칙 가운데 코드가 지키는 것

- **본인 기여의 뜻**: 연동 계정이 커밋 **작성자**로 기록된 커밋만 본인 기여다. PR을 연 것, 이슈를 쓴 것은 기여가 아니다(`worker/app/candidates/build.py` 모듈 설명).
- **AI 글과 사람 글을 나눈다**: 면접관 화면은 「AI 설명 초안」·「작성자 설명」·「기록에서 확인한 내용」을 다른 칸으로 보인다(`web/src/features/publications/snapshot-view.tsx`). 받은 사람 AI 근거 종류는 `GITHUB_RECORD`·`AUTHOR_MATERIAL` 둘이고, AI 초안·제목은 근거에 넣지 않는다(`api/src/published-index/chunker.ts`, `api/src/rag-answer/summary-sources.ts`).
- **작업 사실에는 CatchU가 센 숫자를 쓰지 않는다**: 작업 사실은 1~2줄(단위 종류와, 쓸 만하면 PR 제목이나 본인 커밋 첫 줄)이다. 파일·줄 수 같은 원본 숫자는 근거의 관측 사실에만 있다(`build.py` 27~36행, `worker/app/collection/evidence.py`).
- **공개 조건**: 작업 사실과 나의 기여를 둘 다 확인해야 하고, 원본 저장소가 비공개로 관측되면(`SOURCE_PRIVATE`) 공개·발행할 수 없다(`owner-catch-store.ts`, `publish.service.ts`).
- **발행본은 고정 사본이다**: 발행 뒤 원본 Catch를 고쳐도 사본은 바뀌지 않는다. 받은 사람 경로는 사본만 읽는다(`db-publication-access.ts` `readSnapshotIn`).
- **원자료를 남기지 않는다**: worker는 GitHub 원자료를 메모리에만 두고 결과만 보낸다. 비밀값과 사용자 글은 로그에 남기지 않는다(팀 규칙 「Code Style」, 각 모듈 주석).

## 지금 진행 중인 일과 이 intent

- 12월 intent(`260925-intent-12`)의 Unit들이 통합 브랜치 `intent/260925-intent-12`에 합쳐지는 중이고, Catch 개편 intent(`261103-catch-redesign`)의 CR1~CR3도 들어와 있다(커밋 `a1d0fbb4`가 통합 브랜치를 이 작업 브랜치에 들였다).
- 이 intent(`261109-new-catch`, 「새 Catch」)는 Catch를 「지원자가 골라 면접관에게 보내는 한 장」으로 다시 정의한다(`docs/ai-dlc-input-catch/CatchU_새_Catch_입력.md` §4-1). 바꿀 자리는 작성자 설명 쓰기·보기, 본인 Catch 목록, 발행 화면, 발행 사본과 받은 사람 화면, worker의 규칙 사실(다시 고친 줄, 옮긴 파일, 시험 파일, 작업 시각)이다. 지금 코드의 해당 자리는 `architecture.md` 「Key Design Decisions」와 `code-quality-assessment.md` 「이 intent가 닿는 자리」에 적었다.

## 용어

| 말 | 뜻 |
|---|---|
| Catch | 작업 하나(PR, PR 없는 병합, 본인 커밋 묶음)에 대한 카드. 표 `catch_asset` |
| 작업 열쇠(`workIdentity`, `wi1`) | 같은 작업인지 가르는 값. 회원마다 유일 |
| 근거(evidence) | Catch를 받치는 GitHub 기록(커밋·PR·이슈) 하나의 주소·판본·관측 사실 |
| 기록의 글 | 작성자가 GitHub에 남긴 원문 한 줄(PR 제목 또는 본인 커밋 첫 줄) |
| 소속 기록 | 커밋 SHA가 어느 Catch에 속하는지. 표 `commit_assignment` |
| 발행본 | 고른 항목의 고정 사본과 링크 하나. 표 `publication`·`published_item` |
| 면접관 | Catch 링크를 받아 보는 사람. 코드에서는 recipient(받은 사람) |
| 팀장 | 이 프로젝트의 intent를 정하는 우리 팀장 |
