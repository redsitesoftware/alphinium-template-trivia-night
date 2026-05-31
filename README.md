# 🎮 Trivia Night

AI-powered multiplayer trivia game. Host creates a room, players join via code, and the AI generates custom questions on any topic in real time. Supports Standard, Chase, and Buzzer game modes with voice narration and credit-based AI usage.

**Live:** https://trivia.user-pods.alphinium.io

---

## Quick Start (Alphinium user-pods)

```bash
user-pods deploy \
  --image us-central1-docker.pkg.dev/alphinium-production/user-pods/trivia-night:latest \
  --name my-trivia \
  --port 3000 \
  --env GROQ_API_KEY=gsk_...
```

That's enough to get a working game. Add optional env vars below to unlock payments, voice, analytics, and admin access.

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Groq API key for AI question generation. Get one free at [console.groq.com](https://console.groq.com). Without this the app falls back to a static question bank. |

### Optional — AI

| Variable | Default | Description |
|----------|---------|-------------|
| `GROQ_MODEL` | `llama-3.1-8b-instant` | Groq model to use for question generation. |

### Optional — Voice (TTS)

| Variable | Description |
|----------|-------------|
| `ELEVENLABS_API_KEY` | ElevenLabs API key for AI voice narration. Without this, voice is disabled. Get one at [elevenlabs.io](https://elevenlabs.io). |

### Optional — Payments

| Variable | Description |
|----------|-------------|
| `PAYMENTS_API_URL` | Base URL of the Alphinium payments API (e.g. `https://payments-api.alphinium.com`). Required for credit deduction. |
| `TRIVIA_API_SECRET` | Shared secret for server-to-payments authentication (`x-trivia-secret` header). Must match what the payments API expects. |

### Optional — Admin

| Variable | Description |
|----------|-------------|
| `ADMIN_USER_NAMES` | Comma-separated display names that bypass credit enforcement (e.g. `dan,alice`). Case-insensitive. |
| `ADMIN_USER_IDS` | Comma-separated Strapi user ID integers that bypass credit enforcement. |

### Optional — Analytics

| Variable | Description |
|----------|-------------|
| `GOOGLE_ANALYTICS_ID` | Google Analytics 4 Measurement ID (e.g. `G-XXXXXXXXXX`). Injected into `index.html` at server startup — **no image rebuild required**. See [GA Setup](#google-analytics-setup) below. |

---

## Google Analytics Setup

To enable GA tracking for your deployment:

1. Go to [analytics.google.com](https://analytics.google.com) → **Admin** → **Create Property**
2. Choose **Web**, enter your deployment URL
3. Copy the **Measurement ID** (format: `G-XXXXXXXXXX`)
4. Redeploy with:
   ```bash
   user-pods deploy ... --env GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX
   ```

The GA snippet is injected into `index.html` at server startup from the env var — you don't need to rebuild the Docker image. Every page view and navigation event is tracked automatically via gtag.

---

## Building from Source

```bash
# Build Docker image
docker build -t trivia-night .

# Run locally
docker run -p 3000:3000 \
  -e GROQ_API_KEY=gsk_... \
  trivia-night
```

Or use the Alphinium build pipeline:
```bash
user-pods bd \
  --repo https://github.com/redsitesoftware/trivia-night \
  --app-id trivia \
  --env GROQ_API_KEY=gsk_...
```

---

## Running Tests

**Unit tests:**
```bash
npm test
```

**E2E tests (Playwright — "Valerie" suite):**
```bash
# Against production
npx playwright test tests/e2e/valerie.spec.js

# Against a specific URL
SITE_URL=https://your-pod.user-pods.alphinium.io npx playwright test tests/e2e/valerie.spec.js
```

The Valerie suite covers 14 scenarios: room creation, lobby, AI question generation, game flow, round results, Chase mode, and Buzzer mode.

---

## Architecture

- **Backend:** Node.js + Express + WebSocket (`ws`) — `server.js`
- **Frontend:** React Native Web (Expo) — `react-native/`
- **AI:** Groq (Llama 3.1) via `src/aiHost.js`; falls back to static question bank
- **Voice:** ElevenLabs TTS via `src/tts.js` with disk cache
- **Payments:** Alphinium payments API for credit deduction
- **Auth:** Facebook OAuth (Strapi-backed)

## Game Modes

| Mode | Description |
|------|-------------|
| **Standard** | Classic timed quiz — fastest correct answer scores highest |
| **Chase** | One player "chases" others; answering before the timer ends the round early |
| **Buzzer** | Players buzz in to answer; first to buzz gets to answer |

---

## Deployment Notes

- The Docker image injects a cache-bust version script into `index.html` at build time
- `GOOGLE_ANALYTICS_ID` is injected at **server startup** (runtime), not build time — no rebuild needed to change GA properties
- The SPA catch-all serves `index.html` for all non-API routes (React Navigation deep links work)
- TTS audio is cached to disk under `tts_cache/` on first generation
