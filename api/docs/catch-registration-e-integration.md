# Catch 등록 — E 연결 조건

[등록 연결 안내](catch-registration-proposal.md) · [내부 호출과 저장 규칙](catch-registration-rules.md) · [DB 적용과 검사](catch-registration-database.md)

## 연결 범위와 추적

[PR #143](https://github.com/JminAILab/CatchU/pull/143)은 B의 저장·중복·롤백 검증을 제공한다.
E의 [PR #205](https://github.com/JminAILab/CatchU/pull/205)는
ResultApplicationRecord 엔티티·마이그레이션, 외부 등록 함수 port, 반영 서비스를 제공하는 연결 입력이다.
실제 수신 경로·보호 판단 공급·서비스 조립·자동 복구는 이 제공분에 포함되지 않는다.
제공분을 갖춘 것만으로 실제 수신·반영 연결이 완료됐다고 판단하지 않는다.
제공 내용과 검토 상태는 각 PR에서, 실제 결합과 남은 실행 작업은
기존 [#105](https://github.com/JminAILab/CatchU/issues/105)에서 확인한다.

B 등록 함수는 A/E의 회원·요청·시도·수신 테이블 관리,
원문 fingerprint·동의·범위 검증, 반영 상태 처리와 반복 실패 복구를 대신하지 않는다.
MemberAccount·AnalysisRequest·AnalysisAttempt는 [PR #184](https://github.com/JminAILab/CatchU/pull/184)의
실제 기반을 참조한다. B 검사에서 대역인 E 수신·완료 호출과 보호 관찰 공급을 실제 경로로 결합해야 한다.

## 수신 저장과 반영 트랜잭션

1. E가 원문·동의·범위·요청/현재 시도 맥락을 검증하고 수신 기록을 먼저 저장한다.
   같은 ID의 다른 원문을 거부하는 fingerprint 검사도 E 책임이다.
2. B 호출과 E의 반영 완료·열람 준비·종결 상태 저장을 **같은 트랜잭션**에 둔다.
   같은 활성 `EntityManager`를 전달하고 B의 예외를 바깥으로 전달한다.
3. B 반환값은 커밋 전 내부 결과다. 성공 응답·열람 준비는 커밋 뒤에만 외부에 알린다.
4. B 또는 E 완료 기록이 실패하면 전체 반영을 롤백하고,
   E가 트랜잭션 밖에서 `APPLY_FAILED`를 기록한다.
   기존 Catch와 먼저 저장한 수신 결과는 보존한다.

빈 후보 배열의 반환은 E의 정상 0건·전체 실패·최종 상태를 결정하지 않는다.
내부 입력·맥락·DB 오류의 분류와 안전한 기록은 E 호출부에서 연결한다.
오류 원문을 외부 응답·로그에 싣지 않는 기준은 [저장 규칙](catch-registration-rules.md#오류와-롤백)을 따른다.

실제 ResultApplicationRecord의 엔티티·마이그레이션과 B 참조를 결합하고
[DB 적용 순서](catch-registration-database.md#테이블과-적용-순서)를 확인한다.
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

## 실패와 재시작 후 재반영

같은 [10/4 팀장 조건](https://github.com/JminAILab/CatchU/issues/105#issuecomment-5975854918)에 따라
실제 연결 때 다음 두 경로에서 누가, 언제 재반영을 호출할지와 반복 실패 복구 방법을 정한다.

- 반영 실패로 `APPLY_FAILED`가 남은 경우.
- 수신 저장 후 재시작해 `PENDING`이 남은 경우.

이 조건은 #105의 실제 연결에서 확인한다. 이번 B 저장 제공 범위나 현재 배포 전체의
새 차단 조건으로 확대하지 않는다.
반복 실패를 후보 삭제·원문 수정·자동 재분석으로 해결하지 않는다.
현재 B의 재호출·전체 롤백 검사만으로 실제 E의 재반영 호출과 운영 복구가 검증됐다고 보지 않는다.

E가 현재 시도/생성 방식 값을 변경하는 경로를 만들면
B의 receipt 잠금과 공유 잠금 순서·불변성을 맞춘다.
현재 MVP는 새 요청에 새 시도를 만든다.
