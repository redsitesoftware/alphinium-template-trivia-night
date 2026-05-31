import React, { useState, useEffect, useContext } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import StripeService from '../services/StripeService';
import { AuthContext } from '../context/AuthContext';
import { STRAPI_URL } from '../config';

export default function PricingScreen({ navigation }) {
  const { user, token } = useContext(AuthContext);
  const [plans, setPlans] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedInterval, setSelectedInterval] = useState('monthly');

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    try {
      const response = await fetch(`${STRAPI_URL}/api/payment/plans`);
      const data = await response.json();
      setPlans(data);
    } catch (error) {
      console.error('Failed to load plans:', error);
      Alert.alert('Error', 'Failed to load pricing plans');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubscribe(tier, tierKey) {
    if (!user || !token) {
      Alert.alert('Login Required', 'Please login to subscribe');
      navigation.navigate('Login');
      return;
    }

    if (tierKey === 'free') {
      Alert.alert('Free Plan', 'You are already on the free plan!');
      return;
    }

    try {
      const priceId = tier.prices[selectedInterval];
      const session = await StripeService.createCheckoutSession(priceId, user.id, token);
      
      navigation.navigate('StripeCheckout', { url: session.url });
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  }

  function getBadgeText(tierKey) {
    if (tierKey === 'developer') return 'POPULAR';
    if (tierKey === 'team') return 'BEST VALUE';
    return null;
  }

  function formatFeatureValue(value) {
    if (value === true) return '✓';
    if (value === false) return '✗';
    if (typeof value === 'string' && value.toLowerCase() === 'unlimited') return 'Unlimited';
    return value;
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size={36} color="#4285F4" />
        <Text style={styles.loadingText}>Loading plans...</Text>
      </View>
    );
  }

  if (!plans) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load pricing plans</Text>
        <TouchableOpacity onPress={loadPlans} style={styles.retryButton}>
          <Text>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <Text style={styles.title}>Choose Your Plan</Text>
      <Text style={styles.subtitle}>Start with 14-day free trial. Cancel anytime.</Text>
      
      {/* Interval Toggle */}
      <View style={styles.intervalToggle}>
        {['monthly', 'beta', 'annual'].map(interval => (
          <TouchableOpacity 
            key={interval}
            onPress={() => setSelectedInterval(interval)}
            style={[
              styles.intervalButton, 
              selectedInterval === interval && styles.intervalButtonActive
            ]}
          >
            <Text style={[
              styles.intervalButtonText,
              selectedInterval === interval && styles.intervalButtonTextActive
            ]}>
              {interval === 'beta' ? 'BETA (30% OFF)' : interval.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Pricing Cards */}
      <View style={styles.cardsContainer}>
        {Object.entries(plans.tiers).map(([key, tier]) => {
          const badge = getBadgeText(key);
          const isCurrentPlan = user?.subscription_status === key;
          
          return (
            <View key={key} style={[styles.card, key === 'developer' && styles.cardPopular]}>
              {badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              )}
              
              <Text style={styles.tierName}>{tier.name}</Text>
              
              {tier.amounts ? (
                <View style={styles.priceContainer}>
                  <Text style={styles.price}>
                    ${tier.amounts[selectedInterval]}
                  </Text>
                  <Text style={styles.priceInterval}>/{selectedInterval === 'annual' ? 'year' : 'month'}</Text>
                </View>
              ) : (
                <Text style={styles.price}>Free</Text>
              )}
              
              {/* Features List */}
              <View style={styles.features}>
                {Object.entries(tier.features).map(([feature, value]) => (
                  <View key={feature} style={styles.featureRow}>
                    <Text style={styles.featureIcon}>✓</Text>
                    <Text style={styles.featureText}>
                      {feature.charAt(0).toUpperCase() + feature.slice(1)}: {formatFeatureValue(value)}
                    </Text>
                  </View>
                ))}
              </View>
              
              {isCurrentPlan ? (
                <View style={styles.currentPlanButton}>
                  <Text style={styles.currentPlanText}>Current Plan</Text>
                </View>
              ) : (
                <TouchableOpacity 
                  style={[styles.subscribeButton, key === 'developer' && styles.subscribeButtonPrimary]}
                  onPress={() => handleSubscribe(tier, key)}
                >
                  <Text style={styles.subscribeButtonText}>
                    {key === 'free' ? 'Current Plan' : 'Get Started'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa'
  },
  contentContainer: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666'
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    marginBottom: 16
  },
  retryButton: {
    padding: 12,
    backgroundColor: '#4285F4',
    borderRadius: 8
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 8,
    color: '#1a1a1a'
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    color: '#666'
  },
  intervalToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 32,
    paddingHorizontal: 20
  },
  intervalButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    marginHorizontal: 4,
    backgroundColor: '#fff'
  },
  intervalButtonActive: {
    backgroundColor: '#4285F4',
    borderColor: '#4285F4'
  },
  intervalButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666'
  },
  intervalButtonTextActive: {
    color: '#fff'
  },
  cardsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  cardPopular: {
    borderColor: '#4285F4',
    borderWidth: 2
  },
  badge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: '#4285F4',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1
  },
  tierName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1a1a1a'
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 24
  },
  price: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#1a1a1a'
  },
  priceInterval: {
    fontSize: 16,
    color: '#666',
    marginLeft: 4
  },
  features: {
    marginBottom: 24
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  featureIcon: {
    fontSize: 16,
    color: '#4CAF50',
    marginRight: 8,
    width: 20
  },
  featureText: {
    fontSize: 14,
    color: '#333',
    flex: 1
  },
  subscribeButton: {
    backgroundColor: '#24292e',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center'
  },
  subscribeButtonPrimary: {
    backgroundColor: '#4285F4'
  },
  subscribeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  currentPlanButton: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center'
  },
  currentPlanText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600'
  }
});
