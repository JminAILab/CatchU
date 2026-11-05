// U4 제출 3 — 경로 경계(AppModule에 등록된 경로·모듈 구성·운영 기동 검사) 시험. 10월 두 경계 시험 `test/public-links-auth-boundary.test.cjs`·
// `test/recipient-module-boundary.test.cjs`를 대체한다(보안 설계 「`PublicationsModule` 공급자 구성 (R-01)」·R-02·R-07, BR9.1, NFR1.1·NFR1.5·NFR1.6, OQ-U4-3).
// Step 19(2026-11-05)에서 확정했고, 세부 시험 코드는 Step 20·21 구현 뒤 Step 23에서 쓴다. 이 파일은 그때까지 시험을 담지 않는다.
//
// 경로 (W6 뒤 AppModule을 띄워 등록된 (메서드, 경로)를 읽는다)
//   - 기대: 등록된 (메서드, 경로)에 중복이 없다. 받은 사람 두 경로 GET /v1/public/links/:token·POST /v1/public/links/:token/unlock은 PublicationsModule의
//           새 컨트롤러 하나에만 연결된다. 다음 경로는 없다: GET /v1/public/links/:token/catches/:catchId(10월 Catch 상세), GET·POST /v1/share-links와
//           PUT /v1/share-links/:linkId/stop(10월 발급·목록·중지). 발행·작성자 관리 경로(/v1/publications...)·설명·자료 경로는 그대로다.
//   - 실패 조건: 같은 (메서드, 경로)가 두 컨트롤러에 있음(10월 RecipientController·PublicLinksController가 남음), 옛 경로가 404가 아닌 응답을 함.
// 인증 예외 (NFR1.1, 보안 점검)
//   - 기대: @Public()은 받은 사람 두 메서드에만 붙고 클래스에는 없다. 같은 컨트롤러에 더해질 미지정 메서드는 회원 인증 예외를 상속하지 않는다.
//           받은 사람 두 경로는 회원 토큰 없이 Guard를 통과하고, 작성자 경로(/v1/publications...)는 회원 토큰 없이 401이다.
//   - 실패 조건: 클래스 단위 @Public(), 미지정 경로가 인증 없이 통과.
// 모듈 구성 (R-01·R-02, OQ-U4-3)
//   - 기대: AppModule 모듈 목록에 ShareLinksModule·RecipientModule이 없고 PublicationsModule이 한 번 등록된다. grant 키·web 주소 설정·unlock 정책·제어
//           (UNLOCK_POLICY·UNLOCK_CONTROLS)·발행 빈도 제한기·PUBLICATIONS_CLOCK은 PublicationsModule에만 선언돼 제한기 싱글턴이 하나다
//           (publications-module.test.cjs의 "unlock 제어는 선언하지 않는다·ShareLinksModule 인스턴스와 같다" 단언은 Step 23에서 "이 모듈에만 선언한다"로 뒤집고
//           Step 20·21과 같은 커밋에 넣는다). PublicationsModule은 share-links.service.ts·ShareLinksModule을 import하지 않고 OwnerProfileReaderModule을
//           import한다. share_link 표·share-link.entity.ts·member-analysis의 createShareLink·idempotent-creation.ts는 남는다.
//   - 실패 조건: 두 모듈이 함께 등록된 판본, 제한기 두 벌 또는 없음, PublicationsModule이 ShareLinksModule을 import, 공용 표·엔티티가 지워짐.
// 운영 기동 검사 유지 (R-01 확인 항목, #218)
//   - 기대: 운영 설정(NODE_ENV가 development·test가 아님)에서 LINK_GRANT_SECRET이 없거나 64자 hex가 아니거나 AUTH_JWT_SECRET과 같으면 기동 실패,
//           SHARE_LINK_WEB_BASE_URL이 없거나 http이거나 쿼리·조각·계정 정보가 있으면 기동 실패. ShareLinksModule을 뺀 뒤에도 두 검사가 남는다. 환경변수 이름은 그대로다.
//   - 실패 조건: ShareLinksModule 제거로 기동 검사가 사라짐, 환경변수 이름 변경.
//
// 실제 AppModule을 띄우되 DB·외부 호출은 10월 경계 시험처럼 필요한 최소 대역으로 막는다. 비밀값은 합성이다.
// 세부 시험 코드는 Step 23(구현 뒤)에서 쓴다.
