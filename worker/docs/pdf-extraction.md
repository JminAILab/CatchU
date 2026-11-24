# PDF 글 추출 소비자 — U8, #627

12월 U8. 작성 회원이 올린 PDF에서 쪽별 글을 뽑아 api로 돌려준다. 분석 요청 큐 소비자와 **같은 프로세스**(`python -m app.consumer`)에서 둘째 Worker로 돌며, 아래 읽기 경로 설정이 없으면 띄우지 않는다. 큐·메시지 규격, 수신 판정, 확인 범위(실제 S3·큐·worker 흐름은 2026-11-19 합성 PDF 두 벌로 화면에서 확인, Compose 전체 스택 안의 업로드·추출은 미검증)는 [api PDF 자료 문서](../../api/docs/pdf-materials.md)에 있다.

작업마다 자식 프로세스 하나가 원본을 읽기만 하고 pypdf로 쪽 글을 뽑는다(OCR 없음, 글 없는 쪽은 `readable: false`). 결과는 한 번만 보내고, 거부되거나 수신 확인을 못 봐도 다시 보내거나 다시 추출하지 않는다.

| 경우 | 결과 |
|---|---|
| 요청 봉투 모양 오류 | 결과 없이 작업 실패(`PDF_REQUEST_INVALID`) |
| 파싱 실패, 쪽 수 0, 어느 한 쪽의 추출 예외 | `FAILED`/`UNREADABLE_FILE` |
| 암호화된 PDF | `FAILED`/`ENCRYPTED` |
| 51쪽 이상 | `FAILED`/`PAGE_LIMIT_EXCEEDED` |
| 쪽 글 합계 60,000자 초과 | `FAILED`/`TEXT_LIMIT_EXCEEDED` |
| 자식의 시간·메모리 제한 초과, 원인 모를 자식 종료 | `FAILED`/`UNREADABLE_FILE` |
| 저장소 장애, 자식 코드 결함, 내부 결과 손상 | 결과 없이 작업 실패. 자료는 api의 10분 시한으로 실패가 된다 |

상한 값은 api와 같은 값이며 `app/pdf_extraction/settings.py`에 있다. 한쪽만 바꾸지 않는다.

## 쪽 글 다듬기

뽑은 글은 신뢰하지 않는 입력이라 가공하지 않는다. 다만 저장할 수 없는 NUL은 지우고, 줄바꿈·탭을 뺀 제어 문자(U+0001~U+001F, U+007F~U+009F)는 공백 한 글자로 바꾼다. 맥 Chrome으로 만든 PDF는 일부 글꼴(Apple SD Gothic Neo·Hiragino·Didot Bold)에서 띄어쓰기를 이런 제어 문자로 적는다. 그대로 두면 브라우저가 그리지 않아 화면과 AI 요약에서 낱말이 붙는다([#627](https://github.com/JminAILab/CatchU/issues/627)).

- 한 글자를 한 글자로 바꾸므로 60,000자 셈은 NUL을 뺀 것 말고는 바뀌지 않는다.
- 탭(AppleGothic·Optima 등)과 줄바꿈(Helvetica Neue Bold)으로 적힌 띄어쓰기는 그대로 남는다. 탭은 공백 문자로 다뤄지고, 줄바꿈은 진짜 줄바꿈과 구별할 수 없다.
- 이 규칙 전에 끝난 추출 결과와 이미 만든 발행본은 바뀌지 않는다. PDF를 다시 올려 새로 발행해야 고쳐진다.

## 설정

설명은 `.env.example`에 있다. 큐 주소·접두사는 분석 소비자 설정을 함께 쓴다([queue-consumer.md](queue-consumer.md) 「설정」).

| 이름 | 기본 | 내용 |
|---|---|---|
| `PDF_FILE_ROOT` | 없음 | 로컬·시험용 읽기 경로. api의 `FILE_STORAGE_LOCAL_ROOT`와 같은 폴더의 절대 경로 |
| `FILE_STORAGE_S3_BUCKET` | 없음 | 배포용 읽기 경로. api와 같은 버킷 이름. 접근 키 없이 역할을 쓰고 지역은 `AWS_DEFAULT_REGION` |
| `CATCHU_WORKER_PDF_CONCURRENCY` | 1 | 동시 추출 수. 지금은 1만 받는다 |
| `CATCHU_WORKER_PDF_CHILD_TIMEOUT_SECONDS` | 120 | 자식의 총 시간(1~600) |
| `CATCHU_WORKER_PDF_CHILD_MEMORY_MB` | 512 | 자식 메모리 제한(64~16384, Linux에서만 적용) |

- 두 읽기 경로 가운데 하나만 넣는다. 둘 다 넣거나, 읽기 경로 없이 나머지 값만 넣으면 기동하지 않는다.
- 떴는지는 기동 로그의 `pdf=enabled(concurrency=1)`로 확인한다.
- 시험: `uv run --locked pytest tests/test_pdf_extraction.py tests/test_pdf_consumer.py tests/test_pdf_service.py`. 로컬 합성 구성의 파일 볼륨 쓰는 법은 [deploy/compose.local-db.yaml](../../deploy/compose.local-db.yaml)의 주석에 있다.
