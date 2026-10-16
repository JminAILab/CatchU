# Functional Design 단독 정정 — 2026-10-09 u1-web Catch 제목 없음 표시 (#120)

## 사용자 결정과 수정 범위

근거는 [Catch 결정 문서](../../../../../../../../docs/ai-dlc-input-mvp/2026-10-08_catch-decisions.md)의 「AI-DLC로 반영할 것」(96행), PR #260 병합 커밋 `3b025df9ba5c2d5285a4cacd28382e7a3fd45a28`, 팀장(ljm0850)의 이번 지시다. 작업 위치는 `/Users/ljm/Desktop/github/CatchU`, 브랜치는 `docs/catch-title-contract-1009`이며 HEAD·origin/dev·분기 기준은 모두 `3b025df9ba5c2d5285a4cacd28382e7a3fd45a28`이다. 9/24 기록처럼 요약 확인 뒤 산출물을 고친다. 이 단계의 대상은 u1-web functional-spec.md 41행 한 곳이다. 앞선 세 단계의 확인을 이 단계에 재사용하지 않는다.

### Q1. 회원 목록·상세의 title 문장에 무엇을 덧붙이는가?

[Answer]: functional-spec.md 41행의 “목록·상세는 F가 생성하고 B가 저장한 `title`을 사용하며 구직자의 제목 편집은 제공하지 않는다.” 바로 뒤에 다음 한 문장만 넣는다.

> 제목이 null이면 다른 값으로 채우지 않고 제목 없이 보인다.

같은 행의 저장소 필터·Catch 상세 모달·주소 파라미터·새로고침/뒤로 가기/재로그인·W03-R/A-02/A-03 경계 등 나머지 문장은 바꾸지 않는다. title 편집·대체 제목·안내 문구·새 UI 동작을 추가하지 않는다. 실제 web 응답 검사·타입·화면 코드는 후속 ② 범위이며 이번 설계 정정에 포함하지 않는다.

### Q2. 공개 자료 행(75행)을 그대로 두는 이유는 무엇인가?

[Answer]: 결정 문서 82행과 팀장 지시에 따라 수신자 화면의 제목 null 처리·배치·공통 안내는 #152(C)에서 정한다. 이번 AI-DLC 반영 목록은 회원 목록·상세의 41행 덧붙임만 지정하므로 75행 PublicCatch 공개 자료 행은 그대로 둔다. PublicCatch.title의 null 허용 계약은 앞선 계약 정정에 반영됐지만 이 단계에서 수신자 화면 설계를 확장하지 않는다. 링크 제목·최소 질문 공개 제한·권한·오류·재전송 규칙도 바꾸지 않는다.

### Q3. 실행을 어떻게 연결하고 무엇을 보존하는가?

[Answer]: 네 번째 별도 단독 실행이다. next --stage functional-design --single과 반환된 continue 두 번으로 열고, lead·support 관점을 inline으로 적용한다. 엔진의 여러 Unit 생성 목록을 이유로 다른 산출물을 생성하거나 다시 저장하지 않는다. single 실행에는 diary·learnings를 수행하지 않는다. 기존 본 흐름 Completed·functional-design 상태를 유지한다.

앞선 u2-api와 u3-worker는 각각 별도 요약 확인 뒤 독립 검토 READY·완료 보고 kind:done으로 마쳤다. 엔진 검토 사본은 이 폴더의 reviews/review-06.md(u2-api), reviews/review-07.md(u3-worker)이며 이동하거나 고치지 않는다. 검토 요청의 CHANGE_ACCEPTED는 u2 3건·u3 4건 원문 그대로 기록했고 알림을 없애기 위한 다시 저장은 하지 않았다.

앞선 계약은 요약 확인 성공 뒤 검토 요청 exit 1 SUMMARY_RECEIPT_MISSING, 완료 보고 exit 0 kind:error로 각각 한 번 거부됐다. 계약 설계 단독 실행은 열린 채 두며, 이번 정정의 확인은 PR 리뷰로 한다. 요약 확인과 단독 완료는 PR 승인이나 후속 구현 완료를 뜻하지 않는다. 요구사항·도메인 설계의 금지 문장은 소급 수정하지 않고 이 경우만 좁힌다. 재시도·질문 파일 이동/삭제·추가 영수증·우회·제안된 복구 명령은 하지 않는다.

이번 별도 요약 확인 뒤 한 문장만 추가하고 지정 센서를 실행한다. 기존 traceability FAIL 43건을 실패 그대로 비교하며 건수가 달라지면 고치지 않고 보고한다. 검토 요청 1회와 aidlc-architecture-reviewer-agent의 독립 검토 1회로 결정 86~97행·u1-web diff·계약 diff를 대조한다. 반환된 recordVerdict를 한 번 기록하고 READY일 때만 report --single을 한 번 실행한다. NOT-READY이면 산출물을 고치거나 report하지 않고 지적 원문과 함께 멈춘다.

CHANGE_ACCEPTED는 원문 그대로 기록하며 알림을 없애려고 다시 저장하지 않는다. SUMMARY_ARTIFACT_UNAUTHORIZED 또는 예상 밖 엔진 오류는 한 번 기록하고 모든 진행을 멈춰 보고한다. 질문 파일의 모든 내용은 요약 확인 전에 작성하며 확인 영수증 뒤에는 고치지 않는다.

## 검증과 보존 범위

- functional-spec.md의 지정 한 문장 외 모든 바이트와 기존 75행을 분기 기준과 대조한다. traceability.json·기존 질문/검증/리뷰와 다른 산출물은 고치지 않는다. 확인 전 대상 파일이 분기 기준과 바이트 동일함을 확인했다.
- functional-spec.md 필수 절, 지정 다섯 상류 참조(산출물 functional-spec,traceability), traceability.json 센서를 실행한다. 기존 추적 FAIL 43건을 PASS로 바꾸지 않는다.
- 전체 추적 SHA-256 1,077개와 보호 파일 243개(12월 intent 36개 포함)의 기준선을 유지한다. 서비스 코드·docs/·12월 intent·하네스·공유 memory와 기존 승인 기록은 이번 범위 밖이다.
- API 설치·빌드와 계약 변경 전후 합성 검사기 비교는 통과했다. Docker daemon 연결 실패로 시험 DB 준비는 실행하지 못했다. 이 단독 실행 뒤 최종 서비스·문서 크기·diff·전체 해시 검사를 커밋 전에 한 번 수행한다. 실패 시 계약 문안·범위 밖 코드를 고쳐 통과시키지 않는다. 계약을 읽는 시험 기대값만의 변경이 필요한 예외도 파일·실패·기대값을 먼저 제시하고 별도 허락을 받는다.
- 검증 파일은 이 폴더의 single-2026-10-09-verification.md, [공통 도구 기록](../../../inception/contract-design/single-2026-10-09-tools.json)에 실행 원문·결과를 남긴다. 엔진 검토 사본의 실제 경로와 u1-web 연결을 기록하고 사본은 이동/수정하지 않는다.
- 최종 확인 뒤 로컬 커밋 두 개를 만든다. 기록 커밋 전에는 준비 백업 tail의 사건 종류·세션 ID·첫/끝 시각을 별도 확인받는다. stash·백업은 보존하며 감사 파일·상태는 직접 편집하지 않는다. push·PR은 팀장이 “올려”라고 한 뒤에만 하고 이슈 댓글/본문·Project는 바꾸지 않는다.

## Consolidated Summary Confirmation

u1-web functional-spec.md 41행의 제목 편집 금지 문장 바로 뒤에 “제목이 null이면 다른 값으로 채우지 않고 제목 없이 보인다.”만 추가한다. 같은 행의 나머지 문장과 75행 공개 자료 행은 보존하며 수신자 화면 null 처리·배치는 #152(C)에 맡긴다. 다른 설계·서비스 코드와 기존 추적 FAIL 43건을 유지한다. 이 단계의 별도 Looks correct 뒤 한 곳만 고치고 독립 검토 READY일 때만 단독 완료를 보고한다. 이후 최종 검사를 거쳐 두 로컬 커밋을 준비하며 기록 커밋 전 감사 꼬리를 별도 확인받는다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
