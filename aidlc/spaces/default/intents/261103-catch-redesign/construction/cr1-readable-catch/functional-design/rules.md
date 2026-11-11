# CR1 규칙 쪽 Catch — 업무 규칙

입력:
- 요구사항 `inception/requirements-analysis/requirements.md`(FR2·FR3·FR5.1·FR5.2·FR5.7·FR6·FR8.1·FR8.3·FR8.4·NFR4·NFR7)
- 스토리 `inception/user-stories/stories.md`(US1.4·US2.1·US2.2·US3.2·US4.1·US4.2·US4.3)
- 구성 요소 `inception/domain-design/components.md`, 설계 결정 ADR-005
- 이 단계의 답 `functional-design-questions.md`(Q1~Q6)

아래 YAML이 규칙의 정본이다.

```yaml
rules:
  # BR1 이슈 번호로 나누지 않기
  - id: BR1.1
    statement: PR 단위와 PR 없이 합친 병합 단위는 이슈 번호로 나누지 않는다. 이슈 조회가 허용돼도 같다.
    category: policy
    applies_to: 후보 판정(CandidateGrouping)
    trigger: 분석마다 단위를 만들 때
    logic: IF 단위가 PR이거나 PR 없는 병합 THEN 단위 전체가 후보 하나다(나눈 조각 없음).
    violation: 해당 없음(나누는 경로가 없다)
    source: FR2.1
  - id: BR1.2
    statement: 나누기와 관련된 글은 남기지 않는다.
    category: policy
    applies_to: 후보의 작업 사실·묶음 설명·묶음 한계
    trigger: 후보 글을 만들 때
    logic: 「…에서 나눈 부분」 작업 사실, 「…부분을 나눴다」 묶음 설명, 나누지 않은 이유의 한계 글(작성자 경계·수집 중단·목록·변경·겹침·본인 변경·이슈)을 만들지 않는다.
    violation: 해당 없음
    source: FR2.1
  - id: BR1.3
    statement: 나누기를 끄면 지금 나뉘던 단위의 작업 동일성 열쇠가 달라진다. 나뉘지 않던 단위의 열쇠는 그대로다.
    category: constraint
    applies_to: 작업 동일성 열쇠
    trigger: 열쇠를 만들 때
    logic: 나눈 조각이 없으므로 열쇠에 조각 값이 들어가지 않는다. 열쇠를 만드는 법은 바꾸지 않는다.
    violation: 나뉘지 않던 단위의 열쇠가 바뀌면 결함이다(기존 작업 동일성 시험이 잡는다).
    source: FR2.1

  # BR2 기록의 글
  - id: BR2.1
    statement: PR 단위는 본인이 연 PR이고 다른 계정 커밋이 없다고 확인됐을 때만 PR 제목이 기록의 글이다.
    category: calculation
    applies_to: PR 단위 후보
    trigger: 후보 글을 만들 때
    logic: IF PR을 연 계정이 연동 계정이고 그 PR 커밋 목록을 끝까지 받아 다른 계정 커밋이 없다 THEN 기록의 글 = PR 제목(종류 PR 제목). 목록이 잘렸거나 다른 계정 커밋이 있거나 있는지 모르면 PR 제목을 쓰지 않고 BR2.2로 간다.
    violation: 해당 없음
    source: FR5.1
  - id: BR2.2
    statement: PR 제목을 쓰지 않는 단위는 단위 안 본인 커밋(병합 커밋 제외) 가운데 가장 이른 커밋의 메시지 첫 줄이 기록의 글이다.
    category: calculation
    applies_to: 모든 후보
    trigger: BR2.1이 PR 제목을 고르지 않았을 때
    logic: 단위 안의 본인 커밋 가운데 부모가 하나 이하인 커밋을 작성 시각이 이른 순(같으면 SHA 사전순)으로 놓고 첫 커밋의 메시지 첫 줄을 쓴다(종류 커밋 첫 줄). 같은 변경으로 다른 곳에서 이 단위에 배정한 본인 커밋은 고르지 않는다(FR5.1의 「단위 안」). 그런 커밋이 없으면(병합 커밋뿐인 단위 등) 기록의 글이 없다.
    violation: 해당 없음
    source: FR5.1
  - id: BR2.3
    statement: 기록의 글은 메시지 첫 줄(첫 줄바꿈 앞)의 앞뒤 공백을 뺀 글이고, 자르지 않는다.
    category: calculation
    applies_to: 기록의 글
    trigger: BR2.1·BR2.2가 글을 골랐을 때
    logic: 첫 줄바꿈 앞까지를 잡고 앞뒤 공백만 뺀다. 길이 상한으로 자르지 않는다. 빈 글이면 기록의 글이 없다.
    violation: 해당 없음
    source: FR5.1
  - id: BR2.4
    statement: 가리기 규칙에 걸리는 글은 기록의 글로 쓰지 않는다.
    category: validation
    applies_to: 기록의 글
    trigger: BR2.3 뒤
    logic: IF 가리기 검사(한 글 검사)가 가릴 값을 하나라도 찾았다 THEN 기록의 글이 없다. 다른 글로 바꿔 고르지 않는다. 한 글 검사는 지금 생성 쪽에 있는 검사를 후보 판정과 생성이 함께 쓰는 곳으로 옮겨 쓴다. 후보 판정이 생성 쪽을 불러오지 않게 하려는 것이다(불러오기 순환 방지).
    violation: 비밀값·개인정보가 제목·작업 사실에 나가면 결함이다.
    source: FR5.1
  - id: BR2.5
    statement: 기록의 글이 거의 없으면 부실이다.
    category: validation
    applies_to: 기록의 글
    trigger: BR2.4를 통과한 글
    logic: 글의 앞뒤 공백과 문장 부호를 빼고, 안쪽 공백은 한 칸으로 줄인다. IF 문자·숫자가 2자 이하이거나, 그 글 전체가 부실 목록 항목 하나와 같다(영어 대소문자 무시) THEN 부실이다.
    violation: 해당 없음
    source: FR5.2
  - id: BR2.6
    statement: 부실 목록은 정해 둔 고정 목록이다.
    category: constraint
    applies_to: BR2.5
    trigger: 해당 없음
    logic: 영어 fix, fixes, fixed, update, updates, updated, change, changes, edit, wip, test, tests, tmp, temp, typo, refactor, cleanup, misc, minor, init, commit, save. 한국어 수정, 변경, 업데이트, 작업, 테스트, 정리, 임시, 오타, 커밋, 저장. GitHub 기본 메시지 initial commit, first commit, add files via upload. 편집기 기본 문구(Update README.md 등)는 넣지 않는다.
    violation: 해당 없음
    source: FR5.2
  - id: BR2.7
    statement: 기록의 글은 후보 판정이 한 번만 계산해 후보 자료의 한 칸으로 싣는다.
    category: constraint
    applies_to: 후보 자료(worker 안), 생성 단계
    trigger: 후보를 만들 때
    logic: 후보 자료에 기록의 글 칸(종류, 글, 부실 여부)을 둔다. 작업 사실 둘째 줄(BR4.2)과 제목(BR3.1)은 이 한 칸만 본다. 생성 단계는 기록의 글을 다시 계산하지 않는다. 결과 메시지에는 이 칸을 싣지 않는다(계약 C5 그대로).
    violation: 둘째 줄과 제목의 판단이 서로 다르면 결함이다.
    source: FR5.1, FR6.2

  # BR3 제목
  - id: BR3.1
    statement: AI 쪽이 꺼져 있으면(판정이 없으면) 쓸 만한 기록의 글이 제목이다.
    category: calculation
    applies_to: 후보 제목
    trigger: 생성 단계가 후보 결과를 정할 때
    logic: IF 기록의 글이 있고 부실이 아니다 THEN 제목 = 기록의 글. 생성 호출의 성공·실패·건너뜀과 관계없이 같다.
    violation: 해당 없음
    source: FR5.2, FR5.7
  - id: BR3.2
    statement: 쓸 만한 기록의 글이 없으면 지금의 조각 제목을 쓴다.
    category: calculation
    applies_to: 후보 제목
    trigger: BR3.1이 제목을 정하지 못했을 때
    logic: 생성 호출이 만든 조각 제목(대상·종류·동작, 40자 이하)을 쓴다. 조각 제목도 없으면 제목은 없다(지금과 같다).
    violation: 해당 없음
    source: FR5.7
  - id: BR3.3
    statement: 기록의 글 제목은 조각 제목의 길이 규칙과 고쳐 쓰기를 받지 않는다.
    category: constraint
    applies_to: 후보 제목
    trigger: BR3.1
    logic: 40자 상한과 고쳐 쓰기는 조각 제목에만 쓴다. 기록의 글이 제목이면 조각 제목을 고쳐 쓰는 호출을 하지 않는다. 운영 로그의 「제목만 없음」 집계는 최종 제목이 없는 경우만 센다.
    violation: 기록의 글이 잘리거나 바뀌면 결함이다.
    source: FR5.1

  # BR4 작업 사실
  - id: BR4.1
    statement: 작업 사실 첫 줄은 단위 종류만 쓰고 SHA와 날짜를 넣지 않는다.
    category: calculation
    applies_to: 후보 작업 사실
    trigger: 후보 글을 만들 때
    logic: PR은 「PR #n, 상태 병합됨|열림|닫힘」. PR 없는 병합은 「PR 없이 합친 병합」. 커밋 묶음은 커밋이 하나면 「PR·병합 없이 들어간 본인 커밋」, 둘 이상이면 「PR·병합 없이 들어간 본인 커밋 묶음」. 예외로, PR 조회가 허용되지 않은 요청의 커밋 묶음은 「PR·병합 없이」 대신 「병합 없이」로 쓴다. PR을 확인하지 않고 「PR 없이」라고 쓰지 않으려는 것이며, AC2.2.1의 세 가지 꼴 밖의 예외다.
    violation: 첫 줄에 SHA 꼴 16진수나 날짜가 있으면 결함이다.
    source: FR6.1
  - id: BR4.2
    statement: 쓸 만한 기록의 글이 있을 때만 둘째 줄을 더한다.
    category: calculation
    applies_to: 후보 작업 사실
    trigger: BR4.1 뒤
    logic: IF 기록의 글이 있고 부실이 아니다(BR2.5만 본다) THEN 둘째 줄 = 「PR 제목: "{글}"」 또는 「본인 커밋 메시지 첫 줄: "{글}"」. 글은 원문 그대로다. 아니면 둘째 줄이 없다. 둘째 줄은 언제나 작업 사실의 두 번째 항목이라, CR3은 표식 없이 위치로 이 줄을 지운다.
    violation: 부실한 글로 둘째 줄을 만들면 결함이다.
    source: FR6.2
  - id: BR4.3
    statement: 작업 사실에는 AI가 쓴 글이 들어가지 않는다.
    category: policy
    applies_to: 후보 작업 사실
    trigger: 항상
    logic: 작업 사실은 BR4.1·BR4.2로만 만든다. 생성 단계는 작업 사실을 바꾸지 않는다(CR3이 둘째 줄 지우기만 더한다, ADR-005).
    violation: 작업 사실에 생성 출력이 있으면 결함이다.
    source: FR6.3
  - id: BR4.4
    statement: 다른 계정 커밋이 섞였는지 알리는 문장은 쓰지 않는다.
    category: policy
    applies_to: 후보 작업 사실
    trigger: 항상
    logic: 작업 사실에서 「…작성자로 기록되지 않은 커밋이 있다/없다/있는지 알 수 없다」 문장만 지운다. 2026-10-08 결정의 이 문장은 이 intent가 대체한다. 다른 계정 커밋 여부 값과 그 값을 쓰는 곳(BR2.1, 생성 단계의 재료·조각 제목 처리)은 그대로 둔다.
    violation: 해당 없음
    source: FR6.2
  - id: BR4.5
    statement: 작업 사실은 첫 줄과 둘째 줄뿐이다.
    category: constraint
    applies_to: 후보 작업 사실
    trigger: 항상
    logic: 작업 사실은 1줄 또는 2줄이다. 값이 같은 후보를 합칠 때는 첫 후보의 작업 사실과 기록의 글을 그대로 남기고, 둘째 후보의 줄은 더하지 않는다.
    violation: 해당 없음
    source: FR6.1, FR6.2
  - id: BR4.6
    statement: 「센 숫자를 쓰지 않는다」 규칙은 CatchU가 만든 문장에만 적용하고 기록의 글 줄에는 적용하지 않는다.
    category: constraint
    applies_to: 작업 사실 둘째 줄
    trigger: 항상
    logic: 둘째 줄의 따옴표 안 글은 작성자 원문이라 숫자가 있어도 그대로 둔다. 첫 줄과 다른 CatchU 문장은 지금처럼 센 숫자를 넣지 않는다.
    violation: 해당 없음
    source: FR6.2

  # BR5 재료
  - id: BR5.1
    statement: 파일 종류는 시험 → 문서 → 설정 → 코드 순서로 판정하고, 어디에도 안 걸리면 그 밖이다.
    category: calculation
    applies_to: 재료 파일, 조각 제목의 종류
    trigger: 재료를 고를 때와 조각 제목을 만들 때
    logic: 지금 표에 다음을 더한다. 시험은 파일 이름(확장자 앞)이 Test·Tests로 끝나는 꼴(대문자 T), Android androidTest 폴더, 이름이 Tests로 끝나는 폴더(iOS 앱Tests·앱UITests 포함). 설정은 AndroidManifest.xml, .gradle, .gradle.kts, .plist, .xcconfig, Podfile, .pbxproj. 코드는 .ipynb. 폴더 이름 test·tests의 대소문자 무시는 지금 그대로다.
    violation: 해당 없음
    source: FR3.1
  - id: BR5.2
    statement: 재료는 코드 → 시험 → 설정 → 문서 → 그 밖 순서로 담는다. 어떤 폴더도 빼지 않는다.
    category: calculation
    applies_to: 모든 후보의 재료
    trigger: 생성 호출 자료를 고를 때
    logic: 같은 종류 안에서는 지금 순서(근거의 본인 커밋 최근 것부터, 커밋 안에서는 GitHub가 준 파일 순서, 파일 안에서는 줄 순서)를 따른다. 상한을 넘는 줄은 건너뛰고 다음 줄을 본다.
    violation: 해당 없음
    source: FR3.1
  - id: BR5.3
    statement: 큰 후보는 바뀐 파일 경로가 처음 갈라지는 폴더 깊이로 변경 묶음을 나눈다.
    category: calculation
    applies_to: 큰 후보(재료가 될 수 있는 줄을 모두 담으면 재료 상한을 넘는 후보)
    trigger: 재료를 고를 때
    logic: 깊이 1부터 늘려 가며 그 깊이의 폴더가 둘 이상으로 갈라지는 첫 깊이를 찾는다. 그 깊이의 폴더마다 묶음이고, 그 깊이보다 얕은 곳의 파일은 함께 한 묶음이다. 묶음 수 상한은 없다. 갈라지는 깊이가 없으면 묶음 하나다.
    violation: 해당 없음
    source: FR3.2
  - id: BR5.4
    statement: 갈라진 폴더가 모두 계층 이름이면 파일 이름 앞부분으로 묶는다.
    category: calculation
    applies_to: BR5.3의 묶음
    trigger: BR5.3 뒤
    logic: IF 갈라진 폴더 이름이 모두 계층 이름(controller, service, repository, dao, entity, model, dto, mapper, handler, route, view의 단수·복수, 대소문자 무시) THEN 파일 이름에서 계층 낱말과 구분자를 뺀 앞부분이 같은 파일끼리 묶는다. 앞부분이 하나뿐이면 묶음 하나다.
    violation: 해당 없음
    source: FR3.2
  - id: BR5.5
    statement: 시험 파일은 대상 파일의 묶음에 붙인다.
    category: calculation
    applies_to: 시험으로 판정한 파일
    trigger: BR5.3·BR5.4 뒤
    logic: 시험 파일 이름에서 시험 표시(test_ 앞, _test·.test·.spec·Test·Tests 뒤)를 뺀 이름이 다른 묶음의 시험이 아닌 파일 이름(확장자 앞)과 같으면 그 묶음으로 옮긴다. 대상이 여럿이거나 없으면 제자리에 둔다.
    violation: 해당 없음
    source: FR3.2
  - id: BR5.6
    statement: 큰 후보는 묶음마다 고르게 담고 한 파일은 6,000 B까지 담는다.
    category: calculation
    applies_to: 큰 후보의 재료
    trigger: 재료를 고를 때
    logic: 재료 상한을 묶음 수로 똑같이 나눠 각 묶음의 몫으로 한다. 묶음 순서는 바뀐 줄이 많은 묶음부터, 같으면 묶음 이름순이다. 각 묶음은 BR5.2 순서로 몫까지 담는다(첫 채우기). 그다음 남은 양을 같은 묶음 순서와 BR5.2 순서로 다시 채운다(두 번째 채우기). 몫이 머리글 한 벌보다 작으면 첫 채우기는 아무것도 담지 않고 두 번째 채우기가 받는다. 큰 후보에서는 어느 단계에서든 한 파일이 차지하는 양이 6,000 B를 넘지 않는다. 양은 전체 재료 상한을 재는 방식과 같게 잰다(직렬화한 UTF-8 바이트, 그 파일의 줄 조각과 파일 머리글 포함). 작은 후보에는 이 상한이 없다. 전체 재료 상한(24,000 B, 지시문이 길면 그보다 작음)은 그대로다.
    violation: 큰 후보에서 한 파일이 6,000 B를 넘거나 전체가 상한을 넘으면 결함이다.
    source: FR3.3
  - id: BR5.7
    statement: 재료 고르기는 결정적이다.
    category: constraint
    applies_to: 재료
    trigger: 항상
    logic: 같은 수집 결과면 같은 재료가 같은 순서로 나온다. 순서가 같은 것끼리는 경로 사전순으로 정한다.
    violation: 해당 없음
    source: NFR4

  # BR6 화면
  - id: BR6.1
    statement: 구직자·받은 사람 목록 카드의 제목은 2줄까지 보이고 넘치면 말줄임이다. 상세는 전체다.
    category: policy
    applies_to: 구직자 Catch 목록 카드, 받은 사람 목록 카드
    trigger: 화면을 그릴 때
    logic: 줄임은 보이는 모양에만 쓴다. 제목 글은 그대로 두어 버튼·링크의 접근 이름에 전체 제목이 들어간다. 발행 화면과 공유 링크 화면은 바꾸지 않는다.
    violation: 해당 없음
    source: FR8.1
  - id: BR6.2
    statement: 받은 사람 화면의 자동 생성 안내는 있는 것만 가리키는 새 문장이다.
    category: policy
    applies_to: 받은 사람 목록·상세
    trigger: 화면을 그릴 때
    logic: 제목과 설명이 모두 있거나 목록이면 「제목은 GitHub 기록의 글이거나 CatchU가 만든 글이고, 설명은 CatchU가 GitHub 기록에서 자동으로 만들었습니다」. 제목만 있으면 「제목은 GitHub 기록의 글이거나 CatchU가 만든 글입니다」. 설명만 있으면 「설명은 CatchU가 GitHub 기록에서 자동으로 만들었습니다」. 둘 다 없으면 안내가 없다.
    violation: 해당 없음
    source: FR8.3
  - id: BR6.3
    statement: 구직자 화면의 자동 생성 안내에서 「설명」을 「설명 초안」으로 바꾼다.
    category: policy
    applies_to: 구직자 Catch 목록·상세의 안내
    trigger: 화면을 그릴 때
    logic: 「제목과 설명」은 「제목과 설명 초안」, 「설명」은 「설명 초안」이 된다. 「제목」만인 경우와 나머지 글은 그대로다. FR8.4는 상세를 말하지만, 목록과 상세가 같은 안내 컴포넌트를 쓰므로 목록 안내도 함께 바뀐다. 한 컴포넌트를 갈라 두 문장을 따로 두는 것보다 단순하고, 같은 화면 안에서 같은 말을 쓰게 된다.
    violation: 해당 없음
    source: FR8.4

  # BR7 문서
  - id: BR7.1
    statement: worker 문서는 크기 상한(36,000 B)을 넘지 않는다.
    category: constraint
    applies_to: worker/docs
    trigger: 문서를 고칠 때
    logic: 재료 순서·변경 묶음은 새 문서에 쓰고, 생성 문서의 「재료 찾기」에는 새 문서를 가리키는 줄만 둔다. 후보 판정 문서의 「나누기」 절은 지운다. 상한에 가까운 문서(관계 수집 문서 35,793 B)는 줄을 바꾸기만 하고 늘리지 않는다.
    violation: 문서 크기 검사가 실패한다.
    source: NFR7
  - id: BR7.2
    statement: 이슈 나누기 코드와 그 한계 문장은 지운다.
    category: policy
    applies_to: worker 후보 판정 코드
    trigger: CR1 구현
    logic: 나누기 함수, 나눈 조각 값과 경로 허용 목록, 나누지 않은 이유의 한계 코드·문장, 나누기 글을 지운다. 작업 동일성 열쇠는 조각이 없던 지금 값과 같아야 한다(BR1.3).
    violation: 해당 없음
    source: FR2.1
```

## 규칙 요약

| ID | 한 줄 | 출처 |
|---|---|---|
| BR1.1~1.3 | PR·병합을 이슈 번호로 나누지 않고, 나누기 글을 없앤다. 나뉘던 단위만 열쇠가 바뀐다 | FR2.1 |
| BR2.1~2.7 | 기록의 글: 본인 PR이고 다른 계정 커밋이 없다고 확인되면 PR 제목, 아니면 단위 안 가장 이른 본인 커밋 첫 줄. 가리기에 걸리면 없음. 부실 목록. 한 번 계산해 후보 자료 한 칸에 싣는다 | FR5.1, FR5.2, FR6.2 |
| BR3.1~3.3 | 제목: 쓸 만한 기록의 글 → 조각 제목 → 없음. 기록의 글은 자르지 않고 고쳐 쓰기를 부르지 않는다 | FR5.2, FR5.7, FR5.1 |
| BR4.1~4.6 | 작업 사실: 첫 줄은 종류만, 둘째 줄(두 번째 항목)은 쓸 만한 기록의 글. 다른 계정 문장만 지운다. 합칠 때 첫 후보 것을 남긴다 | FR6.1~6.3 |
| BR5.1~5.7 | 재료: 종류 판정 보완, 코드부터 담기, 큰 후보는 폴더 묶음·고르게·한 파일 6,000 B(머리글 포함) | FR3.1~3.3, NFR4 |
| BR6.1~6.3 | 화면: 목록 카드 2줄, 받은 사람 안내 새 문장, 구직자 안내 「설명 초안」(목록·상세) | FR8.1, FR8.3, FR8.4 |
| BR7.1~7.2 | worker 문서 크기 상한을 지키고, 나누기 코드·한계 문장을 지운다 | NFR7, FR2.1 |
