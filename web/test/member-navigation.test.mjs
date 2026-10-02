import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccessTokenStore } from '../src/lib/access-token.ts';
import { afterLoginPath, decideMemberEntry, loginPath, safeNextPath } from '../src/lib/member-navigation.ts';

test('next는 서비스 안 회원 경로만 받는다', () => {
  for (const [value, expected] of [
    ['/home', '/home'],
    ['/assets?repositoryId=r1&catchId=c1', '/assets?repositoryId=r1&catchId=c1'],
    ['/links', '/links'],
    ['/profile/edit', '/profile/edit'],
    ['/profile/setup', '/profile/setup'],
  ]) assert.equal(safeNextPath(value), expected, value);

  for (const value of [
    null, undefined, '', 'home', '//evil.example/home', '/\\evil.example', 'https://evil.example/home',
    '/login', '/login?next=/home', '/', '/s/token', '/s/token/catches/c1', '/homex', '/assetsx', '/preview/common',
    '/home\nx', `/home?${'a'.repeat(2100)}`, '/%2F%2Fevil.example',
  ]) assert.equal(safeNextPath(value), null, String(value));
});

test('로그인 진입 주소는 회원 경로일 때만 next를 인코딩해 붙인다', () => {
  assert.equal(loginPath('/assets?repositoryId=r1'), '/login?next=%2Fassets%3FrepositoryId%3Dr1');
  assert.equal(loginPath('/s/token'), '/login');
  assert.equal(loginPath(undefined), '/login');
});

test('이름 규칙: 조회 중 대기, 실패는 다시 불러오기, 빈 이름만 최초 입력으로', () => {
  assert.deepEqual(decideMemberEntry({ state: 'loading' }, '/home'), { action: 'wait' });
  assert.deepEqual(decideMemberEntry({ state: 'failed' }, '/home'), { action: 'retry' });
  assert.deepEqual(decideMemberEntry({ state: 'loaded', displayName: '' }, '/home'), { action: 'redirect', to: '/profile/setup' });
  assert.deepEqual(decideMemberEntry({ state: 'loaded', displayName: '' }, '/profile/setup'), { action: 'allow' }, '최초 입력 화면에서 다시 보내지 않는다');
  assert.deepEqual(decideMemberEntry({ state: 'loaded', displayName: '수영' }, '/assets'), { action: 'allow' });
});

test('로그인 후 목적지: 이름이 있으면 검증된 next, 없으면 최초 입력, 모르면 next 또는 홈', () => {
  assert.equal(afterLoginPath('수영', '/links'), '/links');
  assert.equal(afterLoginPath('수영', '//evil.example'), '/home');
  assert.equal(afterLoginPath('수영', null), '/home');
  assert.equal(afterLoginPath('', '/links'), '/profile/setup');
  assert.equal(afterLoginPath(null, '/assets'), '/assets');
  assert.equal(afterLoginPath(null, '/login'), '/home');
});

test('토큰 저장소는 바뀔 때만 알리고 끝난 이유를 남긴다', () => {
  const store = createAccessTokenStore();
  let notified = 0;
  const unsubscribe = store.subscribe(() => { notified += 1; });
  const initial = store.get();
  assert.deepEqual(initial, { token: null, ended: null });
  store.set('t1');
  store.set('t1');
  assert.equal(notified, 1, '같은 값이면 알리지 않는다');
  store.clear('logout');
  assert.deepEqual(store.get(), { token: null, ended: 'logout' });
  store.set('t2');
  assert.deepEqual(store.get(), { token: 't2', ended: null });
  unsubscribe();
  store.clear('auth-failed');
  assert.equal(notified, 3);
  assert.throws(() => store.set(''), TypeError);
});
