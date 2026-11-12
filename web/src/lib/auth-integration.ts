/**
 * 공통 인증(#286) 화면 연결의 통합 시험 전환. 정확히 "true"일 때만 켠다. 값이 없거나 다른 값이면 꺼지며, 이때 제품 경로는
 * 기존 #106 동작(메모리 토큰·개발 로그인·회원 가드)을 그대로 쓴다.
 *
 * 제품 기본은 켜짐이다: `web/Dockerfile`·`web/.env.example`의 기본값이 "true"다
 * ([2026-11-11 팀장 승인](https://github.com/JminAILab/CatchU/issues/467#issuecomment-6784442435)).
 * 끈 빌드에서는 Google 로그인과 GitHub 연결 시작이 열리지 않는다.
 * 아래 두 항목을 확인하기 위해 처음에는 기본값을 껐다. 2026-11-11 팀장이 제품 기본값 전환을 승인했다. 배포 후 회귀 결과는 #467에 기록한다.
 * - 보내지 않은 요청·이전 세션 응답을 기능 화면에 어떤 결과로 줄지(P2·P5, 각 화면 담당 확인)
 * - #287 화면(Google 버튼·콜백·재인증 안내·로그아웃 표시) 연결과 실제 브라우저 통합 검증
 * 새로고침 복원(A안)·표식 감지 뒤 복구·[다시 확인] 불가는 [팀장 결정](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6206414443)대로 반영했다.
 *
 * 켜면: 회원 셸·가드·로그인 화면·`api.member`·`api.devLogin`이 `auth-runtime.ts`를 쓴다.
 * NEXT_PUBLIC_ 값이므로 개발 서버를 켤 때·빌드할 때 정해진다.
 */
export const authSessionIntegrationEnabled = process.env.NEXT_PUBLIC_AUTH_SESSION_INTEGRATION === "true";
