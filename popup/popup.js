/*
 * AriaNG Firefox Extension - popup page
 * Reconciles the RPC configuration with AriaNG's own localStorage options
 * (key "AriaNg.Options") before loading the AriaNG UI in the iframe.
 * Config edited inside the AriaNG UI is adopted back into the extension
 * storage instead of being overwritten - see A2E.Utils.reconcileRpcConfig.
 */
(function () {
  'use strict';

  async function syncAriaNgOptions() {
    let stored = {};
    try {
      stored = await browser.storage.local.get(['rpcList', 'rpcListPushed']);
    } catch (error) {
      console.warn('[AriaNG] popup: load configs failed', error);
    }
    let result = null;
    try {
      result = A2E.Utils.reconcileRpcConfig(stored.rpcList, stored.rpcListPushed);
    } catch (error) {
      console.warn('[AriaNG] popup: sync ariaNg options failed', error);
      return;
    }
    const update = {};
    if (result.rpcList) update.rpcList = result.rpcList;
    if (result.pushed) update.rpcListPushed = result.pushed;
    if (Object.keys(update).length > 0) {
      try {
        await browser.storage.local.set(update);
      } catch (error) {
        console.warn('[AriaNG] popup: save configs failed', error);
      }
    }
  }

  async function main() {
    await syncAriaNgOptions();
    const element = document.getElementById('AriaNG');
    /* forward the popup page hash (deep links such as #!new?url=...) to the iframe */
    element.src = '../ui/ariang/index.html' + (window.location.hash || '');
  }

  main();
})();
