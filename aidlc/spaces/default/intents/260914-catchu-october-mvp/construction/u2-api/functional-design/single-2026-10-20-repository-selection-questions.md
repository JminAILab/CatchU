# 선정 저장소·범위 판본 ERD 반영 — u2-api 기능 설계 단독 확인 (2026-10-20)

## 기록 지위와 판본

PR [#356](https://github.com/JminAILab/CatchU/pull/356)으로 dev에 이미 병합된 u2-api ERD의 두 표(`RepositorySelection`·`AllowedScopeRevision`)를 산출물 재작성 없이 확인·검증한다. 이 문서의 답은 새로 정한 것이 아니다. [#346 팀장 승인 리뷰](https://github.com/JminAILab/CatchU/pull/346#pullrequestreview-5568166382), PR #356 본문과 yeongyeon1802의 승인(15dc1bd4 대상), #346 병합 판본의 `api/docs/repository-selection.md`(58e53505)에서 옮겼다. 마지막 요약 확인은 팀장 답을 기다린다.

- 작업 위치 /Users/ljm/Desktop/github/CatchU-erd(메인 체크아웃 바깥 git worktree), 브랜치 docs/erd-선정저장소-aidlc-기록.
- HEAD = origin/dev = 94c50d9369f03cea8b00c1b42fe0a998e3c58912(PR #356 병합 커밋). 반영 커밋: 15dc1bd44bc44915c268aa93a02ce8e7ab647f93.
- 버전 aidlc 2.11.0 (runtime 2.11.0). 커서 active-space=default, active-intent=260914-catchu-october-mvp(LF). 커서를 바꾸지 않았다.
- 새 단독 실행: aidlc engine orchestrate next --stage functional-design --unit u2-api --single. 규칙이 두 부분으로 와서 continue cX58CeSl, continue yS5-8AlE를 그대로 실행해 single:true, gate:false의 run-stage를 받았다. 엔진 상태가 빈 새 폴더에서도 거부 없이 시작됐다.
- 새로 여는 대상은 u2-api뿐이다. u1-web·u3-worker·계약 설계·본 흐름·aidlc-state.md·12월 intent는 열거나 고치지 않는다. 답은 팀장 결정에서 옮기므로 답 방식 질문은 따로 묻지 않았다.

## 질문·답

### Q1. 현재 선정 저장소 표(RepositorySelection)는 무엇을 담고 어떤 불변 조건을 지키는가?

[Answer]: 저장소 ID(PK, GitHub 저장소 숫자 ID 문자열)·선정 참조(유일)·범위 판본(AllowedScopeRevision FK)·활성 여부 네 칸이다. 선정 제외는 active=false로 하고 행을 지우지 않는다. 저장소 좌표(소유자·이름)는 저장하지 않고 선정 참조로 해석한다. 좌표가 바뀌면 새 선정 참조로 바꾸고 이전 참조를 다른 좌표에 다시 쓰지 않는다. 회원별 허용 행은 없고 활성 실제 회원 모두에게 같은 현재 선정을 허용한다. 실제 접수는 요청 저장소가 활성 행이고 동의의 범위 판본이 그 행과 같을 때만 받고, 선정 참조를 그 행에서 동의에 저장한다. worker 실행 판정은 저장된 동의의 저장소·선정 참조·범위 판본·자료 종류를 현재 활성 행과 다시 대조한다. 동의에 저장된 선정 참조는 이 행의 FK가 아니어서, 행을 제외하거나 참조를 바꾼 뒤에도 종결된 분석은 저장된 참조로 좌표를 읽는다.

### Q2. 범위 판본 표(AllowedScopeRevision)는 무엇을 담고 어떻게 바꾸는가?

[Answer]: 범위 판본(PK)·허용 자료 종류(COMMIT·PULL_REQUEST·ISSUE 중 1개 이상)·저장소 전체 선정(true만 허용, 10월은 저장소 전체 선정만 정의)·수집 조건이다. 수집 조건은 수집 방식·범위·한도·재시도 각각의 값과 지위(DECIDED·PROPOSED·CONTRACT)이며 api는 해석하지 않고 판본의 의미로 보존한다. 전체 선정 판정은 자료 종류 목록이 아니라 저장소 전체 선정 칸으로 한다. 행은 고치거나 지우지 않고, 의미가 바뀌면 새 판본을 추가한다.

### Q3. 두 표를 ERD의 어느 묶음에 두었고 왜 그렇게 정했는가?

[Answer]: 업무 엔티티가 아니라 기술 기록 묶음에 둔다. 두 표는 기존 엔티티와 FK로 잇지 않는 내부 선정 근거이고, 공개 목록이 이 표를 그대로 내보내지 않는다. 로그인 세션 표를 기술 기록으로 둔 PR #297과 같은 판단이다. 그래서 entities.md 머리말의 기술 기록은 5개에서 7개(멱등·반영 연결·로그인 세션·저장소 선정 근거)가 됐고 업무 엔티티 10개는 그대로다.

### Q4. 분석 동의와의 관계와 관계도는 어떻게 적었고, 무엇을 넣지 않았는가?

[Answer]: 범위 판본 하나를 여러 선정이 함께 쓰는 관계(1 : 0..N, FK)와 별도로, 동의의 범위 판본은 FK가 아니라 실제 접수 때의 값 대조로 적는다. 개발(MOCK) 회원의 합성 판본은 범위 판본 표에 없어 FK로 묶으면 개발 접수가 깨지기 때문이다. 파생 관계도에는 값 대조를 점선 `|o..o{`로 그리고 텍스트 대체에도 같은 내용을 적었다. 길이 CHECK(1~200자)는 ERD 규약("ID 형식/길이는 물리 매핑으로 정함")에 따라 넣지 않았다. 초기 자료 값(선정한 두 저장소, 범위 판본의 수집 범위·한도 수치)과 저장소 좌표 카탈로그도 넣지 않는다.

### Q5. 이번 확인의 근거와 적용 경계, 이후 진행은 무엇인가?

[Answer]: 근거는 #346 팀장 승인 리뷰(두 표와 관계·불변 조건만 넣고 초기 자료 값·좌표 카탈로그는 넣지 않으며 동의의 범위 판본은 외래 키 없이 대조 관계로 적는다), PR #356 본문과 yeongyeon1802의 15dc1bd4 승인, 58e53505의 `api/docs/repository-selection.md`다. 이번 기록은 ERD 문서 대조이며 실제 DB·마이그레이션 실행·접수(#323)·worker 연결(#232) 검증을 뜻하지 않는다. 이 요약에 팀장의 Looks correct 답을 받은 뒤에만 log answer·독립 검토 요청·report --single을 각각 한 번 실행하고 READY일 때만 완료 보고한다. 산출물 재작성·거부 재시도·버전 변경·aidlc-state.md 수정·restart-stage·park·compose는 하지 않는다.

## 검사와 보존 범위

산출물 entities.md·functional-spec.md·rules.md·traceability.json과 api/docs/repository-selection.md는 94c50d93과 바이트가 같다(git diff --exit-code 빈 출력). repository-selection.md는 #346 병합 58e53505와도 같다. 착수 때 추적 파일 1,739개의 SHA-256과 감사 조각 7개 원문을 기준선으로 잡았고, 완료 뒤 대조한다.

required-sections(entities H2 4개·rules 3개·functional-spec 10개)와 upstream-coverage는 PASS, findings 0이다. traceability는 missing_from_upstream_ids 23건 FAIL이며 10/14 기록의 결과·목록과 같다. 통과로 바꾸지 않는다. ERD YAML은 ruby Psych로 파싱해 업무 엔티티 10·기술 기록 7·관계 20, 관계와 references 대상 이름이 모두 존재, 관계도 이름이 모두 YAML에 있음을 확인했다. 실제 명령·출력은 [검증 기록](single-2026-10-20-repository-selection-verification.md), [도구 기록](single-2026-10-20-repository-selection-tools.json)에 둔다.

## Consolidated Summary Confirmation

PR #356이 dev에 넣은 u2-api ERD를 다시 쓰지 않고 확인한다. RepositorySelection은 저장소 ID(PK)·선정 참조(유일)·범위 판본(FK)·활성 여부이며, 제외는 active=false로 행 유지, 좌표는 저장하지 않고 선정 참조로 해석, 회원별 허용 행 없이 활성 실제 회원 공통이다. 실제 접수는 활성 행과 동의 범위 판본이 같을 때만 받아 선정 참조를 그 행에서 저장하고, worker 실행 판정은 저장 동의의 네 칸을 현재 활성 행과 다시 대조한다. AllowedScopeRevision은 범위 판본(PK)·허용 자료 종류(1개 이상)·저장소 전체 선정(true만)·수집 조건(값과 지위, api는 해석 안 함)이며 행 수정·삭제 없이 새 판본을 추가한다. 두 표는 FK로 잇지 않는 내부 근거라 #297 세션 표처럼 기술 기록에 두어 머리말이 5→7개가 됐다. 동의의 범위 판본은 FK가 아닌 값 대조(개발 합성 판본은 표에 없음)이고 관계도는 점선이다. 길이 CHECK·초기 자료 값·좌표 카탈로그는 넣지 않았다. 산출물은 94c50d93과 바이트가 같고 기존 traceability FAIL 23건은 그대로 둔다. 이 확인 뒤 독립 검토와 단독 완료를 한 번씩 진행하며 u1-web·u3-worker는 열지 않는다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
