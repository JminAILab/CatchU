# Code Generation Plan Approval

AI-DLC writes this file when it asks you to approve the plan. To answer here
instead of in chat, write your answer after `[Answer]:` and tell me in chat when you are done.

## Plan Approval

Approve the code plan for u4-privacy-policy?

- Builds: 개인정보 처리방침에 프리셋을 넣는 확정 문구 다섯 곳(C1~C5, C5 날짜 2026년 11월 30일)과 그 원문 출처·SHA-256
- Touches: `web/src/features/privacy/privacy-policy.md`·`privacy-policy.tsx`·`README.md`, `web/test/privacy-policy.test.mjs`
- Tests: 새 시험 없음. 지금 방침 시험 5건(사본 SHA-256, 화면·사본 차례·글자 대조, 더한 글·링크·강조 없음, 주소·제목, 바닥글 링크)을 새 사본에 맞춰 돌린다
- 근거: 기능 설계 `construction/u4-privacy-policy/functional-design/`(functional-spec 「확정 문구」 C1~C5, rules BR1.1~BR1.5, frontend-components), 계약 `inception/contract-design/contract-summary.md`(U4는 다른 단위와 경...
- C5의 날짜: 2026-11-20 팀장 답 「30」(이 단계 질문). C5의 새 줄은 `- 2026년 11월 30일: 처리하는 정보, 보관 기간, 하나씩 지우기에 프리셋(이름과 담은 자료 목록)을 더했습니다.`다.
- Already changed before you approved (63 files): api/scripts/rag-eval/rag-eval.cjs, api/src/ai-generation/checked-gate.ts, api/src/ai-generation/fact-check.ts, api/src/ai-generation/jd-checks.ts, api/src/ai-generation/quote-citations.ts, api/src/app.module.ts, deploy/aws/README.md, deploy/aws/cd/README.md, deploy/aws/db/idle-in-transaction.sql, deploy/aws/db/roles.sql (and 53 more).

Full plan: aidlc/spaces/default/intents/261118-publication-presets/construction/u4-privacy-policy/code-generation/code-generation-plan.md
Test instructions: aidlc/spaces/default/intents/261118-publication-presets/construction/u4-privacy-policy/code-generation/unit-test-instructions.md

[Approval Fingerprint]: sha256:v3:c65466398aed89cf9e803b13a193f1d360538b514564c0af12c0da1d0b92ee05
[Planned Source]: 1caaabf53a49de5846360aa77f66029c9ad609265d0c5e9fb92bf0ea1a238eb5

- A. Approve Plan
- B. Request Changes
- C. I'll edit the files

[Answer]: A. Approve Plan
