# Rules — u1-preset-contract

근거: 단위 `inception/units-generation/unit-of-work.md`(U1)와 `unit-of-work-story-map.md`, 이야기 `inception/user-stories/stories.md`, 요구사항 `inception/requirements-analysis/requirements.md`, 구성 요소 `inception/domain-design/components.md`와 `decisions.md`, 계약 `inception/contract-design/contract-summary.md`, 이 단계 질문 `functional-design-questions.md`(Q1~Q4), 지금 코드(`api/src/publications/publish.service.ts`·`pdf-publish.ts`·`snapshot-builder.ts`, `api/src/common/errors/error-codes.ts`).

```yaml
rules:
  # BR1 프리셋 저장(PresetLibrary)
  - id: BR1.1
    statement: 프리셋은 그 회원만 읽고 고치고 지운다
    category: authorization
    applies_to: GET·PUT·DELETE /v1/presets/{presetId}
    trigger: 요청
    logic: IF 프리셋이 없거나 다른 회원의 것 THEN 둘을 구분하지 않고 거부
    violation: 404 RESOURCE_UNAVAILABLE
    source: NFR2, AC1.4.4
  - id: BR1.2
    statement: 이름은 앞뒤 공백을 뺀 1~50자이고 같은 이름을 허용한다
    category: validation
    applies_to: POST·PUT /v1/presets
    trigger: 저장
    logic: IF 앞뒤 공백을 뺀 이름이 0자 또는 51자 이상(코드 포인트) THEN 거부. 저장은 뺀 값으로 한다. 같은 이름 검사는 하지 않는다
    violation: 400 VALIDATION_FAILED, violations[{ field: name, reason }]
    source: FR1.4, AC1.2.3
  - id: BR1.3
    statement: 회원 한 명은 프리셋을 50개까지 만든다
    category: constraint
    applies_to: POST /v1/presets
    trigger: 새로 만들기
    logic: IF 그 회원의 프리셋이 이미 50개 THEN 거부. 동시에 만들어 51개가 되는 경우는 막지 않는다(코딩 절차 「기술」 행, 계약 R-04 결정)
    violation: 409 PRESET_LIMIT_REACHED 「프리셋은 50개까지 만들 수 있습니다.」
    source: FR1.3, AC1.2.5
  - id: BR1.4
    statement: 프리셋 하나에 자료는 0~20개, 같은 자료는 한 번, 전체 글은 60,000자까지다
    category: validation
    applies_to: POST·PUT /v1/presets
    trigger: 저장
    logic: IF 항목이 21개 이상 OR 같은 (종류, ID)가 두 번 OR BR2.1로 센 합이 60,000자 초과 THEN 거부. 0개는 저장할 수 있다
    violation: 400 VALIDATION_FAILED, violations(maxItems·arrayUnique·maxTotalLength)
    source: FR1.6, FR1.7, AC1.2.4, AC1.4.3
  - id: BR1.5
    statement: 담는 자료는 요청한 회원의 것이고 있어야 한다. 발행 자격은 저장을 막지 않는다
    category: authorization
    applies_to: POST·PUT /v1/presets, POST /v1/presets/measure
    trigger: 저장·세기
    logic: IF 자료가 없거나 다른 회원의 것 THEN 거부. 자격(BR2.2)이 없어도 저장하고 이유로만 보인다(Q2)
    violation: 404 RESOURCE_UNAVAILABLE
    source: NFR2, FR1.11, AC1.2.8
  - id: BR1.6
    statement: 프리셋 안 자료 순서는 저장 요청의 배열 순서다
    category: policy
    applies_to: POST·PUT /v1/presets
    trigger: 저장
    logic: 배열 순서대로 position을 1부터 매긴다
    violation: 없음
    source: FR1.8, AC1.3.1
  - id: BR1.7
    statement: 고치기는 이름과 자료 목록을 통째로 바꿔 저장하고 만들 때와 같은 검사를 한다
    category: policy
    applies_to: PUT /v1/presets/{presetId}
    trigger: 고쳐 저장
    logic: BR1.1·BR1.2·BR1.4·BR1.5를 통과하면 이름·항목을 한 트랜잭션에서 바꾸고 updatedAt을 쓴다. 하나라도 걸리면 아무것도 바꾸지 않는다
    violation: BR1.1·BR1.2·BR1.4·BR1.5의 응답
    source: FR1.13, AC1.4.1, AC1.4.3
  - id: BR1.8
    statement: 프리셋을 지우면 그 항목도 지워지고 이미 만든 발행본은 그대로다
    category: policy
    applies_to: DELETE /v1/presets/{presetId}
    trigger: 지우기
    logic: 프리셋 행을 지우고 항목은 연쇄로 지운다. 발행본은 프리셋을 가리키지 않으므로 바뀌지 않는다
    violation: BR1.1의 응답
    source: FR1.9, FR2.11, AC1.5.3, AC2.5.2
  - id: BR1.9
    statement: 프리셋 목록은 그 회원의 프리셋 모두를 한 번에, 만든 순서로 준다
    category: policy
    applies_to: GET /v1/presets
    trigger: 목록 열기
    logic: 만든 시각 오름차순, 같으면 presetId 순. 쪽을 나누지 않는다. 각 줄은 BR2.3의 요약
    violation: 없음
    source: FR1.2, NFR6, AC1.1.3

  # BR2 세기와 발행 자격(PublishableSource)
  - id: BR2.1
    statement: 글자 수는 발행과 같은 셈이다
    category: calculation
    applies_to: 프리셋 저장·목록·상세·세기, 발행
    trigger: 셀 때
    logic: Catch는 작업 사실·나의 기여·근거 문장·작성자 설명의 코드 포인트 합, 텍스트 자료는 본문, PDF는 읽을 수 있는 쪽 글의 합. 추출이 끝나지 않은 PDF는 0
    violation: 없음
    source: FR1.7, FR1.14, AC1.6.3
  - id: BR2.2
    statement: 자료 하나의 발행할 수 없는 이유는 하나로 정한다
    category: calculation
    applies_to: 프리셋 목록·상세·세기
    trigger: 셀 때
    logic: Catch는 확인 필요 → 보호 → 비공개 순으로 처음 맞는 것(CONFIRMATION_REQUIRED·SOURCE_RESTRICTED·PRIVATE). PDF는 추출이 끝나지 않았으면 EXTRACTION_INCOMPLETE. 텍스트 자료는 이유가 없다. 맞는 것이 없으면 null
    violation: 없음
    source: FR1.11, FR2.4, AC1.6.1, AC1.6.2
  - id: BR2.3
    statement: 프리셋 요약은 항목 수·글자 수·상한 넘음·발행할 수 없는 자료를 읽을 때 센다
    category: calculation
    applies_to: GET /v1/presets
    trigger: 목록 열기
    logic: itemCount = 항목 수, textLength = BR2.1의 합, overLimit = textLength > 60,000, unpublishableItems = BR2.2의 이유가 있는 항목(제목과 이유). 저장하지 않는다(ADR-005)
    violation: 없음
    source: FR1.2, FR1.14, AC1.1.3, AC1.6.3, AC2.2.3
  - id: BR2.4
    statement: 세기 경로는 고른 자료 목록을 받아 자료마다 제목·글자 수·이유를 돌려준다
    category: policy
    applies_to: POST /v1/presets/measure
    trigger: 편집 화면이 담긴 자료나 고르기 목록의 자료를 물을 때(Q1)
    logic: 요청 { items: [{ kind, sourceId }] } 1~50개, 같은 자료 두 번 안 됨. 응답 { items: ItemMeasure[] }(요청 순서). 화면은 이 값으로 담으면 60,000자를 넘는 자료의 단추를 담기 전에 막는다. 50개를 넘으면 화면이 나눠 묻는다
    violation: 400 VALIDATION_FAILED(개수·중복), 404 RESOURCE_UNAVAILABLE(BR1.5)
    source: FR1.7, AC1.2.4

  # BR3 발행(Publications)
  - id: BR3.1
    statement: 발행 요청은 프리셋 ID 1~5개다
    category: validation
    applies_to: POST /v1/publications
    trigger: 발행
    logic: 본문 칸은 title·password·presetIds만. presetIds는 1~5개, 같은 ID 두 번 안 됨. items 칸은 정의 밖이라 거부
    violation: 400 VALIDATION_FAILED
    source: FR2.2, AC2.1.3
  - id: BR3.2
    statement: 프리셋은 트랜잭션 밖에서 한 번 읽어 펴고, 그 내용으로 끝까지 발행한다
    category: policy
    applies_to: POST /v1/publications
    trigger: 발행
    logic: 요청 회원의 프리셋만 읽는다. 없거나 남의 것이면 거부. 고른 순서대로 각 프리셋의 자료를 position 순서로 이어 붙여 position을 1부터 매기고, presetOrdinal = 고른 순서, presetName = 읽은 이름. 읽은 뒤 트랜잭션까지 프리셋이 바뀌거나 지워져도 읽은 내용으로 발행한다(Q3). 자료 행은 지금처럼 트랜잭션 안에서 잠그고 다시 읽는다
    violation: 404 RESOURCE_UNAVAILABLE
    source: FR2.2, FR6.1, AC2.1.4, AC2.4.2
  - id: BR3.3
    statement: 항목이 0개인 프리셋은 발행에 넣을 수 없다
    category: validation
    applies_to: POST /v1/publications
    trigger: 펴기 뒤
    logic: IF 편 프리셋 가운데 항목 0개가 있음 THEN 거부
    violation: 400 VALIDATION_FAILED, violations[{ field: "presetIds[i]", reason: emptyPreset }]
    source: FR2.4, AC2.2.1(계약 R-02)
  - id: BR3.4
    statement: 발행본 상한은 편 항목 모두로 센다
    category: validation
    applies_to: POST /v1/publications
    trigger: 펴기 뒤(항목 수), 트랜잭션 안(글자 수)
    logic: 편 항목이 20개 초과면 거부(maxItems). 트랜잭션 안에서 잠근 행으로 BR2.1의 합이 60,000자 초과면 거부(maxTotalLength). 같은 자료가 두 프리셋에 있으면 두 번 센다
    violation: 400 VALIDATION_FAILED
    source: FR2.4, AC2.2.2, AC2.3.2
  - id: BR3.5
    statement: 막히면 이유 하나와 그 이유로 막힌 자료를 프리셋별로 알린다
    category: validation
    applies_to: POST /v1/publications
    trigger: 자격 확인
    logic: 지금 순서대로 처음 걸린 이유 하나를 쓴다 — 추출 미완료(트랜잭션 밖, PDF 복사 전) → 확인 필요 → 보호 → 비공개(트랜잭션 안, 잠근 행). 그 이유로 막힌 자료마다, 그 자료가 든 프리셋마다 blockedSources에 { presetId, kind, sourceId } 한 줄
    violation: 400 VALIDATION_FAILED extractionIncomplete, 409 CONFIRMATION_REQUIRED·SOURCE_RESTRICTED·CATCH_PRIVATE(「비공개 Catch는 발행할 수 없습니다.」) — 모두 details.blockedSources만
    source: FR2.8, AC2.4.1
  - id: BR3.6
    statement: 발행은 Catch의 공개 상태를 바꾸지 않는다
    category: policy
    applies_to: POST /v1/publications
    trigger: 발행 트랜잭션
    logic: 비공개 Catch는 BR3.5로 막히고, 공개로 바꾸는 쓰기는 없다
    violation: 없음
    source: FR2.9, AC2.4.3
  - id: BR3.7
    statement: 같은 자료가 여러 프리셋에 있으면 프리셋마다 사본을 따로 만든다
    category: policy
    applies_to: POST /v1/publications
    trigger: 발행
    logic: 잠그는 원본 ID는 중복을 없앤 집합으로 한 번씩 잠근다. 사본 항목과 PDF 사본 파일은 편 항목마다 따로 만든다
    violation: 없음
    source: FR2.7, AC2.3.1
  - id: BR3.8
    statement: 발행본은 발행 당시 내용을 고정한다
    category: policy
    applies_to: 발행본 열람
    trigger: 발행 뒤
    logic: 사본은 프리셋을 가리키지 않는다. 프리셋을 고치거나 지워도 탭 이름(presetName)과 자료는 그대로다
    violation: 없음
    source: FR2.11, AC2.5.1, AC2.5.2

  # BR4 앞선 사본(SnapshotContract)
  - id: BR4.1
    statement: 같은 원본의 사본 가운데 순서가 가장 앞선 것만 앞선 사본이다
    category: calculation
    applies_to: 사본 읽기, 조각 나누기
    trigger: 읽을 때
    logic: 같은 (itemKind, sourceId)의 항목 가운데 position이 가장 작은 항목만 isFirstCopy = true. 판정 함수는 하나다
    violation: 없음
    source: FR6.3(도메인 설계 Q6·Q9)
  - id: BR4.2
    statement: 검색 조각은 앞선 사본에서만 만든다
    category: policy
    applies_to: 발행 트랜잭션의 조각 나누기
    trigger: 발행
    logic: published_item에서 source_id를 더 읽어 BR4.1로 거른 항목만 조각으로 만든다. seq는 지금처럼 1부터 이어 매긴다. 질의응답·JD 요약은 이 조각을 검색한다
    violation: 없음
    source: FR6.3, AC3.3.2
  - id: BR4.3
    statement: 기본 요약 근거와 질의응답 머리글은 앞선 사본만 쓴다
    category: policy
    applies_to: 기본 요약 근거 만들기, 질의응답 머리글 만들기
    trigger: 요약·질문
    logic: isFirstCopy가 참인 항목만 근거로 쓴다. 머리글은 그 항목들로 표 글자를 매기고 둘째 줄의 같은 작업 수를 센다. 프리셋 이름은 넣지 않는다(ADR-007)
    violation: 없음
    source: FR6.3, AC3.3.2, AC3.3.3
  - id: BR4.4
    statement: 받은 링크 읽기는 앞선 사본만 순서대로 싣는다
    category: policy
    applies_to: MCP read_shared_publication
    trigger: 읽기
    logic: isFirstCopy가 참인 항목만 position 순서로 싣고, 빠진 position은 건너뛴다. 프리셋 구분과 이름은 싣지 않는다. cursor 모양은 그대로
    violation: 없음
    source: FR6.2, AC3.6.1(AC3.6.2는 도메인 설계 Q9가 대신함)
  - id: BR4.5
    statement: 원본 ID와 앞선 사본 값은 받은 사람에게 내보내지 않는다
    category: authorization
    applies_to: GET /v1/public/links/{token}
    trigger: 응답
    logic: 받은 링크 열람 응답을 만들 때 isFirstCopy를 뺀다. sourceId는 어떤 사본 응답에도 싣지 않는다
    violation: 없음
    source: NFR4(도메인 설계 ADR-006)

  # BR5 변경 전 발행본 버리기
  - id: BR5.1
    statement: 마이그레이션이 변경 전 발행본 행을 모두 지운 뒤 항목 칸 둘을 더한다
    category: policy
    applies_to: 배포 때 도는 마이그레이션
    trigger: 배포
    logic: publication 행을 모두 지운다(항목·쪽·조각·색인·요약·JD 요약 실행이 연쇄로 지워짐). 그다음 published_item에 presetOrdinal·presetName을 기본값 없이 필수로 더한다. 옛 링크는 지금의 접근 불가 화면이 된다
    violation: 없음
    source: FR5.1, AC3.1.4
  - id: BR5.2
    statement: 변경 전 발행본의 PDF 사본 파일은 팀장이 배포 전에 사본 폴더만 지운다
    category: policy
    applies_to: 배포 안내, PR 본문
    trigger: 배포 전
    logic: 지울 곳은 members/*/publications/ 뿐이다. 원본(members/*/materials/)과 members/ 전체는 지우지 않는다. S3는 --dryrun으로 지울 목록을 먼저 확인한 뒤 지운다. 팀원 로컬 폴더의 남은 사본은 가리키는 행이 없어 열리지 않으므로 지우기는 선택이다(Q4)
    violation: 없음
    source: FR5.1

  # BR6 지우기·탈퇴
  - id: BR6.1
    statement: 텍스트 자료나 PDF를 지우면 담긴 프리셋에서 함께 빠지고, 발행본 사본은 그대로다
    category: policy
    applies_to: 텍스트 자료·PDF 지우기
    trigger: 지우기
    logic: 프리셋 항목이 외래 키 연쇄로 지워진다. 남은 항목의 position은 빈자리가 생겨도 다시 매기지 않고, 읽을 때 position 순서로 보인다. 자료 모듈 코드는 바꾸지 않는다
    violation: 없음
    source: FR4.1, AC4.1.2, AC4.1.3, AC4.1.4
  - id: BR6.2
    statement: 탈퇴하면 프리셋이 모두 지워지고 탈퇴는 막히지 않는다
    category: policy
    applies_to: 탈퇴
    trigger: 회원 행 삭제
    logic: 프리셋은 회원 행에, 항목은 프리셋·Catch·텍스트 자료·PDF에 연쇄 삭제로 묶여 있어 지금 탈퇴 순서로 모두 지워진다. member-withdrawal-deletion.md 표에 두 표를 더한다
    violation: 없음
    source: FR4.2, AC4.2.1

  # BR7 자료 보호
  - id: BR7.1
    statement: 프리셋 이름과 담긴 자료 내용은 로그와 오류 응답에 남기지 않는다
    category: policy
    applies_to: 프리셋 경로, 세기 경로, 발행
    trigger: 로그·오류
    logic: 로그와 오류 응답에는 ID와 오류 코드만 쓴다
    violation: 없음
    source: NFR4
```

## 요약

| 묶음 | 규칙 | 핵심 |
|---|---|---|
| BR1 프리셋 저장 | BR1.1~BR1.9 | 본인 것만, 이름 1~50자, 50개, 항목 0~20·중복 없음·60,000자, 자격은 저장을 막지 않음 |
| BR2 세기 | BR2.1~BR2.4 | 발행과 같은 글자 셈, 이유 하나(확인 필요 → 보호 → 비공개, PDF 추출), 목록은 읽을 때 셈, 세기 경로 1~50개 |
| BR3 발행 | BR3.1~BR3.8 | presetIds 1~5, 밖에서 한 번 읽어 폄, 빈 프리셋 거부, 두 번 세기, 막힘은 blockedSources 하나, 공개 전환 없음, 사본은 프리셋마다 |
| BR4 앞선 사본 | BR4.1~BR4.5 | (종류, 원본 ID)의 가장 앞선 것만 조각·요약·머리글·받은 링크 읽기에 씀, 받은 사람에게 내보내지 않음 |
| BR5 변경 전 발행본 | BR5.1·BR5.2 | 마이그레이션은 행, 파일은 팀장이 사본 폴더만 |
| BR6 지우기·탈퇴 | BR6.1·BR6.2 | 연쇄 삭제, 자료·탈퇴 코드는 그대로 |
| BR7 자료 보호 | BR7.1 | 이름·내용은 로그·오류에 없음 |
