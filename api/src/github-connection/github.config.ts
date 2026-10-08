import { isAbsolute, resolve, parse } from 'node:path';

export const GITHUB_CONFIG = Symbol('GITHUB_CONFIG');
export type GitHubConfig = { enabled: false } | {
  enabled: true; clientId: string; clientSecret: string; callbackUrl: string;
  vaultDirectory: string; encryptionKey: Buffer;
};

/** 기능을 켠 경우에만 필수 설정을 요구한다. 오류에는 설정값을 넣지 않는다. */
export function readGitHubConfig(env: NodeJS.ProcessEnv = process.env): GitHubConfig {
  if (env.GITHUB_CONNECTION_ENABLED !== undefined && !['', 'false', 'true'].includes(env.GITHUB_CONNECTION_ENABLED)) {
    throw new Error('GITHUB_CONNECTION_ENABLED 설정 형식이 잘못되었습니다.');
  }
  if (env.GITHUB_CONNECTION_ENABLED !== 'true') return { enabled: false };
  const names = ['GITHUB_OAUTH_CLIENT_ID', 'GITHUB_OAUTH_CLIENT_SECRET', 'GITHUB_OAUTH_CALLBACK_URL',
    'GITHUB_CREDENTIAL_DIRECTORY', 'GITHUB_CREDENTIAL_ENCRYPTION_KEY'] as const;
  if (names.some(name => !env[name])) throw new Error('GitHub 연동 필수 설정이 누락되었습니다.');
  const clientId = env.GITHUB_OAUTH_CLIENT_ID!;
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET!;
  const key = env.GITHUB_CREDENTIAL_ENCRYPTION_KEY!;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(clientId) || !/^[!-~]{1,512}$/.test(clientSecret)
      || !/^[a-fA-F0-9]{64}$/.test(key) || [env.AUTH_JWT_SECRET, env.LINK_GRANT_SECRET].some(v => v?.toLowerCase() === key.toLowerCase())) {
    throw new Error('GitHub 연동 키 설정 형식이 잘못되었습니다.');
  }
  let callback: URL;
  try { callback = new URL(env.GITHUB_OAUTH_CALLBACK_URL!); } catch { throw new Error('GitHub 콜백 설정 형식이 잘못되었습니다.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname);
  if (callback.username || callback.password || callback.search || callback.hash
      || !(callback.protocol === 'https:' || (env.NODE_ENV !== 'production' && callback.protocol === 'http:' && loopback))) {
    throw new Error('GitHub 콜백 주소는 HTTPS여야 합니다(개발 시 loopback HTTP만 허용).');
  }
  const directory = env.GITHUB_CREDENTIAL_DIRECTORY!;
  if (!isAbsolute(directory) || resolve(directory) === parse(resolve(directory)).root) {
    throw new Error('GitHub 자격정보 보관 위치는 루트가 아닌 절대 경로여야 합니다.');
  }
  return { enabled: true, clientId, clientSecret, callbackUrl: callback.href,
    vaultDirectory: resolve(directory), encryptionKey: Buffer.from(key, 'hex') };
}
