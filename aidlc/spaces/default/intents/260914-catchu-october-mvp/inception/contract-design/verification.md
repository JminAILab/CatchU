# Contract Design 검증 기록

2026-09-23 · 문서/스키마 검증이며 제품 실행·외부 호출 검증이 아니다.

## 확인 결과

| 검사 | 결과 |
|---|---|
| 공식 작성 전 확인 | Looks correct 등록 성공. Summary Authorization Id: `3923df789b12fca3d5382915a0c4d2e548ab910a2e945bc4417e961dd0af7248` |
| 자동 저장 연결 | contract-summary.md 및 YAML 4개 모두 현재 확인 식별자가 연결된 ARTIFACT_CREATED/UPDATED 기록 확인 |
| YAML | Ruby YAML.safe_load로 4개 파일 및 본문 OpenAPI 블록 3개 파싱 통과 |
| 구조 | 로컬/외부 $ref 177개 해소, operationId 18개 고유, path parameter와 security scheme 선언 대조 통과 |
| 센서 | required-sections: 11개 H2 통과; upstream-coverage: Unit 정의/의존·components·requirements 4개 참조 통과 |
| 로컬 링크 | 요약·질문·followup의 상대 문서 링크 17개 대상 존재. URL/앵커 전수 검사 아님 |
| 합성 예시 | 아래 14개 schema/업무 조건 검사 통과. 과거 자료 사용 없음 |
| 공백 | 작성 중 추적 파일의 git diff --check 통과. 신규 파일을 stage한 최종 검사에서는 member-api.yaml 114·295행의 YAML 배열 대시 뒤 공백 2건이 남음. 구문 파싱은 통과했으며 독립 검토 뒤 원본을 고정함 |

## 합성 예시 검사

- 유효 초안 실패 후보가 PARTIAL_FAILED로 전달됨
- 오류 없는 정상 0건
- 실패를 정상 0건으로 위장 금지
- 실패 초안에 생성 본문 위장 금지
- 근거 없는 후보 스키마 거부
- 초안 없는 공개 DTO 허용
- 수신자 최소 질문 노출 금지
- 수신자 처리 결과 ID 노출 금지
- 오류 검증 details 허용
- 오류에 원문 입력값/stack 추가 금지
- 명시 동의한 신규 입력
- 미동의 입력 거부
- 클라이언트 소유자 지정 거부
- worker 외부 토큰 필드 거부

functions.exec에서 Ruby로 실제 저장 YAML을 읽은 JSON을 대상으로 type/required/enum/additionalProperties/minItems와 결과 상태 불변 조건을 검사했다. 이 커스텀 검사는 OpenAPI 전체 표준 적합성 검사기나 서비스 구현 시험을 대신하지 않는다. Python yaml/jsonschema는 설치되어 있지 않아 사용하지 않았고 패키지를 설치하지 않았다. 정상 0건·초안 실패 합성 후보는 허용하고, 실패를 0건/생성 성공으로 위장·근거 없는 후보·미동의/소유자 주입·수신자 질문/내부 ID 및 오류 stack 주입은 거부되는 기대값을 대조했다.

## 미실행과 담당 확인

- 실제 회원 인증/OAuth·HTTP·DB 경합/트랜잭션·수신자 권한/응답 시간·worker 전송/보존·제품 테스트/CI는 미실행이다.
- 정량 제한·OAuth/grant·원본 관측·업무 중복 판정의 담당 제안과 실제 연결은 contract-summary의 Open questions로 추적한다. mock 결과는 실제 분석 증거가 아니다.
- [독립 검토](review.md)의 공식 REVIEW_COMPLETED 기록을 확인했다. READY advisory이며 R-01 Major(식별 불가능한 메시지의 거부 경계), R-02 Minor(회원/수신자 목록 필드 설명)가 New로 남는다. 지적을 해결/수용한 것으로 바꾸지 않았으며 최종 승인 시 사용자가 판단한다. B 확인은 PR #89 병합 전 필수다.

## 검토 대상 해시

| 파일 | SHA-256 |
|---|---|
| contract-summary.md | 525544a7cdf7cab1a0b1919ea9f1e9a94000e5aaed930f0098a7f8c1837de6dc |
| common.yaml | 64e5c5db97c16ec62c1feab6fd97326806f5af9e3902da977f0cd0993b670b9f |
| member-api.yaml | fed2c8944694264d424f3ff9d212ba3dc2aff046e7dda9773b8b046ec44aaa04 |
| recipient-api.yaml | ab8aea74ea8b0d1be4430b4774cb9ee331ea1338518c6830562b7f8ca0f98399 |
| worker-messages.yaml | 154220854ff1a28fa634f5427d0ab10aae4820273c4a3d32be8ca6a7521805b9 |
