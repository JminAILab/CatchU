# CR3 AI 쪽 — 업무 규칙

입력:
- 요구사항 `inception/requirements-analysis/requirements.md`(FR4·FR5.3~FR5.7·FR6.2·FR6.3·FR7·FR8.2·FR9·FR10·NFR1~NFR3·NFR5·NFR7)
- 스토리 `inception/user-stories/stories.md`(US2.2의 AC2.2.4·AC2.2.5, US2.3, US3.1, US3.3, US4.4)
- 구성 요소 `inception/domain-design/components.md`(Judgement·DraftGeneration·AnalysisProcessing), ADR-004·ADR-005
- 계약 `inception/contract-design/contract-summary.md`(C3·C4·C5·C7)
- CR1 기능 설계 `construction/cr1-readable-catch/functional-design/`(RecordText·BR2.7·W2·W3·6절 접점)
- 이 단계의 답 `functional-design-questions.md`(Q1~Q7)

아래 YAML이 규칙의 정본이다.

```yaml
rules:
  # BR1 판정 공급자와 AI 쪽 켜기
  - id: BR1.1
    statement: AI 쪽이 켜졌는지는 판정 공급자 설정과 키 둘로만 정한다.
    category: policy
    applies_to: LIVE 조립(AnalysisProcessing)
    trigger: 분석 시도마다 생성기를 만들 때
    logic: provider = CATCHU_JUDGEMENT_PROVIDER(없으면 OPENAI). IF provider가 OPENAI이고 CATCHU_JUDGEMENT_API_KEY가 있음 THEN 켜짐. IF provider가 CLAUDE THEN 기존 생성 키로 켜짐. 그 밖에는 꺼짐. 따로 끄는 스위치는 없다(Q4 A).
    violation: provider 값이 둘 중 하나가 아니면 worker가 기동하지 않는다(설정 오류).
    source: FR4.1
  - id: BR1.2
    statement: Claude 판정은 OpenAI 판정과 같은 질문 집합을 쓴다.
    category: policy
    applies_to: Judgement(Claude 어댑터)
    trigger: provider가 CLAUDE일 때
    logic: 질문 종류·문턱·적용 규칙(BR3·BR4·BR5·BR6)은 공급자와 관계없이 같다. 바뀌는 것은 요청을 받는 곳뿐이다. Claude 어댑터는 같은 질문을 구조화 출력으로 보내 질문마다 확률(0~1)·고르기 확률·점수(1~5)를 받는다. 범위 밖 값은 그 질문의 답이 없는 것으로 보고(BR2.5), 고르기 확률은 합이 1이 되게 나눠 맞춘다.
    violation: 해당 없음
    source: FR4.5
  - id: BR1.3
    statement: AI 쪽이 꺼지면 판정 호출은 0번이고, 제목·작업 사실·설명·재료는 CR1 규칙 그대로다.
    category: policy
    applies_to: DraftGeneration
    trigger: 꺼졌을 때
    logic: 제목은 CR1 W2(기록의 글 또는 조각 제목, 고쳐 쓰기 포함), 설명은 지금의 틀 문장, 재료는 CR1 W3 순서다.
    violation: 꺼졌는데 판정 호출이 나가면 결함이다.
    source: FR4.1, FR7.4
  - id: BR1.4
    statement: OpenAI 판정 키는 SSM·EKS 비밀값에만 두고 어디에도 값을 남기지 않는다.
    category: constraint
    applies_to: 설정·로그·화면·Git
    trigger: 늘
    logic: 키 이름(CATCHU_JUDGEMENT_API_KEY)만 환경변수 예시에 둔다. 기동 때 읽은 뒤 환경에서 지운다(지금 비밀 환경변수와 같다).
    violation: 저장소 검색에서 키 값이 나오면 결함이다.
    source: NFR5

  # BR2 판정 요청과 호출 수
  - id: BR2.1
    statement: AI 쪽이 켜지면 생성 뒤 Catch마다 판정 요청을 한 번 보낸다.
    category: policy
    applies_to: DraftGeneration → Judgement
    trigger: 후보의 생성 응답을 받은 뒤
    logic: 한 요청에 그 Catch의 RECORD_WHAT·RECORD_WHOLE(조건 BR3.2)·TITLE_CHOICE·SENTENCE_TRUE 질문을 모두 담는다. 질문이 붙을 대상이 없는 종류(기록의 글이 없거나 규칙으로 부실, 통과한 후보·문장이 없음)는 그 종류의 질문을 빼고 나머지만 보낸다. 질문이 하나도 없으면 요청을 보내지 않는다.
    violation: Catch 하나에 판정 요청이 둘 이상이면 결함이다.
    source: FR4.3, NFR2
  - id: BR2.2
    statement: 판정 호출은 실패해도 다시 부르지 않는다.
    category: policy
    applies_to: Judgement
    trigger: 시간 초과·호출 오류·읽을 수 없는 응답
    logic: 그 요청은 실패로 끝낸다. 같은 후보에 판정 요청을 다시 보내지 않는다. 판정 호출도 지금 생성 호출의 마감 확인(남은 시간이 호출 시간 제한 이상일 때만 새 호출)을 따른다.
    violation: 같은 후보에 판정 요청이 다시 나가면 결함이다.
    source: FR4.4, NFR2
  - id: BR2.3
    statement: 판정 입력은 바뀐 줄·경로, 기록의 글, AI가 쓴 후보·문장뿐이다.
    category: constraint
    applies_to: CatchJudgementRequest·MaterialJudgementRequest
    trigger: 요청을 만들 때
    logic: Catch 판정의 바뀐 줄·경로는 그 Catch의 생성 요청에 담긴 것과 같다(가린 줄 제외). 재료 판정의 바뀐 줄·경로는 BR6.1이 정한다. 기록의 글은 CR1 후보 자료의 RecordText 칸에서 읽고 다시 계산하지 않는다. SHA·작성자·날짜·이슈 글·다른 Catch의 자료는 넣지 않는다. 판정 입력의 글은 신뢰할 수 없는 자료로 다루고 지시문과 나눠 넣는다.
    violation: 나열한 항목 밖의 자료가 요청에 있으면 결함이다.
    source: NFR1
  - id: BR2.4
    statement: Claude 생성 요청에는 커밋 메시지·PR 제목을 보내지 않는다.
    category: constraint
    applies_to: 생성 요청
    trigger: AI 쪽이 켜져도 같다
    logic: 생성 요청 자료는 지금처럼 바뀐 줄만 담는다. 기록의 글은 판정 요청에만 들어간다.
    violation: 생성 요청 본문에 커밋 메시지·PR 제목이 있으면 결함이다.
    source: FR5.4, NFR1
  - id: BR2.5
    statement: 응답에 없는 질문이나 모양이 틀린 답은 그 질문만 떨어진 것으로 본다.
    category: validation
    applies_to: 판정 응답 읽기
    trigger: 응답을 받았을 때
    logic: 답이 없는 RECORD_WHAT·RECORD_WHOLE은 「판정 없음」으로 본다. 기록의 글은 판정 실패 때와 같이 규칙 결과만으로 다룬다(제목은 BR3.5, 둘째 줄은 BR4.1에서 남긴다). 그래서 같은 기록의 글이 제목과 작업 사실에서 서로 다르게 판단되지 않는다(CR1 BR2.7). TITLE_CHOICE는 NONE으로, SENTENCE_TRUE는 0.9 미만으로, 재료 질문은 판정 없음으로 본다. 응답 전체를 읽을 수 없으면 호출 실패(BR2.2)다.
    violation: 해당 없음
    source: FR4.3, FR4.4
  - id: BR2.6
    statement: 생성 응답이 없거나 시간이 모자라면 Catch 판정을 보내지 않는다.
    category: policy
    applies_to: DraftGeneration → Judgement
    trigger: 재료가 없음·생성 건너뜀(시간·호출 수 부족)·생성 호출 실패, 또는 판정 호출을 시작할 시간이 없음
    logic: |
      - 생성 응답이 없는 Catch(재료 없음·생성 건너뜀·생성 호출 실패)는 판정하지 않는다. 설명 초안과 질문은 지금 상태 그대로(NOT_GENERATED 또는 FAILED)이고, 제목·둘째 줄은 BR3.5·BR4.1의 「판정 없음」이다.
      - 생성은 됐지만 마감까지 남은 시간이 판정 시간 제한보다 짧거나 판정 호출 상한에 닿았으면 판정을 보내지 않는다. 판정을 거치지 않은 문장은 쓰지 않으므로 설명 초안은 NOT_GENERATED이고, 지금 생성 건너뜀과 같이 요청 실패 항목 GENERATION_BUDGET_EXHAUSTED를 1건만 더한다. 제목·둘째 줄은 「판정 없음」이다.
      - 판정 시간 제한은 Catch 판정·재료 판정 모두 20초(지금 고쳐 쓰기 호출과 같다), 호출 상한은 Catch 판정 300번·재료 판정 300번(지금 생성 호출 상한과 같다)이다. 판정 호출도 지금 마감 확인(CallBudget)을 쓴다.
    violation: 해당 없음
    source: FR4.4, NFR2

  # BR3 AI 제목
  - id: BR3.1
    statement: AI 쪽이 켜지면 Claude가 생성 응답에 제목 후보를 늘 0~3개 쓴다.
    category: policy
    applies_to: 생성 응답
    trigger: AI 쪽이 켜진 생성 호출마다
    logic: 후보마다 근거 줄을 하나 이상 가리킨다. 목적·효과·평가는 쓰지 않고, 코드 이름·파일 이름은 가리킨 줄의 표기 그대로 쓴다. 40자를 넘는 후보는 버리고 고쳐 쓰지 않는다(Q3 A). 기록의 글이 쓸 만해도 후보를 쓴다.
    violation: 근거 줄이 없는 후보는 버린다.
    source: FR5.4
  - id: BR3.2
    statement: 기록의 글을 판정으로 거른다.
    category: calculation
    applies_to: 제목 정하기
    trigger: 기록의 글이 있고 규칙으로 부실하지 않을 때
    logic: RECORD_WHAT(무엇을 했는지 알려 주나)을 묻는다. 기록의 글이 본인 커밋 첫 줄이고 후보의 본인 커밋 수(지금 후보 재료의 본인 커밋 목록 `CandidateMaterial.own_commits`의 개수)가 2개 이상이면 RECORD_WHOLE(이 Catch의 작업 전체를 나타내나)도 묻는다. RECORD_WHAT이 0.5 미만이면 판정 부실, RECORD_WHOLE이 0.5 미만이면 전체 미달이다.
    violation: 해당 없음
    source: FR5.3
  - id: BR3.3
    statement: 후보·문장은 기계 대조를 통과해야 판정에 오른다.
    category: validation
    applies_to: TitleCandidate·DraftSentence
    trigger: 생성 응답을 읽은 뒤, 판정 요청 전
    logic: 글에서 PR 번호(`PR #n`·`#n`)를 떼고 영문·숫자 덩어리를 뽑는다. 숫자로 시작하면 숫자, `/`와 영문자가 있거나 확장자가 붙으면 파일 이름, 나머지는 영어 이름이다. 영어 이름·숫자는 가리킨 줄의 글에, 파일 이름은 가리킨 줄의 경로에 낱말 단위로 있어야 한다(소문자로 맞춰 비교, 숫자는 앞자리 0을 뗌). 예외 낱말(ai, api, pr, ci, cd, llm, jd, db, id, url, ui, sdk, mvp, http, json)은 보지 않는다. 한글은 보지 않는다. PR 번호가 있으면 버린다. 재료의 다른 줄에만 있어도 버린다. 12월 api 기계 대조(`fact-check.ts`)의 낱말 뽑기를 worker에 다시 짠다.
    violation: 통과하지 못한 후보·문장은 버리고 건수만 센다. 다시 부르지 않는다.
    source: FR5.5, FR7.2
  - id: BR3.4
    statement: 제목은 아래 순서로 정한다.
    category: calculation
    applies_to: 제목 정하기(CR1 W2 뒤)
    trigger: 판정 답을 받은 뒤
    logic: |
      판정 요청이 성공하고 RECORD_WHAT 답이 있을 때의 순서다. 그 밖의 경우는 BR3.5다.
      1) 기록의 글이 규칙으로 부실하지 않고 판정 부실도 전체 미달도 아니면 기록의 글.
      2) 아니면 TITLE_CHOICE에서 0.9 이상인 후보. 고르기 답은 선택지(후보들과 NONE)의 확률 합이 1이므로 0.9 이상인 선택지는 많아야 하나다. NONE이 0.9 이상이거나 0.9 이상인 선택지가 없으면 AI 후보를 쓰지 않는다.
      3) 아니면 전체 미달만으로 떨어진 기록의 글(판정 부실이 아닌 경우).
      4) 아니면 조각 제목(지금의 대상·종류·동작). AI 쪽이 켜진 경로에서는 고쳐 쓰기를 부르지 않으므로, 조각 제목이 40자 규칙에 맞지 않으면 제목은 없다.
    violation: 해당 없음
    source: FR5.6, FR5.7
  - id: BR3.5
    statement: 기록의 글 판정이 없으면 제목은 판정 없이 정한다.
    category: policy
    applies_to: 제목 정하기
    trigger: Catch 판정 요청이 실패했거나, 보내지 않았거나(BR2.6), RECORD_WHAT 답이 없을 때(BR2.5)
    logic: 기록의 글이 규칙으로 부실하지 않으면 기록의 글. 아니면 TITLE_CHOICE 답이 있을 때만 0.9 이상 후보, 그것도 없으면 조각 제목(BR3.4의 4). 판정 요청이 실패했거나 보내지 않았으면 AI 후보는 판정을 거치지 않았으므로 쓰지 않는다.
    violation: 판정 없이 AI 후보가 제목이 되면 결함이다.
    source: FR4.4, FR5.7

  # BR4 작업 사실
  - id: BR4.1
    statement: 판정 부실이면 작업 사실 둘째 줄을 지운다.
    category: policy
    applies_to: 후보의 workFacts
    trigger: RECORD_WHAT이 0.5 미만일 때
    logic: workFacts의 두 번째 항목(CR1 BR4.2의 기록의 글 줄)을 위치로 지운다. 전체 미달(RECORD_WHOLE)은 보지 않는다. 판정이 실패하거나, 판정을 보내지 않았거나(BR2.6), RECORD_WHAT 답이 없으면(BR2.5) 지우지 않는다. 이 세 경우 제목도 같은 기록의 글을 규칙 결과로 쓴다(BR3.5).
    violation: 전체 미달만으로 둘째 줄을 지우면 결함이다.
    source: FR6.2
  - id: BR4.2
    statement: 작업 사실에는 Claude 출력이 들어가지 않는다.
    category: constraint
    applies_to: workFacts
    trigger: 늘
    logic: CR3이 작업 사실에 하는 일은 둘째 줄 지우기 하나뿐이다. 줄을 더하거나 고치지 않는다(ADR-005).
    violation: 작업 사실에 생성 응답의 글이 있으면 결함이다.
    source: FR6.3

  # BR5 설명 초안
  - id: BR5.1
    statement: AI 쪽이 켜지면 Claude가 바뀐 줄만 보고 설명 문장 1~3개를 쓴다.
    category: policy
    applies_to: 생성 응답
    trigger: AI 쪽이 켜진 생성 호출마다
    logic: 문장마다 근거 줄을 하나 이상 가리킨다. 목적·효과·평가는 쓰지 않는다. 생각해 볼 질문은 지금의 틀 그대로다.
    violation: 근거 줄이 없는 문장은 버린다. 응답에 문장 칸이 없거나 칸의 모양이 틀리면 응답을 읽을 수 없는 것으로 보아 지금처럼 생성 호출 실패(GENERATION_RESPONSE_UNREADABLE, 설명 FAILED)다. 칸은 맞지만 문장이 모두 버려지면 판정할 문장이 없으므로 NOT_GENERATED다(BR5.3).
    source: FR7.1, FR7.4
  - id: BR5.2
    statement: 기계 대조를 통과하고 판정이 0.9 이상인 문장만 남긴다.
    category: calculation
    applies_to: 설명 초안
    trigger: 판정 답을 받은 뒤
    logic: 남은 문장을 응답 순서대로 띄어 써 이은 글 하나가 설명 초안이다(상태 GENERATED).
    violation: 해당 없음
    source: FR7.2
  - id: BR5.3
    statement: 문장이 모두 떨어지면 설명 초안은 NOT_GENERATED다. 실패로 세지 않는다.
    category: policy
    applies_to: 설명 초안 상태
    trigger: 남은 문장이 0개일 때
    logic: 상태 NOT_GENERATED, 내용 없음, 실패 항목 없음.
    violation: 해당 없음
    source: FR7.3
  - id: BR5.4
    statement: 판정 호출이 오류로 끝나면 설명 초안은 FAILED다.
    category: policy
    applies_to: 설명 초안 상태
    trigger: Catch 판정 요청 실패(BR2.2)
    logic: 상태 FAILED, 실패 항목은 단계 DRAFT, 코드 JUDGEMENT_CALL_FAILED·JUDGEMENT_TIMEOUT·JUDGEMENT_RESPONSE_UNREADABLE 가운데 하나, 회원 문구는 지금 생성 실패 문구 꼴을 따른다. 생각해 볼 질문은 판정과 관계없으므로 그대로 둔다.
    violation: 해당 없음
    source: FR7.3
  - id: BR5.5
    statement: 설명 초안은 사람이 읽는 화면에만 나온다.
    category: constraint
    applies_to: 검색 조각·MCP
    trigger: 늘
    logic: 발행 사본의 검색 조각 만들기에 설명 초안을 넣지 않는 지금 동작을 그대로 둔다.
    violation: 검색 조각에 설명 초안이 있으면 결함이다(지금 시험).
    source: FR7.5

  # BR6 큰 후보의 재료 판정
  - id: BR6.1
    statement: 재료 상한을 넘는 큰 후보에만 생성 전에 재료 판정을 한 번 보낸다.
    category: policy
    applies_to: DraftGeneration(CR1 W3 앞)
    trigger: AI 쪽이 켜졌고 후보가 큰 후보(CR1 BR5.6)일 때
    logic: 입력의 출처는 CR1 W3가 재료를 고르는 것과 같은 자료(후보의 근거 커밋 안 본인 커밋의 바뀐 파일과 patch)다. 파일마다 경로·상태·바뀐 줄 수와, 바뀐 줄(+/-) 가운데 앞 5줄을 보낸다. 앞 5줄은 생성 요청과 같은 가리기 검사(`app.redact`)를 거쳐 가린 줄을 빼고 보낸다(가린 줄은 세지 않고 다음 줄로 채우지 않는다). 문맥 줄·patch 머리글·커밋 메시지는 보내지 않는다. 씨앗 묶음 이름도 보낸다. 규칙이 OTHER로 본 파일에는 MATERIAL_KIND(작업 내용·작업 기록·다시 만들어지는 산출물), 애매한 파일(저장소 맨 위에 있거나 어느 씨앗 묶음에도 들지 않은 파일)에는 MATERIAL_GROUP(씨앗 묶음 또는 COMMON), 모든 파일에 MATERIAL_SCORE(1~5)를 묻는다.
    violation: 작은 후보에 재료 판정이 나가면 결함이다.
    source: FR4.2
  - id: BR6.2
    statement: 질문 400개에 들지 않는 파일은 판정 없이 규칙 순서로 그 뒤에 담는다.
    category: constraint
    applies_to: MaterialJudgementRequest
    trigger: 질문이 400개를 넘을 때
    logic: CR1 규칙 순서(종류 순서·묶음)로 파일을 늘어놓고, 앞쪽 파일부터 그 파일의 질문을 모두 담을 수 있을 때까지 담는다. 나머지 파일은 judged 거짓이다(Q2 A).
    violation: 해당 없음
    source: FR4.2, NFR2
  - id: BR6.3
    statement: 재료 판정 답을 재료 담기에 쓴다.
    category: calculation
    applies_to: CR1 W3
    trigger: 재료 판정 답을 받은 뒤
    logic: |
      - GENERATED로 답한 파일의 줄은 담지 않는다.
      - 묶음 안에서 WORK 갈래(규칙이 CODE·TEST·CONFIG·DOC로 본 파일 포함)를 먼저, RECORD 갈래를 그다음에 담는다.
      - 같은 갈래 안에서는 대표 점수가 높은 파일부터, 같은 점수면 CR1 종류 순서를 따른다.
      - COMMON으로 답한 파일끼리 묶음 하나를 따로 만들어, 다른 묶음과 똑같이 고르게 담는다(Q1 A).
      - judged 거짓인 파일은 판정 받은 파일 뒤에 CR1 규칙 순서로 담는다.
      - 한 파일 6,000 B와 전체 24,000 B 상한은 CR1 그대로다.
    violation: 해당 없음
    source: FR4.2
  - id: BR6.4
    statement: 재료 판정이 없거나 실패하면 CR1 규칙 순서를 그대로 쓴다.
    category: policy
    applies_to: CR1 W3
    trigger: 재료 판정 실패 또는 AI 쪽 꺼짐
    logic: 산출물을 거르지 않는다(요구사항 「한계」와 같다). 실패는 다시 부르지 않고, Catch 판정은 따로 그대로 보낸다.
    violation: 해당 없음
    source: FR4.2, FR4.4

  # BR7 화면
  - id: BR7.1
    statement: 설명 초안이 NOT_GENERATED인 Catch는 상세에서 설명 칸을 숨긴다.
    category: policy
    applies_to: 구직자 Catch 상세·받은 사람 Catch 상세
    trigger: 상세를 그릴 때
    logic: AI 쪽과 관계없이 NOT_GENERATED면 「Catch 설명 초안」 칸(제목·안내 글)을 그리지 않는다(Q5 A). FAILED면 지금 안내를 보인다. GENERATED면 지금처럼 내용을 보인다.
    violation: NOT_GENERATED인데 설명 칸이 화면이나 화면 낭독기에 있으면 결함이다.
    source: FR8.2

  # BR8 고지
  - id: BR8.1
    statement: 고지 v3와 첫 이용 고지 새 판본은 FR10을 넘었을 때만 넣는다.
    category: policy
    applies_to: AnalysisNotice·AiConsentNotice
    trigger: CR3 코드 생성의 마지막 단계
    logic: 이 단계는 계획에서 따로 둔다. FR10 기준을 넘으면 넣고, 못 넘으면 넣지 않고 v2·2026-11-v1 그대로 합친다(Q6 A). 고지 단계와 배포 안내에 「OpenAI 판정 키는 v3 고지가 배포된 뒤에만 서버에 넣는다」를 적는다.
    violation: v3 없이 판정 키가 서버에 들어가면 운영 절차 위반이다.
    source: FR9.1, FR9.2
  - id: BR8.2
    statement: 분석 고지 v3의 판본은 `catchu-real-analysis-notice-v3`이고, 2·3·4절만 바꾼다.
    category: constraint
    applies_to: AnalysisNotice
    trigger: BR8.1로 넣을 때
    logic: 2절에 AI가 쓰고 판정으로 거른다는 것(지금 「정해진 문장으로 만듭니다」를 대체), 3절에 실제 판정 공급자와 보내는 항목(바뀐 줄·경로, 본인 PR 제목·커밋 메시지 첫 줄, AI가 쓴 후보), 공급자가 Claude면 Anthropic에 기록의 글이 간다는 것, 4절에 Catch에 기록의 글이 들어간다는 것을 적는다. OpenAI 회사 이름·연락처는 공식 안내로 확인한다. 문구는 그 PR에서 팀장이 승인한다. 합성 고지는 그대로다.
    violation: 해당 없음
    source: FR9.1
  - id: BR8.3
    statement: 첫 이용 고지 받는 곳에 OpenAI를 더하고 api·web 판본 상수를 같은 새 값으로 함께 올린다.
    category: constraint
    applies_to: AiConsentNotice
    trigger: BR8.1로 넣을 때
    logic: api `AI_NOTICE_VERSION`과 web `AI_NOTICE_VERSION`을 같은 배포에서 같은 값으로 바꾼다. 받는 곳 목록에 OpenAI를 더한다.
    violation: 두 상수가 다르면 결함이다.
    source: FR9.2

  # BR9 합치기 전 확인
  - id: BR9.1
    statement: FR10 확인은 개발용 확인 명령 하나로 만든다.
    category: policy
    applies_to: worker 개발용 명령
    trigger: 팀장이 확인할 때
    logic: 입력은 수집 결과 파일이다. 공개 저장소는 같은 명령이 실제 GitHub에서 받아 파일로 남긴다. 운영과 같은 후보 판정·생성·판정을 돌리고, 결과 메시지를 보내지 않는다. 출력은 로컬 확인표로, Catch마다 기록의 글·AI 후보와 기계 대조 결과·문장·판정 값·고른 제목·남긴 문장과 빈 맞음/틀림 칸을 적는다. 기록의 글이 제목인 Catch도 TITLE_CHOICE가 고른 AI 후보를 적는다.
    violation: 운영 경로가 확인용 자료를 결과 메시지에 실으면 결함이다(C5).
    source: FR10.1
  - id: BR9.2
    statement: 확인표 원문은 Git에 넣지 않는다.
    category: constraint
    applies_to: ConfirmationSheet
    trigger: 늘
    logic: 확인표(코드 줄·기록의 글·AI 후보와 문장)는 Git에 넣지 않는 로컬 파일로만 둔다. 커밋되는 AI-DLC 확인 기록에는 건수, 맞음/틀림 결과, AI 쪽을 켤지 결정만 적는다(Q7 덧붙임).
    violation: 확인표 원문이 커밋되면 결함이다.
    source: FR10.1
  - id: BR9.3
    statement: 기준은 틀린 제목 통과 0건, 틀린 문장 통과 1건 이하다.
    category: policy
    applies_to: AI 쪽을 켤지 결정
    trigger: 확인표 표시가 끝났을 때
    logic: 맞는데 버린 것은 건수만 적고, 그 가운데 표기 차이로 기계 대조에서 버린 것은 따로 센다. 못 미치면 지시문을 한 번까지만 고쳐 다시 잰다. 한국어 판정이 못 미치면 Claude 판정으로 다시 잰다. 그래도 못 넘으면 AI 쪽을 끈 채 합친다. 판정 문턱은 0.9에서 시작한다.
    violation: 해당 없음
    source: FR10.2, NFR3

  # BR10 문서
  - id: BR10.1
    statement: 판정 설명은 새 worker 문서에 쓴다.
    category: constraint
    applies_to: worker 문서
    trigger: 코드 생성 때
    logic: 판정 공급자·질문·적용 규칙은 새 문서 `worker/docs/generation-judgement.md`에 쓴다. `generation.md`(34,666 B)에는 새 문서를 가리키는 줄만 둔다. 설정 이름은 `queue-consumer.md`의 환경변수 표에 더한다. 모든 문서는 36,000 B 상한 안이다.
    violation: 문서 크기 검사가 실패하면 결함이다.
    source: NFR7
```

## 규칙 요약

| 묶음 | 규칙 |
|---|---|
| 공급자·켜기 | BR1.1 공급자와 키로만 켜기, BR1.2 Claude도 같은 질문, BR1.3 꺼지면 CR1 그대로, BR1.4 키 보관 |
| 판정 요청 | BR2.1 Catch마다 한 번, BR2.2 다시 부르지 않음, BR2.3 판정 입력 제한, BR2.4 생성 요청에 기록의 글 없음, BR2.5 빠진 답, BR2.6 판정을 보내지 않는 경우·시간 제한·상한 |
| 제목 | BR3.1 후보 0~3개·40자, BR3.2 기록의 글 판정, BR3.3 기계 대조, BR3.4 제목 순서, BR3.5 판정 실패 |
| 작업 사실 | BR4.1 판정 부실이면 둘째 줄 지움, BR4.2 Claude 출력 없음 |
| 설명 초안 | BR5.1 문장 1~3개, BR5.2 0.9 이상만, BR5.3 모두 떨어지면 NOT_GENERATED, BR5.4 판정 오류는 FAILED, BR5.5 화면에만 |
| 재료 판정 | BR6.1 큰 후보에 한 번, BR6.2 질문 400개, BR6.3 답 적용, BR6.4 실패면 규칙 순서 |
| 화면 | BR7.1 NOT_GENERATED면 설명 칸 숨김 |
| 고지 | BR8.1 FR10 통과 때만, BR8.2 고지 v3, BR8.3 첫 이용 고지 판본 |
| 확인 | BR9.1 개발용 확인 명령, BR9.2 원문은 Git 밖, BR9.3 기준 |
| 문서 | BR10.1 새 판정 문서 |
