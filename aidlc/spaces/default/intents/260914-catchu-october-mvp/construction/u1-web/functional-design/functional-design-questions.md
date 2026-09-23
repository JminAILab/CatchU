# web Functional Design — 최소 설계 작성 전 확인

## 재사용과 작성 범위

기존 화면·흐름과 승인 API를 재사용한다. web은 ui Unit이며 기능 흐름과 추적표만 Minimal로 작성한다. 새 제품 질문·화면 재설계·구현을 추가하지 않는다.

| 파일 | 최소 내용 |
|---|---|
| functional-spec.md | 회원/연동·분석 상태/결과 진입·Catch 확인/별도 공개·공유 링크/수신자 흐름을 계약 참조로 연결. 로딩/빈 자료/조회 오류와 비밀번호/공통 거부 분기를 짧게 구분하고 상세는 개발 이슈로 보완 |
| traceability.json | Unit 매핑에서 web과 관련된 현재 적용 FR의 화면 책임·흐름을 연결. 서비스 정본/권한/생성 책임을 web으로 옮기지 않음 |

frontend-components.md는 단계의 선택 산출물이므로 이번에는 만들지 않는다. 상세 컴포넌트·props/state·화면 구현과 시험 코드는 담당 개발 이슈에서 보완한다. api/worker의 업무 엔티티나 DB를 web에 복제하지 않는다.

## 유지할 경계

- Access JWT 회원 화면과 비로그인 수신자 화면을 구분한다. 회원 목록은 items/page, 수신자 목록은 profile/catches/page이며 오류는 code/message/details 계약을 따른다.
- 진행/실행 불명·정상 0건·부분 실패·조회 실패·반영 실패를 섞지 않는다. 결과 진입은 서버의 ownerResultsReady/registeredCatchIds를 따르고 새 POST/분석을 자동 호출하지 않는다.
- 초안 없음과 근거/기여 확인을 구분하고, 확인 완료의 ‘지금 공개’ 제안 뒤 사용자 별도 공개 선택을 유지한다. 최소 질문은 본인 화면만, 답변 저장은 추가하지 않는다.
- 링크의 현재 접근 판정과 비밀번호 분기를 유지한다. 현재 공개 Catch 전체를 표시하고 링크–자산 연결/수신자 선택을 새로 만들지 않는다. 본문 영속 캐시나 grant만의 권한 우회는 하지 않는다.
- 보류 정책과 담당 미결은 API Open questions를 참조하며 정하지 않는다. 첫 연결 결과 M1 승인·B의 PR #89 병합 전 확인·Functional 전체 최종 승인은 별도다.

## 담당자 확인 요청

- 2 A/E: 회원·연동·요청 상태와 서버 판정/결과 진입의 화면 소비 확인.
- 4 B: 근거·초안/최소 질문·본인 확인/별도 공개의 화면 책임 확인. PR #89 병합 전 필수.
- 3 C/D: 현재 공개 자료·링크/비밀번호·공통 오류 표시와 #88 연결 확인.

## 추적 정보

[Unit](../../../inception/units-generation/unit-of-work.md) · [Unit 매핑](../../../inception/units-generation/unit-of-work-story-map.md) · [requirements](../../../inception/requirements-analysis/requirements.md) · [components](../../../inception/domain-design/components.md) · [API](../../../inception/contract-design/contract-summary.md). 자료 조건: [#37](https://github.com/JminAILab/CatchU/issues/37).

api 독립 검토의 R-01(진행 이벤트에 Result의 세 ID/Receipt 규칙을 일반화한 문구)은 New로 보존한다. 이번 web 요약 확인이 지적 수정이나 위험 수용·단계 최종 승인을 대신하지 않는다. PR #89 본문은 사용자 별도 작성 기준 전까지 유지한다.

## Consolidated Summary Confirmation

기존 화면·API 계약을 재사용해 web의 functional-spec·traceability만 짧게 작성한다. 사용자 동작·오류/상태 표시 경계를 연결하고 세부 설계·구현은 개발 이슈로 남긴다. 확인 후 자동 저장 연결 검증·독립 검토를 진행한다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]:

