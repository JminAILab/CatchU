## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-06T11:36:54Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-design/reliability-design.md > §7 저장소 장애 시 동작(열람 행) 및 performance-design.md > 열람 전송 | 열람은 저장소 스트림을 응답에 그대로 파이프한다고 하면서 "get 실패·파일 없음 → 500"이라고만 적었다. 응답 헤더(200)를 보낸 뒤 스트림 중간에 저장소 오류가 나면 500으로 바꿀 수 없다. 이 경우 web은 잘린 PDF를 정상 응답으로 받아 Blob으로 열 수 있는데, 이 동작이 설계에 없다. Content-Length는 "저장소가 길이를 알려 주면" 조건부다. | 헤더를 보내기 전에 파일 존재와 열기 성공을 확인한다(파일 없음은 그 시점에 500)고 적는다. 스트림 도중 오류는 연결을 끊어 web의 fetch가 실패로 처리하게 하고 `PDF_VIEW_FAILED`(이유 storage)로 기록한다고 적는다. web이 fetch 실패를 `onAccessLost`가 아닌 일반 열람 실패 안내로 보인다는 한 줄도 더한다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-design/performance-design.md > 업로드 처리 순서 | "크기 상한(요청 헤더·multipart 메타)"으로 20 MB를 끊는다고 했지만 multipart 부분에는 파일별 크기 메타가 없고 Content-Length는 클라이언트가 적은 값이거나 없을 수 있다. 또 파일을 메모리 버퍼 1개로 받으므로 동시 업로드 수만큼 최대 20 MB가 쌓인다. 이 메모리 부담은 수용한 위험으로 적혀 있지 않다. 회원당 20벌도 COUNT 뒤 INSERT라 동시 업로드에서 약간 넘을 수 있는데 이것도 적혀 있지 않다. | 상한을 업로드 스트림의 누적 바이트로 강제하고 넘으면 즉시 끊어 400을 돌려준다고 명시한다. 보안 설계 §10의 수용한 위험 표에 "동시 업로드 시 메모리 사용(시연 규모 가정)"과 "20벌 동시 초과 가능성"을 결정으로 더하거나, 20벌 확인을 회원 행 잠금 안에서 한다고 정한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-design/traceability.json > upstream_ids·coverage | upstream_ids와 coverage에 관측 요구사항의 NFR6.1~NFR6.5와 NFR7.1~NFR7.3이 없다. 관측 설계는 이 ID들을 요구사항 열에 인용하고 있어 해법은 있는데 추적 표만 비어 있다. 검증 도구는 통과했지만 이 ID들은 도구가 읽지 않은 것으로 보인다. | NFR6.1~6.5와 NFR7.1~7.3을 upstream_ids와 coverage에 더하고 target을 observability-design.md의 해당 절(§1 로그 사건, §2 수신 확인, §3 화면 상태, §4 확인 표, §5 두지 않는 것)로 적는다. | New |
| R-04 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-design/security-design.md > §2 grant·토큰·키의 전달 경로 와 performance-design.md > 열람 재사용(web) | Q1은 "Blob URL을 뷰어가 더 이상 쓰지 않을 때 해제"를 정했고 성능 설계가 닫기·화면 이탈·onAccessLost를 해제 시점으로 적었다. 그런데 [새 탭에서 열기]로 만든 새 탭의 Blob URL은 열어 준 화면이 그 탭의 사용 종료를 알 수 없어 해제 시점이 정해지지 않았다. 새 탭 팝업이 차단되는 경우의 처리도 없다. 보안 설계 §2에는 해제 규칙 자체가 없고 성능 설계에만 있다. | 새 탭 Blob URL은 그 탭 안에서만 유효하고 탭을 닫으면 사라지므로 열어 준 화면은 해제하지 않는다고 정하거나 다른 해제 규칙을 적는다. 팝업이 막혔을 때의 안내 문구 방침을 한 줄 적는다. Blob 해제 규칙은 한 문서에 두고 다른 문서는 링크한다. | New |
| R-05 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-design/observability-design.md > §1 로그 사건(`PREFIX_CLEANUP_FAILED` 행) | 사건의 위치를 "api 발행 3·5단계"라고 적었다. 기능 명세와 C-17에서는 접두어 정리를 부르는 단계가 3·5단계이고, 정리 실패를 로그로 남기는 단계는 6단계다. 신뢰성 설계 §4는 보상 자체의 실패 로그를 따로 적고 있어 두 문서의 단계 번호가 어긋난다. | 위치를 "api 발행 보상(3·5단계의 deletePrefix 실패, C-17 6단계)"처럼 신뢰성 설계 §4와 같은 표현으로 맞춘다. | New |

### What I verified

- 여섯 개 설계 문서와 traceability.json이 모두 있고, 단계 정의의 산출물 목록과 일치한다.
- traceability.json의 대상 중 NFR1.5(보안 §1), NFR4.9(확장성 데이터 상한 행), NFR4.18(신뢰성 §2·보안 §5), NFR5.4(신뢰성 §5), NFR2.4(보안 §8)를 문서에서 직접 확인했고 해당 위치에 해법이 있다. 다만 NFR6.x·NFR7.x는 표에 없다(위 Minor).
- 새 장치 여부: 회로 차단기, 캐시 계층, 자동 확장 규칙, 지표·경보·SLO, 악성 파일 검사, 새 수치 목표는 없다. 각 문서가 "두지 않는 것" 절로 명시한다. 문서에 나오는 수치(20 MB, 50쪽, 20벌, 10분, 항목 20, 1,000개 단위 삭제, 동시성 기본 1, SDK 재시도 3회)는 기능 설계 또는 NFR 요구사항에서 온 값이고, 자식 프로세스의 시간·메모리 제한값은 구현 단계로 미뤘다. 로그 사건 이름 9개는 NFR6.1이 요구한 사건을 이름 붙인 것이며 새 수집 장치는 아니다.
- 상류 정합성: C-05(presigned 없음, 키 도우미), C-10(호출마다 판정, 발행본 소속 PDF 항목만 404 `LINK_UNAVAILABLE`), C-11(grant는 헤더만, 401·404는 onAccessLost), C-16(수신 판정 5종, 한 트랜잭션, 커밋 뒤 수신 확인), C-17(ID 선생성, 순차 복사, 접두어 보상 1회, PDF 없으면 저장소 미호출)이 NFR 요구사항 및 기능 명세와 맞는다.
- Q1 승인안: 처음 열기·닫았다 다시 열기·새 탭은 재요청(C-10 재판정), 같은 열린 뷰어의 쪽 이동만 Blob 재사용, 401·404는 onAccessLost, 클릭 직후가 아니라 뷰어 사용 종료 때 해제, 링크 중지·만료는 다음 요청부터이며 이미 전달된 PDF의 회수는 보장하지 않음을 보안 §2·§10과 성능 설계 열람 재사용 행에 그대로 적용했다.
- 보안 설계: iframe `sandbox` 없음과 근거, 응답 헤더 4종(nosniff 포함), api 역할 대 worker 역할(GetObject만, `members/*/materials/*.pdf`), 자식 프로세스 격리(제한값은 구현 단계), 로그 위생, 수용한 위험 3건이 모두 있다. 위 Minor의 업로드 관련 위험만 빠져 있다.
- 열려 있는 결정(OQ-U4-4, OQ-U8-1, OQ-U8-2, 자식 프로세스 제한값)에 기대는 지적은 하지 않았다.
- 추적 검사: `aidlc engine sensor-traceability --stage nfr-design --output-path aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-design/traceability.json` 결과 `{"pass":true,"gaps":[],"orphans":[],"missing_from_table":[],"missing_from_upstream_ids":[],"invalid_entries":[],"invalid_targets":[],"findings_count":0}`.

### Summary

설계는 승인된 입력 안에서 패턴만 정했고 새 장치나 새 수치를 더하지 않았으며, Q1 결정과 C-05·C-10·C-11·C-16·C-17이 정한 경계를 일관되게 적용해 개발자가 추가 질문 없이 구현할 수 있는 수준이다. 남은 것은 모두 Minor다(스트림 중간 오류 처리, 업로드 크기 강제와 수용 위험 기록, 추적 표의 NFR6·NFR7 누락, 새 탭 Blob 해제 시점, 로그 단계 번호).
