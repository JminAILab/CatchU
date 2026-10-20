# 선정 저장소·범위 판본 ERD 반영 — u2-api 기능 설계 검증 기록 (2026-10-20)

PR #356이 dev에 넣은 u2-api ERD 변경(15dc1bd4)을 산출물 재작성 없이 확인한 단독 실행의 검증 기록이다. 시간 순서로 적는다. 모든 명령의 원문 출력은 [도구 기록](single-2026-10-20-repository-selection-tools.json)의 같은 id에 있다. 질문과 답은 [질문 기록](single-2026-10-20-repository-selection-questions.md)에 있다.

## 판본·작업 위치

- 작업 위치 /Users/ljm/Desktop/github/CatchU-erd(메인 체크아웃 바깥 git worktree), 브랜치 docs/erd-선정저장소-aidlc-기록. 메인 체크아웃과 다른 worktree는 읽거나 쓰지 않았다.
- HEAD = origin/dev = 94c50d9369f03cea8b00c1b42fe0a998e3c58912(PR #356 병합 커밋), 반영 커밋 15dc1bd44bc44915c268aa93a02ce8e7ab647f93. 대조 판본: #346 병합 58e535057bc759e745c25e2556d9191fbe24f87d.
- aidlc 2.11.0 (runtime 2.11.0). 커서 active-space=default, active-intent=260914-catchu-october-mvp(LF). 커서를 고치지 않았다.
- 착수 때 미추적 파일은 이 폴더의 새 감사 조각 macui-macbookpro-local-f4e28722c4ce.md 하나였다. 세션 시작 훅이 만든 것이며 그 밖의 변경은 없었다(start-version-and-tree).

## 보존 기준선

착수 때 추적 파일 1,739개의 SHA-256과 감사 조각 7개 원문을 로컬 임시 폴더에 저장했다(baseline-hashes). 완료 뒤 이 기준선과 대조한다.

## 단독 실행 시작

엔진 상태가 빈 새 폴더에서 단독 실행이 바로 시작되는지는 시험된 적이 없었다. 첫 명령은 거부 없이 규칙 1/2부를 돌려줬다. 반환된 continue를 그대로 두 번 실행해 run-stage를 받았다.

````text
aidlc engine orchestrate next --stage functional-design --unit u2-api --single
aidlc engine orchestrate continue cX58CeSl
aidlc engine orchestrate continue yS5-8AlE
````

- 결과: load-steering(part 1/2, receipt cX58CeSl) → load-steering(part 2/2, receipt yS5-8AlE) → run-stage. 모두 exit 0이다(u2-single-next·u2-single-continue-part1·u2-single-continue-part2).
- run-stage는 single:true, gate:false다. 리뷰어는 aidlc-architecture-reviewer-agent, review_class는 adversarial, summary_confirmation은 on이다.
- produces는 {unit-name} 템플릿이고 unit 칸이 없다. 10/14와 같이 요청의 명시 대상 u2-api로 범위를 한정했다.
- 별도 Unit start/complete·본 흐름 next·상태 편집·일지·학습 의식은 실행하지 않았다. 단독 실행은 일지와 학습 의식을 쓰지 않는다.
- 답은 팀장 결정에서 옮겨 적었으므로 답 방식 질문(Guide me·I'll edit the file·Chat)은 묻지 않았다. 10/14 기록과 같다.

## 근거 자료 조회

- PR #356 본문·병합 커밋·yeongyeon1802 승인(15dc1bd4 대상, APPROVED)을 gh로 조회했다(source-pr-356).
- [#346 팀장 승인 리뷰](https://github.com/JminAILab/CatchU/pull/346#pullrequestreview-5568166382)를 조회했다(source-pr-346-lead-review).
- `api/docs/repository-selection.md`는 58e53505와 바이트가 같다(u2-sensor-comparison-and-byte-identity의 DOC-IDENTICAL-58e53505).

## 센서와 10/14 대조

| 센서 | 결과 | 10/14 대비 |
|---|---|---|
| required-sections entities.md | PASS, H2 4개, findings 0 | 같음 |
| required-sections rules.md | PASS, H2 3개, findings 0 | 같음 |
| required-sections functional-spec.md | PASS, H2 10개, findings 0 | 같음 |
| upstream-coverage | PASS, unreferenced 없음, findings 0 | 같음(검사 경로만 이 폴더) |
| traceability | FAIL, missing_from_upstream_ids 23건 | 결과·목록 같음 |

traceability FAIL 23건(FR1.2·FR1.3·FR10·FR10.1·FR10.4·FR10.5·FR10.6·FR2·FR2.1·FR2.2·FR3.3·FR3.6·FR5·FR5.1·FR5.5·FR6.1·FR6.6·FR7.1·FR7.4·FR8.1·FR8.4·FR9.1·FR9.2)은 이번 변경이 만든 것이 아니며, 통과로 바꾸지 않았다. gaps·orphans·invalid entries·invalid targets는 없다. linter·type-check는 이번 설계 문서에 TS/JS 코드가 없어 해당 없음이다.

산출물 entities.md·functional-spec.md·rules.md·traceability.json과 api/docs/repository-selection.md는 94c50d93과 git diff --exit-code 빈 출력이다(BYTE-IDENTICAL-94c50d93).

## ERD YAML·관계도 대조

ruby Psych로 entities.md의 YAML 블록을 파싱했다(erd-yaml-and-mermaid-check).

- YAML 블록 1개, 업무 엔티티 10, 기술 기록 7, 관계 20이다. 기술 기록에 RepositorySelection·AllowedScopeRevision이 있다.
- 관계의 이름과 references 대상(칸 이름 포함)은 모두 해석된다.
- 관계도의 엔티티 이름은 모두 YAML에 있다.
- RepositorySelection: repositoryId(external-id, primary·unique), selectionReference(id, unique), scopeRevision(id, references AllowedScopeRevision.scopeRevision), active(boolean).
- AllowedScopeRevision: scopeRevision(id, primary·unique), allowedResourceTypes(list<enum>, COMMIT·PULL_REQUEST·ISSUE, min_items 1), wholeRepository(boolean, allowed [true]), collectionTerms(collection-terms-value).
- 새 관계: AllowedScopeRevision→RepositorySelection `1 : 0..N` via scopeRevision, AllowedScopeRevision→AnalysisConsent `0..1 : 0..N` via "scopeRevision 값 대조; FK 아님".
- 관계도: `AllowedScopeRevision ||--o{ RepositorySelection : scope_definition`, `AllowedScopeRevision |o..o{ AnalysisConsent : scope_revision_match`.
- AnalysisConsent.scopeRevision에는 references가 없어 값 대조와 맞다(analysis-consent-scope-revision).

관계도 렌더링은 실행하지 않았다.

## 요약 확인

요약 확인 질문을 엔진에 먼저 기록하고, 팀장에게 이 세션 채팅에서 평문으로 물었다(선택형 질문 도구는 쓰지 않았다). review-brief summary 출력은 10/14와 같이 쓰지 않았다. 팀장 답은 "Looks correct"이며 질문 파일의 [Answer]에 그대로 적은 뒤 log answer를 한 번 실행했다.

````text
aidlc engine log decision --stage functional-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-20-repository-selection-questions.md --decision 'Does this all look correct before I generate the artifact?' --options 'Looks correct,Request changes'
````

exit_code: 0 — `{"emitted":"DECISION_RECORDED","stage":"functional-design"}`

````text
aidlc engine log answer --stage functional-design --single --checkpoint summary-confirmation --questions-file aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/single-2026-10-20-repository-selection-questions.md --details 'Looks correct'
````

exit_code: 0 — SUMMARY_CONFIRMATION_RECORDED, summary_authorization_id b4aa3efffc5ba072d2e1e8c1769880655176bb8a0ccd9e7f69ee792d3ff80a87.

산출물은 생성하지 않았다. 이미 dev에 있는 바이트를 그대로 둔다.

## 독립 검토

독립 검토 요청을 한 번 실행해 REVIEW_REQUESTED를 받았다(u2-review-request). requestId는 review:ce06a932c5be0be7fd19bc4d2672d997, reviewFile은 `.aidlc-engine/reviews/functional-design/stage/b4360819efb17f79/1.ce06a932c5be0be7fd19bc4d2672d997.review.md`다. 요청이 돌려준 change_notices 5줄은 원문 그대로 도구 기록에 있고 사람에게 한 번 전달했다. 10/14와 같은 종류의 알림이다. 하나는 api Unit 검토 뒤 entities·functional-spec이 바뀌었다는 것이고, 넷은 산출물 4개가 이번 요약 확인 전에 저장됐다는 것이다.

별도의 aidlc-architecture-reviewer-agent 한 번이 검토했다. 단독 실행·Unit 없는 검토라 dispatch 기록 파일은 쓰지 않았다. 검토 범위는 아래로 한정했다.

- u2-api 산출물 4개
- 상류 5개(unit-of-work·story-map·requirements·components·contract-summary)
- 명시한 구현 근거 3개(api/docs/repository-selection.md, 마이그레이션 1792383899264-CreateRepositorySelection.ts, selected-repository-catalog.ts)

u1-web·u3-worker 폴더는 읽지 않도록 지시했다. 판정은 READY, 반복 1이다. 새 발견은 Minor 2건이며 둘 다 막는 사항이 아니다.

- R-01 Minor: RepositorySelection 불변 조건은 선정 참조를 "동의에 저장"한다고 적지만, AnalysisConsent에 선정 참조 칸이 없고 consentedScope 설명도 이를 밝히지 않는다. 기능 문서는 동의에 저장하는 네 칸을 명시한다.
- R-02 Minor: collectionTerms의 타입 collection-terms-value가 ERD에 정의돼 있지 않고, DB는 jsonb 객체 여부만 강제한다.

판정이 READY이므로 검토 기록 뒤 산출물을 고치지 않았다. 두 Minor는 산출물에 반영하지 않고 후속 ERD 정리 후보로 팀장에게 보고한다.

````text
aidlc engine log review --stage functional-design --reviewer aidlc-architecture-reviewer-agent --single --iteration 1 --verdict 'READY' --project-dir /Users/ljm/Desktop/github/CatchU-erd
````

exit_code: 0 — `{"emitted":"REVIEW_COMPLETED","stage":"functional-design","reviewRecord":".aidlc-engine/reviews/functional-design/stage/b4360819efb17f79/1.json","reviewMarkdown":"construction/u1-web/functional-design/reviews/review-12.md"}`

공식 JSON(u2-official-review-record)과 리뷰 원문(u2-independent-review-file)은 완료 보고 전에 도구 기록에 확보했다. 공식 JSON의 unit은 null인 단독 실행 검토이고 내용은 u2-api에 한정된다. 도구가 만든 읽기용 사본은 10/14의 review-11.md처럼 `construction/u1-web/functional-design/reviews/review-12.md`에 생겼다. 사본 본문은 공식 JSON의 body와 바이트가 같다(sha256 7511a57a2ed68cc0f3e767a8505a508ed47aac5aa192aa24f9e2d57f2f1fe38b). 이 파일을 옮기거나 고치지 않았고 u1-web 단계를 열지 않았다.

## 단독 완료

완료 보고 직전에 산출물 4개와 기능 문서가 94c50d93과 같음을 다시 확인했다(pre-report-byte-identity). 그 뒤 report --single을 한 번 실행했다.

````text
aidlc engine orchestrate report --single --stage functional-design --result completed
````

exit_code: 0 — `{"kind":"done","reason":"Single-stage run of \"functional-design\" committed under synthetic workflow \"single-stage:functional-design\". The main workflow's Current Stage is untouched."}`

감사 조각에서 single-stage:functional-design의 최신 경계는 이 폴더 조각의 STAGE_STARTED 2026-10-20T05:39:52Z와 STAGE_COMPLETED 2026-10-20T05:50:20Z다. 본 흐름의 Current Stage는 바뀌지 않았다.

## 최종 보존 대조와 커밋 대상

final-preservation-and-review-copy 결과는 다음과 같다.

- 기준선 대비 바뀐 추적 파일은 0개다. aidlc-state.md·12월 intent·기존 single-*·review*.md·verification.md·traceability.json이 모두 그대로다.
- 감사 조각 7개는 착수 원문 앞부분을 그대로 보존했고, 도구가 이 폴더 조각 뒤에만 덧붙였다.
- active-space·active-intent 커서는 그대로다.
- 미추적 파일은 아래 셋뿐이었고, 이 검증·도구 기록 두 파일이 더해진다.
  - 새 감사 조각 macui-macbookpro-local-f4e28722c4ce.md
  - 리뷰 사본 u1-web/functional-design/reviews/review-12.md
  - 질문 기록

문서 크기 검사(doc-size-check)는 exit 0, 모든 항목 통과다. 커밋 대상은 아래 다섯 파일이다. 다른 추적 파일 변경은 없다.

- 질문·검증·도구 기록 3개
- 이 폴더의 새 감사 조각 1개
- 도구가 만든 리뷰 사본 1개

다섯 파일만 스테이징한 뒤 git diff --cached --check는 exit 0, 출력 없음이었다(staged-whitespace-check). 이 결과는 이 문단과 도구 기록의 해당 항목을 더하기 전의 스테이징 상태에 대한 것이다. 두 파일을 다시 스테이징한 뒤 같은 검사를 한 번 더 실행해 통과를 확인했고, 그 결과는 커밋에 따로 기록하지 않는다.

## 한계

ERD 문서와 #346 기능 문서·마이그레이션의 대조다. 실제 DB 마이그레이션 실행, 접수(#323)·worker 연결(#232) 동작, 관계도 렌더링은 검증하지 않았다. 제품 검사는 해당 없음(코드 변경 없음)이다.
