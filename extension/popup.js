'use strict';

// --- DOM refs ---
const productList   = document.getElementById('product-list');
const emptyState    = document.getElementById('empty-state');
const counter       = document.getElementById('product-counter');
const pageTitleInput = document.getElementById('page-title');
const keywordInput  = document.getElementById('keyword');
const siteSelect    = document.getElementById('site-select');
const generateBtn   = document.getElementById('generate-btn');
const clearBtn      = document.getElementById('clear-btn');
const statusEl      = document.getElementById('status');

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

    // Thumbnail
    if (p.images && p.images.length > 0) {
      const img = document.createElement('img');
      img.className = 'product-thumb';
      img.src = p.images[0];
      img.alt = p.title || 'Product';
      img.onerror = () => {
        img.replaceWith(makePlaceholder());
      };
      li.appendChild(img);
    } else {
      li.appendChild(makePlaceholder());
    }

    // Info
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

    // Remove button
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

// --- Generate ---

generateBtn.addEventListener('click', async () => {
  if (products.length === 0) {
    showStatus('⚠️ Add at least one product before generating.', 'error');
    return;
  }

  const pageTitle = pageTitleInput.value.trim();
  const keyword   = keywordInput.value.trim();
  const site      = siteSelect.value;

  if (!pageTitle) {
    showStatus('⚠️ Please enter a page title.', 'error');
    pageTitleInput.focus();
    return;
  }
  if (!keyword) {
    showStatus('⚠️ Please enter a target keyword.', 'error');
    keywordInput.focus();
    return;
  }

  generateBtn.disabled = true;

  const sites = site === 'both'
    ? ['couponhubusa.com', 'couponcodesglitch.com']
    : [site];

  const siteLabel = site === 'both' ? 'both sites' : site;
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
      if (link) {
        showStatus(
          `✅ Page published!<br><a href="${link}" target="_blank">${link}</a>`,
          'success'
        );
      } else {
        showStatus('✅ Page generated successfully!', 'success');
      }
    } else {
      // Publish to both sites sequentially to avoid overloading Claude
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
