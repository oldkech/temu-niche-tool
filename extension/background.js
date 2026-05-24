'use strict';

// ─── Badge helpers ─────────────────────────────────────────────────────────────

function setBadge(count) {
  const text = count > 0 ? String(count) : '';
  chrome.action.setBadgeText({ text });
  if (count > 0) chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
}

function syncBadgeFromStorage() {
  chrome.storage.local.get({ selectedProducts: [] }, data => {
    setBadge(data.selectedProducts.length);
  });
}

// ─── Notification helpers ──────────────────────────────────────────────────────

// In-memory map of notification id → URL for "Open Page" button clicks.
// Lost on SW restart, but the message text always includes the URL as fallback.
const notifUrlMap = {};

chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
  if (btnIdx === 0 && notifUrlMap[notifId]) {
    chrome.tabs.create({ url: notifUrlMap[notifId] });
    delete notifUrlMap[notifId];
  }
});

function notifySuccess(site, url) {
  const id = `publish-${Date.now()}`;
  if (url) notifUrlMap[id] = url;
  chrome.notifications.create(id, {
    type:    'basic',
    iconUrl: 'icons/icon128.png',
    title:   '✅ Page Published!',
    message: url ? `${site}\n${url}` : `Published to ${site}`,
    ...(url ? { buttons: [{ title: 'Open Page' }] } : {}),
  });
}

function notifyError(message) {
  chrome.notifications.create(`error-${Date.now()}`, {
    type:    'basic',
    iconUrl: 'icons/icon128.png',
    title:   '❌ Publish Failed',
    message: String(message).slice(0, 200),
  });
}

// ─── Generation ────────────────────────────────────────────────────────────────

async function callGenerate(site, pageTitle, keyword, products) {
  const res = await fetch('http://localhost:3000/generate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ products, pageTitle, keyword, site }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Server returned ${res.status}`);
  }
  return res.json();
}

async function saveJob(patch) {
  return chrome.storage.local.set({ generationJob: patch });
}

async function doGenerate({ sites, pageTitle, keyword, products }) {
  const startedAt = Date.now();
  const completedResults = [];

  await saveJob({
    status: 'running',
    sites,
    pageTitle,
    keyword,
    startedAt,
    results: sites.map(s => ({ site: s, status: 'pending' })),
  });

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];

    // Show which site is currently processing
    await saveJob({
      status:  'running',
      sites,
      pageTitle,
      keyword,
      startedAt,
      results: [
        ...completedResults,
        { site, status: 'running' },
        ...sites.slice(i + 1).map(s => ({ site: s, status: 'pending' })),
      ],
    });

    try {
      const data = await callGenerate(site, pageTitle, keyword, products);
      const url  = data.url || data.link || data.pageUrl || '';
      completedResults.push({ site, status: 'done', url, postId: data.postId });
      notifySuccess(site, url);
    } catch (err) {
      completedResults.push({ site, status: 'error', errorMessage: err.message });
      notifyError(`[${site}] ${err.message}`);
    }
  }

  const allDone  = completedResults.every(r => r.status === 'done');
  const anyDone  = completedResults.some(r => r.status === 'done');
  const finalStatus = allDone ? 'done' : anyDone ? 'partial' : 'error';

  await saveJob({
    status:      finalStatus,
    sites,
    pageTitle,
    keyword,
    startedAt,
    results:     completedResults,
    finishedAt:  Date.now(),
  });
}

// ─── Install handler ───────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    chrome.storage.local.set({ selectedProducts: [], generationJob: { status: 'idle' } });
    setBadge(0);
  } else if (details.reason === 'update') {
    chrome.storage.local.get({ selectedProducts: [] }, data => setBadge(data.selectedProducts.length));
  }
});

syncBadgeFromStorage();

// ─── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {

    case 'startGenerate':
      // Acknowledge immediately; async work runs independently in the SW
      sendResponse({ ok: true, started: true });
      doGenerate(msg.payload).catch(err => {
        console.error('doGenerate unhandled error:', err);
        saveJob({ status: 'error', errorMessage: err.message, finishedAt: Date.now() });
        notifyError(err.message);
      });
      break;

    case 'updateBadge':
      setBadge(typeof msg.count === 'number' ? msg.count : 0);
      sendResponse({ ok: true });
      break;

    case 'getProducts':
      chrome.storage.local.get({ selectedProducts: [] }, data => {
        sendResponse({ products: data.selectedProducts });
      });
      return true;

    case 'clearProducts':
      chrome.storage.local.set({ selectedProducts: [] }, () => {
        setBadge(0);
        sendResponse({ ok: true });
      });
      return true;

    case 'removeProduct': {
      const id = msg.productId;
      chrome.storage.local.get({ selectedProducts: [] }, data => {
        const updated = data.selectedProducts.filter(p => p.productId !== id);
        chrome.storage.local.set({ selectedProducts: updated }, () => {
          setBadge(updated.length);
          sendResponse({ ok: true, count: updated.length });
        });
      });
      return true;
    }

    default:
      sendResponse({ ok: false, error: 'Unknown action' });
  }
});

// ─── Badge sync on storage changes ────────────────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.selectedProducts) {
    setBadge((changes.selectedProducts.newValue || []).length);
  }
});
