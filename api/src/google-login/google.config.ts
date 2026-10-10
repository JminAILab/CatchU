export interface GoogleConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export const GOOGLE_CONFIG = Symbol('GOOGLE_CONFIG');

export function readGoogleConfig(env: NodeJS.ProcessEnv = process.env): GoogleConfig {
  if (env.GOOGLE_LOGIN_ENABLED !== undefined && !['', 'true', 'false'].includes(env.GOOGLE_LOGIN_ENABLED)) {
    throw new Error('GOOGLE_LOGIN_ENABLED must be true or false');
  }
  if (env.GOOGLE_LOGIN_ENABLED !== 'true') {
    return { enabled: false, clientId: '', clientSecret: '', redirectUri: '' };
  }
  const clientId = env.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET ?? '';
  if (!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    throw new Error('GOOGLE_CLIENT_ID is required for Google login');
  }
  if (!clientSecret || clientSecret.trim() !== clientSecret ||
      Array.from(clientSecret).some(char => /\s/u.test(char) || char.codePointAt(0)! < 32 || char.codePointAt(0) === 127)) {
    throw new Error('GOOGLE_CLIENT_SECRET is required for Google login');
  }
  let redirect: URL;
  try { redirect = new URL(env.GOOGLE_REDIRECT_URI ?? ''); }
  catch { throw new Error('GOOGLE_REDIRECT_URI must be an absolute callback URL'); }
  const localHttp = ['development', 'test'].includes(env.NODE_ENV ?? '') &&
    redirect.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(redirect.hostname);
  if ((!localHttp && redirect.protocol !== 'https:') || redirect.username || redirect.password ||
      redirect.search || redirect.hash || redirect.href !== env.GOOGLE_REDIRECT_URI) {
    throw new Error('GOOGLE_REDIRECT_URI must be HTTPS (loopback HTTP only in development/test), without query or fragment');
  }
  return { enabled: true, clientId, clientSecret, redirectUri: redirect.href };
}
