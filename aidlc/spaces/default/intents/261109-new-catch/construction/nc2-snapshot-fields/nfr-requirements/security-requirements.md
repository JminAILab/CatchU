# NC2 면접관 사본 칸과 표지 — 보안 요구사항

입력:
- 기능 설계 `construction/nc2-snapshot-fields/functional-design/`(functional-spec.md, rules.md, entities.md)
- 요구사항 `inception/requirements-analysis/requirements.md`(NFR2, NFR5)
- 계약 `inception/contract-design/contract-summary.md`(C3·C6, 2026-11-10 덧붙임 포함)
- 보안 점검 `docs/CatchU_security_checks.md`(API 경로·권한, 요청·메시지 입력, 화면 출력, 로그·오류 응답, LLM·검색 기능)
- 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 이 단계의 답 `nfr-requirements-questions.md`(Q1 A, Q2 A와 덧붙임)

NC2는 새 API 경로, 새 비밀값, 인증 방식 변경, 새 외부 호출이 없다. 바뀌는 것은 넷이다.
- 발행 사본에 선택 칸 넷이 붙어 면접관에게 새 글이 보인다.
- 사본 보기가 표지를 그린다.
- 발행이 저장소 등록과 소속 기록을 더 읽는다.
- 받은 사람 AI 지시 셋에 문장 하나가 붙는다.

## 인셉션 NFR2(출처 구분)에서 물려받는 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR2.1 | 사본 새 칸 넷(저장소 이름·작성 시점·작업 전체 한계·근거별 `ownCommit`)과 링크 이름·표지 글자는 받은 사람 AI 재료(검색 조각·요약 근거)에 들지 않는다. 조각 나누기와 요약 근거는 지금 고르는 칸만 읽으므로 코드를 바꾸지 않고 시험만 더한다. | api 시험: 세 칸과 표지 대상 링크가 든 사본 하나로 만든 조각과 요약 근거에서 새 칸 글자와 「이 작업의 본인 커밋」이 0건이다(AC6.5.1, AC6.5.2). | NFR2, BR1.5, BR4.7 |
| NFR2.2 | 받은 사람 AI 근거 딱지는 'GitHub 기록 원문'과 '작성자 자료 원문' 둘 그대로다. 지시에 붙는 문장은 작성자 자료 원문을 「작성자는 …라고 적었다」로 옮기게 할 뿐 딱지를 늘리지 않는다. | api 시험: 세 지시 끝에 같은 문장이 붙고 딱지 상수가 둘이다(AC6.5.3). 답의 말투는 빌드와 시험의 질의응답 10개 다시 재기에서 본다(NFR3). | NFR2, BR5.1, BR5.2 |

## 인셉션 NFR5(화면 출력 안전)에서 물려받는 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR5.1 | 저장소 이름, 작성 시점 글, 「이 기록으로 알 수 없는 것」 항목, 표지 글자는 React 텍스트로만 그린다. `dangerouslySetInnerHTML`과 HTML을 만드는 렌더링을 쓰지 않는다. 한계 문장에 든 PR 번호·커밋 식별값도 글자로만 그리고 링크로 만들지 않는다. | 화면 시험: 태그 꼴 글이 든 한계 항목이 글자 그대로 보인다. 코드 검토: 바뀐 파일에 `dangerouslySetInnerHTML`이 없다. | NFR5, BR3.1~BR3.3, 보안 점검 「화면 출력」 |
| NFR5.2 | 진짜 표지는 지금 종류 표지와 같은 상자 모양이고, 작성자가 글에 쓴 「[이 작업의 본인 커밋]」은 React 텍스트라 상자가 없고 대괄호가 보인다. 화면 낭독기에서는 둘이 같은 글자로 들리는 것을 한계로 둔다(숨은 앞말도 흉내 낼 수 있어 두지 않음). | 화면 시험: 흉내 글이 든 발행본에서 흉내 글에는 표지 모양이 없고 진짜 표지와 요소가 다르다(AC7.2.6). | NFR5, BR4.5, 기능 설계 Q4 A |
| NFR5.3 | 표지는 사본 근거 가운데 `ownCommit`이 참인 근거와만 견주고, `ownCommit`은 발행할 때 그 Catch 주인의 소속 기록(회원·저장소·catch_id가 같은 `commit_assignment`)으로만 정한다. 다른 회원이나 다른 Catch에 속한 커밋으로는 참이 되지 않는다. 판정을 지원자 글이나 worker 문장에 맡기지 않는다. | api 시험: 다른 Catch에 속한 본인 커밋 주소 근거, 병합 커밋 근거, PR·이슈 근거가 거짓이다. 화면 시험: 다른 저장소의 같은 식별값, 둘과 맞는 짧은 식별값에 표지가 없다(AC7.2.1~AC7.2.3). | NFR5, BR1.4, BR4.1~BR4.3, 프로젝트 규칙 「본인 기여 표시」 |

## 확인 사항 (인셉션 NFR이 없는 보안 제약)

- **권한:** 발행은 지금처럼 전역 인증 Guard 아래에서 그 회원의 Catch만 잠그고 읽는다. 새로 읽는 저장소 등록과 소속 기록도 같은 회원 조건으로 읽는다(`analysis_request`의 회원·`registration_id` 외래 키, `commit_assignment.member_id`).
  - 확인: 회원 두 명 시험에서 남의 소속 기록이 내 사본의 `ownCommit`을 참으로 만들지 않는다.
- **입력:** 새 요청 입력은 없다. 새 SQL 조건은 매개변수(`$n`)로만 넘긴다.
- **면접관에게 새로 보이는 것:** 저장소 이름은 이미 근거 링크 주소에 있는 「소유자/저장소」다. 작업 전체 한계 문장에는 같은 저장소의 PR 번호와 커밋 식별값 앞 12자가 든다. 지금 사본 근거 링크에도 같은 저장소의 커밋 식별값이 보이므로 새로 드러나는 것은 없다. 근거마다의 조회 상태 문장은 담지 않는다(FR9.3).
- **로그·오류:** 안전망 경고 한 줄(관측 요구사항)에는 발행본 ID와 회원 ID만 싣고, 저장소 이름·제목·작성자 글은 싣지 않는다(team.md 「Code Style」, 보안 점검 「로그·오류 응답」).
- **AI 지시:** 붙이는 문장은 고정 상수다. 작성자 글은 지금처럼 '작성자 자료 원문'으로 표시한 인용 문서로 보내고 지시와 섞지 않는다(보안 점검 「LLM·검색 기능」). JD 요약 지시는 U10 영역이라 NC2 PR에서 U10 담당 확인을 받는다.

## 위협 고려

- **표지 흉내:** 작성자가 글로 표지를 써서 면접관을 속이려 할 수 있다. 화면 모양이 달라 보이는 사람은 가른다. 화면 낭독기 사용자는 가르지 못한다(NFR5.2, 한계).
- **남의 커밋에 표지 붙이기:** 작성자가 남의 커밋 링크를 붙여도, 이 Catch 소속 기록에 없으면 표지가 없다. 병합 커밋과 PR 마지막 커밋도 소속 기록에 없다(NFR5.3).
- **문구 바뀜으로 조용히 사라지기:** 본인 커밋 여부는 문장 대조를 쓰지 않으므로 worker 문구와 무관하다. 한계 문장 넷은 따옴표 경계째 대조 시험이 막는다(신뢰성 요구사항 NFR8.2).
- **AI 지시 주입:** 사본 새 칸은 AI 재료에 들지 않으므로 새 주입 경로가 생기지 않는다(NFR2.1).

## 해당하지 않는 것

- **NFR1:** 성능 요구사항 NFR1.1·NFR1.2.
- **NFR3:** 빌드와 시험에서 잰다.
- **NFR4:** NC3 빌드와 시험에서 잰다.
- **NFR6:** 성능 요구사항 「그 밖의 품질 요구」. **NFR7·NFR8:** 신뢰성 요구사항.

## Sources

- `construction/nc2-snapshot-fields/functional-design/rules.md`(BR1.4, BR1.5, BR3.1~BR3.3, BR4.1~BR4.7, BR5.1, BR5.2), `functional-spec.md`, `entities.md`
- `inception/requirements-analysis/requirements.md` NFR2, NFR5, FR9.3, FR10.1
- `inception/contract-design/contract-summary.md` C3·C6(2026-11-10 덧붙임)
- `docs/CatchU_security_checks.md`
- `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- `nfr-requirements-questions.md` Q1 A, Q2 A와 덧붙임
- 지금 코드: `api/src/publications/publish.service.ts`, `api/src/catches/entities/commit-assignment.entity.ts`, `api/src/published-index/chunker.ts`, `api/src/rag-answer/summary-sources.ts`, `api/src/ai-generation/ai-generation.types.ts`, `worker/app/candidates/build.py`
