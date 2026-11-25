# Security Requirements — u2-applicant-screens

근거: 요구사항 `inception/requirements-analysis/requirements.md` NFR2·NFR3·NFR4, 기능 설계 `construction/u2-applicant-screens/functional-design/functional-spec.md`·`rules.md`(BR3.11, BR5.1, BR5.2), 계약 `inception/contract-design/contract-summary.md` P-1·P-2(공통 전제 「자료 보호」), 이 단계 질문 Q1(2026-11-20 팀장), 지금 코드 `api/src/catches/owner-catch-input.ts`·`web/src/lib/api-response.ts`, 팀 관행 `team.md` Code Style.

프리셋을 누가 읽고 쓰는지(소유)와 로그에 무엇을 남기는지는 U1이 api에서 지킨다(`api/docs/presets.md` 「경로」·「로그」). 이 단위가 지키는 것은 화면에 그리는 방식, 화면이 보내는 요청의 모양, 그리고 이 단위가 고치는 api 조회 조건 하나와 web 응답 해석 하나다.

## 요구사항

| ID | 요구사항 | 확인 |
|---|---|---|
| NFR2.1 | 화면은 프리셋·자료를 지금 회원 호출(`api.member`: Bearer Access 토큰, 401 처리)로만 부르고, 남의 프리셋 ID를 다룰 길을 따로 만들지 않는다. 404(남의 것·없는 것)는 「찾을 수 없음」으로만 보이고 이유를 나누지 않는다 | 화면 시험: 404 응답에 같은 글 |
| NFR2.2 | 본인 Catch 목록의 `publishable` 쿼리는 본인 목록(`ownerCatchQuery`)에서만 받는다. 공개 Catch 목록(`publicCatchQuery`)에 오면 지금처럼 모르는 쿼리로 400이다. 공유하는 쿼리 해석(`pageFilters`)에 더하지 않고 본인 목록 쪽에서만 읽는다(이 단계 Q1 A) | api 시험: 본인 목록 200, 공개 목록 400 |
| NFR2.3 | `publishable` 값은 글자 `true` 하나만 받는다. `false`·빈 값·대소문자 다른 값·같은 키 두 번은 400이고, 받은 값을 오류 응답과 로그에 싣지 않는다(지금 `authorDescription` 규칙과 같다) | api 시험 넷 |
| NFR2.4 | `publishable=true`는 회원 조건(`owner_id = 인증 회원`)을 지우거나 바꾸지 않고 조건을 더하기만 한다. 커서 범위에 `publishable`을 넣어, 다른 조건으로 받은 커서를 쓰면 400이다 | api 시험: 남의 Catch가 섞이지 않음, 조건 다른 커서 400 |
| NFR3.1 | 프리셋 이름과 자료 제목은 목록·편집·발행 화면과 확인 단계, 막힘 안내에서 React 글자로만 그린다. `dangerouslySetInnerHTML`·마크다운 해석을 쓰지 않는다(보안 점검 「화면 출력」) | 화면 시험: `<b>`·`<img onerror>` 이름이 글자 그대로 |
| NFR3.2 | 막힘 안내의 「‘(프리셋 이름)’ 프리셋의 ‘(자료 이름)’ …」은 이름을 글자 조각으로 이어 그리고, HTML 문자열을 만들지 않는다 | 화면 시험 |
| NFR4.1 | web은 프리셋 이름·담긴 자료 제목·자료 ID를 `console`이나 오류 보고에 남기지 않는다. 화면 오류는 지금처럼 화면 글로만 알린다 | 코드 검토: 새 파일에 `console` 호출 없음 |
| NFR4.2 | web 응답 해석은 오류 `details.blockedSources`에서 `presetId`·`kind`·`sourceId` 세 칸만 옮기고 다른 속성은 버린다. `kind`는 `CATCH`·`TEXT_MATERIAL`·`PDF_MATERIAL`만, 두 ID는 빈 글자가 아닌 글자만 받는다. 모양이 어긋나면 응답 모양 어긋남으로 본다(기능 설계 BR5.2) | web 시험: 옳은 모양·남는 속성·어긋난 kind |
| NFR4.3 | web 응답 해석에서 `catchIds` 처리를 지운다. api가 더는 보내지 않는 칸을 받아 두지 않는다 | web 시험: `catchIds`가 와도 옮기지 않음 |

## 위협과 대응

| 위협 | 대응 |
|---|---|
| 프리셋 이름에 넣은 태그·스크립트가 다른 화면에서 실행됨 | NFR3.1·NFR3.2. 이름은 본인만 보지만(받은 사람 탭은 U3) 같은 규칙을 지킨다 |
| `publishable` 쿼리로 공개 목록의 결과를 바꾸거나 넓힘 | NFR2.2. 공개 목록은 그 쿼리를 받지 않는다 |
| 조건을 바꾼 요청에 옛 커서를 붙여 다른 조건의 다음 쪽을 받음 | NFR2.4 |
| 막힘 응답에 섞인 값이 화면까지 옴 | NFR4.2(세 칸만, 정해진 값만) |
| 브라우저 콘솔·오류 보고에 지원자 자료 이름이 남음 | NFR4.1 |

CSRF: 프리셋 경로와 발행 경로는 지금처럼 Bearer 경로라 CSRF 검사가 없다(U1 NFR 요구 검토 R-01). 이 단위는 쿠키로 인증하는 새 경로를 만들지 않는다.

## Assumptions & Open Questions

None.

## Sources

- 요구사항 NFR2·NFR3·NFR4, 계약 P-1·P-2 공통 전제
- 기능 설계 BR3.11·BR5.1·BR5.2
- 이 단계 질문 Q1 A(2026-11-20)
- `docs/CatchU_security_checks.md` 「화면 출력」
- 지금 코드 `api/src/catches/owner-catch-input.ts`(`pageFilters`·`ownerCatchQuery`·`publicCatchQuery`·`authorDescriptionInput`), `web/src/lib/api-response.ts`
