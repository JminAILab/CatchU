# web Functional Design 검증

## 수행 결과

| 검사 | 결과 |
|---|---|
| 작성 확인·자동 저장 | u1-web 확인 등록 성공, 필수 산출물 2개 ARTIFACT_CREATED가 같은 확인 식별자에 연결 |
| 화면 추적 | Unit 매핑에서 web 관련 현재 적용 FR 22개와 일치. W1~W8 실재·누락/연결되지 않은 흐름 0 |
| 문서 | 필수 절 검사 통과, 질문/산출물 로컬 링크 16개 존재. UI의 entities/rules 및 선택 frontend-components를 생성하지 않음 |
| 계약 경계 | 회원 items/page·수신자 profile/catches/page, code 기반 오류, 별도 공개 선택·질문 본인 제공·서버 상태 정본을 연결 |
| 보존 | 기존 별도 미커밋 11개 해시 유지. PR #89 본문/base·api 고정본·상류 기록 수정 없음 |

## 자동 추적 검사 안내

자동 fire `285599d6`는 pass=false, findings_count=43이다. 배정 밖 FR 20개, 화면 W target에 BR 형식을 요구하는 항목 22개, rules.md 부재 1건이다. gaps/orphans/missing_from_table/invalid_entries는 빈 배열이다. 통과로 바꾸지 않는다.

단계 정의의 produces_kinds에서 ui는 entities/rules 대상이 아니며 functional-spec을 자체 화면 흐름 정본으로 규정한다. 확인한 산출 범위도 functional-spec·traceability 두 파일이다. 따라서 실제 W 흐름으로 FR을 대조하고 검사 통과용 규칙 파일/가짜 BR·US ID를 만들지 않았다. 관측된 UI 산출 범위와 검사의 불일치이며 검사 소스 조사·수정·수동 재호출은 하지 않는다. 독립 검토 및 공식 완료 결과는 별도 기록한다.

## 한계·추적 정보

제품 구현·브라우저 동작·실제 로그인/DB/외부 호출·CI 검증은 이번 문서 작업에 포함되지 않는다. 상세 컴포넌트/표시·시험은 담당 개발 이슈, api의 미해결 R-01과 B의 PR #89 병합 전 확인은 유지한다.

확인 식별자: `b89cc5f02df0a9508bb4f3904ff7fbb3892ae8708633e11e6a481c672ea7af00`.
공식 검토 요청: `review:b5d1ffd6f01652f496400b101a364e5d`.

독립 검토 1회 READY, Minor 1건. [검토 사본](review.md)은 공식 기록 body를 보존한다. R-01 New: 수신 접근 행의 PASSWORD_REQUIRED/INVALID를 정확한 LINK_PASSWORD_REQUIRED/LINK_PASSWORD_INVALID로 표기해야 한다. 최종 승인 판단에 제시하며, 해결/위험 수용으로 바꾸지 않는다.

2026-09-23T08:11:59Z에 UNIT_COMPLETED(u1-web, wave)가 성공했다. 이후 공식 조회는 세 Unit 작성 완료 후 Functional 단계 최종 확인 대상으로 전환했다. 단계 승인/intent 종료는 아직 하지 않았다.

## R-01 한정 수정·재검토

사용자 Request Changes에 따라 수신 접근 행의 PASSWORD_REQUIRED/INVALID 한 곳만 LINK_PASSWORD_REQUIRED/LINK_PASSWORD_INVALID로 바꿨다. 그 교체 외 functional-spec 본문과 traceability는 수정 전 HEAD와 바이트 비교로 동일함을 확인했다. 계약과 worker는 변경하지 않았다.

[재검토 사본](review-revision-1.md): READY / R-01 Resolved / 신규 지적 0. 과거 리뷰는 보존하고 새 revision attempt의 별도 검토 기록을 연결했다. 기존 회고·추적 검사 한계·B 담당 확인 조건은 유지하며 단계 최종 승인은 별도다.
