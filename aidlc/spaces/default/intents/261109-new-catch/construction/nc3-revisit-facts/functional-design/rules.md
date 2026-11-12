# NC3 다시 볼 곳 사실과 작업 시각 — 업무 규칙

입력:
- 요구사항 `inception/requirements-analysis/requirements.md` FR12·FR13·FR14·FR15, NFR1·NFR6·NFR7, 가정 A2·A3·A4
- 이야기 `inception/user-stories/stories.md` US9.1~US9.4, US10.1·US10.2, US11.1·US11.2
- 구성 요소 `inception/domain-design/components.md`, 설계 결정 `inception/domain-design/decisions.md` ADR-002~004
- 계약 `inception/contract-design/contract-summary.md` C2·C4·C5
- 다듬은 화면 `inception/refined-mockups/mockups.md` 2절, `interaction-spec.md` 6절
- NC1 기능 설계 `construction/nc1-sections-and-links/functional-design/rules.md` BR5.2(커서 범위 값과 옛 커서 400 처리)
- 이 단계의 답 `functional-design-questions.md` Q1~Q5와 「질문으로 올리지 않고 정한 것」

아래 YAML이 규칙의 정본이다. 칸 모양은 `entities.md`, 흐름과 화면 상태는 `functional-spec.md`가 맡는다. 「앞」·「뒤」 커밋은 BR2.1의 커밋 순서를 말한다.

```yaml
rules:
  # BR1 수집 (Collection)
  - id: BR1.1
    statement: 커밋 상세 응답의 파일 항목마다 파일 내용 식별값(sha)을 버리지 않고 파일 기록에 남긴다.
    category: calculation
    applies_to: Collection(worker.collection normalize.commit_changes, records.ChangedFile)
    trigger: 커밋 상세를 정규화할 때
    logic: IF 파일 항목의 `sha`가 16진수 40자다 THEN 소문자로 blob_sha에 남긴다. ELSE blob_sha = null(그 파일은 옮긴 곳 판정에서 빠진다). 지운 파일(removed)의 값은 지우기 전 내용의 식별값이다(2026-11-11 CatchU 커밋 b289406e 실제 응답과 git 식별값으로 확인). 새 GitHub 호출은 없다.
    violation: 해당 없음(값이 없거나 꼴이 아니면 null이고 수집은 그대로다)
    source: FR12.4, NFR1

  # BR2 다시 볼 곳 판정의 공통 입력·거르기·상한 (RevisitFacts)
  - id: BR2.1
    statement: 판정은 후보 하나의 본인 커밋끼리만 보고, 커밋 순서는 작성 시각과 식별값으로 정한다.
    category: constraint
    applies_to: RevisitFacts, AnalysisProcessing
    trigger: 후보마다 다시 볼 곳 사실을 계산할 때
    logic: 입력은 같은 작업 식별값의 후보를 합친 뒤(build.py _merge_same_identity)의 ownCommitShas에 든 커밋 기록뿐이다. 다른 후보·다른 작업·다른 계정의 커밋은 보지 않는다. 부모가 둘 이상인 커밋(병합)은 뺀다. 커밋 순서는 (작성 시각 authored_at 오름차순, 식별값 오름차순)이다. GitHub를 부르지 않는 순수 계산이다.
    violation: 해당 없음
    source: FR12.1, NFR1
  - id: BR2.2
    statement: 변경 내용을 받지 못했거나 파일 목록이 잘린 커밋은 경로를 보는 규칙에서 빼고, patch가 없는 파일은 줄을 보는 규칙에서만 뺀다.
    category: constraint
    applies_to: RevisitFacts
    trigger: 커밋 하나를 판정 재료로 쓸 때
    logic: IF 커밋의 changes_status가 FETCHED가 아니거나 files_truncated가 참이다 THEN 그 커밋은 BR3.1·BR3.2·BR3.3·BR3.5에서 뺀다(BR3.4 되돌림은 메시지만 보므로 쓴다). IF 파일의 patch가 null이다 THEN 그 파일은 BR3.1에서만 뺀다. 빠진 것을 추측해 채우지 않는다.
    violation: 해당 없음
    source: FR12.1, FR12.4
  - id: BR2.3
    statement: 좁은 산출물 목록에 든 경로는 다시 볼 곳 판정에서만 뺀다.
    category: policy
    applies_to: RevisitFacts
    trigger: 경로를 보는 규칙(BR3.1·BR3.2·BR3.3·BR3.5)이 파일을 볼 때
    logic: >-
      경로가 아래 하나라도 맞으면 뺀다(폴더·이름 비교는 소문자). 옮긴 곳·확장자 바꿈은 앞·뒤 경로 가운데 하나라도 맞으면 사실을 만들지 않는다.
      (1) 잠금 파일: 이름이 package-lock.json, npm-shrinkwrap.json, yarn.lock, pnpm-lock.yaml, bun.lock, bun.lockb, poetry.lock, uv.lock, pipfile.lock, cargo.lock, gemfile.lock, composer.lock, go.sum, gradle.lockfile, podfile.lock, pubspec.lock, mix.lock, flake.lock.
      (2) 빌드 결과 폴더: 폴더 이름 하나가 build, dist, out.
      (3) 압축된 js: 이름이 .min.js로 끝남.
      (4) AI 하네스 기록·폴더(Q3 A): 폴더 이름 하나가 .claude, .codex, .agents, .cursor, .kiro, .aidlc, .windsurf, .gemini이거나 첫 폴더가 aidlc.
      (5) 도구가 관리하는 지시 파일(Q2 A): 이름이 agents.md, claude.md, gemini.md, .cursorrules이거나 경로가 .github/copilot-instructions.md. 파일 전체를 뺀다.
      (6) 비밀 파일: worker의 지금 비밀 경로 판정(redact.is_secret_path)이 참.
      AI 재료 고르기와 재료 분류(title.classify)는 이 목록을 쓰지 않는다.
    violation: 해당 없음
    source: FR13.2
  - id: BR2.4
    statement: 규칙 다섯은 worker 코드의 상수로 하나씩 끌 수 있고, 꺼진 규칙은 사실을 만들지 않는다.
    category: policy
    applies_to: RevisitFacts
    trigger: 판정을 시작할 때
    logic: 켜진 종류의 상수 목록에 든 규칙만 돈다. FR15.4 측정으로 버리는 규칙은 이 목록에서 빼는 코드 변경으로 끈다. 환경 변수나 화면 설정은 두지 않는다. (2026-11-11 Build and Test 덧붙임) TheMe 측정(분모 Catch 46)으로 5% 미만인 EXTENSION_CHANGED(1개, 2.2%)·REVERTED(0)·TEST_FILES_PRESENT(0)를 껐다. 켜진 것은 REWORKED_LINES(19개, 41.3%)·MOVED_FILE(4개, 8.7%)이다. 꺼진 규칙의 판정 함수·계약 kind 값·web 문장은 남긴다.
    violation: 해당 없음
    source: FR15.4
  - id: BR2.5
    statement: 한 Catch의 사실은 30개까지, 한 사실의 경로·커밋은 20개까지 담고, 1,024자를 넘는 경로의 사실은 만들지 않는다.
    category: constraint
    applies_to: RevisitFacts, ResultReception
    trigger: 후보 하나의 사실을 모두 계산한 뒤
    logic: 사실을 종류 순서(REWORKED_LINES → MOVED_FILE → EXTENSION_CHANGED → REVERTED → TEST_FILES_PRESENT)로, 같은 종류 안에서는 사실의 마지막 커밋의 커밋 순서(BR2.1)와 첫 경로 글자 순서로 늘어놓고 앞의 30개만 남긴다. 경로가 1,024자(코드 포인트)를 넘으면 그 사실은 만들지 않는다. TEST_FILES_PRESENT의 경로·커밋은 앞의 20개만 담는다. 넘어서 뺀 것은 화면에 알리지 않는다(Q1 A).
    violation: api 결과 검사가 같은 상한을 넘는 결과를 계약 위반으로 거부한다(BR5.2).
    source: FR12.1, C4(수 상한)

  # BR3 규칙 다섯 (RevisitFacts)
  - id: BR3.1
    statement: 뒤 본인 커밋이 앞 본인 커밋이 넣은 줄과 글자가 같은 줄을 같은 파일에서 지웠으면 「다시 고친 곳」이다.
    category: calculation
    applies_to: RevisitFacts
    trigger: REWORKED_LINES 규칙이 켜져 있을 때
    logic: >-
      쓰는 커밋(BR2.2)을 커밋 순서대로 읽는다. 파일마다 patch의 '+' 줄 글자를, '-' 줄 글자를 앞뒤 공백을 떼고 본다. 글자나 숫자가 하나도 없는 줄(빈 줄, 괄호·쉼표만 있는 줄)은 보지 않는다.
      앞 커밋이 넣은 줄은 (경로, 줄 글자)마다 그 줄을 넣은 가장 늦은 앞 커밋으로 기억한다. 커밋이 파일 이름을 바꾸면(renamed, previous_path) 옛 경로의 기억을 새 경로로 잇는다.
      IF 뒤 커밋 L의 modified·renamed 파일 F의 '-' 줄 글자가 F의 경로(또는 previous_path)에서 앞 커밋 E가 넣은 줄로 기억돼 있다 THEN (E, L, F의 경로)마다 사실 하나를 만든다. paths = [F의 경로], commits = [E, L].
      지운 파일(removed)은 이 규칙에서 보지 않는다. IF 되돌림 규칙(BR3.4)이 켜져 있고 L이 E를 되돌린 커밋이다 THEN 그 쌍은 만들지 않는다. 되돌림이 꺼져 있으면 그 쌍도 손으로 되돌린 것처럼 다시 고친 곳으로 만든다(가정 A2, 2026-11-11 Build and Test 덧붙임: FR15.4로 되돌림을 끈 뒤 git revert 쌍이 아무 사실도 남기지 않던 빈틈). 줄 글자는 맞춰 보기에만 쓰고 결과에 담지 않는다.
    violation: 해당 없음
    source: FR12.1 (a)
  - id: BR3.2
    statement: 같은 작업 안에서 파일을 새 경로로 옮겼으면 「옮긴 곳」이다.
    category: calculation
    applies_to: RevisitFacts
    trigger: MOVED_FILE 규칙이 켜져 있을 때
    logic: >-
      두 경우를 본다. (1) 한 커밋 안의 이름 바꿈: 파일 항목이 renamed이고 previous_path가 있다. paths = [previous_path, path], commits = [그 커밋].
      (2) 여러 커밋에 걸친 옮김: 쓰는 커밋들의 removed 항목과 added 항목을 blob_sha(BR1.1)로 맞춘다. IF 한 식별값에 지운 경로가 꼭 하나, 새로 만든 경로가 꼭 하나이고 두 경로가 다르다 THEN 사실 하나. paths = [지운 경로, 새 경로], commits = 지운 커밋과 만든 커밋을 커밋 순서로(같은 커밋이면 하나). 지운 쪽과 만든 쪽의 순서는 묻지 않는다.
      한 식별값에 지운 곳이나 만든 곳이 둘 이상이면 고르지 않고 만들지 않는다. 빈 파일 식별값(e69de29bb2d1d6434b8b29ae775ad8c2e48c5391)과 null은 맞추지 않는다. (1)로 이미 맞춘 항목은 (2)에 쓰지 않는다.
      두 경로가 BR3.3의 확장자 바꿈 꼴이면 이 규칙이 아니라 BR3.3이 만든다. 폴더와 확장자가 함께 바뀌면 이 규칙의 사실 하나다(질문 없이 정한 것).
    violation: 해당 없음
    source: FR12.1 (b), FR12.4
  - id: BR3.3
    statement: 폴더와 이름은 그대로 두고 확장자만 바꾸면 「확장자 바꿈」이다.
    category: calculation
    applies_to: RevisitFacts
    trigger: EXTENSION_CHANGED 규칙이 켜져 있을 때
    logic: BR3.2의 (1)·(2)와 같은 방법으로 찾은 앞·뒤 경로 쌍에서, IF 폴더가 같고 마지막 점 앞 이름이 같고 마지막 점 뒤 글자가 다르다(둘 다 점이 있음) THEN 사실 하나. paths = [앞 경로, 뒤 경로], commits는 BR3.2와 같다. 대소문자만 다른 확장자(.JPG → .jpg)는 확장자 바꿈이 아니고 BR3.2의 옮긴 곳이다. 확장자 바꿈 규칙이 꺼져 있으면 이 쌍은 사실을 만들지 않는다.
    violation: 해당 없음
    source: FR12.1 (c)
  - id: BR3.4
    statement: 본인 커밋 X의 메시지가 같은 후보의 다른 본인 커밋 Y를 git revert 꼴로 가리키면 「되돌림」이다.
    category: calculation
    applies_to: RevisitFacts
    trigger: REVERTED 규칙이 켜져 있을 때
    logic: X의 메시지에서 「This reverts commit <16진수 40자>」를 모두 찾는다. IF 찾은 식별값 Y가 같은 후보의 ownCommitShas에 있고 Y ≠ X다 THEN 사실 하나. paths = [], commits = [X, Y](되돌린 커밋, 되돌려진 커밋). 다른 작업의 커밋이나 짧은 식별값, 「Reverts owner/repo#N」만 있는 메시지는 남기지 않는다. 메시지 없이 손으로 되돌린 것은 BR3.1로만 잡힌다(가정 A2).
    violation: 해당 없음
    source: FR12.1 (d), 가정 A2
  - id: BR3.5
    statement: 시험 폴더나 시험 이름 꼴인 파일을 바꾼 작업이면 「시험 파일 있음」이다.
    category: calculation
    applies_to: RevisitFacts
    trigger: TEST_FILES_PRESENT 규칙이 켜져 있을 때
    logic: >-
      쓰는 커밋(BR2.2)의 파일 가운데 BR2.3으로 빠지지 않은 파일을 본다. 상태가 removed인 파일(지운 시험 파일)은 치지 않는다(NFR 요구 Q2 B, NFR8.4). 그래서 지운 시험 파일만 있는 후보에는 사실이 없고, 지운 것과 고친 것이 섞이면 고친 경로만 담긴다. IF 폴더 이름 하나가 (소문자로) test, tests, __tests__, spec, e2e, androidtest이거나, 파일 이름이 (소문자로) test_*.py, *_test.*, *.test.*, *.spec.* 꼴이다 THEN 시험 파일이다.
      지금 재료 분류(title.py _is_test)의 대소문자 꼴 둘(이름이 Test·Tests로 끝남, 폴더가 Tests로 끝남)은 쓰지 않는다. 재료 분류는 바꾸지 않는다.
      시험 파일이 하나라도 있으면 후보마다 사실 하나. paths = 시험 파일 경로(처음 나온 커밋 순서, 같은 커밋 안에서는 파일 순서, 겹침 없음), commits = 그 파일을 바꾼 커밋(커밋 순서, 겹침 없음). 상한은 BR2.5.
    violation: 해당 없음
    source: FR13.1

  # BR4 작업 시각 (CandidateGrouping)
  - id: BR4.1
    statement: 같은 작업 식별값의 후보를 합친 뒤의 본인 커밋 목록으로 첫·마지막 작업 시각을 정한다.
    category: calculation
    applies_to: CandidateGrouping(build.py)
    trigger: _merge_same_identity가 끝난 뒤 후보마다
    logic: 합친 ownCommitShas의 커밋 기록에서 작성 시각(authored_at)의 가장 이른 값을 firstWorkAt, 가장 늦은 값을 lastWorkAt으로 한다. 커밋 시각(committed_at)은 쓰지 않는다. UTC 초 단위 RFC3339 글로 결과에 싣는다. 규칙 판정이 아니므로 BR2.4로 끄지 않는다.
    violation: 후보는 본인 커밋이 하나 이상이고 작성 시각 없는 커밋은 수집이 거부하므로 값이 없는 경우는 생기지 않는다. 생기면 worker 결함으로 결과를 만들지 않는다(지금 EligibleCandidate 검사처럼).
    source: FR14.1, 가정 A3

  # BR5 결과 메시지 (AnalysisProcessing, ResultReception)
  - id: BR5.1
    statement: 결과 메시지 Result 판본을 "4"로 올리고 후보마다 다시 볼 곳 사실과 첫·마지막 작업 시각을 싣는다.
    category: policy
    applies_to: AnalysisProcessing(worker.processing result·live), 계약 worker-messages.yaml
    trigger: 결과 메시지를 만들 때
    logic: LiveGenerator는 후보 판정 뒤 후보마다 RevisitFacts를 불러 결과를 후보에 붙인다. 생성 단계가 후보를 바꿔도 새 칸은 그대로 옮긴다. 결과 조합이 Candidate의 revisitFacts·firstWorkAt·lastWorkAt을 채우고 schemaVersion은 "4"다. 다른 메시지(Request·ProcessingEvent·ResultReceipt)의 판본은 그대로다. api와 worker를 함께 배포한다.
    violation: 판본 "3" 결과는 api 계약 검사가 SCHEMA_INVALID로 거부한다. 배포는 진행 중인 분석이 없을 때 한다(C4).
    source: FR12.1, FR14.1, FR15.1
  - id: BR5.2
    statement: api는 결과의 새 칸을 계약 모양과 같은 후보의 본인 커밋에 맞춰 검사한다.
    category: validation
    applies_to: ResultReception, Catches(registration-batch)
    trigger: 결과를 받아 등록 입력을 만들 때
    logic: 계약 검사(Ajv)가 모양을 본다(kind 값, paths·commits 꼴과 개수, 사실 30개, 경로 1,024자, 시각 꼴). 등록 입력 검사가 더 본다. IF 사실의 commits가 그 후보의 ownCommitShas에 없거나, firstWorkAt > lastWorkAt이다 THEN 등록 입력 오류다.
    violation: 계약 모양 위반은 지금처럼 SCHEMA_INVALID 거부다. 등록 입력 검사 위반은 지금 등록 입력 오류와 같은 갈래(INVALID_INPUT, 그 결과의 Catch를 하나도 등록하지 않음)다. 받은 값은 오류에 싣지 않는다.
    source: FR12.1, FR15.1
  - id: BR5.3
    statement: 합성(MOCK) 결과도 새 칸을 채운다.
    category: policy
    applies_to: AnalysisProcessing(fake_generator), worker/fixtures/m1-synthetic
    trigger: 합성 시나리오 결과를 만들 때
    logic: 합성 템플릿 후보마다 revisitFacts·firstWorkAt·lastWorkAt을 둔다. 「후보 하나 성공」 시나리오에는 종류마다 사실 하나를 두어 로컬에서 「다시 볼 곳」 칸을 볼 수 있게 하고, 나머지 시나리오는 빈 배열이다. 사실의 커밋은 그 후보 ownCommitShas 안의 값이다.
    violation: 템플릿이 계약을 어기면 지금처럼 worker 결과 검사가 막는다.
    source: FR15.1, C4

  # BR6 등록과 저장 (Catches)
  - id: BR6.1
    statement: 새 Catch를 등록할 때 첫 후보의 다시 볼 곳 사실과 작업 시각을 한 번 쓰고, 기존 Catch는 바꾸지 않는다.
    category: policy
    applies_to: Catches(registration-service)
    trigger: 결과 반영 트랜잭션 안에서 Catch를 등록할 때
    logic: 같은 workIdentity 후보 묶음의 첫 후보 값(지금 작업 사실·근거와 같은 방식)을 revisit_facts·first_work_at·last_work_at에 쓴다. IF 그 workIdentity의 Catch가 이미 있다 THEN 새 칸을 쓰지 않는다(지금처럼 소속만 더한다). 등록 뒤 새 칸을 고치는 경로는 없다.
    violation: 해당 없음
    source: FR12.1, FR14.1, ADR-004
  - id: BR6.2
    statement: catch_asset에 칸 셋을 더하고 옛 행은 빈 값으로 둔다.
    category: constraint
    applies_to: Catches(마이그레이션)
    trigger: 배포 때 마이그레이션
    logic: revisit_facts jsonb NOT NULL DEFAULT '[]'(배열 검사), first_work_at·last_work_at timestamptz NULL(둘 다 null이거나 둘 다 있고 first ≤ last 검사)을 더한다. 옛 행은 빈 배열과 null이다. 옛 Catch에 값을 채우지 않는다(출시 직전 DB 초기화로 모든 Catch가 새로 생긴다, FR15.3).
    violation: 검사를 어기는 쓰기는 DB가 거부해 등록 트랜잭션이 롤백된다.
    source: FR15.3, NFR7, ADR-004
  - id: BR6.3
    statement: 다시 볼 곳 사실과 작업 시각은 지원자 본인 응답과 정렬 말고는 읽지 않는다.
    category: authorization
    applies_to: Catches(public-catch-store), Publications, PublishedIndex, RagAnswer, Claude 연결(mcp-material-reader)
    trigger: 발행·공개 Catch 응답·받은 사람 경로·AI 재료·Claude 연결 읽기
    logic: 발행 사본 만들기, 공개 Catch 응답(publicResponse의 허용 칸), Claude 연결 읽기는 지금처럼 읽는 칸을 하나하나 적은 질의라 새 칸을 더하지 않는다. 사본에 새 칸이 없으므로 조각·요약 근거·면접관 화면에도 없다.
    violation: 해당 없음(시험이 사본·조각·공개 응답에 사실과 시각이 0건인지 본다)
    source: FR12.2, FR14.3, AC9.4.1

  # BR7 본인 목록 정렬과 커서 (Catches)
  - id: BR7.1
    statement: 본인 Catch 목록은 마지막 작업 시각이 최근인 것부터, 시각 없는 Catch는 맨 아래, 같으면 Catch 식별값 순서다.
    category: calculation
    applies_to: Catches(owner-catch-store list)
    trigger: GET /v1/catches
    logic: ORDER BY last_work_at DESC NULLS LAST, catch_id ASC. 저장소·분석 요청·작성자 설명 조건은 지금 그대로 함께 건다. 정렬 선택 칸은 없다.
    violation: 해당 없음
    source: FR14.2
  - id: BR7.2
    statement: 본인 목록 커서는 판본 3이고 위치는 (마지막 작업 시각 또는 없음, Catch 식별값)이다.
    category: validation
    applies_to: Catches(owner-catch-input), AssetsScreen, PublishScreen
    trigger: 다음 쪽이 있을 때 커서를 만들고, 「더 보기」 요청에서 커서를 읽을 때
    logic: >-
      만들 때: {v: 3, scope: NC1 BR5.2와 같은 sha256, after: {lastWorkAt: 마지막 항목 last_work_at의 밀리초 ISO 글 또는 null, catchId: 마지막 항목 catch_id}}.
      읽을 때: v가 3이고 scope가 같고, lastWorkAt이 null이거나 `new Date(x).toISOString() === x`인 글이고, catchId가 uuid여야 한다.
      다음 쪽 조건: IF lastWorkAt이 있다 THEN (last_work_at < 값) OR (last_work_at = 값 AND catch_id > catchId) OR (last_work_at IS NULL). ELSE (last_work_at IS NULL AND catch_id > catchId). BR7.1과 같은 순서라 빠지거나 겹치는 Catch가 없다.
    violation: v가 1·2이거나 꼴이 틀리거나 다른 조건의 커서면 400이다. web은 지금 「더 보기」 실패 안내를 보이고, 걸러 보기를 바꾸거나 화면을 다시 열면 첫 쪽부터 다시 부른다(NC1 BR5.2와 같음).
    source: FR14.4, C2
  - id: BR7.3
    statement: 공개 Catch 목록의 순서와 커서는 바꾸지 않는다.
    category: constraint
    applies_to: Catches(public-catch-store)
    trigger: 공개 Catch 목록 조회
    logic: 지금처럼 catch_id 오름차순이고 커서는 지금 모양({v: 2, scope, after: catchId 글})이다. 본인 목록 커서 함수가 바뀌어도 공개 목록은 지금 함수 모양을 따로 쓴다.
    violation: 해당 없음
    source: C2(바뀌지 않는 것)

  # BR8 본인 응답 (Catches, AssetsScreen)
  - id: BR8.1
    statement: 본인 Catch 목록 항목과 상세 응답에 다시 볼 곳 사실을 싣고 작업 시각은 싣지 않는다.
    category: constraint
    applies_to: Catches(owner-catch-response, catch-reader), AssetsScreen(catch-api)
    trigger: 본인 목록·상세 응답을 만들고 받을 때
    logic: api는 revisit_facts를 읽어 revisitFacts로 그대로 싣는다. 읽은 값이 배열이 아니거나 원소가 RevisitFact 모양이 아니면 지금 응답 무결성 오류(CatchReadIntegrityError)다. last_work_at은 커서를 만들 때만 읽고 응답 칸에 넣지 않는다. web은 revisitFacts가 RevisitFact 배열인지 검사하고, 아니면 그 응답을 지금처럼 받지 못한 것으로 본다.
    violation: api 무결성 오류는 지금처럼 서버 오류이고, web은 지금 「상세 내용을 불러오지 못했습니다」 또는 목록 실패 안내를 보인다.
    source: FR12.2, FR14.3, C2

  # BR9 「다시 볼 곳」 칸 (AssetsScreen)
  - id: BR9.1
    statement: 지원자 상세의 근거 바로 아래에 「다시 볼 곳」 칸을 그리고, 사실이 없으면 칸을 그리지 않는다.
    category: policy
    applies_to: AssetsScreen(assets-view CatchDetail)
    trigger: 지원자가 Catch 상세를 열 때
    logic: IF revisitFacts가 하나 이상이다 THEN 근거 칸과 Catch 설명 초안 칸 사이에 h3 「다시 볼 곳」과 작은 글자 「본인만 확인」(지금 생각해 볼 질문 제목과 같은 꼴)을 그리고 ul 목록에 사실마다 li 하나를 응답 순서대로 그린다. ELSE 제목도 칸도 그리지 않는다(화면 낭독기에도 없다). 발행 화면·면접관 화면에는 이 칸이 없다.
    violation: 해당 없음
    source: FR12.2, FR6.1, NFR6
  - id: BR9.2
    statement: 항목 문장은 종류마다 정한 꼴이고, 커밋 식별값 바로 뒤에는 받침과 상관없는 「에서」「의」만 붙인다.
    category: policy
    applies_to: AssetsScreen
    trigger: 「다시 볼 곳」 항목을 그릴 때
    logic: >-
      (C)는 커밋 링크 하나(BR9.3), 경로는 전체를 글자로 쓴다(Q5 A와 덧붙임).
      REWORKED_LINES 「커밋 (C앞)에서 넣은 줄을 커밋 (C뒤)에서 다시 고침: 경로」.
      MOVED_FILE 「새 파일로 옮김: 앞 경로 → 뒤 경로 (커밋 (C), (C))」.
      EXTENSION_CHANGED 「확장자 바꿈: 앞 경로 → 뒤 경로 (커밋 (C), (C))」.
      REVERTED 「커밋 (C되돌려진)의 변경을 커밋 (C되돌린)에서 되돌림」(commits[1]의 변경을 commits[0]에서).
      TEST_FILES_PRESENT 「시험 파일 있음: 경로, 경로 (커밋 (C), (C))」.
      커밋이 여럿이면 「, 」로 잇는다. 이/가·을/를을 식별값 바로 뒤에 붙이지 않는다(식별값 끝 글자마다 받침이 달라 「커밋 1a2b3c4이」처럼 틀린다). 모르는 kind는 응답 검사(BR8.1)가 막는다.
    violation: 해당 없음
    source: FR12.1, FR13.1, 다듬은 화면 2절
  - id: BR9.3
    statement: 커밋 식별값은 저장소 이름으로 만든 github.com https 커밋 링크로 새 탭에 열고, 링크를 만들 수 없으면 글자로만 보인다.
    category: validation
    applies_to: AssetsScreen
    trigger: 항목의 커밋 식별값을 그릴 때
    logic: IF 실제 자료 화면(dataMode api)이고 Catch가 LIVE이고, 상세가 불러온 저장소 이름이 `^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$` 꼴이며 저장소 부분이 `.`·`..`가 아니다 THEN `https://github.com/<소유자>/<저장소>/commit/<식별값 40자>`로 a(target _blank, rel noopener noreferrer)를 만든다. 링크 글자는 식별값 앞 7자이고 뒤에 화면 낭독기용 숨은 글자 「 (새 탭)」(발행본 링크와 같은 꼴)을 붙인다. ELSE(예시·합성 자료, 저장소 이름을 불러오는 중이거나 실패, 꼴이 아님) 식별값 앞 7자를 링크 없이 글자로만 보인다(Q4 A). 지금 근거 링크(safeEvidenceUrl, 「원본 근거 열기」)는 바꾸지 않는다(가정 A4).
    violation: 해당 없음
    source: FR12.3, NFR6, 가정 A4

  # BR10 분석 고지 (AnalysisNotice)
  - id: BR10.1
    statement: 고지 v3 4절에 다시 볼 곳 사실을 Catch에 남긴다는 한 줄을 더하고, 문구를 바꾸는 PR에서 팀장이 승인한다.
    category: policy
    applies_to: AnalysisNotice(analysis-notice.ts REAL_NOTICE)
    trigger: 3단계 코드 PR
    logic: 4절 「CatchU에 남는 것」의 셋째 줄 뒤에 한 줄을 더한다. 초안 「- 같은 작업 안 본인 커밋끼리 본 「다시 볼 곳」 사실(종류·파일 경로·커밋 식별값)을 Catch에 남기고 본인 화면에만 보입니다. 발행본, 받은 사람, AI 요약·질의응답에는 들어가지 않습니다.」 첫·마지막 작업 시각도 적을지는 그 PR에서 팀장이 정한다(C5). 판본 이름 catchu-real-analysis-notice-v3는 그대로다. 문구는 PR에서 팀장 승인으로 확정한다.
    violation: 팀장 승인이 PR에 없으면 3단계 PR을 합치지 않는다.
    source: FR15.2, C5
```

## 규칙 요약

| ID | 규칙 | 맡는 곳 | 출처 |
|---|---|---|---|
| BR1.1 | 파일 항목의 내용 식별값을 남긴다 | Collection | FR12.4, NFR1 |
| BR2.1 | 한 후보의 본인 커밋끼리만, (작성 시각, 식별값) 순서 | RevisitFacts | FR12.1 |
| BR2.2 | 못 받은·잘린 커밋은 경로 규칙에서, patch 없는 파일은 줄 규칙에서 뺀다 | RevisitFacts | FR12.1, FR12.4 |
| BR2.3 | 좁은 산출물 목록 여섯 묶음(잠금·빌드 폴더·.min.js·AI 하네스·지시 파일·비밀) | RevisitFacts | FR13.2 |
| BR2.4 | 규칙은 코드 상수로 하나씩 끈다 | RevisitFacts | FR15.4 |
| BR2.5 | 사실 30개, 경로·커밋 20개, 경로 1,024자 상한 | RevisitFacts, ResultReception | C4 |
| BR3.1 | 뒤 커밋이 앞 커밋이 넣은 줄을 지움 → 다시 고친 곳 | RevisitFacts | FR12.1 (a) |
| BR3.2 | 이름 바꿈 또는 같은 내용 식별값의 지움·만듦 → 옮긴 곳 | RevisitFacts | FR12.1 (b) |
| BR3.3 | 확장자만 바뀜 → 확장자 바꿈 | RevisitFacts | FR12.1 (c) |
| BR3.4 | 「This reverts commit」이 같은 후보 커밋을 가리킴 → 되돌림 | RevisitFacts | FR12.1 (d) |
| BR3.5 | 좁은 시험 폴더·이름 꼴 → 시험 파일 있음 | RevisitFacts | FR13.1 |
| BR4.1 | 합친 뒤 본인 커밋의 작성 시각 최소·최대 | CandidateGrouping | FR14.1 |
| BR5.1 | Result "4"에 새 칸 셋, api·worker 함께 배포 | AnalysisProcessing | FR15.1 |
| BR5.2 | api가 모양과 본인 커밋 소속을 검사한다 | ResultReception | FR12.1 |
| BR5.3 | 합성 결과도 새 칸을 채운다 | AnalysisProcessing | C4 |
| BR6.1 | 새 Catch에만 첫 후보 값을 한 번 쓴다 | Catches | ADR-004 |
| BR6.2 | 칸 셋 마이그레이션, 옛 행은 빈 값 | Catches | FR15.3, NFR7 |
| BR6.3 | 사본·공개 응답·AI·Claude 연결은 읽지 않는다 | Catches, Publications | FR12.2, FR14.3 |
| BR7.1 | 마지막 작업 시각 내림차순, 없음은 맨 아래, 식별값 순 | Catches | FR14.2 |
| BR7.2 | 커서 판본 3, 위치 (시각 또는 없음, 식별값) | Catches, AssetsScreen | FR14.4 |
| BR7.3 | 공개 목록 순서·커서는 그대로 | Catches | C2 |
| BR8.1 | 본인 응답에 사실을 싣고 시각은 싣지 않는다 | Catches, AssetsScreen | FR12.2, FR14.3 |
| BR9.1 | 근거 아래 칸, 사실 없으면 칸 없음 | AssetsScreen | FR12.2 |
| BR9.2 | 종류별 문장, 식별값 뒤 「에서」「의」 | AssetsScreen | FR12.1, FR13.1 |
| BR9.3 | github.com 커밋 링크(새 탭), 못 만들면 글자 | AssetsScreen | FR12.3 |
| BR10.1 | 고지 4절 한 줄, PR에서 팀장 승인 | AnalysisNotice | FR15.2 |

## Sources

- `inception/requirements-analysis/requirements.md` FR6.1·FR12·FR13·FR14·FR15, NFR1·NFR6·NFR7, 가정 A2·A3·A4
- `inception/user-stories/stories.md` US9.1~US9.4, US10.1·US10.2, US11.1·US11.2
- `inception/units-generation/unit-of-work.md`, `inception/units-generation/unit-of-work-story-map.md`
- `inception/domain-design/components.md`, `inception/domain-design/decisions.md` ADR-002·ADR-003·ADR-004
- `inception/contract-design/contract-summary.md` C2·C4·C5
- `inception/refined-mockups/mockups.md` 2절, `inception/refined-mockups/interaction-spec.md` 6절
- `construction/nc1-sections-and-links/functional-design/rules.md` BR5.2
- `construction/nc3-revisit-facts/functional-design/functional-design-questions.md` Q1~Q5
- 지금 코드: `worker/app/collection/normalize.py`·`records.py`·`relations.py`(newest_first), `worker/app/candidates/build.py`, `worker/app/generation/title.py`(_is_test), `worker/app/redact.py`(is_secret_path), `worker/app/processing/live.py`·`result.py`·`fake_generator.py`, `api/src/catches/owner-catch-input.ts`·`owner-catch-store.ts`·`public-catch-store.ts`·`catch-reader.ts`·`registration-batch.ts`·`registration-service.ts`, `api/src/analysis-receiver/analysis-receiver.service.ts`, `api/src/claude-mcp/mcp-material-reader.ts`, `api/src/publications/publish.service.ts`, `api/src/analysis-intake/analysis-notice.ts`, `web/src/features/assets/assets-view.tsx`, `web/src/features/publications/snapshot-view.tsx`
