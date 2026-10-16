# Catch 등록 — E 연결 조건

[등록 연결 안내](catch-registration-proposal.md) · [내부 호출과 저장 규칙](catch-registration-rules.md) · [DB 적용과 검사](catch-registration-database.md)

## 연결 범위와 추적

[PR #143](https://github.com/JminAILab/CatchU/pull/143)은 B의 저장·중복·롤백 검증을 제공한다.
E의 [PR #205](https://github.com/JminAILab/CatchU/pull/205)는
ResultApplicationRecord 엔티티·마이그레이션, 외부 등록 함수 port, 반영 서비스를 제공하는 연결 입력이다.
실제 수신 경로·보호 판단 공급·서비스 조립은 이 제공분에 포함되지 않는다.
제공분을 갖춘 것만으로 실제 수신·반영 연결이 완료됐다고 판단하지 않는다.
제공 내용과 검토 상태는 각 PR에서, 실제 결합과 남은 실행 작업은
기존 [#105](https://github.com/JminAILab/CatchU/issues/105)에서 확인한다. 실패 요청 닫기는 [#237](https://github.com/JminAILab/CatchU/issues/237)에서 구현한다.

B 등록 함수는 A/E의 회원·요청·시도·수신 테이블 관리,
원문 fingerprint·동의·범위 검증, 반영 상태 처리와 요청 닫기를 대신하지 않는다.
MemberAccount·AnalysisRequest·AnalysisAttempt는 [PR #184](https://github.com/JminAILab/CatchU/pull/184)의
실제 기반을 참조한다. 결합 검사는 실제 E 수신 테이블·반영 서비스와 B 등록 함수를 사용한다.
수신 저장 어댑터·보호 판단 공급·서비스 호출 조립은 실제 경로로 연결해야 한다.

## 수신 저장과 반영 트랜잭션

1. E가 원문·동의·범위·요청/현재 시도 맥락을 검증하고 수신 기록을 먼저 저장한다.
   같은 ID의 다른 원문을 거부하는 fingerprint 검사도 E 책임이다.
2. B 호출과 E의 반영 완료·열람 준비·종결 상태 저장을 **같은 트랜잭션**에 둔다.
   같은 활성 `EntityManager`를 전달하고 B의 예외를 바깥으로 전달한다.
3. B 반환값은 커밋 전 내부 결과다. 성공 응답·열람 준비는 커밋 뒤에만 외부에 알린다.
4. B 또는 E 완료 기록이 실패하면 전체 반영을 롤백하고,
   E가 트랜잭션 밖에서 `APPLY_FAILED`를 기록한다.
   기존 Catch와 먼저 저장한 수신 기록(식별자·지문·시각)은 보존한다. 복구용 결과 본문은 저장하지 않는다.

빈 후보 배열의 반환은 E의 정상 0건·전체 실패·최종 상태를 결정하지 않는다.
내부 입력·맥락·DB 오류의 분류와 안전한 기록은 E 호출부에서 연결한다.
오류 원문을 외부 응답·로그에 싣지 않는 기준은 [저장 규칙](catch-registration-rules.md#오류와-롤백)을 따른다.

실제 ResultApplicationRecord 엔티티·마이그레이션과 B 참조를 사용하며,
[DB 적용 순서](catch-registration-database.md#테이블과-적용-순서)와 역순 되돌리기를 결합 검사에서 확인한다.
E 수신 테이블이 없으면 제품 마이그레이션은 실패하며 테스트 대역을 자동 생성하지 않는다.

## 보호 판단과 LIVE 출처

등록·재호출 전에 Catch의 원 요청 저장소와 동일 소유자에 대한
유효한 `RepositoryProtection` 판단(`NONE`/`SOURCE_PRIVATE`)을 준비한다.
호출 전에 저장하거나 같은 트랜잭션에서 B 호출보다 먼저 준비해야 한다.
테이블 생성만으로 최초 판단 공급을 대신할 수 없으며 기본 `NONE`을 만들지 않는다.
판단이 없거나 유효하지 않으면 `CATCH_NOT_READY`로 전체 반영을 거부한다.

[10/4 팀장 조건](https://github.com/JminAILab/CatchU/issues/105#issuecomment-5975854918)에 따라
**실제 LIVE 연결 때 근거 URL을 연결된 GitHub 저장소와 대조하고, 다른 출처는 거부한다.**
MOCK는 이 대조 대상에서 제외한다.
현재 B 준비 함수의 URL 형식 검사만으로 실제 출처 일치가 확인됐다고 판단하지 않는다.

10/15 팀장 결정의 [10월 정책 공급](october-registration-policy.md)은 ‘관측 안 함’과 정책 기록 시각을 명시해 NONE을 공급한다. 공개를 확인한 기록이 아니며 공급 부재·실패를 채우는 기본값도 아니다. 기존 SOURCE_PRIVATE와 그 근거를 보존해야 하고, 등록 후 원본의 비공개 전환은 10월에 자동 감지하지 않는다.

## 실패 요청 닫기

[10/6 팀장 결정](https://github.com/JminAILab/CatchU/issues/23#issuecomment-6011538296)과
[처리 시한 계약 PR #292](https://github.com/JminAILab/CatchU/pull/292)가
10/4 조건 중 실패·재시작 후 재반영 조건과 [#234 복구 계획](https://github.com/JminAILab/CatchU/issues/234#issuecomment-6028927385)을 대체한다.

- 반영 실패(`APPLY_FAILED`)는 처리 시한을 기다리지 않고 E의 다음 주기 판정에서 닫는다.
- 수신 후 반영 대기(`PENDING`)는 처리 시한을 넘기면 반영 실패로 닫는다.

상세 전이·재요청 조건은 [계약 요약](../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/contract-summary.md)을 따르고,
닫기 구현·검사는 [#237](https://github.com/JminAILab/CatchU/issues/237)에서 확인한다.
복구용 결과 본문 보존·재기동/주기적 재반영·자동 재분석은 두지 않는다.
닫힌 시도의 늦은 결과는 거부한다. 현재 B의 재호출·전체 롤백 검사만으로 실제 E의 요청 닫기가 검증됐다고 보지 않는다.

E가 현재 시도/생성 방식 값을 변경하는 경로를 만들면
B의 receipt 잠금과 공유 잠금 순서·불변성을 맞춘다.
현재 MVP는 새 요청에 새 시도를 만든다.
