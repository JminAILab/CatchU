# Unit of Work Story Map — 발행 프리셋

근거: 이야기 `inception/user-stories/stories.md`(US1.1~US4.4), `unit-of-work.md`, 구성 요소 `inception/domain-design/components.md`와 그 추적 `inception/domain-design/traceability.json`, 요구사항 `inception/requirements-analysis/requirements.md`.

한 줄에 단위를 여럿 적으면, 적힌 단위마다 그 이야기의 수락 기준을 자기 기능 설계에서 모두 추적한다(서버 쪽은 U1, 화면 쪽은 U2·U3).

## 이야기별 단위

| Story | Unit ID | Directory | 비고 |
|---|---|---|---|
| US1.1 | U1; U2 | u1-preset-contract; u2-applicant-screens | 목록 API(상태 계산)와 목록 화면 |
| US1.2 | U1; U2 | u1-preset-contract; u2-applicant-screens | 저장 검증(이름·50개·중복·상한·소유)과 편집 화면 |
| US1.3 | U1; U2 | u1-preset-contract; u2-applicant-screens | 항목 순서 저장과 위로·아래로·빼기 |
| US1.4 | U1; U2 | u1-preset-contract; u2-applicant-screens | 고쳐 저장하는 검증과 화면 |
| US1.5 | U1; U2 | u1-preset-contract; u2-applicant-screens | 지우기 API와 확인 |
| US1.6 | U1; U2 | u1-preset-contract; u2-applicant-screens | 발행할 수 없게 된 자료의 이유 계산과 표시 |
| US2.1 | U1; U2 | u1-preset-contract; u2-applicant-screens | 프리셋 ID 발행과 발행 화면 |
| US2.2 | U1; U2 | u1-preset-contract; u2-applicant-screens | 고를 수 없는 이유 계산과 단추 안 표시 |
| US2.3 | U1; U3 | u1-preset-contract; u3-reader-views | 프리셋마다 사본, 각 탭에 보임 |
| US2.4 | U1; U2 | u1-preset-contract; u2-applicant-screens | 막힘 응답(프리셋 ID와 자료)과 표시 |
| US2.5 | U1 | u1-preset-contract | 사본에 발행 당시 이름 복사 |
| US3.1 | U1; U3 | u1-preset-contract; u3-reader-views | 변경 전 발행본 버리기(U1)와 접근 불가 화면 확인(U3). 요약을 먼저, 프리셋별 탭(U3) |
| US3.2 | U3 | u3-reader-views | 탭 키보드 동작 |
| US3.3 | U1; U3 | u1-preset-contract; u3-reader-views | 앞선 사본만 쓰는 조각·질의응답 머리글·요약 근거(U1, AC3.3.2·AC3.3.3)와 탭을 바꿔도 질문 대화가 남음(U3) |
| US3.4 | U3 | u3-reader-views | 출처로 다른 탭의 글에 감(돌아가기 단추는 다듬은 화면 결정으로 없음) |
| US3.5 | U3 | u3-reader-views | 작성자 상세의 같은 탭 |
| US3.6 | U1 | u1-preset-contract | 받은 링크 읽기(앞선 사본만, Q9가 AC3.6.2를 대신함) |
| US4.1 | U1; U3 | u1-preset-contract; u3-reader-views | 연쇄 삭제와 그 시험, 지우기 확인 문장 |
| US4.2 | U1 | u1-preset-contract | 탈퇴 연쇄 삭제와 그 시험 |
| US4.3 | U4 | u4-privacy-policy | 방침 문구(팀장 확정 문구) |
| US4.4 | U3 | u3-reader-views | 자료 화면 탭 키보드 동작 |

## 여러 단위에 걸친 것

- 프리셋 저장·발행 이야기(US1.1~US1.6, US2.1, US2.2, US2.4)는 서버 검증과 상태 계산이 U1, 화면이 U2다. U2의 화면 시험은 U1의 API를 쓴다.
- US2.3, US3.1, US3.3, US4.1은 서버 동작이 U1, 화면에 보이는 부분이 U3이다.
- 권한(NFR2)·로그(NFR4)는 U1, 글자로만 그리기(NFR3)·상태 표시(NFR5)·접근성(NFR1)은 U2·U3이 각자 지킨다.

## 단위 안의 순서

- **U1**: PublishableSource 떼기(지금 발행 시험 그대로 통과) → 마이그레이션(프리셋 표, 항목 칸, 변경 전 발행본 지우기) → PresetLibrary 저장·목록·상태 → SnapshotContract 「앞선 사본인가」와 사본 읽기 → 발행 요청·막힘 응답·공개 전환 없애기 → 조각·요약 근거·질의응답 머리글·받은 링크 읽기 → 변경 전 발행본 PDF 사본 파일 지우기 → 탈퇴·자료 지우기 연쇄 삭제 시험 → api로 끝까지 잇는 확인.
- **U2**: 본인 Catch 목록 조건 → 프리셋 목록 화면과 상단 메뉴 → 프리셋 편집(자료 고르기 옮기기) → 발행 화면의 프리셋 고르기와 막힘 표시.
- **U3**: TabStrip(자료 화면에 먼저 적용) → 사본 탭 → 출처 이동 공용 함수(두 화면) → 받은 사람 화면 순서 → 지우기 확인 문장.
- **U4**: 확정 문구 받기 → 원문 사본·화면·시험.

## 확인

- 이야기 21개가 모두 단위에 배정됐다. `traceability.json`은 행마다 첫 단위 하나만 싣고, 이 이야기 표가 기준이다.
- 단위 넷 모두 줄이 있다: U1 16줄, U2 9줄, U3 8줄, U4 1줄.
