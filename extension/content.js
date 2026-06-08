(function () {
  'use strict';

  // --- URL / product ID helpers ---

  function getProductId() {
    const url = window.location.href;
    const patterns = [
      /-g-(\d+)\.html/,
      /goods_id=(\d+)/,
      /goods-detail\/(\d+)/,
      /\/(\d{15,})/,
    ];
    for (const re of patterns) {
      const m = url.match(re);
      if (m) return m[1];
    }
    return null;
  }

  function isProductPage() {
    return !!getProductId();
  }

  // --- DOM extraction helpers ---

  function queryText(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) return el.textContent.trim();
      } catch (_) {}
    }
    return '';
  }

  function extractImages() {
    const seen = new Set();
    const results = [];

    function addImg(src) {
      if (!src || src.startsWith('data:') || seen.has(src)) return;
      if (!src.startsWith('http')) return;
      seen.add(src);
      const clean = src.replace(/(_\d+x\d+)(\.(?:jpg|jpeg|png|webp))/i, '$2');
      if (!seen.has(clean)) {
        seen.add(clean);
        results.push(clean);
      }
    }

    function isVisible(el) {
      try {
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      } catch (_) { return true; }
    }

    // 1. Hero image: largest <img> on page by pixel area (fires after scroll triggers load)
    let heroImg = null, heroArea = 0;
    document.querySelectorAll('img').forEach(img => {
      const area = (img.naturalWidth || 0) * (img.naturalHeight || 0);
      if (area > heroArea) { heroArea = area; heroImg = img; }
    });
    if (heroImg) {
      addImg(heroImg.src);
      addImg(heroImg.dataset.src);
    }

    // 2. og:image / twitter:image meta tags
    [
      document.querySelector('meta[property="og:image"]'),
      document.querySelector('meta[name="twitter:image"]'),
      document.querySelector('meta[name="twitter:image:src"]'),
    ].forEach(el => { if (el) addImg(el.content || el.getAttribute('content')); });
    const imgSrcLink = document.querySelector('link[rel="image_src"]');
    if (imgSrcLink) addImg(imgSrcLink.href);

    // 3. Visible imgs with kwcdn.com or temu.com in src
    document.querySelectorAll('img').forEach(img => {
      if (!isVisible(img)) return;
      [img.src, img.dataset.src, img.dataset.lazySrc, img.dataset.original].forEach(src => {
        if (src && /img\.kwcdn\.com|temu\.com/i.test(src)) addImg(src);
      });
      if (img.srcset) {
        img.srcset.split(',').forEach(part => {
          const url = part.trim().split(/\s+/)[0];
          if (url && /img\.kwcdn\.com|temu\.com/i.test(url)) addImg(url);
        });
      }
    });

    // 4. data-src / data-lazy-src on ALL img tags (catches not-yet-visible lazy images)
    document.querySelectorAll('img').forEach(img => {
      addImg(img.dataset.src);
      addImg(img.dataset.lazySrc);
      addImg(img.dataset.original);
    });

    console.log(`[Temu Niche] extractImages: ${results.length} images found`);
    return results;
  }

  function extractRating() {
    const selectors = [
      '[class*="star-score"]',
      '[class*="rating-score"]',
      '[class*="review-score"]',
      '[aria-label*="rating"]',
      '[aria-label*="stars"]',
      '[class*="score"]',
    ];
    const raw = queryText(selectors);
    const num = parseFloat(raw);
    return isNaN(num) ? 0 : Math.min(num, 5);
  }

  function extractReviewCount() {
    const selectors = [
      '[class*="review-count"]',
      '[class*="reviews-count"]',
      '[class*="rating-count"]',
      '[class*="review-num"]',
      '[class*="comment-count"]',
    ];
    const raw = queryText(selectors);
    const m = raw.match(/[\d,]+/);
    return m ? parseInt(m[0].replace(/,/g, ''), 10) : 0;
  }

  function extractCategories() {
    const cats = [];
    const selectors = [
      '[class*="breadcrumb"] a',
      '[class*="crumb"] a',
      'nav[aria-label*="breadcrumb"] a',
      '[class*="bread-crumb"] a',
      '[class*="breadNav"] a',
    ];
    for (const sel of selectors) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          const text = el.textContent.trim();
          if (text && text.toLowerCase() !== 'home' && !cats.includes(text)) {
            cats.push(text);
          }
        });
        if (cats.length > 0) break;
      } catch (_) {}
    }
    return cats;
  }

  // --- Core scrape ---

  function extractProductData() {
    const productId = getProductId();

    const title = queryText([
      'h1[class*="title"]',
      'h1[class*="product"]',
      'h1[class*="goods"]',
      'h1[class*="name"]',
      '.product-title',
      '.goods-title',
      'h1',
    ]);

    const price = queryText([
      '[class*="sale-price"]',
      '[class*="price-sale"]',
      '[class*="current-price"]',
      '[class*="price-current"]',
      '[class*="final-price"]',
      '[class*="goods-price"]',
      '[class*="price"]',
    ]);

    const description = queryText([
      '[class*="description-detail"]',
      '[class*="product-description"]',
      '[class*="goods-description"]',
      '[class*="detail-desc"]',
      '[class*="description"]',
      '[class*="overview"]',
      '[class*="product-detail"]',
    ]);

    const affiliateLink = `https://temu.com/ul/NfEuF-g-${productId}.html`;

    return {
      productId,
      title,
      price,
      images: extractImages(),
      description,
      rating: extractRating(),
      reviewCount: extractReviewCount(),
      categories: extractCategories(),
      affiliateLink,
      url: window.location.href,
      scrapedAt: new Date().toISOString(),
    };
  }

  // --- Badge ---

  function updateBadge(count) {
    chrome.runtime.sendMessage({ action: 'updateBadge', count });
  }

  // --- Button UI ---

  function showConfirmation(btn, alreadyAdded = false) {
    const prevText = btn.dataset.originalText || btn.innerHTML;
    btn.innerHTML = alreadyAdded ? '✓ Already Added' : '✓ Product Added!';
    btn.style.background = alreadyAdded ? '#2563eb' : '#15803d';
    setTimeout(() => {
      btn.innerHTML = prevText;
      btn.style.background = '#16a34a';
    }, 2000);
  }

  function injectButton() {
    if (document.getElementById('temu-niche-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'temu-niche-btn';
    btn.innerHTML = '✓ Add to Niche Page';
    btn.dataset.originalText = '✓ Add to Niche Page';

    btn.style.cssText = [
      'position: fixed',
      'top: 80px',
      'right: 20px',
      'z-index: 2147483647',
      'background: #16a34a',
      'color: #ffffff',
      'border: none',
      'border-radius: 8px',
      'padding: 12px 18px',
      'font-size: 14px',
      'font-weight: 600',
      'cursor: pointer',
      'box-shadow: 0 4px 14px rgba(0,0,0,0.25)',
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      'transition: background 0.15s, transform 0.1s',
      'min-width: 165px',
      'text-align: center',
      'line-height: 1.4',
    ].join(';');

    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#15803d';
      btn.style.transform = 'scale(1.03)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#16a34a';
      btn.style.transform = 'scale(1)';
    });

    btn.addEventListener('click', () => {
      if (btn.dataset.scanning === 'true') return;
      btn.dataset.scanning = 'true';
      btn.innerHTML = '⏳ Scanning images...';
      btn.style.background = '#ca8a04';

      // Scroll down ~35% to trigger lazy-load on the product gallery
      const scrollTarget = Math.floor(document.body.scrollHeight * 0.35);
      window.scrollTo({ top: scrollTarget, behavior: 'smooth' });

      // Scroll back to top after 900ms so the user isn't disoriented
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 900);

      // Extract after 3 seconds — enough time for lazy images to load
      setTimeout(() => {
        btn.dataset.scanning = 'false';
        btn.innerHTML = btn.dataset.originalText;
        btn.style.background = '#16a34a';

        const product = extractProductData();
        console.log(`[Temu Niche] Scraped: "${product.title}" | images: ${product.images.length}`);

        chrome.storage.local.get({ selectedProducts: [] }, data => {
          const products = data.selectedProducts;
          const exists = products.some(p => p.productId === product.productId);
          if (exists) {
            showConfirmation(btn, true);
            return;
          }
          products.push(product);
          chrome.storage.local.set({ selectedProducts: products }, () => {
            updateBadge(products.length);
            showConfirmation(btn, false);
          });
        });
      }, 3000);
    });

    document.body.appendChild(btn);
  }

  // --- Message listener (for popup.js) ---

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'getProducts') {
      chrome.storage.local.get({ selectedProducts: [] }, data => {
        sendResponse({ products: data.selectedProducts });
      });
      return true; // keep channel open for async response
    }
    if (msg.action === 'scrapeCurrentProduct') {
      sendResponse({ product: extractProductData() });
    }
  });

  // --- Init ---

  function init() {
    if (!isProductPage()) return;
    injectButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Handle Temu's SPA navigation (URL changes without full page reload)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Small delay to let the new page render
      setTimeout(() => {
        const existing = document.getElementById('temu-niche-btn');
        if (existing) existing.remove();
        init();
      }, 800);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
