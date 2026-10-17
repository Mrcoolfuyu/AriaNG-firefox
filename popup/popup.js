/*
 * AriaNG Firefox Extension - popup page
 * Syncs the RPC configuration into AriaNG's own localStorage options
 * (key "AriaNg.Options") before loading the AriaNG UI in the iframe.
 */
(function () {
  'use strict';

  async function syncAriaNgOptions() {
    let configs = {};
    try {
      configs = await browser.storage.local.get(null);
    } catch (error) {
      console.warn('[AriaNG] popup: load configs failed', error);
    }
    const rpcList = (configs.rpcList && configs.rpcList.length) ? configs.rpcList : A2E.DefaultConfigs.rpcList;
    try {
      let options = {};
      const raw = localStorage.getItem(A2E.ARIA_NG_OPTIONS_KEY);
      if (raw) options = JSON.parse(raw);
      const merged = A2E.Utils.exportRpcToAriaNg(rpcList, options);
      localStorage.setItem(A2E.ARIA_NG_OPTIONS_KEY, JSON.stringify(merged));
    } catch (error) {
      console.warn('[AriaNG] popup: sync ariaNg options failed', error);
    }
  }

  async function main() {
    await syncAriaNgOptions();
    const element = document.getElementById('AriaNG');
    /* forward the popup page hash (set via browserAction.setPopup) to the iframe */
    element.src = '../ui/ariang/index.html' + (window.location.hash || '');
  }

  main();
})();
