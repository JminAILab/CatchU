# Contract Design 단독 정정 — 2026-10-09 Catch 제목 null·제목 고쳐 쓰기 예외·근거 순서 (#120)

## 사용자 결정과 수정 범위

근거는 [Catch 결정 문서](../../../../../../../docs/ai-dlc-input-mvp/2026-10-08_catch-decisions.md)의 「AI-DLC로 반영할 것」(88~97행), PR #260 병합 커밋 `3b025df9ba5c2d5285a4cacd28382e7a3fd45a28`, 팀장(ljm0850)의 이번 지시다. 작업 위치는 `/Users/ljm/Desktop/github/CatchU`, 브랜치는 `docs/catch-title-contract-1009`이고 HEAD·origin/dev·분기 기준(merge-base)은 모두 `3b025df9ba5c2d5285a4cacd28382e7a3fd45a28`이다. 9/24 기록처럼 요약 확인 뒤 산출물을 고친다. 이 단계에서는 worker-messages.yaml·common.yaml·contract-summary.md만 고치며, 다른 세 Unit의 정정은 각각 별도 요약 확인 뒤 수행한다.

### Q1. 제목 값 없음을 어떻게 표기하는가?

[Answer]: worker-messages.yaml의 Candidate.title, common.yaml의 Catch.title·PublicCatch.title 세 곳을 `{"type":"string","minLength":1,"nullable":true}`로 바꾼다. title은 각각 required 목록에 남아 있는 필수 칸이며 값 없음만 허용한다. 값이 있으면 1자 이상이고 빈 문자열과 칸 삭제는 거부한다. OpenAPI 3.0.3 및 같은 묶음의 nullable 표기를 따르며 `type: [string, 'null']`은 쓰지 않는다. ShareLink·ShareCreate의 링크 제목과 member-api.yaml·recipient-api.yaml은 그대로 둔다. 40자 상한은 제안값이므로 넣지 않는다.

### Q2. 근거 목록 순서는 어디에 어떤 문장으로 적는가?

[Answer]: contract-summary.md의 workIdentity 문단 뒤, 「P — 수신자 API」 앞에 다음 문단을 넣는다. “Catch 제목(Candidate·Catch·PublicCatch의 `title`)은 필수 칸이되 값 없음을 허용한다(null 허용, 값이 있으면 1자 이상). 제목이 없으면 null이며 생성된 제목처럼 꾸미지 않는다. 근거 목록 순서가 표시 순서다. B는 받은 evidence 순서를 저장하고 회원·수신자 응답의 evidence를 같은 순서로 돌려준다.” 근거는 결정 문서 88·30행과 [#165 요청](https://github.com/JminAILab/CatchU/issues/165#issuecomment-6055244028)이다. PR·병합 근거 우선 및 본인 커밋 최근순 같은 순서 세부는 이번 반영 목록에 없어 넣지 않는다. 근거 위치 속성은 팀장이 2026-10-09 위임을 거두고 `position`(정수, 1부터)으로 정했으며 u2-api 질문 Q2와 별도 ERD 정정에 기록한다.

### Q3. 재호출 예외와 제목만 null인 결과는 어떻게 구분하는가?

[Answer]: contract-summary.md의 「자동 분석 재시도를 허용하지 않는다.」 뒤에 “한 분석 안의 제목 고쳐 쓰기는 분석 재시도가 아니다.”를 덧붙인다. 「자동 외부 재시도·추가 호출을 허용하지 않는다.」 뒤 같은 문단에는 결정 89행 문안을 그대로 덧붙인다. “worker는 한 분석 안에서 Catch 제목이 형식을 어겼을 때만 제목을 고쳐 쓰려고 LLM을 다시 부를 수 있다. 제목당 최대 3회이고, 요청당 고쳐 쓰기 호출 상한(이슈에서 정함)과 요청당 총 처리 시간 상한 안이며 생성 호출 상한에는 세지 않는다. 요청당 상한에 이르면 그 뒤 제목은 null로 둔다. 생성 호출이나 고쳐 쓰기 호출이 실패하면(시간 초과·서버 오류 포함) 다시 부르지 않는다.” worker 메시지 계약 표의 Result 행에는 “초안이 나왔는데 제목만 null인 경우는 failures가 아니다.”를 schemaVersion=1 앞에 넣는다. 생성 호출 자체의 실패는 기존처럼 failures에 넣는다. GitHub 조회 재시도·분석 전체 재실행·결과 재전달을 허용하는 변경은 아니다.

### Q4. 소급 수정하지 않는 기록과 반영 목록 밖의 범위는 무엇인가?

[Answer]: 요구사항 본문·실행 허가 표의 「추가 호출 금지」, domain-design/components.md의 「실패와 중복」, decisions.md ADR-007, domain-design-questions.md Q4·Q5 답을 소급 수정하지 않는다. 요구사항·도메인 설계의 금지 문장은 소급 수정하지 않고 이 경우만 좁힌다. 기존 single-* 질문·검증·도구 파일과 review·verification·questions, 모든 traceability.json 및 u3-worker 기능 설계의 기존 R-01·R-02 적용 문장은 보존한다. 직접 편집/재생성 없음·초안/질문 실패 분리·제목만 바꾼 중복 등록 금지·PublicCatch 투영·기존 근거 문장은 유지한다. 숫자 규칙·「작성자로 기록된」·자동 생성 안내·groupingLimitations·근거 순서 세부·위치 유일성은 추가하지 않는다. docs/·12월 intent·하네스·공유 memory·서비스 코드·DB 마이그레이션·화면·worker 대체값 제거·제목 고쳐 쓰기 구현은 이번 정정 범위 밖이다.

### Q5. 어느 실행에 이어 붙이며 거부 결과는 어떻게 남기는가?

[Answer]: 감사 기록 전체를 읽어 확인한 2026-09-23T07:02:00Z의 single-stage:contract-design 시작 한 건에 이어 붙인다. 완료 기록은 없고 새 실행을 열지 않는다. aidlc와 프로젝트 스탬프는 모두 2.10.0이며 본 흐름은 Completed·relaxed다. 검토 요청과 report --single은 각각 한 번만 실행한다. 단계 폴더 전체 질문 파일의 단독 확인 요구로 SUMMARY_RECEIPT_MISSING이 반환되면 거부 원문을 검증 파일·도구 기록에 남긴다. 계약 설계 단독 실행은 열린 채 두며, 이번 정정의 확인은 PR 리뷰로 한다. 요약 확인과 단독 완료는 PR 승인이나 후속 구현 완료를 뜻하지 않는다. 재시도·질문 파일 이동/삭제·추가 영수증·우회·제안된 복구 명령·설정 변경은 하지 않는다. CHANGE_ACCEPTED 알림은 그대로 기록하고 재저장으로 없애지 않는다. SUMMARY_ARTIFACT_UNAUTHORIZED나 예상 밖 오류면 한 번 기록하고 모든 진행을 멈춰 보고한다. 기능 설계 독립 검토가 NOT-READY면 산출물을 고치거나 완료 보고를 하지 않는다.

## 검증과 보존 범위

- 계약 YAML 4개·계약 요약 YAML 블록을 파싱하고 `$ref` 203개와 모든 연산의 응답 코드 집합을 분기 기준과 대조한다. title 세 곳의 nullable·필수 목록·minLength와 링크 제목 보존을 확인한다. 계약 필수 절(H2 11개)·상류 참조 센서를 실행한다.
- API 빌드 뒤 첫 요약 확인 전에 합성 Result로 세 검사기를 비교했다. 변경 전 null·빈 문자열·칸 삭제는 모두 거부했다. 계약 수정 뒤 null만 세 곳 모두 통과하고 빈 문자열·칸 삭제는 계속 거부하는지 비교한다. 스크립트는 저장소 밖에 두고 전문·결과는 도구 기록에 남긴다.
- 대상 7개를 제외한 10월 추적 파일·12월 intent(36개)·intents.json·공통 감사·memory의 SHA-256 기준선(243개)과 전체 추적 파일 기준선(1,077개)을 저장소 밖에 남겼다. 감사 파일은 HEAD 판본 143,643바이트를 그대로 앞에 두며 착수 전체 156,038바이트와 미커밋 12,395바이트를 보존한다. 준비 백업 tail.md는 11,847바이트이며 남은 548바이트는 이번 세션 시작 기록이다.
- u3-worker 추적 센서의 변경 전 FAIL 39건을 기록했다. u2-api 23건·u1-web 43건은 기존 검증 기록과 비교하고 실패를 고치거나 PASS로 바꾸지 않는다. u3-worker 기능 설계의 기존 40행을 바이트 비교한다.
- API 의존성 설치와 build는 통과했고 package.json·package-lock.json은 바뀌지 않았다. Docker daemon에 샌드박스 안팎 모두 연결하지 못해 시험 DB는 준비하지 못했다. 설치·DB 준비가 안 되면 해당 시험을 실행하지 못함으로 적고 계속하라는 팀장 지시를 따른다. 실제 회원 자료·GitHub 원문 대신 합성 자료만 쓴다.
- 세 Unit의 개별 정정·독립 검토를 마친 뒤 서비스 검사·문서 크기·diff·전체 보존 확인을 한 번 수행한다. 범위 밖 코드는 고치지 않으며 시험 기대값 예외가 필요하면 파일:행·실패 원문·제안을 팀장에게 먼저 보인다.
- 최종 결과는 산출물 정정과 AI-DLC 기록의 로컬 커밋 두 개다. 기록 커밋에는 착수 전 미커밋 감사 꼬리도 의도된 예외로 보존하며 커밋 전 사건 종류별 개수·세션 ID·첫/끝 시각을 별도로 확인받는다. .local-handoffs/와 무시 대상 runtime은 커밋하지 않는다. push·PR·이슈·Project 갱신은 하지 않는다.

## Consolidated Summary Confirmation

Candidate·Catch·PublicCatch의 title을 필수 칸으로 유지하면서 null만 허용하고, 계약 요약에 제목 없음·근거 표시 순서와 B의 순서 보존, 제목 형식 고쳐 쓰기의 좁은 재호출 예외, 분석 재시도와의 구분 및 제목만 null인 경우 failures 제외를 반영한다. 요구사항·도메인 설계의 기존 금지와 승인 기록은 소급 수정하지 않고 이 경우만 좁힌다. 별도 요약 확인 뒤 계약 세 파일만 고치며 9/23의 열린 단독 실행에 검토 요청·완료 보고를 각각 한 번 연결하고, 거부 시 원문을 보존한 채 실행을 열어 둔다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
