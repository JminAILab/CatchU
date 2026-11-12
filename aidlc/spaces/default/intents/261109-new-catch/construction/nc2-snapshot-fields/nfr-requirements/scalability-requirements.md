# NC2 면접관 사본 칸과 표지 — 확장성 요구사항

입력:
- 기능 설계 `construction/nc2-snapshot-fields/functional-design/`(functional-spec.md, rules.md, entities.md)
- 요구사항 `inception/requirements-analysis/requirements.md`(NFR1)
- 계약 `inception/contract-design/contract-summary.md`(C3)
- 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 이 단계의 답 `nfr-requirements-questions.md`

NC2는 새 배포 단위, 새 큐, 새 표가 없다. 인셉션 NFR에 확장성 항목이 없어 아래는 확인 사항만 둔다.

## 확인 사항

- **이용 규모:** 12월까지 이용자는 팀 관련자와 동료 수강생이다. 발행은 사람이 누를 때만 일어나고, 발행본 하나에 담는 항목 수는 지금 발행 입력 상한 그대로다.
- **발행 한 번의 일:** 고른 Catch 수에 비례한다. 소속 기록은 고른 Catch 전체를 한 번에 읽고(성능 요구사항 「발행 읽기」), Catch 하나의 본인 커밋은 근거 상한(최근 20건)과 별개로 소속 기록 전체를 읽는다. 소속 기록은 작업 하나의 본인 커밋이라 많아야 수백 행이다.
- **사본 크기:** 새 칸은 짧은 글 셋과 근거마다 참·거짓 하나다. `workLimits`에 상한이 없지만 같은 작업 경고는 후보 한 쌍마다 하나라 시연 저장소에서 수 개 안이다(실측은 하지 못함, 기능 설계 Q2). 목록이 길어지는 Catch는 한계로 둔다.
- **화면 계산:** 표지 판정은 링크 수 × 본인 커밋 목록(사본 근거 안) 비교다. 작성자 설명이 4,000자 상한이라 링크 수도 그 안이다.
- **더 하지 않는 것:** 캐시, 미리 계산한 표지, 색인을 더하지 않는다.

## Sources

- `construction/nc2-snapshot-fields/functional-design/rules.md`(BR1.3, BR1.4, BR4.1~BR4.3), `functional-spec.md`, `entities.md`
- `inception/requirements-analysis/requirements.md` NFR1
- `inception/contract-design/contract-summary.md` C3
- `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- `construction/nc2-snapshot-fields/functional-design/functional-design-questions.md` Q2
- 지금 코드: `api/src/publications/publish-input.ts`, `worker/app/candidates/build.py`(`EVIDENCE_COMMIT_CAP`)
