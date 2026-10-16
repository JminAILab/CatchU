# 10월 Catch 등록 보호 기록 — #105

[10/15 팀장 결정](https://github.com/JminAILab/CatchU/issues/23#issuecomment-6189227348)을 구현한
[`OctoberRepositoryObservationSource`](../src/analysis-receiver/october-repository-observation.source.ts)는
GitHub의 현재 공개 여부를 조회하지 않고 **‘10월 관측 안 함(9/28 결정)’**을 명시한다.
`NONE`은 이 정책의 제한 없음이며 공개 상태를 확인했다는 뜻이 아니다.
Catch는 기존 규칙대로 PRIVATE로 등록되고, 확인과 공개 선택은 별도다.

## 연결 방법

기존 `RepositoryObservationSource`를 구현하므로 수신 모듈의 `observations`에 명시적으로 넘긴다.
정책 공급자를 기본값으로 등록하거나 제품 AppModule에서 자동 활성화하지 않는다.

```ts
// repositories: RegistrationRepositorySource — 신뢰된 저장소 좌표 제공자
const observations = new OctoberRepositoryObservationSource(repositories);
AnalysisReceiverModule.registerDatabase({ contractDirectory, observations });
```

좌표 제공자는 `findForRegistration(context)`에서 해당 시도에 사용한 저장소 좌표를 반환한다.
반환값은 `RegistrationRepositorySnapshot`이며 다음을 포함한다.

- 요청·시도·회원·저장소·동의 ID, 범위 판본, MOCK/LIVE 구분: 입력의 7개 값과 모두 일치해야 한다.
- `githubRepository: { owner, name }`: 허용된 GitHub 좌표 형식이어야 한다.
- 해당 자료가 없으면 `null`, 조회에 실패하면 예외를 전달한다. 결과 메시지의 URL에서 좌표를 만들지 않는다.

실제 좌표 조회 구현과 접수 측에 남은 연결은 [선정 저장소 좌표 연결](selected-repository-coordinates.md)을 따른다.
**결과 수신 뒤에는 분석 처리가 종결된 상태이므로, 종결 뒤에도 같은 시도의 좌표를 읽을 수 있어야 한다.**
진행 중에만 답하는 #232의 worker 요청 정보 API를 호출하거나 현재 저장소 이름으로 과거 좌표를 바꾸지 않는다.
MOCK은 명시적인 합성 좌표 제공자를 연결하고, LIVE 조회 실패를 MOCK으로 대체하지 않는다.

## 기록과 실패

공급자는 허용 필드만 새 객체로 반환한다. 좌표 제공자의 토큰이나 추가 필드는 전달하지 않는다.

| 저장 입력 | 의미 |
|---|---|
| `confirmedSourceState.observation = NOT_OBSERVED` | 공개·비공개를 확인하지 않았음 |
| `confirmedSourceState.sourceMode` | 검증된 MOCK/LIVE 구분 |
| `observationProvenance` | 정책 이름, ‘관측 안 함’ 설명, 결정 링크, 요청·시도 ID |
| `observedAt` | 이 정책에서는 **정책을 기록한 시각**. GitHub를 관측한 시각이 아님 |
| `appliedRestriction = NONE` | 10월 정책의 제한 없음. Catch의 PUBLIC과 별개 |

공급 부재·조회 실패·맥락 불일치·잘못된 좌표나 시각에는 정책 기록을 만들지 않는다.
기존 수신·반영 서비스가 `CATCH_NOT_READY`로 반영을 거부하며, 수신 기록은 남고 Catch는 저장되지 않는다.
저장에 성공할 때는 보호 기록·Catch·근거·등록 연결·E 반영 완료가 같은 트랜잭션에 들어간다.
중간 저장이나 커밋 실패 시 이 변경들은 함께 롤백한다.

기존 `SOURCE_PRIVATE` 제한과 그 근거를 유지해야 한다.
등록 이후 원본이 비공개로 바뀌는 것은 10월에 감지하지 않으며, 사용자는 Catch를 직접 숨길 수 있다.
나중에 실제 관측을 도입할 때는 공급자 교체와 함께 이전 ‘관측 안 함’ 기록의 재확인도 필요하다.

## 실제 활성화 전 연결

이 파일은 정책 공급자의 구현 안내다. 다음 연결을 대체하지 않는다.

- #252의 실제 선정·접수에서 [보관 좌표 판본](selected-repository-coordinates.md)의 참조를 저장하고 실제 동의 범위를 확정한다.
- #233의 큐 및 앱 조립에서 공급자를 명시적으로 전달하고 실제 왕복 검사를 한다.

기존 SOURCE_PRIVATE의 상태·출처·시각 보존과 LIVE 주소의 대소문자 구분 없는 대조는 [PR #317](https://github.com/JminAILab/CatchU/pull/317)로 반영됐다.
보호 행을 잠근 저장 트랜잭션 안에서 보존하며, 조회 단계에서 과거 값을 복사해 우회하지 않는다.

## 검사

`api/`에서 폐기 가능한 `_test` DB를 지정하고 실행한다.

```powershell
npm test -- test/analysis/october-repository-observation.test.cjs test/integration/analysis-intake-receiver.test.cjs test/integration/receiver-registration.test.cjs
```

- 단위: MOCK/LIVE, 7개 맥락 대조, 좌표 부재·조회 실패·잘못된 시각, 추가 정보 비전달.
- 실제 API·DB: 접수 → 합성 결과 주입 → 정책 공급 → Catch 저장 → 본인 목록·상세 → 확인 → 공개·숨김.
  타인 조회 거부, 중복 결과 보존, 공급 실패, Catch 저장 실패의 전체 롤백도 검사한다.
- 분석 결과와 좌표는 합성 자료다. 실제 Google/GitHub·LLM·큐 전송·C의 링크 HTTP 전체 흐름이나
  운영 환경의 전체 연결을 검증했다는 뜻은 아니다.
