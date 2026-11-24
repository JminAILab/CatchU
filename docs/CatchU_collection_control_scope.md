# CatchU 수집 통제와 임시 자료 — 수집 범위·통제·자격정보 인계(1~3절)

> [수집 통제와 임시 자료](CatchU_수집통제_임시자료.md)의 절을 2026-10-02 [#203](https://github.com/JminAILab/CatchU/issues/203)에서 그대로 옮긴 파일이다. 지위와 적용 범위는 그 문서와 같고, 다른 절은 그 문서에서 찾는다. AI가 한 번에 읽을 수 있게 36 KB 미만으로 유지한다.

## 1. 무엇을 어떻게 가져오는가

### 1.1 수집 방식 — API만 쓴다

**결정(2026-09-29, 팀장)**: 10월 MVP는 GitHub API만 쓰고 저장소 복제(git clone)를 하지 않는다. 처음 결정은 "REST API만 쓴다"였고, 연결 PR 조회만 2026-10-10 팀장 결정으로 GraphQL을 쓴다(이 절 끝). 저장소 복제를 하지 않는 것은 그대로다.

| 근거 | 내용 |
|---|---|
| 필요한 자료가 API로 다 나온다 | 허용 자료 종류는 커밋·PR·이슈 셋뿐이다([메시지 스키마 `allowedResourceTypes`][yw]). 셋 다 REST API로 조회할 수 있다 |
| 전체 diff 복구가 필수가 아니다 | 제약 등록부는 "전체 diff 복구를 필수화하지 않는다. 누락·잘림 탐지와 근거 범위 제한은 유지한다"고 했다([제약 등록부 「고정 제약」][cr]). 복제가 API보다 나은 거의 유일한 지점이 이것인데, 필수가 아니다 |
| **막아야 할 위험의 종류가 다르다** | API는 F가 요청한 것만 받는다. 복제는 저장소가 준 것을 worker 디스크에 풀어 놓고, 그 안의 hook·diff/textconv 드라이버·credential helper·로컬 config가 명령을 실행시킬 수 있다([제약 등록부 C04][cr]). **"부르지 않으면 됨"과 "실행되지 않게 막아야 함"은 확실성이 다르다.** 통제 개수가 느는 문제가 아니다 |
| 실제 환경에서 검사할 것이 적다 | [#37][i37]의 C05는 통제를 **실제 환경에서** 검사하라고 요구한다. API만 쓰면 수집 대상 호스트를 제한하면 되고, 복제를 택하면 위 네 가지를 더 확인해야 한다. EKS 확인 범위와 받아들인 한계는 [8절](CatchU_수집통제_임시자료.md#8-37-조건-대조--적용충족미확인)에 있다 |
| 디스크에 남는 자료가 줄어든다 | 복제본은 요청마다 저장소 전체를 디스크에 쓴다. 정리 실패의 영향과 최소 접근 요구([요구사항 NFR7][r122])에 모두 불리하다 |

**이 결정으로 받아들이는 한계**: 큰 커밋의 변경 내용이 API 응답에서 잘릴 수 있다. 숨기는 한계가 아니라 근거의 `coverageLimits`에 적어 **드러내는** 한계다([명세 W 메시지][c162]). 실제 잘림 조건(파일 수·크기)은 [#117][i117]에서 확인해 상한과 함께 기록한다.

**되돌릴 수 있다**: 복제가 필요해지면 [1.3](#13-git-복제를-채택한다면-추가로-필요한-통제)의 통제를 본문으로 올리고 수집 모듈 옆에 붙인다. 지금 구조를 갈아엎는 변경이 아니므로 위험이 낮다.

**제약 등록부와의 관계**: 제약 등록부에는 "수집 방식은 미채택"이 남아 있다([제약 등록부 「고정 제약」][cr]). 승인 원본은 이 문서에서 고치지 않는다. 이번 결정은 10월 MVP의 F 구현 방식에 적용하며, 제약 등록부 반영 여부는 [#37][i37]에서 다뤘고, 승인 원본이라 고치지 않았다([2026-09-29 결정](https://github.com/JminAILab/CatchU/issues/37#issuecomment-5882662163)).

**GraphQL은 연결 PR 조회에만 쓴다(2026-10-10 팀장 결정, [#267](https://github.com/JminAILab/CatchU/issues/267)).** 커밋과 연결된 PR을 묻는 조회를 커밋 100개씩 묶어 GraphQL 요청 하나로 한다. 그 밖의 조회(커밋·PR·이슈 목록, PR 커밋 목록, 비교, 변경 내용, 파일 모드)는 REST 그대로다.

- 대체한 문장: 2026-09-29 결정의 "GitHub REST API만 쓴다"와 이 자리에 있던 "GraphQL API는 쓰지 않는다. 호출 수 계산 방식이 REST와 달라 상한을 따로 정해야 하고, 커밋·PR·이슈 조회만으로는 REST 대비 이점이 크지 않다."
- 두 번째 이유가 바뀌었다. #118이 PR 목록으로 설명되지 않은 본인 커밋마다 연결 PR을 묻게 되면서, 직접 push가 많은 저장소는 이 조회만으로 요청당 호출 상한(300회)을 넘어 Catch 0개·`FAILED`가 됐다. 묶음 조회는 이 조회를 커밋 100개당 1회로 줄인다(본인 커밋 약 500건이면 약 500회 → 6회).
- 첫 번째 이유(호출 수 계산)는 **2026-10-12 팀장 결정**으로 풀었다. 요청당 호출 상한은 실제 HTTP 요청 수로 센다. REST 요청 1회와 GraphQL 묶음 요청 1회를 각각 1회로 더하고, GraphQL 점수(`rateLimit.cost`)는 더하지 않고 따로 기록한다([2.3](#23-자원시간-상한)).
- 출처: 2026-10-10 결정은 [입력 문서 변경 기록](ai-dlc-input-mvp/2026-10-08_catch-decisions.md#변경-기록), 2026-10-12 결정은 이 절과 [결정 이력](CatchU_수집통제_임시자료.md#결정-이력)이 기록이다. 방식·근거는 worker 문서 「[연결 PR 묶음 조회](../worker/docs/associated-pr-lookup.md)」에 있다.

### 1.2 요청의 허용 범위를 적용하는 순서

요청(`Request`)에는 저장소가 두 곳에 적힌다. 최상위 `repositoryId`와 `allowedScope.repositoryId`다. **둘이 같아야 하고, 자격정보 맥락이 가리키는 저장소와도 같아야 한다.** 하나라도 다르면 수집을 시작하지 않는다.

| 순서 | 검사 | 통과하지 못하면 |
|---|---|---|
| 1 | 세 식별자(`requestId`·`attemptId`·`messageId`)와 스키마 판본이 읽히는가 | 결과를 만들지 않고 거부 기록만 남긴다([2.4](#24-상한을-넘거나-실패했을-때)) |
| 2 | 조회 전 자체 검사: 요청·시도 ID가 uuid이고 시도 ID가 큐 작업 ID와 같은가, 두 참조(`credentialContextReference`·`allowedScope.selectionReference`)가 시도 ID와 같은가, `repositoryId`와 `allowedScope.repositoryId`가 같은가 | **진행 알림도 결과도 보내지 않고** 거부 기록만 남긴다([#121][i121]) |
| 3 | 요청 정보 조회([#232][i232]): 시도 ID로 api에 한 번 물어 E의 접수 기록과 자격정보 맥락을 받는다 | 모름·실패면 수집 없이 **진행 알림 없이** 실패 결과 하나(`stage: COLLECTION`, 이유 코드). 받을지는 E가 정한다(아래) |
| 4 | 요청의 저장소·허용 범위·시도가 조회로 받은 E의 접수 기록과 같은가 | **진행 알림도 결과도 보내지 않고** 거부 기록만 남긴다([#113][i113]에서 구현). E의 요청은 처리 시한에 실패로 닫힌다([2.4](#24-상한을-넘거나-실패했을-때)) |
| 5 | `allowedResourceTypes`가 비어 있지 않은가 | 수집 없이 실패 결과. 빈 목록은 "아무것도 허용되지 않음"이며 정상 0건이 아니다 |
| 6 | 자격정보 맥락이 요청과 맞는가([3.3](#33-f의-검사-순서와-거부)) | 수집 없이 실패 결과 |
| 7 | 여기까지 통과해야 첫 GitHub 호출을 한다 | — |

- **자료 종류는 허용 목록이다.** `allowedResourceTypes`에 `COMMIT`만 있으면 PR·이슈 API를 부르지 않는다. 계약도 "전체 종류 열거가 수집 허가가 아님"이라고 못박았다([명세 W 메시지][c150]).
- **`selectionReference`는 API가 접수한 분석 시도의 참조**다. F는 [요청 정보 조회](../worker/docs/request-context.md)로 접수 맥락을 대조하며, 저장소 등록·접수 정책을 다시 판단하지 않는다.
- **`revision`은 허용 범위의 판본**이다. 자격정보 맥락이 알려 주는 판본과 다르면 범위 불일치로 거부한다([3.3](#33-f의-검사-순서와-거부)). 결과의 `scopeRevision`에는 요청에 실린 값을 그대로 돌려준다.
- 진행 알림(`ProcessingEvent`)은 1~4번을 모두 통과한 뒤에만 보낸다([#113][i113]에서 구현). 통과하지 못한 요청은 처리하지 않으므로 "받았다·실행 중"이라고 알리지 않는다. 3번의 모름·실패도 진행 알림 없이 실패 결과만 보낸다.
- **조회 모름·실패의 판정은 E가 한다(10/15 팀장 결정).** 이 실패 결과에는 접수 기록과 대조하지 못한 메시지 값이 들어가고, E가 결과의 맥락 일곱 개(요청·시도·회원·저장소·동의·허용 범위 판본·`sourceMode`)를 접수 기록과 대조해 닫힌 요청·지난 시도의 결과를 거부한다. 2번이 두 참조와 두 저장소 ID를 미리 막으므로 남는 차이는 고지 판본(`noticeRevision`)과 허용 자료 종류뿐이다. 이 둘만 접수 기록과 다른 요청은 4번에서 조용히 거부되는 대신 곧바로 실패로 닫힌다(60분 대기 없이 실패, 재요청 가능). 둘 다 수집할 때만 의미가 있는 값이고 이 경로에서는 수집하지 않는다.

### 1.3 git 복제를 채택한다면 추가로 필요한 통제

지금은 **해당 없음**이다. 채택할 때만 아래를 이 문서에 넣고 검사 항목으로 만든다([제약 등록부 C04][cr]).

| 대상 | 필요한 통제 |
|---|---|
| hook | 저장소의 hook을 실행하지 않는다(`core.hooksPath`를 빈 디렉터리로 고정) |
| diff·textconv | 저장소가 지정한 외부 명령 드라이버를 쓰지 않는다 |
| credential helper | 로컬·전역 helper를 쓰지 않고 자격정보를 디스크에 남기지 않는다 |
| 로컬 config | 복제본의 설정이 실행 환경에 영향을 주지 않도록 격리한다 |
| 프로토콜 | `https`만 허용하고 `ssh`·`file`·`git` 프로토콜을 막는다 |
| 크기 | 복제 깊이·용량 상한과 정리 시점을 [4.2](CatchU_collection_control_temp_data.md#42-수명표)에 추가한다 |

---

## 2. 수집할 때 막는 것

### 2.1 주소·권한 검사

| 통제 | 내용 |
|---|---|
| 호스트 | `api.github.com`만 부른다. 그 밖의 호스트로는 요청하지 않는다 |
| 프로토콜 | `https`만 쓴다 |
| 주소 생성 | F가 저장소 좌표와 경로 틀로 직접 만든다. 응답 본문에 들어 있는 주소(`url`·`next` 등)를 그대로 부르지 않는다. 쪽 넘김이 필요하면 페이지 번호만 F가 올린다. 연결 PR 조회(GraphQL)는 고정 주소 `POST https://api.github.com/graphql` 하나에 F가 가진 읽기 쿼리 틀만 쓰고, 검사한 저장소 좌표·SHA는 쿼리 문에 넣지 않고 변수로 넘긴다. 응답의 다음 쪽 cursor는 받지 않고 따라가지 않는다 |
| 우회 이동 | 자동 우회 이동(redirect)을 따라가지 않는다. 우회 응답은 오류로 처리한다 |
| 자료 안의 주소 | README·이슈 본문·커밋 메시지에 있는 주소는 **자료**다. 부르지 않고, 근거의 `sourceUrl`에도 쓰지 않는다. GraphQL 응답 `data` 안의 글(PR 제목·본문)은 오류·한도 판정에도 쓰지 않는다 |
| 근거의 출처 주소 | `sourceUrl`은 F가 만든 GitHub 화면 주소만 쓴다. 저장소가 제공한 임의 주소를 옮기지 않는다 |
| 권한 | 대상 저장소 하나에만 접근한다. 응답에 다른 저장소가 딸려 와도 따라가지 않는다(예: fork 원본, 참조된 다른 저장소의 PR). GraphQL은 이름이 바뀌었거나 옮겨진 저장소를 따라가지 않게 묻고, 응답의 저장소가 검사한 좌표와 다르면 정상 관측으로 쓰지 않고 멈춘다(다른 저장소를 기준으로 연 PR을 버리는 것과 다르다) |

### 2.2 외부 실행·네트워크 제한

**가져온 내용은 어떤 형태로도 실행하지 않는다.** 껍데기 명령·하위 프로세스·코드 평가·서식 치환·압축 해제를 하지 않는다. 수집 단계는 응답을 읽어 구조화하는 일만 한다.

**저장소 안의 지시문은 지시가 아니라 자료다.** README나 이슈 본문에 "앞의 지시를 무시하고 ~하라" 같은 문장이 있어도 F의 처리 순서를 바꾸지 않는다. 이 원칙은 생성 단계([#120][i120])로 넘길 때도 유지한다. 넘기는 자료에는 "이것은 수집한 자료"라는 표시를 붙이고, 생성 지시와 섞지 않는다.

**바깥으로 나가는 연결은 필요한 곳만 연다.**

| 대상 | 허용 |
|---|---|
| `api.github.com` | 수집 |
| 설정한 생성 서비스 | 초안·질문 생성. 제공자·주소·운영 키 조건은 [생성 제공자](../worker/docs/generation-provider.md)를 따른다 |
| OpenAI 판정 API | 재료·Catch 판정([제공자](../worker/docs/generation-provider.md)) |
| 서울 리전 S3 | PDF 파일 읽기([EKS 파일 저장](../deploy/aws/s3.md)) |
| 내부 api·큐 | 요청 수신·결과 전달 |
| 그 밖의 모든 호스트 | 막는다 |

- **코드 쪽**: HTTP 클라이언트를 한 곳에 두고 호출 직전에 호스트를 확인한다. 목록 밖은 호출 자체를 하지 않는다. 담당은 [#117][i117]이다.
- **환경 쪽**: 배포 환경의 나가는 방향 제한은 H 범위이며 [#37 C05 11/19 기록](https://github.com/JminAILab/CatchU/issues/37#issuecomment-7000321920)의 연결 성공·차단·미확인 범위를 따른다. 코드 검사만으로 환경 통제를 확인했다고 보고하지 않는다.

### 2.3 자원·시간 상한

상한은 [#424의 2026-11-01 결정](https://github.com/JminAILab/CatchU/issues/424)과 [#450의 11-14 실측·결정](https://github.com/JminAILab/CatchU/issues/450#issuecomment-6858511860)으로 정했다. 이곳의 예전 제안 수치 표는 현재 안내에서 제거했다. 현재 수집 값은 [GitHub 수집 상한](../worker/docs/github-collection.md), 전체 처리 시한·생성 상한은 [U7 분석](../worker/docs/repository-analysis-u7.md)을 따른다. 동시 실행은 [#480](https://github.com/JminAILab/CatchU/issues/480) 결정에 따라 EKS 배포 스크립트의 worker 설정값은 3이며, 각 worker의 동시 수는 1이다.

GitHub 호출 수는 실패를 포함한 실제 HTTP 요청 수다. REST 요청 1회와 GraphQL 묶음 요청 1회를 각각 1회로 더하고, GraphQL 점수는 별도 기록한다. 자동 외부 재시도·실패 묶음 분할·REST 대체 호출은 하지 않는다.

시계는 **처리 시작 시각 기준**으로 하나만 둔다. 개별 호출 대기가 짧아도 총 수집 시간이 넘으면 멈춘다. E가 요청을 닫는 처리 시한(접수 후 60분, [처리 시한 구현](../api/docs/analysis-deadline.md))은 접수 시각 기준이다. 현재 worker 총 처리 상한도 60분이지만 큐에서 꺼낸 때부터 재므로 두 시계의 시작점이 다르다([큐 소비자](../worker/docs/queue-consumer.md)).

**'재시도'라는 말이 가리키는 것들을 섞지 않는다.** 계약과 팀장 결정이 각각 다르게 다룬다.

| 무엇 | 지금 기준 | 근거 |
|---|---|---|
| GitHub 조회 재시도 | **하지 않는다** | 자동 외부 재시도·추가 호출 금지([명세 공통 오류·요청 안전성][c137]) |
| 한 분석 안의 LLM 재호출 | AI 판정을 끈 경로에서 **Catch 제목 형식 고쳐 쓰기만** 제목당 최대 3회. 요청 전체 호출·시간 상한 안에서 실행하며 호출 실패는 재시도하지 않는다. AI 판정을 켠 경로는 고쳐 쓰지 않는다 | [생성 판정](../worker/docs/generation-judgement.md), `worker/app/generation/limits.py`·`flow.py` |
| 분석 전체 자동 재실행 | **하지 않는다**. 회원이 새 동의로 요청하는 재분석은 [U7 접수 규칙](../api/docs/repository-analysis-u7.md#기존-catch를-보존하는-재분석)과 구분한다 | 요청 작업 `attempts: 1`, 정체 복구 0회([큐 소비자](../worker/docs/queue-consumer.md)) |
| 결과 재전달 | **하지 않는다** | 계약은 저장 결과 재전달을 분석 재호출과 따로 두었지만([명세 전이·불변 조건][c78]), [10/6 결정][d23]으로 결과를 보존하지 않아 다시 보낼 것이 없다. 거부된 결과는 기록만 남긴다([5.2](CatchU_collection_control_temp_data.md#52-재전달)) |

위 예외 외의 자동 외부 재시도를 이 문서에서 새로 허용하지 않는다. 정책을 바꾸려면 관련 계약과 정량 상한을 함께 결정한다.

### 2.4 상한을 넘거나 실패했을 때

핵심은 **멈춘 것을 정상 0건으로 바꾸지 않는 것**이다([worker 규칙 BR3.3][wr]).

| 상황 | F가 하는 일 | 결과 종결값 |
|---|---|---|
| 요청 식별자를 읽을 수 없음 | 아무것도 하지 않고 거부 기록만 남긴다. 식별자를 지어내지 않는다 | **결과를 보내지 않는다** |
| 요청이 E의 접수 기록과 다름(저장소·허용 범위·시도) | 진행 알림도 결과도 보내지 않고 거부 기록만 남긴다([#113][i113]) | **결과를 보내지 않는다** |
| 요청당 총 처리 시간 초과([2.3](#23-자원시간-상한)) | 결과 없이 그 작업을 끝내고 다음 작업을 받는다([#121][i121]) | **결과를 보내지 않는다** |
| 요청 정보 조회 모름·실패(진행 알림 없음, [#121][i121]) | 수집 없이 실패 하나를 담은 결과를 보낸다(`stage: COLLECTION`, 이유 코드와 회원 문구). 받을지는 E가 접수 기록과 대조해 정한다([1.2](#12-요청의-허용-범위를-적용하는-순서)) | `FAILED` |
| 자격정보 해석·대조 실패, 허용 자료 종류 없음(진행 알림 뒤, [#117][i117]) | 수집 없이 실패 하나를 담은 결과를 보낸다(`stage: COLLECTION`) | `FAILED` |
| 상한 초과·일부 호출 실패, 적합 후보 있음 | 모은 범위로 후보를 만들고 실패를 함께 담는다 | `PARTIAL_FAILED` |
| 상한 초과·수집 실패, 적합 후보 없음 | 실패만 담는다 | `FAILED` |
| 정상 수집, 등록 기준 미달 | 미제공 사유로 담고 실패에 넣지 않는다 | `EMPTY` |

- 429(호출 한도)·5xx를 만나면 **다시 부르지 않고** 그 항목을 수집 오류로 기록한다. GraphQL은 HTTP 200·403에 담긴 한도 오류도 같고, 연결 PR 묶음 조회는 그 묶음 전체를 쓰지 않는다. 적합 후보가 남아 있으면 `PARTIAL_FAILED`, 없으면 `FAILED`다.
- 거부 기록에는 **코드와 식별자만** 남긴다. 원문·토큰·요청 본문을 남기지 않는다. 이 규칙은 계약이 수신 확인 쪽에 이미 적용한 것과 같다([명세 W 메시지][c162]).
- 실패 코드는 `Failure.code`에 담는다. 이 칸은 계약이 자유 문자열로 열어 두었으므로 코드 이름을 정하는 것은 **계약 변경이 아니다**. 제안하는 이름은 아래와 같다.

  `CREDENTIAL_REFERENCE_UNRESOLVED` · `CREDENTIAL_EXPIRED` · `CREDENTIAL_SCOPE_MISMATCH` · `SCOPE_INCONSISTENT` · `NO_ALLOWED_RESOURCE_TYPE` · `REPOSITORY_UNREACHABLE` · `RATE_LIMITED` · `BUDGET_EXCEEDED` · `TIME_LIMIT_EXCEEDED`

  요청 정보 조회 모름·실패의 코드 7개와 회원 문구(10/15 팀장 결정)는 [요청 정보 조회 「이유 코드와 실패 문구」](../worker/docs/request-context.md#이유-코드와-실패-문구)에 있다.

- **요청 식별자를 읽을 수 없을 때 F가 보낼 메시지가 계약에 없다.** 계약의 worker 메시지는 요청·진행·결과·수신 확인 넷뿐이고, "요청을 거부했다"는 알림이 없다. 그래서 위 표 1·2행에서는 E가 아무 종결도 받지 못한다. 결과를 보내지 않는 3행도 같다. E의 처리 상태는 진행 알림(`ProcessingEvent`)을 받아야 바뀌고([명세 W 메시지][c150]), 종결 응답이 없다는 이유만으로 실행 불명(`UNCERTAIN`)으로 바뀌지 않는다([A/E 리뷰][rv166]). **이런 요청은 처리 시한(접수 후 60분)이 지나면 실패로 닫히고 회원이 다시 요청할 수 있다**([처리 시한 구현](../api/docs/analysis-deadline.md), [#237][i237]). 검토초안이 "실행 여부가 불확실한 작업의 상태와 운영자 처리 방법"으로 남긴 미결([검토초안 §6][arch6])에 [10/6 결정][d23]이 이렇게 답했다. **이번에 계약을 바꾸자고 제안하지 않는다** — 식별자를 읽을 수 없는 원인이 E의 접수 기록인지, 전송 중 손상인지, F의 해석인지를 F는 가릴 수 없고, 어느 경우든 F가 식별자를 지어 채울 수는 없다.

---

## 3. A→F 자격정보 인계

### 3.1 참조를 믿지 않는다는 뜻

계약은 이렇게 정해 두었다. "`credentialContextReference`는 A/F 계약에서 해석할 작업 맥락의 식별자이며 토큰/권한 자체가 아니다"([명세 W 메시지][c162]). 업무 규칙도 "자격정보 맥락 ID 자체를 권한으로 신뢰하지 않음"이다([worker 규칙 BR3.1][wr]).

실제로 지켜야 할 것은 셋이다.

1. **참조가 있다는 것만으로 수집을 시작하지 않는다.** 반드시 A에 물어봐 맥락을 받아 온다.
2. **참조를 토큰처럼 쓰지 않는다.** GitHub에 이 문자열을 보내지 않는다.
3. **A가 돌려준 맥락이 요청과 맞는지 F가 다시 확인한다.** A가 보증했다고 검사를 생략하지 않는다.

### 3.2 인계 내용 — A가 주는 것

내부 조회 [#232][i232]로 제공한다. 실제 응답·인증·오류 경계는 [API worker 컨텍스트](../api/docs/worker-context.md)와 [worker 요청 정보 조회](../worker/docs/request-context.md)를 따른다.

| 항목 | 왜 필요한가 |
|---|---|
| 회원 식별자 | 요청의 `memberId`와 대조하려고 |
| 저장소 좌표 — 소유자 로그인·이름·주소 | **요청에는 `repositoryId`밖에 없어서 F가 실제 GitHub 저장소를 특정할 수 없다.** 이 인계가 유일한 경로다 |
| 저장소 식별자 | 요청의 `repositoryId`와 대조하려고 |
| 허용 범위 판본 | 요청의 `allowedScope.revision`과 대조하려고. 회원 API의 `Repository.allowedScopeRevision`과 같은 값이다([공통 DTO][yc]) |
| 연동 계정의 GitHub 로그인·식별자 | **본인 기여를 가려내려면 필요하다.** 이 계정이 커밋 작성자로 기록된 커밋만 본인 기여로 귀속한다. PR을 연 것만으로는 기여로 보지 않는다([팀장 확인 (2026-10-08)](ai-dlc-input-mvp/2026-10-08_catch-decisions.md#본인-기여의-뜻)) |
| 접근 자격정보 | GitHub 호출에 쓸 값 |
| 만료 시각 | 수집 도중 만료를 피하려고 |

- **전달 경로**: F가 api의 내부 조회 지점에 worker 전용 인증키로 접속해 참조를 제시하고 맥락을 받는다. 검토초안이 "worker DB 차단, 전용 인증키" 방향을 이미 적었다([검토초안 §10][arch10]). 회원용 공개 API에 이 지점을 만들지 않는다.
- **권한은 최소로.** 대상은 **공개 저장소뿐**이므로([요구사항 FR1.1][r56]) 토큰은 비공개 자료 접근이 아니라 **호출 한도와 본인 확인**을 위한 것이다. 따라서 비공개 저장소 읽기 권한을 포함하지 않는 자격정보를 제안한다. 실제 GitHub 연동은 추가 권한(scope)을 요청하지 않는 OAuth App과 만료형 토큰으로 2026-10-14 명세에 정해졌다([명세 GitHub 연동 규칙][c1014gh]). 예외는 FR10 확인 명령(개발용 실행)만이며, 그 명령에는 당시 비공개였던 `JminAILab/CatchU`를 수집하는 예외를 뒀다([판정 「FR10 확인 명령」](../worker/docs/generation-judgement.md#fr10-확인-명령)).
- **수명은 GitHub가 정한 그대로.** A는 GitHub가 발급한 토큰의 만료 시각을 줄이거나 늘리지 않고 넘긴다([GitHub 연결 기능 문서][gc]). F는 그 시각이 지금부터 수집 시간 상한([2.3](#23-자원시간-상한))보다 늦을 때만 쓴다(3.3의 5번).
- **F는 참조도 자격정보도 저장하지 않는다.** 처리 중 메모리에만 두고, 로그·오류 메시지·결과 메시지·근거 어디에도 남기지 않는다.

### 3.3 F의 검사 순서와 거부

맥락은 처리의 맨 앞에서 요청 정보 조회 한 번으로 받는다([1.2](#12-요청의-허용-범위를-적용하는-순서)의 3번). 조회가 모름·실패면 이 검사까지 오지 않고 진행 알림 없이 실패 결과를 보낸다. 받은 맥락은 요청 대조(1.2의 4번)를 통과한 뒤 아래를 다시 거친다. 회원·저장소·판본은 같은 응답이 접수 기록이기도 해서 대조와 겹치고, 따로 걸리는 것은 만료와 선택 범위다. 아래를 **모두** 통과해야 첫 GitHub 호출을 한다. 하나라도 어긋나면 수집 없이 실패 결과를 보낸다([2.4](#24-상한을-넘거나-실패했을-때)).

| 순서 | 검사 | 어긋났을 때 제안 코드 |
|---|---|---|
| 1 | 참조가 해석되는가 | `CREDENTIAL_REFERENCE_UNRESOLVED` |
| 2 | 맥락의 회원 == 요청의 `memberId` | `CREDENTIAL_SCOPE_MISMATCH` |
| 3 | 맥락의 저장소 == 요청의 `repositoryId` == `allowedScope.repositoryId` | `CREDENTIAL_SCOPE_MISMATCH` |
| 4 | 맥락의 허용 범위 판본 == `allowedScope.revision` | `CREDENTIAL_SCOPE_MISMATCH` |
| 5 | 만료 시각 > 지금 + 수집 시간 상한 | `CREDENTIAL_EXPIRED` |

- **해석 실패는 다시 시도하지 않는다.** 알 수 없는 참조가 시간이 지나 유효해지지는 않는다. A가 일시적으로 응답하지 않는 경우(연결 오류·5xx)도 같다 — [2.3](#23-자원시간-상한)의 현행 계약에 따라 자동으로 다시 부르지 않고 실패 결과(`REQUEST_CONTEXT_UNAVAILABLE`)로 끝낸다.
- **수집 도중 만료**하면 진행 중인 호출을 멈추고 그때까지 모은 자료로 종결한다. 자격정보를 스스로 갱신하지 않는다.
- **범위 불일치는 좁은 쪽으로 맞추지 않는다.** 예를 들어 맥락이 저장소 X, 요청이 저장소 Y이면 X도 Y도 수집하지 않고 거부한다. 어느 쪽이 옳은지 F가 판단할 근거가 없기 때문이다.

### 3.4 인계 책임

| 책임 | 누가 |
|---|---|
| 참조 발급·수명 관리·폐기 | worker용 내부 조회 [#232][i232](10/6 팀장 배치) |
| 자격정보의 권한 최소화 | 실제 GitHub 연동 [#231][i231] |
| 참조로 맥락을 돌려주는 내부 조회 지점과 그 인증 | [#232][i232] |
| 맥락이 요청과 맞는지 다시 검사, 어긋나면 거부 | F(팀원 1) |
| 참조·자격정보를 저장·기록하지 않기 | F(팀원 1) |
| 나가는 방향 제한, 비밀값 주입 방법 | H(팀원 1), [#24][i24] |

**A가 보증하고 F가 확인할 수 없는 것**: 자격정보의 실제 권한 범위가 최소인지. F는 받은 값으로 호출할 뿐 그 권한을 조회할 수 없다. 따라서 이 부분은 A의 인계 책임으로 남긴다. A([#231][i231])는 연결할 때 받은 권한이 비었는지 확인한다([GitHub 연결 기능 문서][gc]). [#117][i117]의 실제 연결 검사에서 확인하는 "대상 저장소 밖 호출이 거부되는지"([#37][i37] C05)는 F의 별도 통제이며, 권한이 최소라는 증거로 쓰지 않는다.

[i24]: https://github.com/JminAILab/CatchU/issues/24
[i37]: https://github.com/JminAILab/CatchU/issues/37
[i113]: https://github.com/JminAILab/CatchU/issues/113
[i117]: https://github.com/JminAILab/CatchU/issues/117
[i119]: https://github.com/JminAILab/CatchU/issues/119
[i120]: https://github.com/JminAILab/CatchU/issues/120
[i121]: https://github.com/JminAILab/CatchU/issues/121
[i231]: https://github.com/JminAILab/CatchU/issues/231
[i232]: https://github.com/JminAILab/CatchU/issues/232
[i233]: https://github.com/JminAILab/CatchU/issues/233
[i237]: https://github.com/JminAILab/CatchU/issues/237
[d23]: https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296
[c78]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L66-L77
[rv166]: https://github.com/JminAILab/CatchU/pull/166#pullrequestreview-5349158273
[c150]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L153-L159
[c137]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L137
[r119]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L119
[c162]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L161-L165
[gc]: https://github.com/JminAILab/CatchU/blob/c0104009af94c554a013b814746c239c8fc04d9d/api/docs/github-connection.md#선택한-방식과-이번-수명-결정
[c1014gh]: https://github.com/JminAILab/CatchU/blob/c0104009af94c554a013b814746c239c8fc04d9d/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L64
[yw]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml
[yc]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml
[wr]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md
[r56]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L56
[r122]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L122
[cr]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/ideation/feasibility/constraint-register.md
[arch6]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/docs/ai-dlc-input-mvp/CatchU_%EA%B3%B5%ED%86%B5_%EC%95%84%ED%82%A4%ED%85%8D%EC%B2%98_%EA%B2%80%ED%86%A0%EC%B4%88%EC%95%88.md#6-%EB%B9%84%EB%8F%99%EA%B8%B0-%EC%9E%91%EC%97%85%EC%8B%A4%ED%8C%A8%EC%9E%AC%EC%9A%94%EC%B2%AD-%EA%B8%B0%EC%A4%80
[arch10]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/docs/ai-dlc-input-mvp/CatchU_%EA%B3%B5%ED%86%B5_%EC%95%84%ED%82%A4%ED%85%8D%EC%B2%98_%EA%B2%80%ED%86%A0%EC%B4%88%EC%95%88.md#10-%ED%9B%84%EC%86%8D-ai-dlc-%EC%84%A4%EA%B3%84%EC%97%90-%EB%84%98%EA%B8%B8-%EC%82%AC%ED%95%AD
