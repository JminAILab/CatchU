# NC2 면접관 사본 칸과 표지 — 신뢰성 요구사항

입력:
- 기능 설계 `construction/nc2-snapshot-fields/functional-design/`(functional-spec.md, rules.md, entities.md)와 검토 `reviews/review-01.md`
- 요구사항 `inception/requirements-analysis/requirements.md`(NFR7, NFR8)
- 계약 `inception/contract-design/contract-summary.md`(C3·C6, 2026-11-10 덧붙임 포함)
- 기술 스택 `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- 이 단계의 답 `nfr-requirements-questions.md`(Q1 A, Q2 A와 덧붙임)

## 인셉션 NFR7(호환)에서 물려받는 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR7.1 | 이 변경 전에 만든 사본(새 칸 넷이 없음)은 오류 없이 지금 그대로 보인다. 칸마다 따로 있는지 보고 없는 칸은 그리지 않는다. `ownCommit`이 없으면 거짓으로 읽어 표지가 없다. | 화면 시험: 옛 사본 고정 자료로 받은 사람 화면과 작성자 발행본 상세가 지금과 같다(AC6.4.1). | NFR7, BR2.1, BR3.4 |
| NFR7.2 | web 사본 모양 검사는 새 칸이 없으면 받아들이고, 있으면 모양을 본다. 있는 칸의 모양이 틀리면 지금 다른 칸이 틀렸을 때처럼 사본 전체를 올바르지 않은 응답으로 본다. 받은 사람 web의 칸 고르기는 새 칸을 빠뜨리지 않고 옮긴다. | web 시험: 칸 없음 통과, 칸 있음 통과, 모양 틀림 거부. 받은 사람 화면에서 세 칸이 모두 보인다(AC6.4.2). | NFR7, BR2.1, BR2.2 |
| NFR7.3 | 발행할 때 저장소 등록 행을 읽지 못하면 `repositoryName`만 빼고 발행을 이어 간다(안전망). DB가 이 경우를 막으므로 시험은 하나다. 칸을 뺄 때 경고 한 줄을 남긴다(관측 요구사항 「안전망 경고 줄」). | api 시험 하나: 등록 행을 읽지 못한 경우를 만들어 발행이 되고 칸이 없으며 경고 줄이 남는다. | NFR7, BR1.1, Q1 A |

## 인셉션 NFR8(시험)에서 물려받는 요구사항

| ID | 요구사항 | 확인 방법 | 근거 |
|---|---|---|---|
| NFR8.1 | 수락 기준(US6~US8)을 시나리오로 먼저 두고 세부 시험 코드는 구현 뒤 작성·실행한다. 기존 시험은 계속 통과한다. 커버리지는 팀장이 넣은 서비스별 명령(`test:coverage`)으로 잰다. | Unit 확인 명령(`verification-command.txt`)이 60분 상한 안에서 통과한다. | NFR8, team.md 「Testing Posture」 |
| NFR8.2 | 문장 대조 시험(C6)은 api 한계 문장 상수 넷이 `worker/app/candidates/build.py` 파일 글자에 따옴표 경계째 있는지 본다. 한계 문장 둘은 큰따옴표째, 같은 작업 경고 앞부분 둘은 `f"` 시작째 찾는다. 원본의 한 문장만 바꾼 글자로는 실패하는 반례를 시험에 넣는다. 지금 CI가 `worker/app/*`가 바뀌어도 api 시험을 돌리므로 CI는 고치지 않는다. 본인 커밋 기여 범위 문장은 대조하지 않는다(`ownCommit`은 소속 기록으로 정함). | api 시험이 통과하고, 반례(문장 하나를 바꾼 원본 글자)에서 실패를 알린다. | NFR8, BR1.6, Q2 A와 덧붙임 |

## 확인 사항

- **사본은 고정:** 발행 뒤에 사본을 고치는 경로가 없다. 그래서 작성 시점·한계·`ownCommit`은 발행 때 값 그대로다(가정 A7과 맞음).
- **소속 기록이 없는 Catch:** 소속 기록(`commit_assignment`)이 생기기 전(마이그레이션 `1794054790720-CreateCommitAssignment`)에 등록된 Catch는 소속 기록이 없어, 발행해도 `ownCommit`이 모두 거짓이고 표지가 없다. 출시 직전 DB 초기화 뒤에는 모든 Catch에 소속 기록이 있으므로 한계로 둔다. 개발 서버의 옛 Catch로 표지를 확인할 때는 새로 분석한 Catch를 쓴다.
- **트랜잭션:** 새로 읽는 것은 모두 지금 발행 트랜잭션 안이다. 발행이 실패하면 지금처럼 롤백되고 사본이 반쯤 남지 않는다.
- **배포:** 사본 칸은 선택 칸만 더하므로 api와 web을 어느 순서로 배포해도 옛 web이 새 사본을, 새 web이 옛 사본을 읽는다(계약 C3 「더하는 변경」).

## Sources

- `construction/nc2-snapshot-fields/functional-design/rules.md`(BR1.1, BR1.4, BR1.6, BR2.1, BR2.2, BR3.4), `functional-spec.md`, `entities.md`, `reviews/review-01.md`
- `inception/requirements-analysis/requirements.md` NFR7, NFR8, 가정 A7
- `inception/contract-design/contract-summary.md` C3·C6
- `aidlc/spaces/default/codekb/CatchU/technology-stack.md`
- `nfr-requirements-questions.md` Q1 A, Q2 A와 덧붙임
- 지금 코드: `api/src/database/migrations/1794054790720-CreateCommitAssignment.ts`, `api/src/publications/publish.service.ts`, `web/src/features/publications/publications-api.ts`, `web/src/features/recipient/recipient-api.ts`, `.github/workflows/ci.yml`
