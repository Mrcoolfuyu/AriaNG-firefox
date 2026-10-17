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
