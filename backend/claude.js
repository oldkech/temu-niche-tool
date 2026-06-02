'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Coupon constants ──────────────────────────────────────────────────────────
const COUPON_PRIMARY = 'ALH082428';
const COUPON_BACKUP  = 'ALI111905';
const AFFILIATE_URL  = 'https://temu.to/k/ptbdgyc9tjy';
const META_PREFIX    = `${COUPON_PRIMARY} is the best verified Temu coupon code for May 2026.`;

const COUPON_FAQ = {
  question: 'Is there a Temu coupon code for May 2026?',
  answer: `Yes! The best verified Temu coupon code for May 2026 is ${COUPON_PRIMARY}. Enter it at checkout to unlock your discount on thousands of products sitewide. If ${COUPON_PRIMARY} has already been used on your account, try backup code ${COUPON_BACKUP}. Both codes are free to use and require no minimum order.`,
};

// ─── Static HTML blocks injected after Claude's output ────────────────────────

const COUPON_BANNER_HTML = `<div class="coupon-banner">
  <span class="coupon-tag">🏷️ EXCLUSIVE COUPON</span>
  <p class="coupon-headline">Use Temu Coupon Code <strong>${COUPON_PRIMARY}</strong> for Extra Savings!</p>
  <p class="coupon-sub">Enter <strong>${COUPON_PRIMARY}</strong> at checkout &middot; Backup code: <strong>${COUPON_BACKUP}</strong></p>
  <a class="coupon-cta" href="${AFFILIATE_URL}" target="_blank" rel="nofollow">Claim Your Discount on Temu &rarr;</a>
</div>`;

const CLOSING_SECTION_HTML = `<section class="promo-footer">
  <h2>Don&rsquo;t Forget Your Temu Coupon Code: ${COUPON_PRIMARY}</h2>
  <p>Before you check out, apply coupon code <strong>${COUPON_PRIMARY}</strong> &mdash; the best verified Temu coupon code for May 2026. It works sitewide on thousands of products including everything on this page.</p>
  <p>Backup code if needed: <strong>${COUPON_BACKUP}</strong></p>
  <a class="coupon-cta" href="${AFFILIATE_URL}" target="_blank" rel="nofollow">Shop on Temu &amp; Apply Code ${COUPON_PRIMARY} &rarr;</a>
</section>`;

const COUPON_CSS = `  .coupon-banner{background:linear-gradient(135deg,#f97316,#ea580c);border-radius:12px;padding:28px 24px;margin:28px 0;text-align:center;color:#fff}
  .coupon-tag{display:inline-block;background:rgba(0,0,0,.2);border-radius:20px;padding:4px 14px;font-size:.78rem;font-weight:700;letter-spacing:1px;margin-bottom:12px}
  .coupon-headline{font-size:1.25rem;font-weight:700;margin:0 0 8px}
  .coupon-sub{margin:0 0 18px;opacity:.9;font-size:.95rem}
  .coupon-cta{display:inline-block;background:#fff;color:#ea580c;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none}
  .coupon-cta:hover{background:#fff7ed}
  .promo-footer{background:#0f3460;color:#fff;border-radius:12px;padding:36px 28px;margin-top:36px;text-align:center}
  .promo-footer h2{color:#ffd166;margin:0 0 16px}
  .promo-footer p{opacity:.9;margin:0 0 12px;line-height:1.6}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function upgradeImageUrl(url) {
  if (!url) return url;
  url = url.replace(/_thumbnail(?=[.?&]|$)/gi, '_large');
  url = url.replace(/_\d+x\d+(?=[.?&]|$)/gi, '');
  return url;
}

function stripEmojis(html) {
  return html.replace(/\p{Extended_Pictographic}/gu, '');
}

function buildProductSummaries(products) {
  return products.slice(0, 5).map((p, i) => [
    `### Product ${i + 1}: ${p.title || 'Untitled'}`,
    `- Price: ${p.price || 'N/A'}`,
    `- Rating: ${p.rating || 'N/A'}/5 (${p.reviewCount || 0} reviews)`,
    `- Categories: ${(p.categories || []).join(', ') || 'General'}`,
    `- Affiliate Link: ${p.affiliateLink}`,
    `- Description: ${p.description || 'No description provided.'}`,
    `- Images: ${(p.images || []).slice(0, 2).map(upgradeImageUrl).join(' | ') || 'none'}`,
  ].join('\n')).join('\n\n');
}

function toSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function autoTitle(products) {
  const cats = products.flatMap(p => p.categories || []);
  if (cats.length > 0) {
    const freq = {};
    cats.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
    return `Best ${top} Deals on Temu 2026`;
  }
  const words = (products[0]?.title || 'Temu Products').split(/\s+/).slice(0, 4).join(' ');
  return `${words} – Best Deals 2026`;
}

function autoKeyword(products) {
  const cats = products.flatMap(p => p.categories || []);
  if (cats.length > 0) {
    const freq = {};
    cats.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
    return `cheap ${top.toLowerCase()} deals`;
  }
  const stop = new Set(['the','a','an','and','or','for','in','on','at','to','with','of','from','pcs','pc','set','pack','new','mini']);
  const freq = {};
  products.forEach(p => {
    (p.title || '').toLowerCase().split(/[\s,\-/]+/).forEach(w => {
      const c = w.replace(/[^a-z0-9]/g, '');
      if (c.length > 3 && !stop.has(c)) freq[c] = (freq[c] || 0) + 1;
    });
  });
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w]) => w);
  return top.length ? `${top.join(' ')} deals` : 'temu deals 2026';
}

// ─── HTML post-processors (guaranteed injection regardless of Claude output) ──

// Inject coupon banner after the intro paragraph (first </p> after </h1>)
function injectCouponBanner(html) {
  if (html.includes('coupon-banner')) return html;
  const patched = html.replace(/(<\/h1>[\s\S]*?<\/p>)/, `$1\n${COUPON_BANNER_HTML}\n`);
  return patched !== html ? patched : html + '\n' + COUPON_BANNER_HTML;
}

// Append dark closing section before end of content
function injectClosingSection(html) {
  if (html.includes('promo-footer')) return html;
  return html + '\n' + CLOSING_SECTION_HTML;
}

// Force all .cta-btn and .coupon-cta links to the fixed affiliate URL
function fixCtaLinks(html) {
  return html.replace(/<a\b([^>]*)href="[^"]*"([^>]*)>/gi, (match, before, after) => {
    if (!/class="[^"]*(?:cta-btn|coupon-cta)/.test(before + after)) return match;
    return `<a${before}href="${AFFILIATE_URL}"${after}>`;
  });
}

// Inject coupon CSS into the existing <style> block, or prepend a new one
function injectCouponCss(html) {
  if (html.includes('coupon-banner{') || html.includes('coupon-banner {')) return html;
  if (/<\/style>/i.test(html)) return html.replace(/<\/style>/i, `${COUPON_CSS}\n</style>`);
  return `<style>\n${COUPON_CSS}\n</style>\n` + html;
}

// Ensure coupon FAQ is the first item in the array
function ensureCouponFaq(faqArray) {
  const already = faqArray.some(f => /ALH082428|may 2026 coupon/i.test(f.question + f.answer));
  if (already) return faqArray;
  return [COUPON_FAQ, ...faqArray];
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function generateNichePage({ products, pageTitle, keyword }) {
  pageTitle = (pageTitle && pageTitle.trim()) || autoTitle(products);
  keyword   = (keyword   && keyword.trim())   || autoKeyword(products);

  const productSummaries = buildProductSummaries(products);
  const featuredImageUrl = upgradeImageUrl(products.find(p => p.images && p.images.length > 0)?.images[0] || '');

  const system = `You are an expert affiliate content writer specialising in deal and coupon sites. \
You produce clean, engaging, SEO-optimised niche pages that convert readers into buyers. \
Write in a warm, helpful tone. Never fabricate prices or ratings — use only the data provided. \
You MUST return ONLY valid JSON — no markdown fences, no prose before or after the JSON object.`;

  const user = `Create a niche affiliate page and return ONLY valid JSON (no markdown).

Title: ${pageTitle} | Keyword: "${keyword}"
Coupon: ${COUPON_PRIMARY} | Backup: ${COUPON_BACKUP} | Affiliate: ${AFFILIATE_URL}
Featured image: ${featuredImageUrl}

=== PRODUCTS ===
${productSummaries}

=== JSON STRUCTURE ===
{
  "title": "${pageTitle}",
  "slug": "url-safe-slug",
  "meta_description": "${META_PREFIX} [one sentence about ${keyword}, 150-160 chars total]",
  "focus_keyword": "temu coupon code, ${keyword}",
  "html_body": "...",
  "featured_image_url": "${featuredImageUrl}",
  "categories": ["...", "..."],
  "tags": ["temu coupon code", "${COUPON_PRIMARY}", "..."],
  "faq_schema": [
    {"question":"${COUPON_FAQ.question}","answer":"[detailed answer mentioning ${COUPON_PRIMARY} and ${COUPON_BACKUP}]"},
    {"question":"...","answer":"..."},
    {"question":"...","answer":"..."},
    {"question":"...","answer":"..."},
    {"question":"...","answer":"..."}
  ]
}

html_body is a complete HTML fragment (no html/head/body tags):
1. <style> — clean minimal design, max-width:960px, font-family sans-serif, card box-shadow 0 2px 8px rgba(0,0,0,.08), orange #f97316 accents, dark #0f3460 promo-footer, responsive. NO emoji characters anywhere.
2. <h1> with "${keyword}" naturally
3. Intro paragraph 80-120 words for "${keyword}"
4. <div class="coupon-banner"> — orange gradient, ${COUPON_PRIMARY} headline, <a class="coupon-cta" href="${AFFILIATE_URL}">
5. Up to 5 <article class="product-card"> — h2 (product name, no emoji), image block (use <img src="[url]" alt="..." loading="lazy" style="width:100%;max-height:220px;object-fit:contain"> if image URL is provided; if no image use <div class="img-placeholder" style="background:#f3f4f6;min-height:180px;display:flex;align-items:center;justify-content:center;border-radius:8px;color:#6b7280;font-weight:500;font-size:.9rem">[product name]</div>), price badge, bullet benefits, <a class="cta-btn" href="${AFFILIATE_URL}">
6. <section class="buying-guide"> — 3-point guide for "${keyword}" shoppers
7. <section class="why-temu"> — 3 benefit bullets
8. <section class="promo-footer"> — dark block, ${COUPON_PRIMARY} headline, <a class="coupon-cta" href="${AFFILIATE_URL}">

"${keyword}" appears 4-6 times naturally. ALL .cta-btn and .coupon-cta must use href="${AFFILIATE_URL}". NO emoji characters anywhere in the HTML — no 🛍️ ⭐ 🔥 or any other emoji icon.`;

  const promptChars = system.length + user.length;
  console.log(`  [claude] API call starting | products: ${products.length} | prompt: ~${promptChars} chars`);
  const apiStart = Date.now();

  const response = await client.messages.create(
    {
      model:      'claude-sonnet-4-6',
      max_tokens: 4000,
      system,
      messages:   [{ role: 'user', content: user }],
    },
    { timeout: 115_000 } // SDK-level timeout, slightly under server's 120s outer limit
  );

  const apiElapsed = ((Date.now() - apiStart) / 1000).toFixed(1);
  console.log(`  [claude] API call done (${apiElapsed}s) | stop_reason: ${response.stop_reason} | output_tokens: ${response.usage?.output_tokens ?? '?'}`);

  console.log(`  [claude] Parsing JSON response…`);
  const parseStart = Date.now();

  let text = response.content[0].text.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
    console.log(`  [claude] JSON parsed OK (${((Date.now() - parseStart) / 1000).toFixed(2)}s)`);
  } catch (e) {
    console.warn(`  [claude] JSON parse failed — wrapping raw text as html_body fallback`);
    parsed = {
      title:             pageTitle,
      slug:              toSlug(pageTitle),
      meta_description:  META_PREFIX,
      focus_keyword:     `temu coupon code, ${keyword}`,
      html_body:         text,
      featured_image_url: featuredImageUrl,
      categories:        ['Deals'],
      tags:              [keyword, 'temu coupon code', COUPON_PRIMARY],
      faq_schema:        [],
    };
  }

  // ─── Guarantee every required field ─────────────────────────────────────────

  if (!parsed.slug)               parsed.slug               = toSlug(parsed.title || pageTitle);
  if (!parsed.featured_image_url) parsed.featured_image_url = featuredImageUrl;
  if (!Array.isArray(parsed.categories)) parsed.categories  = ['Deals'];
  if (!Array.isArray(parsed.tags))       parsed.tags        = [keyword];
  if (!Array.isArray(parsed.faq_schema)) parsed.faq_schema  = [];

  // focus_keyword always contains "temu coupon code"
  parsed.focus_keyword = `temu coupon code, ${keyword}`;

  // meta_description always starts with META_PREFIX
  if (!parsed.meta_description || !parsed.meta_description.startsWith(META_PREFIX)) {
    const tail = parsed.meta_description
      ? ' ' + parsed.meta_description.replace(META_PREFIX, '').trim()
      : ` Find top-rated ${keyword} and save with verified Temu codes.`;
    const combined = META_PREFIX + tail;
    parsed.meta_description = combined.length > 160 ? combined.slice(0, 157) + '...' : combined;
  }

  // Coupon FAQ always present as first item
  parsed.faq_schema = ensureCouponFaq(parsed.faq_schema);

  // Coupon tags always present
  if (!parsed.tags.includes('temu coupon code')) parsed.tags.push('temu coupon code');
  if (!parsed.tags.includes(COUPON_PRIMARY))     parsed.tags.push(COUPON_PRIMARY);

  // HTML post-processing
  console.log(`  [claude] Post-processing HTML…`);
  const ppStart = Date.now();
  let html = parsed.html_body || '';
  html = stripEmojis(html);
  html = injectCouponCss(html);
  html = injectCouponBanner(html);
  html = injectClosingSection(html);
  html = fixCtaLinks(html);
  parsed.html_body = html;
  console.log(`  [claude] Post-processing done (${((Date.now() - ppStart) / 1000).toFixed(2)}s) | final html: ${html.length} chars`);

  return parsed;
}

module.exports = { generateNichePage };
