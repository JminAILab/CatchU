## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-06T08:38:55Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-requirements/tech-stack-decisions.md > 「파일 저장」·「PDF 글 추출」·「로컬·시험 저장」 행 | 기능 설계 BR7.4는 배포 환경에서 worker가 S3 GetObject(역할)로 PDF를 읽는다고 정했다. 그런데 기술 선택 표의 S3 클라이언트(`@aws-sdk/client-s3`)는 api 쪽 한 줄뿐이고, 새 의존성은 `pypdf` 1개로만 적혀 있다. 현재 `worker/`에는 S3 클라이언트도 `pypdf`도 없다. worker가 배포에서 무엇으로 S3를 읽는지(파이썬 S3 라이브러리, 자격 체인, 읽기 전용 권한)가 어느 문서에도 없어 개발자가 추측해야 한다. | tech-stack-decisions.md에 worker 쪽 S3 읽기 수단(라이브러리와 기본 자격 체인 사용)을 새 의존성으로 추가한다. 보안 문서의 NFR1.7에는 worker 역할이 읽기 전용(Get만)이라는 점을 더한다. 라이브러리 버전은 코드 생성에서 정해도 된다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-requirements/security-requirements.md > NFR1.10 | 악성 PDF 내용을 검사하지 않는 위험은 근거(C06)와 함께 수용 결정으로 잘 적혀 있다. 다만 응답 헤더 목록이 `application/pdf`, `inline`, 캐시 없음, 제목 헤더 없음까지만이다. 받은 PDF를 같은 출처의 Blob URL iframe으로 여는 만큼 `X-Content-Type-Options: nosniff` 정도는 새 장치가 아니라 응답 헤더 한 줄로 같은 위험을 더 줄인다. | 헤더 한 줄(nosniff)을 NFR1.10 목록에 더할지 정한다. 더하지 않는다면 지금 문구로 두어도 된다. 검사 장치를 새로 들이는 것은 아니다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/260925-intent-12/construction/u8-pdf-materials/nfr-requirements/performance-requirements.md > NFR4.4 | NFR4.4는 대표 PDF를 재서 "동시성 기본값이나 시한을 조정한다"고 한다. 시한 10분은 기능 설계(BR2.2)가 정한 값인데, 구현 단계에서 근거 없이 바뀌면 NFR4(새 처리 시간 수치 금지)와 어긋날 수 있다. 동시성 조정은 설정값이라 문제없다. | 시한 조정은 사람 결정을 거친 뒤에만 한다고 한 줄 덧붙이거나 "시한"을 빼서, 새 수치가 구현 중에 생기지 않게 한다. | New |

### What I verified

- 여섯 문서(성능·보안·확장성·신뢰성·관측·기술 선택)와 traceability.json이 모두 있다. 세부 요구사항 행마다 NFRx.y 번호가 있고, NFR1~NFR7을 덮으며 NFR3은 해당 없음 사유가 있다. 아래 도구 결과가 이를 확인한다.
- 새 수치·SLO·대시보드·경보·검사 장치가 없다. 문서에 나온 수치는 20 MB, 50쪽, 20벌, 제목 1~100자, 10분(기능 설계 BR1.2·BR2.2), 그리고 SDK 기본 재시도 3회(Q2)뿐이다. 자식 프로세스 제한값은 Q1 답변대로 구현 단계로 미뤄 두었고, 예시였던 2분은 어느 문서에도 확정값으로 옮기지 않았다. 확장성(NFR4.13)·관측(NFR6.5)·성능 문서가 "새로 만들지 않은 것"을 명시한다.
- 규칙 대조(BR1~BR7)와 계약 대조: C-05(키 모양·presigned 없음), C-10(호출마다 판정, 발행본 소속 항목만), C-11(grant는 헤더만), C-16(수신 확인 5종·거부 재전송 없음), C-17(복사는 트랜잭션 밖, 실패 시 접두어 정리·원래 오류 유지, PDF 없는 발행은 저장소 미호출)과 모순이 없다. 인증·권한 404 처리, 입력 검증(종류·머리 바이트·크기·필드), 로그와 오류 본문의 비밀·글 비노출, 동의 선행(403)도 빠짐없이 다뤘다.
- 열린 결정(OQ-U4-4 글 총량 상한, OQ-U8-1 시연 위치, OQ-U8-2 S3 버킷 시점, Q1 제한값)은 결정으로 요구하지 않고 보류 상태 그대로 적혀 있어 결함으로 보지 않았다.
- 수용한 위험(PDF 내용 악성코드·스크립트 검사 없음, NFR1.10)은 숨기지 않고 근거(C06)와 바꾸려면 팀장 결정이 필요하다는 점까지 명시했다.
- 도구 실행 결과 `aidlc engine sensor-traceability --stage nfr-requirements --output-path .../nfr-requirements/traceability.json`: `{"pass":true,"gaps":[],"orphans":[],"missing_from_table":[],"missing_from_upstream_ids":[],"invalid_entries":[],"invalid_targets":[],"findings_count":0}`.
- `worker/`에서 `boto3`·`pypdf`를 찾아 보았으나 사용처가 없었다(Major 근거).

### Summary

NFR 문서는 새 수치나 장치를 만들지 않고 기능 설계의 경계 값과 계약 규칙을 일관되게 NFR ID로 묶었으며, 수용한 위험과 보류한 결정도 숨기지 않았다. 열린 문제는 worker의 배포 환경 S3 읽기 수단이 기술 선택에 빠진 점(Major 1건)과 사소한 보강 2건이라, 승인 전에 한 줄씩 보완하면 구현 가능한 수준이다.
