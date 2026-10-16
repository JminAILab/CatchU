# 10월 원본 보호 예외 — 계약 설계 단독 후속 확인 (2026-10-15)

## 기록 지위와 판본

PR [#309](https://github.com/JminAILab/CatchU/pull/309)에 이미 반영된 계약 요약 변경을 확인·검증 기록으로 연결한다. 산출물을 다시 쓰거나 저장하지 않는다. 아래 답은 팀장 결정 댓글과 현재 PR 판본에서 정리했으며 제품 결정을 다시 선택한 것이 아니다. 이 문서의 마지막 요약 확인은 별도의 팀장 답을 기다린다.

- 작업 위치: /Users/ljm/Desktop/github/CatchU. PR 브랜치 `docs/원본보호-10월-예외`가 다른 작업 폴더에 체크아웃돼 있어, 이 폴더는 같은 판본에 브랜치 없이 둔다.
- HEAD: `85ebe1f0443d139996b6b916a5a0335c01cf31b1`. `git merge-base HEAD origin/dev`: `90e5a12d921ba8242b5bf727f2d022b359513663`.
- 실행 버전: aidlc 2.11.0 (runtime 2.11.0). intent 커서: `260914-catchu-october-mvp`(끝에 LF). 이미 대상 intent이므로 switch는 실행하지 않는다.
- 변경 커밋: `5d1f90ed1ad82c541f26df6421aaa23fab7b0094`(「원본 보호」·OQ-B3에 10월 예외), `85ebe1f0443d139996b6b916a5a0335c01cf31b1`(NONE의 뜻·공급 부재 구분·Blocks 칸·한계 보완).
- 본 흐름은 functional-design / Completed다. 상태·기존 승인·12월 intent는 보존한다.
- 감사 기록에서 2026-09-23T07:02:00Z의 single-stage:contract-design STAGE_STARTED 한 건, 해당 Workflow의 STAGE_COMPLETED 없음 확인. 새 계약 실행을 열지 않는다.

## 질문·답

### Q1. 무엇을 바꿨고 근거는 무엇인가?

[Answer]: 계약 요약(contract-summary.md)의 「원본 보호」 행과 Open questions의 OQ-B3 행만 제자리에서 고쳤다. 근거는 [#23 2026-10-15 팀장 결정](https://github.com/JminAILab/CatchU/issues/23#issuecomment-6189227348)이다. 분석 결과를 Catch로 등록할 때 api는 저장소 보호 기록을 반드시 요구하는데, [2026-09-28 결정](https://github.com/JminAILab/CatchU/issues/23#issuecomment-5869226609)으로 10월에는 원본 비공개 관측을 하지 않아 이 기록을 채울 쪽이 없다. 그래서 후보가 있는 결과는 MOCK·LIVE 모두 등록에 실패한다. 10/15 결정은 10월에 관측 없이 '관측 안 함'·NONE으로 기록하기로 했다. 다른 행·스키마·YAML·ERD는 바꾸지 않았다. 문서는 221줄을 유지해 다른 문서의 줄 고정 링크를 보존한다.

### Q2. 10월의 NONE은 무엇을 뜻하고 무엇을 뜻하지 않는가?

[Answer]: 등록 때 10월 정책 공급자가 출처를 '관측 안 함'으로 밝혀 기록하는 정책값이다. 원본이 공개임을 확인했다는 뜻이 아니다. 공급 부재·실패·맥락 불일치는 NONE으로 채우지 않으며, 그런 경우는 기존 규칙대로 반영 실패다. 이미 확인된 SOURCE_PRIVATE와 그 근거는 유지하고, 확인된 SOURCE_PRIVATE의 공개 차단 규칙은 고정이다. Catch의 PRIVATE/PUBLIC과 최초 PRIVATE·별도 공개 규칙은 「공개」 행 그대로이며 이 예외와 별개다.

### Q3. 10월 예외와 남은 미결은 어떻게 나뉘는가?

[Answer]: OQ-B3의 Blocks 칸을 "10월 이후 실제 관측 연결(10월 실제 자료 공개는 막지 않음)"로 바꿔, 10월 실제 자료 공개가 관측 구현을 기다리지 않는다는 점과 남은 미결이 이후 실제 관측 연결이라는 점을 구분했다. 관측 경로·주기·오류 처리·재공개·연동 해제·보관과 담당(A/B/F/H)은 그대로 미결이다. 등록 뒤 원본이 비공개로 바뀌어도 10월에는 감지·차단하지 않는다는 한계를 계약에 적었다. 처음부터 비공개인 저장소는 요구사항 FR1.1과 worker 수집 검사에 따라 분석 대상이 아니다.

### Q4. 이 기록과 PR에 넣지 않는 것은 무엇인가?

[Answer]: 보호 기록 공급자 구현, 기존 근거 보존 코드, 근거 주소 대조의 대소문자 처리, api 기능 문서와 ERD의 예외 문장은 [#105 요청](https://github.com/JminAILab/CatchU/issues/105#issuecomment-6189230335)에 따라 #105에서 E/B가 처리한다. 실제 저장소 좌표의 정본은 #252가 맡는다. 이 PR만으로 등록 실패가 해결되거나 #105가 완료되는 것은 아니다. u2-api 기능 설계는 이번에 바꾸지 않았으므로 새 단독 실행을 열지 않는다.

### Q5. 확인 이후의 실행·보존 경계는 무엇인가?

[Answer]: 이 요약 확인 답을 받은 뒤 log answer, 검토 요청, report --single을 각각 한 번만 실행한다. SUMMARY_RECEIPT_MISSING 검토 거부와 kind:error 완료 거부가 나오면 원문을 검증·도구 파일에 보존하고 9/23 실행을 열어 둔다. 재시도, 질문 파일 이동, 추가 확인, restart-stage, 본 흐름 next 등 우회를 하지 않는다.

## 검증·보존·커밋 범위

산출물(contract-summary.md 등 계약 설계 산출물)은 `85ebe1f0`과 바이트 동일하게 둔다. 이전 single-*·review*.md·aidlc-state.md·12월 intent는 보존한다. 감사 기록은 도구가 추가하는 기록만 허용하며, 이 작업 전부터 있던 미커밋 기록도 커밋에 포함한다.

새 기록 3개(질문·검증·도구 기록)와 10월 감사 파일만 PR #309 브랜치에 커밋한다. .local-handoffs/ 제외. aidlc doctor·버전 변경·park·compose·원격 이슈/Project 갱신은 실행하지 않는다.

실제 검사 명령·원문·적용 한계는 [검증 기록](single-2026-10-15-protection-exception-verification.md), [도구 기록](single-2026-10-15-protection-exception-tools.json)에 둔다.

## Consolidated Summary Confirmation

계약 요약 「원본 보호」·OQ-B3에 10월 예외를 적은 변경을 산출물 재작성 없이 확인 기록으로 연결한다. 10월에는 원본을 관측하지 않고, 등록 때 정책 공급자가 '관측 안 함'을 밝혀 NONE으로 기록한다. 이 NONE은 공개 확인이 아니며, 공급 부재·실패·맥락 불일치를 NONE으로 채우지 않는다. 확인된 SOURCE_PRIVATE와 근거, 그 공개 차단은 유지한다. 10월 실제 자료 공개는 관측을 기다리지 않고, 남은 미결은 이후 실제 관측 연결이다. 등록 뒤 비공개 전환은 10월에 막지 않는다. 구현·api 문서·ERD는 #105, 좌표는 #252 몫이다. 9/23의 열린 계약 단독 실행에 확인·검토·완료 요청을 한 번씩 연결하고 거부 원문을 기록하며 우회하지 않는다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
