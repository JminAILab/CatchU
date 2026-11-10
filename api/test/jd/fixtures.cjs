// U10 전용 합성 자료. C10·검색·생성 대역은 시험에서만 주입한다.
require('reflect-metadata');
const { randomUUID } = require('node:crypto');
const { insertMember } = require('../u2/support.cjs');
const { Publication } = require('../../dist/publications/publication.entity');
const { PublicationIndex } = require('../../dist/published-index/publication-index.entity');
const { JdService } = require('../../dist/jd/jd.service');
const { JdSummaryService } = require('../../dist/jd-summary/jd-summary.service');
const { JdSummaryStore } = require('../../dist/jd-summary/jd-summary-store');
const { AiConsentGate, AI_NOTICE_VERSION } = require('../../dist/ai-consent/ai-consent.gate');
const { DailyRunLimit } = require('../../dist/daily-run-limit/daily-run-limit');

async function publication(db, memberId, now = new Date()) {
  const row = db.manager.create(Publication, { memberId, title: '합성 발행본', linkTokenReference: randomUUID(), passwordProtectionReference: null,
    publishedAt: now, expiresAt: new Date(now.getTime() + 2160 * 3600000), stoppedAt: null });
  await db.manager.insert(Publication, row);
  await db.manager.insert(PublicationIndex, { publicationId: row.publicationId, status: 'DONE', deadlineAt: now, updatedAt: now });
  return row;
}
const hit = (overrides = {}) => ({ chunkId: randomUUID(), publishedItemId: randomUUID(), fieldPath: 'body', charStart: 0, charEnd: 6,
  pdfPage: null, sourceKind: 'AUTHOR_MATERIAL', text: 'Docker', score: 1, catchEvidenceUrls: [], ...overrides });
const output = (items = []) => ({ items, droppedCount: 0 });
const interpretation = (jdRole = 'UNCONFIRMED', text = '운영 기록은 확인되지 않는다') => ({ kind: 'AI_INTERPRETATION', text, citations: [], jdRole });
const codeIs = (code) => (error) => error.code === code;

async function harness(db, body = ' Docker 경험\r\n\r\n- 협업 경험', options = {}) {
  let now = options.now ?? new Date('2026-11-04T04:00:00.000Z');
  const memberId = await insertMember(db);
  const ownerId = await insertMember(db);
  const pub = await publication(db, ownerId, now);
  const jdService = new JdService(db);
  const jd = await jdService.create(memberId, { title: '합성 JD', body });
  const consent = new AiConsentGate(db);
  await consent.record(memberId, AI_NOTICE_VERSION, now);
  const calls = [], logs = [], queued = [];
  const access = { async resolveForRecipient(token, grant) {
    calls.push(['access', token, grant]);
    return { publicationId: pub.publicationId, ownerMemberId: ownerId, passwordProtected: false, expiresAt: pub.expiresAt };
  }, async resolveForOwner() { throw new Error('본인 경로를 호출하면 안 됨'); }, async readSnapshot() { throw new Error('사본을 직접 읽으면 안 됨'); } };
  const search = { async getIndexState() { calls.push(['index']); return 'DONE'; },
    async search(publicationId, query, limit) { calls.push(['search', publicationId, query, limit]); return { hits: [hit()], publicationText: 'Docker' }; } };
  const aiRun = { async enqueueAfterCommit(kind, runKey, payload) {
    const count = (await db.query('SELECT count(*)::int AS n FROM jd_summary_run WHERE run_id=$1', [runKey]))[0].n;
    if (count !== 1) throw new Error('커밋 전에 큐 등록');
    queued.push({ kind, runKey, payload }); return 'ENQUEUED';
  } };
  const settings = { clock: () => now, logger: (event) => logs.push(event) };
  const store = new JdSummaryStore(db, settings);
  const service = new JdSummaryService(db, store, access, consent, new DailyRunLimit(db), aiRun, search, settings);
  const gate = { async generate(request) { calls.push(['generate', request]); return output([interpretation()]); },
    generateStream() { throw new Error('U10은 stream을 쓰지 않음'); } };
  const accept = () => service.accept(memberId, 'synthetic-token', 'synthetic-grant', { jdId: jd.jdId });
  return { db, memberId, ownerId, pub, jd, jdService, consent, access, search, aiRun, service, store, gate, calls, queued, logs,
    settings, accept, setNow: (value) => { now = value; }, deps: { store, search, gate, ...settings } };
}
const runCount = async (db, memberId) => (await db.query('SELECT coalesce(sum(count),0)::int AS n FROM daily_execution_count WHERE member_id=$1', [memberId]))[0].n;
module.exports = { publication, hit, output, interpretation, codeIs, harness, runCount };
