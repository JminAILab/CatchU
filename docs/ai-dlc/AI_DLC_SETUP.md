# CatchU — Codex로 AI-DLC 시작하기

작성일: 2026-09-09

> 이동 안내(2026-09-11): 이 문서는 저장소 루트에서 `docs/ai-dlc/`로 옮겼다. 본문의 `docs/…`, `aidlc/…`, `.codex/…` 경로와 트리 그림은 저장소 루트 기준이다. AI-DLC 하네스는 루트에 설치돼 있으며 이 문서는 안내일 뿐이다.

이 묶음은 CatchU 저장소에 옮길 입력 자료와 시작 프롬프트다. AI-DLC 프로그램이나 실행 설정은 포함하지 않는다. 현재 준비 폴더에서는 Codex CLI 0.153.4를 확인했으며, `aidlc` 명령과 Git 저장소는 확인되지 않았다. 아래 설치·설정·워크플로우 시작은 아직 수행하지 않았다.

## Codex에 설정 작업을 맡기기

현재 사용하는 Codex 대화에 아래 요청을 보내도 된다. 실제 CatchU 저장소 경로를 함께 알려준다. 이 요청은 환경 준비용이며, 준비가 끝난 뒤 `START_AI_DLC.md`로 프로젝트 기획을 시작한다.

```text
CatchU 저장소의 AI_DLC_SETUP.md를 읽고 AI-DLC 실행 환경 준비를 직접 진행해줘.
기존 ChatGPT/OpenAI 로그인과 사용자 모델 설정을 유지하면서 Bedrock 기본값과 에이전트별 모델 지정을 조정해줘.
터미널뿐 아니라 자동 실행 환경에서도 aidlc가 발견되는지 확인하고, 필요한 경로 보완과 진단을 진행해줘.
설정 변경 전 백업과 변경 계획을 확인해줘. AI-DLC 설정 명령이 수동 수정 내용을 덮어쓰지 않도록 해줘.
hooks와 허용 목록을 검토하고, 사용자에게 필요한 실제 신뢰 승인 절차를 안내해줘.
관리자 비밀번호 입력이나 사용자 승인이 필요한 순간에만 구체적인 작업을 알려줘.
진단 후 완료한 항목과 남은 항목을 구분해 보고해줘. 이번 요청은 환경 준비까지이며 프로젝트 워크플로우는 시작하지 말아줘.
```

## 1. 파일을 둘 위치

실제 CatchU 코드를 개발할 저장소의 최상위 폴더에 이 묶음의 내용을 배치한다. 기존 저장소가 있다면 아래 두 안내 파일과 `docs/ai-dlc-input/`을 옮긴다. 기존 파일이 같은 경로에 있으면 내용을 비교해 합친다. 새 프로젝트라면 이 묶음을 원하는 위치로 옮겨 CatchU 폴더로 사용해도 된다.

```text
CatchU/                             ← 실제 프로젝트 루트
├── AI_DLC_SETUP.md                 ← 이 안내
├── START_AI_DLC.md                 ← Codex에 보낼 시작 프롬프트
└── docs/
    └── ai-dlc-input/               ← 팀이 준비한 입력 자료
        ├── CatchU_AI-DLC_start_draft.md
        ├── CatchU_scope_and_journeys.md
        ├── CatchU_requirements_draft.md
        └── CatchU_v10_reference.md
```

이 입력 폴더 이름은 팀 작업을 위한 제안이며 AI-DLC가 요구하는 고정 규격은 아니다. `START_AI_DLC.md`의 경로와 맞추면 된다. 네 문서는 2026-09-09 시점의 복사본이다. 원본은 그대로 두었고, 복사본의 문서 간 링크 한 곳만 상대 경로로 바꿨다. 이후 팀이 수정할 기준본은 CatchU 저장소에 배치한 문서로 정하자.

| 입력 | 사용하는 방법 |
|---|---|
| [시작 문서](../ai-dlc-input/CatchU_AI-DLC_start_draft.md) | 팀이 먼저 읽을 기본 입력. 현재 방향·유지 결정·제약 확인 |
| [이용 흐름과 범위](../ai-dlc-input/CatchU_scope_and_journeys.md) | 흐름 검토와 질문·답변 확인. Q2의 미결 상태와 4절의 만족도 조사 방안 확인 |
| [요구사항 초안](../ai-dlc-input/CatchU_requirements_draft.md) | AI-DLC에서 검토·수정할 후보. 승인된 요구사항으로 자동 간주하지 않음 |
| [v10 참고 원문](../ai-dlc-input/CatchU_v10_reference.md) | 과거 합의와 상세 기획을 찾아볼 보관 자료. 첫 입력 전체를 대신하지 않음 |

기획 문서 전체를 `AGENTS.md`에 넣을 필요는 없다. Codex는 `AGENTS.md`를 작업 지침으로 읽으므로, 프로젝트 자료는 위 폴더에 두고 프롬프트에서 읽을 순서와 역할을 알려주는 구성을 제안한다. [OpenAI의 AGENTS.md 안내](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

## 2. Codex 실행 환경 준비

첫 팀 세션은 공식 안내가 있는 **Codex CLI**를 기준으로 준비한다. AI-DLC는 Codex CLI 0.145.0 이상과 대상 프로젝트의 Git 저장소를 요구한다. 데스크톱 앱에서 동일한 AI-DLC 통합이 완전히 동작하는지는 이번에 확인하지 않았다. [AI-DLC의 Codex 안내](https://awslabs.github.io/aidlc-workflows/guide/harnesses/codex-cli/)

터미널에서 실제 CatchU 폴더로 이동한 뒤 확인한다. 아래 `/실제/경로/CatchU`는 자신의 경로로 바꾼다.

```sh
cd "/실제/경로/CatchU"
codex --version
git rev-parse --show-toplevel
```

Git 결과가 원하는 CatchU 루트인지 확인한다. 아직 저장소가 없는 새 프로젝트에만 다음을 실행한다.

```sh
git init
```

AI-DLC 프로그램 설치는 기기당 한 번 진행한다. macOS 기준으로 공식 설치 파일을 내려받아 실행한다.

```sh
aidlc_install_dir="$(mktemp -d)"
curl -fsSL https://github.com/awslabs/aidlc-workflows/releases/latest/download/install.sh -o "$aidlc_install_dir/install.sh" && sh "$aidlc_install_dir/install.sh"
```

설치 후 터미널을 새로 열고 CatchU 루트로 돌아온다. 명령을 찾지 못하면 설치기가 출력한 PATH 안내를 적용한다. 팀은 설치한 버전을 기록하고 맞춘다. 일반 사용을 위해 AI-DLC 프레임워크 소스를 복제하거나 직접 빌드할 필요는 없다. [공식 시작 안내](https://awslabs.github.io/aidlc-workflows/guide/01-getting-started/)

## 3. CatchU 저장소에 AI-DLC 설정하기

CatchU 루트에서 실행한다. 기존 Codex 설정이 있다면 첫 명령의 변경 예고를 확인한다.

```sh
aidlc config --harness codex --dry-run
aidlc config --harness codex
```

이 과정에서 아래 영역이 생성·통합된다. 빈 폴더나 임의의 대체 설정을 미리 만들 필요는 없다. [공식 생성 구조](https://awslabs.github.io/aidlc-workflows/guide/01-getting-started/#what-config-creates)

```text
CatchU/
├── .codex/                         ← Codex 설정·hooks 등
├── .agents/                        ← Codex에서 읽는 AI-DLC 스킬 등
├── AGENTS.md                       ← AI-DLC 작업 지침 통합
├── .gitignore                      ← AI-DLC 관련 항목 통합
├── aidlc/                          ← AI-DLC 방법론·상태·산출물 영역
│   └── spaces/<space>/intents/     ← 시작 후 실행별 결과 생성
├── AI_DLC_SETUP.md
├── START_AI_DLC.md
└── docs/ai-dlc-input/               ← 준비한 네 입력 문서
```

네 입력 문서를 `aidlc/` 안에 완료된 단계 산출물처럼 넣지 않는다. 새 결과는 워크플로우가 생성하는 위치에서 검토한다.

### 기존 OpenAI 로그인을 사용할 때

배포 설정의 기본 공급자는 Amazon Bedrock이다. OpenAI 인증을 사용할 경우 생성된 `.codex/config.toml`의 공급자 설정을 조정해야 한다. 공급자 선택만으로 실제 파일이 모두 바뀐다고 가정하지 않는다. [Codex 공급자 안내](https://awslabs.github.io/aidlc-workflows/guide/harnesses/codex-cli/#prerequisites)

설치된 파일을 기준으로 다음을 확인한다. 릴리스마다 값이 달라질 수 있으므로 아래는 통째로 덮어쓸 설정 예제가 아니다.

- `.codex/config.toml`: `model_provider`의 Bedrock 지정과 사용하지 않는 AWS 공급자 블록을 해제한다. Bedrock용 `openai.gpt-*` 모델 ID가 남아 있으면 현재 OpenAI 로그인에서 사용하는 모델 설정에 맞춘다. `model_context_window`와 `model_reasoning_effort`도 그 모델에 맞추거나 불필요한 재정의를 제거한다.
- `.codex/agents/*.toml`: 개별 모델 고정값을 확인한다. Bedrock용 ID가 있으면 사용할 모델에 맞추거나, 모델 지정을 생략해 세션 모델을 따르도록 한다. hooks·스킬·워크플로우 설정은 유지한다.

이 확인 항목은 [공식 Codex 설정 예제](https://github.com/awslabs/aidlc-workflows/blob/main/dist/codex/.codex/config.toml)와 [에이전트 설정 설명](https://awslabs.github.io/aidlc-workflows/reference/05-agent-system/)을 참고했다. 여기에서 사용자의 모델을 새로 지정하지는 않는다.

### 자동 실행 환경에서 aidlc를 찾지 못할 때

AI-DLC 2.8.0의 macOS 경로 진단은 `.zshrc`에 추가한 경로만으로 통과하지 않을 수 있다. `aidlc config runtime --show`에서 자동 실행용 검색 경로와 실제 실행 파일 위치를 확인한다.

현재 설치 파일이 `~/.local/bin/aidlc`이고 `/usr/local/bin/aidlc`가 없는 경우, 다음 연결을 만들 수 있다. 관리자 비밀번호 입력은 사용자가 터미널에서 수행한다. 기존 파일이 있다면 덮어쓰지 말고 먼저 확인한다.

```sh
sudo ln -s "$HOME/.local/bin/aidlc" /usr/local/bin/aidlc
aidlc config runtime --check
```

이 경로 검사가 통과한 뒤 아래 Codex 실행 단계로 진행한다. `runtime --record-paths`는 별도 기록 명령이며 경로를 고치는 명령이 아니다. AI-DLC 2.8.0에서는 일부 설정 기록 명령도 전체 파일 갱신 검사를 거치므로, 모델 설정을 수동 수정한 뒤 `aidlc config`를 반복하거나 `--force`로 덮어쓰지 않는다. 필요한 설정 기록은 변경 계획과 최종 파일 보존 여부를 함께 확인해 처리한다.

### Codex 실행과 hooks 신뢰 승인

프로젝트 설정을 사용자 전체 설정 파일에 통째로 덮어쓰지 않는다. 준비가 끝나면 확인한다.

```sh
aidlc doctor
codex
```

프로젝트 hooks는 AI-DLC 진행 상태를 연결하는 자동 실행 설정이다. Codex의 신뢰 창에서 이 프로젝트에 생성된 hooks임을 확인하고 `Trust all and continue`를 선택한다. 이후 **Codex 대화 입력창**에서 다음을 실행한다.

```text
$aidlc --doctor
```

진단 실패가 있으면 원인을 해결한 뒤 시작한다. 실행 환경이 준비됐다고 확인되면 [시작 프롬프트](START_AI_DLC.md)의 전체 내용을 같은 Codex 대화에 붙여 넣는다. `$aidlc`는 터미널 명령이 아니라 Codex에서 스킬을 호출하는 입력이다. [AI-DLC 실행 안내](https://awslabs.github.io/aidlc-workflows/guide/harnesses/codex-cli/#use)

Codex는 `/skills` 목록이나 `$`로 스킬을 명시적으로 선택할 수 있다. 스킬이 보이지 않으면 설정 후 Codex를 다시 열어 확인한다. 데스크톱 앱에서 진행하려면 스킬 표시뿐 아니라 AI-DLC 진단과 hooks 동작까지 확인하고, 확인되지 않으면 위 CLI 경로로 시작한다. [OpenAI 스킬 안내](https://learn.chatgpt.com/docs/build-skills)

## 4. 팀과 첫 세션 진행하기

첫 공동 세션은 한 명이 Codex를 조작하고 팀이 함께 답하는 방식을 제안한다. 네 명이 각자 다른 답변으로 동일한 기획을 동시에 시작하는 부담을 줄이려는 운영 제안이다.

1. 시작 문서와 이용 흐름의 검증 방안을 함께 읽고 현재 구상과 일치하는지 확인한다.
2. AI-DLC가 보여주는 확정 사항·제안·미결의 구분을 확인한다.
3. 현재 단계에 필요한 질문부터 답한다. 우선 공개 범위 Q2, 역할·기술 환경, 조사 응답자·체험 방식을 필요한 순서로 다룬다. 이미 확인한 가이드 범위·시간·예산은 반복 결정하지 않는다.
4. 생성된 범위와 요구사항을 검토하고 다음 설계 작업을 정한다. 첫 세션에서 구현까지 진행할 필요는 없다.

세션 종료 시 팀이 검토한 결과, 남은 결정, 다음 작업 위치를 기록한다. 다음 세션에는 새 기획을 중복 시작하기보다 현재 상태를 확인해 이어간다. 입력 초안에 적혀 있다는 이유만으로 모든 요구사항을 승인하거나, 검증하지 않은 가설을 완료 기준으로 바꾸지 않는다.
