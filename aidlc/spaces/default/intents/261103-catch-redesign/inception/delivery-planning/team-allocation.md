# Catch 개편 — 담당 배정

Bolt는 Unit 하나를 기능 설계부터 시험까지 지나 실제로 돌아가는 결과로 끝내는 구현 묶음이다. 이 intent는 범위가 mvp라 팀 구성 단계를 건너뛰었다. 그래서 담당은 팀 하나다.

| Bolt | Unit | 구현 | 승인·확인 | 사람 쪽 일 |
|---|---|---|---|---|
| B1 | CR1 `cr1-readable-catch` | aidlc-developer-agent(AI) | 팀장 | 로컬 실제 연결 확인과 승인 |
| B2 | CR3 `cr3-ai-drafts` | aidlc-developer-agent(AI) | 팀장 | Catch 20개 표시(FR10), 고지 문구 승인, OpenAI 판정 키를 SSM에 넣기 |
| B3 | CR2 `cr2-commit-assignment` | aidlc-developer-agent(AI) | 팀장 | 로컬 재분석 확인, api·worker 함께 배포 |

- 모든 Bolt를 AI 개발자 에이전트가 구현하고, 팀장이 단계마다 승인한다.
- 이 intent는 모두 팀장 몫이다(입력 문서 §6). `team.md`의 팀 방식(담당마다 자기 Unit)은 12월 intent에 적용한다. 이 intent에서 팀원에게 Unit을 배정하지 않는다.
- 공유 인프라 변경은 팀장이 맡는다(`team.md` 「Deployment」). 이 intent의 인프라 변경은 OpenAI 판정 키를 SSM에 넣는 것 하나다.
- 알릴 곳은 발행 화면(U4)과 U7의 담당이다(입력 §5-5). 작업 사실·제목 글이 바뀌므로 해당 PR을 낼 때 알린다.
