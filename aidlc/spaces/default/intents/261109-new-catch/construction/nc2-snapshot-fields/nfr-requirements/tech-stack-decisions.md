# NC2 면접관 사본 칸과 표지 — 기술 스택 결정

입력:
- 기능 설계 `construction/nc2-snapshot-fields/functional-design/`(rules.md, functional-spec.md, entities.md)
- 요구사항 `inception/requirements-analysis/requirements.md`(NFR8)
- 계약 `inception/contract-design/contract-summary.md`(C3·C6)
- 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 이 단계의 답 `nfr-requirements-questions.md`(Q2 A와 덧붙임)

## 결정

NC2는 새 라이브러리, 새 서비스, 새 DB 칸, 마이그레이션을 더하지 않는다. 지금 판본을 그대로 쓴다.

| 대상 | 쓰는 것 | 까닭 |
|---|---|---|
| api 발행 | NestJS, TypeORM 원본 SQL 질의, PostgreSQL 16(지금 판본) | 지금 `publish.service.ts`의 매개변수 질의에 조인 하나, 칸 하나, 소속 기록 질의 하나를 더한다. 색인은 이미 있다. |
| 사본 칸 | 지금 `published_item.snapshot` jsonb와 `published-snapshot.ts` 형 | 선택 칸만 더하므로 DB 모양이 바뀌지 않는다(계약 C3). |
| 작성 시점 달 | TypeScript 표준 날짜 계산(UTC에 9시간을 더해 해·달) | 한국 시간은 서머타임이 없어 고정 9시간이다. 날짜 라이브러리를 들이지 않는다. 지금 web의 `formatKst`와 같은 셈이다. |
| 한계 문장 대조 | api 안 문자열 상수 넷과 글자 비교 | 문장 대조 계약(C6). 본인 커밋 여부는 소속 기록으로 정해 상수가 필요 없다. |
| 문장 대조 시험 | api 지금 시험 틀이 `node:fs`로 `worker/app/candidates/build.py` 글자를 읽음 | Python을 불러오지 않는다(기능 설계 Q6 A). CI는 그대로다. |
| web 사본 보기·표지 | Next.js·React(지금 판본), CSS 모듈(`publications.module.css`), TypeScript 표준 기능(`URL`·정규식) | 표지는 지금 종류 표지 모양을 그대로 쓴다. 새 색을 더하지 않는다. |
| AI 지시 | 지금 지시 상수(`rag-answer-config.ts`, `jd-generation-request.ts`) | 문장 하나를 붙인다. 모델·호출 방식은 그대로다. |
| 시험 | web `node:test`와 지금 화면 시험 방식, api 지금 시험 틀, 커버리지는 각 서비스 `test:coverage` | 팀 규칙대로 측정 도구를 따로 들이지 않는다(team.md 「Testing Posture」). |

## 고르지 않은 안

- **worker에 한계 종류 칸 더하기:** 결과 메시지 판본이 오르고 NC2가 worker에 묶인다(계약 설계 Q1 B를 고르지 않음).
- **기여 범위 문장 대조로 본인 커밋 정하기:** 처음 설계였으나 worker 문구가 바뀌면 표지가 조용히 사라지고, 표지 뜻(이 Catch에 속한 본인 커밋)과 판단 근거가 어긋날 수 있어 소속 기록으로 바꿨다(2026-11-10 팀장 결정).
- **Python으로 상수를 불러 대조:** 같은 작업 경고 둘은 f-string 안 글자라 어차피 파일 글자로 찾아야 한다(기능 설계 Q6 B를 고르지 않음).
- **날짜 라이브러리:** 달 하나를 정하는 데 필요하지 않다.

## Sources

- `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- `construction/nc2-snapshot-fields/functional-design/rules.md`(BR1.2, BR1.4, BR1.6, BR4.5, BR5.1), `functional-spec.md`, `entities.md`, `functional-design-questions.md` Q6
- `inception/requirements-analysis/requirements.md` NFR8
- `inception/contract-design/contract-summary.md` C3·C6
- `nfr-requirements-questions.md` Q2 A와 덧붙임
- 지금 코드: `api/src/publications/publish.service.ts`, `api/src/publications/published-snapshot.ts`, `web/src/features/publications/publication-format.ts`(`formatKst`), `web/src/features/publications/publications.module.css`
