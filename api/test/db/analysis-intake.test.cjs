require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { decodeJwt } = require('jose');
const { AppModule } = require('../../dist/app.module');
const { configureApp } = require('../../dist/app.setup');
const { DevMemberService, SYNTHETIC_REPOSITORY } = require('../../dist/member-analysis/dev-member.service');
const { AnalysisRequest, AnalysisConsent, AnalysisAttempt } = require('../../dist/member-analysis/member-analysis.entity');
const { AnalysisIntakeService } = require('../../dist/analysis-intake/analysis-intake.service');
const { AnalysisNoticeService, SYNTHETIC_NOTICE } = require('../../dist/analysis-intake/analysis-notice');
const { parseAnalysisInput, analysisFingerprint } = require('../../dist/analysis-intake/analysis-input');
const { retryDecision } = require('../../dist/analysis-intake/analysis-status');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { readFileSync } = require('node:fs');
const YAML = require('yaml');
const { resolve } = require('node:path');
let db;
before(async () => { db = await openTestDataSource(); });
beforeEach(async () => { await resetTestDatabase(db); });
after(async () => { await db?.destroy(); });
const command = (changes = {}) => ({ repositoryId: SYNTHETIC_REPOSITORY.repositoryId,
  consent: { accepted: true, noticeRevision: SYNTHETIC_NOTICE.noticeRevision, scopeRevision: SYNTHETIC_NOTICE.scopeRevision },
  ...changes });
async function start(t, overrides = {}) {
  const settings = { NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true', AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: '900', AUTH_WEB_ORIGIN: 'https://catchu.example',
    SHARE_LINK_WEB_BASE_URL: 'https://catchu.example', LINK_GRANT_SECRET: randomBytes(32).toString('hex'),
    CORS_ALLOWED_ORIGINS: undefined, ...overrides };
  const previous = Object.fromEntries(Object.keys(settings).map(k => [k, process.env[k]]));
  for (const [k,v] of Object.entries(settings)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  let app;
  const logs = [];
  const logger = Object.fromEntries(['log','error','warn','debug','verbose','fatal'].map(k =>
    [k, (...args) => logs.push(args.map(String).join(' '))]));
  t.after(async () => { try { await app?.close(); } finally {
    for (const [k,v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  } });
  app = await configureApp(await NestFactory.create(AppModule, { logger, abortOnError: false }));
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const call = (path, options) => fetch(base + path, { ...options, signal: AbortSignal.timeout(10000) });
  const login = async (id = 'analysis-138') => {
    const r = await call('/v1/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: id }) });
    assert.equal(r.status, 200);
    const { accessToken } = await r.json();
    return { token: accessToken, memberId: decodeJwt(accessToken).sub };
  };
  const post = (user, key = randomUUID(), body = command()) => call('/v1/analysis-requests', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: 'Bearer ' + user.token } : {}),
      ...(key === undefined ? {} : { 'Idempotency-Key': key }) }, body: JSON.stringify(body),
  });
  return { app, login, post, call, logs, provider: app.get(DevMemberService), notices: app.get(AnalysisNoticeService),
    intake: app.get(AnalysisIntakeService) };
}
async function error(r, status, code) {
  assert.equal(r.status, status); assert.equal(r.headers.get('cache-control'), 'no-store');
  const body = await r.json(); assert.equal(body.code, code);
  return body;
}
async function counts() {
  const [row] = await db.query('SELECT (SELECT count(*)::int FROM analysis_request) requests, (SELECT count(*)::int FROM analysis_consent) consents, (SELECT count(*)::int FROM analysis_attempt) attempts, (SELECT count(*)::int FROM idempotency_record) keys');
  return row;
}
async function terminal(requestId, processing = 'FAILED', changes = {}) {
  const request = await db.manager.findOneByOrFail(AnalysisRequest, { requestId });
  await db.manager.update(AnalysisAttempt, { attemptId: request.currentAttemptId }, {
    processing, application: 'APPLIED', eligibleCandidateCount: 0, ownerResultsReady: false,
    failures: processing === 'FAILED' ? [{ stage: 'DISPATCH', code: 'SYNTHETIC_CONFIRMED_FAILURE', message: '[합성] 실행되지 않은 확정 실패' }] : [],
    failureConfirmationReference: processing === 'FAILED' ? 'synthetic-confirmed:' + requestId : null, ...changes,
  });
  await db.manager.update(AnalysisRequest, { requestId }, { lifecycle: 'CLOSED' });
}
function otherRepository(server) {
  const second = { ...SYNTHETIC_REPOSITORY, repositoryId: 'synthetic-second' };
  const original = server.provider.readConnection.bind(server.provider);
  server.provider.readConnection = async (member, manager) => ({ ...await original(member, manager), repositories: [SYNTHETIC_REPOSITORY, second] });
  const originalScope = server.notices.scope.bind(server.notices);
  server.notices.scope = (repository, revision, mode) => ({ ...originalScope(SYNTHETIC_REPOSITORY.repositoryId, revision, mode), repositoryId: repository });
  return second;
}

test('현재 합성 고지는 인증·no-store와 계약 두 필드만 제공한다', async t => {
  const s = await start(t); const u = await s.login();
  await error(await s.call('/v1/analysis-notice'), 401, 'AUTH_REQUIRED');
  const r = await s.call('/v1/analysis-notice', { headers: { Authorization: 'Bearer ' + u.token } });
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await r.json(), { noticeRevision: SYNTHETIC_NOTICE.noticeRevision, text: SYNTHETIC_NOTICE.text });
  await error(await s.call('/v1/analysis-notice?memberId=other', { headers: { Authorization: 'Bearer ' + u.token } }), 400, 'VALIDATION_FAILED');
});
test('원자 접수·현재 상태 재응답·새 키 ACTIVE 200은 새 동의를 만들지 않는다', async t => {
  const s = await start(t); const u = await s.login(); const body = command(); const key = randomUUID();
  const r = await s.post(u, key, body); assert.equal(r.status, 202); const first = await r.json();
  assert.equal(first.processing, 'QUEUED'); assert.equal(first.application, 'NOT_READY'); assert.equal(first.lifecycle, 'ACTIVE');
  assert.deepEqual(first.retry, { allowed: false, reason: 'IN_PROGRESS' });
  assert.deepEqual(first.registeredCatchIds, []); assert.equal(first.ownerResultsReady, false); assert.equal(first.sourceMode, 'MOCK');
  assert.equal((await db.manager.findOneByOrFail(AnalysisConsent, { consentId: first.consentId })).noticeRevision, body.consent.noticeRevision);
  assert.deepEqual(await counts(), { requests: 1, consents: 1, attempts: 1, keys: 1 });
  const repeated = await s.post(u, key, { consent: { scopeRevision: body.consent.scopeRevision,
    noticeRevision: body.consent.noticeRevision, accepted: true }, repositoryId: body.repositoryId });
  assert.equal(repeated.status, 200); assert.deepEqual(await repeated.json(), first);
  const active = await s.post(u); assert.equal(active.status, 200); assert.deepEqual(await active.json(), first);
  assert.deepEqual(await counts(), { requests: 1, consents: 1, attempts: 1, keys: 2 });
  const responseKeys = ['requestId','repositoryId','consentId','attemptId','submittedAt','updatedAt','requestState',
    'lifecycle','processing','application','sourceMode','eligibleCandidateCount','registeredCatchIds','ownerResultsReady','retry','failures'];
  assert.deepEqual(Object.keys(first).sort(), responseKeys.sort());
  const message = await s.intake.prepareExecutionRequest(u.memberId, first.requestId);
  const contract = YAML.parse(readFileSync(resolve(__dirname, '../../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design/worker-messages.yaml'), 'utf8'));
  const ajv = new Ajv({ strict: false }); addFormats(ajv);
  const validate = ajv.compile({ ...contract.components.schemas.Request, components: contract.components });
  assert.equal(validate(message), true, JSON.stringify(validate.errors));
  assert.equal(message.sourceMode, 'MOCK');
  assert.equal(message.consentId, first.consentId); assert.equal(message.allowedScope.revision, body.consent.scopeRevision);
});
test('같은 키·변경 본문은 모든 동의/대상/retry 필드에서 충돌한다', async t => {
  const s = await start(t); const u = await s.login(); const key = randomUUID(); await s.post(u, key);
  for (const value of [command({ repositoryId: 'other' }), command({ retryOfRequestId: randomUUID() }),
    command({ consent: { ...command().consent, noticeRevision: 'old' } }), command({ consent: { ...command().consent, scopeRevision: 'old' } })]) {
    await error(await s.post(u, key, value), 409, 'IDEMPOTENCY_CONFLICT');
  }
  assert.deepEqual(await counts(), { requests: 1, consents: 1, attempts: 1, keys: 1 });
});
test('동시 같은 키·다른 키에도 한 회원 ACTIVE는 하나이고 회원 간 키는 분리된다', async t => {
  const s = await start(t); const u = await s.login(); const key = randomUUID();
  const rs = await Promise.all(Array.from({ length: 8 }, () => s.post(u, key)));
  assert.equal(rs.filter(r => r.status === 202).length, 1); assert.equal(rs.filter(r => r.status === 200).length, 7);
  const ids = await Promise.all(rs.map(r => r.json())); assert.equal(new Set(ids.map(v => v.requestId)).size, 1);
  const different = await Promise.all(Array.from({ length: 8 }, () => s.post(u)));
  assert(different.every(r => r.status === 200));
  assert.deepEqual(await counts(), { requests: 1, consents: 1, attempts: 1, keys: 9 });
  const other = await s.login('other-138'); const own = await s.post(other, key);
  assert.equal(own.status, 202); assert.notEqual((await own.json()).requestId, ids[0].requestId);
});
test('다른 선정 저장소 동시 요청은 한 건 접수·한 건 409, 종료 후 다른 저장소 신규 허용', async t => {
  const s = await start(t); const u = await s.login(); const second = otherRepository(s);
  const rs = await Promise.all([s.post(u), s.post(u, randomUUID(), command({ repositoryId: second.repositoryId }))]);
  assert.deepEqual(rs.map(r => r.status).sort(), [202,409]);
  const created = await rs.find(r => r.status === 202).json();
  const conflict = await error(rs.find(r => r.status === 409),409,'ANALYSIS_IN_PROGRESS');
  assert.equal(conflict.details.existingRequestId, created.requestId);
  await terminal(created.requestId, 'EMPTY');
  const nextRepo = created.repositoryId === second.repositoryId ? SYNTHETIC_REPOSITORY.repositoryId : second.repositoryId;
  assert.equal((await s.post(u, randomUUID(), command({ repositoryId: nextRepo }))).status, 202);
});
test('형식·추가 필드·잘못된 동의·키·현재 판본·허용 범위 거부에는 행이 없다', async t => {
  const s = await start(t); const u = await s.login();
  await error(await s.post(u, randomUUID(), null), 400, 'INVALID_REQUEST');
  await error(await s.call('/v1/analysis-requests', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + u.token }, body: JSON.stringify(command()) }), 400, 'INVALID_REQUEST');
  for (const body of [[], {}, command({ memberId: u.memberId }), command({ repositoryId: '' }),
    command({ consent: { ...command().consent, admin: true } }), command({ consent: { ...command().consent, accepted: 'true' } })]) {
    await error(await s.post(u, randomUUID(), body), 400, 'VALIDATION_FAILED');
  }
  await error(await s.post(u, ''), 400, 'INVALID_REQUEST');
  await error(await s.post(u, 'a'.repeat(129)), 400, 'INVALID_REQUEST');
  for (const consent of [{ ...command().consent, accepted: false }, { ...command().consent, noticeRevision: 'old' },
    { ...command().consent, scopeRevision: 'old' }]) await error(await s.post(u,randomUUID(),command({consent})),403,'CONSENT_REQUIRED');
  await error(await s.post(u,randomUUID(),command({repositoryId:'not-selected'})),403,'REPOSITORY_NOT_ALLOWED');
  await error(await s.post(null),401,'AUTH_REQUIRED');
  assert.deepEqual(await counts(), { requests: 0, consents: 0, attempts: 0, keys: 0 });
  assert.equal(analysisFingerprint(command()), analysisFingerprint(parseAnalysisInput(command())));
});
for (const state of ['DISCONNECTED','REAUTH_REQUIRED','missing']) {
  test('현재 연결을 재확인: ' + state, async t => {
    const s=await start(t); const u=await s.login();
    if(state==='missing') await db.query('DELETE FROM github_connection WHERE member_id=$1',[u.memberId]);
    else await db.query('UPDATE github_connection SET connection_state=$1 WHERE member_id=$2',[state,u.memberId]);
    await error(await s.post(u),403,'GITHUB_CONNECTION_REQUIRED');
    assert.equal((await counts()).requests,0);
  });
}
test('공급자/DB 조회 실패와 잘못된 공급 자료는 빈 목록·접수 성공으로 바꾸지 않는다',async t=>{
  const s=await start(t); const u=await s.login();
  s.provider.readConnection=async()=>{ throw Error('synthetic-secret-provider'); };
  const body=await error(await s.post(u),500,'INTERNAL_ERROR');
  assert(!JSON.stringify(body).includes('synthetic-secret-provider'));
  s.provider.readConnection=async()=>({connectionState:'CONNECTED',sourceMode:'MOCK',repositories:[{}]});
  await error(await s.post(u),500,'INTERNAL_ERROR');
  assert.equal((await counts()).requests,0);
});
test('실제 자료용 설정 부재·LIVE 공급에 합성 고지를 대신 쓰지 않는다',async t=>{
  const s=await start(t); const u=await s.login();
  const original=s.provider.readConnection.bind(s.provider);
  s.provider.readConnection=async(member,manager)=>({...await original(member,manager),sourceMode:'LIVE'});
  await error(await s.post(u),403,'CONSENT_REQUIRED');
  assert.equal((await counts()).requests,0);
});
for(const overrides of [{DEV_LOGIN_ENABLED:'false'},{NODE_ENV:'production'},{NODE_ENV:undefined},{NODE_ENV:'preview'}]){
  test('합성 고지 기본 비활성/운영 차단: '+JSON.stringify(overrides),async t=>{
    const s=await start(t,overrides);
    const token=await s.app.get(require('../../dist/auth/access-token.service').AccessTokenService).issue(randomUUID());
    await error(await s.call('/v1/analysis-notice',{headers:{Authorization:'Bearer '+token.accessToken}}),403,'CONSENT_REQUIRED');
  });
}
test('저장 실패와 지연 커밋 실패는 네 자원 모두 롤백·동일 키 재접수 가능',async t=>{
  const s=await start(t); const u=await s.login();
  for(const target of ['analysis_consent','idempotency_record']){
    const key=randomUUID();
    await db.query('ALTER TABLE '+target+' ADD CONSTRAINT test_138_fail CHECK (false) NOT VALID');
    try{await error(await s.post(u,key),500,'INTERNAL_ERROR');}finally{await db.query('ALTER TABLE '+target+' DROP CONSTRAINT test_138_fail');}
    assert.deepEqual(await counts(),{requests:0,consents:0,attempts:0,keys:0});
  }
  await db.query("CREATE FUNCTION test_138_commit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic-secret-commit'; END $$");
  await db.query('CREATE CONSTRAINT TRIGGER test_138_commit_fail AFTER INSERT ON idempotency_record DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION test_138_commit_fail()');
  const key=randomUUID();
  try{const body=await error(await s.post(u,key),500,'INTERNAL_ERROR');assert(!JSON.stringify(body).includes('synthetic-secret-commit'));}
  finally{await db.query('DROP TRIGGER test_138_commit_fail ON idempotency_record');await db.query('DROP FUNCTION test_138_commit_fail()');}
  assert.deepEqual(await counts(),{requests:0,consents:0,attempts:0,keys:0});
  assert.equal((await s.post(u,key)).status,202);
});
test('확정 실패만 새 동의·ID로 재요청하고 같은 키는 현재 상태로 재응답',async t=>{
  const s=await start(t); const u=await s.login();const originalKey=randomUUID();
  const first=await (await s.post(u,originalKey)).json(); await terminal(first.requestId);
  await error(await s.post(u),409,'RETRY_NOT_ALLOWED');
  const key=randomUUID();const body=command({retryOfRequestId:first.requestId});
  const r=await s.post(u,key,body);assert.equal(r.status,202);const next=await r.json();
  for(const k of ['requestId','consentId','attemptId']) assert.notEqual(first[k],next[k]);
  assert.equal((await db.manager.findOneByOrFail(AnalysisRequest,{requestId:next.requestId})).retryOfRequestId,first.requestId);
  assert.equal((await db.manager.findOneByOrFail(AnalysisConsent,{consentId:first.consentId})).requestId,first.requestId);
  const replay=await s.post(u,key,body);assert.equal(replay.status,200);assert.equal((await replay.json()).requestId,next.requestId);
  const old=await s.post(u,originalKey);assert.equal(old.status,200);assert.equal((await old.json()).retry.allowed,true);
});
for(const processing of ['EMPTY','SUCCEEDED','PARTIAL_FAILED']){
  test('정상·정상 0건·부분 결과의 재분석 및 참조 생략 우회 거부: '+processing,async t=>{
    const s=await start(t);const u=await s.login();const first=await(await s.post(u)).json();await terminal(first.requestId,processing);
    for(const body of [command(),command({retryOfRequestId:first.requestId})])await error(await s.post(u,randomUUID(),body),409,'REANALYSIS_DEFERRED');
    assert.equal((await counts()).requests,1);
  });
}
for(const changes of [{failureConfirmationReference:null},{failures:[]},{processing:'UNCERTAIN'},{application:'RECOVERING'},{application:'APPLY_FAILED'},{eligibleCandidateCount:1},{ownerResultsReady:true}]){
  test('실행 불명·반영 미해결·근거 부족·유효 결과 재요청 거부: '+JSON.stringify(changes),async t=>{
    const s=await start(t);const u=await s.login();const first=await(await s.post(u)).json();await terminal(first.requestId,'FAILED',changes);
    await error(await s.post(u,randomUUID(),command({retryOfRequestId:first.requestId})),409,
      changes.eligibleCandidateCount||changes.ownerResultsReady?'REANALYSIS_DEFERRED':'RETRY_NOT_ALLOWED');
    assert.equal((await counts()).requests,1);
  });
}
test('타인·잘못된 retry 참조는 ACTIVE로 숨기지 않고 같은 404',async t=>{
  const s=await start(t);const a=await s.login();const b=await s.login('retry-other');
  const owned=await(await s.post(b)).json();await s.post(a);
  for(const ref of [owned.requestId,randomUUID(),'not-uuid'])await error(await s.post(a,randomUUID(),command({retryOfRequestId:ref})),404,'RESOURCE_UNAVAILABLE');
  assert.equal((await counts()).requests,2);
});
test('Catch 본체가 있으면 등록 연결이 없어도 재분석을 허용하지 않는다',()=>{
  const request=Object.assign(new AnalysisRequest(),{lifecycle:'CLOSED'});
  const attempt=Object.assign(new AnalysisAttempt(),{processing:'FAILED',application:'APPLIED',failureConfirmationReference:'confirmed',failures:[{stage:'DISPATCH',code:'FAIL',message:'합성'}]});
  assert.equal(retryDecision(request,attempt,1).allowed,false);
  assert.equal(retryDecision(request,attempt,0).allowed,true);
});

test('기존 E의 검증된 실패 Result·반영 완료를 확정 근거로 쓰되 수신 ACK만으로 재요청하지 않는다',async t=>{
  const s=await start(t);const u=await s.login();const key=randomUUID();const first=await(await s.post(u,key)).json();
  const {AnalysisReceiver}=require('../../dist/analysis-receiver/analysis-receiver.service');
  const {DatabaseReceiverStore}=require('../../dist/analysis-receiver/database-receiver.store');
  const {WorkerMessageValidator}=require('../../dist/analysis-receiver/worker-message.validator');
  const {ResultApplicationService}=require('../../dist/result-application/result-application.service');
  const contract=resolve(__dirname,'../../../aidlc/spaces/default/intents/260914-catchu-october-mvp/inception/contract-design');
  const receiver=new AnalysisReceiver(new DatabaseReceiverStore(db),new WorkerMessageValidator(contract),{record(){}});
  const values={...first,memberId:u.memberId,scopeRevision:command().consent.scopeRevision,caseId:'intake-failed-138'};
  const template=readFileSync(resolve(__dirname,'../../../worker/fixtures/m1-synthetic/results/failed.json'),'utf8');
  const result=JSON.parse(template.replace(/\{\{(\w+)\}\}/g,(_,name)=>{assert(Object.hasOwn(values,name));return values[name];}));
  const received=await receiver.receiveResult(result);
  assert.equal(received.receipt.disposition,'ACCEPTED');
  const pending=await(await s.post(u,key)).json();assert.equal(pending.retry.allowed,false);assert.equal(pending.application,'PENDING');
  const application=new ResultApplicationService(db,{register:async()=>[],classifyError:()=>undefined});
  await application.apply(received.accepted);
  const state=await(await s.post(u,key)).json();assert.equal(state.retry.allowed,true);assert.equal(state.lifecycle,'CLOSED');
  assert.equal((await s.post(u,randomUUID(),command({retryOfRequestId:first.requestId}))).status,202);
});
