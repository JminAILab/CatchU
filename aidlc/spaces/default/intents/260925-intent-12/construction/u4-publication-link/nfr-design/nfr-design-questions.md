# U4 발행·링크 — 비기능 설계 질문

입력: [U4 비기능 요구사항](../nfr-requirements/)(성능·보안·규모·신뢰성·관측·기술 선택), [U4 기능 명세](../functional-design/functional-spec.md), [계약 요약](../../../inception/contract-design/contract-summary.md)의 C-10·C-11·C-12, 10월 구현 `api/src/share-links/`·`api/src/recipient/`·`web/src/features/recipient/`.

이미 정해진 것(다시 묻지 않음):

- 비기능 요구사항 단계에서 승인한 값과 미결은 그대로다. 임시값(전체 글 60,000자·발행 1분 10회·Q2 세부 식별자)과 OQ-U4-2~7, OQ-U4-NFR-1~4는 이 단계에서 정하지 않는다.
- C-10 `PublicationAccess`는 `api/src/publications`에 둔다(계약). 받은 사람 화면은 `web/src/app/s/[token]`, grant 보관은 10월 `recipient-grants`다(C-11).
- 캐시·회로 차단기·자동 재시도·공유 저장소 제한기·지표·대시보드는 두지 않는다(비기능 요구사항 NFR4.7·NFR4.13·NFR5.2·NFR6).
- 로그는 10월 api 방식(Nest `Logger`, 한 줄, 정해진 칸만)을 따른다.
- 승인된 기능 설계 W4-5 화면 순서에 C-11 0번 `RecipientGuide`를 더하는 것은 이 단계의 입력 변경으로 반영한다(재승인 아님).

## Q1. [설계] api에서 10월 공유 링크 코드를 어떻게 이어 쓸까

BR9.1은 10월 공유 링크 발급·목록·중지와 공개 Catch 목록·상세 경로를 발행본 흐름으로 바꾼다. 10월 `api/src/share-links/`에는 그대로 쓸 도구(토큰 `link-token`, 비밀번호 `link-password`, grant `link-grant`, 빈도·시도 제한기, `client-address`, `hash-gate`)와 바꿀 부분(발급·목록·중지 서비스, `share_link` 기반 `LinkAccessService`, `api/src/recipient/`의 공개 Catch 경로)이 섞여 있다.

A. 새 `api/src/publications` 모듈이 C-10·발행·작성자 API·받은 사람 경로를 모두 갖고, 그대로 쓸 도구는 `share-links` 폴더에서 바로 import한다. 바꿀 부분은 U4 본체 반영 때 앱에서 빼고 지운다. `share_link` 표는 건드리지 않는다(OQ-U4-3) — 파일 이동이 없어 가장 단순하다. 다만 지운 뒤 `share-links` 폴더에는 도구만 남아 이름과 내용이 어긋난다.
B. A와 같되, 그대로 쓸 도구를 공용 폴더(예: `api/src/link-security`)로 옮기고 10월 시험 import 경로도 함께 바꾼다 — 이름과 내용이 맞지만 파일 이동과 시험 경로 변경만큼 공수가 는다(대략 반나절).
C. 10월 `share-links` 모듈을 고쳐 발행본을 다루게 한다 — 계약 C-10의 자리(`api/src/publications`)와 달라 계약 수정이 필요하다.
X. Other (please specify)

[Answer]: A. API는 `api/src/publications`에 만든다. `share-links`에서는 기존 테이블·API에 의존하지 않는 도구만 재사용한다. 순환 의존이나 `ShareLinksModule` 전체 등록이 필요해지면 공용 도구 분리(B)를 다시 검토한다. 기존 공개 경로 제거는 W6에 연결하고, #421 계약과 #416 안내 조율 결정을 반영한다. 미결 사항은 임의로 확정하지 않는다.

## Q2. [설계] web 받은 사람 화면을 어디에 만들까

10월 `web/src/features/recipient/`에는 grant 보관(`recipient-grants`), unlock·화면 상태, 근거 링크 판정(`isGithubSourceUrl`)과 공개 프로필·공개 Catch 목록·상세 화면이 함께 있다. 발행본 화면은 판정·비밀번호 흐름은 같고 보여 주는 자료와 붙는 자리(C-11)가 다르다.

A. 10월 `features/recipient/`를 발행본 화면으로 고쳐 쓴다. 판정·unlock·grant 보관·근거 링크 판정은 유지하고, 공개 프로필·Catch 목록·상세 화면과 `/s/[token]/catches/[catchId]` 경로는 지운다 — 기존 시험(`web/test/recipient.test.mjs`)의 판정·grant 부분을 그대로 이어 쓸 수 있어 가장 단순하다.
B. 새 폴더(예: `features/publication-view/`)를 만들고 10월 폴더에서 필요한 것만 옮긴 뒤 10월 폴더를 지운다 — 구조가 새로 깔끔해지지만 시험·import 정리 공수가 는다.
X. Other (please specify)

[Answer]: A. `features/recipient`를 고쳐 쓰되 기존 판정·unlock·grant·근거 링크 동작과 시험을 유지한다. 기존 공개 경로 제거는 W6에 연결하고, #421 계약과 #416 안내 조율 결정을 반영한다. 미결 사항은 임의로 확정하지 않는다.

## 답 분석

- 확인: Q1 A가 재사용할 도구(`link-token`·`link-password`·`link-grant`·`request-rate-limiter`·`unlock-limiter`·`unlock-policy`·`link-limiter`·`client-address`·`hash-gate`)는 `node:crypto`·`node:net`·`common/node-env`와 같은 폴더 도구만 import한다. `share_link` 표·`ShareLinksModule`·`LinkAccessService`에 의존하지 않으므로 순환 의존과 모듈 전체 등록이 필요 없다. 공용 도구 분리(B) 재검토 조건에 해당하지 않는다.
- 모순·모호한 답은 없다.

## Consolidated Summary Confirmation

- api 구조(Q1 A): 발행·작성자 API·받은 사람 경로·C-10 `PublicationAccess`는 새 `api/src/publications` 모듈에 둔다. `share-links`에서는 표·API에 의존하지 않는 도구(토큰·비밀번호·grant·빈도·시도 제한기·주소·해시 관문)만 import한다. 순환 의존이나 `ShareLinksModule` 전체 등록이 필요해지면 공용 폴더 분리를 다시 검토한다.
- web 구조(Q2 A): `features/recipient`를 발행본 화면으로 고쳐 쓴다. 판정·unlock·grant 보관·근거 링크 판정 동작과 그 시험은 유지한다.
- 10월 공개 경로(발급·목록·중지 API, 공개 프로필·Catch 목록·상세)의 제거는 W6에 연결한다. `share_link` 표는 건드리지 않는다(OQ-U4-3).
- #421 C-11(0번 `RecipientGuide`, 안내 중복 통과 조건 G1~G7)과 #416 안내 조율(U2 `fixed-copy` 유지, U4 고정 안내는 발행 시각 위주)을 반영한다. W4-5 화면 순서에 0번 자리를 더하는 것은 입력 변경으로 적는다.
- 그 밖의 설계는 비기능 요구사항 그대로다: 캐시·회로 차단기·자동 재시도·공유 저장소 제한기·지표 없음, 로그는 10월 Nest `Logger` 한 줄 방식. 임시값과 OQ-U4-2~7, OQ-U4-NFR-1~4는 미결로 둔다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
