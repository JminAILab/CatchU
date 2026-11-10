# CR3 AI 쪽 — 논리 구성 요소

입력: 구성 요소 `inception/domain-design/components.md`(Judgement·DraftGeneration·AnalysisProcessing), 비기능 요구사항·설계 전체.

| 구성 요소 | 자리 | 하는 일 | 실패 범위 |
|---|---|---|---|
| 판정 공급자 자리(Judgement) | worker 새 패키지(`app.judgement` 꼴) | 공급자 규약, OpenAI·Claude·합성 어댑터, 요청 조립 두 개(Catch·재료), 답 읽기 | 판정 한 번. 실패는 그 Catch(또는 그 후보의 재료)에만 미친다 |
| 기계 대조 | worker 새 모듈(표준 라이브러리만) | 후보·문장의 낱말 뽑기와 근거 줄 대조 | 순수 함수. 실패 없음 |
| 생성 흐름(DraftGeneration) | `worker/app/generation/flow.py` 등 | 후보마다 재료 판정→생성→Catch 판정 순서, 답 적용(제목·설명·둘째 줄), 건수 | 후보 하나 |
| LIVE 조립(AnalysisProcessing) | `worker/app/consumer/`·`worker/app/processing/live.py` | 설정을 읽어 판정 어댑터를 만들어 생성기에 넘김 | 기동. 잘못된 공급자 값이면 기동하지 않음 |
| FR10 확인 명령 | worker 개발 명령(`app.processing` 옆) | 수집 결과 파일 입출력, 운영과 같은 흐름, 로컬 확인표 쓰기 | 개발 기기. 운영 경로와 나뉜다 |
| 고지 | api `analysis-intake`·`ai-consent`, web `ai-consent` | v3 문구와 판본 상수(FR10을 넘었을 때만) | 접수 대조. 판본이 다르면 지금처럼 동의 다시 받기 |
| 설명 칸 | web `assets`·`recipient` | NOT_GENERATED면 칸을 그리지 않음 | 화면 |
| 문서 | 새 `worker/docs/generation-judgement.md`, `generation.md`에는 가리키는 줄 하나, `queue-consumer.md` 환경변수 표에 이름 둘 | 판정 공급자·질문·적용 규칙·켜고 끄기·배포 안내(NFR7.1). 문서 크기 검사로 36,000 B 이하를 확인 | 문서 |

- **외부 공급자 격리:** 판정 공급자 호출은 판정 구성 요소 안에서만 일어난다. 생성 흐름은 규약(요청 → 답 또는 실패)만 안다. 합성 어댑터로 바꿔 끼워 외부 호출 없이 시험한다(ADR-004).
- **불러오기 방향:** 판정 구성 요소는 생성 흐름·후보 판정을 불러오지 않는다. 생성 흐름이 판정을 부른다. 순환이 생기지 않게 판정 요청에 넘기는 자료는 단순한 값(문자열·목록·사전)이다.
