# NFR Requirements — u1-preset-contract 질문

근거: 기능 설계 `construction/u1-preset-contract/functional-design/functional-spec.md`·`rules.md`와 그 검토(review-01의 Major), 요구사항 `inception/requirements-analysis/requirements.md`(NFR1~NFR6), 계약 `inception/contract-design/contract-summary.md`, 코드 지식 기록 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`, 지금 코드(`api/src/publications/publish.service.ts` 312~337행).

정해 둔 것(묻지 않음): 성능은 「목록·상세·세기 한 번에 DB 조회 수가 프리셋·항목 수와 무관하게 종류별로 일정」을 목표로 하고, 응답 시간 수치는 두지 않는다(포트폴리오 MVP, 이용자는 팀 관련자뿐). 새 빈도 제한은 두지 않는다(코딩 절차 「기술」 행: 남의 자료 노출·삭제 실패가 아니면 막지 않음). 로그는 지금 발행 로그처럼 ID와 오류 코드만 남긴다(NFR4).

지금 코드에서 확인한 것: 발행은 고른 Catch의 원 분석 요청이 회원과 맞지 않거나 저장소 보호 관측이 없거나 불완전하면 500(서버 오류)으로 끝내고, 「비공개로 단정하지 않는다」고 적어 두었다(`publish.service.ts` 312~337행, 10월 규칙). 기능 설계 검토가 프리셋 목록·상세·세기에서 이런 Catch를 어떻게 다룰지 정해지지 않았다고 짚었다.

## Q1. [안정성] 보호 관측이 없거나 원 요청이 맞지 않는 Catch를 프리셋 화면에서 어떻게 다룰까

이런 Catch는 드물게 생기는 서버 쪽 기록 문제입니다. 지금 발행은 500으로 끝납니다. 프리셋 목록이 같은 판정을 그대로 쓰면 그런 Catch 하나 때문에 목록 전체가 500이 됩니다.

A. 프리셋 화면(목록·상세·세기)에서는 그 Catch의 이유를 비워 두고(null) 응답은 정상으로 준다. 서버 로그에 기록 문제 경고를 남긴다. 발행은 지금처럼 500이다. 계약의 이유 값은 늘지 않지만, 지원자는 발행해 보기 전까지 막힐 것을 모른다
B. 이유 값을 하나 더한다(「발행 전에 확인할 수 없는 자료」). 프리셋 화면은 그 Catch를 발행할 수 없는 자료로 보이고 응답은 정상이다. 발행은 지금처럼 500이다. 계약 P-1의 이유 값과 U2 화면 문구가 하나씩 는다
X. Other (please specify)

[Answer]: X. 지금 본인 Catch 목록(owner-catch-response.ts 152~160행)과 발행처럼 서버 오류(500)로 둔다. 그런 Catch는 지금도 본인 Catch 목록 전체를 500으로 만들어 고르기 목록에 나올 수 없고, 보호 관측 행은 탈퇴 때만 지워져 정상 사용으로는 생기지 않는다. 새 이유 값·경고 로그·따로 짠 판정은 두지 않고 발행과 같은 판정 함수를 쓴다. 덧붙여 기능 설계 검토 review-01의 Minor R-02~R-08은 문서에 반영되지 않은 채 커밋됐으니 코드 생성에서 검토의 권장대로 반영한다(R-03은 작성자 상세에서도 isFirstCopy를 뺀다, R-04는 칸을 필수로 하고 시험 사본을 고친다, R-08은 같은 프리셋을 동시에 저장할 때의 500을 받아들인다).

## Consolidated Summary Confirmation

- Q1: 보호 관측이 없거나 원 요청이 맞지 않는 Catch는 프리셋 목록·상세·세기에서도 지금 본인 Catch 목록·발행처럼 500으로 둔다. 새 이유 값·경고 로그·따로 짠 판정은 두지 않고 발행과 같은 판정 함수를 쓴다(그런 Catch는 지금도 고르기 목록에 나올 수 없고, 보호 관측 행은 탈퇴 때만 지워진다)
- 기능 설계 검토 review-01의 Minor R-02~R-08은 코드 생성에서 검토 권장대로 반영한다: R-03 작성자 상세에서도 isFirstCopy를 뺀다, R-04 isFirstCopy 칸을 필수로 하고 시험 사본을 고친다, R-08 같은 프리셋을 동시에 저장할 때의 500을 받아들인다. 나머지(R-02 position 빈자리 문장, R-05 PDF 두 번 세기, R-06 violations field 이름, R-07 제목 없는 Catch의 UNTITLED_CATCH_TITLE)는 검토 권장 그대로다
- 정해 둔 것: 성능은 목록·상세·세기 한 번에 DB 조회 수가 프리셋·항목 수와 무관하게 종류별로 일정하게 한다(응답 시간 수치 없음). 새 빈도 제한 없음. 로그는 ID와 오류 코드만

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
