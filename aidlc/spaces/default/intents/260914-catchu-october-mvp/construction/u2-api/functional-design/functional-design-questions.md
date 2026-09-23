# api Functional Design — ERD v1 작성 전 확인

## 재사용과 작성 범위

PostgreSQL·TypeORM(마이그레이션 포함)·Redis 확정을 전제로, 개발 기준 ERD v1을 논리 모델과 제약으로 작성한다. SQL·프레임워크 구현은 만들지 않고 물리 스키마로 옮길 때 지켜야 할 관계·유일성·필수 값·상태·원자성 조건을 빠짐없이 적는다. 새 제품 정책 질문은 없다.

| 파일 | 작성 범위 |
|---|---|
| entities.md | A의 MemberAccount·MemberProfile·GitHubConnection, E의 AnalysisRequest·AnalysisConsent·AnalysisAttempt, B의 CatchAsset·CatchEvidence·RepositoryProtection, C의 ShareLink를 YAML 논리 모델로 정의. 멱등·결과 수신/등록 연결에 필요한 최소 기술 메타데이터는 업무 엔티티와 구분 |
| rules.md | 사용자당 ACTIVE 1개·동일 저장소 기존 작업 반환, 실패 확정/새 동의 재요청, 결과/반영·등록/공개 분리, 소유권·현재 접근·유효 링크 제약을 기존 계약에서 연결 |
| functional-spec.md | 요청/동의 접수 → F 결과 수신 → B 등록/정본 → E 반영/열람 준비 → 확인·별도 공개 → 수신자 현재 접근 흐름, 상태 전이·오류/동시성 경계와 ERD 관계도 |
| traceability.json | api에 주 배정된 FR 19개와 규칙을 연결. 새 US ID·보류 정책을 추가하지 않음 |

## 고정할 제약

- F의 AnalysisResult·WorkCandidate·AnalysisEvidence·DraftOutcome는 서비스 DB에서 제외하고 외부 식별자로만 참조한다. E의 수신/반영 확인 메타데이터를 F 원문 결과 저장소로 확대하지 않는다.
- CatchAsset 1:N CatchEvidence로 두고 CatchAsset.evidenceReferences 중복은 없앤다. 초안 본문·생성 상태와 최소 질문은 B(CatchAsset)의 서비스 정본이며 수신자 투영에서 최소 질문을 제외한다.
- ShareLink는 소유자의 현재 공개 Catch 전체를 조회하며 링크–자산 연결 테이블은 만들지 않는다. ‘중단되지 않고 아직 만료되지 않은 링크’에 한해 사용자별 최대 5개·trim 제목 유일성을 표현한다. 동시 발급에도 원자적으로 지켜야 함을 명시하며 시간 경과로 만료되는 조건을 정적 유일성만으로 충족했다고 쓰지 않는다.
- 요청·동의·시도·등록 Catch의 소유자/저장소/범위 일치, 결과 재전달 시 중복 등록 방지, B 저장 뒤 E 반영 기록 실패의 복구 가능성을 제약과 흐름으로 연결한다. 반영 복구를 분석 재호출로 바꾸지 않는다.
- 보관/삭제·재분석·동의 재사용·기존 Catch/링크 변경·원본 재공개 정책은 새로 결정하지 않는다. 미결 인증·grant 수명/저장·실제 전송·workIdentity 상세는 담당·막는 실제 연결을 명시한다. 미결을 임의 기본값이나 삭제 cascade로 확정하지 않는다.

## 담당자 확인 요청

- 1 F/H/I·2 A/E: F 외부 식별자와 요청/동의·수신/반영, #86/#87 연결 확인.
- 3 C/D: 링크의 현재 접근·비밀번호·만료/중단·제목/개수 제약과 화면 상태 연결 확인.
- 4 B: 근거 1:N·초안/질문 정본·중복/등록·본인 확인/공개 경계 확인. PR #89 병합 전 필수.

## 추적 정보

[unit-of-work](../../../inception/units-generation/unit-of-work.md) · [unit-of-work-story-map](../../../inception/units-generation/unit-of-work-story-map.md) · [requirements](../../../inception/requirements-analysis/requirements.md) · [components](../../../inception/domain-design/components.md) · [contract-summary](../../../inception/contract-design/contract-summary.md) · [단독 수정 상태](../../../inception/contract-design/single-r01-r02-verification.md). 자료 조건은 [#37](https://github.com/JminAILab/CatchU/issues/37).

R-01·R-02 수정본 90bf289를 사용하고 Contract 단독 실행은 열린 상태로 보존한다. 이번 API/ERD 계약은 담당 PR 리뷰로 확인하며, PR #89 본문은 API·ERD가 모두 준비된 리뷰 요청 때 사용자의 별도 기준으로 한 번 정리한다. Functional 단계 전체 최종 승인은 web 최소 설계까지 마친 뒤 별도다.

## Consolidated Summary Confirmation

기존 API 계약을 기준으로 api ERD v1 전체와 업무 규칙·상태 흐름·추적표를 작성한다. F 서비스 DB 제외·CatchEvidence 1:N·B 정본·현재 공개 자료와 유효 링크 제약을 고정하고, 담당자 상세 설계와 보류 제품 정책은 구분해 남긴다. 구현·외부 호출·뼈대·CI·PR 병합/base 변경은 하지 않는다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]:
