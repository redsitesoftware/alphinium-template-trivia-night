import React from 'react';
import { WebView } from 'react-native-webview';
import { SafeAreaView, StyleSheet, ActivityIndicator } from 'react-native';

export default function StripeCheckoutScreen({ route, navigation }) {
  const { url } = route.params;

  function handleNavigationStateChange(navState) {
    if (navState.url.includes('/subscription/success')) {
      navigation.replace('PaymentSuccess');
    } else if (navState.url.includes('/subscription/cancel')) {
      navigation.goBack();
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <WebView 
        source={{ uri: url }}
        onNavigationStateChange={handleNavigationStateChange}
        startInLoadingState={true}
        renderLoading={() => (
          <ActivityIndicator size={36} color="#4285F4" style={styles.loader} />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  },
  loader: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -20
  }
});
