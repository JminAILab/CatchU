# U7 저장소·분석 — 논리 컴포넌트 설계

작성일: 2026-10-29. [확인한 작성안](nfr-design-questions.md), [기능 명세](../functional-design/functional-spec.md), [엔티티](../functional-design/entities.md), [기술 선택](../nfr-requirements/tech-stack-decisions.md)을 구체화한다. 구현·배포·실제 검증 완료 기록이 아니다. 기준 코드는 5551cf8c43a468d71293932979c856e9a18132ab다.

## LC1 책임과 배치

| 논리 컴포넌트 | 현행 위치·처리 | U7 변경과 경계 |
|---|---|---|
| 저장소 관리 화면 | web/features/repository-management, analysis-request | 기존 모달 상단 이력·상태·Catch·재요청 유지. 하단 주소 등록과 이유별 안내를 연결 |
| 회원별 등록 공급 | api/member-repositories | 전역 선정 목록을 회원 등록 목록으로 대체. 주소 해석·고정 GitHub 메타데이터 조회·등록 저장 |
| 분석 접수 | api/analysis-intake, member-analysis | 등록·동의 범위 사본 대조, 새 접수에 C-03 소비, 기존 멱등/재분석 보호 유지 |
| 실행 컨텍스트 | api/worker-context, github-connection | 기존 내부 서비스 인증과 자격정보 조회. 고정 카탈로그 대신 요청의 등록·동의 사본에서 좌표 복원 |
| 큐와 worker | api/analysis-queue, worker/consumer | 기존 BullMQ 작업·자식 프로세스·receipt 유지. 현행 메시지 판본과 관측값 연결 |
| 수집·후보·생성 | worker/collection, candidates, generation, processing | 기존 수집/기여/묶음/생성 재사용. 본인 커밋 관측 전달과 실측에 따른 제한 조정 |
| 수신·반영·열람 | api/analysis-receiver, result-application, catches | 요청 사본으로 좌표 확인, 관측 저장, 기존 Catch 반영 보호와 본인 열람 |
| 하루 제한·회원 삭제 | U2 C-03·C-06 | U7은 제공 인터페이스와 삭제 규칙을 소비. 공용 표·탈퇴 순서의 소유자는 U2 |

경로는 저장소 루트의 src/app 아래 구현 영역을 가리킨다. U7이 새로 만드는 것은 회원별 등록과 기존 분석 흐름의 연결이며 별도 서비스·큐·저장소·관제 시스템이 아니다. 직접 근거는 [컴포넌트 목록](../../../inception/domain-design/components.md)과 [계약 요약](../../../inception/contract-design/contract-summary.md)이다.

## LC2 등록과 요청 사본

물리 이름은 구현 인계를 위한 제안이다. 논리 필드의 의미는 승인된 [엔티티](../functional-design/entities.md)가 정본이다.

| 자료 | 저장·제약 |
|---|---|
| repository_registration | registration_id UUID, member_id, GitHub repository_id, owner/name/url, scope_revision, registered_at, last_verified_at. 회원 외래 키 CASCADE |
| 등록 유일성 | UNIQUE(member_id, repository_id). 같은 회원의 같은 GitHub ID는 기존 등록 반환. 소유자/이름 문자열만으로 중복 판정하지 않음 |
| 요청의 등록 관계 | analysis_request에 registration_id를 연결. 부모에 UNIQUE(member_id, registration_id, repository_id), 요청의 같은 세 칸을 복합 FK CASCADE로 연결 |
| 요청별 동의 | 기존 analysis_consent.consented_scope JSON에 등록 참조·서버 확인 좌표·허용 자료 종류·범위 판본을 고정. 동의/요청/등록의 회원과 저장소가 같은지 대조 |
| 시도의 관측 | 기존 AnalysisAttempt에 ownCommitObservation, nullable observedOwnCommitCount, collectionLimitNotes를 저장. 기본 UNKNOWN/null/빈 목록 |
| 결과 원본·Catch | 기존 수신/반영 자료와 동일 작업 판정 사용. 관측값 때문에 별도 Catch나 결과 저장 체계를 만들지 않음 |

등록 좌표는 새 메타데이터 확인 후 갱신할 수 있지만 이미 받은 동의 사본은 수정하지 않는다. 요청 사본은 실제 등록 외래 키를 대신하지 않으며, 실행/결과의 당시 좌표를 보존하기 위한 자료다. 범위 판본은 기존 불변 범위 정의를 가리킨다. scopeRevision이 바뀌면 현재 고지와 함께 새 동의를 받는다.

기존 repository_selection을 참조하던 요청 연결은 신규 등록 관계로 교체한다. 신규 등록을 전역 선정 표에 끼워 넣거나 기존 전역 FK 예외를 새 회원 자료에 적용하지 않는다. 10월 자료 초기화 전제(C04)는 운영 자료를 이 단계에서 지우라는 권한이 아니다. 실제 전환은 별도 배포·자료 준비 절차에서 확인한다.

## LC3 요청의 전 구간 연결

1. 주소 등록: 회원 인증 → GitHub 연결 확인 → 주소 해석 → 고정 호스트 메타데이터 조회 → 회원/연결 재대조 후 등록 저장. 동의·분석·하루 소비 없음.
2. 신규 접수 예비 확인: 기존 키 재응답 여부를 먼저 구분하고 현재 회원/연결·등록·공개·지원 범위를 트랜잭션 밖에서 확인한다.
3. 기존 접수 트랜잭션: 멱등 및 회원 잠금 → 회원/연결/등록/범위 재대조 → 진행·과거 결과·재요청 판정 → C-03 소비 → 요청·동의·시도·멱등 기록. 외부 통신은 이 안에 넣지 않는다.
4. 큐 전달: 커밋된 DB 기록으로 메시지를 만들고 기존 dispatcher를 사용한다. 큐의 selectionReference와 credentialContextReference는 기존처럼 attemptId를 가리킨다. 자격정보나 전체 동의 사본을 큐에 넣지 않는다.
5. worker 컨텍스트: 요청 → 시도 잠금과 활성 회원·현재 시도·동의 일치를 확인한다. 등록 소유자와 불변 사본을 대조하고 기존 자격정보 조회 전후의 연결 교체 검사도 보존한다.
6. 수집·생성: 실제 GitHub 저장소 ID·좌표·공개 여부를 다시 확인한 뒤 허용된 자료만 읽는다. 자료를 다른 저장소로 대체하거나 이름 변경 redirect를 따라 범위를 바꾸지 않는다.
7. 결과 반영: 수신 메시지와 DB의 요청/시도/회원/동의/저장소/판본을 대조한다. 당시 좌표는 요청 사본에서 읽는다. 관측과 기존 처리 결과를 함께 저장하고 기존 Catch 반영 뒤 ownerResultsReady로 열람 준비를 알린다.

새 저장 동의의 키를 [dispatcher](../../../../../../../../api/src/analysis-queue/analysis-request.dispatcher.ts)가 해석하도록 같이 고친다. 현재의 정확히 네 키 검사만 남기면 새 동의를 큐에 보내지 못한다. 큐 사본의 허용 범위 모양과 DB의 불변 사본 모양은 별개로 검증한다.

## LC4 현행 메시지와 패키징

현재 [api 검사기](../../../../../../../../api/src/analysis-receiver/worker-message.validator.ts)와 [worker 검사기](../../../../../../../../worker/app/contract/worker_messages.py)는 10월 승인 YAML을 읽는다. 그 원본은 바꾸지 않는다.

U7 현행 분석 메시지 정본은 구현 때 api/contracts/repository-analysis/에 common.yaml과 worker-messages.yaml로 둔다. 기존 계약에서 U7 메시지에 필요한 정의를 가져오고 출처와 변경점을 현행 서비스 문서에 명시한다. api와 worker는 이 단일 경로를 읽으며 각자 수정한 복사본을 소유하지 않는다.

새 Result 관측을 포함하는 내부 메시지 판본은 2로 구분한다. Request·ProcessingEvent·Result·ResultReceipt의 생산자/검사기/자료형/시험 도우미가 같은 판본을 사용하도록 한 U7 변경에 묶는다. HTTP 회원 API의 버전과 오류 모양은 그대로다. Result에는 세 관측 필드를 명시하고 미관측은 UNKNOWN/null/빈 목록으로 전송한다. 허용 필드만 받는 검사를 유지한다.

[api Dockerfile](../../../../../../../../api/Dockerfile)과 [worker Dockerfile](../../../../../../../../worker/Dockerfile)의 계약 복사 경로, 앱의 계약 경로, 합성 fixture·교차 언어 계약 검사를 함께 맞춘다. 이미지 안의 같은 스키마 해시와 같은 예제에 대한 판정을 확인한다. 스키마만 파일로 추가하고 실행 경로를 옛 파일에 남기지 않는다.

구판/신판이 섞인 운영을 지원하는 장치는 추가하지 않는다. 배포 전에 구판 진행 작업과 대기/결과 메시지를 확인하고 기존 전환 절차로 정리된 환경에서 양쪽을 전환한다. 남은 구판 메시지가 있으면 신판 완료로 간주하지 않으며 임의 삭제·재분석으로 해소하지 않는다. 전환 조건을 만족하지 못하면 배포를 미실행으로 남긴다.

## LC5 공유 자원과 실패 영향

| 자원·실패 | 영향 범위 | 기존 보호와 사용자 결과 |
|---|---|---|
| PostgreSQL | 등록·접수·상태·수신/반영 | 실패를 성공/빈 목록으로 숨기지 않음. 접수 저장 실패는 C-03 소비까지 롤백 |
| Redis/BullMQ | 접수 뒤 전달·worker 통신 | 접수와 완료 구분. 기존 전달/시한 판정 유지, 새 분석 자동 생성 없음 |
| GitHub API·회원 자격정보 | 해당 회원의 등록/분석 | 확인 불가 또는 연결 안내, 실행 중 실패와 한계 보존 |
| Claude API | 후보가 있는 요청의 생성 | 기존 호출·응답 상한과 부분 실패, 대체 모델 재호출 없음 |
| worker 프로세스 | 그 소비자가 처리하는 요청 | 동시 분석 1, 기존 자식 종료/시한 보호. 소비자 수를 실측에 명시 |
| 잘못된 회원 참조 | 그 요청 거부 | 조회 조건·복합 FK·수신 맥락 검사. 다른 회원 결과로 복구하지 않음 |

PostgreSQL·Redis는 공유 자원이며 프로세스 분리가 전 서비스 장애 격리를 보장하지 않는다. 새 bulkhead·circuit breaker·다중 리전·복제본·캐시는 도입하지 않는다. AWS 기반은 현행 배포를 따르며 새 인프라가 설계의 전제는 아니다.

## 구현 인계와 검증

[보안](security-design.md), [성능](performance-design.md), [규모](scalability-design.md), [신뢰성](reliability-design.md), [관측](observability-design.md) 설계의 적용 지점을 위 컴포넌트에 연결한다. 기존 모달·요청별 동의·처리 상태·Catch의 책임을 유지하고 U2 하루 소비 외에 발행·색인·JD 연결을 추가하지 않는다.

구현에서는 새 DB 제약·등록/요청 사본 대조·양 언어 스키마 일치·패키징·기존 정상/거부 검사를 먼저 확인한다. 실제 분석과 통합 브랜치 병합은 [#424](https://github.com/JminAILab/CatchU/issues/424)의 별도 완료 증거로 남긴다.

