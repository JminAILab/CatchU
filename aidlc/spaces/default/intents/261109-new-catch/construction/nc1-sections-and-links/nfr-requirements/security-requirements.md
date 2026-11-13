# NC1 칸 제목과 링크 이름 — 보안 요구사항

입력:
- 기능 설계 `construction/nc1-sections-and-links/functional-design/`(functional-spec.md, rules.md, frontend-components.md)
- 요구사항 `inception/requirements-analysis/requirements.md`(NFR2, NFR5)
- 계약 `inception/contract-design/contract-summary.md`(C1·C7)
- 보안 점검 `docs/CatchU_security_checks.md`(API 경로·권한, 요청·메시지 입력, 화면 출력, 로그·오류 응답)
- 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 이 단계의 답 `nfr-requirements-questions.md`(Q1 A, Q2 A)

NC1은 새 외부 호출, 새 저장 칸, 새 비밀값, 인증 방식 변경이 없다. 바뀌는 것은 셋이다.
- 지원자가 쓴 글과 링크 주소를 칸별·이름으로 그리는 화면
- 본인 목록의 새 조건 하나(`authorDescription`)와 응답 칸 하나(`hasAuthorDescription`)
- 발행 화면이 저장소 목록을 함께 읽는 것

## 인셉션 NFR2(출처 구분)에서 물려받는 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR2.1 | 링크 이름은 화면에서만 계산하고 저장된 글·사본·API 응답에 넣지 않는다. 그래서 받은 사람 AI의 검색 조각과 요약 근거에는 지금처럼 원래 주소가 든 작성자 글만 들어간다. 칸 제목 줄은 저장된 글의 일부라 AI 재료에 그대로 들어가고, 근거 딱지는 지금처럼 「작성자 자료 원문」이다. | 공통 함수 시험: 링크 이름 계산이 입력 글을 바꾸지 않는다. 사본 시험: 칸 제목 줄이 든 글을 발행해도 사본의 `authorDescription`이 저장된 글과 같다(AC2.2.10). | NFR2, BR2.8, FR1.6 (a) |

## 인셉션 NFR5(화면 출력 안전)에서 물려받는 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR5.1 | 작성자 글, 칸 제목, 링크 이름, `title`의 주소는 React 텍스트와 속성 값으로만 그린다. `dangerouslySetInnerHTML`과 HTML을 만드는 마크다운 렌더링은 쓰지 않는다. 칸 제목 줄도 글자 대조로만 읽고 HTML이나 마크다운으로 해석하지 않는다. | 화면 시험: `<script>`·태그 꼴 글을 칸에 쓰고 발행본에서 글자 그대로 보인다. 코드 검토: 새 파일에 `dangerouslySetInnerHTML`이 없다. | NFR5, BR1.1, BR7.1, 보안 점검 「화면 출력」 |
| NFR5.2 | 링크 이름에서 퍼센트 디코딩으로 풀린 글자 가운데 제어 문자와 보이지 않는 서식 문자(줄바꿈·탭·영폭·방향 바꿈 문자 등)를 지운다. 풀리지 않는 마디는 원문 그대로 보인다. | 공통 함수 시험(AC2.2.5, AC2.2.8): `%E0%A4`가 그대로 보이고, `%0A`·`%E2%80%AE` 같은 글자가 이름에 없다. | NFR5, BR2.5 |
| NFR5.3 | 링크는 지금 판별 규칙(`isGithubSourceUrl`: https, `github.com`, 계정 정보 없음)을 통과한 주소만 만든다. `href`와 `title`은 원래 주소 그대로이고, `target="_blank"`와 `rel="noopener noreferrer"`를 붙인다. 판별을 통과하지 못한 글은 링크가 아닌 글자다. 지금 판별 규칙은 포트를 보지 않아 `https://github.com:8443/…`도 링크가 된다. 판별 규칙은 바꾸지 않으므로(BR2.1), 포트가 붙은 주소는 표에 맞지 않는 꼴로 보고 이름 대신 주소 전체를 보인다. | 화면 시험: `http://github.com/…`, `https://user@github.com/…`, `javascript:` 꼴이 링크가 되지 않는다(지금 판별 규칙 시험을 그대로 둔다). 링크 요소에 두 속성이 있다. 공통 함수 시험: `https://github.com:8443/o/r/blob/ba6bba8/a.ts#L3`의 이름이 주소 전체다. | NFR5, BR2.1, BR2.7, 보안 점검 「화면 출력」 |
| NFR5.4 | 이름은 주소에서만 만든다. 표에 맞지 않는 주소는 주소 전체를 보이고, 다른 저장소 링크는 이름 앞에 그 저장소를 붙인다. 그래서 이름이 실제 링크 대상과 다른 곳을 가리키는 것처럼 보이지 않는다. 표지 흉내 글(「[이 작업의 본인 커밋]」)과 진짜 표지를 가르는 일은 표지를 만드는 NC2가 맡는다. | 공통 함수 시험(AC2.2.3과 표에 맞지 않는 주소 갈래). | NFR5, BR2.2, BR2.4 |

## 확인 사항 (인셉션 NFR이 없는 보안 제약)

- **권한:** 본인 목록·상세는 지금처럼 전역 인증 Guard 아래에서 `c.owner_id = $1`로 그 회원의 Catch만 읽는다. 새 조건은 이 범위 안에서만 거른다.
  - 확인: 회원 두 명 시험에서 `authorDescription=written`으로도 남의 Catch가 나오지 않는다.
- **입력:** `authorDescription`은 `written`·`unwritten` 둘만 받고, 그 밖의 값과 정의하지 않은 질의 키는 400이다(BR5.1). SQL은 값을 문자열로 잇지 않는다. 조건은 고정된 두 SQL 조각 가운데 하나를 고르는 것이다.
  - 확인: 잘못된 값·빈 값·배열 값 400 시험.
- **커서:** 커서의 범위 해시에 회원·저장소·요청·작성자 설명 조건을 넣는다. 다른 조건이나 다른 회원으로 만든 커서, `v: 1` 커서는 400이다(BR5.2). 커서로 남의 목록 위치를 알아낼 수 없다.
  - 확인: 조건을 바꾼 커서와 다른 회원 커서 400 시험(AC4.1.2).
- **응답 칸:** `hasAuthorDescription`은 본인 목록·상세 응답에만 싣는다. 공개 Catch 응답과 공개 목록은 지금 그대로다. 공개 쪽이 본인 응답 변환을 함께 쓰는 곳은 코드 생성에서 확인해, 공개 응답에 새 칸이 새지 않게 한다(기능 설계 R-03).
  - 확인: 공개 Catch 응답·공개 목록 시험이 그대로 통과하고 새 칸이 없다.
- **로그·오류:** 작성자 설명 원문과 링크 주소를 운영 로그와 오류 응답에 남기지 않는다(team.md 「Code Style」, 보안 점검 「로그·오류 응답」). 400 응답에 받은 질의 값을 되돌려 싣지 않는다.
- **안내 문구:** 편집 영역에 「이 글은 링크를 가진 누구나 보고 외부 AI로도 보냅니다. 다른 사람의 이름·평가와 비밀값은 쓰지 마세요.」를 보인다(BR4.3). 비밀값 검사는 더하지 않는다. 작성자 글은 지금처럼 본인 자료로 첫 이용 동의 아래 보낸다(보안 점검 「LLM·검색 기능」).

## 위협 고려

- **화면 삽입:** 칸 글이나 경로에 태그 꼴 글이 들어올 수 있다. React가 글자로 그린다(NFR5.1).
- **보이지 않는 글자로 이름 속이기:** 방향 바꿈 문자로 파일 이름을 뒤집어 보이게 할 수 있다. 이름에서 지운다(NFR5.2).
- **링크 대상 속이기:** 이름은 주소에서만 만들고, 마우스를 올리면 주소 전체가 보인다. 키보드·터치로는 이름만으로 주소 전체를 볼 수 없는 것은 한계다(BR2.7).
- **창 가로채기:** 새 탭 링크에 `rel="noopener noreferrer"`를 붙여 열린 창이 원래 창을 바꾸지 못한다(NFR5.3).
- **AI 지시 주입:** 작성자 글은 지금도 받은 사람 AI 재료다. 칸 제목 줄이 더해질 뿐 재료로 가는 길은 바뀌지 않는다. 12월 AI의 「신뢰할 수 없는 자료」 표시를 그대로 따른다.
- **남의 목록 엿보기:** 조건과 커서는 회원 범위 안에서만 쓴다(확인 사항 「권한」·「커서」).

## 해당하지 않는 것

- **NFR1(호출과 수집):** 성능 요구사항 NFR1.1·NFR1.2에서 다룬다.
- **NFR3(질의응답 재측정):** NC2 빌드와 시험에서 잰다.
- **NFR4(규칙 사실 대조):** NC3 빌드와 시험에서 잰다.
- **NFR6~NFR8(접근성·호환·시험):** 성능 요구사항의 「그 밖의 품질 요구」에서 다룬다.

## Sources

- `construction/nc1-sections-and-links/functional-design/rules.md`(BR1.1, BR2.1~BR2.8, BR4.3, BR5.1~BR5.3, BR7.1), `functional-spec.md`, `frontend-components.md`, `reviews/review-01.md`(R-03)
- `inception/requirements-analysis/requirements.md` NFR2, NFR5, FR1.6
- `inception/contract-design/contract-summary.md` C1·C7
- `docs/CatchU_security_checks.md`
- `nfr-requirements-questions.md` Q1 A, Q2 A
- 지금 코드: `web/src/lib/github-source-url.ts`, `api/src/catches/owner-catch-input.ts`, `api/src/catches/owner-catch-store.ts`
