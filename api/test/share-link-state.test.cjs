const assert = require('node:assert/strict');
const { test } = require('node:test');
const { shareLinkState, isShareLinkValidAt } = require('../dist/share-links/share-link-state.js');

const expiresAt = new Date('2026-10-29T00:00:00.000Z');
const before = new Date(expiresAt.getTime() - 1);

test('중단되지 않고 만료 전이면 ACTIVE, 만료 시각부터는 EXPIRED', () => {
  assert.equal(shareLinkState({ expiresAt, stoppedAt: null }, before), 'ACTIVE');
  assert.equal(shareLinkState({ expiresAt, stoppedAt: null }, expiresAt), 'EXPIRED');
  assert.equal(shareLinkState({ expiresAt, stoppedAt: null }, new Date(expiresAt.getTime() + 1)), 'EXPIRED');
  assert.equal(isShareLinkValidAt({ expiresAt, stoppedAt: null }, before), true);
  assert.equal(isShareLinkValidAt({ expiresAt, stoppedAt: null }, expiresAt), false);
});

test('중단이 만료보다 우선하며, 중단한 링크는 만료 시각이 지나도 STOPPED다', () => {
  const stoppedAt = new Date('2026-10-01T00:00:00.000Z');
  assert.equal(shareLinkState({ expiresAt, stoppedAt }, before), 'STOPPED');
  assert.equal(shareLinkState({ expiresAt, stoppedAt }, new Date('2027-01-01T00:00:00.000Z')), 'STOPPED');
  assert.equal(isShareLinkValidAt({ expiresAt, stoppedAt }, before), false);
});

test('잘못된 시각은 판정하지 않는다', () => {
  for (const [link, now] of [
    [{ expiresAt: new Date(NaN), stoppedAt: null }, before],
    [{ expiresAt, stoppedAt: null }, new Date(NaN)],
    [{ expiresAt, stoppedAt: new Date(NaN) }, before],
    [{ expiresAt: '2026-10-29', stoppedAt: null }, before],
  ]) {
    assert.throws(() => shareLinkState(link, now), TypeError);
  }
});
