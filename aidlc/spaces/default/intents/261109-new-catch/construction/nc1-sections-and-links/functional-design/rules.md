# NC1 칸 제목과 링크 이름 — 업무 규칙

입력:
- 요구사항 `inception/requirements-analysis/requirements.md` FR1~FR8, NFR5·NFR6, 가정 A6
- 이야기 `inception/user-stories/stories.md` US1.1~US5.4
- 구성 요소 `inception/domain-design/components.md`, 설계 결정 ADR-001
- 계약 `inception/contract-design/contract-summary.md` C1·C7
- 다듬은 화면 `inception/refined-mockups/mockups.md`·`interaction-spec.md`
- 이 단계의 답 `functional-design-questions.md` Q1~Q5

NC1은 화면(ui) Unit이지만 api 본인 목록 조건(C1)도 바꾸므로 규칙을 이 문서에 따로 둔다. 새로 저장하는 칸이 없어 엔티티 문서는 두지 않는다. 아래 YAML이 규칙의 정본이고, `functional-spec.md`는 흐름과 화면 상태를 맡는다.

```yaml
rules:
  # BR1 작성자 설명 칸 나누기·합치기 (AuthorDescriptionSections)
  - id: BR1.1
    statement: 칸 제목 줄은 8개 칸 제목 가운데 하나를 겹낫표로 감싼 글과 줄 하나 전체가 글자까지 같은 줄뿐이다.
    category: validation
    applies_to: AuthorDescriptionSections
    trigger: 저장된 글을 나눌 때, 칸을 합칠 때
    logic: 칸 제목은 위에서부터 「이 작업에서 정한 것」·「맡은 부분」·「무엇이 문제였나」·「고른 것과 버린 것」·「어떻게 확인했나·결과」·「AI가 낸 것 가운데 받아들이지 않았거나 고친 것」·「짚어 볼 곳」·「더 쓰기」다. IF 줄 하나 전체가 `【` + 칸 제목 + `】`와 같다(앞뒤 공백 없음) THEN 칸 제목 줄이다. 【참고】처럼 다른 문구의 겹낫표 줄은 일반 글이다.
    violation: 해당 없음(칸 제목 줄이 아니면 일반 글로 읽는다)
    source: FR1.1, FR1.6
  - id: BR1.2
    statement: 저장된 글을 줄 단위로 읽어 8칸으로 나눈다.
    category: calculation
    applies_to: AuthorDescriptionSections
    trigger: 편집 화면이 글을 채울 때, 발행본을 그릴 때
    logic: 칸 제목 줄 뒤 줄들이 그 칸의 글이다. 다음 칸 제목 줄 바로 앞의 빈 줄 하나는 칸 사이 구분이라 글에 넣지 않는다. 첫 칸 제목 줄 앞의 글이나 칸 제목 줄이 하나도 없는 글(옛 자유 글)은 「더 쓰기」 칸의 글이고, 칸 제목 줄로 시작한 「더 쓰기」 글보다 앞에 둔다. 같은 칸 제목 줄이 두 번 나오면 뒤 칸의 글을 앞 칸 글 뒤에 빈 줄 하나를 두고 잇는다. 이렇게 조각을 이어 붙인 칸(같은 칸 제목 줄이 두 번 나온 칸, 첫 칸 제목 줄 앞의 글과 칸 제목 줄로 시작한 「더 쓰기」 글을 함께 받은 「더 쓰기」)은 이은 칸이다. 이은 칸은 저장된 글 안에서 한 덩어리가 아니다.
    violation: 지원자가 칸 안에 칸 제목 줄과 같은 줄을 쓰면 다시 열 때 그 줄부터 그 칸으로 읽힌다. 저장은 막지 않는다(한계). 이은 칸은 이럴 때만 생긴다. 이은 칸에서는 AI 답의 근거를 강조하지 않는다(BR7.5).
    source: FR1.5, FR1.6
  - id: BR1.3
    statement: 나누기는 칸마다 저장된 글 안에서 그 칸 글이 시작하는 위치를 UTF-16 코드 단위로 함께 돌려준다.
    category: calculation
    applies_to: AuthorDescriptionSections
    trigger: 나눌 때
    logic: 위치 단위는 C-11 강조 위치(charStart·charEnd)와 같은 UTF-16 코드 단위다. 이 위치로 강조 범위를 칸 안 범위로 바꾼다(BR7.5). 칸마다 이은 칸인지(BR1.2) 표시 하나를 함께 돌려준다. 이은 칸의 시작 위치는 강조에 쓰지 않는다.
    violation: 해당 없음
    source: FR3.5
  - id: BR1.4
    statement: 8칸을 저장할 글 하나로 합친다. 빈 칸은 칸 제목째 넣지 않는다.
    category: calculation
    applies_to: AuthorDescriptionSections
    trigger: 저장할 때, 합계 글자 수와 링크 목록을 다시 계산할 때
    logic: 앞뒤 공백을 지우면 0자인 칸은 빈 칸이다. IF 「더 쓰기」만 비어 있지 않다 THEN 그 글을 칸 제목 없이 그대로 쓴다. ELSE 비어 있지 않은 칸을 칸 제목 순서대로 칸 제목 줄과 그 칸 글로 잇고 칸 사이에 빈 줄 하나를 둔다. 칸 글은 친 그대로 두고 앞뒤 공백을 바꾸지 않는다. IF 8칸이 모두 비었다 THEN 빈 글이고, 저장하면 지금처럼 api가 설명을 지운다.
    violation: 해당 없음
    source: FR1.2, FR1.4, FR1.5
  - id: BR1.5
    statement: 합계 글자 수는 합친 글을 코드 포인트로 센 값이고 4,000자가 상한이다.
    category: validation
    applies_to: AuthorDescriptionSections, AssetsScreen
    trigger: 칸을 고칠 때, [설명 저장]을 누를 때
    logic: 8칸 아래 합계 줄 하나에 「N / 4,000자 (칸 제목 포함)」을 보인다. 세는 법은 api `author-description-input.ts`와 같은 코드 포인트다. IF 4,000자를 넘는다 THEN 저장 요청을 보내지 않는다.
    violation: 지금 상한 안내를 보이고 쓴 글은 화면에 그대로 둔다.
    source: FR1.3
  - id: BR1.6
    statement: 합친 글을 다시 나누면 같은 8칸이 나오고, 칸 제목 줄이 없는 옛 글은 나눈 뒤 그대로 합치면 원래 글과 같다.
    category: constraint
    applies_to: AuthorDescriptionSections
    trigger: 다시 열기, 옛 글 저장
    logic: 칸 안 줄바꿈은 그대로 돌아온다. 옛 글은 「더 쓰기」 칸 하나로 들어가 BR1.4의 「더 쓰기」만 있는 갈래로 합쳐지므로 글자 수가 늘지 않는다. 편집 화면의 「저장하지 않은 변경이 있습니다」는 합친 글과 저장된 글을 견주지 않고, 지금 칸 글이 처음 나눈 칸 글과 다른지(지원자가 고쳤는지)로 정한다.
    violation: 왕복에서 글이 달라지면 결함이다(시험이 잡는다). 다만 이은 칸이 있는 글(BR1.2)은 저장하면 칸 순서로 옮겨져 원래 글과 달라진다. 이것은 FR1.6 한계이고, 옮겨진 모습은 편집 화면에 그대로 보인다.
    source: FR1.4, FR1.5

  # BR2 GitHub 링크 이름 (GithubLinkName)
  - id: BR2.1
    statement: 링크는 지금 판별 규칙으로 찾고, 판별 규칙과 텍스트 자료 본문의 링크 표시는 바꾸지 않는다.
    category: policy
    applies_to: GithubLinkName
    trigger: 작성자 설명 글을 그릴 때
    logic: `splitGithubLinks`·`isGithubSourceUrl`(https, github.com, 계정 정보 없음, 끝 문장부호 제외)을 그대로 쓴다. 이름 표시는 작성자 설명에만 쓰고, 텍스트 자료 본문은 지금처럼 주소 전체로 보인다.
    violation: 해당 없음
    source: FR3.1
  - id: BR2.2
    statement: 링크 이름은 주소의 종류에 따라 정한다.
    category: calculation
    applies_to: GithubLinkName
    trigger: 링크를 그릴 때
    logic: 경로를 `소유자/저장소/종류/…`로 읽고, 아래 꼴과 정확히 맞는 주소만 이름으로 바꾼다(질의는 BR2.5대로 무시한다). 파일 줄 링크(`/blob/<판본>/<경로>`에 조각 `#L<시작>-L<끝>` 또는 `#L<줄>`)는 「경로 끝 이름 · L시작–끝(한 줄이면 L줄) · 판본」, 조각 없는 `/blob/<판본>/<경로>`·`/tree/<판본>/<경로>`는 「경로 끝 이름 · 판본」, 뒤에 아무것도 없는 `/commit/<식별값>`은 「커밋 식별값」, 뒤에 아무것도 없는 `/pull/<번호>`는 「PR #번호」다. 그 밖(`#L10C2`·`#readme` 같은 다른 조각, `/pull/12/files`·`/commit/<값>/…` 같은 뒤 경로, 경로 없는 `/tree/main`, 그 밖의 GitHub 주소)은 지금처럼 주소 전체다.
    violation: 브랜치 이름에 `/`가 든 주소(`/blob/feature/x/…`)는 주소만으로 브랜치와 경로를 가를 수 없어, 첫 마디만 브랜치 이름으로 보일 수 있다. 링크 대상은 맞으므로 한계로 둔다.
    source: FR3.1
  - id: BR2.3
    statement: 판본 자리는 16진수 7~40자면 앞 7자를 소문자로, 그 밖은 브랜치 이름으로 보인다.
    category: calculation
    applies_to: GithubLinkName
    trigger: 판본 자리를 그릴 때
    logic: IF 판본이 16진수 7~40자 THEN 「판본 xxxxxxx」(커밋 링크는 「커밋 xxxxxxx」) ELSE 「브랜치 <이름>」.
    violation: 해당 없음
    source: FR3.2
  - id: BR2.4
    statement: 링크의 저장소가 이 Catch 근거의 저장소와 다르면 이름 앞에 저장소를 붙인다.
    category: calculation
    applies_to: GithubLinkName
    trigger: 링크를 그릴 때
    logic: IF 링크의 `소유자/저장소`가 근거 저장소와 대소문자 무시로 다르다 THEN 이름 앞에 「소유자/저장소 · 」를 붙인다. 근거 저장소는 그 Catch 근거 가운데 GitHub 주소인 첫 근거 주소의 `소유자/저장소`다. 그런 근거가 없어 근거 저장소를 알 수 없으면 붙이지 않는다.
    violation: 해당 없음
    source: FR3.3
  - id: BR2.5
    statement: 질의는 이름에서 무시하고, 경로는 이름에만 풀어 쓰며, 이름에서 제어·서식 문자를 지운다. 링크 대상은 원래 주소다.
    category: validation
    applies_to: GithubLinkName
    trigger: 이름을 만들 때
    logic: 질의(`?…`)는 이름을 정할 때 무시하고 링크 대상에서는 지우지 않는다. 경로는 마디마다 퍼센트 디코딩해 이름에만 쓰고, 풀리지 않는 마디는 원문 그대로 보인다. 이름에서 제어 문자와 보이지 않는 서식 문자(줄바꿈·탭·영폭·방향 바꿈 문자 등)를 지운다.
    violation: 풀리지 않는 마디는 원문으로 보이고 화면은 깨지지 않는다.
    source: FR3.4, FR3.6, NFR5
  - id: BR2.6
    statement: 근거 강조 위치는 원래 주소 길이로 센다.
    category: constraint
    applies_to: GithubLinkName, SnapshotView
    trigger: 강조를 그릴 때
    logic: 위치는 원래 주소의 UTF-16 길이로 센다. 이름이 짧아져도 뒤 글자의 위치는 바뀌지 않는다. 강조가 링크와 겹치면 지금처럼 링크 전체를 감싼다.
    violation: 해당 없음
    source: FR3.5
  - id: BR2.7
    statement: 이름 글자가 링크의 접근 이름이고, 마우스를 올리면 주소 전체가 보이며, 새 탭에서 열린다.
    category: policy
    applies_to: GithubLinkName
    trigger: 링크를 그릴 때
    logic: 이름 뒤에 지금처럼 화면 낭독기용 숨은 「(새 탭)」이 붙는다. `title`에 주소 전체를 둔다. `target="_blank"`, `rel="noopener noreferrer"`다. 긴 이름은 자르지 않고 `overflow-wrap: anywhere`로 줄을 바꾼다.
    violation: 키보드·터치로는 이름만으로 주소 전체를 볼 수 없고 링크를 열면 확인된다(한계).
    source: FR3.4, FR3.6, NFR6
  - id: BR2.8
    statement: 링크 이름은 화면에서만 계산한다.
    category: policy
    applies_to: GithubLinkName
    trigger: 항상
    logic: API 응답과 저장된 글은 바꾸지 않는다.
    violation: 해당 없음
    source: FR3.5

  # BR3 발행하면 면접관에게 열릴 링크 목록 (AssetsScreen)
  - id: BR3.1
    statement: 8칸 지금 글에서 칸 순서대로 링크를 모으고, 같은 주소는 한 번만 둔다.
    category: calculation
    applies_to: AssetsScreen
    trigger: 칸을 고칠 때마다
    logic: 저장 전 글도 포함해 BR2.1로 링크를 찾는다. 주소 글자가 같은 링크는 처음 것 하나만 둔다. 이름은 BR2와 같고(근거 저장소는 이 Catch 근거의 저장소) 표지는 붙이지 않는다.
    violation: 해당 없음
    source: FR5.1, FR5.4
  - id: BR3.2
    statement: 목록은 8칸 아래 합계 줄 위에 h4 「발행하면 면접관에게 열릴 링크」로 두고, 있을 때와 없을 때 안내가 다르다.
    category: policy
    applies_to: AssetsScreen
    trigger: 목록을 그릴 때
    logic: IF 링크가 있다 THEN 목록 아래에 「이미 보낸 발행본에는 반영되지 않습니다. 고쳤다면 새로 발행하세요」를 붙인다. ELSE 목록 대신 「발행하면 면접관에게 열릴 링크가 없습니다.」를 보이고 아래 안내는 그리지 않는다.
    violation: 해당 없음
    source: FR5.2
  - id: BR3.3
    statement: 목록은 화면 안에서만 다시 계산하고 알림 영역이 아니다.
    category: constraint
    applies_to: AssetsScreen
    trigger: 칸을 고칠 때
    logic: API를 부르지 않는다. `aria-live`를 두지 않아 글자를 칠 때마다 읽히지 않는다.
    violation: 해당 없음
    source: FR5.3, NFR6

  # BR4 지원자 상세의 순서와 안내 (AssetsScreen)
  - id: BR4.1
    statement: 지원자 상세의 칸 순서를 바꾼다.
    category: policy
    applies_to: AssetsScreen
    trigger: 상세를 그릴 때
    logic: 위에서부터 작업에서 확인된 사실·나의 기여 → 근거 → 다시 볼 곳 자리 → Catch 설명 초안 → 생각해 볼 질문 → 작성자 설명(편집) → 현재 확인 상태다. 다시 볼 곳 자리는 NC3이 채우고 이 Unit에서는 그리지 않는다.
    violation: 해당 없음
    source: FR6.1
  - id: BR4.2
    statement: 질문 아래 문구를 「질문을 보고 아래 칸에 자기 말로 적어 보세요.」로 바꾸고, 질문별 답 칸은 두지 않는다.
    category: policy
    applies_to: AssetsScreen
    trigger: 질문을 그릴 때
    logic: 「질문에 대한 답변을 저장하는 기능은 제공하지 않습니다.」를 지운다.
    violation: 해당 없음
    source: FR6.2
  - id: BR4.3
    statement: 편집 영역 안내의 첫 문장을 바꾸고 공개 범위 안내를 더한다.
    category: policy
    applies_to: AssetsScreen
    trigger: 편집 영역을 그릴 때
    logic: 첫 문장은 「쓰고 싶은 칸만 한두 문장씩 쓰면 됩니다. 빈 칸은 면접관에게 보이지 않습니다.」다. 「경험의 맥락·판단·배운 점을 자유롭게 적어 주세요.」는 없앤다. 뒤의 두 안내(「AI가 만든 「Catch 설명 초안」은 이 설명을 바꾸지 않습니다」, 「비워 두고 저장하면 설명이 지워집니다」)는 그대로 둔다. 그 아래에 「이 글은 링크를 가진 누구나 보고 외부 AI로도 보냅니다. 다른 사람의 이름·평가와 비밀값은 쓰지 마세요.」를 더한다.
    violation: 해당 없음
    source: FR1.7
  - id: BR4.4
    statement: 「짚어 볼 곳」 칸 아래에 다섯 가지 안내를 보이고, 관련 커밋을 넣는 단추나 목록은 두지 않는다.
    category: policy
    applies_to: AssetsScreen
    trigger: 편집 영역을 그릴 때
    logic: 다섯 가지는 「면접관이 설명을 청할 만한 줄(정한 것·고친 것이 드러나는 곳)을 고르세요.」, 「GitHub에서 줄을 고른 뒤 Copy permalink로 복사하면 판본이 고정된 주소가 됩니다.」, 「한 줄에 링크 하나와 메모 한 줄을 쓰세요.」, 「파일 이름에 한글이 있으면 Copy permalink로 복사한 주소를 고치지 말고 그대로 붙이세요. 아래 「발행하면 면접관에게 열릴 링크」에 파일 이름이 끝까지 보이면 제대로 들어간 것입니다.」, 「관련 커밋은 위 근거의 본인 커밋 주소를 붙이세요.」다. 근거 밖 커밋 주소도 저장한다.
    violation: 해당 없음
    source: FR4.1, FR4.2
  - id: BR4.5
    statement: 편집 칸은 보이는 칸 제목 `label` 8개와 3줄로 시작하는 글칸 8개이고, 설명 연결을 다시 잇는다.
    category: policy
    applies_to: AssetsScreen
    trigger: 편집 영역을 그릴 때
    logic: 칸 제목이 각 글칸의 보이는 `label`이고 모두 펼쳐져 있다. 글칸은 3줄로 시작하고 높이를 늘릴 수 있다. 지금의 숨은 이름표 「작성자 설명」과 6줄 글칸은 없어진다. 새 안내 한 줄은 첫 글칸이, 짚어 볼 곳 안내는 그 글칸이, 합계 글자 줄은 [설명 저장]이 `aria-describedby`로 가리킨다. 저장 중에는 8칸 모두 쓸 수 없다.
    violation: 해당 없음
    source: FR1.1, NFR6

  # BR5 본인 목록 「작성자 설명」 걸러 보기 (Catches + AssetsScreen)
  - id: BR5.1
    statement: 본인 목록 요청에 `authorDescription=written|unwritten` 조건을 더한다.
    category: validation
    applies_to: Catches(api 본인 목록)
    trigger: `GET /v1/catches` 요청
    logic: 조건이 없으면 전체다. `written`은 작성자 설명이 null이 아님, `unwritten`은 null이다(빈 설명은 저장 때 null이 된다). 다른 조건과 함께 쓴다.
    violation: 그 밖의 값은 400이다.
    source: FR7.2
  - id: BR5.2
    statement: 커서 판본은 2이고 범위에 작성자 설명 조건이 든다.
    category: validation
    applies_to: Catches(api 본인 목록), AssetsScreen, PublishScreen
    trigger: 「더 보기」 요청
    logic: 커서는 `v: 2`이고 범위 값은 회원·`repositoryId`·`sourceRequestId`·`authorDescription`을 묶은 sha256이다. 정렬은 지금처럼 `catch_id` 오름차순이다.
    violation: 다른 조건으로 만든 커서나 `v: 1` 커서는 400이다. web은 지금 「더 보기」 실패 안내(「다음 목록을 불러오지 못했습니다.」와 다시 불러오기)를 보이고, 걸러 보기를 바꾸거나 화면을 다시 열면 첫 쪽부터 다시 부른다.
    source: FR7.2
  - id: BR5.3
    statement: 본인 목록·상세 응답의 Catch마다 `hasAuthorDescription`을 싣는다.
    category: calculation
    applies_to: Catches(api 본인 목록·상세)
    trigger: 응답을 만들 때
    logic: 작성자 설명이 null이 아니면 참이다. BR5.1의 `written` 판정과 같은 값이다. 공개 Catch 응답과 공개 목록은 바꾸지 않는다.
    violation: 해당 없음
    source: FR8.6
  - id: BR5.4
    statement: 내 Catch 목록 선택 칸에 「작성자 설명: 전체/씀/안 씀」을 둔다.
    category: policy
    applies_to: AssetsScreen
    trigger: 목록을 그릴 때, 값을 바꿀 때
    logic: 저장소·공개 상태 다음에 보이는 `label`과 함께 둔다. 값을 바꾸면 첫 쪽부터 다시 불러온다. 개수 줄은 지금처럼 `aria-live="polite"`다. 카드에는 설명 여부를 보이지 않고 추천·순위도 없다.
    violation: 해당 없음
    source: FR7.1, FR7.3, FR7.4
  - id: BR5.5
    statement: 작성자 설명 조건으로 걸러 본 결과가 비면 그 조건의 안내를 보인다.
    category: policy
    applies_to: AssetsScreen
    trigger: 서버가 빈 목록을 줄 때
    logic: IF 칸이 「씀」 또는 「안 씀」이고 서버가 빈 목록을 준다 THEN 지금의 「아직 표시할 Catch가 없습니다」 분기보다 먼저 이 안내를 보인다. 제목은 「씀」이면 「작성자 설명을 쓴 Catch가 없습니다」, 「안 씀」이면 「작성자 설명을 쓰지 않은 Catch가 없습니다」이고 저장소를 골랐으면 앞에 「이 저장소에 」를 붙인다. 본문은 「작성자 설명을 전체로 바꾸면 다른 Catch를 볼 수 있습니다」이고 저장소 연결 문구는 붙이지 않는다. 공개 상태 칸이 불러온 목록 안에서 모두 거른 경우와 걸러 보기가 모두 전체인데 Catch가 없는 경우는 지금 분기 그대로다.
    violation: 해당 없음
    source: FR7.3
  - id: BR5.6
    statement: 걸러 본 목록에서 작성자 설명을 저장하거나 지워도 지금 쪽은 바꾸지 않는다.
    category: policy
    applies_to: AssetsScreen
    trigger: 설명 저장 뒤
    logic: 걸러 보기를 다시 고르거나 화면을 다시 열면 조건대로 바뀐다.
    violation: 해당 없음
    source: FR7.4

  # BR6 발행 화면 (PublishScreen)
  - id: BR6.1
    statement: 「발행할 자료 고르기」 안내 아래에 「저장소마다 3~5개를 권합니다.」를 더한다.
    category: policy
    applies_to: PublishScreen
    trigger: 발행 화면을 그릴 때
    logic: 저장소별로 세거나 경고하지 않고 추천·순위도 내지 않는다(확인 단계 포함).
    violation: 해당 없음
    source: FR8.1
  - id: BR6.2
    statement: 발행 화면도 저장소 목록을 함께 불러와 Catch의 `repositoryId`로 저장소 이름을 찾는다.
    category: calculation
    applies_to: PublishScreen
    trigger: 발행 화면을 열 때
    logic: 내 자산 화면과 같은 저장소 목록(`RepositoryOption`)을 쓴다. API·계약은 바꾸지 않는다.
    violation: 저장소 목록을 못 불러오거나 이름을 못 찾으면 작은 줄에서 저장소 이름만 뺀다.
    source: FR8.2
  - id: BR6.3
    statement: 항목 단추 안 작은 줄은 저장소 이름 · 공개 상태 · 설명 안 씀 · 불일치 표시됨 순서다.
    category: policy
    applies_to: PublishScreen
    trigger: 항목을 그릴 때
    logic: 「설명 안 씀」은 `hasAuthorDescription`이 거짓일 때만, 「불일치 표시됨」은 있을 때만 붙는다. 비공개 안내 줄(「발행하면 이 Catch는 공개로 바뀝니다」)은 지금처럼 비공개 항목에만 따로 붙는다.
    violation: 해당 없음
    source: FR8.2, FR8.6
  - id: BR6.4
    statement: 「작성자 설명을 쓴 Catch만 보기」 체크 칸을 두고, 켜거나 끄면 첫 쪽부터 다시 불러온다.
    category: policy
    applies_to: PublishScreen
    trigger: 체크 칸을 바꿀 때
    logic: 「내 Catch」 아래 항목들 앞에 둔다. 처음에는 꺼져 있다. 켜면 BR5.1의 `written` 조건으로 부른다. 걸러 본 개수 줄 「불러온 N개의 Catch」를 `aria-live="polite"`로 둔다. 발행 중에는 누를 수 없고, 목록 불러오기가 실패해도 쓸 수 있다. 켰는데 맞는 Catch가 없으면 「내 Catch」 목록 자리에 「작성자 설명을 쓴 Catch가 없습니다」를 보인다.
    violation: 해당 없음
    source: FR8.3, NFR6
  - id: BR6.5
    statement: 고른 자료는 고르기 목록과 따로 있어 걸러 보기가 바꾸지 않는다.
    category: constraint
    applies_to: PublishScreen
    trigger: 걸러 보기를 바꿀 때, 고를 때
    logic: 걸러 보기로 목록에서 사라진 항목도 고른 항목과 순서에 남고 최대 개수에 센다. 고를 때 `hasAuthorDescription`을 고른 자료에 옮겨 담는다.
    violation: 해당 없음
    source: FR8.4
  - id: BR6.6
    statement: 확인 단계에서 고른 자료 가운데 작성자 설명이 없는 Catch 수를 알린다.
    category: policy
    applies_to: PublishScreen
    trigger: 확인 단계를 그릴 때
    logic: IF 설명 없는 Catch 수 N이 1 이상 THEN 비공개 안내와 같은 꼴로 「작성자 설명이 없는 Catch가 N개 있습니다. 면접관에게는 「작성자 설명이 없습니다.」로 보입니다」를 보인다. N이 0이면 그리지 않는다. [발행]은 막지 않는다.
    violation: 해당 없음
    source: FR8.5
  - id: BR6.7
    statement: 발행 화면은 열 때마다 목록을 새로 불러온다.
    category: constraint
    applies_to: PublishScreen
    trigger: 발행 화면을 열 때
    logic: 「설명 안 씀」은 그때까지 저장된 결과대로 보인다.
    violation: 해당 없음
    source: FR8.7

  # BR7 발행본 칸 제목별 보기 (SnapshotView)
  - id: BR7.1
    statement: 사본의 작성자 설명을 나눠 글이 있는 칸만 h5 칸 제목과 함께 그린다.
    category: policy
    applies_to: SnapshotView
    trigger: 발행본을 그릴 때
    logic: BR1.2로 나눈다. 칸 순서는 칸 제목 순서다. 칸 글 속 링크는 BR2로 그린다. 빈 칸은 h5째 그리지 않고 숨긴 요소로도 남기지 않는다.
    violation: 해당 없음
    source: FR2.1, NFR6
  - id: BR7.2
    statement: 「더 쓰기」만 있으면 h5 없이 글만 그리고, 다른 칸과 함께 있으면 h5를 「덧붙인 말」로 보인다.
    category: policy
    applies_to: SnapshotView
    trigger: 발행본을 그릴 때
    logic: 칸 제목 줄이 없는 옛 글도 「더 쓰기」만 있는 글이라 지금처럼 글만 보인다. 저장된 칸 제목은 「더 쓰기」 그대로다.
    violation: 해당 없음
    source: FR2.2
  - id: BR7.3
    statement: 작성자 설명이 null이거나 빈 글이면 지금처럼 「작성자 설명이 없습니다.」다.
    category: policy
    applies_to: SnapshotView
    trigger: 발행본을 그릴 때
    logic: 해당 없음
    violation: 해당 없음
    source: FR2.3
  - id: BR7.4
    statement: 발행본 칸 순서는 #488 그대로이고 작성자 발행본 상세도 같은 표시를 쓴다.
    category: policy
    applies_to: SnapshotView
    trigger: 발행본을 그릴 때
    logic: 불일치 표지 → AI 설명 초안 → 작성자 설명 → 기록에서 확인한 내용 순서다. 「이 작업에서 정한 것」을 제목 아래로 올리지 않는다. 받은 사람 화면과 작성자 발행본 상세가 같은 사본 보기를 쓴다.
    violation: 해당 없음
    source: FR2.1, FR2.4
  - id: BR7.5
    statement: 강조 범위를 칸마다 칸 안 범위로 바꾸고, 칸 글과 겹치는 부분만 강조한다.
    category: calculation
    applies_to: SnapshotView
    trigger: AI 답의 근거 단추를 누를 때
    logic: 강조 범위는 저장된 글 전체의 UTF-16 위치로 온다. 칸마다 시작 위치(BR1.3)를 빼서 칸 안 범위로 바꾼다. 칸 제목 줄과 칸 사이 빈 줄에 걸친 부분은 강조하지 않는다. IF 범위가 그런 줄에만 걸친다 THEN 아무것도 강조하지 않는다. 칸 안에서 링크와 겹치면 BR2.6대로 링크 전체를 감싼다. IF 이은 칸(BR1.2)이다 THEN 그 칸은 강조하지 않는다.
    violation: 이은 칸에 든 근거는 강조되지 않는다(FR1.6 한계).
    source: FR3.5
  - id: BR7.6
    statement: h5 칸 제목은 h4보다 한 단계 작고 굵으며 새 색은 없다.
    category: policy
    applies_to: SnapshotView
    trigger: 발행본을 그릴 때
    logic: 다듬은 화면 Q3 A 그대로다.
    violation: 해당 없음
    source: FR2.1
```

## 규칙 요약

BR1.3(칸 시작 위치)과 BR7.6(h5 모양)은 수락 기준이 직접 가리키지 않는다. BR1.3은 BR7.5가 쓰는 기술 규칙이고, BR7.6은 다듬은 화면 Q3 A의 시각 규칙이다.

| 묶음 | 규칙 | 구성 요소 | 요구사항 |
|---|---|---|---|
| BR1 | 칸 제목 줄, 나누기, 칸 시작 위치, 합치기, 합계 글자 수, 왕복 | AuthorDescriptionSections | FR1.1~FR1.6, FR3.5 |
| BR2 | 링크 찾기, 이름 모양, 판본, 다른 저장소, 질의·인코딩·제어 문자, 위치 세기, 링크 요소, 화면에서만 | GithubLinkName | FR3, NFR5, NFR6 |
| BR3 | 발행하면 열릴 링크 목록: 모으기, 자리와 안내, 화면 안에서만 | AssetsScreen | FR5 |
| BR4 | 상세 순서, 질문 아래 문구, 편집 안내, 짚어 볼 곳 안내, 편집 칸 | AssetsScreen | FR1.1, FR1.7, FR4, FR6 |
| BR5 | 목록 조건, 커서 v2, 응답 칸, 선택 칸, 빈 결과, 저장 뒤 목록 | Catches, AssetsScreen | FR7, FR8.6 |
| BR6 | 권장 안내, 저장소 이름, 작은 줄, 걸러 보기, 고른 자료, 확인 안내, 새로 불러오기 | PublishScreen | FR8 |
| BR7 | 칸별 그리기, 더 쓰기, 없음, 순서, 강조 맞추기, h5 모양 | SnapshotView | FR2, FR3.5 |

## Sources

- `inception/requirements-analysis/requirements.md` FR1~FR8, NFR5·NFR6, 가정 A6
- `inception/user-stories/stories.md` US1.1~US5.4
- `inception/domain-design/components.md`, `inception/domain-design/decisions.md` ADR-001
- `inception/contract-design/contract-summary.md` C1·C7
- `inception/refined-mockups/mockups.md`, `inception/refined-mockups/interaction-spec.md`
- `construction/nc1-sections-and-links/functional-design/functional-design-questions.md` Q1~Q5
- 지금 코드: `web/src/lib/github-source-url.ts`, `web/src/features/publications/snapshot-view.tsx`, `web/src/features/assets/author-description-panel.tsx`, `api/src/catches/owner-catch-input.ts`, `api/src/catches/owner-catch-store.ts`, `api/src/catches/author-description-input.ts`
