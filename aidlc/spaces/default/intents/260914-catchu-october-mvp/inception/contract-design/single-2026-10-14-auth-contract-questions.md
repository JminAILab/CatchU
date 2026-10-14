# 인증 API 명세 반영 — 계약 설계 단독 후속 확인 (2026-10-14)

## 기록 지위와 판본

PR [#297](https://github.com/JminAILab/CatchU/pull/297)에 이미 반영된 인증 계약을 확인·검증 기록으로 연결한다. 산출물을 다시 쓰거나 저장하지 않는다. 아래 답은 팀장 지시와 현재 조회한 PR 본문·커밋 메시지·결정 댓글에서 정리했으며 제품 결정을 다시 선택한 것이 아니다. 이 문서의 마지막 요약 확인은 별도의 팀장 답을 기다린다.

- 작업 위치: /Users/ljm/Desktop/github/CatchU, 브랜치 `docs/인증-api-명세`.
- HEAD와 origin 브랜치: `14508dbb840bea09f641122768dd9342a59e963d`.
- `git merge-base HEAD origin/dev`: `383ada9dbfbd609ea37828d903e299e32f5114d4`. fetch·merge·rebase 없이 로컬 ref로 확인했다.
- 실행 버전: aidlc 2.11.0 (runtime 2.11.0). 원래 intent 커서: `260914-catchu-october-mvp`(끝에 LF). 이미 대상 intent이므로 switch는 실행하지 않았다.
- 변경 커밋: `68626527808b0356faf3d6993ac471a3044faedb`(경로·스키마·ERD 반영), `14508dbb840bea09f641122768dd9342a59e963d`(파생 설계·api 기능 문서의 미결·검토안 표기 정리).
- 본 흐름은 functional-design / Completed, Last Updated 2026-09-23T08:42:38Z다. 상태·기존 승인·12월 intent는 보존한다.
- 감사 기록에서 2026-09-23T07:02:00Z의 single-stage:contract-design STAGE_STARTED 한 건, 해당 Workflow의 STAGE_COMPLETED 없음 확인. 새 계약 실행을 열지 않는다.

## 질문·답

### Q1. 인증 계약으로 옮긴 범위와 근거는 무엇인가?

[Answer]: dev `383ada9`에 병합된 [#257](https://github.com/JminAILab/CatchU/pull/257)·[#254](https://github.com/JminAILab/CatchU/pull/254)·[#269](https://github.com/JminAILab/CatchU/pull/269)의 api/src/google-login·github-connection·auth 코드 값과 해당 api 기능 문서를 그대로 계약으로 옮겼다. PR #297 본문과 두 커밋 메시지를 현재 조회해 확인했다. 인증 경로 7개는 POST /v1/auth/google/authorization, POST /v1/auth/google/login, POST /v1/auth/refresh, POST /v1/auth/logout, POST /v1/me/github/authorization, POST /v1/me/github/connection, DELETE /v1/me/github/connection이다. 경로·요청·응답 스키마·거부 조건·쿠키와 Origin 보호를 기록하며 개발 로그인 경로, web 화면 상태 합의, api 내부 함수는 추가하지 않았다. Google 비활성은 404, GitHub 연결 비활성은 403, 갱신 401은 쿠키 제거, 반복 로그아웃은 204라는 구분을 보존한다.

### Q2. 세션·쿠키·출처와 수명의 결정은 무엇인가?

[Answer]: [#250 팀장 결정](https://github.com/JminAILab/CatchU/issues/250#issuecomment-6097542703)에 따라 Access는 현재 900초(15분), 최초 로그인부터 최대 7일, 마지막 정상 갱신 뒤 24시간 만료다. 사람의 무조작 감지는 추가하지 않고 로그아웃은 현재 브라우저 세션만 종료한다. Access와 Google 로그인 시도 수명(현재 600초)은 스키마의 고정값으로 묶지 않고 현재 값으로 설명한다. web은 응답의 expiresIn을 사용한다. Refresh는 본문에 넣지 않고 catchu_refresh 쿠키로만 전달하며 Path /v1/auth, HttpOnly, SameSite=Strict, Domain 없음, HTTPS에서 Secure다. 갱신·로그아웃은 Origin을 먼저 정확히 검사하고 누락·불일치면 403/AUTH_ORIGIN_FORBIDDEN이며 쿠키·세션을 바꾸지 않는다. 사용한 Refresh의 재사용은 세션을 폐기하고 401과 쿠키 제거로 응답한다. DB·서명·커밋 실패는 500이며 새 쿠키·제거 쿠키를 보내지 않는다. 반복 로그아웃은 같은 204와 쿠키 제거로 응답한다.

### Q3. 거부 사례와 세션 표의 배치 결정·기각 이유는 무엇인가?

[Answer]: 경로별 거부 사례를 계약 요약의 별도 표로 두는 안은 요약이 36 KB에 가까워 기각하고 member-api.yaml의 각 경로 description에 두었다. 요약에는 공통 규칙·오류 표만 둔다. AuthSession·SessionRefreshToken은 업무 엔티티로 두는 안을 기각했다. 로그인 유지용 저장 기록이므로 기존 멱등·반영 기록과 같은 기술 기록으로 ERD에 두고 MemberAccount → AuthSession → SessionRefreshToken 관계를 보존한다. Google은 기존 identityReference, GitHub은 기존 GitHubConnection을 사용한다.

### Q4. OQ-A1과 같은 대상을 가리키는 문서는 어떻게 정리했는가?

[Answer]: OQ-A1은 인증 경로·앱 종류·쿠키·CORS·CSRF·수명에 대한 결정으로 바꾸었다. 남은 운영 도메인·AWS 앞단만 [#212 배포 조건](https://github.com/JminAILab/CatchU/issues/212#issuecomment-6097540881)에 둔다. 운영은 web/API 같은 출처, /v1만 API 전달, 운영 CORS_ALLOWED_ORIGINS 비움, AUTH_WEB_ORIGIN 정확히 지정이 전제다. api 기능 설계는 ERD 파생 관계도·텍스트 대체·F1의 세션 유효성 확인·OQ 표를 맞췄고, GitHubConnection 제약은 자동 갱신 없음·만료/폐기 시 REAUTH_REQUIRED로 명확히 했다. api/docs/google-login.md·github-connection.md·auth-sessions.md는 명세가 정본이라는 안내로 바꾸되 링크가 걸린 「API 연결안」 제목은 유지했다. 이 세 문서도 이번 기록에서는 수정하지 않는다.

### Q5. 확인 이후의 실행·보존 경계는 무엇인가?

[Answer]: 이 계약 요약 확인 답을 받은 뒤 log answer, 검토 요청, report --single을 각각 한 번만 실행한다. SUMMARY_RECEIPT_MISSING 검토 거부와 kind:error 완료 거부가 나오면 원문을 검증·도구 파일에 보존하고 9/23 실행을 열어 둔다. 재시도, 질문 파일 이동, 추가 확인, restart-stage, 본 흐름 next 등 우회를 하지 않는다. 이후 u2-api 기능 설계만 새 단독 실행으로 열어 별도의 팀장 요약 확인과 독립 검토를 받는다. u1-web·u3-worker는 열지 않는다. 이 답을 u2-api의 요약 확인으로 재사용하지 않는다.

## 검증·보존·커밋 범위

산출물 5개(member-api.yaml·common.yaml·contract-summary.md·u2-api entities.md·functional-spec.md)는 14508db와 바이트 동일하다. api/docs 3개도 그대로다. 전체 추적 파일 1,552개와 감사 원문 6개를 /private/tmp/catchu-auth-contract-20261014에 기준선으로 저장했다. 12월 intent 추적 파일 36개, 이전 single-*·review*.md·verification.md·traceability.json·aidlc-state.md를 보존한다. 감사는 착수 원문 앞부분을 보존하고 도구가 추가하는 기록만 허용하며 팀장이 이어 붙인 2026-10-14T00:19:03Z 이후 미커밋 기록도 커밋에 포함한다.

새 기록 6개, 10월 감사 파일, 도구가 만든 리뷰 사본만 최종 로컬 커밋 1개에 포함한다. .local-handoffs/ 제외. aidlc doctor·버전 변경·park·compose·fetch·merge·rebase·push·원격 이슈/Project/PR 갱신은 실행하지 않는다. 허용 목록 밖 변경이면 멈추고 보고한다.

실제 검사 명령·원문·적용 한계는 [검증 기록](single-2026-10-14-auth-contract-verification.md), [도구 기록](single-2026-10-14-auth-contract-tools.json)에 둔다. 계약 traceability는 요청대로 실행했으나 해당 단계에 traceability.json이 없어 경로 없음으로 종료했다. 파일을 새로 만들거나 기존 FAIL을 고쳐 통과시키지 않는다.

## Consolidated Summary Confirmation

이미 반영된 인증 경로 7개·응답 스키마·세션/쿠키/출처 규칙, 세션 기술 기록 2개와 OQ-A1 결정 처리를 산출물 재작성 없이 확인 기록으로 연결한다. 수명은 현재 900초·600초라는 설명으로 두고 web은 expiresIn을 사용한다. 거부 사례는 member-api.yaml에 두며 개발 로그인 경로·web 상태 합의·api 내부 함수는 제외한다. 기각 이유와 #212의 운영 도메인·AWS 앞단 미결을 보존한다. 9/23의 열린 계약 단독 실행에 한 번씩 확인·검토·완료 요청을 연결하고 거부 원문을 기록하며 우회하지 않는다. 이 확인은 계약 단계에만 적용되고 u2-api는 별도 답을 받는다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct

