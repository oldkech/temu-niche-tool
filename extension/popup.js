'use strict';

// ─── DOM refs ──────────────────────────────────────────────────────────────────
const productList = document.getElementById('product-list');
const emptyState  = document.getElementById('empty-state');
const counter     = document.getElementById('product-counter');
const siteSelect  = document.getElementById('site-select');
const generateBtn = document.getElementById('generate-btn');
const cancelBtn   = document.getElementById('cancel-btn');
const clearBtn    = document.getElementById('clear-btn');
const statusEl    = document.getElementById('status');
const terminalEl  = document.getElementById('terminal-log');
const clearLogBtn = document.getElementById('clear-log-btn');

let products = [];

// ─── Status helpers ────────────────────────────────────────────────────────────

function showStatus(msg, type = 'loading') {
  statusEl.className = `status ${type}`;
  statusEl.innerHTML = msg;
}

function hideStatus() {
  statusEl.className = 'status hidden';
  statusEl.innerHTML = '';
}

// ─── Terminal log ──────────────────────────────────────────────────────────────

function renderLog(entries) {
  if (!terminalEl) return;
  terminalEl.innerHTML = (entries || []).map(e => {
    const cls = e.type ? ` class="log-${e.type}"` : '';
    return `<div${cls}>${e.text}</div>`;
  }).join('');
  terminalEl.scrollTop = terminalEl.scrollHeight;
}

function appendLog(text, type) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const entry = { text: `[${hh}:${mm}:${ss}] ${text}`, type: type || '' };
  chrome.storage.local.get({ generationLog: [] }, data => {
    const log = data.generationLog.slice(-99);
    log.push(entry);
    chrome.storage.local.set({ generationLog: log });
  });
}

if (clearLogBtn) {
  clearLogBtn.addEventListener('click', () => {
    chrome.storage.local.set({ generationLog: [] }, () => renderLog([]));
  });
}

chrome.storage.local.get({ generationLog: [] }, data => renderLog(data.generationLog));

// ─── Cancel / Reset ────────────────────────────────────────────────────────────

function resetJobState() {
  chrome.storage.local.remove('generationJob', () => {
    generateBtn.disabled = false;
    cancelBtn.classList.add('hidden');
    hideStatus();
  });
}

cancelBtn.addEventListener('click', resetJobState);

// ─── Counter ───────────────────────────────────────────────────────────────────

function updateCounter() {
  const n = products.length;
  counter.textContent = `${n} product${n !== 1 ? 's' : ''}`;
}

// ─── Render product list ───────────────────────────────────────────────────────

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

// ─── Storage helpers ───────────────────────────────────────────────────────────

function loadProducts() {
  chrome.storage.local.get({ selectedProducts: [] }, data => {
    products = data.selectedProducts;
    renderProducts();
  });
}

function removeProduct(index) {
  products.splice(index, 1);
  chrome.storage.local.set({ selectedProducts: products }, () => {
    chrome.runtime.sendMessage({ action: 'updateBadge', count: products.length });
    renderProducts();
  });
}

// ─── Clear all ─────────────────────────────────────────────────────────────────

clearBtn.addEventListener('click', () => {
  if (products.length === 0) return;
  chrome.runtime.sendMessage({ action: 'clearProducts' }, () => {
    products = [];
    renderProducts();
    hideStatus();
  });
});

// ─── Auto-generate title / keyword from products ───────────────────────────────

function autoGenerateTitle(prods) {
  const cats = prods.flatMap(p => p.categories || []);
  if (cats.length > 0) {
    const freq = {};
    cats.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
    return `Best ${top} Deals on Temu 2026`;
  }
  const words = (prods[0]?.title || 'Temu Products').split(/\s+/).slice(0, 4).join(' ');
  return `${words} – Best Deals 2026`;
}

function autoGenerateKeyword(prods) {
  const cats = prods.flatMap(p => p.categories || []);
  if (cats.length > 0) {
    const freq = {};
    cats.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
    return `cheap ${top.toLowerCase()} deals`;
  }
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

// ─── Backend health check ──────────────────────────────────────────────────────

async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('http://localhost:3000/health', { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Render job results from storage ──────────────────────────────────────────

function renderJobResults(job) {
  if (!job || !job.results) return;

  const done = job.results.filter(r => r.status === 'done');
  const errs = job.results.filter(r => r.status === 'error');

  const urlLines = done.map(r =>
    r.url ? `<a href="${r.url}" target="_blank">${r.url}</a>` : `${r.site} ✓`
  );
  const errLines = errs.map(r => `❌ [${r.site}] ${r.errorMessage || 'unknown error'}`);

  if (done.length > 0) {
    const header = errs.length > 0
      ? `⚠️ ${done.length} published, ${errs.length} failed`
      : done.length === 1 ? '✅ Page published!' : `✅ Published to ${done.length} sites!`;
    showStatus([header, ...urlLines, ...errLines].join('<br>'), errs.length > 0 ? 'error' : 'success');
  } else {
    showStatus(errLines.join('<br>') || '❌ All publishes failed.', 'error');
  }
}

const JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// Restore UI from a saved job when the popup is opened
function restoreJobState(job) {
  if (!job || job.status === 'idle') return;

  if (job.status === 'running') {
    const elapsed = Date.now() - (job.startedAt || Date.now());
    if (elapsed > JOB_TIMEOUT_MS) {
      // Job has been running too long — auto-clear it
      chrome.storage.local.remove('generationJob');
      showStatus('⚠️ Previous job timed out and was cleared.', 'error');
      return;
    }
    const elapsedSec = Math.round(elapsed / 1000);
    const timeStr    = elapsedSec < 60 ? `${elapsedSec}s` : `${Math.round(elapsedSec / 60)}m`;
    const running    = (job.results || []).find(r => r.status === 'running');
    const siteStr    = running ? running.site : (job.sites || []).join(' + ');
    showStatus(`⏳ Publishing to ${siteStr}… (${timeStr} elapsed) — safe to close this popup.`, 'loading');
    generateBtn.disabled = true;
    cancelBtn.classList.remove('hidden');
  } else {
    generateBtn.disabled = false;
    cancelBtn.classList.remove('hidden');
    renderJobResults(job);
  }
}

// ─── Live storage listener (updates popup while it's open) ────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.generationLog) {
    renderLog(changes.generationLog.newValue || []);
  }

  if (!changes.generationJob) return;
  const job     = changes.generationJob.newValue;
  const prevJob = changes.generationJob.oldValue;

  // Job was cleared (e.g. by cancel button from another popup instance)
  if (!job) {
    generateBtn.disabled = false;
    cancelBtn.classList.add('hidden');
    hideStatus();
    return;
  }

  if (job.status === 'running') {
    const running     = (job.results || []).find(r => r.status === 'running');
    const prevRunning = prevJob && (prevJob.results || []).find(r => r.status === 'running');
    const siteStr     = running ? running.site : 'site';
    showStatus(`⏳ Publishing to ${siteStr}… — safe to close this popup.`, 'loading');
    generateBtn.disabled = true;
    cancelBtn.classList.remove('hidden');
    if (running && (!prevRunning || prevRunning.site !== running.site)) {
      appendLog(`Publishing to WordPress: ${running.site}...`);
    }
  } else {
    generateBtn.disabled = false;
    cancelBtn.classList.remove('hidden');
    renderJobResults(job);
    const prevResults = (prevJob && prevJob.results) || [];
    (job.results || []).forEach(r => {
      const prev = prevResults.find(pr => pr.site === r.site);
      if (r.status === 'done' && (!prev || prev.status !== 'done')) {
        appendLog(r.url ? `Done! View page: ${r.url}` : `Published to ${r.site}.`, 'success');
      }
      if (r.status === 'error' && (!prev || prev.status !== 'error')) {
        appendLog(`Error on ${r.site}: ${r.errorMessage || 'unknown error'}`, 'error');
      }
    });
  }
});

// ─── Generate & Publish ────────────────────────────────────────────────────────

generateBtn.addEventListener('click', async () => {
  if (products.length === 0) {
    showStatus('⚠️ Add at least one product before generating.', 'error');
    return;
  }

  generateBtn.disabled = true;
  showStatus('⏳ Checking backend connection…', 'loading');
  appendLog('Connecting to backend...');

  const healthy = await checkBackendHealth();
  if (!healthy) {
    showStatus(
      '❌ Backend not reachable.<br>Run <strong>Start-Temu-Backend.bat</strong> first.',
      'error'
    );
    appendLog('Backend not reachable. Run Start-Temu-Backend.bat first.', 'error');
    generateBtn.disabled = false;
    return;
  }

  const site      = siteSelect.value;
  const sites     = site === 'both'
    ? ['couponhubusa.com', 'couponcodesglitch.com']
    : [site];
  const pageTitle = autoGenerateTitle(products);
  const keyword   = autoGenerateKeyword(products);
  const siteLabel = site === 'both' ? 'both sites' : site;

  appendLog(`Backend connected. Sending ${products.length} product(s) to Claude AI...`);
  showStatus(`⏳ Starting generation for ${siteLabel}… safe to close this popup.`, 'loading');
  appendLog(`Claude AI generating page for ${siteLabel}... (60-90s)`);

  // Persist job state so reopening the popup shows live progress
  chrome.storage.local.set({
    generationJob: {
      status:    'running',
      sites,
      pageTitle,
      keyword,
      startedAt: Date.now(),
      results:   sites.map(s => ({ site: s, status: 'pending' })),
    },
  });

  // Hand off to the background service worker — survives popup close / tab changes
  chrome.runtime.sendMessage(
    { action: 'startGenerate', payload: { sites, pageTitle, keyword, products } },
    response => {
      if (chrome.runtime.lastError) {
        showStatus(`❌ Background worker error: ${chrome.runtime.lastError.message}`, 'error');
        appendLog(`Background worker error: ${chrome.runtime.lastError.message}`, 'error');
        generateBtn.disabled = false;
      }
      // Result arrives via chrome.storage.onChanged above
    }
  );
});

// ─── Init ──────────────────────────────────────────────────────────────────────

loadProducts();

// Restore any in-progress or completed job on popup open
chrome.storage.local.get({ generationJob: { status: 'idle' } }, data => {
  restoreJobState(data.generationJob);
});
