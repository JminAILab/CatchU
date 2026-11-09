# Reverse Engineering Timestamp

## Run Record

- Date: 2026-11-09
- Commit: a1d0fbb4ef70f57e690823ae8aa13fdd2df9eeff

## 이번 실행

- intent: `261109-new-catch`(새 Catch)
- 방식: 전체 다시 스캔. 앞 저장소(`261103-catch-redesign`이 만든 `kind: partial` 저장소)는 낡은 것으로 보고 아홉 문서를 모두 이번 실행 내용으로 바꿨다. 앞 문서는 방향을 잡는 데만 읽었고, 적은 내용은 모두 지금 코드에서 다시 확인했다.
- 깊이: Standard. 개발자 한 명이 스캔과 아홉 문서 작성을 함께 했다(협업자 꺼짐).
- 왜 다시 했나: 작업 브랜치에 통합 브랜치가 다시 합쳐졌다(merge commit `a1d0fbb4`). Catch 개편 CR1~CR3, #487·#488, U4 제출 2·3, U5·U6·U3, CR2 소속 기록(`commit_assignment`)이 들어와 앞 저장소의 코드 기준(`9923226c`)과 크게 달라졌다.
- 깊게 읽은 곳: 개발자 스캔 기록(`inception/reverse-engineering/developer-scan.md`) 「Analyzed deeply」. 중심은 api의 `catches`·`publications`·사본을 읽는 곳(`published-index` 조각 나누기, `rag-answer` 요약 근거, `claude-mcp` 자료 읽기), worker의 수집 기록·근거·기록의 글·작업 사실 규칙·파일 종류 분류, web의 내 자산·발행·사본·받은 사람 화면, 계약 YAML, 앱 조립, 마이그레이션 표 목록이다.
- 훑은 곳: 아래 `shallow.paths`. 파일 목록·머리 설명·데코레이터·내보낸 이름까지 보았고 본문 전체를 읽지는 않았다. `kind: full`과 `./`는 이번 실행이 저장소 전체를 대상으로 했고 모든 폴더를 열어 분류했다는 뜻이며, 훑은 곳의 세부 동작은 해당 기능을 고칠 때 다시 읽어야 한다.
- 훑은 폴더 가운데 아래 다섯은 안에 깊게 읽은 파일이 있다. 이 폴더들은 **깊게 읽은 파일을 뺀 나머지만** 훑었다(깊게 읽은 파일은 개발자 스캔 기록 「Analyzed deeply」에서 옮겼다).
  - `api/docs/`: `environment.md` 밖
  - `worker/app/collection/`: `records.py`·`evidence.py` 밖
  - `web/src/lib/`: `routes.ts`·`github-source-url.ts` 밖
  - `web/src/features/`: `assets/`의 `assets-view.tsx`·`types.ts`·`catch-api.ts`·`author-description-panel.tsx`, `publications/`의 `snapshot-view.tsx`·`publish-sources.ts`·`publish-view.tsx`(앞 150줄까지), `recipient/`의 `recipient-view.tsx`·`recipient-api.ts`(사본 칸 고르기) 밖
  - `docs/`: `ai-dlc-input-catch/CatchU_새_Catch_입력.md` §4~§9 밖
- 열지 않은 곳: `node_modules/`, `.venv/`, `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `dist/`, `.next/`, `coverage/`, 잠금 파일(`package-lock.json`, `uv.lock`), 이진 파일(글꼴·이미지), `.local-handoffs/`, `handoff/`, AI-DLC 설치와 작업 공간(`.claude/`, `.codex/`, `.agents/`, `aidlc/`, `aidlc.settings.local.json`, `AGENTS.md`·`.gitignore`의 AI-DLC 관리 블록, `.mcp.json`의 AI-DLC MCP 서버).
- 실행하지 않은 것: 프로젝트의 시험·빌드·프로그램.

## Scope of Analysis

```yaml
scope_version: 1
kind: full
intent: 261109-new-catch
fingerprint: 55a5f12ff84d8a743e20e9189f7bd2c07c68a4ae
analyzed:
  paths:
    - ./
  components:
    - worker.collection
    - worker.candidates
    - worker.generation
    - worker.judgement
    - worker.processing
    - worker.contract
    - worker.consumer
    - worker.request_context
    - worker.redact
    - api.common
    - api.auth
    - api.database
    - api.member-analysis
    - api.member-profile
    - api.google-login
    - api.github-connection
    - api.member-repositories
    - api.analysis-intake
    - api.analysis-queue
    - api.analysis-receiver
    - api.result-application
    - api.analysis-deadline
    - api.worker-context
    - api.catches
    - api.materials
    - api.publications
    - api.share-links
    - api.published-index
    - api.rag-answer
    - api.ai-generation
    - api.ai-run
    - api.ai-consent
    - api.daily-run-limit
    - api.file-storage
    - api.withdrawal
    - api.claude-mcp
    - api.health
    - contract.repository-analysis
    - web.app-routes
    - web.lib
    - web.components
    - web.assets
    - web.publications
    - web.recipient
    - web.rag-answer
    - web.materials
    - web.repository-management
    - web.member-account
    - deploy.images-compose
    - deploy.dev-server
    - deploy.aws
    - ci.github-actions
    - docs.team
    - tools.queue-verification
shallow:
  # 「깊게 읽은 파일 밖」이라고 적은 폴더는 그 파일을 뺀 나머지만 훑었다(위 「이번 실행」).
  paths:
    - api/src/ai-consent/
    - api/src/ai-generation/
    - api/src/ai-run/
    - api/src/analysis-deadline/
    - api/src/auth/
    - api/src/common/
    - api/src/daily-run-limit/
    - api/src/file-storage/
    - api/src/github-connection/
    - api/src/google-login/
    - api/src/materials/
    - api/src/member-analysis/
    - api/src/member-profile/
    - api/src/member-repositories/
    - api/src/share-links/
    - api/src/withdrawal/
    - api/contracts/repository-analysis/common.yaml
    - api/docs/  # environment.md 밖
    - api/scripts/
    - api/test/
    - worker/app/collection/  # records.py·evidence.py 밖
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
    - web/src/lib/  # routes.ts·github-source-url.ts 밖
    - web/src/features/  # assets·publications·recipient의 깊게 읽은 파일 밖
    - web/test/
    - web/scripts/
    - deploy/
    - .github/
    - docs/  # ai-dlc-input-catch/CatchU_새_Catch_입력.md §4~§9 밖
    - scripts/
```
