AriaNG - Firefox 扩展
=====================

[English](README.md) | 简体中文

让 Aria2 无缝接管下载，内置 AriaNG 前端。

**[从 addons.mozilla.org 安装](https://addons.mozilla.org/addon/aria2ng/)** —— 一键安装、Mozilla 签名、自动更新。需要你自己有一个开启了 RPC 的 aria2（扩展本身不含服务端）。

基于 [AriaNg](https://github.com/mayswind/AriaNg) 1.3.15（AllInOne 构建）实现的 Firefox WebExtensions 扩展。它把浏览器的下载和磁力链接接管到你的 aria2 RPC 服务器，在工具栏图标上显示 aria2 状态，并内置完整的 AriaNG 前端界面。

初版功能对标 Chrome 上的
[Aria2-Explorer](https://github.com/alexhua/Aria2-Explorer)，用 Firefox WebExtensions API 重写。

作者：Mr.cool
主页：https://github.com/Mrcoolfuyu/
许可：MIT
当前版本：1.6.0

安装
----

### 从 addons.mozilla.org 安装（推荐）

1. 用 Firefox（桌面版 141 及以上）打开 <https://addons.mozilla.org/addon/aria2ng/>。
2. 点击 **添加到 Firefox**，在权限提示中确认。
3. 打开扩展选项，填入你的 aria2 RPC 地址，例如
   `ws://192.168.50.100:6800/jsonrpc`，再填 secret。

AMO 上的版本由 Mozilla 签名，重启不丢失，并会自动更新。

### 安装前须知：你需要 aria2

本扩展只是前端。在它能连上一个开启了 JSON-RPC 的 aria2 之前，它什么都下载不了——那个 aria2 可以在本机、在 NAS，也可以在远程 seedbox 上：

```sh
aria2c --enable-rpc --rpc-listen-all --rpc-secret=your-secret
```

超过设定体积阈值的文件、以及磁力/BT 链接会交给这个 aria2；更小的文件仍然走 Firefox 自己下载。

### 手动安装（开发 / 侧载）

临时加载，Firefox 重启后失效：

1. 打开 `about:debugging#/runtime/this-firefox`。
2. 点击 **临时载入附加组件**，选择本仓库的 `manifest.json`。

未签名 XPI，永久安装（XPI 就是一个根目录含 `manifest.json` 的 zip；构建产物在 `build/ariang-1.6.0.xpi`）：

* Firefox Developer Edition / Nightly 默认允许安装未签名扩展。
* Release / Beta 上需要先在 `about:config` 里把 `xpinstall.signatures.required` 设为 `false`，或者直接装 AMO 的签名版。
* 把 `.xpi` 拖到 Firefox 窗口，或用 `文件` → `打开文件...`，然后确认提示。

对外分发需要签名：

```sh
npx web-ext sign --api-key=$AMO_JWT_ISSUER --api-secret=$AMO_JWT_SECRET
```

功能
----

* 工具栏图标
  * 左键：打开内置的 AriaNG 界面（弹窗 / 新标签页，可配置）。
  * 右键：菜单
    * 下载拦截（开关自动接管）
    * 监测Aria2状态（开关状态监测）
    * 打开AriaNG
    * 网站过滤 → 当前网站→白名单 / 当前网站→黑名单
    * 默认Aria2（已配置 RPC 服务器的单选列表）
* 下载拦截
  * 文件体积超过阈值（MB/GB，可配置）时自动交给 aria2。
  * 网站与扩展名黑白名单（白名单优先，支持正则）。
  * 按住 Alt 点击链接可跳过拦截（可选）。
  * 自动下载前询问参数（打开已预填的 AriaNG 新建任务页）。
  * 通过 content script 拦截磁力链接点击。
  * 右键链接/选中文字可发送到指定 aria2 服务器；右键页面可一次性导出全部可下载链接。
  * 接受其他扩展发来的下载请求（runtime.onMessageExternal）。
* Aria2 状态监测
  * 工具栏图标角标显示活动（或等待）任务数。
  * 图标提示显示汇总上传/下载速度与任务数。
  * 任务事件（开始 / 完成 / 出错）桌面通知，可静音。
  * 支持多台 RPC 服务器，可配 URL 匹配规则与默认服务器。
* AriaNG 界面
  * 完整内置 AriaNG 1.3.15 前端，开在弹窗或新标签页里。
  * 扩展设置与 AriaNG 自身的 RPC 配置双向同步。
* 窗口行为（弹窗模式）
  * 窗口已打开时再次点击工具栏图标，只把焦点切到该窗口，不再重复开新窗口；深链接（拦截到的新任务、任务详情）会转交给它显示。
  * 最小尺寸 920×600，保证 AriaNG 左侧菜单始终可见（低于 768 CSS px 时它会整块隐藏）。
  * 记住窗口的尺寸、位置和最大化状态，下次打开沿用。
  * 自带最大化 / 还原按钮——Firefox 不提供弹窗标题栏的最大化。

* 图标
  * 产品图标：蓝色下载箭头（`images/ariang-blue.svg`，光栅化为 16/32/48/64/128 PNG）。
  * 拦截关闭时，工具栏图标使用「拦截关闭状态图标」中选定的颜色（灰 / 绿 / 蓝）。
* 选项页
  * 以上全部，另加：拦截关闭时的图标颜色、配置云同步（browser sync storage）、配置导入导出（JSON 文件）、浅色/深色/跟随系统。

Firefox 与 Chrome 原版的差异
---------------------------

* 右键菜单使用 `browser_action` 上下文（Chrome 用 `action`）。
* 下载拦截用 `downloads.onCreated` + `downloads.cancel`，而非 Chrome 的
  `downloads.onDeterminingFilename` + `suggest()`。Firefox 无法把下载重定向到别处，所以判定成立后会取消浏览器下载；创建时若文件体积未知，扩展会短暂等待体积出现，并以一次 HEAD 请求兜底。
* `chrome.power`（保持系统唤醒）在 Firefox 没有对应 API，已移除。
* 图标动画改为静态图标 + 角标文字。
* 「弹窗」打开方式用 `windows.create({type:'popup'})` 开一个真正的弹出窗口，而不是锚定的 `browserAction` popup，因此窗口可以像普通窗口一样移动、缩放。
* 弹窗尺寸（`js/config.js` 里的 `A2E.UiWindow`）：下限 920×600 —— AriaNG 自带的样式在 768 CSS px 以下会把整个左侧菜单移出画面，窗口再窄就会静默丢掉导航树。没有最小尺寸 API，所以由弹窗页在窗口被拖小时把它拉回去。
* 窗口在多次启动之间记住尺寸、位置和最大化状态（`browser.storage.local` 的 `uiWindowBounds`）。Firefox **没有** `windows.onBoundsChanged`（Chromium 专有事件），因此由弹窗页在 resize 时、以及每次轮询时通过 `runtime.sendMessage`（`UI_WINDOW_BOUNDS`）上报几何信息——拖动窗口只有轮询才能捕捉到。
* Firefox 会把 popup 窗口标题栏的最大化按钮画成禁用态；但 `windows.update({state:'maximized'})` 是有效的，所以 `popup/popup.html` 自带一个右上角的最大化 / 还原按钮。
* RPC 配置存在两处——扩展 storage（选项页）和 AriaNG 自己的 `AriaNg.Options` localStorage。每次打开都会对账：在 AriaNG 界面里做的修改会被采纳回扩展配置，而不是被默认值覆盖；扩展侧保存的配置会推送到 AriaNG。
* 配置云同步用 `browser.storage.sync`（Firefox 同步）：需要登录 Firefox 账户并开启同步，否则数据只留在本地。
* 导出到 aria2 失败时，会用浏览器重新下载该文件，保证不丢文件（Chrome 原版只对 localhost 的 RPC 这么做）。
* 内置 AriaNG 补丁：`ui/ariang/js/extension-patch.js` 在最后一个 AriaNG bundle 之后加载，把 AngularJS 的 `aHrefSanitizationWhitelist` 扩上 `moz-extension:` / `chrome-extension:`。AngularJS 默认只认 http/https/ftp/…，导致所有 `ng-href` 哈希路由（工具栏的「新建」、任务列表里的详情箭头）被改写成 `unsafe:moz-extension://...`，Firefox 拒绝打开。该补丁在只有一个 RPC 服务器时还会隐藏 RPC 切换箭头。
  **升级 AriaNG 包后必须重新检查这个补丁** —— 一旦 bundle 不再是最后一个 `<script>`，这些路由会再次静默失效。

RPC 配置
--------

在选项页可以配置多台 aria2 服务器。每一项包含：

* name —— 显示名称
* secret key —— aria2 RPC 密钥（以 URL 编码形式存进 RPC 地址）
* RPC 地址 —— 例如 `ws://host:6800/jsonrpc` 或 `http://host:6800/jsonrpc`
* 下载目录 —— 通过该服务器创建任务时的默认 `dir`
* URL 匹配规则 —— 逗号分隔；任务 URL 命中某条规则就路由到那台服务器。`*` 表示默认服务器。

AriaNG 自身的设置（语言、主题等）存在扩展源下的 localStorage（键 `AriaNg.Options`），在配置同步过程中会被保留。

开发
----

```
manifest.json          MV2 manifest（Firefox）
js/config.js           默认配置
js/utils.js            公共工具（i18n、RPC 地址处理等）
js/aria2.js            精简版 aria2 JSON-RPC 客户端（WebSocket + HTTP 兜底）
js/background.js       后台页：菜单、拦截、监测、通知
js/content/            content script（磁力拦截、导出全部链接）
popup/                 承载 AriaNG 界面的弹窗页
options/               选项页（原生 JS/CSS）
ui/ariang/             AriaNg 1.3.15 AllInOne 构建（内联脚本已拆到 js/）
tools/build_xpi.py     仅用标准库的打包脚本，产出 build/ariang-<version>.xpi
images/                工具栏 / 动作图标（产品蓝箭头 + 蓝/绿/灰变体）
_locales/              zh_CN（默认）与 en 文案
```

本地构建未签名 XPI：

```sh
python tools/build_xpi.py     # 产出 build/ariang-<version>.xpi
```

或用 web-ext：

```sh
npx web-ext build
```

代码检查：

```sh
npx web-ext lint
```

或者用 AMO 自己跑的那个 linter，直接检查构建产物：

```sh
npx addons-linter build/ariang-<version>.xpi
```

addons.mozilla.org 报告（v1.5.0）：**0 错误、24 警告、0 提醒**。所有警告都来自内置的 AriaNG 前端库（jQuery、AngularJS、Bootstrap、ECharts、SweetAlert），没有一条来自本扩展自己的代码。这些警告都不影响签名；`acknowledgment.txt`（随 XPI 一起打包）把每条警告对应到产生它的库，并说明为什么在这里不可利用，可以直接引用到提审说明里。

v1.5.0 修掉了两条 linter 提示，不要再引入：

* `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` ——
  `data_collection_permissions` 需要 Android 142，因此 manifest 显式写了
  `browser_specific_settings.gecko_android.strict_min_version`。桌面端保持 141。
* `FLAGGED_FILE_TYPE`（`tools/build_xpi.py`）—— 打包脚本仅供开发使用，已排除出 XPI
  （`tools/build_xpi.py` 里的 `SKIP_DIRS`）。其他开发用文件（`tools/`、`.gitignore`、
  `.gitattributes`）同样排除。

致谢
----

* [AriaNg](https://github.com/mayswind/AriaNg) —— MIT 许可 —— 内置的 Web 前端。
* [Aria2-Explorer](https://github.com/alexhua/Aria2-Explorer) —— 本扩展对标的 Chrome 参考实现。
* [aria2](https://github.com/aria2/aria2) —— 下载工具本体。
