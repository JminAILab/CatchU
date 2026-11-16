# 요구사항 추적 최종 확인 — #559

이 일은 Unit이 없는 bugfix다. 코드 생성 단계 하나가 모든 요구를 맡았다. `aidlc engine sensor-traceability --stage build-and-test`의 출력을 바탕으로 적었다.

## 판정

**통과(빌드와 시험 단계에서 채운 둘 포함).**
- 도구 출력은 `pass: false`다. 덮이지 않은 ID가 `FR3.3`·`NFR1` 둘이기 때문이다.
- 이 둘은 코드 생성 단계에서 「빌드와 시험 단계에서 지킨다」로 미뤄 둔(`Deferred`) 요구다. 이 단계에서 아래 근거로 채웠다.
- 덮이지 않은 요구는 남지 않는다.
- 다만 NFR1의 완료 기준 가운데 (a)·(b)·(e)는 못 채운 채 한계로 남았다(아래 「NFR1」 행).

## ID별 대조

| ID | 맡은 단계 | 대상 파일·근거 | 상태 |
|---|---|---|---|
| FR1.1 | 코드 생성 | `api/src/rag-answer/qna-sources.ts` | 만듦 |
| FR1.2 | 코드 생성 | `api/src/rag-answer/qna-sources.ts` | 만듦 |
| FR1.3 | 코드 생성 | `api/src/rag-answer/rag-answer-config.ts` | 만듦 |
| FR1.4 | 코드 생성 | `api/test/rag-answer/qna-sources.test.cjs` | 만듦 |
| FR1.5 | 코드 생성 | `api/test/rag-answer/qna-sources.test.cjs` | 만듦 |
| FR1.6 | 코드 생성 | `api/src/rag-answer/rag-answer-log.ts` | 만듦 |
| FR1.7 | 코드 생성 | `api/src/rag-answer/qna-service.ts` | 만듦 |
| FR2.1 | 코드 생성 | `api/src/ai-generation/citation-request.ts` | 만듦 |
| FR2.2 | 코드 생성 | `api/src/rag-answer/qna-sources.ts` | 만듦(순번 대신 한글 표 글자, 코드 계획 변경 요청 1번) |
| FR2.4 | 코드 생성 | `api/src/rag-answer/qna-sources.ts` | 만듦 |
| FR3.1 | 코드 생성 | `api/src/rag-answer/rag-answer-config.ts` | 만듦 |
| FR3.2 | 코드 생성 | `api/test/ai-generation/citation-request.test.cjs` | 만듦 |
| FR3.3 | 빌드와 시험 | `api/docs/rag-evaluation/2026-11-16-remeasure.md` 「한계」 | 채움: 다시 잰 뒤 지시·상한을 더 고치지 않고 못 채운 기준을 한계로 적음 |
| FR4.1 | 코드 생성 | `web/src/features/rag-answer/gated-item-view.tsx` | 만듦 |
| FR4.2 | 코드 생성 | `web/src/features/recipient/recipient-view.tsx` | 만듦 |
| FR4.3 | 코드 생성 | `aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md` | 만듦 |
| FR4.4 | 코드 생성 | `web/test/rag-answer-item-title.test.mjs` | 만듦 |
| FR4.5 | 코드 생성 | `web/src/features/rag-answer/gated-item-view.tsx` | 만듦 |
| FR5.1 | 코드 생성 | `api/src/ai-generation/checked-gate.ts` | 만듦 |
| FR5.2 | 코드 생성 | `api/docs/rag-evaluation/2026-11-16-baseline.md` | 만듦(5번 재현 안 됨으로 기록) |
| FR5.3 | 코드 생성 | - | N/A: 기준선에서 항목 꼴 문제가 확인되지 않음 |
| FR5.4 | 코드 생성 | `api/scripts/rag-eval/rag-eval.cjs` | 만듦 |
| FR5.5 | 코드 생성 | `api/docs/rag-evaluation/2026-11-16-baseline.md` | 만듦 |
| FR6.1 | 코드 생성 | `api/docs/rag-answer.md` | 만듦 |
| FR6.2 | 코드 생성 | `web/src/features/rag-answer/README.md` | 만듦 |
| FR6.3 | 코드 생성 | `api/docs/rag-answer.md` | 만듦 |
| FR6.4 | 코드 생성 | - | N/A: 승인된 기능 설계 기록을 고치지 않는다는 제약 |
| FR7.1 | 코드 생성 | `api/scripts/rag-eval/rag-eval.cjs` | 만듦 |
| FR7.2 | 코드 생성 | `api/scripts/rag-eval/rag-eval-report.cjs` | 만듦 |
| FR7.3 | 코드 생성 | `api/test/rag-answer/rag-eval.test.cjs` | 만듦 |
| NFR1 | 빌드와 시험 | `api/docs/rag-evaluation/2026-11-16-remeasure.md` | 채움(잼·판정·기록). 완료 기준 (a)·(b)·(e)는 **못 채움**, 한계로 기록 |
| NFR2 | 코드 생성 | `api/test/rag-answer/qna-controller.test.cjs` | 만듦 |
| NFR3 | 코드 생성 | `api/src/rag-answer/qna-sources.ts` | 만듦 |
| NFR4 | 코드 생성 | `api/test/rag-answer/qna-sources.test.cjs` | 만듦 |

## 덮이지 않은 것

- 없음. FR3.3·NFR1은 이 단계에서 채웠다.
- 이슈 #559 완료 기준 가운데 못 채운 것은 셋이다. 이 셋은 승인 질문에서 함께 알린다.
  - 3번 규모 인용
  - 7번 어느 커밋인지 말하기
  - 첫 항목이 답이 아닌 답 1개 이하
