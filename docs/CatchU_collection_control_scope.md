# CatchU 수집 통제와 임시 자료 — 수집 범위·통제·자격정보 인계(1~3절)

> [수집 통제와 임시 자료](CatchU_수집통제_임시자료.md)의 절을 2026-10-02 [#203](https://github.com/JminAILab/CatchU/issues/203)에서 그대로 옮긴 파일이다. 지위와 적용 범위는 그 문서와 같고, 다른 절은 그 문서에서 찾는다. AI가 한 번에 읽을 수 있게 36 KB 미만으로 유지한다.

## 1. 무엇을 어떻게 가져오는가

### 1.1 수집 방식 — API만 쓴다

**결정(2026-09-29, 팀장)**: 10월 MVP는 GitHub REST API만 쓰고 저장소 복제(git clone)를 하지 않는다.

| 근거 | 내용 |
|---|---|
| 필요한 자료가 API로 다 나온다 | 허용 자료 종류는 커밋·PR·이슈 셋뿐이다([메시지 스키마 `allowedResourceTypes`][yw]). 셋 다 REST API로 조회할 수 있다 |
| 전체 diff 복구가 필수가 아니다 | 제약 등록부는 "전체 diff 복구를 필수화하지 않는다. 누락·잘림 탐지와 근거 범위 제한은 유지한다"고 했다([제약 등록부 「고정 제약」][cr]). 복제가 API보다 나은 거의 유일한 지점이 이것인데, 필수가 아니다 |
| **막아야 할 위험의 종류가 다르다** | API는 F가 요청한 것만 받는다. 복제는 저장소가 준 것을 worker 디스크에 풀어 놓고, 그 안의 hook·diff/textconv 드라이버·credential helper·로컬 config가 명령을 실행시킬 수 있다([제약 등록부 C04][cr]). **"부르지 않으면 됨"과 "실행되지 않게 막아야 함"은 확실성이 다르다.** 통제 개수가 느는 문제가 아니다 |
| 실제 환경에서 검사할 것이 적다 | [#37][i37]의 C05는 실제 자료를 처리하기 전에 통제를 **실제 환경에서** 검사하라고 요구한다. API만 쓰면 나가는 곳 한 군데를 확인하면 되고, 복제를 택하면 위 네 가지를 더 확인해야 한다. H 환경이 아직 없어 이 차이가 일정에 바로 걸린다 |
| 디스크에 남는 자료가 줄어든다 | 복제본은 요청마다 저장소 전체를 디스크에 쓴다. 정리 실패의 영향과 최소 접근 요구([요구사항 NFR7][r122])에 모두 불리하다 |

**이 결정으로 받아들이는 한계**: 큰 커밋의 변경 내용이 API 응답에서 잘릴 수 있다. 숨기는 한계가 아니라 근거의 `coverageLimits`에 적어 **드러내는** 한계다([명세 W 메시지][c162]). 실제 잘림 조건(파일 수·크기)은 [#117][i117]에서 확인해 상한과 함께 기록한다.

**되돌릴 수 있다**: 복제가 필요해지면 [1.3](#13-git-복제를-채택한다면-추가로-필요한-통제)의 통제를 본문으로 올리고 수집 모듈 옆에 붙인다. 지금 구조를 갈아엎는 변경이 아니므로 위험이 낮다.

**제약 등록부와의 관계**: 제약 등록부에는 "수집 방식은 미채택"이 남아 있다([제약 등록부 「고정 제약」][cr]). 승인 원본은 이 문서에서 고치지 않는다. 이번 결정은 10월 MVP의 F 구현 방식에 적용하며, 제약 등록부 반영 여부는 [#37][i37]에서 다룬다.

GraphQL API는 쓰지 않는다. 호출 수 계산 방식이 REST와 달라 상한을 따로 정해야 하고, 커밋·PR·이슈 조회만으로는 REST 대비 이점이 크지 않다. 필요해지면 [#117][i117]에서 근거와 함께 올린다.

### 1.2 요청의 허용 범위를 적용하는 순서

요청(`Request`)에는 저장소가 두 곳에 적힌다. 최상위 `repositoryId`와 `allowedScope.repositoryId`다. **둘이 같아야 하고, 자격정보 맥락이 가리키는 저장소와도 같아야 한다.** 하나라도 다르면 수집을 시작하지 않는다.

| 순서 | 검사 | 통과하지 못하면 |
|---|---|---|
| 1 | 세 식별자(`requestId`·`attemptId`·`messageId`)와 스키마 판본이 읽히는가 | 결과를 만들지 않고 거부 기록만 남긴다([2.4](#24-상한을-넘거나-실패했을-때)) |
| 2 | 요청의 저장소·허용 범위·시도가 E의 접수 기록과 같은가. `repositoryId`와 `allowedScope.repositoryId`가 서로 다른 경우도 여기서 걸린다 | **진행 알림도 결과도 보내지 않고** 거부 기록만 남긴다([#113][i113]에서 구현). E의 요청은 처리 시한에 실패로 닫힌다(계약 PR 뒤, [2.4](#24-상한을-넘거나-실패했을-때)) |
| 3 | `allowedResourceTypes`가 비어 있지 않은가 | 수집 없이 실패 결과. 빈 목록은 "아무것도 허용되지 않음"이며 정상 0건이 아니다 |
| 4 | 자격정보 맥락이 요청과 맞는가([3.3](#33-f의-검사-순서와-거부)) | 수집 없이 실패 결과 |
| 5 | 여기까지 통과해야 첫 GitHub 호출을 한다 | — |

- **자료 종류는 허용 목록이다.** `allowedResourceTypes`에 `COMMIT`만 있으면 PR·이슈 API를 부르지 않는다. 계약도 "전체 종류 열거가 수집 허가가 아님"이라고 못박았다([명세 W 메시지][c150]).
- **`selectionReference`는 A/E가 선정 목록을 확인했다는 표시**로 받아 근거에 기록한다. F가 선정 정책을 다시 판단하지 않는다.
- **`revision`은 허용 범위의 판본**이다. 자격정보 맥락이 알려 주는 판본과 다르면 범위 불일치로 거부한다([3.3](#33-f의-검사-순서와-거부)). 결과의 `scopeRevision`에는 요청에 실린 값을 그대로 돌려준다.
- 진행 알림(`ProcessingEvent`)은 1·2번을 모두 통과한 뒤에만 보낸다([#113][i113]에서 구현). 통과하지 못한 요청은 처리하지 않으므로 "받았다·실행 중"이라고 알리지 않는다.

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
| 주소 생성 | F가 저장소 좌표와 경로 틀로 직접 만든다. 응답 본문에 들어 있는 주소(`url`·`next` 등)를 그대로 부르지 않는다. 쪽 넘김이 필요하면 페이지 번호만 F가 올린다 |
| 우회 이동 | 자동 우회 이동(redirect)을 따라가지 않는다. 우회 응답은 오류로 처리한다 |
| 자료 안의 주소 | README·이슈 본문·커밋 메시지에 있는 주소는 **자료**다. 부르지 않고, 근거의 `sourceUrl`에도 쓰지 않는다 |
| 근거의 출처 주소 | `sourceUrl`은 F가 만든 GitHub 화면 주소만 쓴다. 저장소가 제공한 임의 주소를 옮기지 않는다 |
| 권한 | 대상 저장소 하나에만 접근한다. 응답에 다른 저장소가 딸려 와도 따라가지 않는다(예: fork 원본, 참조된 다른 저장소의 PR) |

### 2.2 외부 실행·네트워크 제한

**가져온 내용은 어떤 형태로도 실행하지 않는다.** 껍데기 명령·하위 프로세스·코드 평가·서식 치환·압축 해제를 하지 않는다. 수집 단계는 응답을 읽어 구조화하는 일만 한다.

**저장소 안의 지시문은 지시가 아니라 자료다.** README나 이슈 본문에 "앞의 지시를 무시하고 ~하라" 같은 문장이 있어도 F의 처리 순서를 바꾸지 않는다. 이 원칙은 생성 단계([#120][i120])로 넘길 때도 유지한다. 넘기는 자료에는 "이것은 수집한 자료"라는 표시를 붙이고, 생성 지시와 섞지 않는다.

**바깥으로 나가는 연결은 필요한 곳만 연다.**

| 대상 | 허용 |
|---|---|
| `api.github.com` | 수집 |
| 선정된 생성 서비스 | 초안·질문 생성([#119][i119]에서 선정 전에는 없음) |
| 내부 api·큐 | 요청 수신·결과 전달 |
| 그 밖의 모든 호스트 | 막는다 |

- **코드 쪽**: HTTP 클라이언트를 한 곳에 두고 호출 직전에 호스트를 확인한다. 목록 밖은 호출 자체를 하지 않는다. 담당은 [#117][i117]이다.
- **환경 쪽**: 배포 환경의 나가는 방향 제한은 H 범위이며 [#24][i24]에서 확인한다. 코드 검사만으로 환경 통제를 확인했다고 보고하지 않는다.

### 2.3 자원·시간 상한

**이 표의 상한 수치는 모두 제안이다.** 실제 값은 [#117][i117]·[#121][i121]에서 실측한 뒤 확정한다. 다만 맨 아래 재시도 항목은 제안이 아니라 **현행 계약을 그대로 따르는 것**이다.

| 항목 | 제안값 | 근거 |
|---|---|---|
| 동시 실행 분석 | 1건 | 검토초안이 "MVP는 전체 분석 동시 실행 1개로 시작"으로 정리했다([검토초안 §6][arch6]) |
| 요청당 GitHub 호출 수 | 300회 | GitHub 공개 문서 기준 인증 REST 호출 한도는 사용자당 시간당 5,000회다. 동시 1건이므로 여유가 크다. **한도 수치 자체는 [#117][i117]에서 실제 확인한다** |
| 커밋·PR·이슈 조회 개수 | 최근 커밋 500 · PR 100 · 이슈 100 | 위 호출 수 안에서 끝나도록 잡은 값. 잘린 범위는 근거의 `coverageLimits`에 남긴다 |
| 단일 호출 대기 | 연결 5초 · 응답 15초 | 제안 |
| 요청당 수집 시간 | 10분 | 제안. 넘으면 그때까지 모은 자료로 종결한다 |
| 요청당 총 처리 시간 | 20분(수집+후보+생성) | 제안. 멈춘 생성기 하나가 worker를 붙잡지 않게, 넘으면 결과 없이 끝낸다([2.4](#24-상한을-넘거나-실패했을-때), [#121][i121]). 검토초안이 "분석 시간 제한·대기 상한"을 후속 결정으로 남겼다([검토초안 §6][arch6]) |
| 단일 응답 크기 | 10MB | 제안. 넘으면 그 항목만 버리고 한계로 기록한다 |
| 요청당 수집 총량 | 50MB | 제안 |
| 수집 재시도 | **하지 않는다**(제안 아님) | 계약이 "정량 timeout/처리 상한은 기술 검증 후 이슈로 보완하며 자동 외부 재시도·추가 호출을 허용하지 않는다"고 했다([명세 공통 오류·요청 안전성][c137]). 429·5xx도 다시 부르지 않고 수집 오류로 기록한다 |

시계는 **처리 시작 시각 기준**으로 하나만 둔다. 개별 호출 대기가 짧아도 총 수집 시간이 넘으면 멈춘다. E가 요청을 닫는 처리 시한(접수 후 60분, 계약 PR 뒤 [#237][i237])은 이와 별개로 접수 시각 기준이며, 총 처리 시간보다 넉넉하게 잡았다([10/6 결정][d23]).

**'재시도'라는 말이 가리키는 것들을 섞지 않는다.** 계약과 팀장 결정이 각각 다르게 다룬다.

| 무엇 | 지금 기준 | 근거 |
|---|---|---|
| GitHub 조회 재시도 | **하지 않는다** | 자동 외부 재시도·추가 호출 금지([명세 공통 오류·요청 안전성][c137]) |
| 한 분석 안의 LLM 재호출 | **Catch 제목 형식 고쳐 쓰기만** 제목당 최대 3회(요청당 고쳐 쓰기 호출 상한과 위 표의 요청당 총 처리 시간 안, 상한 숫자는 [#120](https://github.com/JminAILab/CatchU/issues/120)). 요청당 상한에 이르면 그 뒤 제목은 null. 생성 호출·고쳐 쓰기 호출이 실패하면 다시 부르지 않는다 | 2026-10-09 팀장 결정([팀장 확인](ai-dlc-input-mvp/2026-10-08_catch-decisions.md#한-분석-안의-llm-재호출)). 계약의 재호출 문장을 고친 뒤 적용한다 |
| 분석 전체 재실행 | **하지 않는다** | "이번 계약은 자동 분석 재시도를 허용하지 않는다"([명세 전이·불변 조건][c78], [BR3.5][wr]). 큐도 같은 작업을 다시 주지 않게 한다(요청 작업 `attempts: 1`은 [#233][i233], 정체 복구 0회는 [#121][i121]) |
| 결과 재전달 | **하지 않는다** | 계약은 저장 결과 재전달을 분석 재호출과 따로 두었지만([명세 전이·불변 조건][c78]), [10/6 결정][d23]으로 결과를 보존하지 않아 다시 보낼 것이 없다. 거부된 결과는 기록만 남긴다([5.2](CatchU_collection_control_temp_data.md#52-재전달)) |

요구사항은 **자동 재시도 정책 자체를 미정**으로 두었다([요구사항 NFR4][r119]). 즉 **지금은 모두 금지이고, 제목 고쳐 쓰기만 계약 정정이 병합된 뒤 허용한다. 그 밖은 정책 수립이 열려 있는 상태**이지, 재시도가 허용된 것이 아니다. **이 문서는 그 밖의 자동 재시도를 새로 허용하지 않는다.** 더 열어야 한다고 판단되면 NFR4가 남긴 정책과 계약의 정량 상한 보완을 같은 이슈에서 함께 정한다.

### 2.4 상한을 넘거나 실패했을 때

핵심은 **멈춘 것을 정상 0건으로 바꾸지 않는 것**이다([worker 규칙 BR3.3][wr]).

| 상황 | F가 하는 일 | 결과 종결값 |
|---|---|---|
| 요청 식별자를 읽을 수 없음 | 아무것도 하지 않고 거부 기록만 남긴다. 식별자를 지어내지 않는다 | **결과를 보내지 않는다** |
| 요청이 E의 접수 기록과 다름(저장소·허용 범위·시도) | 진행 알림도 결과도 보내지 않고 거부 기록만 남긴다([#113][i113]) | **결과를 보내지 않는다** |
| 요청당 총 처리 시간 초과([2.3](#23-자원시간-상한)) | 결과 없이 그 작업을 끝내고 다음 작업을 받는다([#121][i121]) | **결과를 보내지 않는다** |
| 자격정보 해석·대조 실패, 허용 자료 종류 없음(진행 알림 뒤, [#117][i117]) | 수집 없이 실패 하나를 담은 결과를 보낸다(`stage: COLLECTION`) | `FAILED` |
| 상한 초과·일부 호출 실패, 적합 후보 있음 | 모은 범위로 후보를 만들고 실패를 함께 담는다 | `PARTIAL_FAILED` |
| 상한 초과·수집 실패, 적합 후보 없음 | 실패만 담는다 | `FAILED` |
| 정상 수집, 등록 기준 미달 | 미제공 사유로 담고 실패에 넣지 않는다 | `EMPTY` |

- 429(호출 한도)·5xx를 만나면 **다시 부르지 않고** 그 항목을 수집 오류로 기록한다. 적합 후보가 남아 있으면 `PARTIAL_FAILED`, 없으면 `FAILED`다.
- 거부 기록에는 **코드와 식별자만** 남긴다. 원문·토큰·요청 본문을 남기지 않는다. 이 규칙은 계약이 수신 확인 쪽에 이미 적용한 것과 같다([명세 W 메시지][c162]).
- 실패 코드는 `Failure.code`에 담는다. 이 칸은 계약이 자유 문자열로 열어 두었으므로 코드 이름을 정하는 것은 **계약 변경이 아니다**. 제안하는 이름은 아래와 같다.

  `CREDENTIAL_REFERENCE_UNRESOLVED` · `CREDENTIAL_EXPIRED` · `CREDENTIAL_SCOPE_MISMATCH` · `SCOPE_INCONSISTENT` · `NO_ALLOWED_RESOURCE_TYPE` · `REPOSITORY_UNREACHABLE` · `RATE_LIMITED` · `BUDGET_EXCEEDED` · `TIME_LIMIT_EXCEEDED`

- **요청 식별자를 읽을 수 없을 때 F가 보낼 메시지가 계약에 없다.** 계약의 worker 메시지는 요청·진행·결과·수신 확인 넷뿐이고, "요청을 거부했다"는 알림이 없다. 그래서 위 표 1·2행에서는 E가 아무 종결도 받지 못한다. 결과를 보내지 않는 3행도 같다. E의 처리 상태는 진행 알림(`ProcessingEvent`)을 받아야 바뀌고([명세 W 메시지][c150]), 종결 응답이 없다는 이유만으로 실행 불명(`UNCERTAIN`)으로 바뀌지 않는다([A/E 리뷰][rv166]). **이런 요청은 처리 시한(접수 후 60분)이 지나면 실패로 닫히고 회원이 다시 요청할 수 있다**(처리 시한 계약 PR 병합 뒤 적용, 구현 [#237][i237]). 검토초안이 "실행 여부가 불확실한 작업의 상태와 운영자 처리 방법"으로 남긴 미결([검토초안 §6][arch6])에 [10/6 결정][d23]이 이렇게 답했다. **이번에 계약을 바꾸자고 제안하지 않는다** — 식별자를 읽을 수 없는 원인이 E의 접수 기록인지, 전송 중 손상인지, F의 해석인지를 F는 가릴 수 없고, 어느 경우든 F가 식별자를 지어 채울 수는 없다.

---

## 3. A→F 자격정보 인계

### 3.1 참조를 믿지 않는다는 뜻

계약은 이렇게 정해 두었다. "`credentialContextReference`는 A/F 계약에서 해석할 작업 맥락의 식별자이며 토큰/권한 자체가 아니다"([명세 W 메시지][c162]). 업무 규칙도 "자격정보 맥락 ID 자체를 권한으로 신뢰하지 않음"이다([worker 규칙 BR3.1][wr]).

실제로 지켜야 할 것은 셋이다.

1. **참조가 있다는 것만으로 수집을 시작하지 않는다.** 반드시 A에 물어봐 맥락을 받아 온다.
2. **참조를 토큰처럼 쓰지 않는다.** GitHub에 이 문자열을 보내지 않는다.
3. **A가 돌려준 맥락이 요청과 맞는지 F가 다시 확인한다.** A가 보증했다고 검사를 생략하지 않는다.

### 3.2 인계 내용 — A가 주는 것

**제안**이다. A(팀원 2)와 맞춘 뒤 [#117][i117]·A의 실제 GitHub 연동 작업에서 확정한다.

| 항목 | 왜 필요한가 |
|---|---|
| 회원 식별자 | 요청의 `memberId`와 대조하려고 |
| 저장소 좌표 — 소유자 로그인·이름·주소 | **요청에는 `repositoryId`밖에 없어서 F가 실제 GitHub 저장소를 특정할 수 없다.** 이 인계가 유일한 경로다 |
| 저장소 식별자 | 요청의 `repositoryId`와 대조하려고 |
| 허용 범위 판본 | 요청의 `allowedScope.revision`과 대조하려고. 회원 API의 `Repository.allowedScopeRevision`과 같은 값이다([공통 DTO][yc]) |
| 연동 계정의 GitHub 로그인·식별자 | **본인 기여를 가려내려면 필요하다.** 이 계정이 커밋 작성자로 기록된 커밋만 본인 기여로 귀속한다. PR을 연 것만으로는 기여로 보지 않는다([팀장 확인 (2026-10-08)](ai-dlc-input-mvp/2026-10-08_catch-decisions.md#본인-기여의-뜻)) |
| 접근 자격정보 | GitHub 호출에 쓸 값 |
| 만료 시각 | 수집 도중 만료를 피하려고 |

- **전달 경로 제안**: F가 api의 내부 조회 지점에 worker 전용 인증키로 접속해 참조를 제시하고 맥락을 받는다. 검토초안이 "worker DB 차단, 전용 인증키" 방향을 이미 적었다([검토초안 §10][arch10]). 회원용 공개 API에 이 지점을 만들지 않는다.
- **권한은 최소로.** 대상은 **공개 저장소뿐**이므로([요구사항 FR1.1][r56]) 토큰은 비공개 자료 접근이 아니라 **호출 한도와 본인 확인**을 위한 것이다. 따라서 비공개 저장소 읽기 권한을 포함하지 않는 자격정보를 제안한다. 실제로 어떤 종류의 GitHub 연동을 쓰는지는 [명세 OQ-A1][c180]의 미결이며 A가 정한다.
- **수명은 짧게.** 한 번의 수집에 필요한 만큼만. 수집 시간 상한([2.3](#23-자원시간-상한))보다 넉넉해야 한다.
- **F는 참조도 자격정보도 저장하지 않는다.** 처리 중 메모리에만 두고, 로그·오류 메시지·결과 메시지·근거 어디에도 남기지 않는다.

### 3.3 F의 검사 순서와 거부

아래를 **모두** 통과해야 첫 GitHub 호출을 한다. 하나라도 어긋나면 수집 없이 실패 결과를 보낸다([2.4](#24-상한을-넘거나-실패했을-때)).

| 순서 | 검사 | 어긋났을 때 제안 코드 |
|---|---|---|
| 1 | 참조가 해석되는가 | `CREDENTIAL_REFERENCE_UNRESOLVED` |
| 2 | 맥락의 회원 == 요청의 `memberId` | `CREDENTIAL_SCOPE_MISMATCH` |
| 3 | 맥락의 저장소 == 요청의 `repositoryId` == `allowedScope.repositoryId` | `CREDENTIAL_SCOPE_MISMATCH` |
| 4 | 맥락의 허용 범위 판본 == `allowedScope.revision` | `CREDENTIAL_SCOPE_MISMATCH` |
| 5 | 만료 시각 > 지금 + 수집 시간 상한 | `CREDENTIAL_EXPIRED` |

- **해석 실패는 다시 시도하지 않는다.** 알 수 없는 참조가 시간이 지나 유효해지지는 않는다. A가 일시적으로 응답하지 않는 경우(연결 오류·5xx)도 같다 — [2.3](#23-자원시간-상한)의 현행 계약에 따라 자동으로 다시 부르지 않고 수집 오류로 기록한다.
- **수집 도중 만료**하면 진행 중인 호출을 멈추고 그때까지 모은 자료로 종결한다. 자격정보를 스스로 갱신하지 않는다.
- **범위 불일치는 좁은 쪽으로 맞추지 않는다.** 예를 들어 맥락이 저장소 X, 요청이 저장소 Y이면 X도 Y도 수집하지 않고 거부한다. 어느 쪽이 옳은지 F가 판단할 근거가 없기 때문이다.

### 3.4 인계 책임

| 책임 | 누가 |
|---|---|
| 참조 발급·수명 관리·폐기, 자격정보의 권한 최소화 | A(팀원 2) |
| 참조로 맥락을 돌려주는 내부 조회 지점과 그 인증 | A(팀원 2) |
| 맥락이 요청과 맞는지 다시 검사, 어긋나면 거부 | F(팀원 1) |
| 참조·자격정보를 저장·기록하지 않기 | F(팀원 1) |
| 나가는 방향 제한, 비밀값 주입 방법 | H(팀원 1), [#24][i24] |

**A가 보증하고 F가 확인할 수 없는 것**: 자격정보의 실제 권한 범위가 최소인지. F는 받은 값으로 호출할 뿐 그 권한을 조회할 수 없다. 따라서 이 부분은 A의 인계 책임으로 남기고, [#117][i117]의 실제 연결 검사에서 "대상 저장소 밖 호출이 거부되는지"를 실제 환경에서 확인해 간접으로 확인한다([#37][i37] C05).

[i24]: https://github.com/JminAILab/CatchU/issues/24
[i37]: https://github.com/JminAILab/CatchU/issues/37
[i113]: https://github.com/JminAILab/CatchU/issues/113
[i117]: https://github.com/JminAILab/CatchU/issues/117
[i119]: https://github.com/JminAILab/CatchU/issues/119
[i120]: https://github.com/JminAILab/CatchU/issues/120
[i121]: https://github.com/JminAILab/CatchU/issues/121
[i233]: https://github.com/JminAILab/CatchU/issues/233
[i237]: https://github.com/JminAILab/CatchU/issues/237
[d23]: https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296
[c78]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L66-L77
[rv166]: https://github.com/JminAILab/CatchU/pull/166#pullrequestreview-5349158273
[c150]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L153-L159
[c137]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L137
[r119]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L119
[c162]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L161-L165
[c180]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L180
[yw]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml
[yc]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml
[wr]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md
[r56]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L56
[r122]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L122
[cr]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/ideation/feasibility/constraint-register.md
[arch6]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/docs/ai-dlc-input-mvp/CatchU_%EA%B3%B5%ED%86%B5_%EC%95%84%ED%82%A4%ED%85%8D%EC%B2%98_%EA%B2%80%ED%86%A0%EC%B4%88%EC%95%88.md#6-%EB%B9%84%EB%8F%99%EA%B8%B0-%EC%9E%91%EC%97%85%EC%8B%A4%ED%8C%A8%EC%9E%AC%EC%9A%94%EC%B2%AD-%EA%B8%B0%EC%A4%80
[arch10]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/docs/ai-dlc-input-mvp/CatchU_%EA%B3%B5%ED%86%B5_%EC%95%84%ED%82%A4%ED%85%8D%EC%B2%98_%EA%B2%80%ED%86%A0%EC%B4%88%EC%95%88.md#10-%ED%9B%84%EC%86%8D-ai-dlc-%EC%84%A4%EA%B3%84%EC%97%90-%EB%84%98%EA%B8%B8-%EC%82%AC%ED%95%AD
