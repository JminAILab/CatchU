# Contract Design — 질문

근거: 단위 `inception/units-generation/unit-of-work.md`·`unit-of-work-dependency.md`(U1→U2, U1→U3), 구성 요소 `inception/domain-design/components.md`와 결정 `decisions.md`(ADR-002·003·004·006), 요구사항 `inception/requirements-analysis/requirements.md`(FR2.8, NFR2), 12월 계약 `aidlc/spaces/default/intents/260925-intent-12/inception/contract-design/contract-summary.md`(C-06·C-07·C-08·C-10·C-12·C-15·C-17과 「Contract ownership rules」), 코딩 절차 `docs/CatchU_coding_procedures.md` 「코딩 운영」 기준 문서 줄.

이미 정해진 것(다시 묻지 않음):

- 경계는 U1→U2(프리셋 경로, 발행 요청·막힘 응답)와 U1→U3(사본에 더하는 프리셋 순번·이름)이다. U4는 경계가 없다. 바깥 소비자는 받은 사람 브라우저(C-12)와 Claude 연결의 받은 링크 읽기(C-15)다.
- 받은 링크 읽기·기본 요약·질의응답 머리글의 앞선 사본 변경은 U1이 하고, 받은 링크 읽기 담당과 JD 요약 담당이 계약 PR에서 함께 본다(단위 계획 고친 판, ADR-002·006).
- 모든 경계는 같은 api 프로세스 안의 모듈 호출이거나 web→api HTTP다. 판본 번호를 따로 두지 않고, 12월 계약의 「에러 대응 최소선」(실패를 숨기지 않음, 다시 시도는 사람이 함, 자동 재시도 없음)을 그대로 따른다.
- 12월 계약 문서는 승인 기록이라 고치지 않는다(AGENTS.md). 바뀌는 계약은 이 단계 문서에 「바뀌는 12월 계약」으로 적는다.

지금 코드와 12월 계약에서 확인한 것:

- 12월 계약은 받은 사람 경로(C-12)를 「경로·메서드·핵심 필드·오류만 고정하고, 검증 값과 그 밖의 칸은 각 Unit의 기능 설계」로 정했다. 작성자 쪽 경로는 Unit 안이라 기능 설계에서 정했다.
- 지금 발행 거부는 오류 코드마다 따로다: 미확인 `409 CONFIRMATION_REQUIRED`, 보호 `409 SOURCE_RESTRICTED`(둘 다 `details.catchIds`), PDF 추출 미완료 `400`(`items[i].sourceId`). 오류 응답은 `details`에서 정해진 칸 셋(`violations`·`existingRequestId`·`catchIds`)만 옮긴다. 비공개 Catch는 지금 공개로 바뀌므로 막힘 코드가 없다(FR2.9로 없어짐).
- 코딩 절차는 12월 계약 설계를 「기준 문서」로 가리킨다(`docs/CatchU_coding_procedures.md` 77행).

## Q1. [설계] 단위 사이 계약을 어디까지 고정할까

U1이 주고 U2·U3이 쓰는 경계(프리셋 경로, 발행 요청·막힘 응답, 사본의 프리셋 칸)를 이 단계에서 얼마나 자세히 정할지입니다.

A. 12월 C-12와 같은 깊이로 경로·메서드·핵심 칸·오류 코드만 고정하고, 검증 값과 그 밖의 칸은 U1 기능 설계가 정한다. U2·U3 기능 설계는 U1 기능 설계를 따른다
B. 요청·응답의 모든 칸과 검증 값까지 이 단계에서 고정한다. U2·U3이 U1 기능 설계를 기다리지 않아도 되지만, 기능 설계에서 정할 질문(편집 화면의 자료별 글자 수 등)을 여기서 미리 정해야 한다
X. Other (please specify)

[Answer]: A

## Q2. [설계] 12월 계약을 기준 문서로 가리키는 팀 문서를 고칠까

코딩 절차는 12월 계약 설계를 기준 문서로 가리킵니다. 이 작업이 C-07·C-10·C-12·C-15 등을 바꾸면, 12월 문서만 읽는 사람은 바뀐 계약을 모릅니다(project.md: 규칙을 바꿀 때 같은 규칙을 적은 다른 문서를 함께 고친다).

A. U1의 계약 PR에서 코딩 절차의 기준 문서 줄에 「발행 프리셋 intent의 계약 설계가 바꾼 계약은 그 문서가 기준」이라는 한 줄을 더한다
B. 고치지 않는다. 이 작업의 계약은 이 intent 기록에만 둔다
X. Other (please specify)

[Answer]: B

## Q3. [설계] 발행이 막혔을 때 응답 모양

서버는 막히면 어느 프리셋의 어느 자료 때문인지 응답해야 합니다(FR2.8). 비공개 Catch는 이제 공개로 바뀌지 않으므로 막힘 이유가 하나 늘어납니다(FR2.9).

A. 지금 오류 코드(미확인·보호·추출 미완료)를 그대로 쓰고 비공개용 코드 하나를 더한다. 막힌 자료는 `details`에 프리셋별 자료 목록 칸 하나로 싣고, 오류 필터가 옮기는 칸에 그 하나를 더한다. 한 응답은 지금처럼 이유 하나만 말한다
B. 발행 막힘을 새 코드 하나로 모으고, `details`에 프리셋·자료·이유를 모두 싣는다. 여러 이유를 한 번에 보이지만 지금 코드를 발행에서 쓰지 않게 되어 바꾸는 곳이 는다
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- Q1: U1→U2·U3 경계는 12월 C-12와 같은 깊이로 경로·메서드·핵심 칸·오류 코드만 고정한다. 검증 값과 그 밖의 칸은 U1 기능 설계가 정하고, U2·U3 기능 설계는 그것을 따른다
- Q2: 코딩 절차의 기준 문서 줄은 고치지 않는다. 이 작업이 바꾼 계약은 이 intent 기록(contract-summary.md의 「바뀌는 12월 계약」)에만 둔다
- Q3: 발행 막힘은 지금 오류 코드(미확인·보호·추출 미완료)를 그대로 쓰고 비공개 Catch용 코드 하나를 더한다. 막힌 자료는 details에 프리셋별 자료 목록 칸 하나로 싣고, 오류 필터가 옮기는 칸에 그 하나를 더한다. 한 응답은 이유 하나만 말한다

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
