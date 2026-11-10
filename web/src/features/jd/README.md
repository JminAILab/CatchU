# U10 JD 관리·요약 화면

[승인 기능 설계](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u10-jd/functional-design/frontend-components.md)와 [구현 계획](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u10-jd/code-generation/code-generation-plan.md)을 구현한다.

## 관리

`/jds`는 회원 가드 안에서 본인 JD 목록·상세·생성·수정·삭제를 공용 회원 API로 호출한다. 회원 메뉴와 로그인 후 복귀 허용 목록에 `JD 관리`를 추가했다. 기존 채용공고 안내 메뉴는 별개 기능이다.

제목 200·본문 20,000 UTF-16 코드 단위 상한을 안내하고 초과 입력을 자르지 않는다. 저장 실패는 입력을 유지하며 삭제는 원본과 관련 실행 기록을 함께 지운다는 확인 뒤 요청한다. 응답을 기다리는 동안 계정이 바뀌면 기존 목록·입력은 제거한다. 동일 세션의 일반 저장 실패·미전송은 성공으로 표시하지 않는다. 인증 자체가 거부돼 접근을 잃으면 입력도 비운다.

`createJdApi(transport)`는 GET/POST/PATCH/DELETE 계약을 검사하고 시험용 전송을 주입할 수 있다. [#471](https://github.com/JminAILab/CatchU/pull/471)의 공용 PATCH·동시 헤더 지원이 병합된 판본(`e84e70c6`, 제공 변경 `c44b53d6`)에서 `createMemberJdApi(api.member)`를 연결해 제품 페이지의 수정 저장을 활성화했다. `memberTransport`는 공용 결과 객체를 그대로 돌려줘 `not-sent`·`discarded`·`renewed-rejected` 구분을 보존한다. U10은 공용 `api-client.ts`·`auth-api.ts`를 수정하거나 직접 fetch·토큰 복사·별도 갱신으로 우회하지 않는다.

공용 인증 통합 전환이 켜진 경우 AUTH 401의 갱신과 GET 한 번 재조회는 공용 호출이 맡는다. POST/PATCH는 인증 갱신 뒤에도 자동 재전송하지 않고 입력을 유지해 사용자가 다시 누르게 한다. 기본 인증 분기도 기존 공용 설정을 그대로 따르며 U10에서 전환을 켜지 않는다.

## 요약 슬롯

`JdSummaryPanel`은 C-11의 `token`, `getGrant`, `onAccessLost`, `isLoggedIn`, `showEvidence`와 U10 `client`를 받는다. 공용 세션 세대로 로그인된 계정끼리의 전환도 확인한다. 해당 링크의 본인 실행 목록·새 접수·단건 결과·수동 새로고침을 제공하며 자동 폴링과 재접수는 없다. 요약 접수만 U2 `useAiConsent`와 `AiNoticeLine`을 사용하고 동의 뒤 한 번 재요청한다. 요청 동안 계정·링크가 바뀌면 이전 동의 창도 해제하고 재요청을 보내지 않는다.

원문 요구사항별 근거·자료로 확인되지 않는 점·면접 질문을 React 텍스트로 표시한다. `jdRole`, 서버 안내·AI 해석 구분, 출처 라벨·인용 원문을 보존한다. BR3.5의 검색 조각 없음 고정 `SERVER_NOTICE`는 원문 줄 옆에 한 번만 표시하고 세 칸에서 중복 표시하지 않는다. 다른 서버 안내는 원래 칸에 남기며, `EMPTY`만으로 검색 조각 없음을 추정하지 않는다. 근거 선택은 받은 `citation.location`을 그대로 `showEvidence`에 전달한다. 개별 생성 실패와 개별 호출 시간 초과는 `GENERATION_FAILED`의 “이 요구사항을 처리하지 못했습니다.”, 전체 시한은 `DEADLINE_EXCEEDED`의 “전체 처리 시한이 지나 완료하지 못했습니다.”로 최초 조회와 재열람에서 동일하게 표시한다. EMPTY와 일부 실패·기존 성공 결과는 함께 구분한다.

[#482](https://github.com/JminAILab/CatchU/pull/482)의 실제 공유 화면 4번 자리에 `JdRecipientPanel`을 연결했다. wrapper는 `createMemberJdApi(api.member)`를 주입해 요약 접수·목록·상세에서 회원 Bearer와 요청 시점 `getGrant()`의 `X-Link-Grant`를 함께 전달한다. 수신자 전용 호출로 회원 인증을 생략하지 않는다. LINK 401은 회원 갱신을 하지 않고 `onAccessLost`로 전달하며, AUTH 401은 회원 인증 처리와 로그인 안내로 구분한다.

API의 실제 C-10 등록은 #468 병합과 #416 OQ5·OQ6 결정에 따라 AppModule에 연결했다. U4 제출 3 병합판을 받은 뒤 사용자의 C-11 대기 해제에 따라 제공된 슬롯 composition만 수정했다. U4의 screen/store/grants/slots·강조 로직은 그대로 사용한다. `jd-recipient-binding.ts`는 같은 링크의 최신 콜백을 참조하되 함수 교체만으로 선택·결과를 초기화하지 않는다. grant 값은 보관하지 않는다. 링크 교체 시 wrapper 자식을 해제하며, 회원 세대 교체는 기존 `JdSummaryPanel` 경계를 따른다.

공유 페이지 직접 진입은 회원 Guard를 거치지 않으므로 통합 전환이 켜져 있을 때 wrapper가 기존 `authRuntime.ensureRestored()`를 호출한다. 별도 토큰·갱신 정책을 만들거나 전환 설정을 바꾸지 않는다. 실제 브라우저의 접수·재열람·근거 강조·접근 상실 결과와 합성 HTTP 검사 결과는 코드 요약에서 구분한다. 화면 연결을 외부 AI 처리 완료로 보고하지 않는다.

## 검사

`web/`에서 기존 Node 24.21.0과 잠금 의존성을 사용한다.

```sh
node --test test/jd-management.test.mjs test/jd-summary.test.mjs test/jd-member-binding.test.mjs test/jd-recipient-binding.test.mjs test/member-navigation.test.mjs
node --test --experimental-test-coverage --test-coverage-include="src/features/jd/**" test/jd-management.test.mjs test/jd-summary.test.mjs
npm run check
```

승인 업무 시나리오와 BR3.5 표시 회귀를 상태 모델·응답 해석·정적 렌더로 검사한다. 테스트는 합성 자료만 사용한다. JSX는 기존 TypeScript 변환 방식이므로 커버리지 줄 번호가 원본과 다를 수 있고 불러오지 않은 화면 조립·세션 파일은 별도 0%로 보고한다. 자동 검사의 위치 전달·정적 강조·모델 선택 보존은 실제 브라우저의 펼침·초점·스크롤·레이아웃 확인을 대신하지 않는다. 아래 날짜별 검사는 당시 판본의 기록이다. [2026-11-10 PR 전 보완 검사](../../../../docs/verification/u10-pr-fixes-2026-11-10.md)와 [최신 통합 merge 후 최종 검사](../../../../docs/verification/u10-merge-final-2026-11-10.md)를 구분하며, 최종 기록에는 전체 merge 판본의 실제 브라우저 확인과 미실행인 원격 CI를 명시한다.

2026-11-05 #471 어댑터 연결의 좁은 검사 명령은 다음과 같다. 기존 Node 24.21.0·npm 11.19.0 Docker 판본과 설치된 잠금 의존성을 사용한다. 기존 75개 전체 검사나 U7 전체 검사를 반복하지 않는다.

```sh
node --test test/jd-member-binding.test.mjs
node --test --test-name-pattern='^[14]\.' test/jd-management.test.mjs test/jd-summary.test.mjs
npm run lint -- src/features/jd/jd-api.ts src/features/jd/jd-management-page.tsx src/features/jd/jd-summary-panel.tsx test/jd-member-binding.test.mjs test/jd-management.test.mjs test/jd-summary.test.mjs
npm run typecheck
```

새 7개 검사는 실제 `createApiClient`·`createAuthApi`·`toClientResult`를 U10 adapter/model에 연결하고 fetch·갱신 세션을 합성으로 주입한다. 두 인증 분기의 PATCH와 동시 헤더, LINK/AUTH 401 구분, GET 1회 재조회, POST/PATCH 무재전송, 저장 실패 입력 보존, 로그인 상태가 true인 계정 교체의 늦은 응답 폐기를 확인한다. 기존 정적 검사는 변경된 미제공 기대와 화면의 1·4번 사례만 선택한다. 실제 web↔api·브라우저·C-11 강조와 외부 AI는 미실행이며, 이 좁은 검사에서 전체 커버리지 충족을 주장하지 않는다.

이번 결과는 새 검사 7/7, 기존 선택 검사 4/4 통과(실패·skip 0), 대상 lint와 typecheck exit 0이다. 의존성·라우트·빌드 설정 변경이 없어 이번 보완에서 빌드는 반복하지 않았다. 정적 렌더는 기존 TSX 변환과 CSS 대역을 사용하며 실제 레이아웃·클릭 확인을 대신하지 않는다.

2026-11-06 C-11 연결은 기존 75개·17개·C-10 9개를 반복하지 않고 아래 범위만 검사했다.

```sh
node --test --test-concurrency=1 test/jd-recipient-binding.test.mjs
node --test --test-name-pattern="^판정 통과 화면 순서:" test/recipient.test.mjs
node --test test/member-navigation.test.mjs
node node_modules/eslint/bin/eslint.js src/features/jd/jd-recipient-panel.tsx src/features/jd/jd-recipient-binding.ts src/features/recipient/recipient-view.tsx
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

신규 연결 7개·변경된 슬롯 기대 1개·통합 충돌 해결의 회원 메뉴 8개, 총 16개가 통과했다. 대상 lint와 typecheck도 종료 코드 0이다. 신규 검사는 실제 U4 composition/store/grants·위치 대조와 U10을 연결하지만 fetch 응답은 합성이다.

실제 브라우저와 로컬 API/DB에서는 보호 링크 unlock·회원 세션 복원, 본인 JD 선택, 새 접수/PENDING, 미리 저장한 합성 DONE의 재열람·세 칸·근거 강조와 반복 선택, 로그아웃과 발행본 중지 시 화면 정리를 확인했다. 근거의 `<mark>`가 화면 안에 보이고 항목에 초점이 옮겨져도 JD 선택·결과는 유지됐다. 브라우저 네트워크 헤더·상태 코드를 직접 캡처하지 않았으므로 제품 Guard 통과의 행동 증거와 합성 fetch의 헤더 단언은 구분한다. 완료 결과는 합성 DB 자료이며 실제 큐 처리·외부 AI 생성·성능 비교는 미실행이다. 상세 증거와 미실행 조건은 U10 코드 요약에 있다.
