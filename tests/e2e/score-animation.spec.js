/**
 * Score Animation E2E Test
 * Issue #30: https://github.com/redsitesoftware/alphinium-template-trivia-night/issues/30
 *
 * Verifies that a floating "+N pts" score animation element (data-testid="score-animation")
 * appears whenever a player selects the correct answer during a Classic mode trivia game.
 *
 * Depends on: Issue #29 (Frontend: Add floating score animation)
 *
 * Run: npx playwright test tests/e2e/score-animation.spec.js --reporter=list
 */

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const BASE_URL = (process.env.SITE_URL || 'https://trivia.user-pods.alphinium.io') + '?v=1.1.0';
const WS_URL = (process.env.SITE_URL || 'https://trivia.user-pods.alphinium.io')
  .replace(/^https?:\/\//, (m) => (m === 'https://' ? 'wss://' : 'ws://'));
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const AI_TIMEOUT = 200_000;

/**
 * Verifies the WebSocket server is reachable before attempting a full game flow.
 * Returns an error message string if unreachable, or null if the connection succeeds.
 */
async function checkWebSocketConnectivity() {
  return new Promise((resolve) => {
    const WebSocket = require('ws');
    const ws = new WebSocket(WS_URL, { rejectUnauthorized: false });
    const timer = setTimeout(() => {
      ws.terminate();
      resolve(`WebSocket connection timed out after 10s (url: ${WS_URL})`);
    }, 10_000);

    ws.on('open', () => {
      clearTimeout(timer);
      ws.close();
      resolve(null);
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      resolve(`WebSocket connection error: ${err.message} (url: ${WS_URL})`);
    });
  });
}

// "Dan Woods" triggers admin bypass — no credit check needed for solo game
const HOST_NAME = 'Dan Woods';

async function ss(page, name) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true });
  console.log(`  📸 ${name}.png`);
}

/**
 * Creates a room, navigates to the lobby, and returns the page already at the lobby.
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

// ─── Score Animation Test Suite ──────────────────────────────────────────────

test.describe('Score Animation — correct answer triggers +N pts overlay', () => {
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
   * TC-SA0: WebSocket connectivity pre-check.
   * Fails fast with a clear message when the game server's WebSocket is unreachable,
   * which was the root cause of previous UAT failures.
   */
  test('TC-SA0: WebSocket server is reachable', async () => {
    const err = await checkWebSocketConnectivity();
    expect(
      err,
      `Game server WebSocket must be reachable for the score-animation test.\n${err || ''}\n` +
        'Ensure the preview environment proxies WebSocket upgrade requests to the game server.',
    ).toBeNull();
    console.log(`  ✅ TC-SA0: WebSocket reachable at ${WS_URL}`);
  });

  /**
   * TC-SA1: Play a full Classic game as a solo host.
   *
   * Strategy for reliably hitting a correct answer:
   *   • Cycle answer options A → B → C → D across successive questions.
   *   • After each click, inspect the feedback text for "✅ Correct!" to detect a
   *     correct answer (the server returns this regardless of animation status).
   *   • The first confirmed correct answer triggers the score-animation assertion.
   *   • A second game attempt with the next option in the cycle is made if the
   *     first game yields zero correct answers (statistically very unlikely).
   */
  test('TC-SA1: score animation visible with "+N pts" text on correct answer', async () => {
    // Cycle through options so we cover all 4 across questions, maximising correct hits
    const OPTION_CYCLE = ['A', 'B', 'C', 'D'];

    let scoreAnimationSeen = false;
    let totalCorrect = 0;

    for (let attempt = 0; attempt < 2 && !scoreAnimationSeen; attempt++) {
      console.log(`  🔄 Game attempt ${attempt + 1}`);

      await createRoomAndLobby(page);
      const easyBtn = page.locator('text=Easy').first();
      if (await easyBtn.isVisible().catch(() => false)) await easyBtn.click();
      const classicBtn = page.locator('text=Classic').first();
      if (await classicBtn.isVisible().catch(() => false)) await classicBtn.click();
      await ss(page, `sa_attempt${attempt + 1}_lobby`);

      await startGame(page);

      // Wait for the first question
      await page.waitForSelector('text=A.', { timeout: AI_TIMEOUT });
      await ss(page, `sa_attempt${attempt + 1}_first_question`);

      for (let qIdx = 0; qIdx < 15; qIdx++) {
        const gameOver = await page.locator('text=/Game Over/i').isVisible().catch(() => false);
        if (gameOver) break;

        // Wait for answer options
        await page.waitForSelector('text=A.', { timeout: 30_000 }).catch(() => {});
        const hasOptions = await page.locator('text=A.').first().isVisible().catch(() => false);
        if (!hasOptions) {
          const isOver = await page.locator('text=/Game Over/i').isVisible().catch(() => false);
          if (isOver) break;
          continue;
        }

        // Pick an option letter, cycling A→B→C→D so we cover all four over time
        const letter = OPTION_CYCLE[(attempt * 10 + qIdx) % 4];
        const optionSel = `text=${letter}.`;
        const optVisible = await page.locator(optionSel).first().isVisible({ timeout: 2_000 }).catch(() => false);
        const clickSel = optVisible ? optionSel : 'text=A.';

        console.log(`  ❓ Q${qIdx + 1}: clicking option ${optVisible ? letter : 'A'}`);
        await page.locator(clickSel).first().click().catch(() => {});

        // Detect whether this answer was correct via existing feedback text
        const wasCorrect = await page
          .locator('text=/✅ Correct!/i')
          .first()
          .isVisible({ timeout: 4_000 })
          .catch(() => false);

        if (wasCorrect) {
          totalCorrect++;
          console.log(`  ✅ Correct answer detected (Q${qIdx + 1})`);

          // ── Core assertion: score animation must appear ──────────────────
          const animLocator = page.locator('[data-testid="score-animation"]');
          await animLocator.waitFor({ state: 'visible', timeout: 3_000 });
          const animText = await animLocator.innerText();
          expect(animText).toMatch(/\+\d+ pts/);
          // ────────────────────────────────────────────────────────────────

          scoreAnimationSeen = true;
          await ss(page, `sa_score_animation_q${qIdx + 1}`);
          console.log(`  🎉 Score animation verified: "${animText}"`);
        } else {
          console.log(`  ❌ Wrong answer (Q${qIdx + 1})`);
        }

        // Advance to next question (wait for Game Over or next A. option)
        await page.waitForSelector('text=/Game Over/i', { timeout: 12_000 }).catch(async () => {
          await page.waitForSelector('text=A.', { timeout: 5_000 }).catch(() => {});
        });
      }

      console.log(`  📊 Attempt ${attempt + 1}: ${totalCorrect} correct answer(s) so far`);
    }

    // If we never encountered a correct answer across both game attempts, the test
    // environment may not be rendering questions — report clearly.
    if (totalCorrect === 0) {
      console.warn(
        '  ⚠️  No correct answers detected across both game attempts. ' +
          'This may indicate a rendering issue or the score-animation feature is not yet deployed.',
      );
    }

    expect(
      scoreAnimationSeen,
      'score-animation element should have appeared (with "+N pts" text) on at least one correct answer',
    ).toBe(true);
  });
});
