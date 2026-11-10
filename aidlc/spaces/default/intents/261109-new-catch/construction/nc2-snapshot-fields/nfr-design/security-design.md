# NC2 면접관 사본 칸과 표지 — 보안 설계

입력:
- NFR 요구 `construction/nc2-snapshot-fields/nfr-requirements/security-requirements.md`(NFR2.1·NFR2.2·NFR5.1~NFR5.3), `reliability-requirements.md`, `tech-stack-decisions.md`
- 기능 설계 `construction/nc2-snapshot-fields/functional-design/functional-spec.md`, `rules.md`
- 계약 `inception/contract-design/contract-summary.md` C3·C6(2026-11-10 덧붙임)
- 보안 점검 `docs/CatchU_security_checks.md`
- 이 단계의 답 `nfr-design-questions.md`(Q1 A, Q2 A)

## 1. 권한과 데이터 범위 (NFR5.3)

- 발행은 지금처럼 전역 인증 Guard 아래에서 `c.owner_id = $1`인 Catch만 잠그고 읽는다.
- 새로 읽는 저장소 등록은 `analysis_request.registration_id`와 회원이 같은 행만 잇는다. 등록 표의 회원은 외래 키로 분석 요청의 회원과 같다.
- 소속 기록은 `member_id = $1`(발행하는 회원)과 `catch_id = ANY(고른 Catch)`로만 읽는다(성능 설계의 새 질의). 다른 회원·다른 Catch의 소속 기록은 읽히지 않으므로 `ownCommit`을 참으로 만들 수 없다.
- `ownCommit` 판정의 입력은 DB에 이미 있는 근거 주소와 소속 기록뿐이다. 작성자 글, worker 문장, 요청 입력은 판정에 쓰지 않는다.
- 시험: 회원 A의 Catch 근거에 회원 B의 Catch에 속한 커밋 주소가 있어도 `ownCommit`이 거짓이다. 같은 회원의 다른 Catch에 속한 커밋 주소도 거짓이다.

## 2. 입력과 SQL (보안 점검 「요청·메시지 입력」)

- 새 요청 입력은 없다. 새 질의 값(회원 ID, Catch ID 배열, 식별값 배열)은 모두 매개변수(`$n`)로 넘긴다.
- 식별값 배열은 근거 주소에서 `^[0-9a-f]{40}$`(소문자로 바꾼 뒤)에 맞는 것만 모은다. 그 밖의 주소는 배열에 넣지 않는다.

## 3. 화면 출력 (NFR5.1·NFR5.2)

- 저장소 이름, 작성 시점 글, 한계 항목, 표지 글자는 JSX의 글자 자식으로만 그린다. `dangerouslySetInnerHTML`과 HTML을 만드는 렌더링을 쓰지 않는다. 한계 문장 속 PR 번호·커밋 식별값은 링크로 만들지 않는다.
- 표지 요소: `<span className={styles.ownCommitMark}>이 작업의 본인 커밋</span>`. 모양은 지금 `kindBadge`(둥근 배경 상자, 12px 굵은 글자, 배경 `#eef2f7`·글자 `#34465e`)와 같은 값을 쓰고 새 색을 더하지 않는다. CSS 모듈에서 `kindBadge`와 같은 선언을 공유하는 이름을 하나 더한다(코드 생성에서 공유 방식을 정함).
- 흉내 글 구별: 작성자 글은 `LinkedText`가 글자로만 그리므로 「[이 작업의 본인 커밋]」을 써도 표지 클래스가 붙지 않는다. 시험은 표지 클래스(또는 `data-testid`)가 붙은 요소가 진짜 표지 수와 같고, 흉내 글은 그 요소 밖 글자인지 본다(AC7.2.6).
- 화면 낭독기에서 둘이 같은 글자로 들리는 것은 한계로 두고 기능 설계·README에 적는다(기능 설계 Q4 A).

## 4. 출처 구분과 AI 재료 (NFR2.1·NFR2.2)

- 조각 나누기(`chunker.ts`)와 요약 근거(`summary-sources.ts`)는 지금처럼 고른 칸만 읽으므로 코드를 바꾸지 않는다. 시험 하나를 더한다: 세 칸과 `ownCommit`, 표지가 붙을 링크가 든 사본으로 만든 조각·요약 근거 글자에 새 칸 값과 「이 작업의 본인 커밋」이 0건이다.
- 지시 문장: 「자료 종류가 작성자 자료 원문인 내용은 '작성자는 …라고 적었다'처럼 작성자의 말로 옮기고, 확인된 사실처럼 쓰지 않는다.」를 상수 하나로 두고 `QNA_INSTRUCTION`·`BASE_SUMMARY_INSTRUCTION`·JD 요약 지시 끝에 붙인다. 근거 딱지 상수(`ai-generation.types.ts`의 `SOURCE_LABELS`, 둘)는 그대로다.
- 작성자 글은 지금처럼 '작성자 자료 원문' 인용 문서로만 가고 지시와 섞지 않는다(보안 점검 「LLM·검색 기능」).

## 5. 로그와 오류 (보안 점검 「로그·오류 응답」)

- 안전망 경고 줄은 발행이 성공한 뒤에만 남기고 발행본 ID·회원 ID만 싣는다(Q1 A, 관측 설계). 저장소 이름·제목·작성자 글·SQL은 싣지 않는다.
- 새 오류 응답은 없다. 새 질의가 실패하면 지금처럼 발행 실패(500 `INTERNAL_ERROR`, `PUBLISH_FAILED` 로그)다.

## 6. 문장 대조 시험 (C6, 위협 「문구 바뀜으로 조용히 사라지기」)

- 한계 문장 상수 넷은 api 한 파일에 두고, 시험이 `worker/app/candidates/build.py` 글자에서 따옴표 경계째 찾는다(신뢰성 설계 3절). 본인 커밋 판정은 문장을 쓰지 않으므로 이 위협에서 빠진다.

## Sources

- `construction/nc2-snapshot-fields/nfr-requirements/security-requirements.md`, `reliability-requirements.md`, `tech-stack-decisions.md`
- `construction/nc2-snapshot-fields/functional-design/rules.md`(BR1.4, BR1.5, BR3.1~BR3.3, BR4.1~BR4.5, BR5.1), `functional-spec.md`
- `inception/contract-design/contract-summary.md` C3·C6
- `docs/CatchU_security_checks.md`
- `nfr-design-questions.md` Q1 A, Q2 A
- 지금 코드: `api/src/publications/publish.service.ts`, `api/src/catches/entities/commit-assignment.entity.ts`, `api/src/published-index/chunker.ts`, `api/src/rag-answer/summary-sources.ts`, `api/src/rag-answer/rag-answer-config.ts`, `api/src/jd-summary/jd-generation-request.ts`, `web/src/features/publications/snapshot-view.tsx`, `web/src/features/publications/publications.module.css`
