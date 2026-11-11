# NC3 다시 볼 곳 사실과 작업 시각 — 성능 설계

입력:
- NFR 요구 `construction/nc3-revisit-facts/nfr-requirements/performance-requirements.md`(NFR1.1~NFR1.3, NFR6.1)
- 기능 명세 `construction/nc3-revisit-facts/functional-design/functional-spec.md`(W1, W3, 6절), 규칙 `rules.md`(BR3.1~BR3.5, BR7.1)
- 계약 `inception/contract-design/contract-summary.md` C2·C4
- 이 단계의 답 `nfr-design-questions.md`(Q1: 1초 숫자를 뺌)

## 1. RevisitFacts 계산 구조 (NFR1.3)

시간 숫자 목표는 두지 않는다(이 단계 Q1). 느려지지 않게 하는 것은 아래 구조이고, 코드 검토 때 본다.

- **한 번 훑기:** 쓰는 커밋(BR2.2)을 커밋 순서로 한 번 읽는다. 커밋마다 파일마다 patch를 한 번 줄로 나눈다.
- **사전:**
  - 다시 고친 곳: `(경로, 줄 글자) → 그 줄을 넣은 가장 늦은 앞 커밋`. 뒤 커밋의 '-' 줄은 이 사전에서 바로 찾는다. 이름 바꿈은 옛 경로 항목을 새 경로로 옮긴다.
  - 옮긴 곳: `blob_sha → (지운 경로 목록, 만든 경로 목록)`.
  - 시험 파일: 경로 판정 결과를 그 자리에서 모은다.
- **하지 않는 것:** 커밋 쌍마다 다시 훑지 않는다. 같은 patch를 두 번 나누지 않는다. 사실 30개 상한은 다 모은 뒤 정렬해 자른다(후보 하나의 사실 수는 작다).
- **줄 글자 거르기:** 앞뒤 공백을 떼고 글자나 숫자가 없는 줄은 사전에 넣지 않는다. 사전 크기와 우연한 일치가 함께 준다.
- **입력:** 후보 하나의 본인 커밋 기록뿐이다. 다른 후보 자료는 받지 않는다.

## 2. 호출 수 (NFR1.1, NFR1.2)

- 수집은 `normalize.commit_changes`가 이미 받는 응답의 파일 항목 `sha`를 `ChangedFile.blob_sha`로 옮기기만 한다. 요청 경로·쪽 수·diff 요청은 그대로다.
- RevisitFacts는 수집 객체·전송 객체를 받지 않는다. 함수 인자에 커밋 기록만 있어서 GitHub를 부를 길이 없다.
- 등록 뒤 새 칸을 고치는 SQL은 없다. 등록 INSERT 한 곳에서만 쓴다.

## 3. 본인 목록 질의 (BR7.1, NFR1.6)

- 지금 질의의 `ORDER BY c.catch_id ASC`를 `ORDER BY c.last_work_at DESC NULLS LAST, c.catch_id ASC`로 바꾼다. 회원 조건·걸러 보기 조건·`LIMIT limit + 1`은 그대로다.
- 다음 쪽 조건은 고정 조각 둘이다.
  - 시각 있는 커서: `(c.last_work_at < $a OR (c.last_work_at = $a AND c.catch_id > $b) OR c.last_work_at IS NULL)`
  - 시각 없는 커서: `(c.last_work_at IS NULL AND c.catch_id > $b)`
- 새 인덱스는 더하지 않는다(NFR1.6).

## 4. 확인

- 빌드와 시험에서 TheMe를 바꾸기 전·후로 분석해 종결 로그의 GitHub·AI 호출 수, `elapsedSeconds`, `resultBytes`를 함께 기록한다. 호출 수는 같아야 한다. 시간과 크기는 기록만 한다.
- RevisitFacts만 따로 재거나 시험에서 시간을 단정하지 않는다(이 단계 Q1).

## 5. 화면 (NFR6.1)

- 「다시 볼 곳」은 사실 배열을 한 번 돌아 `li`를 만든다. 새 요청은 없다. 저장소 이름은 상세가 이미 불러온 값이다.
- 역할과 키보드는 interaction-spec 6절 그대로다. h3 + 작은 글자 「본인만 확인」, `ul`, 커밋만 `a`, 숨은 「(새 탭)」(`visually-hidden` 꼴)이다.

## Sources

- `construction/nc3-revisit-facts/nfr-requirements/performance-requirements.md`, `scalability-requirements.md`(NFR1.6)
- `construction/nc3-revisit-facts/functional-design/functional-spec.md`, `rules.md`
- `inception/contract-design/contract-summary.md` C2·C4
- `inception/refined-mockups/interaction-spec.md` 6절
- `construction/nc3-revisit-facts/nfr-design/nfr-design-questions.md` Q1
- 지금 코드: `worker/app/collection/normalize.py`, `api/src/catches/owner-catch-store.ts`, `worker/app/processing/pipeline.py`(종결 로그)
