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
  * Left click: open the embedded AriaNG UI (popup window / new tab, configurable).
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
  * Full AriaNG 1.3.15 frontend embedded in a popup window or a new tab.
  * The extension keeps AriaNG's RPC configuration in sync with the extension settings.
* Icons
  * Product icon: blue download arrow (`images/ariang-blue.svg`, rasterised to
    16/32/48/64/128 PNG).
  * While capture is turned off the toolbar icon uses the colour picked in
    "拦截关闭状态图标" (gray / green / blue).
* Options page
  * All of the above plus: capture-off icon colour, config cloud sync (browser sync storage),
    config import/export (JSON file), light/dark/system color mode.

Firefox-specific notes (differences from the Chrome original)
-------------------------------------------------------------

* Context menu items use the `browser_action` context (Chrome uses `action`).
* Download capture uses `downloads.onCreated` + `downloads.cancel` instead of Chrome's
  `downloads.onDeterminingFilename` + `suggest()`. Because Firefox cannot redirect a
  download to another destination, the browser download is cancelled once the decision
  is made; when the file size is unknown at creation time the extension waits briefly
  for the size to appear and falls back to a HEAD request.
* `chrome.power` (keep system awake) has no Firefox equivalent and was removed.
* Toolbar icon animations were replaced with static icons + badge text.
* The "popup" open style opens a real popup window (`windows.create` with
  `type: 'popup'`) instead of the anchored `browserAction` popup, so the window can be
  moved and resized like any other window.
* Popup window sizing (`A2E.UiWindow` in `js/config.js`): the minimum is
  920x600 - AriaNG's bundled stylesheet hides the whole left menu below 768 CSS
  px, so a narrower window silently loses the navigation tree. There is no
  min-size API, so the popup page puts the window back when it is dragged smaller.
* The window remembers its size, position and maximized state across launches
  (`uiWindowBounds` in `browser.storage.local`). Firefox has no
  `windows.onBoundsChanged` (Chromium-only event), so the popup page reports its
  own geometry through `runtime.sendMessage` (`UI_WINDOW_BOUNDS`) on resize and
  once per poll - the poll is what catches moving the window.
* Firefox draws the maximize button of a popup window greyed out and inactive.
  `windows.update({ state: 'maximized' })` does work there, so `popup/popup.html`
  carries its own maximize / restore button in the top-right corner.
* RPC configuration lives in two places - the extension storage (options page) and
  AriaNG's own `AriaNg.Options` localStorage. They are reconciled on every open:
  edits made inside the AriaNG UI are adopted back into the extension config instead
  of being overwritten by defaults, and extension-side saves are pushed into AriaNG.
* Config cloud sync uses `browser.storage.sync` (Firefox Sync): it requires a
  signed-in Firefox Account with sync enabled; without one the data only stays local.
* When an export to aria2 fails, the file is re-downloaded through the browser so that
  nothing is lost (the Chrome original only does this for localhost RPC servers).
* Embedded AriaNG patch: `ui/ariang/js/extension-patch.js` is loaded after the last
  AriaNG bundle and widens AngularJS' `aHrefSanitizationWhitelist` with
  `moz-extension:` / `chrome-extension:`. AngularJS only allows http/https/ftp/... by
  default, so every `ng-href` hash route ("新建" in the toolbar, the per-task detail
  arrow in the list) was rewritten to `unsafe:moz-extension://...` and Firefox refused
  to open it. The patch also hides the RPC switcher when only one server is configured.
  **Re-check this patch after upgrading the AriaNG bundle** - if the bundle stops being
  the last `<script>`, the routes silently break again.

Install (for development / sideload)
-----------------------------------

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click "Load Temporary Add-on..." and select `manifest.json` from this repository.
   (Temporary add-ons are removed when Firefox restarts.)
3. Open the extension options and configure your aria2 RPC server, e.g.
   `ws://192.168.50.100:6800/jsonrpc` with your secret key.

Install the packaged XPI (permanent, unsigned)
----------------------------------------------

A pre-built unsigned XPI lives in `build/ariang-1.6.0.xpi`. An XPI is a plain zip
whose root contains `manifest.json`.

* Firefox Developer Edition / Nightly accept unsigned add-ons by default.
* On Release/Beta, either set `xpinstall.signatures.required` to `false` in
  `about:config` first, or install a signed build (see below).
* Install by dragging the `.xpi` onto a Firefox window, or via
  `File` -> `Open File...`, and confirm the prompt. Unlike the temporary load
  above, this install survives restarts.

For a publicly distributed build, submit the package to AMO for signing:

```sh
npx web-ext sign --api-key=$AMO_JWT_ISSUER --api-secret=$AMO_JWT_SECRET
```

Build the unsigned XPI locally with:

```sh
python tools/build_xpi.py     # writes build/ariang-1.6.0.xpi
```

or with web-ext:

```sh
npx web-ext build
```

Lint with:

```sh
npx web-ext lint
```

Or the linter AMO itself runs, against the built package:

```sh
npx addons-linter build/ariang-<version>.xpi
```

addons.mozilla.org report (v1.5.0): **0 errors, 24 warnings, 0 notices**. Every
warning comes from the vendored AriaNg frontend libraries (jQuery, AngularJS,
Bootstrap, ECharts, SweetAlert) - none from this add-on's own code. Nothing in
that list blocks signing; `acknowledgment.txt` (shipped inside the XPI) maps each
warning to the library that produces it and explains why it is not exploitable
here, so it can be quoted in the submission notes.

Two linter findings were fixed in v1.5.0 and should not be reintroduced:

* `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` -
  `data_collection_permissions` needs Firefox for Android 142, so the manifest now
  carries an explicit `browser_specific_settings.gecko_android.strict_min_version`.
  Desktop stays at 141.
* `FLAGGED_FILE_TYPE` on `tools/build_xpi.py` - the packaging script is
  development-only and is excluded from the XPI (`SKIP_DIRS` in
  `tools/build_xpi.py`). Anything else development-only (`tools/`, `.gitignore`,
  `.gitattributes`) is excluded too.

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
tools/build_xpi.py     stdlib-only script that packages build/ariang-<version>.xpi
images/                toolbar / action icons (product blue arrow + blue/green/gray variants)
_locales/              zh_CN (default) and en messages
```

Credits
-------

* [AriaNg](https://github.com/mayswind/AriaNg) - MIT License - the embedded web frontend.
* [Aria2-Explorer](https://github.com/alexhua/Aria2-Explorer) - the reference Chrome
  implementation whose feature set this addon mirrors.
* [aria2](https://github.com/aria2/aria2) - the download utility.
