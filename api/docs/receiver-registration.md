# 실제 수신 DB 저장과 E/B 반영 조립 — #105

## 연결 범위와 사용

[#139 메시지 수신](https://github.com/JminAILab/CatchU/issues/139)의 `AnalysisReceiver` 검사·지문·중복 판정, [#205 E 반영](https://github.com/JminAILab/CatchU/pull/205)의 트랜잭션·실패 기록, [#143 B 등록](https://github.com/JminAILab/CatchU/pull/143)의 `registerCandidates`를 재사용한다. [수신 계약](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md#w--worker-메시지-계약)·[트랜잭션 규약](../CONVENTIONS.md#트랜잭션-규약)이 기준이다. 신규 엔티티·마이그레이션·HTTP 경로는 추가하지 않는다.

`AnalysisReceiverModule.registerDatabase({ contractDirectory, observations })`는 실제 `DatabaseModule`을 사용해 `DatabaseReceiverStore`, `AnalysisReceiver`, `AnalysisRegistrationService`, `DevAnalysisInjection`을 제공한다. `contractDirectory`는 `worker-messages.yaml`·`common.yaml`이 있는 절대 경로이며, `observations`는 아래 필수 공급 인터페이스다. 기본 가짜 공급자는 없다. 실제 공급·전송 호출자가 없는 `AppModule`에는 이 모듈을 자동 활성화하지 않는다.

```ts
// 내부 worker 전송 연결부에서 Nest가 제공한 service를 사용한다.
// transport는 별도로 인증된 내부 전달 경로이며 회원 JWT를 worker 인증으로 쓰지 않는다.
const outcome = await service.receiveResult(message, async receipt => {
  if (receipt) await transport.sendReceipt(receipt);
});
// outcome.application은 실제 최종 반영 커밋이 성공했을 때만 존재한다.
// 진행 이벤트에는 Receipt가 없고, 같은 서비스의 receiveProgress(message)를 사용한다.
```

이 예시의 `transport`는 구현된 큐나 새 외부 API 계약을 의미하지 않는다. [#233 큐 연결](https://github.com/JminAILab/CatchU/issues/233)에서 인증된 실제 호출자를 연결해야 한다. `receiveResult`는 수신 DB 커밋 → Receipt 알림 callback → 새 수락 결과만 보호 조회·반영 순서다. callback 실패 시 수신 기록은 남고 반영은 호출하지 않는다. 같은 결과 재전달은 `DUPLICATE`로 끝내며 자동 재반영하지 않는다. Receipt 수락은 Catch 등록 완료를 뜻하지 않는다.

개발 주입은 기존 `DevAnalysisInjection.inject`의 본인·MOCK·환경 제한을 유지한다. 위 DB 모듈에 등록된 주입은 실제 수신 저장과 E/B 반영을 호출한다. 결과는 `{ receipt, application? }`이며 원문 `accepted`를 외부에 반환하지 않는다. 이는 내부 반환값이고 새 공개 API 계약이 아니다. 개발 주입에서는 별도 전송이 없어 Receipt callback은 아무 동작도 하지 않는다. 운영 공개 주입 라우트는 만들지 않는다.

## 저장과 실패

요청 → 현재 시도 → 수신 기록을 잠그고 요청의 동의·회원·저장소·범위·자료 방식을 조회한다. `ProcessingEvent`는 현재 처리 상태와 서버 `updatedAt`을 저장하며 이벤트 원문은 저장하지 않는다. worker의 `observedAt`을 서버 처리 시한으로 사용하지 않는다. 닫힌 요청·종결 처리 상태에 늦은 진행 관측을 적용하지 않는다.

새 `Result`는 수신 메타데이터, 처리 종결값, 적합 후보 수, `failures`, `PENDING`을 먼저 별도 커밋한다. 수신 테이블의 기존 유일성·FK를 사용한다. 이후 B 등록·보호 관측 저장·E `APPLIED/CLOSED` 기록에는 **같은 EntityManager**를 사용한다. 반환의 `registeredCatchIds`·`ownerResultsReady`는 [기존 반영 기준](result-application.md#테이블원자성재반영)을 따른다. 후보 없는 정상 0건·실패는 보호 공급을 조회하지 않으며, 열람 준비를 true로 만들지 않는다.

중간 저장·최종 커밋 실패는 이번 보호 관측·Catch·근거·후보 연결·E 완료 변경을 모두 롤백한다. 먼저 커밋한 수신 기록과 기존 Catch는 보존한다. 기존 E 서비스가 별도 트랜잭션으로 현재 시도의 `APPLY_FAILED`를 기록하고, 뒤늦은 실패로 다른 성공·시도를 덮어쓰지 않는다. 실패 기록까지 실패하면 호출은 실패하며 `FAILURE_RECORDING_FAILED`를 안전한 로그에 남긴다. 수신 저장 실패는 기존 `ReceiverStorageError`, Receipt 전달 실패는 `AnalysisReceiptDeliveryError`, 반영 호출 실패는 `AnalysisRegistrationError`다. DB 오류·후보 원문·서명 키·토큰·공급자/전송 오류 원문을 응답/로그로 전달하지 않는다.


[동시 공개·반영 교착 리뷰](https://github.com/JminAILab/CatchU/pull/244#discussion_r4203953397)를 반영해 B `OwnerCatchStore.setVisibility`의 Catch 잠금은 `FOR NO KEY UPDATE OF c`다. 공개·숨김은 키를 변경하지 않으므로, 같은 Catch를 참조하는 새 후보 연결의 외래 키 검사(`KEY SHARE`)와 공존한다([PostgreSQL 16 행 잠금](https://www.postgresql.org/docs/16/explicit-locking.html#LOCKING-ROWS)). 공개의 확인 항목·보호 제한 검사와 보호 행의 `FOR SHARE`는 유지하며, 동시 공개 변경끼리는 계속 직렬화된다. 보호 관측을 별도 선커밋하지 않고 기존 보호·B 등록·E 완료의 동일 트랜잭션과 전체 롤백을 유지한다.

## 보호 관측과 LIVE 근거 주소

`RepositoryObservationSource.observe(context)`는 검증된 요청·시도·회원·저장소·동의·범위·자료 방식으로 신뢰 경로를 조회한다. 반환값에는 다음이 필요하다. 토큰은 반환하지 않는다.

- 동일 회원 UUID와 저장소 ID
- 연결된 GitHub 저장소의 소유자·이름
- 명시적인 `confirmedSourceState`·`observationProvenance` 객체와 유효한 `observedAt`
- 확인된 `appliedRestriction` (`NONE` 또는 `SOURCE_PRIVATE`)

공급자 조회는 반영 트랜잭션 밖에서 수행한다. 공급 부재·조회 실패·맥락 불일치·관측 근거 부재는 `NONE`이나 열람 준비 완료로 보정하지 않는다. 후보가 있는 결과는 기존 B의 `CATCH_NOT_READY` 분류로 반영 실패 처리한다. 이전 유효 관측은 실패로 덮어쓰지 않는다. 명시적 새 공개 관측도 기존 `SOURCE_PRIVATE` 제한을 자동 해제하지 않는다([보호 업무 규칙](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/construction/u2-api/functional-design/rules.md)).

[10/4 팀장 조건](https://github.com/JminAILab/CatchU/issues/105#issuecomment-5975854918)에 따라 LIVE 후보의 모든 근거 주소는 공급자가 확인한 `https://github.com/<owner>/<repo>/`로 시작해야 한다. 파싱된 origin·정규화된 경로도 대조해 위장 호스트·다른 저장소·상위 경로 이동을 거부한다. [10/15 후속 결정](https://github.com/JminAILab/CatchU/issues/105#issuecomment-6189230335)에 따라 소유자·저장소 이름은 대소문자를 구분하지 않고 대조하며, 저장하는 근거 주소는 원문을 유지한다. 주소를 조회하거나 redirect를 따르지 않는다. 주소 불일치는 기존 B의 `INVALID_INPUT / evidence.sourceUrl` 분류다. MOCK의 `example.invalid` 합성 주소에는 이 대조를 적용하지 않는다.

## 실제 공급과 후속 경계

[#231 실제 GitHub 연동](https://github.com/JminAILab/CatchU/issues/231)은 회원 ID로 계정·토큰·만료 시각을 공급할 접점, [#232 worker 요청 정보 조회](https://github.com/JminAILab/CatchU/issues/232)는 저장소 좌표·동의 범위를 조회할 접점을 정의한다. 현재 dev에는 이 실제 공급 코드가 없다. worker의 `CredentialResolver`·`SelectionResolver`는 확인 로직과 인터페이스이며 API의 보호 관측 공급자가 아니다. #104 개발 연동도 합성 계정만 제공한다.

따라서 연결된 저장소 ID와 실제 좌표의 대조, 공개/비공개 상태를 언제 누가 관측하는지, 관측 근거·시각을 E 인터페이스로 전달할 구현·책임은 #105의 남은 연결 검토 사항이다. 이를 #231/#232의 추가 구현 책임으로 자동 배정하지 않는다. 실제 제공자가 확인되면 이 필수 경계를 연결하고 실제 관측을 사용한 재현을 별도로 수행해야 한다.

[10/6 최신 결정](https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296)과 [#234 철회 기록](https://github.com/JminAILab/CatchU/issues/234#issuecomment-6028927385)에 따라 결과 원문 보관·자동 재반영·worker 결과 14일 보관을 구현하지 않는다. 수신 커밋 후 중단·Receipt 전달 실패·공급 실패는 각각 `PENDING`/`APPLY_FAILED`에 남을 수 있다. [#237 처리 시한·실패 종료](https://github.com/JminAILab/CatchU/issues/237)는 [PR #295](https://github.com/JminAILab/CatchU/pull/295)로 구현돼 주기 작업이 시한을 넘긴 요청을 닫는다([규칙](analysis-deadline.md)). 이 수신·반영 서비스 자체는 시간만으로 요청을 닫거나 재요청을 허용하지 않는다. 잠금 순서는 요청 → 현재 시도로 맞춘다.

## 검사와 한계

`api/`에서 전용 `_test` DB를 지정한 뒤 `npm test -- test/integration/receiver-registration.test.cjs` 또는 `npm test`를 실행한다. 실제 #104/E/B 마이그레이션·수신 어댑터·B 등록·E 완료/실패 서비스를 사용한다. 정상 등록·0건·부분 실패·실패, 동일 결과 재전달·동시 수신, 동일 작업 두 후보, 수신/반영 커밋 실패·전체 롤백·수신 보존·실패 기록 오류·LIVE 주소 대조를 검사한다.

추가 동시성 검사는 실제 공개 서비스와 수신·반영 서비스를 호출하고, Catch 잠금 → 보호 관측 잠금 → 공개의 보호 잠금 대기를 `pg_blocking_pids`로 확인한 뒤 반영을 진행한다. 동일 작업의 기존 Catch 재사용과 PUBLIC 전환이 모두 커밋되고 같은 Catch ID·기존 본문·근거를 유지하며 새 시도는 APPLIED/CLOSED인지 검사한다. 기존 공개/숨김·보호 변경 경쟁·저장 실패·전체 롤백 검사는 전체 API 검사에 포함된다.

실제 HTTP 검사는 파일 안의 전용 컨트롤러에서 기존 Auth/CurrentMemberId·개발 주입과 DB 모듈을 조립해 정상·중복·권한 경계·저장 실패를 확인한다. 접수한 요청·동의·시도는 시험 준비 단계에서 넣으며 #138 접수 API를 실행한 것이 아니다(접수 API가 저장한 맥락의 연결 검증은 [분석 메시지 수신 「실제 접수 연결 검증」](analysis-receiver.md#실제-접수-연결-검증)). **보호 공급은 명시적 합성 관측 대역**이다. 실제 OAuth·GitHub 관측·큐/worker 전송·#237 종료를 검증하지 않았으며 #105 전체 완료를 뜻하지 않는다.
