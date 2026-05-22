'use strict';

require('dotenv').config();

const express            = require('express');
const cors               = require('cors');
const { generateNichePage }   = require('./claude');
const { publishToWordPress }  = require('./wordpress');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));           // Chrome extensions have no fixed origin
app.use(express.json({ limit: '10mb' }));

// ─── Request logger (dev-friendly) ────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── POST /generate ───────────────────────────────────────────────────────────
app.post('/generate', async (req, res) => {
  const { products, pageTitle, keyword, site } = req.body;

  // Validate
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ message: 'products must be a non-empty array.' });
  }
  if (!pageTitle || typeof pageTitle !== 'string' || !pageTitle.trim()) {
    return res.status(400).json({ message: 'pageTitle is required.' });
  }
  if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
    return res.status(400).json({ message: 'keyword is required.' });
  }
  if (!site || typeof site !== 'string') {
    return res.status(400).json({ message: 'site is required.' });
  }

  console.log(`Generating page: "${pageTitle}" | keyword: "${keyword}" | site: ${site} | products: ${products.length}`);

  try {
    // Step 1: generate HTML with Claude
    console.log('→ Calling Claude AI…');
    const html = await generateNichePage({
      products,
      pageTitle: pageTitle.trim(),
      keyword: keyword.trim(),
    });
    console.log(`→ Claude generated ${html.length} characters of HTML`);

    // Step 2: publish to WordPress
    console.log(`→ Publishing to WordPress (${site})…`);
    const result = await publishToWordPress({
      site,
      title: pageTitle.trim(),
      content: html,
    });
    console.log(`→ Published! Post ID: ${result.postId} | URL: ${result.url}`);

    res.json({
      success: true,
      postId: result.postId,
      url:    result.url,
      slug:   result.slug,
    });

  } catch (err) {
    console.error('Generate error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\nTemu Niche Backend running → http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log(`  GET  /health`);
  console.log(`  POST /generate\n`);
});
