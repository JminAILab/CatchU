# CatchU 수집 통제와 임시 자료 — F 실제 연결 전 조건

> **지위: 제안** — 단 [수집 방식](CatchU_collection_control_scope.md#11-수집-방식--api만-쓴다)·[통제 실행 담당](CatchU_collection_control_checks.md#71-검토자가-없을-때)은 2026-09-29 팀장 결정이고, 결과를 보존하지 않는 것과 반영 전 장애를 앱에서 복구하지 않는 것은 2026-10-06 팀장 결정([#23][d23])이다. 인계 표의 본인 기여를 이 계정이 커밋 작성자로 기록된 커밋만으로 좁힌 것은 2026-10-08, 한 분석 안의 제목 형식 고쳐 쓰기 재호출(계약 정정 뒤 적용)은 2026-10-09 팀장 결정([팀장 확인](ai-dlc-input-mvp/2026-10-08_catch-decisions.md#한-분석-안의-llm-재호출))이다. 연결 PR 조회에 GraphQL 묶음 조회를 쓰는 것은 2026-10-10, 요청당 호출 수를 실제 HTTP 요청 수로 세는 것은 2026-10-12 팀장 결정이다([수집 방식](CatchU_collection_control_scope.md#11-수집-방식--api만-쓴다)). · 승인된 API 명세 v1·worker 기능 설계(`9093d2e`)에서 파생한 F 영역 설계다. 계약과 어긋나면 계약이 이기고 [#23][i23]에 올린다. 추적 이슈는 [#116][i116]이고, 제약 추적은 [#37][i37]의 C04·C05다.
>
> 이 문서를 병합해도 실제 GitHub 수집이 허용되는 것은 아니다. 허용 조건은 「[#37 조건 대조](#8-37-조건-대조--적용충족미확인)」에 있다.
>
> 2026-10-02 [#203](https://github.com/JminAILab/CatchU/issues/203)에서 AI가 잘리지 않고 읽게 절 단위로 나눴다(내용 변경 없음). 나눈 파일: [수집 범위·통제·자격정보 인계(1~3절)](CatchU_collection_control_scope.md) · [임시 자료와 전달(4~5절)](CatchU_collection_control_temp_data.md) · [검증 사례와 구현·검사 담당(6~7절)](CatchU_collection_control_checks.md). 옮긴 절의 제목과 새 위치는 제자리에 남겼다.

**정해진 것과 남은 것**

| 항목 | 상태 |
|---|---|
| 수집 방식 — GitHub API만 씀 | **결정**(2026-09-29). 연결 PR 조회는 GraphQL 묶음 조회(2026-10-10) |
| 본인 기여의 범위 — 이 계정이 커밋 작성자로 기록된 커밋만([3.2](CatchU_collection_control_scope.md#32-인계-내용--a가-주는-것)) | **결정**(2026-10-08) |
| 한 분석 안의 LLM 재호출 — 제목 형식 고쳐 쓰기만([2.3](CatchU_collection_control_scope.md#23-자원시간-상한)) | **결정**(2026-10-09). 계약 정정 뒤 적용 |
| 결과 보존과 저장 위치 | **두지 않는다** — 2026-10-06 결정([#23][d23]). worker는 결과를 보내면 끝이다 |
| 환경 통제의 실행 담당 — 팀원 1 | **결정**(2026-09-29) |
| 작성자 외 검토자 | **없음**. 대체 수단은 [7.1](CatchU_collection_control_checks.md#71-검토자가-없을-때), [#37][i37] C04 ②에 미충족으로 남김 |
| 자원·시간 상한 수치 | **제안**. [#117][i117]·[#121][i121] 실측 뒤 확정. 호출 수를 세는 법(실제 HTTP 요청 수)은 **결정**(2026-10-12), 호출 수 제안값은 [#267](https://github.com/JminAILab/CatchU/issues/267)에서 다시 냈다 |
| 자격정보 인계 방향 | **A 동의**([A/E 리뷰][rv166]). 토큰 꺼내기는 [#231][i231]에서 구현됐고, worker에 넘기는 내부 조회는 [#232][i232]라 아직 제공되지 않는다 |
| 반영 전 장애 복구 | **두지 않는다** — 2026-10-06 결정([#23][d23]). 결과를 받은 뒤 반영 전에 멈춘 요청은 접수 후 60분이 지나면 실패로 닫히고 회원이 다시 요청한다(처리 시한 계약 PR 병합 뒤 적용, 구현 [#237][i237]) |

결정된 항목은 다시 승인받을 항목이 아니다. 실행 담당 확정과 검토자 부재는 서로 다른 것이므로 묶어 읽지 않는다.

자료 수집·분석 결과 생성 영역(F)이 실제 GitHub 자료를 가져오기 전에 정해야 할 세 가지를 담는다. **무엇을 어디까지 가져오고 무엇을 막는가**, **회원의 GitHub 접근 권한을 A에서 F로 어떻게 넘기는가**, **F가 만든 임시 자료를 어디에 얼마나 두고 언제 지우는가**.

## 한눈에 보기

실제 연결 전에 지켜야 할 약속 10가지다. 자세한 조건은 괄호 안의 절에 있다.

1. 한 요청은 저장소 하나만 본다. 요청에 적힌 자료 종류(커밋·PR·이슈) 밖은 부르지 않는다([1.2](CatchU_collection_control_scope.md#12-요청의-허용-범위를-적용하는-순서)).
2. 주소는 F가 직접 만든다. 가져온 내용 안에 있는 주소는 자료일 뿐 따라가지 않는다([2.1](CatchU_collection_control_scope.md#21-주소권한-검사)).
3. 가져온 내용은 절대 실행하지 않는다. README·이슈 본문·커밋 메시지에 적힌 지시문도 자료로만 다룬다([2.2](CatchU_collection_control_scope.md#22-외부-실행네트워크-제한)).
4. 호출 수·시간·크기에 상한을 두고, 넘으면 멈춘다. 멈춘 것을 '0건'이나 '분석 실패'로 바꾸지 않는다([2.3](CatchU_collection_control_scope.md#23-자원시간-상한), [2.4](CatchU_collection_control_scope.md#24-상한을-넘거나-실패했을-때)).
5. 요청에 실린 자격정보 참조 문자열은 토큰도 권한도 아니다. F는 그것으로 A에 물어보고, 돌아온 맥락이 요청과 맞을 때만 수집을 시작한다([3.1](CatchU_collection_control_scope.md#31-참조를-믿지-않는다는-뜻), [3.3](CatchU_collection_control_scope.md#33-f의-검사-순서와-거부)).
6. 대상은 공개 저장소뿐이므로 토큰은 권한을 넓히려는 것이 아니라 호출 한도와 본인 확인을 위한 것이다. 권한은 최소로 받는다([3.2](CatchU_collection_control_scope.md#32-인계-내용--a가-주는-것)).
7. 가져온 원문과 중간 자료는 그 요청 처리가 끝나면 지운다([4.1](CatchU_collection_control_temp_data.md#41-두-종류), [4.2](CatchU_collection_control_temp_data.md#42-수명표)).
8. 두지 않는다 — 2026-10-06 결정([#23][d23]). 완성된 결과를 worker 밖에 보존하지 않고, 보내면 끝이다.
9. E가 '받았다'고 답한 것과 B가 '등록했다'는 것은 다르다. F는 등록 완료를 볼 수 없으므로 '받았다'를 등록 완료로 다루지 않는다([5.1](CatchU_collection_control_temp_data.md#51-세-단계), [5.3](CatchU_collection_control_temp_data.md#53-수신-후-반영-전-장애--지금-막히는-곳)).
10. 임시 자료를 지우지 못했더라도 결과 전달을 멈추지 않는다. 남은 임시 파일은 다음 worker 기동 때 지운다([4.3](CatchU_collection_control_temp_data.md#43-정리-실패프로세스-중단)).

## 읽는 법

- 용어
  - **허용 범위**: 요청에 실린 `allowedScope`. 저장소 하나와 자료 종류 목록, 선정 근거 참조, 판본으로 이뤄진다([메시지 스키마][yw]).
  - **자격정보 참조**: 요청의 `credentialContextReference`. A가 준비한 작업 맥락을 가리키는 문자열이며, 그 자체는 토큰이 아니다([명세 W][c162]).
  - **임시 입력**: 수집한 GitHub 응답 원문과 정규화 전 중간 자료, 생성 단계에 넣고 받은 원문.
  - **생성 결과**: E로 보내는 완성된 결과 메시지(`Result`). 후보·근거·초안·실패가 들어 있다.
  - **수신 확인**: E가 돌려주는 `ResultReceipt`. 형식과 맥락이 맞는지 확인한 기록이고 등록 완료가 아니다.
- 결정 상태 표기
  - **결정** — 팀장이 정했거나 승인된 계약에 있는 것. 정한 날짜를 함께 적는다.
  - **제안** — 이 문서가 근거와 함께 내놓는 안. **합의된 값이 아니다.** 확인 상대는 「[미결과 확인 상대](#9-미결과-확인-상대)」에 있다.
  - **미정** — 지금 정할 수 없고 막는 범위만 적는 것.
- 자원·시간 상한([2.3](CatchU_collection_control_scope.md#23-자원시간-상한))의 수치는 **제안**이다. 실제 값은 구현에서 실측한 뒤 [#117][i117]·[#121][i121]의 PR에서 확정하며, 그 전까지 합의된 상한으로 인용하지 않는다.
- 계약 필드·상태 의미·권한·DB 관계를 바꿔야 하는 항목은 「[계약을 바꿔야 하는 것과 아닌 것](CatchU_collection_control_checks.md#계약을-바꿔야-하는-것과-아닌-것)」에만 모았다. 나머지는 담당자가 정하는 내부 구현이다.

## 기준 판본

| 대상 | 고정 링크(`9093d2e`) |
|---|---|
| API 명세 v1 | [contract-summary.md][명세] · [worker-messages.yaml][yw] · [common.yaml][yc] |
| worker 기능 설계 | [functional-spec.md][wk] · [entities.md][we] · [rules.md][wr] |
| 요구사항·제약 | [requirements.md][rq] · [constraint-register.md][cr] |
| 연결 선행 조건 | [external-dependency-map.md][ed] |

참고한 검토용 입력: [공통 아키텍처 검토초안][arch]의 큐·결과 보존·비동기 실패 항목. 이 초안은 **검토용**이며 확정이 아니다.

---

## 1. 무엇을 어떻게 가져오는가

[수집 범위·통제·자격정보 인계(1~3절)](CatchU_collection_control_scope.md#1-무엇을-어떻게-가져오는가)에 있다. 하위 절: [1.1 수집 방식 — API만 쓴다](CatchU_collection_control_scope.md#11-수집-방식--api만-쓴다) · [1.2 요청의 허용 범위를 적용하는 순서](CatchU_collection_control_scope.md#12-요청의-허용-범위를-적용하는-순서) · [1.3 git 복제를 채택한다면 추가로 필요한 통제](CatchU_collection_control_scope.md#13-git-복제를-채택한다면-추가로-필요한-통제).

---

## 2. 수집할 때 막는 것

[수집 범위·통제·자격정보 인계(1~3절)](CatchU_collection_control_scope.md#2-수집할-때-막는-것)에 있다. 하위 절: [2.1 주소·권한 검사](CatchU_collection_control_scope.md#21-주소권한-검사) · [2.2 외부 실행·네트워크 제한](CatchU_collection_control_scope.md#22-외부-실행네트워크-제한) · [2.3 자원·시간 상한](CatchU_collection_control_scope.md#23-자원시간-상한) · [2.4 상한을 넘거나 실패했을 때](CatchU_collection_control_scope.md#24-상한을-넘거나-실패했을-때).

---

## 3. A→F 자격정보 인계

[수집 범위·통제·자격정보 인계(1~3절)](CatchU_collection_control_scope.md#3-af-자격정보-인계)에 있다. 하위 절: [3.1 참조를 믿지 않는다는 뜻](CatchU_collection_control_scope.md#31-참조를-믿지-않는다는-뜻) · [3.2 인계 내용 — A가 주는 것](CatchU_collection_control_scope.md#32-인계-내용--a가-주는-것) · [3.3 F의 검사 순서와 거부](CatchU_collection_control_scope.md#33-f의-검사-순서와-거부) · [3.4 인계 책임](CatchU_collection_control_scope.md#34-인계-책임).

---

## 4. 임시 자료의 위치·수명·삭제

[임시 자료와 전달(4~5절)](CatchU_collection_control_temp_data.md#4-임시-자료의-위치수명삭제)에 있다. 하위 절: [4.1 두 종류](CatchU_collection_control_temp_data.md#41-두-종류) · [4.2 수명표](CatchU_collection_control_temp_data.md#42-수명표) · [4.3 정리 실패·프로세스 중단](CatchU_collection_control_temp_data.md#43-정리-실패프로세스-중단).

---

## 5. 전달과 수신·등록의 구분

[임시 자료와 전달(4~5절)](CatchU_collection_control_temp_data.md#5-전달과-수신등록의-구분)에 있다. 하위 절: [5.1 세 단계](CatchU_collection_control_temp_data.md#51-세-단계) · [5.2 재전달](CatchU_collection_control_temp_data.md#52-재전달) · [5.3 수신 후 반영 전 장애 — 지금 막히는 곳](CatchU_collection_control_temp_data.md#53-수신-후-반영-전-장애--지금-막히는-곳).

---

## 6. 검증 사례

[검증 사례와 구현·검사 담당(6~7절)](CatchU_collection_control_checks.md#6-검증-사례)에 있다.

---

## 7. 누가 구현·검사하는가

[검증 사례와 구현·검사 담당(6~7절)](CatchU_collection_control_checks.md#7-누가-구현검사하는가)에 있다. 하위 절: [7.1 검토자가 없을 때](CatchU_collection_control_checks.md#71-검토자가-없을-때) · [계약을 바꿔야 하는 것과 아닌 것](CatchU_collection_control_checks.md#계약을-바꿔야-하는-것과-아닌-것).

---

## 8. #37 조건 대조 — 적용·충족·미확인

[#37][i37]이 C04에 남긴 항목 셋과 관련 조건을 대조한다.

| 조건 | 상태 | 남은 조치 |
|---|---|---|
| **C04 ①** 수집 구현 착수 전, 선택한 방식의 토큰·주소·응답 통제와 권한·송신·자원 상한·시간 제한·실패 정리를 설계와 검사 항목으로 연결 | **적용** — [1](CatchU_collection_control_scope.md#1-무엇을-어떻게-가져오는가)·[2](CatchU_collection_control_scope.md#2-수집할-때-막는-것)·[6](CatchU_collection_control_checks.md#6-검증-사례)이 설계와 검사 항목을 연결했다 | **충족 판정은 담당 확인 뒤.** 이 문서 병합만으로 C04 ①을 체크하지 않는다 |
| **C04 ②** 실행·검토 책임 확정, 남은 배정은 [#24][i24] | **부분 적용** — 실행은 [7](CatchU_collection_control_checks.md#7-누가-구현검사하는가)에서 팀원 1로 확정했다(2026-09-29) | **작성자 외 검토자가 없다.** 팀에 H 영역을 검토할 사람이 없어 [7.1](CatchU_collection_control_checks.md#71-검토자가-없을-때)의 대체 수단을 쓰고, 이 항목은 **미충족으로 남긴다.** 충족으로 바꾸지 않는다 |
| **C04 ③ = C05** 서비스 밖 저장소 자료 처리 전·시연 전에 실제 환경에서 통제 검사 | **미확인** | H 환경이 준비된 뒤 V-12(환경)와 V-01·V-11의 실제 확인이 필요하다. **합성 검사 통과는 이를 대신하지 않는다** |
| **C04 Git 조항** 복제 채택 시 hook·diff/textconv·helper·config 통제 | **해당 없음** — [1.1](CatchU_collection_control_scope.md#11-수집-방식--api만-쓴다)의 2026-09-29 결정으로 복제를 쓰지 않는다 | 복제를 채택하면 [1.3](CatchU_collection_control_scope.md#13-git-복제를-채택한다면-추가로-필요한-통제)을 넣고 다시 본다 |
| **C06** 서비스 생성 모델·이용 조건 | **미확인** — 이 문서 밖 | [#119][i119]. 생성 단계 실제 연결 전에 필요하다 |
| **C07** 동의·귀속·연결 | **적용** — 허용 범위 검사([1.2](CatchU_collection_control_scope.md#12-요청의-허용-범위를-적용하는-순서))와 본인 귀속에 필요한 GitHub 로그인 인계([3.2](CatchU_collection_control_scope.md#32-인계-내용--a가-주는-것))로 연결했다 | 실제 연동 방식은 [명세 OQ-A1][c180] |
| **과거 실험 자료 사용 금지** | **적용** — 이 문서는 승인 문서·계약·현재 코드만 읽고 썼다. 과거 실험 원문·발췌·응답을 열지 않았다 | 유지한다. [#117][i117]·[#121][i121]의 검사 입력도 합성 자료만 쓴다 |

**이 문서가 바꾸지 않는 것**: [#37][i37]의 기한과 조건, 실제 자료 처리 허용 여부. C04 ①의 설계를 제공할 뿐, 착수 허가는 담당 확인과 [#24][i24]의 배정 뒤에 판단한다.

---

## 9. 미결과 확인 상대

| # | 미결 | 확인 상대 | 막는 범위 |
|---|---|---|---|
| Q1 | 자격정보 인계의 내용·전달 경로([3.2](CatchU_collection_control_scope.md#32-인계-내용--a가-주는-것)). **저장소 좌표와 연동 계정 GitHub 로그인·식별자 포함에 A 동의**([A/E 리뷰][rv166]). 토큰 꺼내기는 [#231][i231]에서 구현됐고, worker에 넘기는 내부 조회는 [#232][i232]라 **아직 제공되지 않는다** | A yeongyeon1802 | [#117][i117] 실제 연결 |
| Q2 | 반영 전 장애 복구 — **결정으로 닫힘**. 두지 않는다(2026-10-06 [#23 결정][d23]). 결과를 받은 뒤 반영 전에 멈춘 요청은 접수 후 60분이 지나면 실패로 닫히고 회원이 다시 요청한다(처리 시한 계약 PR 병합 뒤 적용, 구현 [#237][i237]). 안 1(1-가·1-나)은 쓰지 않는다([5.3](CatchU_collection_control_temp_data.md#53-수신-후-반영-전-장애--지금-막히는-곳)) | E yeongyeon1802 | 막지 않음 |
| Q3 | E의 반영 복구 기간 — **결정으로 닫힘**. F가 결과를 보존하지 않고 E도 반영을 복구하지 않으므로 맞출 기간이 없다(2026-10-06 [#23 결정][d23]) | E yeongyeon1802 | 막지 않음 |
| Q4 | 재전달 시 `messageId`를 새로 발급하는 것 — **확인 완료**([A/E 리뷰][rv166]). 2026-10-06 결정으로 재전달을 두지 않아 지금은 적용할 곳이 없다 | E yeongyeon1802 | 막지 않음. 번호는 외부 댓글과 맞추려고 유지 |
| Q5 | 자원·시간 상한값([2.3](CatchU_collection_control_scope.md#23-자원시간-상한)) | F/H ljm0850 | 막지 않음. 제안값으로 시작하고 [#117][i117]·[#121][i121] 실측 뒤 확정. 호출 수를 세는 법은 2026-10-12에 정했다 |
| Q6 | 결과 저장 위치 — **결정으로 닫힘**. 결과를 보존하지 않으므로 저장 위치가 필요 없다(2026-10-06 [#23 결정][d23]) | H ljm0850, [#24][i24] | 막지 않음 |
| Q7 | 전송 방식과 그에 따른 재시도 설정 — **정함**. BullMQ로 개발한다([큐 기술 검증 「결론」](CatchU_큐_기술검증.md#결론)). 요청 작업은 `attempts: 1`(재시도 없음)·backoff 없음이고, 정체 복구는 0회(`maxStalledCount: 0`, 2026-10-06 결정)다 | [#77][i77] | 막지 않음. 실제 연결은 [#121][i121]·[#233][i233] |

**미정·제안·미검증을 확정이나 완료로 쓰지 않는다.** 자원·시간 상한은 **제안**, 실제 환경에서 검사하지 않은 통제는 **미검증**이다. 위 미결이 남은 동안 이 둘을 "확정된 상한", "검증된 통제"로 인용하지 않는다.

---

## 결정 이력

- **2026-09-29** — [#116][i116]으로 작성했다. 수집 방식은 API만 쓰는 안을 제안하고 복제 채택 시 필요한 통제를 따로 두었다. 자격정보 인계에 저장소 좌표와 연동 계정 로그인이 필요하다는 것, E가 결과 본문을 저장하지 않아 반영 전 장애에서 자료를 되찾을 수 없다는 것을 확인해 각각 A·E 확인 항목으로 올렸다. 작성 시점에는 수치를 모두 제안으로 적었다(결과 보존 14일은 아래 항목에서 결정됐고, 자원·시간 상한은 지금도 제안이다).
- **2026-09-29** — 팀장이 [수집 방식](CatchU_collection_control_scope.md#11-수집-방식--api만-쓴다)을 **API만 쓰는 것으로 결정**했다. 복제는 통제해야 할 것이 느는 문제가 아니라 "실행되지 않게 막아야 함"으로 위험의 종류가 바뀌고, [#37][i37] C05의 실제 환경 검사 부담도 늘기 때문이다. 큰 커밋의 변경 내용이 잘릴 수 있다는 한계는 근거의 `coverageLimits`로 드러내며 받아들인다. 제약 등록부의 "수집 방식은 미채택" 문구는 고치지 않았다.
- **2026-09-29** — 팀장이 [결과 보존 기간을 14일로 결정](CatchU_collection_control_temp_data.md#42-수명표)했다. 같은 검토에서 기존 근거였던 "E의 반영 실패 복구"가 [5.3](CatchU_collection_control_temp_data.md#53-수신-후-반영-전-장애--지금-막히는-곳)과 어긋난다는 것을 확인해 바로잡았다 — 그 구간은 F가 도울 수 없고, 보존이 실제로 쓰이는 것은 전달 실패·재기동·E 미수신이다. E 복구 기간과의 관계는 E가 안 2를 고를 때만 생기므로 미결 Q3을 막는 항목에서 확인 항목으로 낮췄다. 저장 위치는 그대로 미정이다.
- **2026-09-29** — 팀장이 나가는 방향 제한·결과 저장소 준비의 **실행을 팀원 1(H)로 확정**했다. 팀에 H 영역을 검토할 사람이 없다는 사실을 확인해, 검토자 칸을 채우는 대신 [7.1](CatchU_collection_control_checks.md#71-검토자가-없을-때)의 대체 수단(자동 검사·재현 가능한 증거)을 두고 "작성자 외 검토 없음"을 미충족으로 남겼다. 결과 저장 위치는 여전히 미정이다.
- **2026-09-29** — 후속 담당자가 쓸 수 있게 세 곳을 보완했다. ① 자동 재시도를 **현행 계약에 맞췄다** — GitHub 조회 재시도 제안(429·5xx 2회)을 뺐다. 계약이 자동 외부 재시도·추가 호출을 허용하지 않고([명세][c137]) 요구사항이 정책 자체를 미정으로 뒀기 때문이다([NFR4][r119]). 조회 재시도·분석 재실행·결과 재전달을 구분하는 표를 [2.3](CatchU_collection_control_scope.md#23-자원시간-상한)에 넣었고, 재전달은 계약이 분리해 둔 것이라 유지했다. ② [5.3](CatchU_collection_control_temp_data.md#53-수신-후-반영-전-장애--지금-막히는-곳)의 **안 2가 단독 해결책이 아님**을 명시했다 — F는 수신 확인을 받으면 재전달을 멈춰 다시 보낼 계기가 없다. 안 1을 권고안으로 두고 조건표·V-21·Q2·담당표를 맞췄다. ③ 결정된 세 건의 낡은 표현을 정리했다. 자동 재시도 허용을 새로 결정하거나 승인 계약을 고치지 않았다.
- **2026-09-29** — 이전 문구를 정리했다. 편집 중 첫 항목의 뒷문장이 마지막 항목 끝에 붙어 결과 보존 기간까지 제안으로 읽히던 것을 제자리로 돌리고, 항목 순서를 결정 순으로 바로잡았다. 9절 안내와 문서 머리·2.3의 '수치는 모두 제안' 표현을 자원·시간 상한으로 한정했다. 새 결정이나 설계는 없다.
- **2026-09-29** — A/E 담당 리뷰를 반영했다(문서·계약·E 수신 코드 대조 기준이며 실제 연동·복구 실행 검증은 아니다). §3.2 인계 방향과 §5.2 `messageId` 발급에 동의를 받아 Q1·Q4와 완료 기준 3을 갱신했다(Q1 제공은 [#133][i133] 후속). §2.4에서 종결 응답이 없으면 E가 실행 불명으로 바뀐다고 쓴 것을 **기존 상태 유지**로 바로잡고, 식별 불가를 E 접수 정본 오류로 단정한 문장을 고쳤다. §5.3의 안 1을 결과 본문 저장(1-가)과 영속 참조 저장(1-나)으로 나누고, 미등록 F 결과의 서비스 DB 저장 경계 때문에 "계약 변경 아님"을 **판단 전**으로 바꿨다. 재전달 때 `finishedAt`을 포함한 내용을 그대로 둔다는 조건을 §5.2·V-16에 넣었다. §2.4와 같은 전제(응답이 없으면 E가 실행 불명이 된다)가 남아 있던 [4.3](CatchU_collection_control_temp_data.md#43-정리-실패프로세스-중단)의 두 곳과 V-20도 기존 상태 유지로 맞췄다.
- **2026-09-29** — A/E 재검토를 반영해 [4.2](CatchU_collection_control_temp_data.md#42-수명표)의 「E 복구 기간과의 관계」를 조건표 4행·Q3과 맞췄다. 1-나로 F 보관 결과를 참조해 복구하는 경우에도 F 보존 기간이 E 복구 기간을 포함해야 하므로 「안 2를 고를 때만」「안 1이면 관계없다」를 고쳤다. 관계가 없는 것은 E가 본문을 직접 저장하는 1-가뿐이다. 앞선 보존 14일 결정 항목의 「안 2를 고를 때만」은 그날의 기록이라 그대로 둔다.
- **2026-09-30** — 먼저 병합된 [#113][i113]([PR #177][p177])의 요청 검사 동작에 맞췄다. 요청이 E의 접수 기록과 다르면(두 저장소 값 불일치 포함) 진행 알림도 결과도 보내지 않고 거부하며, 진행 알림은 형식·접수 기록 대조를 모두 통과한 뒤에 보낸다. [1.2](CatchU_collection_control_scope.md#12-요청의-허용-범위를-적용하는-순서) 표 2행·[2.4](CatchU_collection_control_scope.md#24-상한을-넘거나-실패했을-때) 표·V-02가 이 경우를 "실패 결과를 보낸다"로 적고 있던 것을 고쳤다. 자격정보 해석·대조 실패는 [#113][i113]이 형식만 보고 [#117][i117]로 넘겼으므로 진행 알림 뒤 `FAILED` 결과 그대로다. 새 결정이 아니라 병합된 동작에 문서를 맞춘 것이다.
- **2026-10-02** — 문서가 72 KB로 커져 AI가 한 번에 열면 가운데가 잘리므로 1~7절을 세 파일로 옮겼다([#203](https://github.com/JminAILab/CatchU/issues/203)). 내용은 바꾸지 않았다. 옮긴 절 자리에는 제목과 새 위치를 남겼고, 문서 안 앵커 링크는 옮긴 파일을 가리키게 고쳤다. 새 결정이나 설계는 없다.
- **2026-10-06** — 팀장 결정([#23][d23])에 맞춰 고쳤다. 서버·worker·큐가 끊기는 장애는 앱에서 복구하지 않고, 끝나지 않은 요청은 접수 후 60분 처리 시한에 실패로 닫아 회원이 다시 요청하게 한다(처리 시한 계약 PR 병합 뒤 적용, 구현 [#237][i237]). 그래서 2026-09-29의 결과 보존 14일 결정을 철회했고, 결과 저장 위치와 결과 저장소 준비도 필요 없어졌다. 바꾼 곳: 머리의 결정 목록과 「정해진 것과 남은 것」 표, 약속 8(두지 않음)과 7·9·10의 재전달·주기 청소 전제, 미결 Q2·Q3·Q6(결정으로 닫힘)·Q4(적용할 곳 없음)·Q7(`attempts: 1`, 재시도 없음). 나눈 파일에는 결정 이력이 없어 여기에 함께 적는다. [4.2](CatchU_collection_control_temp_data.md#42-수명표)는 결과를 보존하지 않는 것으로 바꾸고 14일 결정은 결정 변경 기록으로 남겼다. [4.3](CatchU_collection_control_temp_data.md#43-정리-실패프로세스-중단)은 주기 청소를 빼고 기동 때 청소와 받아들인 위험을 적었다. [5.2](CatchU_collection_control_temp_data.md#52-재전달)는 재전달하지 않는 것으로, [5.3](CatchU_collection_control_temp_data.md#53-수신-후-반영-전-장애--지금-막히는-곳)은 안 1-가·1-나·안 2 대신 처리 시한 닫기로 바꿨다. [2.3](CatchU_collection_control_scope.md#23-자원시간-상한)·[2.4](CatchU_collection_control_scope.md#24-상한을-넘거나-실패했을-때)에는 요청당 총 처리 시간 초과 처리와 결과 재전달을 하지 않는다는 것을 적었다. 6~7절은 V-15·V-23과 #77 요구 3·4를 "두지 않는다"로, V-16~V-21과 담당표·계약 변경 표를 새 동작으로 바꿨고, 배포 대상을 AWS(큐 서비스 미정)로 적었다([레포 컨벤션 §1](CatchU_레포_컨벤션.md#1-레포-구조)). 약속과 미결 번호는 이슈가 인용하므로 유지했다.
- **2026-10-09** — 팀장 결정([팀장 확인](ai-dlc-input-mvp/2026-10-08_catch-decisions.md#한-분석-안의-llm-재호출))에 맞춰 [2.3](CatchU_collection_control_scope.md#23-자원시간-상한)의 재시도 구분 표에 「한 분석 안의 LLM 재호출」 줄을 더하고 「분석·LLM 재실행」을 「분석 전체 재실행」으로 고쳤다. Catch 제목 형식 고쳐 쓰기만 제목당 최대 3회 허용하며, 계약의 재호출 문장을 고친 뒤 적용한다. GitHub 조회 재시도·분석 전체 재실행·결과 재전달은 그대로 하지 않는다. 같은 PR([#260](https://github.com/JminAILab/CatchU/pull/260))에서 [3.2](CatchU_collection_control_scope.md#32-인계-내용--a가-주는-것) 인계 표의 본인 기여를 이 계정이 커밋 작성자로 기록된 커밋만으로 좁혔다(2026-10-08 팀장 확인).
- **2026-10-12** — [#267](https://github.com/JminAILab/CatchU/issues/267)에서 두 팀장 결정에 맞춰 고쳤다. ① 2026-10-10: 연결 PR 조회를 GraphQL 묶음 조회(커밋 100개당 요청 1회)로 바꾸고 상한 재검토를 #121 실측 전에 한다([입력 문서 변경 기록](ai-dlc-input-mvp/2026-10-08_catch-decisions.md#변경-기록)). ② 2026-10-12: 요청당 호출 상한은 실제 HTTP 요청 수로 센다. REST 요청 1회와 GraphQL 묶음 요청 1회를 각각 1회로 더하고 GraphQL 점수는 따로 기록한다. ②는 이 항목과 [1.1](CatchU_collection_control_scope.md#11-수집-방식--api만-쓴다)이 처음 기록이다. 대체한 것: 2026-09-29 수집 방식 결정의 "REST API만 쓴다"와 1.1의 "GraphQL API는 쓰지 않는다" 문단(그 이유였던 호출 수 계산 문제는 ②로, REST 대비 이점이 크지 않다는 판단은 #118의 연결 PR 조회로 바뀌었다). 저장소를 복제하지 않는 결정은 그대로다. 바꾼 곳: [1.1](CatchU_collection_control_scope.md#11-수집-방식--api만-쓴다), [2.1](CatchU_collection_control_scope.md#21-주소권한-검사)의 주소 생성·자료 안의 주소·권한, [2.3](CatchU_collection_control_scope.md#23-자원시간-상한)의 호출 수(300회 유지 제안과 근거·세는 법·자격정보 전제·다시 볼 조건)·단일 응답 크기·재시도, [2.4](CatchU_collection_control_scope.md#24-상한을-넘거나-실패했을-때)의 한도 오류 한 문장, 이 문서의 머리 결정 목록·「정해진 것과 남은 것」·Q5. 호출 수 값은 여전히 제안이다. 2026-09-29 결정 항목은 그날의 기록이라 고치지 않았다.
- **2026-10-15** — [#121](https://github.com/JminAILab/CatchU/issues/121) 큐 연결 기본 틀에서 [4.2](CatchU_collection_control_temp_data.md#42-수명표) 수명표에 「보낸 결과(큐의 결과 작업)」 줄을 더했다. 결과 작업은 E가 처리하고 worker가 수신 확인을 읽을 때까지 큐에 남고, 읽으면 지운다. 큐 보관 정리(30분)는 같은 큐의 다른 작업이 끝날 때만 돌아 시간 상한이 아니므로, 그것만 기다리면 회원 결과 본문이 큐에 오래 남을 수 있어서다. 5분 조회 안에 못 읽은 결과와 E가 처리하지 않은 결과는 남을 수 있다는 한계를 함께 적었다. 결과를 보존하지 않는다는 2026-10-06 결정은 그대로다.

[i23]: https://github.com/JminAILab/CatchU/issues/23
[d23]: https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296
[i24]: https://github.com/JminAILab/CatchU/issues/24
[i37]: https://github.com/JminAILab/CatchU/issues/37
[i77]: https://github.com/JminAILab/CatchU/issues/77
[i113]: https://github.com/JminAILab/CatchU/issues/113
[p177]: https://github.com/JminAILab/CatchU/pull/177
[i116]: https://github.com/JminAILab/CatchU/issues/116
[i117]: https://github.com/JminAILab/CatchU/issues/117
[i119]: https://github.com/JminAILab/CatchU/issues/119
[i121]: https://github.com/JminAILab/CatchU/issues/121
[i133]: https://github.com/JminAILab/CatchU/issues/133
[i231]: https://github.com/JminAILab/CatchU/issues/231
[i232]: https://github.com/JminAILab/CatchU/issues/232
[i233]: https://github.com/JminAILab/CatchU/issues/233
[i237]: https://github.com/JminAILab/CatchU/issues/237
[명세]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md
[rv166]: https://github.com/JminAILab/CatchU/pull/166#pullrequestreview-5349158273
[c137]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L137
[r119]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md#L119
[c162]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L161-L165
[c180]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#L180
[yw]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml
[yc]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/common.yaml
[wk]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/functional-spec.md
[we]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/entities.md
[wr]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u3-worker/functional-design/rules.md
[rq]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md
[cr]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/ideation/feasibility/constraint-register.md
[ed]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/delivery-planning/external-dependency-map.md
[arch]: https://github.com/JminAILab/CatchU/blob/9093d2e452dbcdcd746265758abc9e7f41ff9527/docs/ai-dlc-input-mvp/CatchU_%EA%B3%B5%ED%86%B5_%EC%95%84%ED%82%A4%ED%85%8D%EC%B2%98_%EA%B2%80%ED%86%A0%EC%B4%88%EC%95%88.md
