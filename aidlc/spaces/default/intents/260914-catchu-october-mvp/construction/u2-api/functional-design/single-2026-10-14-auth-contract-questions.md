# 인증 API 명세 반영 — u2-api 기능 설계 단독 확인 (2026-10-14)

## 기록 지위와 판본

PR [#297](https://github.com/JminAILab/CatchU/pull/297)의 이미 반영된 u2-api 설계를 산출물 재작성 없이 확인·검증한다. 이 문서의 제품 결정 답은 팀장 지시·현재 PR 본문과 두 커밋 메시지·지정 결정 댓글에서 정리한 것이다. 마지막 요약 확인은 계약 단계와 별도로 팀장 답을 기다린다.

- 작업 위치 /Users/ljm/Desktop/github/CatchU, 브랜치 docs/인증-api-명세.
- HEAD/origin: 14508dbb840bea09f641122768dd9342a59e963d. merge-base HEAD origin/dev: 383ada9dbfbd609ea37828d903e299e32f5114d4.
- 버전 aidlc 2.11.0 (runtime 2.11.0), 원래 커서 260914-catchu-october-mvp(LF). 커서를 바꾸지 않았다.
- 변경 커밋: 68626527808b0356faf3d6993ac471a3044faedb, 14508dbb840bea09f641122768dd9342a59e963d.
- 새 단독 실행: aidlc engine orchestrate next --stage functional-design --unit u2-api --single. 반환된 continue dVfbCzpS, continue 6TOfwuOV를 그대로 실행해 single:true, gate:false의 run-stage를 받았다.
- 새로 여는 대상은 u2-api뿐이다. 계약의 9/23 단독 실행은 열린 채 유지하며 완료로 바꾸지 않는다. u1-web·u3-worker를 열지 않고 본 흐름·aidlc-state.md·12월 intent를 보존한다.

## 질문·답

### Q1. 계약에 반영된 인증 범위와 수명 표기는 무엇인가?

[Answer]: dev 383ada9에 병합된 #257·#254·#269의 google-login·github-connection·auth 코드와 api 기능 문서의 값을 그대로 옮긴 경로 7개와 응답 스키마를 기준으로 한다. Google 시작·완료, 세션 갱신·로그아웃, GitHub 시작·완료·해제이며 개발 로그인 경로·web 화면 상태 합의·api 내부 함수는 포함하지 않았다. Access 수명은 현재 900초, Google 로그인 시도 수명은 현재 600초로 설명하고 스키마의 고정값으로 묶지 않았다. web은 expiresIn을 사용한다. 경로별 거부 사례는 계약 요약이 36 KB에 가까워 별도 표 안을 기각하고 member-api.yaml의 경로 description에 두었다.

### Q2. 세션 표 2개를 어떤 모델로 두었고 왜 그렇게 정했는가?

[Answer]: AuthSession·SessionRefreshToken은 로그인 유지용 기술 기록으로 entities.md의 기존 멱등·반영 기록과 같은 묶음에 둔다. 업무 엔티티로 두는 안은 역할과 맞지 않아 기각했다. AuthSession은 A 소유, memberId로 회원을 참조하고 절대 7일 만료·마지막 정상 갱신 뒤 24시간·revokedAt을 통해 유효성을 정한다. SessionRefreshToken은 세션을 참조하며 원문 대신 tokenHash만 저장하고 usedAt 없는 행은 세션별 최대 하나다. 교체는 이전 토큰 사용 표시·새 토큰 저장·lastRefreshedAt 변경을 한 트랜잭션으로 묶는다. 사용한 Refresh가 다시 오면 세션을 끝내며 현재 브라우저 로그아웃은 다른 세션을 종료하지 않는다. Google 회원은 기존 identityReference, GitHub은 기존 GitHubConnection을 그대로 쓴다.

### Q3. 파생 기능 설계와 OQ-A1은 무엇을 기준으로 연결했는가?

[Answer]: entities.md의 MemberAccount → AuthSession → SessionRefreshToken 관계를 functional-spec.md의 파생 ERD와 텍스트 대체에 반영하고 F1 회원/연동 흐름에서 JWT 주체와 로그인 세션 유효성을 확인하도록 연결했다. GitHubConnection 제약은 자동 갱신 없음, 만료·폐기 시 REAUTH_REQUIRED다. [#250 팀장 결정](https://github.com/JminAILab/CatchU/issues/250#issuecomment-6097542703)에 따라 수명·현재 브라우저 로그아웃·같은 출처·Origin 전용 거부·반복 204를 계약에 연결했다. OQ-A1은 결정으로 바꾸고 남은 운영 도메인·AWS 앞단만 [#212 배포 조건](https://github.com/JminAILab/CatchU/issues/212#issuecomment-6097540881)에 둔다. 다른 OQ는 이번 기록에서 다시 정하지 않는다.

### Q4. api 기능 문서와 이번 검증의 적용 경계는 무엇인가?

[Answer]: api/docs/google-login.md·github-connection.md·auth-sessions.md의 같은 대상을 가리키는 문구는 PR #297에서 명세가 정본이라는 안내로 맞췄다. 링크가 걸린 「API 연결안」 제목은 유지했다. 이번 단독 기록은 이 문서들을 다시 쓰지 않고 바이트 보존만 확인한다. 인증 흐름·세션 모델의 문서 대조이며 실제 브라우저·OAuth·DB·AWS 검증이나 #251 화면 연결 완료를 뜻하지 않는다.

### Q5. 별도 확인 이후 독립 검토·완료·보존은 어떻게 진행하는가?

[Answer]: 이 u2-api 요약에 별도의 팀장 Looks correct 답을 받은 뒤 log answer, 독립 검토 요청, report --single을 각각 한 번 실행한다. 계약 확인 답을 재사용하지 않는다. 독립 검토는 이번에 달라진 인증 모델·F1·파생 관계·OQ-A1 정합성을 확인하며 기존 FAIL 23건은 그대로 드러낸다. READY일 때만 완료 보고를 실행한다. 산출물 수정·질문 파일 이동·거부 재시도·추가 확인·본 흐름 next·park·compose·restart-stage·버전 변경을 하지 않는다. 허용 목록 밖 파일 변화면 멈춘다.

## 검사와 보존 범위

산출물 5개와 api/docs 3개는 14508db와 동일하다. 전체 추적 파일 1,552개·12월 36개, 기존 single-*·review*.md·verification.md·traceability.json·aidlc-state.md는 착수 기준선과 대조한다. 감사 조각 6개는 착수 원문 앞부분을 보존하고 도구의 추가 기록만 허용한다. 새 기록 6개·10월 감사 파일·도구가 만든 리뷰 사본만 로컬 커밋 하나에 포함하고 .local-handoffs/는 제외한다.

required-sections(entities·rules·functional-spec)와 upstream-coverage는 PASS다. traceability는 missing_from_upstream_ids 23건 FAIL이며 10/13 결과·목록과 비교하고 통과로 바꾸지 않는다. 계약 YAML 4개·요약 YAML 3블록·ERD YAML 1블록은 앞 단계에서 파싱 PASS였다. 실제 명령·출력·보존 대조는 [검증 기록](single-2026-10-14-auth-contract-verification.md), [도구 기록](single-2026-10-14-auth-contract-tools.json)에 둔다.

## Consolidated Summary Confirmation

PR #297의 이미 반영된 u2-api 설계를 다시 쓰지 않고 확인한다. 세션 표 2개는 업무 엔티티 대신 기술 기록으로 두며 회원→세션→Refresh 관계를 파생 ERD·텍스트 대체에 연결하고 F1에서 로그인 세션 유효성을 확인한다. 인증 경로 7개·스키마는 병합된 코드 값, 수명은 현재 900초·600초와 expiresIn 사용, 거부 사례는 member-api.yaml이다. OQ-A1은 결정이고 운영 도메인·AWS 앞단만 #212에 남긴다. 개발 로그인 경로·web 상태 합의·api 내부 함수는 포함하지 않는다. 기존 traceability FAIL 23건과 산출물·기존 기록을 보존하며, 이 u2-api의 별도 확인 뒤 독립 검토와 단독 완료를 한 번씩 진행한다. 계약 확인을 재사용하지 않고 u1-web·u3-worker는 열지 않는다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct

