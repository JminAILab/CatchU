# web — 최소 Functional Design

## 적용 범위

기존 회원·수신자 화면을 [API v1](../../../inception/contract-design/contract-summary.md)에 연결한다. 이 문서는 ui Unit의 화면 흐름/상태 정본이며 엔티티·DB·업무 규칙 저장소를 만들지 않는다. 세부 컴포넌트·props/state·시각 표현·시험 코드는 각 담당의 **개발 이슈로 보완**한다.

## 화면 흐름

| ID | 화면 책임·순서 | 계약/판정 주체 |
|---|---|---|
| W1 | 회원 진입 → 본인 프로필/연동 상태 확인 → 자가 입력 프로필 저장 → 지원 저장소 선택. 입력 출처와 검증 사실을 구분 | A/팀원 2. /me·/me/profile·/me/repositories. Access JWT 소비; 실제 OAuth 경로/연동 상세는 OQ-A1 |
| W2 | 현재 고지·범위를 읽고 동의 → 사용자 분석 요청 → 접수/기존 작업 응답 표시 → 상태 조회 | E/팀원 2. /analysis-notice·/analysis-requests. 새 요청 202, 같은 저장소 진행 작업 200, 다른 저장소 진행 작업 409 |
| W3 | processing/application을 구분해 진행·실행 불명·정상 0건·부분 실패·반영 실패 표시 → ownerResultsReady와 registeredCatchIds로 본인 결과 진입 | E/팀원 2. 후보 존재/F 종료만으로 결과 버튼 활성화하지 않음; 조회 오류는 작업 실패/0건이 아님 |
| W4 | 본인 Catch 목록/상세 → 근거·본인 기여 확인 → 초안/생성 실패 상태와 최소 질문 확인 → 불일치 표시 | B/팀원 4. /catches와 confirmation/mismatch. 없는 동기·성과·초안을 보충하지 않음. 최소 질문은 본인만, 답변 저장 없음 |
| W5 | 근거·기여 확인 완료 → ‘지금 공개’ 기본 제안 → 사용자의 자산별 별도 공개 선택 → 서버 확인 후 공개 상태 표시. 숨기기도 서버 결과로 반영 | B/팀원 4. visibility PUT. 초안 없어도 다른 공개 조건 충족 시 가능; 확인 완료만으로 자동 공개하지 않음 |
| W6 | 본인 링크 목록 → 제목·선택 비밀번호로 발급 → 링크 복사/상태 확인 → 선택 링크 중단 | C/팀원 3. /share-links·stop. 현재 공개 Catch 전체의 링크이며 자산 선택 없음. 대표/공개 Catch 없이도 발급 가능 |
| W7 | 수신 URL → 공통 접근 불가 또는 비밀번호 입력 → 허용된 현재 프로필/Catch 목록 → Catch 상세 | C/D·팀원 3. /public/links/{token}·unlock·catches/{catchId}. 로그인 없는 접근, 현재 권한 판정은 api |
| W8 | 명세 code로 오류 안내 → 조회 실패는 재조회 안내, 확정 실패의 재요청은 서버 retry.allowed 확인 → 사용자 새 동의 후 W2 | E/팀원 2·오류 공통 팀원 3. 새 키/분석 POST 자동 재호출 없음; 정상 0건/부분 결과 보완/재분석은 보류 |

## 화면 상태 전이

| 상황 | 표시·다음 행동 | 금지하는 치환 |
|---|---|---|
| 조회 시작 → 응답 | 로딩 → 성공 목록/상세 또는 정상 빈 자료 | 응답 전 빈 배열을 정상 0건으로 확정 |
| 조회 오류 | LOOKUP_FAILED 또는 API code에 맞는 안내; 재조회 가능 | processing=FAILED/EMPTY로 간주, 새 분석 자동 요청 |
| QUEUED/RUNNING | 접수/진행 표시; 같은 요청의 상태 확인 | F 결과가 없는데 생성 완료/등록 성공 표시 |
| UNCERTAIN | 실행 확인이 아직 안 됨을 표시 | 시간 경과만으로 실패 확정·새 동의 없는 재요청 |
| EMPTY·APPLIED | 정상 등록 적합 후보 0건 안내 | 오류/근거 부족 설명을 수집 실패로 혼합 |
| PARTIAL_FAILED | 제공된 결과와 실패 영향을 분리 표시; 준비된 등록 ID만 열람 | 실패 후보를 존재하는 Catch처럼 표시, 추가 생성 자동 호출 |
| APPLY_FAILED/RECOVERING | 처리 결과와 서비스 반영 실패/복구 상태를 구분 | 분석 실패 재요청으로 전환 |
| FAILED·APPLIED·CLOSED | 서버 retry.allowed가 true인 경우만 사용자 재요청 안내 | 과거 동의 재사용, 선행 이력 검사 우회 |
| 확인/공개 저장 중 → 응답 | 동일 상태 변경의 진행·성공·실패 표시; 실제 서버 값 기준 | 확인만으로 PUBLIC 표시, 거부된 공개를 성공 처리 |
| 수신 접근 | LINK_UNAVAILABLE는 없는/중단/만료 공통 안내. 유효 링크의 PASSWORD_REQUIRED/INVALID는 비밀번호 분기 | 존재/중단/만료 상세 사유 노출, grant만으로 현재 권한 우회 |

수신자 목록의 정상 0건은 200 응답의 빈 catches이며 조회 실패 500과 구분한다. 숨김·타인·없는 Catch 상세는 RESOURCE_UNAVAILABLE 공통 안내다. 다음 조회마다 현재 권한을 적용하며 이미 열린 화면을 실시간 회수하는 기능은 약속하지 않는다.

## API 소비 경계

| 항목 | web의 책임 |
|---|---|
| 목록 형식 | 회원은 items/page, 수신자는 profile/catches/page. opaque cursor를 해당 조회에만 사용; 다음 페이지도 새 권한 판정 결과를 표시 |
| 오류 | code/message/details를 소비하되 message 문자열 비교로 분기하지 않음. 알 수 없는 응답은 오류로 표시하고 성공/빈 자료로 추정하지 않음. #88 공통 해석 적용 |
| 재전송 | 생성 POST의 Idempotency-Key는 같은 사용자·operation·본문 요청에 유지. 응답 불명에 새 키로 자동 재요청하지 않음; 서버의 기존 자원 응답을 사용 |
| 공개 자료 | PublicCatch에 있는 근거·기여·draft만 표시. reflection·본인 확인/불일치·내부 ID·링크 제목을 수신자 화면에서 재구성하지 않음 |
| 초안/질문 | GENERATED와 실패/미생성을 구분. draft.content=null을 생성된 설명으로 표시하지 않음. 최소 질문의 상세 표시는 B 개발 이슈, 수신자 공개/답변 저장 없음 |
| 상태 정본 | 권한·등록·공개·링크 유효성·재요청 가능성은 api가 판정. worker와 직접 통신하거나 ProcessingEvent/ResultReceipt를 web에서 해석하지 않음 |
| 보호·캐시 | 본문/응답 영속 캐시 금지, no-store 준수. JWT/grant·비밀번호·민감 원문을 URL/로그로 추가 유출하지 않음. 실제 토큰/grant 저장·수명은 OQ-A1/C1 담당 설계 |

## 담당자 확인 요청

- 팀원 2 A/E: 회원·연동·동의/재요청·결과 진입 상태의 소비 확인.
- 팀원 4 B: 근거/초안/최소 질문·확인/별도 공개·불일치 화면 확인. **PR #89 병합 전 필수**.
- 팀원 3 C/D: 링크 발급·중단·현재 수신 접근·비밀번호/공통 오류·#88 연결 확인.

## 추적 정보

[작성 확인](functional-design-questions.md) · [추적표](traceability.json) · [Unit](../../../inception/units-generation/unit-of-work.md) · [Unit 매핑](../../../inception/units-generation/unit-of-work-story-map.md) · [requirements](../../../inception/requirements-analysis/requirements.md) · [components](../../../inception/domain-design/components.md) · [API](../../../inception/contract-design/contract-summary.md) · [회원 YAML](../../../inception/contract-design/member-api.yaml) · [수신자 YAML](../../../inception/contract-design/recipient-api.yaml) · [공통 DTO](../../../inception/contract-design/common.yaml).

보류 제품 정책과 담당 미결은 API Open questions를 따른다. 선택 산출물 frontend-components.md는 작성하지 않는다. 첫 연결 M1 마일스톤·단계 최종 승인과 담당 PR 리뷰는 별도다. 자료 조건: [#37](https://github.com/JminAILab/CatchU/issues/37).
