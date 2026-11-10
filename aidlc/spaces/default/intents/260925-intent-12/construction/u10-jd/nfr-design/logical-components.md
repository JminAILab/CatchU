# U10 논리 컴포넌트와 비기능 책임

승인된 JdManagement와 JdSummary의 소유 경계를 유지한다. 아래 내부 책임은 코드 구성의 설계이며 독립 서비스·배포 단위 추가가 아니다. 현재 승인된 것은 비기능 요구사항이고 이 비기능 설계는 별도 승인 대상이다.

## L1 소유와 내부 책임

| 논리 책임 | 배치·소유 자료 | 주요 비기능 설계 |
|---|---|---|
| JD 관리 화면 | web, JdManagementPage와 기존 하위 구성 | 입력 안내·실패 시 입력 보존·본인 목록 |
| JD 관리 서비스·저장 책임 | api JdManagement, Jd | 서버 입력 검사·소유 조건·정렬 페이지·원본 삭제 |
| 요약 접수 서비스 | api JdSummary, 새 실행·inputCopy·초기 결과 | 접근·동의·색인 확인, 차감과 사본 저장 트랜잭션 |
| JD_SUMMARY 처리기 | api JdSummary, 실행·요구사항 결과 | 순차 검색·생성, 공용 입력 검사, 행별 실패·시한 |
| 결과 저장·조회 책임 | api JdSummary, JdSummaryRun·JdSummaryResult | 조건부 저장·시한 확정·집계·본인/발행본 조건 |
| 요약 화면 | web JdSummaryPanel·JdRunList·JdRunResult | 요청 세대 확인·상태 초기화·안전한 텍스트·근거 이동 |
| 안전한 로그 구성 | 기존 api 로거의 U10 호출부 | 허용 필드·접수/실제 완료 분리 |

JdSummaryRun의 memberId/jdId 짝은 JD 소유를 강제한다. publicationId는 별도 소유자의 발행본일 수 있다. 외부 회원·발행본·색인·공용 차감/동의 자료의 소유권을 U10으로 옮기지 않는다.

## L2 연결 순서와 제공자 경계

텍스트 흐름: 브라우저 → 회원 Guard → U10 접수 → C-10 링크 판정 → 본인 JD·입력 → C-04 동의·C-09 색인 준비 → DB 트랜잭션(C-03 차감+실행/사본/결과) → 커밋 → C-02 큐 → U10 처리기 → 줄별 C-09 검색·C-01 생성 → 조건부 DB 저장. 재열람은 회원 Guard·C-10·본인/발행본 조건을 다시 거친다.

| 공용 경계 | 제공 책임 | U10 소비 책임 |
|---|---|---|
| C-01 AiGenerationGate | HAIKU 호출·인용/표기 검사·역할별 출력 | 요청 매핑·실제 길이 검사·출력 보존·오류 분류 |
| C-02 AiRun | 큐 등록·처리기 연결·readStatus | 접수 커밋 후 등록, JD_SUMMARY 처리기, 시한 상태 저장 |
| C-03 / C-04 | 원자적 하루 한도·현재 동의 판본·공용 UI | 같은 manager로 차감, 접수 전 동의와 재요청 검증 |
| C-06 | 외래 키·회원 탈퇴 순서 | U10 표의 복합 참조·연쇄 삭제·부모 표 갱신 |
| C-09 | 발행본 색인 상태·검색 조각·위치·검사 글 | DONE 확인, publicationId와 줄로 검색, 반환 계약 확인 |
| C-10 / C-11 / C-12 | 링크 판정·공유 화면 props·받은 사람 경로 | 매 요청 접근·실행자 확인, 슬롯·공용 오류 의미 유지 |

U2·U3·U4의 정책과 실제 제공자를 대신 구현하지 않는다. 공용 계약에 없는 모양이 필요하면 기존 계약·필요 입출력·영향 Unit·최소 사례를 별도 요청한다.

## L3 실패 영향과 격리 한계

| 장애 위치 | 영향 범위 | 설계상 대응 |
|---|---|---|
| 브라우저 종료 | 화면 응답 확인 | 접수된 실행은 DB/큐에 남고 유효 링크에서 본인 재열람 |
| 링크·로그인 조건 실패 | 해당 요청·화면 | 자료 조회 중단·화면 제거·소유자 오류 처리 |
| 특정 줄 검색·생성 실패 | 해당 요구사항 | 실패 행 기록, 시한 안이면 다음 줄 계속 |
| 큐 등록 실패·작업 유실 | 해당 접수 실행 | PENDING 유지, 조회 시 시한 실패; 자동 재등록 없음 |
| DB 저장·조회 장애 | JD 관리·요약 전반 | 실패 안내·안전한 로그, 접수 저장은 롤백; 완료로 보고하지 않음 |
| api/Redis 등 공유 자원 장애 | 다른 Unit과 함께 영향 가능 | 기존 공용 운영 경계, 독립 장애 격리 보장 없음 |
| 부모 삭제 | 의존 실행·사본·결과 | CASCADE·기존 행 조건부 갱신, 부활 금지 |

논리 책임을 나눠도 단일 api·공유 DB의 장애 영향은 공유한다. 새 격리 프로세스·복구 시스템을 설계하지 않는다. 다른 회원 자료 노출·삭제 실패는 허용 한계로 넘기지 않는다.

## L4 요구사항 배치와 선택 이유

| 상세 요구사항 | 설계 정본 |
|---|---|
| NFR1.1~NFR1.4, NFR2.1~NFR2.4, NFR7.1 | security-design S1~S4 |
| NFR4.1·NFR4.2·NFR4.4 | performance-design P1~P3 |
| NFR4.3, NFR5.1~NFR5.3, NFR6.4·NFR6.5, NFR7.2·NFR7.3 | reliability-design R1~R4 |
| NFR4.5~NFR4.7 | scalability-design C1~C3 |
| NFR3.1·NFR3.2, NFR6.1~NFR6.3 | observability-design O1~O4 |

수치·계약을 새로 정하는 대신 기존 입력 한도·큐·트랜잭션·FK·요청별 권한·로거를 조합한다. 결과 캐시, 자동 재시도·재개, 판정 AI, 추가 배포 단위, 관제·자동 확장·복구 목표는 승인 근거가 없어 채택하지 않는다. 트랜잭션은 저장 무결성에 필요한 짧은 구간에만 둔다.

## L5 실제 연결과 다음 단계

C-10 실제 DB 제공자·C-11 공유 화면과 근거 강조는 #416 연결 조건이다. JD 관리와 합성 제공자 흐름의 준비 여부를 실제 연결·AI 품질과 구분한다. 실제 분석·실측 #450을 U10 범위에 재편입하지 않는다.

이 문서는 설계일 뿐 구현·검사·배포 완료가 아니다. 비기능 설계 승인 후에도 공식 구현 계획·검증 절차를 따라야 한다. 비기능 요구사항 승인 기록은 2026-11-02 nfr-requirements이며 이 문서 작성 확인으로 nfr-design 승인을 만들지 않는다.

## Sources

[성능 요구사항](../nfr-requirements/performance-requirements.md), [보안 요구사항](../nfr-requirements/security-requirements.md), [확장성 요구사항](../nfr-requirements/scalability-requirements.md), [신뢰성 요구사항](../nfr-requirements/reliability-requirements.md), [관측성 요구사항](../nfr-requirements/observability-requirements.md), [기술 결정](../nfr-requirements/tech-stack-decisions.md), [기능 명세](../functional-design/functional-spec.md), [공유 계약](../../../inception/contract-design/contract-summary.md), [작성 전 확인](nfr-design-questions.md).
