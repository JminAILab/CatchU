// U8 FileStorage S3 드라이버(계약 C-05, 기능 설계 BR7.3, 비기능 NFR1.7·NFR4.8·NFR4.11·NFR4.15, 시나리오 S-1~S-7).
// 실제 AWS에는 접속하지 않는다. 요청을 기록하는 가짜 클라이언트(S-1~S-6)와 메모리 맵으로 객체를 흉내 내는 가짜 클라이언트(S-7 계약 시험)를 쓴다.
// 실제 버킷 확인은 #389(버킷·역할) 뒤 1회 수동으로 하고 확인 표에 적는다(OQ-U8-2). 자격·실제 버킷 이름은 어디에도 넣지 않는다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { mkdtemp, readdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const { test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { NoSuchBucket, NoSuchKey } = require('@aws-sdk/client-s3');
const { FILE_STORAGE, FileNotFound, InvalidStorageKey, StorageUnavailable, memberPrefix, materialKey, publicationPrefix, publishedPdfKey } =
  require('../../dist/file-storage/file-storage');
const { readFileStorageConfig } = require('../../dist/file-storage/file-storage.config');
const { FileStorageModule, createFileStorage } = require('../../dist/file-storage/file-storage.module');
const { LocalFileStorage } = require('../../dist/file-storage/local-file-storage');
const { S3FileStorage } = require('../../dist/file-storage/s3-file-storage');
const { setEnv } = require('../u2/support.cjs');
const { registerStorageContractTests, readAll, MEMBER, OTHER, MATERIAL, PUBLICATION, ITEM } = require('./storage-contract.cjs');

const BUCKET = 'catchu-test-bucket';
const noSuchKey = () => new NoSuchKey({ $metadata: { httpStatusCode: 404 }, message: 'The specified key does not exist.' });
const noSuchBucket = () => new NoSuchBucket({ $metadata: { httpStatusCode: 404 }, message: 'The specified bucket does not exist.' });
/** 이름 없는 404(이름이 NoSuchKey가 아닌 404 응답). 없는 객체가 아니라 저장소 오류로 본다. */
const nameless404 = () => Object.assign(new Error('Not Found'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });

/** 요청을 기록하고 handler(name, input)의 결과를 돌려주는 가짜 S3 클라이언트. handler가 던지면 그대로 던진다. */
class RecordingS3 {
  constructor(handler) {
    this.handler = handler;
    this.calls = [];
  }
  async send(command) {
    const call = { name: command.constructor.name, input: command.input };
    this.calls.push(call);
    return this.handler(call.name, call.input);
  }
  names() { return this.calls.map((call) => call.name); }
}

/** 메모리 맵으로 객체를 흉내 내는 가짜 S3(계약 시험용). ListObjectsV2는 1,000개씩 넘긴다. */
class MemoryS3 {
  constructor() {
    this.objects = new Map();
    this.calls = [];
  }
  async send(command) {
    const name = command.constructor.name;
    const input = command.input;
    this.calls.push({ name, input });
    switch (name) {
      case 'PutObjectCommand':
        this.objects.set(input.Key, { body: Buffer.from(input.Body), contentType: input.ContentType });
        return {};
      case 'GetObjectCommand': {
        const object = this.objects.get(input.Key);
        if (!object) throw noSuchKey();
        return { Body: Readable.from([object.body]) };
      }
      case 'CopyObjectCommand': {
        const [bucket, ...rest] = input.CopySource.split('/');
        assert.equal(bucket, BUCKET);
        const object = this.objects.get(rest.join('/'));
        if (!object) throw noSuchKey();
        this.objects.set(input.Key, { ...object });
        return {};
      }
      case 'DeleteObjectCommand':
        this.objects.delete(input.Key);
        return {};
      case 'ListObjectsV2Command': {
        const keys = [...this.objects.keys()].filter((key) => key.startsWith(input.Prefix)).sort();
        const start = input.ContinuationToken === undefined ? 0 : Number(input.ContinuationToken);
        const page = keys.slice(start, start + 1000);
        const truncated = start + 1000 < keys.length;
        return { Contents: page.map((Key) => ({ Key })), IsTruncated: truncated, NextContinuationToken: truncated ? String(start + 1000) : undefined };
      }
      case 'DeleteObjectsCommand':
        assert.ok(input.Delete.Objects.length <= 1000, 'DeleteObjects는 1,000개 이하여야 한다');
        for (const { Key } of input.Delete.Objects) this.objects.delete(Key);
        return {};
      default:
        throw new Error(`가짜 S3가 모르는 명령: ${name}`);
    }
  }
}

const OK_HANDLER = (name) => {
  if (name === 'GetObjectCommand') return { Body: Readable.from([Buffer.from('%PDF-1.4 fake')]) };
  if (name === 'ListObjectsV2Command') return { Contents: [], IsTruncated: false };
  return {};
};
const ioFailed = (error) => error instanceof StorageUnavailable && error.reason === 'IO_FAILED'
  && !error.message.includes(BUCKET) && !error.message.includes(MEMBER);

test('S-1 다섯 메서드가 PutObject·GetObject·CopyObject·DeleteObject·ListObjectsV2+DeleteObjects를 버킷·키 그대로 부른다', async () => {
  const from = materialKey(MEMBER, MATERIAL);
  const to = publishedPdfKey(MEMBER, PUBLICATION, ITEM);
  const client = new RecordingS3((name) => {
    if (name === 'ListObjectsV2Command') return { Contents: [{ Key: from }, { Key: to }], IsTruncated: false };
    return OK_HANDLER(name);
  });
  const storage = new S3FileStorage(BUCKET, client);
  const body = Buffer.from('%PDF-1.4 fake');

  await storage.put(from, body, 'application/pdf');
  assert.equal(await readAll(await storage.get(from)), '%PDF-1.4 fake');
  await storage.copy(from, to);
  await storage.delete(to);
  await storage.deletePrefix(memberPrefix(MEMBER));

  assert.deepEqual(client.names(), ['PutObjectCommand', 'GetObjectCommand', 'CopyObjectCommand', 'DeleteObjectCommand', 'ListObjectsV2Command', 'DeleteObjectsCommand']);
  const [put, get, copy, del, list, deleteMany] = client.calls.map((call) => call.input);
  assert.deepEqual({ Bucket: put.Bucket, Key: put.Key, ContentType: put.ContentType }, { Bucket: BUCKET, Key: from, ContentType: 'application/pdf' });
  assert.ok(put.Body === body, 'put 본문은 받은 Buffer 그대로다');
  assert.deepEqual(get, { Bucket: BUCKET, Key: from });
  assert.deepEqual(copy, { Bucket: BUCKET, CopySource: `${BUCKET}/${from}`, Key: to });
  assert.deepEqual(del, { Bucket: BUCKET, Key: to });
  assert.deepEqual(list, { Bucket: BUCKET, Prefix: memberPrefix(MEMBER), ContinuationToken: undefined });
  assert.deepEqual(deleteMany, { Bucket: BUCKET, Delete: { Objects: [{ Key: from }, { Key: to }], Quiet: true } });
});

test('S-2 get·copy에서 NoSuchKey는 FileNotFound이고, 없는 키(NoSuchKey) delete는 성공이다. 없는 대상 판정은 NoSuchKey만이다', async () => {
  const missing = new RecordingS3(() => { throw noSuchKey(); });
  const storage = new S3FileStorage(BUCKET, missing);
  await assert.rejects(storage.get(materialKey(MEMBER, MATERIAL)), FileNotFound);
  await assert.rejects(storage.copy(materialKey(MEMBER, MATERIAL), publishedPdfKey(MEMBER, PUBLICATION, ITEM)), FileNotFound);
  await storage.delete(materialKey(MEMBER, MATERIAL));
  assert.deepEqual(missing.names(), ['GetObjectCommand', 'CopyObjectCommand', 'DeleteObjectCommand']);

  // put·deletePrefix에는 "없는 대상"이 없다: NoSuchKey가 와도 장애다.
  await assert.rejects(storage.put(materialKey(MEMBER, MATERIAL), Buffer.from('x'), 'application/pdf'), ioFailed);
  await assert.rejects(storage.deletePrefix(memberPrefix(MEMBER)), ioFailed);
});

test('회귀(계획 4.5a): NoSuchBucket·이름 없는 404는 저장소 오류다 — delete에서 성공이 아니고 get·copy에서 FileNotFound가 아니라 IO_FAILED(cause 보존)', async () => {
  for (const [label, makeError] of [['NoSuchBucket', noSuchBucket], ['이름 없는 404', nameless404]]) {
    const thrown = [];
    const client = new RecordingS3(() => { const error = makeError(); thrown.push(error); throw error; });
    const storage = new S3FileStorage(BUCKET, client);
    const keepsCause = (error) => ioFailed(error) && !(error instanceof FileNotFound) && error.cause === thrown[thrown.length - 1];
    // (a) delete: 성공으로 끝나면 안 된다.
    await assert.rejects(storage.delete(materialKey(MEMBER, MATERIAL)), keepsCause, `${label}: delete`);
    // (b) get·copy: FileNotFound로 바꾸면 안 된다.
    await assert.rejects(storage.get(materialKey(MEMBER, MATERIAL)), keepsCause, `${label}: get`);
    await assert.rejects(storage.copy(materialKey(MEMBER, MATERIAL), publishedPdfKey(MEMBER, PUBLICATION, ITEM)), keepsCause, `${label}: copy`);
    assert.deepEqual(client.names(), ['DeleteObjectCommand', 'GetObjectCommand', 'CopyObjectCommand'], `${label}: 각 호출은 한 번`);
  }
  // 대조: 같은 404라도 NoSuchKey면 delete 성공·get FileNotFound다.
  const keyOnly = new S3FileStorage(BUCKET, new RecordingS3(() => { throw noSuchKey(); }));
  await keyOnly.delete(materialKey(MEMBER, MATERIAL));
  await assert.rejects(keyOnly.get(materialKey(MEMBER, MATERIAL)), FileNotFound);
});

test('S-3 네트워크·IO 오류는 StorageUnavailable(IO_FAILED) 한 번이고 원인을 cause로 보존한다. 드라이버는 재시도를 더하지 않는다(SDK 기본값에 맡김)', async () => {
  const network = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
  const client = new RecordingS3(() => { throw network; });
  const storage = new S3FileStorage(BUCKET, client);
  const operations = [
    ['PutObjectCommand', () => storage.put(materialKey(MEMBER, MATERIAL), Buffer.from('x'), 'application/pdf')],
    ['GetObjectCommand', () => storage.get(materialKey(MEMBER, MATERIAL))],
    ['CopyObjectCommand', () => storage.copy(materialKey(MEMBER, MATERIAL), publishedPdfKey(MEMBER, PUBLICATION, ITEM))],
    ['DeleteObjectCommand', () => storage.delete(materialKey(MEMBER, MATERIAL))],
    ['ListObjectsV2Command', () => storage.deletePrefix(memberPrefix(MEMBER))],
  ];
  for (const [expectedCommand, run] of operations) {
    client.calls.length = 0;
    await assert.rejects(run(), (error) => ioFailed(error) && error.cause === network, expectedCommand);
    assert.deepEqual(client.names(), [expectedCommand], `${expectedCommand}: 드라이버가 send를 한 번만 부른다`);
  }
  // GetObject 응답에 Body가 없거나 Readable이 아니면 읽어 내려 줄 수 없으니 IO_FAILED다.
  await assert.rejects(new S3FileStorage(BUCKET, new RecordingS3(() => ({}))).get(materialKey(MEMBER, MATERIAL)), ioFailed);
  await assert.rejects(new S3FileStorage(BUCKET, new RecordingS3(() => ({ Body: 'string body' }))).get(materialKey(MEMBER, MATERIAL)), ioFailed);
});

test('S-4 deletePrefix는 ListObjectsV2를 끝까지 넘기며 1,000개 단위로 DeleteObjects하고(1,001개 → 2회), 없는 접두어는 삭제 호출 없이 성공이다', async () => {
  const prefix = memberPrefix(MEMBER);
  const keys = Array.from({ length: 1001 }, (_, index) => `${prefix}materials/${String(index).padStart(4, '0')}.pdf`);
  const client = new RecordingS3((name, input) => {
    if (name === 'ListObjectsV2Command') {
      if (input.ContinuationToken === undefined) return { Contents: keys.slice(0, 1000).map((Key) => ({ Key })), IsTruncated: true, NextContinuationToken: 'page-2' };
      assert.equal(input.ContinuationToken, 'page-2');
      return { Contents: keys.slice(1000).map((Key) => ({ Key })), IsTruncated: false };
    }
    return {};
  });
  const storage = new S3FileStorage(BUCKET, client);
  await storage.deletePrefix(prefix);
  assert.deepEqual(client.names(), ['ListObjectsV2Command', 'DeleteObjectsCommand', 'ListObjectsV2Command', 'DeleteObjectsCommand']);
  const batches = client.calls.filter((call) => call.name === 'DeleteObjectsCommand').map((call) => call.input.Delete.Objects.map((object) => object.Key));
  assert.deepEqual(batches.map((batch) => batch.length), [1000, 1]);
  assert.deepEqual(batches.flat(), keys, '모든 키를 한 번씩, 순서대로 지운다');
  assert.ok(client.calls.every((call) => call.name !== 'ListObjectsV2Command' || call.input.Prefix === prefix));

  // 없는 접두어: 목록이 비면 DeleteObjects를 부르지 않는다(Contents 없음·빈 배열 모두).
  for (const empty of [{ IsTruncated: false }, { Contents: [], IsTruncated: false }]) {
    const none = new RecordingS3(() => empty);
    await new S3FileStorage(BUCKET, none).deletePrefix(publicationPrefix(MEMBER, PUBLICATION));
    assert.deepEqual(none.names(), ['ListObjectsV2Command']);
  }
});

test('deletePrefix 방어 3건(계획 4.1): 요청 접두어 밖 키가 목록에 오면 삭제 없이 IO_FAILED, DeleteObjects 응답 Errors는 IO_FAILED, IsTruncated인데 다음 토큰이 없으면 IO_FAILED', async () => {
  const prefix = publicationPrefix(MEMBER, PUBLICATION);
  const inside = publishedPdfKey(MEMBER, PUBLICATION, ITEM);
  // 1) IsTruncated인데 다음 토큰이 없으면 조용히 멈추지 않고 장애로 끝낸다.
  const broken = new RecordingS3((name) => (name === 'ListObjectsV2Command' ? { Contents: [{ Key: inside }], IsTruncated: true } : {}));
  await assert.rejects(new S3FileStorage(BUCKET, broken).deletePrefix(prefix), ioFailed);
  assert.deepEqual(broken.names(), ['ListObjectsV2Command', 'DeleteObjectsCommand'], '받은 쪽은 지우고, 다음 쪽으로 넘어가지 못한 것을 장애로 알린다');
  // 2) DeleteObjects 응답 Errors.
  const withErrors = new RecordingS3((name) => (name === 'ListObjectsV2Command'
    ? { Contents: [{ Key: inside }], IsTruncated: false }
    : { Errors: [{ Key: inside, Code: 'AccessDenied' }] }));
  await assert.rejects(new S3FileStorage(BUCKET, withErrors).deletePrefix(prefix), ioFailed);
  assert.deepEqual(withErrors.names(), ['ListObjectsV2Command', 'DeleteObjectsCommand']);
  // 3) 요청 접두어 밖 키.
  const outside = new RecordingS3((name) => (name === 'ListObjectsV2Command'
    ? { Contents: [{ Key: inside }, { Key: materialKey(OTHER, MATERIAL) }], IsTruncated: false }
    : {}));
  await assert.rejects(new S3FileStorage(BUCKET, outside).deletePrefix(prefix), ioFailed);
  assert.deepEqual(outside.names(), ['ListObjectsV2Command'], '다른 회원 키가 섞인 목록은 DeleteObjects를 부르지 않는다');
});

test('S-5 키 모양이 틀리면 parseStorageKey에서 거부하고 S3를 부르지 않는다', async () => {
  const client = new RecordingS3(OK_HANDLER);
  const storage = new S3FileStorage(BUCKET, client);
  const invalid = [`members/../x`, `members/${MEMBER}/../../x`, `members/${MEMBER}/a\\b`, `/members/${MEMBER}/x`, `members/not-a-uuid/x`,
    `members/${MEMBER}/`, `members/${MEMBER}/a b`, 42, null];
  for (const key of invalid) {
    await assert.rejects(storage.put(key, Buffer.from('x'), 'application/pdf'), InvalidStorageKey, String(key));
    await assert.rejects(storage.get(key), InvalidStorageKey, String(key));
    await assert.rejects(storage.copy(key, materialKey(MEMBER, MATERIAL)), InvalidStorageKey, String(key));
    await assert.rejects(storage.copy(materialKey(MEMBER, MATERIAL), key), InvalidStorageKey, String(key));
    await assert.rejects(storage.delete(key), InvalidStorageKey, String(key));
  }
  for (const prefix of ['members/../', `members/${MEMBER}`, '', `members/${MEMBER}/materials/x.pdf`]) {
    await assert.rejects(storage.deletePrefix(prefix), InvalidStorageKey, prefix);
  }
  await assert.rejects(storage.put(materialKey(MEMBER, MATERIAL), 'not a buffer', 'application/pdf'), TypeError);
  assert.deepEqual(client.calls, [], 'S3 호출이 한 번도 없다');
});

test('S-6 설정·혼합 설정 거부(계획 4.2): 세 값이 모두 비면 없음, s3는 버킷 이름 필수, 드라이버마다 자기 값만(local+버킷·s3+뿌리·드라이버 없이 값만 → 기동 실패), 버킷 이름 S3 모양 검사. 오류 문구에 버킷·경로 값이 없다', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'catchu-u8-s3-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const failsWithout = (env, pattern, secret) => assert.throws(() => readFileStorageConfig(env),
    (error) => error.name === 'FileStorageConfigError' && pattern.test(error.message) && (secret === undefined || !error.message.includes(secret)),
    JSON.stringify(env));

  assert.equal(readFileStorageConfig({ FILE_STORAGE_DRIVER: '', FILE_STORAGE_LOCAL_ROOT: '', FILE_STORAGE_S3_BUCKET: '' }), null);
  assert.equal(readFileStorageConfig({}), null);
  failsWithout({ FILE_STORAGE_DRIVER: 's3' }, /FILE_STORAGE_S3_BUCKET이 필요/);
  failsWithout({ FILE_STORAGE_DRIVER: 's3', FILE_STORAGE_S3_BUCKET: '' }, /FILE_STORAGE_S3_BUCKET이 필요/);
  failsWithout({ FILE_STORAGE_DRIVER: 's3', FILE_STORAGE_S3_BUCKET: BUCKET, FILE_STORAGE_LOCAL_ROOT: root }, /FILE_STORAGE_LOCAL_ROOT를 비워야/, root);
  failsWithout({ FILE_STORAGE_DRIVER: 'local', FILE_STORAGE_LOCAL_ROOT: root, FILE_STORAGE_S3_BUCKET: BUCKET }, /FILE_STORAGE_S3_BUCKET을 비워야/, BUCKET);
  failsWithout({ FILE_STORAGE_DRIVER: '', FILE_STORAGE_S3_BUCKET: BUCKET }, /둘 다/, BUCKET);
  for (const badName of ['ab', 'Upper-Case', 'has_underscore', '-starts-with-dash', 'ends-with-dot.', 'a'.repeat(64), 'with space', 'bucket/slash']) {
    failsWithout({ FILE_STORAGE_DRIVER: 's3', FILE_STORAGE_S3_BUCKET: badName }, /버킷 이름 모양/, badName);
  }
  assert.deepEqual(readFileStorageConfig({ FILE_STORAGE_DRIVER: 's3', FILE_STORAGE_S3_BUCKET: BUCKET }), { driver: 's3', bucket: BUCKET });
  assert.deepEqual(readFileStorageConfig({ FILE_STORAGE_DRIVER: 's3', FILE_STORAGE_S3_BUCKET: 'a.b-c3', FILE_STORAGE_LOCAL_ROOT: '' }), { driver: 's3', bucket: 'a.b-c3' });

  // 실제 모듈 조립도 멈춘다(기동 실패).
  const restore = setEnv({ FILE_STORAGE_DRIVER: 's3', FILE_STORAGE_S3_BUCKET: '', FILE_STORAGE_LOCAL_ROOT: undefined });
  t.after(restore);
  await assert.rejects(NestFactory.createApplicationContext(FileStorageModule, { logger: false, abortOnError: false }), /FILE_STORAGE_S3_BUCKET이 필요/);
});

test('드라이버 선택: s3 설정이면 S3FileStorage를 만들고(접속은 첫 호출 때), local이면 LocalFileStorage다', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'catchu-u8-s3-module-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.ok(createFileStorage({ FILE_STORAGE_DRIVER: 's3', FILE_STORAGE_S3_BUCKET: BUCKET }) instanceof S3FileStorage);
  assert.ok(createFileStorage({ FILE_STORAGE_DRIVER: 'local', FILE_STORAGE_LOCAL_ROOT: root }) instanceof LocalFileStorage);
  assert.equal(createFileStorage({}).constructor.name, 'UnavailableFileStorage');

  const restore = setEnv({ FILE_STORAGE_DRIVER: 's3', FILE_STORAGE_S3_BUCKET: BUCKET, FILE_STORAGE_LOCAL_ROOT: undefined });
  t.after(restore);
  const app = await NestFactory.createApplicationContext(FileStorageModule, { logger: false, abortOnError: false });
  t.after(() => app.close());
  assert.ok(app.get(FILE_STORAGE) instanceof S3FileStorage);
});

// S-7 로컬·S3 드라이버가 같은 계약 시험을 통과한다.
registerStorageContractTests('LocalFileStorage', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'catchu-u8-contract-local-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const storedKeys = async () => {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    return entries.filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath ?? entry.path, entry.name).slice(root.length + 1).split('\\').join('/')).sort();
  };
  return { storage: new LocalFileStorage(root), storedKeys };
});

registerStorageContractTests('S3FileStorage(가짜 S3)', async () => {
  const client = new MemoryS3();
  return { storage: new S3FileStorage(BUCKET, client), storedKeys: async () => [...client.objects.keys()].sort() };
});
