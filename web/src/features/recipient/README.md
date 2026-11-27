# 받은 사람 발행본 화면 — 12월 U4 W4 (#416)

링크를 받은 사람이 회원 로그인 없이 `/s/[token]`에서 발행본(C-10 `PublishedSnapshot`)을 읽는 화면이다. 10월 W7(#152)의 공개 프로필·Catch 목록·상세 화면과 `/s/[token]/catches/[catchId]`, 작성자 공유 링크 화면(`/links`, `features/share-links/`)은 제출 3(W6)에서 지웠고, 작성자 쪽은 [발행·발행본 화면](../publications/README.md)이 맡는다.

기준: [U4 기능 명세](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/functional-design/functional-spec.md) W4·S8·S9·S14, [보안 요구사항](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-requirements/security-requirements.md) 「안내 중복 통과 조건」 G1~G7, [보안 설계](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u4-publication-link/nfr-design/security-design.md) 「web 화면 출력」·「받은 사람 화면 자리」, [계약 요약](../../../../aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md) C-11·C-12, #416 팀장 결정(2026-10-29 Q1 B 주소 링크, 2026-11-04 OQ-U4-NFR-5, 2026-11-05 OQ-U4-NFR-6). api 쪽은 [api/docs/recipient-publication.md](../../../../api/docs/recipient-publication.md)에 있다.

## 파일

| 파일 | 역할 |
|---|---|
| `src/app/s/[token]/page.tsx` | 페이지. 모든 열람 상태에 수신자 전용 헤더를 `src/app/s/layout.tsx`가 붙인다 |
| `../../components/header/recipient-header.tsx` | 회원 로그인 복원·로그아웃과 받은 링크에서 시작하는 로그인. 표시만 맡는 `recipient-header-view.tsx`는 공통 미리보기에서도 실제 인증 없이 사용한다 |
| `recipient-screen.tsx` | 상태 연결(`createRecipientPublicationStore`), 단계별 h1 초점, `isLoggedIn`, 붙는 자리 props. 열린 프리셋 탭과 `showEvidence`는 `../publications/snapshot-jump.ts`의 `useSnapshotJump`가 맡는다(발행 프리셋 U3) |
| `recipient-view.tsx` | 상태별 그리기(발행본·비밀번호 입력·접근 불가·조회 실패)와 0~4번 자리 배치(2번 `SummarySlot`, 3·4번 `QuestionSlots`), 비밀번호 입력. 판정 통과 화면은 안내 묶음과 작업 칸으로 묶는다(#615) |
| `recipient-workspace.ts` | 넓은 화면 좌우 배치의 높이 맞추기·휠 순서·자료 칸만 옮기기(`useWorkspaceLayout`)와 좁은 화면의 「보던 곳으로 돌아가기」(`useEvidenceReturn`). 아래 「넓은 화면 좌우 배치와 돌아가기 (#615)」 |
| `recipient-store.ts` | 발행본 상태. 응답 코드 분기·비밀번호 확인·시도 제한 대기·늦은 응답 버리기·`accessLost`, Claude 안내 표시 값(`readWithoutGrant`·`claudeConnectable`) |
| `recipient-api.ts` | `api.recipient` 위의 호출(`publication`·`unlock`)과 응답 모양 검사. 사본 검사는 `publications-api.ts`의 `isPublishedSnapshot`을 쓰고 계약 밖 칸은 넘기지 않는다. 항목마다 발행 프리셋 칸(`presetOrdinal` 1~5 정수·`presetName` 앞뒤 공백 뺀 1자 이상, 계약 P-3)이 있어야 하고 두 칸은 그대로 옮기며, `isFirstCopy`·원본 ID 같은 그 밖의 칸은 버린다(발행 프리셋 U3 BR2.4). 새 Catch NC2의 사본 칸 넷(`repositoryName`·`authorDescriptionEditedMonth`·`workLimits`·근거별 `ownCommit`)은 있을 때만 그대로 옮기고 없으면 칸을 만들지 않는다 |
| `recipient-grants.ts` | 링크별 grant 보관(`sessionStorage`), 10월 그대로 |
| `recipient-slots.ts` | C-11 `RecipientSlotProps`·`LinkAccessCode`·`EvidenceLocation`(화면 안 형, OQ-U4-7)과 근거 위치 대조 `resolveEvidenceTarget` |
| `recipient-format.ts` | 공통 문구(링크 불가·비밀번호 제목·발행 시각), 비밀번호 단계 안내, `isGithubSourceUrl` 재수출 |
| `../publications/snapshot-view.tsx` | 사본 그리기(프리셋 탭). 작성자 발행본 상세와 같은 컴포넌트이며 받은 사람 화면은 `highlight`(근거 강조)와 항목 `id`만 더 쓴다 |
| `../publications/snapshot-jump.ts` | 열린 프리셋 탭·출처 이동 대상·탭 바뀜 알림을 한 상태로 갖는 `useSnapshotJump`(작성자 발행본 상세와 함께 씀) |
| `../../components/tab-strip/tab-strip.tsx` | 공용 탭 줄(`TabStrip`). 발행본 자료와 자료 화면이 함께 쓴다 |
| `test/recipient.test.mjs` | 위 동작의 단위·그리기 시험. 탭 줄·묶기·출처 이동 상태 단위 시험은 `test/reader-tabs.test.mjs`, 좌우 배치·돌아가기 줄은 `test/recipient-workspace.test.mjs` |

## 화면 순서(C-11 자리)

| 상태 | 위에서부터 |
|---|---|
| 판정 통과 | U4 h1(발행본 제목, `tabIndex={-1}`) → 0 `RecipientGuide`(U2, `showClaudeConnect={claudeConnectable(snapshot)}`) → 0.5 U9 `ClaudeAnalyzePanel`(같은 값이 참일 때만) → U4 고정 안내 「발행 시각 YYYY-MM-DD HH:mm:ss (KST)」 → 2 `BaseSummaryPanel`(U5, AI 요약) → 1 발행본 자료(프리셋 탭) → 3 `QnaPanel`(U5) → 4 `JdRecipientPanel`(U10 JD 요약 조립) |
| 비밀번호 입력 | U4 h1 「비밀번호가 필요한 링크입니다」 → 입력. `RecipientGuide`·패널 없음 |
| 접근 불가 | U4 h1 「이 링크는 열람할 수 없습니다.」만 |
| 조회 실패 | 숨긴 h1 「발행본」 + 「발행본을 불러오지 못했습니다」·[다시 불러오기] |

- 각 상태의 h1은 U4 것 하나뿐이고 안내 묶음 안에는 h1이 없다(G3). 단계가 정해질 때마다(처음 연 화면 포함) 그 h1로 초점을 옮기며 비밀번호 입력칸에 `autoFocus`를 두지 않는다(G4). 불러오는 중과 같은 단계 안의 갱신에는 옮기지 않는다.
- U4 고정 안내(BR7.1)는 발행 시각 한 줄이다. 고정 사본 설명은 U2 `fixed-copy`, 링크 기간·중지는 U2 `link-conditions`, 외부 AI 고지는 U5, JD 로그인 안내는 U10이 맡으므로 같은 뜻의 문장을 두지 않는다(G5·G6).
- 0.5번 자리(U9 받은 사람 Claude 패널, C-11)는 0번 바로 다음, 발행 시각 안내 앞에 둔다. 판정 통과 분기가 `claudeConnectable(snapshot)`을 한 번 읽어 그 값을 `RecipientGuide`의 `showClaudeConnect`와 0.5번 패널 표시에 함께 쓰고, 패널에는 `slotProps.token`만 넘긴다(grant·비밀번호·`getGrant`·`onAccessLost`는 넘기지 않음, 아래 「Claude 안내 표시 값」). 패널은 [`../recipient-claude/claude-analyze-panel.tsx`](../recipient-claude/claude-analyze-panel.tsx)이고 화면 연결은 `test/u9-recipient-claude.test.mjs`가 본다.
- 판정 통과 화면은 위 순서를 안내 묶음(h1 ~ 발행 시각)과 작업 칸(2 → 1 → 3 → 4번)으로 묶는다(#615). 마크업 순서는 그대로이고, 1200px 이상에서만 CSS가 왼쪽에 1번, 오른쪽에 위에서부터 2 → 3 → 4번을 놓는다(아래 「넓은 화면 좌우 배치와 돌아가기 (#615)」). 비밀번호 입력·접근 불가·조회 실패 화면은 묶지 않는다.
- 2번 자리(AI 요약)는 발행 프리셋 U3(BR3.1, 2026-11-20)부터 1번 자리(발행본 자료) 위에 있다. 자리 번호는 C-11 그대로이고 그리는 순서만 바꿨다. 2번은 `SummarySlot`, 3·4번은 `QuestionSlots`가 그리며 넘기는 값은 그대로다. 3번 질문하기는 발행본 자료 탭 밖이라 탭을 바꿔도 대화가 남는다(BR3.2).
- 2·3번 자리는 [U5 README 「붙이는 방법」](../rag-answer/README.md)대로 `RecipientSlotProps`(`token`·`getGrant`·`onAccessLost`·`isLoggedIn`·`showEvidence`)를 그대로 넘기고 `key={token}`이다. 여기에 이 화면의 사본으로 만든 선택 `itemTitleOf`(`itemTitleFinder(snapshot.items)`, #559)를 더 넘겨 출처 딱지 옆에 항목 제목을 보인다. `RecipientSlotProps` 모양은 그대로이고 4번 자리에는 넘기지 않는다. `isLoggedIn`은 이 탭의 회원 토큰 유무이며 받은 사람 요청에는 그 토큰을 붙이지 않는다.

## 동작

- **상단 바 로그인·프로필(#638):** 자료·비밀번호 입력·열람 불가·조회 실패 화면 모두 헤더가 회원 세션 복원을 시작한다. 확인 중에는 오른쪽을 비우고, 확인 실패·재인증 필요에는 [로그인], 확인된 회원에게는 기존 회원 [프로필] 메뉴를 보인다. 그 밖의 로그인 여부는 JD 요약과 같은 조건을 쓴다. 왼쪽 CatchU는 이동 없는 글자이며 작성자 메뉴는 두지 않는다. 로그아웃 진행·결과 불명에도 프로필은 남기고 메뉴의 로그아웃을 막는다. 실패·불명 안내와 가능한 재시도는 회원 화면과 같은 안내를 헤더 아래에 두며, 로그아웃이 끝나도 받은 링크에 머문다. 이 탭에서 누른 로그아웃이 끝나면 [프로필]이 사라져 잃은 초점을 [로그인]으로 옮긴다. 다른 탭의 로그아웃이나 기다리는 동안 옮긴 초점은 그대로 둔다(#649 리뷰).
- **로그인 복귀(#638):** 헤더 [로그인]은 이 탭에 30분 동안 유효한 돌아갈 곳을 저장하고 토큰 없는 진입 표시로 로그인 화면을 연다. 로그인·최초 이름 입력을 마치면 같은 링크로 돌아와 돌아갈 곳만 지운다. 기존 비밀번호 grant의 탭·수명·재확인 기준은 그대로이며 회원 로그인이 비밀번호 확인을 대신하지 않는다. 공통 미리보기는 표시용 헤더로 로그인 전·확인 중·로그인 뒤를 나란히 그려 실제 세션을 확인하지 않는다.

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
- **사본(1번 자리) 프리셋 탭(발행 프리셋 U3 BR1·BR2):** 「발행본 자료」 아래 탭 줄(이름 「발행본 자료」)에 고른 프리셋마다 탭 하나가 있고, 프리셋이 하나여도 탭 줄이 보인다. 항목을 `presetOrdinal` 순으로 묶고 탭 이름은 그 묶음 첫 항목의 `presetName`이다. 탭 옆에 개수는 없고, 긴 이름은 탭에서만 CSS로 「…」 줄이며(최대 16em) 탭 줄 아래에 열린 탭의 이름 전체를 보인다(「프리셋」 같은 표시는 붙이지 않는다). 줄어든 탭에 마우스를 올리거나 키보드 초점이 가면 전체 이름이 말풍선으로 보이며, 말풍선은 `aria-hidden`이고 `title`을 쓰지 않아 화면 낭독기는 이름을 한 번만 읽는다. 열린 탭은 위쪽 띠·굵기·색으로 구분한다(#632, 자료 화면 탭과 같은 모양). 이름은 글자로만 그리고 탭·패널 id에는 순번만 쓴다. 같은 자료가 두 프리셋에 있으면 두 탭에 각각 보인다. 처음 열면 첫 탭이 열려 있다. 모든 탭 패널을 그려 두고 열리지 않은 패널은 `hidden`이라 탭을 오가도 요청이 없고 PDF 뷰어가 받은 파일·보던 쪽이 남는다. 다시 조회 뒤에는 같은 순번이 있으면 그 탭을, 없으면 첫 탭을 연다. 키: 왼쪽·오른쪽 화살표(끝에서 돎)·Home·End로 옮기면 바로 열리고 초점이 간다. 열린 탭만 Tab 순서에 있고, 다시 Tab이면 열린 패널(`tabIndex=0`)로 들어간다.
- **사본(1번 자리) 항목:** 탭 안 항목을 `position` 순으로 그린다. Catch는 불일치 표지·AI 설명 초안·작성자 설명·기록(작업 사실·본인 기여·근거)을 서로 다른 표지로 나누고 위에서부터 이 순서로 둔다(#488, 면접관이 한 일과 그 이유를 먼저 본다). 기록 가운데 작업 사실은 펼쳐 두고, 본인 기여와 근거 목록은 「근거 자세히 보기」(`<details>`) 안에 처음엔 접어 둔다. 근거 목록 안 순서는 사본 그대로다. AI 설명 초안이 없으면 그 칸을 그리지 않는다(Catch 개편 CR3 BR7.1). 본문·작성자 설명·AI 초안은 React 텍스트로만 그리고(NFR1.10), 근거 원문과 본문·작성자 설명 안의 `https://github.com/…` 주소만 새 탭 링크(`rel="noopener noreferrer"`)다(`lib/github-source-url.ts`, #416 Q1 B, NFR1.11). AI 초안에는 링크를 만들지 않는다(OQ-U4-NFR-3). 작성자 설명은 글이 있는 칸만 h5 칸 제목과 함께 칸별로 보이고(「더 쓰기」만이거나 옛 글이면 h5 없이 글만), 그 안의 링크는 주소 전체 대신 「파일 · 줄 · 판본」 같은 이름으로 보이며 마우스를 올리면 주소 전체가 보인다. 텍스트 자료 본문 링크는 주소 전체 그대로다(새 Catch NC1, [발행 화면 README](../publications/README.md) 「발행본 목록·상세」).
- **붙는 컴포넌트의 접근 상실(C-11 rule):** 패널이 401 `LINK_PASSWORD_REQUIRED`·404 `LINK_UNAVAILABLE`을 받아 `onAccessLost(code)`를 부르면 화면이 직접 받은 것과 같은 전환·grant 삭제를 하고, 진행 중이던 조회는 끊어 늦은 응답이 거부를 덮지 않게 한다.
- **근거 강조(C-11 evidence-highlight):** 패널이 `showEvidence(location)`를 부르면 사본에 대조한다(`resolveEvidenceTarget`). 항목(`publishedItemId`)이 없으면 옮기지 않고, `fieldPath`(`workFacts[i]`·`subjectContribution`·`evidence[i].representedFacts[j]`·`authorDescription`·`body`·PDF의 `pages[n]`)가 가리키는 문자열 안의 `[charStart, charEnd)`만 `<mark>`로 강조하며, 범위 밖·없는 경로(`aiDraft` 등)면 항목으로 옮기기만 한다. PDF의 `n`은 1부터 시작하는 쪽 번호다. 강조가 접힌 「근거 자세히 보기」 안(`subjectContribution`·`evidence[i]…`)을 가리키면 같은 그리기 차례에 그 칸을 펼쳐 스크롤할 때 `<mark>`가 보인다. 사람이 다시 접을 수 있고, 같은 근거를 다시 누르면 다시 펼친다(#488). 옮길 때 강조 범위가 있으면 그 항목 안의 첫 `<mark>`가 화면에 보이도록(`block: "center"`) 스크롤하고, 범위가 없거나 강조 요소를 못 찾으면 그 항목(`id="published-item-<id>"`) 시작으로 스크롤한다. 초점은 두 경우 모두 항목에 두며(`preventScroll`), 같은 근거를 다시 눌러도 다시 옮긴다. 가리킨 항목이 다른 프리셋 탭에 있으면 그 탭과 옮길 대상을 한 번의 상태 바뀜에서 함께 바꾸고, 탭 줄 바로 위 알림 칸(`aria-live="polite"`)에 「(프리셋 이름) 탭을 열었습니다」를 보인다. 같은 탭이면 알림을 바꾸지 않는다. 넓은 화면에서는 자료 칸 안쪽만 옮기고, 좁은 화면에서는 옮겨 간 항목에 「보던 곳으로 돌아가기」를 둔다(#615, 아래 절). 발행 프리셋 U3의 [답으로 돌아가기]는 만들지 않았고(2026-11-19 팀장 결정) #615가 이름과 자리를 다시 정했다.
- **다시 조회:** 확정 거부(404·401)는 표시하던 사본을 지우고 해당 화면으로 바꾼다. 조회 실패는 같은 링크의 이미 표시한 화면만 유지하고 「최신 자료를 불러오지 못해 이전에 불러온 내용을 보여 주고 있습니다.」를 알린다. 열린 화면을 실시간으로 회수하지 않으며 자동 조회·전송을 하지 않는다. 늦게 도착한 응답(다시 조회·화면 해제 뒤)은 버린다.
- **노출:** 토큰은 경로에만, 비밀번호는 본문으로만, grant는 `X-Link-Grant` 머리글로만 둔다. 404 사유를 드러내지 않는다.
- **탭 제목·메신저 미리보기·검색 제외(#565):** `app/s/layout.tsx`가 `/s/` 아래 모든 주소에 같은 고정 문구를 내려 준다. 제목은 「지원자가 보낸 작업 자료 | CatchU」, 설명은 「지원자가 CatchU에서 골라 보낸 자료입니다. 발행할 때의 내용 그대로 보입니다.」이고 `og:title`·`og:description`도 같다. web 서버는 링크 토큰으로 API를 부르지 않으므로 발행본 제목·작성자·내용은 넣지 않고, 미리보기 그림도 없다. 열람 불가·비밀번호 화면도 같은 문구다. 검색 엔진에는 `noindex, nofollow`로 싣지 않게 표시한다. robots.txt로 `/s/`를 막으면 검색 엔진이 이 표시를 읽지 못하므로 robots.txt는 두지 않는다.
- **Claude 안내 표시 값(C-11 claude-connect-rule, #495):** 발행본 조회가 200으로 성공하면 그 요청에 grant를 실었는지를 판정 통과 상태의 `readWithoutGrant`에 둔다. 요청을 보낼 때 쓴 값으로 정하고 응답·렌더링 때 grant 저장소를 다시 읽지 않으므로, 그 뒤 저장소 값이 바뀌거나 읽기가 실패해도 이 값은 그대로다. 다시 조회 중·실패 동안은 마지막 성공 요청의 값을 유지하고, 확정 거부(404·401·`onAccessLost`)·불러오는 중·최초 조회 실패에서는 판정 통과 상태가 아니므로 쓰이지 않는다. `claudeConnectable(snapshot)`이 판정 통과이면서 `readWithoutGrant`일 때만 true를 돌려준다. 비밀번호 링크는 grant 없이 200을 받지 못하고(C-10) 비밀번호 유무는 발행 뒤 바뀌지 않으므로(C-07) true는 비밀번호 없는 링크다. 화면 표시용이며, Claude 쪽 접근은 C-15 `read_shared_publication`이 호출마다 C-10을 grant 없이 다시 판정한다. 화면은 판정 통과 분기에서 이 값을 한 번 읽어 0번의 Claude 줄(`showClaudeConnect`)과 0.5번 U9 패널을 함께 켠다(위 「화면 순서」).

## 넓은 화면 좌우 배치와 돌아가기 (#615)

기준: [#615](https://github.com/JminAILab/CatchU/issues/615) 본문과 팀장 결정 두 건([넓은 화면, 2026-11-23](https://github.com/JminAILab/CatchU/issues/615#issuecomment-7094615286)·[좁은 화면 복귀, 2026-11-25](https://github.com/JminAILab/CatchU/issues/615#issuecomment-7125550185)). 받은 사람 화면에만 적용하고 작성자 발행본 상세는 그대로다. 코드는 `recipient-workspace.ts`·`recipient.module.css`이고, 사본 표시(`../publications/snapshot-view.tsx`)에는 선택 값 `returnBar`, 출처 이동(`../publications/snapshot-jump.ts`)에는 선택 값 `place`만 더했다.

- **배치(1200px 이상):** 화면 전체 최대 1440px. 왼쪽 「발행본 자료」, 오른쪽 위에서부터 「AI 요약」 → 「발행본에 질문하기」 → 「JD 요약」이고 두 칸의 비는 약 1.12 : 1(오른쪽 최소 400px)이다. 제목·안내·Claude 연결·발행 시각은 두 칸 위에 한 줄로 둔다. 1200px 미만은 위아래 한 줄이다. 마크업 순서는 어느 폭에서나 AI 요약 → 발행본 자료 → 발행본에 질문하기 → JD 요약이라, 넓은 화면의 Tab 순서는 오른쪽 위 → 왼쪽 자료 전체 → 오른쪽 아래다(2026-11-23 결정 4번: 그대로 두고 건너뛰기 링크는 넣지 않는다).
- **스크롤:** 두 칸을 감싼 작업 칸은 화면에 보이는 높이만 차지하고 안쪽에서 스크롤한다(오른쪽 세 구역). 자료 칸은 그 안에서 위에 붙은 채 따로 스크롤한다. 그래서 자료를 끝까지 읽어도 오른쪽 칸이 화면에 남고, 질의응답이 길어지면 오른쪽 칸 안에서 스크롤된다. 작업 칸 윗변의 화면 좌표를 스크립트가 CSS 변수 `--ws-top`으로 넘겨, 위쪽 안내가 보이는 동안에도 칸의 아래 끝이 화면 안에 있다. 칸 위에서 휠을 내리면 위쪽 안내가 지나갈 때까지 페이지가 먼저 내려가고 그다음 칸 안쪽이 굴러가며, 올릴 때는 칸 안쪽이 맨 위에 닿은 뒤 페이지가 올라간다(`pageWheelDistance`). **이 휠 순서는 터치에는 적용되지 않는다**(터치로는 칸 밖을 밀어 페이지를 옮긴다).
- **넓은 화면의 출처 이동:** 자료 칸 안쪽만 옮긴다(`paneScrollDistance`). 강조 글은 자료 칸의 보이는 부분 가운데쯤에 오고, 페이지와 오른쪽 칸의 위치는 바뀌지 않아 누른 답이 그대로 보인다. 초점은 지금처럼 자료 항목에 둔다. 답 쪽으로 키보드로 돌아오려면 Shift+Tab으로 거슬러 가야 한다(같은 결정 4번의 한계).
- **「접기」 줄:** 펼친 글의 「접기」에 키보드 초점이 있는 동안 단추 줄은 가장 가까운 스크롤 칸의 아래쪽에 붙는다. 넓은 화면에서는 자료 칸 아래, 좁은 화면에서는 화면 아래다.
- **「보던 곳으로 돌아가기」(1200px 미만에서만):** AI 요약·질의응답·JD 요약(「원문에서 확인」)의 출처 단추로 옮겨 가면 그 자료 항목의 맨 앞에 단추 줄이 생긴다. 초점이 놓인 항목에서 Tab 한 번에 닿고, 그 항목이 화면에 있는 동안 화면 위쪽에 붙는다(「접기」 줄은 아래쪽). 이름은 출발한 곳과 상관없이 하나다. 누르면 초점을 눌렀던 출처 단추에 두고 그 단추를 화면 가운데로 옮기며, 열린 탭·펼친 글·강조는 그대로 둔다. 그 단추가 다시 그려져 없으면 그 구역(2·3·4번 자리) 맨 위로 가고 초점은 그 구역에 둔다. 돌아가지 않으면 줄은 그 항목에 남고 닫는 단추는 없다. 마지막 출처 이동 한 번만 기억해, 다른 출처를 누르면 줄이 새 항목으로 옮겨 간다. 사람이 탭을 바꾸면 줄은 항목과 함께 숨고 그 탭으로 돌아오면 다시 보인다. 접근이 끊겨 사본이 화면에서 내려가면(비밀번호 입력·접근 불가·조회 실패) 돌아갈 자리를 지운다. 비밀번호를 다시 입력해 열람해도 이전 줄은 없고 새로 출처를 눌러야 생긴다(다시 조회로 사본만 새로 받을 때는 지우지 않는다, `returnReducer`).
- **누른 단추 기억:** 패널(U5·U10) 코드는 고치지 않고, 작업 칸에서 클릭을 먼저 지켜봐(`onClickCapture`) 2·3·4번 자리 안에서 눌린 단추를 적어 둔 뒤 패널이 부르는 `showEvidence`에서 돌아갈 자리로 삼는다. 키보드 Enter·Space도 click으로 온다. 초점이 있던 요소로 기억하지 않으므로 마우스로 눌러도 단추에 초점이 가지 않는 브라우저에서도 같다.
- **폭이 1200px 이상으로 넓어지면:** 줄을 그리지 않고, 돌아가기 단추에 있던 초점은 그 자료 항목으로 넘긴다. 줄은 CSS 폭 기준으로 숨기지 않고 화면이 그리지 않는다: CSS로 숨기면 폭 바뀜을 알기 전에 단추가 초점을 잃어 초점이 페이지 본문에 남는다(2026-11-25 팀장 댓글). 초점이 그 항목이나 돌아가기 단추에 있었을 때만 새 배치에서 강조 글이 다시 보이게 자리를 맞추고(다음 그리기와 0.6초 뒤, 사람이 먼저 입력하면 그만둠), 다시 좁아지면 줄이 다시 보인다. 같은 쪽(좁은 폭끼리·넓은 폭끼리) 안에서 폭만 바꿀 때는 자리를 다시 맞추지 않는다.

확인 범위: 실제 브라우저에서 합성 api 대역으로 배치·스크롤·출처 이동·돌아가기·폭 바뀜을 확인했다(2026-11-25, 기록은 [#615](https://github.com/JminAILab/CatchU/issues/615)에 연결된 구현 PR). 실제 api·DB·AI 답, 터치 기기, Chrome 외 브라우저에서는 확인하지 않았다. 넓은 화면에서 페이지를 내리지 않고 키보드로만 칸 안을 옮겨 다니면 페이지가 저절로 내려가지 않아, 위쪽 안내가 차지한 만큼 칸이 낮게 보인다.

## PDF 항목과 사본 열람 (U8)

12월 intent U8(PDF 자료, #420)이 1번 자리의 PDF 항목과 PDF 열람 공용 도우미를 더했다. 기준: [U8 기능 명세](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/functional-design/functional-spec.md) W4, [업무 규칙](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/functional-design/rules.md) BR6, [보안 설계](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-design/security-design.md) §2·§6. api는 [PDF 자료 문서](../../../../api/docs/pdf-materials.md#pdf-사본-열람-c-12-추가-경로)에 있다.

| 파일 | 역할 |
|---|---|
| `pdf-viewer-launcher.tsx` | 열람 공용 도우미. 요청 결과 판정(`loadPdf`), 뷰어 상태 전이(`createPdfViewerModel`), 화면 수명 연결(`usePdfViewer`), 그리기(`PdfViewerPanel`·`PdfViewerLauncher`). 받은 사람 사본·작성자 사본·작성자 원본이 함께 쓰고 사본을 받는 요청만 다르다 |
| `pdf-viewer.module.css` | 뷰어 모양 |
| `../publications/published-pdf-item.tsx` | 발행본의 PDF 항목. 받은 사람 화면과 작성자 발행본 화면이 같은 컴포넌트를 쓴다 |
| `test/pdf-viewer.test.mjs`·`test/recipient-pdf.test.mjs` | 뷰어 상태 전이와 PDF 항목 그리기 시험 |

- **쪽 표시:** PDF 항목은 쪽 수와 쪽 목록을 보인다. 쪽마다 "n쪽", 읽을 수 없는 쪽은 "읽을 수 없음" 표지, 읽을 수 있는 쪽은 사본의 글을 React 텍스트로만 그린다(추출한 글은 신뢰하지 않는 자료다). 데이터는 사본의 `pdfPages`로 이미 온다.
- **근거 강조:** `showEvidence`의 `fieldPath`가 `pages[n]`이면 그 쪽 글의 `[charStart, charEnd)`만 `<mark>`로 감싼다.
- **열기:** [PDF 보기]·[새 탭에서 열기]·[원본 n쪽 열기]는 `GET /v1/public/links/{token}/items/{publishedItemId}/pdf`를 `fetch`로 받아(grant는 `X-Link-Grant` 머리로만, 회원 토큰은 붙이지 않음) Blob URL을 만든 뒤 화면 안 iframe(`#page=n`)이나 미리 연 새 창에 넣는다. Blob URL은 응답 200과 본문 수신 성공 뒤에만 만든다.
- **다시 요청:** 뷰어가 열려 있는 동안의 쪽 이동은 같은 URL을 다시 쓴다. 처음 열기·닫았다가 다시 열기·[새 탭에서 열기]는 서버 판정을 다시 받는다. 그래서 링크가 중지된 뒤에는 다음 열기부터 막히고, 이미 열어 둔 PDF는 그 탭에서 계속 보인다(수용한 위험).
- **접근 상실:** 401 `LINK_PASSWORD_REQUIRED`·404 `LINK_UNAVAILABLE`은 `onAccessLost(code)`로 넘겨 화면이 직접 받은 것과 같은 전환·grant 삭제를 한다. 500·전송 중단·통신 오류는 일반 열람 실패로 안내하고 grant를 유지한다.
- **해제:** Blob URL은 뷰어를 닫을 때, 화면을 떠날 때, 접근 상실 때 해제한다. 해제된 새 탭의 PDF는 그 탭을 새로고침하면 실패하며 원래 화면에서 다시 연다(수용한 위험).
- **팝업이 막힌 경우:** 같은 요청의 PDF를 화면 안 뷰어에 보이고 안내한다.
- **iframe과 CSP:** iframe에 `sandbox`를 두지 않는다(브라우저 내장 PDF 뷰어가 sandbox 아래에서 동작하지 않는 경우가 있다). Blob URL을 iframe으로 그리기 위해 `next.config.ts`의 CSP에 `frame-src 'self' blob:`이 있다.
- **개발 모드:** React StrictMode가 효과를 정리한 뒤 다시 실행하므로 뷰어 모델은 `activate()`로 다시 살아난다(`usePdfViewer`).

시험: `node --test test/pdf-viewer.test.mjs`(5개) — 요청 결과 판정, 열기·쪽 이동·닫기·해제, 새 탭과 팝업 차단, 접근 상실, 정리 뒤 재활성. `node --test test/recipient-pdf.test.mjs`(6개) — 쪽 표시·읽을 수 없음 표지·근거 강조·작성자 화면의 같은 컴포넌트·열리지 않은 프리셋 탭의 PDF 항목도 그려 두고 처음 그릴 때 사본 요청 0(발행 프리셋 U3). 합성 응답과 서버 렌더링이다.

확인 범위: 실제 로컬 api와 브라우저로 받은 사람 화면에서 쪽 글 표시와 [PDF 보기]의 화면 안 렌더링을 확인했다(2026-11-11). 그 사본은 로컬 파일 저장소에서 실제 큐와 worker가 추출한 PDF를 발행 화면에서 골라 발행한 것이다([U8 코드 요약](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/code-generation/code-summary.md) §17.6). 브라우저로 확인하지 않은 것: 팝업이 허용된 새 탭 열기(내장 브라우저가 팝업을 막음), Blob URL 해제, 근거 강조의 실제 패널 연결. 실제 S3를 쓰는 환경의 열람은 미검증이다.

## 시험

`node --test test/recipient.test.mjs`(58개): 응답 모양·grant 보관(10월 유지 묶음)·판정 응답 처리·`onAccessLost`·Claude 안내 표시 값(#495)·근거 위치 대조·G1~G3 구조·자리 순서·G5·G6 기계 검사·사본 표지·근거 강조·Catch 칸 순서와 근거 접기(#488)·새 Catch NC1·NC2 표시, 발행 프리셋 U3의 프리셋 탭·질문 자리가 탭 밖·출처 이동 알림·탭 바꿈 요청 0. 초점 이동(G4)과 실제 api·DB 연결은 브라우저로 확인했다(U4 코드 요약 Step 22·23).

`node --test test/recipient-workspace.test.mjs`(9개, #615): 작업 칸 안 마크업 순서와 자리 클래스, 비밀번호·접근 불가·조회 실패 화면에 작업 칸 없음, 스크립트와 CSS의 기준 폭 일치, 휠 순서 계산, 자료 칸만 옮길 거리 계산, 돌아가기 줄(가리킨 항목의 첫 자식·이름 하나·값이 없으면 없음·작성자 화면은 값을 넘기지 않음), 접근 상실 뒤 돌아갈 자리 지우기. 실제 배치·스크롤·초점 이동·폭 바뀜은 브라우저로 확인한다.

`node --test test/reader-tabs.test.mjs`(19개, 발행 프리셋 U3): 공용 탭 줄의 역할·속성·키(돎·Home·End·거절 때 초점 그대로)·패널 `hidden`과 패널 클래스 없음, 프리셋 묶기(순서·같은 자료 두 탭·이름 섞임), 긴 이름·태그 꼴 이름, 처음 화면·PDF 요청 0, 갱신 뒤 탭, 출처 대상(다른 탭·같은 탭·알림), 응답의 프리셋 칸 검사와 받은 사람 응답 해석. 실제 초점·스크롤·숨김(CSS)·320px 폭은 브라우저로 확인한다(Build and Test).

## 범위 밖·남은 것

- 4번 자리의 JD 요약은 [U10 조립](../jd/README.md)을 사용하며, PDF 항목은 U8이 채웠다(위 「PDF 항목과 사본 열람 (U8)」). 각 기능의 검사·한계는 해당 안내를 따른다.
- `indexState`·[검색 다시 준비]는 C-09 합의 뒤(OQ-U4-5). 실제 색인·LLM이 있는 환경의 요약·질의응답 동작은 U5 몫이다.
