# U10 보안 설계

인증·링크 접근·본인 자료 격리·외부 AI·브라우저 출력의 책임을 기존 공용 계약에 배치한다. 비기능 요구사항 단계가 승인된 상태이며, 이 설계의 승인은 별도다.

## S1 요청별 권한 경계

대응: NFR1.1, NFR1.2, NFR1.4.

JD CRUD는 기존 회원 인증 Guard를 거쳐 인증 회원의 memberId를 서비스에 전달한다. 입력 DTO는 허용 필드·ID 형식·UTF-16 상한을 검사하고 정의하지 않은 필드를 거부한다. 저장·조회는 매개변수 쿼리로 수행하며 클라이언트의 memberId를 소유자로 사용하지 않는다.

요약 접수·목록·상세는 회원 인증 후 C-10 resolveForRecipient(token, grant, now)를 매 요청 호출한다. 반환된 publicationId와 인증 회원을 조회 조건으로 묶고, 상세는 runId까지 함께 확인한다. 실행자와 JD 소유자는 같아야 하지만 발행본 작성자와 실행자는 달라도 된다. 작성자에게 resolveForOwner로 바꾸는 우회 경로를 제공하지 않는다.

| 경계 실패 | 전달할 결과 | 민감자료 처리 |
|---|---|---|
| 회원 인증 없음·만료 | AUTH_REQUIRED 또는 AUTH_INVALID | JD·실행 조회 전에 종료 |
| C-10 비밀번호 필요·grant 거부 | LINK_PASSWORD_REQUIRED | C-11 onAccessLost에 위임 |
| 링크 없음·중지·만료·삭제 | LINK_UNAVAILABLE | C-11 onAccessLost에 위임 |
| 없는/타인 JD·실행, 실행 발행본 불일치 | RESOURCE_UNAVAILABLE | 존재·제목·개수·원문 비공개 |

권한 확인을 통과한 뒤에만 사본·색인·결과를 읽는다. cursor나 runId는 권한을 대신하지 않는다. 기존 전역 Guard·서비스 인증 정책을 완화하는 공개 경로나 시험 우회 경로는 만들지 않는다.

## S2 브라우저 상태와 안전한 출력

대응: NFR1.3, NFR7.1.

JdSummaryPanel은 C-11의 token/getGrant/onAccessLost/isLoggedIn/showEvidence를 소비한다. grant를 U10이 따로 저장하지 않고 요청할 때 getGrant로 얻어 헤더에 넣는다. 회원 토큰은 기존 메모리 정책, 링크 grant는 U4의 기존 링크별 sessionStorage 정책을 유지한다.

요청을 시작할 때 현재 로그인 세션·token·선택 runId에 대응하는 화면 요청 세대를 함께 기억한다. 로그인 전환·로그아웃·접근 상실·대상 변경 시 세대를 바꾸고 목록·선택·결과 상태를 비운다. 반환값은 같은 세대·현재 대상일 때만 반영한다. 이는 컴포넌트 내부의 오래된 응답 폐기이며 서버 프로토콜이나 영구 캐시를 추가하지 않는다. AUTH 오류는 로그인 안내, LINK 오류는 onAccessLost로 처리한다.

JdRunResult와 JdRequirementResult는 React 텍스트로 렌더링한다. HTML 삽입·HTML 마크다운 렌더링은 사용하지 않는다. CITED의 출처·quote·location은 공용 결과 그대로 사용하고 근거 선택은 showEvidence(citation.location)로 넘긴다. 글자 검색으로 위치를 다시 찾지 않는다. AI_INTERPRETATION·SERVER_NOTICE·원문·AI 초안은 기존 라벨로 구분한다. 외부 근거 URL은 기존 보안 점검의 http(s)·허용 호스트와 rel 정책에 맞을 때만 링크로 표시한다.

## S3 동의와 외부 AI 자료 경계

대응: NFR2.1, NFR2.2, NFR2.3, NFR2.4.

접수 서비스는 C-04의 현재 판본 동의를 확인하고 C-09 색인 DONE 확인 후 접수 트랜잭션으로 넘어간다. 동의가 필요하면 UI가 U2 공용 동의 창을 열고 완료 후 한 번 재요청한다. 재요청도 권한·입력·색인·한도를 다시 확인하며 반복 거부 시 오류를 보여 준다. JD 저장에는 이 동의·AI 호출·차감 흐름을 적용하지 않는다.

처리기의 검색 어댑터는 저장된 publicationId·현재 jdLine만 C-09로 보낸다. 반환 hit의 chunkId를 sourceId로 옮기며 sourceKind·text·location·catchEvidenceUrls를 보존한다. 다른 원본이나 회원 자료를 추가 수집하지 않는다. C-01 요청은 JD_SUMMARY·HAIKU·현재 줄·검색 근거로 구성하고 publicationText는 공용 검사에만 전달한다.

지시문과 신뢰하지 않는 자료를 구분하는 공용 관문을 그대로 사용한다. 인용·표기 검사나 영어 추출을 U10이 복제하지 않으며 판정 AI·도구 실행·점수화를 추가하지 않는다. 기계 대조의 의미적 한계는 [관측성 설계 O3](observability-design.md#o3-품질과-검증-증거)에 남긴다.

외부 호스트·redirect·응답 크기·호출 시간·비밀값은 공용 제공자의 기존 제한과 설정을 소비한다. 사용자 URL을 외부 호출 대상으로 삼지 않는다. 큐 payload에는 runId만 들어가고 토큰·grant·JD 원문은 넣지 않는다. 실제 공급자 오류를 합성 성공으로 대체하지 않는다.

## S4 자료 보호와 공용 책임

DB에는 승인된 JD·사본·결과만 저장하며 삭제 경로는 [R3](reliability-design.md#r3-삭제-관계와-부활-방지)를 따른다. API 오류와 로그는 고정 코드·안전한 필드만 내보내며 상세 기준은 [O1](observability-design.md#o1-로그-필드와-기록-위치)에 둔다.

회원 인증·쿠키·CSRF·보안 헤더·전송 보호는 기존 web/api 배포 경계를 이어 쓴다. 비밀값은 기존 공용 설정 경로에서 공급하고 U10 파일·요청·브라우저 로그에 넣지 않는다. 저장 암호화·키 회전·TLS 구성·규제 인증의 새 정책을 이 Unit에서 정하거나 완료로 주장하지 않는다. 실제 공용 인프라의 설정 검증은 그 담당 증거를 확인해야 한다.

시험은 U10 테스트 구성에서 기존 인터페이스에 합성 제공자를 명시적으로 주입한다. 운영 바인딩·U2 검사·공용 계약 변경이 필요해지면 제공 Unit의 별도 변경 절차를 따른다.

## Sources

[성능 요구사항](../nfr-requirements/performance-requirements.md), [보안 요구사항](../nfr-requirements/security-requirements.md), [확장성 요구사항](../nfr-requirements/scalability-requirements.md), [신뢰성 요구사항](../nfr-requirements/reliability-requirements.md), [관측성 요구사항](../nfr-requirements/observability-requirements.md), [기술 결정](../nfr-requirements/tech-stack-decisions.md), [기능 명세](../functional-design/functional-spec.md), [공유 계약](../../../inception/contract-design/contract-summary.md), [작성 전 확인](nfr-design-questions.md).
