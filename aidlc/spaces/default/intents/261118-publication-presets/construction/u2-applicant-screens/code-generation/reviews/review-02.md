## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-21T06:17:49Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261118-publication-presets/construction/u2-applicant-screens/code-generation/code-summary.md > 이 단계에서 돌리지 않은 시험 / web/src/features/presets/preset-editor-screen.tsx > save() 첫 저장 뒤 deps.replaceUrl | 첫 저장 뒤 `window.history.replaceState`가 Next 16에서 화면을 다시 만들지 않는다는 점(NFR 설계 Q1 A의 핵심 전제)은 서버 렌더링 시험이 마운트 효과를 돌리지 않아 코드 생성 단계에서 확인되지 않았다. 시험은 `replaceUrl` 의존성을 가짜로 바꿔 PUT 전환만 증명한다. 모델 상태가 `useState`에 있어 화면이 다시 만들어지면 입력이 사라질 수 있다. | Build and Test에서 브라우저로 새 프리셋 저장 후 이름·담은 자료가 그대로 남고 다음 저장이 PUT인지, 새로고침·뒤로가기도 정상인지 확인하고 결과를 기록한다. | Accepted risk |
| R-02 | Minor | web/test/presets.test.mjs > NFR4.1 프리셋 화면 파일은 console을 부르지 않는다 | NFR4.1 기계 확인이 `features/presets/`만 훑는다. 이 단위가 고친 `features/publications/`·`lib/api-response.ts`·`features/assets/catch-api.ts`·api 두 파일은 시험으로 묶이지 않았다. 이번 검토에서 직접 grep으로 `console.`·`Logger` 0건을 확인했으나 이후 변경에서 되살아날 수 있다. | 이름·제목·ID가 오가는 `features/publications/`까지 같은 검사를 넓히거나, 범위를 의도했다면 시험 이름에 그 범위를 적는다. | Accepted risk |
| R-03 | Minor | web/src/features/publications/publications-api.ts > PDF_EXTRACTION_INCOMPLETE_TEXT, 코드 요약 계획과 다른 점 4·5 | 발행 화면 문구에서 「PDF 목록을 다시 불러온 뒤…」와 「발행본 전체 글이 상한을 넘었을 수도 있습니다」를 뺀 것은 근거(발행 화면에 PDF 목록이 없어짐, 400 `presetIds`로 따로 안내)가 있고 시험도 있으나, 승인된 기능 설계 문구와의 차이가 설계 쪽에는 기록되지 않았다. | Build and Test 기록에 이 문구 차이를 한 줄 남겨 사람이 승인 때 보게 한다(코드 변경 불필요). | Accepted risk |
| R-04 | Minor | web/src/features/presets/preset-editor-screen.tsx > `loadDetail()` 실패 분기 및 web/src/features/presets/preset-editor-view.tsx > `state.load === "error"` 분기 | 첫 저장(201) 뒤 옮긴 화면에서 상세를 불러오지 못하면 `load`가 `error`가 되어 「프리셋을 불러오지 못했습니다.」와 [다시 불러오기]만 보인다. 이미 저장됐다는 사실(「저장했습니다.」)은 화면에 없고, 기능 설계 저장 표 4항의 「저장했습니다. 내용을 다시 불러오지 못했습니다.」와 다르다. 저장 자체는 성공했고 [다시 불러오기]로 복구되며 이름·자료가 화면에 없어 다시 저장할 수도 없어 중복 생성은 일어나지 않는다. 코드 요약이 이미 한계로 적었다. | 승인 전에 고치지 않아도 된다. 다만 사람이 한계로 받아들이는지 승인 때 확인하고, 받아들이면 PR 본문 한계에 한 줄 더한다. 고치려면 `error` 분기에서 넘겨받은 저장 표시가 있을 때만 저장 안내 문장을 함께 보인다. | New |
| R-05 | Minor | web/src/features/presets/preset-editor-view.tsx > 불러오는 중 `<p role="status">`와 편집 상태 칸 `data-testid="preset-editor-status"` | 옮긴 화면은 상세가 올 때까지 다른 `role="status"` 요소(불러오는 중)를 그리다가, 상세가 오면 이미 「저장했습니다.」가 든 새 `role="status"` 칸이 생긴다. 이미 글이 든 채 생긴 칸은 화면 낭독기가 읽지 않을 수 있어 NFR 설계 §5(늘 그려 둔 칸의 글 바꿈)와 어긋날 수 있다. 다만 옮긴 화면은 경로 전환으로 통째로 새로 그려지므로 칸을 미리 두는 것과 효과 차이가 작고, 기능 오류가 아니다. | 지금 고칠 필요는 없다. 팀장 브라우저 확인(Build and Test)에서 낭독이 되는지 보고, 안 읽히면 불러오는 중에도 같은 상태 칸을 늘 그려 두고 상세가 온 뒤 글을 넣는다. | New |
| R-06 | Minor | web/src/features/presets/preset-editor-screen.tsx > `createSavedNoticeHandOff` | 첫 저장 뒤 `leave(id)`만 하고 이동이 일어나지 않으면(이동 전에 다른 화면으로 감) 표시가 메모리에 남아, 편집 화면을 다시 열 때까지 다른 화면(편집이 아닌 화면)을 거쳐 같은 ID 화면을 처음 열 때 「저장했습니다.」가 한 번 늦게 보일 수 있다. 어느 편집 화면이든 열 때 지워지므로 한 번뿐이고 시험(다른 ID·새 화면 거친 뒤)이 그 한계를 확인한다. | 받아들여도 된다. 코드 요약에 이미 적힌 한계로 두면 된다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| `(cd web && node --test test/presets.test.mjs test/publish.test.mjs test/api-response.test.mjs)` | 62건 통과, 0건 실패 | 코드 요약의 62건과 같다. 새 시험(Q1 B 셋, open-dispose-open, 마지막 dispose 뒤 결과 버림)이 포함된다. |

### Summary

① 첫 저장 뒤 `dirty: false`를 먼저 만든 다음 `leave(id)` → 라우터 `replace`로 옮기고, 옮긴 화면은 새 모델이 같은 ID로 상세를 불러 고치기(PUT) 상태로 그리므로 두 번째 POST와 빈 화면은 막힌다(소스에 `replaceState(`이 없음을 시험이 확인하고 두 번째 저장이 PUT임을 시험이 확인). ② `open()`의 `disposed = false`는 Strict Mode 순서(open, dispose, open)를 되살리고, 마지막 `dispose()` 뒤 결과는 여전히 버려진다(첫 저장이면 이동·표시 남김도 없음). 표시는 `take`가 모델 생성 때가 아니라 `open()`에서 꺼내므로 Strict Mode 이중 초기화·이중 효과에서도 한 번만 꺼내져 남고, 새로 고침·다른 ID에서는 보이지 않는다. 남은 우려 셋(상세 실패 문구, 낭독 칸, 이동 전 이탈의 늦은 표시)은 모두 Minor라 승인 전에 고쳐야 할 것은 없다.
