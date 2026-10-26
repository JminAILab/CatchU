# 도메인 설계 질문·답변 (2026-10-24 재승인 뒤)

단계: domain-design. intent: `260925-intent-12`. 입력: [재승인 요구사항](../requirements-analysis/requirements.md), [사용자 스토리](../user-stories/stories.md). 기존 코드: `api/src`(NestJS 모듈: auth·google-login·github-connection·member-repositories·analysis-intake/queue/receiver/deadline·member-analysis·catches·share-links·recipient·member-profile·result-application·worker-context·database), `worker/app`(Python: collection·candidates·generation·consumer), `web/src/features`. 탈퇴 연쇄 삭제 규칙은 `api/docs/member-withdrawal-deletion.md`.

## 출발점과 이미 정해진 것

- 입력 §3 「11월 진행 방식」의 다섯 덩어리(공용 기반 / 발행·링크 / RAG / Claude MCP / 저장소·JD)를 컴포넌트 묶음의 출발안으로 쓴다. 최종 Unit 경계는 Unit 나누기에서 정한다. 다른 덩어리의 세부는 팀장 혼자 정하지 않고 "담당 확인 필요"로 남긴다.
- 정해진 것(다시 묻지 않음): 벡터 저장소는 RDS PostgreSQL의 pgvector(C07), 임베딩은 Voyage AI, 생성은 Claude API 인용 기능·Haiku 5.5, PDF 글 추출은 worker의 `pypdf`, 회원 자료 외래 키는 연쇄 삭제(FR14.8), 늦은 결과는 부모 외래 키로 거부(FR14.10).
- 이 단계는 논리 컴포넌트와 엔티티 소유만 정한다. 배포 단위·API·DB 형식은 Unit 나누기·계약 설계·기능 설계에서 정한다.

## Q1. [설계] 발행본과 링크를 한 컴포넌트로 둘까요?

배경: 10월 `share-links` 모듈은 링크(비밀번호·만료·중지·발급 제한)를 가진다. 요구사항 FR4.7은 "링크와 발행본을 함께 저장"하고, 발행본은 링크가 중지·만료돼도 작성자가 보며 삭제는 따로 한다(FR5).

A. 한 컴포넌트(발행) — 기존 공유 링크 컴포넌트를 발행본까지 넓혀, 발행본(고정 사본 항목 포함)과 그 링크를 한 곳이 소유한다. 가장 단순하고 "함께 저장"을 한 트랜잭션으로 지킨다. 링크 규칙(비밀번호·만료·발급 제한)은 그대로 재사용한다.
B. 두 컴포넌트(발행본 / 링크 접근) — 발행본 저장과 링크 접근 판정을 나눈다. 링크 판정만 따로 시험하기 쉽지만 발행 때 두 컴포넌트를 묶는 조정이 하나 늘어난다.
X. Other (please specify)

[Answer]: A

## Q2. [설계] AI 생성 공통(인용 연결·근거 검사)과 질의응답·백그라운드 AI 실행을 어디에 둘까요?

배경: 입력은 "AI 생성 공통(인용 기능 연결·근거 검사), 백그라운드 AI 실행 공통"을 팀장의 공용 기반으로 두었다. 질의응답은 큐가 아닌 바로 답하는 경로로 SSE를 내보내고(FR6.2), 기본 요약·JD 요약은 백그라운드로 처리한다(FR6.8). 10월에는 api가 큐로 worker에 분석을 넘기고 worker가 Claude를 부른다. 이 선택은 Unit 나누기와 담당 배정에 직접 이어진다.

A. api(TypeScript)에 둔다 — AI 생성 공통·질의응답 SSE·기본 요약/JD 요약 실행을 api에 두고, worker는 저장소 분석과 PDF 글 추출만 맡는다. 근거 검사 코드가 한 곳에 있고, 질의응답을 위해 api→worker 동기 경로를 새로 만들지 않는다. 대신 api 안에 백그라운드 실행(기존 큐 재사용)을 새로 둔다.
B. worker(Python)에 둔다 — AI 생성 공통과 기본 요약/JD 요약 실행을 worker에 두고(10월 큐·Claude 연결 재사용), 질의응답은 api가 worker의 동기 경로를 불러 SSE를 중계한다. 10월 worker 코드를 더 재사용하지만 api→worker 동기 경로와 SSE 중계가 새로 생긴다.
X. Other (please specify)

[Answer]: A

## Q3. [설계] PDF 원본과 발행 사본을 어디에 저장할까요? (요구사항 OQ1)

배경: PDF는 원본을 보관하고, 발행 때 복사해 발행본마다 자기 파일을 가진다(FR3.2). 탈퇴·발행본 삭제는 DB 연쇄 삭제로 처리한다. PDF는 후순위 기능이다.

A. DB(PostgreSQL)에 저장 — 연쇄 삭제가 파일까지 지우므로 DB 밖 파일 삭제를 따로 만들지 않는다. 크기·쪽 수 상한(개발 담당 결정)을 작게 두는 전제다. 가장 단순하다.
B. S3에 저장 — 큰 파일에 유리하지만 탈퇴·발행본 삭제에서 S3 파일 삭제를 따로 만들고 시험해야 하며, 팀장의 공용 인프라 작업(버킷·권한)이 늘어난다.
X. Other (please specify)

[Answer]: X. B. S3로 한다.
- 저장: PDF 원본과 발행 사본을 S3에 둔다. 키는 회원·발행본 단위 접두어로 나눈다.
- 삭제: 탈퇴는 회원 접두어 전체, 발행본 삭제는 그 발행본 접두어를 목록으로 받아 지운다. S3를 먼저 지우고 DB를 지우며, S3 삭제가 실패하면 성공으로 응답하지 않고 오류를 보인다(FR14.1과 같음). 재시도 장치는 두지 않는다.
- 열람: 임시 열람 주소(presigned URL)는 쓰지 않는다. api가 요청마다 링크 조건을 확인한 뒤 S3에서 읽어 내려준다.
- 로컬: 파일 저장은 인터페이스로 감싸 로컬·시험은 로컬 파일, 배포는 S3를 쓴다. 팀원은 S3 없이 개발한다.
- 버킷: 환경별 1개, 공개 차단·자동 암호화 켜기, 버전 관리 끄기(지운 파일이 이전 버전으로 남지 않게).
- 권한: 접근 키 대신 역할로 받는다. 개발 서버는 EC2 역할(api·worker 공용), EKS는 서비스별 역할(api는 올리기·읽기·복사·목록·삭제, worker는 읽기만).
- 준비: 버킷·권한은 팀장이 공용 인프라(#389)로 맡고, PDF가 후순위라 PDF Unit이 시작될 때 준비한다.

## Q4. [설계] Catch 설명은 어느 컴포넌트가 소유할까요?

배경: Catch마다 작성자 설명 하나를 두고, 같은 작업이 다시 분석되면 기존 Catch를 참조해 설명이 유지된다(FR2.5). 10월 `catches` 모듈이 Catch를 소유한다.

A. Catch 컴포넌트가 소유 — 설명을 Catch의 속성으로 둔다. 재분석 때 같은 Catch를 참조하므로 설명 유지가 자연히 성립하고, Catch 탈퇴 삭제를 그대로 따른다. 가장 단순하다.
B. 별도 "Catch 설명" 컴포넌트 — 설명을 Catch를 참조하는 별도 엔티티로 둔다. 발행·링크 덩어리가 Catch 모듈을 덜 건드리지만 소유 경계가 하나 늘어난다.
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- 출발점: 입력의 다섯 덩어리(공용 기반 / 발행·링크 / RAG / Claude MCP / 저장소·JD)를 컴포넌트 묶음의 출발안으로 쓰고, 최종 Unit 경계는 Unit 나누기에서 정한다. 다른 덩어리의 세부는 "담당 확인 필요"로 남긴다.
- Q1: 발행본과 링크는 한 컴포넌트(발행)가 소유한다. 기존 공유 링크를 발행본까지 넓히고 링크 규칙(비밀번호·만료·발급 제한)을 재사용한다.
- Q2: AI 생성 공통(인용 연결·근거 검사), 질의응답 SSE, 기본 요약·JD 요약의 백그라운드 실행은 api(TypeScript)에 둔다. worker는 저장소 분석과 PDF 글 추출만 맡는다.
- Q3: PDF 원본과 발행 사본은 S3에 둔다. 키는 회원·발행본 접두어로 나누고, 탈퇴·발행본 삭제는 S3를 먼저 지운 뒤 DB를 지우며 S3 삭제가 실패하면 오류를 보인다(재시도 없음). presigned URL 없이 api가 링크 조건 확인 뒤 내려준다. 파일 저장은 인터페이스로 감싸 로컬·시험은 로컬 파일을 쓴다. 버킷은 환경별 1개·공개 차단·자동 암호화·버전 관리 끄기, 권한은 역할(api 올리기·읽기·복사·목록·삭제, worker 읽기만). 버킷·권한은 팀장 공용 인프라(#389)로 PDF Unit 시작 때 준비한다.
- Q4: Catch 설명은 Catch 컴포넌트가 Catch의 속성으로 소유한다.
- 이미 정해진 것: pgvector·Voyage AI·Claude 인용 기능·Haiku 5.5·worker의 pypdf·연쇄 삭제·늦은 결과 부모 외래 키 거부.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
