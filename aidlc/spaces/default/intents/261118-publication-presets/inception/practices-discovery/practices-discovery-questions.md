# Practices Discovery — 질문

이번은 다시 확인하는 실행이다. 기준선은 지금 팀 관행 `aidlc/spaces/default/memory/team.md`(2026-11-14 팀장 결정으로 바꾼 판)의 다섯 절이고, 초안(`team-practices.md`)은 그 글을 그대로 두었다. 아래는 근거(`evidence.md`)로 정하지 못한 것만 묻는다. 각 질문의 A는 근거가 가리키는 답이다. 승인하면 `team-practices.md`의 다섯 절이 `team.md`의 같은 절을 바꿔 쓴다.

## Q1. [운영] 배포 절의 문장

지금 문장: 「배포 대상은 AWS다. 지금은 개발 서버(EC2)에 배포하고, 12월 최종 환경은 EKS다. …」. 근거: 11/16부터 자동 배포가 저장소 변수 `DEPLOY_TARGET`(dev-server·eks·none)으로 배포 대상을 고르고(#342), 11/19 전환·11/21 개발 서버 삭제 계획이 문서에 있다. 실제 전환 여부는 저장소 설정이라 확인하지 못했다.

A. 날짜를 박지 않는 문장으로 바꾼다: 「배포 대상은 AWS다. `main` 병합 때 자동 배포가 저장소 변수로 고른 곳(개발 서버 또는 EKS)을 교체하고, 12월 최종 환경은 EKS다. 배포·CI는 기존 자동 배포·`dev-ci`와 EKS 작업으로 한다. 공유 인프라·CI 변경은 팀장이 맡는다.」
B. 지금 문장을 그대로 둔다
C. Not yet defined
X. Other (please specify)

[Answer]: X. 배포 절 문장을 이렇게 바꾼다: 「배포 대상은 AWS EKS다. `main` 병합 때의 자동 배포는 저장소 변수 `DEPLOY_TARGET`으로 켜고 끈다(끄면 이미지만 올린다). 배포·CI는 기존 자동 배포·`dev-ci`와 EKS 작업으로 한다. 공유 인프라·CI 변경은 팀장이 맡는다.」

## Q2. [운영] 12/9 00:00 배포 동결을 팀 관행에 넣을까

동결은 `deploy/aws/README.md`에만 있고, 이 작업은 11/30까지 dev 반영이 목표라 직접 닿지 않는다.

A. 넣지 않는다
B. 배포 절에 넣는다
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Q3. [개발] 계약 변경 PR을 먼저 올리고 나머지를 이어 올릴 때 브랜치

승인된 범위 문서는 계약 변경을 먼저 PR로 올리고 모두 11/30까지 dev에 넣는다. 지금 문장 「작업 폴더의 결과를 그 intent의 작업 브랜치로 합친 뒤 `dev` PR로 올린다」는 PR 하나를 전제로 읽힐 수 있다.

A. 한 작업 브랜치(`api/publication-presets`)에서 dev PR을 차례로 연다. 앞 PR이 병합되면 dev를 merge로 받아 이어 간다. 팀 관행 문장은 고치지 않는다
B. PR마다 브랜치를 따로 둔다
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Q4. [개발] 11/18에 바뀐 보안 리뷰 방식을 팀 관행에 넣을까

컨벤션 §6이 바뀌어(#591·#599) 리뷰하는 사람이 `catchu-security-reviewer` 에이전트로 변경분을 대조할 수 있다. 팀 의무가 아니고 승인 1건에도 세지 않는다.

A. 넣지 않는다
B. 작업 방식 절에 넣는다
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Q5. [개발] 끝까지 이어지는 얇은 판을 먼저 만들까

얇은 판(walking skeleton)은 진짜 기능을 넣기 전에 조각들이 이어지는지 보려고 먼저 만드는, 처음부터 끝까지 도는 가장 작은 판이다. 근거: 이 작업 범위(mvp)는 얇은 판을 먼저 만드는 설정이고, 승인된 만드는 순서의 첫 묶음(계약 + 프리셋 저장)이 첫 dev PR과 겹친다.

A. 예. 첫 묶음을 첫 작업 단위로 따로 돌려 승인받는다. 팀 관행 문장은 그대로 둔다
B. 아니오. 첫 작업 단위도 다른 단위와 같이 돌린다
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Q6. [개발] 코드 스타일 절

11/14 뒤 린트·서식 설정 변경이 없다.

A. 지금 두 줄을 그대로 둔다
B. 바꾼다(무엇을 바꿀지 적는다)
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Q7. [품질] 시험 방식과 커버리지 하한

시험 방식(시나리오는 구현 전, 세부 시험 코드는 구현 뒤)은 지금 팀 관행 그대로다. 커버리지는 측정 명령만 있고 CI가 재지 않으며 `team.md`에 하한이 없다. `org.md`의 mvp 80% 하한은 팀 관행을 정하지 않았을 때의 기본값이다.

A. 방식은 그대로 두고, 하한 없이 잰 값을 보고만 한다
B. 80% 하한을 둔다(못 넘으면 Build and Test에서 막힌다)
C. Not yet defined
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
