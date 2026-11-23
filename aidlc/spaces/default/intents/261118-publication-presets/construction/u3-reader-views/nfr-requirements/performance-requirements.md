# Performance Requirements — u3-reader-views

근거: 요구사항 `inception/requirements-analysis/requirements.md` NFR1·NFR5, 기능 설계 `construction/u3-reader-views/functional-design/functional-spec.md`(흐름 1~4, 기능 설계 Q2 B: 모든 패널을 그려 두고 숨김)와 검토 review-01, 지금 코드 `web/src/features/publications/published-pdf-item.tsx`(PDF 사본은 [PDF 보기]·[원본 n쪽 열기]를 누를 때만 요청).

응답 시간 숫자 목표와 재는 장치는 두지 않는다(U2 NFR 요구 Q2와 같은 판단, 다른 화면에도 없음). 이 단위는 새 요청을 만들지 않으므로, 요청이 늘지 않는 것과 탭을 오갈 때 다시 받지 않는 것을 요구로 적는다.

## 요구사항

| ID | 요구사항 | 확인 |
|---|---|---|
| NFR5.1 | 탭을 바꾸거나 출처로 다른 탭을 열어도 api 요청이 없다. 사본은 화면을 열 때 지금처럼 한 번 받는다 | 화면 시험: 탭 바꿈 동안 요청 0 |
| NFR5.2 | 열리지 않은 탭의 패널은 그려 두되 숨기기만 한다(`hidden`). 탭을 오가도 패널 안 부품을 다시 만들지 않아, 열어 둔 PDF 뷰어의 받은 파일과 보던 쪽이 남고 다시 받지 않는다(기능 설계 BR1.4) | 화면 시험: 탭을 오간 뒤 같은 부품 인스턴스·PDF 요청 수 그대로 |
| NFR5.3 | 열리지 않은 탭의 PDF 항목은 그려져도 사본을 받지 않는다. 지금처럼 [PDF 보기]·[원본 n쪽 열기]를 누를 때만 받는다 | 화면 시험: 처음 열 때 PDF 요청 0 |
| NFR5.4 | 그려 두는 항목은 발행본 전체 항목(최대 20개, 발행 상한)이라 지금 한 화면에 그리던 양과 같다 | 설계 확인 |
| NFR5.5 | 받은 사람 화면을 다시 조회해 사본이 바뀌어도 같은 `presetOrdinal` 탭은 열린 채로 두고, 그 순번이 없으면 첫 탭을 연다(기능 설계 흐름 1의 8) | 화면 시험 |
| NFR1.2 | 출처 이동은 탭 바꾸기와 대상 정하기를 한 번의 상태 바뀜에서 하고, 그려진 뒤에 초점·스크롤을 한다(지금 효과 방식). 그래서 대상 항목을 못 찾는 깜빡임이 없다 | 화면 시험: 다른 탭 출처 한 번에 탭과 대상이 함께 바뀜 |

## Assumptions & Open Questions

None.

## Sources

- 이 단계 전제 확인 `nfr-requirements-questions.md`(2026-11-20 팀장 A)
- 요구사항 NFR1·NFR5
- 기능 설계 `functional-spec.md` 흐름 1·3, `rules.md` BR1.4·BR4.1, 질문 Q2 B
- 지금 코드 `web/src/features/publications/published-pdf-item.tsx`
