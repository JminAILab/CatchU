# Cross-Unit Traceability — 261118-publication-presets

근거: `aidlc engine sensor-traceability --stage build-and-test` 출력(2026-11-20), 네 단위 `code-generation/traceability.json`.

**판정: 통과**. 빠진 ID 0개(`"pass":true`, `"uncovered":[]`).

## 요구사항

| ID | 덮는 수락 기준·NFR | 맡은 단위 |
|---|---|---|
| FR1.1~FR1.14(프리셋 관리) | AC1.1.x~AC1.6.x | u1-preset-contract(api), u2-applicant-screens(web) |
| FR2.1~FR2.11(프리셋으로 발행) | AC2.1.x~AC2.5.x | u1(api), u2(web 발행 화면), u3(AC2.3.1 탭) |
| FR3.1~FR3.7(받은 사람·작성자 탭, 출처 이동) | AC3.1.x~AC3.5.x | u3(web), u1(AC3.1.4·AC3.3.2·AC3.3.3 api) |
| FR4.1~FR4.3(삭제·탈퇴·방침) | AC4.1.x~AC4.3.x | u1(api 연쇄 삭제), u3(확인 문장), u4(방침) |
| FR5.1 | AC3.1.x | u3 |
| FR6.1~FR6.3(받은 링크 읽기·질의응답) | AC2.1.x, AC3.6.x, AC3.3.x | u1 |
| FR7.1(자료 화면 탭) | AC4.4.1·AC4.4.2 | u3 |
| NFR1(접근성) | u2 NFR1.1, u3 NFR1.1·NFR1.2 | u2, u3 |
| NFR2(권한·원자성·오류) | u1 NFR2.1~2.15, u2 NFR2.1~2.4 | u1, u2 |
| NFR3(이름은 글자로) | u1 NFR3.1, u2 NFR3.1·3.2, u3 NFR3.1·3.2 | u1, u2, u3 |
| NFR4(자료 보호·로그) | u1 NFR4.1~4.4, u2 NFR4.1~4.3, u3 NFR4.1~4.3 | u1, u2, u3 |
| NFR5(늦음·실패 표시, 탭 요청 없음) | u2 NFR5.1·5.2, u3 NFR5.1~5.5 | u2, u3 |
| NFR6(요청·조회 수, 상한) | u1 NFR6.1~6.7, u2 NFR6.1~6.6 | u1, u2 |

## 수락 기준별 만든 곳

| 수락 기준 | 단위: 파일 |
|---|---|
| AC1.1.1·AC1.1.2 | u2: `web/src/components/header/member-header.tsx` |
| AC1.1.3 | u1: `api/test/presets/presets-api.test.cjs`, u2: `web/src/features/presets/presets-list-view.tsx` |
| AC1.1.4·AC1.1.5 | u2: `web/src/features/presets/presets-list-view.tsx` |
| AC1.2.1·AC1.2.4 | u1: `api/test/presets/presets-api.test.cjs`, u2: `web/src/features/presets/preset-editor-screen.tsx` |
| AC1.2.2 | u2: `api/src/catches/owner-catch-store.ts` |
| AC1.2.3 | u1: `api/test/presets/preset-input.test.cjs`, u2: `preset-editor-screen.tsx` |
| AC1.2.5 | u1: `presets-api.test.cjs`, u2: `web/src/features/presets/presets-api.ts` |
| AC1.2.6·AC1.6.4 | u2: `web/test/presets.test.mjs` |
| AC1.2.7·AC1.3.3·AC1.4.5·AC1.5.2 | u2: `preset-editor-screen.tsx` |
| AC1.2.8·AC1.4.4 | u1: `presets-api.test.cjs` |
| AC1.3.1 | u1: `presets-api.test.cjs`, u2: `web/src/features/publications/pick-parts.tsx` |
| AC1.3.2 | u2: `pick-parts.tsx` |
| AC1.4.1·AC1.4.3·AC1.5.1 | u1: `presets-api.test.cjs`, u2: `preset-editor-screen.tsx` |
| AC1.4.2 | u2: `web/src/features/presets/preset-editor-view.tsx` |
| AC1.5.3 | u1: `api/test/publications/publish-presets.test.cjs` |
| AC1.6.1~AC1.6.3 | u1: `presets-api.test.cjs`, u2: `preset-editor-view.tsx` |
| AC2.1.1·AC2.4.1 | u1: `publish-presets.test.cjs`, u2: `web/src/features/publications/publish-screen.tsx` |
| AC2.1.2·AC2.2.4·AC2.2.5 | u2: `web/src/features/publications/publish-view.tsx` |
| AC2.1.3 | u1: `api/test/publications/publish-api.test.cjs`, u2: `publish-view.tsx` |
| AC2.1.4·AC2.3.2·AC2.4.2·AC2.5.1·AC2.5.2 | u1: `publish-presets.test.cjs` |
| AC2.2.1·AC2.2.2·AC2.4.3 | u1: `publish-presets.test.cjs`, u2: `publish-view.tsx` |
| AC2.2.3 | u1: `presets-api.test.cjs`, u2: `publish-view.tsx` |
| AC2.3.1 | u1: `publish-presets.test.cjs`, u3: `web/src/features/publications/snapshot-view.tsx` |
| AC3.1.1·AC3.3.1 | u3: `web/src/features/recipient/recipient-view.tsx` |
| AC3.1.2 | u3: `snapshot-view.tsx` |
| AC3.1.3·AC3.2.1~AC3.2.3 | u3: `web/src/components/tab-strip/tab-strip.tsx` |
| AC3.1.4 | u1: `api/test/db/publication-tables.test.cjs` |
| AC3.3.2 | u1: `api/test/rag-answer/qna-sources.test.cjs` |
| AC3.3.3 | u1: `api/test/rag-answer/summary-sources.test.cjs`, u3: `recipient-view.tsx` |
| AC3.4.1 | u3: `web/src/features/publications/snapshot-jump.ts` |
| AC3.4.2~AC3.4.4 | N/A — [답으로 돌아가기]는 2026-11-19 팀장 결정으로 만들지 않음(다듬은 화면) |
| AC3.5.1·AC3.5.2 | u3: `publication-detail-view.tsx`·`publication-detail-screen.tsx` |
| AC3.6.1 | u1: `api/test/claude-mcp/mcp-shared-text.test.cjs` |
| AC3.6.2 | N/A — 도메인 설계 Q9가 대신함(겹친 사본은 앞선 것만, BR4.4) |
| AC4.1.1 | u3: `web/src/features/materials/materials-screen.tsx` |
| AC4.1.2·AC4.1.3·AC4.2.1 | u1: `api/test/integration/preset-publish-chain.test.cjs` |
| AC4.1.4 | u1: `api/test/db/member-cascade-delete.test.cjs`, u3: `web/src/features/materials/pdf-materials-api.ts` |
| AC4.2.2 | N/A — 탈퇴 화면은 바뀌지 않음(FR4.2) |
| AC4.3.1·AC4.3.2 | u4: `web/src/features/privacy/privacy-policy.tsx` |
| AC4.4.1 | u3: `materials-screen.tsx` |
| AC4.4.2 | u3: `web/test/materials-screen.test.mjs` |

## N/A로 둔 NFR

| ID | 이유 |
|---|---|
| u1 NFR2.9 | 설계 결정(검토 R-08): 같은 프리셋 동시 저장의 500을 받아들이고 시험하지 않음 |
| u1 NFR6.7 | 설계 결정: 새 배포 단위·외부 자원·캐시를 두지 않음(지금 api와 PostgreSQL만) |

## 빠진 것

없음.
