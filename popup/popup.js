/*
 * AriaNG Firefox Extension - popup page
 * Reconciles the RPC configuration with AriaNG's own localStorage options
 * (key "AriaNg.Options") before loading the AriaNG UI in the iframe.
 * Config edited inside the AriaNG UI is adopted back into the extension
 * storage instead of being overwritten - see A2E.Utils.reconcileRpcConfig.
 *
 * The page also owns the window chrome the platform does not give us:
 *   - a maximize / restore button (Firefox disables the title-bar one for
 *     windows created with type:'popup', but windows.update still works);
 *   - a minimum size (AriaNG hides its whole sidebar below 768px, so shrinking
 *     further would silently drop the navigation tree);
 *   - geometry reporting, so the next launch reopens at the same size/position
 *     (Firefox has no windows.onBoundsChanged - that event is Chromium-only).
 */
(function () {
  'use strict';

  var ICON_MAXIMIZE = '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M6 2H2v4M10 2h4v4M10 14h4v-4M6 14H2v-4" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var ICON_RESTORE = '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M5.5 2.5h8v8M2.5 5.5h8v8z" fill="none" ' +
    'stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  var windowId = null;
  var lastSent = '';
  var reportTimer = null;
  var clampTimer = null;

  function minSize() {
    return (window.A2E && A2E.UiWindow) ? A2E.UiWindow : { minWidth: 920, minHeight: 600 };
  }

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

  /* ------------------------------------------------------------------ */
  /* window chrome                                                      */
  /* ------------------------------------------------------------------ */

  function sendBounds(win) {
    if (!win || win.state === 'minimized') return;
    const payload = {
      width: win.width, height: win.height,
      left: win.left, top: win.top,
      state: win.state
    };
    const key = [payload.width, payload.height, payload.left, payload.top, payload.state].join(',');
    if (key === lastSent) return;
    lastSent = key;
    browser.runtime.sendMessage({ type: 'UI_WINDOW_BOUNDS', data: payload }).catch(() => { });
  }

  /*
   * A resize event fires per frame while dragging, and dragging the window by
   * its title bar fires nothing at all, so poll. Two cheap API calls per second
   * while the UI is open is well below anything measurable.
   */
  function watchGeometry() {
    async function sample() {
      let win = null;
      try {
        win = await browser.windows.getCurrent();
      } catch (error) {
        return; /* window is closing */
      }
      if (!win || win.id !== windowId) return;

      const min = minSize();
      if (win.state === 'normal' && (win.width < min.minWidth || win.height < min.minHeight)) {
        /* no min-size API: put the window back after the user stops dragging */
        if (clampTimer) clearTimeout(clampTimer);
        clampTimer = setTimeout(function () {
          browser.windows.update(windowId, {
            width: Math.max(win.width, min.minWidth),
            height: Math.max(win.height, min.minHeight)
          }).then(function () {
            return browser.windows.getCurrent();
          }).then(sendBounds).catch(function () { /* window gone */ });
        }, 350);
        return;
      }

      sendBounds(win);
    }

    window.addEventListener('resize', function () {
      if (reportTimer) clearTimeout(reportTimer);
      reportTimer = setTimeout(sample, 250);
    });
    setInterval(sample, 800);
    sample();
  }

  function setupMaximizeButton(win) {
    const container = document.getElementById('window-controls');
    const button = document.getElementById('toggle-maximize');
    if (!container || !button) return;

    function render(state) {
      const maximized = state === 'maximized';
      const label = browser.i18n.getMessage(maximized ? 'restoreWindow' : 'maximizeWindow');
      button.innerHTML = maximized ? ICON_RESTORE : ICON_MAXIMIZE;
      button.title = label;
      button.setAttribute('aria-label', label);
    }

    render(win.state);
    container.hidden = false;

    button.addEventListener('click', async function () {
      let current = null;
      try {
        current = await browser.windows.getCurrent();
      } catch (error) {
        return;
      }
      const target = current.state === 'maximized' ? 'normal' : 'maximized';
      try {
        await browser.windows.update(current.id, { state: target });
        render(target);
      } catch (error) {
        console.warn('[AriaNG] toggle maximize failed', error);
      }
    });
  }

  async function setupWindow() {
    let win = null;
    try {
      win = await browser.windows.getCurrent();
    } catch (error) {
      return;
    }
    /* in a tab the browser already provides minimise/maximise - do nothing */
    if (!win || win.type !== 'popup') return;
    windowId = win.id;
    setupMaximizeButton(win);
    watchGeometry();
  }

  async function main() {
    setupWindow().catch(() => { });
    await syncAriaNgOptions();
    const element = document.getElementById('AriaNG');
    /* forward the popup page hash (deep links such as #!new?url=...) to the iframe */
    element.src = '../ui/ariang/index.html' + (window.location.hash || '');
  }

  main();
})();
