'use strict';

// Site → credentials map (populated from .env at runtime)
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

async function publishToWordPress({ site, title, content, status = 'publish' }) {
  const cfg = getConfig(site);
  const endpoint = cfg.url.replace(/\/$/, '') + '/wp-json/wp/v2/posts';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': basicAuth(cfg.username, cfg.password),
    },
    body: JSON.stringify({
      title,
      content,
      status,
      format: 'standard',
    }),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.message || body.error || msg;
    } catch (_) {}
    throw new Error(`WordPress publish failed for "${site}": ${msg}`);
  }

  const post = await res.json();
  return {
    postId: post.id,
    url: post.link,
    slug: post.slug,
  };
}

module.exports = { publishToWordPress };
