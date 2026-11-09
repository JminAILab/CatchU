# U8 PDF 자료 — 시험 시나리오(Testing Contract custom 순서의 첫 단계)

작성일: 2026-11-06. Unit: `u8-pdf-materials`. 입력: [기능 명세](../functional-design/functional-spec.md) §6 시험 시나리오와 W1~W5, [규칙](../functional-design/rules.md) BR1~BR7, [엔티티](../functional-design/entities.md), [보안 요구사항](../nfr-requirements/security-requirements.md) NFR1·NFR2, [성능·확장성·신뢰성 요구사항](../nfr-requirements/) NFR4·NFR5, [관측 요구사항](../nfr-requirements/observability-requirements.md) NFR6·NFR7, [코드 생성 계획](code-generation-plan.md) Step 3~10의 시험 목록, [Unit 시험 지침](unit-test-instructions.md).

이 문서는 팀 Testing Contract(custom: "주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 세부 테스트 코드는 구현 후 작성·실행한다")의 첫 단계 산출물이다. 각 층을 구현한 뒤 아래 행을 그 층의 시험 코드로 옮긴다. 행의 시험 파일 이름은 계획과 Unit 시험 지침의 파일 목록과 같다.

**이번 실행(Step 1~3) 범위 표시**: 「Step 3」 열이 `O`인 행만 이번 실행의 `api/test/db/pdf-tables.test.cjs`·`member-cascade-delete.test.cjs`가 덮는다. 나머지 행은 담당자 검토 뒤 Step 4 이후에서 구현·시험한다.

## 1. DB 표·엔티티 (Step 3, 이번 실행)

| 번호 | 시나리오 | 기대 결과 | 실패 조건 | AC·BR·NFR | 시험 파일 | Step 3 |
|---|---|---|---|---|---|---|
| D-1 | 회원 행을 지운다 | 그 회원의 `pdf_material`·`pdf_page_text`가 모두 지워지고 다른 회원의 행은 남는다 | 남은 행이 하나라도 있거나 다른 회원 행이 사라짐 | AC14.1.4(PDF 부분), BR7.2, NFR5.1, C-06 | `api/test/db/pdf-tables.test.cjs`, `api/test/db/member-cascade-delete.test.cjs` | O |
| D-2 | `pdf_material` 행을 지운다 | 그 자료의 `pdf_page_text`만 지워지고 다른 자료의 쪽은 남는다 | 쪽 행이 남거나 다른 자료 쪽이 지워짐 | BR1.7, C-06 | `pdf-tables.test.cjs` | O |
| D-3 | 발행본·발행 항목을 지운다 | 그 항목의 `published_pdf_page`가 지워진다. 원본 `pdf_material`은 남는다(외래 키 없는 사본) | 쪽 사본이 남거나 원본이 함께 지워짐 | AC5.2.2·AC5.2.4(PDF 부분), BR7.1, NFR5.2, C-06·C-07 | `pdf-tables.test.cjs` | O |
| D-4 | 원본 `pdf_material`을 지운다 | `published_pdf_page`와 `published_item`(PDF_MATERIAL)은 그대로다 | 사본 행이 줄어듦 | AC3.1.5, BR4.4, NFR5.2 | `pdf-tables.test.cjs` | O |
| D-5 | 같은 PDF에 같은 `page_number`를 두 번 넣는다 | UNIQUE 위반(23505) | 두 행이 저장됨 | BR3.3(연속·중복 없음)의 DB 바닥, entities.md | `pdf-tables.test.cjs` | O |
| D-6 | 같은 발행 항목에 같은 `page_number`를 두 번 넣는다 | UNIQUE 위반(23505) | 두 행이 저장됨 | C-07 unique, BR4.3 | `pdf-tables.test.cjs` | O |
| D-7 | `pdf_page_text`에 readable=false인데 text가 비어 있지 않은 행 | CHECK 위반(23514) | 저장됨 | BR3.1·BR3.3, AC3.2.3, entities.md 제약 | `pdf-tables.test.cjs` | O |
| D-8 | `pdf_page_text`에 readable=true인데 text=''인 행 | CHECK 위반(23514) | 저장됨 | BR3.1·BR3.3(계획 3.1의 양방향 규칙) | `pdf-tables.test.cjs` | O |
| D-9 | `published_pdf_page`에 readable=false·text 있음 | CHECK 위반(23514) | 저장됨 | BR4.3, C-07 기존 문구 "읽을 수 없는 쪽은 빈 문자열"의 DB 강제(계획 3.1) | `pdf-tables.test.cjs` | O |
| D-10 | `published_pdf_page`에 readable=true·text='' | CHECK 위반(23514) | 저장됨 | BR4.3, C-07 readable/text 제약 강화(새 규칙 "읽을 수 있는 쪽은 빈 문자열 불가", 계획 3.1) | `pdf-tables.test.cjs` | O |
| D-11 | 두 표에 정상 쪽(readable=true·글 있음, readable=false·'')을 넣는다 | 저장되고 값이 그대로 읽힌다(글 가공 없음) | 거부되거나 값이 바뀜 | BR3.1·BR3.5, AC3.2.2·AC3.2.3 | `pdf-tables.test.cjs` | O |
| D-12 | `pdf_material` 상태 조합: DONE인데 page_count NULL / FAILED인데 failure_code NULL / PENDING인데 page_count 있음 / page_count 0·51 / 정의 밖 state·failure_code / file_size_bytes 0 / title '' | 각각 CHECK 위반(23514). 정상(PENDING·NULL, DONE·쪽 수, FAILED·사유)은 저장 | 어느 하나가 저장됨 | BR1.2(쪽 50)·BR2.1·BR2.2, entities.md 제약, NFR4.14 | `pdf-tables.test.cjs` | O |
| D-13 | 두 쪽 표에 `page_number` 0 | CHECK 위반(23514) | 저장됨 | C-07 CHECK (page_number >= 1), entities.md | `pdf-tables.test.cjs` | O |
| D-14 | 회원을 참조하는 외래 키 전수 조사 | 세 새 표의 외래 키가 모두 ON DELETE CASCADE(기존 시험이 새 표를 포함해 판정) | NO ACTION·SET NULL 외래 키가 생김 | C-06 rule, NFR5.1 | `member-cascade-delete.test.cjs`(기존 4번째 시험) | O |

## 2. FileStorage S3 드라이버 (Step 4)

| 번호 | 시나리오 | 기대 결과 | 실패 조건 | AC·BR·NFR | 시험 파일 | Step 3 |
|---|---|---|---|---|---|---|
| S-1 | put·get·copy·delete·deletePrefix 정상 | PutObject·GetObject 스트림·CopyObject·DeleteObject·ListObjectsV2+DeleteObjects가 키 그대로 불린다 | 다른 명령·다른 키 | BR7.3, NFR4.11 | `api/test/file-storage/s3-file-storage.test.cjs` | - |
| S-2 | get·copy에서 NoSuchKey | `FileNotFound` | StorageUnavailable이나 성공 | BR7.3, BR6.5 | `s3-file-storage.test.cjs` | - |
| S-3 | 네트워크·IO 오류 | `StorageUnavailable('IO_FAILED')` 한 번(SDK 기본 재시도 유지) | 예외가 그대로 새거나 재시도 설정이 바뀜 | BR7.3, NFR4.8·NFR4.15 | `s3-file-storage.test.cjs` | - |
| S-4 | deletePrefix에 1,001개 객체 | 1,000개 단위로 두 번 지우고 없는 접두어는 성공 | 1,000개 초과 한 번에 요청·없는 접두어 실패 | BR7.3 | `s3-file-storage.test.cjs` | - |
| S-5 | 키 모양이 틀린 입력 | `parseStorageKey`에서 거부, S3 호출 없음 | S3가 불림 | BR3.6·BR7.3, NFR1.7 | `s3-file-storage.test.cjs` | - |
| S-6 | `FILE_STORAGE_DRIVER=s3`인데 버킷 이름 없음 | 기동 실패(local 규칙과 같음) | 기동됨 | BR7.3 | `s3-file-storage.test.cjs` | - |
| S-7 | 로컬·S3 드라이버 공용 계약 시험 | 둘 다 같은 계약 시험 통과 | 어느 하나 실패 | BR7.3, NFR4.11 | `api/test/file-storage/storage-contract.cjs` | - |

## 3. PDF 업로드·목록·원본 열람·삭제 API (Step 5, W1)

| 번호 | 시나리오 | 기대 결과 | 실패 조건 | AC·BR·NFR | 시험 파일 | Step 3 |
|---|---|---|---|---|---|---|
| U-1 | 동의한 회원이 정상 PDF 업로드 | 201 `{ pdfMaterialId, title, fileSizeBytes, extractionState: PENDING }`, 행 PENDING·시한 = 커밋 + 10분, put 뒤 발송 1회 | 상태·시한·순서가 다름 | AC3.1.2, BR1.6·BR2.4, NFR4.2 | `api/test/materials/pdf-materials-api.test.cjs` | - |
| U-2 | 동의 없는 회원 | 403 `AI_CONSENT_REQUIRED`, 본문 읽지 않음·저장소 미호출 | 파일이 저장됨 | BR1.3, NFR2.1 | `pdf-materials-api.test.cjs` | - |
| U-3 | PDF 아님(선언 종류·머리 바이트) / 누적 20 MB 초과 / 제목 101자 / 정의 밖 필드 | 각 400 `VALIDATION_FAILED`, 저장소 미호출. 20 MB 초과는 선언 크기와 무관하게 누적 바이트에서 중단 | 저장되거나 500 | AC3.1.2, BR1.1·BR1.2, NFR1.6·NFR4.1 | `pdf-materials-api.test.cjs` | - |
| U-4 | 21벌째 업로드(동시 2건) | 회원 행 잠금 안에서 1건만 통과, 나머지 400·보상 삭제 1회 | 두 건 다 통과 | BR1.2, NFR4.1, NFR4.19 | `pdf-materials-api.test.cjs` | - |
| U-5 | 저장소 미설정·put 실패 | 500, 행 없음 | 행이 생김 | BR1.6, NFR4.19 | `pdf-materials-api.test.cjs` | - |
| U-6 | put 뒤 DB 실패 | `delete(materialKey)` 1회 시도 → 500, 삭제 실패는 로그만 | 파일이 남고 로그 없음 | BR1.6, NFR6.1 | `pdf-materials-api.test.cjs` | - |
| U-7 | 남의 것·없음·UUID 아님으로 상세·원본·삭제 | 모두 404 `RESOURCE_UNAVAILABLE` | 구분되는 응답·500 | BR1.8, NFR1.1 | `pdf-materials-api.test.cjs` | - |
| U-8 | 시한 지난 PENDING을 목록·상세에서 읽음 | FAILED(DEADLINE_EXCEEDED)로 저장되고 응답도 FAILED | PENDING 그대로 | BR2.2, NFR4.2·NFR4.14 | `pdf-materials-api.test.cjs` | - |
| U-9 | 작성자 원본 열람 | 200, 헤더 `application/pdf`·`inline; filename="material.pdf"`·`no-store`·`nosniff`, 제목은 헤더에 없음 | 헤더 누락·제목 노출 | BR6.6, NFR1.10 | `pdf-materials-api.test.cjs` | - |
| U-10 | 삭제 때 저장소 실패 | 500, DB 유지 | 행이 지워짐 | BR1.7, NFR5.1 | `pdf-materials-api.test.cjs` | - |
| U-11 | 정상 삭제 | 파일 먼저 삭제(없는 키 포함 성공) → 행 삭제·쪽 연쇄 → 204. 발행 사본은 그대로 | 순서 반대·사본 변경 | BR1.7·BR4.4, NFR5.1·NFR5.2 | `pdf-materials-api.test.cjs` | - |
| U-12 | 추출 요청 발송 실패 | 로그 `PDF_EXTRACT_ENQUEUE_FAILED`, 201 유지 | 500 또는 롤백 | BR2.4, NFR4.14·NFR6.1 | `pdf-materials-api.test.cjs` | - |

## 4. 추출 결과 수신 (Step 6, W2 api)

| 번호 | 시나리오 | 기대 결과 | 실패 조건 | AC·BR·NFR | 시험 파일 | Step 3 |
|---|---|---|---|---|---|---|
| R-1 | 51쪽 / pageNumber 불연속·중복 / readable=false인데 text 있음 / readable=true인데 text 빔 / FAILED인데 pages 있음·failureCode 없음 / 정의 밖 필드 | `REJECTED/SCHEMA_INVALID`, 저장 없음 | 저장되거나 다른 코드 | BR3.3, NFR4.7 | `api/test/materials/pdf-extraction-receiver.test.cjs` | - |
| R-2 | 자료 없음(삭제·탈퇴)·회원 불일치 | `REJECTED/CONTEXT_MISMATCH` | 저장됨 | BR3.3, NFR5.3 | `pdf-extraction-receiver.test.cjs` | - |
| R-3 | 이미 DONE | `DUPLICATE/ALREADY_RECEIVED`, 내용 비교 없음 | 덮어씀 | BR2.1·BR3.3 | `pdf-extraction-receiver.test.cjs` | - |
| R-4 | FAILED 또는 시한 지남 | `REJECTED/STALE_ATTEMPT`; 시한 지남이면 FAILED(DEADLINE_EXCEEDED) 저장 | PENDING 유지·저장됨 | BR2.2·BR3.3, NFR5.3 | `pdf-extraction-receiver.test.cjs` | - |
| R-5 | PENDING·시한 전·SUCCEEDED 50쪽 | 쪽 50행 INSERT + pageCount·DONE, 커밋 뒤 `ACCEPTED/OK` | 부분 저장·커밋 전 OK | BR3.4, AC3.2.2, NFR4.7·NFR4.16 | `pdf-extraction-receiver.test.cjs` | - |
| R-6 | PENDING·FAILED 결과 | FAILED + failureCode 저장, `ACCEPTED/OK` | 사유 누락 | BR3.2·BR3.4 | `pdf-extraction-receiver.test.cjs` | - |
| R-7 | 쪽 행 하나가 제약 위반 | 0행·PENDING 그대로, 수신 확인 없이 작업 실패 | 일부 행 남음 | BR3.4, NFR4.16 | `pdf-extraction-receiver.test.cjs` | - |
| R-8 | 로그 `PDF_EXTRACTION_RECEIVED` | 코드·pdfMaterialId만, 글·제목 없음 | 글이 로그에 남음 | BR3.5, NFR1.4·NFR6.1·NFR6.2 | `pdf-extraction-receiver.test.cjs` | - |

## 5. worker 추출 소비자 (Step 7, W2 worker)

| 번호 | 시나리오 | 기대 결과 | 실패 조건 | AC·BR·NFR | 시험 파일 | Step 3 |
|---|---|---|---|---|---|---|
| W-1 | 글 있는 여러 쪽의 합성 PDF | 쪽마다 readable=true·글, pages 길이 = 쪽 수 | 쪽 누락·순서 다름 | BR3.1, AC3.2.2 | `worker/tests/test_pdf_extraction.py` | - |
| W-2 | 공백·제어 문자만 있는 쪽 | readable=false·text='' | 공백 글이 남음 | BR3.1, AC3.2.3 | `test_pdf_extraction.py` | - |
| W-3 | 암호화 PDF | FAILED `ENCRYPTED`, pages 없음 | 다른 코드 | BR3.2 | `test_pdf_extraction.py` | - |
| W-4 | 파싱 실패·쪽 수 0 | FAILED `UNREADABLE_FILE` | 예외 전파 | BR3.2 | `test_pdf_extraction.py` | - |
| W-5 | 51쪽 | FAILED `PAGE_LIMIT_EXCEEDED` | 51쪽이 추출됨 | BR1.2·BR3.2 | `test_pdf_extraction.py` | - |
| W-6 | 글에 NUL 문자 | NUL만 제거, 나머지 가공 없음 | 다른 문자 변경 | BR3.1, NFR1.8 | `test_pdf_extraction.py` | - |
| W-7 | 봉투 검사·storageKey 모양 틀림·ID 불일치 | 결과 없이 작업 실패(JOB_FAILED 기록만) | 결과 발송 | BR3.6, NFR1.7 | `worker/tests/test_pdf_consumer.py` | - |
| W-8 | 자식 제한(시간·메모리) 초과 | 자식만 종료, FAILED `UNREADABLE_FILE`, Worker는 다음 작업을 받음 | worker 프로세스 멈춤 | NFR1.9·NFR4.3·NFR4.18 | `test_pdf_consumer.py` | - |
| W-9 | 결과 발송·수신 확인 | `worker-messages`에 `message-pdf-{id}-result`, 수신 확인을 `receipts.py` 방식으로 기록, 거부 결과 재발송 없음 | ID 규칙 다름·재발송 | C-16, NFR6.3·NFR4.15 | `test_pdf_consumer.py` | - |
| W-10 | 분석 Worker가 작업 중 | 추출 Worker는 독립 기동·동시성 설정 별개(기본 1) | 추출이 대기 | BR3.7, NFR4.4·NFR4.10 | `test_pdf_consumer.py` | - |

## 6. 발행의 PDF 부분 (Step 8, W3)

| 번호 | 시나리오 | 기대 결과 | 실패 조건 | AC·BR·NFR | 시험 파일 | Step 3 |
|---|---|---|---|---|---|---|
| P-a | PDF 없는 발행 + 저장소 미설정 | 201, FileStorage 미호출, 기존 `publish-api.test.cjs` 무수정 통과 | 저장소가 불리거나 기존 시험 실패 | BR5.6, NFR4.17 | `api/test/publications/publish-pdf.test.cjs` | - |
| P-b | 복사 실패 | 500, DB 행 없음, deletePrefix 1회 | DB 행 생김 | BR5.3, AC4.1.8, NFR4.17 | `publish-pdf.test.cjs` | - |
| P-c | 복사 성공 뒤 한도 429 | deletePrefix 1회, 429 그대로, DB 없음 | 오류 코드 변경 | BR5.4 | `publish-pdf.test.cjs` | - |
| P-d | chunk 예외 | 500, 정리 1회 | 정리 없음 | BR5.4 | `publish-pdf.test.cjs` | - |
| P-e | 정리 실패 | 응답 코드 유지, `PREFIX_CLEANUP_FAILED` 로그(단계 번호, 접두어 값 없음) | 응답 변경·접두어 노출 | BR5.5, NFR6.1·NFR6.2 | `publish-pdf.test.cjs` | - |
| P-f | PENDING/FAILED PDF 포함 | 400 `VALIDATION_FAILED` `extractionIncomplete`, 복사 없음 | 복사가 시작됨 | BR4.1, AC4.1.9, NFR7.3 | `publish-pdf.test.cjs` | - |
| P-g | 정상 발행 | `published_pdf_page` 행 수 = `pdf_page_text` 행 수, `pdf_copy_key` = publishedPdfKey, snapshot `{ pageCount }`, 이후 원본 변경·삭제에도 사본 불변 | 사본 변동 | AC3.1.5·AC4.1.1, BR4.3·BR4.4, NFR4.6·NFR5.2 | `publish-pdf.test.cjs` | - |
| P-h | 잠금 순서 | U4 BR5.1 순서 뒤 PDF `FOR SHARE`(pdf_material_id 오름차순) 재확인, 발행 도중 삭제·상태 변화면 롤백 | 앞 순서가 바뀜 | BR4.2 | `publish-pdf.test.cjs`(코드 검토 보조) | - |

## 7. 받은 사람·작성자 PDF 사본 열람 (Step 9, W4 API)

| 번호 | 시나리오 | 기대 결과 | 실패 조건 | AC·BR·NFR | 시험 파일 | Step 3 |
|---|---|---|---|---|---|---|
| V-1 | 비밀번호 링크에 grant 없음 | 401 `LINK_PASSWORD_REQUIRED` | 파일 내려줌 | BR6.1, NFR1.2 | `api/test/publications/recipient-pdf.test.cjs` | - |
| V-2 | 중지·만료·삭제된 링크 | 404 `LINK_UNAVAILABLE` | 파일 내려줌 | BR6.1, NFR1.2 | `recipient-pdf.test.cjs` | - |
| V-3 | 다른 발행본 항목·텍스트 항목·없는 항목·UUID 아님 | 404 `LINK_UNAVAILABLE`, 구분 없음 | 구분되는 응답·500 | BR6.2, NFR1.2 | `recipient-pdf.test.cjs` | - |
| V-4 | 사본 행은 있는데 파일 없음·저장소 장애 | 500, 로그에 키 값 없음 | 키 노출 | BR6.5, NFR4.19·NFR6.2 | `recipient-pdf.test.cjs` | - |
| V-5 | 정상 열람 | 200, 헤더 4종, Range 없음, 시도 제한 없음 | 헤더 누락 | AC3.2.1·AC4.4.1, BR6.7, NFR1.10·NFR4.5 | `recipient-pdf.test.cjs` | - |
| V-6 | 작성자가 중지·만료 뒤 사본 열람 | 200(`resolveForOwner`) | 404 | BR6.6, NFR1.1 | `recipient-pdf.test.cjs` | - |
| V-7 | 전송 도중 스트림 오류 | 연결 중단, `PDF_VIEW_FAILED`(streaming) 로그 | 200 본문 일부로 끝남 | NFR4.19·NFR6.1 | `recipient-pdf.test.cjs` | - |

## 8. web PDF 탭·뷰어·쪽 표시 (Step 10, W1 화면·W4)

| 번호 | 시나리오 | 기대 결과 | 실패 조건 | AC·BR·NFR | 시험 파일 | Step 3 |
|---|---|---|---|---|---|---|
| F-1 | 제출 전 검사(종류·20 MB·제목 100자·파일 1개) | 요청 없이 안내 | 요청이 나감 | BR1.1·BR1.2, NFR4.1 | `web/test/pdf-materials-api.test.mjs` | - |
| F-2 | 403 `AI_CONSENT_REQUIRED` | U2 동의 창 뒤 같은 요청 재전송 1회 | 재전송 없음·무한 반복 | BR1.3, NFR2.1 | `pdf-materials-api.test.mjs` | - |
| F-3 | 목록 매핑·배지 | 추출 중/완료 n쪽/실패 사유별 문구 | 문구 불일치 | BR2.3, NFR7.1 | `pdf-materials-api.test.mjs` | - |
| F-4 | 민감 정보 안내·외부 AI 고지 | 텍스트 자료와 같은 문구 표시 | 문구 없음 | AC3.1.4, BR1.5, NFR2.3 | `pdf-materials-api.test.mjs`(문구 상수) | - |
| F-5 | 본문 수신 실패 | Blob 생성 없음, 일반 열람 실패 안내(grant 유지) | Blob이 생김 | BR6.3, NFR7.3 | `web/test/pdf-viewer.test.mjs` | - |
| F-6 | 401·404 | `onAccessLost(code)` | 다른 처리 | BR6.3, NFR1.3 | `pdf-viewer.test.mjs` | - |
| F-7 | 팝업 차단 | 요청 1회·화면 안 뷰어 + 안내 | 요청 2회 | BR6.3 | `pdf-viewer.test.mjs` | - |
| F-8 | 같은 뷰어 쪽 이동·해제 시점 | Blob 재사용, 닫기·언마운트·onAccessLost 때 해제 | 누수 | BR6.3, 보안 설계 §2 | `pdf-viewer.test.mjs` | - |
| F-9 | `fieldText(pages[n])`·readable=false 표지·`pickItem` pdfPages 통과 | `pdfPages[n-1].text`, "읽을 수 없음", 글은 텍스트 노드 | 마크업 해석 | AC3.2.3·AC6.3.5, BR6.4, NFR1.8·NFR7.2 | `web/test/recipient-pdf.test.mjs` | - |

## 9. 삭제·탈퇴·S3 확인 (Step 4·8·9, W5)

| 번호 | 시나리오 | 기대 결과 | 실패 조건 | AC·BR·NFR | 시험 파일 | Step 3 |
|---|---|---|---|---|---|---|
| X-1 | PDF 사본이 있는 발행본 삭제(로컬 드라이버) | 접두어 파일 없음·`published_pdf_page` 없음·원본과 다른 발행본 유지 | 파일 또는 행 남음 | AC5.2.2·AC5.2.4, BR7.1, NFR5.1 | `publish-pdf.test.cjs` 또는 U4 `publication-manage` 시험에 추가 | - |
| X-2 | 탈퇴(로컬 드라이버) | memberPrefix 아래 원본·사본 모두 없음 | 파일 남음 | AC14.1.4, BR7.2, NFR5.1 | U2 탈퇴 시험에 PDF 행 추가(Step 4 이후 결정) | - |
| X-3 | S3 실제 삭제 확인 | 버킷(#389) 준비 뒤 1회 수동 확인, FR19 확인 표 기록 | — | NFR5.4, OQ-U8-2 | 자동 시험 아님(미실행으로 기록) | - |

## 실행하지 않는 시험과 이유

- S3 실제 복사·삭제: 버킷·역할(#389) 준비 전. 가짜 클라이언트 시험(S-1~S-7)으로 대신하고 `code-summary.md`에 "S3 실제 확인 미완"을 남긴다(NFR5.4).
- 브라우저 수동 확인(iframe 쪽 이동·새 탭·팝업 차단·20 MB 열람): 자동 시험이 아니라 FR19 확인 표에 적는다(NFR4.5·NFR6.4).
- 대표 PDF 연속 업로드 측정(NFR4.4)은 Step 11에서 1회 재어 기록하며 시험이 아니다.
