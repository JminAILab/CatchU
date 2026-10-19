# 로그인·인증 화면 — #287

Google 로그인 버튼, Google 콜백 화면, 재인증 안내, 회원 셸의 로그아웃 진행·실패·불명 표시를 다룬다.
상위 작업은 [#251](https://github.com/JminAILab/CatchU/issues/251)이고, 공통 인증은 [#286](https://github.com/JminAILab/CatchU/issues/286)이 맡는다.

## 현재 상태: 화면 준비, 제품 경로 미연결

- 공통 인증(#286, [PR #308](https://github.com/JminAILab/CatchU/pull/308))이 아직 `dev`에 없다. 그래서 화면은 #286의 함수를 props로 받는 컴포넌트와 화면 제어 로직까지만 있고, 어느 페이지에서도 쓰지 않는다.
- `/google/callback` 페이지와 로그인 화면의 Google 버튼은 아직 없다. 제품의 로그인·로그아웃은 기존 #106 동작 그대로다.
- 이 상태의 검사는 함수 대역 시험이다. 실제 Google·API·쿠키·브라우저·다중 탭 검증은 하지 않았다.

## 담당 경계

| 맡는 곳 | 내용 |
|---|---|
| #286 공통 인증 | 인증 상태·세대·잠금·로그인 표식, 갱신·복원·로그아웃 요청, Google 시작 API·시도 보관·콜백 해석·완료 요청, 가드의 인증 판정·입력 정리·로그아웃 뒤 이동, 다른 탭 로그아웃 판정, 통합 브라우저 검증 |
| #287 이 화면 | Google 버튼·이동, 콜백 화면(해석 결과 보존·query 제거 포함)과 안내, 재인증 안내 컴포넌트, 로그아웃의 미저장 확인·진행·실패·불명 표시, 화면 대역 시험 |
| 각 화면 담당 | 내 자산·공유 링크·최초 입력에서 어떤 입력을 미저장으로 볼지와 공통 인증 결과를 받는 방식 |

근거: [#287 연결 안내](https://github.com/JminAILab/CatchU/issues/287#issuecomment-6187890290), [1~9번 답변](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6139957700), [A 답변](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6187946262), [팀장 답변](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6206414443).

## 파일

화면이 받는 값의 타입은 #286의 `auth-google.ts`·`auth-state.ts`·`auth-logout.ts`·`auth-gate.ts`·`member-lookup.ts`를 그대로 쓴다. 화면 쪽에 같은 모양의 타입을 따로 두지 않는다.

| 파일 | 내용 |
|---|---|
| `src/lib/auth-screen-messages.ts` | 안내 문구와 결과별 선택. [합의]·[제안] 표시 |
| `src/lib/google-login-screen.ts` | Google 버튼(`createGoogleStartControl`)·콜백 화면(`createGoogleCallbackControl`)의 진행 |
| `src/lib/member-session-screen.ts` | 로그아웃 요청·표시(`createMemberLogoutControl`·`logoutView`), 재인증 [다시 로그인] 판단 |
| `src/lib/unsaved-changes.ts` | 미저장 입력 등록과 확인. 로그아웃과 재인증이 같은 수단을 쓴다 |
| `src/components/auth/google-login-button.tsx` | Google 버튼 |
| `src/components/auth/google-callback-screen.tsx` | 콜백 화면 |
| `src/components/auth/reauth-notice.tsx` | 재인증 안내(가드의 `renderReauthNotice` 자리) |
| `src/components/auth/member-logout.tsx` | 셸의 `useMemberLogout`·`LogoutStatus` |
| `src/components/auth/use-unsaved-changes.ts` | 화면이 미저장 입력을 알리는 hook |
| `src/components/header/` | `logoutPending`을 주면 [로그아웃]을 막고 "로그아웃하는 중"을 보인다. 주지 않으면 기존과 같다 |

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

**재인증 안내**
- 가드가 회원 화면 위에 그린다. 안내 중에도 아래 화면·입력은 유지된다.
- [다시 로그인]은 로그아웃·갱신 요청 없이 `/login?next=<현재 경로>`로 간다.
- 일반 재인증: 미저장 입력이 있으면 로그아웃과 같은 확인을 거친다. 머무르면 아무것도 하지 않는다.
- 로그인 표식 변경 뒤 #286이 화면·입력을 이미 정리한 탭(`inputCleared`): 같은 문구에 [다시 로그인]만 두고 묻지 않는다. 자동 복원·로그아웃 재전송은 하지 않는다(팀장 답변 2). 정리 여부는 #286이 정해 넘긴다.

**로그아웃**
- 미저장 확인 → `logout()`. 머무르면 요청·이동이 없다.
- 이 화면의 요청이나 공통 상태가 진행 중이면 다시 묻거나 보내지 않는다.
- `done`이어도 셸은 이동하지 않는다. 현재 유효한 완료일 때 입력 정리·비로그인 홈 이동은 가드가 한다. 다른 탭의 유효한 완료도 가드가 처리한다.
- `failed`·`unknown`은 완료로 표시하지 않고 화면·입력을 유지한 채 안내한다. [다시 시도]는 `canRetryLogout`일 때만 보인다.
- 이전 결과는 그사이 새 로그인이 시작됐거나 인증 세대가 바뀌었거나 다른 로그아웃이 진행 중이면 보이지 않는다. 다른 탭의 실패·불명으로는 안내하지 않는다.
- `not-started`·`discarded`는 안내 없이 진행 표시만 지운다.

## 안내 문구

[합의]는 #251에서 양쪽이 확인한 문구, [제안]은 연결 전에 #251에서 정할 문구다. 안내의 종류는 합의됐다.

| 상황 | 문구 | 구분 |
|---|---|---|
| 로그아웃 결과 불명(다시 시도 가능) | 로그아웃이 완료됐는지 확인하지 못했습니다. 다시 시도해 주세요. | [합의] 5번 |
| 로그아웃 결과 불명(다시 시도 불가) | 로그아웃이 완료됐는지 확인하지 못했습니다. | [합의] 5번(다시 시도 안내 제외) |
| Google 사용 불가(`unavailable`, 시도 보관 실패 포함) | 지금은 Google 로그인을 사용할 수 없습니다. | [합의] A 답변 2 |
| Google 취소 | Google 로그인을 취소했습니다. | [제안] 12번 초안 |
| 로그인 실패(`network` 외, 해석 오류 포함) | 로그인하지 못했습니다. 다시 시도해 주세요. | [제안] 12번 초안 |
| 네트워크(`network`) | 네트워크 연결을 확인한 뒤 다시 로그인해 주세요. | [제안] 12번 초안 |
| 재인증·표식 변경 뒤 정리된 탭 | 로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요. | [제안] 12번 초안 |
| 로그아웃 실패 | 로그아웃하지 못했습니다. 다시 시도해 주세요. / 다시 시도 불가: 로그아웃하지 못했습니다. | [제안] 12번 초안 |
| 다시 열린 콜백(`already-sent`) | 이 로그인의 결과를 확인할 수 없습니다. 다시 로그인해 주세요. | [제안] |
| 시도 없음·만료 | 로그인 시간이 지났거나 로그인 정보를 찾을 수 없습니다. 다시 로그인해 주세요. | [제안] |
| 다른 시도의 콜백(`state-mismatch`) | 다른 로그인 요청의 결과입니다. 다시 로그인해 주세요. | [제안] |
| 완료 대기·버튼 진행·로그아웃 진행 | Google 로그인을 확인하고 있습니다. / Google로 이동하는 중 / 로그아웃하는 중 | [제안] |
| 로그아웃 전 미저장 확인 | 저장하지 않은 입력이 있습니다. 로그아웃하면 입력한 내용이 사라집니다. 로그아웃하시겠습니까? | [제안] |
| 재인증 전 미저장 확인 | 다시 로그인하면 입력하던 내용이 사라질 수 있습니다. 로그인 화면으로 이동하시겠습니까? | [제안] 11번 초안 |

12번·11번 초안: [#251 착수 전 접점](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6162564432).

## 남은 연결 작업(#286 병합 뒤)

1. 통합 시험 전환(`NEXT_PUBLIC_AUTH_SESSION_INTEGRATION=true`) 아래에서만 연결한다. 전환을 끈 기본 빌드는 기존 동작 그대로여야 한다.
   - 공통 인증판 로그인 화면에 `GoogleLoginButton`(`authRuntime().google.startGoogleLogin`).
   - `/google/callback` 페이지에 `GoogleCallbackScreen`(`readGoogleCallback`·`completeGoogleLogin`·공통 인증판 회원 조회). 전환을 끄면 이 주소는 열지 않는다.
   - 공통 인증판 가드의 `renderReauthNotice`에 `ReauthNotice`. 표식 변경 뒤 정리된 탭의 표시와 `inputCleared` 전달은 #286이 팀장 답변 2를 반영할 때 정한다.
   - 공통 인증판 셸에 `useMemberLogout`(`useAuth()`·`session.logout()`)·`LogoutStatus`와 헤더 `logoutPending`.
2. 각 화면 담당이 작성 중 입력을 `useUnsavedChanges`로 알린다. 등록한 화면이 없으면 미저장 확인은 묻지 않는다.
3. [제안] 문구를 #251에서 정한다.
4. 실제 Google 승인·콜백·쿠키·다중 탭 검증은 #286이 수행해 #251에 기록하고, 그 결과에서 나온 화면 보완은 #287에서 한다.

## 검사

`npm test`의 `test/auth-screens-google.test.mjs`·`test/auth-screens-session.test.mjs`가 위 동작을 함수 대역으로 확인한다.
#286 함수·응답 대역과 합친 검사는 연결 단계에서 추가한다. React 렌더링과 실제 브라우저 조작은 이 시험에 들지 않는다.
