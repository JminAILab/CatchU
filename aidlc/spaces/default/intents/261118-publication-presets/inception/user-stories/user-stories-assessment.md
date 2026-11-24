# User Stories Assessment — 발행 프리셋

## Decision

Execute.

## Rationale

- 이 작업은 사용자 화면이 중심이다: 새 프리셋 목록·편집 화면, 바뀌는 발행 화면, 탭이 생기는 받은 사람 화면과 작성자 발행본 화면(`inception/requirements-analysis/requirements.md` FR1~FR3, `ideation/rough-mockups/wireframes.md`).
- 페르소나가 둘이고(지원자, 면접관) 바라는 것이 다르다. 지원자는 묶음을 미리 만들어 고르고 싶고, 면접관은 자료의 자리를 구분해 읽고 싶다(`ideation/intent-capture/intent-statement.md`).
- 업무 규칙이 여럿 얽힌다: 같은 자료의 여러 프리셋 담기, 상한 세기, 고를 수 없는 프리셋, 담은 뒤 발행할 수 없게 된 자료(requirements.md FR1.11·FR1.14·FR2.4·FR2.7).
- 계약 변경을 팀원 3, 받은 링크 읽기 담당, JD 요약 담당과 맞춰야 해서, 사용자 쪽에서 본 기대 동작을 이야기로 정리해 두면 리뷰 기준이 된다(constraint-register C-O3).

## Factors considered

| 요인 | 판단 |
|---|---|
| 프로젝트 종류 | 기존 코드(brownfield) 위에 기능을 바꾸고 더함 |
| 사용자 화면 범위 | 화면 6곳(W1~W6)과 자료 화면 탭 |
| 복잡도 신호 | 같은 자료 사본, 상한, 순서 번호 이어 매기기, 출처의 탭 이동 |
| 기존 구성 요소 | `aidlc/spaces/default/codekb/CatchU/component-inventory.md`의 web.publications·web.recipient·web.rag-answer·web.materials·api.publications 등이 바뀐다 |
| 서비스 맥락 | `aidlc/spaces/default/codekb/CatchU/business-overview.md`의 발행·받은 사람 흐름을 바꾼다 |
| 팀 관행 | 시나리오·기대 결과·실패 조건을 먼저 정한다(`inception/practices-discovery/team-practices.md` Testing Posture). 이야기의 수락 기준이 그 시나리오다 |

## Key areas where stories add value

- 프리셋 만들기·고치기에서 무엇을 담을 수 있고 무엇이 막히는지.
- 발행 화면에서 고를 수 없는 프리셋과 그 이유.
- 면접관이 탭, 출처 이동, 돌아가기로 자료를 읽는 흐름과 키보드 사용.
- 자료 지우기·탈퇴가 프리셋에 남기는 결과.
