# CR2 소속 저장 — 기능 설계 질문

입력: Unit `inception/units-generation/unit-of-work.md`(CR2), 스토리 US1.1~US1.3, 요구사항 FR1·NFR4·NFR6, 구성 요소·ADR-001~003, 계약 C1·C2, 지금 코드(`worker/app/candidates/grouping.py`·`build.py`·`identity.py`, `worker/app/generation/material.py`, `api/src/catches/registration-service.ts`, `api/src/analysis-intake/analysis-intake.service.ts`, `web/src/features/repository-management/repository-status.ts`).

## 질문 없이 정한 것(코드와 승인 기록으로 정해짐)

- **동시 쓰기(가정 A4):** 접수는 회원마다 진행 중 요청을 하나만 둔다(`analysis-intake.service.ts`의 `lifecycle: 'ACTIVE'` 확인). 소속 기록의 열쇠에 회원이 들어 있어, 한 회원의 소속을 두 분석이 동시에 쓰는 일은 없다. 가정 A4는 성립한다.
- **기존 Catch에 잇기(FR1.5):** 지금 등록은 같은 열쇠의 Catch가 있으면 내용을 쓰지 않고 참조만 한다(`EXISTING`). CR2는 이 길에 소속 쓰기만 더한다.
- **CR2 배포 전에 만든 Catch:** 소속 기록이 없다. 다음 재분석에서 같은 열쇠로 이어질 때 소속이 써진다. 출시 전 마지막 DB 초기화로 어차피 지워진다.
- **같은 변경으로 묶인 SHA 가운데 일부만 소속인 변경:** 변경 전체를 뺀다(같은 변경은 하나로 센다는 지금 규칙을 따른다).
- **남은 새 커밋:** 본인 커밋으로 센다. 다른 계정 커밋은 소속에 기록되지 않으므로, 남은 본인 변경이 없는 단위는 후보가 아니다.

## Q1. [설계] 소속 커밋을 빼는 시점

PR 없이 올린 커밋은 같은 파일을 고친 커밋끼리 이어서 한 묶음(커밋 묶음)이 된다. 소속 커밋을 묶기 전에 빼는지, 묶은 뒤에 빼는지에 따라 결과가 갈린다. 스토리 US1.3의 수용 기준(이미 소속된 직접 커밋 3개 뒤에 같은 작업의 직접 커밋 2개가 더해지면, 새 커밋 2개로 Catch 하나)이 기준이다.

- A. 단위를 지금처럼 다 정한 뒤, 각 단위에서 소속 커밋을 뺀다. PR·PR 없는 병합은 열쇠를 그대로 두고, 커밋 묶음은 남은 커밋으로 열쇠를 새로 만든다. 새 커밋 2개가 서로는 같은 파일을 안 고쳤어도 소속 커밋을 거쳐 이어졌으면 Catch 하나가 된다(US1.3 그대로). 단위를 정하는 코드는 바꾸지 않고 끝에 빼기만 더한다.
- B. 단위를 정하기 전에 소속 커밋을 아예 뺀다. 남은 새 커밋끼리 직접 이어질 때만 한 묶음이다. 새 커밋 2개가 서로 이어지지 않으면 Catch 2개가 된다(US1.3과 어긋날 수 있다). 병합·관계 판정이 소속 커밋 없이 돌아 단위를 정하는 코드 여러 곳을 고쳐야 한다.
- X. Other (please specify)

[Answer]: A

## Q2. [제품] 새로 찾은 작업이 없는 재분석의 화면 문구

CR2 뒤에는 이미 Catch에 속한 작업은 후보로 나가지 않는다. 그래서 바뀐 것이 없는 저장소를 다시 분석하면 결과가 비고, 저장소 화면에 지금 문구 「분석을 마쳤습니다. 검토할 Catch가 없습니다.」가 나온다(`web/src/features/repository-management/repository-status.ts`). 지금은 다시 찾은 작업이 기존 Catch로 이어져 「Catch N개가 준비되었습니다」가 나온다. CR2 경계는 「화면은 바꾸지 않는다」이다.

- A. 그대로 둔다. 분석 고지에 이미 「새로 찾은 작업만 Catch로 더합니다」가 있다. web은 바꾸지 않는다.
- B. 결과가 빈 경우의 문구 한 줄만 「분석을 마쳤습니다. 새로 찾은 작업이 없습니다. 이미 있는 Catch는 그대로입니다.」로 고친다. 구직자가 Catch가 사라졌다고 오해하는 것을 더 막는다. web 한 파일과 그 시험을 고친다(CR2에 web 변경이 하나 생긴다, 1~2시간).
- X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
