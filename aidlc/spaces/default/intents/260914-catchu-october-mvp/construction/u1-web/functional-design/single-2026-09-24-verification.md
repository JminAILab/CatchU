# 2026-09-24 Functional Design 정정 — 검증과 단독 실행 상태

이번 기록은 U1 web·U2 api·U3 worker의 지정 네 파일을 함께 다룬다. [이번 질문·확인](single-2026-09-24-questions.md)은 이전 본 흐름 질문과 별도 파일로 보존한다. 근거는 PR #97의 `3434ffc`에 있는 후속 입력 9/24 절이며, 로컬 `docs/`의 과거 판본을 수정하지 않았다.

## 반영·검증

| 항목 | 결과 |
|---|---|
| U2 entities | CatchAsset title 필수 string/min_length 1, F 생성·구직자 수정 불가. 기존 sourceRequest에서 유도한 repositoryId를 회원 응답·목록 필터에 연결; DB 칼럼 추가 없음 |
| U3 rules | BR3.2에 title 짧은 작업 명사구·평가/없는 사실 제외·workFacts 첫 항목 대체 규칙 추가. BR3.4의 초안 실패/후보 적합성 분리 유지 |
| U2 functional-spec | PublicCatch title 추가, OQ-B1 행을 B 등록+E 반영 완료 단일 트랜잭션 결정으로 변경 |
| U1 functional-spec | 옛 rough-mockups 배치를 대체하는 필수 문장과 상대 링크, Catch 탭·연결 관리·네 아이콘·상세 문구·동의 재요청·필터/상세 모달·주소·복귀·담당 및 접점 세 곳 반영 |
| 화면 보존 | 기존 화면 상태 전이 표와 W1~W8의 계약/판정 주체가 HEAD와 동일. W1·W2·W3·W4·W8에는 구조 절 참조만 추가; W5·W6·W7 행 동일 |
| YAML·모델 | 변경한 entities/rules의 YAML 블록 2개 파싱 통과. 허용한 title·repositoryId 제약·BR3.2 logic만 원복한 파싱 객체가 HEAD와 동일. ERD 관계·유일성, Mermaid ER 그림 동일 |
| 계약 연결 | PublicCatch 본문 세 곳의 title, OQ-B1 두 곳의 결정 문장 확인. 전체 계약 YAML/$ref/required 검증은 [Contract 검증](../../../inception/contract-design/single-2026-09-24-verification.md)에 기록 |
| required-sections | 변경 Markdown 4개 통과. H2 수 web spec 7, api entities 4, api spec 10, worker rules 3; findings 0 |
| upstream-coverage | 세 유닛 모두 통과. unit-of-work·unit-of-work-story-map·requirements·components·contract-summary 참조 누락 0 |
| traceability | web FAIL 43, api FAIL 23, worker FAIL 39. 기존 검증과 동일한 센서 범위 한계이며 통과로 바꾸지 않음 |
| linter/type-check | 해당 없음. manifest 적용 대상은 TS/JS/TSX이며 이번 Markdown 변경에 해당 코드 조각 없음 |
| 변경 범위 | 시작 시 627개 파일 해시와 대조해 기존 파일 변경은 요청 산출물 10개와 이번 감사 기록에 한정. 보호한 요구사항·ideation·domain-design·하네스·docs 및 기존 미커밋 변경 유지 |
| 보호 문구·상태 | OQ-B1 외 B 확인 조건과 중복 등록 금지 문구 유지. main aidlc-state.md는 HEAD와 바이트 동일, Completed 유지 |

검사 위치는 `/Users/ljm/Desktop/github/CatchU-mvp-recovery-20260922`, 기준 HEAD는 `483bdbb`이며 이번 미커밋 수정본을 검사했다. Ruby YAML 파싱과 Python/git 대조를 사용했다. `sensor-required-sections`, `sensor-upstream-coverage`, `sensor-traceability`는 각 대상에 한 번씩 실행했다. 제품 구현·실제 API/DB·외부 수집·LLM 호출은 시험하지 않았다.

추적 센서는 web의 전역 FR 20개 누락·W 대상 22개의 BR 요구·rules.md 부재, api/worker의 주 배정 밖 FR 23/39개를 보고한다. gaps/orphans/invalid_entries는 없으며 api/worker invalid_targets도 없다. 이전 각 유닛의 verification.md·review.md에서 같은 한계를 확인했고 traceability.json 세 파일은 HEAD와 바이트 동일하다. 재호출·가짜 BR/US 생성·요구사항 재배정·검사 우회는 하지 않았다.

## 확인·검토·완료 기록 — 2026-09-24

현재 상태는 **Functional Design 공식 독립 검토·단독 완료 성공 / 잔여 검토 의견 R-01 미해결**이다.

- 08:20:50Z: `single-stage:functional-design` STAGE_STARTED. 유닛별 본 흐름 재개가 아닌 stage-level 단독 실행으로 진입했다.
- 08:25:54Z: 사용자 `Looks correct` 뒤 SUMMARY_CONFIRMATION_RECORDED. 확인 식별자는 `d275bf56b1f143a217d53eb694d808016718deefd73a84ffbb26ae5054202098`이다.
- 08:32:36Z: `aidlc engine log review --stage functional-design --single --reviewer aidlc-architecture-reviewer-agent --iteration 1` 성공. Request ID는 `review:858b8755bdcd6e07c0eac00aa6710db7`이다.
- 기존 relaxed 설정에 따라 CHANGE_ACCEPTED도 남았다. 이전 검토 이후 변경과 web spec/traceability의 저장 확인 식별자 차이를 알리는 기록이며, 이번 작업에서 설정을 바꾸거나 재저장·추가 확인으로 기록을 맞추지 않았다. 사용자 확인은 수정 전에 성공했고 기존 traceability는 수정하지 않았다.
- 지정 독립 reviewer는 전달된 산출물·공유 계약을 검토하고 검토 파일만 작성했다. READY, Critical 0·Major 1이다. 아래 검토 본문 사본은 미해결 의견을 포함한다.
- 08:38:48Z: 같은 review 명령에 `--verdict READY`를 더한 완료 기록 성공. REVIEW_COMPLETED의 요청/산출물 fingerprint는 모두 `sha256:793ce2e3088644826e35d9dc42bd253994630d84ae1da963ba7e6a5616240acf`다.
- 공식 검토 record는 `.aidlc-reviews/functional-design/stage/8341c5931957f34b/1.json`, digest는 `sha256:5679c0213a93ec0cfa94a3a1f2c2b45705c871dc8023d7c333d6b183ec360908`이다. machine-local ignored record를 직접 수정하거나 강제로 stage하지 않는다. 공유 검증을 위해 아래에 검토 본문을 그대로 보존한다.
- 08:38:56Z: `aidlc engine orchestrate report --single --stage functional-design --result completed`를 한 번 실행해 `kind: done`과 STAGE_COMPLETED를 받았다. 본 흐름 Current Stage는 변경되지 않았다.

## 이번 정정의 단계별 상태와 남은 확인

| 단계 | 공식 검토 | 단독 완료·후속 |
|---|---|---|
| [Contract Design](../../../inception/contract-design/single-2026-09-24-verification.md) | 이번 요청 1회 거부 | report 1회 거부. 9/23 R-01·R-02와 같은 열린 차수 안에서 별도 문서로 구분 |
| [Units Generation](../../../inception/units-generation/single-2026-09-24-verification.md) | 요청 1회 거부 | report 1회 거부. 열린 차수에 이후 변경도 쌓이므로 별도 문서 필요 |
| [Delivery Planning](../../../inception/delivery-planning/single-2026-09-24-verification.md) | 지정 reviewer 없음 | report 1회 거부. 열린 차수에 이후 변경도 쌓이므로 별도 문서 필요 |
| Functional Design | READY / Major R-01 New | report 1회 성공. 정상 단독 완료; 팀장 PR 확인·R-01 해결을 뜻하지 않음 |

거부된 세 단계는 단독 질문 파일 범위 결함에 따른 것으로, 실패한 호출을 재실행하거나 질문 이동·추가 영수증·검사 우회를 하지 않았다. 2.10.0과 upstream main에도 결함이 남아 있다는 점은 사용자 조사 결과에 따른다. 버전은 2.8.1로 유지했다. 상태·감사 파일은 직접 수정하지 않았다.

R-01은 새 OQ-B1 결정과 기존 “B 저장 뒤 E 실패·E 메타데이터만 복원” 설명의 정합성 쟁점이다. 지정 OQ-B1 행 밖 설명은 임의 수정하지 않았다. 단일 트랜잭션의 저장 실패와 커밋 후 확인 유실을 구분할 필요가 있으며, 이 쟁점을 PR #89 팀장 확인에 함께 제시한다. READY·단독 완료를 의견 해결이나 위험 수용으로 취급하지 않는다. 관계·유일성 변경 없이 E↔B 등록 개발 이슈에서 설명을 정리할 수 있다.

**엔진 결함(2.10.0에도 남음)으로 단독 실행의 차수 분리·완료가 불가한 단계는 문서로 변경 건을 구분하고, 수정본은 PR #89 팀장 확인으로 확인한다.**

아래는 공식 검토 파일의 본문 사본이다.

## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-09-24T08:37:04Z
**Iteration:** 1

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md > 업무 흐름 F4(39행), 동시성과 일관성의 B 저장 뒤 E 장애(75행), OQ-B1(108행) | 9/24 OQ-B1은 B 등록과 E 반영 완료 기록의 단일 트랜잭션을 확정했지만, 기존 F4는 B 저장 후 E 기록을 별도 순서로 설명하고 장애 행은 B 자료를 보존한 채 E 메타데이터만 복원한다고 명시한다. 개발자가 B만 먼저 커밋하는 복구 설계로 읽을 수 있어 새 결정과 기존 설명의 원자성 경계가 일치하지 않는다. | E↔B 등록 개발 이슈에서 단일 트랜잭션의 저장 실패와 커밋 후 응답·확인 유실을 구분하고, 현행 설계의 장애 설명을 그 구분에 맞춘다. 이번 지정 수정 범위를 유지하는 경우 이 잔여 정합성 쟁점을 PR #89 팀장 확인에 함께 제시한다. 관계·유일성 변경은 필요하지 않다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| 독립 Ruby YAML 파싱·참조 순회 | PASS: 공유 계약 YAML 4개, 그 안의 `$ref` 177개 해석, required/properties 객체 43개 대조. api/worker entities·rules의 YAML 블록 4개 파싱 | 이번 리뷰가 직접 실행한 읽기 전용 검사다. 요약 문서 YAML까지 포함한 전체 198개 참조 PASS는 아래 전달받은 검증 결과와 구분한다. |
| 독립 Ruby 계약·ERD·규칙 비교 | PASS: Candidate/Catch/PublicCatch의 title 필수 string/minLength 1, Catch repositoryId 필수·PublicCatch 제외, CatchAsset title 필수·repositoryId 별도 칼럼 없음 | entities의 허용된 title·유도 제약 변경을 제외한 파싱 객체는 HEAD와 동일하다. worker는 BR3.2 logic 외 파싱 객체가 동일하며 BR3.4의 초안 실패/후보 적합성 분리를 보존했다. |
| 독립 Python 화면·링크·추적표 비교 | PASS: 기존 화면 상태 전이 표, W1~W8 판정 주체, W5~W7 행 유지; 후속 입력 상대 링크 해석; 세 traceability 파일 HEAD와 바이트 동일 | 실제 9/24 입력은 로컬 과거 판본 대신 `git show 3434ffc:docs/ai-dlc-input-mvp/2026-09-14_followup.md`의 해당 절을 읽어 대조했다. api/worker 추적표의 BR 참조 대상도 존재한다. web에 BR 파일을 요구하지 않았다. |
| 오케스트레이터가 전달한 전체 계약 검증 | PASS: YAML 4개와 요약 YAML 3개, 전체 `$ref` 198개, required/properties 43개, optional repositoryId와 sourceRequestId AND 조건 | 공유 계약 경계와 이번 기능 설계의 응답·필터 설명이 일치한다. |
| required-sections / upstream-coverage | 전달받은 실행 결과 PASS: 변경 Markdown 4개 / 유닛 3개 | 재호출하지 않았다. 구조·출처 참조 통과는 R-01의 의미상 정합성 문제를 검출한 것으로 간주하지 않는다. |
| traceability | 전달받은 실행 결과 FAIL: web 43, api 23, worker 39 | 기존 센서의 전역 FR 대조와 UI의 BR/rules 전제에 따른 결과다. 이번에 변경하지 않은 추적표에 대한 기존 한계로 구분하며 통과로 바꾸지 않는다. gaps/orphans/invalid_entries 없음, api/worker의 invalid_targets 없음은 전달받은 결과다. 센서 재호출·가짜 BR·검사 우회는 하지 않았다. |
| linter / type-check | N/A | 단계 정의상 TS/JS 코드 형태 검사다. 이번 변경은 Markdown 설계이며 해당 코드 조각을 추가하지 않았다. 제품 코드·실제 처리 시험 결과로 해석하지 않는다. |

### Summary

이번 네 파일은 사용자 지정 title 생성·저장, repositoryId의 기존 요청 연결 유도, PublicCatch title, OQ-B1 결정 행 및 내 자산 화면 구조를 반영했다. 특히 이전 rough-mockups의 화면 배치를 대체하는 명시 문장, 네 상태 아이콘과 기존 상세 상태 구분, 새 동의 재요청, 저장소 이름 결합, 주소 파라미터·복귀와 담당 접점 세 곳을 확인했다. 보호된 요구사항·이전 단계의 재작성이나 ERD 관계·유일성 변경을 요구하지 않는다.

R-01은 이번 지정 행 밖에 남은 설명과 새 결정 사이의 쟁점이다. 같은 현상은 `construction/u2-api/functional-design/entities.md`의 CandidateRegistration 설명(197행)·물리 스키마의 등록·반영 행(232행), 공유 `inception/contract-design/contract-summary.md`의 90행에도 있다. B 저장과 E 기록의 순서 자체는 한 트랜잭션 안에서도 가능하고, 커밋 후 응답·확인 유실을 기존 등록 연결로 재확인하는 해석도 가능하다. 다만 현재 문서에는 그 실패 시점이 한정되지 않고 “E 메타데이터만 … 복원”을 요구하므로, 이미 함께 커밋된 기록의 재확인이라는 뜻으로 확정할 근거가 부족하다. 새 OQ-B1 결정을 우선하여 구현해야 하며 이 의견을 해결·위험 수용으로 임의 처리하지 않는다.

Critical 0건, Major 1건이므로 지정 reviewer 판정 규칙에 따라 READY다. 이는 잔여 의견이 없다는 뜻이나 PR #89 팀장 확인·단독 실행 완료 기록을 대신한다는 뜻은 아니다. 검토자는 지정 리뷰 파일만 작성했고 산출물·상태·감사·하네스는 수정하지 않았다.
