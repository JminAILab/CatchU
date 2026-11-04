# U4 발행·링크 — 논리 구성 요소

## Sources

작성일: 2026-10-29. 입력: [U4 비기능 요구사항](../nfr-requirements/)(performance-requirements·security-requirements·scalability-requirements·reliability-requirements·observability-requirements·tech-stack-decisions), [U4 기능 명세](../functional-design/functional-spec.md)(functional-spec) 「의존 처리」·W1~W6, [계약 요약](../../../inception/contract-design/contract-summary.md)(contract-summary) C-02~C-14, [비기능 설계 질문·답변](nfr-design-questions.md) Q1·Q2, 이 단계의 [보안 설계](security-design.md)·[신뢰성 설계](reliability-design.md).

## 구성 요소

| 구성 요소 | 위치 | 하는 일 | 적용 NFR |
|---|---|---|---|
| 작성자 발행본 API | `api/src/publications` | 발행·목록·상세·중지·삭제(C-09 합의 뒤 reindex) | NFR1.1, NFR4.2~4.6, NFR5.1~5.7 |
| 받은 사람 경로 | `api/src/publications` | `GET /public/links/{token}`, unlock (`@Public()` 메서드 단위) | NFR1.2, NFR1.3, NFR1.7, NFR1.12 |
| `PublicationAccess`(C-10) | `api/src/publications` | 받은 사람·작성자 판정, `readSnapshot`. U5·U10·U9가 import | NFR1.3, NFR1.4, NFR1.6, NFR4.7 |
| Catch 설명·텍스트 자료 API | api (모듈 위치는 코드 생성 계획에서 정함) | C-13·C-14 저장 | NFR1.1, NFR4.2 |
| 링크 도구(재사용) | `api/src/share-links/`의 표·API 비의존 도구 | 토큰·비밀번호·grant·제한기 | NFR1.5~1.7, NFR4.4, NFR4.13 |
| 받은 사람 화면 | `web/src/features/recipient/`, `web/src/app/s/[token]` | 판정 응답 처리, unlock, grant, 0~4 자리 배치 | NFR1.10, NFR1.11, NFR7.1~7.4 |
| 작성자 화면 | web (위치는 코드 생성 계획에서 정함) | 설명·자료 편집, 발행, 발행본 관리 | NFR6.1, NFR7.5 |

### 의존 방향 (R-05)

- OQ-U4-NFR-6 합의 전 처리로 `publications → member-profile`(`OwnerProfileReaderModule`, 소유 회원 상태 읽기)을 허용한다. 반대 방향은 막는다.
- 허용하는 방향: `publications → catches`(발행 트랜잭션이 `catch_asset`을 잠그고 읽음, 공개 전환), `publications → 텍스트 자료`(위치는 코드 생성 계획에서 정함), `publications → share-links 도구 파일`, `publications → U2·U3 인터페이스`.
- 막는 방향: `catches → publications`, 텍스트 자료 → `publications`, `share-links 도구 → publications`. Catch 설명 API를 `catches`에 두든 다른 곳에 두든 `publications`를 import하지 않는다.
- 판단 기준: 코드 생성 계획에서 모듈 위치를 정할 때 위 방향만 허용한다. 순환 import나 Nest 모듈 순환(`forwardRef` 필요)이 생기면 멈추고 위치를 다시 정한다. `forwardRef`로 우회하지 않는다.

### 받는 경계 (가짜로 개발)

`AiRun`·`DailyRunLimit`·`AiConsentGate`·`FileStorage`(U2), `PublishedIndexWriter`(U3)는 인터페이스로 주입받는다. U4 운영 코드에 임시 구현을 두지 않고 시험에만 가짜를 둔다. `PublishedSearch.getIndexState`(C-09)는 합의 전 쓰지 않는다(OQ-U4-5).

## 실패 영역과 영향 범위

| 실패 | 영향 범위 | 격리 |
|---|---|---|
| 발행 트랜잭션 안 실패(잠금 대기 초과 포함) | 그 발행 요청 하나 | 전체 롤백, 공개 전환·하루 횟수 남지 않음 |
| 작업 등록 실패(U2) | 그 발행본의 색인·요약 | 발행은 성공, 시한으로 실패 확정 |
| 파일 저장소 접두어 삭제 실패(U2) | 그 삭제 요청 | 500, DB 유지, 사람이 다시 시도 |
| api 재시작 | 메모리 제한기 기록 | 기록 초기화(한계로 기록, NFR4.13) |
| 판정 오류 | 받은 사람 쪽 모든 기능(U5·U10·U9 포함) | C-10 하나를 함께 쓰므로 시험은 U4가 S8·S9로 묶어 본다 |

## 공유 자원

- PostgreSQL: U4 표(`publication`·`published_item`·`text_material`, `catch_asset` 설명 칸)와 U3·U5·U10이 붙는 자식 표. 외래 키 연쇄로 묶인다.
- api 프로세스 메모리: 발행 빈도·unlock 시도 제한기 기록.
- 10월 `share_link` 표: U4 새 흐름은 쓰지 않고 지우지도 않는다(OQ-U4-3).

## 10월 코드 정리 (W6 연결)

10월 발급·목록·중지 API와 `ShareLinksService`·`LinkAccessService`, `api/src/recipient/`의 공개 프로필·Catch 경로, web의 공개 Catch 목록·상세 화면과 `/s/[token]/catches/[catchId]` 경로는 W6에서 앱에서 빼고 지운다. 이 제거는 새 받은 사람 경로 등록과 한 변경으로 하고, 경로 중복 확인 시험을 함께 넣는다([보안 설계](security-design.md) 「받은 사람 경로 교체」). 재사용 도구와 `share-link.entity.ts`(및 `member-analysis`의 `createShareLink`·`idempotent-creation.ts`)는 남기고, 10월 발급·목록 전용 파일 일곱 개(`share-create*`·`share-link-issuance`·`share-link-list`·`share-link-response`·`share-link-state`·`issue-rate-limit`)는 같은 변경에서 지운다(목록과 확인 항목은 [보안 설계](security-design.md) 「받은 사람 경로 교체」). `PublicationsModule`은 grant 키·web 주소 설정·unlock 제어·빈도 제한기·시계를 자기 공급자로 선언해 `ShareLinksModule` 없이 기동 검사를 유지한다([보안 설계](security-design.md) 「`PublicationsModule` 공급자 구성」). 그 뒤 `share-links` 폴더 이름과 내용이 어긋나는 것은 Q1 A의 감수 사항이다.
