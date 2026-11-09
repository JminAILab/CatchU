# U8 PDF 자료 — 확장성 설계

작성일: 2026-11-06. Unit: `u8-pdf-materials`. 입력: [확장성 요구사항](../nfr-requirements/scalability-requirements.md), [성능 요구사항](../nfr-requirements/performance-requirements.md), [보안 요구사항](../nfr-requirements/security-requirements.md), [신뢰성 요구사항](../nfr-requirements/reliability-requirements.md), [관측 요구사항](../nfr-requirements/observability-requirements.md), [기술 선택](../nfr-requirements/tech-stack-decisions.md), [기능 명세](../functional-design/functional-spec.md), [계약 요약](../../../inception/contract-design/contract-summary.md) C-05·C-16, [NFR 설계 질문·답변](nfr-design-questions.md).

시연 규모(소수 외부 사용자)가 가정이다. 자동 확장 규칙·용량 임계값·분할(sharding)은 두지 않는다(NFR4.13). 아래는 "늘려야 할 때 코드 변경 없이 설정으로 되는 구조"만 적는다.

| 영역 | 설계 | 요구사항 |
|---|---|---|
| api 무상태 | 업로드는 요청 안에서 메모리 버퍼 → 저장소 → DB로 끝나고, 열람은 저장소 스트림을 파이프한다. 인스턴스 사이 공유 상태·로컬 디스크 임시 파일이 없어 api 인스턴스를 늘려도 동작이 같다. | NFR4.12 |
| 저장소 | 환경별 S3 버킷 1개, `members/{memberId}/materials/`·`members/{memberId}/publications/{publicationId}/` 접두어. 삭제 경로(접두어 삭제)는 자료 수와 무관하게 같다. `deletePrefix`는 1,000개 단위로 목록·삭제를 반복한다. | NFR4.11 |
| 추출 용량 | 추출 Worker 동시성은 설정값(기본 1). 분석 Worker 동시성과 별개 설정. 늘릴 때는 설정만 바꾸고, 자식 프로세스 수는 동시성과 같다. | NFR4.10 |
| 데이터 상한 | 회원당 PDF 20벌·PDF당 50쪽 → `pdf_material` ≤ 20행, `pdf_page_text` ≤ 1,000행/회원. 발행 사본은 발행본의 PDF 항목 수 × 쪽 수. 인덱스는 외래 키·유일 제약(`(pdf_material_id, page_number)`, `(published_item_id, page_number)`)으로 충분하다. | NFR4.9 |
| 큐 | 기존 Redis/BullMQ에 큐 1개 추가. 작업 보관 기간은 10월 규칙(완료·실패 작업 보관 기간 ≥ 시한)을 따른다. | NFR4.10 |
| 두지 않는 것 | 자동 확장 규칙, 용량 계획, 부하 시험, 읽기 복제, 분할, 캐시 계층 | NFR4.13, C06 |
