# 새 Catch — 설계 결정 기록

근거:
- 요구사항 `inception/requirements-analysis/requirements.md`
- 사용자 이야기 `inception/user-stories/stories.md`
- 코드 지식 `aidlc/spaces/default/codekb/CatchU/architecture.md`·`component-inventory.md`
- 이 단계의 답 `domain-design-questions.md` Q1~Q4

구성 요소 목록은 `components.md`에 있다.

---

## ADR-001: 작성자 설명 칸과 GitHub 링크 이름을 web 공통 구성 요소 둘로 둔다

### Context

- **칸 해석:** 작성자 설명은 지금처럼 한 칸(4,000자)에 칸 제목과 함께 저장한다(FR1.2, 제약 2). 이 칸 해석을 세 곳이 함께 쓴다.
  - 지원자 편집 화면: 8칸 채우기, 저장할 글, 합계 글자 수
  - 「발행하면 면접관에게 열릴 링크」 목록
  - 면접관 발행본(받은 사람 화면, 작성자 발행본 상세)
- **링크 이름:** 지원자 목록과 면접관 화면이 같은 이름을 써야 한다(FR5.1). 표지는 그 이름 바로 뒤에 붙는다(FR10.5).
- **근거 강조:** 받은 사람 AI 답의 근거 강조(C-11)는 저장된 글 전체의 글자 위치로 온다.
  - 지금은 `snapshot-view.tsx`가 설명 전체를 글 하나로 그려서 위치가 맞는다.
  - 칸 제목 줄을 빼고 칸별로 그려도 같은 글자가 강조돼야 한다(FR3.5·AC2.2.10과 같은 원리).
- **글자 수:** api는 글을 칸으로 나누지 않고 코드 포인트로 센다(`author-description-input.ts`).

### Decision

web 공통 자리(`web/src/lib`)에 순수 함수 구성 요소 둘을 둔다.

- **AuthorDescriptionSections:** 칸 나누기·합치기·합계 글자 수를 맡는다.
  - 칸을 나눌 때 칸마다 저장된 글 안의 시작 위치를 함께 돌려준다.
  - 두 단위를 나눠 쓴다. 합계 글자 수는 코드 포인트다(4,000자 상한용, api와 같음). 칸마다의 시작 위치는 UTF-16 코드 단위다(C-11 강조 위치와 같음, `published-chunk.entity.ts`의 `charStart`·`charEnd`).
- **GithubLinkName:** 링크 이름과 본인 커밋 표지 판정을 맡는다. 지금 `github-source-url.ts` 곁에 두고, 지금 판별 규칙을 그대로 쓴다. 위치를 셀 때 쓰는 원문 주소 길이도 같은 UTF-16 코드 단위다.

강조가 칸 제목 줄에 걸칠 때의 모양은 기능 설계에서 정한다. 기능 설계 시험에 칸 제목 앞뒤에 이모지가 있는 글의 강조 위치 사례를 넣는다. (Q1 A와 덧붙임)

### Consequences

- 좋은 점:
  - 세 화면의 칸 해석·이름·강조 위치가 한 곳에서 정해져 어긋나지 않는다.
  - 칸 제목 줄 모양이 바뀌면 AuthorDescriptionSections만 바뀐다.
- 나쁜 점: web 공통 자리에 파일이 둘 늘고, 시험도 그 둘에 따로 둔다.
- 보안:
  - 두 구성 요소는 글자를 돌려줄 뿐 HTML을 만들지 않는다. 그리기는 지금처럼 React 텍스트로만 한다(NFR5).
  - 이름에서 푼 글자의 제어 문자는 GithubLinkName이 지운다.
  - 표지 흉내와 구별되는 모양은 기능 설계(보안 점검 「화면 출력」)에서 정한다.

### Alternatives Rejected

- 하나로 합치기(Q1 B): 따로 바뀌는 칸 규칙과 링크 규칙이 한곳에 섞인다.
- 화면마다 따로 두기(Q1 C): 화면 사이에 칸 해석과 이름이 어긋날 수 있다. FR5.1을 지키기 어렵다.
- api가 칸을 나눠 주기: API 모양이 바뀌고, 요구사항이 「화면에서만 계산하고 API는 바꾸지 않는다」(FR3.5, FR5.3)와 칸 저장은 한 칸(FR1.2)으로 정했다.

---

## ADR-002: 3단계 규칙 사실은 worker의 새 구성 요소 RevisitFacts가 맡는다

### Context

- **규칙 다섯(FR12·FR13):** 다시 고친 곳, 옮긴 곳, 확장자 바꿈, 되돌림, 시험 파일 「있음」
- **공통 입력:** 다섯 모두 같은 작업 안의 본인 커밋과 그 파일 기록만 본다. 좁은 산출물 목록으로 거른다.
- **제약:**
  - GitHub를 다시 부르지 않는다(FR12.4, NFR1).
  - 규칙은 하나씩 버릴 수 있어야 한다(FR15.4).
- **지금 구조:**
  - 후보 판정(`worker.candidates`, `grouping.py` 1,880줄)이 작업 단위·작업 사실·근거를 만든다.
  - 재료 분류(`title.classify`)는 그대로 둔다(FR13.1).
  - 옮긴 곳 판정에 필요한 파일 내용 식별값(blob sha)은 지금 수집 중에 버린다.

### Decision

worker에 새 구성 요소 RevisitFacts를 둔다.

- 규칙마다 따로 나누고, 규칙마다 끌 수 있게 한다.
- 처리(`worker.processing`)가 후보마다 부른다.
- 후보 판정에는 규칙을 넣지 않는다(작업 시각 두 칸은 ADR-003). 재료 분류는 고치지 않는다.
- 수집(`worker.collection`)은 파일 내용 식별값을 남기도록만 고친다.
- 지운 파일 항목에도 GitHub가 식별값을 주는지는 기능 설계 때 실제 응답 하나로 확인한다. 여러 커밋에 걸쳐 옮긴 곳(앞 커밋에서 지우고 뒤 커밋에서 같은 내용으로 새로 만듦)을 찾으려면 지운 쪽 값이 필요하다. (Q2 A와 덧붙임)

### Consequences

- 좋은 점:
  - 규칙을 하나씩 시험하고 버릴 수 있다.
  - 후보 판정(#118)의 경계와 AI 재료 고르기가 그대로다.
  - GitHub 호출이 늘지 않는다.
- 나쁜 점:
  - worker 구성 요소가 하나 는다.
  - 지운 쪽 식별값이 오지 않으면 여러 커밋에 걸친 옮긴 곳은 찾지 못한다. 기능 설계 확인 결과에 따라 범위를 한계로 적어야 할 수 있다.
- 보안:
  - 입력은 이미 모은 기록뿐이다. 결과는 파일 경로·커밋 식별값과 정해진 문장이다.
  - 파일 내용이나 바뀐 줄의 글자를 결과에 담지 않는다. 바뀐 줄은 위치 판정에만 쓴다.
  - 비밀 파일 경로는 좁은 산출물 목록으로 판정에서 뺀다(FR13.2).

### Alternatives Rejected

- 후보 판정 안에 넣기(Q2 B): 후보 판정의 경계가 바뀌고, 큰 파일 옆에 규칙이 붙어 규칙 하나를 버리기가 어렵다.
- 재료 분류(`title.classify`)를 좁히기: 요구사항이 재료 순서용 분류는 그대로 둔다고 정했다(FR13.1).

---

## ADR-003: 작업 시각은 후보 판정이 합친 뒤의 본인 커밋 목록으로 정한다

### Context

- **쓰임:** 작업 시각(첫·마지막 본인 커밋의 작성 시각)은 본인 Catch 목록 정렬에만 쓰고, 화면에는 보이지 않는다(FR14).
- **재료:** 후보 판정은 단위 안의 본인 커밋 목록(`own_commit_shas`)과 커밋마다의 작성 시각(`authored_at`)을 안다.
- **합치기:** 작업 식별값이 같은 후보는 `build.py`의 `_merge_same_identity`가 첫 후보에 합친다. 이때 첫 후보의 값을 두고 본인 커밋 목록만 이어 붙인다.

### Decision

후보 판정이 합치기를 마친 뒤, 합쳐진 본인 커밋 목록으로 첫·마지막 작업 시각을 정해 후보에 싣는다. 작성 시각(authored)을 쓴다(가정 A3). (Q3 A와 덧붙임)

### Consequences

- 좋은 점:
  - 합쳐진 후보의 커밋까지 시각에 들어간다.
  - 작업 단위의 성질이 단위를 정하는 곳에 남는다.
  - 규칙 판정이 아니므로 FR15.4의 버림 대상이 아니다.
- 나쁜 점: 후보 판정의 결과 모양에 칸 둘이 는다. 합치기 순서를 바꾸는 미래 변경은 이 계산 위치를 함께 봐야 한다.
- 보안: 시각은 면접관에게 보이지 않고 사본에 들지 않는다(FR14.3). 새 개인정보가 아니고 이미 수집한 커밋 작성 시각이다.

### Alternatives Rejected

- RevisitFacts에서 계산(Q3 B): 정렬 값이 「본인만 확인」 사실과 같은 자리에 섞인다.
- 후보를 만들 때(합치기 전) 정하기: 합쳐진 후보 커밋의 시각이 빠진다.

---

## ADR-004: 새 사실은 catch_asset에 칸 셋으로 저장한다

### Context

- **새로 남는 것:**
  - 다시 볼 곳 사실 목록: 지원자만 보고, 사본에는 넣지 않는다(FR12.2).
  - 첫·마지막 작업 시각
- **지금 저장 방식:**
  - `catch_asset`은 작업 사실을 글 배열(`work_facts`)로, 등록 판정을 jsonb(`registration_assessment`)로 칸에 담는다.
  - 근거는 따로 표(`catch_evidence`)가 있다.
- **옛 Catch:** 3단계 뒤 출시 직전에 DB를 초기화하므로, 옛 Catch에 값을 채우는 길은 없다(FR15.3).
- **탈퇴:** 회원 연쇄 삭제로 Catch를 지운다.

### Decision

`catch_asset`에 칸 셋을 더한다.

- 다시 볼 곳 사실 jsonb 하나(목록)
- 첫 작업 시각, 마지막 작업 시각

규칙은 다음과 같다. (Q4 A)

- 소유는 Catch 등록(Catches)이다.
- 지원자 Catch 응답만 사실 칸을 읽는다. 작업 시각은 정렬에만 쓴다.
- 사본 만들기(Publications)는 세 칸을 읽지 않는다.
- 옛 Catch는 빈 값이다.

### Consequences

- 좋은 점:
  - 표·외래 키·연쇄 삭제가 늘지 않는다.
  - 탈퇴는 지금 연쇄 삭제로 함께 지워진다.
  - 등록 한 트랜잭션 안에서 함께 쓴다.
- 나쁜 점:
  - 사실 하나를 행 단위로 고르거나 셀 수 없다(요구사항에 그런 일이 없다).
  - jsonb 칸의 모양은 계약 설계·기능 설계에서 검사를 정해야 한다.
- 보안:
  - 사실 칸은 본인 응답에만 싣고, 사본·받은 사람 경로·AI 재료에 들지 않는다(AC9.4.1).
  - 「본인만 확인」 경계는 Publications가 이 칸을 읽지 않는 것으로 지킨다.

### Alternatives Rejected

- 다시 볼 곳 사실을 새 표로(Q4 B): 표 하나, 외래 키, 연쇄 삭제가 더 생기고 탈퇴 시험 범위가 는다.
- 사본에도 담기: 요구사항이 면접관에게 보이지 않게 정했다(FR12.2).

---

## 요구사항에서 이미 정해져 여기서 다시 정하지 않은 것

- 링크 이름과 표지는 화면에서만 계산하고, 사본에는 근거별 본인 커밋 여부만 담는다(FR3.5, FR10.2).
- 사본의 새 칸은 AI 재료(조각·요약 근거)에 넣지 않는다(FR9.5). 지금 `chunker.ts`·`summary-sources.ts`는 고르는 칸만 읽으므로 동작은 그대로이고 시험만 더한다.
- 3단계는 결과 메시지 계약 판본을 올리고 api·worker를 함께 배포한다(FR15.1).

## Sources

- `inception/requirements-analysis/requirements.md` FR1~FR15, NFR1·NFR5, 가정 A3
- `inception/user-stories/stories.md`
- `aidlc/spaces/default/codekb/CatchU/architecture.md`, `aidlc/spaces/default/codekb/CatchU/component-inventory.md`
- `inception/domain-design/domain-design-questions.md` Q1~Q4
- 지금 코드: `worker/app/candidates/build.py` `_merge_same_identity`, `api/src/catches/author-description-input.ts`, `api/src/catches/entities/catch-asset.entity.ts`, `web/src/features/publications/snapshot-view.tsx`
