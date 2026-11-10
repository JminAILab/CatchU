# NC2 면접관 사본 칸과 표지 — 관측 요구사항

입력:
- 기능 설계 `construction/nc2-snapshot-fields/functional-design/`(functional-spec.md, rules.md)
- 요구사항 `inception/requirements-analysis/requirements.md`(관측 NFR 없음)
- 계약 `inception/contract-design/contract-summary.md`(C3)
- 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 이 단계의 답 `nfr-requirements-questions.md`(Q1 A)

NC2는 지금 발행 로그(`publications-log.ts`, Nest Logger 'Publications', 사건마다 객체 한 줄)에 사건 하나만 더한다. 지표·추적·알림·대시보드는 더하지 않는다.

## 요구사항 (인셉션 NFR이 없는 관측 제약)

인셉션 NFR에 관측 항목이 없어 ID를 붙이지 않는다. Construction 규칙 「조용한 실패를 두지 않는다」와 이 단계 Q1 A에서 온다.

- **안전망 경고 줄:** 발행할 때 저장소 등록 행을 읽지 못해 `repositoryName`을 뺀 Catch가 있으면 경고 한 줄을 남긴다.
  - 새 사건 이름 하나(예: `SNAPSHOT_REPOSITORY_NAME_MISSING`, 이름은 코드 생성에서 다듬음)에 발행본 ID와 회원 ID만 싣는다.
  - 저장소 이름·제목·작성자 글·SQL은 싣지 않는다. 다른 칸은 지금 로그 줄 모양처럼 null로 둔다(team.md 「Code Style」).
  - 확인: 신뢰성 요구사항 NFR7.3과 같은 api 시험에서 경고 줄이 하나 남고 실린 값이 둘뿐이다.
  - 근거: BR1.1, Q1 A.

## 확인 사항

- **더 남기지 않는 것:** 고른 한계 수, `ownCommit` 수, 표지 판정 결과는 로그에 남기지 않는다. 사본에 그대로 남고, 화면 계산은 서버를 거치지 않는다.
- **지시 문장:** AI 지시를 바꿔도 지금 AI 실행 로그(`rag-answer-log.ts` 등)는 그대로다.
- **조용한 실패 없음:** 안전망 말고 새 실패 갈래는 없다. 새 읽기의 DB 오류는 지금처럼 발행 실패(`PUBLISH_FAILED`)로 남는다.

## Sources

- `construction/nc2-snapshot-fields/functional-design/rules.md`(BR1.1), `functional-spec.md`
- `inception/requirements-analysis/requirements.md` NFR8
- `inception/contract-design/contract-summary.md` C3
- `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- `nfr-requirements-questions.md` Q1 A
- 지금 코드: `api/src/publications/publications-log.ts`, `api/src/rag-answer/rag-answer-log.ts`
