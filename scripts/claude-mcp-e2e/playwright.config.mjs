// #594 합성 E2E의 Playwright 설정. run.mjs가 서버를 띄운 뒤 이 설정으로 시험을 돌린다.
// 화면 캡처·영상·trace를 끄고, 결과 폴더는 저장소 밖 임시 폴더에 둔다. 보고는 시험·단계 이름만 찍는 list다.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: join(tmpdir(), 'catchu-claude-mcp-e2e-results'),
  reporter: [['list', { printSteps: true }]],
  // 두 흐름이 같은 돌아갈 주소(포트 하나)를 쓰므로 한 번에 하나씩 돈다. 다시 돌려 통과시키지 않는다.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    browserName: 'chromium',
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
});
