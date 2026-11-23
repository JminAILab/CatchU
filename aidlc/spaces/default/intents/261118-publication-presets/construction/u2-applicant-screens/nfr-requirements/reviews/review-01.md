## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-20T08:05:52Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/nfr-requirements/traceability.json > coverage NFR1 / performance-requirements.md > NFR1.1 | 상류 NFR1은 키보드만으로 모든 조작, 고를 수 없는 이유와 탭 상태를 화면 낭독기에 읽히게 하는 것, 막힘·비공개·상한 같은 상태를 색만으로 나타내지 않는 것을 요구한다. 이 단계는 NFR1.1(저장 결과 안내의 role) 하나만 적었는데 추적표는 NFR1을 OK로 표시한다. 키보드 조작, 이유 글자의 낭독(aria-disabled나 aria-describedby 연결 등), 색에 기대지 않는 표시는 확인 가능한 요구로 없다. 코드 생성이 기능 설계 문장에만 의존해 시험 없이 빠질 수 있다. | NFR1의 나머지 두 줄을 요구 행으로 더한다. 예: 고르기·순서·담기·빼기·저장·지우기가 키보드만으로 되고(화면 시험), 막힌 단추의 이유 글자가 단추의 읽히는 설명에 연결되고, 막힘·상한·넘음 표시가 글자를 함께 가진다. 추적표 NFR1의 target에 새 ID를 넣는다. 더하지 않을 거면 추적표 NFR1을 부분 충족으로 바꾸고 나머지는 기능 설계 BR 번호로 가리킨다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/nfr-requirements/performance-requirements.md > NFR6.2, NFR6.3, NFR5.1 | 요청 수는 고정했지만 응답이 순서대로 오지 않는 경우의 요구가 없다. 걸러 보기를 빨리 두 번 바꾸거나 [더 보기]를 연달아 누르면 늦게 온 이전 쪽 목록과 세기 응답이 새 목록에 섞이거나 글자 이유 막힘을 틀리게 붙일 수 있다. 쪽마다 세기를 목록 응답 뒤에 붙이는 구조라 어긋나기 쉽다. | 「걸러 보기를 바꾸거나 쪽을 다시 불러온 뒤에는 앞선 요청의 응답을 화면에 반영하지 않는다」와 「[더 보기]·세기 진행 중에는 같은 요청을 중복해 보내지 않는다」를 요구 한 줄로 더하고 화면 시험(대역 응답을 뒤바꿔 보냄)으로 묶는다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/nfr-requirements/security-requirements.md > NFR2.4 확인 칸 | 기능 설계 BR5.1은 `publishable=true` 결과가 U1 PublishableSource의 발행 판정과 같아야 하고 같은 Catch 묶음으로 두 판정을 맞춰 보는 시험을 요구한다. NFR2.4의 확인은 「남의 Catch가 섞이지 않음, 조건 다른 커서 400」뿐이다. 보호·확인 조건이 두 곳에서 어긋나면 발행 화면 막힘 사유와 고르기 목록이 조용히 달라지는데, 보안 요구에는 이 일치 확인이 없다. | NFR2.4(또는 새 행)의 확인에 「같은 Catch 묶음에서 `publishable=true` 목록 = U1 발행 판정이 통과시키는 Catch」를 더한다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/nfr-requirements/security-requirements.md > NFR4.1 확인 칸 | 확인이 「새 파일에 `console` 호출 없음」으로 좁다. 이 단위는 기존 `publish-screen.tsx`·`publish-view.tsx`·`publish-sources.ts`·`api-response.ts`도 고치는데, 그 파일들에 프리셋 이름이나 자료 제목이 오는 `console` 호출이 생겨도 이 확인으로는 잡히지 않는다. 지금 web의 features·lib·components에는 `console` 호출이 없어(조회로 확인) 그대로 지킬 수 있다. | 확인 범위를 「이 단위가 새로 만들거나 고친 파일 모두」로 넓힌다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (stage에 선언된 검증 도구 없음) | n/a | 직접 대조로 갈음했다. `ownerCatchQuery`와 `publicCatchQuery`가 `pageFilters`를 함께 쓰고 허용 키 목록으로 모르는 쿼리를 400으로 거르므로 NFR2.2의 「공개 목록은 지금처럼 400」 전제가 맞다. `authorDescription` 입력 규칙(정확한 글자 외에는 400, 받은 값을 싣지 않음)이 NFR2.3의 선례로 실재한다. `api-response.ts`는 지금 `catchIds`를 옮기고 있어 NFR4.3의 삭제 대상이 실재한다. U1 `api/docs/presets.md`의 세기 1~50개, 프리셋 목록 한 번, 로그 칸이 NFR6.1·NFR6.4와 맞는다. |

### Summary

보안·성능 요구는 기능 설계·U1 계약과 어긋나지 않고 구현자가 추측 없이 만들 수 있을 만큼 구체적이다(공개 목록 400 분리, 커서 범위, 세 칸만 옮기는 응답 해석, 요청 수 고정). 다만 상류 NFR1(키보드·낭독·색만 쓰지 않기)을 NFR1.1 한 줄로만 받고 추적표에 OK로 적은 점이 가장 큰 구멍이고, Major가 1건이라 READY로 본다(Major 하나는 승인 때 보강을 권한다).
