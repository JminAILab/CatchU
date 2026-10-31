# 공통 인증 — #286

web README에서 옮긴 공통 인증 안내다. 코드는 `web/src/lib/auth-*.ts`와 `web/src/components/auth/`에 있고, 로그인·콜백·재인증·로그아웃 화면은 [auth-screens](../auth-screens/README.md)(#287)가 맡는다.

회원 인증 상태·세션 갱신·로그아웃·로그인 완료를 한 곳(`web/src/lib/auth-*.ts`)에서 다룬다. 합의 원문은 [#251](https://github.com/JminAILab/CatchU/issues/251)의 설계 접점 댓글과 [#286](https://github.com/JminAILab/CatchU/issues/286)이다.

**제품 경로 연결은 보류 중이다.** 공통 인증으로 화면을 움직이면 아직 확인하지 않은 동작(기능 화면이 받는 보내지 않은 요청의 결과, #287 화면 연결)이 함께 들어오므로, 화면 연결은 통합 시험 전환 `NEXT_PUBLIC_AUTH_SESSION_INTEGRATION=true`일 때만 쓴다(`web/src/lib/auth-integration.ts`). 기본(꺼짐)은 [web README 「API 호출」](../../../README.md#api-호출-106-pr)의 기존 동작이다. 켜면 회원 셸·가드·로그인 화면·`api.member`·`api.devLogin`이 `web/src/lib/auth-runtime.ts`의 탭별 인스턴스와 `web/src/components/auth/use-auth.ts`의 훅을 쓴다. 아래 설명은 켰을 때의 동작이다.

| 파일 | 맡는 일 |
|---|---|
| `auth-state.ts` | 상태 4종(`restoring`·`signed-in`·`signed-out`·`reauth-required`), 인증 세대, 로그아웃 진행·결과, 로그인 시도 식별자 |
| `auth-refresh.ts` | 세션 갱신(탭 안 중복 방지, 500만 잠금 안에서 1회 재시도, 응답 유실 뒤 재전송 없음) |
| `auth-logout.ts` | 로그아웃(`done`·`failed`·`unknown`) |
| `auth-session.ts` | 탭 사이 잠금(Web Locks), 로그인 표식 비교, 다른 탭 로그아웃 완료 알림 |
| `auth-login-marker.ts` | 로그인 표식(`localStorage`, 무작위 값. 토큰·회원 정보 아님) |
| `auth-api.ts` | 보호 API 호출 조건·401 뒤 갱신·이전 응답 무시, 개발용 로그인 |
| `auth-google.ts` | Google 시작·시도 보관·콜백 해석·완료(버튼·콜백 화면·안내는 #287) |
| `auth-gate.ts`·`auth-scope.ts` | 회원 경로 가드 판정, 회원 화면 범위 번호 |

- **보호 API 조건:** `status`만 보지 않는다. 로그인 변경 감지 없음·로그아웃 보류 없음·`signed-in`·토큰 있음을 모두 확인하고, 요청 전과 응답 반영 전에 로그인 표식을 비교한다. 그사이 로그인이 바뀌었으면 응답을 쓰지 않는다.
- **새로고침:** 회원 경로 가드와 로그인 화면이 열릴 때 Refresh 쿠키로 세션을 복원한다(#251 필수 검사 「로그인 유지」의 "새로고침 후 세션 확인"). 확인이 끝나기 전에는 로그인 화면으로 보내지 않는다. 확인하지 못하면 Refresh를 쓰지 않았음이 확인된 경우만 [다시 확인]을, 결과를 모르면 [다시 로그인]만 보인다(같은 화면 [다시 확인]은 10월에 두지 않는다, [팀장 결정](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6206414443) 3). 복원은 별도 저장 표식 없이 Refresh 쿠키로 한다([팀장 결정](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6206414443) 1, A안). **한계:** 갱신·복원 응답을 기다리는 중의 새로고침·탭 종료로 서버가 이미 교체를 마쳤다면 그 세션은 다시 쓸 수 없어 재인증이 필요하다. 페이지를 열 때의 복원 중 새로고침(빠른 연속 새로고침 등)도 포함하며, [세션 안내](../../../../api/docs/auth-sessions.md)의 "갱신 응답 유실 후 재인증" 한계에 든다.
- **화면 유지:** 회원 화면은 회원 화면 범위 번호(`auth-scope.ts`)를 기준으로 새로 만든다. 같은 세션의 Access 갱신·재인증 필요·로그아웃 확인 중에는 바뀌지 않고(화면·입력 유지), 새 로그인·회원 전환·다른 탭의 새 로그인 감지 때만 바뀐다. 기존 `accessTokenStore`는 이 번호로 만든 표시값을 담는 호환 신호이며 실제 토큰이 아니다.
- **다중 탭:** 다중 탭 로그인 유지는 Web Locks를 지원하는 최근 Chrome·Edge·Firefox·Safari에서만 보장한다([팀장 T4 결정](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6182257830)). Web Locks는 HTTPS나 localhost에서만 동작한다. 지원하지 않는 환경에서는 탭 사이 요청 순서를 보장하지 않으며, 갱신이 실패하면 입력을 보존하고 재인증을 안내한다. `localStorage`를 쓸 수 없는 환경도 다중 탭 보장 범위 밖이다(T3).
- **보내지 않은 조회:** 공통 화면(회원 경로 가드·로그인 화면)은 보내지 않은 조회(`not-sent`)·이전 세션 응답(`discarded`)을 조회 실패로도 성공으로도 보이지 않고, 그 조회의 진행 표시만 지운다. 이전에 받은 결과가 있으면 그대로 두고, 없으면 재인증 안내 등 인증 상태 표시만 둔다([A 동의](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6187946262), `viewSessionLookup`). `api.member`를 쓰는 기능 화면은 각 화면 담당 확인 전까지 조회 실패로 받는다.
- **변경 요청 결과:** 기능 화면은 `memberMutationOutcome()`(`auth-api.ts`)으로 연장 뒤 401 거부·보내지 않음·반영하지 않은 응답을 나눈다([담당 합의](https://github.com/JminAILab/CatchU/issues/286#issuecomment-6209853081)). 앞의 둘은 입력을 두고 다시 누르게 하며(자동 재전송 없음) 앞선 결과 불명 안내를 지우지 않는다. 반영하지 않은 응답은 결과 불명이다. 갱신하지 못한 회원 인증 401(재인증 필요 등)은 그 밖의 처리이며, 처리되지 않은 저장으로 따로 안내할 화면은 `memberAuthRejected()`로 나눈다(전환을 켠 공통 인증 결과에만 해당, 현재 최초 입력·프로필 수정). 적용: 최초 입력(`saveProfileDetailed`)·프로필 수정(`updateProfile`)·공유 링크·내 자산 Catch 확인·불일치·공개/숨김(`createAssetsStore`, [B 동의](https://github.com/JminAILab/CatchU/pull/308#pullrequestreview-5565777761))·분석 요청 접수(`createAnalysisRequestStore`).
- **다른 탭 로그인 감지:** 로그인 표식이 바뀌었거나 읽을 수 없으면 이 탭의 이전 세대 토큰·요청 결과를 버리고 화면·입력을 정리한다([팀장 결정](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6206414443) 2). 재전송 차단·로그아웃 보류가 없는 탭은 확인 중 표시를 거쳐 지금 쿠키로 한 번만 복원하고, 성공하면 새 화면을 연다. 재전송 차단·로그아웃 보류가 있는 탭과 한 번 복원한 뒤에도 표식 오류가 이어지는 탭은 재인증 안내와 같은 문구에 [다시 로그인]만 둔다(`variant: "login-changed"`). 이때 로그아웃·갱신 요청은 보내지 않고 자동 복원을 반복하지 않으며, 재전송 차단도 풀지 않는다. 보내지 않은 변경 요청은 복원 뒤에도 자동으로 다시 보내지 않는다. 비로그인·복원 중인 탭은 감지 사실만 기록하고 새 로그인을 받는다. **한계:** 같은 회원이 다른 탭에서 다시 로그인해도 이 탭의 작성 중 입력은 사라진다(T3에서 입력을 잃는 쪽을 택한 결과).
- **이 탭이 반영하지 않은 로그인:** 보낸 로그인의 결과를 반영하지 않았는데 쿠키가 바뀌었을 수 있으면(응답 없음·반영하지 않은 200 등, `loginNotAdopted`) 새 표식을 써 다른 탭이 알아차리게 하고, 이 탭은 자동 복원 없이 [다시 로그인]만 둔다. Google 완료는 기존 [A 합의](https://github.com/JminAILab/CatchU/issues/251#issuecomment-6183158107) 1(세션 확인 결과로 이번 로그인의 성공을 판정하지 않음)을 적용한 것이다. 개발 로그인(개발 환경 전용)은 같은 안전 기준을 적용해 구현했다. 복원 전인 탭(콜백 화면 등)은 복원 대기로 남기지 않고 「확인하지 못함」([다시 확인] 없음)으로 바꿔 로그인 화면에서 새 로그인을 받는다. 다른 탭은 위 「다른 탭 로그인 감지」대로 처리한다.
- **다른 탭 로그아웃:** 같은 로그인을 쓰는 다른 탭의 로그아웃이 `done`이면(같은 표식, `BroadcastChannel` 알림) 이 탭도 비로그인으로 확정하고 회원 경로 가드가 비로그인 홈으로 보낸다. `failed`·`unknown`·새 로그인 시작 뒤의 결과는 반영하지 않는다(#251 접점 4).
- **Google 로그인 시도 보관:** `loginAttemptToken`·`state`·`next`·`expiresAt`을 `sessionStorage`의 키 하나(`catchu.auth.google-attempt`)에 둔다. 완료 요청 직전 `sent`를 표시하고, 완료 응답을 받으면 지우며, 시한이 지나면 지운다. `sent`가 남은 시도의 콜백을 새로고침·탭 복제로 다시 열면 주소의 query가 이미 지워졌어도 `already-sent`로 판정하고 완료 요청을 다시 보내지 않는다. 저장에 실패하면 Google로 이동하지 않는다. `next`는 저장·복귀 때 모두 회원 경로인지 검사한다. 값은 로그·화면에 출력하지 않는다.
- **미결(임의로 정하지 않음):** Web Lock 실패·대기 시간 제한, 보낸 뒤 취소된 개발 로그인의 반영(P1). 표식 감지 뒤 복구·새로고침 복원·[다시 확인]은 위 팀장 결정대로 반영했다.
