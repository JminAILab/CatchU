# Unit of Work — 발행 프리셋

근거: 구성 요소 `inception/domain-design/components.md`(18개)와 결정 `inception/domain-design/decisions.md`(ADR-001~009), 요구사항 `inception/requirements-analysis/requirements.md`, 이야기 `inception/user-stories/stories.md`, 범위의 작업 목록 `ideation/scope-definition/intent-backlog.md`(IB-1~IB-8), 팀 관행 면담 `inception/practices-discovery/evidence.md`(Q3·Q5), 이 단계 질문 `units-generation-questions.md`(Q1·Q2)와 단위 계획 승인(2026-11-19, 고친 판).

## 단위 목록

| Unit ID | Directory | 이름 | Kind | 크기 | 배포 |
|---|---|---|---|---|---|
| U1 | u1-preset-contract | 계약·프리셋 저장·앞선 사본 | service | XL | api에 들어감(embedded) |
| U2 | u2-applicant-screens | 지원자 화면(프리셋·발행) | ui | M | web에 들어감, api 조회 조건 하나 |
| U3 | u3-reader-views | 읽는 쪽 화면(탭·출처·자료 화면 탭) | ui | M | web에 들어감 |
| U4 | u4-privacy-policy | 개인정보처리방침 문구 | ui | S | web에 들어감 |

새 배포 단위는 없다. 네 단위 모두 지금의 web·api 배포에 들어간다(requirements Constraints). 모든 단위는 한 작업 브랜치 `api/publication-presets`에서 하고, U1의 계약 변경 PR을 먼저 dev에 연다(팀 관행 면담 Q3).

## U1 — u1-preset-contract (service, XL)

**한 줄**: 프리셋을 저장하고, 발행 요청을 프리셋 ID로 바꾸고, 사본에 프리셋 구분과 「앞선 사본인가」를 실어 AI 읽기 셋까지 맞추는 api 단위. 이 작업의 첫 단위다(skeleton on, 면담 Q5).

**맡는 구성 요소**: PublishableSource(새로 뗌), PresetLibrary(새), SnapshotContract, Publications, PublishedIndex, RagAnswer(기본 요약 근거·질의응답 머리글), SharedLinkReader. MemberAccount·MaterialLibrary는 코드를 고치지 않고 외래 키로 기댄다.

**책임**

- 발행 자격·사본 내용·글자 수 규칙을 발행 모듈에서 떼어 PublishableSource로 옮긴다(ADR-001). 지금 발행 시험이 그대로 통과해야 한다.
- 새 api 모듈 `presets`: 프리셋 목록(50개까지 한 번에, 상태는 읽을 때 셈)·만들기·고치기·지우기, 발행용 펴기(ADR-001·005, FR1.2~FR1.14, NFR2·NFR4·NFR6).
- 발행 요청 `{ title, password?, presetIds }`, 상한은 프리셋 항목을 더해 세기, 한 프리셋 안 중복만 거부, 공개 전환 없애기, 막힘 응답에 프리셋 ID와 자료, 오류 필터가 옮기는 칸 하나(ADR-002, FR2.2~FR2.11).
- 사본 항목에 프리셋 순번·발행 당시 이름(ADR-003), 사본 읽기 때 「앞선 사본인가」 값, 받은 링크 열람 응답에서 그 값 빼기(ADR-006).
- 조각 나누기·기본 요약 근거·질의응답 머리글·받은 링크 읽기가 앞선 사본만 쓰기(ADR-006·007, Q6·Q9). 받은 링크 읽기 담당과 JD 요약 담당이 계약 PR에서 이 변경을 함께 본다(단위 계획 고친 판).
- 마이그레이션: 프리셋 표 둘(회원 행에 연쇄 삭제, 항목의 Catch·텍스트 자료·PDF 칸 셋 모두 연쇄 삭제, ADR-004), 발행본 항목 칸 둘, 변경 전 발행본 DB 행 지우기. 변경 전 발행본의 PDF 사본 파일 지우기(FR5.1, 방법은 기능 설계).
- 시험: 탈퇴하면 프리셋이 지워지고 탈퇴가 막히지 않는지, 텍스트 자료·PDF를 지우면 프리셋에서 빠지는지(FR4.1·FR4.2). 연쇄 삭제를 만드는 단위에서 확인해야 탈퇴가 깨진 채 dev에 들어가지 않는다(단위 계획 고친 판).

**실제 연결 확인(첫 단위)**: api만으로 처음부터 끝까지 잇는다. 프리셋 만들기 → 프리셋 ID로 발행 → 받은 링크로 사본 읽기(프리셋 구분 칸 확인) → 조각과 받은 링크 읽기에 앞선 사본만 나옴 → 탈퇴·자료 지우기 때 프리셋이 함께 지워짐. 보여 줄 것과 실제 확인 방법은 Delivery Planning이 확정한다. 이 연결의 성공을 전체 완료로 보고하지 않는다(팀 관행 Walking Skeleton).

**구현 메모와 제약**

- 계약 변경(발행 요청·사본 읽기)이 들어가므로 PR을 먼저 올려 팀원 3, 받은 링크 읽기 담당, JD 요약 담당의 리뷰를 받는다(requirements Constraints).
- 이 단위의 계약 PR이 dev에 들어가면 U2가 들어올 때까지 dev의 발행 화면은 발행에 실패한다. 그대로 두고 첫 PR 본문에 적는다(Q2).
- 사본에 칸이 더해져도 web 응답 검사는 모르는 칸을 통과시키므로 받은 사람·작성자 화면은 그대로 열린다(`web/src/features/publications/publications-api.ts`).
- 프리셋 이름과 담긴 자료 내용을 로그에 남기지 않는다(NFR4).
- Unit 확인 명령은 `--timeout-ms 3600000`으로 돌린다(project.md Testing Posture).

## U2 — u2-applicant-screens (ui, M)

**한 줄**: 지원자가 프리셋을 만들고 고치고, 프리셋을 골라 발행하는 화면.

**맡는 구성 요소**: PresetScreens(새), PublishScreen, CatchLibrary(본인 Catch 목록의 「담을 수 있는 Catch만」 조건, ADR-009).

**책임**

- 프리셋 목록·편집 화면과 상단 메뉴 「프리셋」(FR1.1~FR1.14, 다듬은 화면 M1~M3).
- 자료 고르기를 발행 화면에서 프리셋 편집으로 옮김(작성자 설명 걸러 보기 포함).
- 본인 Catch 목록 조회에 「담을 수 있는 Catch만」 조건(api 쪽 한 곳).
- 발행 화면의 「프리셋 고르기」와 「고른 프리셋과 순서 (n/5)」, 고를 수 없는 이유, 막힘 응답 표시, 확인 단계(FR2.1~FR2.10, 다듬은 화면 M4).

**구현 메모와 제약**: 프리셋 이름은 글자로만 그린다(NFR3). 불러오는 중·비었음·실패를 구분한다(NFR5). 저장하지 않은 변경은 텍스트 자료 화면과 같은 경고를 쓴다. 모양 다듬기와 드래그는 하지 않는다(C-O4·C-T5).

## U3 — u3-reader-views (ui, M)

**한 줄**: 받은 사람 화면과 작성자 상세의 프리셋 탭·출처 이동, 자료 화면 탭. 화면만 담는다.

**맡는 구성 요소**: TabStrip(새), SnapshotViewer, RecipientScreen, PublicationDetailScreen, MaterialsScreen.

**책임**

- 자료 화면 탭 부품을 TabStrip으로 일반화(화살표 키, Home·End, 열린 탭만 Tab 순서, 텍스트 쪽 tabpanel)(FR7.1, ADR-008).
- 사본을 프리셋 순번으로 묶어 탭으로 그림, 출처 이동 공용 함수(탭 바꾸기 포함, 돌아가기 단추 없음)(FR3.2~FR3.5·FR3.7, ADR-008).
- 받은 사람 화면 순서(AI 요약을 발행본 자료 위로)와 응답 검사에 프리셋 구분 칸(FR3.1·FR3.4).
- 자료 화면 지우기 확인 문장에 「프리셋에 담겨 있으면 거기서도 빠진다」(FR4.1).

**구현 메모와 제약**: 「이 링크에서 할 수 있는 것」 안내는 dev의 모습(기본 접힘)을 따르고 건드리지 않는다. 탭을 시작할 때 팀원 3의 화면 정리가 dev에 들어와 있으면 그 위에서 시작한다(범위 Q4).

## U4 — u4-privacy-policy (ui, S)

**한 줄**: 개인정보처리방침의 저장 항목 표와 「하나씩 지우기」 문장에 프리셋을 더한다(FR4.3).

**맡는 구성 요소**: PrivacyPolicy.

**구현 메모와 제약**: 팀장 확정 문구로만 바꾸고, 원문 사본·화면·원문 출처와 SHA-256 시험을 함께 고친다. 확정 문구가 오기 전에는 시작할 수 없다. 외부 AI 절은 바뀌지 않는다(ADR-007).

## Assumptions & Open Questions

- U4는 다른 단위의 코드가 필요 없어 의존이 없다. 다만 방침이 말하는 프리셋 저장은 U1이 dev에 들어간 뒤에 사실이 된다. 언제 올릴지는 Delivery Planning이 정한다.
- U1의 크기(XL)는 계약 PR 하나에 AI 읽기 셋과 삭제 시험까지 담기로 한 결정(단위 계획 고친 판)에서 온다. U1 안의 순서는 `unit-of-work-story-map.md`에 적었다.
