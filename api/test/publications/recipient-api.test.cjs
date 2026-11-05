// U4 제출 3 — 받은 사람 경로(GET /v1/public/links/:token, POST /v1/public/links/:token/unlock) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U4 기능 명세 W4와 「주요 시나리오와 확인」 S8·S9(받은 사람 쪽)·S14, 보안 설계 「링크 판정」·
// 「판정과 읽기의 시점 (R-04)」·「소유 회원 비활성 (R-06)」·「비밀번호 통과 (unlock)」, 계약 C-10·C-12, team.md Testing Posture).
// Step 19(2026-11-05)에서 확정했고, 세부 시험 코드는 Step 20·21 구현 뒤 Step 23에서 쓴다. 이 파일은 그때까지 시험을 담지 않는다.
//
// 표시: [답 전 10월 동작] = OQ-U4-NFR-6(소유 회원 비활성·회원 행 없음) 팀장 답 전의 합의 전 처리. 답이 바뀌면 그 사례만 고친다.
//      [U10 몫] = C-10 deletion-rule의 404 매핑과 저장·차감 롤백은 소비 Unit(U10) 자기 경로에서 검증한다. 이 파일은 U4 열람 경로만 본다.
//
// 열람 판정 순서 (BR6.1·BR6.4, C-10, C-12, NFR1.3·NFR1.4·NFR1.12; 10월 경로·오류 코드 유지)
//   - 기대: 토큰 형식(base64url 43자)이 아니면 조회 없이 404 LINK_UNAVAILABLE(OQ-U4-NFR-4 합의 전 10월 동작). 발행본 없음·중지·만료(now >= expiresAt)는
//           구분 없이 같은 404, details 없음. 그다음 [답 전 10월 동작] 소유 회원 비활성 404, 회원 행 없음 500 INTERNAL_ERROR. 그다음 비밀번호 링크면
//           X-Link-Grant(없음·서명 틀림·다른 발행본·만료)를 확인해 401 LINK_PASSWORD_REQUIRED. 통과하면 200 PublishedSnapshot { title, publishedAt,
//           expiresAt, items[] }이고 published_item만 읽는다(원본 catch_asset·text_material 조회 없음). 회원 JWT 없이 처리하며(@Public() 메서드 단위)
//           응답은 Cache-Control: no-store. 판정은 요청마다 다시 하고 캐시하지 않는다.
//   - 실패 조건: 형식 오류 토큰으로 DB 조회, 중지·만료 링크가 grant로 열림, 404 사유가 구분됨, 원본 표를 읽음, 응답·로그에 토큰·grant·SQL.
// S8 비밀번호 링크: grant 없음·틀린 비밀번호·맞는 비밀번호·다른 발행본 grant (US4.4, AC4.4.2, BR6.1~BR6.3, NFR1.6)
//   - 기대: grant 없이 GET → 401(사본 없음). unlock 틀린 비밀번호 → 401 LINK_PASSWORD_INVALID. 맞는 비밀번호 → 200 { grant }, 그 grant로 GET → 200 사본.
//           다른 발행본의 유효 grant로 GET → 401. grant는 publicationId에 묶이고 수명 2시간, 링크 만료를 넘지 않는다. 비밀번호 없는 링크는 grant 없이 200.
//   - 실패 조건: 사본 노출(grant 없음·다른 발행본 grant), 비밀번호·grant 원문이 응답 본문(grant 칸 외)·로그에 남음.
// S9 중지·만료·삭제 링크를 받은 사람이 엶 (US5.1, AC5.1.1·AC5.1.2, BR6.1·BR6.5)
//   - 기대: 중지(PUT .../stop 뒤)·만료(시험 시계로 expiresAt 경과)·삭제(DELETE 뒤) 모두 GET·unlock이 404 LINK_UNAVAILABLE이고 유효한 grant가 있어도 같다.
//           같은 발행본을 작성자는 GET /v1/publications/{id}로 중지·만료 뒤에도 본다(작성자 쪽 S9는 publications-manage-api 시험이 맡고 여기서는 대조 1건).
//   - 실패 조건: 받은 사람 열람 성공, 작성자 상세가 중지·만료로 404.
// 판정과 읽기의 시점 (보안 설계 R-04, D10; OQ-U4-NFR-5 결정 A와 C-10 post-judgment-rule·deletion-rule, #416 2026-11-04)
//   - 기대: GET은 resolveForRecipientIn과 readSnapshotIn을 읽기 전용 REPEATABLE READ 트랜잭션 하나에서 부르고 행 잠금은 잡지 않는다. 판정 통과 뒤 그 요청이
//           끝나기 전에 중지·만료가 커밋돼도 그 한 요청은 판정 시점 사본(제목·항목)을 200으로 돌려주고, 다음 요청은 404다. 판정 뒤 삭제가 커밋돼도 같은
//           스냅샷이라 그 요청은 판정 시점 사본이고 다음 요청은 404. 트랜잭션 밖 경로에서 readSnapshot의 NotFound를 만나면 빈 사본 없이 404 LINK_UNAVAILABLE.
//           [U10 몫] 발행본 참조 외래 키 거부(SQLSTATE 23503, publication을 참조하는 제약)로 삭제를 확인해 저장·차감을 되돌리고 404로 바꾸는 매핑은
//           U10 자기 경로의 시험이며 여기서 시험하지 않는다.
//   - 실패 조건: 판정과 읽기가 별도 트랜잭션(두 호출 사이 중지가 그 요청 안에서 404나 500), 다음 요청이 열림, NotFound가 500으로 새어 나감.
// S14 비밀번호 시도 제한에 걸린 뒤 맞는 비밀번호, 비밀번호 없는 링크에 unlock (US4.4, BR6.3, NFR1.7, C-12)
//   - 기대: unlock 순서는 링크 판정(404) → 비밀번호 없는 링크(400 INVALID_REQUEST) → 본문 검사(400 VALIDATION_FAILED) → 주소·링크 차단·시도 빈도
//           (429 LINK_UNLOCK_LIMITED + Retry-After, 비밀번호 확인 안 함) → scrypt 비교(401) → 발급 직전 재판정(그사이 중지·만료면 404) → 200 { grant }.
//           같은 주소에서 10번 틀린 뒤에는 맞는 비밀번호도 429이고 grant를 주지 않는다. 받아 둔 유효 grant로는 차단 중에도 GET 200. 차단 키의 링크 단위는
//           publicationId라 다른 발행본은 영향이 없다. 비밀번호 없는 링크의 unlock은 본문과 무관하게 400. 제한 정책의 나머지 사례는 recipient-unlock-policy 시험.
//   - 실패 조건: 제한 중 grant 발급, 429 때 scrypt 계산, 400이 404보다 먼저.
// 소유 회원 상태 [답 전 10월 동작] (보안 설계 R-06, OQ-U4-NFR-6 합의 전 처리)
//   - 기대: 소유 회원이 비활성이면 GET·unlock 모두 404(비밀번호 없는 링크의 unlock도 400보다 먼저 404). 다시 ACTIVE가 되면 다음 요청부터 열린다.
//           소유 회원 행이 없으면(readOwnerState 결과만 시험 대역으로 NO_MEMBER) GET·unlock 모두 500 INTERNAL_ERROR 고정 본문이고 응답·로그에
//           SQL·내부 메시지·토큰·grant가 없다. 링크와 소유 회원은 같은 스냅샷에서 읽는다(판정 뒤 커밋된 비활성화는 그 요청에 보이지 않고 다음 요청에 반영).
//   - 실패 조건: 비활성 소유자 링크가 열림, 회원 없음이 404나 빈 사본, 응답에 내부 메시지.
// 거부 사례: 형식 오류 토큰 404(unlock도), 없는 토큰 404, 정의 밖 본문 필드 400, 비밀번호 본문이 문자열이 아님 400, 회원 토큰을 실어도 판정은 같음.
// 로그 (NFR1.9·NFR6.6): 받은 사람 경로는 토큰·grant·비밀번호·사본 본문을 로그·오류에 남기지 않는다. 비밀번호 실패·차단의 보안 이벤트 한 줄(10월 #222)은 유지.
//
// 실제 AppModule(전역 Guard·오류 형식·no-store)·테스트 DB·시험 시계(PUBLICATIONS_CLOCK)를 쓴다. 발행본은 발행 API 또는 표 직접 삽입으로 만들고,
// 회원·발행본·토큰·grant·비밀번호는 모두 합성이다. 회원 행 없음은 정상 DB에서 만들 수 없으므로 10월 recipient-http 시험처럼 readOwnerState 결과만 대역으로 바꾼다.
// 세부 시험 코드는 Step 23(구현 뒤)에서 쓴다.
