#!/usr/bin/env node
/**
 * Stripe Webhook Test - Verifies credit delivery
 * 
 * Tests:
 * 1. Webhook endpoint is accessible
 * 2. Credit balance can be queried
 * 3. Credit deduction works
 * 4. Simulates a checkout.session.completed event (manual test)
 */

const PAYMENTS_API = 'https://payments-api.alphinium.com';
const TEST_USER_ID = 'test-webhook-user-' + Date.now();

async function testWebhookEndpoint() {
  console.log('\n📥 Test 1: Webhook endpoint accessibility...');
  const res = await fetch(`${PAYMENTS_API}/api/payment/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ test: 'ping' })
  });
  const text = await res.text();
  if (text.includes('stripe-signature')) {
    console.log('✅ Webhook endpoint is live and requires proper Stripe signature');
    return true;
  } else {
    console.log('❌ Webhook endpoint not responding correctly');
    return false;
  }
}

async function testCreditBalance() {
  console.log('\n💰 Test 2: Credit balance query...');
  const res = await fetch(`${PAYMENTS_API}/api/trivia/credits/${TEST_USER_ID}`);
  if (!res.ok) {
    console.log(`❌ Failed to query balance: ${res.status}`);
    return false;
  }
  const data = await res.json();
  console.log('✅ Credit balance API works:', data);
  return true;
}

async function testCreditDeduction() {
  console.log('\n➖ Test 3: Credit deduction...');
  
  // This requires TRIVIA_API_SECRET which the trivia-night server uses
  const res = await fetch(`${PAYMENTS_API}/api/trivia/credits/${TEST_USER_ID}/deduct`, {
    method: 'POST',
    headers: { 'x-trivia-secret': process.env.TRIVIA_API_SECRET || 'test' }
  });
  
  const status = res.status;
  console.log(`   Response: ${status}`);
  
  if (status === 402) {
    console.log('✅ Correctly returns 402 (insufficient credits) for user with 0 balance');
    return true;
  } else if (status === 200) {
    console.log('✅ Deduction succeeded (user had credits)');
    return true;
  } else if (status === 401 || status === 403) {
    console.log('⚠️  Authentication failed (need correct TRIVIA_API_SECRET)');
    return false;
  } else {
    console.log(`❌ Unexpected status: ${status}`);
    return false;
  }
}

async function testCreditPlans() {
  console.log('\n📋 Test 4: Credit bundle plans...');
  const res = await fetch(`${PAYMENTS_API}/api/trivia/plans`);
  if (!res.ok) {
    console.log(`❌ Failed to load plans: ${res.status}`);
    return false;
  }
  const data = await res.json();
  console.log('✅ Plans loaded:', data.bundles.map(b => `${b.name} (${b.games} games, $${(b.amount/100).toFixed(2)})`).join(', '));
  return true;
}

async function testWebhookEvent() {
  console.log('\n🧪 Test 5: Simulate webhook event...');
  console.log('   ⚠️  Manual test required:');
  console.log('   1. Go to Stripe Dashboard → Developers → Webhooks');
  console.log('   2. Find the webhook for: https://payments-api.alphinium.com/api/payment/webhook');
  console.log('   3. Click "Send test webhook"');
  console.log('   4. Select event: checkout.session.completed');
  console.log('   5. Add metadata: product=trivia-night, userId=test123, bundleKey=starter, games=5');
  console.log('   6. Send event');
  console.log('   7. Check response shows 200 OK');
  console.log('   8. Verify credits added: curl ' + PAYMENTS_API + '/api/trivia/credits/test123');
  return null;
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('🧪 Stripe Webhook Verification Tests');
  console.log('='.repeat(60));

  const results = [
    await testWebhookEndpoint(),
    await testCreditBalance(),
    await testCreditDeduction(),
    await testCreditPlans(),
    await testWebhookEvent(),
  ];

  const passed = results.filter(r => r === true).length;
  const failed = results.filter(r => r === false).length;
  const manual = results.filter(r => r === null).length;

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️  Manual: ${manual}`);
  console.log('='.repeat(60));

  if (failed === 0) {
    console.log('\n✅ All automated tests passed!');
    console.log('💡 Next step: Test a real purchase or use Stripe Dashboard to send test webhook');
  } else {
    console.log('\n❌ Some tests failed. Check the output above.');
  }
}

runTests().catch(console.error);
