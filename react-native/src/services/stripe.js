/**
 * Stripe Service (React Native)
 *
 * All endpoints map to /api/payment/* on the Strapi backend.
 * Plans are always fetched dynamically from the API — never hardcoded.
 * This works for any project cloned from alphinium-app.
 */

import { apiService } from './api';
import { PAYMENTS_API_URL } from '../config';

const TRIVIA_API = PAYMENTS_API_URL;

class StripeService {
  /**
   * Fetch Trivia Night credit bundle options from the payments API.
   * Returns { product, bundles: [{ key, name, description, amount, games, available }] }
   */
  async getCreditBundles() {
    const res = await fetch(`${TRIVIA_API}/api/trivia/plans`);
    if (!res.ok) throw new Error('Failed to load credit bundles');
    return res.json();
  }

  /**
   * Create a Stripe Checkout session for a credit bundle (one-time payment).
   * @param {string} bundleKey  'starter' | 'standard' | 'pro'
   * @param {string} userId     device UUID (or Strapi user ID once auth exists)
   * @param {string} email      optional — pre-fills Stripe Checkout email field
   * @param {string} successUrl where Stripe redirects on success
   * @param {string} cancelUrl  where Stripe redirects on cancel
   * Returns { sessionId, url } — open url in browser to complete payment.
   */
  async createCreditSession(bundleKey, userId, email, successUrl, cancelUrl) {
    const res = await fetch(`${TRIVIA_API}/api/trivia/create-credit-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundleKey, userId, email, successUrl, cancelUrl }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create payment session');
    }
    return res.json();
  }

  /**
   * Get credit balance for a userId from the payments API.
   */
  async getCreditBalance(userId) {
    const res = await fetch(`${TRIVIA_API}/api/trivia/credits/${userId}`);
    if (!res.ok) return { balance: 0 };
    return res.json();
  }

  /**
   * Fetch available subscription plans from the backend.
   * Returns { product, tiers, currency } — driven by backend/config/plans.js.
   * Always call this to get plan names/prices; never hardcode them in the UI.
   */
  async getSubscriptionPlans() {
    try {
      const response = await apiService.get('/api/payment/plans');
      return response;
    } catch (error) {
      console.error('Error fetching subscription plans:', error);
      throw new Error('Failed to load subscription plans');
    }
  }

  /**
   * Create a Stripe Checkout session.
   * @param {string} priceId  - Stripe price ID for the selected tier/interval
   * @param {string} userId   - Strapi user ID
   * @param {string} token    - Auth JWT
   * Returns { sessionId, url } — redirect user to url to complete payment.
   */
  async createCheckoutSession(priceId, userId, token) {
    try {
      const response = await apiService.post(
        '/api/payment/create-checkout-session',
        { priceId, userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw new Error('Failed to create checkout session');
    }
  }

  /**
   * Verify a completed Stripe Checkout session.
   * Call this on the payment success screen with the session_id from the redirect URL.
   * Returns { success, subscriptionId, subscriptionStatus, userId }
   */
  async verifyPayment(sessionId) {
    try {
      const response = await apiService.post('/api/payment/verify-payment', { sessionId });
      return response;
    } catch (error) {
      console.error('Error verifying payment:', error);
      throw new Error('Failed to verify payment');
    }
  }

  /**
   * Get a user's subscription record from the backend.
   * @param {string} userId  - Strapi user ID
   * @param {string} token   - Auth JWT
   */
  async getSubscriptionStatus(userId, token) {
    try {
      const response = await apiService.get(
        `/api/payment/subscription/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.subscription;
    } catch (error) {
      console.error('Error fetching subscription status:', error);
      throw new Error('Failed to load subscription status');
    }
  }

  /**
   * Cancel subscription at the end of the current billing period.
   */
  async cancelSubscription(userId, token) {
    try {
      await apiService.post(
        '/api/payment/cancel-subscription',
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return true;
    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw new Error('Failed to cancel subscription');
    }
  }

  /**
   * Reactivate a subscription that was set to cancel at period end.
   */
  async reactivateSubscription(userId, token) {
    try {
      await apiService.post(
        '/api/payment/reactivate-subscription',
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return true;
    } catch (error) {
      console.error('Error reactivating subscription:', error);
      throw new Error('Failed to reactivate subscription');
    }
  }

  /**
   * Open the Stripe Billing Portal (self-service subscription management).
   * Returns { url } — open this in a WebView or browser.
   */
  async createPortalSession(userId, token) {
    try {
      const response = await apiService.post(
        '/api/payment/create-portal-session',
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response;
    } catch (error) {
      console.error('Error creating portal session:', error);
      throw new Error('Failed to open billing portal');
    }
  }
}

export const stripeService = new StripeService();

