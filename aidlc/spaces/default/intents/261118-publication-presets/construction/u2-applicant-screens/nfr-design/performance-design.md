# Performance Design — u2-applicant-screens

근거: NFR 요구 `construction/u2-applicant-screens/nfr-requirements/performance-requirements.md`(NFR1.1, NFR5.1·NFR5.2, NFR6.1~NFR6.6)과 그 검토 review-01, 기능 설계 `functional-design/functional-spec.md`·`frontend-components.md`와 그 검토 review-01, 이 단계 질문 Q1(2026-11-20 팀장), 지금 코드 `web/src/features/publications/publish-screen.tsx`(`createSourceLoader`의 `AbortController`·세대 번호).

캐시·응답 시간 측정은 두지 않는다(NFR 요구 Q2 A). 아래는 요청 수를 고정하고, 늦게 온 응답이 화면을 덮지 않게 하며, 불러오기 상태를 구분하는 방법이다.

## 1. 화면별 요청 묶음

| 때 | 요청 | 요구 |
|---|---|---|
| 목록 화면 열기·[다시 불러오기] | `GET /v1/presets` 1 | NFR6.1 |
| 발행 화면 열기·[다시 불러오기]·막힘 뒤·404 뒤·400 `presetIds` 뒤 | `GET /v1/presets` 1 | NFR6.1·NFR6.6 |
| 편집 화면 열기(고치기) | 상세 1 + 저장소 목록 1 + 고르기 목록 3(첫 쪽) + 세기 최대 3 | NFR6.2(아래 「달라지는 곳」) |
| 편집 화면 열기(새 프리셋) | 저장소 목록 1 + 고르기 목록 3 + 세기 최대 3 | NFR6.2 |
| [더 보기] 한 번 | 그 목록 1 + 세기 최대 1 | NFR6.3 |
| 걸러 보기 바꿈 | Catch 첫 쪽 1 + 세기 최대 1 | NFR6.3 |
| 담기·빼기·순서·발행 고르기 | 0(화면 안 셈) | NFR6.5 |
| 저장 성공 | 상세 1(다시 불러 글자 수·이유를 맞춤) | 기능 설계 「저장」 |

- 세기는 그 쪽에서 고를 수 있는 자료(Catch 전부, 텍스트 자료 전부, 추출이 끝난 PDF)만 보낸다. 한 쪽은 20개 이하라 U1 세기 한도(50개) 안이다(NFR6.4). 고를 수 있는 자료가 없는 쪽은 세지 않는다.
- 저장소 목록은 Catch 단추 작은 줄의 「저장소 이름」(M3, 지금 발행 화면과 같은 글)을 찾는 데 쓴다. 지금 발행 화면이 쓰는 저장소 목록 호출을 그대로 옮겨 편집 화면이 연다. 실패하면 작은 줄에서 저장소 이름만 빼고 나머지는 그린다(지금 발행 화면의 동작). 이 요청은 NFR6.2의 「상세 1 + 목록 3 + 세기 최대 3」에 빠져 있던 것이라 아래 「달라지는 곳」에 적는다(기능 설계 검토 Minor 1).

## 2. 늦게 온 응답 버리기

지금 발행 화면의 `createSourceLoader`가 쓰는 방법을 그대로 쓴다(NFR 요구 검토 Minor 1).

- 목록마다 불러오기 세대 번호와 `AbortController`를 둔다. 걸러 보기를 바꾸거나 [다시 불러오기]로 첫 쪽을 새로 부르면 앞 요청을 끊고 세대를 올린다. 응답이 왔을 때 세대가 다르면 버린다.
- [더 보기]는 그 목록이 다음 쪽을 부르는 중이면 다시 누를 수 없다(지금 `moreState: "loading"` 동안 막힘). 그래서 같은 목록의 다음 쪽 요청은 한 번에 하나다.
- 세기 응답은 그 쪽을 부른 세대 번호를 함께 가진다. 세기 응답이 왔을 때 그 목록의 세대가 바뀌었으면 버린다. 버린 세기 응답은 글자 이유를 붙이지 않는다.
- 발행 화면의 프리셋 목록도 같다. 막힘 뒤 다시 불러오기가 [다시 불러오기]와 겹치면 나중 요청만 쓴다.
- 화면을 떠나면 진행 중 요청을 모두 끊는다(지금 화면들처럼 세션이 바뀌면 응답을 버림).

## 3. 먼저 그리고 나중에 막기 (NFR5.1)

- 고르기 단추는 목록 응답이 오면 바로 그린다. 그 쪽의 세기가 아직이면 단추는 「항목은 20개까지」 이유로만 막히고, 글자 이유는 세기 응답이 온 뒤 붙는다.
- 세기가 실패하면(연결 끊김·5xx·404) 그 쪽 자료는 글자 수를 모르는 자료가 된다. 글자 이유로 막지 않고, 담으면 「담긴 자료와 순서」의 글자 수 자리에 「글자 수를 세지 못했습니다」가 보인다(기능 설계 「고치기」 3). 저장 때 서버가 60,000자를 다시 검사한다.

## 4. 저장 중과 그 뒤

- 저장 중에는 이름 칸·고르기 단추·순서 단추·[저장]·[프리셋 지우기]를 모두 막는다. 그래서 저장 중에 바뀐 입력이 저장 결과와 섞이지 않는다(기능 설계 검토 Minor 5).
- 첫 저장(201) 뒤에는 라우터를 거치지 않고 `window.history.replaceState(null, "", presetEditPath(presetId))`로 주소만 바꾼다(이 단계 Q1 A). 화면은 다시 그려지지 않아 불러온 고르기 목록과 글자 수, 「저장했습니다.」가 남는다. 화면 상태의 프리셋 ID를 받은 `presetId`로 바꾸어, 다음 [저장]은 `PUT /v1/presets/{presetId}`로 나가고 h1은 「프리셋 고치기」, [프리셋 지우기]가 보인다. 지금 GitHub 연동 콜백 화면(`github-callback-screen.tsx`)이 같은 API를 쓴다.
- 2026-11-21 변경: Q1 B(Build and Test 되돌아가기 1, 팀장 결정). 위 Q1 A는 회원 가드(`session-member-guard`)가 주소마다 회원을 다시 확인하며 편집 화면을 새로 만들어, 첫 저장 뒤 빈 「새 프리셋」이 다시 그려졌다. 첫 저장(201) 뒤에는 「저장하지 않은 변경」을 끈 다음 `router.replace(presetEditPath(presetId))`로 `/presets/{presetId}`에 옮기고, 옮긴 화면이 상세·고르기 목록·저장소 목록·세기를 다시 불러 고치기(PUT) 상태로 그린다. 「저장했습니다.」는 옮기기 전에 그 프리셋 ID와 함께 web 모듈 안 메모리에 남기고(주소·브라우저 저장소에 두지 않음), 옮긴 화면이 열 때 같은 ID면 한 번 꺼내 보인 뒤 지운다. 새로 고침·다시 열기·다른 프리셋에서는 보이지 않는다. 편집 화면 모델은 다시 열 때 정리 표시를 되살려 React Strict Mode의 두 번 마운트에서도 결과를 버리지 않는다.
- 저장 성공 뒤 상세를 한 번 다시 불러 담긴 자료의 글자 수·이유를 서버 값으로 맞춘다. 이 응답도 세대 번호로 늦은 응답을 버린다.

## 5. 접근성 안내의 읽힘 (NFR1.1)

- 「저장했습니다.」는 늘 그려 둔 `role="status"` 칸의 글을 바꾸어 읽히게 하고, 실패는 `role="alert"` 칸에 그린다. 5개 안내는 목록 위 `aria-live="polite"` 칸 하나다. 칸을 새로 만들었다 지우지 않아 화면 낭독기가 바뀐 글을 놓치지 않는다(지금 발행 화면의 `StatusBlock`과 같다).

## 달라지는 곳

- NFR 요구 NFR6.2의 편집 화면 요청 수는 「상세 1 + 목록 3 + 세기 최대 3」이었다. Catch 단추의 저장소 이름(M3)을 그리려면 저장소 목록 1번이 더 필요해, 이 설계는 「상세 1 + 저장소 목록 1 + 목록 3 + 세기 최대 3」으로 센다. 시험도 이 수로 센다. 저장소 이름을 빼서 요청 수를 지키는 것은 M3와 달라지므로 고르지 않았다.

## Assumptions & Open Questions

None.

## Sources

- NFR 요구 `performance-requirements.md`, 검토 review-01(Minor 1)
- 기능 설계 `functional-spec.md` 흐름 2·3, `frontend-components.md`, 검토 review-01(Major, Minor 1·5)
- 이 단계 질문 Q1(2026-11-20)
- 지금 코드 `web/src/features/publications/publish-screen.tsx`(`createSourceLoader`), `publish-view.tsx`(`StatusBlock`, `catchSubline`), `web/src/features/github-connection/github-callback-screen.tsx`
