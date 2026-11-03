# 코드 품질 평가 — CatchU

> 범위: 2026-11-03 집중 스캔(`kind: partial`), 기준 커밋 `9923226c`. 시험·빌드는 실행하지 않았다. 아래 평가는 읽은 코드와 설정만의 판단이다. 이번 합치기에서 U4 #461(작성자 설명·텍스트 자료)을 더해 평가했다.

## 한눈에

| 항목 | 평가 | 근거 |
|---|---|---|
| 이름 | 좋음 | 업무 말(본인 기여·작업 사실·근거 한계·작성자 설명)을 식별자·상수 이름에 그대로 쓴다(`_OWN_COMMIT_SCOPE`, `EVIDENCE_COMMIT_CAP`, `GeneratedContentNotice`, `AUTHOR_DESCRIPTION_MAX_LENGTH`) |
| 함수 크기 | 보통 | 작은 함수가 많지만 grouping.py·relations.py·claude.py처럼 큰 파일과 긴 함수가 있다. U4 파일은 모두 작다(api 저장소 150줄 안팎, web 화면 모델 300줄 안쪽) |
| 오류 처리 | 좋음 | 실패는 결과로, 결함은 예외로 나눈다. 외부 오류 원문·비밀값을 로그·메시지에 넣지 않는다. 생성 호출은 재시도 0, 시간 초과를 따로 센다. U4 화면은 성공 응답과 모양이 맞을 때만 「저장됨」이고, 실패를 0건·빈 설명으로 보이지 않는다 |
| 시험 | 좋음(worker·U4), 확인 안 함(그 밖의 api·web) | worker 시험 35개가 영역별로 있고 합성 대역으로 GitHub·Claude 없이 돈다. U4는 api 시험 둘(실제 테스트 DB)과 web 시험 여섯을 더했다. 시험 머리에 시나리오·기대 결과·실패 조건을 먼저 적는다(team.md Testing Posture) |
| 중복 | 보통 | 자동 생성 안내가 web 두 곳에 복제, 계약 판본 문자열 여러 곳, U4 길이 상한을 api·web이 각자 상수로 가짐, U4 저장소 둘이 회원 확인·UUID 검사를 각자 가짐 |
| 죽은 코드 | 좋음 | 스캔 범위에 TODO·FIXME·HACK·`eslint-disable` 0건. 계약에만 남은 이슈 단위(`IssueUnit`)는 열쇠 함수가 받지만 후보 묶음은 만들지 않는다 |

## 시험

- **worker**: pytest, `tests/test_candidate_*.py`(후보 묶음·동일성·같은 변경·사례), `test_generation_*.py`(흐름·재료·patch·가리기·응답·제목·고쳐 쓰기·Claude 어댑터), `test_worker_messages.py`(계약), `test_processing.py`, `test_live_processing.py`, `test_u7_*.py`. 커버리지 설정은 `pyproject.toml`의 `[tool.coverage.run] source = ["app"]`.
- **api**: CI가 `npm run lint`·`typecheck`·`npm test`(실제 테스트 DB)·`node --test test/analysis/shared-fixtures.check.cjs`를 돈다. 탈퇴 연쇄 삭제 시험(`test/db/member-cascade-delete.test.cjs`)이 회원을 참조하는 외래 키가 모두 연쇄 삭제인지 본다.
  - U4: `test/catches/author-description-api.test.cjs`는 S1(저장·두 번 저장·공백·4,000/4,001자·형식 거부·남의 Catch 404·로그 비노출)과 **S2(같은 작업을 다시 반영하면 `EXISTING`으로 설명과 저장 시각이 그대로, 다른 작업의 새 Catch는 NULL)**를 실제 등록 코드(`registerCandidates`)와 격리 스키마로 확인한다. `test/materials/text-materials-api.test.cjs`는 S3(CRUD·경계값·회원 둘 교차 404·커서·로그 비노출)을 실제 `AppModule`로 확인한다.
  - 탈퇴와 작성자 설명·텍스트 자료의 함께 지워짐은 연쇄 삭제 시험(`text_material`은 표 목록에, 설명은 `catch_asset` 행과 함께)이 다룬다. 설명 저장 도중 탈퇴가 겹치는 경합은 시험하지 않았다(11월 범위에서 경합 시험 제외).
- **web**: `node --test test/*.test.mjs`. 첫 이용 고지 판본 대조는 `test/u2-consent.test.mjs`(README 기준). U4는 `author-description*.test.mjs`·`assets-description-reload.test.mjs`·`materials*.test.mjs`·`unsaved-traverse-guard.test.mjs`가 합성 응답·서버 렌더링·원본 tsx 변환으로 상태 전이를 본다. 마운트 효과(열 때 불러오기)는 이 시험에서 돌지 않아 브라우저에서 따로 확인했다고 README가 적는다.
- **공유 자료**: api CI가 worker 쪽 `uv sync`까지 해 `shared-fixtures.check.cjs`로 양쪽 합성 자료를 맞춘다. 계약 판본을 바꾸면 이 공유 자료도 같이 바뀐다.

## 린트·형식·CI

- worker: ruff(`E4,E7,E9,F,I,UP,B`), `ruff format --check`, mypy strict(`app`·`tests`).
- api: eslint `--max-warnings=0`, typecheck.
- web: `npm run check`.
- CI(`.github/workflows/ci.yml`): `changes`로 바뀐 영역만 돌리고, `docs-size`로 문서 크기 상한(36,000 B)을 본다. `deps-audit`가 의존성 취약점을 본다.

## 문서

- 모듈 머리 설명이 아주 자세하고 결정 근거(날짜·이슈·업무 규칙 ID)를 단다. 반대로 규칙이 바뀌면 설명이 낡기 쉽다(아래 「낡을 설명」).
- 기능 문서가 worker/docs·api/docs와 web 기능 폴더 README에 있다. 상한 가까운 문서: `worker/docs/generation.md` 35,312 B, `worker/docs/relation-collection.md` 35,793 B, `worker/docs/candidate-decision.md` 34,053 B. U4 쪽: `web/src/features/assets/README.md` 27,540 B, `api/docs/publications.md` 8,633 B, `web/src/features/materials/README.md` 9,460 B.

## 기술 부채와 위험 (Catch 개편 관점)

| # | 내용 | 위치 | 영향 |
|---|---|---|---|
| D1 | 커밋 → Catch 소속을 저장하지 않는다. 같은 작업은 매번 다시 계산한 `wi1`으로만 잇는다 | api/src/catches/registration-service.ts 155~193행, catch-asset.entity.ts 20행 | 재분석 중복의 근본 원인. 새 표·메시지 칸·worker 제외 단계가 함께 필요 |
| D2 | 근거에 본인 커밋을 최근 20건만 담는다 | worker/app/candidates/build.py 86·674행 | 근거로 소속 전체를 대신할 수 없다. 결과에 소속 전체 칸이 따로 필요 |
| D3 | 이슈 번호 나누기가 열쇠를 바꾼다 | worker/app/candidates/grouping.py 1652~1738·1904~1944행, identity.py 133~156행 | 끄면 이슈 조회가 허용된 요청의 해당 PR 열쇠가 바뀐다(출시 전 DB 초기화 전제) |
| D4 | 계약 판본 `"2"`가 여러 파일에 문자열로 있다 | worker/app/processing/pipeline.py 66행, result.py 79행, api/src/analysis-queue/analysis-request.dispatcher.ts 66행, api/src/analysis-receiver/receiver.types.ts 19·59·76행, worker-messages.yaml | 판본 올림이 여러 파일 동시 변경이 된다. 큐에 남은 옛 판본 작업은 새 검사기가 거부한다 |
| D5 | 생성 제공자 경계가 글 하나만 돌려준다 | worker/app/generation/provider.py 11·50~60행 | 판정(확률·고르기·점수) 공급자를 같은 Protocol에 넣기 어렵다. 새 경계와 실패 코드가 필요 |
| D6 | 생성 흐름은 작업 사실을 바꾸지 않는다는 경계 | worker/app/generation/flow.py 450~484행, worker/docs/candidate-text.md 29행 | 판정이 필요한 「쓸 만한 기록의 글」 줄을 작업 사실에 넣으려면 경계를 다시 정해야 한다 |
| D7 | 재료 고르기가 종류를 보지 않는다 | worker/app/generation/request.py 312~379행 | 큰 PR에서 앞쪽 파일만 재료가 된다. 종류 판정은 title.py 109~143행에만 있다 |
| D8 | 종류 판정의 빈틈 | worker/app/generation/title.py 36~38·109~143행 | `*Test.java`·`*Tests.cs` 꼴은 시험으로 보지 않는다(이름 꼴이 소문자 `*_test.*`·`*.test.*`·`*.spec.*`·`test_*.py`뿐). `Tests/` 폴더는 폴더 이름을 소문자로 바꿔 보므로 이미 시험이다. `.ipynb`는 목록 밖(None) |
| D9 | 가리기는 변경 줄·경로에만 돈다 | worker/app/generation/redact.py, request.py 108~128행 | PR 제목·커밋 메시지를 제목·작업 사실에 쓰면 그 글에도 가리기 판정이 필요하다 |
| D10 | 자동 생성 안내가 두 화면에 복제 | web/src/features/recipient/recipient-format.ts 18~23행, web/src/features/assets/assets-view.tsx 80~90행 | 사람이 쓴 PR 제목이 제목이 되면 두 곳 모두 틀린 안내가 된다. 구직자 상세에는 사람이 쓴 「작성자 설명」이 같은 화면에 있어 안내의 「설명」이 AI 초안을 뜻한다는 점이 글로 드러나지 않는다 |
| D11 | 제목 줄 수 제한 없음 | web recipient.module.css `.cardTitle`(157행), assets.module.css `.cardTitle`(52행)·`.detailTitle`(76행) | 기록의 글을 자르지 않고 쓰려면 화면에서 줄 수를 제한해야 한다(`line-clamp` 없음) |
| D12 | 분석 고지 v2 문구가 새 동작과 어긋남 | api/src/analysis-intake/analysis-notice.ts 23·34·36~39행 | 「정해진 문장」, 「Anthropic만」, 「커밋 메시지·PR 글은 보내지 않음」. v3와 판본 올림이 필요 |
| D13 | 첫 이용 고지 상수를 두 서비스가 따로 가짐 | api/src/ai-consent/ai-consent.gate.ts 13행, web/src/components/ai-consent/ai-consent-notice.ts 8·11행 | 판본·받는 곳을 함께 고쳐야 한다. 올리면 모든 회원이 다시 동의한다 |
| D14 | DB 제목 길이 상한 없음 | api/src/catches/entities/catch-asset.entity.ts 24·43행 | 기록의 글 제목은 길 수 있다. 생성 쪽 40자 상한(limits.py 37행)은 조각 제목에만 걸린다 |
| D15 | 큰 파일 | worker/app/candidates/grouping.py 88,725 B, worker/app/collection/relations.py 75,786 B | 나누기만 바꿔도 큰 파일을 건드리고, 시험 사례가 많다 |
| D16 | 생성 문서 크기 상한 근접 | worker/docs/generation.md 35,312 B / 36,000 B | 판정 설명은 새 문서로 써야 docs-size를 통과한다 |
| D17 | 작성자 설명은 Catch 행에 묶여 갈라짐을 따라가지 않는다 | api/src/catches/entities/catch-asset.entity.ts 38·97~105행, registration-service.ts 160~192행 | 같은 작업이 다른 `wi1`로 다시 오면 새 Catch는 설명 없이 생기고 설명은 옛 Catch에 남는다. 소속 저장이 갈라짐을 줄이면 함께 줄어든다. 기존 Catch를 새로 쓰는 변경을 넣는다면 두 설명 칸은 제외해야 한다(엔티티에 초기값을 두지 않은 이유, ADR-004) |
| D18 | 출시 전 DB 초기화 전제와 작성자 설명 | (운영 전제) | 나누기 끄기 등으로 DB를 초기화하면 이미 쓴 작성자 설명·텍스트 자료도 함께 사라진다. 12월 전 이용자는 팀 관련자뿐이라는 전제와 같이 다뤄야 한다 |
| D19 | U4 상한 상수가 api·web에 따로 있다 | api `author-description-input.ts` 4행·`text-material-input.ts` 5행, web `author-description-api.ts` 5행·`author-description-panel.tsx` 6행·`materials-api.ts` 5행 | 상한을 바꾸면 다섯 곳을 맞춰야 한다. 서버 검사가 기준이라 어긋나도 저장은 막히지만 화면 안내가 틀린다 |
| D20 | U4 저장소 둘이 회원 확인·UUID 검사를 복제 | api `author-description-store.ts` 66~76행, `text-material-store.ts` 125~147행, `text-material-input.ts` 9·25행 | 작은 중복. 규칙(같은 404·`FOR KEY SHARE`)을 바꿀 때 두 곳을 함께 고쳐야 한다 |

## 낡을 설명(규칙이 바뀌면 같이 고칠 곳)

- worker/app/candidates/grouping.py 모듈 설명 6항 「나누기」(40~45행)
- worker/app/candidates/build.py 모듈 설명 「제목」·「문장」(23~32행): 제목을 만들지 않음, 커밋 메시지를 문장에 넣지 않음
- worker/app/generation/title.py 모듈 설명(1~14행): 제목은 세 조각뿐
- worker/app/generation/request.py 모듈 설명(8~11행): 커밋 메시지·PR 글은 보내지 않음, 근거 순서로 담음
- worker/app/generation/render.py 모듈 설명: 문장은 틀로만 만듦
- worker/docs/candidate-decision.md 「나누기」, worker/docs/candidate-text.md 「후보 내용」·「제목」, worker/docs/generation.md 「재료 찾기」·「보내기 전」·「제목」
- web/src/features/recipient/recipient-format.ts 14행 설명(10/8 결정 문장)
- web/src/features/assets/author-description-panel.tsx 33~35행 안내 문장: 「AI가 만든 「Catch 설명 초안」은 이 설명을 바꾸지 않습니다」. Catch 개편이 설명 초안을 Claude 문장으로 바꿔도 이 문장은 맞지만, 초안 이름이 바뀌면 함께 고친다
- api/docs/publications.md 31행: 「결과 반영(재분석)은 기존 Catch를 참조만 하고 이 칸을 쓰지 않으며, 새 Catch는 설명 없이 만들어진다」. 소속 저장으로 등록 동작이 바뀌면 이 문장도 다시 맞춘다
