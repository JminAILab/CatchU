# Security Requirements — u3-reader-views

근거: 요구사항 `inception/requirements-analysis/requirements.md` NFR1·NFR3·NFR4, 기능 설계 `construction/u3-reader-views/functional-design/`(functional-spec·rules BR1~BR5·frontend-components, 검토 review-01), 계약 `inception/contract-design/contract-summary.md` P-3(받은 사람 응답에 원본 ID·`isFirstCopy`를 싣지 않음), `docs/CatchU_security_checks.md` 「화면 출력」, 지금 코드 `web/src/features/recipient/recipient-api.ts`(`readPublishedSnapshot`·`pickItem`)·`web/src/features/publications/publications-api.ts`(`isPublishedItem`).

이 단위는 화면만 바꾼다. 새 경로·새 저장·새 외부 호출이 없고, 받은 사람 판정·비밀번호·grant는 그대로다. 이 단계에 사람이 정할 빈 곳이 없어 질문 없이 썼다.

## 요구사항

| ID | 요구사항 | 확인 |
|---|---|---|
| NFR3.1 | 프리셋 이름은 탭·탭 아래 이름 전체·탭 바뀜 알림에서 React 글자로만 그린다. `dangerouslySetInnerHTML`·마크다운 해석을 쓰지 않는다. 받은 사람이 보는 이름은 지원자가 쓴 글이라 외부 입력으로 본다 | 화면 시험: `<b>x</b>`·`<img src=x onerror=alert(1)>` 이름이 글자 그대로 |
| NFR3.2 | 탭·패널의 화면 id는 이름이 아니라 `presetOrdinal`과 화면별 접두어로 만든다. 항목 id는 지금처럼 `publishedItemId`다 | 화면 시험: id에 이름이 들어가지 않음 |
| NFR4.1 | 받은 사람 응답 해석(`recipient-api.ts`의 `pickItem`)은 `presetOrdinal`(정수 1~5)·`presetName`(글자) 두 칸만 더 옮긴다. 원본 ID·`isFirstCopy`·그 밖의 칸은 지금처럼 옮기지 않는다(계약 P-3, 기능 설계 검토 Major 1) | web 시험: 남는 칸이 버려지고 두 칸이 옮겨짐 |
| NFR4.2 | 작성자 상세와 받은 사람 열람 모두 두 칸이 없거나 모양이 어긋나면 지금처럼 응답 모양 어긋남(조회 실패)으로 보인다. 칸이 빠진 채로 탭을 그리지 않는다 | web 시험: 칸 없음·0·6·글자 |
| NFR4.3 | 이 단위가 만들거나 고치는 파일에서 프리셋 이름·자료 제목을 `console`·오류 보고에 넘기지 않는다 | 코드 검토 |
| NFR1.1 | 탭 줄은 `tablist`·`tab`(`aria-selected`·`aria-controls`)·`tabpanel`(`aria-labelledby`)이고, 열린 탭만 Tab 순서, 화살표·Home·End, 출처 이동으로 탭이 바뀌면 `aria-live="polite"` 알림, 상태를 색만으로 나타내지 않는다(interaction-spec TabStrip·SourceJump) | 화면 시험: 역할·속성·키 처리 |

## 위협과 대응

| 위협 | 대응 |
|---|---|
| 지원자가 프리셋 이름에 태그를 넣어 받은 사람 화면에서 실행 | NFR3.1 |
| 받은 사람 응답에 원본 ID 같은 칸이 섞여 화면까지 옴 | NFR4.1(옮기는 칸을 정해 둠) |
| 칸이 빠진 응답으로 탭이 엉뚱하게 그려짐 | NFR4.2 |

## Assumptions & Open Questions

None.

## Sources

- 이 단계 전제 확인 `nfr-requirements-questions.md`(2026-11-20 팀장 A)
- 요구사항 NFR1·NFR3·NFR4
- 기능 설계 rules BR1.1·BR2.4·BR2.5, 검토 review-01(Major 1)
- 계약 P-3
- `docs/CatchU_security_checks.md` 「화면 출력」
- 지금 코드 `web/src/features/recipient/recipient-api.ts`, `web/src/features/publications/publications-api.ts`
