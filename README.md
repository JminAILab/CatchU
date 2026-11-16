# CatchU (캐치유)

CatchU는 개발자 지원자의 GitHub 작업을 분석해 **Catch**를 만들고, 지원자가 고른 Catch를 면접관에게 보내게 하는 서비스다.

Catch는 지원자가 분석된 작업 가운데 골라 면접관에게 보내는 한 장이다. 그 작업에서 내린 판단을 지원자가 자기 말로 적고, 면접관이 그 말을 시험해 볼 코드 자리와 GitHub 원본이 함께 붙는다. Catch는 판단을 증명하지 않는다. 판단은 면접에서 확인한다.

## 지금 CatchU

기준일: 2026-11-15

개발 서버 확인은 2026-11-09 판 기준이고, 그 뒤 병합된 것은 확인 기록이 없다. 「기록 없음」은 확인하지 않았다는 뜻이다. 개발 서버 확인의 근거는 [12월 통합 확인 표](docs/CatchU_통합확인.md)의 2026-11-09 1차 기록이다.

| 하는 일 | 들어 있는 기능 | `dev` | 개발 서버 확인 |
|---|---|---|---|
| 가입과 GitHub 연결 | 첫 소개 화면, Google 로그인과 가입, 홈과 시작 안내, 프로필, GitHub 계정 연결, 탈퇴 | 병합됨 | 확인됨(2026-11-09): 탈퇴 뒤 링크 막힘·로그아웃·자료 삭제, 같은 Google 계정으로 다시 가입 · 미실행(팀원 아닌 Google 계정 로그인은 '프로덕션' 게시 전이라 미룸, 탈퇴 전 토큰 거부는 브라우저로만 확인) · GitHub 계정 연결은 기록 없음 |
| 저장소 등록과 분석 | 저장소 등록, 분석 고지와 동의, 분석 요청, 하루 실행 횟수 | 병합됨 | 미실행(개발 서버에 작업 큐를 연결하지 않음) |
| Catch 확인과 작성자 설명 | 내 Catch 목록·상세, 작업 사실·나의 기여 확인, 작성자 설명 | 병합됨 | 기록 없음 |
| 발행 | 텍스트·PDF 자료 올리기, Catch와 자료를 골라 발행본 만들기, 링크 중지·삭제 | 병합됨 | 확인됨(2026-11-09): 텍스트 자료로 발행, 다른 회원의 발행본·자료가 보이지 않음, 중지한 링크가 열리지 않음 · PDF 자료는 기록 없음 |
| Catch를 받는 면접관 화면 | 발행본 링크 화면, AI 기본 요약·질의응답, JD 관리·요약(면접관이 JD를 등록하고 받은 링크에서 JD 기준 요약을 받음), 받은 링크를 Claude로 분석하기 | 병합됨 | 확인됨(2026-11-09): 로그인하지 않은 창에서 발행본 열람 · 미실행(AI 기본 요약·질의응답은 작업 큐 미연결, JD 요약과 받은 링크의 Claude 분석은 그때 통합 전) |
| Claude 연결 | 회원 본인의 Claude에 CatchU 도구 연결. 지원자는 자기 Catch·자료를 읽고, 면접관은 받은 링크를 분석하는 데 쓴다 | 병합됨 | 확인됨(2026-11-09): Claude 웹 연결·해제, Claude Desktop 연결 · 미실행(연결 만료 뒤 재승인은 토큰 수명을 줄여 다시 띄워야 해서 하지 않음) |

실제 저장소 분석은 개발 서버가 아니라 로컬 환경에서 확인했다([#450](https://github.com/JminAILab/CatchU/issues/450), 2026-11-14).

무엇을 기준으로 만들었는지는 AI-DLC로 승인한 요구사항에 있다. 승인 원본은 고치지 않고, 뒤에 승인한 요구사항이 앞의 것을 바꾼 곳을 적어 둔다.

1. [첫 intent 요구사항](aidlc/spaces/default/intents/260909-catchu-definition-review/inception/requirements-analysis/requirements.md)(2026-09-11): 처음 제품 정의
2. [10월 MVP 요구사항](aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/requirements-analysis/requirements.md): 10월 내부 중간 목표
3. [12월 요구사항](aidlc/spaces/default/intents/260925-intent-12/inception/requirements-analysis/requirements.md)(2026-09-28 승인, 10-24 재승인): 위 기능 대부분의 기준
4. [Catch 개편 요구사항](aidlc/spaces/default/intents/261103-catch-redesign/inception/requirements-analysis/requirements.md)(2026-11-03): 같은 작업의 중복 Catch 막기, Catch 제목·작업 사실·설명 초안. 12월 요구사항에서 바꾼 곳은 그 문서 「대체하는 기준」에 있다
5. [새 Catch 요구사항](aidlc/spaces/default/intents/261109-new-catch/inception/requirements-analysis/requirements.md)(2026-11-09): 위 Catch 정의와 작성자 설명·발행·면접관 화면. 앞의 요구사항에서 바꾼 곳은 그 문서 「다시 여는 결정」에 있다

## 내 컴퓨터에서 띄우기

PostgreSQL·api·worker·web을 한 컴퓨터에서 켜는 순서, 정상 확인, 끄는 법은 [로컬 통합 실행](docs/CatchU_로컬통합실행.md)에 있다. 이 순서는 합성 자료까지 띄운다. 실제 GitHub 저장소를 분석해 Catch를 만들어 보려면 같은 문서의 [실제 분석까지 띄우기](docs/CatchU_로컬통합실행.md#실제-분석까지-띄우기)를 따른다(외부 서비스 키가 필요하다). 각 서비스의 설치·검사는 [web](web/README.md)·[api](api/README.md)·[worker](worker/README.md) README에 있다.

## 구조

| 디렉터리 | 역할 | 스택 |
|---|---|---|
| [`web/`](web) | 사용자 화면 | Next.js |
| [`api/`](api) | API 서버 | NestJS |
| [`worker/`](worker) | 분석 워커 — GitHub 기록 수집과 Catch 초안 만들기 | Python 큐 소비자(상태 확인만 FastAPI) |
| [`docs/`](docs) | 문서 정본 | — |
| [`docs/ai-dlc-input/`](docs/ai-dlc-input) | AI-DLC 시작 시점(2026-09-09) 입력 문서 스냅샷 | — |
| [`docs/ai-dlc-input-mvp/`](docs/ai-dlc-input-mvp) | 두 번째 intent(10월 MVP) 입력 — 팀장 결정·제안 (2026-09-13) | — |
| [`docs/ai-dlc-input-december/`](docs/ai-dlc-input-december) | 12월 intent 입력 — 12월 범위 보완과 재승인 입력 | — |
| [`docs/ai-dlc-input-catch/`](docs/ai-dlc-input-catch) | Catch 개편·새 Catch intent 입력 | — |
| [`docs/ai-dlc-input-reorg/`](docs/ai-dlc-input-reorg) | 문서 개편 intent 입력 | — |
| [`docs/ai-dlc/`](docs/ai-dlc) | AI-DLC 설치·운영 안내 | — |
| [`aidlc/`](aidlc) | AI-DLC 워크플로우 기록 — 단계별 질문·답변, 승인된 산출물, 감사 로그, memory | — |
| `.codex/` `.agents/` | AI-DLC 하네스(Codex hook·도구·스킬·규칙). `aidlc config`로 관리하며 팀 수정분은 커밋 이력에 기록 | — |
| `.claude/` | AI-DLC 하네스(Claude Code hook·도구·스킬·규칙). 관리 방식은 `.codex/`와 같다 | — |

`web/`·`api/`·`worker/`는 **배포 단위**와 1:1로 대응한다. 입력 폴더(`docs/ai-dlc-input*`)는 각 intent를 시작할 때 넣은 자료이며 지금 기준이 아니다. `aidlc/`·`.codex/`·`.agents/`·`.claude/`는 배포 단위가 아니라 AI-DLC 작업 기록과 도구다.

## 기술 구성과 배포

web은 Next.js, api는 NestJS, worker는 FastAPI(Python)로 정했다(2026-09-13 확정). 실제 쓰임은 이렇다. web은 화면만 그리고 브라우저가 api를 직접 부른다(Next.js의 서버 쪽 기능은 쓰지 않는다). worker는 큐에서 분석 요청을 꺼내 처리하는 Python 프로그램이고, FastAPI로는 상태 확인 경로 하나만 연다. api와 worker 사이의 큐는 BullMQ이고 큐 서버는 Redis와 통신 규약이 같은 Valkey다. 배포 대상은 AWS다(2026-10-06 NCP에서 변경, 레포 컨벤션 §1 결정 이력 참조). 지금은 개발 서버(EC2)에 올리고, 12월 최종 환경인 EKS는 예정이다.

## AI-DLC로 만든 방식

이 저장소는 AI-DLC(AI-Driven Development Life Cycle) 방식으로 만들었다. 의도 정리부터 요구사항·설계·코드 생성까지 단계마다 팀장이나 담당 팀원이 승인했고, 단계별 질문·답·승인 기록을 [`aidlc/`](aidlc)에 남겼다.

## 문서

팀 문서 정본은 [`docs/`](docs)에 있다. 문서 목록과 읽는 순서는 [`docs/README.md`](docs/README.md).
AI-DLC로 검토·승인한 요구사항·설계와 그 기록은 [`aidlc/`](aidlc) 아래 intent 폴더에 있다. `docs/`와 AI-DLC 산출물의 관계는 [`docs/README.md`](docs/README.md)의 「AI-DLC 산출물과의 관계」를 따른다.

## 팀

| GitHub | 맡은 영역 |
|---|---|
| [`ljm0850`](https://github.com/ljm0850) (팀장) | 분석 worker(GitHub 기록 수집·근거·Catch 초안), AI 생성 관문, 발행본 색인·검색과 AI 기본 요약·질의응답, Catch 개편·새 Catch, AWS 배포·CI, 계약 조율·통합 |
| [`yeongyeon1802`](https://github.com/yeongyeon1802) | 회원·프로필·GitHub 연결, 분석 요청 상태, Claude 연결(지원자 본인·받은 링크) |
| [`csyg0616`](https://github.com/csyg0616) | 공유 링크·받은 사람 화면, 홈·분석 화면, 발행·링크, PDF 자료 |
| [`leechaeah`](https://github.com/leechaeah) | Catch 확인·공개, 저장소 등록·분석 요청, JD 관리·요약 |

재민아이(JAEMIN_AI) · 인공지능사관학교 파이널 프로젝트 (2026-08 ~ 12)
