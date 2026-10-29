const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRepositoryAddress } = require('../dist/member-repositories/repository-address');
const { GitHubRepositoryClient, verifiedMetadata } = require('../dist/member-repositories/github-repository.client');
const { GitHubAccessToken } = require('../dist/github-connection/github.client');
const { ApiError } = require('../dist/common/errors');
const code = expected => error => error instanceof ApiError && error.code === expected;
const metadata = { id: 123, private: false, disabled: false, owner: { login: 'team' }, name: 'repo' };

test('C1 공개 저장소 주소는 소유·기여 조회 없이 서버 ID와 좌표로 확인한다', async () => {
  const previous = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return Response.json(metadata); };
  try {
    const result = await new GitHubRepositoryClient().verify(parseRepositoryAddress('https://github.com/team/repo'), new GitHubAccessToken('synthetic-token'));
    assert.deepEqual(result, { repositoryId: '123', owner: 'team', name: 'repo', url: 'https://github.com/team/repo' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.github.com/repos/team/repo');
    assert.equal(calls[0].options.redirect, 'error');
    assert.equal(calls[0].options.signal.aborted, false);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-token/);
  } finally { global.fetch = previous; }
});
test('C1 공백·끝 slash·.git을 정리한다', () => {
  for (const value of ['https://github.com/team/repo', ' https://github.com/team/repo.git/ ']) {
    assert.deepEqual(parseRepositoryAddress(value), { owner: 'team', name: 'repo', url: 'https://github.com/team/repo' });
  }
});
test('C1 외부 호스트·userinfo·포트·query·fragment·하위/인코딩 경로를 거부한다', () => {
  for (const value of ['http://github.com/a/b', 'https://github.com.evil/a/b', 'https://x@github.com/a/b',
    'https://github.com:443/a/b', 'https://github.com/a/b?q=1', 'https://github.com/a/b#x',
    'https://github.com/a/b/tree/main', 'https://github.com/a/../b', 'https://github.com/a/%2e%2e',
    'https://github.com/a/b%2fc', 'https://github.com/a\\b', '', null]) {
    assert.throws(() => parseRepositoryAddress(value), code('REPOSITORY_URL_INVALID'));
  }
});
test('C1 비공개 확인과 지원 불가를 구분한다', () => {
  assert.throws(() => verifiedMetadata({ ...metadata, private: true }), code('REPOSITORY_PRIVATE'));
  assert.throws(() => verifiedMetadata({ ...metadata, disabled: true }), code('REPOSITORY_UNSUPPORTED'));
  // fork·archived·언어·별 수로 새 제한을 만들지 않는다.
  assert.equal(verifiedMetadata({ ...metadata, fork: true, archived: true, stargazers_count: 0 }).repositoryId, '123');
});
test('C1 404·권한 오류·redirect는 비공개로 추정하지 않는다', async () => {
  const previous = global.fetch;
  try {
    for (const status of [301, 403, 404, 500]) {
      global.fetch = async () => new Response('', { status });
      await assert.rejects(new GitHubRepositoryClient().verify(parseRepositoryAddress('https://github.com/a/b'), new GitHubAccessToken('test')), code('REPOSITORY_UNVERIFIED'));
    }
  } finally { global.fetch = previous; }
});
test('C1 과대·잘못된 JSON·통신 오류를 원문 없는 확인 불가로 거부한다', async () => {
  const previous = global.fetch;
  try {
    for (const body of ['x'.repeat(65537), '{invalid-secret']) {
      global.fetch = async () => new Response(body);
      await assert.rejects(new GitHubRepositoryClient().verify(parseRepositoryAddress('https://github.com/a/b'), new GitHubAccessToken('test')), code('REPOSITORY_UNVERIFIED'));
    }
    global.fetch = async () => { throw new Error('secret-url'); };
    await assert.rejects(new GitHubRepositoryClient().verify(parseRepositoryAddress('https://github.com/a/b'), new GitHubAccessToken('test')), error => code('REPOSITORY_UNVERIFIED')(error) && !error.message.includes('secret'));
  } finally { global.fetch = previous; }
});
test('C1 메타데이터의 ID·공개 여부·좌표를 검증하고 응답 URL을 신뢰하지 않는다', () => {
  for (const patch of [{ id: 0 }, { id: '123' }, { id: 1.2 }, { private: null }, { owner: { login: '../evil' } }, { name: 'a/b' }]) {
    assert.throws(() => verifiedMetadata({ ...metadata, ...patch }), code('REPOSITORY_UNVERIFIED'));
  }
  assert.equal(verifiedMetadata({ ...metadata, html_url: 'https://evil.invalid' }).url, 'https://github.com/team/repo');
});
test('C1 외부 요청은 내부 좌표와 검증 주소가 다르면 시작하지 않는다', async () => {
  await assert.rejects(new GitHubRepositoryClient().verify({ owner: 'evil', name: 'repo', url: 'https://github.com/team/repo' }, new GitHubAccessToken('test')), code('REPOSITORY_URL_INVALID'));
});
