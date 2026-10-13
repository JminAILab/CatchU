require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Logger } = require('@nestjs/common');
const { ApiError, ERROR_STATUS } = require('../dist/common/errors');
const { writeErrorResponse } = require('../dist/common/errors/api-exception.filter');

// 공통 필터의 기록 정책만 검사한다. 실제 unlock 판정·HTTP·DB 검사는 별도 단계다.
function record(t, code) {
  const logs = [];
  Logger.overrideLogger(Object.fromEntries(['log', 'warn', 'error', 'debug', 'verbose', 'fatal']
    .map(level => [level, (...args) => logs.push({ level, args })])));
  t.after(() => Logger.overrideLogger(false));
  const response = {};
  const adapter = {
    setHeader() {},
    reply(target, body, status) { Object.assign(target, { body, status }); },
  };
  writeErrorResponse(adapter, { method: 'POST', route: { path: '/v1/public/links/:token/unlock' } }, response, new ApiError(code));
  assert.equal(response.status, ERROR_STATUS[code]);
  assert.equal(response.body.code, code);
  return logs;
}

for (const code of ['AUTH_INVALID', 'LINK_PASSWORD_INVALID', 'LINK_UNLOCK_LIMITED']) {
  test(`${code}: 보안 사건 경고를 정확히 한 줄 기록한다`, t => {
    const logs = record(t, code);
    assert.equal(logs.length, 1, '다른 로거와 중복 기록하지 않는다');
    assert.equal(logs[0].level, 'warn');
    assert.equal(logs[0].args.at(-1), 'SecurityEvent');
    assert.ok(logs[0].args[0].startsWith(`${code} POST /v1/public/links/:token/unlock `));
    assert.equal(logs[0].args[0].split('\n').length, 1);
  });
}

// #222 범위 밖인 모든 업무 4xx도 제외한다. 발급 RATE_LIMITED 역시 보안 사건이 아니다.
for (const [code, status] of Object.entries(ERROR_STATUS)) {
  if (status >= 500 || ['AUTH_INVALID', 'LINK_PASSWORD_INVALID', 'LINK_UNLOCK_LIMITED'].includes(code)) continue;
  test(`${code}: 보안 사건·업무 거부 로그를 남기지 않는다`, t => {
    assert.deepEqual(record(t, code), []);
  });
}

// 합성 표식만 사용한다. 실제 자격정보·사용자 자료는 읽지 않는다.
for (const code of ['AUTH_INVALID', 'LINK_PASSWORD_INVALID', 'LINK_UNLOCK_LIMITED']) {
  for (const matched of [true, false]) {
    test(`${code}: ${matched ? '등록 경로' : '미등록 경로'} 로그에서 민감정보를 제외한다`, t => {
      const logs = [];
      Logger.overrideLogger(Object.fromEntries(['log', 'warn', 'error', 'debug', 'verbose', 'fatal']
        .map(level => [level, (...args) => logs.push({ level, args })])));
      t.after(() => Logger.overrideLogger(false));
      const secrets = {
        token: 'synthetic-link-token-222', password: 'synthetic-password-222\r\nFAKE_LOG_LINE',
        authorization: 'Bearer synthetic-member-token-222', cookie: 'synthetic-cookie-222',
        grant: 'synthetic-grant-222', query: 'synthetic-query-222',
        clientId: 'synthetic-client-request-id-222', message: 'synthetic-exception-message-222',
      };
      const request = {
        method: 'POST',
        ...(matched ? { route: { path: '/v1/public/links/:token/unlock' } } : {}),
        url: `/v1/public/links/${secrets.token}/unlock?secret=${secrets.query}`,
        originalUrl: `/v1/public/links/${secrets.token}/unlock?secret=${secrets.query}`,
        params: { token: secrets.token }, query: { secret: secrets.query },
        body: { password: secrets.password },
        headers: { authorization: secrets.authorization, cookie: secrets.cookie,
          'x-link-grant': secrets.grant, 'x-request-id': secrets.clientId },
        requestId: secrets.clientId,
      };
      const response = { headers: {} };
      const adapter = {
        setHeader(target, key, value) { target.headers[key] = value; },
        reply(target, body, status) { Object.assign(target, { body, status }); },
      };
      const error = new ApiError(code);
      // 예외 내부 원문도 로그에 남기지 않는다. 응답 문구의 계약 검사와는 구분한다.
      error.stack = secrets.message;
      error.cause = new Error(secrets.message);
      const before = Date.now();
      writeErrorResponse(adapter, request, response, error);
      const after = Date.now();
      assert.equal(logs.length, 1);
      assert.equal(logs[0].level, 'warn');
      assert.equal(logs[0].args.length, 2, '로그 인자에 객체를 추가하지 않는다');
      assert.equal(logs[0].args[1], 'SecurityEvent');
      const path = matched ? '/v1/public/links/:token/unlock' : '[unmatched]';
      const prefix = `${code} POST ${path} `;
      const line = logs[0].args[0];
      assert.ok(line.startsWith(prefix));
      const fields = /^requestId=([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}) at=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/.exec(line.slice(prefix.length));
      assert.ok(fields, '허용 필드만 한 줄에 기록한다');
      assert.ok(Date.parse(fields[2]) >= before && Date.parse(fields[2]) <= after);
      const allLogs = JSON.stringify(logs);
      for (const value of Object.values(secrets)) {
        assert.equal(allLogs.includes(value), false, '합성 민감정보 원문을 로그에 남기지 않는다');
        assert.equal(allLogs.includes(JSON.stringify(value).slice(1, -1)), false);
      }
      assert.equal(allLogs.includes('FAKE_LOG_LINE'), false, '개행으로 가짜 로그를 주입하지 못한다');
      assert.equal(JSON.stringify(response).includes(fields[1]), false, '서버 내부 식별자를 응답으로 내보내지 않는다');
    });
  }
}
