// 명시 실행 전용: 격리 PostgreSQL 필요. 기본 web 단위 테스트에는 포함하지 않는다.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApiClient } from '../src/lib/api-client.ts';
import { createAccessTokenStore } from '../src/lib/access-token.ts';
import { readProfile, saveProfile, completeProfileSetup, updateProfile } from '../src/features/profile/profile-api.ts';
import { lookupMember } from '../src/lib/member-lookup.ts';
import { decideMemberEntry } from '../src/lib/member-navigation.ts';
const require = createRequire(new URL('../../api/package.json', import.meta.url));
require('reflect-metadata');
Object.assign(process.env, { NODE_ENV:'test', DEV_LOGIN_ENABLED:'true', AUTH_JWT_SECRET:randomBytes(32).toString('hex'), AUTH_ACCESS_TOKEN_TTL_SECONDS:'900', LINK_GRANT_SECRET:randomBytes(32).toString('hex'), SHARE_LINK_WEB_BASE_URL:'https://catchu.example', DB_HOST:'127.0.0.1', DB_PORT:process.env.TEST_DB_PORT || '55137', DB_USER:'catchu', DB_PASSWORD:'catchu_local', DB_NAME:'catchu_issue137_test' });
const db = require('./dist/database/data-source').default;
let app;
try {
  await db.initialize(); await db.runMigrations();
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('./dist/app.module');
  const { configureApp } = require('./dist/app.setup');
  app = await configureApp(await NestFactory.create(AppModule, {logger:false, abortOnError:false}));
  await app.listen(0,'127.0.0.1');
  const tokens = createAccessTokenStore();
  const api = createApiClient({baseUrl:await app.getUrl(),nodeEnv:'test',tokens});
  assert.equal((await api.devLogin(`profile-http-${randomUUID()}`)).kind,'success');
  const before = await readProfile(api);
  assert.equal(before.displayName,'');
  assert.deepEqual(decideMemberEntry(await lookupMember(api),'/home'),{action:'redirect',to:'/profile/setup'});
  assert.deepEqual(decideMemberEntry(await lookupMember(api),'/profile/setup'),{action:'allow'});
  const profile = {displayName:' 검증😀 ',introduction:' 소개 ',desiredRole:'개발',skills:['TypeScript','😀']};
  assert.equal(await completeProfileSetup(api,profile,{alreadySaved:false,onSaved:()=>{},isCurrent:()=>true}),'ready');
  assert.deepEqual(await readProfile(api),{...profile,displayName:'검증😀'});
  assert.deepEqual(decideMemberEntry(await lookupMember(api),'/home'),{action:'allow'});
  // 이름이 저장된 뒤에는 최초 입력 화면을 다시 열지 않는다(#261 리뷰).
  assert.deepEqual(decideMemberEntry(await lookupMember(api),'/profile/setup'),{action:'redirect',to:'/home'});
  assert.equal(await saveProfile(api,{...profile,displayName:' '}),false);
  assert.deepEqual(await readProfile(api),{...profile,displayName:'검증😀'});
  // 기존 프로필 수정(#137): 상세가 읽은 값을 수정 화면이 PUT으로 저장하고, 실패는 기존 값을 바꾸지 않는다.
  const edited = {displayName:' 수정됨 ',introduction:'새 소개',desiredRole:'',skills:['Nest','']};
  assert.equal(await updateProfile(api,edited,{isCurrent:()=>true}),'saved');
  const afterEdit = await readProfile(api);
  assert.deepEqual(afterEdit,{...edited,displayName:'수정됨'});
  assert.deepEqual(decideMemberEntry(await lookupMember(api),'/profile/edit'),{action:'allow'});
  assert.equal(await updateProfile(api,{...edited,displayName:'  '},{isCurrent:()=>true}),'save-failed');
  assert.equal(await updateProfile(api,{...edited,skills:Array(21).fill('x')},{isCurrent:()=>true}),'save-failed');
  assert.deepEqual(await readProfile(api),afterEdit);
  // 다른 회원의 토큰으로는 위 프로필이 보이지 않고, 수정도 그 회원의 프로필에만 적용된다.
  const otherTokens = createAccessTokenStore();
  const other = createApiClient({baseUrl:await app.getUrl(),nodeEnv:'test',tokens:otherTokens});
  assert.equal((await other.devLogin(`profile-http-${randomUUID()}`)).kind,'success');
  assert.equal((await readProfile(other)).displayName,'');
  assert.equal(await updateProfile(other,{...edited,displayName:'다른 회원'},{isCurrent:()=>true}),'saved');
  assert.deepEqual(await readProfile(api),afterEdit);
  console.log('PASS: 실제 web API 함수 → HTTP → PostgreSQL: 초기 진입, 4필드 저장, 재조회, 홈 허용, 저장 후 조회한 회원 정보로 최초 입력 재진입 시 리디렉션 판정, 빈 이름 거부·기존 값 보존, 기존 프로필 수정 저장·재조회·잘못된 입력 거부 시 기존 값 보존·다른 회원 프로필 분리');
} finally { await app?.close(); if(db.isInitialized) await db.destroy(); }
