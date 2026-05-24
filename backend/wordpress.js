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

async function wpFetch(url, options) {
  const res = await fetch(url, options);
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
  if (!imageUrl) return null;

  let imgBuffer, contentType;
  try {
    const imgRes = await fetch(imageUrl, { redirect: 'follow' });
    if (!imgRes.ok) throw new Error(`Image fetch returned ${imgRes.status}`);
    imgBuffer   = await imgRes.arrayBuffer();
    contentType = imgRes.headers.get('content-type') || 'image/jpeg';
  } catch (err) {
    console.warn(`  → Image download failed: ${err.message}`);
    return null;
  }

  const ext = contentType.includes('png')  ? 'png'
            : contentType.includes('webp') ? 'webp'
            : 'jpg';
  const filename = `niche-featured-${Date.now()}.${ext}`;

  try {
    const media = await wpFetch(`${apiBase(cfg)}/media`, {
      method: 'POST',
      headers: {
        'Authorization':       basicAuth(cfg.username, cfg.password),
        'Content-Type':        contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      body: imgBuffer,
    });
    return media.id;
  } catch (err) {
    console.warn(`  → Media upload failed: ${err.message}`);
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
  const cfg  = getConfig(site);

  // 1. Featured image
  console.log(`  → Uploading featured image to ${site}…`);
  const featuredMediaId = await uploadFeaturedImage(cfg, featured_image_url);
  console.log(featuredMediaId
    ? `  → Featured image uploaded (media ID: ${featuredMediaId})`
    : `  → Featured image skipped`);

  // 2. Categories
  let categoryIds = [];
  if (categories.length > 0) {
    console.log(`  → Resolving categories: ${categories.join(', ')}`);
    categoryIds = await Promise.all(
      categories.map(name => getOrCreateTerm(cfg, 'categories', name))
    );
  }

  // 3. Tags
  let tagIds = [];
  if (tags.length > 0) {
    console.log(`  → Resolving tags: ${tags.join(', ')}`);
    tagIds = await Promise.all(
      tags.map(name => getOrCreateTerm(cfg, 'tags', name))
    );
  }

  // 4. Append FAQ JSON-LD to post content
  const fullContent = content + buildFaqJsonLd(faq_schema);

  // 5. Publish post with RankMath meta fields
  const postPayload = {
    title,
    content:  fullContent,
    status,
    format:   'standard',
    ...(slug                  && { slug }),
    ...(featuredMediaId       && { featured_media: featuredMediaId }),
    ...(categoryIds.length > 0 && { categories: categoryIds }),
    ...(tagIds.length > 0      && { tags: tagIds }),
    meta: {
      rank_math_focus_keyword: focus_keyword,
      rank_math_description:   meta_description,
      rank_math_title:         title,
    },
  };

  console.log(`  → Creating post on ${site}…`);
  const post = await wpFetch(`${apiBase(cfg)}/posts`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': basicAuth(cfg.username, cfg.password),
    },
    body: JSON.stringify(postPayload),
  });

  return {
    postId: post.id,
    url:    post.link,
    slug:   post.slug,
  };
}

module.exports = { publishToWordPress };
