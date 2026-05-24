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

// Fetch image from URL and upload to WordPress media library; returns media ID or null
async function uploadFeaturedImage(cfg, imageUrl) {
  if (!imageUrl) {
    console.log(`  [wp] Featured image: skipped (no URL)`);
    return null;
  }

  let imgBuffer, contentType;
  try {
    const t = Date.now();
    console.log(`  [wp] Image download starting: ${imageUrl.slice(0, 80)}…`);
    const imgRes = await fetch(imageUrl, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    if (!imgRes.ok) throw new Error(`Image fetch returned ${imgRes.status}`);
    imgBuffer   = await imgRes.arrayBuffer();
    contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    console.log(`  [wp] Image download done (${wpElapsed(t)}) | ${(imgBuffer.byteLength / 1024).toFixed(0)} KB | type: ${contentType}`);
  } catch (err) {
    console.warn(`  [wp] Image download failed: ${err.message} — skipping featured image`);
    return null;
  }

  const ext      = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const filename = `niche-featured-${Date.now()}.${ext}`;

  try {
    const t = Date.now();
    console.log(`  [wp] Image upload to WP media library starting (${filename})…`);
    const media = await wpFetch(`${apiBase(cfg)}/media`, {
      method: 'POST',
      headers: {
        'Authorization':       basicAuth(cfg.username, cfg.password),
        'Content-Type':        contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      body: imgBuffer,
    });
    console.log(`  [wp] Image upload done (${wpElapsed(t)}) | media ID: ${media.id}`);
    return media.id;
  } catch (err) {
    console.warn(`  [wp] Media upload failed: ${err.message} — skipping featured image`);
    return null;
  }
}

// Find a term by exact name; create it if not found. Returns the term ID.
async function getOrCreateTerm(cfg, taxonomy, name) {
  const base = `${apiBase(cfg)}/${taxonomy}`;
  const auth  = basicAuth(cfg.username, cfg.password);

  try {
    const results = await wpFetch(
      `${base}?search=${encodeURIComponent(name)}&per_page=10`,
      { headers: { 'Authorization': auth } }
    );
    const match = results.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (match) return match.id;
  } catch (_) {}

  const created = await wpFetch(base, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': auth,
    },
    body: JSON.stringify({ name }),
  });
  return created.id;
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
  meta_description = '',
  focus_keyword    = '',
  featured_image_url,
  categories       = [],
  tags             = [],
  faq_schema       = [],
  status           = 'publish',
}) {
  const cfg     = getConfig(site);
  const wpStart = Date.now();
  console.log(`  [wp] publishToWordPress starting | site: ${site}`);

  // 1. Featured image
  const t1 = Date.now();
  const featuredMediaId = await uploadFeaturedImage(cfg, featured_image_url);
  console.log(`  [wp] Featured image step done (${wpElapsed(t1)})`);

  // 2. Categories
  let categoryIds = [];
  if (categories.length > 0) {
    const t2 = Date.now();
    console.log(`  [wp] Resolving ${categories.length} categories: ${categories.join(', ')}`);
    categoryIds = await Promise.all(categories.map(name => getOrCreateTerm(cfg, 'categories', name)));
    console.log(`  [wp] Categories resolved (${wpElapsed(t2)}) | IDs: ${categoryIds.join(', ')}`);
  }

  // 3. Tags
  let tagIds = [];
  if (tags.length > 0) {
    const t3 = Date.now();
    console.log(`  [wp] Resolving ${tags.length} tags: ${tags.join(', ')}`);
    tagIds = await Promise.all(tags.map(name => getOrCreateTerm(cfg, 'tags', name)));
    console.log(`  [wp] Tags resolved (${wpElapsed(t3)}) | IDs: ${tagIds.join(', ')}`);
  }

  // 4. Append FAQ JSON-LD to post content
  const fullContent = content + buildFaqJsonLd(faq_schema);

  // 5. Publish post with RankMath meta fields
  const postPayload = {
    title,
    content:  fullContent,
    status,
    format:   'standard',
    ...(slug                   && { slug }),
    ...(featuredMediaId        && { featured_media: featuredMediaId }),
    ...(categoryIds.length > 0 && { categories: categoryIds }),
    ...(tagIds.length > 0      && { tags: tagIds }),
    meta: {
      rank_math_focus_keyword: focus_keyword,
      rank_math_description:   meta_description,
      rank_math_title:         title,
    },
  };

  const t5 = Date.now();
  console.log(`  [wp] Creating post | title: "${title}" | content: ${fullContent.length} chars | categories: ${categoryIds.length} | tags: ${tagIds.length}`);
  const post = await wpFetch(`${apiBase(cfg)}/posts`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': basicAuth(cfg.username, cfg.password),
    },
    body: JSON.stringify(postPayload),
  });
  console.log(`  [wp] Post created (${wpElapsed(t5)}) | ID: ${post.id} | total WP time: ${wpElapsed(wpStart)}`);

  return {
    postId: post.id,
    url:    post.link,
    slug:   post.slug,
  };
}

module.exports = { publishToWordPress };
