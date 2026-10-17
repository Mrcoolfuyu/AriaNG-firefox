AriaNG - Firefox Extension
==========================

让Aria2无缝接管下载，内置AriaNG前端。

A Firefox WebExtensions addon built on top of [AriaNg](https://github.com/mayswind/AriaNg) 1.3.15
(AllInOne build). It captures browser downloads and magnet links to your aria2 RPC server,
monitors aria2 status on the toolbar icon, and embeds the full AriaNG web UI.

The first version mirrors the feature set of
[Aria2-Explorer](https://github.com/alexhua/Aria2-Explorer) (Chrome), rewritten for the
Firefox WebExtensions API.

Author: Mr.cool
Homepage: https://github.com/Mrcoolfuyu/
License: MIT

Features
--------

* Toolbar icon
  * Left click: open the embedded AriaNG UI (popup / new tab / new window / sidebar, configurable).
  * Right click: context menu
    * 下载拦截 (toggle auto-capture)
    * 监测Aria2状态 (toggle status monitoring)
    * 打开AriaNG
    * 网站过滤 -> 当前网站->白名单 / 当前网站->黑名单
    * 默认Aria2 (radio list of configured RPC servers)
* Download capture
  * Auto-capture downloads to aria2 when the file size is above a configurable threshold (MB/GB).
  * Website / file-extension whitelists and blacklists (whitelist first, regex supported).
  * Hold Alt while clicking a link to skip capture (optional).
  * Ask for parameters before auto-download (opens the AriaNG new-task page pre-filled).
  * Magnet link capture via content script (system-level interception of magnet clicks).
  * Right-click a link/selection to export to a specific aria2 server; right-click a page to
    export all downloadable links at once.
  * Accept download requests from other extensions (runtime.onMessageExternal).
* Aria2 status monitoring
  * Badge on the toolbar icon shows the number of active (or waiting) tasks.
  * Icon title shows aggregated up/down speed and task counts.
  * Desktop notifications on task events (start / complete / error), optionally silent.
  * Supports multiple RPC servers, with per-server URL patterns and a default server.
* AriaNG UI
  * Full AriaNG 1.3.15 frontend embedded in the popup, sidebar, tab or window.
  * The extension keeps AriaNG's RPC configuration in sync with the extension settings.
* Options page
  * All of the above plus: capture-off icon style, config cloud sync (browser sync storage),
    config import/export (JSON file), light/dark/system color mode.

Firefox-specific notes (differences from the Chrome original)
-------------------------------------------------------------

* Context menu items use the `browser_action` context (Chrome uses `action`).
* Download capture uses `downloads.onCreated` + `downloads.cancel` instead of Chrome's
  `downloads.onDeterminingFilename` + `suggest()`. Because Firefox cannot redirect a
  download to another destination, the browser download is cancelled once the decision
  is made; when the file size is unknown at creation time the extension waits briefly
  for the size to appear and falls back to a HEAD request.
* The sidebar uses `browser.sidebarAction` (requires Firefox 131+).
* `chrome.power` (keep system awake) has no Firefox equivalent and was removed.
* Toolbar icon animations were replaced with static icons + badge text.
* When the popup open style is selected, Firefox cannot programmatically open the popup
  (no `browserAction.openPopup` on older versions); such actions fall back to a new tab.
* When an export to aria2 fails, the file is re-downloaded through the browser so that
  nothing is lost (the Chrome original only does this for localhost RPC servers).

Install (for development / sideload)
-----------------------------------

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click "Load Temporary Add-on..." and select `manifest.json` from this repository.
   (Temporary add-ons are removed when Firefox restarts.)
3. Open the extension options and configure your aria2 RPC server, e.g.
   `ws://192.168.50.100:6800/jsonrpc` with your secret key.

Build a signed/unsigned XPI with:

```sh
npx web-ext build
```

Lint with:

```sh
npx web-ext lint
```

RPC configuration
-----------------

Multiple aria2 servers can be configured on the options page. Each entry has:

* name - display name
* secret key - aria2 RPC secret (stored URL-encoded inside the RPC URL)
* RPC URL - e.g. `ws://host:6800/jsonrpc` or `http://host:6800/jsonrpc`
* download dir - default `dir` for tasks created through this server
* URL pattern(s) - comma-separated patterns; a task URL matching a pattern is routed to
  that server. `*` marks the default server.

AriaNG's own settings (language, theme, ...) are stored in the extension origin
localStorage under `AriaNg.Options` and are preserved across settings syncs.

Development
-----------

```
manifest.json          MV2 manifest (Firefox)
js/config.js           default configuration
js/utils.js            shared utilities (i18n, RPC URL helpers, ...)
js/aria2.js            minimal aria2 JSON-RPC client (WebSocket + HTTP fallback)
js/background.js       background page: menus, capture, monitor, notifications
js/content/            content scripts (magnet capture, export all links)
popup/                 toolbar popup embedding the AriaNG UI
options/               options page (vanilla JS/CSS)
ui/ariang/             AriaNg 1.3.15 AllInOne build (inline scripts extracted to js/)
images/                toolbar / action icons (4 styles)
_locales/              zh_CN (default) and en messages
```

Credits
-------

* [AriaNg](https://github.com/mayswind/AriaNg) - MIT License - the embedded web frontend.
* [Aria2-Explorer](https://github.com/alexhua/Aria2-Explorer) - the reference Chrome
  implementation whose feature set this addon mirrors.
* [aria2](https://github.com/aria2/aria2) - the download utility.
