# U8 PDF 자료 — 논리 컴포넌트

작성일: 2026-11-06. Unit: `u8-pdf-materials`. 입력: [기술 선택](../nfr-requirements/tech-stack-decisions.md), [성능 요구사항](../nfr-requirements/performance-requirements.md), [보안 요구사항](../nfr-requirements/security-requirements.md), [확장성 요구사항](../nfr-requirements/scalability-requirements.md), [신뢰성 요구사항](../nfr-requirements/reliability-requirements.md), [관측 요구사항](../nfr-requirements/observability-requirements.md), [기능 명세](../functional-design/functional-spec.md), [계약 요약](../../../inception/contract-design/contract-summary.md) C-05·C-16·C-17, [NFR 설계 질문·답변](nfr-design-questions.md). 배포 단위는 기존 web·api·worker 그대로이고(Unit 정의 공통 전제) 새 배포 단위는 없다.

## 1. 컴포넌트 목록

| 컴포넌트 | 배포 단위 | 역할 | 의존 | NFR 패턴 |
|---|---|---|---|---|
| PdfMaterials API(컨트롤러·서비스·저장소 계층) | api | 업로드·목록·상세·원본 열람·삭제, 상태 읽기(readStatus) | DB, FileStorage, AiConsentGate(C-04), 큐 발송 | 비용 순 검증, 메모리 버퍼, 시한 판정, 저장소 먼저 삭제 |
| PdfExtractionReceiver | api(`worker-messages` 소비자 안) | 결과 봉투 검사·판정 5종·전부 아니면 전무 저장·수신 확인 | DB | 한 트랜잭션, 잠금 조회 |
| FileStorage S3 드라이버 | api | C-05 인터페이스의 S3 구현(put·get·copy·delete·deletePrefix) | S3 버킷(api 역할) | SDK 기본 재시도, 키 도우미 |
| Publication PDF 부분(U4 모듈 안) | api | C-17 1~6단계: ID 선생성, 복사, 재확인·사본 고정, 보상 | FileStorage, DB, U4 발행 트랜잭션 | 복사는 트랜잭션 밖, 보상 1회 |
| Recipient/Owner PDF 열람 엔드포인트 | api | C-10 판정 → 항목 조회 → 스트림 | PublicationAccess(U4), FileStorage | 호출마다 판정, 스트림 파이프, 헤더 4종 |
| PdfExtractionWorker | worker | `pdf-extraction-requests` 소비, 자식 프로세스 관리, 결과 발송 | Redis 큐, S3(worker 역할, GetObject) 또는 공유 볼륨 | 독립 Worker, 동시성 설정, 자식 격리 |
| PdfExtractChild(자식 프로세스) | worker | 파일 읽기·pypdf 추출·판정(암호화·쪽 수·readable)·JSON 출력 | 파일만 | 시간·메모리 제한(값은 구현) |
| PdfMaterialsTab / PdfUploadForm / PdfMaterialList | web | 작성자 PDF 관리 화면 | api | 제출 전 검사, 상태 배지 |
| PublishedPdfItem / PdfPageList | web | 받은 사람·작성자 발행본의 PDF 항목·쪽 표시·근거 강조 | C-10 snapshot(pdfPages), U4 슬롯 | 텍스트 노드 표시 |
| PdfViewerLauncher | web | fetch + 헤더 → Blob URL → iframe/새 탭, Blob 수명 관리 | api 열람 엔드포인트 | 재요청 규칙(Q1), onAccessLost |

## 2. 공유 자원

| 자원 | 공유 범위 | U8이 더하는 것 |
|---|---|---|
| PostgreSQL | 모든 Unit | 표 3개(`pdf_material`, `pdf_page_text`, `published_pdf_page`) |
| Redis/BullMQ | 분석(U7), AiRun(U2·U3·U5·U10) | 큐 1개(`pdf-extraction-requests`), 기존 `worker-messages`에 작업 이름 1개 |
| S3 버킷(#389) | U2 FileStorage 인터페이스, U4 발행본 삭제, U2 탈퇴 | 접두어 `materials/`·`publications/{id}/*.pdf`의 실제 사용, S3 드라이버 |
| worker 프로세스 | 분석 소비자(U7) | 두 번째 Worker 인스턴스와 자식 프로세스 |
| 받은 사람 화면 1번 자리(C-11) | U4 소유 | PDF 항목 컴포넌트 |

## 3. 실패 영역과 영향 범위

| 실패 | 영향 받는 것 | 영향 없는 것 | 왜 |
|---|---|---|---|
| S3 장애·미설정 | PDF 업로드·열람·PDF 포함 발행·자료 삭제(500) | PDF 없는 발행, 텍스트 자료, 다른 Unit 전부 | PDF 항목이 없으면 FileStorage 미호출(BR5.6) |
| worker 꺼짐 | 새 PDF가 시한 뒤 FAILED(다시 올리기) | 이미 DONE인 PDF의 발행·열람, api 전체 | 추출은 비동기, 발행은 DONE만 씀 |
| 자식 프로세스 폭주(악성 PDF) | 그 작업 1건 FAILED | 추출 Worker의 다음 작업, 분석 소비자 | 자식 격리·제한 |
| Redis 장애 | 추출 요청 발송 실패(시한으로 FAILED), 분석·AiRun도 함께 영향(기존) | 업로드 자체(201 유지), 열람 | 발송 실패는 로그만 |
| DB 장애 | 모든 경로 | — | 공유 자원(기존과 같음) |
| 발행 트랜잭션 실패 | 그 발행 1건(보상으로 파일 정리) | 다른 발행본·원본 PDF | C-17 보상 |

## 4. 경계와 격리 원칙

- worker의 자식 프로세스는 큐·DB에 닿지 않는다(파일 읽기와 추출만). 큐·수신 확인은 부모가 맡는다.
- api의 PDF 경로는 PublicationAccess(U4)·AiConsentGate(U2)·FileStorage(U2 인터페이스)를 호출만 하고 그 안을 바꾸지 않는다. U4 발행 트랜잭션 안의 변경은 C-17이 정한 단계에 한정한다.
- 저장소 자격은 api 역할(쓰기·읽기·복사·삭제)과 worker 역할(GetObject만)로 나뉜다.
- 인프라 설계 단계는 이 intent에 없다(C07). 버킷·역할·개발 서버 큐 연결·compose 볼륨은 팀장의 공용 인프라 작업(#389)이며, U8은 필요한 설정 이름과 권한 범위를 이 문서와 보안 설계 §3에 남긴다.
