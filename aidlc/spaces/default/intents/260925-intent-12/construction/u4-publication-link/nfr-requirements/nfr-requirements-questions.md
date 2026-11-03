# U4 발행·링크 — 비기능 요구사항 질문

입력: [U4 기능 명세](../functional-design/functional-spec.md)·[업무 규칙](../functional-design/rules.md), [요구사항](../../../inception/requirements-analysis/requirements.md)의 NFR1~NFR7·C02·C06·C07, [계약 요약](../../../inception/contract-design/contract-summary.md)의 공통 전제·C-07·C-10~C-14, [보안 점검](../../../../../../../docs/CatchU_security_checks.md)의 「API 경로·권한」·「화면 출력」·「인증·비밀번호·토큰」·「로그·오류 응답」, 10월 api 문서(`api/docs/recipient-read.md`·`api/docs/lock-wait-limit.md`).

이미 정해진 것(다시 묻지 않음):

- 처리 시간·가동률·복구 수치는 새로 만들지 않는다(NFR4). 기능 사이 실패 시험은 보호 흐름 3개만 둔다(NFR6).
- 링크 토큰 256비트 난수, 만료 90일, 비밀번호 scrypt, grant 2시간·서명 방식, unlock 판정 순서와 시도 제한은 10월 그대로다(기능 설계 BR5.4·BR6.2·BR6.3).
- 발행 빈도 1분 10회는 임시값이다(BR4.8, OQ-U4-2). 전체 글 60,000자도 임시값이다(BR4.5, OQ-U4-4).
- 모든 api 응답의 `Cache-Control: no-store`, api의 `Referrer-Policy: no-referrer`, web의 `Referrer-Policy: strict-origin-when-cross-origin`, 잠금 대기 상한(`55P03` → 500)은 10월 공통 설정을 그대로 쓴다.
- 토큰·grant·비밀번호·자료 본문은 로그·오류·URL 쿼리에 남기지 않는다(BR10.2).
- #421의 C-11 시작 안내 자리: 통합 브랜치에 병합됐다(`5551cf8`). 0번 `RecipientGuide`(U2)는 링크 판정을 통과한 자료 화면에만 두고 비밀번호 입력·접근 불가 화면에는 두지 않는다. props는 `showClaudeConnect` 하나(U9 전까지 false)이고, h1·첫 초점을 갖지 않으며 API를 직접 부르지 않는다. 재승인 대상이 아니라 반영 사항이다. 승인된 기능 설계 W4-5의 화면 순서에 0번 자리를 더하는 것은 다음 단계 입력 변경으로 다룬다.
- 받은 사람 안내 중복 조율(2026-10-29 [#416 팀장 답변](https://github.com/JminAILab/CatchU/issues/416#issuecomment-6485884167)): U2 `fixed-copy`는 유지한다(AC16.2.2·FR16.3). U4 고정 안내(BR7.1)는 발행 시각 표시 위주로 줄이고 문구는 U4가 정한다. `jd-summary`는 그대로 둔다. U2 문구 두 건(`base-summary`·`link-conditions`)은 #423에 반영하며 U4는 확인만 한다.

미결·가정으로 두는 것(이 단계에서 확정하지 않음):

- 기능 설계 승인 때 남긴 회의 미결 중 OQ-U4-2~7. OQ-U4-1(첫 제출 방법)은 [#419](https://github.com/JminAILab/CatchU/pull/419)(2026-10-28, 레포 컨벤션 §2.1)가 Unit 제출·합치기를 통합 브랜치 대상 PR로 정해 결정됐고, #422가 그 방식으로 올라갔다. OQ-U4-6(제공 시점)은 U2와 U3를 나눠 본다: U2는 #423 병합 후 실제 구현 연결 가능(일정은 별도 확인), U3 C-08 조각 나누기·C-09 색인 상태는 제공 시점 미정.
- #422(첫 경계: 표·`PublicationAccess`·가짜 구현): U3·U5 담당이 승인했으나 병합되기 전이다.

## Q1. [보안] 받은 사람 화면에서 자료 본문 안의 주소를 링크로 만들까

요구사항 FR3.1은 "텍스트 자료 안에 주소를 적는 것은 된다"고만 했다. 보안 점검 「화면 출력」은 외부 링크를 http(s)와 허용한 호스트만 링크로 만들고 `rel="noopener noreferrer"`를 붙이라고 한다. Catch 근거(GitHub 주소)는 10월처럼 링크로 연다(BR1.5). 이 질문은 텍스트 자료 본문·Catch 작성자 설명 안의 주소에 관한 것이다.

A. 글자로만 보이고 링크로 만들지 않는다 — 가장 단순하다. 받은 사람은 주소를 복사해 연다.
B. `https://github.com/` 주소만 링크로 만들고 나머지는 글자로 보인다 — 포트폴리오 저장소 주소를 바로 열 수 있다. 주소 판별·허용 호스트 시험이 더해진다.
C. http(s) 주소를 모두 링크로 만든다 — 보안 점검 「허용한 호스트만」과 맞지 않아 예외 합의가 필요하다.
X. Other (please specify)

[Answer]: B. 텍스트 자료 본문과 Catch 작성자 설명 안의 `https://github.com/…` 주소만 새 탭 링크(`rel="noopener noreferrer"`)로 만들고, 그 밖의 주소는 글자로 보인다. Catch 근거와 같은 규칙이라 보안 점검 「화면 출력」의 허용 호스트 기준을 바꾸지 않는다. 기존 Catch 근거 GitHub 링크 동작은 유지한다. 출처: 2026-10-29 [#416 팀장 답변](https://github.com/JminAILab/CatchU/issues/416#issuecomment-6485884167).

정정 전 답(2026-10-28, 보존): X. 회의 후 결정하겠습니다. 본문·작성자 설명 안 주소의 자동 링크 여부와 허용 범위는 미결로 남기고, 임의로 확정하지 마세요. 기존 Catch 근거 GitHub 링크 동작은 유지합니다.

## Q2. [운영] 발행·삭제·링크 열람에서 로그에 남길 항목

기능 설계 BR10.2는 로그에 발행본 ID·회원 ID·오류 코드만 남긴다고 정했다. 작업 등록 실패(BR5.5)와 파일 저장소 삭제 실패(BR8.4)는 "로그만 남기고" 처리하므로 무엇을 남길지 정해야 한다. 비밀번호 시도 제한과 링크 보안 기록은 10월 unlock 경로를 그대로 쓴다.

A. BR10.2 항목에 결과 분류만 더한다: 발행 성공·실패 코드, 작업 등록 결과(`ENQUEUED`·`ENQUEUE_FAILED`, 작업 종류), 삭제의 접두어 삭제 실패. 항목 수·걸린 시간은 남기지 않는다.
B. A에 발행 항목 수와 발행 처리에 걸린 시간을 더한다 — 시연 때 느린 발행을 로그로 찾을 수 있다. 숫자 두 개라 공수는 작다.
C. B에 받은 사람 열람(`GET /public/links/{token}`)의 판정 결과(통과·404·401)를 발행본 ID와 함께 남긴다 — 열람 추이를 볼 수 있지만 받은 사람 행동 기록이 늘어난다.
X. Other (please specify)

[Answer]: A. BR10.2 필수 항목에 결과 분류까지만 더한다. 항목 수·처리 시간·열람 판정 결과는 요구사항 근거가 없어 넣지 않고, 필요해지면 그때 더한다. 출처: 2026-10-29 [#416 팀장 답변](https://github.com/JminAILab/CatchU/issues/416#issuecomment-6485884167).

정정 전 답(2026-10-28, 보존): X. 회의 후 결정하겠습니다. 기존에 정해진 필수 로그는 유지하고, 이번 질문의 로그 세부 항목과 추가 수집 범위는 미결로 남겨 주세요. A·B·C 중 하나를 임의로 확정하지 마세요.

설명 정정(2026-10-29): 위 질문 설명의 "로그만 남기고" 처리는 작업 등록 실패(BR5.5)에만 해당한다. 파일 저장소 삭제 실패(BR8.4)는 500 `INTERNAL_ERROR`를 돌려주고 DB를 지우지 않는 실패 응답이며, 선택지 A의 "접두어 삭제 실패"는 그 실패의 결과 분류를 로그에 남긴다는 뜻이다.

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
