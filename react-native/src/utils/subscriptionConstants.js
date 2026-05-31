/**
 * Payment UI constants
 *
 * IMPORTANT: Do NOT hardcode subscription plan names, prices, or price IDs here.
 * Plans are fetched dynamically from GET /api/payment/plans at runtime.
 * This makes the template work for any project with any pricing structure.
 *
 * See: src/services/stripe.js -> getSubscriptionPlans()
 * See: src/screens/PricingScreen.js for dynamic plan rendering
 */

/**
 * Stripe test card numbers (for development/staging only)
 */
export const STRIPE_TEST_CARDS = {
  SUCCESS: '4242 4242 4242 4242',
  DECLINED: '4000 0000 0000 9995',
  REQUIRES_AUTH: '4000 0025 0000 3155',
  INSUFFICIENT_FUNDS: '4000 0000 0000 9995',
  EXPIRED_CARD: '4000 0000 0000 0069',
  INCORRECT_CVC: '4000 0000 0000 0127',
};

/**
 * Deep link schemes — update these to match your app's bundle ID / scheme
 */
export const DEEP_LINK_SCHEMES = {
  IOS: process.env.EXPO_PUBLIC_APP_SCHEME || 'alphinium',
  ANDROID: process.env.EXPO_PUBLIC_APP_SCHEME || 'alphinium',
};

/**
 * Payment redirect paths (appended to deep link scheme)
 */
export const PAYMENT_REDIRECT_PATHS = {
  SUCCESS: 'payment-success',
  CANCEL: 'payment-cancel',
};

/**
 * API timeout configurations (milliseconds)
 */
export const API_TIMEOUTS = {
  DEFAULT: 10000,
  PAYMENT_VERIFICATION: 30000,
  CHECKOUT_SESSION: 15000,
};

/**
 * User-facing error messages
 */
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  PAYMENT_FAILED: 'Payment failed. Please try again or use a different payment method.',
  SESSION_EXPIRED: 'Your session has expired. Please start over.',
  INVALID_SESSION: 'Invalid payment session. Please contact support.',
  VERIFICATION_FAILED: 'Failed to verify payment. Please contact support.',
  PLANS_LOAD_FAILED: 'Failed to load subscription plans. Please try again.',
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
};

