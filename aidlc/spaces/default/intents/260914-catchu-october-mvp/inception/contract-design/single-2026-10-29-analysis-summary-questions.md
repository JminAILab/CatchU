# 홈용 분석 접수 이력 유무 조회 — 계약 설계 단독 확인 (2026-10-29)

## 기록 지위와 판본

[#428](https://github.com/JminAILab/CatchU/issues/428)의 계약 PR에서 10월 회원 API에 경로 하나를 더하는 계약 수정을 이 단독 실행으로 기록한다. 아래 답은 #428 본문, [#155 합의](https://github.com/JminAILab/CatchU/issues/155#issuecomment-6488715811)와 그 앞의 [경로·응답 제안](https://github.com/JminAILab/CatchU/issues/155#issuecomment-6488191548), 이번 대화에서 담당자(yeongyeon1802)가 준 결정을 옮긴 것이며 제품 결정을 새로 고른 것이 아니다. 마지막 요약 확인은 담당자의 별도 답을 기다린다.

- 작업 위치: `C:\labs\catchu-428-contract`(worktree), 브랜치 `docs/홈-접수이력-조회-계약`.
- HEAD: `62ce6960e4c7c76dc4e14925bae27c3b636f7c3e`(로컬 `origin/dev`와 같음, 변경 없음에서 시작).
- 실행 버전: aidlc 2.11.1 (runtime 2.11.1), Claude Code.
- intent 커서: 시작 때 `aidlc/active-space`는 `default`로 이미 있었고 `active-intent`는 없었다. `aidlc engine intent 260914-catchu-october-mvp`로 대상 intent를 정했다.
- 본 흐름은 완료 상태이며 상태·기존 승인·12월 intent는 보존한다.
- 감사 기록에서 2026-09-23T07:02:00Z의 계약 단독 실행 STAGE_STARTED 한 건과 그 완료 기록 없음을 확인했다. 이번 단독 실행 시작은 새 시작 기록 없이 그 시도로 이어졌다.

## 질문·답

## Q1. [API 설계] 홈이 접수 이력 유무를 받는 방식

홈(#155)은 '저장소 연결 전'과 '준비 완료'를 나누려고 본인 접수 이력이 있는지만 알면 된다. 어디서 받을지에 따라 조회 실패를 따로 다룰 수 있는지가 달라진다.

- A. 별도 조회 `GET /v1/me/analysis-summary`를 둔다. 기존 `/analysis-requests/{requestId}`와 겹치지 않게 `/me` 아래에 둔다
- B. 기존 `GET /v1/me` 응답에 필드를 더한다
- C. 기존 `GET /v1/analysis-requests` 이력 목록의 첫 페이지로 판단한다
- X. Other (please specify)

[Answer]: A. #155 합의대로 별도 조회로 둔다. B는 이 값만의 조회 실패를 `/me` 전체와 따로 다룰 수 없어, C는 홈이 목록·상태를 받게 돼 기각했다(#428 「왜」). `GET /v1/me` 응답은 바꾸지 않는다. — 2026-10-29T06:51:27Z
**Mode:** chat

## Q2. [API 설계] 응답 본문·오류·헤더

홈 담당(D)이 합성 응답으로 먼저 준비할 수 있도록 응답과 오류를 고정한다.

- A. 200 본문은 `{ "hasAcceptedAnalysisRepository": boolean }` 하나(필수, 다른 필드 없음). 쿼리가 붙으면 400/`VALIDATION_FAILED`, 인증은 다른 회원 경로와 같은 401, 조회 실패는 500/`INTERNAL_ERROR`. 공통 헤더(`Cache-Control: no-store`)와 Access JWT 요구는 다른 회원 API와 같다
- B. A에 접수 건수나 최근 접수 시각을 더한다
- X. Other (please specify)

[Answer]: A. 합의한 응답만 두고 B는 합의 밖이라 넣지 않는다. 응답 목록은 합의가 정한 200·400·401·500만 적는다. 이 경로는 GitHub 연결·저장소·동의를 판단하지 않아 403이 없고, 자원 ID가 없어 404도 없다. — 2026-10-29T06:51:27Z
**Mode:** chat

## Q3. [업무 의미] true·false로 세는 대상

같은 '접수 이력'이라도 무엇을 세느냐에 따라 홈 표시가 달라진다.

- A. 인증된 본인의 영속 접수 요청(`requestState` ACCEPTED)이 1건 이상이면 true. 처리 상태(진행 중·성공·0건·부분 실패·실패, 실패 뒤 재요청)와 무관하고, 현재 선정 목록에서 빠진 저장소의 요청도 센다. 정상 조회 결과 0건이면 false
- B. 결과가 나온(성공) 요청만 센다
- C. 현재 선정 목록에 남은 저장소의 요청만 센다
- X. Other (please specify)

[Answer]: A. 거절된 시도는 분석 요청을 만들지 않으므로(계약 요약 「분석 접수·상태·재요청」의 requestState) 세지 않고, 다른 회원의 요청도 세지 않는다. true는 현재 분석할 수 있다거나 분석이 끝났다는 뜻이 아니다. 조회에 실패하면 false로 바꾸지 않고 500으로 응답한다. B는 [팀장 확인 2026-09-15](https://github.com/JminAILab/CatchU/blob/a5551ede2522dd46e26e2b870f56a59dbd649eb8/docs/ai-dlc-input-mvp/2026-09-14_followup.md#팀장-확인-2026-09-15-github-연동자산-탭-분석-경로)의 '진행 중·실패와 무관'과, C는 [#155 D 답변](https://github.com/JminAILab/CatchU/issues/155#issuecomment-6439664911)의 과거 이력 포함 동의와 어긋나 기각했다. — 2026-10-29T06:51:27Z
**Mode:** chat

## Q4. [계약 운영] 변경 분류와 고칠 위치

10월 기준은 응답 필드·상태 의미·권한·DB 관계와 유일성 변경을 계약 수정으로 본다. 새 응답이 생기므로 계약 수정이고, 어디까지 고칠지 정한다.

- A. 기존 경로·필드를 바꾸지 않고 더하는 계약 수정으로 다룬다. member-api.yaml 경로 끝에 새 경로를 두고, 계약 요약 「M — 회원 API」의 경로 목록과 경로 묶음 표, 「분석 접수·상태·재요청」 표에 의미 한 행을 더한다
- B. A에서 경로 묶음 표는 고치지 않는다
- X. Other (please specify)

[Answer]: A. 경로 묶음 표에 없는 경로는 의미·소유·FR 연결이 빠지므로 B는 기각했다. 묶음은 분석 행(E, FR1.1·FR1.4)에 더하고 홈 진입 FR11.1을 함께 적는다. 제공은 api E(팀원 2), 소비는 web 홈 D(팀원 3, #155)이며 D 리뷰를 받는다. common.yaml·ERD·worker 메시지·`GET /v1/me`는 바꾸지 않는다. api 구현과 api 기능 문서는 #428의 별도 구현 PR에서 한다. — 2026-10-29T06:51:27Z
**Mode:** chat

## 실행·보존 경계

요약 확인 답을 받은 뒤 log answer, 산출물 작성, 검토 요청, report --single을 각각 한 번만 실행한다. 검토 요청과 report --single이 10/13~10/15 기록처럼 단계 폴더의 본 흐름 질문 파일(contract-design-questions.md) 때문에 SUMMARY_RECEIPT_MISSING으로 거부되면 원문을 검증·도구 기록에 남기고 9/23 시도를 열어 둔다. 재시도, 질문 파일 이동, 다른 질문 파일에 요약 확인 추가, restart-stage, 본 흐름 next 같은 우회는 하지 않는다. 상태·감사 기록은 손으로 맞추지 않는다.

## 검증·보존·커밋 범위

계약 파일 두 개(member-api.yaml·contract-summary.md), 이번 single-2026-10-29-analysis-summary-* 질문·도구·검증 기록, 10월 intent 감사 기록을 커밋한다. `aidlc/spaces/default/intents/audit/`의 doctor 기록은 넣지 않는다. 그 밖의 파일(aidlc-state.md·intents.json·단계 memory.md 등)이 바뀌면 커밋하지 않고 보고한다. 커밋은 dev 대상 PR로 올리고 `Refs #428`로 연결한다. push와 원격 PR 생성은 담당자 확인 뒤에 한다.

## Consolidated Summary Confirmation

10월 회원 API에 본인 접수 이력 유무만 돌려주는 `GET /v1/me/analysis-summary`를 더한다. 200 본문은 `hasAcceptedAnalysisRepository` 하나이고, 쿼리는 400/`VALIDATION_FAILED`, 인증은 공통 401, 조회 실패는 false가 아닌 500/`INTERNAL_ERROR`다. 공통 헤더와 Access JWT는 다른 회원 API와 같다. true는 인증된 본인의 영속 접수 요청(ACCEPTED)이 1건 이상이라는 뜻이며, 처리 상태와 무관하고 선정 목록에서 빠진 저장소도 센다. 거절된 시도와 다른 회원의 요청은 세지 않는다. true는 현재 분석 가능이나 분석 완료를 뜻하지 않는다. member-api.yaml에 경로를 더하고, 계약 요약의 경로 목록·경로 묶음 표와 「분석 접수·상태·재요청」 표에 반영한다. 기존 경로·`GET /v1/me`·common.yaml·ERD는 바꾸지 않는다. 9/23의 열린 계약 단독 실행에 확인·검토·완료 요청을 한 번씩 연결하고, 거부되면 원문을 기록하며 우회하지 않는다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
