/**
 * 공통 인증 상태(#286). 이 탭의 인증 상태·인증 세대·세션 갱신 순번·로그아웃 진행과 결과를 한 곳에서 관리한다.
 *
 * 합의와 결정
 * - 상태 4종(`restoring`·`signed-in`·`signed-out`·`reauth-required`)과 로그아웃 결과 3종(`done`·`failed`·`unknown`)은
 *   #251 연결 합의다(api/docs/auth-sessions.md 「서버 리뷰와 화면 연결의 경계」). 필드 이름은 #286 제안이며 #287과 맞춘다.
 * - 로그아웃 확인 중에는 갱신·보호 동작을 보류하고, `unknown`을 인증 유효로 확정하지 않는다(같은 합의).
 *   `unknown`의 다시 시도는 새 로그인이 시작되지 않았을 때만 허용한다.
 * - 새로고침 뒤 세션 확인이 끝나기 전에는 로그인 화면으로 보내지 않는다(#251 「로그인 유지」). 그래서 세션 복원은
 *   "세션 없음이 확인됨"일 때만 비로그인으로 확정하고, 확인하지 못한 실패는 복원 중에 머문다.
 * - 갱신 응답 유실 시 이전 Refresh를 다시 보내지 않는다(#251 「재인증」). 갱신 500은 탭 간 잠금 안에서 한 번만 다시 보낸다(T2).
 *   그래서 서버가 Refresh를 쓰지 않았음이 확인된 실패만 다시 확인할 수 있고, 결과를 알 수 없는 실패 뒤에는 이 페이지에서 갱신·복원을
 *   다시 보내지 않는다. 낡은 표라 결과를 반영하지 않은 경우에도 같은 세션이면 이 차단은 남긴다. 새 로그인 성공으로만 풀린다.
 *   새로고침 뒤에는 저장 표식 없이 Refresh 쿠키로 복원한다([팀장 결정 1](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6206414443)).
 *   갱신·복원 응답을 기다리는 중의 새로고침·탭 종료로 세션을 다시 쓸 수 없게 되는 경우는 "갱신 응답 유실 뒤 재인증" 한계에 든다.
 *   이 파일은 페이지 메모리 범위만 다룬다.
 *
 * 새 로그인 시작
 * - `loginStarted()`부터 `signedIn()` 또는 그 시도의 `loginAttemptEnded()`까지는 새 로그인 시도 중이다. 이 동안 갱신·복원을 새로 시작하지 않고,
 *   그 전에 시작한 갱신은 아직 보내지 않았으면 보내지 않으며(잠금 대기·500 재시도 전), 이미 보낸 요청의 결과는 반영하지 않는다.
 * - 시도는 `loginStarted()`가 돌려준 값으로 구분한다. 진행 중인 시도는 가장 최근에 시작한 하나뿐이다. 이전 시도·이미 끝난 시도·이미 성공한
 *   시도의 성공(`signedIn`)·취소·실패(`loginAttemptEnded`) 알림은 무시하고 어떤 상태도 바꾸지 않는다. 로그인 시작은 인증 세대를 바꾸지 않는다.
 *
 * 연결 기준(로그인 시도 값)
 * - 실제 로그인 시도의 결과는 반드시 시도 값을 넘긴다. 개발 로그인은 요청 직전 `loginStarted()`의 값을 보관해 응답의 `signedIn(token, attempt)`·
 *   실패의 `loginAttemptEnded(attempt)`에 넘긴다. Google 로그인은 이동하면 페이지 메모리가 사라지므로, 콜백 화면이 완료 요청 직전에
 *   그 페이지에서 `loginStarted()`를 부르고 같은 값으로 결과를 알린다.
 * - 시도 값 없는 `signedIn(token)`은 기존 호출(1단계 시험·연결 전 코드)과의 호환용이다. 늦게 온 응답을 거르지 못하므로
 *   새로 연결하는 로그인 결과에는 쓰지 않는다.
 * - 결과를 반영하지 않는 것은 이 탭의 상태만 지킨다. 이미 보낸 갱신의 응답 쿠키는 브라우저가 그대로 저장하므로, 새 로그인 응답보다
 *   늦게 도착하면 쿠키가 이전 세션 것으로 덮인다. 이 쿠키 경쟁은 로그인 완료 요청을 갱신과 같은 잠금 안에서 보내는 쪽(auth-refresh.ts
 *   `withSessionLock`)에서 막는다.
 *
 * 세대와 요청 순번
 * - 인증 세대는 로그인 성공(세션 복원 포함)·로그아웃 완료로 비로그인 확정·세션 없음 확정 때만 올라간다.
 *   같은 세션의 Access 갱신과 재인증 필요는 세대를 바꾸지 않아 화면·입력을 유지할 수 있다.
 * - 같은 세대 안에서도 갱신과 로그아웃은 여러 번 일어날 수 있다. 그래서 요청을 시작할 때 받은 표(세대 + 순번)로 결과를 반영하고,
 *   더 나중에 시작한 요청이 있으면 이전 요청의 결과를 버린다.
 *
 * 책임 경계
 * - 이 파일은 상태 전이와 판정만 맡는다. 갱신 호출·500의 1회 재시도·응답을 실패 원인(`RefreshFailure`)으로 나누는 일은
 *   `auth-refresh.ts`, 로그아웃 호출과 응답을 결과(`LogoutResult`)로 나누는 일은 `auth-logout.ts`가 맡는다.
 *   탭 사이 순서 제어(Web Locks)는 `auth-session.ts`, 로그인 표식 비교(localStorage, T3)는 `auth-login-marker.ts`가 맡고,
 *   표식이 다르거나 읽을 수 없다는 판정은 `invalidateByLoginMarker()`로 이 파일에 알린다.
 * - 공통 요청 함수는 화면의 버튼 상태와 관계없이 보내기 전에 다시 판정한다.
 *   갱신·복원은 `refreshStarted()`, 로그아웃은 `logoutStarted()`가 null이면 보내지 않는다.
 *   보호 API는 `sessionHold`가 null이고 `status`가 `signed-in`이며 `accessToken()`이 있을 때만 보낸다.
 *   `sessionHold`가 null이라는 것은 "로그아웃 때문에 보류되지는 않는다"는 뜻일 뿐, 인증된 요청을 보내도 된다는 뜻이 아니다.
 * - 화면의 `canRetryLogout`·`canCleanUpAfterLogout`은 표시·화면 정리 판단용이다. 호출 허용은 위 함수가 다시 판정한다.
 * - Access 토큰은 메모리에만 둔다. 화면용 스냅샷에는 토큰을 넣지 않으므로 Access 갱신만으로 화면이 다시 그려지지 않는다.
 */
export type AuthStatus = "restoring" | "signed-in" | "signed-out" | "reauth-required";
/** 탭 안에서만 의미가 있는 번호. 다른 탭과 비교하지 않는다. */
export type AuthGeneration = number;
export type LogoutResult = "done" | "failed" | "unknown";
/** `loginStartedAfter`: 이 로그아웃을 시작한 뒤 새 로그인이 시작됐는지. 진행 중에 시작돼도 기록한다. */
export type LogoutState =
  | { phase: "idle" }
  | { phase: "pending"; fromGeneration: AuthGeneration; loginStartedAfter: boolean }
  | { phase: "settled"; result: LogoutResult; fromGeneration: AuthGeneration; loginStartedAfter: boolean };
/**
 * 로그아웃 때문에 세션을 쓰는 요청(보호 API·갱신)을 보내지 않아야 하는 이유.
 * null은 "로그아웃 때문에 보류되지는 않음"일 뿐이며, 실제 호출 가능 여부는 `status`와 `accessToken()`으로 따로 확인한다.
 */
export type SessionHold = "logout-pending" | "logout-unknown" | null;
/**
 * 갱신·복원 실패의 원인. 공통 요청 함수가 응답을 보고 정한다(api/docs/auth-sessions.md 「API 연결안」).
 * - `session-ended`: 세션이 없거나 끝났음이 확인됨(401 `AUTH_INVALID`).
 * - `not-consumed`: 서버가 Refresh를 쓰지 않고 거부했음이 확인됨(403 `AUTH_ORIGIN_FORBIDDEN`, 400 `VALIDATION_FAILED`).
 *   쿠키가 그대로이므로 사용자가 다시 확인할 수 있다.
 * - `outcome-unknown`: 서버가 Refresh를 썼는지 알 수 없음(응답 없음·응답 유실, 500을 한 번 다시 보낸 뒤에도 실패,
 *   형식이 잘못된 성공 응답). 이전 Refresh를 다시 보내지 않는다.
 */
export type RefreshFailure = "session-ended" | "not-consumed" | "outcome-unknown";

/** useSyncExternalStore용 스냅샷. 값이 바뀔 때만 새 객체다. 토큰은 담지 않는다. */
export type AuthSnapshot = {
  status: AuthStatus;
  generation: AuthGeneration;
  logout: LogoutState;
  sessionHold: SessionHold;
  /**
   * 새로고침 뒤 세션 복원을 확인하지 못했는지(`restoring`에서만 true). 비로그인으로 확정한 것이 아니므로 자동으로 로그인 화면으로 보내지 않고,
   * 화면은 "로그인 상태를 확인하지 못했습니다"를 보여 준다. 다시 확인을 시작하면 false로 돌아간다.
   */
  restoreUnconfirmed: boolean;
  /**
   * 복원 확인 실패 뒤 [다시 확인]을 보여 줄지(표시용). 서버가 Refresh를 쓰지 않았음이 확인된 실패(`not-consumed`)일 때만 true다.
   * 결과를 알 수 없는 실패(`outcome-unknown`) 뒤에는 false이며 화면은 새 로그인만 안내한다. 실제 허용은 refreshStarted()가 다시 판정한다.
   */
  canRetryRestore: boolean;
  /** 실패·결과 불명인 로그아웃의 [다시 시도]를 보여 줄지(표시용). 실제 허용은 logoutStarted()가 다시 판정한다. */
  canRetryLogout: boolean;
  /**
   * 로그아웃 완료로 화면이 미저장 입력을 정리하고 비로그인 홈으로 가도 되는지.
   * `done`이고 그사이 새 로그인이 시작되지 않았을 때만 true다. 화면은 자기가 열릴 때의 세대가 `logout.fromGeneration`과 같은지도 확인한다.
   */
  canCleanUpAfterLogout: boolean;
  /**
   * 로그인 표식 변경을 감지했지만 이 탭에서 복원할 수 없어 새 로그인만 받는지([팀장 결정 2](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6206414443)).
   * 응답 유실 뒤 재전송 차단·로그아웃 보류가 있거나, 감지 뒤 한 번 복원한 다음에도 표식 오류가 이어질 때 true다.
   * 이때 회원 화면·입력을 정리하고 재인증 안내와 같은 문구에 [다시 로그인]만 둔다. 로그아웃·갱신 요청과 자동 복원은 하지 않는다.
   * 이 탭의 로그인 성공으로만 풀린다.
   */
  reloginOnly: boolean;
};

/** 로그인 표식 변경 감지의 처리 결과(`invalidateByLoginMarker`). `null`은 이미 처리돼 바꾼 것이 없음. */
export type LoginChangeHandling = "restore" | "relogin-only" | "recorded" | null;

/** 요청을 시작할 때 받는 표. 결과를 반영할 때 그대로 돌려준다. */
export type RequestTicket = { readonly generation: AuthGeneration; readonly sequence: number };
/** 새 로그인 시도 식별값. `loginStarted()`가 돌려주며, 그 시도의 종료·성공을 알릴 때 그대로 넘긴다. 탭 안에서만 의미가 있다. */
export type LoginAttempt = { readonly loginAttempt: number };

export type AuthStore = {
  getSnapshot(): AuthSnapshot;
  subscribe(listener: () => void): () => void;
  /** 현재 Access. 호출 함수만 쓰고 화면에는 내보내지 않는다. `signed-in`이 아니면 null이다. */
  accessToken(): string | null;
  /**
   * 개발·Google 로그인 성공. 세대를 올리고, 진행 중이던 이전 로그아웃과 갱신의 결과는 이후 반영되지 않는다. 새 세대를 돌려준다.
   * `attempt`를 주면 그 시도가 지금 진행 중인 시도일 때만 반영한다. 이전·종료·이미 성공한 시도면 토큰·세대·로그아웃·재전송 차단 등
   * 아무것도 바꾸지 않고 null을 돌려준다. 생략은 호환용이며 진행 중인 시도와 관계없이 반영한다(연결 기준은 파일 머리말).
   */
  signedIn(token: string, attempt?: LoginAttempt): AuthGeneration | null;
  /**
   * 새 로그인 시작(버튼·이동 직전). 세대는 바꾸지 않는다. 진행 중이거나 끝난 로그아웃에 기록해 그 결과가 새 로그인 흐름을 정리하지 않게 한다.
   * 이전에 시작한 갱신의 표를 낡은 것으로 만들고, 시도가 끝날 때까지 갱신·복원을 시작하지 않는다.
   */
  loginStarted(): LoginAttempt;
  /**
   * 새 로그인 시도가 성공 없이 끝남(취소·실패·Google 이동 전 중단). `attempt`가 가장 최근 시도일 때만 갱신·복원을 다시 시작할 수 있게 하고
   * true를 돌려준다. 이전 시도의 알림이면 아무것도 바꾸지 않고 false다. 세대·화면은 바꾸지 않는다.
   */
  loginAttemptEnded(attempt: LoginAttempt): boolean;
  /**
   * 이 시도가 지금 진행 중인 시도인지(가장 최근에 시작했고 아직 성공·종료되지 않음). 상태를 바꾸지 않는다.
   * 로그인 완료 요청을 잠금 안에서 보내기 직전에 확인한다(#286 5단계). 이전·종료·이미 성공한 시도의 요청은 보내지 않는다.
   */
  loginAttemptCurrent(attempt: LoginAttempt): boolean;
  /**
   * 세션 복원(`restoring`)·갱신(`signed-in`) 요청 시작. 그 밖의 상태, 로그아웃 보류 중, 결과를 알 수 없는 복원 실패 뒤에는
   * null이며 요청을 보내지 않는다. 500의 1회 재시도는 이 표 하나로 공통 요청 함수 안에서 끝낸다.
   */
  refreshStarted(): RequestTicket | null;
  /**
   * 이 표의 갱신을 지금 보내거나 결과를 반영해도 되는지(같은 세대·가장 최근 갱신·로그아웃 보류 없음·복원 또는 로그인 상태).
   * 공통 요청 함수가 잠금을 얻은 뒤, 500 재시도 전에 다시 확인한다. 상태를 바꾸지 않는다.
   */
  refreshCurrent(ticket: RequestTicket): boolean;
  /** 갱신 성공. 복원 중이면 로그인으로 바꾸고 세대를 올린다. 로그인 중이면 토큰만 바꾼다. 가장 최근 갱신의 표일 때만 반영한다. */
  refreshSucceeded(token: string, ticket: RequestTicket): boolean;
  /**
   * 갱신 실패(500 재시도는 공통 요청 함수가 끝낸 뒤). 가장 최근 갱신의 표일 때만 반영한다.
   * - 복원 중 `session-ended`: 비로그인 확정(세대 증가).
   * - 복원 중 `not-consumed`: 복원 중에 머물고 `restoreUnconfirmed`를 켠다. 다시 확인할 수 있다.
   * - 복원 중 `outcome-unknown`: 복원 중에 머물고 `restoreUnconfirmed`를 켠다. 이전 Refresh를 다시 보내지 않도록 이후 복원을 막는다.
   *   비로그인으로 확정하지 않으며, 새 로그인(`signedIn`)으로만 벗어난다.
   * - 로그인 중: 원인과 관계없이 재인증 필요(세대 유지, 화면·입력 유지). 재인증 중에는 갱신을 시작하지 않는다.
   *   갱신 응답 유실 뒤 재인증은 #251의 수용한 한계다.
   */
  refreshFailed(ticket: RequestTicket, cause: RefreshFailure): boolean;
  /**
   * 로그아웃 요청 시작. 보낼 수 없으면 null이며 요청을 보내지 않는다(화면 상태와 관계없이 여기서 다시 판정).
   * 현재 세대에 끝난 로그아웃이 있으면 `canRetryLogout`과 같은 조건(실패·불명이고 새 로그인 미시작)일 때만 다시 보낸다.
   * 새 로그인이 시작된 뒤에는 결과가 `done`이어도 이전 세대의 로그아웃을 다시 보내지 않는다. 새 로그인이 성공해 세대가 바뀌면 새로 시작할 수 있다.
   */
  logoutStarted(): RequestTicket | null;
  /**
   * 로그인 표식이 다르거나 사라졌거나 읽을 수 없음(T3: 새 로그인으로 처리). [팀장 결정 2](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6206414443)를 따른다.
   * 로그인·재인증 필요 상태면 먼저 이전 세대를 끊는다(세대 증가, 토큰·진행 중인 갱신·로그아웃 결과 폐기). 그다음 둘 중 하나다.
   * - `restore`: 재전송 차단·로그아웃 보류·진행 중인 이 탭의 로그인 시도가 없고, 감지 뒤 복원을 아직 쓰지 않았으면 복원 중으로 바꾼다.
   *   회원 화면·입력은 정리되고(범위 번호 없음), 호출한 쪽이 지금 쿠키로 복원을 한 번 보낸다. 복원이 성공하고 표식이 같다고
   *   다시 확인되면(`loginMarkerConfirmed`) 다음 감지에서 다시 복원할 수 있다.
   * - `relogin-only`: 위 조건이 아니면(재전송 차단·로그아웃 보류가 있거나, 감지 뒤 복원 다음에도 표식 오류가 이어짐) `reloginOnly`를 켠다.
   *   회원 화면·입력은 정리되고 [다시 로그인]만 남는다. 재전송 차단은 해제하지 않고 로그아웃 보류는 새 세대로 넘긴다.
   *   이 탭에서는 갱신·복원·로그아웃을 시작하지 않고 토큰이 없어 보호 API도 보내지 않는다. 이 탭의 로그인 성공(`signedIn`)으로만 풀린다.
   * - `recorded`: 복원 중·비로그인은 무효화할 세션이 없어 기록만 한다. 복원 중이면 이 탭은 이제 복원을 시작할 수 없으므로
   *   「확인하지 못함」(`restoreUnconfirmed`, 다시 확인 없음)으로 바꿔 로그인 진입을 연다. 결과를 모르는 로그인을 지금 쿠키의
   *   복원으로 성공 처리하지 않기 위해서다(#251 A 합의 1, 결정 3: 결과를 모르면 [다시 확인] 없이 [다시 로그인]만).
   * - `null`: 이미 `relogin-only`·`recorded`로 기록돼 있으면 아무것도 바꾸지 않는다(한 번만 처리).
   * `allowRestore: false`면 복원 조건이어도 `relogin-only`로 처리한다(이 탭이 반영하지 않은 로그인으로 쿠키가 바뀐 경우, `loginNotAdopted`).
   * 이 탭의 로그인 시도(`loginStarted()`)는 그대로 둔다.
   */
  invalidateByLoginMarker(options?: { allowRestore?: boolean }): LoginChangeHandling;
  /** 감지 뒤 복원 다음에 표식이 이 탭의 것과 같다고 확인됨. 다음 감지에서 다시 한 번 복원할 수 있게 한다. */
  loginMarkerConfirmed(): void;
  /** 로그인 표식 변경을 감지해 새 로그인만 받는 중인지(`relogin-only`·`recorded`). 이 동안 갱신·복원·로그아웃을 시작하지 않는다. */
  loginChangeDetected(): boolean;
  /**
   * 이 표의 로그아웃을 지금 보내도 되는지(진행 중인 바로 그 로그아웃이고 같은 세대). 공통 요청 함수가 잠금을 얻은 뒤 보내기 직전에 확인한다.
   * 새 로그인이 성공해 세대가 바뀌었거나 결과가 이미 반영됐으면 false다. 상태를 바꾸지 않는다.
   */
  logoutCurrent(ticket: RequestTicket): boolean;
  /**
   * 로그아웃 결과 반영. 진행 중인 바로 그 요청의 표일 때만 반영한다.
   * - `done`이면 이전 세션은 끝났으므로 항상 토큰을 버리고 갱신·보호 호출에 쓰지 않는다.
   *   그사이 새 로그인이 시작되지 않았으면 비로그인으로 확정한다(세대 증가, 화면 정리 허용).
   *   새 로그인이 시작됐으면 비로그인으로 바꾸지 않고 재인증 필요로 둔다(세대 유지). 회원 화면은 이동·정리 없이 입력을 유지하고,
   *   진행 중인 새 로그인이 성공하면 `signedIn()`이 세대를 올린다.
   * - `failed`·`unknown`은 로그아웃 완료로 보지 않는다. 상태와 화면·입력은 그대로 두며 `unknown`이면 보류가 이어진다.
   */
  logoutSettled(result: LogoutResult, ticket: RequestTicket): boolean;
  /**
   * 같은 브라우저의 다른 탭이 이 탭과 같은 로그인의 로그아웃을 `done`으로 끝냈다(#251 접점 4, 판정은 auth-session.ts).
   * 이 탭이 그 로그인을 그대로 쓰고 있을 때만 반영해 true를 돌려준다. 그 밖에는 아무것도 바꾸지 않고 false다.
   * - 반영 조건: 로그인·재인증 필요 상태, 로그인 변경 감지 없음, 이 탭의 새 로그인 시도 없음, 이 탭의 로그아웃 진행 중 아님.
   *   새 로그인 시작·회원 전환 뒤의 이전 결과와 `failed`·`unknown`은 여기로 오지 않는다(합의: 유효한 완료만 반영).
   * - 반영: 이 탭의 로그아웃 `done`과 같다. 토큰을 버리고 비로그인으로 확정하며(세대 증가), 화면 정리를 허용한다
   *   (`canCleanUpAfterLogout`, `logout.fromGeneration`은 반영 직전 세대).
   */
  logoutDoneElsewhere(): boolean;
};

const IDLE: LogoutState = { phase: "idle" };

/** 서버 렌더링 스냅샷. 서버에서는 세션을 알 수 없으므로 복원 확인 중으로 둔다. */
export const SERVER_AUTH_SNAPSHOT: AuthSnapshot = {
  status: "restoring", generation: 0, logout: IDLE, sessionHold: null, restoreUnconfirmed: false, canRetryRestore: false,
  canRetryLogout: false, canCleanUpAfterLogout: false, reloginOnly: false,
};

/** 이 세대의 실패·결과 불명 로그아웃을 다시 보낼 수 있는지. 새 로그인이 시작됐으면 이전 세션의 로그아웃을 다시 보내지 않는다. */
function logoutRetryable(logout: LogoutState, generation: AuthGeneration): boolean {
  return logout.phase === "settled" && logout.result !== "done" && logout.fromGeneration === generation
    && !logout.loginStartedAfter;
}

function holdOf(logout: LogoutState, generation: AuthGeneration): SessionHold {
  if (logout.phase === "pending") return "logout-pending";
  if (logout.phase === "settled" && logout.result === "unknown" && logout.fromGeneration === generation) return "logout-unknown";
  return null;
}

function nonEmpty(token: string) {
  if (typeof token !== "string" || token.length === 0) throw new TypeError("token must be a non-empty string");
}

type CoreState = Pick<AuthSnapshot, "status" | "generation" | "logout" | "restoreUnconfirmed" | "canRetryRestore" | "reloginOnly">;

export function createAuthStore(initialStatus: AuthStatus = "restoring"): AuthStore {
  let token: string | null = null;
  let snapshot: AuthSnapshot = { ...SERVER_AUTH_SNAPSHOT, status: initialStatus };
  let sequence = 0;
  let latestRefresh = 0;
  let pendingLogout = 0;
  /** 결과를 알 수 없는 갱신 뒤 이 페이지에서 이전 Refresh를 다시 보내지 않게 막는다. 새 로그인 성공으로만 풀린다. */
  let refreshBlocked = false;
  /** 가장 최근 로그인 시도 번호. 0이면 시도 중이 아니다(`loginStarted()` 이후 `signedIn()`·그 시도의 `loginAttemptEnded()` 전). */
  let currentLogin = 0;
  let loginSequence = 0;
  /** 표식 불일치로 세대를 바꿀 때 넘겨받은 로그아웃 보류. 이 탭의 새 로그인 성공으로만 풀린다. */
  let carriedHold: SessionHold = null;
  /** 로그인 표식 변경을 감지해 새 로그인만 받는 중인지(`relogin-only`·`recorded`). 이 동안 세션 쿠키를 쓰는 요청을 시작하지 않는다. */
  let loginChanged = false;
  /** 감지 뒤 복원을 이미 썼는지. 복원 뒤 표식이 같다고 확인되거나 이 탭의 로그인이 성공하면 풀린다(팀장 결정 2: 한 번만 복원). */
  let markerRestoreUsed = false;
  const isAttempt = (value: unknown): value is LoginAttempt =>
    typeof value === "object" && value !== null && Number.isSafeInteger((value as LoginAttempt).loginAttempt);
  const listeners = new Set<() => void>();

  /** 바뀐 값만 넘긴다. 상태·세대·로그아웃·복원 확인 여부가 모두 같으면 스냅샷과 알림을 그대로 둔다. */
  const publish = (change: Partial<CoreState>) => {
    const core: CoreState = {
      status: change.status ?? snapshot.status,
      generation: change.generation ?? snapshot.generation,
      logout: change.logout ?? snapshot.logout,
      restoreUnconfirmed: change.restoreUnconfirmed ?? snapshot.restoreUnconfirmed,
      canRetryRestore: change.canRetryRestore ?? snapshot.canRetryRestore,
      reloginOnly: change.reloginOnly ?? snapshot.reloginOnly,
    };
    // 복원 확인 실패 표시는 복원 중에만 의미가 있다.
    if (core.status !== "restoring") {
      core.restoreUnconfirmed = false;
      core.canRetryRestore = false;
    }
    if (core.status === snapshot.status && core.generation === snapshot.generation && core.logout === snapshot.logout
      && core.restoreUnconfirmed === snapshot.restoreUnconfirmed && core.canRetryRestore === snapshot.canRetryRestore
      && core.reloginOnly === snapshot.reloginOnly) return;
    snapshot = {
      ...core,
      sessionHold: holdOf(core.logout, core.generation) ?? carriedHold,
      canRetryLogout: logoutRetryable(core.logout, core.generation),
      canCleanUpAfterLogout: core.logout.phase === "settled" && core.logout.result === "done" && !core.logout.loginStartedAfter,
    };
    for (const listener of listeners) listener();
  };
  const ticket = (): RequestTicket => ({ generation: snapshot.generation, sequence: ++sequence });
  const markLoginStarted = (logout: LogoutState): LogoutState =>
    logout.phase === "idle" || logout.loginStartedAfter ? logout : { ...logout, loginStartedAfter: true };
  /** 갱신을 보내거나 결과를 반영해도 되는가: 같은 세대, 가장 최근 갱신, 새 로그인 시도 아님, 보류 없음, 복원·로그인 상태. */
  const currentRefresh = (t: RequestTicket) => t.generation === snapshot.generation && t.sequence === latestRefresh
    && currentLogin === 0 && !loginChanged && snapshot.sessionHold === null && (snapshot.status === "restoring" || snapshot.status === "signed-in");

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    accessToken: () => (snapshot.status === "signed-in" ? token : null),

    signedIn(nextToken, attempt) {
      nonEmpty(nextToken);
      if (attempt !== undefined) {
        if (!isAttempt(attempt)) throw new TypeError("attempt must come from loginStarted()");
        // 진행 중인 시도의 결과만 반영한다. 이전·종료·이미 성공한 시도의 늦은 성공은 어떤 상태도 바꾸지 않는다.
        if (currentLogin === 0 || attempt.loginAttempt !== currentLogin) return null;
      }
      token = nextToken;
      latestRefresh = 0; // 이전 세션의 갱신 결과는 버린다.
      pendingLogout = 0; // 이전 세션의 로그아웃 결과도 버린다.
      refreshBlocked = false;
      carriedHold = null;
      loginChanged = false;
      markerRestoreUsed = false;
      currentLogin = 0;
      // 진행 중이던 로그아웃은 새 세션의 보류 사유가 아니므로 비운다. 끝난 로그아웃에는 새 로그인이 시작됐음을 남긴다.
      const { logout } = snapshot;
      publish({ status: "signed-in", generation: snapshot.generation + 1, reloginOnly: false,
        logout: logout.phase === "pending" ? IDLE : markLoginStarted(logout) });
      return snapshot.generation;
    },

    invalidateByLoginMarker(options = {}) {
      if (loginChanged) return null;
      if (snapshot.status !== "signed-in" && snapshot.status !== "reauth-required") {
        loginChanged = true; // 복원 중·비로그인: 기록만 한다.
        // 복원 중인 탭은 이 기록 뒤로 복원을 시작하지 않는다(refreshStarted). 복원 대기로 남기지 않고 「확인하지 못함」으로 둔다.
        if (snapshot.status === "restoring") publish({ restoreUnconfirmed: true, canRetryRestore: false });
        return "recorded";
      }
      // 무효화: 이전 세대의 토큰·요청 표·로그아웃 결과 반영을 끊는다.
      token = null;
      latestRefresh = 0;
      pendingLogout = 0;
      const canRestore = options.allowRestore !== false && !refreshBlocked && snapshot.sessionHold === null
        && currentLogin === 0 && !markerRestoreUsed;
      if (canRestore) {
        // 차단·보류가 없는 탭: 화면·입력을 정리하고(복원 중은 범위 번호가 없다) 지금 쿠키로 한 번만 복원한다.
        markerRestoreUsed = true;
        publish({ status: "restoring", generation: snapshot.generation + 1, logout: IDLE });
        return "restore";
      }
      // 차단·보류가 있거나 복원 뒤에도 표식 오류가 이어짐: 화면·입력을 정리하고 [다시 로그인]만 둔다.
      // 재전송 차단(refreshBlocked)은 해제하지 않고, 로그아웃 보류는 새 세대로 넘긴다. 로그아웃·갱신은 보내지 않는다.
      loginChanged = true;
      if (snapshot.sessionHold !== null) carriedHold = "logout-unknown";
      publish({ generation: snapshot.generation + 1, logout: IDLE, reloginOnly: true });
      return "relogin-only";
    },

    loginMarkerConfirmed() {
      if (!loginChanged && snapshot.status === "signed-in") markerRestoreUsed = false;
    },

    loginChangeDetected: () => loginChanged,

    loginStarted() {
      currentLogin = ++loginSequence; // 세대는 바꾸지 않는다.
      latestRefresh = 0; // 이전에 시작한 갱신은 보내지 않고, 이미 보낸 요청의 결과는 반영하지 않는다.
      publish({ logout: markLoginStarted(snapshot.logout) });
      return { loginAttempt: currentLogin };
    },

    loginAttemptEnded(attempt) {
      if (!isAttempt(attempt)) throw new TypeError("attempt must come from loginStarted()");
      if (currentLogin === 0 || attempt.loginAttempt !== currentLogin) return false; // 이전 시도의 취소·실패는 무시한다.
      currentLogin = 0;
      // 시도 중 결과를 알 수 없게 된 복원은 다시 보내지 않으므로, 화면이 "확인하지 못함"을 보이게 한다.
      if (snapshot.status === "restoring" && refreshBlocked) publish({ restoreUnconfirmed: true, canRetryRestore: false });
      return true;
    },

    loginAttemptCurrent(attempt) {
      if (!isAttempt(attempt)) throw new TypeError("attempt must come from loginStarted()");
      return currentLogin !== 0 && attempt.loginAttempt === currentLogin;
    },

    refreshStarted() {
      if (snapshot.sessionHold !== null) return null;
      if (snapshot.status !== "restoring" && snapshot.status !== "signed-in") return null;
      if (currentLogin !== 0) return null; // 새 로그인 시도 중에는 이전 세션의 갱신을 새로 보내지 않는다.
      if (loginChanged) return null; // 표식 변경 감지 뒤 [다시 로그인]만 받는 탭: 복원·갱신을 시작하지 않는다(팀장 결정 2).
      if (refreshBlocked) return null; // 응답 유실·재시도 소진 뒤 이 페이지에서 이전 Refresh 재전송 금지
      const t = ticket();
      latestRefresh = t.sequence;
      publish({ restoreUnconfirmed: false, canRetryRestore: false }); // 다시 확인을 시작하면 "확인하지 못함" 표시를 내린다.
      return t;
    },

    refreshCurrent: (t) => currentRefresh(t),

    refreshSucceeded(nextToken, t) {
      nonEmpty(nextToken);
      if (!currentRefresh(t)) return false;
      latestRefresh = 0;
      token = nextToken;
      // 복원 성공은 이 탭에서 로그인이 새로 확인된 것이다. 같은 세션의 갱신은 스냅샷을 바꾸지 않는다.
      if (snapshot.status === "restoring") publish({ status: "signed-in", generation: snapshot.generation + 1 });
      return true;
    },

    refreshFailed(t, cause) {
      if (cause !== "session-ended" && cause !== "not-consumed" && cause !== "outcome-unknown") {
        throw new TypeError("unknown refresh failure cause");
      }
      if (!currentRefresh(t)) {
        // 낡은 표라 반영하지 않아도, 같은 세션의 요청 결과를 알 수 없다는 사실은 남긴다(이전 Refresh 재전송 금지).
        if (cause === "outcome-unknown" && t.generation === snapshot.generation) refreshBlocked = true;
        return false;
      }
      latestRefresh = 0;
      token = null;
      if (cause === "outcome-unknown") refreshBlocked = true;
      if (snapshot.status === "signed-in") publish({ status: "reauth-required" });
      else if (cause === "session-ended") publish({ status: "signed-out", generation: snapshot.generation + 1 });
      else {
        // 확인하지 못한 것을 비로그인으로 확정하지 않는다. 결과를 알 수 없으면 이전 Refresh를 다시 보내지 않는다.
        publish({ restoreUnconfirmed: true, canRetryRestore: cause === "not-consumed" });
      }
      return true;
    },

    logoutStarted() {
      if (snapshot.status !== "signed-in" && snapshot.status !== "reauth-required") return null;
      // 표식 변경 감지 뒤에는 쿠키가 다른 탭의 새 로그인 것일 수 있어 로그아웃을 보내지 않는다(팀장 결정 2).
      if (loginChanged) return null;
      const { logout } = snapshot;
      if (logout.phase === "pending") return null;
      // 이 세대에 끝난 로그아웃이 있으면 그것을 다시 보내는 것이므로 재시도 조건을 그대로 적용한다.
      // done이어도 새 로그인이 시작된 뒤라면(재인증 필요로 남은 경우) 이전 세대의 로그아웃을 다시 보내지 않는다.
      if (logout.phase === "settled" && logout.fromGeneration === snapshot.generation
        && !logoutRetryable(logout, snapshot.generation)) return null;
      const t = ticket();
      pendingLogout = t.sequence;
      publish({ logout: { phase: "pending", fromGeneration: t.generation, loginStartedAfter: false } });
      return t;
    },

    logoutCurrent: (t) => snapshot.logout.phase === "pending" && t.sequence === pendingLogout && t.generation === snapshot.generation
      && !loginChanged,

    logoutSettled(result, t) {
      const { logout } = snapshot;
      if (logout.phase !== "pending" || t.sequence !== pendingLogout || t.generation !== snapshot.generation) return false;
      pendingLogout = 0;
      const settled: LogoutState = { phase: "settled", result, fromGeneration: t.generation, loginStartedAfter: logout.loginStartedAfter };
      if (result !== "done") {
        publish({ logout: settled });
      } else {
        // 토큰 폐기: 이전 세션은 서버에서 끝났으므로 새 로그인 여부와 관계없이 버린다.
        token = null;
        latestRefresh = 0;
        if (logout.loginStartedAfter) {
          // 새 로그인 흐름 보존: 비로그인으로 확정하지 않아 회원 가드가 이동·정리하지 않는다. 세대도 유지해 화면·입력을 지킨다.
          publish({ status: "reauth-required", logout: settled });
        } else {
          publish({ status: "signed-out", generation: snapshot.generation + 1, logout: settled });
        }
      }
      return true;
    },

    logoutDoneElsewhere() {
      if (snapshot.status !== "signed-in" && snapshot.status !== "reauth-required") return false;
      if (loginChanged || currentLogin !== 0 || snapshot.logout.phase === "pending") return false;
      token = null;
      latestRefresh = 0;
      pendingLogout = 0;
      carriedHold = null;
      const settled: LogoutState = { phase: "settled", result: "done", fromGeneration: snapshot.generation, loginStartedAfter: false };
      publish({ status: "signed-out", generation: snapshot.generation + 1, logout: settled });
      return true;
    },
  };
}
