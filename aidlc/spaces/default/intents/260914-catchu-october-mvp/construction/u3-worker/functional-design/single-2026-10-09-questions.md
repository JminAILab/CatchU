# Functional Design 단독 정정 — 2026-10-09 u3-worker Catch 제목 규칙 (#120)

## 사용자 결정과 수정 범위

근거는 [Catch 결정 문서](../../../../../../../../docs/ai-dlc-input-mvp/2026-10-08_catch-decisions.md)의 「AI-DLC로 반영할 것」(92~95행), PR #260 병합 커밋 `3b025df9ba5c2d5285a4cacd28382e7a3fd45a28`, 팀장(ljm0850)의 이번 지시다. 작업 위치는 `/Users/ljm/Desktop/github/CatchU`, 브랜치는 `docs/catch-title-contract-1009`이며 HEAD·origin/dev·분기 기준은 모두 `3b025df9ba5c2d5285a4cacd28382e7a3fd45a28`이다. 9/24 기록처럼 요약 확인 뒤 산출물을 고친다. 이번 대상은 u3-worker의 rules.md 다섯 곳과 functional-spec.md 새 문단 하나다. 앞선 계약·u2-api 확인을 이 단계 확인으로 재사용하지 않는다.

### Q1. BR3.2의 제목 생성 방식과 값 없음을 어떻게 정정하는가?

[Answer]: BR3.2 logic의 등록 기준 앞부분은 보존하고 title 부분을 팀장 지시 문안 그대로 바꾼다. 제목은 ‘무엇을 했나’를 짧은 명사구로 나타내며 근거가 가리키는 회원 커밋의 추가·삭제 줄과 변경 파일(경로·상태)로 확인되는 조각(대상·종류·동작)으로만 만든다. 모델은 대상과 근거 줄을 지목하고 종류·동작과 제목 글자는 코드가 정한다. 평가하는 말을 넣지 않되 대상 이름 안의 낱말은 거르지 않는 한계를 적는다. 생성이나 확인에 실패하면 null로 둔다. workFacts 첫 항목으로 채운다는 기존 문구는 제거한다. 규칙 요약표 BR3.2·BR3.3도 근거 조각의 짧은 명사구·실패 시 null·제목만 null이면 failures 아님으로 맞춘다.

### Q2. 제목만 null인 어떤 경우를 failures에서 제외하는가?

[Answer]: BR3.2 violation에 초안이 나왔는데 제목만 null인 다음 다섯 경우를 failures에 넣지 않는다고 적는다: 확인 실패, 3회 고쳐 써도 형식 위반, 요청당 고쳐 쓰기 상한에 이름, 시간 부족으로 멈춤, 고쳐 쓰기 호출 실패. 근거 부족/기준 미달은 notProvided, 수집/생성 오류는 failures라는 기존 구분과 없는 사실을 추정하지 않는 원칙은 보존한다. 생성 호출 자체의 실패를 제목만 null인 경우로 바꾸지 않는다.

### Q3. 재호출 예외와 기능 설계 문단을 어떻게 연결하는가?

[Answer]: BR3.4 violation 뒤에 제목 형식 고쳐 쓰기만 예외로 둔다(제목당 최대 3회, 요청당 상한 안, 호출이 실패하면 다시 부르지 않음). BR3.5 violation 뒤에는 “한 분석 안의 제목 고쳐 쓰기는 분석 재시도가 아니다”를 덧붙인다. 각 규칙의 id·source·개수와 나머지 내용은 보존한다.

functional-spec.md의 기존 40행 “R-01·R-02 수정본 90bf289를 적용한다. … 보류 정책·추가 호출 금지와 기존 M1 첫 연결 결과 승인 1회를 유지한다.”는 한 글자도 바꾸지 않는다. 그 다음에 빈 줄과 다음 문단만 넣는다.

> 2026-10-09 팀장 결정([Catch 결정](../../../../../../../../docs/ai-dlc-input-mvp/2026-10-08_catch-decisions.md))으로 위 추가 호출 금지에 예외를 하나 둔다. worker는 한 분석 안에서 Catch 제목이 형식을 어겼을 때만 제목을 고쳐 쓰려고 LLM을 다시 부를 수 있다. 제목당 최대 3회이고, 요청당 고쳐 쓰기 호출 상한(이슈에서 정함)과 요청당 총 처리 시간 상한 안이며 생성 호출 상한에는 세지 않는다. 요청당 상한에 이르면 그 뒤 제목은 null로 둔다. 생성 호출이나 고쳐 쓰기 호출이 실패하면(시간 초과·서버 오류 포함) 다시 부르지 않는다. 한 분석 안의 제목 고쳐 쓰기는 분석 재시도가 아니다.

13행의 자동 재분석/보완 금지와 16행 수신 확인/분석 재호출 경계도 보존한다. 요청당 호출 상한의 숫자·제목 40자 제한·숫자 규칙·자동 생성 안내·근거 순서 세부·그 밖의 제안은 추가하지 않는다.

### Q4. 실행을 어떻게 연결하고 무엇을 보존하는가?

[Answer]: u3-worker의 첫 기능 설계 단독 기록이다. 새 functional-design 단독 실행을 next --stage functional-design --single과 엔진이 반환한 continue 두 번으로 열었다. lead·support 관점을 inline으로 적용하며 팀장 지시에 따라 이 Unit의 두 파일만 정정한다. 엔진의 세 Unit 생성 대상 목록을 이유로 다른 산출물을 생성하거나 다시 저장하지 않는다. single 실행에는 diary·learnings를 수행하지 않는다.

변경 전 traceability 센서는 exit 0이지만 pass=false, findings_count=39로 이전 verification.md의 FAIL 39건과 같다. 수정 뒤도 실패 그대로 비교하고 건수가 달라지면 고치지 않고 보고한다. 요약 확인 뒤 지정 검사를 수행하고 검토 요청 1회, aidlc-architecture-reviewer-agent 독립 검토 1회로 결정 86~97행·이 Unit diff·계약 diff를 대조한다. 반환된 recordVerdict는 한 번 기록하며 READY일 때만 report --single을 한 번 실행한다. NOT-READY이면 산출물 수정과 report 없이 지적 원문을 남기고 멈춘다.

선행 u2-api는 별도 요약 확인·독립 검토 READY·완료 보고 kind:done으로 마쳤다. 검토 사본은 엔진이 만든 u1-web/reviews/review-06.md이며 이동하거나 고치지 않는다. 검토 요청의 CHANGE_ACCEPTED 3건은 그대로 기록했고 기존 rules.md·functional-spec.md·traceability.json을 다시 저장하지 않았다.

앞선 계약은 요약 확인 성공 후 검토 요청 exit 1 SUMMARY_RECEIPT_MISSING, 완료 보고 exit 0 kind:error로 각각 한 번 거부됐다. 계약 설계 단독 실행은 열린 채 두며, 이번 정정의 확인은 PR 리뷰로 한다. 요약 확인과 단독 완료는 PR 승인이나 후속 구현 완료를 뜻하지 않는다. 요구사항·도메인 설계의 금지 문장은 소급 수정하지 않고 이 경우만 좁힌다. 재시도·질문 파일 이동/삭제·추가 영수증·우회·제안된 복구 명령은 실행하지 않는다.

CHANGE_ACCEPTED 알림은 원문 그대로 기록하고 알림을 없애려고 다시 저장하지 않는다. SUMMARY_ARTIFACT_UNAUTHORIZED 또는 예상 밖 엔진 오류는 한 번 기록하고 모든 진행을 멈춰 보고한다. 이 질문 파일의 모든 내용은 요약 확인 전에 작성하며 확인 영수증 뒤에는 고치지 않는다.

## 검증과 보존 범위

- rules.md와 entities.md의 YAML 블록을 파싱하고 규칙 id·개수·source 및 지정한 다섯 곳 외 내용을 분기 기준과 대조한다. entities.md와 모든 traceability.json은 수정하지 않는다.
- entities.md·rules.md·functional-spec.md 필수 절, functional-spec.md의 지정 다섯 상류 참조, traceability.json 센서를 실행한다. 기존 FAIL 39건을 PASS로 바꾸지 않는다.
- functional-spec.md의 새 문단 외 바이트와 기존 40행을 보존한다. 요구사항·도메인 설계·기존 승인/질문/검증/리뷰 기록을 소급 수정하지 않는다.
- 전체 추적 SHA-256 1,077개와 보호 파일 243개(12월 intent 36개 포함)의 기준선을 유지한다. 서비스 코드·docs/·12월 intent·하네스·공유 memory는 이번 범위 밖이다. 실제 title null 처리와 대체값 제거·제목 고쳐 쓰기 구현은 ②③ 후속이다.
- API 설치·빌드와 계약 변경 전후 합성 검사기 비교는 통과했다. Docker daemon 연결 실패로 시험 DB 준비는 실행하지 못했다. 최종 서비스·문서 크기·diff·해시 검사는 네 단계 뒤 커밋 전에 한 번 수행한다.
- 검증 파일은 이 폴더의 single-2026-10-09-verification.md, 공통 [도구 기록](../../../inception/contract-design/single-2026-10-09-tools.json)에 실행 원문·결과를 남긴다. 새 검토 사본은 엔진이 만든 실제 위치와 이 Unit의 연결을 기록한다.
- 로컬 커밋 두 개는 모든 단계와 검증 뒤 만들고 기록 커밋 전에는 준비 백업 tail의 사건 종류·세션·시각을 별도 확인받는다. push·PR은 팀장이 “올려”라고 한 뒤에만 하며 이슈 댓글/본문·Project는 바꾸지 않는다.

## Consolidated Summary Confirmation

u3-worker rules.md에서 제목을 근거로 확인된 대상·종류·동작 조각으로 만들고 생성/확인 실패 시 null로 두도록 정정한다. 초안이 나왔는데 제목만 null인 다섯 경우는 failures에서 제외한다. BR3.4·BR3.5와 functional-spec.md에 제목 형식 고쳐 쓰기의 좁은 예외를 연결하되 기존 40행과 과거 승인 문장은 보존한다. 규칙 id·source·개수와 기존 추적 FAIL 39건을 유지하고 다른 설계·서비스 코드는 고치지 않는다. 이 단계의 별도 Looks correct를 기록한 뒤 두 파일만 정정하고 독립 검토 READY일 때만 단독 완료를 보고한다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
