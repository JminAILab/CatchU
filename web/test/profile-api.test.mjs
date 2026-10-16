import assert from 'node:assert/strict';
import { test } from 'node:test';
import { profileErrors, readProfile, saveProfile } from '../src/features/profile/profile-api.ts';
const empty = { displayName: '회원', introduction: '', desiredRole: '', skills: [] };
test('표시 이름 trim·필수·코드 포인트 50/51 경계', () => {
  assert.deepEqual(profileErrors({ ...empty, displayName: ` ${'😀'.repeat(50)} ` }), []);
  assert.equal(profileErrors({ ...empty, displayName: '😀'.repeat(51) }).length, 1);
  assert.equal(profileErrors({ ...empty, displayName: '  ' }).length, 1);
});
for (const [field, max] of [['introduction', 200], ['desiredRole', 100]]) {
  test(`${field} 코드 포인트 경계와 선택 빈 값`, () => {
    assert.deepEqual(profileErrors({ ...empty, [field]: '😀'.repeat(max) }), []);
    assert.equal(profileErrors({ ...empty, [field]: '😀'.repeat(max + 1) }).length, 1);
  });
}
test('기술 20/21개·50/51자 경계, 중복·빈 항목을 임의 보정하지 않음', () => {
  assert.deepEqual(profileErrors({ ...empty, skills: Array(20).fill('😀'.repeat(50)) }), []);
  assert.equal(profileErrors({ ...empty, skills: Array(21).fill('x') }).length, 1);
  assert.equal(profileErrors({ ...empty, skills: ['😀'.repeat(51)] }).length, 1);
  assert.deepEqual(profileErrors({ ...empty, skills: ['', 'x', 'x'] }), []);
});
test('모든 필드 NUL·고립 서로게이트 거부', () => {
  for (const value of ['\u0000', '\uD800']) {
    for (const key of ['displayName', 'introduction', 'desiredRole']) assert.ok(profileErrors({ ...empty, [key]: value }).length);
    assert.ok(profileErrors({ ...empty, skills: [value] }).length);
  }
});
test('저장은 네 필드를 보내며 이름만 trim하고 원본 입력을 보존', async () => {
  const profile = { displayName: ' 회원 ', introduction: ' 소개 ', desiredRole: ' 직무 ', skills: [' x ', ' x ', ''] };
  const original = structuredClone(profile);
  const api = { member: async (path, options) => {
    assert.equal(path, '/me/profile'); assert.equal(options.method, 'PUT');
    assert.deepEqual(options.body, { ...profile, displayName: '회원' });
    return { kind: 'success', status: 200, data: options.body };
  } };
  assert.equal(await saveProfile(api, profile), true);
  assert.deepEqual(profile, original);
});
test('저장 오류와 잘못된 성공 응답을 저장 성공으로 보지 않는다', async () => {
  for (const result of [{kind:'lookup-failed'}, {kind:'api-error',status:500}, {kind:'success',data:{}}, {kind:'success',data:{...empty,displayName:''}}]) {
    assert.equal(await saveProfile({ member: async () => result }, empty), false);
  }
});
test('회원 재조회는 전체 프로필을 읽고 실패를 빈 초기값으로 바꾸지 않는다', async () => {
  assert.deepEqual(await readProfile({ member: async () => ({kind:'success',data:{profile:empty}}) }), empty);
  assert.equal(await readProfile({ member: async () => ({kind:'success',data:{profile:{displayName:''}}}) }), null);
  assert.equal(await readProfile({ member: async () => ({kind:'lookup-failed'}) }), null);
});

// 화면이 사용하는 저장 완료 흐름을 직접 검사한다.
const { completeProfileSetup } = await import('../src/features/profile/profile-api.ts');
test('PUT 성공 후 GET 실패 시 저장 완료를 기억하고 재시도는 GET만 보낸다', async () => {
  let saved = false; let reads = 0; const calls = [];
  const api = { member: async (path, options) => {
    calls.push(options?.method || 'GET');
    if (path === '/me/profile') return {kind:'success', data:empty};
    return ++reads === 1 ? {kind:'lookup-failed'} : {kind:'success', data:{profile:empty}};
  }};
  const options = () => ({alreadySaved:saved,onSaved:()=>{saved=true;},isCurrent:()=>true});
  assert.equal(await completeProfileSetup(api,empty,options()),'refresh-failed');
  assert.equal(saved,true);
  assert.equal(await completeProfileSetup(api,empty,options()),'ready');
  assert.deepEqual(calls,['PUT','GET','GET']);
});
test('저장 실패는 재조회·성공 콜백 없이 입력을 보존한다', async () => {
  const input=structuredClone(empty); let called=0;
  const result=await completeProfileSetup({member:async()=>{called++;return {kind:'api-error',status:500};}}, input,
    {alreadySaved:false,onSaved:()=>assert.fail('저장 실패'),isCurrent:()=>true});
  assert.equal(result,'save-failed'); assert.equal(called,1); assert.deepEqual(input,empty);
});
test('PUT 응답 전에 세션 변경 시 재조회와 완료 처리를 중단한다', async () => {
  let current=true; let count=0;
  const result=await completeProfileSetup({member:async()=>{count++;current=false;return {kind:'success',data:empty};}},empty,
    {alreadySaved:false,onSaved:()=>assert.fail('이전 세션'),isCurrent:()=>current});
  assert.equal(result,'cancelled'); assert.equal(count,1);
});
test('저장 뒤 빈 이름·조회 예외는 홈 이동 가능한 결과가 아니다', async () => {
  for (const member of [async()=>({kind:'success',data:{profile:{...empty,displayName:''}}}),async()=>{throw new Error('offline');}]) {
    assert.equal(await completeProfileSetup({member},empty,{alreadySaved:true,onSaved:()=>{},isCurrent:()=>true}),'refresh-failed');
  }
});
