## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-11T00:52:41Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261109-new-catch/construction/nc2-snapshot-fields/code-generation/code-generation-plan.md > 「다른 작업의 파일」·「이 계획이 고치는 사람 쪽 파일」 | 계획은 "이 계획이 고치는 것 말고는 읽기만 한다"고 적었지만 실제로는 `api/scripts/rag-eval/rag-eval.cjs`(스크립트 전용 JD 지시를 운영 상수 `JD_SUMMARY_INSTRUCTION` 불러 쓰기로 교체)도 고쳤고, `jd-generation-request.ts`에 새 내보내기 `JD_SUMMARY_INSTRUCTION`이 생겼다. 둘 다 `source-manifest.json`과 `code-summary.md`의 「계획에서 벗어난 것」에는 적혀 있으나 승인된 계획 본문에는 없다. 이 변경은 intent-12(U10) 영역의 파일을 건드린다. | PR 본문에 두 변경과 사람이 지시한 날짜를 적고 U10 담당 확인을 받는다. 계획 본문을 고칠 필요는 없지만, `code-summary.md`의 PR 본문 목록에 `rag-eval.cjs`가 U10 확인 대상이라는 말이 이미 있으므로 PR에서 빠뜨리지 않는다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261109-new-catch/construction/nc2-snapshot-fields/code-generation/code-summary.md > intent 검증 명령 | `rag-eval.cjs` 변경이 전체 검증 명령(api·web·worker) 뒤에 이루어져, 그 뒤에는 `rag-eval.test.cjs` 8개만 다시 돌렸다. 또 api 건너뜀 37개·worker 12개의 출처를 확인하지 않았다고 적혀 있다. 이 리뷰에서 `rag-eval.test.cjs` 8/8 통과와 api `tsc --noEmit` 오류 없음을 확인했으므로 막을 일은 아니다. | 병합 전 통합 확인이나 CI에서 api 전체 시험이 한 번 더 도는지 확인하고, 건너뜀 개수가 이 Unit 이전과 같은지만 PR에서 한 줄로 밝힌다. | New |
| R-03 | Minor | api/src/publications/publish.service.ts > `readEvidence`·`COMMIT_ASSIGNMENT_SQL` | `commit_sha = ANY($3::char(40)[])`는 근거 식별값을 소문자로만 만들어 보내므로(`commitShaOf`) DB 검사(`^[0-9a-f]{40}$`)와 맞고, 근거 소유자/저장소 이름과 등록 이름을 다시 견주지 않는다는 점이 `code-summary.md`에 결정으로 적혀 있다. 소속 기록의 저장소 ID·Catch ID·회원이 모두 맞아야 참이라 판정이 막히지는 않지만, 근거 URL의 저장소 이름이 소속 기록의 저장소와 다른 근거(이론상 worker가 만들 수 없음)는 걸러지지 않는다. | 지금 조치는 필요 없다. README 한계 목록에 "근거 URL의 저장소 이름은 판정에 쓰지 않는다"가 이미 있는지 확인하고, 없으면 한 줄 더한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| api Unit 시험(발행·로그·한계 문장·조각·요약 근거·질의응답·기본 요약·JD, 시험 DB 5433) | tests 75, pass 75, fail 0 | 계획 Step 4~6의 시험이 모두 실제 DB로 통과한다. 소속 기록의 다른 저장소·다른 Catch·다른 회원 거짓 갈래와 안전망 경고(롤백 시 없음)가 포함된다. |
| web Unit 시험(github-link-name·publications-owner·recipient·publish) | tests 118, pass 118, fail 0 | 표지 판정·그리기·사본 칸 검사가 통과한다. |
| `aidlc engine sensor-traceability` | `{"pass":true,"gaps":[],"orphans":[],...,"findings_count":0}` | 추적성 틈 없음. |
| 추가: `api/test/rag-answer/rag-eval.test.cjs` | 8/8 통과 | 사람이 요청한 rag-eval 변경이 기존 시험을 깨지 않는다. |
| 추가: api `tsc --noEmit` | 출력 없음(오류 없음) | 새 내보내기·인터페이스 변경 형 일관. |

### Summary

사본 선택 칸 넷, 소속 기록 기반 본인 커밋 판정(저장소 ID까지 닫음), 한계 문장 대조 시험과 안전망 경고, 지시 문장, 표지 판정·그리기가 기능·NFR 설계대로 구현되었고 Unit 시험·추적성이 모두 통과한다. 남은 것은 U10 영역 변경의 PR 확인과 건너뜀 시험 출처 같은 Minor뿐이라 READY다.
