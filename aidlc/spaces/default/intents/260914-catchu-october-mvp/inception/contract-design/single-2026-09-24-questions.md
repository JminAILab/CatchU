# Contract Design 단독 정정 — 2026-09-24 title·repositoryId·OQ-B1

## 사용자 결정과 수정 범위

근거는 PR #97(`3434ffc`)의 `docs/ai-dlc-input-mvp/2026-09-14_followup.md` 중 「팀장 확인 (2026-09-24): B 계약 확인·내 자산 화면 구조」와 이번 작업의 사용자 지시다. 입력 문서는 #89보다 먼저 또는 함께 dev에 병합된다.

### Q1. 어떤 응답·메시지 필드를 추가하는가?

[Answer]: `worker-messages.yaml`의 Candidate와 `common.yaml`의 Catch·PublicCatch에 필수 `title`을 추가한다. 타입은 string, minLength는 1이다. `common.yaml`의 Catch에만 필수 `repositoryId`(string, minLength 1)를 추가하며 PublicCatch에는 넣지 않는다. 본인 화면과 수신자 화면은 같은 Catch 제목을 쓴다. F의 생성·대체 규칙과 B 저장·수정 금지는 functional-design의 별도 정정으로 연결한다.

### Q2. 목록 조건은 어떻게 추가하는가?

[Answer]: `member-api.yaml`의 listCatches에 선택 query `repositoryId`(string, minLength 1)를 추가한다. 기존 `sourceRequestId`와 함께 주면 두 조건을 모두 만족하는 본인 Catch만 반환한다. `contract-summary.md`의 catches 설명에 저장소 필터를 추가하고 PublicCatch 설명에 `title`을 추가한다. 저장소 식별자는 기존 sourceRequest 연결에서 유도하며 DB 칼럼을 추가하지 않는다. 선정 저장소 이름은 web이 기존 `/me/repositories`와 합쳐 표시한다.

### Q3. OQ-B1에는 어떤 결정을 기록하는가?

[Answer]: `contract-summary.md`의 OQ-B1 행을 다음 결정으로 바꾼다. “2026-09-24 팀장 결정: B 등록(Catch·근거·등록 연결)과 E 반영 완료 기록을 한 트랜잭션으로 저장한다. 수신 기록은 그 전에 E가 저장한다. 등록 함수의 입출력과 테이블 생성 순서는 E↔B 등록 개발 이슈에서 정한다.” 계약·ERD 관계와 유일성은 바꾸지 않는다. api functional-spec의 같은 정정은 functional-design에서 수행한다.

### Q4. 기존 열린 실행과 거부 결과는 어떻게 기록하는가?

[Answer]: 9/23부터 열린 contract-design 단독 실행 안에서 진행한다. 같은 실행 차수에 9/23 R-01·R-02(90bf289)와 9/24 변경이 함께 기록된다. 엔진 결함 때문에 차수를 나눌 수 없어 문서로 구분한다. 9/23 질문·검증 파일은 그대로 보존하고 이번 별도 파일을 사용한다. 이번 검토 기록과 `report --single`은 각각 한 번만 시도한다. 거부되면 재호출·질문 파일 이동·영수증 추가 생성·검사 우회 없이 검증 문서에 기록하고 실행을 열어 둔다. 이후 변경도 같은 차수에 쌓인다는 점을 명시한다.

## 검증과 보존 범위

- 변경 파일: worker-messages.yaml, common.yaml, member-api.yaml, contract-summary.md. 이번 질문·검증 문서와 도구가 남긴 260914 intent 감사·상태 기록을 함께 보존한다.
- YAML 문법·모든 `$ref` 해석·required/properties 정합성과 title/repositoryId의 범위, 두 필터의 AND 조건, 적용 가능한 계약 sensor 결과를 확인한다.
- requirements·ideation·domain-design, 기존 B 확인 조건(OQ-B1 행 제외), 제목/표현만 바꾼 중복 등록 금지 문구는 수정하지 않는다. 미공개/숨김과 불일치 표시의 공개 허용 의미, 9/23 R-01·R-02 계약은 유지한다.
- docs 아래 문서와 PR #89 본문, 기존 미커밋 intents.json·260920 web-mock-demo 관련 파일은 수정·커밋하지 않는다. 버전 2.8.1을 유지한다.
- 엔진 결함(2.10.0에도 남음)으로 단독 실행의 차수 분리·완료가 불가한 단계는 문서로 변경 건을 구분하고, 수정본은 PR #89 팀장 확인으로 확인한다.

## Consolidated Summary Confirmation

Candidate·Catch·PublicCatch의 필수 title, 회원 Catch의 필수 repositoryId와 목록의 저장소 AND 필터, PublicCatch 설명, OQ-B1의 트랜잭션 결정을 위 네 파일에 반영한다. 9/23부터 열린 같은 실행에서 이번 변경을 별도 문서로 구분하고 검증·검토·완료 기록을 위 조건대로 남긴다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
