# Reverse Engineering Timestamp

## Run Record

- Date: 2026-11-03
- Commit: 9923226cdd9992befce3b1da8ff0d1e94ae80ba2

## 이번 실행

- intent: `261103-catch-redesign`(Catch 개편, GitHub #445)
- 방식: 기존 저장소(CURRENT)에 합치는 집중 스캔. 개발자 한 명이 스캔과 아홉 문서 작성을 함께 했다.
- 깊이: Standard
- 왜 다시 했나: 작업 브랜치에 통합 브랜치가 합쳐졌다(merge commit `9923226c`, 통합 브랜치 `a0d56760`). 앞 분석(`6cd0f160`)은 U4 #461 이전 코드였다.
- 이번에 새로 깊게 읽은 곳: 292f443d..a0d56760 가운데 Catch 작성자 설명(api `src/catches/author-description-*`·`catches.module.ts`, web `features/assets/author-description-*`, `assets-view.tsx`의 설명 편집 자리), 텍스트 자료(api `src/materials`, web `features/materials`), `api/docs/publications.md`, `api/docs/withdrawal.md`. 작성자 설명이 Catch에 묶이고 저장되는 방식, 재분석·탈퇴 때의 처리를 확인하려고 앞 분석의 `catch-asset.entity.ts`·`registration-service.ts`·`member-withdrawal-deletion.md`를 다시 읽었다.
- 앞 실행에서 가져온 것: 앞 실행(`6cd0f160`)이 깊게 읽은 45개 경로와 구성 요소, 훑은 경로는 그대로 둔다. 그 범위의 문서 내용은 고치지 않고 이어 둔다.
- 이번에 다루지 않은 것: #466(Redis 오류 감시, `api/src/common/redis-connection-errors.ts` 등)과 U4 비코드 기록(`aidlc/` 아래 설계 문서)
- 실행하지 않은 것: 프로젝트의 시험·빌드·프로그램
- 훑음에서 깊게로 옮긴 것: `web/src/features/assets/assets-view.tsx`. 앞 실행은 훑음이었고 이번에 전체를 읽었으므로 `shallow.paths`에서 빼고 `analyzed.paths`에 넣었다. `api/docs/`는 폴더 단위 훑음으로 남기고, 이번에 읽은 `publications.md`·`withdrawal.md`만 깊은 범위에 넣었다.
- 깊게 읽지 않은 곳: 아래 `shallow.paths`(훑거나 일부만 읽음). 스냅샷 밖 파일은 깊은 범위에 넣지 않았다.
- 열지 않은 곳: `node_modules/`, `.venv/`, `__pycache__/`, `.pytest_cache/`, `dist/`, `.next/`, `worker/uv.lock`, AI-DLC 설치·작업 공간

## Scope of Analysis

```yaml
scope_version: 1
kind: partial
intent: 261103-catch-redesign
fingerprint: 1ae35435dc898e213301aa075dab4bf65fd77a1a
analyzed:
  paths:
    - worker/app/candidates/build.py
    - worker/app/candidates/identity.py
    - worker/app/collection/evidence.py
    - worker/app/collection/limits.py
    - worker/app/collection/records.py
    - worker/app/contract/worker_messages.py
    - worker/app/generation/flow.py
    - worker/app/generation/limits.py
    - worker/app/generation/material.py
    - worker/app/generation/outcome.py
    - worker/app/generation/provider.py
    - worker/app/generation/render.py
    - worker/app/generation/request.py
    - worker/app/generation/title.py
    - worker/app/processing/generation.py
    - worker/app/processing/live.py
    - worker/app/processing/pipeline.py
    - worker/app/processing/request_check.py
    - worker/app/processing/result.py
    - worker/docs/candidate-text.md
    - api/src/analysis-intake/analysis-notice.ts
    - api/src/analysis-queue/analysis-request.dispatcher.ts
    - api/src/analysis-receiver/analysis-registration.service.ts
    - api/src/analysis-receiver/receiver.types.ts
    - api/src/analysis-receiver/repository-registration.port.ts
    - api/src/analysis-receiver/worker-message.validator.ts
    - api/src/result-application/registration.port.ts
    - api/src/result-application/result-application.service.ts
    - api/src/catches/new-catch-content.ts
    - api/src/catches/registration-batch.ts
    - api/src/catches/registration-service.ts
    - api/src/catches/entities/candidate-registration.entity.ts
    - api/src/catches/entities/catch-asset.entity.ts
    - api/src/catches/entities/catch-evidence.entity.ts
    - api/src/withdrawal/withdrawal.service.ts
    - api/src/ai-consent/ai-consent.gate.ts
    - api/src/worker-context/worker-context.controller.ts
    - api/src/worker-context/worker-context.service.ts
    - api/src/worker-context/worker-context.types.ts
    - api/src/publications/published-snapshot.ts
    - api/docs/member-withdrawal-deletion.md
    - web/src/features/recipient/recipient-format.ts
    - web/src/features/assets/types.ts
    - web/src/components/ai-consent/ai-consent-notice.ts
    - web/src/components/ai-consent/README.md
    - api/src/catches/author-description-input.ts
    - api/src/catches/author-description-store.ts
    - api/src/catches/author-description.controller.ts
    - api/src/catches/catches.module.ts
    - api/src/materials
    - web/src/features/assets/author-description-api.ts
    - web/src/features/assets/author-description-editor.tsx
    - web/src/features/assets/author-description-panel.tsx
    - web/src/features/assets/assets-view.tsx
    - web/src/features/materials
    - api/docs/publications.md
    - api/docs/withdrawal.md
  components:
    - worker.collection
    - worker.candidates
    - worker.generation
    - worker.processing
    - worker.contract
    - api.analysis-intake
    - api.analysis-queue
    - api.worker-context
    - api.analysis-receiver
    - api.result-application
    - api.catches
    - api.withdrawal
    - api.ai-consent
    - api.publications
    - web.recipient
    - web.ai-consent
    - api.materials
    - web.assets
    - web.materials
shallow:
  paths:
    - worker/app/candidates/grouping.py
    - worker/app/candidates/same_change.py
    - worker/app/collection/collect.py
    - worker/app/generation/claude.py
    - worker/app/generation/redact.py
    - worker/app/generation/response.py
    - worker/app/consumer/
    - worker/app/request_context/
    - worker/docs/candidate-decision.md
    - worker/docs/generation.md
    - worker/tests/
    - worker/pyproject.toml
    - worker/.env.example
    - api/contracts/repository-analysis/
    - api/src/analysis-intake/analysis-intake.service.ts
    - api/src/published-index/chunker.ts
    - api/src/catches/owner-catch-response.ts
    - api/src/catches/public-catch-store.ts
    - api/src/recipient/
    - api/docs/
    - web/src/features/recipient/recipient-screen.tsx
    - web/src/features/recipient/recipient-api.ts
    - web/src/features/recipient/recipient.module.css
    - web/src/features/assets/assets.module.css
    - .github/workflows/ci.yml
    - api/package.json
    - web/package.json
    - api/src/catches/owner-catch-input.ts
    - api/src/database/migrations/1793162230851-CreatePublicationTables.ts
    - api/src/database/migrations/1793162230852-AddCatchAuthorDescription.ts
    - api/src/app.module.ts
    - api/src/claude-mcp/mcp-material-reader.ts
    - api/src/rag-answer/summary-sources.ts
    - api/test/catches/author-description-api.test.cjs
    - api/test/materials/text-materials-api.test.cjs
    - web/src/features/assets/assets-connected.tsx
    - web/src/features/assets/assets-member-page.tsx
    - web/src/features/assets/README.md
    - web/src/lib/save-outcome.ts
    - web/src/lib/routes.ts
    - web/src/components/header/member-header.tsx
    - web/src/app/(member)/materials/page.tsx
```
