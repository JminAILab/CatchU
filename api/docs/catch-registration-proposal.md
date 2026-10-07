# 분석 결과 → Catch 등록 연결 — #105

> v0.11 · 2026-10-06. B 저장 구현의 안내이며, 실제 E 연결은 아래 연결 조건으로 확인한다.

## 구현 범위와 읽는 순서

[`registerCandidates`](../src/catches/registration-service.ts)는
E가 연 TypeORM 트랜잭션의 `EntityManager`를 받아 Catch·근거·후보별 등록 연결을 저장한다.
후보 준비 함수, 등록·보호 판단 엔티티, B 테이블 생성/되돌리기 마이그레이션을 포함한다.
별도 HTTP 등록 API나 새 F 실행은 만들지 않는다.

| 필요한 내용 | 문서 |
|---|---|
| 입력·반환, 저장·중복·보존, 내부 오류 | [내부 호출과 저장 규칙](catch-registration-rules.md) |
| 테이블 책임, 마이그레이션 순서, 테스트 DB와 실행 명령 | [DB 적용과 검사](catch-registration-database.md) |
| 수신·반영 트랜잭션, 보호 판단 공급, LIVE 출처와 재반영 조건 | [E 연결 조건](catch-registration-e-integration.md) |

B 저장 검사는 [PR #184](https://github.com/JminAILab/CatchU/pull/184)의 실제 회원·분석 기반을 사용한다.
E 수신 테이블도 실제 엔티티·마이그레이션을 사용하며, 기본 검사에 실제 E 반영 서비스와 B 등록 결합을 포함한다.
입력·수신 기록·보호 판단은 합성 준비물이므로 실제 수신부·worker까지의 전체 연결 검증과 구분한다.

[PR #143](https://github.com/JminAILab/CatchU/pull/143)의 B 저장 제공 범위와
[PR #205](https://github.com/JminAILab/CatchU/pull/205)의 E 제공분을 함께 검사한다.
실제 E/B 연결은 [#105](https://github.com/JminAILab/CatchU/issues/105), 장애·반복 실패 복구는 [#234](https://github.com/JminAILab/CatchU/issues/234)에서 추적한다.

## 근거

- [#105](https://github.com/JminAILab/CatchU/issues/105): 등록 함수·원자 저장·중복/실패 검증과 분담.
- [PR #143 팀장 결정](https://github.com/JminAILab/CatchU/pull/143#issuecomment-5865277945),
  [E 담당 동의](https://github.com/JminAILab/CatchU/pull/143#issuecomment-5865412468):
  빈 내용 후보 거부·전체 롤백·논리 입출력·테이블 분담.
- [PR #180 B 검토](https://github.com/JminAILab/CatchU/pull/180#pullrequestreview-5360213061),
  [E 검토](https://github.com/JminAILab/CatchU/pull/180#pullrequestreview-5360422822):
  기존 Catch의 저장소·MOCK/LIVE 불일치 거부와 기존 자료·수신 결과 보존.
- [계약 요약](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md),
  [API 기능 설계](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/functional-spec.md),
  [ERD](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/entities.md),
  [업무 규칙](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md):
  B/E/F 반영 경계·원자성·속성·유일성·등록 적합성.
- [worker 메시지](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml): 입력 후보의 정본.
- [10/4 팀장 조건](https://github.com/JminAILab/CatchU/issues/105#issuecomment-5975854918):
  실제 LIVE 연결의 근거 URL 대조와 실패·재시작 후 재반영 조건.

## 변경 이력

- v0.11 (2026-10-06): 실제 E 수신 테이블·후보 연결 FK를 검사에 반영하고, E·B 결합 검사를 기본 `npm test`에 포함했다. 실행 안내에서 E 테이블 대역 사전 준비를 제거했다.

- v0.10 (2026-10-06): 시작 안내·저장 규칙·DB 검사·E 연결 조건으로 나눴다.
  실제 회원·분석 기반과 E 검사 대역을 구분하고, #105 연결 조건과 #234 복구 분담을 명시했다.
  저장 동작·테스트 소스·완료 기준은 바꾸지 않았다.
- [v0.4~v0.9 변경 이력](https://github.com/JminAILab/CatchU/blob/16302527450a43bf9e6a24b7cad69dd6c199d696/api/docs/catch-registration-proposal.md#7-근거와-변경-이력)은
  분리 전 판본에 보존한다.
