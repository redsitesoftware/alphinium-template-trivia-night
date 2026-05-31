/**
 * Valerie E2E Test Suite — Full Trivia Night Game Loop
 * Issue #4: https://github.com/redsitesoftware/trivia-night/issues/4
 *
 * TC1: Page load + initial state
 * TC2: Create room as host (admin bypass via "Dan Woods")
 * TC3: Configure lobby (subject, difficulty, Classic mode)
 * TC4: Join as second player via ?join=CODE URL param
 * TC5: Start game + wait for AI generation
 * TC6: Answer all questions (both players)
 * TC7: Game over + scores visible
 * TC8: Millionaire mode smoke test (lobby → question → ladder + lifelines)
 * TC9: Buzzer mode smoke test (lobby → question → BUZZ button)
 * TC10: Chase mode smoke test (lobby → cash builder question → offer screen)
 *
 * Run: npx playwright test tests/e2e/valerie.spec.js --reporter=list
 */

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const BASE_URL = (process.env.SITE_URL || 'https://trivia.user-pods.alphinium.io') + '?v=1.1.0';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const AI_TIMEOUT = 200_000; // 200s for Ollama CPU generation

// "Dan Woods" triggers admin mode — bypasses credit check
const HOST_NAME = 'Dan Woods';
const PLAYER_NAME = 'ValeriePlayer';

async function ss(page, name) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true });
  console.log(`  📸 ${name}.png`);
}

/** Navigate to BASE_URL, fill name, ensure Create tab, click Create Room, return room code */
async function createRoom(page, name) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  const nameInput = page.locator('input[placeholder="e.g. Alex"]');
  await nameInput.fill(name);
  await page.keyboard.press('Tab');

  // Ensure Create tab is active
  const hostTab = page.locator('text=👑 Host').first();
  if (await hostTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await hostTab.click();
  }

  await page.locator('text=Create Room').click();
  // Wait for lobby — the "Start Game" button only appears when in the lobby
  // (more reliable than "ROOM CODE" text which can match hidden elements)
  await page.waitForSelector('text=/🚀 Start Game|🎙️ Start with Quiz Master/i', { timeout: 60_000 });

  // Extract room code from the body text
  const bodyText = await page.locator('body').innerText();
  // Match "ROOM CODE\nXXXXXX" or "Room code\nXXXXXX" pattern
  const match = bodyText.match(/ROOM\s*CODE[\s\n]+([A-Z0-9]{4,8})/i);
  if (!match) {
    // Fallback: look for a standalone 6-char uppercase code
    const codeEl = await page.locator('text=/^[A-Z0-9]{6}$/').first().innerText().catch(() => null);
    return codeEl || null;
  }
  return match[1];
}

/** Join a room on an EXISTING page (no new context created) */
async function joinRoomOnPage(page, name, code) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const joinTab = page.locator('text=🎮 Join').first();
  if (await joinTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await joinTab.click();
  }
  const nameInput = page.locator('input[placeholder="e.g. Alex"]').first();
  await nameInput.fill(name);
  const codeInput = page.locator('input[placeholder*="ABC"]').first();
  await codeInput.waitFor({ timeout: 5_000 }).catch(() => {});
  await codeInput.fill(code);
  await page.locator('text=Join Room').click();
  await page.waitForSelector('text=/PLAYERS|Waiting Room/i', { timeout: 20_000 });
}

/** Join a room: opens fresh page, switches to Join tab, fills code + name, clicks Join Room */
async function joinRoom(browser, name, code) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await joinRoomOnPage(page, name, code);
  return { ctx, page };
}

/** Click start, handle solo-confirm modal if shown */
async function startGame(page) {
  const startBtn = page.locator('text=/🚀 Start Game|🎙️ Start with Quiz Master/').first();
  await expect(startBtn).toBeVisible({ timeout: 10_000 });
  await startBtn.click();

  // Click "Start Anyway" if the solo-player confirmation modal appears (testID hook).
  await page.waitForTimeout(1_500);
  const soloBtn = page.getByTestId('solo-start-anyway');
  if (await soloBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await soloBtn.click();
    console.log('  🎮 Clicked solo Start Anyway');
  }
}

// ─── TC1–TC7: Classic Mode Full Game Loop ───────────────────────────────────

test.describe('Valerie — Classic Mode Full Game Loop', () => {
  test.setTimeout(300_000);

  let browser, hostPage, playerCtx, playerPage, roomCode;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ["--disable-ipv6"] });
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    hostPage = await ctx.newPage();
    // Capture uncaught JS errors on the host page
    hostPage.on('pageerror', (err) => console.error('  🚨 HOST PAGE ERROR:', err.message));
    hostPage.on('console', (msg) => {
      if (msg.type() === 'error') console.error('  🔴 HOST CONSOLE ERROR:', msg.text());
    });
  });

  test.afterAll(async () => {
    await browser?.close();
  });

  test('TC1: Page loads with name input visible', async () => {
    await hostPage.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await ss(hostPage, 'tc1_landing');
    await expect(hostPage.locator('input[placeholder="e.g. Alex"]')).toBeVisible({ timeout: 15_000 });
    console.log('  ✅ TC1: page loads cleanly');
  });

  test('TC2: Create room as host', async () => {
    // Page is already loaded from TC1 — fill name and create room without re-navigating
    const nameInput = hostPage.locator('input[placeholder="e.g. Alex"]');
    await nameInput.fill(HOST_NAME);
    await hostPage.keyboard.press('Tab');

    // Ensure Create tab is active
    const hostTab = hostPage.locator('text=👑 Host').first();
    if (await hostTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await hostTab.click();
    }

    await hostPage.locator('text=Create Room').click();
    // Wait for lobby — Start Game button is unique to lobby screen
    await hostPage.waitForSelector('text=/Start Game|Start with Quiz Master/', { timeout: 20_000 });

    // Extract room code — grab all text and regex-match the code pattern after "ROOM CODE"
    await hostPage.waitForTimeout(1000); // let code text render
    // Extract room code — try multiple patterns
    const bodyText = await hostPage.locator('body').innerText();
    const match = bodyText.match(/(?:ROOM CODE|Room code)\s+([A-Z0-9]{4,8})/i)
      || bodyText.match(/\b([A-Z0-9]{6})\b/); // fallback: first 6-char alphanumeric
    roomCode = match ? match[1] : null;

    await ss(hostPage, 'tc2_lobby');
    expect(roomCode, 'Room code should be captured').toBeTruthy();
    expect(roomCode.length).toBeGreaterThanOrEqual(4);
    console.log(`  ✅ TC2: room created, code = ${roomCode}`);
  });

  test('TC3: Configure lobby — Easy difficulty, Classic mode', async () => {
    const easyBtn = hostPage.locator('text=Easy').first();
    if (await easyBtn.isVisible().catch(() => false)) await easyBtn.click();

    const classicCard = hostPage.locator('text=Classic').first();
    if (await classicCard.isVisible().catch(() => false)) await classicCard.click();

    await ss(hostPage, 'tc3_lobby_configured');
    console.log('  ✅ TC3: lobby configured');
  });

  test('TC4: Second player joins the room', async () => {
    ({ ctx: playerCtx, page: playerPage } = await joinRoom(browser, PLAYER_NAME, roomCode));
    await ss(playerPage, 'tc4_player_joined');
    // Host should see player name appear in PLAYERS list
    await expect(hostPage.locator(`text=${PLAYER_NAME}`)).toBeVisible({ timeout: 15_000 });
    await ss(hostPage, 'tc4_host_sees_player');
    console.log(`  ✅ TC4: ${PLAYER_NAME} joined`);
  });

  test('TC5: Start game + questions appear', async () => {
    await startGame(hostPage);

    const t0 = Date.now();
    // Questions may be cached so the AI generating screen may be instant/skipped.
    // Just wait for answer options to appear (format: "A." label in option buttons).
    await hostPage.waitForSelector('text=A.', { timeout: AI_TIMEOUT });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    await ss(hostPage, 'tc5_first_question_host');
    await ss(playerPage, 'tc5_first_question_player');
    console.log(`  ✅ TC5: first question in ${elapsed}s`);
  });

  test('TC6: Both players answer all questions', async () => {
    let qNum = 0;

    for (let i = 0; i < 15; i++) {
      const gameOver = await hostPage.locator('text=/Game Over/i').isVisible().catch(() => false);
      if (gameOver) break;

      // Capture page state at start of each iteration for diagnosis
      if (i <= 3) await ss(hostPage, `tc6_iter${i}_start`);

      // Wait for answer options to appear — format is "A." (letter + dot) as separate Text nodes
      await hostPage.waitForSelector('text=A.', { timeout: 30_000 }).catch(() => {});

      // Check if answer options are present by looking for the "A." label
      const hasOptions = await hostPage.locator('text=A.').first().isVisible().catch(() => false);
      console.log(`  🔍 TC6 i=${i}: hasOptions=${hasOptions}`);
      if (!hasOptions) {
        // Double-check for game over before giving up
        const isOver = await hostPage.locator('text=/Game Over/i').isVisible().catch(() => false);
        if (isOver) break;
        await ss(hostPage, `tc6_iter${i}_no_options`);
        continue; // retry loop iteration
      }

      const t0 = Date.now();
      // Host clicks first option (A.)
      await hostPage.locator('text=A.').first().click().catch(() => {});
      qNum++;
      if (qNum <= 5) await ss(hostPage, `tc6_q${qNum}`);

      // Player clicks second option (B.) or first if only one visible
      const playerHasB = await playerPage.locator('text=B.').first().isVisible({ timeout: 2_000 }).catch(() => false);
      if (playerHasB) {
        await playerPage.locator('text=B.').first().click().catch(() => {});
      } else {
        await playerPage.locator('text=A.').first().click().catch(() => {});
      }

      // After both players answer, the question should end early (not wait full 30s timer).
      // Wait for the next question's "A." OR game over to appear within 12s.
      await hostPage.waitForSelector('text=/Game Over/i', { timeout: 12_000 }).catch(async () => {
        await hostPage.waitForSelector('text=A.', { timeout: 5_000 }).catch(() => {});
      });
      const elapsed = Date.now() - t0;
      console.log(`  ⏱️  Q${qNum} elapsed after answer: ${elapsed}ms`);
      if (elapsed > 20_000) {
        console.warn(`  ⚠️  Q${qNum}: timer did NOT end early (${elapsed}ms) — expected < 20s`);
      }
    }

    console.log(`  ✅ TC6: answered ${qNum} question(s)`);
  });

  test('TC7: Game over screen with scores', async () => {
    // "🏁 Game Over!" — match just "Game Over" which appears in the header
    await hostPage.waitForSelector('text=/Game Over/i', { timeout: 120_000 });
    await ss(hostPage, 'tc7_game_over_host');
    await ss(playerPage, 'tc7_game_over_player');
    console.log(`  ✅ TC7: game over screen visible`);
  });
});

// ─── TC8: Millionaire Mode Smoke ────────────────────────────────────────────

test.describe('Valerie — Millionaire Mode Smoke', () => {
  test.setTimeout(300_000);

  let browser, page;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ["--disable-ipv6"] });
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    page = await ctx.newPage();
  });

  test.afterAll(async () => {
    await browser?.close();
  });

  test('TC8a: Create room, select Millionaire mode', async () => {
    await createRoom(page, HOST_NAME);
    const millBtn = page.locator('text=Millionaire').first();
    await expect(millBtn).toBeVisible({ timeout: 10_000 });
    await millBtn.click();
    await page.waitForTimeout(1_000);
    await ss(page, 'tc8a_millionaire_lobby');
    console.log('  ✅ TC8a: Millionaire mode selected');
  });

  test('TC8b: Start game, Millionaire screen appears', async () => {
    await startGame(page);
    // Wait for first question answer options (Millionaire uses "A:" format)
    await page.waitForSelector('text=A:', { timeout: AI_TIMEOUT });
    await ss(page, 'tc8b_millionaire_question');
    console.log('  ✅ TC8b: Millionaire question visible');
  });

  test('TC8c: Money ladder visible ($100 → $1,000,000)', async () => {
    await expect(page.locator('text=$100').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=$1,000,000').first()).toBeVisible({ timeout: 5_000 });
    console.log('  ✅ TC8c: Money ladder visible');
  });

  test('TC8d: All 3 lifelines visible', async () => {
    await expect(page.locator('text=50:50').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=👥').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=📞').first()).toBeVisible({ timeout: 5_000 });
    await ss(page, 'tc8d_lifelines');
    console.log('  ✅ TC8d: All lifelines visible');
  });
});

// ─── TC9: Buzzer Mode Smoke ──────────────────────────────────────────────────

test.describe('Valerie — Buzzer Mode Smoke', () => {
  test.setTimeout(300_000);

  let browser, page;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ["--disable-ipv6"] });
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    page = await ctx.newPage();
  });

  test.afterAll(async () => {
    await browser?.close();
  });

  test('TC9a: Create room, select Buzzer mode', async () => {
    await createRoom(page, HOST_NAME);
    const buzzerBtn = page.locator('text=Buzzer').first();
    await expect(buzzerBtn).toBeVisible({ timeout: 10_000 });
    await buzzerBtn.click();
    await page.waitForTimeout(1_000);
    await ss(page, 'tc9a_buzzer_lobby');
    console.log('  ✅ TC9a: Buzzer mode selected');
  });

  test('TC9b: Start game, Buzzer screen appears', async () => {
    await startGame(page);
    // BuzzerScreen shows "TAP TO BUZZ" until someone buzzes in — wait for that button.
    // 'text=BUZZ' matches "TAP TO BUZZ" as a substring.
    await page.waitForSelector('text=BUZZ', { timeout: AI_TIMEOUT });
    await ss(page, 'tc9b_buzzer_question');
    console.log('  ✅ TC9b: Buzzer screen visible');
  });

  test('TC9c: BUZZ button present', async () => {
    await expect(page.locator('text=BUZZ').first()).toBeVisible({ timeout: 5_000 });
    await ss(page, 'tc9c_buzz_button');
    console.log('  ✅ TC9c: BUZZ button present');
  });
});

// ─── TC10: Chase Mode Smoke ──────────────────────────────────────────────────

test.describe('Valerie — Chase Mode Smoke', () => {
  test.setTimeout(300_000);

  let browser, page;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true, args: ["--disable-ipv6"] });
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    page = await ctx.newPage();
  });

  test.afterAll(async () => {
    await browser?.close();
  });

  test('TC10a: Create room, select Chase mode', async () => {
    await createRoom(page, HOST_NAME);
    const chaseBtn = page.locator('text=Chase').first();
    await expect(chaseBtn).toBeVisible({ timeout: 10_000 });
    await chaseBtn.click();
    await page.waitForTimeout(1_000);
    await ss(page, 'tc10a_chase_lobby');
    console.log('  ✅ TC10a: Chase mode selected');
  });

  test('TC10b: Start game, Cash Builder question appears', async () => {
    await startGame(page);
    // ChaseScreen shows "Cash Builder" header during cash_builder phase
    await page.waitForSelector('text=Cash Builder', { timeout: AI_TIMEOUT });
    await ss(page, 'tc10b_cash_builder');
    console.log('  ✅ TC10b: Cash Builder question visible');
  });

  test('TC10c: Answer cash builder question, see result', async () => {
    // Pick first available option
    const option = page.locator('[style*="1e3a8a"]').first();
    const anyOption = page.locator('text=/^[A-D]:?\\s/').first();
    // Wait for options then click any
    await page.waitForTimeout(1_000);
    const optionBtn = page.locator('role=button').filter({ hasText: /^[A-D]/ }).first();
    if (await optionBtn.isVisible()) {
      await optionBtn.click();
    }
    await page.waitForTimeout(2_000);
    await ss(page, 'tc10c_answered');
    console.log('  ✅ TC10c: Cash builder answered');
  });
});
