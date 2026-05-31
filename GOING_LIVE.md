# Trivia Night — Going Live Checklist

## Overview
Live hosted trivia platform for pubs, venues and corporate events. Revenue via venue subscriptions + alphinium-ads.

## Step 1: Real Question Bank
1. Integrate Open Trivia DB (free, 4000+ questions): `opentdb.com/api.php?amount=10&category=...`
2. Or alphinium-ai generated questions by topic on demand
3. Category selector: Sports, Music, Science, History, Movies, General Knowledge
4. Difficulty: Easy / Medium / Hard
5. Host can add custom questions

## Step 2: Real Multiplayer (alphinium-games-multiplayer)
1. WebSocket room: host controls game, players answer on their phones
2. Answer submission with countdown timer
3. Score leaderboard updates in real-time after each question
4. Final podium screen with confetti

## Step 3: Venue Features
- Custom venue branding (logo, colours)
- Question pack marketplace — venues buy themed packs ($4.99 each)
- "Pub Quiz Pro" monthly plan: $29/mo — unlimited questions, custom branding, analytics

## Step 4: alphinium-ads
- Free tier: alphinium-ads banners on player devices during answer wait time
- Sponsored question rounds ("Round 4 brought to you by Corona")
- Local business ad targeting (within 10km of venue)

## Step 5: Deploy
- Host dashboard: `trivia.alphinium.com/host`
- Player join: `trivia.alphinium.com/play` + room code
- No app download required — browser-based QR code join
- App for frequent hosts (iOS/Android)

## Upsell Opportunities
- alphinium-payments: sell tokens/credits for power-ups (double points, skip question)
- Leaderboard subscriptions (venues that run weekly trivia show season standings)
- White-label for pub chains / hospitality groups
