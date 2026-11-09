# U8 PDF 자료 — Unit 시험 지침

작성일: 2026-11-06. Unit: `u8-pdf-materials`. 시험 전략 Standard(컴포넌트당 5~8개, 단위 + 경계 통합), 범위 바닥 mvp(80% 줄 커버리지, CI 실행). Testing Contract의 custom 순서: 시나리오·기대 결과·실패 조건을 먼저 정하고(계획 Step 1), 층마다 구현 뒤 시험을 쓰고 실행한다.

## 시험 틀과 설정(기존 재사용, 새 도구 없음)

| 서비스 | 러너 | 설정 | 사전 조건 |
|---|---|---|---|
| api | `node --test`(`.test.cjs`), `scripts/test-with-db.cjs`가 테스트 DB에 마이그레이션 적용 뒤 실행 | `api/package.json`의 `test`·`test:coverage` | 테스트 DB 컨테이너(README 「DB 테스트」, 기본 127.0.0.1:5433 `catchu_test`). `npm run build`가 먼저 돈다 |
| worker | `pytest`(`uv run`) | `worker/pyproject.toml` dev 그룹(pytest·pytest-cov) | `uv sync` |
| web | `node --test`(`.test.mjs`) | `web/package.json`의 `test`·`test:coverage` | 없음 |

## 이 Unit의 시험을 돌리는 명령(Unit 한정)

러너가 동작하는지 확인하는 명령(계획 Step 2, 첫 시험 작성 전에 실행 가능해야 함):

```bash
cd api && npm test -- test/db/publication-tables.test.cjs
cd worker && uv run pytest tests/test_health.py
cd web && node --test test/api-client.test.mjs
```

이번 실행 범위(Step 1~3)의 시험 — DB 표·엔티티·연쇄 삭제·readable/text 제약:

```bash
cd api && npm test -- test/db/pdf-tables.test.cjs test/db/member-cascade-delete.test.cjs
```

Step 4 이후(담당자 검토 뒤)의 이 Unit 시험(파일이 생기는 단계부터 그 파일을 더해 실행):

```bash
cd api && npm test -- test/db/pdf-tables.test.cjs test/file-storage/s3-file-storage.test.cjs test/materials/pdf-materials-api.test.cjs test/materials/pdf-extraction-receiver.test.cjs test/publications/publish-pdf.test.cjs test/publications/recipient-pdf.test.cjs
cd worker && uv run pytest tests/test_pdf_extraction.py tests/test_pdf_consumer.py
cd web && node --test test/pdf-materials-api.test.mjs test/pdf-viewer.test.mjs test/recipient-pdf.test.mjs
```

회귀 확인(U4 발행 경로가 바뀌지 않았는지, 수정 없이 통과해야 함):

```bash
cd api && npm test -- test/publications/publish-api.test.cjs test/publications/recipient-api.test.cjs test/db/member-cascade-delete.test.cjs
```

## 커버리지 목표

- 바닥: 줄 80%(Testing Contract scope floor). **Build and Test가 전체 스위트로 판정한다.** Unit 한정 실행에서는 다른 Unit의 시험이 덮는 코드 때문에 러너의 임계값에 걸릴 수 있다. 선택한 시험이 모두 통과하고 임계값만 넘지 못하면 실패한 시험이 아니라 그 사실을 결과에 적는다. 임계값은 바꾸지 않는다.
- Unit 범위 측정(임계값 종료가 뒤 단계를 막지 않도록 각각 별도 명령으로):

```bash
cd api && TEST_COVERAGE_INCLUDE='dist/materials/**' npm run test:coverage -- test/materials/pdf-materials-api.test.cjs test/materials/pdf-extraction-receiver.test.cjs
cd api && TEST_COVERAGE_INCLUDE='dist/pdf-extraction/**' npm run test:coverage -- test/materials/pdf-extraction-receiver.test.cjs
cd api && TEST_COVERAGE_INCLUDE='dist/file-storage/**' npm run test:coverage -- test/file-storage/s3-file-storage.test.cjs
cd worker && uv run pytest --cov=app/pdf_extraction tests/test_pdf_extraction.py tests/test_pdf_consumer.py
cd web && node --test --experimental-test-coverage --test-coverage-include='src/features/materials/pdf-*.ts' --test-coverage-include='src/features/materials/pdf-*.tsx' --test-coverage-include='src/features/recipient/pdf-viewer-launcher.tsx' --test-coverage-include='src/features/publications/published-pdf-item.tsx' test/pdf-materials-api.test.mjs test/pdf-viewer.test.mjs test/recipient-pdf.test.mjs
```

## 가짜·대역 지침

- S3: 요청(명령 이름·키·본문 길이)을 기록하고 설정한 오류(NoSuchKey·네트워크)를 돌려주는 가짜 클라이언트. 로컬 드라이버와 같은 계약 시험을 공유 지원 파일(`api/test/file-storage/storage-contract.cjs`)로 돌린다. 실제 버킷은 쓰지 않는다.
- 큐: api 발송은 가짜 큐로 등록 호출만 확인(실패 주입으로 로그·201 유지 확인). worker 시험은 `tests/consumer_harness.py`의 기존 가짜 큐 틀을 재사용한다.
- DB: 테스트 DB에 실제 마이그레이션(제약·연쇄 삭제·`FOR UPDATE`·`FOR SHARE` 시험은 DB가 필요). 각 시험은 자기 회원·자료를 만들고 끝에 지운다.
- PDF 바이트: 시험 안에서 만든 합성 PDF(최소 PDF 구조 몇 KB, 글 있는 쪽·빈 쪽·암호화 플래그·51쪽)를 쓰고 저장소에 실제 파일을 두지 않는다. 사용자 자료는 쓰지 않는다.
- 동의·C-10: `AiConsentGate`와 `PublicationAccess`는 U2·U4 기존 구현을 쓰고, API 시험은 시험 회원으로 동의 있음/없음, 링크 유효/중지/비밀번호 각 상태를 만든다. 시험용 권한 우회는 두지 않는다.
- 시간: 시한 판정 시험은 `now`를 주입해 시한 경과를 만든다(실제 10분 대기 없음).

## 시험 자료 관리

- 합성 PDF는 시험 코드가 생성한다(저장소에 바이너리 추가 없음).
- 로그에 토큰·grant·키·글이 없는지는 실패 경로 시험에서 로그 출력을 캡처해 확인한다.

## 기대 결과(요약)

| 영역 | 핵심 기대 |
|---|---|
| 업로드 | 상한·동의·머리 바이트 위반은 저장소 미호출로 거부, 정상은 PENDING 201, 21벌째 동시 요청 중 1건만 통과 |
| DB 표(이번 범위) | 세 표 연쇄 삭제, UNIQUE, `readable = (text <> '')` 두 방향 위반 거부(`pdf_page_text`·`published_pdf_page` 모두), 상태·쪽 수 CHECK |
| 추출·수신 | 판정 5종 코드 정확(readable/text 불일치 두 방향 모두 SCHEMA_INVALID), 전부 아니면 전무, 시한 경과는 읽을 때 FAILED |
| 발행 | PDF 없는 발행은 저장소 미호출·기존 시험 무수정 통과, 실패 단계마다 접두어 정리 1회·원래 오류 유지 |
| 열람 | C-10 판정·발행본 소속 항목만, 헤더 4종, 전송 도중 오류는 연결 중단 |
| web | 본문 수신 성공 때만 Blob, 401·404는 onAccessLost, 팝업 차단은 요청 1회·화면 안 뷰어 |
