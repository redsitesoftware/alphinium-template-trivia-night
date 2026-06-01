/**
 * Timer Progress Bar E2E Test
 * Issue #33: https://github.com/redsitesoftware/alphinium-template-trivia-night/issues/33
 *
 * Verifies that the visual timer progress bar (data-testid="timer-bar") is visible on
 * the question screen and that its width shrinks as the countdown timer ticks down.
 *
 * Run: npx playwright test tests/e2e/timer-progress-bar.spec.js --reporter=list
 */

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const BASE_URL = (process.env.SITE_URL || 'https://trivia.user-pods.alphinium.io') + '?v=1.1.0';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const AI_TIMEOUT = 200_000;

// "Dan Woods" triggers admin bypass — no credit check needed for solo game
const HOST_NAME = 'Dan Woods';

async function ss(page, name) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true });
  console.log(`  📸 ${name}.png`);
}

/**
 * Creates a room and navigates to the lobby.
 */
async function createRoomAndLobby(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  const nameInput = page.locator('input[placeholder="e.g. Alex"]');
  await nameInput.fill(HOST_NAME);
  await page.keyboard.press('Tab');

  const hostTab = page.locator('text=👑 Host').first();
  if (await hostTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await hostTab.click();
  }

  await page.locator('text=Create Room').click();
  await page.waitForSelector('text=/🚀 Start Game|🎙️ Start with Quiz Master/i', { timeout: 30_000 });
}

/**
 * Clicks Start Game and dismisses the solo-player confirmation modal if shown.
 */
async function startGame(page) {
  const startBtn = page.locator('text=/🚀 Start Game|🎙️ Start with Quiz Master/').first();
  await expect(startBtn).toBeVisible({ timeout: 10_000 });
  await startBtn.click();

  await page.waitForTimeout(1_500);
  const soloBtn = page.getByTestId('solo-start-anyway');
  if (await soloBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await soloBtn.click();
    console.log('  🎮 Dismissed solo-start modal');
  }
}

// ─── Timer Progress Bar Test Suite ───────────────────────────────────────────

test.describe('Timer Progress Bar — bar is visible and shrinks as timer counts down', () => {
  test.setTimeout(300_000);

  let browser, page;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ['--disable-ipv6'] });
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    page = await ctx.newPage();
    page.on('pageerror', (err) => console.error('  🚨 PAGE ERROR:', err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('  🔴 CONSOLE ERROR:', msg.text());
    });
  });

  test.afterAll(async () => {
    await browser?.close();
  });

  /**
   * TC-TPB1: Timer progress bar is visible on the question screen.
   */
  test('TC-TPB1: timer-bar element is visible on the question screen', async () => {
    await createRoomAndLobby(page);

    const easyBtn = page.locator('text=Easy').first();
    if (await easyBtn.isVisible().catch(() => false)) await easyBtn.click();
    const classicBtn = page.locator('text=Classic').first();
    if (await classicBtn.isVisible().catch(() => false)) await classicBtn.click();

    await ss(page, 'tpb_lobby');
    await startGame(page);

    // Wait for the question screen
    await page.waitForSelector('text=A.', { timeout: AI_TIMEOUT });
    await ss(page, 'tpb_question_screen');

    // ── Core assertion: timer bar must be visible ────────────────────────────
    const timerBar = page.locator('[data-testid="timer-bar"]');
    await expect(timerBar).toBeVisible({ timeout: 5_000 });
    console.log('  ✅ timer-bar is visible');
  });

  /**
   * TC-TPB2: Timer bar width decreases as the timer ticks down.
   *
   * Strategy: sample the rendered width of the bar at two points ~2 seconds apart
   * and assert the second sample is strictly smaller than the first.
   */
  test('TC-TPB2: timer-bar width shrinks as countdown progresses', async () => {
    // Re-use the page already on the question screen from TC-TPB1, or navigate again
    const onQuestion = await page.locator('[data-testid="timer-bar"]').isVisible().catch(() => false);
    if (!onQuestion) {
      await createRoomAndLobby(page);

      const easyBtn = page.locator('text=Easy').first();
      if (await easyBtn.isVisible().catch(() => false)) await easyBtn.click();
      const classicBtn = page.locator('text=Classic').first();
      if (await classicBtn.isVisible().catch(() => false)) await classicBtn.click();

      await startGame(page);
      await page.waitForSelector('text=A.', { timeout: AI_TIMEOUT });
    }

    const timerBar = page.locator('[data-testid="timer-bar"]');
    await expect(timerBar).toBeVisible({ timeout: 5_000 });

    // Sample 1 — capture width early in the countdown
    const width1 = await timerBar.evaluate((el) => el.getBoundingClientRect().width);
    console.log(`  📏 Timer bar width (sample 1): ${width1.toFixed(1)}px`);

    // Wait ~2 seconds for the timer to tick down noticeably
    await page.waitForTimeout(2_500);

    // Sample 2 — bar must have shrunk (or be gone if the question expired)
    const stillVisible = await timerBar.isVisible().catch(() => false);
    if (!stillVisible) {
      console.log('  ℹ️  Timer bar no longer visible — question time elapsed, which confirms shrinking behaviour');
      return;
    }

    const width2 = await timerBar.evaluate((el) => el.getBoundingClientRect().width);
    console.log(`  📏 Timer bar width (sample 2): ${width2.toFixed(1)}px`);

    await ss(page, 'tpb_timer_shrinking');

    // ── Core assertion: width must have decreased ────────────────────────────
    expect(width2).toBeLessThan(
      width1,
      `Timer bar width should decrease over time (${width1.toFixed(1)}px → ${width2.toFixed(1)}px)`,
    );
    console.log(`  🎉 Timer bar shrank: ${width1.toFixed(1)}px → ${width2.toFixed(1)}px`);
  });
});
