/*
 * AriaNG Firefox Extension - background script
 *
 * Firefox WebExtensions (Manifest V2) implementation. Functionality mirrors
 * Aria2-Explorer (https://github.com/alexhua/Aria2-Explorer), rewritten for
 * the Firefox WebExtensions API:
 *   - context menus use the "browser_action" context (Chrome uses "action")
 *   - download capture uses downloads.onCreated + downloads.cancel
 *     (Chrome uses downloads.onDeterminingFilename + suggest())
 *   - the AriaNG UI opens in a movable popup window / tab (never the
 *     anchored browserAction popup, which cannot be moved)
 *   - no chrome.power equivalent (keep-awake removed)
 *   - static icons + badge text (Chrome canvas icon animations removed)
 */
window.A2E = window.A2E || {};

/*
 * Firefox exposes the context menus API as "browser.contextMenus" (the
 * "browser.menus" alias only exists when the "menus" permission is requested).
 * Use whichever namespace is available.
 */
A2E.menus = (typeof browser !== 'undefined' && browser.menus) ? browser.menus : browser.contextMenus;

(function () {
  'use strict';

  const NID_DEFAULT = 'NID_DEFAULT';
  const NID_TASK_NEW = 'NID_TASK_NEW';
  const NID_TASK_STOPPED = 'NID_TASK_STOPPED';
  const NID_EXPORT_ERROR = 'NID_EXPORT_ERROR';

  const INTERVAL_SHORT = 1000;
  const INTERVAL_LONG = 3000;
  const FILE_SIZE_WAIT_TIMEOUT = 5000;

  const MENU_IDS = {
    CAPTURE: 'capture-download',
    MONITOR: 'monitor-aria2',
    OPEN_UI: 'open-web-ui',
    WEBSITE_FILTER: 'website-filter',
    SITE_ALLOW: 'site-allow',
    SITE_BLOCK: 'site-block',
    RPC_LIST: 'rpc-list',
    EXPORT_ALL: 'export-all',
    EXPORT_TO: 'export-to'
  };

  const state = {
    configs: {},
    altKeyPressed: false,
    currentWindowId: 0,
    currentTabUrl: 'about:blank',
    monitorId: null,
    monitorInterval: INTERVAL_LONG,
    remoteAria2List: [],
    initGeneration: 0,
    pendingDownloads: new Map(), // downloadId -> { resolve, item } waiting for fileSize
    suppressCaptureUntil: 0
  };

  /* ------------------------------------------------------------------ */
  /* helpers                                                            */
  /* ------------------------------------------------------------------ */

  function msg(name, substitutions) {
    return browser.i18n.getMessage(name, substitutions) || name;
  }

  function getConfig(key) {
    return state.configs[key];
  }

  function getRpcServer(url) {
    const rpcList = getConfig('rpcList') || [];
    let defaultIndex = 0;
    for (let i = 1; i < rpcList.length; i++) {
      const patternStr = rpcList[i]['pattern'] || '';
      if (patternStr === '*') {
        defaultIndex = i;
        continue;
      }
      for (const pattern of patternStr.split(',')) {
        if (matchRule(url, pattern.trim())) {
          return rpcList[i];
        }
      }
    }
    return rpcList[defaultIndex] || rpcList[0];
  }

  function matchRule(str, rule) {
    if (!rule) return false;
    return new RegExp('^' + rule.replaceAll('*', '.*') + '$').test(str);
  }

  /* ------------------------------------------------------------------ */
  /* ariaNG options sync (extension origin localStorage)                */
  /* ------------------------------------------------------------------ */

  /*
   * Reconcile the extension rpcList with AriaNG's own options object.
   * AriaNG-side edits (made inside the AriaNG UI) are adopted back into the
   * extension config instead of being overwritten by defaults - see
   * A2E.Utils.reconcileRpcConfig.
   */
  async function syncAriaNgOptions() {
    let stored = {};
    try {
      stored = await browser.storage.local.get(['rpcList', 'rpcListPushed']);
    } catch (error) {
      console.warn('[AriaNG] syncAriaNgOptions: load configs failed', error);
      return;
    }
    let result = null;
    try {
      result = A2E.Utils.reconcileRpcConfig(stored.rpcList, stored.rpcListPushed);
    } catch (error) {
      console.warn('[AriaNG] syncAriaNgOptions failed:', error);
      return;
    }
    const update = {};
    if (result.rpcList) update.rpcList = result.rpcList;
    if (result.pushed) update.rpcListPushed = result.pushed;
    if (Object.keys(update).length > 0) {
      try {
        await browser.storage.local.set(update);
      } catch (error) {
        console.warn('[AriaNG] syncAriaNgOptions: save failed', error);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* icons                                                              */
  /* ------------------------------------------------------------------ */

  function iconPathFor(style, size) {
    if (!style || style === 'Default') return 'images/logo' + size + '.png';
    return 'images/logo' + size + '-' + style.toLowerCase() + '.png';
  }

  function refreshActionIcon() {
    const integration = getConfig('integration');
    const style = integration ? 'Default' : (getConfig('iconOffStyle') || 'Dusk');
    const path = {
      16: iconPathFor(style, 16),
      32: iconPathFor(style, 32),
      48: iconPathFor(style, 48)
    };
    browser.browserAction.setIcon({ path: path }).catch((e) => console.warn(e));
  }

  /* ------------------------------------------------------------------ */
  /* context menus                                                      */
  /* ------------------------------------------------------------------ */

  async function createRpcOptionsMenu() {
    const rpcList = getConfig('rpcList') || [];
    const rpcOptionsList = [];
    for (const i in rpcList) {
      const pattern = rpcList[i]['pattern'] || '';
      if (!pattern || pattern === '*') {
        rpcOptionsList.push({ id: i, name: rpcList[i].name });
      }
    }
    if (rpcOptionsList.length < 1) return;

    let needParentMenu = true;
    for (const menuItem of rpcOptionsList) {
      if (needParentMenu) {
        await A2E.menus.create({
          type: 'normal',
          id: MENU_IDS.RPC_LIST,
          title: '🔘 ' + msg('selectDefaultRpcStr'),
          contexts: ['browser_action']
        });
        needParentMenu = false;
      }
      const checked = (rpcList[menuItem.id]['pattern'] || '') === '*';
      await A2E.menus.create({
        type: 'radio',
        checked: checked,
        id: MENU_IDS.RPC_LIST + '-' + menuItem.id,
        parentId: MENU_IDS.RPC_LIST,
        title: menuItem.name,
        contexts: ['browser_action']
      });
    }
  }

  async function createOptionMenu() {
    await A2E.menus.create({
      type: 'checkbox',
      checked: !!getConfig('integration'),
      id: MENU_IDS.CAPTURE,
      title: '📥 ' + msg('downloadCaptureStr'),
      contexts: ['browser_action']
    });
    await A2E.menus.create({
      type: 'checkbox',
      checked: !!getConfig('monitorAria2'),
      id: MENU_IDS.MONITOR,
      title: '🩺 ' + msg('monitorAria2Str'),
      contexts: ['browser_action']
    });
    await A2E.menus.create({
      type: 'normal',
      id: MENU_IDS.OPEN_UI,
      title: '🪟 ' + msg('openWebUIStr'),
      contexts: ['browser_action']
    });
    await A2E.menus.create({
      type: 'normal',
      id: MENU_IDS.WEBSITE_FILTER,
      title: '🔛 ' + msg('websiteFilterStr'),
      contexts: ['browser_action']
    });
    await A2E.menus.create({
      type: 'checkbox',
      checked: false,
      id: MENU_IDS.SITE_ALLOW,
      parentId: MENU_IDS.WEBSITE_FILTER,
      title: '✅ ' + msg('addToWhiteListStr'),
      contexts: ['browser_action']
    });
    await A2E.menus.create({
      type: 'checkbox',
      checked: false,
      id: MENU_IDS.SITE_BLOCK,
      parentId: MENU_IDS.WEBSITE_FILTER,
      title: '🚫 ' + msg('addToBlackListStr'),
      contexts: ['browser_action']
    });
    await createRpcOptionsMenu();
  }

  async function createContextMenu() {
    if (getConfig('exportAll')) {
      await A2E.menus.create({
        id: MENU_IDS.EXPORT_ALL,
        title: '📥 ' + msg('exportAllDes'),
        contexts: ['page']
      });
    }
    if (getConfig('contextMenus')) {
      const strExport = msg('contextmenuTitle');
      if (getConfig('askBeforeExport')) {
        await A2E.menus.create({
          id: MENU_IDS.EXPORT_TO,
          title: strExport + 'AriaNG',
          contexts: ['link', 'selection']
        });
      } else {
        const rpcList = getConfig('rpcList') || [];
        for (const i in rpcList) {
          let title = '';
          if (rpcList.length === 1) {
            title = strExport + rpcList[i]['name'] + '  📥';
          } else if (rpcList.length > 1) {
            title = '📥 ' + strExport + rpcList[i]['name'];
          }
          await A2E.menus.create({
            id: MENU_IDS.EXPORT_TO + '-' + i,
            title: title,
            contexts: ['link', 'selection']
          });
        }
      }
    }
  }

  let menuRebuildChain = Promise.resolve();

  function rebuildMenus() {
    menuRebuildChain = menuRebuildChain.then(async () => {
      try {
        await A2E.menus.removeAll();
      } catch (e) { /* ignore */ }
      await createOptionMenu();
      await createContextMenu();
      await updateOptionMenuFromTab();
    }).catch((e) => console.warn('[AriaNG] rebuildMenus failed:', e));
    return menuRebuildChain;
  }

  async function updateOptionMenu(tab) {
    if (tab == null || !tab.active) return;
    if (!tab.url) return;
    let url;
    try {
      url = new URL(tab.url);
    } catch (e) {
      return;
    }
    const allowedSet = new Set(getConfig('allowedSites') || []);
    const blockedSet = new Set(getConfig('blockedSites') || []);
    try {
      await A2E.menus.update(MENU_IDS.SITE_ALLOW, { checked: allowedSet.has(url.hostname) });
      await A2E.menus.update(MENU_IDS.SITE_BLOCK, { checked: blockedSet.has(url.hostname) });
    } catch (e) { /* menus may not exist yet */ }
  }

  async function updateOptionMenuFromTab() {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0) {
        state.currentTabUrl = tabs[0].url || 'about:blank';
        await updateOptionMenu(tabs[0]);
      }
    } catch (e) { /* ignore */ }
  }

  function updateAllowedSites(tab) {
    if (tab == null || !tab.active || !tab.url) return;
    let url;
    try {
      url = new URL(tab.url);
    } catch (e) {
      return;
    }
    const set = new Set(getConfig('allowedSites') || []);
    if (set.has(url.hostname)) {
      set.delete(url.hostname);
    } else {
      set.add(url.hostname);
    }
    browser.storage.local.set({ allowedSites: Array.from(set) });
  }

  function updateBlockedSites(tab) {
    if (tab == null || !tab.active || !tab.url) return;
    let url;
    try {
      url = new URL(tab.url);
    } catch (e) {
      return;
    }
    const set = new Set(getConfig('blockedSites') || []);
    if (set.has(url.hostname)) {
      set.delete(url.hostname);
    } else {
      set.add(url.hostname);
    }
    browser.storage.local.set({ blockedSites: Array.from(set) });
  }

  /* ------------------------------------------------------------------ */
  /* capture enable / disable                                           */
  /* ------------------------------------------------------------------ */

  function enableCapture() {
    state.configs.integration = true;
    refreshActionIcon();
    A2E.menus.update(MENU_IDS.CAPTURE, { checked: true }).catch(() => { });
  }

  function disableCapture() {
    state.configs.integration = false;
    refreshActionIcon();
    A2E.menus.update(MENU_IDS.CAPTURE, { checked: false }).catch(() => { });
  }

  /* ------------------------------------------------------------------ */
  /* download capture (Firefox: downloads.onCreated + cancel)           */
  /* ------------------------------------------------------------------ */

  function onDownloadCreated(item) {
    if (!getConfig('integration')) return;
    if (Date.now() < state.suppressCaptureUntil) return;
    if (!item || item.error) return;
    if (item.state && item.state !== 'in_progress') return;
    if (!/^(https?|s?ftp):/i.test(item.url)) return;
    handleCapture(item);
  }

  function onDownloadChanged(delta) {
    if (!state.pendingDownloads.has(delta.id)) return;
    const pending = state.pendingDownloads.get(delta.id);
    const item = pending.item;
    if (delta.fileSize) {
      item.fileSize = delta.fileSize.currentValue;
      if (item.fileSize >= 0) {
        state.pendingDownloads.delete(delta.id);
        pending.resolve(item.fileSize);
        return;
      }
    }
    if (delta.state && delta.state.currentValue !== 'in_progress') {
      state.pendingDownloads.delete(delta.id);
      pending.resolve(item.fileSize >= 0 ? item.fileSize : -1);
    }
  }

  function resolveFileSize(item) {
    if (item.fileSize >= 0) return Promise.resolve(item.fileSize);
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        state.pendingDownloads.delete(item.id);
        resolve(-1);
      }, FILE_SIZE_WAIT_TIMEOUT);
      state.pendingDownloads.set(item.id, {
        item: item,
        resolve: (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      });
    }).then((size) => {
      if (size >= 0) return size;
      return headContentLength(item.url);
    });
  }

  async function headContentLength(url) {
    try {
      const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      const length = parseInt(response.headers.get('Content-Length') || '-1', 10);
      return isNaN(length) ? -1 : length;
    } catch (e) {
      return -1;
    }
  }

  async function shouldCapture(item) {
    const referrer = (item.referrer && item.referrer !== 'about:blank') ? item.referrer : '';
    let currentTabHost = '';
    let urlHost = '';
    try { currentTabHost = new URL(state.currentTabUrl).hostname; } catch (e) { /* ignore */ }
    try { urlHost = new URL(referrer || item.url).hostname; } catch (e) { /* ignore */ }

    if (state.altKeyPressed) {
      state.altKeyPressed = false;
      return false;
    }

    for (const site of getConfig('allowedSites') || []) {
      if (matchRule(currentTabHost, site) || matchRule(urlHost, site)) return true;
    }
    for (const site of getConfig('blockedSites') || []) {
      if (matchRule(currentTabHost, site) || matchRule(urlHost, site)) return false;
    }

    const filename = item.filename || '';
    for (const ext of getConfig('allowedExts') || []) {
      if (ext === '*' || (filename && filename.toLowerCase().endsWith(ext.toLowerCase()))) return true;
    }
    for (const ext of getConfig('blockedExts') || []) {
      if (ext === '*' || (filename && filename.toLowerCase().endsWith(ext.toLowerCase()))) return false;
    }

    const size = await resolveFileSize(item);
    const unit = getConfig('fileSizeUnit') === 'GB' ? 1024 * 1024 * 1024 : 1024 * 1024;
    const threshold = (parseFloat(getConfig('fileSize')) || 0) * unit;
    return size >= threshold;
  }

  async function handleCapture(item) {
    const capture = await shouldCapture(item);
    if (!capture) return;

    /* final url when redirects already happened */
    if (item.finalUrl && item.finalUrl !== 'about:blank') {
      item.url = item.finalUrl;
    }
    if (item.referrer === 'about:blank') {
      item.referrer = '';
    }

    try {
      await browser.downloads.cancel(item.id);
    } catch (e) {
      console.warn('[AriaNG] cancel download failed:', e);
    }

    const rpcItem = getRpcServer(item.url + (item.filename || ''));
    const successful = await download(item, rpcItem);

    if (!successful) {
      /* fallback: let the browser download the file so nothing is lost */
      console.warn('[AriaNG] aria2 export failed, falling back to browser download');
      state.suppressCaptureUntil = Date.now() + 5000;
      try {
        /* downloads.download() requires a path relative to the download dir */
        await browser.downloads.download({ url: item.url, filename: A2E.Utils.baseName(item.filename) });
      } catch (e) {
        console.warn('[AriaNG] browser fallback download failed:', e);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* send to aria2                                                      */
  /* ------------------------------------------------------------------ */

  async function getCookies(downloadItem) {
    try {
      const url = downloadItem.multiTask ? downloadItem.referrer : downloadItem.url;
      if (!url || !/^https?:/i.test(url)) return [];
      const cookies = await browser.cookies.getAll({ url: url });
      return cookies.map((cookie) => cookie.name + '=' + cookie.value);
    } catch (e) {
      return [];
    }
  }

  async function send2Aria(downloadItem, rpcItem) {
    let cookieItems = [];
    try {
      if (rpcItem.ignoreInsecure || A2E.Utils.isLocalhost(rpcItem.url) || /^(https|wss)/i.test(rpcItem.url)) {
        cookieItems = await getCookies(downloadItem);
      }
    } catch (error) {
      console.warn(error.message);
    }

    let headers = [];
    if (cookieItems.length > 0) {
      headers.push('Cookie: ' + cookieItems.join('; '));
    }
    headers.push('User-Agent: ' + navigator.userAgent);

    const options = { header: headers };
    if (downloadItem.referrer) options.referer = downloadItem.referrer;
    const outName = A2E.Utils.baseName(downloadItem.filename);
    if (outName) options.out = outName;
    if (downloadItem.dir) options.dir = downloadItem.dir;
    if (downloadItem.hasOwnProperty('options')) {
      Object.assign(options, downloadItem.options);
    }

    const remote = A2E.Utils.parseUrl(rpcItem.url);
    remote.name = rpcItem.name;
    const aria2 = new A2E.Aria2Client(remote);

    return aria2.addUri(downloadItem.url, options).then(function (response) {
      if (response && response.error) {
        return Promise.reject(response.error);
      }
      const data = { method: 'aria2.onExportSuccess', source: aria2, gid: response.result };
      if (!downloadItem.filename) {
        downloadItem.filename = A2E.Utils.getFileNameFromUrl(downloadItem.url);
      }
      data.contextMessage = A2E.Utils.formatFilepath(options.dir) + downloadItem.filename;
      notifyTaskStatus(data);
      return Promise.resolve(true);
    }).catch(function (error) {
      let contextMessage = '';
      if (error && error.message) {
        if (error.message.toLowerCase().includes('unauthorized')) {
          contextMessage = 'Secret key is incorrect.';
        } else if (error.message.toLowerCase().includes('failed to fetch')) {
          contextMessage = 'Aria2 server is unreachable.';
        } else {
          contextMessage = 'Error:' + error.message;
        }
      }
      const data = { method: 'aria2.onExportError', source: aria2, contextMessage: contextMessage };
      notifyTaskStatus(data);
      return Promise.resolve(false);
    });
  }

  async function download(downloadItem, rpcItem) {
    if (!downloadItem || !downloadItem.url) {
      console.warn('Download: Invalid download item, download request is dismissed!');
      return false;
    }

    let result = true;

    if (!('multiTask' in downloadItem)) {
      downloadItem.multiTask = downloadItem.url.includes('\n');
    }

    if (!rpcItem || !rpcItem.url) {
      rpcItem = getRpcServer(downloadItem.url + (downloadItem.filename || ''));
    }
    downloadItem.dir = rpcItem.location || '';
    if (!downloadItem.filename) downloadItem.filename = '';

    if (getConfig('askBeforeDownload') || downloadItem.multiTask) {
      try {
        await launchUI(downloadItem);
      } catch (error) {
        result = false;
        console.warn('Download: Launch UI failed.');
      }
    } else {
      result = await send2Aria(downloadItem, rpcItem);
    }
    return result;
  }

  /* ------------------------------------------------------------------ */
  /* ariaNG web ui launching                                            */
  /* ------------------------------------------------------------------ */

  async function launchUI(info) {
    const index = browser.runtime.getURL('ui/ariang/index.html');
    let webUiUrl = index + '#!';

    if (info && info.hasOwnProperty('filename') && info.url) {
      const downloadItem = info;
      webUiUrl = webUiUrl + '/new?url=' + encodeURIComponent(btoa(encodeURI(downloadItem.url)));
      if (downloadItem.referrer && downloadItem.referrer !== '' && downloadItem.referrer !== 'about:blank') {
        webUiUrl = webUiUrl + '&referer=' + encodeURIComponent(downloadItem.referrer);
      }
      let header = 'User-Agent: ' + navigator.userAgent;
      const cookies = await getCookies(downloadItem);
      if (cookies.length > 0) {
        header += '\nCookie: ' + cookies.join(';');
      }
      webUiUrl = webUiUrl + '&header=' + encodeURIComponent(header);
      if (downloadItem.filename) {
        webUiUrl = webUiUrl + '&filename=' + encodeURIComponent(downloadItem.filename);
      }
      if (downloadItem.dir) {
        webUiUrl = webUiUrl + '&dir=' + encodeURIComponent(downloadItem.dir);
      }
    } else if (typeof info === 'string' && info.startsWith(NID_TASK_STOPPED)) {
      const gid = info.slice(NID_TASK_STOPPED.length) || '';
      webUiUrl += gid ? '/task/detail/' + gid : '/stopped';
    } else {
      webUiUrl = index;
    }

    const openStyle = getConfig('webUIOpenStyle');

    if (openStyle === 'popup') {
      /*
       * Open the AriaNG UI in a real popup window (movable / resizable).
       * The anchored browserAction popup is never used - it is pinned to the
       * toolbar and cannot be moved.
       */
      const popupUrl = browser.runtime.getURL('popup/popup.html');
      /* webUiUrl is index + '#!...', so the substring already carries the '#' */
      const hash = (webUiUrl !== index) ? webUiUrl.substring(index.length) : '';
      try {
        await browser.windows.create({
          type: 'popup',
          url: popupUrl + hash,
          width: 800,
          height: 640,
          focused: true
        });
        return;
      } catch (error) {
        console.warn('[AriaNG] create popup window failed, fallback to tab:', error);
      }
      browser.tabs.create({ url: webUiUrl }).catch(() => { });
      return;
    }

    const tabs = await browser.tabs.query({ url: index });
    if (tabs && tabs.length > 0) {
      browser.windows.update(tabs[0].windowId, { focused: true }).catch(() => { });
      const prop = { active: true };
      if (webUiUrl !== index) prop.url = webUiUrl;
      browser.tabs.update(tabs[0].id, prop).catch(() => { });
      return;
    }

    browser.tabs.create({ url: webUiUrl }).catch(() => { });
  }

  /* ------------------------------------------------------------------ */
  /* monitor + badge                                                    */
  /* ------------------------------------------------------------------ */

  function enableMonitor() {
    if (state.monitorId) {
      console.warn('Warn: Monitor has already started.');
      return;
    }
    state.configs.monitorAria2 = true;
    A2E.menus.update(MENU_IDS.MONITOR, { checked: true }).catch(() => { });
    monitorAria2();
    state.monitorId = setInterval(monitorAria2, state.monitorInterval);
  }

  function disableMonitor() {
    if (state.monitorId) {
      clearInterval(state.monitorId);
      state.monitorId = null;
    }
    state.remoteAria2List.forEach((aria2) => aria2.closeSocket());
    browser.browserAction.setBadgeText({ text: '' }).catch(() => { });
    browser.browserAction.setTitle({ title: 'AriaNG' }).catch(() => { });
    state.configs.monitorAria2 = false;
    A2E.menus.update(MENU_IDS.MONITOR, { checked: false }).catch(() => { });
  }

  async function monitorAria2() {
    let connected = 0, disconnected = 0, errorMessage = '';
    let active = 0, stopped = 0, waiting = 0, uploadSpeed = 0, downloadSpeed = 0;
    const monitorAll = !!getConfig('monitorAll');
    const list = state.remoteAria2List;

    for (const i in list) {
      const remoteAria2 = list[i];
      try {
        remoteAria2.openSocket();
        const response = await remoteAria2.getGlobalStat();
        if (response && response.error) {
          throw response.error;
        }
        connected++;
        active += Number(response.result.numActive);
        stopped += Number(response.result.numStopped);
        waiting += Number(response.result.numWaiting);
        uploadSpeed += Number(response.result.uploadSpeed);
        downloadSpeed += Number(response.result.downloadSpeed);
      } catch (error) {
        disconnected++;
        if (i == 0) {
          if (error.message && error.message.toLowerCase().includes('unauthorized')) {
            errorMessage = 'Secret key is incorrect';
          } else {
            errorMessage = 'Aria2 server is unreachable';
          }
        }
      } finally {
        if (!getConfig('monitorAria2')) remoteAria2.closeSocket();
        if (!monitorAll) break;
      }
    }

    if (active > 0) {
      if (state.monitorInterval === INTERVAL_LONG) {
        state.monitorInterval = INTERVAL_SHORT;
        clearInterval(state.monitorId);
        state.monitorId = setInterval(monitorAria2, state.monitorInterval);
      }
    } else if (active === 0) {
      if (state.monitorInterval === INTERVAL_SHORT) {
        state.monitorInterval = INTERVAL_LONG;
        clearInterval(state.monitorId);
        state.monitorId = setInterval(monitorAria2, state.monitorInterval);
      }
    }

    let bgColor = 'green', textColor = 'white', text = '', title = '';
    const connectedStr = msg('connected');
    const disconnectedStr = msg('disconnected');
    if (monitorAll) title = connectedStr + ': ' + connected + ' ' + disconnectedStr + ': ' + disconnected + '\n';
    if (connected > 0) {
      if (!getConfig('badgeText')) {
        text = '';
      } else if (active > 0) {
        bgColor = (monitorAll && connected < list.length) ? '#0077cc' : 'green';
        text = active.toString();
      } else if (waiting > 0) {
        bgColor = '#AAA';
        text = waiting.toString();
      } else {
        textColor = '#666';
        bgColor = '#E1EEF5';
        text = '0';
      }
      const uploadStr = A2E.Utils.getReadableSpeed(uploadSpeed);
      const downloadStr = A2E.Utils.getReadableSpeed(downloadSpeed);
      title += msg('download') + ': ' + active + '  ' + msg('wait') + ': ' + waiting + '  ' + msg('finish') + ': ' + stopped
        + '\n' + msg('upload') + ': ' + uploadStr + '  ' + msg('download') + ': ' + downloadStr;
    } else {
      bgColor = '#A83030';
      text = 'E';
      if (monitorAll) {
        title += 'No Aria2 server is reachable.';
      } else {
        title += 'Failed to connect with ' + (list[0] ? list[0].name : 'Aria2') + '. ' + errorMessage + '.';
      }
    }

    if (getConfig('monitorAria2')) {
      try {
        browser.browserAction.setBadgeTextColor({ color: textColor }).catch(() => { });
        browser.browserAction.setBadgeBackgroundColor({ color: bgColor }).catch(() => { });
        browser.browserAction.setBadgeText({ text: text }).catch(() => { });
        browser.browserAction.setTitle({ title: title }).catch(() => { });
      } catch (e) {
        console.warn('[AriaNG] setBadge failed:', e);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* notifications                                                      */
  /* ------------------------------------------------------------------ */

  async function notifyTaskStatus(data) {
    const events = ['aria2.onDownloadComplete', 'aria2.onBtDownloadComplete',
      'aria2.onDownloadError', 'aria2.onExportSuccess', 'aria2.onExportError'];

    if (!data || !events.includes(data.method)) return;

    const event = data.method;

    if (!getConfig('allowNotification')) return;

    const aria2 = data.source;
    const gid = (data.params && data.params.length) ? data.params[0]['gid'] : (data.gid || '');
    let contextMessage = data.contextMessage || '';
    if (!contextMessage && gid) {
      try {
        const response = await aria2.tellStatus(gid, ['dir', 'files', 'bittorrent']);
        if (response && response.result) {
          const dir = A2E.Utils.formatFilepath(response.result.dir);
          const bittorrent = response.result.bittorrent;
          const files = response.result.files || [];
          if (bittorrent && bittorrent.info && bittorrent.info.name) {
            contextMessage = dir + bittorrent.info.name;
          } else if (files.length && files[0].path) {
            contextMessage = A2E.Utils.formatFilepath(files[0].path, false);
          } else if (files.length && files[0].uris && files[0].uris[0]) {
            contextMessage = dir + A2E.Utils.getFileNameFromUrl(files[0].uris[0].uri);
          }
        }
      } catch (e) {
        console.warn('NotifyStatus: Can not get context message');
      }
    }

    let title = 'taskNotification', message = '', sign = '', nid = '';
    switch (event) {
      case 'aria2.onDownloadStart':
        message = 'downloadStart';
        sign = ' ⬇️';
        nid = NID_DEFAULT + gid;
        break;
      case 'aria2.onDownloadComplete':
        message = 'downloadComplete';
        sign = ' ✅';
        nid = NID_TASK_STOPPED + gid;
        break;
      case 'aria2.onBtDownloadComplete':
        message = 'downloadComplete';
        sign = ' ✅';
        nid = NID_TASK_STOPPED + gid;
        break;
      case 'aria2.onDownloadError':
        message = 'downloadError';
        sign = ' ❌';
        nid = NID_TASK_STOPPED + gid;
        break;
      case 'aria2.onExportSuccess':
        title = 'exportSucceedStr';
        message = 'exportSucceedDes';
        sign = ' ⬇️';
        nid = NID_DEFAULT + gid;
        break;
      case 'aria2.onExportError':
        title = 'exportFailedStr';
        message = 'exportFailedDes';
        sign = ' ❌';
        nid = NID_EXPORT_ERROR;
        break;
    }

    if (message) {
      A2E.Utils.showNotification({
        title: msg(title),
        message: msg(message, aria2 ? aria2.name : 'Aria2') + sign,
        contextMessage: contextMessage,
        silent: !!getConfig('keepSilent')
      }, nid);
    }
  }

  /* ------------------------------------------------------------------ */
  /* menu click handler                                                 */
  /* ------------------------------------------------------------------ */

  async function onMenuClick(info, tab) {
    const url = info.linkUrl || info.selectionText;
    const referrer = info.frameUrl || info.pageUrl;
    const downloadItem = { url: url, referrer: referrer, filename: '', incognito: tab && tab.incognito };

    if (info.menuItemId === MENU_IDS.OPEN_UI) {
      launchUI(tab);
    } else if (info.menuItemId === MENU_IDS.CAPTURE) {
      browser.storage.local.set({ integration: info.checked });
    } else if (info.menuItemId === MENU_IDS.MONITOR) {
      browser.storage.local.set({ monitorAria2: info.checked });
    } else if (info.menuItemId === MENU_IDS.SITE_BLOCK) {
      updateBlockedSites(tab);
      updateOptionMenu(tab);
    } else if (info.menuItemId === MENU_IDS.SITE_ALLOW) {
      updateAllowedSites(tab);
      updateOptionMenu(tab);
    } else if (info.menuItemId.startsWith(MENU_IDS.RPC_LIST)) {
      const id = info.menuItemId.split('-').pop();
      const rpcList = getConfig('rpcList') || [];
      for (const i in rpcList) {
        rpcList[i].pattern = (i === id) ? '*' : '';
      }
      browser.storage.local.set({ rpcList: rpcList });
    } else if (info.menuItemId.startsWith(MENU_IDS.EXPORT_TO)) {
      if (getConfig('askBeforeExport')) {
        const rpcItem = getRpcServer(downloadItem.url);
        downloadItem.dir = rpcItem.location;
        downloadItem.id = tab.id;
        launchUI(downloadItem);
      } else {
        const id = info.menuItemId.split('-').pop();
        const rpcItem = (getConfig('rpcList') || [])[id];
        downloadItem.dir = rpcItem.location;
        send2Aria(downloadItem, rpcItem);
      }
    } else if (info.menuItemId === MENU_IDS.EXPORT_ALL) {
      try {
        await browser.tabs.sendMessage(tab.id, { type: 'EXPORT_ALL' });
      } catch (e) {
        console.warn('[AriaNG] export all links failed:', e);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* export all links (injected into page via message)                  */
  /* ------------------------------------------------------------------ */

  function exportAllLinksMessage() {
    /* handled by content script js/content/exportAll.js */
  }

  /* ------------------------------------------------------------------ */
  /* remote aria2 list                                                  */
  /* ------------------------------------------------------------------ */

  function initRemoteAria2() {
    const uniqueRpcList = A2E.Utils.compactRpcList(getConfig('rpcList'));
    state.remoteAria2List = state.remoteAria2List.slice(0, uniqueRpcList.length);
    for (const i in uniqueRpcList) {
      const rpcItem = uniqueRpcList[i];
      const remote = A2E.Utils.parseUrl(rpcItem.url);
      remote.name = rpcItem.name;
      try {
        if (state.remoteAria2List[i]) {
          state.remoteAria2List[i].setRemote(remote.name, remote.rpcUrl, remote.secretKey);
        } else {
          state.remoteAria2List[i] = new A2E.Aria2Client(remote);
        }
        if (getConfig('monitorAria2') && (i == 0 || getConfig('monitorAll'))) {
          state.remoteAria2List[i].regMessageHandler(notifyTaskStatus);
        } else {
          state.remoteAria2List[i].unRegMessageHandler(notifyTaskStatus);
        }
      } catch (error) {
        console.error('Failed to initialize Aria2 RPC server', error.message);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* init                                                               */
  /* ------------------------------------------------------------------ */

  function applyPopupState() {
    /*
     * Never attach an anchored browserAction popup: it is pinned to the
     * toolbar and cannot be moved. With no popup attached, left click fires
     * browserAction.onClicked and the AriaNG UI opens per webUIOpenStyle
     * (movable popup window / tab).
     */
    try {
      browser.browserAction.setPopup({ popup: '' }).catch(() => { });
    } catch (error) {
      /* some versions reject the empty string - no popup is the default anyway */
    }
  }

  async function init() {
    const generation = ++state.initGeneration;
    let stored = {};
    try {
      stored = await browser.storage.local.get(null);
    } catch (error) {
      console.error('[AriaNG] load configs failed:', error);
    }
    if (generation !== state.initGeneration) return; /* superseded */

    state.configs = Object.assign({}, A2E.DefaultConfigs, stored);
    state.monitorInterval = INTERVAL_LONG;

    applyPopupState();
    initRemoteAria2();
    syncAriaNgOptions();
    refreshActionIcon();

    await rebuildMenus();

    if (getConfig('integration')) {
      enableCapture();
    } else {
      disableCapture();
    }
    if (getConfig('monitorAria2')) {
      enableMonitor();
    } else {
      disableMonitor();
    }
    console.log('[AriaNG] background initialized, base url: ' + browser.runtime.getURL(''));
  }

  /* ------------------------------------------------------------------ */
  /* listeners                                                          */
  /* ------------------------------------------------------------------ */

  function registerAllListeners() {
    browser.browserAction.onClicked.addListener(function (tab) {
      launchUI(tab);
    });

    A2E.menus.onClicked.addListener(function (info, tab) {
      onMenuClick(info, tab).catch((e) => console.error(e));
    });

    browser.downloads.onCreated.addListener(onDownloadCreated);
    browser.downloads.onChanged.addListener(onDownloadChanged);

    browser.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
      if (changeInfo.status === 'loading' && tab && tab.active) {
        state.currentTabUrl = tab.url || 'about:blank';
        updateOptionMenu(tab).catch(() => { });
      }
    });

    browser.tabs.onActivated.addListener(function (activeInfo) {
      browser.tabs.get(activeInfo.tabId).then(function (tab) {
        state.currentTabUrl = (tab && tab.url) || 'about:blank';
        updateOptionMenu(tab).catch(() => { });
      }).catch(() => { });
    });

    browser.windows.onFocusChanged.addListener(function (windowId) {
      state.currentWindowId = windowId;
      browser.tabs.query({ windowId: windowId, active: true }).then(function (tabs) {
        if (tabs && tabs.length > 0) {
          state.currentTabUrl = tabs[0].url || 'about:blank';
          updateOptionMenu(tabs[0]).catch(() => { });
        }
      }).catch(() => { });
    });

    browser.notifications.onClicked.addListener(function (id) {
      if (id.startsWith(NID_TASK_NEW) || id.startsWith(NID_TASK_STOPPED)) {
        launchUI(id);
      }
      browser.notifications.clear(id).catch(() => { });
    });

    browser.commands.onCommand.addListener(function (command) {
      if (command === 'toggle-capture') {
        browser.storage.local.set({ integration: !getConfig('integration') }).catch(() => { });
      }
    });

    browser.runtime.onInstalled.addListener(function (details) {
      if (details.reason === 'install') {
        const url = browser.runtime.getURL('options/options.html');
        browser.tabs.create({ url: url }).catch(() => { });
      }
    });

    /* receive requests from other extensions */
    browser.runtime.onMessageExternal.addListener(function (downloadItem) {
      if (getConfig('allowExternalRequest')) {
        download(downloadItem, null);
      }
    });

    /* receive messages from content scripts and ariaNG pages */
    browser.runtime.onMessage.addListener(function (message, sender) {
      switch (message.type) {
        case 'DOWNLOAD':
        case 'EXPORT_ALL':
          download(message.data, null);
          break;
        case 'DOWNLOAD_VIA_BROWSER':
          const downloadItem = message.data || {};
          downloadItem.type = 'DOWNLOAD_VIA_BROWSER';
          download(downloadItem, null);
          break;
        case 'CLICK_EVENT':
          state.altKeyPressed = !!(message.data && message.data.altKeyPressed);
          break;
      }
    });

    browser.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;

      const needReInit = changes.rpcList || changes.contextMenus || changes.askBeforeExport ||
        changes.exportAll || changes.allowNotification || changes.integration ||
        changes.monitorAria2 || changes.monitorAll ||
        changes.iconOffStyle;

      if (needReInit) {
        init();
      } else {
        for (const key of Object.keys(changes)) {
          state.configs[key] = changes[key].newValue;
        }
        if (changes.captureMagnet || changes.checkClick) {
          /* content scripts read their config from storage directly */
        }
        if (changes.iconOffStyle && !state.configs.integration) {
          refreshActionIcon();
        }
        if (changes.fileSize || changes.fileSizeUnit) {
          /* thresholds are read from state.configs at capture time */
        }
      }
      syncAriaNgOptions();
    });
  }

  /* ------------------------------------------------------------------ */

  registerAllListeners();
  init();
})();
