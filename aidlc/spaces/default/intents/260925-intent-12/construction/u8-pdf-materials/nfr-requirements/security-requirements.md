# U8 PDF 자료 — 보안 요구사항

작성일: 2026-11-06. Unit: `u8-pdf-materials`. 입력: [기능 명세](../functional-design/functional-spec.md), [규칙](../functional-design/rules.md), [재승인 요구사항](../../../inception/requirements-analysis/requirements.md) NFR1·NFR2·FR20·FR3.6, [계약 요약](../../../inception/contract-design/contract-summary.md) C-04·C-05·C-10·C-11·C-16, [NFR 질문·답변](nfr-requirements-questions.md) Q1, 보안 점검 문서(`docs/CatchU_security_checks.md`)의 입력·권한·설정·외부 호출·LLM 항목.

## 인증·권한 (NFR1)

| ID | 요구사항 | 근거 | 확인 방법 |
|---|---|---|---|
| NFR1.1 | 작성자 경로(`/v1/pdf-materials/*`, `/v1/publications/{id}/items/{itemId}/pdf`)는 회원 인증 뒤 본인 소유를 확인한다. 남의 것·없는 것·UUID 모양이 아닌 ID는 구분 없이 404 `RESOURCE_UNAVAILABLE`(작성자 사본은 `resolveForOwner`의 NotFound)이다. | 기능 설계 BR1.8·BR6.6, NFR1 회원 자료 격리 | 다른 회원의 ID로 상세·원본·삭제 요청 시 404 시험 |
| NFR1.2 | 받은 사람의 PDF 열람은 C-10 `resolveForRecipient`를 호출마다 그대로 거친다(중지·만료·삭제·작성자 비활성 404, 작성자 회원 행 없음 500, grant 거부 401). 판정 통과 뒤에도 그 발행본(publicationId)에 속한 `PDF_MATERIAL` 항목만 내려주고, 다른 발행본의 항목·PDF 아닌 항목·없는 항목은 404 `LINK_UNAVAILABLE`이다. | 기능 설계 BR6.1·BR6.2, FR4.2·FR4.4, C-10 | 중지된 링크·다른 발행본 항목 ID·텍스트 항목 ID로 요청 시 404, 비밀번호 링크에 grant 없이 401 시험 |
| NFR1.3 | 공유 링크 토큰은 경로에만, 비밀번호 열람 권한(grant)은 `X-Link-Grant` 헤더에만 싣고 URL(쿼리·fragment)에 넣지 않는다. 받은 PDF는 web이 Blob URL로 열며 그 주소는 탭 안의 임시 주소다. 401·404는 `onAccessLost`로 넘겨 grant를 지운다. | 기능 설계 BR6.3(Q3), C-11 grant 규칙 | web 코드에서 PDF 요청이 헤더로만 grant를 보내는지 검토, 접근 로그에 grant가 없는지 확인 |
| NFR1.4 | 토큰·grant·파일 키·접두어·뽑은 글은 로그와 오류 응답 본문에 넣지 않는다. 실패 로그는 코드와 쪽 번호·길이만 적는다. PDF 열람 GET에는 시도 제한을 두지 않는다(보안 점검: grant로 조회하는 GET). | 기능 설계 BR3.5·BR6.7, team.md Code Style | 실패 경로 로그 출력 검토 |
| NFR1.5 | 시험용 권한 우회를 두지 않는다. 시험은 시험 계정·자료로 허용과 거부를 함께 확인한다. | NFR1 | 코드 생성의 시험 목록에 거부 사례가 있는지 확인 |

## 입력 검증·파일 처리 (NFR1, 보안 점검 입력·외부 호출)

| ID | 요구사항 | 근거 | 확인 방법 |
|---|---|---|---|
| NFR1.6 | 업로드는 파일 1개, 선언 종류 `application/pdf`와 머리 바이트 `%PDF-`, 20 MB 이하, 제목 1~100자, 정의 밖 필드 거부를 모두 통과해야 저장한다. 본문은 동의 확인(C-04) 뒤에 읽는다. | 기능 설계 BR1.1·BR1.2·BR1.3 | 종류·머리·크기·필드 각 위반 400 시험 |
| NFR1.7 | 파일 키는 C-05 도우미로만 만들고, worker는 `members/{uuid}/materials/{uuid}.pdf` 모양과 ID 일치를 검사한 뒤에만 읽는다. presigned URL은 만들지 않으며 api가 권한 확인 뒤 읽어 내려준다. 버킷은 환경별 1개·공개 차단·자동 암호화·역할 기반 권한이다(공용 인프라 #389, 팀장). 역할 권한은 둘로 나눈다: api 역할은 `members/` 접두어의 쓰기·읽기·복사·삭제, worker 역할은 원본 PDF(`members/*/materials/*.pdf`)에 대한 `s3:GetObject`만(읽기 전용, 발행 사본·삭제·쓰기 없음). 둘 다 AWS 기본 자격 증명 체인으로 받는다. 로컬·시험에서 worker는 읽기 전용 공유 볼륨으로 읽는다. | 기능 설계 BR3.6·BR7.3·BR7.4, ADR-003, C-05, 검토 R-01 | 키 모양이 틀린 메시지를 worker가 거부하는 시험, 설정에 presigned 생성 코드가 없는지 검토, worker 코드에 GetObject 외 S3 호출이 없는지 검토 |
| NFR1.8 | 뽑은 글은 신뢰할 수 없는 입력이다. 저장할 수 없는 NUL만 제거하고 가공하지 않으며, 화면은 텍스트 노드로만 그린다. AI 지시문에 넣는 것은 U2 게이트와 U5가 발행 사본에서 하고(FR6.4 숨긴 지시 방어), U8은 글을 로그·오류·지시문에 싣지 않는다. | 기능 설계 BR3.1·BR3.5, FR3.3, AC3.2.5 | 쪽 글에 마크업·지시문이 들어 있어도 화면에 글자로만 보이는 시험 |
| NFR1.9 | PDF 추출은 작업마다 자식 프로세스에서 돌고 시간·메모리 제한을 가진다(10월 분석 소비자 방식 재사용). 손상·악의적 파일이 worker 프로세스와 분석 소비자에 영향을 주지 않는다. 제한값은 구현 단계에서 정한다. | NFR 질문 Q1 | 제한 초과 입력에서 자식만 종료되고 Worker가 다음 작업을 받는 시험 |
| NFR1.10 | PDF 내용의 악성코드·내장 스크립트 검사는 하지 않는다(재승인 입력에 근거 없음, C06). 받은 사람은 브라우저 내장 뷰어로 보며 그 격리에 맡긴다. PDF 원본·사본 응답 헤더는 `Content-Type: application/pdf`, `Content-Disposition: inline; filename="..."`(제목을 넣지 않음), 캐시 없음(`no-store`), `X-Content-Type-Options: nosniff`다(검토 R-02; 헤더 한 줄이며 검사 장치가 아니다). 악성 PDF 자체를 검사하지 않는 한계는 그대로이며, 이것은 수용한 위험이고 바꾸려면 팀장 결정이 필요하다. | 기능 설계 BR6.6, C06, 검토 R-02 | 응답 헤더 4종 시험; 위험 수용은 이 문서로 기록 |

## 외부 AI 처리·고지 (NFR2)

| ID | 요구사항 | 근거 | 확인 방법 |
|---|---|---|---|
| NFR2.1 | PDF 업로드는 외부 AI 전송의 첫 이용 동의(C-04)를 먼저 요구한다. 동의가 없으면 403 `AI_CONSENT_REQUIRED`로 파일을 받지 않고, web은 U2 공용 동의 창을 연 뒤 같은 요청을 다시 보낸다. 화면마다 외부 AI 한 줄 고지를 보인다. | FR20.1(PDF 처리), C-04 consumers, 기능 설계 BR1.3 | 동의 없는 회원의 업로드 403 시험 |
| NFR2.2 | PDF 글은 U8이 직접 외부 AI로 보내지 않는다. 발행 사본의 쪽 글이 U3(Voyage AI 임베딩)·U5(Claude 생성)로 가는 것은 그 Unit의 경로이며, 고지(FR20.1)가 PDF 처리를 포함하므로 추가 고지는 두지 않는다. | FR20.1, 기능 설계 §1 범위 | U8 코드에 외부 AI 호출이 없는지 검토 |
| NFR2.3 | 업로드 화면에 "주민등록번호 같은 민감한 정보는 지우고 올려 주세요"를 보이고, 서비스는 PDF 안의 개인정보를 찾아 가리지 않는다(FR20.3). | FR3.6·FR20.3, 기능 설계 BR1.5 | 화면 문구 확인 |
| NFR2.4 | PDF 글은 구직자 본인 MCP 도구(U6)에 노출하지 않는다. U8은 `pdf_page_text`·`published_pdf_page`를 읽는 다른 Unit 경로를 만들지 않는다. | FR13.2, 요구사항 「채택하지 않은 안」 | U6 계약 C-15에 PDF 필드가 없음 확인 |

## 위협 고려(요약)

| 위협 | 대응 | ID |
|---|---|---|
| 남의 PDF·사본 열람 | 본인 확인·C-10 판정·발행본 소속 항목만 | NFR1.1·NFR1.2 |
| grant·토큰 유출(URL·로그) | 헤더만, Blob URL, 로그 금지 | NFR1.3·NFR1.4 |
| 경로 조작으로 다른 파일 읽기 | 키 도우미·키 모양 검사·presigned 없음 | NFR1.7 |
| 악의적 PDF로 worker 멈춤·메모리 고갈 | 자식 프로세스 격리·제한, 상한 20 MB·50쪽 | NFR1.9·NFR1.6 |
| PDF 글 안의 숨긴 지시로 AI 조작 | 글은 untrusted, 텍스트 노드 표시, U2 게이트 방어 | NFR1.8 |
| 동의 없는 외부 AI 전송 | 업로드 전 C-04 확인 | NFR2.1 |
| 악성 PDF 내용(스크립트) 전달 | 검사 없음(수용 위험), 브라우저 뷰어 격리 | NFR1.10 |
