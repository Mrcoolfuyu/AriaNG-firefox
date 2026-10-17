/*
 * AriaNG Firefox Extension - options page logic
 * Mirrors the settings model of Aria2-Explorer, vanilla JS for Firefox.
 */
(function () {
  'use strict';

  const AriaNgOptionsKey = A2E.ARIA_NG_OPTIONS_KEY;

  const ColorModeList = [
    { name: 'light', icon: '🌞', title: 'lightMode' },
    { name: 'dark', icon: '🌙', title: 'darkMode' },
    { name: 'system', icon: '🌗', title: 'followSystem' }
  ];

  const OptionDeps = {
    askBeforeExport: 'contextMenus',
    checkClick: 'integration',
    keepSilent: 'allowNotification'
  };

  const Configs = {
    init: async function () {
      A2E.Utils.localizeHtmlPage();

      let stored = {};
      try {
        stored = await browser.storage.local.get(null);
      } catch (error) {
        console.error('init: ' + error.message);
      }
      const configs = Object.assign({}, A2E.DefaultConfigs, stored);
      Object.assign(Configs, A2E.DefaultConfigs, stored);

      setColorMode(configs.colorModeId);

      document.querySelectorAll('input[type=checkbox]').forEach((el) => { el.checked = false; });
      document.querySelectorAll('input[type=text],input[type=number]').forEach((el) => { el.value = ''; });
      document.querySelectorAll('textarea').forEach((el) => { el.value = ''; });

      const styleRadio = document.querySelector('input[name=webUIOpenStyle][value="' + configs.webUIOpenStyle + '"]');
      if (styleRadio) styleRadio.checked = true;
      const iconRadio = document.querySelector('input[name=iconOffStyle][value="' + configs.iconOffStyle + '"]');
      if (iconRadio) iconRadio.checked = true;
      const unitSelect = document.getElementById('fileSizeUnit');
      if (unitSelect) unitSelect.value = configs.fileSizeUnit || 'MB';

      document.querySelectorAll('input[type=checkbox]').forEach((el) => {
        if (el.id && configs.hasOwnProperty(el.id)) {
          el.checked = !!configs[el.id];
        }
      });

      const monitorAllRow = document.getElementById('monitor-all');
      if (monitorAllRow) {
        monitorAllRow.style.display = (configs.rpcList && configs.rpcList.length > 1) ? '' : 'none';
      }

      for (const [dependent, dependency] of Object.entries(OptionDeps)) {
        const depEl = document.getElementById(dependent);
        const srcEl = document.getElementById(dependency);
        if (depEl && srcEl) {
          depEl.disabled = !configs[dependency];
          srcEl.onchange = () => {
            depEl.disabled = !srcEl.checked;
          };
        }
      }

      document.querySelectorAll('input[type=text],input[type=number]').forEach((el) => {
        if (el.id && configs.hasOwnProperty(el.id)) {
          el.value = configs[el.id];
        }
      });

      document.querySelectorAll('textarea').forEach((el) => {
        if (el.id && Array.isArray(configs[el.id])) {
          el.value = configs[el.id].join('\n');
        }
      });

      document.querySelectorAll('.rpc-row').forEach((el) => el.remove());
      const rpcList = (configs.rpcList && configs.rpcList.length) ? configs.rpcList : A2E.DefaultConfigs.rpcList;

      for (const i in rpcList) {
        appendRpcRow(i, rpcList[i]);
      }

      /* sidebar availability hint */
      if (typeof browser.sidebarAction === 'undefined') {
        const warn = document.getElementById('sidebar-warn');
        if (warn) warn.style.display = 'inline';
      }

      const shortcutsSetting = document.getElementById('shortcuts-setting');
      if (shortcutsSetting) {
        shortcutsSetting.onclick = () => {
          browser.tabs.create({ url: 'about:addons' });
        };
      }

      const manifest = browser.runtime.getManifest();
      const versionEl = document.getElementById('version');
      if (versionEl) versionEl.textContent = 'v' + manifest.version;

      const colorModeEl = document.getElementById('colorMode');
      if (colorModeEl) {
        colorModeEl.onclick = () => {
          Configs.colorModeId = ((Configs.colorModeId || 0) + 1) % ColorModeList.length;
          browser.storage.local.set({ colorModeId: Configs.colorModeId });
        };
      }

      const exportBtn = document.getElementById('exportConfig');
      if (exportBtn) exportBtn.onclick = Configs.export;
      const importBtn = document.getElementById('importConfig');
      if (importBtn) importBtn.onclick = Configs.import;
      const fileInput = document.getElementById('configFileInput');
      if (fileInput) fileInput.onchange = Configs.handleConfigImport;

      const form = document.getElementById('options-form');
      if (form) {
        form.onsubmit = (event) => {
          event.preventDefault();
          Configs.save();
        };
        form.onreset = (event) => {
          event.preventDefault();
          Configs.reset();
        };
      }
    },

    reset: async function () {
      if (!confirm(browser.i18n.getMessage('ClearSettingsDes'))) return;
      try {
        localStorage.removeItem(AriaNgOptionsKey);
      } catch (e) { /* ignore */ }
      await browser.storage.local.clear();
      await browser.storage.local.set(A2E.DefaultConfigs);
      Configs.init();
    },

    save: async function () {
      const rpcRows = document.querySelectorAll('.rpc-row');
      const rpcList = [];
      rpcRows.forEach((row) => {
        const name = row.querySelector('.name').value.trim();
        const secretKey = row.querySelector('.secretKey').value;
        const rpcUrlValue = row.querySelector('.rpcUrl').value.trim();
        const location = row.querySelector('.location').value.trim();
        const patternEl = row.querySelector('.pattern');
        const pattern = patternEl ? patternEl.value.trim() : '';
        if (name && rpcUrlValue) {
          const url = A2E.Utils.combineUrl(secretKey, rpcUrlValue);
          if (!url) return;
          rpcList.push({
            name: name,
            url: url,
            location: A2E.Utils.formatFilepath(location) || '',
            pattern: pattern,
            ignoreInsecure: row.dataset.ignoreInsecure === 'true'
          });
        }
      });

      if (!rpcList || !rpcList.length) {
        rpcList.push({ name: 'Aria2', url: 'http://localhost:6800/jsonrpc', location: '', pattern: '' });
      }

      const config = { rpcList: rpcList };

      document.querySelectorAll('input[type=checkbox]').forEach((el) => {
        if (el.id && A2E.DefaultConfigs.hasOwnProperty(el.id)) {
          config[el.id] = el.checked;
        }
      });
      document.querySelectorAll('input[type=text],input[type=number]').forEach((el) => {
        if (el.id && A2E.DefaultConfigs.hasOwnProperty(el.id)) {
          config[el.id] = el.value;
        }
      });

      const styleRadio = document.querySelector('input[name=webUIOpenStyle]:checked');
      if (styleRadio) config.webUIOpenStyle = styleRadio.value;
      const iconRadio = document.querySelector('input[name=iconOffStyle]:checked');
      if (iconRadio) config.iconOffStyle = iconRadio.value;

      document.querySelectorAll('textarea').forEach((el) => {
        if (!el.id || !A2E.DefaultConfigs.hasOwnProperty(el.id)) return;
        let values = el.value.trim().split('\n');
        const tempSet = new Set(values);
        tempSet.delete('');
        config[el.id] = Array.from(tempSet);
      });

      saving = true;
      try {
        await browser.storage.local.set(config);
      } finally {
        saving = false;
      }
      Configs.notifyResult('sync-result', browser.i18n.getMessage('Save') + ' ✓', 'alert-success');
    },

    upload: async function () {
      try {
        const ariaNgOptionsValue = localStorage.getItem(AriaNgOptionsKey);
        Configs.ariaNgOptions = (typeof ariaNgOptionsValue === 'string')
          ? JSON.parse(ariaNgOptionsValue)
          : JSON.parse(JSON.stringify(A2E.DefaultAriaNgOptions));
      } catch (e) {
        Configs.ariaNgOptions = JSON.parse(JSON.stringify(A2E.DefaultAriaNgOptions));
        console.warn('Upload: Local AriaNG options is invalid, default is loaded.');
      }
      if (!Configs.rpcList || !Configs.rpcList.length) {
        if (!confirm(browser.i18n.getMessage('uploadConfigWarn'))) return;
      }
      try {
        await browser.storage.sync.set(Configs);
        Configs.notifySyncResult(browser.i18n.getMessage('uploadConfigSucceed'), 'alert-success');
      } catch (error) {
        Configs.notifySyncResult(browser.i18n.getMessage('uploadConfigFailed') + ' (' + error.message + ')', 'alert-danger', 5000);
      }
    },

    download: async function () {
      try {
        const configs = await browser.storage.sync.get(null);
        if (Object.keys(configs).length > 0) {
          try {
            if (typeof configs.ariaNgOptions === 'string') {
              configs.ariaNgOptions = JSON.parse(configs.ariaNgOptions);
            }
            const optionsLength = Object.keys(configs.ariaNgOptions || {}).length;
            const defaultLength = Object.keys(A2E.DefaultAriaNgOptions).length;
            if (optionsLength >= defaultLength) {
              localStorage.setItem(AriaNgOptionsKey, JSON.stringify(configs.ariaNgOptions));
            } else {
              delete configs.ariaNgOptions;
            }
          } catch (e) {
            delete configs.ariaNgOptions;
            console.warn('Download: AriaNG options is invalid.');
          }
          saving = true;
          try {
            await browser.storage.local.set(configs);
          } finally {
            saving = false;
          }
          Configs.notifySyncResult(browser.i18n.getMessage('downloadConfigSucceed'), 'alert-success');
          Configs.init();
        } else {
          throw new TypeError('Invalid extension configs');
        }
      } catch (error) {
        Configs.notifySyncResult(browser.i18n.getMessage('downloadConfigFailed'), 'alert-danger', 5000);
      }
    },

    notifySyncResult: function (message, style, timeout = 2000) {
      Configs.notifyResult('sync-result', message, style, timeout);
    },

    notifyResult: function (elementId, message, style, timeout = 2000) {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.classList.add(style);
      el.textContent = message;
      setTimeout(() => {
        el.textContent = '';
        el.classList.remove(style);
      }, timeout);
    },

    export: function () {
      const configData = {};
      for (const key in Configs) {
        if (typeof Configs[key] !== 'function' && key !== 'init') {
          configData[key] = Configs[key];
        }
      }
      try {
        const ariaNgOptionsValue = localStorage.getItem(AriaNgOptionsKey);
        if (typeof ariaNgOptionsValue === 'string') {
          configData.ariaNgOptions = JSON.parse(ariaNgOptionsValue);
        }
      } catch (e) {
        configData.ariaNgOptions = JSON.parse(JSON.stringify(A2E.DefaultAriaNgOptions));
      }

      const dataStr = JSON.stringify(configData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ariang-config-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      Configs.notifyResult('import-export-result', browser.i18n.getMessage('exportConfigSuccess'), 'alert-success');
    },

    import: function () {
      const fileInput = document.getElementById('configFileInput');
      if (fileInput) fileInput.click();
    },

    handleConfigImport: function (event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async function (e) {
        try {
          const configData = JSON.parse(e.target.result);
          if (!configData || typeof configData !== 'object') {
            throw new Error('Invalid config format');
          }
          if (!confirm(browser.i18n.getMessage('importConfigConfirm'))) {
            return;
          }
          if (configData.ariaNgOptions) {
            try {
              localStorage.setItem(AriaNgOptionsKey, JSON.stringify(configData.ariaNgOptions));
            } catch (error) {
              console.warn('Failed to import AriaNG options:', error);
            }
            delete configData.ariaNgOptions;
          }
          saving = true;
          try {
            await browser.storage.local.set(configData);
          } finally {
            saving = false;
          }
          Configs.init();
          Configs.notifyResult('import-export-result', browser.i18n.getMessage('importConfigSuccess'), 'alert-success');
        } catch (error) {
          console.error('Import config error:', error);
          Configs.notifyResult('import-export-result',
            browser.i18n.getMessage('importConfigFailed') + ' (' + error.message + ')', 'alert-danger', 5000);
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    }
  };

  /* ------------------------------------------------------------------ */
  /* rpc rows                                                           */
  /* ------------------------------------------------------------------ */

  function appendRpcRow(i, rpcItem) {
    const list = document.getElementById('rpcList');
    const row = document.createElement('div');
    row.className = 'form-row rpc-row';

    const remote = A2E.Utils.parseUrl(rpcItem.url);

    const label = document.createElement('label');
    label.className = 'row-label';
    if (i == 0) {
      const icon = document.createElement('span');
      icon.className = 'row-icon';
      icon.textContent = '🖥';
      label.appendChild(icon);
      label.appendChild(document.createTextNode('Aria2-RPC-Server'));
    }
    row.appendChild(label);

    const content = document.createElement('div');
    content.className = 'row-content';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'name';
    nameInput.placeholder = browser.i18n.getMessage('Name') + ' ∗';
    nameInput.value = rpcItem.name || '';
    content.appendChild(nameInput);

    const secretInput = document.createElement('input');
    secretInput.type = 'password';
    secretInput.className = 'secretKey';
    secretInput.placeholder = browser.i18n.getMessage('SecretKey');
    secretInput.value = remote.secretKey || '';
    content.appendChild(secretInput);

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'rpcUrl';
    urlInput.placeholder = 'RPC URL ∗';
    urlInput.value = remote.rpcUrl || '';
    content.appendChild(urlInput);

    const markBtn = document.createElement('button');
    markBtn.type = 'button';
    markBtn.className = 'btn btn-success mark-btn';
    markBtn.textContent = '✏️ ' + browser.i18n.getMessage('Mark');
    content.appendChild(markBtn);

    const locationInput = document.createElement('input');
    locationInput.type = 'text';
    locationInput.className = 'location';
    locationInput.placeholder = browser.i18n.getMessage('downloadLocation');
    locationInput.value = rpcItem.location || '';
    content.appendChild(locationInput);

    let patternInput = null;
    if (i > 0) {
      patternInput = document.createElement('input');
      patternInput.type = 'text';
      patternInput.className = 'pattern';
      patternInput.placeholder = 'URL Pattern(s) split by ,';
      patternInput.value = rpcItem.pattern || '';
      content.appendChild(patternInput);
    } else {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn btn-primary';
      addBtn.id = 'add-rpc';
      addBtn.textContent = '➕ RPC Server';
      addBtn.addEventListener('click', () => {
        const rows = document.querySelectorAll('.rpc-row');
        appendRpcRow(rows.length, { name: '', url: '', location: '', pattern: '' });
      });
      content.appendChild(addBtn);
    }

    row.dataset.ignoreInsecure = rpcItem.ignoreInsecure ? 'true' : 'false';
    markBtn.addEventListener('click', () => {
      row.dataset.ignoreInsecure = row.dataset.ignoreInsecure === 'true' ? 'false' : 'true';
      applyMarkState(row);
    });
    applyMarkState(row);

    urlInput.addEventListener('input', (event) => validateRpcUrlInput(event.target));
    locationInput.addEventListener('input', (event) => validateLocationInput(event.target));

    row.appendChild(content);
    list.appendChild(row);
  }

  function applyMarkState(row) {
    const markBtn = row.querySelector('.mark-btn');
    const insecure = row.dataset.ignoreInsecure === 'true';
    if (markBtn) {
      markBtn.classList.toggle('btn-success', insecure);
      markBtn.classList.toggle('btn-warning', !insecure);
      markBtn.title = insecure
        ? browser.i18n.getMessage('MarkAsInsecureTip')
        : browser.i18n.getMessage('MarkAsSecureTip');
    }
  }

  function validateRpcUrlInput(input) {
    input.classList.remove('is-invalid', 'is-valid', 'is-warning');
    const result = A2E.Utils.validateRpcUrl(input.value);
    if (result === 'VALID' || result === true) {
      input.classList.add('is-valid');
    } else if (input.value && (result === 'INVALID' || result === false)) {
      input.classList.add('is-invalid');
    } else if (result === 'WARNING') {
      input.classList.add('is-valid', 'is-warning');
      input.title = browser.i18n.getMessage('RpcUrlTooltipWarnDes');
    }
  }

  function validateLocationInput(input) {
    input.classList.remove('is-invalid', 'is-valid');
    if (!input.value) return;
    const result = A2E.Utils.validateFilePath(input.value.trim());
    input.classList.add(result ? 'is-valid' : 'is-invalid');
  }

  /* ------------------------------------------------------------------ */
  /* color mode                                                         */
  /* ------------------------------------------------------------------ */

  function setColorMode(colorModeId) {
    const mode = (colorModeId === undefined) ? Configs.colorModeId : colorModeId;
    switch (mode) {
      case 0:
        document.documentElement.classList.remove('dark-mode');
        break;
      case 1:
        document.documentElement.classList.add('dark-mode');
        break;
      default:
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.documentElement.classList.add('dark-mode');
        } else {
          document.documentElement.classList.remove('dark-mode');
        }
    }
    const colorModeEl = document.getElementById('colorMode');
    if (colorModeEl) {
      const item = ColorModeList[mode] || ColorModeList[2];
      colorModeEl.textContent = item.icon;
      colorModeEl.title = browser.i18n.getMessage(item.title);
    }
  }

  /* ------------------------------------------------------------------ */

  let saving = false;

  window.addEventListener('DOMContentLoaded', Configs.init);
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setColorMode);
    } catch (e) { /* ignore */ }
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (saving) return;
    if (Object.keys(changes).length === 1 && changes.hasOwnProperty('colorModeId')) {
      setColorMode(changes.colorModeId.newValue);
      return;
    }
    Configs.init();
  });

  window.addEventListener('keyup', (e) => {
    if (!e.altKey) return;
    let handler = null;
    switch (e.key) {
      case 's': handler = Configs.save; break;
      case 'r': handler = Configs.reset; break;
      case 'u': handler = Configs.upload; break;
      case 'j': handler = Configs.download; break;
      case 'e': handler = Configs.export; break;
      case 'i': handler = Configs.import; break;
    }
    if (handler) {
      e.preventDefault();
      handler();
    }
  });

  /* expose for debugging / tests */
  window.__A2E_OPTIONS__ = Configs;
})();