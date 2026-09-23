# CatchU — 담당별 첫 연결 순서

## 적용 범위

API v1과 ERD v1을 개발 기준으로 삼는 Minimal 계획이다. 코딩은 이슈 → 영역/작업내용 브랜치 → dev PR → 작성자 외 승인 → merge commit으로 진행한다. 아래 순서는 담당별 작업 연결을 위한 것이며 AI-DLC 코딩 게이트가 아니다. 기본 단계 순서 Contract → Delivery → Functional과 기본 Unit 반복을 유지한다.

## 첫 연결 순서

| 순서 | 포함 Unit·담당 | 완료 기준·보여 줄 결과 | 확인할 가설 |
|---|---|---|---|
| 0 뼈대 | U1 web / U2 api / U3 worker, #81~#84 지정 담당 | 각 이슈의 최소 실행 확인. 이 세션에서는 생성하지 않음 | 각 배포 단위가 공통 기반을 받을 수 있음 |
| 1 공통 기반 | U2: #86 DB·TypeORM 마이그레이션(1), #87 Access JWT·개발용 로그인(2), #88 공통 오류(3); #88의 U1 연결도 포함 | #83 이후 각 이슈 검사 근거. web 부분은 #82 이후. DB 적용/복구 확인, 본인 식별·개발용 로그인 운영 차단, 계약의 상태 코드·code/message/details 분기 | 기능 담당이 같은 저장·인증·오류 기준을 사용함 |
| 2 합성 처리·반영 | U3 F(1) → U2 E(2) → B(4) | MOCK 요청·결과를 계약 대역으로 전달, E 요청/동의와 연결, B PRIVATE 등록 후 본인 열람 준비 확인. 같은 결과 재전달에 중복 등록 없음 | F 처리 완료와 B 저장/열람 준비를 구분하면서 연결할 수 있음 |
| 3 화면·공개·열람 | U1 D/C(3)·B(4)·A/E(2), U2 해당 업무 담당 | 접수→상태/결과 진입→근거·기여 확인→별도 공개→수신자 열람. 숨김 다음 요청은 거부. 조회 실패를 정상 0건으로 표시하지 않음 | 각 담당 화면이 현재 업무 상태·공개 선택을 일관되게 소비함 |
| M1 첫 연결 결과 | U1/U2/U3 담당 공동 근거, 팀장 승인 | 연결 판본·실제/모의 경계·기대/실제 결과·남은 문제를 모아 별도 마일스톤 승인 1회 | 최소 연결의 성립과 남은 실제 연결을 구분할 수 있음 |

첫 연결은 합성 자료·가짜 생성기를 사용한다. 실제 GitHub/LLM 호출이나 BullMQ 연결을 선행시키지 않는다. 1은 실제 의존에 맞춰 병행하고 2→3은 연결 확인 순서다. 계약 소비 DAG U1→U2→U3와 실제 A/F 양방향 의존은 그대로이며, 대역을 이용한 병행이 의존 제거를 뜻하지 않는다.

## 마일스톤·후속 범위

- M1은 담당 조각이 처음 연결될 때 한 번 받는다. 각 담당이 먼저 주요 시나리오·기대 결과·실패 조건을 정하고 구현 후 세부 시험 결과를 낸다. 공통 세션은 연결 누락/충돌을 검토한다.
- M1 성공은 첫 MVP 완료가 아니다. 비밀번호·중단·만료, 공개 조건/현재 권한, 실패 상태·재요청 및 실제 보호/배포 등 기존 완료 기준은 유지하며 통합 검증표는 #24로 추적한다.
- 승인 뒤 Functional 기본 반복: api의 ERD v1 전체, web·worker 최소 문서. 설계 단계는 stage-major 그대로이며 이 연결 계획을 이유로 Unit 종류/반복 방식·코딩 게이트를 바꾸지 않는다.
- 계약 마일스톤 종료와 개발 중 계약 수정 기록은 [기존 결정](../domain-design/2026-09-23-followup.md)을 따른다.

## 담당자 확인 요청

- 1 F/H/I·2 A/E: #86/#87 선행과 합성 결과/요청·동의·반영 연결 확인.
- 3 C/D: #88 및 결과 진입·공개 자료·거부 표시 확인.
- 4 B: 등록/정본·열람 준비·개별 공개 연결 확인. PR #89 병합 전 필수.

## 추적 정보

[확인 요약](delivery-planning-questions.md) · [requirements](../requirements-analysis/requirements.md) · [components](../domain-design/components.md) · [unit-of-work](../units-generation/unit-of-work.md) · [unit-of-work-dependency](../units-generation/unit-of-work-dependency.md) · [unit-of-work-story-map](../units-generation/unit-of-work-story-map.md) · [contract-summary](../contract-design/contract-summary.md) · [현행 팀 관행](../../../../memory/team.md).

User Stories는 SKIP이다. mockups는 기존 [wireframes](../../ideation/rough-mockups/wireframes.md)·[user-flow](../../ideation/rough-mockups/user-flow.md)를 재사용한다. [team-practices](../practices-discovery/team-practices.md)는 과거 관행 기록이며 코딩 운영은 현행 team.md와 9/23 결정이 우선한다. 자료 조건은 [#37](https://github.com/JminAILab/CatchU/issues/37).
