/**
 * Subscription Management Screen
 * Fetches plans from the backend — no hardcoded plan data.
 */

import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Linking, Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import StripeService from '../services/StripeService';
import { AuthContext } from '../context/AuthContext';
import { STRAPI_URL } from '../config';

const FALLBACK_PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    priceId: null,
    features: ['Basic access', 'Community support'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'See pricing',
    priceId: null,
    popular: true,
    features: ['Full access', 'Priority support', 'API access'],
  },
];

export default function SubscriptionManagementScreen() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const [plans, setPlans] = useState(null);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutUrl, setCheckoutUrl] = useState(null);
  const [processingPlan, setProcessingPlan] = useState(null);

  useEffect(() => {
    Promise.all([loadPlans(), loadSubscription()]).finally(() => setLoading(false));
  }, [userId]);

  async function loadPlans() {
    try {
      const res = await fetch(`${STRAPI_URL}/api/payment/plans`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Convert backend format to display format
      const displayPlans = Object.entries(data.tiers || {}).map(([key, tier]) => ({
        id: key,
        name: tier.name || key,
        price: tier.amounts
          ? `$${tier.amounts.monthly}/mo`
          : 'Free',
        priceId: tier.prices?.monthly || null,
        popular: key === 'developer' || key === 'pro',
        features: Object.entries(tier.features || {}).map(
          ([feat, val]) => `${feat.charAt(0).toUpperCase() + feat.slice(1)}: ${val === true ? '✓' : val === false ? '✗' : val}`
        ),
      }));
      setPlans(displayPlans.length ? displayPlans : FALLBACK_PLANS);
    } catch {
      setPlans(FALLBACK_PLANS);
    }
  }

  async function loadSubscription() {
    if (!userId) return;
    try {
      const subscription = await StripeService.getSubscription(userId);
      setCurrentSubscription(subscription);
    } catch {
      // Not subscribed or not logged in
    }
  }

  async function handleSubscribe(priceId, planName) {
    if (!priceId) {
      Alert.alert('Info', 'You are on the free plan');
      return;
    }
    if (!user) {
      Alert.alert('Login Required', 'Please login to subscribe');
      return;
    }
    setProcessingPlan(planName);
    try {
      const { url } = await StripeService.createCheckoutSession(priceId, userId);
      setCheckoutUrl(url);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to start checkout');
    } finally {
      setProcessingPlan(null);
    }
  }

  async function handleManageBilling() {
    try {
      const { url } = await StripeService.createPortalSession(userId);
      Linking.openURL(url);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to open billing portal');
    }
  }

  function handleCancelSubscription() {
    Alert.alert(
      'Cancel Subscription',
      "Are you sure? You'll keep access until the end of your billing period.",
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await StripeService.cancelSubscription(userId, false);
              Alert.alert('Done', 'Subscription will end at period close.');
              loadSubscription();
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to cancel');
            }
          },
        },
      ]
    );
  }

  function handleCheckoutComplete(navState) {
    if (navState.url.includes('/subscription/success')) {
      setCheckoutUrl(null);
      Alert.alert('Subscribed!', 'Your subscription is now active.', [
        { text: 'OK', onPress: loadSubscription },
      ]);
    } else if (navState.url.includes('/subscription/cancel')) {
      setCheckoutUrl(null);
    }
  }

  if (checkoutUrl) {
    return (
      <View style={styles.container}>
        <WebView source={{ uri: checkoutUrl }} onNavigationStateChange={handleCheckoutComplete} />
        <TouchableOpacity style={styles.closeButton} onPress={() => setCheckoutUrl(null)}>
          <Text style={styles.closeButtonText}>✕ Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size={36} color="#4285F4" />
      </View>
    );
  }

  const displayPlans = plans || FALLBACK_PLANS;
  const currentTier = currentSubscription?.plan_tier || 'free';
  const isCancelling = currentSubscription?.cancel_at_period_end;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Choose Your Plan</Text>
        {currentSubscription && (
          <Text style={styles.subtitle}>Current plan: {currentTier.toUpperCase()}</Text>
        )}
        {isCancelling && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              Subscription ends {new Date(currentSubscription.current_period_end).toLocaleDateString()}
            </Text>
            <TouchableOpacity onPress={() => StripeService.reactivateSubscription(userId).then(loadSubscription)}>
              <Text style={styles.reactivateLink}>Reactivate</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.plansContainer}>
        {displayPlans.map((plan) => (
          <View
            key={plan.id}
            style={[
              styles.planCard,
              plan.popular && styles.popularPlan,
              currentTier === plan.id && styles.currentPlan,
            ]}
          >
            {plan.popular && (
              <View style={styles.popularBadge}>
                <Text style={styles.popularText}>POPULAR</Text>
              </View>
            )}
            <Text style={styles.planName}>{plan.name}</Text>
            <Text style={styles.planPrice}>{plan.price}</Text>
            <View style={styles.featuresContainer}>
              {plan.features.map((feature, i) => (
                <Text key={i} style={styles.feature}>✓ {feature}</Text>
              ))}
            </View>
            {currentTier === plan.id ? (
              <View style={[styles.button, styles.currentButton]}>
                <Text style={styles.buttonText}>Current Plan</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.button, plan.popular && styles.popularButton, processingPlan === plan.name && styles.disabledButton]}
                onPress={() => handleSubscribe(plan.priceId, plan.name)}
                disabled={processingPlan === plan.name}
              >
                {processingPlan === plan.name
                  ? <ActivityIndicator color="#FFF" />
                  : <Text style={styles.buttonText}>{plan.id === 'free' ? 'Current Plan' : 'Subscribe'}</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      {currentSubscription && currentTier !== 'free' && !isCancelling && (
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.manageButton} onPress={handleManageBilling}>
            <Text style={styles.manageButtonText}>Manage Billing</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancelSubscription}>
            <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F7' },
  contentContainer: { paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666' },
  warningBanner: { backgroundColor: '#FFF3CD', padding: 12, borderRadius: 8, marginTop: 12, alignItems: 'center' },
  warningText: { color: '#856404', marginBottom: 8 },
  reactivateLink: { color: '#007AFF', fontWeight: 'bold' },
  plansContainer: { padding: 20 },
  planCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 20, marginBottom: 16, borderWidth: 2, borderColor: '#E5E5EA' },
  popularPlan: { borderColor: '#4285F4' },
  currentPlan: { borderColor: '#34C759' },
  popularBadge: { position: 'absolute', top: -10, right: 20, backgroundColor: '#4285F4', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  popularText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  planName: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  planPrice: { fontSize: 32, fontWeight: 'bold', color: '#4285F4', marginBottom: 20 },
  featuresContainer: { marginBottom: 20 },
  feature: { fontSize: 15, color: '#333', marginBottom: 8 },
  button: { backgroundColor: '#4285F4', padding: 16, borderRadius: 8, alignItems: 'center' },
  popularButton: { backgroundColor: '#4285F4' },
  currentButton: { backgroundColor: '#34C759' },
  disabledButton: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  actionsContainer: { padding: 20, paddingTop: 0 },
  manageButton: { backgroundColor: '#FFF', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#4285F4' },
  manageButtonText: { color: '#4285F4', fontSize: 16, fontWeight: 'bold' },
  cancelButton: { padding: 16, alignItems: 'center' },
  cancelButtonText: { color: '#FF3B30', fontSize: 16 },
  closeButton: { position: 'absolute', top: 40, right: 20, backgroundColor: '#FFF', padding: 12, borderRadius: 8 },
  closeButtonText: { color: '#4285F4', fontWeight: 'bold' },
});
