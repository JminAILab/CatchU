# NC3 다시 볼 곳 사실과 작업 시각 — 보안 요구사항

입력:
- 기능 설계 `construction/nc3-revisit-facts/functional-design/`(functional-spec.md, rules.md, entities.md)
- 요구사항 `inception/requirements-analysis/requirements.md`(NFR2, NFR5, FR12.2, FR12.3, FR14.3)
- 계약 `inception/contract-design/contract-summary.md`(C2·C4·C5)
- 보안 점검 `docs/CatchU_security_checks.md`(API 경로·권한, 요청·메시지 입력, 화면 출력, 로그·오류 응답)
- 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 이 단계의 답 `nfr-requirements-questions.md`(Q1 B와 덧붙임, Q2 B와 덧붙임, Q3 A, Q4 A)

NC3는 새 API 경로, 새 비밀값, 인증 방식 변경, 새 외부 호출이 없다. 바뀌는 것은 넷이다.
- worker가 이미 받은 커밋 기록에서 사실을 계산해 결과 메시지에 싣는다.
- api가 결과의 새 칸을 검사해 `catch_asset`에 저장한다.
- 본인 응답에 사실이 붙고, 본인 목록 순서와 커서가 바뀐다.
- 지원자 상세가 사실을 글자와 github.com 커밋 링크로 그린다.

## 인셉션 NFR2(출처 구분)에서 물려받는 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR2.1 | 다시 볼 곳 사실과 첫·마지막 작업 시각은 발행 사본, 공개 Catch 응답, Claude 연결 읽기, 받은 사람 AI 재료(검색 조각·요약 근거)에 들지 않는다. 이 셋은 지금 읽는 칸을 하나하나 적은 질의라 새 칸을 더하지 않는다. | api 시험: 사실과 시각이 든 Catch를 발행한 사본, 그 사본으로 만든 조각·요약 근거, 공개 Catch 응답에 사실의 경로·커밋 식별값과 시각 글자가 0건이다(AC9.4.1, AC11.1.4). | NFR2, BR6.3 |

## 인셉션 NFR5(화면 출력 안전)에서 물려받는 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR5.1 | 「다시 볼 곳」 항목의 경로·커밋 식별값·문장은 React 텍스트로만 그린다. `dangerouslySetInnerHTML`과 HTML을 만드는 렌더링을 쓰지 않는다. | 화면 시험: 태그 꼴 글자가 든 경로가 글자 그대로 보인다. 코드 검토: 바뀐 파일에 `dangerouslySetInnerHTML`이 없다. | NFR5, BR9.2, 보안 점검 「화면 출력」 |
| NFR5.2 | 커밋 링크는 실제 자료(LIVE·api) 화면에서, 꼴을 검사한 저장소 이름(`^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$`, 저장소 부분이 `.`·`..` 아님)과 소문자 16진수 40자 식별값으로만 만든 `https://github.com/...` 주소다. 호스트는 코드에 고정하고 `rel="noopener noreferrer"`를 붙인다. 그 밖에는 링크를 만들지 않고 글자로 그린다. | 화면 시험: 꼴이 틀린 저장소 이름(`a/b/c`, `..`, 공백), 합성(MOCK) Catch, 이름 불러오기 실패에서 링크가 없다(AC9.1.4). | NFR5, BR9.3, 보안 점검 「화면 출력」 |

## 확인 사항 (인셉션 NFR이 없는 보안 제약)

- **권한:**
  - 본인 목록·상세는 지금처럼 전역 인증 Guard 아래에서 인증 회원의 Catch만 읽는다(`c.owner_id = $1`). 새 칸도 같은 조회에서만 읽는다.
  - 커서는 위치일 뿐 권한 증명이 아니다(지금 그대로). 범위 값에 회원이 들어 있어 남의 커서는 400이다(NC1 BR5.2 범위 값 그대로).
  - 확인: 회원 두 명 시험에서 남의 Catch 사실이 내 목록·상세에 나오지 않고, 남이 만든 커서를 보내면 400이다.
- **입력(결과 메시지):** worker 결과는 api가 믿지 않는 입력으로 다룬다.
  - 계약 검사(Ajv)가 모양을 본다. 모르는 칸 거부, kind 다섯 값, 식별값 꼴, 사실 30개, 경로 1~1,024자, 시각 꼴이다.
  - 등록 입력 검사가 더 본다. 종류별 경로·커밋 개수(entities.md RevisitFact), 사실의 커밋이 그 후보의 `ownCommitShas` 안인지, `firstWorkAt ≤ lastWorkAt`이다.
  - 받은 값은 오류에 싣지 않는다(지금 `CatchRegistrationInputError`처럼).
  - 확인: api 시험이 각 위반을 따로 넣어 등록이 하나도 되지 않음을 본다(S19).
- **입력(요청):**
  - 새 요청 조건은 없다.
  - 커서 `after.lastWorkAt`은 null이거나 `new Date(x).toISOString() === x`인 글만 받고, SQL에는 매개변수(`$n`)로만 넘긴다.
  - 정렬 조각은 고정 SQL이다.
- **응답 검사(web):**
  - web은 `revisitFacts`의 모양과 종류별 개수를 검사한다. 맞지 않으면 그 응답을 받지 못한 것으로 본다.
  - 개수가 맞는 응답에서만 `commits[0]`·`commits[1]`을 쓴다(기능 설계 점검 지적 2).
- **비밀·원문:**
  - 비밀 파일 경로는 판정에서 뺀다(BR2.3 (6), worker `redact.is_secret_path`).
  - 바뀐 줄 글자는 판정 안에서만 쓰고 결과·DB·로그에 담지 않는다. 남는 것은 경로·커밋 식별값·종류뿐이다(ADR-002).
- **로그·오류:**
  - 판정 실패 로그(관측 요구사항 NFR4.3)에는 요청·시도 ID와 예외 종류 이름만 싣는다. 경로·줄 글자·커밋 메시지는 싣지 않는다(Q1 덧붙임, 보안 점검 「로그·오류 응답」).
  - 이 예외를 오류 응답으로 바꾸지 않는다.
- **팀 규칙의 예외(Q1 B):**
  - RevisitFacts 판정 안의 예외만 그 후보의 사실을 빈 배열로 두고 분석을 이어간다. 본인 커밋 기록을 찾지 못한 결함도 같다.
  - 보안 점검의 「예외를 삼키지 않는다」와 팀 규칙 「Code Style」의 예외는 이 한 곳이다. 코드 주석과 PR 「리뷰 요청」에 까닭(같은 입력이면 늘 같은 결과라 다시 분석해도 같은 자리에서 실패하고, 칸 하나 때문에 그 저장소의 Catch를 모두 잃음)을 적는다.
  - 다른 단계(수집·후보 판정·생성·결과 조합)의 예외는 지금 그대로 올린다.
- **고지:**
  - 사실(종류·파일 경로·커밋 식별값)을 Catch에 남기므로 고지 v3 4절에 한 줄을 더하고, 그 PR에서 팀장이 승인한다(BR10.1, C5).
  - 작업 시각을 적을지는 그 PR에서 정한다.

## 위협 고려

- **남의 커밋을 내 사실로 붙이기:**
  - 사실은 같은 후보의 본인 커밋끼리만 보고, api가 사실의 커밋이 그 후보 `ownCommitShas` 안인지 다시 본다.
  - 다른 계정 커밋과 다른 작업의 커밋으로는 사실이 생기지 않는다(BR2.1, BR5.2).
- **면접관에게 새기:** 사실과 시각은 사본·공개 응답·AI 재료에 없다(NFR2.1). 면접관 화면과 받은 사람 AI가 볼 길이 없다.
- **경로로 화면 꾸미기:** 저장소 경로 이름은 지원자 본인 저장소에서 온 것이고 본인만 본다. React 텍스트라 태그가 그려지지 않는다(NFR5.1).
- **링크 바꿔치기:** 링크 주소는 고정 호스트와 꼴을 검사한 이름·식별값으로만 만든다. 결과 메시지나 저장 값에 주소가 없다(NFR5.2).
- **조용한 사실 빠짐:** Q1 B로 예외가 나면 사실이 빈다. 빌드와 시험 때 실패 로그 0줄을 확인해 결함이 숨지 않게 한다(관측 요구사항 NFR4.3).

## 해당하지 않는 것

- **NFR1:** 성능 요구사항 NFR1.1~NFR1.3.
- **NFR3:** NC2 빌드와 시험에서 잰다. NC3는 받은 사람 AI를 바꾸지 않는다.
- **NFR4:** 관측 요구사항 NFR4.1~NFR4.3.
- **NFR6:** 성능 요구사항 「그 밖의 품질 요구」 NFR6.1.
- **NFR7·NFR8:** 신뢰성 요구사항.

## Sources

- `construction/nc3-revisit-facts/functional-design/rules.md`(BR2.3, BR5.2, BR6.3, BR7.2, BR8.1, BR9.2, BR9.3, BR10.1), `functional-spec.md`, `entities.md`
- `inception/requirements-analysis/requirements.md` NFR2, NFR5, FR12.2, FR12.3, FR14.3, FR15.2
- `inception/contract-design/contract-summary.md` C2·C4·C5
- `docs/CatchU_security_checks.md`
- `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- `construction/nc3-revisit-facts/nfr-requirements/nfr-requirements-questions.md` Q1~Q4
