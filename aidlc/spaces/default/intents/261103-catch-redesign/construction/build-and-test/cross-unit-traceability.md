# Catch 개편 — Unit 사이 추적

출처: `aidlc engine sensor-traceability --stage build-and-test` 출력(2026-11-08)과 세 Unit의 `code-generation/traceability.json`.

## 판정

**도구 판정 fail. 빠진 ID 1개는 NFR7(문서 크기)이다.**

- 빠진 까닭은 추적 연결 쪽에 있다. 세 Unit 모두 NFR7.1을 비기능 요구사항의 `tech-stack-decisions.md`에 적었다. 그런데 비기능 설계 추적표는 그 파일의 ID를 올리지 않았다. 그래서 NFR7이 비기능 설계를 거쳐 코드까지 이어지지 않은 것으로 보인다.
- 제품 쪽으로는 지켜졌다.
  - 문서 크기 검사(`.github/scripts/check-doc-sizes.sh`)가 통과했다.
  - Unit마다 새 문서를 따로 만들었다: CR1 `worker/docs/generation-material.md`, CR3 `worker/docs/generation-judgement.md`, CR2 `worker/docs/commit-assignment.md`.
  - 큰 문서는 36,000 B 아래다. `test-results.md` 확인 표의 NFR7 행이 증거다.
- 승인된 Unit 산출물은 고치지 않고, 이 사실을 승인 관문에서 알린다.
- 같은 이유로 추적 연결에서 빠진 하위 ID도 있다: CR2의 NFR4.5(관측 요구사항)와 NFR6.4·6.5·6.6. 각각 「관측 요구사항」·「기술 선택」에 있다. 이 ID들의 상위(NFR4·NFR6)는 다른 하위 ID로 덮여 있다. 확인 표에는 각 행을 따로 두었다.

## 요구사항별

| ID | 덮임 | 맡은 Unit | 대표 대상 파일 |
|---|---|---|---|
| FR1.1~FR1.8 (소속 저장) | 예. US1.1~US1.3의 AC 11개로 | CR2 | `api/test/catches/registration-postgres.test.cjs`, `api/test/db/worker-context-api.test.cjs`, `api/test/db/member-cascade-delete.test.cjs`, `worker/tests/test_candidate_assignment.py` |
| FR2.1 (이슈로 나누지 않기) | 예(AC1.4.1·1.4.2) | CR1 | `worker/app/candidates/grouping.py` |
| FR3.1~FR3.3 (재료 순서·묶음·상한) | 예(AC3.2.1~3.2.3) | CR1 | `worker/app/generation/request.py`, `title.py`, `groups.py` |
| FR4.1~FR4.5 (판정 공급자) | 예(AC2.3.x, AC3.3.x) | CR3 | `worker/app/consumer/settings.py`, `worker/app/judgement/*.py`, `worker/app/generation/request.py` |
| FR5.1~FR5.7 (제목) | 예(AC2.1.x, AC2.3.x) | CR1·CR3 | `worker/app/candidates/record_text.py`, `worker/app/generation/flow.py`, `worker/app/generation/judged.py` |
| FR6.1~FR6.3 (작업 사실) | 예(AC2.2.x) | CR1·CR3 | `worker/app/candidates/build.py`, `worker/app/generation/judged.py` |
| FR7.1~FR7.5 (설명 초안) | 예(AC3.1.x). AC3.1.6은 N/A(검색 조각 지금 동작 유지) | CR3 | `worker/app/generation/response.py`, `judged.py`, `outcome.py`, `flow.py` |
| FR8.1~FR8.4 (화면) | 예(AC4.1.x~4.3.1, AC3.1.3) | CR1·CR3 | `web/src/features/assets/assets-view.tsx`, `web/src/features/recipient/recipient-screen.tsx`, `recipient-format.ts` |
| FR9.1·FR9.2 (고지) | 예(AC4.4.x) | CR3 | `api/src/analysis-intake/analysis-notice.ts`, `api/src/ai-consent/ai-consent.gate.ts` |
| FR10.1·FR10.2 (합치기 전 확인) | N/A(스토리로 두지 않음). CR3 코드 요약 「FR10 확인」 기록으로 추적 | CR3 | `worker/app/processing/confirm.py` |
| NFR1 (외부 AI 처리) | 예 | CR1·CR3 | CR1 NFR1.1·1.2, CR3 NFR1.1~1.6 |
| NFR2 (호출 횟수) | 예 | CR1·CR3 | CR1 NFR2.1·2.2(2.2는 N/A: CR1엔 판정 없음), CR3 NFR2.1~2.5 |
| NFR3 (판정 품질) | 예 | CR3 | NFR3.1(FR10 기준 통과) |
| NFR4 (결정성) | 예 | CR1·CR2·CR3 | CR1 NFR4.1·4.2, CR2 NFR4.1~4.4·4.6~4.12, CR3 NFR4.1 |
| NFR5 (비밀값) | 예 | CR3 | NFR5.1~5.3 |
| NFR6 (배포 호환) | 예 | CR2 | NFR6.1~6.3 |
| **NFR7 (문서 크기)** | **추적 연결 없음**(위 「판정」) | CR1·CR2·CR3 | 문서 크기 검사 통과 |

## 빠진 것

- NFR7. 추적 연결만 빠졌고 검사는 통과했다. 승인 관문에서 알린다.
