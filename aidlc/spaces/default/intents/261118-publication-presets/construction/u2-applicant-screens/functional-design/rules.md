# Rules — u2-applicant-screens

이 단위의 규칙은 지원자 화면(프리셋 목록·편집, 발행 화면)이 무엇을 보이고 언제 막는지와, 그 화면을 위해 고치는 api 조회 조건 하나·web 응답 해석 하나다. 저장·세기·발행의 최종 검증은 U1(api `src/presets/`·`src/publications/`)이 하고, 화면 규칙은 그 결과를 미리 보여 줄 뿐이다. 글자는 다듬은 화면 `inception/refined-mockups/mockups.md` M1~M4의 글을 쓴다.

```yaml
rules:
  - id: BR1.1
    statement: 상단 메뉴는 「내 자산 · 텍스트 자료 · 프리셋 · 발행본 · JD 관리」 순서이고, 「프리셋」은 프리셋 목록으로 간다
    category: policy
    applies_to: 회원 상단 메뉴
    trigger: 로그인한 지원자가 회원 화면을 열 때
    logic: IF 회원 화면 THEN 「텍스트 자료」와 「발행본」 사이에 「프리셋」을 둔다. 현재 자리는 지금처럼 주소가 같거나 그 아래일 때만 켠다
    violation: 메뉴 순서·현재 자리 시험이 실패한다
    source: FR1.1
  - id: BR1.2
    statement: 프리셋 화면 주소는 목록 /presets, 새 프리셋 /presets/new, 고치기 /presets/{presetId}이고 /publications 아래가 아니다
    category: constraint
    applies_to: web 주소
    trigger: 프리셋 화면을 열거나 옮길 때
    logic: IF 프리셋 화면 THEN 이 세 주소만 쓰고, 프리셋 화면에서는 「발행본」이 현재 자리로 켜지지 않는다
    violation: 「프리셋」과 「발행본」이 함께 켜진다
    source: FR1.1(기능 설계 Q1)
  - id: BR2.1
    statement: 프리셋 목록은 50개까지 한 번에, 만든 순서로, 프리셋마다 이름·항목 수·글자 수와 발행할 수 없는 자료 수·상한 넘음을 글자로 보인다
    category: policy
    applies_to: 프리셋 목록 화면
    trigger: 목록을 열 때
    logic: IF GET /v1/presets 성공 THEN 받은 순서대로 모두 보이고, unpublishableCount>0이면 「발행할 수 없는 자료 N개」, overLimit이면 「상한을 넘었습니다」를 붙인다
    violation: 쪽이 나뉘거나 표시가 색으로만 보인다
    source: FR1.2, FR1.14, NFR1, NFR6
  - id: BR2.2
    statement: 목록 화면은 불러오는 중·비었음·불러오기 실패를 서로 다른 글로 보이고, 실패를 0개로 보이지 않는다
    category: validation
    applies_to: 프리셋 목록 화면
    trigger: 목록 요청 중·성공 0개·실패
    logic: IF 실패 THEN 「프리셋 목록을 불러오지 못했습니다.」와 [다시 불러오기]만 보이고 0개 안내는 보이지 않는다
    violation: 실패가 「아직 만든 프리셋이 없습니다」로 보인다
    source: FR1.2, NFR5
  - id: BR2.3
    statement: 프리셋이 50개면 [새 프리셋]을 막고 「프리셋은 50개까지 만들 수 있습니다.」를 보인다
    category: constraint
    applies_to: 프리셋 목록 화면
    trigger: 목록이 50개일 때
    logic: IF 받은 프리셋 수 >= 50 THEN [새 프리셋]을 막는다. 새 프리셋 저장이 409 PRESET_LIMIT_REACHED면 같은 글을 보이고 입력을 남긴다
    violation: 51번째를 만들 수 있는 것처럼 보인다
    source: FR1.3
  - id: BR3.1
    statement: 이름은 앞뒤 공백을 뺀 1~50자이고, 이름 칸에 탭 이름 안내가 있으며, 어긋나면 이름 칸 아래에 이유를 보이고 담은 자료를 남긴다
    category: validation
    applies_to: 프리셋 편집 이름 칸
    trigger: [저장]을 누를 때와 서버 400 name일 때
    logic: IF 앞뒤 공백 뺀 길이(코드 포인트)가 0 또는 51 이상 THEN 요청하지 않고 「이름을 1~50자로 써 주세요.」를 보인다. 같은 이름은 막지 않는다
    violation: 빈 이름이 저장되거나 담은 자료가 사라진다
    source: FR1.4
  - id: BR3.2
    statement: Catch 고르기 목록은 담을 수 있는 Catch만 보이고 「작성자 설명을 쓴 Catch만 보기」는 지금 발행 화면처럼 동작한다
    category: policy
    applies_to: 프리셋 편집의 Catch 고르기
    trigger: 고르기 목록을 불러올 때
    logic: IF Catch 목록 요청 THEN GET /v1/catches에 publishable=true를 붙이고, 걸러 보기를 켜면 authorDescription=written을 함께 붙인다
    violation: 비공개·확인 필요·보호 Catch가 목록에 나온다
    source: FR1.5
  - id: BR3.3
    statement: 고르기는 누르는 단추이고, 한 프리셋 안에서 같은 자료는 한 번만 담긴다
    category: constraint
    applies_to: 프리셋 편집의 고르기 단추
    trigger: 단추를 누를 때
    logic: IF 담기지 않은 자료 THEN 담긴 목록 끝에 더하고 눌림 상태로 바꾼다. IF 이미 담긴 자료 THEN 담긴 목록에서 뺀다
    violation: 같은 자료가 두 번 담긴다
    source: FR1.6
  - id: BR3.4
    statement: 이미 20개를 담았거나 담으면 전체 글이 60,000자를 넘는 자료의 단추는 미리 막고 단추 안에 이유를 보인다
    category: constraint
    applies_to: 프리셋 편집의 고르기 단추
    trigger: 고르기 목록의 한 쪽을 불러올 때와 담긴 목록이 바뀔 때
    logic: IF 쪽을 불러옴 THEN 그 쪽의 고를 수 있는 자료를 POST /v1/presets/measure로 한 번 센다. IF 담긴 수 = 20 THEN 안 담긴 단추에 「항목은 20개까지 담을 수 있습니다」. IF 담긴 글자 합 + 그 자료 글자 수 > 60,000 THEN 「전체 글이 60,000자를 넘습니다」. 세기에 실패한 쪽은 글자 이유로 막지 않는다
    violation: 상한을 넘는 자료가 담기거나, 세기 실패로 단추가 모두 막힌다
    source: FR1.7(기능 설계 Q3)
  - id: BR3.5
    statement: 담긴 자료의 순서는 [위로][아래로]로 바꾸고 [빼기]로 빼며, 첫 자료의 [위로]와 끝 자료의 [아래로]는 막힌다
    category: policy
    applies_to: 담긴 자료와 순서
    trigger: 순서 단추를 누를 때
    logic: IF [위로] THEN 바로 앞과 자리를 바꾸고 초점은 옮긴 항목의 같은 단추에 남는다. IF [빼기] THEN 빼고 항목 수·글자 수를 다시 보인다
    violation: 순서가 저장 요청 배열 순서와 다르다
    source: FR1.8
  - id: BR3.6
    statement: 담긴 자료가 발행할 수 없게 되면 담긴 목록에 남기고 이유를 글자로 보인다
    category: policy
    applies_to: 담긴 자료와 순서
    trigger: 편집 화면을 열 때(PresetDetail.items[].unpublishableReason)
    logic: IF PRIVATE THEN 「비공개로 바뀌어 발행할 수 없습니다」, SOURCE_RESTRICTED THEN 「원본 저장소가 보호되어 발행할 수 없습니다」, CONFIRMATION_REQUIRED THEN 「작업 사실과 나의 기여를 먼저 확인해야 발행할 수 있습니다」, EXTRACTION_INCOMPLETE THEN 「글 추출이 끝나지 않아 발행할 수 없습니다」
    violation: 자료가 사라지거나 색으로만 표시된다
    source: FR1.11, NFR1
  - id: BR3.7
    statement: 담긴 자료 글자 합이 60,000자를 넘으면 「담긴 자료와 순서」 머리에 「전체 글이 60,000자를 넘어 발행할 수 없습니다.」를 보이고 [저장]은 막지 않는다
    category: policy
    applies_to: 프리셋 편집
    trigger: 편집 화면을 열 때와 담긴 목록이 바뀔 때
    logic: IF 글자 합 > 60,000 THEN 안내를 보인다. IF 저장이 400 maxTotalLength THEN 「전체 글이 60,000자를 넘어 저장할 수 없습니다. 자료를 빼 주세요.」를 보이고 입력을 남긴다
    violation: 상한을 넘었는데 아무 안내가 없거나 입력이 사라진다
    source: FR1.14(기능 설계 Q6)
  - id: BR3.8
    statement: 저장은 만들 때 POST, 고칠 때 PUT으로 이름과 담긴 순서의 배열을 보내고, 결과를 상태로 구분해 보이며 실패하면 입력을 남긴다
    category: policy
    applies_to: 프리셋 편집 [저장]
    trigger: [저장]을 누를 때
    logic: IF 저장 중 THEN [저장]을 막고 「저장하고 있습니다.」. IF 성공 THEN 편집 화면에 남아 「저장했습니다.」, 새 프리셋이면 /presets/{presetId}로 주소를 바꾼다. IF 실패 THEN 이유별 글(BR3.1·BR2.3·BR3.7, 그 밖은 「저장하지 못했습니다. 다시 시도해 주세요.」)
    violation: 실패 뒤 입력이 사라지거나 저장된 것처럼 보인다
    source: FR1.12, FR1.13
  - id: BR3.9
    statement: 프리셋을 지울 때는 이름을 밝힌 확인을 거치고, 취소하면 그대로 두며, 지우면 목록으로 간다
    category: policy
    applies_to: 프리셋 편집 [프리셋 지우기]
    trigger: [프리셋 지우기]를 누를 때
    logic: IF 확인 THEN DELETE /v1/presets/{presetId} 뒤 /presets로 간다. IF 취소 THEN 아무것도 하지 않는다
    violation: 확인 없이 지워지거나 취소해도 지워진다
    source: FR1.9
  - id: BR3.10
    statement: 편집 화면에 「프리셋을 고쳐도 이미 보낸 링크는 바뀌지 않습니다.」가 있고, 저장하지 않은 변경을 두고 떠나면 텍스트 자료 화면과 같은 경고를 쓴다
    category: policy
    applies_to: 프리셋 편집
    trigger: 화면을 볼 때와 떠날 때
    logic: IF 이름·담기·순서를 바꾼 뒤 저장 전에 떠남 THEN 「저장하지 않은 입력이 있습니다. 이동하시겠습니까?」를 묻는다
    violation: 경고 없이 입력이 사라진다
    source: FR1.10, FR1.13
  - id: BR3.11
    statement: 프리셋 이름은 목록·편집·발행 화면 어디서나 글자로만 그린다
    category: validation
    applies_to: 프리셋 이름 표시
    trigger: 이름을 그릴 때
    logic: IF 이름에 <b> 같은 글이 있어도 THEN React 글자로만 넣고 HTML로 해석하지 않는다
    violation: 이름이 태그로 해석된다
    source: NFR3
  - id: BR4.1
    statement: 발행 화면은 프리셋을 1~5개 고르고 [위로][아래로][빼기]로 순서를 정하며, 나머지 흐름(제목과 비밀번호 → 발행 내용 확인 → 발행됨)은 지금 그대로다
    category: policy
    applies_to: 발행 화면
    trigger: 발행 화면을 쓸 때
    logic: IF 고른 프리셋이 1개 이상 THEN 지금처럼 제목·비밀번호를 받고 POST /v1/publications에 { title, password?, presetIds }(고른 순서)를 보낸다
    violation: 흐름이 바뀌거나 items 칸을 보낸다
    source: FR2.1, FR2.2, FR6.1
  - id: BR4.2
    statement: 고를 수 없는 프리셋은 단추를 막고 이유 하나를 단추 안에 보인다. 이유는 항목 0개 → 발행할 수 없는 자료 → 상한 순서로 고른다
    category: constraint
    applies_to: 발행 화면의 프리셋 단추
    trigger: 목록을 그릴 때와 고른 프리셋이 바뀔 때
    logic: IF itemCount=0 THEN 「담긴 자료가 없어 고를 수 없습니다」. ELSE IF unpublishableCount>0 THEN 「발행할 수 없는 자료가 있습니다: (첫 자료 이름)」, 둘 이상이면 뒤에 「 외 N개」. ELSE IF 고른 프리셋들과 더한 항목 수 > 20 THEN 「고르면 항목이 20개를 넘습니다」. ELSE IF 더한 글자 수 > 60,000 THEN 「고르면 전체 글이 60,000자를 넘습니다」. 같은 자료가 두 프리셋에 있으면 두 번 센다
    violation: 고를 수 없는 프리셋을 고르거나 이유가 둘 보인다
    source: FR2.4(기능 설계 Q4)
  - id: BR4.3
    statement: 다섯 개를 고르면 안 고른 단추를 모두 막고 「프리셋은 5개까지 고를 수 있습니다.」를 목록 위에 한 번만 보이며, 단추 안에는 그 프리셋 자체의 이유만 보인다
    category: constraint
    applies_to: 발행 화면의 프리셋 고르기
    trigger: 고른 프리셋이 5개일 때
    logic: IF 고른 수 = 5 THEN 안 고른 단추를 막고, 단추 안 이유는 항목 0개·발행할 수 없는 자료일 때만 보인다
    violation: 6번째를 고르거나 5개 안내가 단추마다 보인다
    source: FR2.3
  - id: BR4.4
    statement: 프리셋 목록 불러오기는 불러오는 중·없음·실패를 구분하고, 없으면 프리셋 목록 링크만, 실패면 [다시 불러오기]를 보인다
    category: validation
    applies_to: 발행 화면의 프리셋 고르기
    trigger: 발행 화면을 열 때
    logic: IF 0개 THEN 「아직 만든 프리셋이 없습니다.」와 <프리셋 만들러 가기>(/presets)만. IF 실패 THEN 「프리셋 목록을 불러오지 못했습니다.」와 [다시 불러오기], 0개로 보이지 않는다
    violation: 실패가 「프리셋 없음」으로 보이거나 발행 화면 안에서 프리셋을 만든다
    source: FR2.5, FR2.6, NFR5
  - id: BR4.5
    statement: 「발행 내용 확인」은 지금처럼 제목·비밀번호·만료를 보이고, 고른 항목 대신 고른 프리셋과 그 순서를 보인다
    category: policy
    applies_to: 발행 내용 확인
    trigger: [다음: 발행 내용 확인]을 누를 때
    logic: IF 확인 단계 THEN 「고른 프리셋과 순서」에 프리셋 이름을 고른 순서대로 보인다
    violation: 고른 자료 목록이 보이거나 순서가 다르다
    source: FR2.10
  - id: BR4.6
    statement: 서버가 발행을 막으면 프리셋 목록을 다시 불러와 막힌 프리셋과 자료를 줄마다 보이고, 고른 프리셋과 입력한 제목·비밀번호를 남긴다
    category: policy
    applies_to: 발행 화면의 막힘 안내
    trigger: 409 CONFIRMATION_REQUIRED·SOURCE_RESTRICTED·CATCH_PRIVATE 또는 400 extractionIncomplete에 details.blockedSources가 있을 때
    logic: IF 막힘 THEN 「발행되지 않았습니다」 아래 blockedSources 줄마다 「‘(프리셋 이름)’ 프리셋의 ‘(자료 이름)’ 때문에 발행할 수 없습니다.」. 이름은 다시 불러온 목록의 unpublishableItems에서 찾고, 못 찾으면 자료 이름 자리에 종류(Catch·텍스트 자료·PDF 자료)를 쓴다. 다시 불러온 목록으로 단추 막힘(BR4.2)도 바뀐다
    violation: 어느 프리셋의 어느 자료인지 보이지 않거나 입력이 사라진다
    source: FR2.8(기능 설계 Q5)
  - id: BR4.7
    statement: 발행 화면에서 비공개 Catch를 공개로 바꾼다는 안내를 없앤다
    category: policy
    applies_to: 발행 화면
    trigger: 발행 화면을 그릴 때
    logic: IF 발행 화면 THEN 고른 비공개 Catch 안내(PRIVATE_CATCH_NOTICE)를 그리지 않는다. 프리셋에는 공개한 Catch만 담긴다
    violation: 발행이 비공개 Catch를 공개로 바꾼다고 안내한다
    source: FR2.9
  - id: BR5.1
    statement: 본인 Catch 목록 GET /v1/catches는 쿼리 publishable=true를 받으면 공개이고 작업 사실·기여가 확인됐고 원본 저장소가 보호되지 않은 Catch만 준다
    category: validation
    applies_to: api 본인 Catch 목록
    trigger: publishable 쿼리가 있을 때
    logic: IF publishable=true THEN 그 세 조건을 SQL로 더하고 커서 범위에 넣는다. 다른 값·빈 값·두 번은 400(authorDescription과 같은 규칙). 판정은 U1 PublishableSource와 같은 결과다
    violation: 판정이 발행과 달라 고른 Catch가 발행에서 막힌다
    source: FR1.5(기능 설계 Q2)
  - id: BR5.2
    statement: web 응답 해석은 오류 details의 blockedSources를 옮기고, api가 더는 보내지 않는 catchIds 처리는 지운다
    category: validation
    applies_to: web/src/lib/api-response.ts
    trigger: api 오류 응답을 읽을 때
    logic: IF details.blockedSources가 배열이고 줄마다 presetId·sourceId가 글자, kind가 CATCH·TEXT_MATERIAL·PDF_MATERIAL THEN 그 세 칸만 옮긴다. 모양이 어긋나면 지금 다른 칸처럼 그 응답을 오류 모양 어긋남으로 본다
    violation: 막힘 칸이 버려져 화면이 어느 자료인지 모른다
    source: FR2.8(기능 설계 Q5, #626 리뷰)
```

| ID | 내용 | 화면 |
|---|---|---|
| BR1.1 | 메뉴 순서·현재 자리 | 상단 메뉴 |
| BR1.2 | 주소 /presets 꼴 | 프리셋 화면 |
| BR2.1 | 목록 표시(50개 한 번에) | 프리셋 목록 |
| BR2.2 | 중·없음·실패 구분 | 프리셋 목록 |
| BR2.3 | 50개 제한 | 프리셋 목록·편집 |
| BR3.1 | 이름 1~50자 | 프리셋 편집 |
| BR3.2 | 담을 수 있는 Catch만 | 프리셋 편집 |
| BR3.3 | 같은 자료 한 번 | 프리셋 편집 |
| BR3.4 | 20개·60,000자 미리 막기 | 프리셋 편집 |
| BR3.5 | 위로·아래로·빼기 | 프리셋 편집 |
| BR3.6 | 발행할 수 없는 이유 | 프리셋 편집 |
| BR3.7 | 상한 넘음 안내·저장 거부 | 프리셋 편집 |
| BR3.8 | 저장 상태 | 프리셋 편집 |
| BR3.9 | 지우기 확인 | 프리셋 편집 |
| BR3.10 | 링크 안내·이탈 경고 | 프리셋 편집 |
| BR3.11 | 이름 글자로만 | 모든 프리셋 화면 |
| BR4.1 | 1~5개·순서·흐름 그대로 | 발행 |
| BR4.2 | 고를 수 없는 이유 | 발행 |
| BR4.3 | 5개 다 참 | 발행 |
| BR4.4 | 중·없음·실패 | 발행 |
| BR4.5 | 확인 단계 | 발행 |
| BR4.6 | 서버 막힘 표시 | 발행 |
| BR4.7 | 공개 전환 안내 없앰 | 발행 |
| BR5.1 | publishable=true | api Catch 목록 |
| BR5.2 | blockedSources 옮기기 | web 응답 해석 |
