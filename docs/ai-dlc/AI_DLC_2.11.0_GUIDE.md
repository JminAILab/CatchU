# AI-DLC 2.11.0 설치·운영 안내

작성일: 2026-10-13. 지위: **안내**. 이 문서는 2.11.0 Codex·Claude Code 하네스가 포함된 CatchU 판본을 받은 팀원을 위한 절차다. 팀원별 설치 완료나 제품·전체 워크플로우 검증을 뜻하지 않는다.

현행 설치 안내는 이 문서를 따른다. [2026-09-09 준비 문서](AI_DLC_SETUP.md)의 `latest` 설치, 옛 Bedrock 설정 수정, 초기 입력으로 시작하는 절차는 이번 판본에 적용하지 않는다. [2.10.0 적용 기록](2026-09-29_2.10.0_dev_적용검증.md)과 기존 승인 원본은 당시 기록으로 보존한다.

## 1. 런타임을 정확히 2.11.0으로 맞추기

저장소 파일을 받는 것과 컴퓨터의 `aidlc` 프로그램을 바꾸는 것은 별도다. 먼저 사용 중인 CatchU 폴더와 실행 중인 다른 AI-DLC 세션을 확인하고, 변경 전 프로젝트 파일·미커밋 파일·기계 런타임을 백업한다. 공용 런타임을 전환하면 같은 컴퓨터의 다른 checkout도 영향을 받으므로, 2.10.0 등 다른 판본을 쓰는 작업과 전환 시점을 맞춘다. 다른 사람의 세션을 임의 종료하지 않는다.

기존 설치가 있으면 아래 명령으로 **2.11.0을 지정해** 갱신한다. 이미 보관된 2.11.0을 선택할 때는 첫 줄 대신 `aidlc use 2.11.0`을 쓸 수 있다. 두 명령 모두 기계의 활성 버전을 바꾸며 프로젝트 파일은 갱신하지 않는다.

```sh
aidlc update --version 2.11.0
aidlc --version
```

처음 설치하는 macOS·Linux 사용자는 일반 사용자 터미널에서 실행한다. `sudo`는 필요 없다.

```sh
aidlc_install_dir="$(mktemp -d)"
curl -fsSL https://github.com/awslabs/aidlc-workflows/releases/download/v2.11.0/install.sh \
  -o "$aidlc_install_dir/install.sh"
sh "$aidlc_install_dir/install.sh" --version 2.11.0
export PATH="$HOME/.local/bin:$PATH"
aidlc --version
```

Windows 최초 설치는 일반 PowerShell에서 실행한다. 설치기가 사용자 PATH를 등록하며, 다른 터미널에서 명령이 안 보이면 새로 연다.

```powershell
$aidlcDownload = Join-Path $env:TEMP "aidlc-install-211-$PID"
New-Item -ItemType Directory -Force $aidlcDownload | Out-Null
$aidlcInstaller = Join-Path $aidlcDownload "install.ps1"
Invoke-WebRequest -Uri https://github.com/awslabs/aidlc-workflows/releases/download/v2.11.0/install.ps1 -OutFile $aidlcInstaller
& $aidlcInstaller -Version 2.11.0
aidlc --version
```

설치기는 checksum을 검사하고, 지원되는 GitHub CLI(`gh`)가 있으면 릴리스 attestation도 확인한다. 검증 실패를 우회하지 않는다. 출력이 `aidlc 2.11.0 (runtime 2.11.0)`인지 확인한다. 예전 시험용 PATH·설치 루트 override가 남은 셸을 쓰지 말고, 자동 hook에서도 같은 런타임을 찾는지 아래 진단으로 확인한다. 프로젝트 pin(`.aidlc-version`) 도입은 공용 전환과 다른 정책이므로 이 절차에 임의로 추가하지 않는다.

## 2. 사용할 하네스만 확인·갱신하기

CatchU 루트에서 실행한다. 이 저장소에는 두 하네스가 있으므로 `config`에는 항상 `--harness codex` 또는 `--harness claude`를 명시한다. 저장소의 하네스 파일이 이미 최신이어도 개인 설정과 충돌하는지 미리보기를 확인한다.

Codex를 쓴다면:

```sh
aidlc config --harness codex --dry-run --json
```

Claude Code를 쓴다면:

```sh
aidlc config --harness claude --mcp none --dry-run --json
```

변경이 필요하면 미리보기의 경로·충돌·`data.notes`를 검토하고, 같은 옵션으로 `--dry-run`을 `--plan-token '<검토한 data.planToken 값>'`으로 바꿔 적용한다. 미리보기 뒤 파일·옵션이 바뀌면 다시 미리보기를 만든다. 충돌을 `--force`로 덮어쓰지 않는다. `--mcp none`은 이번 저장소의 선택 MCP를 추가하지 않는 구성이다. 이후 MCP를 따로 설정한 팀원은 이 옵션을 재사용하기 전에 기존 서버와 변경 예고를 확인한다.

프로젝트 버전은 [Codex stamp](../../.codex/tools/data/aidlc-stamp.json)와 [Claude stamp](../../.claude/tools/data/aidlc-stamp.json)의 `frameworkVersion`이 모두 2.11.0인지 확인한다. `aidlc --version`만으로 프로젝트 파일과 실제 hook의 버전까지 확인했다고 간주하지 않는다.

| 사용 하네스 | 새 세션 시작 | 세션 입력창의 진단 | 하네스 안내 |
|---|---|---|---|
| Codex | CatchU 루트에서 `codex` | `$aidlc --doctor` | [Codex onboarding](../../.codex/onboarding.md) |
| Claude Code | CatchU 루트에서 `claude` | `/aidlc --doctor` | [Claude onboarding](../../.claude/CLAUDE.md) |

Codex는 프로젝트 hook을 읽기 위해 Git 저장소가 필요하며, 2.11.0 공식 전제는 Codex CLI 0.145.0 이상이다. 실제 사용하는 CLI 버전도 기록한다. Codex만 쓰는 팀원에게 Claude 설치·로그인을 요구하지 않는다. 설치 확인에 bare `$aidlc`·`/aidlc`를 쓰면 기존 작업을 이어갈 수 있으므로 위 진단 입력을 사용한다.

## 3. 신뢰 승인과 실제 hook 확인

Codex의 프로젝트·hook 신뢰는 각 사용자의 컴퓨터와 프로젝트 경로에 속한다. PR을 받았거나 다른 폴더에서 승인한 것만으로 현재 폴더의 hook이 신뢰되는 것은 아니다. 변경된 hook 내용을 확인한 뒤 새 Codex 세션의 신뢰 창에서 **Trust all and continue**를 선택한다. 이미 창을 지나쳤다면 Codex 입력창에서 `/hooks` → `t` → Esc 순서로 신뢰하고 다음 메시지를 보낸다. hook 정의가 바뀌면 다시 확인한다. 기존 사용자 TOML에 trust seed를 중복으로 붙이지 않는다.

Claude Code도 프로젝트의 [`.claude/settings.json`](../../.claude/settings.json)을 확인하고 도구가 요구하는 프로젝트 신뢰 절차를 따른다. `permissions.allow`에는 프로젝트 안의 파일 생성·편집을 허용하는 `Edit(/**)`, 하위 에이전트 호출 `Task`, 웹 검색 `WebSearch`, `Bash(aidlc engine *)`와 AI-DLC 진단·조회 명령이 추가된다. 이 설정의 선행 `/`는 프로젝트 루트를 가리키며, 프로젝트 밖 쓰기나 `aidlc update`·`use` 등 기계 설치 변경을 일괄 허용하지 않는다.

또한 hooks가 세션 이벤트에 따라 실행되고, statusLine은 `aidlc engine statusline`을 호출해 AI-DLC 상태를 표시한다. 이 설정은 `/aidlc`를 시작하지 않은 일반 Claude 대화에도 로드된다. 두 하네스는 같은 `aidlc/` 기록을 참조하므로 같은 intent를 서로 다른 세션에서 동시에 진행하지 않는다.

Windows에서 Claude Code로 AI-DLC를 쓰려면 Git Bash를 설치하고, 개인 설정 `.claude/settings.local.json`의 `env`에 `"CLAUDE_CODE_USE_POWERSHELL_TOOL": "0"`을 넣는다. AI-DLC의 Claude hook은 셸 명령 중 Bash 도구에만 걸리는데, Windows의 Claude Code는 claude.ai 계정이면 [PowerShell 도구](https://code.claude.com/docs/en/tools-reference#powershell-tool)를 기본으로 써서 그 명령이 상태·승인 확인을 거치지 않기 때문이다.

새 세션에서 위 `--doctor`를 실행하고 Runtime hook PATH·버전·신뢰 진단을 확인한다. 세션의 자동 hook 실행 기록도 확인해 2.11.0 런타임이 실제 호출됐는지 구분한다. 설정 파일 존재나 hook 스크립트의 수동 실행만으로 자동 hook 정상 동작을 판정하지 않는다. 진단이 남기는 감사 기록은 기존 승인과 별개이며, 실패·경고를 임의로 지워 통과시키지 않는다.

## 4. 개인 설정과 기존 기록 유지

- 인증·공급자·일반 세션 모델은 각 사용자가 관리한다. 개인 인증 파일·신뢰 기록·세션 기록·절대 경로를 저장소에 올리거나 프로젝트 설정 전체를 개인 설정으로 복사하지 않는다. Codex의 모델은 개인 설정을 상속하며, 저장소가 특정 GPT 모델 사용을 강제하지 않는다.
- Claude의 일반 에이전트는 세션 모델을 상속하지만, 공식 `aidlc-product-lead-agent`와 `aidlc-architecture-reviewer-agent`는 `model: sonnet`, `effort: medium`이다. 이 두 검토 역할까지 세션 모델을 따른다고 해석하지 않는다.
- 기존 intent의 Guard Policy·승인·질문과 답변·park 상태는 유지한다. 2.11.0의 새 `feature` 기본값인 Guard Policy `off`·Collaborators `off`를 기존 상태 파일에 일괄 덮어쓰지 않는다. Plan Approval은 `on`이며, 새 기본값과 기존 기록에 적용되는 값은 구분한다. 사용자 scope `catchu-definition`에도 `feature` 기본값을 그대로 가정하지 않는다.
- 공유 scope 원본은 [`aidlc/scopes/catchu-definition.md`](../../aidlc/scopes/catchu-definition.md)다. 후속 refresh에서도 Codex·Claude의 동일한 scope 의미를 보존하고, 과거 승인·입력 원본이나 AGENTS·CLAUDE의 팀 관리 영역을 자동 생성 파일처럼 교체하지 않는다.

## 5. 문제 발생 시 복귀

관련 작업의 쓰기를 멈추고 실패 원인과 적용 후 새 변경을 먼저 보관한다. `aidlc use 2.10.0`만 실행하면 런타임만 돌아가므로 복귀가 끝나지 않는다. **변경 전 기계 런타임과 프로젝트 파일을 함께** 복원해야 한다.

백업과 변경 목록을 대조해 이번 갱신 파일·새 Claude 관리 파일만 되돌린다. 원래 있던 `.claude/settings.json`, 개인 설정, 이후 다른 작업의 변경은 보존한다. 광범위한 `git reset --hard`·`git clean`으로 처리하지 않는다. 별도로 변경한 pin·신뢰 항목도 해당 변경분만 복원하고, 복귀한 hook 정의에 맞춰 신뢰와 새 세션 진단을 다시 확인한다. 최종적으로 런타임·프로젝트 stamp의 판본 일치와 기존 승인·scope·팀 지침 보존을 확인한다.

## 근거와 적용 경계

명령과 기본 동작은 공식 v2.11.0 소스 `6a378b53c0a4fe0641ed7d8de8dfff94264d5b6a`의 [설치·수명주기 안내](https://github.com/awslabs/aidlc-workflows/blob/6a378b53c0a4fe0641ed7d8de8dfff94264d5b6a/docs/guide/18-install-and-lifecycle.md), [Codex 안내](https://github.com/awslabs/aidlc-workflows/blob/6a378b53c0a4fe0641ed7d8de8dfff94264d5b6a/docs/guide/harnesses/codex-cli.md), [Claude 권한 설정 설명](https://github.com/awslabs/aidlc-workflows/blob/6a378b53c0a4fe0641ed7d8de8dfff94264d5b6a/docs/guide/13-customization.md), [feature scope](https://github.com/awslabs/aidlc-workflows/blob/6a378b53c0a4fe0641ed7d8de8dfff94264d5b6a/core/scopes/aidlc-feature.md)를 기준으로 한다. 적용 검증 결과와 남은 한계는 갱신 PR에 기록하며, 다른 컴퓨터·OS의 실제 실행 결과를 대신하지 않는다.
