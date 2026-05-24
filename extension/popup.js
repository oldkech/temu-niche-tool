'use strict';

// --- DOM refs ---
const productList = document.getElementById('product-list');
const emptyState  = document.getElementById('empty-state');
const counter     = document.getElementById('product-counter');
const siteSelect  = document.getElementById('site-select');
const generateBtn = document.getElementById('generate-btn');
const clearBtn    = document.getElementById('clear-btn');
const statusEl    = document.getElementById('status');

let products = [];

// --- Status helper ---

function showStatus(msg, type = 'loading') {
  statusEl.className = `status ${type}`;
  statusEl.innerHTML = msg;
}

function hideStatus() {
  statusEl.className = 'status hidden';
  statusEl.innerHTML = '';
}

// --- Counter ---

function updateCounter() {
  const n = products.length;
  counter.textContent = `${n} product${n !== 1 ? 's' : ''}`;
}

// --- Render product list ---

function renderProducts() {
  productList.innerHTML = '';
  updateCounter();

  if (products.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  products.forEach((p, index) => {
    const li = document.createElement('li');
    li.className = 'product-item';

    if (p.images && p.images.length > 0) {
      const img = document.createElement('img');
      img.className = 'product-thumb';
      img.src = p.images[0];
      img.alt = p.title || 'Product';
      img.onerror = () => img.replaceWith(makePlaceholder());
      li.appendChild(img);
    } else {
      li.appendChild(makePlaceholder());
    }

    const info = document.createElement('div');
    info.className = 'product-info';

    const title = document.createElement('div');
    title.className = 'product-title';
    title.textContent = p.title || 'Untitled product';
    title.title = p.title || '';

    const price = document.createElement('div');
    price.className = 'product-price';
    price.textContent = p.price || 'Price unavailable';

    info.appendChild(title);
    info.appendChild(price);
    li.appendChild(info);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove';
    removeBtn.title = 'Remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => removeProduct(index));
    li.appendChild(removeBtn);

    productList.appendChild(li);
  });
}

function makePlaceholder() {
  const div = document.createElement('div');
  div.className = 'product-thumb-placeholder';
  div.textContent = '🛍️';
  return div;
}

// --- Load from storage ---

function loadProducts() {
  chrome.storage.local.get({ selectedProducts: [] }, data => {
    products = data.selectedProducts;
    renderProducts();
  });
}

// --- Remove single product ---

function removeProduct(index) {
  products.splice(index, 1);
  chrome.storage.local.set({ selectedProducts: products }, () => {
    chrome.runtime.sendMessage({ action: 'updateBadge', count: products.length });
    renderProducts();
  });
}

// --- Clear all ---

clearBtn.addEventListener('click', () => {
  if (products.length === 0) return;
  chrome.runtime.sendMessage({ action: 'clearProducts' }, () => {
    products = [];
    renderProducts();
    hideStatus();
  });
});

// --- Auto-generate title from product categories / titles ---

function autoGenerateTitle(prods) {
  const cats = prods.flatMap(p => p.categories || []);
  if (cats.length > 0) {
    const freq = {};
    cats.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
    return `Best ${top} Deals on Temu 2026`;
  }
  // Fallback: first four words of the first product title
  const words = (prods[0]?.title || 'Temu Products').split(/\s+/).slice(0, 4).join(' ');
  return `${words} – Best Deals 2026`;
}

// --- Auto-generate focus keyword from categories / title words ---

function autoGenerateKeyword(prods) {
  const cats = prods.flatMap(p => p.categories || []);
  if (cats.length > 0) {
    const freq = {};
    cats.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
    return `cheap ${top.toLowerCase()} deals`;
  }
  // Fallback: most frequent meaningful words across all product titles
  const stop = new Set(['the','a','an','and','or','for','in','on','at','to','with','of','from','pcs','pc','set','pack','new','mini']);
  const freq = {};
  prods.forEach(p => {
    (p.title || '').toLowerCase().split(/[\s,\-/]+/).forEach(w => {
      const c = w.replace(/[^a-z0-9]/g, '');
      if (c.length > 3 && !stop.has(c)) freq[c] = (freq[c] || 0) + 1;
    });
  });
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w]) => w);
  return top.length ? `${top.join(' ')} deals` : 'temu deals 2026';
}

// --- Generate & Publish ---

generateBtn.addEventListener('click', async () => {
  if (products.length === 0) {
    showStatus('⚠️ Add at least one product before generating.', 'error');
    return;
  }

  const site      = siteSelect.value;
  const pageTitle = autoGenerateTitle(products);
  const keyword   = autoGenerateKeyword(products);

  const sites     = site === 'both'
    ? ['couponhubusa.com', 'couponcodesglitch.com']
    : [site];
  const siteLabel = site === 'both' ? 'both sites' : site;

  generateBtn.disabled = true;
  showStatus(`⏳ Generating niche page with Claude AI and publishing to ${siteLabel}… this may take 30–90 seconds.`, 'loading');

  async function callGenerate(targetSite) {
    const res = await fetch('http://localhost:3000/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products, pageTitle, keyword, site: targetSite }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`[${targetSite}] ${err.message || `Server returned ${res.status}`}`);
    }
    return res.json();
  }

  try {
    if (sites.length === 1) {
      const data = await callGenerate(sites[0]);
      const link = data.url || data.link || data.pageUrl || '';
      showStatus(
        link
          ? `✅ Page published!<br><a href="${link}" target="_blank">${link}</a>`
          : '✅ Page generated successfully!',
        'success'
      );
    } else {
      showStatus('⏳ Publishing to couponhubusa.com…', 'loading');
      const result1 = await callGenerate(sites[0]);

      showStatus('⏳ Publishing to couponcodesglitch.com…', 'loading');
      const result2 = await callGenerate(sites[1]);

      const link1 = result1.url || result1.link || result1.pageUrl || '';
      const link2 = result2.url || result2.link || result2.pageUrl || '';

      const urlLines = [
        link1 ? `<a href="${link1}" target="_blank">${link1}</a>` : 'couponhubusa.com ✓',
        link2 ? `<a href="${link2}" target="_blank">${link2}</a>` : 'couponcodesglitch.com ✓',
      ];
      showStatus(`✅ Published to both sites!<br>${urlLines.join('<br>')}`, 'success');
    }

  } catch (err) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      showStatus(
        '❌ Could not reach the backend.<br>Make sure the server is running on <strong>localhost:3000</strong>.',
        'error'
      );
    } else {
      showStatus(`❌ Error: ${err.message}`, 'error');
    }
  } finally {
    generateBtn.disabled = false;
  }
});

// --- Init ---
loadProducts();
