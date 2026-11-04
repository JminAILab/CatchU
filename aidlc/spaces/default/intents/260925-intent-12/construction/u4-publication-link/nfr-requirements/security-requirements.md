# U4 발행·링크 — 보안 요구사항

## Sources

작성일: 2026-10-29. 입력: [U4 기능 명세](../functional-design/functional-spec.md)(functional-spec), [U4 업무 규칙](../functional-design/rules.md)(rules)의 BR1.5·BR3.4·BR4.7·BR5.4·BR6·BR7.1·BR7.5·BR10, [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements)의 NFR1·NFR2·NFR7·FR3.1·FR20, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 공통 전제·C-04·C-10·C-11(0번 `RecipientGuide`·guide-rule)·C-12, [보안 점검](../../../../../../../docs/CatchU_security_checks.md)의 「API 경로·권한」·「요청·메시지 입력」·「화면 출력」·「인증·비밀번호·토큰」·「로그·오류 응답」, [비기능 질문·답변](nfr-requirements-questions.md) Q1·Q2, 10월 api 문서 `api/docs/share-links.md`·`api/docs/recipient-read.md`, 10월 구현 `api/src/share-links/link-token.ts`·`api/src/share-links/link-access.service.ts`·`web/src/features/recipient/recipient-format.ts`와 시험 `web/test/recipient.test.mjs`, [#416 논의 요청](https://github.com/JminAILab/CatchU/issues/416#issuecomment-6485232107). Q1 답은 2026-10-29 [#416 팀장 답변](https://github.com/JminAILab/CatchU/issues/416#issuecomment-6485884167)이 출처다.

## 범위

U4는 작성자 API(Catch 설명·텍스트 자료·발행·발행본 관리)와 받은 사람 경로(열람·비밀번호 통과), 받은 사람 화면을 가진다. 보안 요구사항은 소유 확인, 링크 판정, 비밀값, 화면 출력, 로그다. 외부 AI는 직접 부르지 않는다(작업 등록만 한다).

## 요구사항

### 권한·자료 격리 (NFR1)

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR1.1 | 작성자 API는 10월 전역 인증 Guard·Bearer Access 토큰·CSRF·회원 행 확인을 쓴다. 조회 조건에 소유자(`member_id`)를 넣고, 남의 것과 없는 것에 같은 404 `RESOURCE_UNAVAILABLE`을 준다. 소유 확인을 상태 확인보다 먼저 한다 | 회원 두 명이 서로의 ID로 설명·자료·발행본 상세·중지·삭제를 시도하는 거부 시험(S3·S12) | BR3.4, BR6.5, BR10.1, 보안 점검 「API 경로·권한」 |
| NFR1.2 | 받은 사람 경로(`GET /v1/public/links/{token}`, `POST .../unlock`)만 메서드 단위 `@Public()`으로 연다. 클래스에 붙이지 않는다 | 실제 Guard로 두 메서드의 비로그인 허용과 같은 컨트롤러 미지정 경로의 인증 요구 시험(10월 시험 방식) | 보안 점검 「API 경로·권한」, `api/docs/share-links.md` |
| NFR1.3 | 받은 사람 요청은 매번 토큰으로 발행본을 찾고 삭제·중지·만료를 grant보다 먼저 판정한다. 없음·삭제·중지·만료는 구분 없이 404 `LINK_UNAVAILABLE`, 비밀번호 필요·grant 거부는 401 `LINK_PASSWORD_REQUIRED`다. 시험 전용 우회 권한을 두지 않는다 | S8·S9. 보호 흐름 3개(FR19.1)의 링크 중지 부분 | BR6.1, C-10, NFR1 |
| NFR1.4 | 받은 사람에게는 판정을 통과한 발행본의 사본(`published_item`)만 준다. 원본 `catch_asset`·`text_material`을 읽지 않고, 10월 공개 Catch 목록·상세 경로를 없앤다 | S10(원본 변경 뒤 사본 그대로), 경로 목록 확인 | BR6.4, BR9.1 |
| NFR1.5 | 링크 토큰은 `crypto` 안전 난수 256비트, 만료는 발행 시각 + 2160시간(90일)이다. 비밀번호는 10월 scrypt 검증값으로 저장하고 상수 시간으로 비교한다. 원문은 저장·응답·로그에 남기지 않는다 | 10월 단위 시험 재사용, S8 | BR5.4, 보안 점검 「인증·비밀번호·토큰」 |
| NFR1.6 | grant는 10월 서명 방식 그대로, `publicationId`에 묶고 수명 2시간이되 링크 만료를 넘지 않는다. 서버에 저장하지 않고 `X-Link-Grant` 헤더로만 받는다 | S8(다른 발행본 grant 401) | BR6.2, C-10 |
| NFR1.7 | unlock은 10월 순서 그대로다: 링크 판정(404) → 비밀번호 없는 링크(400) → 본문 검사 → 주소·링크 차단·시도 빈도(429 `LINK_UNLOCK_LIMITED`, 비밀번호 확인 안 함) → 비밀번호 확인(401) → 발급 직전 재판정 → grant. 시도 제한은 비싼 해시보다 먼저 판정하고, grant로 조회하는 GET에는 두지 않는다 | S14 | BR6.3, C-12, 보안 점검 「인증·비밀번호·토큰」. 시도 제한기는 프로세스 메모리라 api 하나 전제에서만 정한 한도대로 동작한다(scalability NFR4.13) |
| NFR1.8 | 요청 본문은 정의하지 않은 필드를 거부하고, 작성자 경로의 ID(`catchId`·`textMaterialId`·`publicationId`)는 UUID 형식을 먼저 확인한다. 형식이 틀린 ID는 10월처럼 남의 것·없는 것과 같은 404 `RESOURCE_UNAVAILABLE`이다. SQL은 매개변수로만 넘긴다 | 잘못된 본문 400 시험, 형식 오류 ID가 없는 ID와 같은 404·본문인지 시험(10월 `test/db/share-links-manage-api.test.cjs` 방식) | 보안 점검 「요청·메시지 입력」, `api/docs/share-links.md` 「타인 링크·없는 링크·UUID 형식이 아닌 ID」 행 |
| NFR1.12 | 받은 사람 경로의 링크 토큰은 UUID가 아니라 base64url 43자다. 10월 구현은 형식이 틀린 토큰을 DB 조회 없이 없는 링크와 같은 404 `LINK_UNAVAILABLE`(같은 고정 본문, 비밀번호 확인 전)로 응답한다. BR9.1이 `/v1/public/links/{token}`·unlock을 유지한다고 정했으므로 U4는 이 동작을 그대로 쓴다. 이 행은 10월 구현 확인이며 새 결정이 아니다. 400으로 바꾸는 것은 C-12 변경이라 이 단계에서 하지 않는다 | 열람·unlock에서 형식 오류 토큰(42자·44자·허용 밖 문자)이 없는 토큰과 같은 상태·본문인지, DB를 조회하지 않는지 시험 | `api/src/share-links/link-token.ts` `isLinkTokenFormat`, `api/src/share-links/link-access.service.ts`(형식 오류 → `LINK_UNAVAILABLE`), `api/docs/share-links.md` unlock 판정 1행, `api/docs/recipient-read.md` 판정 1, C-10(없음 → 404) |
| NFR1.9 | 토큰·grant·비밀번호·자료 본문은 로그·오류 응답·URL 쿼리에 넣지 않는다. 토큰은 응답의 `url` 안에만 싣는다. 모든 api 응답 `Cache-Control: no-store`, api `Referrer-Policy: no-referrer`, web `Referrer-Policy: strict-origin-when-cross-origin`은 10월 공통 설정을 그대로 쓴다 | 로그 비노출 시험(10월 방식), 응답 헤더 확인 | BR10.2, 보안 점검 「로그·오류 응답」, 질문 파일 「이미 정해진 것」 |

### 외부 AI 처리 (NFR2)

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR2.1 | 발행은 트랜잭션 전에 작성자의 외부 AI 첫 이용 동의를 `AiConsentGate.require`(C-04)로 확인한다. 없으면 403 `AI_CONSENT_REQUIRED`이고 아무것도 쓰지 않는다. web은 U2 공용 동의 창을 연 뒤 같은 요청을 다시 보낸다 | 동의 가짜(없음)로 403·발행본 없음 시험 | BR4.7, C-04, FR20.1 |
| NFR2.2 | U4는 AI를 직접 부르지 않는다. 발행본 글이 AI·임베딩으로 가는 것은 커밋 뒤 등록하는 작업(U3·U5)을 통해서이며, 사본만 그 입력이 된다. 텍스트 자료의 개인정보를 찾아 가리지 않고 편집 화면에 민감 정보 안내를 둔다 | 코드 검토, 화면 확인 | BR3.3, BR5.5, FR20.3 |

### 화면 출력 (NFR1·NFR7)

| ID | 요구사항 | 확인 | 근거 |
|---|---|---|---|
| NFR1.10 | 사본·설명·자료 본문은 React 텍스트로만 그린다. `dangerouslySetInnerHTML`과 HTML을 만드는 마크다운 렌더링을 쓰지 않는다 | 코드 검토, 스크립트 문자열을 넣은 사본 표시 시험 | 보안 점검 「화면 출력」 |
| NFR1.11 | 텍스트 자료 본문과 Catch 작성자 설명 안의 주소는 GitHub 주소만 새 탭 링크(`target="_blank"`, `rel="noopener noreferrer"`)로 만들고, 그 밖의 주소는 글자로 보인다. 허용 판정은 Q1 답의 "Catch 근거와 같은 규칙"대로 10월 근거 링크 판정 `isGithubSourceUrl`을 그대로 쓴다: URL로 해석한 뒤 프로토콜 `https:`, 호스트 `github.com`, 사용자 정보·비밀번호 없음. 문자열 접두 비교는 쓰지 않는다. 기존 Catch 근거 GitHub 링크 동작(BR1.5)은 그대로다. 받은 사람 화면과 작성자 발행본 화면에 같은 규칙을 쓴다. 허용 범위를 이 판정보다 넓히지 않는다 | 10월 시험의 허용(`https://github.com/o/r/pull/1`)·거부(`http://github.com/o/r`, `https://evil.example/o`, `javascript:alert(1)`, `https://user:pw@github.com/o`, `https://github.com.evil.example/x`, 해석할 수 없는 값)를 본문 링크 함수에도 적용한다. 더하는 거부 사례: `https://github.com@evil.example/`(호스트가 `evil.example`), `https://gist.github.com/…`. 대문자 호스트(`https://GITHUB.com/o`)는 URL 해석이 소문자로 바꿔 같은 호스트가 되는 것을 시험으로 기록한다(새 허용이 아님) | Q1(B, #416 팀장 답변), 보안 점검 「화면 출력」, FR3.1, BR1.5, `web/src/features/recipient/recipient-format.ts` `isGithubSourceUrl`, `web/test/recipient.test.mjs`, `web/src/features/recipient/README.md` 「근거 링크」 |
| NFR7.1 | 받은 사람 화면은 고정 사본, 작성자 설명, AI 설명 초안, AI 요약을 서로 다른 표지로 구분한다. AI 초안은 작성자 설명과 섞지 않는다 | 화면 확인 | BR1.3, BR7.5, NFR7 |
| NFR7.2 | 0번 `RecipientGuide`(U2)는 링크 판정을 통과한 자료 화면에만 둔다. 비밀번호 입력·접근 불가 화면에는 두지 않으며, 그 두 화면의 안내는 U4가 한다. U4는 `showClaudeConnect`에 `false`를 넘긴다(U9를 켜기 전까지) | G1·G2 | C-11 slot 0·guide-rule(#421) |
| NFR7.3 | `RecipientGuide`는 h1과 첫 초점을 갖지 않는다. 화면 제목과 첫 초점은 U4가 상태마다 둔다(구현 방식: 기존 동작 유지, 상태별 h1에 `tabIndex={-1}`을 주고 그 h1로 초점을 옮김. 계약 아님) | G3·G4 | C-11 guide-rule(#421) |
| NFR7.4 | 받은 사람 화면의 안내는 자리마다 한 번만 둔다. 고정 발행본이라는 설명은 U2 `fixed-copy`가 맡고(AC16.2.2·FR16.3), U4 고정 안내(BR7.1)는 발행 시각 표시 위주로 줄인다. U4는 U2 시작 안내·U5 질의응답 외부 AI 고지·U10 JD 로그인 안내와 같은 뜻의 문장을 자기 영역에 두지 않는다. `jd-summary`의 로그인 필요 한 줄은 #416 결정대로 guide-rule 위반이 아니다 | 아래 「안내 중복 통과 조건」의 G1~G7 | #416 팀장 답변, C-11 guide-rule(#421), BR7.1, AC16.2.2·FR16.3 |
| NFR7.5 | 발행 거부 이유(409 `CONFIRMATION_REQUIRED`·`SOURCE_RESTRICTED`의 catchId), 저장 실패, 하루 한도(429 `DAILY_LIMIT_REACHED`), 빈도 초과(429 `RATE_LIMITED`), 삭제 실패를 구분해 안내한다. 접수만으로 성공을 표시하지 않는다 | S5·S6·S11 화면 확인 | NFR7, BR2.3, BR4.2, BR8.4 |

### 안내 중복 통과 조건 (NFR7.2~NFR7.4)

#416 팀장 답변과 #421 C-11 guide-rule에서 바로 확인할 수 있는 조건이다. G1~G4는 web 시험으로, G5~G7은 받은 사람 화면 연결 PR의 문구 검토로 확인한다. 하나라도 어기면 실패다.

| # | 통과 조건 | 확인 방법 | 근거 |
|---|---|---|---|
| G1 | 판정 통과 화면에는 `RecipientGuide`가 정확히 1개, 비밀번호 입력 화면과 접근 불가 화면에는 0개다 | 세 상태를 그리는 web 시험 | C-11 slot 0 |
| G2 | `RecipientGuide`에 `showClaudeConnect={false}`를 넘긴다 | web 시험 | C-11 guide-rule |
| G3 | 각 상태 화면의 h1은 U4의 것 하나뿐이고 `RecipientGuide` 안에 h1이 없다 | web 시험(h1 개수·위치) | C-11 guide-rule |
| G4 | 상태가 바뀔 때 첫 초점은 U4 h1로 가고 `RecipientGuide` 안의 요소로 가지 않는다 | web 시험(초점 대상) | C-11 guide-rule, 질문 파일 「이미 정해진 것」 |
| G5 | 판정 통과 화면에서 "발행 당시 자료로 고정한 발행본이고 원본 변경이 반영되지 않는다"는 뜻의 설명 문장은 U2 `fixed-copy` 하나뿐이다. U4 고정 안내는 발행 시각 표시를 중심으로 줄이고 구체 문구는 U4가 정하되, 그 설명을 다시 풀어 쓰는 문장은 두지 않는다 | 문구 검토 체크리스트 | #416 「안내 문구」 1번 |
| G6 | U4 영역(고정 안내·1번 자료 자리)에 링크 기간·중지 안내(U2 `link-conditions`), 외부 AI 전송 고지(U5), JD 로그인 안내(U10)와 같은 뜻의 문장이 없다 | 문구 검토 체크리스트 | C-11 guide-rule, #416 |
| G7 | U2 `base-summary`·`link-conditions` 문구가 #416 결정 문장과 같다(#423 반영 확인). 다르면 U4는 고치지 않고 U2 담당에게 알린다 | #423 병합 뒤 U2 컴포넌트 문구 대조 | #416 「안내 문구」 2·3번, #423 |

## 위협과 대응

| 위협 | 대응 |
|---|---|
| 남의 발행본·자료 읽기·바꾸기 | NFR1.1(소유자 조건·같은 404) |
| 중지·만료 링크를 grant로 계속 열기 | NFR1.3·NFR1.6(판정이 grant보다 먼저, 매번) |
| 비밀번호 맞혀 보기 | NFR1.7(시도 제한이 해시보다 먼저) |
| 토큰·grant 유출(로그·Referer·캐시) | NFR1.9 |
| 사본·자료 속 스크립트·악성 링크 | NFR1.10·NFR1.11 |
| 받은 사람이 원본·발행하지 않은 Catch를 봄 | NFR1.4 |
| DB 유출 때 토큰 노출 | 10월과 같이 토큰을 그대로 저장한다(`url`을 다시 만들어야 함). 남는 한계로 기록한다(`api/docs/share-links.md`) |

## Assumptions & Open Questions

새 결정이 필요한 항목이다. 이 단계에서 정하지 않는다. 결정 전에는 「합의 전 처리」대로 둔다.

| # | 미결 | 담당 | 결정 시점 | 합의 전 처리 |
|---|---|---|---|---|
| OQ-U4-NFR-1 | 포트가 붙은 GitHub 주소(`https://github.com:8443/…`). 10월 `isGithubSourceUrl`은 호스트만 비교해 포트를 허용하지만, Q1 답 문구(`https://github.com/…`)는 포트를 말하지 않는다. 막으려면 10월 근거 링크 판정도 함께 바꿔야 한다 | U4 담당 제안 → 팀장 결정 | 받은 사람 화면의 자료 표시(본문 링크) 구현 전 | 10월 판정을 바꾸지 않는다(NFR1.11). 시험에는 현재 동작으로 기록한다 |
| OQ-U4-NFR-2 | 자유 문장 안에서 주소가 어디서 끝나는지(뒤따르는 마침표·쉼표·닫는 괄호·한글·공백). 근거 링크는 값 전체가 주소라 10월에 기준이 없다 | U4 담당 제안 → 팀장 결정 | 본문 링크 구현 전 | 정하지 않는다. 정하기 전에는 본문 자동 링크를 구현하지 않는다 |
| OQ-U4-NFR-3 | AI가 쓴 글 안의 주소를 링크로 만들지. U4가 그리는 사본의 AI 설명 초안(`aiDraft`)과, U5·U10 패널이 그리는 AI 요약·질의응답 답·JD 요약이 대상이다. Q1(B)의 범위는 텍스트 자료 본문과 Catch 작성자 설명뿐이다 | `aiDraft`는 U4 담당, AI 요약·질의응답은 U5 담당, JD 요약은 U10 담당. 정책을 맞출지는 팀장 결정 | 각 화면 연결 전(U4는 받은 사람 화면 자료 표시 전) | U4는 `aiDraft`에 링크 만들기를 넣지 않는다(현 상태 유지). U5·U10 화면은 각 Unit이 정한다 |
| OQ-U4-NFR-4 | C-12 계약 문서에 형식이 틀린 토큰의 응답(10월은 404 `LINK_UNAVAILABLE`)을 적을지. U5·U10의 `/public/links/{token}/…` 경로도 같은 판정(C-10)을 거치므로 계약 문구 보강 여부만 남는다 | U4 담당(C-11·C-12 소유) → 소비 Unit(U5·U10)에 알림 | 받은 사람 경로 구현 전 | NFR1.12대로 10월 동작을 쓴다. 계약 문서는 고치지 않는다 |
| — | U4 고정 안내(BR7.1) 축소 문구 | U4 담당 | 받은 사람 화면 연결 전 | G5·G6을 지키는 범위에서 정한다 |

- U2 문구 두 건(`base-summary`·`link-conditions`)은 #423에서 U2가 고친다. U4는 G7로 확인만 한다.
- 승인된 기능 설계 W4-5의 화면 순서(고정 안내 → 1~4)에는 0번 자리가 없다. 승인 기록은 고치지 않고, 0번 자리(NFR7.2·NFR7.3)는 다음 단계 입력 변경으로 넘긴다.
- OQ-U4-7(C-11 형 정의를 첫 제출에 넣을지)은 미결이다.
