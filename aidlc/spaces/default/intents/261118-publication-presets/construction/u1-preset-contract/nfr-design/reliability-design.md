# Reliability Design — u1-preset-contract(U1)

근거: NFR 요구 `construction/u1-preset-contract/nfr-requirements/performance-requirements.md`·`security-requirements.md`·`scalability-requirements.md`·`reliability-requirements.md`·`observability-requirements.md`·`tech-stack-decisions.md`, 기능 설계 `construction/u1-preset-contract/functional-design/functional-spec.md`, 계약 `inception/contract-design/contract-summary.md`, 이 단계 질문 `nfr-design-questions.md`, 지금 코드. NFR 요구 검토 `construction/u1-preset-contract/nfr-requirements/reviews/review-01.md`.

| 요구 | 설계 |
|---|---|
| NFR2.7 | 만들기·고치기는 READ COMMITTED 한 트랜잭션: 회원 확인 → (고치기) 소유 확인 → (만들기) 50개 확인 → 자료 소유 확인 → 글자 수 → 프리셋 행 쓰기·고치기 → 항목 모두 지우고 다시 쓰기. 예외면 전체가 되돌아간다 |
| NFR2.8 | 발행 순서는 지금 그대로다. 프리셋 펴기만 맨 앞(트랜잭션 밖, PDF 확인 전)에 더한다 |
| NFR2.9 | 프리셋 행을 잠그지 않는다. 동시 저장이 유일·외래 키 제약에 걸리면 DB 오류가 공통 필터에서 500이 된다 |
| NFR2.10 | 목록·상세·세기는 발행의 판정 함수(PublishableSource로 옮긴 자격 판정)를 자료마다 부른다. 판정이 기록 문제 예외를 던지면 잡지 않아 요청 전체가 500이다. 다른 자료의 이유보다 먼저 끝난다(이 단계 정리, NFR 요구 검토 R-03). 발행은 지금 순서(확인 필요 → 기록 문제 → 보호, 그다음 비공개)를 둔다 |
| NFR2.11 | 이유가 있는 막힘은 ApiError(정해진 코드 + details)로, 없음은 404, 그 밖은 잡지 않고 500으로 둔다 |
| NFR2.12 | 사본 항목 타입의 isFirstCopy를 필수 칸으로 하고, 기존 시험의 사본 객체 만드는 곳(요약·질의응답·받은 링크 읽기·JD 요약 시험)에 칸을 넣는다 |
| NFR2.13 | 발행의 전체 글 합계는 편 항목마다 그 원본의 글자 수(PDF는 잠근 쪽 글 합)를 더한다. 잠금 결과 Map의 값을 그대로 합하지 않는다 |
| NFR2.14 | 마이그레이션 up: 프리셋 표 둘 생성 → `DELETE FROM publication` → published_item에 칸 둘 NOT NULL 추가. down: 칸 둘 제거 → 프리셋 표 둘 제거(지운 발행본은 되살리지 않음) |
| NFR2.15 | 배포 안내와 첫 PR 본문에 지울 곳(`members/*/publications/`), S3 `--dryrun` 먼저, 지우지 말 곳(`members/*/materials/`, `members/` 전체), 로컬은 선택을 적는다 |

- 자동 재시도·회로 차단기는 두지 않는다(12월 계약 「에러 대응 최소선」).
