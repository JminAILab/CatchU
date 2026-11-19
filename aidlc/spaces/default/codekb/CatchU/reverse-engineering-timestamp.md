# Reverse Engineering Timestamp

## Run Record

- Date: 2026-11-19
- Commit: aa241a4c629bb90ca2ccd729df7b0917275e8f02

## 이번 실행

- intent: `261118-publication-presets`(#597 발행본을 프리셋 여러 개로 만들고 받은 사람·작성자 발행본 화면에서 탭으로 나눠 보이기, 범위 mvp)
- 방식: 집중 스캔 + 앞 저장소에 합치기. 앞 저장소(`261116-recipient-qa-fix`가 2026-11-16 커밋 `eb0d5a6c`에서 만든 `kind: partial`)는 그 뒤 깊게 읽은 경로의 코드가 바뀌어 낡은 것(STALE)으로 판정됐다. 그래서 이번에 다시 읽은 자리의 글만 고쳐 쓰거나 더했고, 그 밖의 글은 앞 저장소 글을 그대로 두었다. 그대로 둔 글은 2026-11-09·11-16 기준이며 이번에 다시 확인하지 않았다.
- 깊이: Standard. 개발자 한 명이 스캔과 아홉 문서 작성을 함께 했다(협업자 꺼짐).
- 깊게 읽은 곳: 아래 `analyzed.paths`(개발자 스캔 기록 `inception/reverse-engineering/developer-scan.md` 「Analyzed deeply」). 앞 저장소에서 깊게 읽었던 `api/src/published-index/`·`api/src/rag-answer/`는 이번에 다시 깊게 읽어 `analyzed.paths`에 두었다.
- 훑은 곳: 이번 집중 범위에서 일부만 읽은 폴더와 파일, 앞 저장소에서 깊게 읽었으나 이번에 다시 확인하지 못한 `api/src/ai-generation/`·`web/src/features/rag-answer/`(폴더 나머지)를 내린 것, 앞 저장소의 훑은 곳(`./` 포함).
- 열지 않은 곳: `api/dist/`, `node_modules/`, `.next/`, `coverage/`, AI-DLC 설치와 작업 공간(`.claude/`, `.codex/`, `.agents/`, `aidlc/`. 계약 원본 `contract-summary.md`도 그 안이라 열지 않음), 집중 범위 밖의 `worker/`·`deploy/`·`.github/`.
- 실행하지 않은 것: 프로젝트의 시험·빌드·프로그램.

## Scope of Analysis

```yaml
scope_version: 1
kind: partial
intent: 261118-publication-presets
fingerprint: 16dfd124e0d9ea62ed159f2015ecbe163dfd05cd
analyzed:
  paths:
    - api/src/publications/
    - api/src/published-index/
    - api/src/rag-answer/
    - api/src/claude-mcp/mcp-shared-publication-reader.ts
    - api/src/claude-mcp/mcp-shared-page.ts
    - api/src/claude-mcp/mcp-shared-text.ts
    - api/src/jd-summary/jd-summary-processor.ts
    - api/src/jd-summary/jd-generation-request.ts
    - api/src/catches/owner-catch-input.ts
    - api/src/catches/owner-catch-store.ts
    - api/src/catches/catch-reader.ts
    - api/src/catches/owner-catches.controller.ts
    - api/src/materials/text-material-store.ts
    - api/src/materials/text-materials.controller.ts
    - api/src/withdrawal/withdrawal.service.ts
    - api/src/database/migrations/1793162230851-CreatePublicationTables.ts
    - api/src/database/migrations/1794378756644-AddCatchRevisitFacts.ts
    - web/src/features/publications/publish-screen.tsx
    - web/src/features/publications/publish-sources.ts
    - web/src/features/publications/publish-view.tsx
    - web/src/features/publications/publications-api.ts
    - web/src/features/publications/snapshot-view.tsx
    - web/src/features/publications/publication-detail-screen.tsx
    - web/src/features/publications/publication-detail-view.tsx
    - web/src/features/recipient/recipient-view.tsx
    - web/src/features/recipient/recipient-screen.tsx
    - web/src/features/recipient/recipient-slots.ts
    - web/src/features/recipient/recipient-api.ts
    - web/src/features/recipient-claude/recipient-claude-text.ts
    - web/src/features/rag-answer/item-title.ts
    - web/src/features/rag-answer/gated-item-view.tsx
    - web/src/features/rag-answer/qna-panel.tsx
    - web/src/features/rag-answer/rag-answer-messages.ts
    - web/src/features/materials/materials-view.tsx
    - web/src/features/privacy/README.md
    - web/src/features/withdrawal/withdrawal.ts
    - web/src/components/header/member-header.tsx
  components:
    - api.publications
    - api.published-index
    - api.rag-answer
    - api.claude-mcp
    - api.jd-summary
    - api.catches
    - api.materials
    - api.withdrawal
    - api.database
    - web.publications
    - web.recipient
    - web.recipient-claude
    - web.rag-answer
    - web.materials
    - web.privacy
shallow:
  # api/src/ai-generation/ 과 web/src/features/rag-answer/ 는 앞 저장소(261116-recipient-qa-fix, 2026-11-16)의 analyzed.paths를 내린 것이다.
  # ./ 는 그 앞 저장소(261109-new-catch, 2026-11-09)의 analyzed.paths를 내린 것이다. 둘 다 이번에 다시 확인하지 않았다.
  paths:
    - ./
    - api/src/ai-generation/
    - web/src/features/rag-answer/
    - api/src/claude-mcp/
    - api/src/jd-summary/
    - api/src/catches/
    - api/src/materials/
    - api/src/withdrawal/
    - api/src/database/migrations/
    - api/src/database/database.config.ts
    - api/src/app.module.ts
    - web/src/features/publications/
    - web/src/features/recipient/
    - web/src/features/recipient-claude/
    - web/src/features/materials/
    - web/src/features/privacy/
    - web/src/features/withdrawal/
    - web/src/features/jd/
    - web/src/components/header/
    - web/src/lib/routes.ts
    - api/docs/published-index.md
    - api/docs/rag-answer.md
    - api/docs/ai-generation.md
    - api/docs/rag-evaluation/
    - api/test/published-index/
    - api/test/ai-generation/
    - api/test/rag-answer/
    - api/test/publications/
    - api/test/claude-mcp/
    - api/test/u2/
    - api/src/ai-consent/
    - api/src/ai-run/
    - api/src/analysis-deadline/
    - api/src/auth/
    - api/src/common/
    - api/src/daily-run-limit/
    - api/src/file-storage/
    - api/src/github-connection/
    - api/src/google-login/
    - api/src/member-analysis/
    - api/src/member-profile/
    - api/src/member-repositories/
    - api/src/share-links/
    - api/contracts/repository-analysis/common.yaml
    - api/docs/
    - api/scripts/
    - api/test/
    - worker/app/collection/
    - worker/app/consumer/
    - worker/app/contract/
    - worker/app/judgement/
    - worker/app/request_context/
    - worker/app/redact.py
    - worker/docs/
    - worker/tests/
    - worker/fixtures/
    - web/src/app/
    - web/src/components/
    - web/src/lib/
    - web/src/features/
    - web/test/
    - web/scripts/
    - deploy/
    - .github/
    - docs/
    - scripts/
```
