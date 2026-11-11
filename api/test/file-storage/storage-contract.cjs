// FileStorage 공용 계약 시험(계약 C-05, U8 기능 설계 BR7.3 "로컬·S3 드라이버는 같은 계약 시험을 통과", NFR4.11, 시나리오 S-7).
// 시험 파일이 아니다(이름이 .test.cjs로 끝나지 않아 실행기가 따로 돌리지 않는다). 드라이버별 시험 파일이 registerStorageContractTests로 등록한다.
// makeStorage(t)는 { storage, storedKeys } 를 돌려준다. storedKeys()는 지금 저장소에 있는 키 목록(정렬)이다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { FileNotFound, InvalidStorageKey, memberPrefix, materialKey, publicationPrefix, publishedPdfKey } = require('../../dist/file-storage/file-storage');

const MEMBER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const MATERIAL = '33333333-3333-4333-8333-333333333333';
const MATERIAL_2 = '66666666-6666-4666-8666-666666666666';
const PUBLICATION = '44444444-4444-4444-8444-444444444444';
const ITEM = '55555555-5555-4555-8555-555555555555';

async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/** 계약 키 배치가 아닌 입력. 모든 드라이버가 저장소를 건드리지 않고 InvalidStorageKey를 던져야 한다. */
const INVALID_KEYS = [`members/../x`, `members/${MEMBER}/../../x`, `members/${MEMBER}/a\\b`, `/members/${MEMBER}/x`, `members/${MEMBER}//x`,
  `members/not-a-uuid/x`, `files/${MEMBER}/x`, `members/${MEMBER}/`, `members/${MEMBER}/.`, `members/${MEMBER}/a b`, 42, undefined];
const INVALID_PREFIXES = ['members/../', `members/${MEMBER}`, '', `members/${MEMBER}/../`, `members/${MEMBER}/materials/x.pdf`];

/**
 * @param {string} name 드라이버 이름(시험 제목 접두어)
 * @param {(t: import('node:test').TestContext) => Promise<{ storage: import('../../dist/file-storage/file-storage').FileStorage, storedKeys: () => Promise<string[]> }>} makeStorage
 */
function registerStorageContractTests(name, makeStorage) {
  test(`[${name}] 계약: put 뒤 get으로 같은 내용을 읽고, 같은 키에 다시 put하면 새 내용으로 덮는다`, async (t) => {
    const { storage, storedKeys } = await makeStorage(t);
    await storage.put(materialKey(MEMBER, MATERIAL), Buffer.from('첫 내용'), 'application/pdf');
    assert.equal(await readAll(await storage.get(materialKey(MEMBER, MATERIAL))), '첫 내용');
    await storage.put(materialKey(MEMBER, MATERIAL), Buffer.from('둘째 내용'), 'application/pdf');
    assert.equal(await readAll(await storage.get(materialKey(MEMBER, MATERIAL))), '둘째 내용');
    assert.deepEqual(await storedKeys(), [materialKey(MEMBER, MATERIAL)]);
  });

  test(`[${name}] 계약: copy는 원본을 그대로 두고 대상 키에 같은 내용을 만든다`, async (t) => {
    const { storage, storedKeys } = await makeStorage(t);
    await storage.put(materialKey(MEMBER, MATERIAL), Buffer.from('원본'), 'application/pdf');
    await storage.copy(materialKey(MEMBER, MATERIAL), publishedPdfKey(MEMBER, PUBLICATION, ITEM));
    assert.equal(await readAll(await storage.get(publishedPdfKey(MEMBER, PUBLICATION, ITEM))), '원본');
    assert.equal(await readAll(await storage.get(materialKey(MEMBER, MATERIAL))), '원본');
    assert.deepEqual(await storedKeys(), [materialKey(MEMBER, MATERIAL), publishedPdfKey(MEMBER, PUBLICATION, ITEM)].sort());
    // 사본은 원본과 독립이다: 원본을 바꿔도 사본은 그대로다(BR4.4의 저장소 바닥).
    await storage.put(materialKey(MEMBER, MATERIAL), Buffer.from('바뀐 원본'), 'application/pdf');
    assert.equal(await readAll(await storage.get(publishedPdfKey(MEMBER, PUBLICATION, ITEM))), '원본');
  });

  test(`[${name}] 계약: 없는 키를 get·copy하면 FileNotFound이고 아무것도 만들지 않는다`, async (t) => {
    const { storage, storedKeys } = await makeStorage(t);
    await assert.rejects(storage.get(materialKey(MEMBER, MATERIAL)), FileNotFound);
    await assert.rejects(storage.copy(materialKey(MEMBER, MATERIAL), publishedPdfKey(MEMBER, PUBLICATION, ITEM)), FileNotFound);
    assert.deepEqual(await storedKeys(), []);
  });

  test(`[${name}] 계약: 없는 키 delete는 성공이고, 있는 키 delete 뒤에는 get이 FileNotFound다`, async (t) => {
    const { storage, storedKeys } = await makeStorage(t);
    await storage.delete(materialKey(MEMBER, MATERIAL));
    await storage.put(materialKey(MEMBER, MATERIAL), Buffer.from('a'), 'application/pdf');
    await storage.put(materialKey(MEMBER, MATERIAL_2), Buffer.from('b'), 'application/pdf');
    await storage.delete(materialKey(MEMBER, MATERIAL));
    await assert.rejects(storage.get(materialKey(MEMBER, MATERIAL)), FileNotFound);
    assert.equal(await readAll(await storage.get(materialKey(MEMBER, MATERIAL_2))), 'b', '다른 키는 남는다');
    assert.deepEqual(await storedKeys(), [materialKey(MEMBER, MATERIAL_2)]);
    await storage.delete(materialKey(MEMBER, MATERIAL)); // 두 번 지워도 성공
  });

  test(`[${name}] 계약: 없는 접두어 deletePrefix는 성공이고, 있는 접두어는 그 아래만 지우며 다른 회원·다른 접두어는 남는다`, async (t) => {
    const { storage, storedKeys } = await makeStorage(t);
    await storage.deletePrefix(memberPrefix(MEMBER));
    await storage.deletePrefix(publicationPrefix(MEMBER, PUBLICATION));
    assert.deepEqual(await storedKeys(), []);
    await storage.put(materialKey(MEMBER, MATERIAL), Buffer.from('a'), 'application/pdf');
    await storage.put(publishedPdfKey(MEMBER, PUBLICATION, ITEM), Buffer.from('b'), 'application/pdf');
    await storage.put(materialKey(OTHER, MATERIAL), Buffer.from('c'), 'application/pdf');
    // 발행본 접두어만 지우면 같은 회원의 자료 원본은 남는다.
    await storage.deletePrefix(publicationPrefix(MEMBER, PUBLICATION));
    await assert.rejects(storage.get(publishedPdfKey(MEMBER, PUBLICATION, ITEM)), FileNotFound);
    assert.equal(await readAll(await storage.get(materialKey(MEMBER, MATERIAL))), 'a');
    // 회원 접두어를 지우면 그 회원 것만 모두 사라지고 다른 회원 것은 남는다(탈퇴 2단계).
    await storage.deletePrefix(memberPrefix(MEMBER));
    assert.deepEqual(await storedKeys(), [materialKey(OTHER, MATERIAL)]);
    assert.equal(await readAll(await storage.get(materialKey(OTHER, MATERIAL))), 'c');
    await storage.deletePrefix(memberPrefix(MEMBER));
  });

  test(`[${name}] 계약: 계약 밖 키·접두어는 InvalidStorageKey이고 저장소에 아무 변화가 없다`, async (t) => {
    const { storage, storedKeys } = await makeStorage(t);
    await storage.put(materialKey(OTHER, MATERIAL), Buffer.from('keep'), 'application/pdf');
    for (const key of INVALID_KEYS) {
      await assert.rejects(storage.put(key, Buffer.from('x'), 'text/plain'), InvalidStorageKey, String(key));
      await assert.rejects(storage.get(key), InvalidStorageKey, String(key));
      await assert.rejects(storage.copy(key, materialKey(MEMBER, MATERIAL)), InvalidStorageKey, String(key));
      await assert.rejects(storage.copy(materialKey(OTHER, MATERIAL), key), InvalidStorageKey, String(key));
      await assert.rejects(storage.delete(key), InvalidStorageKey, String(key));
    }
    for (const prefix of INVALID_PREFIXES) {
      await assert.rejects(storage.deletePrefix(prefix), InvalidStorageKey, prefix);
    }
    await assert.rejects(storage.put(materialKey(MEMBER, MATERIAL), 'not a buffer', 'application/pdf'), TypeError);
    await assert.rejects(storage.put(materialKey(MEMBER, MATERIAL), Buffer.from('x'), undefined), TypeError);
    assert.deepEqual(await storedKeys(), [materialKey(OTHER, MATERIAL)]);
    assert.equal(await readAll(await storage.get(materialKey(OTHER, MATERIAL))), 'keep');
  });
}

module.exports = { registerStorageContractTests, readAll, MEMBER, OTHER, MATERIAL, MATERIAL_2, PUBLICATION, ITEM };
