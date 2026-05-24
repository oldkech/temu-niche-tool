'use strict';

const SITES = {
  'couponhubusa.com': {
    get url()      { return process.env.WP_COUPONHUBUSA_URL; },
    get username() { return process.env.WP_COUPONHUBUSA_USER; },
    get password() { return process.env.WP_COUPONHUBUSA_PASSWORD; },
  },
  'couponcodesglitch.com': {
    get url()      { return process.env.WP_COUPONCODESGLITCH_URL; },
    get username() { return process.env.WP_COUPONCODESGLITCH_USER; },
    get password() { return process.env.WP_COUPONCODESGLITCH_PASSWORD; },
  },
};

function getConfig(site) {
  const cfg = SITES[site];
  if (!cfg) throw new Error(`Unknown site: "${site}". Valid sites: ${Object.keys(SITES).join(', ')}`);
  if (!cfg.url || !cfg.username || !cfg.password) {
    throw new Error(`WordPress credentials not configured for "${site}". Check your .env file.`);
  }
  return cfg;
}

function basicAuth(username, password) {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

function apiBase(cfg) {
  return cfg.url.replace(/\/$/, '') + '/wp-json/wp/v2';
}

function wpElapsed(startMs) { return ((Date.now() - startMs) / 1000).toFixed(1) + 's'; }

// WordPress REST API call with a per-request 15s timeout
async function wpFetch(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res;
  try {
    res = await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error(`WP request timed out (15s): ${url}`);
    throw err;
  }
  clearTimeout(timer);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.message || body.error || msg;
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

// Build FAQ JSON-LD <script> block to append to post content
function buildFaqJsonLd(faqItems) {
  if (!faqItems || faqItems.length === 0) return '';

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return `\n\n<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

async function publishToWordPress({
  site,
  title,
  slug,
  content,
  faq_schema = [],
  status     = 'publish',
}) {
  const cfg     = getConfig(site);
  const wpStart = Date.now();
  console.log(`  [wp] publishToWordPress starting | site: ${site}`);

  const fullContent = content + buildFaqJsonLd(faq_schema);

  const postPayload = {
    title,
    content: fullContent,
    status,
    format:  'standard',
    ...(slug && { slug }),
  };

  console.log(`  [wp] Creating post | title: "${title}" | content: ${fullContent.length} chars`);
  const t = Date.now();
  const post = await wpFetch(`${apiBase(cfg)}/posts`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': basicAuth(cfg.username, cfg.password),
    },
    body: JSON.stringify(postPayload),
  });
  console.log(`  [wp] Post created (${wpElapsed(t)}) | ID: ${post.id} | total WP time: ${wpElapsed(wpStart)}`);

  return {
    postId: post.id,
    url:    post.link,
    slug:   post.slug,
  };
}

module.exports = { publishToWordPress };
