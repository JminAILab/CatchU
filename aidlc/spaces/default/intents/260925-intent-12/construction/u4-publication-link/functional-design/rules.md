# U4 발행·링크 — 업무 규칙

## Sources

작성일: 2026-10-27. 입력: [Unit 정의](../../../inception/units-generation/unit-of-work.md)(unit-of-work)의 U4, [스토리 대응](../../../inception/units-generation/unit-of-work-story-map.md)(unit-of-work-story-map), [사용자 스토리](../../../inception/user-stories/stories.md)(stories), [요구사항](../../../inception/requirements-analysis/requirements.md)(requirements), [컴포넌트 목록](../../../inception/domain-design/components.md)(components), [설계 결정](../../../inception/domain-design/decisions.md)의 ADR-001·ADR-004·ADR-005·ADR-007, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary)의 공통 전제·C-02~C-14·C-17, [기능 설계 질문·답변](functional-design-questions.md) Q1·Q2·Q5~Q9, [엔티티](entities.md). 10월 동작: `api/docs/share-links.md`·`api/docs/catch-visibility.md`·`api/src/catches/owner-catch-store.ts`.

## 규칙

오류 응답은 10월 공통 본문 `{code, message}`를 쓴다. 새 오류 코드는 만들지 않는다. `AI_CONSENT_REQUIRED`(C-04)·`DAILY_LIMIT_REACHED`(C-03)는 U2가 더하는 코드를 그대로 쓴다. 자기 Unit 안 API 세부(경로·필드·응답 코드)는 [기능 명세](functional-spec.md) 「작성자 API」에 둔다.

```yaml
rules:
  # BR1 Catch 설명 (C-14)
  - id: BR1.1
    statement: Catch 하나에 작성자 설명 하나를 저장하고 다시 고칠 수 있다. 항목별 필수 입력·최소 글자 수·품질 점수를 요구하지 않는다
    category: policy
    applies_to: CatchAuthorDescription
    trigger: 작성자가 설명을 저장
    logic: IF 본인 Catch THEN author_description과 author_description_updated_at을 함께 쓴다. 내용 형식은 검사하지 않는다
    violation: 없음(형식 거부 없음)
    source: FR2.1, AC2.1.1, AC2.1.2
  - id: BR1.2
    statement: 설명은 0~4,000자(코드 포인트)이고, 앞뒤 공백만 있으면 설명을 지운 것으로 본다
    category: validation
    applies_to: CatchAuthorDescription
    trigger: 설명 저장
    logic: IF 앞뒤 공백 제거 뒤 길이 0 THEN 두 칸 모두 NULL. IF 4,000자 초과 THEN 저장하지 않는다. 저장하는 값은 사용자가 쓴 그대로(공백 제거는 판정에만)
    violation: 400 VALIDATION_FAILED, 화면은 쓰던 내용을 남기고 이유를 안내
    source: Q5(U4 초기 설계값), C-14
  - id: BR1.3
    statement: Catch 화면은 기록에서 확인한 내용, 작성자 설명, AI 설명 초안을 구분해 보이고 AI 초안이 작성자 설명을 덮어쓰지 않는다
    category: policy
    applies_to: Catch 작성자 화면, 발행 사본 표시
    trigger: Catch 또는 발행본을 봄
    logic: 세 부분을 다른 표지로 나눠 보인다. 초안 생성·재생성은 author_description을 쓰지 않는다. 타인의 기여를 본인 것으로 표시하는 문구를 만들지 않는다(10월 Catch 내용 그대로)
    violation: 해당 없음(표시 규칙)
    source: FR1.4, FR2.2, NFR7, AC1.4.1, AC2.1.3
  - id: BR1.4
    statement: 같은 작업이 다시 분석되면 기존 Catch를 참조하므로 설명이 그대로 남고, 다른 작업의 새 Catch로는 옮기지 않는다
    category: constraint
    applies_to: CatchAuthorDescription
    trigger: 재분석 결과 반영
    logic: 결과 반영은 (owner_id, work_identity)로 기존 행을 찾아 쓰며 설명 두 칸을 쓰지 않는다. 새 Catch는 설명 NULL로 만든다
    violation: 시험에서 재분석 뒤 설명이 바뀌거나 새 Catch에 옮겨지면 실패
    source: FR2.5, ADR-004, AC2.3.1, AC2.3.2
  - id: BR1.5
    statement: Catch 근거는 일반 GitHub 근거 링크로 열고, Catch 원본 삭제 기능은 없다
    category: policy
    applies_to: Catch 작성자 화면
    trigger: 근거를 누르거나 삭제를 찾음
    logic: 근거는 catch_evidence.source_url로 새 창을 연다. 서비스 안 커밋 원문·diff 탐색과 삭제 버튼을 두지 않는다(10월 그대로)
    violation: 해당 없음
    source: FR1.4, FR1.5, AC1.4.2, AC1.4.4
  - id: BR1.6
    statement: 공개/비공개 변경은 10월 규칙 그대로이고, 비공개로 바꿔도 이미 발행한 사본은 바뀌지 않는다
    category: policy
    applies_to: catch_asset.visibility
    trigger: 작성자가 공개 상태를 바꿈
    logic: 10월 setVisibility를 그대로 쓴다. 비공개 Catch는 "발행할 수 있는 상태가 아님"이 아니라 "발행하면 공개로 바뀜"으로 안내한다(FR1.5). published_item은 읽지도 쓰지도 않는다
    violation: 10월 오류 그대로(CONFIRMATION_REQUIRED, SOURCE_RESTRICTED)
    source: FR1.5, AC1.4.3

  # BR2 저장 공통 (Catch 설명·텍스트 자료)
  - id: BR2.1
    statement: 여러 탭에서 고치면 마지막 저장이 남고 충돌 감지는 없다
    category: policy
    applies_to: CatchAuthorDescription, TextMaterial
    trigger: 저장
    logic: 저장은 덮어쓰기다. 버전 비교·잠금 경고를 하지 않는다
    violation: 해당 없음
    source: FR2.4, FR3.1, AC2.2.1
  - id: BR2.2
    statement: 저장하지 않은 변경이 있으면 화면을 떠날 때 경고한다
    category: policy
    applies_to: 설명·텍스트 자료 편집 화면
    trigger: 다른 화면 이동·창 닫기
    logic: IF 마지막 저장 뒤 입력이 바뀜 THEN 브라우저 이탈 확인과 앱 안 이동 확인을 띄운다
    violation: 해당 없음
    source: FR2.4, AC2.2.2
  - id: BR2.3
    statement: 저장이 실패하면 저장되지 않았다고 알리고 쓰던 내용을 화면에 남겨 다시 저장할 수 있게 한다
    category: policy
    applies_to: 설명·텍스트 자료 편집 화면
    trigger: 서버 오류(5xx)·연결 끊김·로그인 만료(401 AUTH_REQUIRED·AUTH_INVALID)·검증 실패(400)
    logic: 입력값을 지우지 않고 "저장되지 않았습니다"와 이유를 보인다. 로그인 만료면 다시 로그인 안내를 함께 보이며, 입력은 화면에 남긴다. 접수만으로 저장 성공을 표시하지 않는다(응답 성공 뒤에만 "저장됨")
    violation: 해당 없음
    source: FR2.4, NFR7, AC2.2.3, team.md Code Style

  # BR3 텍스트 자료 (C-13)
  - id: BR3.1
    statement: 텍스트 자료를 여러 벌 등록·수정·삭제하며 종류별 형식 제한과 URL 자료 종류가 없다
    category: policy
    applies_to: TextMaterial
    trigger: 등록·수정·삭제
    logic: 자료는 제목과 본문뿐이다. 본문 안에 주소·강점 문장을 자유롭게 적는다. Catch와 구조적으로 연결하지 않는다
    violation: 해당 없음
    source: FR2.3, FR3.1, AC2.1.4, AC3.1.1, AC3.1.3
  - id: BR3.2
    statement: 텍스트 자료 제목은 1~100자, 본문은 1~20,000자(코드 포인트)다
    category: validation
    applies_to: TextMaterial
    trigger: 등록·수정
    logic: 제목은 앞뒤 공백을 제거해 저장하고 센다. 본문은 그대로 저장하되 앞뒤 공백 제거 뒤 0자면 거부한다
    violation: 400 VALIDATION_FAILED, 쓰던 내용 유지
    source: Q5(U4 초기 설계값), C-13
  - id: BR3.3
    statement: 자료를 쓰는 화면에 민감 정보 안내를 두고 서비스가 개인정보를 찾아 가리지 않는다
    category: policy
    applies_to: 텍스트 자료 편집 화면
    trigger: 화면 표시
    logic: "주민등록번호 같은 민감한 정보는 지우고 올려 주세요"를 항상 보인다. 저장 때 내용 검사·마스킹을 하지 않는다
    violation: 해당 없음
    source: FR3.6, AC3.1.4
  - id: BR3.4
    statement: 텍스트 자료는 본인 것만 보고 고치고 지운다
    category: authorization
    applies_to: TextMaterial
    trigger: 모든 텍스트 자료 API
    logic: member_id = 인증 회원인 행만 다룬다. 남의 것·없는 것은 구분하지 않는다
    violation: 404 RESOURCE_UNAVAILABLE
    source: NFR1, C-13 read-rule
  - id: BR3.5
    statement: 발행 뒤 원본 텍스트 자료나 Catch를 고치거나 지워도 발행본은 발행 당시 내용을 유지한다
    category: constraint
    applies_to: PublishedItem
    trigger: 원본 수정·삭제
    logic: published_item.source_id에 외래 키가 없고 snapshot만 읽는다. 원본 변경은 발행본을 건드리지 않는다
    violation: 해당 없음
    source: FR3.2, FR4.1, AC3.1.5

  # BR4 발행 선택·검증
  - id: BR4.1
    statement: 발행 항목은 본인 Catch와 본인 텍스트 자료 1~20개이며 중복 없이 고른 순서가 그대로 position이 된다
    category: validation
    applies_to: PublishCommand
    trigger: 발행 요청
    logic: IF 항목 0개 또는 20개 초과 또는 같은 (kind, sourceId) 중복 THEN 400. IF 원본이 없거나 남의 것 THEN 404. 순서는 요청 배열 순서 1..n
    violation: 400 VALIDATION_FAILED 또는 404 RESOURCE_UNAVAILABLE, 발행하지 않음
    source: FR4.1, FR4.7, AC4.1.1, AC4.1.9
  - id: BR4.2
    statement: 작업 사실·기여가 확인되지 않은 Catch와 원본 저장소가 비공개로 바뀐 것이 확인된 Catch는 공개·비공개와 관계없이 발행에 넣을 수 없다
    category: validation
    applies_to: 고른 Catch 전부
    trigger: 발행 트랜잭션 안 재확인
    logic: 10월 공개 전환 조건을 고른 모든 Catch에 같은 잠금으로 적용한다. IF work_facts_confirmed AND contribution_confirmed가 아님 THEN 거부. IF repository_protection.applied_restriction = SOURCE_PRIVATE THEN 거부. 보호 관측이 불완전하면 10월처럼 서버 오류. 확인되지 않은 조회 실패는 비공개로 단정하지 않는다(BR7.4)
    violation: 409 CONFIRMATION_REQUIRED 또는 409 SOURCE_RESTRICTED, details에 해당 catchId 목록. 트랜잭션 전체 롤백
    source: FR4.1, AC4.1.4, AC4.1.9
  - id: BR4.3
    statement: 불일치 표시가 있는 Catch는 표시를 단 채 발행된다
    category: policy
    applies_to: CatchSnapshot.mismatch
    trigger: 발행
    logic: mismatch는 거부 사유가 아니며 사본에 그대로 복사해 받은 사람 화면에 표시한다
    violation: 해당 없음
    source: FR4.1, AC4.1.5
  - id: BR4.4
    statement: 비공개 Catch를 고르면 "발행하면 이 Catch는 공개로 바뀝니다"를 안내하고 실제 전환은 발행 트랜잭션 안에서만 한다
    category: policy
    applies_to: 발행 화면, catch_asset.visibility
    trigger: 고르기·빼기·발행
    logic: 고르고 빼는 동안에는 서버에 아무것도 쓰지 않는다. 발행 트랜잭션에서 고른 PRIVATE Catch만 PUBLIC으로 바꾼다
    violation: 해당 없음
    source: FR4.1, AC4.1.2, AC4.1.3
  - id: BR4.5
    statement: 발행본 제목은 1~50자, 비밀번호는 8~64자(10월)이고 발행본 전체 글은 60,000자 이하다
    category: validation
    applies_to: PublishCommand, SnapshotTextTotal
    trigger: 발행 요청과 트랜잭션 안 재계산
    logic: 제목은 앞뒤 공백 제거 뒤 센다. 비밀번호는 trim·정규화하지 않는다. 전체 글은 트랜잭션 안에서 읽은 원본으로 SnapshotTextTotal을 계산한다. 60,000자는 U4 제안 임시값이며 AI 입력 한도 확인 뒤 조정한다(검증된 값 아님)
    violation: 400 VALIDATION_FAILED, 이유 안내, 발행하지 않음
    source: Q5, FR4.7, AC4.1.9
  - id: BR4.6
    statement: 발행 전에 고른 자료·순서와 접근 조건(비밀번호 여부·만료 시점)을 안내한다
    category: policy
    applies_to: 발행 화면
    trigger: 발행 확인 단계
    logic: 고른 항목을 순서대로, 비밀번호 설정 여부, "발행 시각부터 90일 뒤 만료, 연장 없음"을 보인 뒤 발행 버튼을 둔다. 발행 전 미리보기 사본은 만들지 않는다(발행 후 확인)
    violation: 해당 없음
    source: FR4.6, FR5.4, AC4.1.6
  - id: BR4.7
    statement: 발행은 작성자의 외부 AI 첫 이용 동의를 먼저 확인한다
    category: authorization
    applies_to: 발행
    trigger: 발행 요청(트랜잭션 전)
    logic: AiConsentGate.require(작성자). 없으면 발행하지 않고 web은 U2 공용 동의 창을 연 뒤 같은 요청을 다시 보낸다
    violation: 403 AI_CONSENT_REQUIRED
    source: C-04, C-08 publish-sequence 1
  - id: BR4.8
    statement: 회원별 발행 요청 빈도를 1분 10회로 제한한다(초기 설계안, 회의 후 유지 여부 확인)
    category: policy
    applies_to: 발행 요청
    trigger: 발행 요청(입력 검사 전)
    logic: 10월 request-rate-limiter·issue-rate-limit을 그대로 쓴다. 초과면 처리하지 않는다. 공용 계약 변경은 필요 없다(U4 안 API 세부)
    violation: 429 RATE_LIMITED, Retry-After
    source: Q7
  - id: BR4.9
    statement: 재전송 중복 발행 방지·유효 링크 개수 한도·같은 제목 금지를 두지 않는다
    category: policy
    applies_to: 발행
    trigger: 발행 요청
    logic: Idempotency-Key를 받지 않는다. web은 발행 요청이 끝날 때까지 버튼을 막는다. 재전송으로 발행본이 둘 생기고 하루 실행 횟수를 2회 쓸 수 있는 것은 에러 대응 최소선 6의 한계로 기록한다. 자료 노출·삭제 실패를 막는 보호(BR6·BR8)는 그대로다
    violation: 해당 없음
    source: Q7, contract 공통 전제 에러 대응 최소선 6

  # BR5 발행 트랜잭션 (C-08)
  - id: BR5.1
    statement: 발행은 동의 확인 → 트랜잭션(하루 횟수 1회 → 발행본·항목 쓰기 → 공개 전환 → 조각 나누기) → 커밋 → 작업 등록 순서로 한다
    category: constraint
    applies_to: Publication, PublishedItem
    trigger: 검증을 통과한 발행 요청
    logic: 트랜잭션 안에서 DailyRunLimit.consume(작성자, BASE_SUMMARY, manager), 고른 원본을 정해진 순서(Catch를 catch_id 오름차순, 그다음 텍스트 자료를 text_material_id 오름차순)로 잠그고 다시 읽어 BR4.1·BR4.2·BR4.5 재확인, publication·published_item 쓰기, PRIVATE Catch를 PUBLIC으로, PublishedIndexWriter.chunkInTransaction(manager, publicationId, now), 커밋
    violation: LIMIT_REACHED면 롤백 후 429 DAILY_LIMIT_REACHED. 다른 실패는 BR5.2
    source: FR4.1, FR4.7, ADR-005, C-03, C-08, AC4.1.1
  - id: BR5.2
    statement: 발행 저장이 실패하면 아무것도 남지 않고 어떤 Catch도 공개로 바뀌지 않는다
    category: constraint
    applies_to: 발행 트랜잭션
    trigger: 트랜잭션 안 어느 단계든 실패(chunkInTransaction 예외 포함)
    logic: 트랜잭션 전체 롤백. 하루 횟수 consume도 같은 트랜잭션이라 함께 되돌아간다. 응답은 실패이며 접수만으로 성공을 표시하지 않는다
    violation: 4xx는 해당 코드, 그 밖은 500 INTERNAL_ERROR, 화면은 "발행되지 않았습니다"
    source: FR4.7, AC4.1.8, contract 에러 대응 최소선 5
  - id: BR5.3
    statement: 사본은 발행 순간 원본 내용을 C-07 snapshot 모양으로 복사하고 Catch 제목이 없으면 '제목 없는 Catch'로 고정한다
    category: calculation
    applies_to: PublishedItem.snapshot, PublishedItem.title
    trigger: 발행 트랜잭션 안
    logic: CATCH는 workFacts·subjectContribution·evidence(position 순, sourceUrl·sourceRevision·representedFacts)·authorDescription·aiDraft(draft_status = GENERATED일 때만)·mismatch. TEXT_MATERIAL은 body. 문자열은 가공하지 않는다(C-07 chunk-text)
    violation: 해당 없음
    source: FR4.1, FR4.7, C-07, AC4.1.1, AC3.1.5
  - id: BR5.4
    statement: 링크는 256비트 난수 토큰, 만료는 발행 시각 + 2160시간(90일), 비밀번호는 10월 scrypt 검증값으로 저장한다
    category: calculation
    applies_to: Publication
    trigger: 발행 트랜잭션 안
    logic: 토큰·검증값은 트랜잭션 전에 만든다(10월 잠금 시간 단축). published_at은 트랜잭션 안의 now
    violation: 해당 없음
    source: contract 공통 전제 기본 링크 기간, C-07, FR5.4
  - id: BR5.5
    statement: 커밋 뒤 임베딩과 기본 요약 작업을 등록하고, 등록이 실패해도 발행은 성공이다
    category: policy
    applies_to: 발행 커밋 뒤
    trigger: 커밋 성공
    logic: AiRun.enqueueAfterCommit(EMBED_PUBLICATION, "EMBED_PUBLICATION-{publicationId}", {publicationId})와 (BASE_SUMMARY, "BASE_SUMMARY-{publicationId}", {publicationId})를 항상 등록. ENQUEUE_FAILED면 로그만 남기고 발행 성공 응답(시한으로 실패 확정, C-02)
    violation: 해당 없음
    source: C-02, C-08 publish-sequence 4·5, ADR-005
  - id: BR5.6
    statement: 발행이 성공하면 바로 작성자에게 실제 고정 사본을 보여 준다
    category: policy
    applies_to: 발행 후 확인 화면
    trigger: 발행 성공 응답
    logic: web은 작성자 발행본 화면으로 옮겨 readSnapshot 결과·링크 주소·접근 조건을 보인다. 링크 주소는 이 화면과 목록에서 다시 볼 수 있다
    violation: 해당 없음
    source: FR4.6, AC4.1.7

  # BR6 링크 조건 (C-10·C-12)
  - id: BR6.1
    statement: 받은 사람 요청은 매번 토큰으로 발행본을 찾고 삭제·중지·만료를 먼저 판정한 뒤 비밀번호 링크면 grant를 확인한다
    category: authorization
    applies_to: PublicationAccess.resolveForRecipient
    trigger: 받은 사람 쪽 모든 API(열람·요약·질의응답·JD 요약·MCP)
    logic: 캐시 없음. IF 발행본 없음 OR stoppedAt 있음 OR now >= expiresAt THEN LinkUnavailable. ELSE IF 비밀번호 있음 AND (grant 없음 OR 서명 틀림 OR grant.publicationId 다름 OR grant 만료) THEN LinkPasswordRequired. ELSE RecipientAccess
    violation: 404 LINK_UNAVAILABLE(없음·삭제·중지·만료 구분 없음), 401 LINK_PASSWORD_REQUIRED
    source: FR4.2, FR5.1, NFR1, C-10, AC4.4.1, AC4.4.2, AC5.1.1, AC5.1.2
  - id: BR6.2
    statement: grant는 10월 서명 방식 그대로이며 publicationId에 묶고 수명은 2시간이되 링크 만료를 넘지 않는다
    category: constraint
    applies_to: LinkGrant
    trigger: 비밀번호 통과
    logic: 서버에 저장하지 않는다. X-Link-Grant 헤더로만 받고 로그·오류에 넣지 않는다. 중지·만료는 BR6.1이 매번 막는다
    violation: 해당 없음
    source: contract 공통 전제(공유 링크 열람 행), C-10
  - id: BR6.3
    statement: 비밀번호 통과는 10월 `link-access.service.ts`의 unlock 순서 그대로, 링크 판정과 시도 제한을 비밀번호 확인보다 먼저 한다
    category: authorization
    applies_to: POST /v1/public/links/{token}/unlock
    trigger: 비밀번호 입력
    logic: 순서대로 판정한다. ① BR6.1의 LinkUnavailable(없음·삭제·중지·만료) THEN 404. ② 비밀번호 없는 링크 THEN 400(10월 그대로). ③ 본문 검사. ④ 주소·링크 차단이나 시도 빈도 초과 THEN 429(이때 비밀번호를 확인하지 않는다). ⑤ 비밀번호 틀림 THEN 401. ⑥ 맞으면 grant 발급 직전에 링크를 다시 판정해 그사이 중지·만료됐으면 404, 아니면 grant(만료는 링크 만료를 넘지 않음)
    violation: 404 LINK_UNAVAILABLE, 400 INVALID_REQUEST, 400 VALIDATION_FAILED, 429 LINK_UNLOCK_LIMITED, 401 LINK_PASSWORD_INVALID
    source: C-12, AC4.4.2
  - id: BR6.4
    statement: 받은 사람에게는 판정을 통과한 뒤 그 발행본의 사본만 준다
    category: authorization
    applies_to: 받은 사람 열람, PublicationAccess.readSnapshot
    trigger: 받은 사람 열람
    logic: 사본은 published_item에서만 읽고 원본 catch_asset·text_material을 읽지 않는다. 발행본에 없는 Catch·자료를 여는 경로(10월 Catch 상세 경로 포함)를 두지 않는다. U5·U10·U9도 C-10으로만 읽는다
    violation: 해당 없음(경로 없음)
    source: FR4.4, NFR1, C-10 rule, AC4.4.3
  - id: BR6.5
    statement: 작성자 쪽 접근은 본인 발행본이면 중지·만료 뒤에도 허용하고 남의 것·없는 것은 구분하지 않는다
    category: authorization
    applies_to: PublicationAccess.resolveForOwner
    trigger: 작성자 발행본 API, U5 작성자 경로
    logic: IF publication.member_id = memberId THEN OwnerAccess(state). ELSE NotFound. state는 중지가 만료보다 우선
    violation: 404 RESOURCE_UNAVAILABLE
    source: FR5.1, C-10, C-11 owner-summary
  - id: BR6.6
    statement: 받은 사람 화면은 로그인 여부를 붙는 자리에 넘겨 비로그인 JD 요약 실행에 로그인 안내가 나오게 한다
    category: policy
    applies_to: 받은 사람 화면(C-11)
    trigger: 받은 사람 화면 표시
    logic: RecipientSlotProps.isLoggedIn을 넘긴다. 로그인 안내 표시는 JdSummaryPanel(U10)이 한다
    violation: 해당 없음
    source: FR4.2, C-11, AC4.4.4

  # BR7 열람 표시
  - id: BR7.1
    statement: 받은 사람에게 발행 당시 자료를 고정한 발행본임을 알리고 이후 원본 변경 사실은 알리지 않는다
    category: policy
    applies_to: 받은 사람 화면
    trigger: 링크 열람
    logic: 화면 머리에 "발행 시각에 고정한 자료입니다"와 발행 시각을 보인다. 원본 수정·공개 상태·삭제를 읽지 않으므로 알리지 않는다
    violation: 해당 없음
    source: FR4.3, AC4.3.1
  - id: BR7.2
    statement: 작성자 발행본 화면에 원본 수정이 반영되지 않으며 수정 전달은 새 발행, 제공 중단은 링크 중지라고 안내한다
    category: policy
    applies_to: 작성자 발행본 화면
    trigger: 작성자가 발행본을 봄
    logic: 사본(readSnapshot)을 보이고 고정 안내 문구를 둔다
    violation: 해당 없음
    source: FR4.3, AC4.3.2
  - id: BR7.3
    statement: 원본 GitHub 저장소가 비공개로 바뀌어도 발행본과 그 검색 조각은 유지하고 작성자에게 링크 중지·삭제로 제공을 끝내라고 안내한다
    category: policy
    applies_to: Publication, 작성자 발행본 화면
    trigger: 저장소 보호 상태 변경, 작성자 화면 표시
    logic: U4는 보호 상태 변경에 반응해 발행본을 바꾸지 않는다. 작성자 발행본 화면에 "원본 저장소를 비공개로 바꿔도 이 발행본은 남습니다. 제공을 끝내려면 링크를 중지하거나 발행본을 삭제하세요"를 항상 보인다
    violation: 해당 없음
    source: FR4.5, AC4.3.3
  - id: BR7.4
    statement: GitHub 조회 실패를 비공개 전환으로 단정하지 않는다
    category: constraint
    applies_to: BR4.2 판정
    trigger: 발행 자격 판정
    logic: 거부는 repository_protection.applied_restriction = SOURCE_PRIVATE(확인된 관측)일 때만. 최근 관측 실패는 이전 유효 관측을 무효화하지 않는다(10월)
    violation: 해당 없음
    source: FR4.5, AC4.3.4
  - id: BR7.5
    statement: 받은 사람·작성자 화면은 고정 사본, AI 설명 초안, AI 요약을 구분해 표시한다
    category: policy
    applies_to: 발행본 화면
    trigger: 화면 표시
    logic: aiDraft는 "AI 설명 초안" 표지로 따로 보이고 작성자 설명과 섞지 않는다. 요약은 U5 패널이 "AI 요약" 표지로 보인다
    violation: 해당 없음
    source: NFR7, FR6.5(사본 표시 부분)
  - id: BR7.6
    statement: U4는 받은 사람 화면과 작성자 발행본 화면에 근거 원문 강조 함수를 제공한다
    category: policy
    applies_to: 발행본 화면(C-11 evidence-highlight)
    trigger: U5·U10 패널이 근거를 누름
    logic: showEvidence(location)는 publishedItemId·fieldPath로 해당 항목·필드를 화면에 보이고 [charStart, charEnd)(UTF-16)를 강조한다. pdfPage는 U8
    violation: 위치가 사본에 없으면 강조하지 않고 그 항목만 보인다
    source: C-11 evidence-highlight

  # BR8 작성자 관리
  - id: BR8.1
    statement: 작성자는 본인 발행본 목록과 상세를 중지·만료 뒤에도 보고 실제 만료 시점과 링크 주소를 확인한다
    category: policy
    applies_to: 작성자 발행본 목록·상세
    trigger: 작성자 화면
    logic: 목록은 발행 시각 최신순(10월 목록 규칙·cursor). 상세는 resolveForOwner 뒤 readSnapshot, 상태, 만료 시각, 링크 주소, 기본 요약 패널(U5 작성자 모드)을 보인다
    violation: 남의 것·없는 것 404 RESOURCE_UNAVAILABLE
    source: FR5.1, FR5.4, C-11 owner-summary, AC5.1.3, AC5.1.5
  - id: BR8.2
    statement: 링크 중지는 되돌릴 수 없고, 반복 중지는 처음 시각을 유지하며, 만료된 링크는 바꾸지 않는다
    category: constraint
    applies_to: Publication.stoppedAt
    trigger: 작성자가 링크 중지
    logic: 행을 잠그고 IF ACTIVE THEN stopped_at = now, 200 {state: STOPPED, stoppedAt}. IF STOPPED THEN 그대로, 200 {state: STOPPED, stoppedAt: 처음 값}. IF EXPIRED THEN 쓰지 않고 200 {state: EXPIRED, stoppedAt: null}(10월과 같음). 되살리기·연장 API는 없다. 다시 보내려면 새로 발행한다
    violation: 남의 것·없는 것 404 RESOURCE_UNAVAILABLE
    source: FR5.1, AC5.1.1, AC5.1.4
  - id: BR8.3
    statement: 만료일 선택·연장·발행 뒤 비밀번호 변경은 없다
    category: policy
    applies_to: Publication
    trigger: 해당 없음
    logic: 그런 입력 칸과 API를 두지 않는다
    violation: 해당 없음
    source: FR5.4, AC5.1.5
  - id: BR8.4
    statement: 발행본 삭제는 파일 저장소의 발행본 접두어를 먼저 지우고 성공하면 발행본 행을 지워 딸린 사본·조각·요약·JD 요약 결과를 함께 지운다
    category: constraint
    applies_to: Publication 삭제
    trigger: 작성자가 삭제 확인
    logic: resolveForOwner → FileStorage.deletePrefix(publicationPrefix(memberId, publicationId)) → publication 행 삭제(published_item·published_pdf_page·publication_index·published_chunk·base_summary·jd_summary_run 연쇄). 접두어가 없으면 성공으로 본다(C-05). 원본 자료와 다른 발행본은 건드리지 않는다
    violation: 접두어 삭제 실패면 500 INTERNAL_ERROR, DB는 지우지 않고 "삭제되지 않았습니다" 안내. 남의 것·없는 것 404
    source: FR5.2, NFR5, components Publication, C-05, C-17 delete-publication, AC5.2.1, AC5.2.2, AC5.2.4
  - id: BR8.5
    statement: 삭제 뒤 늦게 도착한 AI·색인 결과는 부모가 없어 저장되지 않고 버려진다
    category: constraint
    applies_to: 발행본 삭제 뒤 처리기
    trigger: 처리기가 결과 저장
    logic: U4는 발행본 행을 실제로 지워 외래 키가 거부하게 한다. 부모 확인·버림은 각 처리기(U3·U5·U10)가 C-02 late-result대로 한다
    violation: 해당 없음
    source: FR5.2, FR14.10, C-02 late-result, AC5.2.3
  - id: BR8.6
    statement: 발행본은 자동으로 파기하지 않는다
    category: policy
    applies_to: Publication
    trigger: 시간 경과
    logic: 만료는 접근만 막고 행을 지우지 않는다. 지우는 것은 작성자 삭제와 탈퇴(U2)뿐이다
    violation: 해당 없음
    source: FR5 보관, NFR5, AC5.2.5
  - id: BR8.7
    statement: 색인이 실패한 발행본에만 작성자에게 [검색 다시 준비]를 보이고 누르면 U3에 다시 준비를 요청한다
    category: policy
    applies_to: 작성자 발행본 목록·상세
    trigger: 화면 표시, 버튼 누름
    logic: 상태는 C-09 PublishedSearch.getIndexState로 읽는다(설계 전제, 담당 확인 필요 — Q9). FAILED일 때만 버튼. 누르면 resolveForOwner → PublishedIndexWriter.requestReindex. 하루 실행 횟수에 세지 않는다. U3 표를 직접 읽거나 버튼을 항상 보이지 않는다. C-09 합의 전 임시 상태에서는 작성자 응답에 indexState 칸과 reindex 경로·버튼을 두지 않는다. 이 규칙은 U4 최종 범위이며, 합의 뒤 구현하고 시험을 통과하기 전에는 U4를 완료로 보지 않는다
    pre-agreement: 임시 상태(미완성)
    violation: 남의 것·없는 것 404 RESOURCE_UNAVAILABLE
    source: ADR-007, C-08, C-09, Q9

  # BR9 10월 공유 링크 전환
  - id: BR9.1
    statement: 10월 공유 링크 발급·목록·중지 API·화면과 받은 사람 공개 Catch 목록·상세 경로를 발행본 흐름으로 대체하고 두 정책을 병행하지 않는다
    category: policy
    applies_to: share-links·recipient 모듈, web 공유 화면·/s/[token]
    trigger: U4 본체 반영
    logic: 열람 URL /s/{token}·GET /v1/public/links/{token}·비밀번호 통과(unlock·X-Link-Grant)는 유지하고 응답을 PublishedSnapshot으로 바꾼다. 10월 링크를 이관하지 않는다. share_link 표·idempotency_record 외래 키 정리의 담당·범위·데이터 초기화와의 순서는 담당 확인 필요(Q8)이며 U4는 공용 표를 지우지 않는다
    violation: 해당 없음
    source: contract 공통 전제(공유 링크 열람 행), C-12, requirements C04, Q8

  # BR10 공통 보호
  - id: BR10.1
    statement: 작성자 API는 10월 회원 인증을 쓰고 남의 자료와 없는 자료를 구분하지 않는다
    category: authorization
    applies_to: 모든 작성자 API
    trigger: 요청
    logic: Bearer Access 토큰·CSRF·회원 행 확인은 10월 그대로. 소유 확인을 상태 확인보다 먼저 한다
    violation: 401 AUTH_REQUIRED·AUTH_INVALID, 404 RESOURCE_UNAVAILABLE
    source: NFR1, contract 공통 전제
  - id: BR10.2
    statement: 링크 토큰·grant·비밀번호·자료 본문을 로그·오류·URL 쿼리에 남기지 않는다
    category: constraint
    applies_to: U4 전체
    trigger: 로그·오류 응답
    logic: 토큰은 링크 주소 안에만 싣는다. 로그에는 publicationId·회원 ID·오류 코드만 남긴다
    violation: 해당 없음
    source: team.md Code Style, NFR1, C-07 link_token_reference
```

## 규칙 요약

| ID | 규칙 | 분류 | 근거 |
|---|---|---|---|
| BR1.1 | Catch당 설명 하나, 형식 요구 없음 | policy | FR2.1 |
| BR1.2 | 설명 0~4,000자, 공백만이면 지움 | validation | Q5 |
| BR1.3 | 기록·설명·AI 초안 구분, 초안이 덮어쓰지 않음 | policy | FR1.4, FR2.2 |
| BR1.4 | 재분석 때 설명 유지, 새 Catch로 안 옮김 | constraint | FR2.5 |
| BR1.5 | 근거는 GitHub 링크, 원본 삭제 없음 | policy | FR1.4, FR1.5 |
| BR1.6 | 공개 상태 변경 10월 그대로, 사본 불변 | policy | FR1.5 |
| BR2.1~2.3 | 마지막 저장, 이탈 경고, 실패 때 입력 유지 | policy | FR2.4 |
| BR3.1~3.5 | 텍스트 자료 여러 벌·상한·민감 정보 안내·본인만·사본 불변 | 여러 | FR3.1, FR3.2, FR3.6 |
| BR4.1~4.9 | 발행 선택·자격·불일치·공개 안내·크기·발행 전 안내·동의·빈도·중복 방지 없음 | 여러 | FR4.1, FR4.6, FR4.7, Q5, Q7 |
| BR5.1~5.6 | 발행 순서·실패 롤백·사본·링크 값·작업 등록·발행 후 확인 | 여러 | FR4.7, C-08 |
| BR6.1~6.6 | 링크 판정·grant·unlock·사본만·작성자 접근·로그인 여부 | authorization 등 | FR4.2, FR5.1, C-10 |
| BR7.1~7.6 | 고정 안내·비공개 전환 뒤 유지·조회 실패 단정 금지·구분 표시·근거 강조 | policy | FR4.3, FR4.5, NFR7 |
| BR8.1~8.7 | 작성자 목록·중지·삭제·늦은 결과·자동 파기 없음·[검색 다시 준비] | 여러 | FR5, ADR-007 |
| BR9.1 | 10월 공유 링크 대체, 표 정리는 담당 확인 | policy | 계약 공통 전제, Q8 |
| BR10.1~10.2 | 인증·소유 확인, 비밀값 로그 금지 | authorization, constraint | NFR1 |
