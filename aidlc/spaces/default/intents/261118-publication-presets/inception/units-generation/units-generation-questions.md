# Units Generation — 질문

근거: 구성 요소 `inception/domain-design/components.md`(18개)와 결정 `decisions.md`(ADR-001~009), 요구사항 `inception/requirements-analysis/requirements.md`, 이야기 `inception/user-stories/stories.md`, 범위의 작업 목록 `ideation/scope-definition/intent-backlog.md`(IB-1~IB-8), 팀 관행 면담 `inception/practices-discovery/evidence.md`(Q3·Q5).

이미 정해진 것(다시 묻지 않음):

- 첫 단위는 발행 요청·사본 계약 변경 + 프리셋 저장 + 기존 발행본 버리기(IB-1·IB-8)이고, 따로 먼저 돌려 승인받는다(팀 관행 면담 Q5, 이 작업의 범위 설정 skeleton on).
- 모든 단위는 한 작업 브랜치 `api/publication-presets`에서 하고, 계약 변경 PR을 먼저 dev에 연다(면담 Q3).
- 새 배포 단위는 없다. 모든 단위는 지금 web·api 배포에 들어간다(requirements Constraints).

지금 코드에서 확인한 것:

- web의 사본 응답 검사(`publications-api.ts` `isPublishedItem`)는 모르는 칸이 더 있어도 통과시킨다. 사본에 칸을 더해도 받은 사람·작성자 화면은 그대로 열린다.
- 발행 화면은 지금 `items`를 보낸다. 첫 단위가 요청을 `presetIds`로 바꾸면, 발행 화면을 바꾸는 단위가 들어올 때까지 dev의 발행 화면은 발행에 실패한다.

## Q1. [설계] 단위를 몇 개로 나눌까

각 단위는 Construction에서 기능 설계·NFR·코드 생성·시험을 따로 거치므로 단위가 많으면 단계 실행이 늘고, 적으면 단위 하나가 커집니다. 첫 단위(계약 + 프리셋 저장 + 기존 발행본 버리기)는 두 안 모두 같습니다.

A. 4개. u1 계약·프리셋 저장(api) / u2 지원자 화면(프리셋 목록·편집, 상단 메뉴, Catch 목록 조건, 프리셋으로 발행) / u3 읽는 쪽(탭 부품, 사본 탭·출처 이동, 받은 사람 화면 순서, 작성자 상세, 자료 화면 탭과 지우기 확인, AI 요약 근거·질의응답 머리글·받은 링크 읽기의 앞선 사본) / u4 정리(개인정보처리방침, 탈퇴 연쇄 삭제 시험). 단계 실행이 가장 적다
B. 6개. 범위의 작업 목록(IB) 순서를 따른다. u1 계약·프리셋 저장 / u2 프리셋 화면 / u3 프리셋으로 발행 / u4 사본 탭·출처 이동·자료 화면 탭 / u5 AI 읽기(요약 근거·질의응답 머리글·받은 링크 읽기) / u6 정리. 단위가 작아 PR과 검토가 가볍지만 단계 실행이 늘어난다
X. Other (please specify)

[Answer]: A

## Q2. [설계] 첫 단위가 발행 요청을 바꾼 뒤, 발행 화면이 바뀌기 전까지의 dev

첫 단위의 계약 PR이 dev에 들어가면, 발행 화면 단위가 들어올 때까지 dev의 발행 화면은 발행에 실패합니다(기존 발행본도 버려져 있음). 이용자는 팀 관련자뿐이고, 모든 단위는 2026-11-30까지 dev에 들어갑니다.

A. 그대로 둔다. 그 사이 dev에서 발행이 안 된다는 것을 첫 PR 본문에 적는다. 단위 사이 의존은 바뀌지 않는다
B. 첫 단위에 발행 화면의 최소 수정(고른 자료 대신 프리셋 ID를 보내는 임시 연결)을 넣는다. dev 발행은 이어지지만 첫 단위가 web까지 커지고, 임시 코드를 뒤 단위가 다시 고친다
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- Q1: 단위는 4개다. u1 계약·프리셋 저장(api: 발행 판정 규칙 떼기, 프리셋 저장·API, 발행 요청·사본·막힘 응답, 공개 전환 없애기, 앞선 사본 값과 조각, 마이그레이션, 기존 발행본과 PDF 사본 파일 버리기) / u2 지원자 화면(프리셋 목록·편집, 상단 메뉴, Catch 목록 「담을 수 있는 Catch만」 조건, 프리셋으로 발행) / u3 읽는 쪽(탭 부품, 사본 탭·출처 이동 공용 함수, 받은 사람 화면 순서, 작성자 상세, 자료 화면 탭과 지우기 확인 문장, AI 요약 근거·질의응답 머리글·받은 링크 읽기의 앞선 사본) / u4 정리(개인정보처리방침, 탈퇴 연쇄 삭제 시험)
- Q2: 첫 단위 계약 PR이 dev에 들어간 뒤 발행 화면 단위가 들어올 때까지 dev에서 발행이 안 되는 것은 그대로 두고, 첫 PR 본문에 적는다

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
