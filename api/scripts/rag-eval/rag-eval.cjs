// RAG 품질 평가 스크립트(U5 기능 설계 W7·BR10.1~BR10.7, 비기능 설계 NFR3.1~NFR3.3, 스토리 US19.3). CI에서 돌리지 않는다.
//
//   npm --prefix api run rag-eval -- synthetic [--input <파일>] [--out <폴더>]
//   npm --prefix api run rag-eval -- measure --input <파일> [--target <대상 버전>]
//
// - synthetic: 합성 게이트·합성 검색(U3 조각 나누기 + 합성 임베딩)·메모리 사본으로 끝까지 도는지만 확인하고 SYNTHETIC_CHECK로 적는다.
//   결과 원문과 기록 모두 로컬 폴더(api/.rag-eval/)에만 쓴다. NFR3 측정이 아니다.
// - measure: 실제 게이트(Claude)·실제 검색(Voyage)과 테스트가 아닌 DB의 시연 발행본으로 한 번 잰다(U4 합류 뒤, BR10.1).
//   원문은 api/.rag-eval/에, 건수·위치·빈 판정 칸 기록은 api/docs/rag-evaluation/<날짜>.md에 쓴다.
// 입력 파일 모양: { publicationId, memberId(measure만, 실행자 본인), questions: [{ question, goldQuotes: [글귀] }](measure는 10개), jd?: 문자열, targetVersion?,
//   snapshot?: { title, publishedAt, expiresAt, items }(synthetic만, 없으면 내장 합성 발행본) }
require('reflect-metadata');
const { randomBytes } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { AiInputTooLarge, SOURCE_LABELS } = require('../../dist/ai-generation/ai-generation.types');
const { assertGenerationRequest } = require('../../dist/ai-generation/gate-policy');
const { koreanUsageDate } = require('../../dist/daily-run-limit/daily-run-limit');
const { buildChunkDrafts } = require('../../dist/published-index/chunker');
const { syntheticEmbedding } = require('../../dist/published-index/synthetic-embedding-provider');
const { chunkToSource } = require('../../dist/rag-answer/qna-service');
const { QNA_INSTRUCTION, QNA_MODEL, QNA_SEARCH_LIMIT } = require('../../dist/rag-answer/rag-answer-config');
const { evidencePassRate, findGoldLocations, hitRate, isHitAt, locationOf } = require('./gold-locations.cjs');
const { writeEvaluation } = require('./rag-eval-report.cjs');

const API_DIR = resolve(__dirname, '..', '..');
const DEFAULT_OUT_DIR = resolve(API_DIR, '.rag-eval');
const DEFAULT_DOCS_DIR = resolve(API_DIR, 'docs', 'rag-evaluation');
/** 질문마다 검색을 12개로 한 번 부른다(BR10.3). */
const EVAL_SEARCH_LIMIT = 12;
const MEASURE_QUESTION_COUNT = 10;
/** 스크립트 JD 지시문(BR10.7). U10이 합쳐지면 그 지시문·요구사항 나누기를 쓴다. */
const SCRIPT_JD_INSTRUCTION = 'JD 요구사항 한 줄에 대해 발행본 자료에서 근거를 찾아 인용하고, 자료로 확인되지 않는 점과 면접 질문을 쓴다.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class RagEvalInputError extends Error {
  constructor(message) { super(message); this.name = 'RagEvalInputError'; }
}

/** 입력 파일 검사. 틀리면 칸 이름만 알리고 값은 넣지 않는다. */
function parseInput(raw, mode) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RagEvalInputError('입력은 객체여야 합니다.');
  if (typeof raw.publicationId !== 'string' || !UUID.test(raw.publicationId)) throw new RagEvalInputError('publicationId는 uuid여야 합니다.');
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) throw new RagEvalInputError('questions가 비어 있습니다.');
  if (mode === 'measure' && (typeof raw.memberId !== 'string' || !UUID.test(raw.memberId))) {
    throw new RagEvalInputError('measure 모드는 실행자 본인의 회원 번호(memberId, uuid)가 필요합니다.');
  }
  if (mode === 'measure' && raw.questions.length !== MEASURE_QUESTION_COUNT) {
    throw new RagEvalInputError(`measure 모드는 질문 ${MEASURE_QUESTION_COUNT}개가 필요합니다.`);
  }
  raw.questions.forEach((entry, index) => {
    if (!entry || typeof entry.question !== 'string' || entry.question.trim() === '') {
      throw new RagEvalInputError(`${index + 1}번 질문의 question이 비어 있습니다.`);
    }
  });
  if (raw.jd !== undefined && raw.jd !== null && typeof raw.jd !== 'string') throw new RagEvalInputError('jd는 문자열이어야 합니다.');
  return {
    publicationId: raw.publicationId,
    memberId: mode === 'measure' ? raw.memberId : null,
    questions: raw.questions.map((entry) => ({ question: entry.question.trim(), goldQuotes: entry.goldQuotes })),
    jd: typeof raw.jd === 'string' && raw.jd.trim() !== '' ? raw.jd : null,
    targetVersion: typeof raw.targetVersion === 'string' && raw.targetVersion !== '' ? raw.targetVersion : 'unknown',
    snapshot: raw.snapshot ?? null,
  };
}

/** 스크립트 요구사항 나누기: 빈 줄을 뺀 줄 단위(BR10.7). */
function splitJdRequirements(jd) {
  return jd.split(/\r\n|\r|\n/).map((line) => line.trim()).filter((line) => line !== '');
}

const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);

/** 합성 검색: U3 조각 나누기 결과를 합성 임베딩 유사도로 줄 세운다. 실제 검색 품질이 아니다. */
function createSyntheticSearch(snapshot) {
  const chunks = buildChunkDrafts(snapshot.items).map((draft, index) => ({ chunkId: `synthetic-chunk-${index + 1}`, ...draft }));
  const vectors = chunks.map((chunk) => syntheticEmbedding(chunk.text));
  const publicationText = chunks.map((chunk) => chunk.text).join('\n');
  return {
    chunks,
    async search(_publicationId, query, limit) {
      const queryVector = syntheticEmbedding(query);
      const ranked = chunks.map((chunk, index) => ({ chunk, score: dot(queryVector, vectors[index]), index }))
        .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit);
      return { hits: ranked.map(({ chunk, score }) => ({ ...chunk, score })), publicationText };
    },
  };
}

/** 합성 게이트: 입구 검사(입력 상한 포함)는 실제 게이트와 같고, 첫 근거를 그대로 인용한 고정 항목을 돌려준다. */
function createSyntheticGate() {
  const cited = (source, text) => ({ kind: 'CITED', text, jdRole: null,
    citations: [{ sourceId: source.sourceId, quote: source.text, location: source.location, sourceLabel: SOURCE_LABELS[source.sourceKind] }] });
  return {
    async generate(request) {
      assertGenerationRequest(request);
      if (request.sources.length === 0) return { items: [], droppedCount: 0 };
      const first = request.sources[0];
      if (request.feature !== 'JD_SUMMARY') {
        return { items: [cited(first, '합성 답 항목')], droppedCount: request.sources.length > 1 ? 1 : 0 };
      }
      return { droppedCount: 0, items: [
        { ...cited(first, '합성 근거'), jdRole: 'EVIDENCE' },
        { kind: 'AI_INTERPRETATION', text: '합성 확인되지 않는 점', citations: [], jdRole: 'UNCONFIRMED' },
        { kind: 'AI_INTERPRETATION', text: '합성 면접 질문', citations: [], jdRole: 'INTERVIEW_QUESTION' },
      ] };
    },
  };
}

/** 내장 합성 발행본(공개 가능한 합성 글). synthetic 입력에 snapshot이 없을 때 쓴다. */
function sampleInput() {
  const catchId = '00000000-0000-4000-8000-000000000001';
  const textId = '00000000-0000-4000-8000-000000000002';
  return {
    publicationId: '00000000-0000-4000-8000-0000000000aa',
    snapshot: {
      title: '합성 발행본', publishedAt: '2026-11-01T00:00:00.000Z', expiresAt: '2027-01-30T00:00:00.000Z',
      items: [
        { publishedItemId: catchId, position: 1, itemKind: 'CATCH', title: '합성 Catch', pdfPages: null, snapshot: {
          workFacts: ['로그인 오류 문구를 한 파일로 모았다.', '네트워크 오류일 때 다시 시도 버튼을 보이게 했다.'],
          subjectContribution: '문구 목록 파일을 만들고 화면 세 곳이 그 파일을 쓰게 바꿨다.',
          evidence: [{ sourceUrl: 'https://github.com/synthetic-owner/synthetic-repo/pull/41', sourceRevision: 'abc1234',
            representedFacts: ['PR #41에서 messages.ts를 더했다.'] }],
          authorDescription: '문구가 화면마다 달라 사용자가 헷갈렸고 한곳에 모아 고쳤다.', aiDraft: '합성 초안', mismatch: false } },
        { publishedItemId: textId, position: 2, itemKind: 'TEXT_MATERIAL', title: '합성 자료', pdfPages: null,
          snapshot: { body: '배포는 개발 서버에 먼저 올리고 확인한 뒤 운영에 올린다.\n\n장애 기록: 큐가 멈춘 날 원인을 적었다.' } },
      ],
    },
    questions: [
      { question: '오류 문구는 어떻게 정리했나요?', goldQuotes: ['로그인 오류 문구를 한 파일로 모았다.'] },
      { question: '배포 순서는 어떻게 되나요?', goldQuotes: ['개발 서버에 먼저 올리고'] },
      { question: '장애를 어떻게 기록했나요?', goldQuotes: ['큐가 멈춘 날 원인을 적었다'] },
    ],
    jd: '프런트엔드 오류 처리 경험\n\n배포 절차 이해',
  };
}

function qnaRequest(hits, publicationText, question) {
  return { feature: 'QNA', instruction: QNA_INSTRUCTION, sources: hits.map(chunkToSource), userText: question, publicationText, model: QNA_MODEL };
}

/** JD 두 방식(BR10.7): 검색 기반(조각 8개)과 전체 넣기(published_chunk 전부, seq 순서). 80,000자 초과는 INPUT_TOO_LARGE. */
async function compareJd(deps, input) {
  const requirements = splitJdRequirements(input.jd);
  const allChunks = await deps.readAllChunks(input.publicationId);
  const allText = allChunks.map((chunk) => chunk.text).join('\n');
  const rows = [];
  const raw = [];
  for (const [index, requirement] of requirements.entries()) {
    const request = (sources, publicationText) => ({ feature: 'JD_SUMMARY', instruction: SCRIPT_JD_INSTRUCTION, sources, userText: requirement,
      publicationText, model: 'HAIKU' });
    const searched = await deps.search.search(input.publicationId, requirement, QNA_SEARCH_LIMIT);
    const searchOutput = await deps.gate.generate(request(searched.hits.map(chunkToSource), searched.publicationText));
    let fullOutput;
    try {
      fullOutput = await deps.gate.generate(request(allChunks.map(chunkToSource), allText));
    } catch (error) {
      if (!(error instanceof AiInputTooLarge)) throw error;
      fullOutput = 'INPUT_TOO_LARGE';
    }
    const counts = (output) => ({ items: output.items.length, dropped: output.droppedCount });
    rows.push({ requirementNo: index + 1, searchBased: counts(searchOutput),
      fullInput: fullOutput === 'INPUT_TOO_LARGE' ? fullOutput : counts(fullOutput) });
    raw.push({ requirementNo: index + 1, requirement, searchBased: searchOutput, fullInput: fullOutput });
  }
  return { summary: { splitter: 'SCRIPT', rows }, raw: { splitter: 'SCRIPT', instruction: SCRIPT_JD_INSTRUCTION, requirements: raw } };
}

/**
 * 평가 한 번. deps: { readSnapshot(publicationId), search(C-09 모양), gate(C-01 generate), readAllChunks(publicationId) }.
 * 정답 글귀가 없으면 GoldQuoteNotFound로 멈추고 아무 파일도 쓰지 않는다(BR10.2).
 */
async function runRagEval({ mode, input, deps, outDir = DEFAULT_OUT_DIR, docsDir = DEFAULT_DOCS_DIR, clock = () => new Date() }) {
  const snapshot = await deps.readSnapshot(input.publicationId);
  const gold = findGoldLocations(snapshot, input.questions);
  const perQuestion = [];
  let passedItems = 0;
  let droppedItems = 0;
  for (const [index, entry] of input.questions.entries()) {
    const result = await deps.search.search(input.publicationId, entry.question, EVAL_SEARCH_LIMIT);
    const top = result.hits.slice(0, QNA_SEARCH_LIMIT);
    const output = top.length === 0 ? { items: [], droppedCount: 0 }
      : await deps.gate.generate(qnaRequest(top, result.publicationText, entry.question));
    passedItems += output.items.length;
    droppedItems += output.droppedCount;
    perQuestion.push({ questionNo: index + 1, entry, hits: result.hits, goldLocations: gold[index], output });
  }
  const jd = input.jd === null ? null : await compareJd(deps, input);
  const summary = {
    date: koreanUsageDate(clock()), targetVersion: input.targetVersion, mode, questionCount: input.questions.length,
    hitRateAt5: hitRate(perQuestion, 5), hitRateAt8: hitRate(perQuestion, 8), hitRateAt12: hitRate(perQuestion, 12),
    passedItems, droppedItems, evidencePassRate: evidencePassRate(passedItems, droppedItems),
    missedHitLocations: perQuestion.filter((entry) => !isHitAt(entry.hits, entry.goldLocations, 8))
      .map((entry) => ({ questionNo: entry.questionNo, locations: entry.hits.slice(0, 8).map(locationOf) })),
    jd: jd === null ? null : jd.summary,
  };
  const raw = {
    date: summary.date, targetVersion: input.targetVersion, publicationId: input.publicationId,
    questions: perQuestion.map((entry) => ({ questionNo: entry.questionNo, question: entry.entry.question, goldQuotes: entry.entry.goldQuotes,
      goldLocations: entry.goldLocations, hitLocations: entry.hits.map(locationOf), items: entry.output.items,
      droppedCount: entry.output.droppedCount })),
    jd: jd === null ? null : jd.raw,
  };
  return { summary, ...writeEvaluation({ mode, outDir, docsDir, summary, raw }) };
}

/** synthetic 모드의 대역. 사본은 입력의 snapshot(없으면 내장 합성 발행본)이다. */
function createSyntheticDeps(input) {
  const snapshot = input.snapshot;
  const search = createSyntheticSearch(snapshot);
  return {
    async readSnapshot() { return snapshot; },
    search,
    gate: createSyntheticGate(),
    async readAllChunks() { return search.chunks; },
  };
}

/**
 * measure 모드의 실제 연결. 키 둘이 있어야 하고 테스트 DB에서는 돌지 않는다(BR10.1, NFR3.1).
 * publicationAccess는 U4의 DB PublicationAccess다(C-10 readSnapshot). published_chunk 직접 읽기는 JD 전체 넣기의 읽기 전용 사용뿐이다.
 */
async function createMeasureDeps({ env = process.env, publicationAccess, memberId }) {
  if (!env.CATCHU_GENERATION_API_KEY?.trim()) throw new RagEvalInputError('measure 모드는 CATCHU_GENERATION_API_KEY가 있어야 합니다.');
  if (!env.CATCHU_EMBEDDING_API_KEY?.trim()) throw new RagEvalInputError('measure 모드는 CATCHU_EMBEDDING_API_KEY가 있어야 합니다.');
  const { buildDataSourceOptions, readDatabaseConfig } = require('../../dist/database/database.config');
  const config = readDatabaseConfig(env);
  if (config.database.endsWith('_test')) throw new RagEvalInputError('measure 모드는 테스트 DB에서 돌지 않습니다.');
  if (!publicationAccess) throw new RagEvalInputError('measure 모드는 U4의 DB PublicationAccess가 필요합니다.');
  if (typeof memberId !== 'string' || !UUID.test(memberId)) throw new RagEvalInputError('measure 모드는 실행자 본인의 memberId가 필요합니다.');
  const { DataSource } = require('typeorm');
  const { createCheckedAiGenerationGate } = require('../../dist/ai-generation/checked-gate');
  const { readEmbeddingConfig } = require('../../dist/published-index/embedding-config');
  const { createEmbeddingProvider } = require('../../dist/published-index/embedding-provider');
  const { createPublishedSearch } = require('../../dist/published-index/published-search');
  const dataSource = await new DataSource(buildDataSourceOptions(config)).initialize();
  return {
    readSnapshot: ownedSnapshotReader(publicationAccess(dataSource), memberId),
    search: createPublishedSearch({ dataSource, provider: createEmbeddingProvider(readEmbeddingConfig(env), env) }),
    gate: createCheckedAiGenerationGate({ apiKey: env.CATCHU_GENERATION_API_KEY }),
    readAllChunks: (publicationId) => dataSource.transaction(async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      const rows = await manager.query(`SELECT chunk_id, published_item_id, field_path, char_start, char_end, pdf_page, source_kind, text,
        catch_evidence_urls FROM published_chunk WHERE publication_id = $1 ORDER BY seq`, [publicationId]);
      return rows.map((row) => ({ chunkId: row.chunk_id, publishedItemId: row.published_item_id, fieldPath: row.field_path,
        charStart: row.char_start, charEnd: row.char_end, pdfPage: row.pdf_page, sourceKind: row.source_kind, text: row.text,
        catchEvidenceUrls: row.catch_evidence_urls, score: 0 }));
    }),
    close: () => dataSource.destroy(),
  };
}

/**
 * 발행본 주인 확인 뒤 사본 읽기(#493 리뷰). runRagEval은 사본을 가장 먼저 읽으므로, 주인이 아니면 검색·생성 같은 외부 호출 전에 멈춘다.
 * 주인 판정은 작성자 화면과 같은 C-10 resolveForOwner다. 없는 발행본과 남의 발행본은 같은 NotFound라 구분하지 않는다.
 * 실행자 본인의 다른 발행본은 통과한다(시연용 여부는 확인하지 않는다).
 */
function ownedSnapshotReader(access, memberId) {
  return async (publicationId) => {
    try {
      await access.resolveForOwner(memberId, publicationId);
    } catch (error) {
      if (error?.name === 'NotFound') throw new RagEvalInputError('memberId 회원의 발행본이 아니거나 없는 발행본입니다. 외부 호출 없이 멈춥니다.');
      throw error;
    }
    return access.readSnapshot(publicationId);
  };
}

/**
 * measure 모드의 사본 읽기. 앱과 같은 U4 C-10 DB 구현(`DbPublicationAccess`)을 평가 스크립트의 DataSource로 만든다.
 * 평가는 `resolveForOwner`와 `readSnapshot`만 부른다. 두 경로는 grant 키를 쓰지 않으므로 grant 키는 이 실행에서만 쓰는 무작위 값으로 둔다
 * (앱의 링크 grant와 섞이지 않고, 받은 사람 판정에 쓰여도 어떤 grant도 통과하지 않는다).
 */
function dbPublicationAccess(dataSource) {
  const { DbPublicationAccess } = require('../../dist/publications/db-publication-access');
  const { OwnerProfileReader } = require('../../dist/member-profile/owner-profile-reader');
  return new DbPublicationAccess(dataSource, randomBytes(32), new OwnerProfileReader(dataSource), () => new Date());
}

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  if (mode !== 'synthetic' && mode !== 'measure') throw new RagEvalInputError('첫 인자는 synthetic 또는 measure여야 합니다.');
  const options = { mode };
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!['--input', '--out', '--target'].includes(flag) || value === undefined) throw new RagEvalInputError(`알 수 없는 인자: ${flag}`);
    options[flag.slice(2)] = value;
  }
  if (mode === 'measure' && !options.input) throw new RagEvalInputError('measure 모드는 --input이 필요합니다.');
  return options;
}

async function main(argv) {
  const options = parseArgs(argv);
  const raw = options.input ? JSON.parse(readFileSync(resolve(options.input), 'utf8')) : sampleInput();
  if (options.target) raw.targetVersion = options.target;
  const input = parseInput(raw, options.mode);
  const outDir = options.out ? resolve(options.out) : DEFAULT_OUT_DIR;
  let deps;
  if (options.mode === 'synthetic') {
    if (input.snapshot === null) input.snapshot = sampleInput().snapshot;
    deps = createSyntheticDeps(input);
  } else {
    // 측정은 실제 발행 경로로 만든 시연 발행본으로만 한다(BR10.1).
    deps = await createMeasureDeps({ publicationAccess: dbPublicationAccess, memberId: input.memberId });
  }
  try {
    const { summary, rawPath, recordPath } = await runRagEval({ mode: options.mode, input, deps, outDir });
    console.log(JSON.stringify({ mode: summary.mode, questionCount: summary.questionCount, hitRateAt8: summary.hitRateAt8, rawPath, recordPath }));
  } finally {
    await deps.close?.();
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    // 오류 이름과 스크립트가 만든 안내만 낸다(질문·글귀·키를 넣지 않는 메시지).
    console.error(`${error.name}: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  EVAL_SEARCH_LIMIT, RagEvalInputError, createMeasureDeps, createSyntheticDeps, dbPublicationAccess, main, ownedSnapshotReader, parseArgs, parseInput,
  runRagEval, sampleInput,
  splitJdRequirements,
};
