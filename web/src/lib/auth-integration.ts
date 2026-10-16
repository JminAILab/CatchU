/**
 * 공통 인증(#286) 화면 연결의 통합 시험 전환. 정확히 "true"일 때만 켠다. 기본은 꺼짐이며, 이때 제품 경로는
 * 기존 #106 동작(메모리 토큰·개발 로그인·회원 가드)을 그대로 쓴다.
 *
 * 꺼 둔 이유: 아래가 끝나기 전에 켜면 확인되지 않은 화면 동작이 제품 경로에 들어온다.
 * - 보내지 않은 요청·이전 세션 응답을 기능 화면에 어떤 결과로 줄지(P2·P5, 각 화면 담당 확인)
 * - #287 화면(Google 버튼·콜백·재인증 안내·로그아웃 표시) 연결과 실제 브라우저 통합 검증
 * 새로고침 복원(A안)·표식 감지 뒤 복구·[다시 확인] 불가는 [팀장 결정](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6206414443)대로 반영했다.
 * 각 화면 담당 확인·#287 연결·통합 검증을 마친 뒤 별도 승인으로 제품 전환을 활성화한다.
 *
 * 켜면: 회원 셸·가드·로그인 화면·`api.member`·`api.devLogin`이 `auth-runtime.ts`를 쓴다(통합 시험용).
 * NEXT_PUBLIC_ 값이므로 개발 서버를 켤 때·빌드할 때 정해진다.
 */
export const authSessionIntegrationEnabled = process.env.NEXT_PUBLIC_AUTH_SESSION_INTEGRATION === "true";
