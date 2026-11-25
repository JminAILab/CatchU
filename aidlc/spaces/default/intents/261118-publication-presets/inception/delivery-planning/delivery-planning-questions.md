# Delivery Planning — 질문

근거: 단위 `inception/units-generation/unit-of-work.md`·`unit-of-work-dependency.md`·`unit-of-work-story-map.md`, 계약 `inception/contract-design/contract-summary.md`, 구성 요소 `inception/domain-design/components.md`, 요구사항 `inception/requirements-analysis/requirements.md`, 이야기 `inception/user-stories/stories.md`, 다듬은 화면 `inception/refined-mockups/mockups.md`, 팀 관행 `inception/practices-discovery/team-practices.md`와 면담 `evidence.md`(Q3·Q5), `aidlc-state.md`(Construction 설정).

이 단계는 Bolt의 순서를 정합니다. Bolt는 Construction에서 한 번에 만드는 묶음(단위 하나 이상을 설계·코드·시험까지 거쳐 돌아가는 결과로 끝내는 한 바퀴)입니다.

이미 정해진 것(다시 묻지 않음):

- 첫 Bolt는 U1(u1-preset-contract) 하나이고, 끝까지 이어지는 얇은 판(walking skeleton)으로 따로 먼저 돌려 승인받는다(면담 Q5, 범위 skeleton on).
- Bolt 하나에 단위 하나다. 단위 계획 승인 때 단위를 크게 묶어 넷으로 정했다.
- 한 작업 브랜치 `api/publication-presets`에서 Bolt마다 dev PR을 차례로 연다. 앞 PR이 병합되면 dev를 merge로 받아 다음 Bolt를 이어 간다(면담 Q3). 모두 2026-11-30까지 dev에 들어간다.
- Construction은 한 단위씩 차례로(unit-major, serial) 돌고 단위마다 완료 확인을 거친다(`aidlc-state.md`에 기록된 설정 그대로).
- Bolt는 모두 AI(aidlc-developer-agent)가 만들고, 단계 승인과 PR 승인은 사람이 한다(mvp 범위라 팀 구성 단계 없음).

## Q1. [진행] U1 다음 Bolt의 순서

U2(지원자 화면)와 U3(읽는 쪽 화면)은 둘 다 U1에만 기댑니다. U1의 계약 PR이 dev에 들어가면 U2가 들어올 때까지 dev 발행 화면은 발행에 실패합니다(단위 Q2).

A. U1 → U2 → U3 → U4. dev 발행이 막히는 기간을 가장 짧게 하고, 지원자가 프리셋을 만들어 발행해야 읽는 쪽 화면을 실제 발행본으로 시험할 수 있다
B. U1 → U3 → U2 → U4. 면접관이 보는 탭을 먼저 끝낸다. 그동안 dev 발행이 막혀 U3은 api로 만든 발행본으로 시험한다
X. Other (please specify)

[Answer]: A

## Q2. [진행] U4(개인정보처리방침 문구)를 언제 할까

U4는 팀장 확정 문구가 있어야 시작합니다. 다른 단위의 코드는 필요 없습니다.

A. 마지막 Bolt로 한다. 팀장이 U3이 끝날 때까지 확정 문구를 준다. 늦으면 U4만 11/30 뒤로 미루지 않고 문구를 기다린다
B. U1 바로 다음에 한다. 프리셋 저장이 dev에 들어간 직후 방침도 맞춘다. 팀장이 지금 확정 문구를 준다
X. Other (please specify)

[Answer]: A

## Q3. [진행] 가장 걱정되는 것 (select all that apply)

고른 것을 일찍 확인하도록 Bolt의 완료 조건과 위험 문서에 적습니다.

A. U1이 XL이라 11/30 일정 안에 들어오지 않을 것
B. U1 계약 PR의 리뷰(팀원 3, 받은 링크 읽기 담당, JD 요약 담당)가 늦어져 뒤 Bolt가 밀릴 것
C. 변경 전 발행본 버리기는 되돌릴 수 없다(DB 행과 PDF 사본 파일)
D. 발행 판정 규칙을 떼어 옮기다 지금 발행 동작이 바뀔 것
X. Other (please specify)

[Answer]: X. 특별히 걱정되는 것은 없습니다. Bolt 완료 조건과 위험 문서에 따로 더할 것은 없습니다.

## Consolidated Summary Confirmation

- Q1: Bolt 순서는 U1 → U2 → U3 → U4다. dev 발행이 막히는 기간을 가장 짧게 하고, 읽는 쪽 화면을 실제 발행본으로 시험한다
- Q2: U4(개인정보처리방침 문구)는 마지막 Bolt다. 팀장이 U3이 끝날 때까지 확정 문구를 준다
- Q3: 특별히 걱정되는 것은 없다. Bolt 완료 조건과 위험 문서에 따로 더하지 않는다(위험 문서에는 앞 단계에서 이미 정한 사실만 적는다)

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
