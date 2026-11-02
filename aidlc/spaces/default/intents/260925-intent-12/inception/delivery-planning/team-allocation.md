# CatchU 12월 범위 — 담당 배정

작성일: 2026-10-26. 입력: [재승인 요구사항](../requirements-analysis/requirements.md)(requirements), [컴포넌트 목록](../domain-design/components.md)(components), [Unit 정의](../units-generation/unit-of-work.md)(unit-of-work), [Unit 의존](../units-generation/unit-of-work-dependency.md)(unit-of-work-dependency), [계약 요약](../contract-design/contract-summary.md)(contract-summary), [납품 계획 질문·답변](delivery-planning-questions.md)(Q1·Q2·Q3·Q7).

Bolt는 구현 단계에서 한 번에 지어 실제로 돌아가는 결과까지 가는 작업 묶음이며, 이 계획에서는 Unit 하나가 Bolt 하나다([Bolt 계획](bolt-plan.md)). 팀 구성 단계는 이번 계획에서 뺐으므로 담당은 팀원 개인 단위로 적는다. 각 담당은 자기 Unit을 AI-DLC 팀 방식으로 맡아(claim) 기능 설계부터 시험까지 진행하고 제출한다. 코드 작성은 각 담당의 AI-DLC 실행(aidlc-developer-agent 등)이 돕지만, 담당과 승인은 사람이다.

## Unit별 담당

| Bolt | Unit | 담당 | 비고 |
|---|---|---|---|
| B1 | U1 AI 생성 관문 최소 경로 | 팀장(팀원 1) | 맡기 없이 먼저 합침(walking skeleton) |
| B2 | U2 공용 기반 | 팀장(팀원 1) | 맡기 흐름 첫 확인 |
| B3 | U3 발행본 색인·검색 | 팀장(팀원 1) | U5와 같은 담당이 순서대로 |
| B4 | U4 발행·링크 | 팀원 3 | |
| B5 | U6 Claude MCP 본인 연결 | 팀원 2 | |
| B6 | U7 저장소·분석 | 팀원 4 | |
| B7 | U10 JD | 팀원 4 | 11/13에 넘길 수 있는 크기 |
| B8 | U5 RAG 응답 | 팀장(팀원 1) | 팀장 몫이 밀리면 먼저 넘길 후보 |
| B9 | U8 PDF 자료(후순위) | 11/13에 정함 | 핵심 Unit을 끝낸 사람 |
| B10 | U9 받은 사람의 Claude 연결(후순위) | 11/13에 정함 | 핵심 Unit을 끝낸 사람 |

## 사람별 순서

| 담당 | 순서 |
|---|---|
| 팀장(팀원 1) | U1 → U2·U3의 첫 작은 PR(경계의 함수 모양·표·가짜 구현) → U2·U3 본체 → U5 |
| 팀원 2 | U6 |
| 팀원 3 | U4(착수 직후 C-07·C-10·C-13·C-14 첫 작은 PR) |
| 팀원 4 | U7 → U10(JD 저장은 바로, JD 요약은 U3·U4 첫 작은 PR 뒤 합성 제공자로) |

착수 시점은 사람마다 10월 남은 일에 따라 다르다. U1이 통합 브랜치에 합쳐진 뒤 10월 일을 마친 사람부터 맡는다(Q7). 경계를 주는 쪽의 첫 작은 PR은 착수 직후로 한다(Q1).

## 다시 나누기

- 11/13 1차 통합 확인에서 진행을 보고 Unit을 넘길지 정한다. 넘기기 좋은 크기는 U10, U5, U8, U9다(Q1).
- 팀장 몫(U1·U2·U3·U5)이 가장 크다. 밀리면 U5를 먼저 넘긴다(Q1). 11월 공수 추정이 가용보다 약 48~50인시 많다(요구사항 C03).
- 후순위 U8·U9는 누군가의 유일한 Unit이 되지 않게 핵심 Unit을 끝낸 사람이 이어 맡는다(요구사항 「지위와 일정」, Q2).

## 팀 방식 준비

- Construction을 시작할 때 Unit 담당 질문에서 'Several teams'(Unit Ownership: team)를 고르고, 승인은 단계마다로 둔다(Q7).
- 팀원은 각자 착수 전에 AI-DLC 2.11.1 설치와 맡기 직전 단계까지 확인한다(Q3).
- 팀원이 맡기 전에 팀장이 `dev`를 통합 브랜치에 merge commit으로 가져온다(Q7).
- 공용 기반 PR은 그것을 가져다 쓰는 사람이 리뷰한다(Unit 정의 U2).
