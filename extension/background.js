'use strict';

// --- Badge helpers ---

function setBadge(count) {
  const text = count > 0 ? String(count) : '';
  chrome.action.setBadgeText({ text });
  if (count > 0) {
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  }
}

function syncBadgeFromStorage() {
  chrome.storage.local.get({ selectedProducts: [] }, data => {
    setBadge(data.selectedProducts.length);
  });
}

// --- Install handler ---

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    chrome.storage.local.set({ selectedProducts: [] }, () => {
      setBadge(0);
    });
  } else if (details.reason === 'update') {
    // Ensure key exists after extension updates
    chrome.storage.local.get({ selectedProducts: [] }, data => {
      setBadge(data.selectedProducts.length);
    });
  }
});

// --- Sync badge on service worker startup ---
// Service workers can be terminated and restarted; re-sync badge each time.
syncBadgeFromStorage();

// --- Message listener ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {

    case 'updateBadge':
      setBadge(typeof msg.count === 'number' ? msg.count : 0);
      sendResponse({ ok: true });
      break;

    case 'getProducts':
      chrome.storage.local.get({ selectedProducts: [] }, data => {
        sendResponse({ products: data.selectedProducts });
      });
      return true; // async

    case 'clearProducts':
      chrome.storage.local.set({ selectedProducts: [] }, () => {
        setBadge(0);
        sendResponse({ ok: true });
      });
      return true; // async

    case 'removeProduct': {
      const id = msg.productId;
      chrome.storage.local.get({ selectedProducts: [] }, data => {
        const updated = data.selectedProducts.filter(p => p.productId !== id);
        chrome.storage.local.set({ selectedProducts: updated }, () => {
          setBadge(updated.length);
          sendResponse({ ok: true, count: updated.length });
        });
      });
      return true; // async
    }

    default:
      sendResponse({ ok: false, error: 'Unknown action' });
  }
});

// --- Storage change listener ---
// Keeps badge in sync if storage is modified by any part of the extension.

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.selectedProducts) {
    const products = changes.selectedProducts.newValue || [];
    setBadge(products.length);
  }
});
