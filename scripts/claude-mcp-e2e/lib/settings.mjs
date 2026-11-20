// run.mjs가 시험 실행기에 넘기는 설정. 시험 파일을 run.mjs 없이 돌리면 여기서 멈춘다.

const KEYS = ['CATCHU_E2E_WEB_ORIGIN', 'CATCHU_E2E_MCP_URL', 'CATCHU_E2E_CALLBACK_PORT', 'CATCHU_E2E_RUN_ID'];

export function readSettings() {
  const missing = KEYS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`run.mjs가 넘기는 설정이 없습니다(${missing.join(', ')}). scripts/claude-mcp-e2e에서 npm run e2e로 실행하세요.`);
  }
  const callbackPort = Number(process.env.CATCHU_E2E_CALLBACK_PORT);
  return {
    webOrigin: process.env.CATCHU_E2E_WEB_ORIGIN,
    mcpUrl: process.env.CATCHU_E2E_MCP_URL,
    callbackPort,
    // api의 MCP_DEV_REDIRECT_URIS에 넣은 것과 같은 값이다(run.mjs).
    callbackUri: `http://127.0.0.1:${callbackPort}/oauth/callback`,
    runId: process.env.CATCHU_E2E_RUN_ID,
  };
}
