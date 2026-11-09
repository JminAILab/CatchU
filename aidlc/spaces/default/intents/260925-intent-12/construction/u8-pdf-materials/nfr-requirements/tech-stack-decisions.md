# U8 PDF 자료 — 기술 선택

작성일: 2026-11-06. Unit: `u8-pdf-materials`. 입력: [기능 명세](../functional-design/functional-spec.md), [규칙](../functional-design/rules.md), [재승인 요구사항](../../../inception/requirements-analysis/requirements.md) C02·C07, [계약 요약](../../../inception/contract-design/contract-summary.md) C-05·C-16, 도메인 설계 ADR-003, [NFR 질문·답변](nfr-requirements-questions.md) Q1·Q2.

기술 기준은 재승인 요구사항 C02(Next.js·NestJS·FastAPI, AWS, PDF 글 추출은 worker의 `pypdf`)와 ADR-003(S3, FileStorage 인터페이스)이 이미 정했다. 이 문서는 그 안에서 U8이 더하는 것과 재사용하는 것을 적는다. 정확한 라이브러리 버전은 코드 생성에서 잠금 파일과 함께 정한다. 새 의존성은 api 1개(`@aws-sdk/client-s3`)와 worker 2개(`boto3`, `pypdf`)이며, S3 의존성은 api(쓰기·복사·삭제 포함)와 worker(GetObject만)로 나뉜다(검토 R-01).

| 영역 | 선택 | 지위 | 이유 |
|---|---|---|---|
| api 프레임워크·ORM | NestJS, TypeORM 엔티티 3개(`pdf_material`, `pdf_page_text`, `published_pdf_page`), 마이그레이션 1개 | 기존 재사용 | C02, C-06(엔티티는 deleteWithParent) |
| api 파일 업로드 | NestJS의 multipart 처리로 파일 1개를 메모리에 받아 검사 뒤 FileStorage.put | 기존 재사용(라이브러리는 코드 생성에서 확인) | 20 MB 상한이라 임시 파일이 필요 없음(NFR4.12) |
| 파일 저장(api) | FileStorage 인터페이스(U2)의 S3 드라이버를 U8이 추가. `@aws-sdk/client-s3`(PutObject·GetObject·CopyObject·DeleteObject·ListObjectsV2·DeleteObjects), 자격은 AWS 기본 자격 체인(api 역할), presigned URL 없음. api 역할은 버킷의 `members/` 접두어에 쓰기·읽기·복사·삭제 권한이 필요하다 | api 새 의존성 1개 | ADR-003, C-05, 기능 설계 BR7.3 |
| 파일 읽기(worker, 배포) | Python S3 클라이언트 `boto3`로 GetObject만 호출. 자격은 AWS 기본 자격 증명 체인(worker 역할). 권한 범위는 원본 PDF를 읽는 데 필요한 `s3:GetObject`만, 대상은 `members/*/materials/*.pdf` 키(발행 사본·삭제·쓰기 권한 없음). 라이브러리 버전은 코드 생성에서 잠금 | worker 새 의존성 1개 | 기능 설계 BR7.4, ADR-003 "worker는 S3 읽기만", 검토 R-01 |
| 파일 읽기(worker, 로컬·시험) | api 로컬 저장 폴더를 읽기 전용 공유 볼륨으로 마운트해 `PDF_FILE_ROOT`로 읽음(기존 결정, 기능 설계 Q6). S3 클라이언트는 쓰지 않음 | compose 볼륨 설정 | 기능 설계 Q6·BR7.4 |
| S3 재시도 | SDK 기본 재시도 모드 유지(한 호출 안 최대 3회) | NFR Q2 결정 | 일시 오류에 강하고 가장 단순. 작업 단위 재시도는 사람이 함 |
| 로컬·시험 저장(api) | U2 로컬 드라이버 그대로(`FILE_STORAGE_DRIVER=local`) | 기존 재사용 | ADR-003 "팀원은 S3 없이 개발" |
| S3 시험 | 요청을 기록하는 가짜 S3 클라이언트로 드라이버 계약 시험. 로컬·S3 드라이버가 같은 시험을 통과 | 새 시험 코드 | 실제 버킷은 #389 뒤(OQ-U8-2) |
| 큐 | 기존 Redis/BullMQ. `pdf-extraction-requests` 큐(api→worker)와 기존 `worker-messages` 큐(worker→api)에 작업 이름 하나 추가 | 기존 재사용 + 새 큐 1개 | C-16, 기능 설계 BR2.4 |
| worker 프레임워크 | FastAPI worker의 기존 BullMQ Worker 틀. `pdf-extraction-requests`를 소비하는 별도 Worker 인스턴스, 동시성 설정 분리 | 기존 재사용 | 기능 설계 BR3.7(검토 R-01) |
| PDF 글 추출 | `pypdf`(쪽별 `extract_text`, `is_encrypted`), 이미지 글자 인식 없음. 버전은 코드 생성에서 잠금 | worker 새 의존성 1개 | C02, FR3.3·FR3.4 |
| 추출 격리 | 10월 분석 소비자의 작업별 자식 프로세스 틀을 재사용하고 시간·메모리 제한을 둠. 제한값은 구현 단계에서 기존 값과 대표 PDF 측정으로 정함 | NFR Q1 결정 | worker 보호, 실패 조기 확정(NFR1.9·NFR4.18) |
| worker 수신 확인 | 10월 `receipts.py` 재사용, 메시지 봉투 `schemaVersion "2"`·`messageId` 규칙 동일 | 기존 재사용 | C-16, 기능 설계 W2(검토 R-06) |
| web | Next.js 기존 자료 화면·받은 사람 화면에 컴포넌트 추가. PDF 열람은 `fetch` + `X-Link-Grant` → Blob URL → `<iframe>`(`#page=n`)·새 탭. 외부 PDF 뷰어 라이브러리는 쓰지 않고 브라우저 내장 뷰어에 맡김 | 기존 재사용 | 기능 설계 Q3·BR6.3, C-11 grant 규칙, 새 의존성 없음 |
| DB | PostgreSQL(기존). 쪽 글은 `text` 칸, 길이 상한 없음(OQ-U4-4에 딸림) | 기존 재사용 | C-06·C-07 |
| 인프라 | S3 버킷·역할(#389)과 개발 서버 큐 연결은 팀장의 공용 인프라 작업. U8은 코드와 설정 이름만 둔다 | intent 밖 | C07, Unit 정의 U2·U8 경계 |

## 채택하지 않은 안

| 안 | 이유 |
|---|---|
| PDF를 DB(bytea)에 저장 | 도메인 설계 Q3 A에서 기각(ADR-003) |
| presigned URL로 직접 열람 | ADR-003이 배제. grant를 URL에 싣지 않는 규칙(C-11)과도 어긋남 |
| 일회성 열람 토큰(쿼리) | 기능 설계 Q3 B. 토큰이 URL·로그에 남고 새 토큰 종류가 필요 |
| OCR(이미지 글자 인식) | FR3.4 제외 |
| MinIO 등 로컬 S3 호환 서버 | 가짜 클라이언트 시험으로 충분, 환경 추가 공수 |
| 웹 PDF 뷰어 라이브러리(pdf.js 직접 포함) | 내장 뷰어로 충분, 의존성·크기 증가 |
| SDK 재시도 0 | NFR Q2 B. 일시 오류에도 사람이 다시 해야 함 |
| 같은 프로세스에서 pypdf 직접 실행 | NFR Q1 B. worker 보호가 없음 |
