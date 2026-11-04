// Playwright · pruebas de extremo a extremo de la web contra dev_server.py, que manda las
// MISMAS cabeceras que producción (CSP con Trusted Types incluida) y sirve los fixtures.
// En local usa el Chrome instalado; en CI, el Chromium de Playwright. El globo necesita WebGL:
// SwiftShader lo da por software en máquinas sin GPU.
import { defineConfig } from '@playwright/test';

const PORT = 8766;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './specs',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: CI ? 2 : 4,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [['list'], ['github'], ['html', { open: 'never', outputFolder: '../../playwright-report' }]] : 'list',
  outputDir: '../../test-results',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: CI || process.env.PWCHROMIUM ? undefined : 'chrome',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
    trace: CI ? 'retain-on-failure' : 'off',
  },
  webServer: {
    command: `${CI ? 'python3' : 'python'} ../../scripts/dev_server.py --port ${PORT} --dev --quiet`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !CI,
    timeout: 30_000,
  },
});
