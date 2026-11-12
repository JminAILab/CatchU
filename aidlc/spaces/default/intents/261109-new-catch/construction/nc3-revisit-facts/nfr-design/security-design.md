# NC3 다시 볼 곳 사실과 작업 시각 — 보안 설계

입력:
- NFR 요구 `construction/nc3-revisit-facts/nfr-requirements/security-requirements.md`(NFR2.1, NFR5.1, NFR5.2, 확인 사항)와 `reliability-requirements.md`(NFR8.3)
- 기능 명세 `construction/nc3-revisit-facts/functional-design/functional-spec.md`(W1~W4), 규칙 `rules.md`
- 계약 `inception/contract-design/contract-summary.md` C2·C4
- 기술 스택 결정 `construction/nc3-revisit-facts/nfr-requirements/tech-stack-decisions.md`
- 이 단계의 답 `nfr-design-questions.md`

새 인증·암호화·비밀값은 없다. 지키는 경계는 넷이다. 본인만 보기, 믿지 않는 결과 메시지 검사, 화면 출력과 링크, 판정 재료를 남기지 않기다.

## 1. 본인만 보기 (NFR2.1)

- **읽는 곳을 하나로:** 새 칸 셋(`revisit_facts`, `first_work_at`, `last_work_at`)은 `api/src/catches/catch-reader.ts`의 `READ_COLUMNS`에 더한다.
  - 본인 목록·상세(`owner-catch-store.ts`)만 응답에 옮긴다(`owner-catch-response.ts`의 `toOwnerCatchResponse`에 `revisitFacts` 하나).
  - `last_work_at`은 응답 칸이 아니라 커서를 만드는 데만 쓴다. 응답 모양 타입에 시각 칸을 두지 않는다.
- **공개 응답:** `public-catch-store.ts`의 `publicResponse`는 지금처럼 허용 칸만 옮긴다. `READ_COLUMNS`가 새 칸을 읽어도 응답에는 나가지 않는다.
- **발행·Claude 연결:** 발행(`publish.service.ts`)과 Claude 연결(`mcp-material-reader.ts`)은 자기 질의에 칸을 하나하나 적고 `READ_COLUMNS`를 쓰지 않는다. 바꾸지 않는다.
- **시험:**
  - 사실·시각이 든 Catch로 발행본 사본, 조각·요약 근거, 공개 Catch 응답을 만든다. 세 글자(사실 경로, 커밋 식별값, 시각 ISO 글)가 0건인지 본다(S8).
  - 회원 두 명 시험: 남의 Catch 사실이 내 응답에 없고, 남의 커서는 400이다.

## 2. 결과 메시지 검사 (worker → api)

두 겹으로 본다.

| 겹 | 자리 | 보는 것 | 어기면 |
|---|---|---|---|
| 계약 검사 | `worker-messages.yaml`(Ajv, `worker-message.validator.ts`) | Result `"4"`, Candidate 필수 칸 셋, RevisitFact 모르는 칸 거부, `kind` 다섯 값, `paths` 원소 1~1,024자·최대 20개, `commits` 원소 소문자 16진수 40자·최대 20개, `revisitFacts` 최대 30개, 시각 date-time | SCHEMA_INVALID 거부(지금 그대로) |
| 등록 입력 검사 | `api/src/catches/registration-batch.ts`의 후보 검사 | 종류별 개수(REWORKED_LINES 경로 1·커밋 2, MOVED_FILE·EXTENSION_CHANGED 경로 2·커밋 1~2, REVERTED 경로 0·커밋 2, TEST_FILES_PRESENT 경로 1~20·커밋 1~20), 같은 사실 안 겹침 없음, 커밋이 그 후보 `ownCommitShas` 안, `firstWorkAt ≤ lastWorkAt` | `CatchRegistrationInputError('INVALID_INPUT', '<칸 이름>')`, 값은 싣지 않음 |

- 종류별 개수를 계약 스키마의 `if/then`으로 넣지 않는 까닭: 지금 계약은 모양만 보고 뜻 검사는 등록 입력 검사가 맡는다(`ownCommitShas` 중복 검사와 같은 자리). 한곳에서 시험한다.
- 종류별 개수 표는 api 등록 검사와 web 응답 검사가 같은 값을 쓴다. 두 서비스는 코드를 나누지 않으므로, api 시험과 web 시험이 같은 표의 경계(초과·부족 각 하나)를 함께 본다.

## 3. 요청 입력: 커서 (NFR7.2와 함께)

- `owner-catch-input.ts`에 본인 목록 전용 커서 판본 3을 둔다. `{v: 3, scope, after: {lastWorkAt, catchId}}`이고, 모르는 칸은 거부한다(지금 `object()` 검사).
- `lastWorkAt`은 `null`이거나, `new Date(x).toISOString() === x`인 글이다. `catchId`는 uuid다.
- SQL에는 `$n` 매개변수로만 넘긴다. 다음 쪽 조건 두 꼴(시각 있음·없음)은 고정 SQL 조각에서 고른다.
- 공개 목록은 지금 판본 2 커서 함수를 따로 남겨 쓴다(BR7.3). 두 커서는 범위 값이 달라(`public:` 앞붙임) 서로 섞이지 않는다(지금 그대로).

## 4. 화면 출력과 링크 (NFR5.1, NFR5.2)

- **글자:** 「다시 볼 곳」 항목은 React 글자 요소로만 만든다. 문장 조각을 배열로 이어 붙이고, `dangerouslySetInnerHTML`은 쓰지 않는다.
- **링크 만들기:** web 함수 하나(예: `revisitCommitHref(repositoryName, sha)`)가 맡는다.
  - 입력: 저장소 이름이 `^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$`이고 저장소 부분이 `.`·`..`가 아니며, 식별값이 `^[0-9a-f]{40}$`일 때만 `https://github.com/` + 이름 + `/commit/` + 식별값을 돌려준다. 그 밖에는 `null`이다.
  - 호스트는 함수 안의 고정 글자다.
  - 링크는 `dataMode === "api"`이고 `item.sourceMode === "LIVE"`일 때만 만든다. 지금 근거 링크와 같은 조건이다.
  - `target="_blank"`와 `rel="noopener noreferrer"`를 붙인다.
- **응답 검사:**
  - `catch-api.ts`의 응답 검사에 `revisitFacts` 검사를 더한다(배열, 원소 모양, 2절 종류별 개수, 식별값 꼴).
  - 하나라도 어긋나면 그 응답을 받지 못한 것으로 본다(지금 응답 검사 실패와 같은 갈래).
  - 문장을 만드는 코드는 검사를 통과한 값만 받는다. `commits[1]`은 개수가 맞아야만 읽힌다.

## 5. 판정 재료를 남기지 않기

- RevisitFacts 결과 자료형에는 `kind`·`paths`·`commits`만 있다. 줄 글자·커밋 메시지·파일 내용을 담는 칸이 없다.
- 판정 중 만든 (경로, 줄 글자) 사전은 함수 안 지역 값이고, 후보 하나가 끝나면 버린다(성능 설계 1절).
- 비밀 경로 판정은 `app.redact.is_secret_path`를 그대로 부른다. AI 재료와 같은 목록이다.
- 실패 로그(관측 설계)는 예외 메시지(`str(error)`)를 싣지 않고 종류 이름만 싣는다. 예외 메시지에 경로나 줄 글자가 섞일 수 있기 때문이다.

## 6. 팀 규칙의 예외 (NFR8.3)

- 예외를 잡는 곳은 처리 쪽의 RevisitFacts 부르는 자리 한 곳이다(신뢰성 설계 1절).
- 잡는 범위는 `Exception`이다. `BaseException`(중단 신호 등)은 잡지 않는다.
- 코드 주석에 까닭을 적는다. PR 「리뷰 요청」에 「팀 규칙 「예외를 삼키지 않는다」의 예외 한 곳(NFR 요구 Q1 B)」을 적는다.

## Sources

- `construction/nc3-revisit-facts/nfr-requirements/security-requirements.md`, `reliability-requirements.md`, `tech-stack-decisions.md`
- `construction/nc3-revisit-facts/functional-design/functional-spec.md`, `rules.md`(BR2.3, BR5.2, BR6.3, BR7.2, BR7.3, BR8.1, BR9.2, BR9.3)
- `inception/contract-design/contract-summary.md` C2·C4
- `construction/nc3-revisit-facts/nfr-design/nfr-design-questions.md`
- 지금 코드: `api/src/catches/catch-reader.ts`·`owner-catch-response.ts`·`owner-catch-input.ts`·`public-catch-store.ts`·`registration-batch.ts`, `api/src/analysis-receiver/worker-message.validator.ts`, `api/src/publications/publish.service.ts`, `api/src/claude-mcp/mcp-material-reader.ts`, `web/src/features/assets/catch-api.ts`·`assets-view.tsx`, `worker/app/redact.py`
