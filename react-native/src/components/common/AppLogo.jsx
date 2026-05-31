import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';

/**
 * Consistent app logo + optional title for use across all screens.
 * size: 'sm' (48), 'md' (80), 'lg' (120)
 * showTitle: show "Trivia Night" text below logo
 */
export const AppLogo = ({ size = 'md', showTitle = false, style }) => {
  const dim = size === 'sm' ? 48 : size === 'lg' ? 120 : 80;
  return (
    <View style={[styles.container, style]}>
      <Image
        source={require('../../assets/logo-transparent.png')}
        style={{ width: dim, height: dim }}
        resizeMode="contain"
      />
      {showTitle && <Text style={styles.title}>Trivia Night</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    marginTop: 6,
  },
});

export default AppLogo;
