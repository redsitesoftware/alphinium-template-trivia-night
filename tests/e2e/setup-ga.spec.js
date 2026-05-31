/**
 * setup-ga.spec.js — Automates Google Analytics property creation for Trivia Night.
 *
 * Run with:
 *   npx playwright test tests/e2e/setup-ga.spec.js --headed
 *
 * Uses a copy of your real Chrome profile so Google sign-in is already active.
 * Chrome must be fully closed before running (profile copy would conflict).
 * Prints the G-XXXXXXXXXX Measurement ID at the end.
 */

const { test } = require('@playwright/test');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

test('Create Google Analytics property for Trivia Night', async () => {
  test.setTimeout(300000);

  // Copy Chrome profile to temp dir (avoids locking conflict with running Chrome)
  const realProfile = path.join(os.homedir(), 'Library/Application Support/Google/Chrome/Default');
  const tmpProfile = path.join(os.tmpdir(), 'pw-chrome-profile-ga');
  if (!fs.existsSync(tmpProfile)) {
    console.log('📋 Copying Chrome profile (first run only, may take a moment)...');
    fs.cpSync(realProfile, tmpProfile, {
      recursive: true,
      filter: (src) => {
        // Skip large/unnecessary dirs
        const skip = ['Cache', 'Code Cache', 'GPUCache', 'Service Worker', 'CacheStorage'];
        return !skip.some(s => src.includes(`/${s}`));
      }
    });
    console.log('✅ Profile copied');
  } else {
    console.log('♻️  Reusing existing profile copy');
  }

  const browser = await chromium.launchPersistentContext(tmpProfile, {
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-sync'],
  });

  const page = await browser.newPage();

  // ── Step 1: Navigate to GA and wait for manual login ──
  await page.goto('https://analytics.google.com/');

  console.log('\n⏳ Waiting for GA to load...');

  // If not logged in, wait for manual sign-in (up to 3 min)
  try {
    await page.waitForURL(/analytics\.google\.com\/analytics\/web/, { timeout: 180000 });
    console.log('✅ Logged in to Google Analytics');
  } catch {
    console.log('ℹ️  Please sign in manually — waiting...');
    await page.waitForURL(/analytics\.google\.com\/analytics\/web/, { timeout: 180000 });
  }

  // Wait for the GA UI to fully load
  await page.waitForTimeout(3000);

  // ── Step 2: Go to Admin ──
  console.log('\n📍 Navigating to Admin...');
  // Click the Admin gear icon (bottom left)
  const adminLink = page.locator('[data-uie-id="side-nav-admin"]').or(
    page.locator('a[href*="admin"]').filter({ hasText: /admin/i }).first()
  );

  // Try direct URL instead
  const currentUrl = page.url();
  const baseGaUrl = currentUrl.split('#')[0];
  await page.goto('https://analytics.google.com/analytics/web/#/admin');
  await page.waitForTimeout(3000);

  // ── Step 3: Create Property ──
  console.log('\n📍 Looking for Create button...');
  
  // Click "Create" dropdown
  const createBtn = page.locator('button, [role="button"]').filter({ hasText: /^create$/i }).first();
  await createBtn.waitFor({ timeout: 15000 });
  await createBtn.click();
  await page.waitForTimeout(1000);

  // Choose "Property"
  const propertyOption = page.locator('[role="menuitem"], [role="option"]').filter({ hasText: /property/i }).first();
  await propertyOption.waitFor({ timeout: 5000 });
  await propertyOption.click();
  await page.waitForTimeout(2000);

  // ── Step 4: Fill property details ──
  console.log('\n📝 Filling property details...');

  // Property name
  const nameInput = page.locator('input[name="propertyName"], input[placeholder*="name" i], input[aria-label*="property name" i]').first();
  await nameInput.waitFor({ timeout: 10000 });
  await nameInput.fill('Trivia Night');

  // Timezone — Australia/Adelaide or similar
  const timezoneSelect = page.locator('select, [role="combobox"]').filter({ hasText: /timezone/i }).or(
    page.locator('[aria-label*="timezone" i]')
  ).first();
  if (await timezoneSelect.isVisible().catch(() => false)) {
    // Try to select Australia
    await timezoneSelect.click();
    const ausOption = page.locator('[role="option"]').filter({ hasText: /australia/i }).first();
    if (await ausOption.isVisible().catch(() => false)) {
      await ausOption.click();
    }
  }

  // Click Next
  const nextBtn = page.locator('button').filter({ hasText: /next/i }).first();
  await nextBtn.waitFor({ timeout: 5000 });
  await nextBtn.click();
  await page.waitForTimeout(2000);

  // Skip business info if present — just click Next again
  const nextBtn2 = page.locator('button').filter({ hasText: /next/i }).first();
  if (await nextBtn2.isVisible().catch(() => false)) {
    await nextBtn2.click();
    await page.waitForTimeout(2000);
  }

  // Skip business objectives if present
  const createPropBtn = page.locator('button').filter({ hasText: /create/i }).first();
  if (await createPropBtn.isVisible().catch(() => false)) {
    await createPropBtn.click();
    await page.waitForTimeout(2000);
  }

  // Accept terms if shown
  const acceptBtn = page.locator('button').filter({ hasText: /accept|agree|i accept/i }).first();
  if (await acceptBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await acceptBtn.click();
    await page.waitForTimeout(2000);
  }

  // ── Step 5: Web data stream setup ──
  console.log('\n🌐 Setting up web data stream...');

  // Choose "Web" platform
  const webOption = page.locator('[role="radio"], button, div').filter({ hasText: /^web$/i }).first();
  if (await webOption.isVisible({ timeout: 5000 }).catch(() => false)) {
    await webOption.click();
    await page.waitForTimeout(1000);
  }

  // Fill URL
  const urlInput = page.locator('input[placeholder*="example.com" i], input[aria-label*="url" i], input[type="url"]').first();
  if (await urlInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await urlInput.fill('trivia.user-pods.alphinium.io');
  }

  // Stream name
  const streamNameInput = page.locator('input[aria-label*="stream name" i], input[placeholder*="stream" i]').first();
  if (await streamNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await streamNameInput.fill('Trivia Night Web');
  }

  // Create stream
  const createStreamBtn = page.locator('button').filter({ hasText: /create stream|next/i }).first();
  await createStreamBtn.waitFor({ timeout: 10000 });
  await createStreamBtn.click();
  await page.waitForTimeout(4000);

  // ── Step 6: Extract Measurement ID ──
  console.log('\n🔍 Looking for Measurement ID...');

  // The G-XXXXXXXXXX should appear on the stream detail page
  await page.waitForTimeout(3000);
  const pageContent = await page.content();

  const gaIdMatch = pageContent.match(/G-[A-Z0-9]{8,12}/);
  if (gaIdMatch) {
    const gaId = gaIdMatch[0];
    console.log('\n' + '='.repeat(50));
    console.log(`✅ SUCCESS! Measurement ID: ${gaId}`);
    console.log('='.repeat(50));
    console.log('\nRun this to redeploy with GA enabled:');
    console.log(`\nuser-pods deploy \\`);
    console.log(`  --image us-central1-docker.pkg.dev/alphinium-production/user-pods/trivia-night:20260528-132023 \\`);
    console.log(`  --name trivia-night-stable --port 3000 --app-id trivia \\`);
    console.log(`  --env GOOGLE_ANALYTICS_ID=${gaId} \\`);
    console.log(`  [... other env vars ...]`);
    
    // Also screenshot the result
    await page.screenshot({ path: 'tests/e2e/screenshots/ga-setup-complete.png' });
  } else {
    console.log('⚠️  Could not auto-detect ID — check the screenshot');
    await page.screenshot({ path: 'tests/e2e/screenshots/ga-setup-result.png', fullPage: true });
    console.log('📸 Screenshot saved: tests/e2e/screenshots/ga-setup-result.png');
    
    // Pause so user can read the ID manually
    await page.pause();
  }

  await browser.close();
});
