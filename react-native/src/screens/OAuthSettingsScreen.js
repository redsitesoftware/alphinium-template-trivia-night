import React, { useState, useEffect, useContext } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  StyleSheet, 
  Alert,
  ActivityIndicator,
  Switch,
  TextInput,
  Linking
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { STRAPI_URL } from '../config';

export default function OAuthSettingsScreen() {
  const { user, token } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState({
    github: { enabled: false, configured: false },
    google: { enabled: false, configured: false },
    facebook: { enabled: false, configured: false }
  });
  
  const [editMode, setEditMode] = useState(false);
  const [credentials, setCredentials] = useState({
    github: { clientId: '', clientSecret: '' },
    google: { clientId: '', clientSecret: '' },
    facebook: { appId: '', appSecret: '' }
  });

  useEffect(() => {
    loadProviderStatus();
  }, []);

  async function loadProviderStatus() {
    try {
      // Check which providers are configured by testing callback URLs
      const checks = await Promise.all([
        checkProvider('github'),
        checkProvider('google'),
        checkProvider('facebook')
      ]);
      
      setProviders({
        github: checks[0],
        google: checks[1],
        facebook: checks[2]
      });
    } catch (error) {
      console.error('Failed to load provider status:', error);
    } finally {
      setLoading(false);
    }
  }

  async function checkProvider(provider) {
    try {
      const response = await fetch(`${STRAPI_URL}/api/connect/${provider}`);
      // If redirect or 200, provider is configured
      return {
        enabled: response.status !== 404,
        configured: response.status !== 404
      };
    } catch (error) {
      return { enabled: false, configured: false };
    }
  }

  function handleProviderToggle(provider) {
    if (!providers[provider].configured) {
      Alert.alert(
        'Not Configured',
        `${provider.charAt(0).toUpperCase() + provider.slice(1)} OAuth is not configured yet. Configure it in backend/.env or Strapi admin panel.`,
        [
          { text: 'Open Setup Guide', onPress: () => openSetupGuide(provider) },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }
    
    Alert.alert('Coming Soon', 'Toggle functionality will be available in admin panel');
  }

  function openSetupGuide(provider) {
    const urls = {
      github: 'https://github.com/settings/developers',
      google: 'https://console.cloud.google.com/apis/credentials',
      facebook: 'https://developers.facebook.com/apps'
    };
    
    Linking.openURL(urls[provider]);
  }

  async function runConfigurationWizard() {
    Alert.alert(
      '🧙 OAuth Configuration Wizard',
      'This will guide you through setting up OAuth providers.\n\nSteps:\n1. Create OAuth apps\n2. Configure credentials\n3. Test login flow',
      [
        {
          text: 'Start Setup',
          onPress: () => Alert.alert(
            'Setup Instructions',
            [
              { text: 'Open GitHub Setup', onPress: () => Linking.openURL('https://github.com/settings/developers') },
              { text: 'OK' }
            ]
          )
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  }

  async function testOAuthFlow(provider) {
    const testUrl = `${STRAPI_URL}/api/connect/${provider}`;
    Alert.alert(
      `Test ${provider} Login`,
      `This will open ${provider} OAuth flow.\n\nURL: ${testUrl}`,
      [
        { text: 'Open', onPress: () => Linking.openURL(testUrl) },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size={36} color="#4285F4" />
        <Text style={styles.loadingText}>Checking OAuth providers...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.header}>
        <Text style={styles.title}>OAuth Settings</Text>
        <Text style={styles.subtitle}>Configure social login providers</Text>
      </View>

      {/* Quick Setup Button */}
      <TouchableOpacity style={styles.wizardButton} onPress={runConfigurationWizard}>
        <Text style={styles.wizardButtonIcon}>🧙</Text>
        <View style={styles.wizardButtonContent}>
          <Text style={styles.wizardButtonTitle}>OAuth Setup Wizard</Text>
          <Text style={styles.wizardButtonSubtitle}>Interactive configuration tool</Text>
        </View>
        <Text style={styles.wizardButtonArrow}>→</Text>
      </TouchableOpacity>

      {/* Providers List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Social Providers</Text>
        
        {/* GitHub */}
        <View style={styles.providerCard}>
          <View style={styles.providerHeader}>
            <View style={styles.providerInfo}>
              <Text style={styles.providerName}>GitHub</Text>
              <Text style={styles.providerStatus}>
                {providers.github.configured ? '✓ Configured' : '⚠ Not configured'}
              </Text>
            </View>
            <Switch
              value={providers.github.enabled}
              onValueChange={() => handleProviderToggle('github')}
              disabled={!providers.github.configured}
            />
          </View>
          <Text style={styles.providerDescription}>
            Allow users to sign in with their GitHub account
          </Text>
          <View style={styles.providerActions}>
            <TouchableOpacity 
              style={styles.linkButton}
              onPress={() => openSetupGuide('github')}
            >
              <Text style={styles.linkButtonText}>Setup Guide</Text>
            </TouchableOpacity>
            {providers.github.configured && (
              <TouchableOpacity 
                style={styles.testButton}
                onPress={() => testOAuthFlow('github')}
              >
                <Text style={styles.testButtonText}>Test Login</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Google */}
        <View style={styles.providerCard}>
          <View style={styles.providerHeader}>
            <View style={styles.providerInfo}>
              <Text style={styles.providerName}>Google</Text>
              <Text style={styles.providerStatus}>
                {providers.google.configured ? '✓ Configured' : '⚠ Not configured'}
              </Text>
            </View>
            <Switch
              value={providers.google.enabled}
              onValueChange={() => handleProviderToggle('google')}
              disabled={!providers.google.configured}
            />
          </View>
          <Text style={styles.providerDescription}>
            Allow users to sign in with their Google account
          </Text>
          <View style={styles.providerActions}>
            <TouchableOpacity 
              style={styles.linkButton}
              onPress={() => openSetupGuide('google')}
            >
              <Text style={styles.linkButtonText}>Setup Guide</Text>
            </TouchableOpacity>
            {providers.google.configured && (
              <TouchableOpacity 
                style={styles.testButton}
                onPress={() => testOAuthFlow('google')}
              >
                <Text style={styles.testButtonText}>Test Login</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Facebook */}
        <View style={styles.providerCard}>
          <View style={styles.providerHeader}>
            <View style={styles.providerInfo}>
              <Text style={styles.providerName}>Facebook</Text>
              <Text style={styles.providerStatus}>
                {providers.facebook.configured ? '✓ Configured' : '⚠ Not configured'}
              </Text>
            </View>
            <Switch
              value={providers.facebook.enabled}
              onValueChange={() => handleProviderToggle('facebook')}
              disabled={!providers.facebook.configured}
            />
          </View>
          <Text style={styles.providerDescription}>
            Allow users to sign in with their Facebook account
          </Text>
          <View style={styles.providerActions}>
            <TouchableOpacity 
              style={styles.linkButton}
              onPress={() => openSetupGuide('facebook')}
            >
              <Text style={styles.linkButtonText}>Setup Guide</Text>
            </TouchableOpacity>
            {providers.facebook.configured && (
              <TouchableOpacity 
                style={styles.testButton}
                onPress={() => testOAuthFlow('facebook')}
              >
                <Text style={styles.testButtonText}>Test Login</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Backend Configuration */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Backend Configuration</Text>
        
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🔧 Setup Methods</Text>
          
          <Text style={styles.infoMethod}>1. Interactive Wizard (Recommended)</Text>
          
          <Text style={styles.infoMethod}>2. From Environment Variables</Text>
          
          <Text style={styles.infoMethod}>3. Manual (Strapi Admin)</Text>
          <Text style={styles.infoCode}>Settings → Users & Permissions → Providers</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📋 Callback URLs</Text>
          <Text style={styles.callbackUrl}>GitHub: {STRAPI_URL}/api/connect/github/callback</Text>
          <Text style={styles.callbackUrl}>Google: {STRAPI_URL}/api/connect/google/callback</Text>
          <Text style={styles.callbackUrl}>Facebook: {STRAPI_URL}/api/connect/facebook/callback</Text>
        </View>
      </View>

      {/* Documentation Links */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Documentation</Text>
        
        <TouchableOpacity 
          style={styles.docLink}
          onPress={() => Linking.openURL('https://docs.strapi.io/dev-docs/plugins/users-permissions#providers')}
        >
          <Text style={styles.docLinkText}>📖 Strapi OAuth Documentation</Text>
        </TouchableOpacity>
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
  header: {
    padding: 24,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 16,
    color: '#666'
  },
  wizardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4285F4',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  wizardButtonIcon: {
    fontSize: 32,
    marginRight: 16
  },
  wizardButtonContent: {
    flex: 1
  },
  wizardButtonTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4
  },
  wizardButtonSubtitle: {
    fontSize: 14,
    color: '#e3f2fd'
  },
  wizardButtonArrow: {
    fontSize: 24,
    color: '#fff',
    marginLeft: 12
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1a1a1a'
  },
  providerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0'
  },
  providerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  providerInfo: {
    flex: 1
  },
  providerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4
  },
  providerStatus: {
    fontSize: 14,
    color: '#666'
  },
  providerDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12
  },
  providerActions: {
    flexDirection: 'row',
    gap: 8
  },
  linkButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4285F4'
  },
  linkButtonText: {
    color: '#4285F4',
    fontSize: 14,
    fontWeight: '600'
  },
  testButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#4CAF50'
  },
  testButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0'
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12
  },
  infoMethod: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 12,
    marginBottom: 4
  },
  infoCode: {
    fontSize: 12,
    fontFamily: 'Courier',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 6,
    color: '#333',
    marginBottom: 8
  },
  callbackUrl: {
    fontSize: 12,
    fontFamily: 'Courier',
    color: '#666',
    marginBottom: 8,
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 4
  },
  docLink: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0'
  },
  docLinkText: {
    fontSize: 14,
    color: '#4285F4',
    fontWeight: '500'
  }
});
