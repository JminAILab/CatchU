# 본인 Catch 목록·상세 조회 준비 — #130

> 2026-09-28 · 독립 구현 준비. 실제 HTTP·DB 조회는 연결 전이다.

## 이번에 동작하는 것

[`owner-catch-response.ts`](../src/catches/owner-catch-response.ts)는 조회 계층이 가져온 Catch·원 요청·근거·보호 판단을 받아 **본인용 Catch 응답**을 만든다. 다른 회원 자료와 없는 자료는 상세 매핑에서 모두 `null`이다. 본인 자료의 연결 누락·모순은 `CatchReadIntegrityError`로 거부하고 정상 빈 결과로 바꾸지 않는다.

- `toOwnerCatchResponse(authenticatedMemberId, source)`: 한 건 또는 `null`을 반환한다.
- `toOwnerCatchPage(authenticatedMemberId, sources, nextCursor)`: 조회가 성공한 페이지를 `{items, page: {nextCursor}}`로 포장한다. 잘못된 항목을 조용히 제외하지 않고 페이지 전체의 오류로 전달한다.
- `authenticatedMemberId`는 향후 공통 인증 Guard의 검증 결과를 넘기는 자리다. 문자열 비교만으로 인증이 구현됐다고 보지 않는다.
- 입력 타입은 ERD의 필요한 속성만 담는 내부 읽기 모델이다. TypeORM 엔티티, 실제 컬럼 타입, 공개 요청 DTO를 새로 정의한 것이 아니다.

## 값을 가져오는 곳과 지킬 경계

| 응답 | 원본과 검사 |
|---|---|
| 제목·사실·기여·원 결과/후보·생성 방식 | CatchAsset에서 보존한다. 새 분석이 기존 Catch를 참조해도 원래 출처를 새 값으로 바꾸지 않는다 |
| `repositoryId` | CatchAsset의 `sourceRequestId`와 일치하는 AnalysisRequest에서 가져온다. 요청의 `memberId`도 Catch 소유자·인증 회원과 같아야 한다 |
| `evidence` | 해당 Catch의 근거 1개 이상을 복사한다. 다른 Catch의 근거와 중복 근거 ID를 거부한다 |
| `draft`, `reflection` | 저장된 생성 상태를 보존한다. 초안 GENERATED는 문자열, FAILED/NOT_GENERATED는 null이어야 하며 모순된 값을 보정하지 않는다 |
| `confirmation`, `mismatch`, `visibility` | 서로 독립적으로 보존한다. 조회·불일치만으로 확인이나 공개를 바꾸지 않는다 |
| `restriction` | 같은 소유자·원 저장소의 명시적인 `RepositoryProtection.appliedRestriction`을 사용한다. 보호 판단이 없다고 NONE으로 채우지 않는다 |
| `sourceMode` | CatchAsset의 MOCK/LIVE를 보존한다. AnalysisRequest에는 이 속성을 새로 만들지 않는다 |

SOURCE_PRIVATE여도 본인 응답은 반환한다. 이는 수신자 열람 제한이며 본인 조회 거부나 공개 설정 변경을 뜻하지 않는다. 이 함수는 C의 수신자용 PublicCatch를 만들지 않는다. 내부 소유자 ID·작업 식별 키·등록 판정·보호 관측 자료는 응답에 싣지 않는다. 응답 배열은 복사해 응답 조작이 입력 자료를 바꾸지 않도록 한다.

**보호 판단 부재:** 보호 행이 없을 때의 실제 정책은 이 준비 작업에서 정하지 않는다. 호출부는 현재 적용할 보호 판단을 명시적으로 제공해야 하며, 조회 실패나 미확인을 NONE으로 변환해서는 안 된다. 근거 URL 형식만으로 출처의 진위·동의 범위가 검증되는 것도 아니다.

## 실제 조회에 연결할 순서

1. [#86](https://github.com/JminAILab/CatchU/issues/86) DB 기반과 [#104](https://github.com/JminAILab/CatchU/issues/104) 선행 테이블 준비를 확인하고 [#105](https://github.com/JminAILab/CatchU/issues/105)의 등록 저장 결과와 연결한다. RepositoryProtection의 생성 순서·기본 행 준비도 맞춘다.
2. [#87](https://github.com/JminAILab/CatchU/issues/87)의 `CurrentMemberId`로 검증된 회원 ID를 얻고, DB 검색 자체를 소유자 범위로 제한한다. 매핑의 대조는 추가 방어이며 DB 권한 검사를 대체하지 않는다.
3. `GET /v1/catches`에서 `repositoryId`와 `sourceRequestId`를 AND로 적용한다. `limit`은 기본 20·허용 1~100이다. 커서는 소유자·필터에 묶고 매 요청 권한을 다시 검사한다. 정렬·동률 기준과 커서의 구체 형식은 구현 전에 정리하며 이번 함수에서 임의로 고정하지 않는다.
4. 상세의 없음·타인 자료를 동일 `404 RESOURCE_UNAVAILABLE`로, 본인 자료의 조회/무결성 실패를 `500 INTERNAL_ERROR`로 연결한다. 미인증은 401이다. [#88](https://github.com/JminAILab/CatchU/issues/88)의 공통 오류·`/v1`·no-store를 재사용하고 별도 필터를 만들지 않는다.
5. 목록·상세·필터·페이지 이동·조회 장애·반복 조회의 상태 불변을 실제 HTTP와 테스트 DB로 검사한 뒤 화면([PR #156](https://github.com/JminAILab/CatchU/pull/156))과 연결한다.

## 확인 사례와 남은 검사

| 사례 | 기대 결과 | 이번 검사 범위 |
|---|---|---|
| 본인 정상 자료 | 계약 필드와 독립 상태 보존, 내부 필드 제외 | 순수 함수·합성 자료 |
| 없는 자료 / 타인 PRIVATE·PUBLIC 자료 | 상세 매핑은 모두 null | 순수 함수. 실제 인증·404 연결은 후속 |
| 원 요청·근거·보호 판단 연결 누락/모순 | 오류, 성공 자료·0건으로 대체하지 않음 | 순수 함수 |
| 정상 빈 페이지 / 잘못된 항목이 섞인 페이지 | 빈 페이지는 성공, 잘못된 페이지는 전체 오류 | 페이지 포장만. DB 조회 실패 전파는 후속 |
| 생성 실패·미생성, 불일치+공개+원본 보호 | 각각의 값을 유지 | 순수 함수 |
| 출력 배열 변경 / 반복 호출 | 입력 상태 불변 | 순수 함수 |
| 인증, 필터 AND, limit·커서, DB 장애·본인 범위 검색 | 실제 API 계약대로 동작 | 미구현·미검증 |

검사 명령은 `api/`에서 `npm run lint`, `npm run typecheck`, `npm test`다. 신규 검사는 `test/catches/owner-catch-response.test.cjs`이며 실제 저장소·계정 정보 대신 합성 자료만 쓴다. 이 결과는 #130 전체 완료나 실제 서버 조회 성공을 뜻하지 않는다.

## 근거

- [회원 API](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/member-api.yaml): 목록/상세 주소, 필터 AND, limit, 목록 포장.
- [Catch 응답 스키마](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml): 본인 응답 필드·생성 상태·공개/확인/불일치·보호 상태.
- [ERD](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md): CatchAsset·CatchEvidence·AnalysisRequest·RepositoryProtection의 관계와 최소값.
- [API 기능 설계](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md): 조회 일관성과 소유자·필터에 묶인 커서.
