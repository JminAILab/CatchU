# Practices Discovery — 출처와 확인 기록

## 조사 범위와 지위

2026-09-22 KST · Step 5 최종 통합. 리드 `aidlc-pipeline-deploy-agent`가 최초 초안, 세 지원자의 독립 검토, Q1~Q3와 `Looks correct` 작성 전 확인을 통합했다. 단계 최종 승인·관행 승격은 아직 없다. 로컬 기준 HEAD는 `1ff52ae43628975d368b2d5d9955ab4ca183c21e`, 작업 브랜치는 부모가 확인한 `codex/mvp-recovery-20260922`이다. 기존 변경을 포함한 읽기 결과이며 새 제품 시험 결과가 아니다.

## Sources

| 표기 | 확인한 출처 | 확인 사실·한계 |
|---|---|---|
| O | `aidlc/spaces/default/memory/org.md` | 현재 브랜치 예외·feature 시험 기본/80%·CI·자동 staging 배포·설정 우선 관행. 제안 기본과 강제 하한을 구분 |
| T | 같은 위치 `team.md`, `project.md` | 다섯 관행 절은 주석 템플릿. 기존 팀 관행 승인 내용으로 계산하지 않음 |
| F | `.codex/scopes/aidlc-feature.md` | `skeleton: on`, Standard, relaxed. 사용자 구현 허가와 다름 |
| C | `docs/CatchU_레포_컨벤션.md`, `docs/CatchU_작업관리.md` | 보호 브랜치·merge commit·커밋 규칙, 기존 작업관리. PR #72 판본과 구분 |
| H | [initiative-brief.md](../../ideation/approval-handoff/initiative-brief.md), [decision-log.md](../../ideation/approval-handoff/decision-log.md), [approval-handoff-questions.md](../../ideation/approval-handoff/approval-handoff-questions.md) | 최신 담당·자기 설계 책임·보류·C01/C02·호출/자료 보호 경계. 본문 작성 당시 승인 전 표기는 현재 상태와 구분 |
| S | [scope-document.md](../../ideation/scope-definition/scope-document.md) | M01~M07·수동 배포·기본 보호·범위 제외. 옛 B 조건부 담당은 H 후속 결정으로 대체 |
| R | [wireframes.md](../../ideation/rough-mockups/wireframes.md) | 기존 제출물·PR #70 고정본 연결, E §5.5 재사용, 담당별 미결. 개별 원본을 새로 작성하지 않음 |
| W | [workflow-plan.md](../../workflow-plan.md), [aidlc-state.md](../../aidlc-state.md) | Greenfield, feature/Standard, Practices Discovery 진행 중. 이번 관행 정리는 새 스택 개발·테스트·PR·팀별 세션에 집중 |
| L | 리드 `rg --files web api worker .github/workflows` 및 보안 지원자의 숨김 파일 포함 관측 | 최초 열거는 README뿐이며 지원 검토에서는 `.gitignore`도 확인했다. 제품 manifest·잠금 파일·실행/스캐너 설정·`.github/workflows`는 확인하지 못했다. 실제 검사 명령·제품 CI 준비/강제 동작 증거 없음 |
| P72 | [PR #72](https://github.com/JminAILab/CatchU/pull/72), head `55a1ea65e345d8243927248103a9d07cdbf7db70` | `gh pr view`, `gh pr diff`, 해당 head의 공통 작업관리 §7 원문 조회. OPEN, mergedAt=null, REVIEW_REQUIRED. 9개 문서/양식 수정 제안이며 준비 완료·구현/CI 착수 승인 아님 |
| U | 2026-09-22 이번 사용자 요청 및 부모 전달 경계 | 복구 기록 추가·공식 Practices 재개, 승인 보존·인계 drift advisory 유지, 담당·보류·C01/C02·추가 호출 금지·수동 배포·범위 유지 |

공통·역할 지식 Markdown은 지정 순서로 읽었다. 활성 space의 사용자 공유/역할 knowledge 디렉터리는 존재하지 않아 추가 문서를 추정하지 않았다. 필수 upstream `code-structure`, `technology-stack`, `dependencies`, `code-quality-assessment`, `architecture`, `business-overview`는 Brownfield 조건부 입력이다. 이 Greenfield 단계에서는 해당 Reverse Engineering 산출물 부재를 누락이나 제품 분석 완료로 표시하지 않는다. 외부 PoC는 기존 feasibility/승인 인계를 재사용하며 재실행하지 않았다.

## PR #72에서 재사용할 입력

고정 head의 [공통 작업관리](https://github.com/JminAILab/CatchU/blob/55a1ea65e345d8243927248103a9d07cdbf7db70/docs/CatchU_작업관리.md)와 서비스 README는 다음 제안을 제공한다.

- 합의된 범위·계약·완료 기준으로 수정 대상과 기대 결과를 정하고 기존 변경을 보존한다.
- 서비스 초기화 책임과 기능별 설계·구현·시험 책임을 구분하고, 공통 변경은 영향을 받는 담당과 조율한다.
- 관련 검사와 실제/모의 연결을 구분하며 `통과 / 실패 / 실행하지 못함 / 해당 없음`을 기록한다. 문서만 있는 변경의 제품 커버리지 해당 없음은 CI·초기화 검사 면제가 아니다.
- 서비스 README에 실제 도구·명령·환경·정상 확인·종료·재현 증거를 채운다. 지금은 준비 목록이며 실행 가능한 기반의 증거가 아니다.
- 기존 Construction 브랜치 운영과 임시 통합 브랜치 제안의 차이, 80%·머지 전 CI의 미구현, 배포 방향 차이를 이미 후속 결정으로 표시했다.

Q1에서 공통 작업·검사·오류/로그 절차만 반영하도록 확인받았다. 브랜치 변경안은 후속 검토로 남기며 PR 전체 승인·병합이나 설정 적용을 뜻하지 않는다. PR #72를 checkout·병합·수정하거나 원격 댓글을 작성하지 않았다. 이 통합에서는 기존 고정 head와 미병합 조회 기록을 재사용했고 원격 상태를 새로 조회하지 않았다.

## 인터뷰 결정과 통합 근거

정본은 [practices-discovery-questions.md](practices-discovery-questions.md)이다. 사용자 원문은 질문 파일에 보존되며 아래는 결정 적용 요약이다.

| 항목 | 사용자 선택과 적용 | 남은 범위 |
|---|---|---|
| Q1 | A. PR #72의 공통 작업·검사·오류/로그 절차 반영. 현행 브랜치·PR·승인·merge commit 유지 | 선택적 임시 통합 브랜치/공유 merge 갱신안은 후속 검토. 실제 규칙·도구 변경 없음 |
| Q2 | B. `Methodology: custom`; 담당자가 주요 시나리오·기대 결과·실패 조건을 먼저 정하고 세부 테스트 코드는 구현 후 작성·실행 | 구체 도구·측정·명령·CI 조건과 준비 담당은 후속 작업. 80%·머지 전 CI 유지 |
| Q3 | A. 담당별 최소 전체 연결 우선, 첫 결과의 별도 승인 | 범위·순서·연결 방식은 후속 설계·계약·개발 계획. 최소 성공은 MVP 완료·외부 호출 허가 아님 |
| 작성 전 확인 | `Looks correct` 확인 후 네 산출물 통합 | 회고·Practices Discovery 공식 승인·관행 승격은 별도 |

작성 확인 receipt의 authorization_id는 `56f97730febf563d621b582e1ebe03116618c0c9a8a7e9105d2b100db9fc1437`이며 부모가 성공 확인을 전달했다. 이 식별자를 단계 승인이나 외부 실행 권한으로 사용하지 않았다.

## 독립 지원 검토와 지적 반영

세 지원자는 최초 리드 초안을 각각 독립 검토했다. 기여 원문은 수정하지 않았고 리드가 인터뷰 후 다음 내용을 통합했다. 아래 해소는 지적의 처리 결과이며 지원자의 재검토·최종 승인 사실을 새로 주장하지 않는다.

| 검토자·기여 정본 | 검토 범위 | OBJECT 처리 결과 |
|---|---|---|
| [품질](contributions/aidlc-quality-agent.md) | 시험 순서·80%/CI·검사 증거·실제/모의·담당 책임 | 인터뷰 전 test-after 확정 금지 → Q2의 명시 선택으로 custom/Ordering을 기록. 해당 이견 해소 |
| [개발](contributions/aidlc-developer-agent.md) | 명명·레이어·파일/설정·오류/로그 | 예외 삼킴 금지·접수≠완료·안전한 식별자/오류 항목 보완 → Q1 확인대로 Code Style에 명시. 해당 이견 해소 |
| [보안](contributions/aidlc-devsecops-agent.md) | 자료/로그 보호·실행 조건·보안/공급망 검사 준비 | SAST/DAST·비밀값 자동 탐지·의존성/공급망 관측 누락 → 아래 상태/후속 위치 표로 보완. 새 도구·차단 기준 없음. 해당 이견 해소 |

세 검토 모두 담당별 책임·NCP 수동/자동 CD 제외·기존 조건·추가 호출 금지·복구 안내 보존에 동의했다. 합의된 검사 기대 결과, 판본/환경/미커밋 여부, 통과/실패/미실행/해당 없음과 작성자 외 재현 구분도 Testing Posture에 반영했다.

## 보안 검사 준비 상태와 후속 위치

아래는 지원자의 읽기 관측을 통합한 표다. 제품 보안 스캔을 실행한 결과가 아니며 새 도구·수치·필수 통과 조건을 추가하지 않는다. AI-DLC 훅·센서·doctor 통과는 제품 보안 검사의 증거가 아니다.

| 항목 | 확인 상태 | 후속 준비 위치 |
|---|---|---|
| lint/format·타입 검사 | 설정 우선 원칙과 후보만 있고 제품 명령/실행 증거 없음 | 서비스 초기화의 도구·범위·명령 제안 및 README. 특정 도구 채택으로 간주하지 않음 |
| SAST/DAST | 제품 소스 정적 보안 검사·실행 서비스 동적 검사 구성/결과를 확인하지 못함 | 관련 보안 설계·검사 준비에서 대상·필요성·허용 환경 검토. 이번 단계에서 설치·실행 요구 없음 |
| 비밀값 자동 탐지 | 기록/공유 금지 원칙은 반영했으나 자동 탐지 활성화·이력 검사 증거 없음 | 환경 예시·로그 보호를 유지하고 자동 검사 방법은 후속 준비에서 검토. 저장소 기능 활성화를 추정하지 않음 |
| 의존성·공급망 | 제품 manifest·잠금 관리·취약점 검사·공급망 통제 구현 증거 없음 | 선택할 의존성/잠금 관리·변경 검토·재현 방법과 검사 증거를 초기화/관련 검사·CI 준비에 연결. SBOM·서명·특정 도구를 새 의무로 만들지 않음 |

일반 검사는 합성·비식별 자료/모의 응답을 우선하고 실제 자료·호출은 별도 허용 조건을 따른다. 예외 은폐·접수를 완료로 기록·비밀값/원문/인자·반환값/오류 객체 전체 기록을 금지하는 Q1 범위를 Code Style에 반영했다. 로그를 AI·이슈·PR에 공유할 때도 동일하게 보호한다.

## 남은 적용 차이·미결

- 현행 Construction 브랜치와 PR #72 변경안의 차이는 Q1에 따라 후속 보류다. 현행 규칙을 유지하고 공유 브랜치 변경을 실행하지 않는다.
- org의 자동 staging 배포 기본과 이번 intent의 승인 계획·사용자 NCP 수동 배포 지시가 다르다. 사용자 경계를 적용하며 자동 CD를 재질문하지 않는다. 원본 문구는 직접 수정하지 않았다. 공식 승격 절차가 추가 정리를 요구하면 해당 적용 관계의 최소 범위와 근거를 별도 설명해야 한다.
- 서비스 도구/버전·명령·커버리지 측정/제외·CI 조건·보안 검사 준비, 유닛/계약/첫 연결 범위·순서, 지원·독립 재현 책임은 기존 후속 설계·초기화·개발 계획에 연결한다. 이 미결 전체를 모든 독립 설계의 차단 조건으로 만들지 않는다.
- C01 기준 미달/R1 한 건 예외 적용 대기, C02 제한 수용 방향·독립 대조/시간 상한 미확인과 기존 관련 착수 제한은 유지한다. 추가 호출·원문 복구·튜닝·모델 교체를 허용하지 않는다.
- 해당 실험 사본의 삭제 완료는 현재 미확인이다. 기한은 2026-09-23 23:59 KST 또는 domain-design 승인/관련 구현 착수 중 먼저 오는 시점 전이다. 이후 대상 종류·세션 식별자·완료 시각·확인 방법·미확인 사본 여부로 상태를 갱신하며 원문 재출력·삭제용 백업을 요구하지 않는다. 로컬 삭제와 공급자 보관/삭제를 구분한다. 이 조건을 제품 전체 보관 기간이나 영구 미확인 규칙으로 전용하지 않는다.

## 기존 답변 대조

현 intent의 다섯 질문 파일(intent-capture, feasibility, scope-definition, rough-mockups, approval-handoff)을 질문·기존 답변·후속 정정 맥락으로 대조했다. 모든 감사 shard를 읽어 같은 Stage/Unit/Attempt Generation/Workflow의 질문 뒤 답변을 짝지어 확인했으며, 짝이 없는 답변은 독립 결정 근거로 사용하지 않았다. 최초 초안 당시 시험 작성 순서와 PR #72 브랜치 제안의 처리를 해소한 답변은 없었다. 이후 위 Q1~Q3가 이를 해소했으며 당시 미정 기록을 현재 미답변으로 읽지 않는다. 기존 `Mode: chat`과 추가 질문 한 번에 1~2개 선호는 반복 확인 없이 부모에게 인계한다. 담당·수동 배포·자기 설계·보류와 조건의 최신값은 승인 인계/이번 지시에서 이미 정해져 재질문하지 않는다.

## 복구·승인 보존

부모의 기존 조사와 이번 사용자 지시에 따라 approval-handoff 변경 감지는 복구된 입력의 존재 여부 차이에 따른 비차단 안내로 유지한다. 입력 내용 변경·인계 산출물 변경으로 확대하지 않는다. 초기화 3단계의 Untracked는 기존 비교 기준 없는 기록이며 이번 통합에서 재수행 대상으로 만들지 않는다. 이 리드 작업은 승인 당시 해시 대조를 다시 수행한 조사가 아니며 부모가 기존 복구 문서에 연결한 조사 근거를 재사용한다. 상태·감사·기존 승인 산출물·규칙 원본은 직접 수정하지 않았다.

## 검증과 참여자 기록

- 리드: 기존 입력·고정 PR head를 조사하고 최초 네 초안 작성 후 세 기여와 확인된 Q1~Q3를 최종 통합했다. 새로운 광범위 조사나 PR 원격 변경은 없다.
- 지원: quality/developer/devsecops의 독립 검토 완료. 원문과 초기 입장은 각 contributions 파일에 보존한다. 통합본 재검토를 수행했다고 기록하지 않는다.
- 사용자: Q1=A, Q2=B, Q3=A 및 `Looks correct` 작성 전 확인 완료. 단계 최종 승인·관행 승격은 별도 대기다.
- Timestamp는 실제 UTC 시각·현재 commit으로 최종 통합 시점을 기록한다. 미커밋 산출물이 있으므로 commit만으로 이번 통합본 전체를 식별하지 않는다.
- 네 산출물의 로컬 링크·UTF-8·끝 개행, 필수 다섯 절과 custom/Ordering, Mandated/Forbidden, timestamp 단일 행을 확인한다. 제품 실행·테스트·CI·배포·보안 스캔·LLM/PoC 호출을 하지 않았다. 선언 센서/공식 최종 검증·발견 이벤트·회고는 부모가 수행한다.
