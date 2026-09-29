import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // next dev가 web/에 AGENTS.md·CLAUDE.md를 만들어 AI 규칙에 끼어들지 않게 한다. 판본 문서 안내는 README 「작업 규칙」.
  agentRules: false,
};

export default nextConfig;
