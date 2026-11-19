// api 시험 도우미를 이 시험에서 그대로 쓴다. 합성 Claude(api/test/claude-mcp/support.cjs)와 시험 DB 접속·합성 자료 넣기가
// api 시험과 같은 코드라서, 한쪽만 바뀌어 어긋나는 일이 없다. 불러오려면 api가 빌드돼 있어야 한다(run.mjs가 먼저 빌드한다).
// 공식 MCP SDK(@modelcontextprotocol/sdk)·TypeORM은 api/node_modules의 것을 쓴다. 이 폴더에는 따로 설치하지 않는다.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'api');
const require = createRequire(join(apiDir, 'package.json'));

const claude = require(join(apiDir, 'test', 'claude-mcp', 'support.cjs'));
const { openTestDataSource } = require(join(apiDir, 'test', 'support', 'test-database.cjs'));
const { insertMember } = require(join(apiDir, 'test', 'u2', 'support.cjs'));
const { DEV_LOGIN_IDENTITY_PREFIX } = require(join(apiDir, 'dist', 'member-analysis', 'member-kind.js'));

export const { startSdkAuthorization, connectWithSdk, sdkClient, insertAnalysisRequest, insertCatch, insertTextMaterial, rpc } = claude;
export { openTestDataSource, insertMember };

/** 개발용 로그인이 만든 회원의 ID를 DB에서 읽는다. 읽기만 하고 회원을 만들지 않는다. */
export async function devMemberId(db, identity) {
  const rows = await db.query('SELECT member_id AS "memberId" FROM member_account WHERE identity_reference = $1',
    [DEV_LOGIN_IDENTITY_PREFIX + identity]);
  if (rows.length !== 1) throw new Error('개발용 로그인으로 만든 회원을 DB에서 찾지 못했습니다.');
  return rows[0].memberId;
}

/** 도구 응답의 글을 잇는다. */
export function toolText(result) {
  return (result.content ?? []).filter((part) => part.type === 'text').map((part) => part.text).join('\n');
}

/** 정상 도구 응답의 JSON. 도구 오류면 응답 글을 싣지 않고 실패한다. */
export function toolJson(result, toolName) {
  if (result.isError === true) throw new Error(`${toolName}이 도구 오류로 돌아왔습니다.`);
  return JSON.parse(toolText(result));
}

/** 도구 오류 응답의 오류 코드. 정상 응답이면 null이다. */
export function toolErrorCode(result) {
  if (result.isError !== true) return null;
  try {
    return JSON.parse(toolText(result)).error ?? null;
  } catch {
    return null;
  }
}
