# CR3 AI 쪽 — 기술 선택

입력: 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`, 요구사항 NFR1·NFR5·NFR7, 이 단계의 답 Q1·Q3.

| 항목 | 선택 | 이유 |
|---|---|---|
| OpenAI 판정 호출 | 공식 `openai` 파이썬 SDK, 판본 고정(`worker/pyproject.toml`·`uv.lock`) | 요청·응답 모양과 오류 구분을 SDK가 맡는다. Claude 어댑터와 같은 규칙으로 쓴다: 다시 시도 끔, 키는 `CATCHU_JUDGEMENT_API_KEY`에서만 읽기, 응답 크기 상한, 미국 처리, 요청마다 저장 끔(Q1 A·Q3 A) |
| Claude 판정 호출 | 지금 Anthropic SDK와 `ClaudeProvider` 규칙 그대로(모델 `claude-haiku-5-5`, 구조화 출력) | FR4.5 대체 공급자. 새 의존성 없음 |
| 합성 판정 | worker 안 시험용 어댑터 | 외부 호출 없이 판정 경로를 시험한다(FR4.1) |
| 기계 대조 | worker 새 모듈(표준 라이브러리만) | 12월 api `fact-check.ts`의 낱말 뽑기를 다시 짠다(BR3.3). 다른 worker 모듈을 불러오지 않는다 |
| 설정 | `CATCHU_JUDGEMENT_PROVIDER`(`openai` 기본·`claude`), `CATCHU_JUDGEMENT_API_KEY` | 기능 설계 BR1.1. 큐 소비자 환경변수 표(`worker/docs/queue-consumer.md`)와 환경변수 예시에 이름만 더한다 |
| 비밀값 | SSM `/catchu/prod/worker/CATCHU_JUDGEMENT_API_KEY` → Secret `catchu-worker` | 지금 생성 키와 같은 길. 만드는 것은 팀장 인프라(요구사항 제약 C5, Catch 20개 확인 전) |
| 문서 | 새 문서 `worker/docs/generation-judgement.md` | `generation.md`(34,666 B)가 36,000 B 상한에 가까워 판정 설명을 따로 둔다(NFR7.1) |

## 인셉션 NFR7(문서 크기)에서 물려받는 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR7.1 | 판정 설명은 새 문서 `worker/docs/generation-judgement.md`에 쓰고, `generation.md`에는 그 문서를 가리키는 줄만 둔다. 모든 worker 문서는 36,000 B 이하다. | 문서 크기 검사(`.github/scripts/check-doc-sizes.sh`)가 통과한다. | NFR7, BR10.1 |

## 해당하지 않는 인셉션 NFR

- **NFR6(배포 호환):** 결과 메시지 판본과 맥락 조회 응답은 CR2가 바꾼다. CR3은 계약 모양을 바꾸지 않는다(C5).
