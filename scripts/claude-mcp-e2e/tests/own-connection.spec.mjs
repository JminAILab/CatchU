// 흐름 가(본인 연결, U6). #594 완료 기준 「흐름 가」를 확인한다.
// 합성 Claude가 연결을 시작하고 회원이 승인 화면에서 승인하면 토큰을 받는다 → 그 토큰으로 list_my_catches·list_my_text_materials를
// 부르면 승인한 회원의 자료만 나온다 → 연결 관리 화면에서 전체 해제를 누르면 같은 토큰이 401이다. 승인 화면에서 취소하면 토큰이 나오지 않는다.
// Claude 자리는 공식 SDK로 만든 합성 MCP 클라이언트이며, 실제 Claude 연결의 증거가 아니다.
// Catch는 분석 결과로만 생기므로 승인한 회원과 다른 회원의 합성 Catch·텍스트 자료를 DB에 직접 넣는다(api 시험의 도우미와 같은 코드).
import { expect, test } from '@playwright/test';
import {
  connectWithSdk, devMemberId, insertAnalysisRequest, insertCatch, insertMember, insertTextMaterial, openTestDataSource, rpc, sdkClient,
  startSdkAuthorization, toolJson,
} from '../lib/api-support.mjs';
import { decideOnAuthorizeScreen, disconnectAll, signUp } from '../lib/browser.mjs';
import { redacting } from '../lib/redact.mjs';
import { readSettings } from '../lib/settings.mjs';

const settings = readSettings();

const step = (title, body) => test.step(title, () => redacting(body));

test('흐름 가: 승인 화면에서 취소하면 합성 Claude가 승인 코드를 받지 못하고 연결이 생기지 않는다', async ({ browser }) => {
  const run = settings.runId;
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    let started;
    let redirectTo;

    await step('회원이 개발용 로그인으로 가입한다', () =>
      signUp(page, settings.webOrigin, { identity: `e2e-own-deny-${run}`, displayName: '합성 취소 회원' }));

    await step('합성 Claude가 찾기·등록·승인 시작을 한다', async () => {
      started = await startSdkAuthorization(settings.mcpUrl, { redirectUri: settings.callbackUri });
    });

    await step('승인 화면에서 취소를 누른다', async () => {
      ({ redirectTo } = await decideOnAuthorizeScreen(page, { authorizationUrl: started.authorizationUrl, callbackPort: settings.callbackPort, decision: 'deny' }));
    });

    await step('돌아갈 주소로 거절(access_denied)과 보낸 state만 돌아오고 승인 코드는 없다', async () => {
      const returned = new URL(redirectTo).searchParams;
      expect(returned.has('code'), '돌아온 주소에 승인 코드가 없다').toBe(false);
      expect(returned.get('error') === 'access_denied', '거절(access_denied)로 돌아왔다').toBe(true);
      expect(returned.get('state') === started.state, '보낸 state가 그대로 돌아왔다').toBe(true);
    });

    await step('연결 관리 화면에서 연결이 없다고 보인다', async () => {
      await page.goto(`${settings.webOrigin}/profile/claude`);
      await expect(page.getByRole('heading', { level: 1, name: 'Claude 연결', exact: true })).toBeVisible();
      await expect(page.getByText('연결되어 있지 않습니다', { exact: true })).toBeVisible();
    });
  } finally {
    await context.close();
  }
});

test('흐름 가: 화면에서 승인하면 합성 Claude가 토큰을 받고, 승인한 회원의 자료만 읽으며, 전체 해제 뒤 같은 토큰은 401이다', async ({ browser }) => {
  const run = settings.runId;
  const identity = `e2e-own-approve-${run}`;
  const context = await browser.newContext();
  let db;
  let client;
  try {
    const page = await context.newPage();
    let seeded;
    let accessToken;

    await step('회원 A가 개발용 로그인으로 가입한다', () =>
      signUp(page, settings.webOrigin, { identity, displayName: '합성 회원 A' }));

    await step('DB에 A와 다른 회원 B의 합성 Catch·텍스트 자료를 하나씩 넣는다', async () => {
      db = await openTestDataSource();
      const seed = async (memberId, label) => {
        const requestId = await insertAnalysisRequest(db, memberId);
        return {
          catchId: await insertCatch(db, memberId, requestId, { title: `[합성] ${label}의 Catch ${run}` }),
          materialId: await insertTextMaterial(db, memberId, { title: `[합성] ${label}의 자료 ${run}`, body: `[합성] ${label}의 본문 ${run}` }),
        };
      };
      seeded = { a: await seed(await devMemberId(db, identity), 'A'), b: await seed(await insertMember(db), 'B') };
    });

    await step('합성 Claude가 연결을 시작하고 A가 승인 화면에서 「동의하고 승인」을 누르면 토큰을 받는다', async () => {
      const connection = await connectWithSdk({ mcpUrl: settings.mcpUrl }, null, {
        redirectUri: settings.callbackUri,
        authorize: ({ authorizationUrl }) => decideOnAuthorizeScreen(page, { authorizationUrl, callbackPort: settings.callbackPort, decision: 'approve' }),
      });
      accessToken = connection.tokens.access_token;
      expect(typeof accessToken === 'string' && accessToken.length > 0, '합성 Claude가 접근 토큰을 받았다').toBe(true);
    });

    await step('그 토큰으로 list_my_catches·list_my_text_materials를 부르면 A의 자료만 나오고 B의 자료는 없다', async () => {
      client = await sdkClient({ mcpUrl: settings.mcpUrl }, accessToken);
      const catches = toolJson(await client.callTool({ name: 'list_my_catches', arguments: {} }), 'list_my_catches').catches.map((item) => item.catchId);
      expect(catches, '나온 Catch는 A의 것 하나뿐이다').toEqual([seeded.a.catchId]);
      expect(catches.includes(seeded.b.catchId), 'B의 Catch가 없다').toBe(false);
      const materials = toolJson(await client.callTool({ name: 'list_my_text_materials', arguments: {} }), 'list_my_text_materials')
        .materials.map((item) => item.textMaterialId);
      expect(materials, '나온 텍스트 자료는 A의 것 하나뿐이다').toEqual([seeded.a.materialId]);
      expect(materials.includes(seeded.b.materialId), 'B의 텍스트 자료가 없다').toBe(false);
    });

    await step('A가 연결 관리 화면에서 전체 연결 해제를 누른다', () => disconnectAll(page, settings.webOrigin));

    await step('해제 뒤 같은 토큰으로 MCP를 부르면 401이다', async () => {
      // 합성 Claude가 다음 요청을 보내는 것과 같은 머리글로 부른다(api 시험 mcp-connection.test.cjs S17과 같은 확인).
      const response = await fetch(settings.mcpUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify(rpc('tools/list')),
        signal: AbortSignal.timeout(15_000),
      });
      await response.arrayBuffer();
      expect(response.status, '해제 뒤 같은 토큰은 401이다').toBe(401);
    });
  } finally {
    await client?.close().catch(() => {});
    await db?.destroy();
    await context.close();
  }
});
