# 받은 사람 발행본 화면 — 12월 U4 W4 (#416)

링크를 받은 사람이 회원 로그인 없이 `/s/[token]`에서 발행본(C-10 `PublishedSnapshot`)을 읽는 화면이다. 10월 W7(#152)의 공개 프로필·Catch 목록·상세 화면과 `/s/[token]/catches/[catchId]`, 작성자 공유 링크 화면(`/links`, `features/share-links/`)은 제출 3(W6)에서 지웠고, 작성자 쪽은 [발행·발행본 화면](../publications/README.md)이 맡는다.

기준: [U4 기능 명세](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/functional-design/functional-spec.md) W4·S8·S9·S14, [보안 요구사항](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-requirements/security-requirements.md) 「안내 중복 통과 조건」 G1~G7, [보안 설계](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/security-design.md) 「web 화면 출력」·「받은 사람 화면 자리」, [계약 요약](../../../../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md) C-11·C-12, #416 팀장 결정(2026-10-29 Q1 B 주소 링크, 2026-11-04 OQ-U4-NFR-5, 2026-11-05 OQ-U4-NFR-6). api 쪽은 [api/docs/recipient-publication.md](../../../../api/docs/recipient-publication.md)에 있다.

## 파일

| 파일 | 역할 |
|---|---|
| `src/app/s/[token]/page.tsx` | 페이지. 수신자 전용 헤더는 `src/app/s/layout.tsx`가 붙인다 |
| `recipient-screen.tsx` | 상태 연결(`createRecipientPublicationStore`), 단계별 h1 초점, `isLoggedIn`, `showEvidence`, 붙는 자리 props |
| `recipient-view.tsx` | 상태별 그리기(발행본·비밀번호 입력·접근 불가·조회 실패)와 0~4번 자리 배치, 비밀번호 입력 |
| `recipient-store.ts` | 발행본 상태. 응답 코드 분기·비밀번호 확인·시도 제한 대기·늦은 응답 버리기·`accessLost` |
| `recipient-api.ts` | `api.recipient` 위의 호출(`publication`·`unlock`)과 응답 모양 검사. 사본 검사는 `publications-api.ts`의 `isPublishedSnapshot`을 쓰고 계약 밖 칸은 넘기지 않는다 |
| `recipient-grants.ts` | 링크별 grant 보관(`sessionStorage`), 10월 그대로 |
| `recipient-slots.ts` | C-11 `RecipientSlotProps`·`LinkAccessCode`·`EvidenceLocation`(화면 안 형, OQ-U4-7)과 근거 위치 대조 `resolveEvidenceTarget` |
| `recipient-format.ts` | 공통 문구(링크 불가·비밀번호 제목·발행 시각), 비밀번호 단계 안내, `isGithubSourceUrl` 재수출 |
| `../publications/snapshot-view.tsx` | 사본 그리기. 작성자 발행본 상세와 같은 컴포넌트이며 받은 사람 화면은 `highlight`(근거 강조)와 항목 `id`만 더 쓴다 |
| `test/recipient.test.mjs` | 위 동작의 단위·그리기 시험 |

## 화면 순서(C-11 자리)

| 상태 | 위에서부터 |
|---|---|
| 판정 통과 | U4 h1(발행본 제목, `tabIndex={-1}`) → 0 `RecipientGuide`(U2, `showClaudeConnect={false}`) → U4 고정 안내 「발행 시각 YYYY-MM-DD HH:mm:ss (KST)」 → 1 발행본 자료 → 2 `BaseSummaryPanel`(U5) → 3 `QnaPanel`(U5) → 4 자리(U10 `JdSummaryPanel` 제공 전 빈 자리, `data-logged-in`만) |
| 비밀번호 입력 | U4 h1 「비밀번호가 필요한 링크입니다」 → 입력. `RecipientGuide`·패널 없음 |
| 접근 불가 | U4 h1 「이 링크는 열람할 수 없습니다.」만 |
| 조회 실패 | 숨긴 h1 「발행본」 + 「발행본을 불러오지 못했습니다」·[다시 불러오기] |

- 각 상태의 h1은 U4 것 하나뿐이고 안내 묶음 안에는 h1이 없다(G3). 단계가 정해질 때마다(처음 연 화면 포함) 그 h1로 초점을 옮기며 비밀번호 입력칸에 `autoFocus`를 두지 않는다(G4). 불러오는 중과 같은 단계 안의 갱신에는 옮기지 않는다.
- U4 고정 안내(BR7.1)는 발행 시각 한 줄이다. 고정 사본 설명은 U2 `fixed-copy`, 링크 기간·중지는 U2 `link-conditions`, 외부 AI 고지는 U5, JD 로그인 안내는 U10이 맡으므로 같은 뜻의 문장을 두지 않는다(G5·G6).
- 2·3번 자리는 [U5 README 「붙이는 방법」](../rag-answer/README.md)대로 `RecipientSlotProps`(`token`·`getGrant`·`onAccessLost`·`isLoggedIn`·`showEvidence`)를 그대로 넘기고 `key={token}`이다. `isLoggedIn`은 이 탭의 회원 토큰 유무이며 받은 사람 요청에는 그 토큰을 붙이지 않는다.

## 동작

- **응답 코드별 화면:** 판정은 서버가 하고 화면은 `code`로만 나눈다.

| 응답 | 화면 |
|---|---|
| 200 `PublishedSnapshot` | 발행본 |
| 404 `LINK_UNAVAILABLE` | 「이 링크는 열람할 수 없습니다.」 — 없음·삭제·중지·만료·작성자 비활성을 구분하지 않는다(OQ-U4-NFR-6). 그 링크의 grant를 지운다 |
| 401 `LINK_PASSWORD_REQUIRED` | 비밀번호 입력. 받아 둔 grant가 거부된 경우면 grant를 지우고 「비밀번호를 다시 입력해 주세요.」 |
| 500·통신 실패·손상된 응답·예상 밖 코드 | 조회 실패와 [다시 불러오기]. 링크 불가로 바꾸지 않는다(작성자 회원 행 없음 500도 여기) |

- **비밀번호:** 빈 값은 보내지 않고 안내한다. 확인 중에는 반복 제출을 막는다. 「비밀번호가 맞지 않습니다.」는 401 `LINK_PASSWORD_INVALID`에만 쓰고 입력을 비운다. 통신 실패·500·400은 「비밀번호 확인을 완료하지 못했습니다.」로 두고 입력은 그대로 둔다. 비밀번호는 unlock 본문으로만 보낸다.
- **시도 제한(429 `LINK_UNLOCK_LIMITED`):** `Retry-After`의 남은 초를 보여 주고 그동안 [열람하기]를 막는다. 지나도 자동으로 보내지 않는다. `Retry-After`가 없거나 틀리면 추정하지 않는다.
- **grant:** 성공한 unlock의 grant를 `catchu.recipient.grant:<token>` 키로 `sessionStorage`에 둔다. 다른 링크의 요청에는 그 링크의 grant만 쓴다. 401·404를 받으면 그 링크의 grant만 지운다. 저장소 오류 처리(메모리 우선·손상값 버림)는 10월과 같다(`recipient-grants.ts` 머리 주석).
- **사본(1번 자리):** 항목을 `position` 순으로 그린다. Catch는 기록(작업 사실·본인 기여·근거)·작성자 설명·AI 설명 초안·불일치 표지를 서로 다른 표지로 나눈다. 본문·작성자 설명·AI 초안은 React 텍스트로만 그리고(NFR1.10), 근거 원문과 본문·작성자 설명 안의 `https://github.com/…` 주소만 새 탭 링크(`rel="noopener noreferrer"`)다(`lib/github-source-url.ts`, #416 Q1 B, NFR1.11). AI 초안에는 링크를 만들지 않는다(OQ-U4-NFR-3).
- **붙는 컴포넌트의 접근 상실(C-11 rule):** 패널이 401 `LINK_PASSWORD_REQUIRED`·404 `LINK_UNAVAILABLE`을 받아 `onAccessLost(code)`를 부르면 화면이 직접 받은 것과 같은 전환·grant 삭제를 하고, 진행 중이던 조회는 끊어 늦은 응답이 거부를 덮지 않게 한다.
- **근거 강조(C-11 evidence-highlight):** 패널이 `showEvidence(location)`를 부르면 사본에 대조한다(`resolveEvidenceTarget`). 항목(`publishedItemId`)이 없으면 옮기지 않고, `fieldPath`(`workFacts[i]`·`subjectContribution`·`evidence[i].representedFacts[j]`·`authorDescription`·`body`)가 가리키는 문자열 안의 `[charStart, charEnd)`만 `<mark>`로 강조하며, 범위 밖·없는 경로(`aiDraft`·`pages[n]`)면 항목으로 옮기기만 한다. 옮길 때 그 항목(`id="published-item-<id>"`)으로 스크롤하고 초점을 둔다.
- **다시 조회:** 확정 거부(404·401)는 표시하던 사본을 지우고 해당 화면으로 바꾼다. 조회 실패는 같은 링크의 이미 표시한 화면만 유지하고 「최신 자료를 불러오지 못해 이전에 불러온 내용을 보여 주고 있습니다.」를 알린다. 열린 화면을 실시간으로 회수하지 않으며 자동 조회·전송을 하지 않는다. 늦게 도착한 응답(다시 조회·화면 해제 뒤)은 버린다.
- **노출:** 토큰은 경로에만, 비밀번호는 본문으로만, grant는 `X-Link-Grant` 머리글로만 둔다. 404 사유를 드러내지 않는다.

## 시험

`node --test test/recipient.test.mjs`(32개): 응답 모양·grant 보관(10월 유지 묶음)·판정 응답 처리·`onAccessLost`·근거 위치 대조·G1~G3 구조·자리 순서·G5·G6 기계 검사·사본 표지·근거 강조. 초점 이동(G4)과 실제 api·DB 연결은 브라우저로 확인했다(U4 코드 요약 Step 22·23).

## 범위 밖·남은 것

- 4번 자리(U10 `JdSummaryPanel`)는 U10이 제공한 뒤 단다. PDF 항목(U8)은 자리만 보인다.
- `indexState`·[검색 다시 준비]는 C-09 합의 뒤(OQ-U4-5). 실제 색인·LLM이 있는 환경의 요약·질의응답 동작은 U5 몫이다.
