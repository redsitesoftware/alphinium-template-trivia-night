// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  reporter: [['list'], ['html', { outputFolder: 'tests/e2e/report', open: 'never' }]],
  projects: [
    {
      // Main Valerie E2E suite — uses Playwright's Chromium (fast, headless-friendly)
      name: 'valerie',
      testMatch: 'valerie.spec.js',
      use: {
        baseURL: process.env.SITE_URL || 'https://trivia.user-pods.alphinium.io',
        ignoreHTTPSErrors: true,
        video: 'retain-on-failure',
        screenshot: 'only-on-failure',
        launchOptions: {
          args: ['--disable-ipv6'],
        },
      },
    },
    {
      // Score animation E2E test (issue #30) — Chromium headless
      name: 'score-animation',
      testMatch: 'score-animation.spec.js',
      use: {
        baseURL: process.env.SITE_URL || 'https://trivia.user-pods.alphinium.io',
        ignoreHTTPSErrors: true,
        video: 'retain-on-failure',
        screenshot: 'only-on-failure',
        launchOptions: {
          args: ['--disable-ipv6'],
        },
      },
    },
    {
      // Timer progress bar E2E test (issue #33) — Chromium headless
      name: 'timer-progress-bar',
      testMatch: 'timer-progress-bar.spec.js',
      use: {
        baseURL: process.env.SITE_URL || 'https://trivia.user-pods.alphinium.io',
        ignoreHTTPSErrors: true,
        video: 'retain-on-failure',
        screenshot: 'only-on-failure',
        launchOptions: {
          args: ['--disable-ipv6'],
        },
      },
    },
    {
      // Admin/setup scripts that need real Chrome to pass Google login
      name: 'admin-chrome',
      testMatch: 'setup-*.spec.js',
      use: {
        channel: 'chrome', // Uses installed Chrome — trusted by Google OAuth
        headless: false,
        launchOptions: {
          args: ['--no-first-run', '--no-default-browser-check'],
        },
      },
    },
  ],
  // Run test suites in sequence (games need isolated rooms)
  workers: 1,
});
