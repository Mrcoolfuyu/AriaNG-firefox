/*
 * AriaNG Firefox Extension - shared utilities
 */
window.A2E = window.A2E || {};

A2E.Utils = (function () {
  'use strict';

  const Base64 = {
    /* utf-8 safe base64 encode */
    encode: function (str) {
      return btoa(unescape(encodeURIComponent(str)));
    },
    decode: function (str) {
      try {
        return decodeURIComponent(escape(atob(str)));
      } catch (e) {
        return '';
      }
    }
  };

  const Utils = {
    Base64: Base64,

    /*
     * Export the extension rpc list into AriaNG options object.
     * Only RPC-related keys are touched; other AriaNG settings (language,
     * theme, ...) are preserved. Operates on a copy-safe object.
     */
    exportRpcToAriaNg: function (rpcList, ariaNgOptions) {
      if (!ariaNgOptions || !Object.keys(ariaNgOptions).length) {
        ariaNgOptions = JSON.parse(JSON.stringify(A2E.DefaultAriaNgOptions));
      }
      ariaNgOptions.extendRpcServers = [];

      const uniqueRpcList = this.compactRpcList(rpcList);

      try {
        for (const i in uniqueRpcList) {
          let target = {};
          if (i == 0) {
            target = ariaNgOptions;
          } else {
            target.rpcId = Utils.generateUid();
            target.httpMethod = 'POST';
          }
          const url = new URL(uniqueRpcList[i].url);
          target.rpcAlias = uniqueRpcList[i].name;
          target.protocol = url.protocol.replace(':', '');
          target.rpcHost = url.hostname;
          target.rpcPort = url.port;
          target.rpcInterface = url.pathname.replace('/', '');
          target.secret = Base64.encode(this.parseUrl(uniqueRpcList[i].url).secretKey);
          if (i > 0) {
            ariaNgOptions.extendRpcServers.push(target);
          }
        }
      } catch (error) {
        console.warn('exportRpcToAriaNg: error = ' + error);
      }

      return ariaNgOptions;
    },

    compactRpcList: function (rpcList) {
      const compactRpcList = [];
      if (!rpcList || rpcList.length < 1) return compactRpcList;

      let defaultRpcIndex = 0;
      for (const i in rpcList) {
        const patterns = (rpcList[i]['pattern'] || '').split(',') || [];
        if (patterns.includes('*')) {
          defaultRpcIndex = i;
          break;
        }
      }
      compactRpcList.push(rpcList[defaultRpcIndex]);

      for (const sourceRpc of rpcList) {
        let included = false;
        const sourceUrl = sourceRpc.url.replace('127.0.0.1', 'localhost').replace('[::1]', 'localhost');
        for (const targetRpc of compactRpcList) {
          const targetUrl = targetRpc.url.replace('127.0.0.1', 'localhost').replace('[::1]', 'localhost');
          if (sourceUrl.split('//')[1] == targetUrl.split('//')[1]) {
            included = true;
            break;
          }
        }
        if (!included) compactRpcList.push(sourceRpc);
      }
      return compactRpcList;
    },

    generateUid: function () {
      const sourceId = 'AriaNG_' + Math.round(new Date().getTime() / 1000) + '_' + Math.random();
      return Base64.encode(sourceId);
    },

    /*
     * Does the AriaNG options object carry an RPC configuration?
     * (AriaNG persists its built-in defaults on first run, so a bare
     * "rpcHost: localhost" may be its default rather than a user choice.)
     */
    hasAriaNgRpcConfig: function (ariaNgOptions) {
      return !!(ariaNgOptions && typeof ariaNgOptions.rpcHost === 'string' && ariaNgOptions.rpcHost.trim() !== '');
    },

    /*
     * Convert an AriaNG options object back into the extension rpcList.
     * Extension-only fields (location / pattern / ignoreInsecure) are
     * preserved from a stored entry with the same RPC URL, so an
     * export -> import round trip is lossless.
     */
    importRpcFromAriaNg: function (ariaNgOptions, storedRpcList) {
      const result = [];
      const stored = storedRpcList || [];
      const convert = (server) => {
        if (!server) return;
        let secret = '';
        try {
          secret = Base64.decode(server.secret || '');
        } catch (error) {
          secret = '';
        }
        const protocol = server.protocol || 'http';
        const host = server.rpcHost || 'localhost';
        const port = server.rpcPort ? ':' + String(server.rpcPort) : '';
        const iface = server.rpcInterface ? '/' + String(server.rpcInterface).replace(/^\/+/, '') : '';
        const url = this.combineUrl(secret, protocol + '://' + host + port + iface);
        if (!url) return;
        const key = this.rpcUrlKey(url);
        const prev = stored.find((item) => this.rpcUrlKey(item.url) === key);
        result.push({
          name: server.rpcAlias || (prev && prev.name) || 'Aria2',
          url: url,
          location: (prev && prev.location) || '',
          pattern: (prev && prev.pattern) || '',
          ignoreInsecure: !!(prev && prev.ignoreInsecure)
        });
      };
      convert(ariaNgOptions);
      if (Array.isArray(ariaNgOptions.extendRpcServers)) {
        ariaNgOptions.extendRpcServers.forEach(convert);
      }
      return result;
    },

    /* protocol://host:port/path without credentials, for comparing RPC URLs */
    rpcUrlKey: function (url) {
      try {
        const parsed = new URL(url);
        const port = parsed.port || (parsed.protocol === 'https:' || parsed.protocol === 'wss:' ? '443' : '80');
        return parsed.protocol + '//' + parsed.hostname + ':' + port + parsed.pathname.replace(/\/$/, '');
      } catch (error) {
        return String(url || '');
      }
    },

    rpcListsEqual: function (listA, listB) {
      if (!Array.isArray(listA) || !Array.isArray(listB) || listA.length !== listB.length) return false;
      const keysA = listA.map((item) => this.rpcUrlKey(item.url)).sort();
      const keysB = listB.map((item) => this.rpcUrlKey(item.url)).sort();
      for (let i = 0; i < keysA.length; i++) {
        if (keysA[i] !== keysB[i]) return false;
      }
      return true;
    },

    /*
     * Write the extension rpcList into AriaNG's own options object
     * (localStorage key "AriaNg.Options"), preserving non-RPC settings
     * (language, theme, ...). Returns the merged options object.
     */
    pushRpcListToAriaNg: function (rpcList) {
      let options = {};
      try {
        const raw = localStorage.getItem(A2E.ARIA_NG_OPTIONS_KEY);
        if (raw) options = JSON.parse(raw) || {};
      } catch (error) {
        options = {};
      }
      const merged = this.exportRpcToAriaNg(rpcList, options);
      try {
        localStorage.setItem(A2E.ARIA_NG_OPTIONS_KEY, JSON.stringify(merged));
      } catch (error) {
        console.warn('pushRpcListToAriaNg: write failed', error);
      }
      return merged;
    },

    /*
     * Reconcile the extension rpcList with AriaNG's own options object.
     *
     * AriaNG manages that object itself and persists its built-in defaults on
     * first run, so it must never be overwritten blindly. We remember the
     * list last pushed into it ("rpcListPushed" in extension storage):
     *
     *   - AriaNg.Options holds no RPC config  -> seed it from the extension
     *     config (or the defaults) and record the push.
     *   - AriaNg.Options equals the last push -> the extension side changed
     *     (options page / import / menu); push it into AriaNG.
     *   - AriaNg.Options differs from the last push -> the user edited it
     *     inside the AriaNG UI; adopt it back into the extension config.
     *
     * Returns { rpcList, pushed }: values to persist in extension storage
     * (null = leave that key unchanged).
     */
    reconcileRpcConfig: function (storedRpcList, pushedRpcList) {
      let options = {};
      try {
        const raw = localStorage.getItem(A2E.ARIA_NG_OPTIONS_KEY);
        if (raw) options = JSON.parse(raw) || {};
      } catch (error) {
        options = {};
      }

      const hasStored = !!(storedRpcList && storedRpcList.length);
      const hasPushed = !!(pushedRpcList && pushedRpcList.length);

      if (!this.hasAriaNgRpcConfig(options)) {
        /* nothing configured in AriaNG yet: seed it */
        const seed = hasStored ? storedRpcList : JSON.parse(JSON.stringify(A2E.DefaultConfigs.rpcList));
        this.pushRpcListToAriaNg(seed);
        return { rpcList: hasStored ? null : seed, pushed: seed };
      }

      const imported = this.importRpcFromAriaNg(options, storedRpcList);
      if (!imported.length) return { rpcList: null, pushed: null };

      if (hasPushed && this.rpcListsEqual(imported, pushedRpcList)) {
        /* AriaNG is untouched since our last push - the extension side moved */
        if (hasStored && !this.rpcListsEqual(storedRpcList, pushedRpcList)) {
          this.pushRpcListToAriaNg(storedRpcList);
          return { rpcList: null, pushed: storedRpcList };
        }
        return { rpcList: null, pushed: null };
      }

      /* AriaNG-side edit (or no push record): adopt it, never clobber */
      return { rpcList: imported, pushed: imported };
    },

    getReadableSpeed: function (speed) {
      let unit = '';
      speed = parseInt(speed);
      if (isNaN(speed)) return '';
      if (speed >= 1024 * 1024) {
        speed /= 1024 * 1024;
        unit = ' MB/s';
      } else if (speed >= 1024) {
        speed /= 1024;
        unit = ' KB/s';
      } else if (speed >= 0) {
        unit = ' B/s';
        return speed + unit;
      }
      return speed.toFixed(2) + unit;
    },

    parseUrl: function (url) {
      let rpcUrl = '', secretKey = '';
      try {
        const urlObject = new URL(url);
        rpcUrl = urlObject.origin + urlObject.pathname;
        secretKey = decodeURIComponent(urlObject.password);
      } catch (error) {
        console.warn('Stored Rpc Url is invalid! URL ="' + url + '"');
      }
      return { rpcUrl: rpcUrl, secretKey: secretKey };
    },

    combineUrl: function (secretKey, rpcUrl) {
      let url = null;
      try {
        url = new URL(rpcUrl);
        if (secretKey) {
          url.username = 'token';
          url.password = encodeURIComponent(secretKey);
        }
      } catch (error) {
        console.warn('Input a invalid RPC URL! URL ="' + rpcUrl + '"');
        return '';
      }
      return url.toString();
    },

    localizeHtmlPage: function () {
      const objects = document.getElementsByTagName('html');
      for (const obj of objects) {
        const walker = document.createTreeWalker(obj, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
        let node;
        while ((node = walker.nextNode())) {
          if (node.nodeType === Node.TEXT_NODE) {
            const matches = node.nodeValue.match(/__MSG_(\w+)__/g);
            if (matches) {
              let newValue = node.nodeValue;
              for (const match of matches) {
                const messageName = match.slice(6, -2);
                const messageValue = browser.i18n.getMessage(messageName);
                newValue = newValue.replace(match, messageValue);
              }
              node.nodeValue = newValue;
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            for (const attr of node.attributes) {
              const matches = attr.value.match(/__MSG_(\w+)__/g);
              if (matches) {
                let newValue = attr.value;
                for (const match of matches) {
                  const messageName = match.slice(6, -2);
                  const messageValue = browser.i18n.getMessage(messageName);
                  newValue = newValue.replace(match, messageValue);
                }
                attr.value = newValue;
              }
            }
          }
        }
      }
    },

    formatFilepath: function (location, isDirectory = true) {
      if (!location || typeof location !== 'string') return '';
      const winDelimiter = '\\', unixDelimiter = '/';
      let eol = '';
      if (location.startsWith(unixDelimiter)) {
        eol = unixDelimiter;
        location = location.replaceAll(winDelimiter, unixDelimiter).replaceAll('//', '/');
      } else {
        eol = winDelimiter;
        location = location.replaceAll(unixDelimiter, winDelimiter).replaceAll('\\\\', '\\');
        location = location[0].toUpperCase() + location.slice(1);
      }
      if (isDirectory && !location.endsWith(eol)) {
        location = location + eol;
      }
      return location;
    },

    validateFilePath: function (filePath) {
      let regexp = '';
      if (filePath.startsWith('/')) {
        regexp = /^\/([^\s?*"'\\:;|<>/]+\/?)*$/;
      } else {
        regexp = /^([a-zA-Z]:\\?)((?<=\\)[^<>/\\?*":|]+\\?)*$/;
      }
      return regexp.test(filePath);
    },

    validateRpcUrl: function (rpcUrl) {
      try {
        var url = new URL(rpcUrl);
      } catch (error) {
        return 'INVALID';
      }
      if (url.pathname.length < 2) return 'INVALID';
      if (!/^(http|ws)s?:$/.test(url.protocol)) return 'INVALID';
      if (!Utils.isLocalhost(rpcUrl) && /^(http|ws):$/.test(url.protocol)) return 'WARNING';
      return 'VALID';
    },

    showNotification: function (content, id = 'NID_DEFAULT') {
      const option = {
        type: 'basic',
        title: 'Title',
        message: 'Sample',
        iconUrl: browser.runtime.getURL('images/logo128.png')
      };
      Object.assign(option, content);
      /* Chrome-only notification properties make Firefox's
       * notifications.create throw a TypeError - strip them. */
      delete option.requireInteraction;
      delete option.silent;
      delete option.buttons;
      delete option.isClickable;
      browser.notifications.create(id, option).catch(function (error) {
        console.warn('[AriaNG] notification failed:', error);
      });
    },

    baseName: function (filePath) {
      /*
       * Firefox reports downloads.DownloadItem.filename as an absolute OS path
       * (e.g. "C:\Users\...\file.zip"), while Chrome reports a name relative to
       * the download directory. aria2's "out" option needs a plain file name,
       * so reduce whatever we get to its last path segment.
       */
      return String(filePath || '').replace(/^.*[\\/]/, '');
    },

    getFileNameFromUrl: function (url) {
      try {
        url = new URL(url);
      } catch (error) {
        return '';
      }
      if (url.pathname.length < 2) return '';
      const paths = url.pathname.split('/');
      return paths[paths.length - 1];
    },

    isLocalhost: function (url) {
      try {
        var u = new URL(url);
      } catch (error) {
        return false;
      }
      return u.hostname == '[::1]' || u.hostname == '127.0.0.1' || u.hostname.toLowerCase() == 'localhost';
    },

    getPlatform: function () {
      return navigator.platform || '';
    }
  };

  return Utils;
})();
