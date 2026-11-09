// U4 제출 2 시험 공용 도우미. 시험 파일이 아니다(이름이 .test.cjs로 끝나지 않아 실행기가 따로 돌리지 않는다).
// 회원·Catch·자료·토큰·비밀번호는 모두 합성이다. U2 AiRun·U3 PublishedIndexWriter는 계약 모양 가짜로 바꿔 결과를 고른다
// (합성 연결을 포함한 사전 확인이며 실제 연결 성공이 아니다).
require('reflect-metadata');
const { randomUUID } = require('node:crypto');
const { AnalysisAttempt, AnalysisConsent, AnalysisRequest } = require('../../dist/member-analysis/member-analysis.entity');
const { AI_NOTICE_VERSION, AiConsentGate } = require('../../dist/ai-consent/ai-consent.gate');
const { DbPublicationAccess } = require('../../dist/publications/db-publication-access');
const { PublicationManageService } = require('../../dist/publications/publication-manage.service');
const { PublishService } = require('../../dist/publications/publish.service');
const { RecipientAccessService } = require('../../dist/publications/recipient-access.service');
const { ensureRegistration } = require('../support/registered-analysis.cjs');
const { APP_SETTINGS, setEnv, collectingLogger, startApp, insertMember, expectError } = require('../u2/support.cjs');

/** 발행 응답 url의 web 주소. 토큰 노출 검사에서 url 밖의 토큰을 찾기 쉽게 https 고정값을 쓴다. */
const WEB_BASE_URL = 'https://catchu.example';
const PUBLISH_SETTINGS = { ...APP_SETTINGS, SHARE_LINK_WEB_BASE_URL: WEB_BASE_URL, CATCHU_QUEUE_REDIS_URL: undefined, CATCHU_EMBEDDING_API_KEY: undefined };
const HOUR = 60 * 60 * 1000;

/**
 * 회원의 Catch가 매달릴 합성 분석 요청. Catch 표의 외래 키와 공개 자격 판정의 원 요청(회원·저장소)을 채운다.
 * 회원당 ACTIVE 요청은 하나뿐이라(부분 유일 인덱스) 끝난 요청(CLOSED)으로 넣어 저장소마다 여러 개를 만들 수 있게 한다.
 */
async function insertAnalysisRequest(db, memberId, repositoryId = 'synthetic-repository') {
  const context = { requestId: randomUUID(), attemptId: randomUUID(), consentId: randomUUID(), memberId, repositoryId, scopeRevision: 'synthetic-scope' };
  await db.transaction(async (manager) => {
    await manager.insert(AnalysisRequest, { ...context, registrationId: await ensureRegistration(manager, context),
      currentAttemptId: context.attemptId, submittedAt: new Date(), updatedAt: new Date(), lifecycle: 'CLOSED' });
    await manager.insert(AnalysisConsent, { ...context, accepted: true, noticeRevision: 'fixture', consentedScope: { synthetic: true }, consentedAt: new Date() });
    await manager.insert(AnalysisAttempt, { attemptId: context.attemptId, requestId: context.requestId, sourceMode: 'MOCK' });
  });
  return { requestId: context.requestId, repositoryId };
}

/** 명시적인 합성 보호 관측(10월 catch-db-fixture와 같음). 행 부재를 NONE으로 채우지 않는다. incomplete면 관측 칸을 비워 불완전 관측을 만든다. */
async function insertProtection(db, memberId, repositoryId, restriction = 'NONE', { incomplete = false } = {}) {
  await db.query(`INSERT INTO repository_protection (protection_id, owner_id, repository_id, applied_restriction, confirmed_source_state, observation_provenance, observed_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7) ON CONFLICT (owner_id, repository_id) DO NOTHING`,
  [randomUUID(), memberId, repositoryId, restriction,
    incomplete ? null : JSON.stringify({ synthetic: true, visibility: restriction === 'SOURCE_PRIVATE' ? 'PRIVATE' : 'PUBLIC' }),
    incomplete ? null : JSON.stringify({ fixture: 'publications-support', synthetic: true }), incomplete ? null : new Date('2026-10-01T00:00:00Z')]);
}

async function insertCatch(db, ownerId, requestId, { catchId = randomUUID(), title = '[합성] Catch', visibility = 'PRIVATE', workFacts = ['[합성] 사실'],
  subjectContribution = '[합성] 기여', authorDescription = null, draftContent = null, mismatch = false, confirmed = true } = {}) {
  await db.query(`INSERT INTO catch_asset (catch_id, title, owner_id, source_request_id, source_result_id, source_candidate_id, work_identity, work_facts, subject_contribution,
      draft_status, draft_content, reflection_status, reflection_questions, registration_assessment, work_facts_confirmed, contribution_confirmed, mismatch, visibility, source_mode,
      author_description, author_description_updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'NOT_GENERATED', ARRAY[]::text[], '{}'::jsonb, $12, $12, $13, $14, 'MOCK', $15, $16)`,
  [catchId, title, ownerId, requestId, `result-${catchId}`, `candidate-${catchId}`, `identity-${catchId}`, workFacts, subjectContribution,
    draftContent === null ? 'NOT_GENERATED' : 'GENERATED', draftContent, confirmed, mismatch, visibility, authorDescription,
    authorDescription === null ? null : new Date()]);
  return catchId;
}

async function insertEvidence(db, catchId, position, { sourceUrl = `https://github.com/synthetic-owner/synthetic-repo/pull/${position}`,
  sourceRevision = `synthetic-revision-${position}`, representedFacts = [`[합성] 근거 사실 ${position}`] } = {}) {
  await db.query(`INSERT INTO catch_evidence (catch_evidence_id, catch_id, position, source_evidence_id, source_url, source_revision, represented_facts, contribution_scope, coverage_limits)
    VALUES ($1, $2, $3, $4, $5, $6, $7, '[합성] 범위', ARRAY[]::text[])`,
  [randomUUID(), catchId, position, `evidence-${position}`, sourceUrl, sourceRevision, representedFacts]);
}

/** 발행 자격을 갖춘 Catch(확인됨·보호 NONE·근거 있음)를 만든다. 원 요청·보호 관측은 저장소마다 한 번 만든다. */
async function eligibleCatch(db, memberId, overrides = {}, { repositoryId = 'synthetic-repository', protection = 'NONE', evidence = 1 } = {}) {
  const request = await insertAnalysisRequest(db, memberId, repositoryId);
  if (protection !== null) await insertProtection(db, memberId, repositoryId, protection);
  const catchId = await insertCatch(db, memberId, request.requestId, overrides);
  for (let position = 1; position <= evidence; position += 1) await insertEvidence(db, catchId, position);
  return catchId;
}

async function insertTextMaterial(db, memberId, { id = randomUUID(), title = '[합성] 자료', body = '[합성] 본문', createdAt = new Date() } = {}) {
  await db.query('INSERT INTO text_material (text_material_id, member_id, title, body, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)',
    [id, memberId, title, body, createdAt]);
  return id;
}

/** 현재 고지 판본의 외부 AI 동의 행을 만든다(C-04). */
function consent(app, memberId) {
  return app.get(AiConsentGate).record(memberId, AI_NOTICE_VERSION, new Date());
}

/** C-02 모양의 기록용 AiRun. 등록 시점에 발행본이 밖(다른 연결)에서 보이는지 함께 적어 "커밋 뒤 등록"을 확인한다. */
function fakeAiRun(db, result = 'ENQUEUED') {
  const calls = [];
  return {
    calls,
    result,
    async enqueueAfterCommit(kind, runKey, payload) {
      const rows = await db.query('SELECT 1 FROM publication WHERE publication_id = $1', [payload.publicationId]);
      calls.push({ kind, runKey, payload, committed: rows.length === 1 });
      return this.result;
    },
  };
}

/** C-08 모양의 기록용 PublishedIndexWriter. fail이면 예외를 던져 발행 트랜잭션을 되돌린다. */
function fakeIndexWriter(db, { fail = false } = {}) {
  const calls = [];
  return {
    calls,
    fail,
    async chunkInTransaction(manager, publicationId, now) {
      const inside = await manager.query('SELECT count(*)::int AS n FROM published_item WHERE publication_id = $1', [publicationId]);
      const outside = await db.query('SELECT 1 FROM publication WHERE publication_id = $1', [publicationId]);
      calls.push({ publicationId, now, transactionActive: manager.queryRunner?.isTransactionActive === true,
        itemsInside: inside[0].n, visibleOutside: outside.length === 1 });
      if (this.fail) throw new Error('synthetic chunk failure');
    },
    async requestReindex() { return 'NOT_FAILED'; },
  };
}

/** 발행 서비스의 U2·U3 자리에 가짜를 꽂는다. 되돌리는 함수를 돌려준다. */
function bindFakes(app, { aiRun, indexWriter }) {
  const publisher = app.get(PublishService);
  const saved = { aiRun: publisher.aiRun, indexWriter: publisher.indexWriter };
  if (aiRun) publisher.aiRun = aiRun;
  if (indexWriter) publisher.indexWriter = indexWriter;
  return () => Object.assign(publisher, saved);
}

/** PUBLICATIONS_CLOCK 자리를 시험 시계로 바꾼다(발행·관리·C-10·받은 사람 경로 모두). 되돌리는 함수를 돌려준다. */
function setClock(app, clock) {
  const targets = [app.get(PublishService), app.get(PublicationManageService), app.get(DbPublicationAccess), app.get(RecipientAccessService)];
  const saved = targets.map((target) => target.clock);
  for (const target of targets) target.clock = clock;
  return () => targets.forEach((target, index) => { target.clock = saved[index]; });
}

function body(items, overrides = {}) {
  return { title: '[합성] 발행본', items, ...overrides };
}
const catchItem = (sourceId) => ({ kind: 'CATCH', sourceId });
const textItem = (sourceId) => ({ kind: 'TEXT_MATERIAL', sourceId });

/** 발행 응답 url에서 토큰을 꺼낸다(url 안에만 있어야 한다). */
function tokenOf(url) {
  const match = /\/s\/([A-Za-z0-9_-]{43})$/.exec(url);
  if (!match) throw new Error('발행 응답 url에 토큰이 없습니다.');
  return match[1];
}

/**
 * 실제 발행 API로 받은 사람 시험용 발행본을 만든다(제출 3). 텍스트 자료 하나를 넣고 password를 주면 비밀번호 링크다.
 * 돌려주는 값에 토큰이 있으므로 응답·로그 비노출 검사의 비밀값 목록에 넣는다.
 */
async function publishLink(server, db, member, { password, title = '[합성] 받은 사람 시험 발행본', items } = {}) {
  const chosen = items ?? [textItem(await insertTextMaterial(db, member.memberId, { title: '[합성] 자료', body: '[합성] 본문' }))];
  const response = await server.call('POST', '/publications', { token: member.token, body: body(chosen, { title, ...(password ? { password } : {}) }) });
  if (response.status !== 201) throw new Error(`발행 실패 ${response.status}: ${response.text}`);
  return { ...response.body, token: tokenOf(response.body.url), expiresAt: new Date(response.body.expiresAt), publishedAt: new Date(response.body.publishedAt) };
}

/** 받은 사람 경로 요청. /v1 아래 경로를 부르고 상태·머리글·본문·Retry-After를 돌려준다. grant는 X-Link-Grant로만 싣는다. */
async function recipientCall(server, method, path, { grant, body: payload, headers = {} } = {}) {
  const sent = { ...headers };
  if (grant !== undefined) sent['X-Link-Grant'] = grant;
  if (payload !== undefined) sent['Content-Type'] = 'application/json';
  const response = await fetch(`${server.url}/v1${path}`, {
    method, headers: sent, body: payload === undefined ? undefined : (typeof payload === 'string' ? payload : JSON.stringify(payload)),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  return {
    status: response.status, headers: response.headers, text, body: text === '' ? null : JSON.parse(text),
    cacheControl: response.headers.get('cache-control'), retryAfter: response.headers.get('retry-after'),
  };
}
const recipientGet = (server, token, grant, options = {}) => recipientCall(server, 'GET', `/public/links/${encodeURIComponent(token)}${options.query ?? ''}`, { grant, headers: options.headers });
const unlockRaw = (server, token, payload, headers = {}) => recipientCall(server, 'POST', `/public/links/${encodeURIComponent(token)}/unlock`, { body: payload, headers });

module.exports = {
  APP_SETTINGS, PUBLISH_SETTINGS, WEB_BASE_URL, HOUR, setEnv, collectingLogger, startApp, insertMember, expectError,
  insertAnalysisRequest, insertProtection, insertCatch, insertEvidence, eligibleCatch, insertTextMaterial, consent,
  fakeAiRun, fakeIndexWriter, bindFakes, setClock, body, catchItem, textItem, tokenOf,
  publishLink, recipientCall, recipientGet, unlockRaw,
};
