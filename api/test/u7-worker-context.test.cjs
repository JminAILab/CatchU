const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { readRegistrationScope } = require('../dist/member-repositories/registration-scope');
const { RegistrationContextSource } = require('../dist/member-repositories/registration-context.source');
const { buildRequestMessage } = require('../dist/analysis-queue/analysis-request.dispatcher');
const { validator, result, event } = require('./helpers/receiver-harness.cjs');
const { checkMessage } = require('./helpers/worker-messages.cjs');
const scope = () => { const id = randomUUID(); return { revision: 'scope-v2', repositoryId: '123', allowedResourceTypes: ['COMMIT'], selectionReference: id, registrationId: id, repository: { owner: 'owner', name: 'repo', url: 'https://github.com/owner/repo' } }; };
const pending = () => { const s = scope(); return { requestId: randomUUID(), attemptId: randomUUID(), memberId: randomUUID(), repositoryId: s.repositoryId, registrationId: s.registrationId, sourceMode: 'LIVE', consentId: randomUUID(), scopeRevision: s.revision, consentedScope: s, consentedAt: new Date(), submittedAt: new Date(), noticeRevision: 'notice-v2' }; };
test('C3 네 메시지는 v2만 받고 v1 혼입을 거부한다', () => {
  const request = buildRequestMessage(pending(), validator).message;
  const receipt = { schemaVersion: '2', messageId: 'receipt', resultId: 'r', requestId: 'q', attemptId: 'a', disposition: 'ACCEPTED', code: 'OK' };
  for (const [check, value] of [[validator.request.bind(validator),request], [validator.result.bind(validator),result()], [validator.progress.bind(validator),event()], [value => checkMessage('ResultReceipt', value).verdict === 'VALID',receipt]]) {
    assert.equal(check(value), true); assert.equal(check({ ...value, schemaVersion: '1' }), false);
  }
});
test('C3 필수 관측 누락·추가 필드·잘못된 조합을 거부한다', () => {
  for (const field of ['ownCommitObservation','observedOwnCommitCount','collectionLimitNotes']) { const value = result(); delete value[field]; assert.equal(validator.result(value), false); }
  for (const change of [{ unknown: true }, { ownCommitObservation: 'FOUND', observedOwnCommitCount: null }, { ownCommitObservation: 'NONE', observedOwnCommitCount: 0 }, { observedOwnCommitCount: 0 }]) assert.equal(validator.result(result(change)), false);
});
test('C3 NONE의 정상 0개와 FOUND·UNKNOWN을 동등하게 검증한다', () => {
  assert.equal(validator.result(result({ ownCommitObservation:'NONE', observedOwnCommitCount:0, outcome:'EMPTY', candidates:[] })),true);
  assert.equal(validator.result(result({ ownCommitObservation:'FOUND', observedOwnCommitCount:3 })),true);
  assert.equal(validator.result(result({ collectionLimitNotes:['조회 제한'] })),true);
});
test('C3 DB 동의 사본과 큐의 네 칸 범위를 별도로 검증한다', () => {
  const row = pending(); const built = buildRequestMessage(row, validator); assert.ok(built.message);
  assert.equal(built.message.allowedScope.selectionReference,row.attemptId); assert.equal(built.message.credentialContextReference,row.attemptId);
  assert.equal(Object.hasOwn(built.message.allowedScope,'repository'),false); assert.equal(readRegistrationScope(built.message.allowedScope),null);
  assert.equal(validator.request({ ...built.message, allowedScope: row.consentedScope }),false);
});
test('C3 등록 소유 참조가 다른 사본·확장된 범위는 dispatch 전에 거부한다', () => {
  const row = pending(); assert.deepEqual(buildRequestMessage({ ...row,registrationId:randomUUID() },validator),{skip:'CONSENT_SCOPE_MISMATCH'});
  assert.deepEqual(buildRequestMessage({ ...row,consentedScope:{...row.consentedScope,token:'secret'} },validator),{skip:'CONSENT_SCOPE_INVALID'});
});
function managerFor(row, missing) { return { queryRunner:{isTransactionActive:true}, async findOne(entity) { if(entity.name===missing)return null; return entity.name==='RepositoryRegistration' ? {owner:'renamed-owner',name:'renamed-repo'} : {}; }, async findOneBy(entity) { if(entity.name===missing)return null; return entity.name==='AllowedScopeRevision' ? {wholeRepository:true,allowedResourceTypes:['COMMIT']} : {}; } }; }
test('C3 worker 좌표는 현재 등록 표시명이 아니라 요청 당시 사본에서 복원한다',async()=>{
  const row=pending(), source=new RegistrationContextSource();
  const resolved=await source.resolve(managerFor(row),row,{lock:'pessimistic_read'});
  assert.deepEqual(resolved.repository,{owner:'owner',name:'repo'});
  assert.equal(JSON.stringify(resolved).includes('credential'),false);
});
test('C3 삭제된 회원·등록·요청이나 빠진 범위 정의는 컨텍스트를 주지 않는다',async()=>{
  const row=pending(),source=new RegistrationContextSource();
  for(const entity of ['MemberAccount','RepositoryRegistration','AnalysisRequest','AllowedScopeRevision']) assert.equal(await source.resolve(managerFor(row,entity),row,{lock:null}),null);
});
test('C3 잘못된 좌표·불변 범위와 트랜잭션 없는 잠금 조회를 거부한다',async()=>{
  const row=pending(),source=new RegistrationContextSource(); row.consentedScope.repository.url='https://evil.invalid';
  assert.equal(await source.resolve(managerFor(row),row,{lock:null}),null);
  await assert.rejects(source.resolve({queryRunner:null},row,{lock:'pessimistic_read'}),/transaction/);
});
