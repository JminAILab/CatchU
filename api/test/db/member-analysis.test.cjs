require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { openTestDataSource, resetTestDatabase } = require('../support/test-database.cjs');
const { MemberAccount, MemberProfile, GitHubConnection, AnalysisRequest, AnalysisConsent,
  AnalysisAttempt, IdempotencyRecord } = require('../../dist/member-analysis/member-analysis.entity');
const { DevMemberService, SYNTHETIC_REPOSITORY } = require('../../dist/member-analysis/dev-member.service');
const { insertInitialAnalysis } = require('../../dist/member-analysis/initial-analysis');
const { runIdempotentCreation } = require('../../dist/member-analysis/idempotent-creation');
const { readAuthConfig } = require('../../dist/auth/auth.config');
let db;
before(async () => { db = await openTestDataSource(); });
after(async () => { await db?.destroy(); });
beforeEach(async () => { await resetTestDatabase(db); });
const dev = (settings = { devLoginEnabled: true }) => new DevMemberService(db, settings);
const input = (memberId, overrides = {}) => ({ memberId, repositoryId: SYNTHETIC_REPOSITORY.repositoryId,
  noticeRevision: 'notice-1', scopeRevision: SYNTHETIC_REPOSITORY.allowedScopeRevision,
  consentedScope: { allowedKinds: ['commits'] }, sourceMode: 'MOCK', ...overrides });
const transaction = (work) => db.transaction('READ COMMITTED', work);
const create = (memberId, overrides) => transaction(m => insertInitialAnalysis(m, input(memberId, overrides)));
const fingerprint = (value) => createHash('sha256').update(value).digest('hex');
const key = (memberId, overrides = {}) => ({ memberId, operation: 'createAnalysisRequest', key: 'same-key',
  requestFingerprint: fingerprint('body-1'), ...overrides });
function callbacks(memberId, overrides = {}) {
  return {
    async create(m) {
      const r = await insertInitialAnalysis(m, input(memberId));
      return { requestId: r.requestId, linkId: null, responseReference: r.requestId };
    },
    async isSame() { return true; },
    async readResponse(m, r) {
      const row = await m.findOneByOrFail(AnalysisRequest, { requestId: r.requestId });
      assert.equal(r.responseReference, row.requestId);
      return { requestId: row.requestId };
    },
    ...overrides,
  };
}

test('회원 생성은 기본 프로필·합성 연동과 원자적이며 반복·동시 로그인은 같은 UUID', async () => {
  const ids = await Promise.all(Array.from({length: 6}, () => dev().resolveMember('same-dev-identity')));
  assert.equal(new Set(ids).size, 1);
  assert.match(ids[0], /^[0-9a-f-]{36}$/);
  assert.equal(await db.getRepository(MemberAccount).count(), 1);
  assert.equal(await db.getRepository(MemberProfile).count(), 1);
  assert.equal(await db.getRepository(GitHubConnection).count(), 1);
  const p = await db.manager.findOneByOrFail(MemberProfile, { memberId: ids[0] });
  assert.equal(p.displayName, ''); assert.equal(p.introduction, ''); assert.equal(p.desiredRole, '');
  assert.deepEqual(p.skills, []); assert.equal(p.inputProvenance, 'SELF_REPORTED');
  await db.manager.update(MemberProfile, {memberId: ids[0]}, {displayName:'기존 이름'});
  assert.equal(await dev().resolveMember('same-dev-identity'), ids[0]);
  assert.equal((await db.manager.findOneByOrFail(MemberProfile,{memberId:ids[0]})).displayName, '기존 이름');
  assert.notEqual(await dev().resolveMember('different-dev-identity'), ids[0]);
});

test('개발 연동은 지정 repository 표본과 일치하며 자격정보 원문 없이 MOCK으로 조회', async () => {
  const id = await dev().resolveMember('mock-member');
  const sample = JSON.parse(readFileSync(join(__dirname,'../../../worker/fixtures/m1-synthetic/context.sample.json'),'utf8'));
  assert.deepEqual(SYNTHETIC_REPOSITORY, sample.repository);
  const state = await dev().readConnection(id);
  assert.equal(state.connectionState,'CONNECTED'); assert.equal(state.sourceMode,'MOCK');
  assert.deepEqual(state.repositories,[sample.repository]);
  assert.equal((await db.manager.findOneByOrFail(GitHubConnection,{memberId:id})).credentialReference,null);
  await db.manager.update(GitHubConnection,{memberId:id},{connectionState:'DISCONNECTED'});
  await dev().resolveMember('mock-member');
  assert.deepEqual((await dev().readConnection(id)).repositories,[]);
});

test('기본 비활성·production은 로그인 회원 생성과 개발 연결 조회를 모두 거부', async () => {
  for(const settings of [{}, {DEV_LOGIN_ENABLED:'true',NODE_ENV:'production'}]) {
    const config=readAuthConfig({AUTH_JWT_SECRET:'ab'.repeat(32),AUTH_ACCESS_TOKEN_TTL_SECONDS:'60',...settings});
    await assert.rejects(dev(config).resolveMember('blocked'), e=>e.getStatus()===403);
    await assert.rejects(dev(config).readConnection(randomUUID()),e=>e.getStatus()===403);
  }
  assert.equal(await db.getRepository(MemberAccount).count(),0);
});

test('기존 회원 누락 프로필·실제 연동을 합성 자료로 보정하지 않으며 DB 오류는 실패', async () => {
  const id=await dev().resolveMember('existing');
  await db.manager.update(GitHubConnection,{memberId:id},{externalAccountReference:'real-provider'});
  await assert.rejects(dev().readConnection(id),/not a synthetic/);
  await dev().resolveMember('existing');
  assert.equal((await db.manager.findOneByOrFail(GitHubConnection,{memberId:id})).externalAccountReference,'real-provider');
  await db.manager.delete(MemberProfile,{memberId:id});
  await assert.rejects(dev().resolveMember('existing'),/profile is missing/);
});

test('프로필 저장 실패면 회원·연동까지 롤백하고 식별자 재사용으로 정상 복구', async () => {
  await db.query("ALTER TABLE member_profile ADD CONSTRAINT test_reject_profile CHECK (false) NOT VALID");
  try { await assert.rejects(dev().resolveMember('profile-failure')); }
  finally { await db.query('ALTER TABLE member_profile DROP CONSTRAINT test_reject_profile'); }
  assert.equal(await db.getRepository(MemberAccount).count(),0);
  assert.equal(await db.getRepository(GitHubConnection).count(),0);
  await dev().resolveMember('profile-failure');
});

test('회원당 프로필·연동 하나, 잘못된 enum·없는 회원을 DB가 거부', async () => {
  const id=await dev().resolveMember('constraints');
  await assert.rejects(db.manager.insert(MemberProfile,Object.assign(new MemberProfile(),{memberId:id})),e=>e.code==='23505');
  await assert.rejects(db.manager.insert(GitHubConnection,Object.assign(new GitHubConnection(),{memberId:id,connectionState:'CONNECTED'})),e=>e.code==='23505');
  await assert.rejects(db.manager.update(GitHubConnection,{memberId:id},{connectionState:'UNKNOWN'}),e=>e.code==='23514');
  await assert.rejects(db.manager.insert(MemberProfile,Object.assign(new MemberProfile(),{memberId:randomUUID()})),e=>e.code==='23503');
});

test('요청·동의·첫 시도의 순환 FK를 한 트랜잭션으로 저장하고 실패시 세 행 전체 롤백', async () => {
  const id=await dev().resolveMember('request');
  let r;
  await assert.rejects(transaction(async m=>{
    r=await insertInitialAnalysis(m,input(id));
    assert.equal(await db.getRepository(AnalysisRequest).count(),0,'커밋 전 다른 연결에는 보이지 않음');
    throw new Error('caller failed');
  }),/caller failed/);
  for(const type of [AnalysisRequest,AnalysisConsent,AnalysisAttempt]) assert.equal(await db.getRepository(type).count(),0);
  r=await create(id);
  const consent=await db.manager.findOneByOrFail(AnalysisConsent,{consentId:r.consentId});
  const attempt=await db.manager.findOneByOrFail(AnalysisAttempt,{attemptId:r.currentAttemptId});
  assert.equal(consent.requestId,r.requestId);assert.equal(consent.memberId,id);
  assert.equal(attempt.requestId,r.requestId);assert.equal(attempt.processing,'QUEUED');
  assert.equal(attempt.application,'NOT_READY');assert.equal(attempt.sourceMode,'MOCK');
});

test('중간 미완료 요청은 커밋에서 실패하며 동의·시도의 다른 요청/회원/저장소 연결도 거부', async () => {
  const id=await dev().resolveMember('incomplete');
  await assert.rejects(transaction(async m=>{
    await m.insert(AnalysisRequest,Object.assign(new AnalysisRequest(),{memberId:id,repositoryId:'repo',
      consentId:randomUUID(),currentAttemptId:randomUUID(),submittedAt:new Date(),updatedAt:new Date()}));
  }), e=>e.code==='23503');
  const r=await create(id);
  const other=await dev().resolveMember('other');
  for(const changes of [{memberId:other},{repositoryId:'wrong-repo'},{requestId:randomUUID()}]) {
    await assert.rejects(transaction(m=>m.update(AnalysisConsent,{consentId:r.consentId},changes)));
  }
  await assert.rejects(transaction(m=>m.update(AnalysisAttempt,{attemptId:r.currentAttemptId},{requestId:randomUUID()})),e=>e.code==='23503');
});

test('회원당 ACTIVE 요청 하나를 동시 접수에서도 DB가 보장하고 CLOSED 후 다른 신규 요청은 허용', async () => {
  const id=await dev().resolveMember('active');
  const results=await Promise.allSettled([create(id),create(id,{repositoryId:'other-repo'})]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.find(x=>x.status==='rejected').reason.code,'23505');
  assert.equal(await db.getRepository(AnalysisConsent).count(),1);
  const r=results.find(x=>x.status==='fulfilled').value;
  await db.manager.update(AnalysisRequest,{requestId:r.requestId},{lifecycle:'CLOSED'});
  await create(id,{repositoryId:'other-repo'});
  assert.equal(await db.getRepository(AnalysisRequest).count(),2);
});

test('동의는 요청당 하나이고 false 동의·음수 후보 수·처리 enum 위반을 거부', async () => {
  const id=await dev().resolveMember('enums');
  const r=await create(id);
  const c=await db.manager.findOneByOrFail(AnalysisConsent,{consentId:r.consentId});
  await assert.rejects(db.manager.save(AnalysisConsent,{...c,consentId:randomUUID()}),e=>e.code==='23505');
  await assert.rejects(db.manager.update(AnalysisConsent,{consentId:c.consentId},{accepted:false}));
  for(const changes of [{eligibleCandidateCount:-1},{processing:'INVALID'},{application:'INVALID'},{sourceMode:'INVALID'}]) {
    await assert.rejects(db.manager.update(AnalysisAttempt,{attemptId:r.currentAttemptId},changes),e=>e.code==='23514');
  }
});

test('같은 키 순차·동시 호출은 자원 하나와 동일 응답, 비교 함수를 재요청마다 실행', async () => {
  const id=await dev().resolveMember('idem');
  let comparisons=0;
  const cb=callbacks(id,{async isSame(m){assert.equal(m.queryRunner.isTransactionActive,true);comparisons++;return true;}});
  const call=()=>transaction(m=>runIdempotentCreation(m,key(id),cb));
  const results=await Promise.all([call(),call(),call()]);
  assert.equal(results.filter(x=>!x.replayed).length,1);
  assert.equal(new Set(results.map(x=>x.response.requestId)).size,1);
  assert.equal(comparisons,2);
  assert.equal((await call()).replayed,true);
  assert.equal(await db.getRepository(AnalysisRequest).count(),1);
  assert.equal(await db.getRepository(IdempotencyRecord).count(),1);
});

test('다른 지문·동일 지문에서 비동기 비교 false는 충돌, 비교 예외는 서버 오류 그대로', async () => {
  const id=await dev().resolveMember('compare');
  await transaction(m=>runIdempotentCreation(m,key(id),callbacks(id)));
  const conflict=e=>e.code==='IDEMPOTENCY_CONFLICT';
  await assert.rejects(transaction(m=>runIdempotentCreation(m,key(id,{requestFingerprint:fingerprint('different')}),callbacks(id))),conflict);
  await assert.rejects(transaction(m=>runIdempotentCreation(m,key(id),callbacks(id,{async isSame(){return false;}}))),conflict);
  await assert.rejects(transaction(m=>runIdempotentCreation(m,key(id),callbacks(id,{async isSame(){throw new Error('inconsistent verifier');}}))),/inconsistent verifier/);
  await assert.rejects(transaction(m=>runIdempotentCreation(m,key(id),callbacks(id,{async isSame(m){await m.query('SELECT * FROM intentionally_missing_104');return true;}}))),e=>e.code==='42P01');
  assert.equal(await db.getRepository(AnalysisRequest).count(),1);
});

test('자원 생성·응답 구성·커밋 실패는 키와 자원을 모두 롤백하며 같은 키를 다시 사용할 수 있음',async()=>{
  const id=await dev().resolveMember('rollback');
  for(const overrides of [
    {async create(m){await insertInitialAnalysis(m,input(id));throw new Error('create failed');}},
    {async readResponse(){throw new Error('response failed');}},
    {async readResponse(m,r){await m.update(AnalysisRequest,{requestId:r.requestId},{currentAttemptId:randomUUID()});return {};}},
  ]) {
    await assert.rejects(transaction(m=>runIdempotentCreation(m,key(id),callbacks(id,overrides))));
    for(const type of [AnalysisRequest,AnalysisConsent,AnalysisAttempt,IdempotencyRecord]) assert.equal(await db.getRepository(type).count(),0);
  }
  assert.equal((await transaction(m=>runIdempotentCreation(m,key(id),callbacks(id)))).replayed,false);
});

test('멱등 member/operation/key 유일성과 연결 소유자·operation별 참조 무결성을 DB가 보호', async()=>{
  const a=await dev().resolveMember('a'), b=await dev().resolveMember('b');
  await transaction(m=>runIdempotentCreation(m,key(a),callbacks(a)));
  await transaction(m=>runIdempotentCreation(m,key(b),callbacks(b)));
  const r=await db.manager.findOneByOrFail(IdempotencyRecord,{memberId:a});
  await assert.rejects(db.manager.insert(IdempotencyRecord,{...r,idempotencyId:randomUUID()}),e=>e.code==='23505');
  await assert.rejects(db.manager.update(IdempotencyRecord,{idempotencyId:r.idempotencyId},{operation:'createShareLink'}),e=>e.code==='23514');
  await assert.rejects(transaction(m=>m.insert(IdempotencyRecord,{...r,idempotencyId:randomUUID(),memberId:b,key:'foreign'})),e=>e.code==='23503');
  await assert.rejects(transaction(m=>runIdempotentCreation(m,key(b,{key:'foreign'}),callbacks(b,{
    async create(){return {requestId:r.requestId,linkId:null,responseReference:r.responseReference};}
  }))),/owner reference/);
});

test('트랜잭션 없음·더 높은 격리 수준은 생성 전에 거부', async()=>{
  const id=await dev().resolveMember('isolation');
  await assert.rejects(runIdempotentCreation(db.manager,key(id),callbacks(id)),/active transaction/);
  await assert.rejects(db.transaction('REPEATABLE READ',m=>runIdempotentCreation(m,key(id),callbacks(id))),/READ COMMITTED/);
});

test('C 링크 연결: 같은 지문·다른 비밀번호 판정은 409, 같은 manager로 만든 링크만 재생', async()=>{
  // 제품 C 테이블을 구현하지 않는다. 실제 공통 멱등 처리를 검증하기 위한 최소 SQL 대역.
  await db.query('CREATE TABLE share_link (link_id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES member_account(member_id), verifier text NOT NULL)');
  try {
    const id=await dev().resolveMember('link');
    const k=key(id,{operation:'createShareLink'});
    let comparisons=0;
    const cb=(password)=>({
      async create(m){
        const linkId=randomUUID();
        await m.query('INSERT INTO share_link VALUES ($1,$2,$3)',[linkId,id,fingerprint(password)]);
        return {requestId:null,linkId,responseReference:linkId};
      },
      async isSame(m,r){
        comparisons++;
        const [link]=await m.query('SELECT * FROM share_link WHERE link_id=$1',[r.linkId]);
        return link.verifier===fingerprint(password); // 합성 비교 대역. 실제 C는 scrypt isSameShareCreate.
      },
      async readResponse(m,r){
        const [link]=await m.query('SELECT link_id FROM share_link WHERE link_id=$1',[r.linkId]);
        return link;
      }
    });
    const first=await transaction(m=>runIdempotentCreation(m,k,cb('first')));
    assert.deepEqual((await transaction(m=>runIdempotentCreation(m,k,cb('first')))).response,first.response);
    await assert.rejects(transaction(m=>runIdempotentCreation(m,k,cb('different'))),e=>e.code==='IDEMPOTENCY_CONFLICT');
    assert.equal(comparisons,2);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM share_link'))[0].n,1);
    // DB나 기록 오류를 비밀번호 불일치로 바꾸지 않는다.
    await db.query('DELETE FROM share_link');
    await assert.rejects(transaction(m=>runIdempotentCreation(m,k,cb('first'))),/owner reference/);
  } finally { await db.query('DROP TABLE share_link'); }
});

test('개발 로그인 HTTP 토큰의 UUID로 실제 분석 FK를 저장하며 반복 발급도 같은 회원', async (t)=>{
  const {randomBytes}=require('node:crypto');
  const {decodeJwt}=require('jose');
  const {NestFactory}=require('@nestjs/core');
  const {AppModule}=require('../../dist/app.module');
  const {configureApp}=require('../../dist/app.setup');
  const settings={AUTH_JWT_SECRET:randomBytes(32).toString('hex'),AUTH_ACCESS_TOKEN_TTL_SECONDS:'60',DEV_LOGIN_ENABLED:'true',NODE_ENV:'test'};
  const previous=Object.fromEntries(Object.keys(settings).map(k=>[k,process.env[k]]));
  Object.assign(process.env,settings);
  let app;
  t.after(async()=>{
    try{await app?.close();}finally{for(const[k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
  });
  app=await configureApp(await NestFactory.create(AppModule,{logger:false,abortOnError:false}));
  await app.listen(0,'127.0.0.1');
  const url=await app.getUrl();
  const login=async()=>{
    const r=await fetch(url+'/v1/auth/dev-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({memberId:'http-member-104'})});
    assert.equal(r.status,200);
    return decodeJwt((await r.json()).accessToken).sub;
  };
  const id=await login();
  assert.notEqual(id,'http-member-104');assert.equal(await login(),id);
  assert.equal((await db.manager.findOneByOrFail(MemberAccount,{memberId:id})).identityReference,'catchu:dev-login:http-member-104');
  const request=await create(id);
  assert.equal(request.memberId,id);
});

test('접수한 동의 변경과 재요청 선행 참조의 역방향 변경을 DB가 거부',async()=>{
  const id=await dev().resolveMember('immutable');
  const r=await create(id);
  for(const change of [{scopeRevision:'other'},{consentedScope:{other:true}},{noticeRevision:'other'}]){
    await assert.rejects(db.manager.update(AnalysisConsent,{consentId:r.consentId},change),e=>e.code==='23514');
  }
  await db.manager.update(AnalysisRequest,{requestId:r.requestId},{lifecycle:'CLOSED'});
  const next=await create(id);
  // 기존 요청의 역방향 연결을 만들어 순환으로 바꾸는 작업을 금지한다.
  await assert.rejects(db.manager.update(AnalysisRequest,{requestId:r.requestId},{retryOfRequestId:next.requestId}),e=>e.code==='23514');
  await assert.rejects(db.manager.update(AnalysisRequest,{requestId:next.requestId},{retryOfRequestId:next.requestId}),e=>e.code==='23514');
});

test('일곱 테이블은 빈 스키마에 up/down/re-up 가능하고 엔티티와 생성 DDL이 일치',async()=>{
  const schema='test_104_'+randomUUID().replaceAll('-','');
  await db.query('CREATE SCHEMA "'+schema+'"');
  const isolated=await openTestDataSource({schema,extra:{options:'-c search_path='+schema+' -c TimeZone=UTC'}});
  try {
    await isolated.runMigrations();
    const tables=await isolated.query('SELECT tablename FROM pg_tables WHERE schemaname=$1',[schema]);
    assert.equal(tables.length,8,'일곱 테이블 + migrations');
    const diff=await isolated.driver.createSchemaBuilder().log();
    assert.deepEqual(diff.upQueries.map(q=>q.query),[]);
    await isolated.undoLastMigration();
    assert.deepEqual((await isolated.query('SELECT tablename FROM pg_tables WHERE schemaname=$1',[schema])).map(x=>x.tablename),['migrations']);
    await isolated.runMigrations();
    assert.equal((await isolated.query('SELECT count(*)::int AS n FROM member_account'))[0].n,0);
  } finally { await isolated.destroy();await db.query('DROP SCHEMA "'+schema+'" CASCADE'); }
});
