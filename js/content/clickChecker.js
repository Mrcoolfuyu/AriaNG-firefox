/*
 * AriaNG Firefox Extension - content script
 * 1) captures magnet link clicks (captureMagnet option)
 * 2) reports Alt key state on clicks (checkClick option)
 * Registered statically in manifest; reads its config from browser.storage.
 */
(function () {
  'use strict';

  const configs = {
    integration: false,
    captureMagnet: false,
    checkClick: false
  };

  browser.storage.local.get(['integration', 'captureMagnet', 'checkClick']).then((res) => {
    Object.assign(configs, res);
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      for (const key of Object.keys(changes)) {
        if (key in configs) {
          configs[key] = changes[key].newValue;
        }
      }
    }
  });

  function getMagnetUrl(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const el of path) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) continue;
      const href = el.getAttribute ? el.getAttribute('href') : null;
      if (href && /^magnet:/i.test(href.trim())) {
        return href.trim();
      }
    }
    const anchor = event.target && event.target.closest ? event.target.closest('a[href], area[href]') : null;
    if (anchor) {
      const href = anchor.getAttribute('href');
      if (href && /^magnet:/i.test(href.trim())) {
        return href.trim();
      }
    }
    return null;
  }

  document.addEventListener('click', (event) => {
    if (configs.checkClick) {
      browser.runtime.sendMessage({
        type: 'CLICK_EVENT',
        data: { altKeyPressed: event.altKey }
      }).catch(() => { });
    }

    const magnetUrl = getMagnetUrl(event);
    if (magnetUrl && configs.integration && configs.captureMagnet) {
      if (configs.checkClick && event.altKey) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      browser.runtime.sendMessage({
        type: 'DOWNLOAD',
        data: {
          url: magnetUrl,
          filename: '',
          referrer: window.location.href
        }
      }).catch(() => { });
    }
  }, true);
})();
