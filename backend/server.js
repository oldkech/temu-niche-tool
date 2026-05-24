'use strict';

require('dotenv').config();

const express                 = require('express');
const cors                    = require('cors');
const { generateNichePage }   = require('./claude');
const { publishToWordPress }  = require('./wordpress');

const app  = express();
const PORT = process.env.PORT || 3000;

const CLAUDE_TIMEOUT_MS = 120_000;
const WP_TIMEOUT_MS     = 60_000;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function ts() { return new Date().toISOString(); }
function elapsed(startMs) { return ((Date.now() - startMs) / 1000).toFixed(1) + 's'; }

// Race a promise against a timeout; throws a clear message if deadline is hit
function withTimeout(promise, ms, label) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s — "${label}" did not complete`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

app.use((req, _res, next) => {
  console.log(`[${ts()}] ${req.method} ${req.path}`);
  next();
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: ts() });
});

// ─── POST /generate ───────────────────────────────────────────────────────────
app.post('/generate', async (req, res) => {
  const { products, pageTitle, keyword, site } = req.body;

  if (!Array.isArray(products) || products.length === 0)
    return res.status(400).json({ message: 'products must be a non-empty array.' });
  if (!pageTitle || typeof pageTitle !== 'string' || !pageTitle.trim())
    return res.status(400).json({ message: 'pageTitle is required.' });
  if (!keyword || typeof keyword !== 'string' || !keyword.trim())
    return res.status(400).json({ message: 'keyword is required.' });
  if (!site || typeof site !== 'string')
    return res.status(400).json({ message: 'site is required.' });

  const reqStart = Date.now();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${ts()}] REQUEST  site=${site}  products=${products.length}  keyword="${keyword}"`);

  let step = 'init';
  try {

    // ── Step 1: Claude AI ──────────────────────────────────────────────────────
    step = 'claude';
    const t1 = Date.now();
    console.log(`[${ts()}] STEP 1/2 — Claude AI starting…`);
    console.log(`          model: claude-sonnet-4-6  |  timeout: ${CLAUDE_TIMEOUT_MS / 1000}s`);

    const page = await withTimeout(
      generateNichePage({ products, pageTitle: pageTitle.trim(), keyword: keyword.trim() }),
      CLAUDE_TIMEOUT_MS,
      'Claude AI generation'
    );

    console.log(`[${ts()}] STEP 1/2 — Claude AI done (${elapsed(t1)})`);
    console.log(`          title: "${page.title}"`);
    console.log(`          html_body: ${page.html_body.length} chars  |  faqs: ${page.faq_schema.length}  |  tags: ${(page.tags || []).length}`);

    // ── Step 2: WordPress publish ──────────────────────────────────────────────
    step = 'wordpress';
    const t2 = Date.now();
    console.log(`[${ts()}] STEP 2/2 — WordPress publish starting  (site: ${site})…`);
    console.log(`          timeout: ${WP_TIMEOUT_MS / 1000}s`);

    const result = await withTimeout(
      publishToWordPress({
        site,
        title:              page.title,
        slug:               page.slug,
        content:            page.html_body,
        meta_description:   page.meta_description,
        focus_keyword:      page.focus_keyword,
        featured_image_url: page.featured_image_url,
        categories:         page.categories,
        tags:               page.tags,
        faq_schema:         page.faq_schema,
      }),
      WP_TIMEOUT_MS,
      `WordPress publish to ${site}`
    );

    console.log(`[${ts()}] STEP 2/2 — WordPress done (${elapsed(t2)})`);
    console.log(`          post ID: ${result.postId}  |  URL: ${result.url}`);
    console.log(`[${ts()}] REQUEST COMPLETE (total: ${elapsed(reqStart)})`);
    console.log(`${'─'.repeat(60)}\n`);

    res.json({ success: true, postId: result.postId, url: result.url, slug: result.slug });

  } catch (err) {
    const isTimeout = err.message.startsWith('Timed out');
    const label     = isTimeout ? 'TIMEOUT' : 'ERROR';
    console.error(`[${ts()}] ${label} at step "${step}" after ${elapsed(reqStart)}`);
    console.error(`          ${err.stack || err.message}`);
    console.log(`${'─'.repeat(60)}\n`);

    res.status(500).json({
      message: isTimeout
        ? `${err.message}. Try again or check your network connection.`
        : `Failed at step "${step}": ${err.message}`,
      step,
      timedOut: isTimeout,
    });
  }
});

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\nTemu Niche Backend running → http://localhost:${PORT}`);
  console.log(`  Claude timeout : ${CLAUDE_TIMEOUT_MS / 1000}s`);
  console.log(`  WordPress timeout : ${WP_TIMEOUT_MS / 1000}s`);
  console.log('Endpoints:');
  console.log(`  GET  /health`);
  console.log(`  POST /generate\n`);
});
