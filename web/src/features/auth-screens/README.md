# 로그인·인증 화면 — #287

Google 로그인 버튼, Google 콜백 화면, 재인증 안내, 회원 셸의 로그아웃 진행·실패·불명 표시와 로그아웃·[다시 로그인] 전 확인을 다룬다.
상위 작업은 [#251](https://github.com/JminAILab/CatchU/issues/251)이고, 공통 인증은 [#286](https://github.com/JminAILab/CatchU/issues/286)이 맡는다.

## 현재 상태: 통합 시험 전환 아래 연결, 제품 기본 켜짐

- 공통 인증(#286)의 통합 시험 전환 `NEXT_PUBLIC_AUTH_SESSION_INTEGRATION=true`일 때만 화면이 연결된다(`src/lib/auth-integration.ts`, 아래 「연결」).
- 전환을 끄면 로그인·로그아웃이 기존 #106 동작 그대로이고, 로그인 화면의 Google 버튼은 '연결 전' 표시이며 `/google/callback`은 404다.
- 실제 Google·쿠키·다중 탭을 합친 통합 브라우저 검증은 #286이 맡아 #251에 기록한다. 제품 기본은 그 검증 뒤 2026-11-11 팀장 승인으로 켰다([#467](https://github.com/JminAILab/CatchU/issues/467#issuecomment-6784442435)).

## 담당 경계

| 맡는 곳 | 내용 |
|---|---|
| #286 공통 인증 | 인증 상태·세대·잠금·로그인 표식, 갱신·복원·로그아웃 요청, Google 시작 API·시도 보관·콜백 해석·완료 요청, 가드의 인증 판정·입력 정리·로그아웃 뒤 이동, 다른 탭 로그아웃 판정, 통합 브라우저 검증 |
| #287 이 화면 | Google 버튼·이동, 콜백 화면(해석 결과 보존·query 제거 포함)과 안내, 재인증 안내 컴포넌트, 로그아웃·재인증 [다시 로그인]의 이동 전 확인(사유별 문구), 로그아웃 진행·실패·불명 표시, 화면 대역 시험 |
| 각 화면 담당 | 내 자산·공유 링크·최초 입력에서 어떤 입력을 미저장으로 볼지, 어떤 분석 요청을 미확정으로 등록할지(#153·#154)와 공통 인증 결과를 받는 방식 |

근거: [#287 연결 안내](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6187890290), [재인증 안내 `variant` 안내](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6207895905), [1~9번 답변](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6139957700), [A 답변](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6187946262), [팀장 결정](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6206414443), [확인 사유 문의](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6306296347)·[A 답변 1](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6310239160)·[사유 조회 접점](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6313395220).

## 파일

화면이 받는 값의 타입은 #286의 `auth-google.ts`·`auth-state.ts`·`auth-logout.ts`·`auth-gate.ts`·`member-lookup.ts`를 그대로 쓴다. 화면 쪽에 같은 모양의 타입을 따로 두지 않는다.

| 파일 | 내용 |
|---|---|
| `src/lib/auth-screen-messages.ts` | 안내 문구([합의] 표시)와 결과·화면별 선택 |
| `src/lib/google-login-screen.ts` | Google 버튼(`createGoogleStartControl`)·콜백 화면(`createGoogleCallbackControl`)의 진행 |
| `src/lib/member-session-screen.ts` | 로그아웃 요청·표시(`createMemberLogoutControl`·`logoutView`), 이동 전 확인(`confirmLogout`·재인증 [다시 로그인]의 `confirmReauthLeave`) |
| `src/lib/unsaved-changes.ts` | #286 공통 등록 수단. 확인 사유(`unsaved-input`·`unconfirmed-analysis-request`) 등록과 `activeReasons()` 조회. 로그아웃과 재인증이 같은 수단을 쓴다 |
| `src/components/auth/google-login-button.tsx` | Google 버튼 |
| `src/components/auth/google-callback-screen.tsx` | 콜백 화면 |
| `src/components/auth/reauth-notice.tsx` | 재인증 안내(가드의 `renderReauthNotice` 자리) |
| `src/components/auth/modal-reauth-notice.tsx` | 모달 안 재인증 안내(`ModalReauthNotice`). 전환이 켜져 있고 공통 인증이 재인증 필요일 때만 `ReauthNotice`를 그린다. 분석 요청 모달과 Catch 상세가 같이 쓴다 |
| `src/components/auth/member-logout.tsx` | 셸의 `useMemberLogout`·`LogoutStatus` |
| `src/components/auth/use-unsaved-changes.ts` | 화면이 미저장 입력을 알리는 hook |
| `src/components/header/` | `logoutPending`을 주면 [로그아웃]을 막고 "로그아웃하는 중"을 보인다. 주지 않으면 기존과 같다. [로그아웃]을 누르면 프로필 메뉴를 닫고 초점을 [프로필]로 돌린다 |

## 동작

**Google 버튼**
- 누르면 바로 막고 `startGoogleLogin(next)`를 한 번 부른다. 연타는 무시한다. `next`는 `/login?next=` 값이며 검사는 #286이 한다.
- `ready`면 Google로 이동하고 버튼은 계속 막는다. 화면을 떠난 뒤 온 `ready`로는 이동하지 않는다.
- 실패는 이유별로 안내하고 버튼을 다시 연다. 다시 누르면 새 시작이다. `superseded`는 안내 없이 버튼만 연다.

**콜백 화면**
- 세션 복원을 시작하지 않는다. 복원 결과로 이번 로그인 성공을 판정하지 않는다.
- 브라우저에서 query를 한 번만 해석하고 결과를 보존한 뒤 `history.replaceState`로 주소의 `code`·`state`·`error`를 지운다. 효과가 다시 실행돼도 다시 해석하지 않으므로, 지운 주소로 다시 해석해 `malformed`·`already-sent`로 덮는 일이 없다.
- 해석이 `complete`일 때만 완료 요청을 한 번 보낸다. 같은 입력의 중복은 #286도 하나로 묶는다. 화면이 닫히면 결과만 무시하고 요청을 중단하거나 다시 보내지 않는다.
- `signed-in`이면 #261 회원 조회 뒤 `afterLoginPath(이름, 다시 검사한 next)`로 간다. 조회 실패는 다시 불러오기만 하고 완료 요청은 다시 보내지 않는다. 보내지 않은 조회(`skipped`)는 실패로 안내하지 않고 이동 없이 [다시 로그인]만 둔다.
- 취소·실패·응답 유실·다시 열린 콜백은 재전송 없이 안내하고 [다시 로그인](로그인 화면, 새 시작)을 둔다. 로그인 실패 안내는 회원 인증 만료 안내와 다르다.
- query를 지운 주소를 새로고침·탭 복제로 다시 열면 새 페이지라 다시 해석한다. 이때 보낸 시도(`sent`)가 남아 있으면 `already-sent`로 안내하고, 시도 없음·만료·보내지 않은 시도는 그대로 `no-attempt`·`expired`·`malformed`다. 복제한 탭은 원래 탭의 로그인이 끝나도 따라 이동하지 않고 [다시 로그인]을 유지한다(의도한 동작, [#286 담당 답변](https://github.com/JminAILab/CatchU/issues/286#issuecomment-6542688675)).
- 콜백 주소는 `npm run dev` 요청 로그에 찍히지 않는다([web README 「실행」](../../../README.md#실행)).

**재인증 안내**
- 가드가 `renderReauthNotice({ returnTo, variant })`로 그린다. `variant`는 #286 `auth-gate.ts`의 `ReauthNoticeProps`다([#287 안내](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6207895905)).
- 두 경우 모두 [다시 로그인]은 로그아웃·갱신 요청 없이 `/login?next=<현재 경로>`로 간다.
- `variant` 생략·`reauth`: 회원 화면 위의 안내이며 아래 화면·입력은 유지된다. 로그아웃과 같은 「이동 전 확인」을 거치고, 머무르면 아무것도 하지 않는다.
- `login-changed`: 다른 탭의 새 로그인을 감지했지만 이 탭에서 복원할 수 없어 가드가 화면·입력을 이미 정리한 탭이다(가드의 `relogin-only`). 같은 문구에 [다시 로그인]만 두고 확인 없이 간다(사유도 읽지 않는다). 자동 이동·복원·로그아웃은 하지 않는다(팀장 결정 2).
- 위치: 안내와 [다시 로그인]은 스크롤해도 보이도록 가장 가까운 스크롤 영역의 위쪽에 붙는다(`.reauthNotice`의 `position: sticky`). 문서에서는 화면 위쪽, 분석 요청 모달 안에서는 모달 위쪽이다. 제자리에서는 흐름 안이라 헤더·입력을 가리지 않고(아래 여백 8px이 그림자를 받는다), 스크롤하면 내용이 안내 밑으로 지나간다. 안내가 있는 동안 그 스크롤 영역의 스크롤 고정(`overflow-anchor`)을 꺼, 안내가 나타나도 화면을 내리지 않고 내용을 아래로 민다. 붙어 있는 동안에는 그 스크롤 영역에 안내 높이만큼 `scroll-padding-top`을 둬 키보드 초점이 안내 밑으로 숨지 않게 한다. 자동 스크롤·초점 이동은 하지 않는다. 안내를 담은 모달이 열려 있으면 바깥 안내는 숨겨 한 번만 보이고 읽히게 한다(#286 10/29 확인 필요 2). 760px 미만(회원 화면 최소 폭으로 가로 스크롤)에서는 [다시 로그인]을 문구 바로 뒤에 두고, 왼쪽 안쪽 여백·간격과 버튼 좌우 여백을 줄여 버튼 오른쪽 끝을 475px에 둔다(#437 리뷰 안 A, 세로 스크롤바가 있는 창 500px 보완). 높이와 760px 이상 배치는 같다. 그래도 실제로 보이는 폭이 475px 미만이면 처음 화면에서 버튼 일부가 가로 스크롤 밖에 남는다. 창 폭의 경계는 세로 스크롤바가 자리를 차지하는지에 따라 다르다(스크롤바 15px 환경에서 창 약 490px). 더 좁은 확대 화면의 처리는 #286 후속 작업이다.
- 두 경우 모두 이동은 한 번만 시작한다(`createReauthLeaveControl`). 확인에서 계속했거나 물을 사유가 없어 이동을 시작한 뒤에는 다시 눌러도 묻거나 이동하지 않는다. 확인 창이 떠 있는 동안 들어온 더블클릭의 두 번째 클릭·Enter 반복도 같다([D 재현](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6335776141)). 머무르면 아무것도 바꾸지 않으므로 다시 누르면 그 시점의 사유로 다시 묻는다.

**로그아웃**
- [로그아웃]을 누르면 프로필 메뉴를 먼저 닫는다. 열린 메뉴가 실패·불명 안내의 [다시 시도]를 가리지 않게 하기 위해서다([#311 리뷰](https://github.com/JminAILab/CatchU/pull/311#pullrequestreview-5543242144)).
- 「이동 전 확인」 → `logout()`. 머무르면 요청·이동이 없다.
- 이 화면의 요청이나 공통 상태가 진행 중이면 다시 묻거나 보내지 않는다.
- `done`이어도 셸은 이동하지 않는다. 현재 유효한 완료일 때 입력 정리·비로그인 홈 이동은 가드가 한다. 다른 탭의 유효한 완료도 가드가 처리한다.
- `failed`·`unknown`은 완료로 표시하지 않고 화면·입력을 유지한 채 안내한다. [다시 시도]는 `canRetryLogout`일 때만 보인다.
- 이전 결과는 그사이 새 로그인이 시작됐거나 인증 세대가 바뀌었거나 다른 로그아웃이 진행 중이면 보이지 않는다. 다른 탭의 실패·불명으로는 안내하지 않는다.
- `not-started`·`discarded`는 안내 없이 진행 표시만 지운다.

**이동 전 확인(로그아웃·재인증 [다시 로그인])**
- 누를 때마다 #286 등록 수단의 `activeReasons()`를 한 번 읽고, 그 시점의 사유로 문구를 고른다([사유 조회 접점](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6313395220)).
- 사유가 없으면 묻지 않는다. 미저장 입력만이면 기존 문구, 미확정 분석 요청만이면 요청 문구이고, 둘 다면 두 내용을 담은 확인 창을 한 번만 띄운다([A 답변 1](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6310239160)).
- 분석 요청이 든 문구는 이 화면의 요청 확인 정보가 사라진다는 것과 이미 보낸 분석 요청은 취소되지 않는다는 것을 함께 알린다.
- 머무르면 요청·이동 없이 끝나고 입력·요청 정보와 그 등록을 건드리지 않는다. 계속하면 기존 흐름(로그아웃 `logout()`, [다시 로그인] `loginPath(returnTo)`)을 따른다.
- 사유 판정·등록은 각 화면 담당이 한다(미확정 분석 요청은 #153·#154). 이 화면은 분석 상태를 판정하지 않는다.

## 안내 문구

모든 문구는 [합의]다. 출처는 [#251 기록](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6487881554)이다. [D 검토안](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6485961477)의 「수정 제안」을 따르고 「유지」는 그 전 문구를 그대로 두었으며, A가 [#287에서 동의](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6487810987)했다. 로그아웃 결과 불명과 Google 사용 불가는 그 전 합의([#251 5번](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6139957700)·[A 답변 2](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6187946262))를 유지한 것이다. 이 합의는 문구 검토이며, 실제 브라우저 검증 완료나 제품 인증 전환 승인이 아니다(「현재 상태」).

- 일반 로그인 실패·네트워크 오류는 화면마다 다르다. 시작 화면(Google 버튼)은 같은 버튼을 다시 누르므로 "다시 시도", 콜백 화면은 [다시 로그인]에 맞춰 "다시 로그인"이다.
- 콜백 화면에서는 완료 요청의 일반 실패와 콜백 해석 오류(`provider-error`·`malformed`)가 같은 실패 문구를 쓴다. 취소·네트워크 오류·Google 사용 불가는 각자의 안내다.
- 시도 없음·만료(`no-attempt`·`expired`)와 다른 시도의 콜백(`state-mismatch`)은 문구만 같고, 콜백 해석 결과의 구분은 그대로다. 다시 열린 콜백(`already-sent`)은 따로 안내한다.
- 이동 전 확인 창은 "사라지는 것 → 이미 보낸 분석 요청은 취소되지 않음(해당할 때) → 확인 질문" 순서다. 표의 `<br>`은 문구 안의 줄바꿈(`\n`)이다.

| 상황 | 문구 | 구분 |
|---|---|---|
| 로그아웃 결과 불명(다시 시도 가능) | 로그아웃이 완료됐는지 확인하지 못했습니다. 다시 시도해 주세요. | [합의] |
| 로그아웃 결과 불명(다시 시도 불가) | 로그아웃이 완료됐는지 확인하지 못했습니다. | [합의] |
| Google 사용 불가(`unavailable`, 시도 보관 실패 포함) | 지금은 Google 로그인을 사용할 수 없습니다. | [합의] |
| Google 취소 | Google 로그인을 취소했습니다. | [합의] |
| 로그인 실패 — 시작 화면(`network`·`unavailable` 외) | 로그인하지 못했습니다. 다시 시도해 주세요. | [합의] |
| 로그인 실패 — 콜백 화면(완료 요청의 일반 실패, `provider-error`·`malformed`) | 로그인하지 못했습니다. 다시 로그인해 주세요. | [합의] |
| 네트워크 오류 — 시작 화면(`network`) | 네트워크 연결을 확인한 뒤 다시 시도해 주세요. | [합의] |
| 네트워크 오류 — 콜백 화면(`network`) | 네트워크 연결을 확인한 뒤 다시 로그인해 주세요. | [합의] |
| 재인증·표식 변경 뒤 정리된 탭 | 로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요. | [합의] |
| 로그아웃 실패(다시 시도 가능) | 로그아웃하지 못했습니다. 다시 시도해 주세요. | [합의] |
| 로그아웃 실패(다시 시도 불가) | 로그아웃하지 못했습니다. | [합의] |
| 다시 열린 콜백(`already-sent`) | 로그인 결과를 확인하지 못했습니다. 다시 로그인해 주세요. | [합의] |
| 시도 없음·만료(`no-attempt`·`expired`) | 로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요. | [합의] |
| 다른 시도의 콜백(`state-mismatch`) | 로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요. | [합의] |
| 로그인 완료 확인 중 | Google 로그인을 확인하고 있습니다. | [합의] |
| 로그인 버튼 진행 | Google로 이동하는 중 | [합의] |
| 로그아웃 진행 | 로그아웃하는 중 | [합의] |
| 로그아웃 전 확인(미저장 입력만) | 저장하지 않은 입력이 사라집니다.<br><br>로그아웃하시겠습니까? | [합의] |
| 로그아웃 전 확인(미확정 분석 요청만) | 이 화면의 분석 요청 확인 정보가 사라집니다.<br>이미 보낸 분석 요청은 취소되지 않습니다.<br><br>로그아웃하시겠습니까? | [합의] |
| 로그아웃 전 확인(둘 다) | 저장하지 않은 입력과 이 화면의 분석 요청 확인 정보가 사라집니다.<br>이미 보낸 분석 요청은 취소되지 않습니다.<br><br>로그아웃하시겠습니까? | [합의] |
| 재인증 전 확인(미저장 입력만) | 저장하지 않은 입력이 사라집니다.<br><br>로그인 화면으로 이동하시겠습니까? | [합의] |
| 재인증 전 확인(미확정 분석 요청만) | 이 화면의 분석 요청 확인 정보가 사라집니다.<br>이미 보낸 분석 요청은 취소되지 않습니다.<br><br>로그인 화면으로 이동하시겠습니까? | [합의] |
| 재인증 전 확인(둘 다) | 저장하지 않은 입력과 이 화면의 분석 요청 확인 정보가 사라집니다.<br>이미 보낸 분석 요청은 취소되지 않습니다.<br><br>로그인 화면으로 이동하시겠습니까? | [합의] |

## 연결(통합 시험 전환을 켰을 때)

전환을 끈 빌드는 아래 연결을 쓰지 않고 기존 동작 그대로다.

| 자리 | 연결 |
|---|---|
| `/login`(`session-login-panel.tsx`) | 새 로그인을 받을 때만(복원 확인 중·로그인 확인 뒤가 아닐 때) `GoogleLoginButton`에 `authRuntime().google.startGoogleLogin`을 넘긴다 |
| `/google/callback`(`src/app/(guest)/google/callback/page.tsx`) | `session-google-callback.tsx`가 `GoogleCallbackScreen`에 `readGoogleCallback`·`completeGoogleLogin`·`lookupMemberWithAuth(api.member)`를 넘긴다. 전환을 끄면 `notFound()`(404) |
| 회원 셸(`session-member-shell.tsx`) | `useMemberLogout`(`useAuth()`·`session.logout()`)과 헤더 `logoutPending`, 헤더 아래 `LogoutStatus`, 가드의 `renderReauthNotice`에 `ReauthNotice` |
| 이동 전 확인 | 로그아웃·재인증 [다시 로그인]은 누른 시점에 #286 등록 수단(`unsavedChanges`)의 `activeReasons()`를 읽는다. 미저장 입력은 `useUnsavedChanges(dirty)`(사유 생략 = `unsaved-input`)로 등록되며, 최초 입력·프로필 수정은 #286에서 기존 `dirty`를 함께 등록했다. 미확정 분석 요청은 내 자산(`/assets`)의 저장소 연결 관리가 결과를 확인하지 못한 요청을 `unconfirmed-analysis-request`로 등록한다([PR #417](https://github.com/JminAILab/CatchU/pull/417), [저장소 연결 관리 「표시 규칙」](../repository-management/README.md#표시-규칙)). 등록은 전환과 상관없이 하지만 꺼짐 화면은 이 사유를 읽지 않는다. 등록한 화면이 없으면 묻지 않는다 |
| 모달 안 재인증 안내 | 모달(`showModal()`)이 열리면 바깥 [다시 로그인]에 닿을 수 없으므로, 모달 안에 `ModalReauthNotice`를 그린다. 확인·이동은 바깥 안내와 같고, 모달 차단은 풀지 않는다(모달이 열린 동안 헤더 [로그아웃]에는 닿지 않는다). 그리는 곳: 내 자산의 분석 요청 모달 머리말 아래(PR #417, 같은 「표시 규칙」), Catch 상세 머리말 안 둘째 줄(#467). Catch 상세 머리말은 스크롤해도 위에 붙으므로 안내를 그 안에 두고, 초점이 가리지 않게 두는 위쪽 여백을 머리말 전체 높이로 잡는다(`data-reauth-sticky-container`). 모달이 안내를 그리는 동안 바깥 안내는 숨긴다 |

- 확인 사유 등록은 #286 공통 수단(`unsavedChanges`·`useUnsavedChanges`)만 쓰고 이 화면에서 새로 만들지 않는다. 화면 안의 링크 이동·새로고침·창 닫기 확인(`useUnsavedGuard`, [PR #300](https://github.com/JminAILab/CatchU/pull/300))은 역할이 달라 그대로 둔다.

## 남은 일

1. 실제 Google 승인·콜백·쿠키·다중 탭 검증은 #286이 수행해 #251에 기록하고, 그 결과에서 나온 화면 보완은 #287에서 한다.
2. 제품 전환은 각 화면 담당 확인·통합 검증 뒤 별도 승인으로 정한다(#286).
3. 미확정 분석 요청 등록과 모달 안 [다시 로그인]은 [PR #417](https://github.com/JminAILab/CatchU/pull/417)로 연결됐다(「연결」). 그 PR에서 확인 창을 대역 함수로 둔 브라우저 검사로 취소 시 입력·요청 정보 보존, 계속 동작, 모달 초점 복귀, 중복 조작을 확인했다([사유 조회 접점](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6313395220)의 후속 확인). 남은 것은 브라우저 기본 확인 창의 실제 표시·선택과 실제 Google 로그인을 합친 통합 검증이며, #286에서 이어진다.

## 검사

- `test/auth-screens-google.test.mjs`·`test/auth-screens-session.test.mjs`: 화면 제어를 함수 대역으로 확인한다. 이동 전 확인은 사유 조합(없음·입력만·분석 요청만·둘 다)과 누를 때마다 다시 읽는지를 본다. [다시 로그인]은 계속한 뒤 다시 눌러도 묻거나 이동하지 않는지와 머무른 뒤 다시 묻는지를 제어와 `ReauthNotice` 양쪽에서 본다. `ReauthNotice`는 서버 렌더링으로 그린 버튼의 클릭 함수를 연달아 부른다. 안내 문구는 #251 기록의 합의 문구와 글자까지 같은지, 시작·콜백 화면별 선택과 확인 창의 줄 순서를 본다.
- `test/auth-screens-connected.test.mjs`: 화면 제어에 #286 공통 함수(시도 보관·콜백 해석·완료, 세션·보호 API, 가드 판정)를 연결 코드와 같은 방식으로 붙이고, 서버와 `sessionStorage`·`localStorage`만 대역으로 바꿔 확인한다. query가 지워진 주소를 탭 복제·새로고침으로 다시 연 콜백도 여기서 본다.
- `test/modal-reauth-notice.test.mjs`: `ModalReauthNotice`가 전환을 끄면 공통 인증 상태를 읽지 않고 그리지 않는지, 켜면 재인증 필요일 때만 지금 회원 화면 주소를 돌아올 곳으로 넘겨 그리는지 대역으로 본다. Catch 상세의 안내 자리(머리말 안·닫기 다음)는 `test/assets-view.test.mjs`가 본다.
- 실제 브라우저 조작(확인 창·초점·화면 이동)과 `ReauthNotice` 밖의 React 렌더링은 이 시험에 들지 않는다.
