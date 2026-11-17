## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-16T06:39:46Z
**Iteration:** 1
**Verdict Dictated:** no

이 검토는 승인 관문에서 사람이 참고하는 단발 검토다. 아래 새 지적은 모두 승인을 막지 않는 Minor이고, 고칠지는 사람이 정한다.

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | api/src/rag-answer/qna-sources.ts > sanitizeItemContextLine (CONTROL_CHARS, BIDI_CONTROLS) | 둘째 줄 다듬기가 지우는 글자는 Cc와 글 방향 제어 문자 열한 개뿐이다. 탭·세로탭·쪽바꿈(Cc)은 빈칸으로 바뀌지 않고 그냥 지워져서 "fix:tlogin"이 "fix:login"처럼 낱말이 붙는다. 폭 없는 공백(U+200B~U+200D), U+FEFF, U+2060~U+2064, U+061C, 태그 문자(U+E0000대)는 남는다. 이 글은 작성자가 쓴 글이 모델에 가는 문서 글 자리가 아니라 `context` 자리에 들어가므로, 눈에 안 보이는 글자로 지시를 숨기는 길이 열려 있다. 요구사항·계획에는 Cc와 방향 제어 문자까지만 적혀 있어 계획과는 어긋나지 않는다. | 탭 계열은 지우지 말고 빈칸으로 바꾼 뒤 겹친 빈칸을 줄인다. 서식 문자(`p{Cf}`) 전체와 태그 문자를 지우도록 넓히고 해당 시험 사례를 더하거나, 범위를 의도적으로 좁혔다면 그 이유를 code-summary에 적는다. | New |
| R-02 | Minor | api/src/rag-answer/qna-sources.ts > buildItemContexts (둘째 줄 머리글) / api/docs/rag-answer.md > 알려진 한계 | 고정 글자에는 숫자·영문자가 없지만 둘째 줄(PR 제목·커밋 첫 줄)에는 있을 수 있다. 머리글은 둘째 줄이 속한 Catch의 줄이 하나라도 가면 달리는데, 작업 사실 줄은 맞은 근거 묶음 뒤라 상한(Catch 12줄·전체 40줄)에 걸려 빠질 수 있다. 그러면 모델은 인용할 수 없는 줄의 낱말을 머리글에서만 보게 되고, 그 낱말을 답에 옮기면 그 항목이 대조(fact)에서 버려진다. 한계 문장은 "그 줄은 붙인 줄로도 가므로 인용할 수 있다"고 적어 상한으로 빠지는 경우를 말하지 않는다. | 다시 재기에서 질문별 `dropReasons.fact`와 못 붙인 줄 수를 나란히 보고, 상한으로 빠진 Catch에서 대조 버림이 늘었는지 확인한다. 한계 문장에 "상한 때문에 붙지 못하면 인용할 수 없다"는 단서를 더한다. | New |
| R-03 | Minor | api/src/rag-answer/qna-service.ts > answerQuestion (생성 단계 try 안의 buildQnaSources 호출) | `buildQnaSources`는 `buildSummarySources`를 통째로 부르므로 사본의 `evidence[].sourceUrl`·`workFacts`·`body` 등이 한 군데라도 모양이 틀리면 TypeError를 던진다. 이 일 전에는 질의응답이 검색 조각만 써서 사본 모양과 무관했다. 지금은 질문 횟수를 센 뒤 다시 쓰기·검색(비용 발생)까지 마친 다음 `GENERATION_FAILED`로 끝나, 그 발행본의 모든 질문이 같은 방식으로 실패한다. 기본 요약도 같은 사본에서 실패하므로 새 위험은 작지만 실패 시점이 늦다. | 사본 모양 오류를 `admit`의 사본 읽기 자리에서 미리 걸러 횟수를 세기 전에 거부하거나, 모양 오류일 때 검색 조각만으로 보내고 로그를 남기는 쪽 가운데 하나를 정한다. 그대로 둔다면 code-summary의 「실패 처리」에 이 선택을 위험으로 적는다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261116-recipient-qa-fix/construction/code-generation/unit-test-instructions.md > 시험 도구 | 「이 범위의 시험은 DB를 쓰지 않는다」는 틀렸다. 안내대로 `qna-controller.test.cjs`를 돌리면 테스트 DB가 없을 때 실패한다(code-summary는 58/75, 실패 17이라고 적었다). 틀린 안내가 시험 명령의 정본 문서에 남아 있다. 이 문서의 나머지 명령은 맞다(이번 검토에서 환경변수를 붙여 api 7개 파일 75/75, web 6개 파일 100/100을 확인했다). | 안내에 테스트 DB 환경변수와 컨테이너 필요를 적어 고친다. 승인된 안내를 건드리지 않기로 했다면 빌드와 시험 단계 첫 줄에 같은 내용을 옮긴다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md > C-11 slots 2번 줄·owner-summary 줄 | 두 줄 모두 "팀원 3과 PR 리뷰에서 맞춤"이라고 과거형으로 적혀 있다. 아직 맞추지 않았고 팀장 결정도 "PR 리뷰에서 맞춘다"이다. 계약 문서가 합의가 끝난 것처럼 읽힌다. | "PR 리뷰에서 맞출 예정"으로 바꾸거나, 팀원 3 확인 뒤 문구를 확정한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 선언된 검증 도구 | 없음 | 해당 없음 |
| api 범위 시험 7개 파일(테스트 DB 환경변수 붙임, 빌드된 dist 기준) | 75/75 통과 | 머리글·상한·건너뛰기·중복 제거·NotFound 404·로그 수 칸·평가 스크립트 공용 함수·로거 복구가 시험으로 확인된다. 시험은 기대값을 실제 값과 비교하고 항상 통과하는 꼴이 아니다 |
| web 범위 시험 6개 파일 | 100/100 통과 | 제목 span이 Tab 순서 밖이고 글자로만 그려지며 `showEvidence`가 받은 위치 그대로 불리는 것을 서버 렌더링으로 확인 |
| api lint·typecheck, web lint·typecheck | 모두 오류 0 | 정적 검사 통과 |

확인하고 문제없다고 본 것
- `buildQnaSources`: Catch는 가장 높은 순위 자리에서 맞은 줄→붙인 줄 순이고, 맞은 (항목, 칸)은 다시 붙지 않으며, 근거 묶음이 남은 상한에 안 들어가면 자르지 않고 건너뛰며 센다. 붙인 줄의 위치는 칸 하나 전체 범위라 인용 위치 규칙(C-01)과 강조가 그대로다.
- 머리글 고정 글자는 한글뿐이고 표 글자가 20자를 넘으면 두 글자로 이어진다. 서로게이트 쌍 자르기가 맞다. 기본 요약·JD 요약은 `itemContext`를 넣지 않아 `context`가 지금과 같다.
- `admit`은 색인 확인 다음, 질문 수 세기 앞에서 사본을 읽고 NotFound를 404 LINK_UNAVAILABLE로 바꾼다(C-10 deletion-rule). 그 밖의 오류는 삼키지 않는다.
- 게이트 실패 로그와 평가 기록은 수와 이름만 남기고 평가 스크립트가 정규식으로 이름 모양을 걸러 낸다. `Logger.overrideLogger` 가로채기는 `finally`로 복구되고 원래 로거로 전달한다.
- 평가 스크립트의 질의응답 요청은 `buildQnaSources`를 직접 불러 만들고 앱과 같은 결과임을 시험이 비교한다(앱은 스트리밍, 평가는 한 번 호출이라는 차이는 기준선 기록에 한계로 있다).
- 화면 제목은 `<span>` 글자이고 JD 패널에는 넘기지 않는다. 문서(rag-answer.md·ai-generation.md)와 코드의 상한 값·로그 칸·머리글 표가 서로 맞는다.

### Summary

설계와 구현은 승인된 계획·계약 경계(C-01 위치, C-09, C-10 삭제 규칙)와 맞고, 범위 시험·정적 검사가 모두 통과하며 시험이 주장을 실제로 검증한다. 남은 것은 둘째 줄 다듬기 범위, 상한으로 빠진 Catch의 머리글 낱말, 사본 모양 오류의 실패 시점, 두 문서의 표현 정리로, 모두 승인을 막지 않는 Minor다.
