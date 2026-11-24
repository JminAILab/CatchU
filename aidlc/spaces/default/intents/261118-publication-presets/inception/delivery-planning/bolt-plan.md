# Bolt Plan — 발행 프리셋

근거: 요구사항 `inception/requirements-analysis/requirements.md`, 이야기 `inception/user-stories/stories.md`, 다듬은 화면 `inception/refined-mockups/mockups.md`, 구성 요소 `inception/domain-design/components.md`, 단위 `inception/units-generation/unit-of-work.md`·`unit-of-work-dependency.md`·`unit-of-work-story-map.md`, 계약 `inception/contract-design/contract-summary.md`, 팀 관행 `inception/practices-discovery/team-practices.md`와 면담 `evidence.md`(Q3·Q5), 이 단계 질문 `delivery-planning-questions.md`(Q1~Q3).

Bolt는 Construction에서 한 번에 만드는 묶음이다. 단위 하나를 설계·코드·시험까지 거쳐 돌아가는 결과로 끝내는 한 바퀴다. 이 작업은 Bolt 하나에 단위 하나를 담고, 한 작업 브랜치 `api/publication-presets`에서 Bolt마다 dev PR을 차례로 연다(면담 Q3). 모두 2026-11-30까지 dev에 들어간다.

## 순서

| 차례 | Bolt | 단위 | 끝까지 잇는 얇은 판 |
|---|---|---|---|
| 1 | B1 계약·프리셋 저장·앞선 사본 | U1 u1-preset-contract | 예 |
| 2 | B2 지원자 화면 | U2 u2-applicant-screens | 아니오 |
| 3 | B3 읽는 쪽 화면 | U3 u3-reader-views | 아니오 |
| 4 | B4 개인정보처리방침 문구 | U4 u4-privacy-policy | 아니오 |

이 순서는 단위 의존 그래프가 허락하는 순서 가운데 하나다(U2·U3은 U1 뒤, U4는 어디든). 고른 이유는 `risk-and-sequencing-rationale.md`에 있다.

## B1 — U1 u1-preset-contract (walking skeleton)

walking skeleton은 뒤 단위 없이 처음부터 끝까지 실제로 돌아가는 가장 얇은 판이다. B1은 따로 먼저 돌리고 사람이 따로 승인한 뒤에 나머지 Bolt를 돌린다(면담 Q5).

- **증명하는 구조**: 프리셋 저장(PresetLibrary) → 발행 트랜잭션의 프리셋 펴기와 판정 규칙(PublishableSource) → 사본의 프리셋 칸(SnapshotContract) → 앞선 사본만 쓰는 조각·기본 요약 근거·질의응답 머리글·받은 링크 읽기 → 새 표의 연쇄 삭제.
- **완료 조건(Definition of Done)**
  - 계약 P-1~P-6(`contract-summary.md`)이 코드와 시험으로 맞는다.
  - 마이그레이션이 프리셋 표 둘과 발행본 항목 칸 둘을 만들고, 변경 전 발행본 행을 지운다. 변경 전 발행본의 PDF 사본 파일도 지운다(방법은 U1 기능 설계).
  - (중간 단계 확인) 발행 판정 규칙만 PublishableSource로 옮긴 직후, 지금 발행 시험이 그대로 통과한다.
  - (끝 상태) 지금 발행 시험(`api/test/publications/publish-api.test.cjs`의 `items` 요청 칸, `details.catchIds`, 145행 비공개 Catch의 PUBLIC 전환)을 바뀐 계약 P-2(`presetIds`, `catchIds` 없음, `CATCH_PRIVATE`)에 맞게 고쳐 통과한다.
  - 탈퇴하면 프리셋이 지워지고 탈퇴가 막히지 않으며, 텍스트 자료·PDF를 지우면 프리셋에서 빠진다(시험).
  - `api/docs/member-withdrawal-deletion.md` 표에 새 표 행이 더해진다(C-06).
  - Unit 확인 명령(아래 「확인 명령」)이 통과한다.
  - 계약 PR을 dev에 열어 팀원 3, 받은 링크 읽기 담당, JD 요약 담당의 리뷰를 받는다. PR 본문에 「이 PR 뒤 B2가 들어올 때까지 dev 발행 화면은 발행에 실패한다」를 적는다(단위 Q2).
- **보여 줄 것(demo)과 실제 확인**: api만으로 처음부터 끝까지 잇는 시험 하나. 프리셋 둘(같은 Catch를 함께 담음)을 만들고 → 프리셋 ID로 발행하고 → 받은 링크로 사본을 읽어 프리셋 순번·이름 칸을 보고 → 조각과 받은 링크 읽기에 겹친 사본이 한 번만 나오는 것을 보고 → 탈퇴하면 프리셋이 지워지고, 자료를 지우면 그 자료만 프리셋에서 빠지는 것을 본다. 이 연결의 성공을 전체 완료로 보고하지 않는다(팀 관행 Walking Skeleton).
- **이 Bolt가 알려 줄 것**: 순서 번호를 발행본 전체에 이어 매기고 「앞선 사본인가」 값 하나로 거르면, 조각·요약·질의응답·받은 링크 읽기가 큰 손질 없이 그대로 돈다는 것(architecture.md의 판단).
- **먼저 있어야 하는 것**: 없음. 시험 DB는 pgvector가 있는 5433 포트를 쓴다(로컬 시험 환경).

## B2 — U2 u2-applicant-screens

- **완료 조건**
  - 프리셋 목록·편집 화면과 상단 메뉴 「프리셋」이 다듬은 화면 M1~M3대로 동작한다.
  - 본인 Catch 목록 조회의 「담을 수 있는 Catch만」 조건이 PublishableSource 판정과 같은 결과를 낸다(시험).
  - 발행 화면의 프리셋 고르기(M4)와 막힘 표시(blockedSources)가 동작해 dev 발행이 다시 된다.
  - Unit 확인 명령이 통과하고 dev PR이 병합된다.
- **보여 줄 것과 실제 확인**: 로컬에서 프리셋을 만들어 고치고, 프리셋 둘을 골라 발행해 링크가 나오는 것. 막힌 프리셋을 고르면 이유가 단추 안에 보이는 것.
- **이 Bolt가 알려 줄 것**: 발행 화면에서 옮겨 온 자료 고르기가 프리셋 편집에서 그대로 쓰인다는 것, dev 발행이 다시 된다는 것.
- **먼저 있어야 하는 것**: B1이 dev에 병합되어 있어야 한다.

## B3 — U3 u3-reader-views

- **완료 조건**
  - 받은 사람 화면과 작성자 상세가 프리셋 탭으로 보이고, 출처 단추가 다른 탭의 글로 옮겨 간다(M5·M6, 돌아가기 단추 없음).
  - 받은 사람 화면에서 AI 요약이 발행본 자료 위에 있다.
  - 자료 화면 탭이 같은 탭 부품으로 화살표 키를 쓰고, 지우기 확인 문장이 바뀐다.
  - 접근성 점검 A1~A15(`refined-mockups/accessibility-checklist.md`)를 확인한다.
  - Unit 확인 명령이 통과하고 dev PR이 병합된다.
- **보여 줄 것과 실제 확인**: B2로 실제 발행한 발행본을 받은 사람 링크로 열어 탭을 옮기고, 답의 출처로 다른 탭의 글에 가는 것.
- **이 Bolt가 알려 줄 것**: 탭으로 나눠도 질문 대화와 출처 이동이 그대로 이어진다는 것.
- **먼저 있어야 하는 것**: B2가 dev에 병합되어 있어야 한다(실제 발행본으로 시험하려고, Q1). 탭을 시작할 때 팀원 3의 화면 정리가 dev에 들어와 있으면 그 위에서 시작한다.

## B4 — U4 u4-privacy-policy

- **완료 조건**: 저장 항목 표와 「하나씩 지우기」 문장에 프리셋이 팀장 확정 문구로 들어가고, 원문 사본·화면·원문 출처와 SHA-256 시험이 맞는다. Unit 확인 명령이 통과하고 dev PR이 병합된다.
- **보여 줄 것과 실제 확인**: 개인정보처리방침 화면에 바뀐 문장이 보이는 것.
- **이 Bolt가 알려 줄 것**: 방침이 실제 저장 항목과 맞는다는 것.
- **먼저 있어야 하는 것**: 팀장 확정 문구(B3이 끝날 때까지 받음, Q2).

## Construction 설정

- **도는 방식**: 한 단위씩 차례로 설계 단계와 코드 생성을 거치고 단위마다 완료 확인을 한다(`aidlc-state.md`: Construction Iteration unit-major, Execution serial, Checkpoints enabled). 이 설정을 그대로 쓴다.
- **확인 명령**: 단위마다 같은 명령으로 확인한다(2026-11-20 팀장 승인). `npm --prefix api run lint && npm --prefix api run typecheck && npm --prefix api run test:coverage && npm --prefix web run lint && npm --prefix web run typecheck && npm --prefix web run test:coverage && npm --prefix web run build`. 이번 작업은 worker를 바꾸지 않아 worker 확인은 빼고, CI의 web 검사에 있는 `next build`를 미리 돌린다. api 통합 시험은 pgvector가 있는 로컬 DB(5433)가 떠 있어야 돈다. `--timeout-ms 3600000`으로 돌리고 끝나면 api·web 걸린 시간을 알린다(project.md Testing Posture).
