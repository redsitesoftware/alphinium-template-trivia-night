/**
 * AdInterstitial — full-screen interstitial ad component.
 *
 * Wraps the active ad provider (mock, AdMob, MAX, etc.).
 * In development or alphinium-managed mode, renders MockAlphiniumAd.
 *
 * Props:
 *   duration   {number}  Total ad duration in seconds (default: 15)
 *   skipAfter  {number}  Seconds before skip button appears (default: 10)
 *   onComplete {func}    Called when ad finishes or is skipped
 *   provider   {string}  'mock' | 'admob' | 'max' (default: 'mock')
 */

import React from 'react';
import MockAlphiniumAd from './MockAlphiniumAd';

export default function AdInterstitial({ duration = 15, skipAfter = 10, onComplete, provider = 'mock' }) {
  // Future: switch on provider for AdMob / MAX native ad views
  return (
    <MockAlphiniumAd
      duration={duration}
      skipAfter={skipAfter}
      onComplete={onComplete}
    />
  );
}
