# CR1 규칙 쪽 Catch — 관측 요구사항

입력:
- 기능 설계 `construction/cr1-readable-catch/functional-design/`(functional-spec.md 7절, rules.md BR3.3·BR7.1)
- 요구사항 `inception/requirements-analysis/requirements.md`(NFR7)
- team.md 「Code Style」
- 이 단계의 답 `nfr-requirements-questions.md`(Q2 A)

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR7.1 | worker 문서는 크기 상한(36,000 B)을 넘지 않는다. 재료 순서·변경 묶음은 새 문서(`worker/docs/generation-material.md`)에 쓴다. 상한에 가까운 문서(`generation.md` 35,312 B, `relation-collection.md` 35,793 B)는 늘리지 않는다. | 문서 크기 검사가 통과한다. | NFR7, BR7.1 |

## 확인 사항 (인셉션 NFR이 없는 설계 제약)

- 운영 로그에는 기록의 글 원문을 남기지 않는다(보안 요구사항 「확인 사항」의 로그, team.md 「Code Style」).
- 「제목만 없음」 집계는 최종 제목이 없는 후보만 센다(BR3.3).
- CR1 건수 필드(기록의 글 제목 수·부실 수·가리기 수)는 더하지 않는다(Q2 A). 경보·대시보드·추적도 새로 두지 않는다. 요구사항에 근거가 없다.
