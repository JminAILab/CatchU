/**
 * NODE_ENV가 정확히 development·test인지. 개발 편의로 보안 조건을 늦추는 설정(http 주소 등)은 이때만 허용한다.
 * 값이 없거나 다른 값이면 판정할 수 없으므로 production과 같이 다룬다(docs/CatchU_security_checks.md 「설정·개발용 기능」).
 */
export function isDevelopmentOrTest(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
}
