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

function toSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function generateNichePage({ products, pageTitle, keyword }) {
  const productSummaries = buildProductSummaries(products);
  const featuredImageUrl = products.find(p => p.images && p.images.length > 0)?.images[0] || '';

  const system = `You are an expert affiliate content writer specialising in deal and coupon sites. \
You produce clean, engaging, SEO-optimised niche pages that convert readers into buyers. \
Write in a warm, helpful tone. Never fabricate prices or ratings — use only the data provided. \
You MUST return ONLY valid JSON — no markdown fences, no prose before or after the JSON object.`;

  const user = `Create a complete, professional niche page and return it as a JSON object.

=== PAGE BRIEF ===
Title: ${pageTitle}
Target keyword: "${keyword}"
Products: ${products.length}
Featured image URL: ${featuredImageUrl}

=== PRODUCTS ===
${productSummaries}

=== RETURN THIS EXACT JSON STRUCTURE ===
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
title: "${pageTitle}" (use exactly as given)
slug: URL-safe version (lowercase, hyphens only, no special chars)
meta_description: 150-160 char SEO description naturally including "${keyword}"
focus_keyword: "${keyword}"
html_body: Complete HTML fragment — no <html>/<head>/<body> wrapper. Must include:
  1. <style> block with all page CSS (max-width 960px centered, system-ui font,
     .product-card border/shadow/border-radius 12px, .price color #f97316 font-weight 700,
     .cta-btn orange button, .buying-guide/.why-temu light bg sections, mobile @media 600px)
  2. <h1> with title — keyword appears naturally
  3. Intro paragraph (80-120 words) optimised for "${keyword}"
  4. One <article class="product-card"> per product:
     - <h2> benefit-led headline
     - <img src="{first image URL}" alt="..."> if image available
     - <span class="price">{price}</span>
     - Rating stars as ⭐ emoji if rating > 0
     - 2-3 sentence benefits paragraph
     - <ul> 3-5 key feature bullets
     - <a class="cta-btn" href="{affiliateLink}" target="_blank" rel="nofollow">Shop on Temu →</a>
  5. <section class="buying-guide"> — 3-point buying guide for "${keyword}" shoppers
  6. <section class="why-temu"> — "Why Shop on Temu?" with 3 benefit bullets
  7. Closing paragraph with CTA using keyword
featured_image_url: use this exact URL (do not change): "${featuredImageUrl}"
categories: 2-3 relevant WordPress category names (e.g. ["Deals", "Home & Kitchen"])
tags: 5-8 relevant short tag strings
faq_schema: exactly 5 objects, each with "question" and "answer". Cover real shopper questions about "${keyword}".

Keyword "${keyword}" must appear naturally 4-6 times in html_body. Do not keyword-stuff.

Return ONLY the JSON object. No markdown fences. No explanation text.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system,
    messages: [{ role: 'user', content: user }],
  });

  let text = response.content[0].text.trim();

  // Strip accidental markdown code fences
  text = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    // Fallback: treat raw output as html_body
    console.warn('Claude did not return valid JSON — wrapping as html_body fallback');
    parsed = {
      title: pageTitle,
      slug: toSlug(pageTitle),
      meta_description: `Discover the best ${keyword} deals on Temu. Shop top-rated products at unbeatable prices.`,
      focus_keyword: keyword,
      html_body: text,
      featured_image_url: featuredImageUrl,
      categories: ['Deals'],
      tags: [keyword],
      faq_schema: [],
    };
  }

  // Ensure required fields are present
  if (!parsed.slug)              parsed.slug              = toSlug(parsed.title || pageTitle);
  if (!parsed.focus_keyword)     parsed.focus_keyword     = keyword;
  if (!parsed.featured_image_url) parsed.featured_image_url = featuredImageUrl;
  if (!Array.isArray(parsed.categories)) parsed.categories = ['Deals'];
  if (!Array.isArray(parsed.tags))       parsed.tags       = [keyword];
  if (!Array.isArray(parsed.faq_schema)) parsed.faq_schema = [];

  return parsed;
}

module.exports = { generateNichePage };
