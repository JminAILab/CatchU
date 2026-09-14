# 10월 MVP — 승인된 남은 단계 진행 계획

- 대상: `260914-catchu-october-mvp` / feature / Standard / Change Control relaxed.
- 사용자 승인: 2026-09-14, 이 세션에서 제안 전문을 확인한 뒤 응답한 원문 **`Approve`**.
- 승인 범위: 아래 단계 조정과 유지 단계의 축소·통합 조건, 필수 입력·검토 시점. 개별 단계 산출물·구현·배포·PR 머지 승인은 아니다.
- 적용: `aidlc engine recompose --skip market-research,team-formation,user-stories,refined-mockups,feedback-optimization` 성공. 5개 SKIP / 0개 ADD. 전체 27 EXECUTE / 6 SKIP, 초기화 3개 완료.
- 보존: 진행 중인 intent-capture, 기존 reverse-engineering 생략, 첫 intent의 승인 산출물·완료 기록, 현재 scope·depth·Change Control.
- 적용 근거: [현재 단계표](aidlc-state.md), [RECOMPOSED 감사 기록](audit/macui-macbookpro-local-ad614c40ab56.md) (2026-09-14T04:20:57Z).
- 작업 추적: [계획 #26](https://github.com/JminAILab/CatchU/issues/26), [기존 PR #27](https://github.com/JminAILab/CatchU/pull/27). 현재 문서가 승인한 수행 범위의 기록이며 실행 상태·담당은 각 이슈/Project에서 확인한다.

## 실행 시 적용 방법

아래 표의 각 EXECUTE 단계는 해당 입력과 축소·통합 조건을 함께 읽는다. 단계표의 SKIP 표시만으로 대체 책임이 자동 이행되는 것은 아니다. 단계 산출물에서 관련 FR/NFR·이슈·원본 리비전을 연결하고, 누락된 입력·미배정 책임은 임의 확정하지 않는다. 이 문서는 단계 산출물을 대신하지 않으며 단계별 승인 절차를 유지한다.

다음 실행은 현재 진행 중인 intent-capture의 이어가기다. 그 후 feasibility에서 #19 결과 및 #24의 설계 전 책임·계정·가용량을 검토한다. #19 결과의 설계 수용 검토는 domain-design 시작 전에 완료한다. 독립 화면 초안은 병행 가능하고 실제 연결 구현은 해당 계약 합의 뒤 진행한다.

## 승인한 제안 본문

아래는 승인 시 제시한 제안의 원문이다. 본문의 ‘미승인·제안·확인 필요’ 중 제안 승인 지위는 위 승인 기록으로 해소됐으며, 제품·계정·담당·PoC 검증 등 실행 미결은 계속 유효하다. 초기화·현재 단계 상태와 이슈 제출 여부는 제안 당시의 관찰이다.

검증 완료한 **미승인 제안**입니다. 첫 intent의 승인된 행동·ID를 재사용하고, 별도 문서 작성이 중복되는 5개 단계를 생략합니다. 공통 설계·통합 검증·NCP 수동 배포·운영·복구는 유지하며, 유지 단계는 아래의 필요한 산출물에 집중합니다.

`scopeName: feature`, `mode: in-flight`, `depth: Standard`, `changeControl: relaxed`를 그대로 유지합니다. **27 stages EXECUTE / 6 SKIP, 24 approval gates**입니다. 이 숫자는 초기화 3단계를 포함한 전체 계획이며, 실제 팀원별 검토 횟수·소요시간을 뜻하지 않습니다.

검증 결과 원문:

```json
{
  "valid": true,
  "errors": [],
  "advisories": [],
  "summary": {
    "total": 33,
    "execute": 27,
    "skip": 6,
    "gates": 24,
    "perUnitStages": 5
  },
  "change_control": "relaxed"
}
```

**단계 결정 표**

‘축소’는 EXECUTE를 유지하면서 작성 범위를 줄이는 제안입니다. 필수 산출물이나 승인 절차를 생략한다는 뜻이 아닙니다.

| # | Stage | Decision | Reasoning · 필요한 입력 |
|---|---|---|---|
| 0.1 | workspace-scaffold | EXECUTE | 완료 기록 보존. 입력: 기존 초기화 기록 |
| 0.2 | workspace-detection | EXECUTE | 완료된 Greenfield 판정 보존. 입력: 기존 탐지 기록 |
| 0.3 | state-init | EXECUTE | 완료 기록·현재 intent 보존. 입력: 현재 상태 |
| 1.1 | intent-capture | EXECUTE | **진행 중 그대로 유지**. 입력: 첫 승인 의도·요구사항, MVP 입력·후속 결정 |
| 1.2 | market-research | SKIP | 제품 방향·대상이 승인되어 새 시장 조사의 기여가 작음. 입력: 첫 의도·범위 |
| 1.3 | feasibility | EXECUTE | **차이 검토로 축소**: PoC 적합성·계정·NCP·가용량 확인은 설계 전에 필요. 입력: #19, #24, 이전 제약·MVP §2·§6 |
| 1.4 | scope-definition | EXECUTE | **10월 적용표로 축소**: 기존 범위 재작성 없이 포함·제외·완료 조건 연결. 입력: 승인 SC/FR/NFR, MVP §1·§3 |
| 1.5 | team-formation | SKIP | 기존 4인·담당 영역을 재사용하고 가용량은 feasibility, 실제 배분은 delivery-planning에서 처리. 입력: 후속 입력, #19~#24 |
| 1.6 | rough-mockups | EXECUTE | **팀 초안 공동 검토로 축소**: 화면 이동·예외·공통 용어를 한 번 정리. 입력: #22/PR #28 실제 초안, #20·#21 제출물은 확보 후 |
| 1.7 | approval-handoff | EXECUTE | **차이·미결 인계로 축소**: 10월 경계와 설계 전 확인 사항을 승인. 입력: 의도·범위·PoC 검토·초안 |
| 2.1 | reverse-engineering | SKIP | 현재 Greenfield 생략 유지. 외부 PoC 분석은 별도 #19→feasibility 필수 입력으로 보존 |
| 2.2 | practices-discovery | EXECUTE | **새 스택의 실행 관행으로 축소**: 개발·테스트·PR·팀별 세션 규칙이 필요. 입력: 레포 컨벤션·작업관리, Next/Nest/FastAPI |
| 2.3 | requirements-analysis | EXECUTE | **승인 ID의 10월 적용·OQ 해결로 축소**: 설계·검증이 소비할 기준 작성. 입력: 승인 요구사항, MVP §3·§4, #23 |
| 2.4 | user-stories | SKIP | 승인 이용 상황·통과 기준을 requirements-analysis에서 유지하고 흐름은 rough-mockups에 통합. 입력: 기존 FR·경계 시나리오 |
| 2.5 | refined-mockups | SKIP | 별도 고충실도 문서 없이 rough-mockups와 유닛 functional-design에서 상호작용·접근성 보완. 입력: 검토된 팀 초안·10월 NFR6 |
| 2.6 | domain-design | EXECUTE | 공유 데이터·상태·권한·처리 경계는 기존 문서가 제공하지 않음. 입력: 10월 요구사항, **수용 검토한 #19 결과**, #23 |
| 2.7 | units-generation | EXECUTE | 사람별 영역을 구현·검토 가능한 유닛과 의존성으로 나눔. 입력: components·requirements·PoC 차이·담당 경계 |
| 2.8 | contract-design | EXECUTE | web/api/worker와 팀원 간 데이터·오류·권한 계약 필요. 입력: 유닛·의존성, 분석 입출력·상태 예시, #23 |
| 2.9 | delivery-planning | EXECUTE | 실제 담당·지원 여유·선행 조건·첫 통합·전체 검증 순서를 확정. 입력: 유닛·계약, #19~#24, 실제 가용량 |
| 3.1 | functional-design | EXECUTE | **유닛별 복잡한 규칙에 집중**: 중복·재요청·공개·링크 수명·화면 예외 명세. 입력: 유닛·FR·계약·검토 초안 |
| 3.2 | nfr-requirements | EXECUTE | **10월 7개 NFR로 한정**: 수용량·권한·보관·복구의 측정 기준 필요. 입력: 기능 명세·NFR1/2/4~8·OQ11/13/14 |
| 3.3 | nfr-design | EXECUTE | 권한·큐·실패 격리·자료 유지·외부 AI 통제가 상호작용해 별도 설계 필요. 입력: NFR 기준·기능 명세·계약 |
| 3.4 | infrastructure-design | EXECUTE | **NCP 단일 서버 수동 운영으로 축소**: 배치·영속 자료·네트워크·비밀값·복구 구조. 입력: NFR 설계·확인한 NCP 권한 |
| 3.5 | code-generation | EXECUTE | 각 담당자의 설계·코딩·테스트와 AI 지원을 연결. 입력: 승인 유닛 계획·설계·계약·PoC 채택 근거 |
| 3.6 | build-and-test | EXECUTE | 실제 분석→열람 및 전체 FR/NFR·권한·실패·중복 통합 검증. 입력: 코드·유닛 테스트·승인 통과 기준 |
| 3.7 | ci-pipeline | EXECUTE | **PR 빌드·테스트·품질 확인으로 축소**: 수동 배포할 버전의 검증 근거 공급. 입력: 빌드·테스트 결과; 자동 배포 제외 |
| 4.1 | deployment-pipeline | EXECUTE | **수동 릴리스 준비로 축소**: 배포 설정·전략·rollback 산출물이 후속 필수 입력. 입력: CI 품질 기준·인프라 명세 |
| 4.2 | environment-provisioning | EXECUTE | NCP 실제 계정·자원·접속·비밀값·영속 저장 준비 검증. 입력: infrastructure-specification·수동 cd-config |
| 4.3 | deployment-execution | EXECUTE | 버전 고정 수동 배포·외부 URL·재시작·재배포 결과 확인. 입력: 배포 설정·전략·환경 목록·통과한 빌드 |
| 4.4 | observability-setup | EXECUTE | **오류·권한 위반·호출량·비용·중단/재개 확인으로 축소**. 입력: FR10.3/4·NFR8·운영 및 모니터링 설계 |
| 4.5 | incident-response | EXECUTE | **MVP 운영 절차와 복구 연습으로 축소**: 담당·중단·재개·복원 결과 필요. 입력: 기록 조회·복구 계획·배포 버전 |
| 4.6 | performance-validation | EXECUTE | **합의한 시연 조건에서 검증**: 수용량·대기·실패·자료 유지·복구 증거 대조. 입력: OQ14·NFR 목표·배포/운영/복구 결과 |
| 4.7 | feedback-optimization | SKIP | 별도 장기 최적화 단계는 접고 10월 운영 관찰·잔여 결함·개선 담당을 운영/검증 결과에 남김. 입력: 관측·복구·NFR 검증 결과 |

**축소·통합 시 지킬 조건**

- `team-formation` 생략에 따른 책임 공백은 허용하지 않습니다. feasibility에서 #19·#23·#24의 설계 전 실행·검토 책임과 계정/가용량을 확인하고 `constraint-register.md`·`raid-log.md`에 남깁니다. delivery-planning의 `team-allocation.md`와 `external-dependency-map.md`에서 유닛별 구현·검토·통합·운영 담당 및 착수 조건을 확정합니다. 팀원 1에게 미배정 업무를 일괄 배정하지 않습니다.
- `user-stories` 생략 후 요구사항 통과 기준과 이용 상황은 유지합니다. 유닛 추적표는 실제 FR/NFR에 연결하며 작성하지 않은 US/AC ID를 만들어 인용하지 않습니다.
- `refined-mockups` 생략 후 화면 상태·이동·접근성 확인은 rough-mockups와 관련 functional-design에 포함합니다. 별도의 완성 디자인이 꼭 필요한 화면이 드러나면 그때 추가 제안을 검토합니다.
- `feedback-optimization` 생략은 FR10.1~10.4의 구현·품질 개선 활용을 제거하지 않습니다. `incident-plan.md`에 운영 관찰·개선 검토 담당과 주기를, `nfr-validation-matrix.md`에 잔여 결함·영향·후속 이슈·담당/검토 책임을 남깁니다. 호출량·비용 기록은 observability-setup에서 확인합니다. 사용자 조사 실행·12월 전체 품질 판정은 추가하지 않습니다.
- `observability-setup`의 `alarms`·`slo-config`·`tracing-config`·`anomaly-config` 등 필수 이름은 유지하되 실제 10월 설정·적용 범위·비적용 근거를 명시합니다. 미구축 자동 경고·분산 추적·이상 탐지를 구축했다고 기록하거나 12월 FR10.5를 앞당기지 않습니다.

**PoC #19 연결**

공식 분석 책임 작업은 기존 **#19**이며 팀원 1의 담당 의사를 반영하되 실제 계정 배정은 확인해야 합니다. #26은 이 분석을 수행 완료로 대신 기록하지 않고 계획상의 필수 선행 입력으로 연결합니다.

1. **feasibility의 필수 입력:** 검토한 PoC 경로·리비전, 의존성, 입력·출력·오류 예시, 수집→전처리→묶음→후보/근거 흐름, 실행 조건·결과·미실행 한계, 유지/수정/제외 근거, 서비스 요구사항 차이, 재사용/재설계/추가 검증 목록.
2. **공식 수용 위치:** 새 intent의 `ideation/feasibility/feasibility-assessment.md`에 #19 결과의 정본·리비전·판단을 연결하고 미검증 사항은 `raid-log.md`에 남깁니다. 보고서를 새로 복제하지 않습니다.
3. **설계 전 시점:** domain-design을 시작하기 전에 개발·아키텍처 관점에서 PoC 결과와 남은 검증의 설계 영향을 확인합니다. 입출력·규칙·예외·검증 사례를 units-generation·contract-design 전에 공유하고, 해당 유닛 functional-design·code-generation·build-and-test의 입력으로 추적합니다.
4. **막힘 처리:** 분석 결과나 필요한 실행 검증이 없으면 설계 재사용 판단을 확정하지 않습니다. 독립 화면 초안은 계속 가능하지만, PoC 코드 복사·재사용을 전제로 한 일정 단축을 약속하지 않습니다. 규칙 기반 PoC 결과와 LLM 초안 생성 검증을 분리합니다.

**수동 배포 산출물 공급**

`deployment-pipeline`을 삭제하면 `environment-provisioning`의 `cd-config`, `deployment-execution`의 `cd-config`·`deployment-strategy`가 필수 입력을 잃습니다. 따라서 해당 단계와 아래 문서 계약을 보존합니다.

| 공식 위치 | 수동 배포 범위에서 작성할 내용 | 후속 사용 |
|---|---|---|
| infrastructure-design의 `cicd-pipeline.md` | PR 빌드·테스트와 사람의 수동 릴리스 경계, 버전·검증 결과 전달 | deployment-pipeline |
| deployment-pipeline의 `cd-config.md` | 고정 이미지/버전, 실행 설정, 환경변수 이름·비밀값 주입 경로, 볼륨·네트워크·서비스 순서·실행 명령 | 환경 준비·수동 배포 |
| 같은 단계의 `deployment-strategy.md` | 배포 전 점검·승인 책임, 자료 보존, 중단/재개, 성공 판정·실패 전환 조건 | 수동 배포·운영 판단 |
| 같은 단계의 `rollback-runbook.md` | 이전 버전 복귀, 데이터/스키마 호환·복원, 큐/진행 작업 처리, 검증·담당 | 배포·복구 연습 |
| environment-provisioning의 `validation-report.md` | 실제 접속·설정·권한·자료 저장 준비 확인 | 배포 시작 판단 |
| deployment-execution의 결과 문서 | 외부 URL·비로그인 열람·재시작 후 자료 유지·배포 버전·스모크 테스트 | 배포 완료 판단 |
| incident-response의 `runbooks.md`·`incident-plan.md` | 재배포 실패·서비스/워커 재시작·복원 연습의 조건·결과·잔여 위험 | performance-validation의 복구 기준 대조 |

자동 배포 트리거·환경 자동 승격·자동 rollback 파이프라인은 구축하지 않습니다. `cd-config.md`는 이름만 채우는 문서가 아니라 실제 수동 실행에 사용할 설정과 절차의 정본입니다. 단계 정의 파일은 수정하지 않습니다.

**재사용 근거**

- 첫 intent의 상태는 `Completed`, 8개 완료입니다. 의도·실현 가능성·범위·요구사항의 승인 기록을 보존합니다. 이전 의도·범위 문서의 당시 미결보다 후속 승인 요구사항이 우선합니다.
- 현행 근거는 첫 intent의 `requirements.md` 및 SC/백로그, MVP 입력 기준 `622416602cedbaaefec8a3becd19c7adefd0517a`, 후속 입력 `d7226c768330ab4c1e8c211d1f458fcda545db5e`입니다. `docs/ai-dlc-input/`는 새 근거로 읽지 않았습니다.
- 부모가 확인한 **#22 / PR #28**, commit `e4b5eee229b3f447b7e155ca1ab8f4e9669b29ea`의 홈 초안 v0.2는 실제 재사용 대상입니다. 빈 상태·진행·실패 등 상태와 §7 계약 미결을 함께 가져갑니다. 로그인 전 진입, 최근 분석 선정·이전 작업 재진입, 대표 없이 링크 발행 안내는 확인·보완 대상으로 남깁니다.
- #20·#21은 아직 제출물 확인이 없으므로 생성된 초안으로 계산하지 않습니다. 화면 작성 주체·정본·리비전을 확인한 뒤 가져오며 팀장 세션에서 중복 작성하지 않습니다.

**Scoring detail (advisory)**

| Component | Symbol | Score | Band |
|-----------|--------|-------|------|
| Intent Ambiguity | IAE | 0.25 | LOW |
| Codebase Structural Uncertainty | CSU | 0.60 | MED |
| Verification Entropy | VE | 0.85 | HIGH |
| Risk / Blast Radius | R | 0.70 | HIGH |
| Unresolved Assumptions | UA | 0.65 | MED |
| **Composite ARS (advisory)** | - | **61 / 100** | **Comprehensive** |

`method: fallback`

CodeKB 도구가 노출되지 않아 `workspace detect`의 Greenfield·스택/빌드 미탐지 결과와 현재 상태·제한된 입력 문서를 사용했습니다. 코드 호출 관계를 분석한 결과는 아닙니다.

첫 intent가 제품 행동·대상·통과 기준을 정리해 의도 모호성은 낮아졌습니다. 그러나 3개 신규 배포 단위와 비동기 처리의 통합, 서비스 실행 검증 근거 부족, 공개 권한·외부 AI·자료 복구 위험, PoC·계정·OQ 미결이 남아 설계·검증·운영 단계는 유지합니다.

Change Control은 현재 값 **relaxed**를 변경하지 않습니다. 승인 후 입력 변경을 기록·안내하면서 진행하는 정책이며 개별 단계 승인을 없애지 않습니다. 제안의 필수 입력 연결 검증은 이 정책과 별개로 **strict 모드**에서 통과했습니다.
