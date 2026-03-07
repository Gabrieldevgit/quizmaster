# QuizMaster — Railway Deployment Guide

## Architecture

```
Browser  ──→  Railway (Node.js/Express)  ──→  Groq API
                     │
                     └──→  Firebase Firestore
```

- The browser **never** sees `GROQ_API_KEY` or Firebase secrets
- All AI calls go through `POST /api/ai` on your server
- Firebase config is loaded at runtime from `GET /api/config`

---

## Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial QuizMaster deploy"
git remote add origin https://github.com/YOUR_USERNAME/quizmaster.git
git push -u origin main
```

---

## Step 2 — Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Choose **Deploy from GitHub repo** → select your repo
3. Railway auto-detects Node.js via `package.json`

---

## Step 3 — Set Environment Variables

In Railway → your service → **Variables** tab, add:

| Variable | Value | Description |
|---|---|---|
| `GROQ_API_KEY` | `gsk_...` | Your Groq API key |
| `GROQ_MODEL` | `llama-3.1-8b-instant` | Model to use (optional) |
| `FIREBASE_API_KEY` | `AIza...` | From Firebase console |
| `FIREBASE_PROJECT_ID` | `your-project-id` | Firebase project ID |
| `FIREBASE_MESSAGING_SENDER_ID` | `123456789` | From Firebase console |
| `FIREBASE_APP_ID` | `1:123:web:abc` | From Firebase console |

> **Where to find Firebase values:**
> Firebase Console → Project Settings → Your apps → SDK setup and configuration

---

## Step 4 — Deploy

Railway deploys automatically on every `git push`. You can also trigger manually
from the Railway dashboard.

---

## Local development

```bash
# Install dependencies
npm install

# Create .env file (never commit this)
cp .env.example .env
# Edit .env with your real values

# Start dev server
npm run dev
# → http://localhost:3000
```

Create `.env`:
```
GROQ_API_KEY=gsk_your_key_here
GROQ_MODEL=llama-3.1-8b-instant
FIREBASE_API_KEY=AIza...
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123:web:abc
```

---

## Security model

| What | Where stored | Visible in browser? |
|---|---|---|
| `GROQ_API_KEY` | Railway env var | ❌ Never |
| Firebase API key | Railway env var | ⚠️ Sent to browser via `/api/config` (safe — Firebase security is Firestore rules) |
| Admin passwords | SHA-256 hashes in `index.html` | ✅ Only hashes |

---

## API endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/config` | GET | Returns Firebase config + Groq model (no secrets) |
| `/api/ai` | POST | Proxies to Groq, adds auth header server-side |
| `/*` | GET | Serves `public/index.html` |

`/api/ai` is rate-limited to **20 requests / IP / minute** to prevent abuse.
