# Security Design — u2-applicant-screens

근거: NFR 요구 `construction/u2-applicant-screens/nfr-requirements/security-requirements.md`(NFR2.1~NFR2.4, NFR3.1·NFR3.2, NFR4.1~NFR4.3)·`performance-requirements.md`(NFR1.1)과 그 검토 review-01, 요구사항 `inception/requirements-analysis/requirements.md` NFR1, 기능 설계 `functional-design/rules.md`(BR3.6·BR3.11·BR4.2·BR5.1·BR5.2)·`frontend-components.md` 「접근성」, 다듬은 화면 `inception/refined-mockups/interaction-spec.md`, 계약 `inception/contract-design/contract-summary.md` P-1·P-2, `docs/CatchU_security_checks.md`, 지금 코드 `api/src/catches/owner-catch-input.ts`·`owner-catch-store.ts`, `web/src/lib/api-response.ts`.

## 1. 본인 Catch 목록의 `publishable` (NFR2.2~NFR2.4)

```text
ownerCatchQuery(memberId, input)
  publishable ← input.publishable 를 꺼내 따로 검사(글자 "true"만, 그 밖은 400)
  나머지 ← pageFilters(input에서 publishable 을 뺀 것)   // 공유 해석은 그대로
  커서 범위 ← [회원, repositoryId, sourceRequestId, authorDescription, publishable]
publicCatchQuery(...)  // 바꾸지 않음: publishable 이 오면 pageFilters 가 모르는 키로 400
```

- 공유 해석 `pageFilters`에는 더하지 않는다. 본인 목록만 키를 먼저 꺼내 검사하므로 공개 목록은 지금처럼 모르는 쿼리로 400이다(NFR2.2).
- 값 검사는 지금 `authorDescriptionInput`과 같은 꼴이다. 글자 `true` 하나만 받고, `false`·빈 값·대소문자 다른 값·배열(같은 키 두 번)은 400이며 받은 값은 오류 응답에 싣지 않는다(NFR2.3).
- SQL은 지금 `owner_id = 인증 회원` 조건을 그대로 두고 셋을 더한다(NFR2.4): 공개(`visibility = 'PUBLIC'`), 작업 사실·기여 확인됨, 원본 저장소 보호 아님. 보호 판정은 지금 본인 목록이 이미 읽는 보호 관측을 쓴다. 보호 관측이 없거나 불완전한 Catch(기록 문제)는 지금도 본인 목록 응답을 만들 때 500이 된다(U1 `api/docs/presets.md` 「세기와 이유」). 새 조건은 SQL에서 그런 Catch를 미리 빼지 않는다: 기록 문제 판정은 지금처럼 응답을 만들 때 하고, 조건은 보호로 확인된 Catch만 뺀다. 그래서 기록 문제가 조용히 숨지 않고 지금처럼 500으로 드러난다(기능 설계 검토 Minor 2).
- 커서 범위에 `publishable`을 넣는다. 범위 값이 바뀌면 이미 내준 커서와 다르므로, 조건이 다른 커서는 400이다. 이미 내준 본인 목록 커서는 `publishable`이 없는 요청에서는 범위가 같게 계산되도록 `publishable`이 없을 때 범위 배열에 `null`을 넣지 않고 지금 배열 그대로 둔다. 그래서 지금 쓰는 커서(내 자산 화면)는 깨지지 않는다(기능 설계 검토 Minor 2).
- **같은 결과 시험(NFR2.4, NFR 요구 검토 Minor 2).** 같은 시험 DB에 공개·비공개, 확인·미확인, 보호·비보호를 섞은 Catch 묶음을 만들고, `GET /v1/catches?publishable=true`가 준 ID 집합과 U1 `src/publishable-source/eligibility.ts` 판정이 「이유 없음」으로 낸 ID 집합이 같은지 본다(project.md: 문장 대조 대신 같은 결과 시험).

## 2. 화면 출력 (NFR3.1·NFR3.2)

- 프리셋 이름·자료 제목은 React 자식 글자로만 넣는다. 막힘 안내 「‘(프리셋 이름)’ 프리셋의 ‘(자료 이름)’ 때문에 발행할 수 없습니다.」도 글자 조각을 이어 그리고, 문자열로 HTML을 만들지 않는다. `dangerouslySetInnerHTML`·마크다운 해석을 쓰지 않는다(`docs/CatchU_security_checks.md` 「화면 출력」).
- 링크 <고치기>의 주소는 `presetEditPath(presetId)`로만 만들고 ID를 `encodeURIComponent`한다(지금 `publicationDetailPath`와 같다). 이름을 주소에 넣지 않는다.
- 시험: `<b>x</b>`·`<img src=x onerror=alert(1)>` 이름이 목록·편집·발행 고르기·확인 단계·막힘 안내에서 글자 그대로 보이고 해당 태그가 그려지지 않는다.

## 3. web 응답 해석 (NFR4.2·NFR4.3)

```text
details.blockedSources
  배열이 아니면 → 응답 모양 어긋남
  줄마다: presetId(빈 글자 아님), kind ∈ {CATCH, TEXT_MATERIAL, PDF_MATERIAL}, sourceId(빈 글자 아님)
         하나라도 어긋나면 → 응답 모양 어긋남
  옮기는 것: { presetId, kind, sourceId } 만(남는 속성 버림)
details.catchIds → 타입·검사·복사를 지움(오면 무시)
```

- 「응답 모양 어긋남」은 지금 `violations`·`existingRequestId`가 어긋날 때와 같은 처리다(그 응답을 알 수 없는 실패로 본다).
- 시험: 옳은 모양, 남는 속성이 버려짐, 어긋난 `kind`, 빈 ID, 배열 아님, `catchIds`가 와도 옮기지 않음.

## 4. 기록 남기지 않기 (NFR4.1)

- 이 단위가 만들거나 고치는 모든 web 파일(새 `features/presets/` 전부, 발행 화면 `publish-screen.tsx`·`publish-view.tsx`·`publish-sources.ts`·`publications-api.ts`, `lib/api-response.ts`, `lib/routes.ts`, 상단 메뉴, 주소 파일)과 api 파일(`owner-catch-input.ts`·`owner-catch-store.ts`)에서 프리셋 이름·자료 제목·자료 ID를 `console`·`Logger`·오류 보고에 넘기지 않는다(NFR 요구 검토 Minor 3).
- 확인: 코드 생성의 검토가 바뀐 파일 전부에서 `console.`·`Logger` 호출을 찾아 새로 더한 것이 없는지 본다. api 쿼리 400은 받은 값을 싣지 않는다(위 1).

## 5. 접근성 (요구사항 NFR1, NFR 요구 검토 Major)

NFR 요구는 NFR1을 안내 역할(NFR1.1) 하나로만 적었다. 요구사항 NFR1의 나머지 세 줄을 이 설계가 화면 규칙과 interaction-spec에 묶어 지킨다. 다른 동작은 만들지 않는다.

| 요구사항 NFR1 | 설계 | 근거 |
|---|---|---|
| 프리셋 고르기·순서 단추를 키보드만으로 모두 쓴다 | 고르기는 `button`(`aria-pressed`)이라 Tab으로 가고 Enter·Space로 누른다. 순서 단추도 `button`. 옮긴 뒤 초점은 옮긴 항목의 같은 단추에 남는다. 이름 칸·저장·지우기·<고치기>·[새 프리셋]·<프리셋 목록으로>도 기본 요소(입력·단추·링크)라 Tab 순서에 있다 | interaction-spec ToggleOptionButton·ReorderList·PresetEditorForm, BR3.5 |
| 고를 수 없는 프리셋의 이유가 화면 낭독기에 읽힌다 | 막힘 이유는 단추 안의 글자라 단추 이름과 함께 읽힌다. 5개 안내는 `aria-live="polite"`로 한 번 읽힌다 | interaction-spec ToggleOptionButton·PresetPicker, BR4.2·BR4.3 |
| 고를 수 없음·비공개·상한 넘음을 색만으로 나타내지 않는다 | 모두 글자로 보인다: 막힘 이유, 「발행할 수 없는 자료 N개」, 「상한을 넘었습니다」, 담긴 줄의 이유 글, 「전체 글이 60,000자를 넘어 발행할 수 없습니다.」 | BR2.1·BR3.6·BR3.7·BR4.2 |

- [새 프리셋]은 목록 화면의 단추로 둔다(누르면 `/presets/new`로 옮김). 링크가 아니라 단추여야 50개일 때 `disabled`로 막을 수 있다(기능 설계 검토 Minor 6). <프리셋 목록으로>와 <고치기>는 링크다.
- 시험: 서버 렌더링 결과에서 역할·`aria-pressed`·`disabled`·`aria-live`·이유 글자를 본다(지금 web 시험 방식).

## 6. CSRF·인증

바꾸지 않는다. 프리셋·발행·Catch 목록 경로는 지금처럼 Bearer 경로이고 화면은 `api.member`로만 부른다(NFR2.1). 404는 「찾을 수 없음」 하나로만 보인다.

## Assumptions & Open Questions

None.

## Sources

- NFR 요구 `security-requirements.md`·`performance-requirements.md`, 검토 review-01(Major, Minor 2·3)
- 요구사항 NFR1
- 기능 설계 `rules.md`·`frontend-components.md`, 검토 review-01(Minor 2·6)
- 다듬은 화면 `interaction-spec.md`
- 계약 P-1·P-2
- `docs/CatchU_security_checks.md`
- 지금 코드 `api/src/catches/owner-catch-input.ts`(`pageFilters`·`authorDescriptionInput`·`cursorScope`), `owner-catch-store.ts`, `web/src/lib/api-response.ts`, `web/src/lib/routes.ts`(`publicationDetailPath`)
