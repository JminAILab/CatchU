// U5 RAG 평가 스크립트(기능 설계 W7·BR10.1~BR10.7, 비기능 설계 NFR3.1~NFR3.3, 계획 1차 수정 요청 (4)).
// synthetic 모드만 실제로 끝까지 돌린다(합성 게이트·합성 검색·메모리 사본, 외부 호출 없음). 이 결과는 NFR3 측정이 아니다.
// 출력은 시험마다 만든 임시 폴더에만 쓰고 끝나면 지운다. 저장소 기록 폴더(api/docs/rag-evaluation/)는 만들지 않는다.
const assert = require('node:assert/strict');
const { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');
const {
  RagEvalInputError, createMeasureDeps, createSyntheticDeps, dbPublicationAccess, ownedSnapshotReader, parseArgs, parseInput, runRagEval, sampleInput, splitJdRequirements,
} = require('../../scripts/rag-eval/rag-eval.cjs');
const { GoldQuoteNotFound, evidencePassRate, findGoldLocations, hitRate, isHitAt } = require('../../scripts/rag-eval/gold-locations.cjs');
const { buildRepositoryRecord, writeEvaluation } = require('../../scripts/rag-eval/rag-eval-report.cjs');
const { AiProviderError } = require('../../dist/ai-generation/ai-generation.types');

const INPUT = JSON.parse(readFileSync(resolve(__dirname, 'rag-eval-input.json'), 'utf8'));
const REPOSITORY_DOCS = resolve(__dirname, '..', '..', 'docs', 'rag-evaluation');
const CLOCK = () => new Date('2026-11-02T03:00:00.000Z');

function tempDirs(t) {
  const root = mkdtempSync(join(tmpdir(), 'u5-rag-eval-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { outDir: join(root, 'out'), docsDir: join(root, 'docs') };
}
const synthetic = (raw = INPUT) => {
  const input = parseInput(structuredClone(raw), 'synthetic');
  return { input, deps: createSyntheticDeps(input) };
};

test('synthetic 모드는 합성 자료로 끝까지 돌고 SYNTHETIC_CHECK를 적으며, 결과·기록을 지정한 로컬 폴더에만 쓴다(BR10.1, 수정 요청 (4))', async (t) => {
  const { outDir, docsDir } = tempDirs(t);
  const docsBefore = existsSync(REPOSITORY_DOCS);
  const { input, deps } = synthetic();
  const result = await runRagEval({ mode: 'synthetic', input, deps, outDir, docsDir, clock: CLOCK });
  assert.deepEqual(readdirSync(outDir).sort(), ['2026-11-02-synthetic-record.md', '2026-11-02-synthetic.json']);
  assert.equal(existsSync(docsDir), false, 'synthetic은 저장소 기록 폴더에 쓰지 않는다');
  assert.equal(existsSync(REPOSITORY_DOCS), docsBefore, '저장소의 api/docs/rag-evaluation/도 만들지 않는다');
  const record = readFileSync(result.recordPath, 'utf8');
  assert.match(record, /모드: SYNTHETIC_CHECK/);
  assert.match(record, /대상 버전: test-fixture/);
  const raw = JSON.parse(readFileSync(result.rawPath, 'utf8'));
  assert.equal(raw.mode, 'SYNTHETIC_CHECK');
  assert.equal(raw.questions.length, 3);
  assert.equal(raw.questions[0].question, INPUT.questions[0].question, '원문은 로컬 결과 파일에만 있다');
  assert.equal(result.summary.questionCount, 3);
  assert.equal(result.summary.jd.splitter, 'SCRIPT');
  assert.equal(result.summary.jd.rows.length, 2);
  for (const secret of ['SYNTHETIC-QUESTION', 'SYNTHETIC-GOLD', 'SYNTHETIC-JD', '합성 답 항목', 'SYNTHETIC-AIDRAFT']) {
    assert.ok(!record.includes(secret), `기록에 ${secret} 원문이 없다`);
  }
});

test('정답 글귀가 발행본에 없으면 질문 번호를 알리고 멈추며 파일을 쓰지 않는다(BR10.2). aiDraft는 정답 범위가 아니다', async (t) => {
  const { outDir, docsDir } = tempDirs(t);
  const raw = structuredClone(INPUT);
  raw.questions[1].goldQuotes = ['발행본에 없는 글귀'];
  const { input, deps } = synthetic(raw);
  await assert.rejects(runRagEval({ mode: 'synthetic', input, deps, outDir, docsDir, clock: CLOCK }),
    (error) => error instanceof GoldQuoteNotFound && error.questionNo === 2 && !error.message.includes('없는 글귀'));
  assert.equal(existsSync(outDir), false);
  raw.questions[1].goldQuotes = ['SYNTHETIC-AIDRAFT'];
  assert.throws(() => findGoldLocations(raw.snapshot, raw.questions), (error) => error.questionNo === 2);
  raw.questions[1].goldQuotes = [];
  assert.throws(() => findGoldLocations(raw.snapshot, raw.questions), GoldQuoteNotFound);
});

test('답 0개(NO_ITEMS) 질문은 그 질문 번호로 「답 실패」를 남기고 다음 질문으로 가며, 다른 생성 실패는 질문 번호를 알리고 멈춘다(새 Catch NC3 Build and Test)', async (t) => {
  const { outDir, docsDir } = tempDirs(t);
  const logs = t.mock.method(console, 'error', () => {});
  const { input, deps } = synthetic();
  const generate = deps.gate.generate.bind(deps.gate);
  let qnaCalls = 0;
  deps.gate.generate = async (request) => {
    if (request.feature === 'QNA' && ++qnaCalls === 2) throw new AiProviderError('NO_ITEMS');
    return generate(request);
  };
  const result = await runRagEval({ mode: 'synthetic', input, deps, outDir, docsDir, clock: CLOCK });
  assert.deepEqual(result.summary.answerFailedQuestions, [2]);
  const raw = JSON.parse(readFileSync(result.rawPath, 'utf8'));
  assert.deepEqual(raw.questions.map((question) => question.answerFailed), [null, 'NO_ITEMS', null], '3번 질문까지 돌았다');
  assert.deepEqual(raw.questions[1].items, []);
  assert.match(readFileSync(result.recordPath, 'utf8'), /- 답 실패 질문\(답 0개, NO_ITEMS\): 2번\n/);
  assert.deepEqual(logs.mock.calls.map((call) => call.arguments[0]), ['2번 질문: 답 실패(NO_ITEMS)']);

  qnaCalls = 0;
  deps.gate.generate = async (request) => {
    if (request.feature === 'QNA' && ++qnaCalls === 3) throw new AiProviderError('CALL_FAILED');
    return generate(request);
  };
  await assert.rejects(runRagEval({ mode: 'synthetic', input, deps, outDir: join(outDir, 'second'), docsDir, clock: CLOCK }),
    (error) => error instanceof AiProviderError && error.reason === 'CALL_FAILED');
  assert.equal(logs.mock.calls.at(-1).arguments[0], '3번 질문에서 멈춤: AiProviderError');
  assert.equal(existsSync(join(outDir, 'second')), false, '멈추면 파일을 쓰지 않는다');
});

test('정답 위치는 글귀가 나오는 모든 곳이고, 적중은 같은 항목·fieldPath에서 범위가 겹칠 때다. 적중률 5·8·12를 따로 센다(BR10.3)', () => {
  const [, , third] = findGoldLocations(INPUT.snapshot, INPUT.questions);
  assert.deepEqual(third.map((l) => [l.fieldPath, l.charStart, l.charEnd]), [['body', 24, 31], ['body', 40, 47]]);
  const gold = [{ publishedItemId: 'a', fieldPath: 'body', charStart: 10, charEnd: 20 }];
  const miss = { publishedItemId: 'a', fieldPath: 'body', charStart: 20, charEnd: 30 };
  const otherField = { publishedItemId: 'a', fieldPath: 'workFacts[0]', charStart: 10, charEnd: 20 };
  const hit = { publishedItemId: 'a', fieldPath: 'body', charStart: 19, charEnd: 25 };
  const hitsAt = (position) => Array.from({ length: 12 }, (_, i) => (i === position ? hit : miss));
  assert.equal(isHitAt([otherField, miss], gold, 12), false);
  const perQuestion = [
    { hits: hitsAt(0), goldLocations: gold }, { hits: hitsAt(6), goldLocations: gold },
    { hits: hitsAt(10), goldLocations: gold }, { hits: hitsAt(99), goldLocations: gold },
  ];
  assert.deepEqual([hitRate(perQuestion, 5), hitRate(perQuestion, 8), hitRate(perQuestion, 12)], [0.25, 0.5, 0.75]);
  assert.equal(hitRate([], 8), null);
  assert.equal(evidencePassRate(9, 1), 0.9);
  assert.equal(evidencePassRate(0, 0), null);
});

test('JD 두 방식: 빈 줄을 뺀 줄마다 검색 기반과 전체 넣기를 부르고, 전체 넣기가 80,000자를 넘으면 INPUT_TOO_LARGE로 적는다(BR10.7)', async (t) => {
  const { outDir, docsDir } = tempDirs(t);
  assert.deepEqual(splitJdRequirements(' 첫 줄 \r\n\r\n둘째 줄\n'), ['첫 줄', '둘째 줄']);
  const raw = structuredClone(INPUT);
  raw.snapshot.items[1].snapshot.body += `\n\n${'긴 자료 문단이다. '.repeat(9000)}`;
  const { input, deps } = synthetic(raw);
  const result = await runRagEval({ mode: 'synthetic', input, deps, outDir, docsDir, clock: CLOCK });
  assert.deepEqual(result.summary.jd.rows.map((row) => row.fullInput), ['INPUT_TOO_LARGE', 'INPUT_TOO_LARGE']);
  assert.deepEqual(result.summary.jd.rows[0].searchBased, { items: 3, dropped: 0 });
  assert.match(readFileSync(result.recordPath, 'utf8'), /\| 1 \| 3 \| 0 \| INPUT_TOO_LARGE \| - \|/);
  const noJd = parseInput({ ...structuredClone(INPUT), jd: '  ' }, 'synthetic');
  assert.equal(noJd.jd, null);
});

test('measure 기록 쓰기는 docs 폴더에 날짜 이름으로 건수·위치·빈 판정 칸만 쓰고, 원문은 로컬 결과에만 쓴다(BR10.5)', (t) => {
  const { outDir, docsDir } = tempDirs(t);
  const summary = { date: '2026-12-01', targetVersion: 'abc1234', mode: 'measure', questionCount: 10, hitRateAt5: 0.6, hitRateAt8: 0.8,
    hitRateAt12: 0.9, passedItems: 18, droppedItems: 2, evidencePassRate: 0.9, answerFailedQuestions: [],
    missedHitLocations: [{ questionNo: 4, locations: [{ publishedItemId: 'item-1', fieldPath: 'body', charStart: 0, charEnd: 120 }] }],
    jd: { splitter: 'U10', rows: [{ requirementNo: 1, searchBased: { items: 3, dropped: 1 }, fullInput: { items: 4, dropped: 0 } }] } };
  const raw = { questions: [{ question: 'SYNTHETIC-QUESTION 원문', items: [{ text: 'SYNTHETIC-ANSWER 원문' }] }] };
  const { rawPath, recordPath } = writeEvaluation({ mode: 'measure', outDir, docsDir, summary, raw });
  assert.equal(recordPath, join(docsDir, '2026-12-01.md'));
  assert.equal(rawPath, join(outDir, '2026-12-01-measure.json'));
  const record = readFileSync(recordPath, 'utf8');
  assert.match(record, /모드: MEASUREMENT\n/);
  assert.match(record, /\| 60\.0% \| 80\.0% \| 90\.0% \|/);
  assert.match(record, /4번 질문\n {2}- item-1 body \[0, 120\)/);
  assert.match(record, /요구사항 나누기·지시문: U10/);
  assert.match(record, /- 남의 기여 오귀속 건수: \n/);
  assert.ok(!record.includes('SYNTHETIC-'), '저장소 기록에 질문·답 원문이 없다');
  assert.match(readFileSync(rawPath, 'utf8'), /SYNTHETIC-ANSWER/);
  assert.match(buildRepositoryRecord({ ...summary, jd: null, missedHitLocations: [], evidencePassRate: null }), /JD 없음[\s\S]*- 없음|- 없음[\s\S]*JD 없음/);
});

test('입력·인자 검사: measure는 질문 10개·--input·두 키·테스트가 아닌 DB·U4 PublicationAccess가 있어야 돈다(NFR3.1)', async () => {
  assert.throws(() => parseArgs(['other']), RagEvalInputError);
  assert.throws(() => parseArgs(['measure']), /--input/);
  assert.throws(() => parseArgs(['synthetic', '--unknown', 'x']), RagEvalInputError);
  assert.deepEqual(parseArgs(['synthetic', '--out', 'x']), { mode: 'synthetic', out: 'x' });
  const MEMBER = '33333333-3333-4333-8333-333333333333';
  assert.throws(() => parseInput(structuredClone(INPUT), 'measure'), /memberId/);
  assert.throws(() => parseInput({ ...structuredClone(INPUT), memberId: 'x' }, 'measure'), /memberId/);
  assert.throws(() => parseInput({ ...structuredClone(INPUT), memberId: MEMBER }, 'measure'), /10개/);
  assert.equal(parseInput(sampleInput(), 'synthetic').memberId, null);
  assert.throws(() => parseInput({ ...structuredClone(INPUT), publicationId: 'x' }, 'synthetic'), /uuid/);
  assert.throws(() => parseInput({ ...structuredClone(INPUT), questions: [{ question: ' ' }] }, 'synthetic'), /1번 질문/);
  assert.throws(() => parseInput([], 'synthetic'), RagEvalInputError);
  assert.equal(parseInput(sampleInput(), 'synthetic').questions.length, 3);
  const env = { CATCHU_GENERATION_API_KEY: 'k', CATCHU_EMBEDDING_API_KEY: 'k', DB_HOST: 'h', DB_PORT: '5432', DB_USER: 'u', DB_PASSWORD: 'p' };
  await assert.rejects(createMeasureDeps({ env: { ...env, CATCHU_GENERATION_API_KEY: ' ' }, publicationAccess: () => ({}) }), /GENERATION/);
  await assert.rejects(createMeasureDeps({ env: { ...env, CATCHU_EMBEDDING_API_KEY: '' }, publicationAccess: () => ({}) }), /EMBEDDING/);
  await assert.rejects(createMeasureDeps({ env: { ...env, DB_NAME: 'catchu_test' }, publicationAccess: () => ({}) }), /테스트 DB/);
  await assert.rejects(createMeasureDeps({ env: { ...env, DB_NAME: 'catchu' }, publicationAccess: null, memberId: MEMBER }), /PublicationAccess/);
  await assert.rejects(createMeasureDeps({ env: { ...env, DB_NAME: 'catchu' }, publicationAccess: () => ({}) }), /memberId/);
});

test('measure의 사본 읽기는 U4 DB 구현으로 읽기 전용 트랜잭션에서 published_item을 순서대로 읽고, 없는 발행본은 빈 사본 없이 실패한다(BR10.1, C-10)', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const calls = [];
  const item = { publishedItemId: '22222222-2222-4222-8222-222222222222', position: 1, itemKind: 'TEXT_MATERIAL', title: '머리글', snapshot: { body: '본문' } };
  const dataSource = (publicationRows) => ({
    async transaction(isolation, run) {
      calls.push(isolation);
      return run({
        async query(sql, params) {
          calls.push(sql.replace(/\s+/g, ' ').trim().slice(0, 40));
          if (/^SET TRANSACTION READ ONLY/.test(sql)) return [];
          assert.deepEqual(params, [id]);
          if (/FROM publication WHERE/.test(sql)) return publicationRows;
          if (/FROM published_item WHERE/.test(sql)) return [item];
          throw new Error(`예상 밖 질의: ${sql}`);
        },
      });
    },
  });
  const snapshot = await dbPublicationAccess(dataSource([{ title: '시연', publishedAt: '2026-11-09T00:00:00Z', expiresAt: '2027-02-07T00:00:00Z' }]))
    .readSnapshot(id);
  assert.equal(snapshot.title, '시연');
  assert.deepEqual(snapshot.items, [{ ...item, pdfPages: null }]);
  assert.equal(calls[0], 'REPEATABLE READ');
  assert.equal(calls[1], 'SET TRANSACTION READ ONLY');
  await assert.rejects(dbPublicationAccess(dataSource([])).readSnapshot(id), (error) => error.name === 'NotFound');
});

test('measure는 실행자 본인의 발행본일 때만 사본을 읽고, 남의 것·없는 것이면 외부 호출 전에 멈춘다(#493 리뷰)', async () => {
  const MEMBER = '33333333-3333-4333-8333-333333333333';
  const OWN = '11111111-1111-4111-8111-111111111111';
  const OTHER = '44444444-4444-4444-8444-444444444444';
  const calls = [];
  class NotFound extends Error { constructor() { super('publication not found'); this.name = 'NotFound'; } }
  const access = {
    async resolveForOwner(memberId, publicationId) {
      calls.push(['owner', memberId, publicationId]);
      if (memberId !== MEMBER || publicationId !== OWN) throw new NotFound();
      return { publicationId, state: 'ACTIVE' };
    },
    async readSnapshot(publicationId) { calls.push(['snapshot', publicationId]); return { title: '시연', items: [] }; },
  };
  const read = ownedSnapshotReader(access, MEMBER);
  assert.deepEqual(await read(OWN), { title: '시연', items: [] });
  assert.deepEqual(calls, [['owner', MEMBER, OWN], ['snapshot', OWN]]);

  calls.length = 0;
  await assert.rejects(read(OTHER), (error) => error instanceof RagEvalInputError && /외부 호출 없이 멈춥니다/.test(error.message));
  assert.deepEqual(calls, [['owner', MEMBER, OTHER]], '주인이 아니면 사본을 읽지 않는다');

  // 실행 전체에서도 사본 읽기에서 멈추면 검색·생성(외부 호출)을 부르지 않는다.
  let external = 0;
  const deps = { readSnapshot: read, search: { async search() { external += 1; return { hits: [], publicationText: '' }; } },
    gate: { async generate() { external += 1; return { items: [], droppedCount: 0 }; } }, async readAllChunks() { external += 1; return []; } };
  const input = { ...parseInput({ ...structuredClone(INPUT), publicationId: OTHER }, 'synthetic'), memberId: MEMBER };
  await assert.rejects(runRagEval({ mode: 'measure', input, deps, outDir: tmpdir(), docsDir: tmpdir(), clock: CLOCK }), RagEvalInputError);
  assert.equal(external, 0);

  // 주인 판정이 다른 이유로 실패하면 그 오류를 그대로 낸다(삼키지 않는다).
  const broken = ownedSnapshotReader({ async resolveForOwner() { throw new Error('connection lost'); }, async readSnapshot() { throw new Error('not reached'); } }, MEMBER);
  await assert.rejects(broken(OWN), /connection lost/);
});
