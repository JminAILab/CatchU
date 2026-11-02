# CatchU 12월 통합 확인 표

12월 공개 전 통합 확인을 실제 결과대로 남기는 표 하나다. 1차(11/13, 개발 서버 EC2)·2차 통합 확인과 팀원 아닌 1명의 사용 결과, 제출 준비를 여기에 적는다. 10월 MVP의 [통합 검증표](CatchU_통합검증표.md)와는 별개다.

근거: [12월 요구사항](../aidlc/spaces/default/intents/260925-intent-12/inception/requirements-analysis/requirements.md) FR19·NFR6, U2 [업무 규칙](../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/rules.md) BR9.1·BR9.4·BR9.5와 [기능 명세](../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/functional-design/functional-spec.md) W10·W11, U2 [관측 설계](../aidlc/spaces/default/intents/260925-intent-12/construction/u2-shared-foundation/nfr-design/observability-design.md) 「통합 확인 표」.

## 적는 규칙

- 확인을 할 때마다 아래 확인 표에 한 행을 더한다. 결과는 **통과·실패·미실행** 중 하나다.
- 헬스체크 응답, 로컬에서의 성공, 승인 문서로 칸을 채우지 않는다. 10월 분석 경로로 대신 돌린 성공은 새 흐름의 완료로 적지 않는다.
- 실패·미실행도 그대로 적고, 막힌 곳과 대신하지 않은 이유를 메모에 쓴다.
- 대상 버전은 커밋 SHA 또는 배포 태그다. 메모에 비밀값·인증정보·사용자 자료·계정 주소를 넣지 않는다.

## 시나리오 목록

| 묶음 | 시나리오 | 선행 조건·확인 방법 |
|---|---|---|
| 보호 흐름 | 회원 자료 격리 | 회원 둘이 서로의 자료·발행본·JD 요약을 볼 수 없는지 |
| 보호 흐름 | 링크 중지 뒤 차단 | 중지한 링크가 웹·질의응답·MCP에서 막히는지(U9를 빼면 웹·질의응답만) |
| 보호 흐름 | 탈퇴 뒤 차단 | **선행 조건: U2 코드를 개발 서버에 올리기 전에 `FILE_STORAGE_DRIVER`·`FILE_STORAGE_LOCAL_ROOT`를 넣는다**(값이 없으면 api는 뜨지만 탈퇴가 2단계에서 실패한다, [api 파일 저장](../api/docs/file-storage.md)). 탈퇴 뒤 그 회원의 토큰·발행 링크·Claude 연결이 막히고 자료가 지워지는지 |
| 실제 Claude 연결 | 웹 연결·만료 재승인·해제 | 본인 Claude 웹 연결 |
| 실제 Claude 연결 | Desktop 연결 | 본인 Claude Desktop 연결 |
| 실제 분석 | 팀장 계정 CatchU 저장소 분석 | 실제 GitHub 저장소 |
| 실제 분석 | 거부 사례 1~2종 | 분석하지 않아야 하는 경우가 실제로 거부되는지 |
| 실제 분석 | 새 저장소 등록 경로를 실제로 돌렸는지 | 별도 행으로 적는다 |
| 로그인 | Google 외부 계정 로그인 | 배포 앱을 '프로덕션'으로 게시한 뒤 팀원 아닌 Google 계정으로 로그인([Google 로그인 안내](../api/docs/google-login.md) 「배포 환경 앱의 '프로덕션' 게시」) |
| 사용 | 팀원 아닌 1명이 시작 안내만으로 처음부터 사용 | 막힌 곳을 메모에 적는다 |

## 확인 표

| 날짜 | 차수 | 시나리오 | 대상 버전 | 환경 | 결과 | 메모 |
|---|---|---|---|---|---|---|
| | 1차 | | | 개발 서버(EC2) | 미실행 | 아직 하지 않음 |

차수는 1차·2차·추가 중 하나다. 환경은 예를 들어 개발 서버(EC2), EKS다.

## 제출 준비

- 2차 확인 뒤 남은 기간은 결함 수정에 쓴다. 12월 1~9일은 기능 개발 없이 리허설과 제출 자료 정리만 하고, 12월 10일 제출 때 외부 접속 서비스·이 확인 표·시연·제출 자료를 갖춘다.
- 필수 기능이 실패했거나 끝나지 않았으면 조용히 빼지 않고 아래 표에 영향과 조정안을 적어 팀장에게 낸다.

| 기능 | 상태(실패·미완료) | 영향 | 조정안 | 낸 날짜 |
|---|---|---|---|---|
| | | | | |

### 상수 조정 기록

코드 상수를 바꿨으면 여기에 남긴다. 예: AI 입력 상한 `AI_INPUT_MAX_CHARS`(지금 80,000자, api `src/ai-generation/gate-policy.ts`)를 JD 요약 "전체 넣기"에서 걸려 조정한 경우.

| 날짜 | 상수 | 바꾸기 전 → 뒤 | 이유 | 대상 버전 |
|---|---|---|---|---|
| | | | | |
