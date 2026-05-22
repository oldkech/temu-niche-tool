'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

async function generateNichePage({ products, pageTitle, keyword }) {
  const productSummaries = buildProductSummaries(products);

  const system = `You are an expert affiliate content writer specialising in deal and coupon sites. \
You produce clean, engaging, SEO-optimised niche pages that convert readers into buyers. \
Write in a warm, helpful tone. Never fabricate prices or ratings — use only the data provided. \
Return ONLY the HTML fragment (no <html>, <head>, or <body> tags) ready to paste into WordPress.`;

  const user = `Create a complete, professional niche page for the details below.

=== PAGE BRIEF ===
Title: ${pageTitle}
Target keyword: "${keyword}"
Products: ${products.length}

=== PRODUCTS ===
${productSummaries}

=== HTML REQUIREMENTS ===
Structure (in order):
1. <h1> with the page title — include the keyword naturally.
2. Intro paragraph (80-120 words) optimised for "${keyword}". Hook the reader.
3. One <article class="product-card"> per product containing:
   - <h2> with a benefit-led headline (not just the product name)
   - <img> tag using the first image URL (if available), with alt text
   - Price displayed in a <span class="price"> tag
   - Rating stars as text emoji (⭐) if rating > 0
   - 2-3 sentences on benefits and value
   - Key features as a <ul> (3-5 bullets)
   - <a class="cta-btn" href="{affiliateLink}" target="_blank" rel="nofollow">Shop on Temu →</a>
4. <section class="buying-guide"> with a 3-point buying guide for "${keyword}" shoppers.
5. <section class="why-temu"> — "Why Shop on Temu?" with 3 short benefit bullets.
6. Closing paragraph with a call to action using the keyword.

Inline CSS rules to include in a <style> block at the top:
- Page max-width 960px, centered, font-family system-ui, background #fff, color #1a1a2e
- .product-card: border 1px solid #e2e8f0, border-radius 12px, padding 24px, margin-bottom 28px, box-shadow 0 2px 8px rgba(0,0,0,.07)
- .product-card img: max-width 100%, max-height 280px, object-fit contain, border-radius 8px, display block, margin-bottom 16px
- .price: font-size 1.4rem, font-weight 700, color #f97316
- .cta-btn: display inline-block, background #f97316, color #fff, padding 12px 28px, border-radius 8px, text-decoration none, font-weight 700, margin-top 16px
- .cta-btn:hover: background #ea580c
- .buying-guide, .why-temu: background #f8fafc, border-radius 12px, padding 24px, margin-bottom 28px
- h2: color #0f3460
- Mobile: @media(max-width:600px) .product-card padding 16px

Keyword "${keyword}" must appear naturally 4-6 times total. Do not stuff it.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6000,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text = response.content[0].text.trim();

  // Strip accidental markdown code fences if the model wraps the output
  return text
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

module.exports = { generateNichePage };
