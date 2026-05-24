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

function buildProductSummaries(products) {
  return products.map((p, i) => [
    `### Product ${i + 1}: ${p.title || 'Untitled'}`,
    `- Price: ${p.price || 'N/A'}`,
    `- Rating: ${p.rating || 'N/A'}/5 (${p.reviewCount || 0} reviews)`,
    `- Categories: ${(p.categories || []).join(', ') || 'General'}`,
    `- Affiliate Link: ${p.affiliateLink}`,
    `- Description: ${p.description || 'No description provided.'}`,
    `- Images: ${(p.images || []).slice(0, 2).join(' | ') || 'none'}`,
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
  const featuredImageUrl = products.find(p => p.images && p.images.length > 0)?.images[0] || '';

  const system = `You are an expert affiliate content writer specialising in deal and coupon sites. \
You produce clean, engaging, SEO-optimised niche pages that convert readers into buyers. \
Write in a warm, helpful tone. Never fabricate prices or ratings — use only the data provided. \
You MUST return ONLY valid JSON — no markdown fences, no prose before or after the JSON object.`;

  const user = `Create a complete, professional niche page and return it as a single JSON object.

=== PAGE BRIEF ===
Title: ${pageTitle}
Target keyword: "${keyword}"
Primary coupon code: ${COUPON_PRIMARY}  |  Backup code: ${COUPON_BACKUP}
Affiliate URL for ALL buttons: ${AFFILIATE_URL}
Products: ${products.length}
Featured image URL: ${featuredImageUrl}

=== PRODUCTS ===
${productSummaries}

=== JSON STRUCTURE TO RETURN ===
{
  "title": "...",
  "slug": "...",
  "meta_description": "...",
  "focus_keyword": "...",
  "html_body": "...",
  "featured_image_url": "...",
  "categories": ["...", "..."],
  "tags": ["...", "...", "...", "...", "..."],
  "faq_schema": [
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." },
    { "question": "...", "answer": "..." }
  ]
}

=== FIELD SPECS ===
title: use exactly "${pageTitle}"
slug: URL-safe (lowercase, hyphens, no special chars)
meta_description: MUST start with "${META_PREFIX}" then one sentence about "${keyword}" — total 150-160 chars
focus_keyword: "temu coupon code, ${keyword}"
html_body: complete HTML fragment (no html/head/body tags). Exact structure:
  1. <style> block — all CSS including:
       max-width:960px centered, system-ui font, background #fff, color #1a1a2e
       .product-card: border 1px solid #e2e8f0, border-radius 12px, padding 24px, margin-bottom 28px, box-shadow 0 2px 8px rgba(0,0,0,.07)
       .product-card img: max-width 100%, max-height 280px, object-fit contain, border-radius 8px
       .price: font-size 1.4rem, font-weight 700, color #f97316
       .cta-btn: display inline-block, background #f97316, color #fff, padding 12px 28px, border-radius 8px, text-decoration none, font-weight 700, margin-top 16px
       .cta-btn:hover: background #ea580c
       .coupon-banner: background linear-gradient(135deg,#f97316,#ea580c), border-radius 12px, padding 28px 24px, text-align center, color #fff
       .coupon-cta: inline-block, background #fff, color #ea580c, padding 12px 28px, border-radius 8px, font-weight 700
       .promo-footer: background #0f3460, color #fff, border-radius 12px, padding 36px 28px, text-align center
       .promo-footer h2: color #ffd166
       .buying-guide, .why-temu: background #f8fafc, border-radius 12px, padding 24px, margin-bottom 28px
       h2: color #0f3460
       @media(max-width:600px): .product-card padding 16px
  2. <h1> — page title with "${keyword}" appearing naturally
  3. Intro paragraph (80-120 words) optimised for "${keyword}"
  4. <div class="coupon-banner"> — orange gradient block:
       headline: "Use Temu Coupon Code <strong>${COUPON_PRIMARY}</strong> for Extra Savings!"
       subtext: mention ${COUPON_BACKUP} as backup
       <a class="coupon-cta" href="${AFFILIATE_URL}" target="_blank" rel="nofollow">Claim Your Discount on Temu &rarr;</a>
  5. One <article class="product-card"> per product:
       <h2> benefit-led headline (not just the product name)
       <img src="{first image URL}" alt="..."> (if available)
       <span class="price">{price}</span>
       ⭐ rating emoji if rating > 0
       2-3 sentence benefits paragraph
       <ul> 3-5 feature bullets
       <a class="cta-btn" href="${AFFILIATE_URL}" target="_blank" rel="nofollow">Shop on Temu &rarr;</a>
  6. <section class="buying-guide"> — 3-point buying guide for "${keyword}" shoppers
  7. <section class="why-temu"> — "Why Shop on Temu?" with 3 benefit bullets
  8. <section class="promo-footer"> — dark closing block:
       <h2>Don&rsquo;t Forget Your Temu Coupon Code: ${COUPON_PRIMARY}</h2>
       Paragraph: ${COUPON_PRIMARY} is the best May 2026 Temu coupon code, works sitewide
       Backup mention: ${COUPON_BACKUP}
       <a class="coupon-cta" href="${AFFILIATE_URL}" target="_blank" rel="nofollow">Shop on Temu &amp; Apply Code ${COUPON_PRIMARY} &rarr;</a>
featured_image_url: use this exact URL unchanged: "${featuredImageUrl}"
categories: 2-3 WordPress category names
tags: 5-8 tags — MUST include "temu coupon code" and "${COUPON_PRIMARY}"
faq_schema: exactly 5 items. Item 1 MUST be:
  { "question": "${COUPON_FAQ.question}", "answer": "${COUPON_FAQ.answer}" }
  Items 2-5: real shopper questions about "${keyword}" on Temu.

"${keyword}" must appear naturally 4-6 times in html_body.
ALL <a class="cta-btn"> and <a class="coupon-cta"> links MUST use href="${AFFILIATE_URL}".

Return ONLY the JSON object. No markdown. No explanation.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system,
    messages: [{ role: 'user', content: user }],
  });

  let text = response.content[0].text.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.warn('Claude did not return valid JSON — wrapping as html_body fallback');
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
  let html = parsed.html_body || '';
  html = injectCouponCss(html);
  html = injectCouponBanner(html);
  html = injectClosingSection(html);
  html = fixCtaLinks(html);
  parsed.html_body = html;

  return parsed;
}

module.exports = { generateNichePage };
