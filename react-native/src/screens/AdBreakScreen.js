/**
 * AdBreakScreen — shown to all players before each round starts in ad-supported mode.
 *
 * The server broadcasts { type: 'ad_break', duration, round } which transitions
 * the game phase to 'ad_break'. This screen renders the mock Alphinium ad
 * for the server-specified duration, then the server triggers 'round_start'
 * which auto-navigates away.
 *
 * Source: alphinium-ads package (redsitesoftware/alphinium-ads)
 */

import React from 'react';
import AdInterstitial from '../ads/AdInterstitial';
import { useGame } from '../context/GameContext';

export default function AdBreakScreen() {
  const { state } = useGame();
  const { adBreakDuration = 15 } = state;

  // Server controls timing — onComplete is a no-op since round_start WS message
  // is what actually transitions the navigator away from this screen.
  return (
    <AdInterstitial
      duration={adBreakDuration}
      skipAfter={adBreakDuration} // no skip — server controls advance
      onComplete={null}
      provider="mock"
    />
  );
}
