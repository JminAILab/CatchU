# Reverse Engineering Timestamp

## Run Record

- Date: 2026-11-16
- Commit: eb0d5a6cf1aa236ef8520946ea66a87c1c632a37

## 이번 실행

- intent: `261116-recipient-qa-fix`(#559 받은 사람 질의응답이 틀리게 답한 자리 고치기, 범위 bugfix)
- 방식: 집중 스캔 + 앞 저장소에 합치기. 앞 저장소(`261109-new-catch`가 2026-11-09 커밋 `a1d0fbb4`에서 만든 `kind: full`)는 그 뒤 코드가 바뀌어 낡은 것(STALE)으로 판정됐다. 그래서 이번에 다시 읽은 네 폴더의 내용만 고쳐 쓰거나 더했고, 그 밖의 글은 앞 저장소 글을 그대로 두었다. 그대로 둔 글은 2026-11-09 기준이며 이번에 다시 확인하지 않았다.
- 깊이: Minimal. 개발자 한 명이 스캔과 아홉 문서 작성을 함께 했다(협업자 꺼짐).
- 깊게 읽은 곳: 아래 `analyzed.paths` 네 폴더(개발자 스캔 기록 `inception/reverse-engineering/developer-scan.md` 「Analyzed deeply」).
- 훑은 곳: 이번에 훑은 이웃(받은 사람·작성자 발행본 화면이 패널을 다는 곳, JD 요약의 검색·요청, 사본 칸 이름, 관련 `api/docs`·시험 이름)과, 앞 저장소에서 깊게 읽었으나 이번에 다시 확인하지 못한 저장소 전체(`./`, 앞 `analyzed.paths`를 내린 것), 앞 저장소의 훑은 곳. `api/src/ai-generation/`은 앞 저장소에서 훑은 곳이었고 이번에 깊게 읽어 `shallow.paths`에서 뺐다.
- 열지 않은 곳: `api/dist/`, `node_modules/`, `.next/`, AI-DLC 설치와 작업 공간(`.claude/`, `.codex/`, `.agents/`, `aidlc/`. 계약 원본 `contract-summary.md`도 그 안이라 열지 않음).
- 실행하지 않은 것: 프로젝트의 시험·빌드·프로그램.

## Scope of Analysis

```yaml
scope_version: 1
kind: partial
intent: 261116-recipient-qa-fix
fingerprint: 88e8e6e4b9a9ac2c13af49ea3ccf7a798b783675
analyzed:
  paths:
    - api/src/published-index/
    - api/src/ai-generation/
    - api/src/rag-answer/
    - web/src/features/rag-answer/
  components:
    - api.published-index
    - api.ai-generation
    - api.rag-answer
    - web.rag-answer
shallow:
  # ./ 는 앞 저장소(261109-new-catch, 2026-11-09)의 analyzed.paths를 내린 것이다. 이번에 다시 확인하지 않았다.
  paths:
    - ./
    - api/src/jd-summary/
    - api/src/publications/published-snapshot.ts
    - web/src/features/recipient/
    - web/src/features/publications/
    - web/src/features/jd/
    - api/docs/published-index.md
    - api/docs/rag-answer.md
    - api/docs/ai-generation.md
    - api/docs/rag-evaluation/
    - api/test/published-index/
    - api/test/ai-generation/
    - api/test/rag-answer/
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
    - api/src/materials/
    - api/src/member-analysis/
    - api/src/member-profile/
    - api/src/member-repositories/
    - api/src/share-links/
    - api/src/withdrawal/
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
