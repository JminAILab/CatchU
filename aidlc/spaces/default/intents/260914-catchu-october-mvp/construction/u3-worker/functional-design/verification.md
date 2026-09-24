# worker Functional Design 검증

## 수행 결과

| 검사 | 결과 |
|---|---|
| 작성 확인·자동 연결 | Unit u3-worker 확인 등록 성공, 산출물 4개 ARTIFACT_CREATED가 현재 식별자에 연결 |
| 논리 정본 | entities/rules YAML 2블록 파싱, F 엔티티 4개·규칙 5개. 규칙 필수 설명 항목 존재 |
| Unit 배정 대조 | Units 정본의 U3 배정 FR2·FR2.1·FR2.2 3개와 일치. 모든 BR target 존재, 설명되지 않은 규칙 0개 |
| 문서 | functional-spec required-sections 통과, 질문/문서 상대 링크 32개 존재(이 검증 파일 추가 전 집계) |
| 보존 | 별도 intent 등 기존 미커밋 11개 해시 유지. 상류·구현 코드·PR #89 본문 미수정 |

## 추적성 센서의 미통과

자동 검사와 1회 직접 확인에서 `pass=false`, `missing_from_upstream_ids` 39개가 반환됐다. `gaps`, `orphans`, `missing_from_table`, `invalid_entries`, `invalid_targets`는 모두 빈 배열이다. 통과로 기록하지 않는다.

반환 목록: FR1, FR1.1~FR1.5, FR10, FR10.1, FR10.4~FR10.6, FR11, FR11.1~FR11.3, FR3, FR3.1~FR3.6, FR4, FR4.1~FR4.5, FR5, FR5.1, FR5.5, FR6.1, FR6.6, FR7.1, FR7.4, FR8.1, FR8.4, FR9.1, FR9.2.

위 항목은 U3의 주 배정 FR 밖이다. 이번 Unit의 실제 배정 3개와 규칙 연결은 별도 대조로 확인했다. 관측된 검사 범위 불일치와 코드 수준 원인을 구분하며, 검사 코드를 읽거나 수정하지 않았다. US/AC ID·타 Unit 요구를 추가해 통과시키지 않고 추가 직접 호출도 하지 않는다. manifest의 기본 심각도는 advisory이며 공식 완료가 차단되면 별도로 보고한다.

## 한계·추적

실제 생성·수집/외부 호출·DB·인증·코드 실행은 하지 않았다. 개발 이슈 보완·F 보존 위치/수명·E/F 전송과 B의 PR #89 병합 전 확인은 남는다. Contract 단독 실행은 열린 상태이며 그 수정은 담당 PR 리뷰로 확인한다.

확인 식별자: `4c0f1711a7a025293a116aa38829bd4ede6618620e365dac6412138dbd127099`. 자동 센서 기록: fire `3ad03286`. 독립 검토와 Unit 완료는 별도 공식 기록을 따른다.

독립 검토 1회: READY, 신규 지적 0건. [검토 사본](review.md)은 공식 기록의 body를 그대로 보존했다. 2026-09-23T07:26:52Z에 UNIT_COMPLETED(u3-worker, wave)가 성공했으며 다음 대상으로 u2-api가 반환됐다. 센서 미통과를 통과로 바꾸거나 우회하지 않았다. Functional 단계 전체의 최종 승인은 아직 남아 있다.
