# U8 PDF 자료 — 신뢰성 설계

작성일: 2026-11-06. Unit: `u8-pdf-materials`. 입력: [신뢰성 요구사항](../nfr-requirements/reliability-requirements.md), [성능 요구사항](../nfr-requirements/performance-requirements.md), [보안 요구사항](../nfr-requirements/security-requirements.md), [확장성 요구사항](../nfr-requirements/scalability-requirements.md), [관측 요구사항](../nfr-requirements/observability-requirements.md), [기술 선택](../nfr-requirements/tech-stack-decisions.md), [기능 명세](../functional-design/functional-spec.md) W1~W5, [계약 요약](../../../inception/contract-design/contract-summary.md) 「에러 대응 최소선」·C-02·C-05·C-16·C-17, [NFR 설계 질문·답변](nfr-design-questions.md).

회로 차단기·격벽(bulkhead) 라이브러리·작업 자동 재시도·헬스체크 추가·백업은 두지 않는다. 신뢰성은 "시한 하나로 실패 확정, 전부 아니면 전무, 저장소 먼저 삭제, 사람이 다시 시도"의 네 패턴으로 지킨다.

## 1. 시한 판정 패턴(읽을 때 확정)

```
readStatus(row, now):
  if row.state == PENDING and now >= row.deadline_at:
      UPDATE pdf_material SET state='FAILED', failure_code='DEADLINE_EXCEEDED'
       WHERE id = row.id AND state = 'PENDING'      -- 조건부, 0행이면 다른 쪽이 먼저 바꿈
      return FAILED
  return row.state
```

목록·상세·발행 사전 확인·결과 수신이 모두 이 함수를 거친다. 스케줄러·타이머·재시도 큐가 없어도 "영원한 PENDING"이 없다(NFR4.14). 큐 등록 실패·유실·worker 꺼짐은 모두 이 경로로 FAILED가 된다.

## 2. 추출 격리와 실패 확정

- 추출 Worker는 `pdf-extraction-requests` 전용, 분석 Worker와 독립(NFR4.4의 전제). 큐 설정은 10월 규칙(시도 1회, 재시도 없음, `maxStalledCount: 0`)을 그대로 쓴다.
- 작업마다 자식 프로세스 1개. 부모가 시간·메모리 제한을 걸고, 초과하면 자식을 종료하고 FAILED(UNREADABLE_FILE)를 보고한다. 자식의 비정상 종료(신호·예외)도 같은 FAILED다. 제한값은 구현 단계에서 기존 분석 소비자 값과 대표 PDF 측정으로 정한다(NFR4.18).
- 큐 잠금이 끊긴 작업(worker 재시작 등)은 10월 규칙대로 다시 주지 않고 실패로 끝나며, 자료는 시한으로 FAILED가 된다.

## 3. 전부 아니면 전무(결과 수신)

판정 → 저장 → 커밋을 한 트랜잭션에서 한다. `pdf_material` 행을 `FOR UPDATE`로 잠가 같은 자료의 결과가 둘 와도 순서대로 판정된다(둘째는 ALREADY_RECEIVED 또는 STALE_ATTEMPT). 쪽 행 INSERT 중 하나라도 실패하면 롤백되어 0행·PENDING 그대로다. 수신 확인은 커밋 뒤에만 보내고 커밋 실패는 수신 확인 없이 작업 실패로 둔다(NFR4.16, NFR5.3).

## 4. 발행 보상(C-17)

| 단계 | 실패 | 보상 | 응답 |
|---|---|---|---|
| 2 복사 | copy 실패(FileNotFound·StorageUnavailable) | `deletePrefix(publicationPrefix)` 1회 | 500 |
| 4 트랜잭션 | 롤백(429·404·400 재확인·chunk 예외·DB 오류) | `deletePrefix(publicationPrefix)` 1회 | 원래 오류 그대로 |
| 6 보상 자체 실패 | 3·5단계에서 시도한 deletePrefix 실패 | C-17 6단계: 로그 `PREFIX_CLEANUP_FAILED`만(정리를 부른 단계 번호 포함) | 위 응답 유지 |

고아 파일은 탈퇴 때 회원 접두어 삭제로 지워진다. 청소 장치는 없다. PDF 항목이 없으면 저장소를 부르지 않아 저장소 장애가 일반 발행에 영향을 주지 않는다(NFR4.17).

## 5. 삭제 순서(저장소 먼저)

| 동작 | 순서 | 실패 처리 |
|---|---|---|
| 자료 삭제 | `delete(materialKey)` → 성공(없는 키 포함) → 행 삭제(쪽 글 연쇄) | 저장소 실패면 500, DB 유지 |
| 발행본 삭제(U4) | `deletePrefix(publicationPrefix)` → 행 삭제(항목·쪽 사본 연쇄) | 저장소 실패면 오류, DB 유지 |
| 탈퇴(U2) | 1 트랜잭션(세션·링크 중지·MCP) → 2 `deletePrefix(memberPrefix)` → 3 자격 파일 → 4 회원 행 | 어느 단계든 실패면 오류 |

DB 행이 남으면 파일이 다시 지워질 기회가 있고, 파일이 남으면 접두어 삭제로 뒤에 지워진다. 반대 순서(DB 먼저)는 파일만 고아로 남길 수 있어 쓰지 않는다(NFR5.1). 사본 파일과 `published_pdf_page`는 원본과 독립이라 원본 삭제·재업로드에 영향받지 않는다(NFR5.2). S3 실제 삭제 확인은 버킷 준비 뒤 1회 하고 확인 표에 적는다(NFR5.4).

## 6. 재시도 정책

| 수준 | 정책 | 요구사항 |
|---|---|---|
| 작업(추출) | 자동 재시도 없음. 재시도 = 작성자의 다시 올리기 | NFR4.15 |
| 작업(발행) | 자동 재시도 없음. 재시도 = 새 발행 | NFR4.15 |
| 전송(S3 호출) | AWS SDK 기본 재시도 모드(최대 3회, 짧은 대기). 최종 실패는 `StorageUnavailable` 한 번 | NFR4.8·4.15 |
| 큐 작업 | 시도 1회, 재시도·backoff 없음(10월 규칙) | NFR4.14 |

## 7. 저장소 장애 시 동작

| 경로 | 저장소 없음·장애 | 요구사항 |
|---|---|---|
| 업로드 | 누적 바이트 20 MB 초과 → 수신 중단·400(저장소 미호출). `put` 실패 → 500, 행 없음. `put` 뒤 DB 실패 또는 회원 행 잠금 안의 벌 수 초과(롤백) → `delete(materialKey)` 1회 시도 → 500 또는 400 | NFR4.19, NFR1.6 |
| 발행(PDF 있음) | 복사 실패 → 보상 → 500 | NFR4.17 |
| 발행(PDF 없음) | 저장소 미호출, 정상 201 | NFR4.17 |
| 열람(헤더 전) | `get` 열기 실패·파일 없음 → 500, 로그(키 값 없음) | NFR4.19 |
| 열람(전송 도중) | 스트림 오류 → 응답 중단(연결 끊음), `PDF_VIEW_FAILED`(storage, streaming) 로그. web은 본문 수신 실패로 받아 Blob을 만들지 않고 일반 열람 실패 안내(접근 상실 아님) | NFR4.19, NFR7.3 |
| 삭제 | 저장소 실패 → 500, DB 유지 | NFR5.1 |

## 8. 두지 않는 것

가동률·복구 목표, 백업·버전 관리(버킷 버전 관리 끔), 회로 차단기, 격벽 라이브러리, 추가 헬스체크(worker의 기존 상태 확인 서버 재사용), 자동 복구·재처리(NFR4.20, 에러 대응 최소선).
