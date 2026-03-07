'use strict';

const express   = require('express');
const fetch     = require('node-fetch');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Load .env in local dev (Railway ignores this file, uses Variables tab) ────
try { require('dotenv').config(); } catch (_) { /* dotenv optional */ }

// ── Log env-var status at startup (safe: shows only first 6 chars) ────────────
const EXPECTED = [
  'GROQ_API_KEY',
  'FIREBASE_API_KEY',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID',
];
console.log('──────────────────────────────────────────');
console.log('QuizMaster — environment variable check:');
EXPECTED.forEach(k => {
  const val = process.env[k];
  if (val) console.log(`  ✅ ${k} = ${val.slice(0,6)}…`);
  else     console.warn(`  ⚠️  ${k} NOT SET`);
});
console.log('──────────────────────────────────────────');

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '64kb' }));

// ── Rate limiter for AI proxy ─────────────────────────────────────────────────
const aiLimiter = rateLimit({
  windowMs: 60_000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Trop de requêtes. Réessayez dans une minute.' },
});

// ── Helper: return 503 + instructions if vars are missing ────────────────────
function checkVars(res, vars) {
  const missing = vars.filter(k => !process.env[k]);
  if (!missing.length) return true; // all present
  res.status(503).json({
    error: 'Server misconfigured — environment variables missing.',
    missing_variables: missing,
    fix: 'Railway dashboard → your service → Variables tab → add the listed variables → redeploy.',
  });
  return false;
}

// ── GET /api/health — simple status page ─────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const missing = EXPECTED.filter(k => !process.env[k]);
  res.json({
    status:   missing.length === 0 ? 'ok' : 'degraded',
    missing,
    node:     process.version,
    port:     PORT,
  });
});

// ── GET /api/config — returns Firebase config (no secret keys) ───────────────
app.get('/api/config', (req, res) => {
  if (!checkVars(res, ['FIREBASE_API_KEY','FIREBASE_PROJECT_ID',
                        'FIREBASE_MESSAGING_SENDER_ID','FIREBASE_APP_ID'])) return;
  const pid = process.env.FIREBASE_PROJECT_ID;
  res.json({
    firebase: {
      apiKey:            process.env.FIREBASE_API_KEY,
      authDomain:        `${pid}.firebaseapp.com`,
      projectId:         pid,
      storageBucket:     `${pid}.appspot.com`,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId:             process.env.FIREBASE_APP_ID,
    },
    groqModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
  });
});

// ── POST /api/ai — proxies to Groq, key never leaves server ──────────────────
app.post('/api/ai', aiLimiter, async (req, res) => {
  if (!checkVars(res, ['GROQ_API_KEY'])) return;

  const { messages, model, max_tokens, temperature, response_format } = req.body;
  if (!messages || !Array.isArray(messages))
    return res.status(400).json({ error: 'messages array is required' });

  const payload = {
    model:       model || process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
    max_tokens:  max_tokens  || 1000,
    temperature: temperature ?? 0.7,
    messages,
  };
  if (response_format) payload.response_format = response_format;

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      console.error('Groq error:', upstream.status, JSON.stringify(data));
      return res.status(upstream.status).json({ error: data.error?.message || 'Groq API error' });
    }
    return res.json(data);
  } catch (err) {
    console.error('AI proxy error:', err.message);
    return res.status(502).json({ error: "Impossible de contacter l'IA. Réessayez." });
  }
});

// ── Serve frontend ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start — always starts, even with missing vars ─────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 QuizMaster on port ${PORT}`);
  console.log(`   /api/health → ${process.env.RAILWAY_PUBLIC_DOMAIN
    ? 'https://'+process.env.RAILWAY_PUBLIC_DOMAIN+'/api/health'
    : 'http://localhost:'+PORT+'/api/health'}\n`);
});
