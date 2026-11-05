# U10 구현 후 검사 지침

이 문서는 [구현 계획](code-generation-plan.md)의 검사 실행 방법이다. 계획 승인 전이므로 아래 신규 시험 파일·제품 코드는 아직 작성하지 않았으며 제품 검사를 실행한 결과가 아니다. 주요 업무 시나리오·기대 결과·실패 조건을 먼저 정하고, 해당 구현 후 세부 테스트를 작성·실행한다.

## 1. 검사 준비

- 기존 Node 24.21.0·npm과 api/web의 잠금 판본을 사용한다. api는 Node 기본 `node:test` + `scripts/test-with-db.cjs`, web은 Node 기본 `node --test`다. 새 검사 도구·CI 설정을 추가하지 않는다.
- api 새 테스트는 `test/jd/*.test.cjs`, web은 `test/jd-*.test.mjs`에 두어 기존 탐색 대상에 포함한다. 아래 명령은 정확한 파일 목록을 지정한다.
- api 검사 실행기는 빌드와 migration을 먼저 수행한다. U10 전용 합성 테스트 DB와 별도 포트를 사용하고 DB 이름의 `_test` 접미사를 확인한다. `openTestDataSource`·`resetTestDatabase`를 재사용한다. 이 초기화는 해당 테스트 DB 자료를 비우므로 본체/다른 Unit의 DB 또는 실제 자료 DB에 연결하지 않는다.
- DB·권한이 없으면 실패/미실행으로 보고한다. 자동 skip, 테스트 기대값 완화, 합성 성공으로 치환하지 않는다. 새 컨테이너가 필요하면 기존 README의 pgvector 이미지를 U10 고유 이름·미사용 포트로 준비한다. 공용 컨테이너를 삭제하지 않는다.
- C-01 생성, C-09 임베딩, C-10 접근, C-11 props/transport는 명시적인 시험 주입만 사용한다. 실제 외부 키·사용자 원문·서비스 비용은 이 계획으로 허용되지 않는다.

## 2. API 단위·통합 검사

실행 폴더: 저장소의 `api/`. 아래 파일은 구현 후 작성할 대상이다.

```powershell
npm.cmd test -- test/jd/jd-management.test.cjs test/jd/jd-summary.test.cjs test/jd/jd-integration.test.cjs
```

| 파일 | 기대·실패 판정 |
|---|---|
| jd-management.test.cjs | 계획의 관리 API 7개 시나리오. UTF-16 상한·원문·소유·cursor·수정·삭제 실패를 서버 결과로 확인한다. |
| jd-summary.test.cjs | 계획의 요약 API 7개 시나리오. 원문 순서·줄별 호출·공용 입력 계산·상태 집계·R-01을 확인한다. 80,000/80,001의 공용 계산 경계는 별도 합성 요청으로 확인하며 정상 6×1,000+2,000 제한을 우회하지 않는다. |
| jd-integration.test.cjs | 실제 DB/HTTP와 공용 모듈의 원자 접수·권한·시한·FK 삭제·관문 조합을 확인한다. C-10 합성 여부를 결과에 표시한다. 실제 UI 연결은 §4에서 따로 확인한다. |

필요한 기존 경계 회귀는 변경 영향이 있을 때 아래 중 관련 파일만 지정한다. U7 전체 검사를 반복하지 않는다.

```powershell
npm.cmd test -- test/db/member-cascade-delete.test.cjs test/u2/ai-gate-jd.test.cjs test/u2/ai-run.test.cjs test/u2/daily-run-limit.test.cjs test/u2/ai-consent.test.cjs
```

합성 queue의 ENQUEUE_FAILED·등록 순서는 U10 시험에서 확인한다. 실제 Redis/Valkey 큐 확인은 기존 `CATCHU_TEST_REDIS_URL`과 격리 환경이 준비됐을 때만 수행하며, 준비되지 않았으면 그 경계는 미실행이다. 코드의 순서 검사·합성 흐름을 실제 백그라운드 실행 완료로 보고하지 않는다.

마이그레이션은 U10 전용 합성 개발 DB에서 생성 SQL을 먼저 검토한 뒤 새 migration의 up/down/up을 확인한다. 기존 migration을 수정하거나 다른 Unit 표를 삭제하는 SQL이 있으면 중단한다. DB 변경 검사는 §2 파일의 실제 FK·소유 짝·삭제 사례와 `member-cascade-delete.test.cjs`로 확인한다.

## 3. web 동작·표시 검사

실행 폴더: 저장소의 `web/`.

```powershell
node --test test/jd-management.test.mjs test/jd-summary.test.mjs
```

관리·요약 각 7개 시나리오의 상태·응답 해석·React 텍스트 출력·호출 인자를 검증한다. 기존 `materials-screen.test.mjs`의 TSX 변환·정적 렌더 패턴을 소비한다. 정적 렌더는 실제 브라우저의 초점·클릭·공유 화면 연결 증거가 아니다.

JD 진입 메뉴/복귀 경계를 변경한 경우:

```powershell
node --test test/member-navigation.test.mjs
```

공용 제공 담당의 PATCH·Bearer/grant 보완을 가져온 뒤, U10 어댑터와 영향을 받는 기존 회귀만 확인한다.

```powershell
node --test test/jd-management.test.mjs test/jd-summary.test.mjs test/api-client.test.mjs test/auth-api.test.mjs test/u2-consent.test.mjs
```

실패하면 요청이 전송되지 않음·인증 거부·세션 교체·실제 서버 실패를 구분한다. `isLoggedIn`이 계속 true인 계정 교체도 공용 세션 변화로 판별한다. 이전 JD·run/token의 늦은 응답이 현재 상태를 복원하면 실패다.

## 4. 실제 화면·연결 확인

U4 C-10/C-11과 공용 web HTTP 보완이 합류한 판본에서만 실행한다. 합류 전에는 미실행으로 둔다.

1. 합성 회원 두 명과 발행본/JD로 실제 로그인·JD 저장/수정/삭제·다음 페이지를 확인한다. 관리 화면은 기존 회원 화면 기준 760·1024·1536px에서 주요 조작·입력 보존·삭제 확인을 본다.
2. 유효 링크에서 본인 JD로 접수하고 브라우저를 닫았다 다시 연 뒤 실행 목록·수동 새로고침으로 결과를 확인한다. 다른 회원·다른 발행본은 같은 자원 응답으로 거부돼야 한다.
3. 빈 결과/서버 안내/일부 실패/개별 생성 시간 초과/전체 시한을 시험용 제공자로 재현한다. 개별 호출 실패 안내는 “이 요구사항을 처리하지 못했습니다.”, 전체 시한은 “전체 처리 시한이 지나 완료하지 못했습니다.”다.
4. 비밀번호·중지/만료 링크와 로그아웃·계정 전환에서 결과를 지우고 올바른 소유자의 오류 처리를 호출하는지 확인한다. 근거를 누르면 제공된 UTF-16 위치로 이동·강조돼야 한다. U10의 위치 전달과 U4의 실제 강조를 나눠 기록한다.

이 확인은 기존 회원 자료 격리·링크/탈퇴 차단 보호 흐름에 연결한다. 별도 성능 부하·복구·동시성 시험 체계를 추가하지 않는다. 실제 AI 품질 및 같은 JD 한 건의 전체 입력/검색 기반 비교는 허용된 자료·호출 조건이 있는 후속 확인이다. U5 질문 10개 평가·#450 실측을 재수행하지 않는다.

## 5. 커버리지·정적 검사·빌드

Unit 커버리지 진단은 기존 서비스 도구를 사용하며 이 단계에서는 U10 파일을 명시한다. api 실행 폴더에서, 작업용 터미널에 기존 `TEST_COVERAGE_INCLUDE`가 없음을 먼저 확인한 경우:

```powershell
$env:TEST_COVERAGE_INCLUDE = 'dist/{jd,jd-summary}/**'
npm.cmd run test:coverage -- test/jd/jd-management.test.cjs test/jd/jd-summary.test.cjs test/jd/jd-integration.test.cjs
Remove-Item Env:TEST_COVERAGE_INCLUDE
```

기존 값이 있으면 덮어쓰지 않고 별도 작업용 터미널을 사용하거나 그 값을 보존·복원한다. api 표의 파일·줄은 컴파일된 dist 기준이므로 src와 대응시킨다.

web 실행 폴더에서:

```powershell
node --test --experimental-test-coverage --test-coverage-include="src/features/jd/**" test/jd-management.test.mjs test/jd-summary.test.mjs
```

시험이 불러오지 않아 표에서 빠진 파일은 별도 0%로 포함해 한계를 기록한다. TSX 변환 때문에 원본 줄과 다르면 그 사실도 적는다. 위 Unit 측정만으로 **mvp 전체 80% 줄 커버리지 충족**을 주장하지 않는다. 전체 하한은 Build and Test의 조립된 전체 서비스 검사에서 확인하며, 기존 명령/측정만으로 충족을 증명할 수 없으면 공용 담당에 전달한다. 도구·CI를 U10에서 새로 추가하거나 기준을 낮추지 않는다. 선택 검사의 CI 실행·PR 전 전체 검사는 그 시점의 공용 절차를 따른다.

각 서비스에서 기존 정적·타입 검사와 빌드를 실행한다. 이것은 Unit 테스트 파일 선택을 대체하지 않는다.

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

web PR 전 전체 `check` 요구는 Build and Test/PR 준비에서 적용한다. Code Generation의 각 단계마다 전체 시험을 반복하는 명령으로 사용하지 않는다.

## 6. 결과 기록

실제 실행 후 판본(미커밋 변경 포함 여부), 위치, 명령, 합성/실제 제공자, 통과·실패·미실행·해당 없음, 다음 조치를 코드 요약과 검토 대상 PR에 기록한다. FR19 확인 표는 그 증거를 연결한다. 로그는 허용 필드만 공유하고 사용자 원문·토큰·grant·전체 URL·감사 로그 원문·내부 절대경로는 이슈/PR에 올리지 않는다.

현재는 계획 문서 정합성만 확인한다. 공식 구현 검토·Code Generation 완료 보고는 구현과 검사 산출물이 준비된 뒤 진행한다.
