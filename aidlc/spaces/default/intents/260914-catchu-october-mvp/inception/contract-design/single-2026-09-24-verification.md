# 2026-09-24 계약 정정 — 검증과 단독 실행 상태

같은 실행 차수에 9/23 R-01·R-02(90bf289)와 9/24 변경이 함께 기록된다. 엔진 결함 때문에 차수를 나눌 수 없어 문서로 구분한다

## 반영·검증

| 항목 | 결과 |
|---|---|
| title | worker-messages.yaml Candidate, common.yaml Catch·PublicCatch에 필수 string/minLength 1 추가 |
| repositoryId | common.yaml Catch에만 필수 string/minLength 1 추가. PublicCatch에는 없음 |
| 목록 | member-api.yaml listCatches에 선택 query repositoryId 추가. sourceRequestId와 함께 주면 두 조건을 모두 만족하는 본인 Catch만 반환하도록 명시 |
| 본문 | contract-summary.md catches 설명에 저장소 필터, PublicCatch 투영에 title 추가. OQ-B1 행을 9/24 단일 트랜잭션 결정과 개발 이슈 후속으로 변경 |
| YAML 문법 | 계약 YAML 4개와 본문 YAML 블록 3개 파싱 통과 |
| 참조·필수 필드 | `$ref` 198개 해석 성공. required/properties 정합성 43개 검사 통과 |
| 추가 범위 | title 3곳·회원 repositoryId·선택 query/AND 문구 확인. 허용 추가분을 제거한 파싱 결과가 HEAD의 common·worker·member YAML과 동일 |
| required-sections | contract-summary.md H2 11개, findings 0, pass true |
| upstream-coverage | unit-of-work·unit-of-work-dependency·components·requirements 참조, 누락 0, pass true |
| 보존 | recipient-api.yaml, 본 흐름 질문·review.md, 9/23 single-r01-r02 질문·검증 파일은 HEAD와 바이트 동일. 9/23 Receipt·목록 형식 정정 유지 |
| 변경 공백·범위 | git diff --check 통과. 시작 시 해시와 비교해 감사 기록·요청한 산출물 외 기존 파일 모두 보존 확인 |

YAML 검증은 설치된 Ruby YAML 파서로 수행했다. 실제 API 구현·자료 전송은 하지 않았다. DB 칼럼·ERD 관계·유일성, 기존 공개/미공개·불일치 의미, 중복 등록 금지와 OQ-B1 외 B 확인 조건은 바꾸지 않았다. entities·worker 규칙·web/api 기능 설계의 대응 변경은 functional-design의 별도 질문·검증 기록에서 다룬다.

## 확인·검토·완료 기록 — 2026-09-24

현재 상태는 **계약 정정·자체 검증 완료 / 공식 독립 검토·단독 완료 미완료**다.

- `contract-design --single` 진입 뒤 감사의 시작 경계는 2026-09-23T07:02:00Z의 `single-stage:contract-design` 한 건이다. 새 차수의 STAGE_STARTED나 기존 실행의 STAGE_COMPLETED는 생성되지 않았다.
- 08:09:04Z: [이번 질문 파일](single-2026-09-24-questions.md)의 요약 확인 질문을 기록했다.
- 08:11:42Z: 사용자의 `Looks correct` 응답 뒤 SUMMARY_CONFIRMATION_RECORDED 성공. 확인 식별자는 `43cef67750f5d9368beaad068343d11a69714d0d372f0e9698b9b89638701a9b`, workflow=`single-stage:contract-design`이다.
- 확인 뒤 계약 4개 파일을 수정했으며 도구의 ARTIFACT_UPDATED 기록에 이번 확인 식별자가 연결됐다.
- 08:13:47Z: `aidlc engine log review --stage contract-design --single --reviewer aidlc-architecture-reviewer-agent --iteration 1`을 이번 변경에 대해 한 번 실행했으나 SUMMARY_RECEIPT_MISSING으로 거부됐다. 독립 검토나 완료 영수증은 만들지 않았다.
- `aidlc engine orchestrate report --single --stage contract-design --result completed`도 이번 변경에 대해 한 번 실행했다. 반환값은 `kind: error`, `Refusing to complete "contract-design": no fresh human-backed consolidated summary confirmation is recorded.`이며 완료 처리되지 않았다.

감사 기록은 도구가 남긴 질문·확인·산출물 변경·CHANGE_ACCEPTED·ERROR_LOGGED를 그대로 보존한다. CHANGE_ACCEPTED는 relaxed 설정의 기존 검토 이후 변경 기록이며 이번 독립 검토 성공이 아니다. 본 흐름 aidlc-state.md의 Completed 상태는 변하지 않았다. 상태·감사 직접 수정이나 실패한 호출의 재실행은 하지 않았다.

## 결함과 후속 확인

단계 폴더의 모든 `*-questions.md`를 선택하는 `.codex/tools/aidlc-lib.ts`의 questionFilesInDir·summaryQuestionFiles(7775행 부근)와 요약 확인 검사(8237행 부근)가 본 흐름 질문 파일에도 single-stage 확인을 요구한다. 범위 축소는 유닛별 단계에만 적용된다(8376행 부근). 이번 확인 자체는 기록됐지만 전체 질문 파일 검사에서 거부됐다. 2.10.0과 upstream main에도 결함이 남아 있다는 점은 사용자 조사 결과에 따른다. 버전은 2.8.1 그대로다.

사용자 지시대로 실행을 열어 둔다. 이후 contract-design 변경도 같은 차수에 쌓이므로 별도 질문·검증 문서로 구분한다. 질문 이동·추가 영수증 생성·검사 우회 없이, 9/23 기록과 이번 기록을 함께 보존한다. 수정본의 확인은 PR #89 팀장 확인으로 진행하고 이 문서를 공식 단독 완료 기록으로 취급하지 않는다.

**엔진 결함(2.10.0에도 남음)으로 단독 실행의 차수 분리·완료가 불가한 단계는 문서로 변경 건을 구분하고, 수정본은 PR #89 팀장 확인으로 확인한다.**
