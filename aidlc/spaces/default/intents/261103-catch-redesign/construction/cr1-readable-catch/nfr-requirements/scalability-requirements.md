# CR1 규칙 쪽 Catch — 확장성 요구사항

입력:
- 기능 설계 `construction/cr1-readable-catch/functional-design/`(functional-spec.md, rules.md BR2.3·BR2.4·BR5.3)
- 요구사항 `inception/requirements-analysis/requirements.md`(가정 A3)
- 계약 `inception/contract-design/contract-summary.md`(C5)

CR1에는 인셉션 NFR에서 물려받는 확장성 요구사항이 없다. 저장 칸, 큐, 동시성 구조를 바꾸지 않는다. 늘어나는 것은 Catch 하나에 담기는 글의 길이다.

## 확인 사항 (인셉션 NFR이 없는 설계 제약)

- **글 길이:**
  - 기록의 글은 잘라서 쓰지 않는다(FR5.1). 제목 칸과 작업 사실 칸에는 길이 상한이 없다(요구사항 가정 A3).
  - 다만 가리기 검사가 2,000자를 넘는 글을 통째로 가리므로(`worker/app/generation/redact.py`의 `MAX_LINE_CHARS`), 기록의 글은 실제로 2,000자 이하다. 그보다 긴 첫 줄은 기록의 글이 없는 것으로 본다(BR2.4).
  - 확인: 경계 시험. 2,000자 첫 줄은 제목과 작업 사실 둘째 줄에 그대로 저장되고 돌아온다. 2,001자 첫 줄은 기록의 글이 없다.
- **12월 AI 근거 조각:** 작업 사실 한 줄은 근거 조각으로 들어갈 때 1,000자 단위로 나뉜다(`api/src/published-index/embedding-config.ts`의 `MAX_CHUNK_LENGTH`). 1,000자를 넘는 기록의 글 줄은 조각 둘 이상이 된다. 이 처리는 바꾸지 않는다.
- **발행본 글자 합계:** 상한(60,000자, `api/src/publications/publications-config.ts`의 `SNAPSHOT_TEXT_TOTAL_MAX`)은 그대로 둔다. 기록의 글 줄은 Catch 하나에 최대 2,000자를 더한다. 합계가 상한을 넘으면 지금의 발행 상한 처리를 따른다.
  - 확인: 지금 상한 처리 시험이 그대로 통과한다.
- **변경 묶음 수:** 큰 후보의 묶음 수에는 상한이 없다(Q5). 묶음이 많아도 재료는 전체 상한 안이다(BR5.6).
  - 확인: 폴더 50개로 갈라지는 합성 후보 시험(S26).
