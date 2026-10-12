# Functional Design 단독 정정 — 2026-10-09 u2-api Catch 제목·근거 위치 (#120)

## 사용자 결정과 수정 범위

근거는 [Catch 결정 문서](../../../../../../../../docs/ai-dlc-input-mvp/2026-10-08_catch-decisions.md)의 「AI-DLC로 반영할 것」(90행), PR #260 병합 커밋 `3b025df9ba5c2d5285a4cacd28382e7a3fd45a28`, 팀장(ljm0850)의 이번 지시다. 작업 위치는 `/Users/ljm/Desktop/github/CatchU`, 브랜치는 `docs/catch-title-contract-1009`이며 HEAD·origin/dev·분기 기준은 모두 `3b025df9ba5c2d5285a4cacd28382e7a3fd45a28`이다. 9/24 기록처럼 요약 확인 뒤 산출물을 고친다. 이 단계에서는 u2-api의 entities.md 두 곳만 고친다. 계약 설계의 앞선 응답을 이 단계 확인으로 재사용하지 않는다.

### Q1. CatchAsset.title의 null 허용은 어떻게 반영하는가?

[Answer]: entities.md의 CatchAsset.title을 다음으로 바꾼다.

```yaml
      - {name: title, type: string, required: false, min_length: 1, constraints: "F가 생성한 값을 저장하며 구직자는 수정할 수 없음. 없으면 null이며 값이 있으면 1자 이상(빈 문자열 금지)"}
```

같은 파일 11행 규약은 “required=false만 null 허용”이다. ERD의 required는 값 없음 허용 여부이고 계약 YAML의 required 목록은 칸 존재 여부다. 따라서 ERD만 required=false로 바꾸며 계약 title은 필수 칸으로 유지한다. min_length=1과 구직자의 제목 수정 금지는 보존한다. ShareLink.title·그 밖의 속성·관계·제약은 바꾸지 않는다.

### Q2. 근거 위치 속성의 이름과 표기는 무엇인가?

[Answer]: 팀장이 2026-10-09 [#165 요청](https://github.com/JminAILab/CatchU/issues/165#issuecomment-6055244028)의 leechaeah 위임을 거두고 `position`으로 정했다. 결정 문서 90행의 “이름은 B 구현과 같게”에 대한 이번 확정이며 팀장이 #165에서 따로 알린다. 읽기 조회(`git log --oneline --all -- api/src/catches/entities/catch-evidence.entity.ts api/src/database/migrations`, `gh pr list --repo JminAILab/CatchU --state open --author leechaeah`)에서 다른 위치 속성 이름을 쓴 B 구현과 해당 작성자의 열린 PR은 관측되지 않았다. 이번 실행은 이슈 댓글·본문·Project를 바꾸지 않는다.

CatchEvidence의 coverageLimits 바로 뒤에 다음 속성 한 줄을 넣는다.

```yaml
      - {name: position, type: integer, required: true, min: 1, constraints: "받은 evidence 목록에서의 위치(1부터). 근거 목록 순서가 표시 순서이며 회원·수신자 응답은 이 순서로 근거를 돌려줌"}
```

정수 표기는 eligibleCandidateCount와 같게 쓴다. 받은 evidence 목록의 1부터 시작하는 위치이며 목록 순서가 표시 순서다. `unique(catchId, position)` 또는 그 밖의 위치 유일성은 결정에도 #165에도 없어 넣지 않는다. PR·병합 근거 우선·본인 커밋 최근순 같은 순서 세부도 추가하지 않는다. leechaeah의 PR 리뷰 요청에 위임을 거두고 position으로 정한 사실을 포함한다.

### Q3. 실행을 어떻게 연결하고 무엇을 보존하는가?

[Answer]: 이번 새 functional-design 단독 실행을 `aidlc engine orchestrate next --stage functional-design --single`로 열고 엔진의 두 load-steering 영수증을 순서대로 continue하여 run-stage를 받았다. lead·support의 inline 관점을 적용하며 대상은 u2-api다. 엔진이 세 Unit의 산출물 목록을 내놓았지만 팀장 지시에 따라 entities.md 두 곳만 고치고 기존 다른 산출물을 새로 생성하거나 다시 저장하지 않는다. 본 흐름 Completed·functional-design 상태와 이전 승인·질문·검증·추적·공유 memory는 보존한다.

요약 확인 뒤 이 Unit의 검사를 수행하고, 검토 요청 1회와 aidlc-architecture-reviewer-agent의 독립 검토 1회로 결정 86~97행·u2-api diff·계약 diff를 대조한다. 엔진이 반환한 recordVerdict를 한 번 기록하며 READY일 때만 report --single을 한 번 실행한다. NOT-READY이면 산출물 수정과 report 없이 지적 원문을 보존하고 멈춘다. 기존 traceability FAIL 23건은 그대로 실패로 기록하며 건수가 바뀌면 고치지 않고 보고한다.

앞선 계약의 요약 확인은 성공했지만 검토 요청은 exit 1 SUMMARY_RECEIPT_MISSING, 완료 보고는 exit 0 kind:error로 거부됐다. 각각 한 번 실행했고 재시도·질문 이동/삭제·추가 영수증·우회·제안된 복구 명령은 하지 않았다. 계약 설계 단독 실행은 열린 채 두며, 이번 정정의 확인은 PR 리뷰로 한다. 요약 확인과 단독 완료는 PR 승인이나 후속 구현 완료를 뜻하지 않는다. 요구사항·도메인 설계의 금지 문장은 소급 수정하지 않고 이 경우만 좁힌다.

CHANGE_ACCEPTED 알림은 원문 그대로 기록하고 알림을 없애려고 다시 저장하지 않는다. SUMMARY_ARTIFACT_UNAUTHORIZED나 예상 밖 엔진 오류는 한 번 기록하고 모든 진행을 멈춰 보고한다. 이 단계 질문의 모든 내용은 확인 전에 작성하며 확인 영수증 뒤에는 질문 파일을 고치지 않는다.

## 검증과 보존 범위

- entities.md의 YAML 블록을 파싱하고 CatchAsset.title required=false·min_length=1·null 의미와 position integer/required/min=1을 검사한다. 링크 제목·기존 유일성·나머지 모델 내용은 분기 기준과 대조한다.
- u2-api entities.md·rules.md·functional-spec.md의 필수 절, functional-spec.md의 상류 참조와 traceability.json 추적 센서를 실행한다. 기존 FAIL 23건은 PASS로 바꾸지 않는다. u2-api rules.md·functional-spec.md·traceability.json은 수정하지 않는다.
- 전체 추적 SHA-256 1,077개 기준선과 보호 파일 243개(12월 intent 36개 포함)를 보존한다. u2-api 확인 전 대조에서는 계약 세 파일과 감사 파일만 바뀌었고 모든 Unit 산출물·그 밖의 추적 파일은 그대로였다. 감사 파일의 착수 156,038바이트 앞부분도 보존됐다.
- API 설치/빌드와 계약 변경 전후 합성 세 검사기 비교는 통과했다. Docker daemon 연결 실패로 DB 준비는 실행하지 못했다. 최종 서비스·문서 크기·diff 검사와 보존 대조는 네 단계 절차 뒤 커밋 전에 한 번 수행한다.
- 검증 파일은 이 폴더의 single-2026-10-09-verification.md, 도구 기록은 [계약 도구 기록](../../../inception/contract-design/single-2026-10-09-tools.json)에 남긴다. 엔진 검토 사본은 이동/수정하지 않고 실제 위치와 대상 Unit을 기록한다.
- 서비스 코드·DB 마이그레이션·화면·worker 대체값 제거·제목 고쳐 쓰기 구현은 후속 ②③이며 이번 수정에 포함하지 않는다. docs/·12월 intent·하네스·공유 memory와 기존 승인 기록을 바꾸지 않는다. 로컬 커밋 두 개는 모든 단계·검증 뒤 만들고, 기록 커밋 전 준비 백업 tail을 별도 확인받는다. push·PR은 팀장의 “올려” 뒤에만 한다.

## Consolidated Summary Confirmation

u2-api entities.md에서 CatchAsset.title의 required를 false로 바꾸어 null을 허용하고 min_length=1·빈 문자열 금지·구직자 수정 금지를 유지한다. CatchEvidence의 coverageLimits 뒤에 position(정수·필수·1부터)을 추가하여 받은 근거 목록 순서를 저장하고 회원·수신자 응답이 같은 순서를 유지하도록 적는다. 팀장이 #165의 이름 위임을 거두고 position으로 정한 사실을 기록한다. 위치 유일성·순서 세부·다른 산출물·서비스 코드는 추가하지 않는다. 이 단계의 별도 Looks correct를 기록한 뒤 두 곳만 고치고 기존 추적 FAIL 23건을 보존하며 독립 검토 READY일 때만 단독 완료를 보고한다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
