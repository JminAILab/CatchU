// U4 제출 3 — 받은 사람 경로(GET /v1/public/links/:token, POST /v1/public/links/:token/unlock) 시험.
//
// 먼저 정한 시나리오·기대 결과·실패 조건(U4 기능 명세 W4와 「주요 시나리오와 확인」 S8·S9(받은 사람 쪽)·S14, 보안 설계 「링크 판정」·
// 「판정과 읽기의 시점 (R-04)」·「소유 회원 비활성 (R-06)」·「비밀번호 통과 (unlock)」, 계약 C-10·C-12, team.md Testing Posture).
// Step 19(2026-11-05)에서 확정했고, 세부 시험 코드는 Step 20·21 구현 뒤 Step 23에서 썼다.
//
// 표시: [NFR-6 결정] = #416 OQ-U4-NFR-6 팀장 결정(2026-11-05, 댓글 6651073856: 1번 A·2번 예). 작성자(소유 회원) 비활성은 404 LINK_UNAVAILABLE, 작성자 회원 행
//      없음은 500 INTERNAL_ERROR이며 중지·만료 다음, 비밀번호(grant) 앞에 판정한다(#468 구현 그대로). 통과한 요청은 작성자 비활성만을 이유로 취소하지 않고
//      다음 요청의 재판정으로 막는다(NFR-5의 중지·만료 규칙과 같음).
//      [U10 몫] = C-10 deletion-rule의 404 매핑과 저장·차감 롤백은 소비 Unit(U10) 자기 경로에서 검증한다. 이 파일은 U4 열람 경로만 본다.
//
// 열람 판정 순서 (BR6.1·BR6.4, C-10, C-12, NFR1.3·NFR1.4·NFR1.12; 10월 경로·오류 코드 유지)
//   - 기대: 토큰 형식(base64url 43자)이 아니면 조회 없이 404 LINK_UNAVAILABLE(OQ-U4-NFR-4 합의 전 10월 동작). 발행본 없음·중지·만료(now >= expiresAt)는
//           구분 없이 같은 404, details 없음. 그다음 [NFR-6 결정] 소유 회원 비활성 404, 회원 행 없음 500 INTERNAL_ERROR. 그다음 비밀번호 링크면
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
// 작성자(소유 회원) 상태 [NFR-6 결정] (보안 설계 R-06, #416 OQ-U4-NFR-6 결정 2026-11-05)
//   - 기대: 소유 회원이 비활성이면 GET·unlock 모두 404(비밀번호 없는 링크의 unlock도 400보다 먼저 404). 다시 ACTIVE가 되면 다음 요청부터 열린다.
//           소유 회원 행이 없으면(readOwnerState 결과만 시험 대역으로 NO_MEMBER) GET·unlock 모두 500 INTERNAL_ERROR 고정 본문이고 응답·로그에
//           SQL·내부 메시지·토큰·grant가 없다. 링크와 소유 회원은 같은 스냅샷에서 읽는다(판정 뒤 커밋된 비활성화는 그 요청에 보이지 않고 다음 요청에 반영).
//   - 실패 조건: 비활성 소유자 링크가 열림, 회원 없음이 404나 빈 사본, 응답에 내부 메시지.
// 거부 사례: 형식 오류 토큰 404(unlock도), 없는 토큰 404, 정의 밖 본문 필드 400, 비밀번호 본문이 문자열이 아님 400, 회원 토큰을 실어도 판정은 같음.
// 로그 (NFR1.9·NFR6.6): 받은 사람 경로는 토큰·grant·비밀번호·사본 본문을 로그·오류에 남기지 않는다. 비밀번호 실패·차단의 보안 이벤트 한 줄(10월 #222)은 유지.
//
// 실제 AppModule(전역 Guard·오류 형식·no-store)·테스트 DB·시험 시계(PUBLICATIONS_CLOCK)를 쓴다. 발행본은 발행 API로 만들고(U2·U3는 계약 모양 가짜),
// 회원·발행본·토큰·grant·비밀번호는 모두 합성이다. 회원 행 없음은 정상 DB에서 만들 수 없으므로 10월 recipient-http 시험처럼 readOwnerState 결과만 대역으로 바꾼다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { after, before, beforeEach, test } = require('node:test');
const { QueryFailedError } = require('typeorm');
const { AppModule } = require('../../dist/app.module');
const { FILE_STORAGE } = require('../../dist/file-storage/file-storage');
const { OwnerProfileReader } = require('../../dist/member-profile/owner-profile-reader');
const { DbPublicationAccess } = require('../../dist/publications/db-publication-access');
const { PublicationManageService } = require('../../dist/publications/publication-manage.service');
const { NotFound } = require('../../dist/publications/publication-access');
const { PUBLICATION_TTL_HOURS } = require('../../dist/publications/publication.entity');
const { generateLinkToken } = require('../../dist/share-links/link-token');
const { LINK_GRANT_TTL_MS } = require('../../dist/share-links/link-grant');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const {
  PUBLISH_SETTINGS, HOUR, setEnv, startApp, expectError, consent, fakeAiRun, fakeIndexWriter, bindFakes, setClock,
  publishLink, recipientGet, unlockRaw,
} = require('./support.cjs');

const PASSWORD = 'synthetic-recipient-password-1!';
const START = new Date('2026-11-10T00:00:00.000Z');
let server, db, restore, unbind, now, unsetClock, fileRoot;
const secrets = new Set([PASSWORD]);

before(async () => {
  // 삭제(S9)는 발행본 파일 접두어를 먼저 지우므로 로컬 파일 저장소를 임시 폴더로 둔다(publications-manage-api 시험과 같다).
  fileRoot = await mkdtemp(join(tmpdir(), 'catchu-u4-recipient-'));
  restore = setEnv({ ...PUBLISH_SETTINGS, TRUST_PROXY_CIDRS: undefined, FILE_STORAGE_DRIVER: 'local', FILE_STORAGE_LOCAL_ROOT: fileRoot });
  server = await startApp(AppModule);
  db = await openTestDataSource();
});
after(async () => {
  unsetClock?.();
  await server?.app.close();
  await db?.destroy();
  restore?.();
  await rm(fileRoot, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetTestDatabase(db);
  server.logs.length = 0;
  unbind?.();
  unbind = bindFakes(server.app, { aiRun: fakeAiRun(db), indexWriter: fakeIndexWriter(db) });
  unsetClock?.();
  now = START;
  unsetClock = setClock(server.app, () => now);
  server.app.get(PublicationManageService).files = server.app.get(FILE_STORAGE);
});

const get = (token, grant, options) => recipientGet(server, token, grant, options);
const unlock = (token, payload, headers) => unlockRaw(server, token, payload, headers);
const stop = (member, id) => server.call('PUT', `/publications/${id}/stop`, { token: member.token });
const remove = (member, id) => server.call('DELETE', `/publications/${id}`, { token: member.token });
const detail = (member, id) => server.call('GET', `/publications/${id}`, { token: member.token });
async function author(identity = `u4-recipient-owner-${randomUUID()}`) {
  const member = await server.login(identity);
  await consent(server.app, member.memberId);
  secrets.add(member.token);
  return member;
}
async function link(member, options) {
  const published = await publishLink(server, db, member, options);
  secrets.add(published.token);
  return published;
}
async function grantFor(token) {
  const result = await unlock(token, { password: PASSWORD });
  assert.equal(result.status, 200, result.text);
  secrets.add(result.body.grant);
  return result.body.grant;
}
const fails = (result, status, code) => {
  expectError(result, status, code);
  assert.equal(result.cacheControl, 'no-store');
  assert.ok(!('items' in (result.body ?? {})) && !('title' in (result.body ?? {})), '실패 응답에 사본이 없다');
};
const setAccountState = (memberId, state) => db.query('UPDATE member_account SET account_state = $2 WHERE member_id = $1', [memberId, state]);
const logText = () => server.logs.map((line) => line.text).join('\n');
function assertNoSecretsLogged(extra = []) {
  const text = logText();
  for (const secret of [...secrets, ...extra]) assert.equal(text.includes(secret), false, '로그에 비밀값이 없다');
}
/** 앱의 C-10 DB 구현 인스턴스 메서드를 시험 안에서만 감싼다. 감싼 함수는 (args, original)을 받는다. */
function wrapAccess(t, method, wrapper) {
  const access = server.app.get(DbPublicationAccess);
  const original = DbPublicationAccess.prototype[method];
  access[method] = function (...args) { return wrapper(args, (...again) => original.apply(this, again)); };
  t.after(() => { delete access[method]; });
}
function wrapOwnerState(t, wrapper) {
  const reader = server.app.get(OwnerProfileReader, { strict: false });
  const original = OwnerProfileReader.prototype.readOwnerState;
  const calls = [];
  reader.readOwnerState = function (ownerId, manager) {
    calls.push({ ownerId, manager: manager !== undefined });
    return wrapper(ownerId, manager, (...again) => original.apply(this, again));
  };
  t.after(() => { delete reader.readOwnerState; });
  return calls;
}

test('열람 판정 순서: 비밀번호 없는 발행본은 grant 없이 200 사본(no-store, 토큰 없음)이고, 형식 오류·없는 토큰·중지·만료는 같은 404이며 details가 없다', async () => {
  const a = await author();
  const open = await link(a, { title: '[합성] 열람' });
  const shown = await get(open.token);
  assert.equal(shown.status, 200, shown.text);
  assert.equal(shown.cacheControl, 'no-store');
  assert.deepEqual(Object.keys(shown.body).sort(), ['expiresAt', 'items', 'publishedAt', 'title']);
  assert.equal(shown.body.title, '[합성] 열람');
  assert.equal(Date.parse(shown.body.expiresAt) - Date.parse(shown.body.publishedAt), PUBLICATION_TTL_HOURS * HOUR);
  assert.deepEqual(shown.body.items.map((item) => [item.position, item.itemKind, item.title, item.snapshot, item.pdfPages]),
    [[1, 'TEXT_MATERIAL', '[합성] 자료', { body: '[합성] 본문' }, null]]);
  assert.ok(!shown.text.includes(open.token) && !shown.text.includes(open.publicationId), '응답에 토큰·발행본 ID가 없다');
  assert.equal((await get(open.token, 'ignored-grant-value')).status, 200, '비밀번호 없는 링크는 grant를 보지 않는다');

  const stopped = await link(a);
  assert.equal((await stop(a, stopped.publicationId)).status, 200);
  const bodies = [];
  for (const token of ['not-a-token', generateLinkToken(), stopped.token]) {
    const result = await get(token);
    fails(result, 404, 'LINK_UNAVAILABLE');
    assert.equal(result.body.details, undefined);
    bodies.push(result.text);
  }
  assert.equal(new Set(bodies).size, 1, '사유를 구분하지 않는 같은 본문');

  const expiring = await link(a);
  now = new Date(expiring.expiresAt.getTime() - 1);
  assert.equal((await get(expiring.token)).status, 200, '만료 1ms 전');
  now = new Date(expiring.expiresAt.getTime());
  fails(await get(expiring.token), 404, 'LINK_UNAVAILABLE');
  assertNoSecretsLogged();
});

test('S8: 비밀번호 발행본은 grant 없음 401, 틀린 비밀번호 401, 맞으면 { grant }로 200 사본, 다른 발행본 grant·위조·만료 grant는 401이다', async () => {
  const a = await author();
  const locked = await link(a, { password: PASSWORD, title: '[합성] 비밀번호' });
  const other = await link(a, { password: PASSWORD });
  fails(await get(locked.token), 401, 'LINK_PASSWORD_REQUIRED');
  const wrong = await unlock(locked.token, { password: `${PASSWORD}-wrong` });
  fails(wrong, 401, 'LINK_PASSWORD_INVALID');
  fails(await unlock(locked.token, { password: ` ${PASSWORD}` }), 401, 'LINK_PASSWORD_INVALID');
  const ok = await unlock(locked.token, { password: PASSWORD });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.cacheControl, 'no-store');
  assert.deepEqual(Object.keys(ok.body), ['grant']);
  secrets.add(ok.body.grant);
  const otherGrant = await grantFor(other.token);

  const shown = await get(locked.token, ok.body.grant);
  assert.equal(shown.status, 200, shown.text);
  assert.equal(shown.body.title, '[합성] 비밀번호');
  fails(await get(locked.token, otherGrant), 401, 'LINK_PASSWORD_REQUIRED');
  fails(await get(locked.token, `${ok.body.grant.slice(0, -2)}AA`), 401, 'LINK_PASSWORD_REQUIRED');
  fails(await get(locked.token, 'g1.forged.forged'), 401, 'LINK_PASSWORD_REQUIRED');
  now = new Date(START.getTime() + LINK_GRANT_TTL_MS);
  fails(await get(locked.token, ok.body.grant), 401, 'LINK_PASSWORD_REQUIRED');
  assert.ok(!shown.text.includes(ok.body.grant) && !ok.text.includes(PASSWORD));
  assertNoSecretsLogged([`${PASSWORD}-wrong`]);
});

test('S9: 중지·만료·삭제된 발행본은 유효한 grant가 있어도 GET·unlock 모두 404이고, 작성자는 중지·만료 발행본을 계속 본다', async () => {
  const a = await author();
  const stopped = await link(a, { password: PASSWORD });
  const expired = await link(a, { password: PASSWORD });
  const removed = await link(a, { password: PASSWORD });
  const grants = { stopped: await grantFor(stopped.token), expired: await grantFor(expired.token), removed: await grantFor(removed.token) };

  assert.equal((await stop(a, stopped.publicationId)).status, 200);
  assert.equal((await remove(a, removed.publicationId)).status, 204);
  fails(await get(stopped.token, grants.stopped), 404, 'LINK_UNAVAILABLE');
  fails(await unlock(stopped.token, { password: PASSWORD }), 404, 'LINK_UNAVAILABLE');
  fails(await get(removed.token, grants.removed), 404, 'LINK_UNAVAILABLE');
  fails(await unlock(removed.token, { password: PASSWORD }), 404, 'LINK_UNAVAILABLE');
  now = new Date(expired.expiresAt.getTime());
  fails(await get(expired.token, grants.expired), 404, 'LINK_UNAVAILABLE');
  fails(await unlock(expired.token, { password: PASSWORD }), 404, 'LINK_UNAVAILABLE');

  const stoppedDetail = await detail(a, stopped.publicationId);
  assert.equal(stoppedDetail.status, 200, stoppedDetail.text);
  assert.equal(stoppedDetail.body.state, 'STOPPED');
  const expiredDetail = await detail(a, expired.publicationId);
  assert.equal(expiredDetail.status, 200, expiredDetail.text);
  assert.equal(expiredDetail.body.state, 'EXPIRED');
  assertNoSecretsLogged();
});

test('R-04: GET은 판정과 사본 읽기를 읽기 전용 REPEATABLE READ 트랜잭션 하나에서 하고, 판정 뒤 커밋된 중지·삭제·작성자 비활성은 그 요청에 보이지 않으며 다음 요청은 404다', async (t) => {
  const a = await author();
  const seen = [];
  wrapAccess(t, 'resolveForRecipientIn', async ([manager, ...rest], original) => {
    const [{ transaction_isolation: isolation }] = await manager.query('SHOW transaction_isolation');
    const [{ transaction_read_only: readOnly }] = await manager.query('SHOW transaction_read_only');
    seen.push({ step: 'judge', isolation, readOnly, runner: manager.queryRunner });
    return original(manager, ...rest);
  });
  let during = null;
  wrapAccess(t, 'readSnapshotIn', async ([manager, publicationId], original) => {
    seen.push({ step: 'read', runner: manager.queryRunner });
    if (during) await during(publicationId);
    return original(manager, publicationId);
  });

  for (const change of ['stop', 'delete', 'deactivate']) {
    seen.length = 0;
    const open = await link(a, { title: `[합성] ${change}` });
    during = async (publicationId) => {
      if (change === 'stop') await db.query('UPDATE publication SET stopped_at = published_at WHERE publication_id = $1', [publicationId]);
      else if (change === 'delete') {
        await db.query('DELETE FROM published_item WHERE publication_id = $1', [publicationId]);
        await db.query('DELETE FROM publication WHERE publication_id = $1', [publicationId]);
      } else await setAccountState(a.memberId, 'SUSPENDED');
    };
    const same = await get(open.token);
    assert.equal(same.status, 200, `${change}: ${same.text}`);
    assert.equal(same.body.title, `[합성] ${change}`, '판정 시점 사본');
    assert.equal(same.body.items.length, 1);
    assert.equal(seen.length, 2, '판정 한 번, 읽기 한 번');
    assert.deepEqual([seen[0].isolation, seen[0].readOnly], ['repeatable read', 'on']);
    assert.ok(seen[0].runner && seen[0].runner === seen[1].runner, '같은 트랜잭션(queryRunner)');
    during = null;
    fails(await get(open.token), 404, 'LINK_UNAVAILABLE');
    if (change === 'deactivate') {
      await setAccountState(a.memberId, 'ACTIVE');
      assert.equal((await get(open.token)).status, 200, '다시 활성이면 열린다');
    }
  }

  // 트랜잭션 밖 경로가 readSnapshot의 NotFound를 만나면 500이 아니라 404 LINK_UNAVAILABLE이다(BR6.1, OQ-U4-NFR-5 결정 A).
  const open = await link(a);
  during = async () => { throw new NotFound(); };
  fails(await get(open.token), 404, 'LINK_UNAVAILABLE');
  during = null;
  assertNoSecretsLogged();
});

test('S14: unlock 순서는 404 → 400(비밀번호 없는 링크·본문) → 429(비밀번호 확인 안 함) → 401·200이고, 같은 주소 10번 뒤에는 맞는 비밀번호도 429이며 받아 둔 grant와 다른 발행본은 영향이 없다', async () => {
  const a = await author();
  const open = await link(a);
  const locked = await link(a, { password: PASSWORD });
  const other = await link(a, { password: PASSWORD });

  fails(await unlock(open.token, { password: 'anything' }), 400, 'INVALID_REQUEST');
  assert.equal((await stop(a, open.publicationId)).status, 200);
  fails(await unlock(open.token, { password: 'anything' }), 404, 'LINK_UNAVAILABLE', '중지는 400보다 먼저');
  for (const [payload, violation] of [
    [{}, { field: 'password', reason: 'isString' }],
    [{ password: '' }, { field: 'password', reason: 'isNotEmpty' }],
    [{ password: 1 }, { field: 'password', reason: 'isString' }],
    [{ password: PASSWORD, remember: true }, { field: 'body', reason: 'whitelistValidation' }],
    [[], { field: 'body', reason: 'isObject' }],
  ]) {
    const result = await unlock(locked.token, payload);
    fails(result, 400, 'VALIDATION_FAILED');
    assert.deepEqual(result.body.details.violations, [violation]);
  }

  const grant = await grantFor(locked.token);
  const startIndex = server.logs.length;
  for (let i = 0; i < 10; i++) fails(await unlock(locked.token, { password: `wrong-${i}` }), 401, 'LINK_PASSWORD_INVALID');
  const limited = await unlock(locked.token, { password: PASSWORD });
  fails(limited, 429, 'LINK_UNLOCK_LIMITED');
  assert.deepEqual(Object.keys(limited.body).sort(), ['code', 'message']);
  assert.equal(limited.retryAfter, '900', '시험 시계가 멈춰 있어 남은 초는 차단 길이 그대로');
  fails(await unlock(locked.token, { password: '' }), 400, 'VALIDATION_FAILED', '차단 중에도 본문 오류는 400(시도로 세지 않음)');
  for (let i = 0; i < 3; i++) fails(await unlock(locked.token, { password: 'wrong-again' }), 429, 'LINK_UNLOCK_LIMITED');
  assert.equal((await get(locked.token, grant)).status, 200, '받아 둔 grant로는 차단 중에도 열람');
  assert.equal((await unlock(other.token, { password: PASSWORD })).status, 200, '같은 주소의 다른 발행본은 막지 않는다(키의 링크 단위는 publicationId)');
  now = new Date(now.getTime() + 15 * 60 * 1000);
  assert.equal((await unlock(locked.token, { password: PASSWORD })).status, 200, '차단이 끝나면 다시 받는다');

  // 보안 이벤트(10월 #222): 비밀번호 실패·차단을 한 줄씩, 등록 경로와 허용 필드만 기록한다.
  const events = server.logs.slice(startIndex).map((line) => line.text).filter((line) => line.endsWith(' SecurityEvent'));
  assert.equal(events.filter((line) => line.startsWith('LINK_PASSWORD_INVALID ')).length, 10);
  assert.equal(events.filter((line) => line.startsWith('LINK_UNLOCK_LIMITED ')).length, 4);
  for (const line of events) {
    assert.match(line, /^(?:LINK_PASSWORD_INVALID|LINK_UNLOCK_LIMITED) POST \/v1\/public\/links\/:token\/unlock requestId=[0-9a-f-]{36} at=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z SecurityEvent$/);
  }
  assertNoSecretsLogged(['wrong-again', 'wrong-0']);
});

test('[NFR-6 결정] 작성자가 비활성이면 GET·unlock 모두 404(비밀번호 없는 링크의 unlock도 400보다 먼저)이고 다시 활성이면 다음 요청부터 열리며, 판정은 링크와 같은 스냅샷이다', async (t) => {
  const a = await author();
  const open = await link(a);
  const locked = await link(a, { password: PASSWORD });
  const grant = await grantFor(locked.token);

  await setAccountState(a.memberId, 'SUSPENDED');
  fails(await get(open.token), 404, 'LINK_UNAVAILABLE');
  fails(await get(locked.token, grant), 404, 'LINK_UNAVAILABLE');
  fails(await unlock(open.token, { password: 'anything' }), 404, 'LINK_UNAVAILABLE');
  fails(await unlock(locked.token, { password: PASSWORD }), 404, 'LINK_UNAVAILABLE');
  await setAccountState(a.memberId, 'ACTIVE');
  assert.equal((await get(locked.token, grant)).status, 200);
  fails(await unlock(open.token, { password: 'anything' }), 400, 'INVALID_REQUEST');

  // 링크를 읽은 뒤 커밋된 비활성화는 그 판정에 보이지 않는다(같은 REPEATABLE READ 스냅샷). 다음 요청에 반영된다.
  const states = [];
  const calls = wrapOwnerState(t, async (ownerId, manager, original) => {
    if (states.length === 0) await setAccountState(ownerId, 'SUSPENDED');
    const state = await original(ownerId, manager);
    states.push(state);
    return state;
  });
  assert.equal((await get(open.token)).status, 200, '판정 시점에는 ACTIVE였다');
  fails(await get(open.token), 404, 'LINK_UNAVAILABLE');
  assert.deepEqual(states, ['AVAILABLE', 'INACTIVE']);
  assert.ok(calls.every((call) => call.manager), '소유 회원 상태는 판정 트랜잭션의 manager로 읽는다');
  assertNoSecretsLogged();
});

test('[NFR-6 결정] 유효한 발행본의 작성자 회원 행이 없으면(시험 대역) GET·unlock 모두 500 INTERNAL_ERROR 고정 본문이고, 응답·로그에 SQL·내부 메시지·토큰·grant가 없다', async (t) => {
  const a = await author();
  const open = await link(a);
  const locked = await link(a, { password: PASSWORD });
  const grant = await grantFor(locked.token);
  const startIndex = server.logs.length;

  const calls = wrapOwnerState(t, async () => 'NO_MEMBER');
  for (const result of [await get(open.token), await get(locked.token, grant), await unlock(open.token, { password: 'x' }), await unlock(locked.token, { password: PASSWORD })]) {
    fails(result, 500, 'INTERNAL_ERROR');
    assert.deepEqual(result.body, { code: 'INTERNAL_ERROR', message: '처리 중 오류가 발생했습니다.' });
  }
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.manager));
  assert.ok(server.logs.slice(startIndex).some((line) => line.text.includes('/v1/public/links/') && line.text.includes('→ 500 INTERNAL_ERROR')), '500 처리 로그');

  // 상태 조회 자체가 실패해도 500이고 SQL·내부 메시지는 응답·로그에 없다.
  const marker = 'synthetic-owner-state-internal-marker';
  wrapOwnerState(t, async () => {
    throw new QueryFailedError(`SELECT ${marker}`, [marker], Object.assign(new Error(marker), { code: '57014' }));
  });
  for (const result of [await get(open.token), await unlock(locked.token, { password: PASSWORD })]) {
    fails(result, 500, 'INTERNAL_ERROR');
    assert.ok(!result.text.includes(marker) && !result.text.includes('SELECT'));
  }
  assertNoSecretsLogged([marker]);
});

test('거부 사례: unlock의 형식 오류·없는 토큰은 404, 정의 밖 쿼리는 400, 회원 토큰을 실어도 판정은 같고 응답·로그에 토큰·grant·비밀번호가 없다', async () => {
  const a = await author();
  const open = await link(a);
  const locked = await link(a, { password: PASSWORD });
  for (const token of ['not-a-token', generateLinkToken()]) {
    fails(await unlock(token, { password: PASSWORD }), 404, 'LINK_UNAVAILABLE');
    fails(await unlock(token, {}), 404, 'LINK_UNAVAILABLE', '판정이 본문 검사보다 먼저');
  }
  const queried = await get(open.token, undefined, { query: '?limit=1' });
  fails(queried, 400, 'VALIDATION_FAILED');
  assert.deepEqual(queried.body.details.violations, [{ field: 'query', reason: 'whitelistValidation' }]);
  const withMember = await get(locked.token, undefined, { headers: { Authorization: `Bearer ${a.token}` } });
  fails(withMember, 401, 'LINK_PASSWORD_REQUIRED', '회원 토큰은 링크 판정과 무관하다');
  assert.equal((await get(open.token, undefined, { headers: { Authorization: `Bearer ${a.token}` } })).status, 200);
  const grant = await grantFor(locked.token);
  const shown = await get(locked.token, grant);
  assert.equal(shown.status, 200);
  for (const secret of [locked.token, grant, PASSWORD]) assert.equal(shown.text.includes(secret), false);
  assertNoSecretsLogged();
});
