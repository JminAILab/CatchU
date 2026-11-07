# U8 PDF 자료 — 보안 설계

작성일: 2026-11-06. Unit: `u8-pdf-materials`. 입력: [보안 요구사항](../nfr-requirements/security-requirements.md), [성능 요구사항](../nfr-requirements/performance-requirements.md), [확장성 요구사항](../nfr-requirements/scalability-requirements.md), [신뢰성 요구사항](../nfr-requirements/reliability-requirements.md), [관측 요구사항](../nfr-requirements/observability-requirements.md), [기술 선택](../nfr-requirements/tech-stack-decisions.md), [기능 명세](../functional-design/functional-spec.md) W1~W5, [계약 요약](../../../inception/contract-design/contract-summary.md) C-04·C-05·C-10·C-11·C-16, [NFR 설계 질문·답변](nfr-design-questions.md) Q1, 보안 점검 문서(`docs/CatchU_security_checks.md`).

## 1. 인증·권한 구조

| 경로 | 인증 | 권한 판정 | 설계 | 요구사항 |
|---|---|---|---|---|
| 작성자 API `/v1/pdf-materials/*` | 기존 회원 인증(Bearer Access 토큰, 10월 공통) | 행의 `member_id = 요청 회원`. 없음·남의 것·UUID 아님은 한 갈래로 404 `RESOURCE_UNAVAILABLE` | 서비스 계층에서 `findOwned(memberId, id)` 하나로 조회해 소유 확인과 존재 확인을 같은 쿼리로 한다. 응답 분기가 하나라 정보 노출이 없다 | NFR1.1 |
| 작성자 사본 `/v1/publications/{id}/items/{itemId}/pdf` | 회원 인증 | C-10 `resolveForOwner` → 그 발행본의 `PDF_MATERIAL` 항목만 | U4 작성자 경로와 같은 판정 함수 재사용. 중지·만료 뒤에도 연다 | NFR1.1 |
| 받은 사람 `/v1/public/links/{token}/items/{publishedItemId}/pdf` | 없음(링크) | C-10 `resolveForRecipient(token, grant, now)` → `publication_id = access.publicationId AND item_kind = 'PDF_MATERIAL'` 행만 | 읽기 전용 트랜잭션 하나에서 판정과 항목 조회. 다른 발행본 항목·PDF 아닌 항목·없음·UUID 아님은 모두 404 `LINK_UNAVAILABLE`. 호출마다 판정, 캐시 없음 | NFR1.2 |
| worker | 큐 메시지(내부) | 키 모양·ID 일치 검사(BR3.6) | 메시지에 든 `storageKey`를 그대로 쓰지 않고 `members/{uuid}/materials/{uuid}.pdf` 모양과 `pdfMaterialId` 일치를 확인한 뒤에만 읽는다 | NFR1.7 |

권한 판정은 새로 만들지 않는다. 회원 인증과 C-10은 U2·U4의 기존 구현이며 U8은 호출만 한다(NFR1.5 시험용 우회 없음).

## 2. grant·토큰·키의 전달 경로

```
받은 사람 브라우저                       api                              저장소
  fetch(GET .../items/{id}/pdf,   --->  resolveForRecipient(token, grant)
        X-Link-Grant: <grant>)          -> 항목 조회(publicationId 한정)
                                        -> FileStorage.get(pdf_copy_key)  ---> GetObject
  <--- 200 application/pdf 스트림 <-----  (키·토큰·grant는 로그에 없음)
  Blob URL(탭 안 임시 주소) -> iframe #page=n / 새 탭
```

- 토큰은 경로, grant는 헤더만(C-11). URL 쿼리·fragment·Referer에 grant가 실리지 않는다. Blob URL은 탭 안 임시 주소이고 서버 자원을 가리키지 않는다(NFR1.3).
- Blob 재사용은 같은 뷰어의 쪽 이동에만 한정한다(Q1). 처음 열기·다시 열기·새 탭은 재요청해 판정을 다시 받는다. 링크 중지·만료는 다음 요청부터 적용되며 이미 전달된 PDF의 회수는 보장하지 않는다(화면에 이미 있는 쪽 글·요약과 같은 성질). 재요청이 401·404면 `onAccessLost`로 grant를 지우고 화면을 바꾼다. 본문 수신 실패(전송 중단·네트워크)는 접근 상실이 아니라 일반 열람 실패로 안내하고 grant는 그대로 둔다.
- **Blob URL의 생성·해제 규칙(단일 정본, 다른 문서는 이 절을 가리킨다):**
  - 생성 주체는 항상 PDF 항목이 있는 화면(받은 사람 `/s/[token]`의 PublishedPdfItem, 작성자 발행본 화면, 작성자 PDF 목록)의 `PdfViewerLauncher`다. 응답 200과 본문 수신 성공 뒤에만 만든다.
  - 화면 안 뷰어(iframe)의 Blob URL은 그 뷰어가 닫힐 때, 화면을 떠날 때(언마운트), `onAccessLost`가 올 때 해제한다. 쪽 이동은 같은 URL에 `#page=n`만 바꾼다.
  - [새 탭에서 열기]의 순서는 ① 클릭 즉시 `window.open('', '_blank')`로 빈 창을 먼저 연다(팝업 차단 회피) → ② 서버에 요청한다(Q1대로 C-10 재판정) → ③ 응답 200과 본문 수신 성공 뒤 Blob URL을 만든다 → ④ 그 URL을 빈 창의 주소로 넣는다. 이 URL은 **원래 화면이 만들고 원래 화면이 해제**한다: 새 탭을 닫아도 원래 화면의 URL이 저절로 해제된다고 가정하지 않으며, 원래 화면은 새 탭용 URL을 목록으로 들고 있다가 화면을 떠날 때(언마운트)와 `onAccessLost` 때 모두 해제한다. 해제 뒤 새 탭에 이미 로드된 문서는 그대로 보이지만 그 탭의 새로고침은 실패하므로, 새 탭 쪽에는 별도 처리를 두지 않고 "원래 화면에서 다시 열기"로 안내한다.
  - 요청 ②는 팝업 허용 여부와 관계없이 클릭마다 **한 번만** 보낸다. ①에서 팝업이 차단되어 `window.open`이 `null`을 돌려주더라도 ②·③은 그대로 진행하고, 본문 수신에 성공하면 이번 요청으로 만든 Blob을 쓴다: 빈 탭이 열렸으면 그 탭에 표시하고, 팝업이 차단됐으면 화면 안 뷰어에 표시한다. 두 번째 요청은 보내지 않는다. 팝업이 차단된 경우에는 "브라우저가 새 탭을 막았습니다. 화면 안에서 열었습니다. 새 탭으로 보려면 이 사이트의 팝업을 허용해 주세요"를 함께 보인다.
  - 요청이 실패하면 열어 둔 빈 탭을 닫는다. 원래 화면에서 401·404는 기존 `onAccessLost`로 처리하고, 네트워크 오류나 본문 수신 실패는 일반 PDF 열람 실패로 안내한다(grant 유지). 빈 창을 닫는 호출 방법과 사용자가 먼저 닫은 창의 처리는 구현 세부다.
  - 새 탭용 Blob URL도 탭 안 임시 주소이며 서버 자원·grant·토큰을 담지 않는다.
- 파일 키는 C-05 도우미로만 만들고 요청 값에서 키를 조립하지 않는다. `pdf_copy_key`·`storage_key`는 DB에서 읽은 값만 쓴다(NFR1.7).

## 3. 저장소 권한 분리(IAM 요약, 설정은 #389에서 팀장)

| 주체 | 자격 | 허용 동작 | 대상 |
|---|---|---|---|
| api 역할 | AWS 기본 자격 증명 체인(역할) | PutObject·GetObject·CopyObject·DeleteObject·ListObjectsV2·DeleteObjects | 버킷의 `members/*` |
| worker 역할 | AWS 기본 자격 증명 체인(역할) | `s3:GetObject`만 | `members/*/materials/*.pdf` |
| 브라우저 | 없음 | 없음(presigned URL 없음, 버킷 공개 차단) | — |

코드에 자격을 넣지 않는다. 버킷 이름은 설정값, 자격은 기본 체인이다. 로컬·시험은 로컬 드라이버와 읽기 전용 공유 볼륨이라 S3 자격이 필요 없다(NFR1.7).

## 4. 입력 검증 전략

| 경계 | 검사 | 실패 처리 | 요구사항 |
|---|---|---|---|
| 업로드 요청 | 파일 1개, 선언 종류 `application/pdf`, 크기 20 MB 이하(파일 스트림의 누적 바이트로 강제, 넘는 즉시 수신 중단; 선언 크기는 믿지 않음), 머리 바이트 `%PDF-`, 제목 1~100자, 정의 밖 필드 거부, 회원당 20벌(회원 행 잠금 안에서 COUNT와 INSERT를 원자적으로) | 400 `VALIDATION_FAILED` + 첫 위반 | NFR1.6 |
| 경로·ID | UUID 모양 검사 뒤 조회 | 404(작성자) / 404 `LINK_UNAVAILABLE`(받은 사람) | NFR1.1·1.2 |
| 큐 메시지(worker 수신) | `schemaVersion`·`messageId`·`storageKey` 모양·ID 일치 | 결과 없이 작업 실패 기록 | NFR1.7 |
| 큐 메시지(api 수신) | BR3.3 봉투·모양 검사(pages 1~50, pageNumber 연속, readable=false ⇒ text='', 정의 밖 필드 거부) | `REJECTED/SCHEMA_INVALID` | NFR1.8 |
| 뽑은 글 | NUL 제거 외 가공 없음, untrusted. 화면은 텍스트 노드, 로그·오류·지시문에 넣지 않음 | — | NFR1.8 |

## 5. 추출 격리

- 작업마다 자식 프로세스 1개(10월 분석 소비자의 틀 재사용). 부모는 시간·메모리 제한을 걸고 넘으면 자식을 종료하고 FAILED(UNREADABLE_FILE)를 보고한다. 제한값은 구현 단계에서 정한다.
- 자식은 파일 읽기(S3 GetObject 또는 공유 볼륨)와 pypdf 실행만 하고 큐·DB에 접근하지 않는다. 결과는 표준 출력 JSON으로 부모에게 돌아온다.
- 실패 범위는 그 작업 하나다. Worker 프로세스와 분석 소비자는 영향받지 않는다(NFR1.9).

## 6. 응답 헤더와 열람 화면

PDF 원본·사본 응답 헤더 4종: `Content-Type: application/pdf`, `Content-Disposition: inline; filename="document.pdf"`(또는 `material.pdf`, 제목 미포함), `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`(NFR1.10).

iframe에는 `sandbox` 속성을 두지 않는다. 브라우저 내장 PDF 뷰어가 sandbox 아래에서 동작하지 않는 경우가 있고, Blob URL은 web 출처라 교차 출처 격리 이점도 없다. 악성 PDF 내용(내장 스크립트 등)의 검사는 하지 않으며 내장 뷰어의 격리에 맡기는 수용 위험이다(NFR1.10, C06). 바꾸려면 팀장 결정이 필요하다.

## 7. 암호화·비밀값

- 전송: 기존 HTTPS(개발 서버·EKS 인그레스, 팀장 인프라). U8은 바꾸지 않는다.
- 저장: 버킷 자동 암호화(ADR-003, #389). DB 암호화 설정은 기존 그대로.
- 비밀값: S3 자격은 역할(기본 체인)이라 비밀값이 없다. 버킷 이름·공유 볼륨 경로·동시성은 설정값이며 예시 파일에 이름만 둔다(team.md Code Style).

## 8. 동의·고지

업로드 컨트롤러는 본문을 읽기 전에 `AiConsentGate.require(memberId)`를 부른다. 없으면 403 `AI_CONSENT_REQUIRED`이고 web은 U2 공용 동의 창을 연 뒤 같은 요청을 다시 보낸다. 업로드 화면은 외부 AI 한 줄 고지와 민감 정보 안내를 보인다. U8은 외부 AI를 직접 호출하지 않는다(NFR2.1~2.3). PDF 글은 MCP 도구에 노출하지 않는다(NFR2.4).

## 9. 로그 위생

실패 로그는 코드·`pdfMaterialId`·`publicationId`·쪽 번호·길이만 적는다. 토큰·grant·키·접두어·글·제목은 넣지 않는다(NFR1.4). 자세한 사건 목록은 [관측 설계](observability-design.md).

## 10. 수용한 위험

| 위험 | 상태 | 근거 |
|---|---|---|
| 악성 PDF 내용(스크립트·외부 링크) 검사 없음 | 수용 | C06(근거 없는 장치 금지), 내장 뷰어 격리, nosniff |
| 이미 전달된 PDF는 링크 중지 뒤에도 그 탭에서 보임 | 수용 | Q1, 화면의 다른 자료와 같은 성질, 다음 요청부터 차단 |
| 개인정보가 든 PDF를 그대로 저장·전송 | 요구사항대로 | FR20.3·FR3.6, 업로드 안내 문구 |
| 동시 업로드 n건이면 api 메모리에 최대 n × 20 MB가 머묾 | 수용 | 시연 규모(소수 사용자) 가정, 임시 파일·스트리밍 업로드 장치를 두지 않음(C06). 규모가 커지면 NFR 재검토 |
| 해제된 새 탭 Blob URL은 그 탭의 새로고침에서 실패 | 수용 | §2 생성·해제 규칙. "원래 화면에서 다시 열기" 안내로 처리 |
