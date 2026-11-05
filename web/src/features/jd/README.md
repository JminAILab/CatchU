# U10 JD 관리·요약 화면

[승인 기능 설계](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u10-jd/functional-design/frontend-components.md)와 [구현 계획](../../../../aidlc/spaces/default/intents/260925-intent-12/construction/u10-jd/code-generation/code-generation-plan.md)을 구현한다.

## 관리

`/jds`는 회원 가드 안에서 본인 JD 목록·상세·생성·삭제를 기존 회원 API로 호출한다. 회원 메뉴와 로그인 후 복귀 허용 목록에 `JD 관리`를 추가했다. 기존 채용공고 안내 메뉴는 별개 기능이다.

제목 200·본문 20,000 UTF-16 코드 단위 상한을 안내하고 초과 입력을 자르지 않는다. 저장 실패는 입력을 유지하며 삭제는 원본과 관련 실행 기록을 함께 지운다는 확인 뒤 요청한다. 응답을 기다리는 동안 계정이 바뀌면 기존 목록·입력은 제거한다. 동일 세션의 일반 저장 실패·미전송은 성공으로 표시하지 않는다. 인증 자체가 거부돼 접근을 잃으면 입력도 비운다.

`createJdApi(transport)`는 GET/POST/PATCH/DELETE 계약을 검사한다. `managementTransport(api.member)`는 현재 제공되는 GET/POST/DELETE만 실제 회원 호출에 연결한다. **공용 web transport의 PATCH 지원이 없으므로 제품 페이지의 기존 JD 수정 저장은 비활성이다.** 제공 담당이 PATCH를 보완하면 그 호출을 `managementTransport`의 두 번째 인자에 넣고 페이지의 `canUpdate`를 켠 뒤 실제 화면 검사를 한다. U10은 공용 `api-client.ts`·`auth-api.ts`를 수정하거나 직접 fetch로 우회하지 않는다.

## 요약 슬롯

`JdSummaryPanel`은 C-11의 `token`, `getGrant`, `onAccessLost`, `isLoggedIn`, `showEvidence`와 U10 `client`를 받는다. 공용 세션 세대로 로그인된 계정끼리의 전환도 확인한다. 해당 링크의 본인 실행 목록·새 접수·단건 결과·수동 새로고침을 제공하며 자동 폴링과 재접수는 없다. 요약 접수만 U2 `useAiConsent`와 `AiNoticeLine`을 사용하고 동의 뒤 한 번 재요청한다. 요청 동안 계정·링크가 바뀌면 이전 동의 창도 해제하고 재요청을 보내지 않는다.

원문 요구사항별 근거·자료로 확인되지 않는 점·면접 질문을 React 텍스트로 표시한다. `jdRole`, 서버 안내·AI 해석 구분, 출처 라벨·인용 원문을 보존한다. 근거 선택은 받은 `citation.location`을 그대로 `showEvidence`에 전달한다. 개별 생성 실패와 개별 호출 시간 초과는 `GENERATION_FAILED`의 “이 요구사항을 처리하지 못했습니다.”, 전체 시한은 `DEADLINE_EXCEEDED`의 “전체 처리 시한이 지나 완료하지 못했습니다.”로 최초 조회와 재열람에서 동일하게 표시한다. EMPTY와 일부 실패·기존 성공 결과는 함께 구분한다.

**실제 공유 화면에는 아직 연결하지 않았다.** #416의 C-10 실제 제공자·C-11 슬롯과 공용 transport의 회원 Bearer+링크 grant 동시 전달이 선행 조건이다. `client`는 해당 제공자 연결 후 주입한다. 현재 관리 전송 경계는 `/public/` 요약 경로를 보내지 않으므로 비밀번호 없는 링크도 회원 호출만으로 우회하지 않는다. 합성 슬롯·transport의 통과는 실제 공유 화면·원문 강조·외부 AI 연결 완료가 아니다.

## 검사

`web/`에서 기존 Node 24.21.0과 잠금 의존성을 사용한다.

```sh
node --test test/jd-management.test.mjs test/jd-summary.test.mjs test/member-navigation.test.mjs
node --test --experimental-test-coverage --test-coverage-include="src/features/jd/**" test/jd-management.test.mjs test/jd-summary.test.mjs
npm run lint
npm run typecheck
npm run build
```

관리 7개·요약 7개의 승인 업무 시나리오를 상태 모델·응답 해석·정적 렌더로 검사한다. 테스트는 합성 자료만 사용한다. JSX는 기존 TypeScript 변환 방식이므로 커버리지 줄 번호가 원본과 다를 수 있고 불러오지 않은 화면 조립·세션 파일은 별도 0%로 보고한다. 실제 브라우저 초점·레이아웃·공유 화면 연결, 760/1024/1536px 화면 확인은 제공자 합류 후 별도 확인한다. 결과와 실제 미실행 범위는 U10 코드 요약에 기록한다.
