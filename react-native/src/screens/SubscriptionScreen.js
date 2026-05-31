import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { SubscriptionCard } from '../components/SubscriptionCard';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { ErrorAlert } from '../components/ErrorAlert';
import { stripeService } from '../services/stripe';

export const SubscriptionScreen = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingPlanId, setProcessingPlanId] = useState(null);
  const [error, setError] = useState({
    visible: false,
    message: '',
  });

  useEffect(() => {
    loadSubscriptionPlans();
  }, []);

  const loadSubscriptionPlans = async () => {
    try {
      setLoading(true);
      const fetchedPlans = await stripeService.getSubscriptionPlans();
      setPlans(fetchedPlans);
    } catch (err) {
      showError('Failed to load subscription plans. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const showError = (message) => {
    setError({ visible: true, message });
  };

  const closeError = () => {
    setError({ visible: false, message: '' });
  };

  const handlePlanSelect = async (plan) => {
    try {
      setProcessingPlanId(plan.id);

      // Create checkout session
      const session = await stripeService.createCheckoutSession(
        plan.id,
        `alphinium://payment-success`, // Deep link for success
        `alphinium://payment-cancel` // Deep link for cancel
      );

      // Open Stripe Checkout in browser
      const canOpen = await Linking.canOpenURL(session.url);
      if (canOpen) {
        await Linking.openURL(session.url);
      } else {
        throw new Error('Cannot open payment URL');
      }
    } catch (err) {
      console.error('Payment error:', err);
      showError(
        err instanceof Error
          ? err.message
          : 'Failed to initiate payment. Please try again.'
      );
    } finally {
      setProcessingPlanId(null);
    }
  };

  const handleRetryLoad = () => {
    closeError();
    loadSubscriptionPlans();
  };

  if (loading) {
    return <LoadingOverlay message="Loading subscription plans..." />;
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Choose Your Plan</Text>
          <Text style={styles.subtitle}>
            Select the perfect subscription plan for your needs
          </Text>
        </View>

        {plans.map(plan => (
          <SubscriptionCard
            key={plan.id}
            plan={plan}
            onSelect={handlePlanSelect}
            isLoading={processingPlanId === plan.id}
            disabled={processingPlanId !== null && processingPlanId !== plan.id}
          />
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            🔒 Secure payment powered by Stripe
          </Text>
          <Text style={styles.footerSubtext}>
            Cancel anytime. No hidden fees.
          </Text>
        </View>
      </ScrollView>

      <LoadingOverlay
        visible={processingPlanId !== null}
        message="Opening payment checkout..."
      />

      <ErrorAlert
        visible={error.visible}
        message={error.message}
        onClose={closeError}
        onRetry={plans.length === 0 ? handleRetryLoad : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingVertical: 20,
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    maxWidth: 300,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 12,
    color: '#999',
  },
});
