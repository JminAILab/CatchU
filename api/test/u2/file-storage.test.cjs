// U2 FileStorage(계약 C-05, 기능 설계 W6·BR6.2~BR6.4, 바뀐 BR6.1은 비기능 보안 설계 「설정 검사 시점」, 시나리오 S22·S23).
// 두 설정 값은 dev-ci·예시 파일에 넣지 않고 시험 안에서 임시 폴더로 넣는다(코드 생성 결정 2). 끝나면 폴더를 지운다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const {
  FILE_STORAGE, FileNotFound, InvalidStorageKey, StorageUnavailable, memberPrefix, materialKey, publicationPrefix, publishedPdfKey,
} = require('../../dist/file-storage/file-storage');
const { readFileStorageConfig } = require('../../dist/file-storage/file-storage.config');
const { FileStorageModule, createFileStorage } = require('../../dist/file-storage/file-storage.module');
const { LocalFileStorage } = require('../../dist/file-storage/local-file-storage');
const { setEnv } = require('./support.cjs');

async function tempRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'catchu-u2-files-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
async function listFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath ?? entry.path, entry.name).slice(dir.length + 1)).sort();
}
const MEMBER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const MATERIAL = '33333333-3333-4333-8333-333333333333';
const PUBLICATION = '44444444-4444-4444-8444-444444444444';
const ITEM = '55555555-5555-4555-8555-555555555555';

test('put·get·copy: 계약 키 배치로 쓰고 읽으며, 임시 파일이 남지 않고 같은 키는 바뀐 내용으로 덮는다', async (t) => {
  const root = await tempRoot(t);
  const storage = new LocalFileStorage(root);
  assert.equal(memberPrefix(MEMBER), `members/${MEMBER}/`);
  assert.equal(materialKey(MEMBER, MATERIAL), `members/${MEMBER}/materials/${MATERIAL}.pdf`);
  assert.equal(publicationPrefix(MEMBER, PUBLICATION), `members/${MEMBER}/publications/${PUBLICATION}/`);
  assert.equal(publishedPdfKey(MEMBER, PUBLICATION, ITEM), `members/${MEMBER}/publications/${PUBLICATION}/${ITEM}.pdf`);
  assert.throws(() => memberPrefix('../x'), InvalidStorageKey);

  await storage.put(materialKey(MEMBER, MATERIAL), Buffer.from('첫 내용'), 'application/pdf');
  await storage.put(materialKey(MEMBER, MATERIAL), Buffer.from('둘째 내용'), 'application/pdf');
  assert.equal(await readAll(await storage.get(materialKey(MEMBER, MATERIAL))), '둘째 내용');
  await storage.copy(materialKey(MEMBER, MATERIAL), publishedPdfKey(MEMBER, PUBLICATION, ITEM));
  assert.equal(await readAll(await storage.get(publishedPdfKey(MEMBER, PUBLICATION, ITEM))), '둘째 내용');
  assert.deepEqual(await listFiles(root), [
    join('members', MEMBER, 'materials', `${MATERIAL}.pdf`),
    join('members', MEMBER, 'publications', PUBLICATION, `${ITEM}.pdf`),
  ].sort(), '임시 이름(.tmp-…) 파일이 남지 않는다');
});

test('없는 키를 읽거나 복사하면 FileNotFound, 없는 키 삭제는 성공. 쓰기 중 실패는 StorageUnavailable이고 임시 파일을 지운다', async (t) => {
  const root = await tempRoot(t);
  const storage = new LocalFileStorage(root);
  await assert.rejects(storage.get(materialKey(MEMBER, MATERIAL)), FileNotFound);
  await assert.rejects(storage.copy(materialKey(MEMBER, MATERIAL), materialKey(OTHER, MATERIAL)), FileNotFound);
  await storage.delete(materialKey(MEMBER, MATERIAL));
  // 폴더 자리를 파일이 차지하고 있으면 쓰기가 실패한다(합성 실패).
  await mkdir(join(root, 'members', MEMBER), { recursive: true });
  await writeFile(join(root, 'members', MEMBER, 'materials'), 'not a folder');
  await assert.rejects(storage.put(materialKey(MEMBER, MATERIAL), Buffer.from('x'), 'application/pdf'),
    (error) => error instanceof StorageUnavailable && error.reason === 'IO_FAILED' && !error.message.includes(root));
  await assert.rejects(storage.get(materialKey(MEMBER, MATERIAL)), FileNotFound);
  assert.deepEqual(await listFiles(root), [join('members', MEMBER, 'materials')]);
});

test('S23 없는 접두어 삭제는 성공하고, 있는 접두어 삭제는 그 회원 파일만 지운다', async (t) => {
  const root = await tempRoot(t);
  const storage = new LocalFileStorage(root);
  await storage.deletePrefix(memberPrefix(MEMBER));
  await storage.put(materialKey(MEMBER, MATERIAL), Buffer.from('a'), 'application/pdf');
  await storage.put(publishedPdfKey(MEMBER, PUBLICATION, ITEM), Buffer.from('b'), 'application/pdf');
  await storage.put(materialKey(OTHER, MATERIAL), Buffer.from('c'), 'application/pdf');
  await storage.deletePrefix(publicationPrefix(MEMBER, PUBLICATION));
  await assert.rejects(storage.get(publishedPdfKey(MEMBER, PUBLICATION, ITEM)), FileNotFound);
  assert.equal(await readAll(await storage.get(materialKey(MEMBER, MATERIAL))), 'a');
  await storage.deletePrefix(memberPrefix(MEMBER));
  assert.equal(existsSync(join(root, 'members', MEMBER)), false);
  assert.equal(await readAll(await storage.get(materialKey(OTHER, MATERIAL))), 'c', '다른 회원 파일은 남는다');
  await storage.deletePrefix(memberPrefix(MEMBER));
});

test('S22 ..·역슬래시·절대 경로·계약 밖 키는 거부하고 뿌리 밖을 건드리지 않는다. 뿌리 안 심볼릭 링크도 따라가지 않는다', async (t) => {
  const root = await tempRoot(t);
  const outside = await tempRoot(t);
  const storage = new LocalFileStorage(root);
  const invalid = [`members/../x`, `members/${MEMBER}/../../x`, `members/${MEMBER}/a\\b`, `/members/${MEMBER}/x`, `members/${MEMBER}//x`,
    `members/not-a-uuid/x`, `files/${MEMBER}/x`, `members/${MEMBER}/`, `members/${MEMBER}/.`, `members/${MEMBER}/a b`, 42];
  for (const key of invalid) {
    await assert.rejects(storage.put(key, Buffer.from('x'), 'text/plain'), InvalidStorageKey, String(key));
    await assert.rejects(storage.get(key), InvalidStorageKey, String(key));
    await assert.rejects(storage.delete(key), InvalidStorageKey, String(key));
  }
  for (const prefix of ['members/../', `members/${MEMBER}`, '', `members/${MEMBER}/../`]) {
    await assert.rejects(storage.deletePrefix(prefix), InvalidStorageKey, prefix);
  }
  // 뿌리 안의 회원 폴더가 뿌리 밖을 가리키는 심볼릭 링크면 거부한다.
  await writeFile(join(outside, 'keep.txt'), 'outside');
  await mkdir(join(root, 'members'), { recursive: true });
  await symlink(outside, join(root, 'members', OTHER));
  await assert.rejects(storage.put(materialKey(OTHER, MATERIAL), Buffer.from('x'), 'application/pdf'),
    (error) => error instanceof StorageUnavailable && error.reason === 'OUTSIDE_ROOT');
  await assert.rejects(storage.deletePrefix(memberPrefix(OTHER)), (error) => error instanceof StorageUnavailable && error.reason === 'OUTSIDE_ROOT');
  assert.deepEqual(await listFiles(outside), ['keep.txt']);
  assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'outside');
});

test('설정이 없으면 api는 기동하고 FileStorage의 모든 호출이 StorageUnavailable(NOT_CONFIGURED)이다', async (t) => {
  const restore = setEnv({ FILE_STORAGE_DRIVER: undefined, FILE_STORAGE_LOCAL_ROOT: undefined });
  t.after(restore);
  assert.equal(readFileStorageConfig(), null);
  const app = await NestFactory.createApplicationContext(FileStorageModule, { logger: false, abortOnError: false });
  t.after(() => app.close());
  const storage = app.get(FILE_STORAGE);
  const notConfigured = (error) => error instanceof StorageUnavailable && error.reason === 'NOT_CONFIGURED';
  await assert.rejects(storage.put(materialKey(MEMBER, MATERIAL), Buffer.from('x'), 'application/pdf'), notConfigured);
  await assert.rejects(storage.get(materialKey(MEMBER, MATERIAL)), notConfigured);
  await assert.rejects(storage.copy(materialKey(MEMBER, MATERIAL), materialKey(OTHER, MATERIAL)), notConfigured);
  await assert.rejects(storage.delete(materialKey(MEMBER, MATERIAL)), notConfigured);
  await assert.rejects(storage.deletePrefix(memberPrefix(MEMBER)), notConfigured, '탈퇴 2단계는 성공으로 끝나지 않는다');
});

test('빈 문자열은 없음과 같고, 한쪽만 있으면 기동 실패다', async (t) => {
  const root = await tempRoot(t);
  assert.equal(readFileStorageConfig({ FILE_STORAGE_DRIVER: '', FILE_STORAGE_LOCAL_ROOT: '' }), null);
  assert.ok(createFileStorage({ FILE_STORAGE_DRIVER: '', FILE_STORAGE_LOCAL_ROOT: '' }).constructor.name === 'UnavailableFileStorage');
  assert.throws(() => readFileStorageConfig({ FILE_STORAGE_DRIVER: 'local', FILE_STORAGE_LOCAL_ROOT: '' }), /둘 다/);
  assert.throws(() => readFileStorageConfig({ FILE_STORAGE_DRIVER: '', FILE_STORAGE_LOCAL_ROOT: root }), /둘 다/);
  assert.deepEqual(readFileStorageConfig({ FILE_STORAGE_DRIVER: 'local', FILE_STORAGE_LOCAL_ROOT: root }), { driver: 'local', root });
});

test('상대 경로·없는 폴더는 기동 실패이고 오류에 경로 값이 없다', async (t) => {
  const root = await tempRoot(t);
  const missing = join(root, `missing-${randomUUID()}`);
  assert.throws(() => readFileStorageConfig({ FILE_STORAGE_DRIVER: 'local', FILE_STORAGE_LOCAL_ROOT: 'relative/files' }),
    (error) => /절대 경로/.test(error.message) && !error.message.includes('relative/files'));
  assert.throws(() => readFileStorageConfig({ FILE_STORAGE_DRIVER: 'local', FILE_STORAGE_LOCAL_ROOT: missing }),
    (error) => /폴더가 없습니다/.test(error.message) && !error.message.includes(missing));
  const filePath = join(root, 'plain-file');
  await writeFile(filePath, 'x');
  assert.throws(() => readFileStorageConfig({ FILE_STORAGE_DRIVER: 'local', FILE_STORAGE_LOCAL_ROOT: filePath }), /폴더가 없습니다/);
  // 실제 모듈 조립도 멈춘다(기동 실패).
  const restore = setEnv({ FILE_STORAGE_DRIVER: 'local', FILE_STORAGE_LOCAL_ROOT: 'relative/files' });
  t.after(restore);
  await assert.rejects(NestFactory.createApplicationContext(FileStorageModule, { logger: false, abortOnError: false }), /절대 경로/);
});

test('모르는 드라이버(U8 전의 s3 포함)는 기동 실패다', async (t) => {
  const root = await tempRoot(t);
  for (const driver of ['s3', 'LOCAL', 'disk']) {
    assert.throws(() => readFileStorageConfig({ FILE_STORAGE_DRIVER: driver, FILE_STORAGE_LOCAL_ROOT: root }), /local이어야/);
  }
  const restore = setEnv({ FILE_STORAGE_DRIVER: 's3', FILE_STORAGE_LOCAL_ROOT: root });
  t.after(restore);
  await assert.rejects(NestFactory.createApplicationContext(FileStorageModule, { logger: false, abortOnError: false }), /local이어야/);
});
