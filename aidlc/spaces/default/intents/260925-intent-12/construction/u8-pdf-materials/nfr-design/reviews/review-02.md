## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-06T11:48:13Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-design/reliability-design.md > §7 저장소 장애 시 동작(열람 행) 및 performance-design.md > 열람 전송 | 열람은 저장소 스트림을 응답에 그대로 파이프한다고 하면서 "get 실패·파일 없음 → 500"이라고만 적었다. 응답 헤더(200)를 보낸 뒤 스트림 중간에 저장소 오류가 나면 500으로 바꿀 수 없다. 이 경우 web은 잘린 PDF를 정상 응답으로 받아 Blob으로 열 수 있는데, 이 동작이 설계에 없다. Content-Length는 "저장소가 길이를 알려 주면" 조건부다. | 헤더를 보내기 전에 파일 존재와 열기 성공을 확인한다(파일 없음은 그 시점에 500)고 적는다. 스트림 도중 오류는 연결을 끊어 web의 fetch가 실패로 처리하게 하고 `PDF_VIEW_FAILED`(이유 storage)로 기록한다고 적는다. web이 fetch 실패를 `onAccessLost`가 아닌 일반 열람 실패 안내로 보인다는 한 줄도 더한다. | Resolved (reviewer) |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-design/performance-design.md > 업로드 처리 순서 | "크기 상한(요청 헤더·multipart 메타)"으로 20 MB를 끊는다고 했지만 multipart 부분에는 파일별 크기 메타가 없고 Content-Length는 클라이언트가 적은 값이거나 없을 수 있다. 또 파일을 메모리 버퍼 1개로 받으므로 동시 업로드 수만큼 최대 20 MB가 쌓인다. 이 메모리 부담은 수용한 위험으로 적혀 있지 않다. 회원당 20벌도 COUNT 뒤 INSERT라 동시 업로드에서 약간 넘을 수 있는데 이것도 적혀 있지 않다. | 상한을 업로드 스트림의 누적 바이트로 강제하고 넘으면 즉시 끊어 400을 돌려준다고 명시한다. 보안 설계 §10의 수용한 위험 표에 "동시 업로드 시 메모리 사용(시연 규모 가정)"과 "20벌 동시 초과 가능성"을 결정으로 더하거나, 20벌 확인을 회원 행 잠금 안에서 한다고 정한다. | Resolved (reviewer) |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-design/traceability.json > upstream_ids·coverage | upstream_ids와 coverage에 관측 요구사항의 NFR6.1~NFR6.5와 NFR7.1~NFR7.3이 없다. 관측 설계는 이 ID들을 요구사항 열에 인용하고 있어 해법은 있는데 추적 표만 비어 있다. 검증 도구는 통과했지만 이 ID들은 도구가 읽지 않은 것으로 보인다. | NFR6.1~6.5와 NFR7.1~7.3을 upstream_ids와 coverage에 더하고 target을 observability-design.md의 해당 절(§1 로그 사건, §2 수신 확인, §3 화면 상태, §4 확인 표, §5 두지 않는 것)로 적는다. | Resolved (reviewer) |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-design/security-design.md > §2 grant·토큰·키의 전달 경로 와 performance-design.md > 열람 재사용(web) | Q1은 "Blob URL을 뷰어가 더 이상 쓰지 않을 때 해제"를 정했고 성능 설계가 닫기·화면 이탈·onAccessLost를 해제 시점으로 적었다. 그런데 [새 탭에서 열기]로 만든 새 탭의 Blob URL은 열어 준 화면이 그 탭의 사용 종료를 알 수 없어 해제 시점이 정해지지 않았다. 새 탭 팝업이 차단되는 경우의 처리도 없다. 보안 설계 §2에는 해제 규칙 자체가 없고 성능 설계에만 있다. | 새 탭 Blob URL은 그 탭 안에서만 유효하고 탭을 닫으면 사라지므로 열어 준 화면은 해제하지 않는다고 정하거나 다른 해제 규칙을 적는다. 팝업이 막혔을 때의 안내 문구 방침을 한 줄 적는다. Blob 해제 규칙은 한 문서에 두고 다른 문서는 링크한다. | Resolved (reviewer) |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-design/observability-design.md > §1 로그 사건(`PREFIX_CLEANUP_FAILED` 행) | 사건의 위치를 "api 발행 3·5단계"라고 적었다. 기능 명세와 C-17에서는 접두어 정리를 부르는 단계가 3·5단계이고, 정리 실패를 로그로 남기는 단계는 6단계다. 신뢰성 설계 §4는 보상 자체의 실패 로그를 따로 적고 있어 두 문서의 단계 번호가 어긋난다. | 위치를 "api 발행 보상(3·5단계의 deletePrefix 실패, C-17 6단계)"처럼 신뢰성 설계 §4와 같은 표현으로 맞춘다. | Resolved (reviewer) |
| R-06 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-design/security-design.md > §2 Blob URL의 생성·해제 규칙(새 탭 두 항목) | [새 탭에서 열기]는 빈 창을 먼저 열고 그다음 본문을 받는다고 정했다. 그런데 팝업 차단 항목은 `window.open`이 `null`이면 "같은 Blob으로 화면 안 뷰어를 연다. 서버에 다시 요청하지 않는다"고 적었다. 빈 창을 먼저 여는 순서에서는 `null`이 나온 시점에 아직 본문을 받지 않았으므로 재사용할 Blob이 없다. 또 빈 창을 연 뒤 요청이 401·404나 본문 수신 실패로 끝났을 때 그 빈 탭을 어떻게 닫을지도 없다. 이 흐름은 Q1(처음 열기·다시 열기·새 탭은 C-10으로 재요청)과 맞아야 한다. | 팝업이 막혔을 때는 그 시점에 한 번 요청해 화면 안 뷰어를 연다고 고치거나(Q1대로 새 요청), 먼저 본문을 받아 둔다면 순서를 바꾼다. "같은 Blob"과 "다시 요청하지 않는다"는 문장을 실제 순서에 맞게 바로잡고, 빈 창을 연 뒤 요청이 실패하면 그 창을 닫고 실패 안내를 보인다고 한 줄 더한다. | New |

> R-01 Reviewer note: 성능 설계 「열람 전송」이 헤더 전 `get` 열기·존재 확인(500)과 전송 도중 오류(연결 끊음, `PDF_VIEW_FAILED` storage/streaming)를 구분한다. 「열람 수신(web)」은 200이고 본문을 끝까지 받았을 때만 Blob을 만들고, 실패는 일반 열람 실패 안내로 보이며 grant를 지우지 않는다고 적었다. 신뢰성 §7(헤더 전 / 전송 도중 두 행), 보안 §2, 관측 §1·§3이 같은 내용이다.

> R-02 Reviewer note: 성능 설계와 보안 §4가 20 MB를 파일 스트림 누적 바이트로 강제하고 선언 크기는 믿지 않는다고 적었다. 20벌 확인은 회원 행 `FOR UPDATE` 잠금 안에서 COUNT와 INSERT를 함께 한다. 동시 업로드 메모리(n × 20 MB)는 보안 §10 수용한 위험에 올라 있고 신뢰성 §7과 추적표 NFR4.12·NFR1.6도 맞춰졌다.

> R-03 Reviewer note: traceability.json에 NFR6.1~6.5와 NFR7.1~7.3이 upstream_ids와 coverage 양쪽에 들어갔고, 대상이 관측 설계의 해당 절을 가리킨다. 추적 도구를 다시 돌려 통과(gaps·orphans·누락 모두 비어 있음)를 확인했다.

> R-04 Reviewer note: 보안 §2가 Blob URL 생성·해제 규칙의 단일 정본이 되었다. 새 탭 URL은 원래 화면이 만들고 원래 화면이 언마운트·`onAccessLost` 때 해제하며, 새 탭을 닫으면 저절로 해제된다고 가정하지 않는다. 팝업 차단 안내도 있다. 성능 설계는 이 절로 링크한다. 다만 새 탭 흐름의 실행 순서에 작은 모호함이 남았다(아래 새 지적).

> R-05 Reviewer note: 관측 §1 `PREFIX_CLEANUP_FAILED` 행이 "C-17의 3·5단계에서 시도한 정리가 실패했을 때 6단계에서 기록"으로 바뀌어 신뢰성 §4와 같은 표현이다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| aidlc engine sensor-traceability --stage nfr-design | `{"pass":true,"gaps":[],"orphans":[],"missing_from_table":[],"missing_from_upstream_ids":[],"invalid_entries":[],"invalid_targets":[],"findings_count":0}` | upstream_ids 46개와 coverage 46행이 일치한다. NFR6.x·NFR7.x가 이제 추적된다. |

### What I verified

- 다섯 개 이전 지적을 성능·보안·신뢰성·관측 설계와 traceability.json에서 하나씩 대조했다. 문서 사이 표현(헤더 전/전송 도중, 누적 바이트, 행 잠금, 정리 6단계 기록, Blob 규칙의 정본 링크)이 일치한다.
- 승인된 Q1(첫 열기·다시 열기·새 탭 재요청, 쪽 이동만 Blob 재사용, 401·404는 onAccessLost, 뷰어가 쓰지 않을 때 해제, 중지·만료는 다음 요청부터)과 이번 개정이 어긋나지 않음을 확인했다. 개정은 새 수치(NFR4)나 새 장치(C06)를 들이지 않았다. 헤더 전/도중 구분, 행 잠금, 누적 바이트는 기존 요구사항의 구현 방식이다.
- 보류된 결정(OQ-U4-4, OQ-U8-1, OQ-U8-2, 자식 프로세스 제한값)은 결함으로 보지 않았다.
- 새 탭 흐름의 순서 모호함 한 건만 남았고 구현 중 판단으로 풀 수 있어 Minor다. 열린 Critical·Major는 없다.

### Summary

이전 지적 5건이 모두 반영되었고 문서 사이 내용도 일치하며 추적 검증도 통과했다. 새 탭 팝업 차단 처리의 실행 순서 설명이 모호한 Minor 한 건만 남아 READY다.
