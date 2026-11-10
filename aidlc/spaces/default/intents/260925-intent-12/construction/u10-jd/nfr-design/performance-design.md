# U10 성능 설계

승인된 비기능 요구사항의 입력·호출·조회 경계를 기존 api와 DB에 배치한다. 새로운 응답 지연·처리량 목표는 없다. 아래 설계는 구현·실측 결과가 아니다.

## P1 입력 검사와 호출 크기

대응: NFR4.1, NFR4.2.

JdManagement의 입력 검사 책임은 제목 1~200자·본문 1~20,000자를 UTF-16 코드 단위로 검사하고 공백만인 값을 거부한다. UI는 같은 한도를 안내하되 서버가 최종 판정한다. 원문을 잘라 저장하지 않는다.

JdSummary의 접수 검사 책임은 원문을 CRLF/LF 줄로 나누고 비어 있지 않은 줄 1~20개·각 2,000자 이내인지 확인한다. 원문 줄 번호·순서·공백을 유지한다. 초과는 차감·실행 저장 전에 422로 끝낸다. 접수 트랜잭션에서 JD 판본이 달라졌으면 다시 읽은 내용을 같은 검사에 통과시킨 뒤 사본을 저장한다.

처리기는 각 줄마다 C-09 search의 limit을 6으로 요청한다. 반환 개수와 조각 길이가 6개·각 1,000자 약속을 지키는지 먼저 확인한다. 위반은 해당 행 CONTRACT_INVALID이며 생성하지 않는다. sources.text.length 합과 현재 userText.length를 공용 계산에 넣는다. 정상 상한은 6×1,000+2,000=8,000이고 공용 80,000자 한도를 넘으면 INPUT_TOO_LARGE다. publicationText·instruction·메타데이터는 이 계산에서 제외하되 제공자의 발행본 크기 정책을 완화하지 않는다.

근거 없는 검색 결과는 공용 관문 규칙에 따라 생성 호출이 생략된다. 원문이나 조각 일부를 잘라 통과시키는 경로, 전체 JD를 한 호출에 다시 보내는 대체 경로는 없다.

## P2 DB 조회와 페이지 경계

대응: NFR4.4, NFR4.7, NFR1.1.

| 조회 | 필수 조건·정렬 | 반환 |
|---|---|---|
| JD 목록 | 인증 회원 memberId, updatedAt 내림차순과 jdId의 고정 보조 정렬 | 최대 20개, jdId·title·updatedAt와 nextCursor |
| 발행본의 실행 목록 | 인증 회원 memberId와 C-10으로 얻은 publicationId, createdAt 내림차순과 runId의 고정 보조 정렬 | 최대 20개, 접수 제목·상태·요구사항 수·빈 결과/실패 수 등 기능 명세의 목록 필드 |
| JD 상세 | memberId와 jdId | 원본 제목·본문 |
| 실행 상세 | memberId·publicationId·runId | 사본의 원문 요구사항과 순서대로 정렬한 결과 |

cursor는 마지막 정렬 키를 전달할 뿐 권한 증명이 아니다. 서버는 cursor 형식과 값의 자료형을 확인하고 모든 페이지에 소유자·발행본 조건을 다시 적용한다. 정렬 동률은 ID로 해소한다. JD 수정으로 목록의 위치가 바뀌는 것은 허용하며 목록 전체 스냅샷·충돌 복원 기능은 추가하지 않는다.

물리 스키마 단계에서는 위 조건에 맞춘 JD의 (memberId, updatedAt, jdId), 실행의 (memberId, publicationId, createdAt, runId), 결과의 유일 키 (runId, requirementIndex)를 조회·정렬 접근 경로로 사용한다. 목록 요청에서 전체 본문이나 결과 항목을 싣지 않고 상태·집계만 조회한다. 이는 논리 접근 경로이며 마이그레이션·인덱스 DDL은 구현 단계에서 작성한다.

## P3 비동기 처리와 자원 사용

대응: NFR4.3, NFR4.5.

접수는 DB 커밋 뒤 C-02에 등록하고 202로 종료한다. 외부 검색·생성 동안 DB 트랜잭션이나 행 잠금을 유지하지 않는다. 처리기는 요구사항을 하나씩 검색·생성·저장하고 다음 줄로 넘어간다. 공용 DB 연결 풀과 큐 실행 구성을 소비하며 U10 전용 풀 크기·전체 동시성 값을 정하지 않는다.

접수 시각+20분은 종료 판정 시한이다. 처리 시작·각 호출 전·저장 직전과 상태 조회에 [신뢰성 설계 R2](reliability-design.md#r2-시한과-결과-저장)의 판정을 적용한다. 이 값은 모델 응답이나 큐 대기의 성능 보장이 아니다. 시한 경과 시 이미 진행 중인 외부 호출의 즉시 취소를 새 계약으로 요구하지 않고, 반환 결과의 저장을 막는다.

## P4 선택 이유와 확인 범위

소수 외부 사용자 시연에서는 기존 페이지 조회와 비동기 처리를 유지하는 것으로 범위를 제한한다. 결과 캐시·자동 폴링·SSE·병렬 생성·CDN 구성을 추가하지 않는다. 새 캐시가 생기는 경우의 자료 삭제·권한 무효화 책임도 이번에 만들지 않는다.

구현 후에는 기존 기능 명세 §11의 입력 경계·실제 길이 계산·시한·목록 및 재열람 시나리오에 연결한다. 실제 부하·응답 지연을 측정하지 않았으며 합성 제공자의 응답 시간을 실제 AI 성능으로 보고하지 않는다.

## Sources

[성능 요구사항](../nfr-requirements/performance-requirements.md), [보안 요구사항](../nfr-requirements/security-requirements.md), [확장성 요구사항](../nfr-requirements/scalability-requirements.md), [신뢰성 요구사항](../nfr-requirements/reliability-requirements.md), [관측성 요구사항](../nfr-requirements/observability-requirements.md), [기술 결정](../nfr-requirements/tech-stack-decisions.md), [기능 명세](../functional-design/functional-spec.md), [공유 계약](../../../inception/contract-design/contract-summary.md), [작성 전 확인](nfr-design-questions.md).
