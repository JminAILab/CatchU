# 실제 선정 저장소 좌표 연결 — #105·#252

10/16 담당자 요청으로 아래 두 저장소를 **로그인한 모든 회원**의 선정 대상으로 등록한다.
GitHub 연결과 유효한 분석 동의는 계속 필요하다. 현재 구현은 서버 내부 자료와 Catch 등록 조회 접점이며,
목록 API나 LIVE 분석 접수를 활성화한 상태는 아니다.

| 저장소 | repositoryId | 선정 좌표 판본 |
|---|---|---|
| [ljm0850/TheMe](https://github.com/ljm0850/TheMe) | `570342307` | `catchu:selected-repository:2026-10-16:570342307:v1` |
| [ljm0850/BEASTA-ZOO](https://github.com/ljm0850/BEASTA-ZOO) | `547322698` | `catchu:selected-repository:2026-10-16:547322698:v1` |

GitHub 메타데이터의 고유 숫자 ID를 문자열로 쓴다. 두 저장소는 10/16 메타데이터 확인 당시 공개·비보관 상태였다.
이 확인을 분석 시점의 공개 관측이나 분석 허가로 사용하지 않는다. 소스 내용은 수집하지 않았다.

## 보관과 등록 조회

`SelectedRepositoryCatalog`는 현재 목록과 과거 좌표 판본을 분리한다. 선정 제외는 현재 참조 목록만 바꾸고,
이름·소유자가 바뀌면 새 판본을 추가한다. 요청이 참조한 이전 판본을 수정·삭제하지 않는다.

`SelectedRepositoryRegistrationSource`는 저장된 요청·시도·동의를 같은 DB 스냅샷으로 읽고 일곱 맥락을 대조한다.
동의의 기존 `selectionReference`로 보관된 좌표를 읽는다. 새로운 동의 JSON 속성이나 DB 관계는 추가하지 않는다.
종결·닫힌 요청도 읽고, 현재 GitHub 연결·현재 선정 여부로 과거 좌표를 바꾸지 않는다.
모르는 참조·합성 참조·불일치는 `null`, DB 장애는 예외다. 결과 URL에서 좌표를 추측하지 않는다.

```ts
// LIVE 결과 등록용 예시. 수신 모듈 또는 큐 모듈 중 한 곳에서만 조립한다. AppModule에는 아직 등록하지 않는다.
AnalysisReceiverModule.registerDatabase({
  contractDirectory,
  observationsFactory: db => new OctoberRepositoryObservationSource(
    new SelectedRepositoryRegistrationSource(db),
  ),
});
```

`AnalysisQueueModule.register`도 같은 `observationsFactory`를 받는다. 기존 `observations` 객체와는 둘 중 하나만 쓴다.
[10월 정책](october-registration-policy.md)에 따라 공개 여부는 관측하지 않고 Catch는 처음 PRIVATE로 저장한다.

**위 예시는 LIVE 전용이다.** 이 좌표 공급자는 MOCK에 `null`을 반환하므로, 이것만 연결하면 후보가 있는 MOCK 결과는 `CATCH_NOT_READY`로 등록되지 않는다.
큐에서 MOCK 결과도 반영하려면 MOCK 맥락을 검증하는 별도의 명시적 합성 좌표 공급자를 함께 준비하고, `sourceMode`에 맞게 공급자를 선택하도록 연결해야 한다.
이 선택은 한 개의 `observations` 또는 `observationsFactory` 안에서 조립하며, 두 옵션을 동시에 넘기지 않는다.
별도 MOCK 공급은 이 구현에 포함되지 않는다. LIVE 좌표 조회 실패를 합성 좌표로 대체하지 않는다.

## 고지와 실제 실행 연결

실제 분석 고지·판본은 [#322](https://github.com/JminAILab/CatchU/issues/322)에서 확정해 [PR #328](https://github.com/JminAILab/CatchU/pull/328)에 반영했다. 고지 제공과 LIVE 접수 활성화는 별개다.

- **선정 공급 — A·[#252](https://github.com/JminAILab/CatchU/issues/252):** 현재 선정의 DB 정본으로 목록·접수 재확인·worker 선정 판정에 필요한 정보를 공급한다. 과거 좌표 조회는 같은 선정 참조와 보관 판본을 사용한다. 이 등록 조회는 현재 접수 자격이나 실행 허가 API(#232)를 대신하지 않는다.
- **실제 접수 — E·[#323](https://github.com/JminAILab/CatchU/issues/323):** #322의 실제 고지 판본과 #252의 현재 선정·범위 판본을 대조하고, 선정 참조를 기존 동의 형식에 보존하고 실제 요청의 첫 시도를 LIVE로 저장한다. 개발 접수는 MOCK을 유지한다.
- **앱·큐 조립 — E·[#233](https://github.com/JminAILab/CatchU/issues/233):** LIVE·MOCK에 맞는 공급자를 명시적으로 연결한 뒤 실제 worker 왕복을 검사한다.

## 검사 범위

전용 PostgreSQL에서 두 실제 저장소 좌표에 **합성 동의와 분석 결과**를 붙여 수신 → 좌표 조회 → Catch·근거 저장 → 본인 조회를 검사한다.
일곱 맥락 불일치, 과거 판본, MOCK 거부, 조회 장애, 다른 저장소 근거, 중복 결과도 검사한다.
실제 회원의 동의·GitHub 자료 수집·LLM 분석·운영 DB 검증은 아니다.
