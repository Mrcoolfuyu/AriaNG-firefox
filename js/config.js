/*
 * AriaNG Firefox Extension - default configuration
 * Firefox WebExtensions (Manifest V2) port of Aria2-Explorer functionality.
 */
window.A2E = window.A2E || {};

A2E.DefaultConfigs = {
  /* context menu (page/link/selection) */
  contextMenus: true,        // right-click "Export to AriaNG"
  askBeforeExport: false,    // ask detailed parameters before export
  exportAll: true,           // right-click "Export all links"
  /* download capture */
  integration: true,         // auto-capture downloads to Aria2
  fileSize: "100",           // capture threshold value
  fileSizeUnit: "MB",        // capture threshold unit: MB | GB
  checkClick: false,         // hold Alt to skip capture
  askBeforeDownload: false,  // ask parameters before auto-download
  allowExternalRequest: false, // accept requests from other extensions
  captureMagnet: false,      // capture magnet links (content script)
  /* monitor */
  monitorAria2: false,       // monitor Aria2 status
  monitorAll: false,         // monitor all configured Aria2 servers
  badgeText: true,           // show task count on icon
  allowNotification: true,   // task status notifications
  keepSilent: false,         // keep notifications silent
  /* aria2 rpc servers */
  rpcList: [
    { name: "Aria2", url: "http://localhost:6800/jsonrpc", location: "", pattern: "" }
  ],
  /* ariaNG web ui */
  webUIOpenStyle: "popup",   // popup | tab
  iconOffStyle: "Gray",      // Gray | Green | Blue (icon shown when capture is off)
  /* filters */
  allowedSites: [],
  blockedSites: [],
  allowedExts: [],
  blockedExts: [],
  /* options page */
  colorModeId: 2             // 0 light, 1 dark, 2 follow system
};

/* Icon shown while download capture is turned off - keep in sync with the
 * radio group in options/options.html */
A2E.IconOffStyles = ["Gray", "Green", "Blue"];

/*
 * Map any stored value (including the styles shipped before v1.3.0:
 * Default / Dark / Dusk / Grey) to one of IconOffStyles. Old values cannot be
 * mapped 1:1 because their artwork was replaced by the current download-arrow
 * icon set, so they degrade to the closest colour.
 */
A2E.normalizeIconOffStyle = function (value) {
  const legacy = { default: "Blue", dark: "Blue", dusk: "Blue", grey: "Gray" };
  const key = String(value === undefined || value === null ? "" : value).toLowerCase();
  if (legacy.hasOwnProperty(key)) return legacy[key];
  for (const style of A2E.IconOffStyles) {
    if (style.toLowerCase() === key) return style;
  }
  return "Gray";
};

/*
 * AriaNG UI popup window.
 *
 * AriaNG's bundled stylesheet hides the whole left menu below 768 CSS px
 * (Bootstrap 3 "xs" breakpoint: `.main-sidebar` is translated off-canvas), so a
 * narrower window silently drops the navigation tree. minWidth keeps 230px of
 * sidebar plus enough room for the task table; the window is clamped to these
 * values both when it is created and while the user drags it smaller.
 */
A2E.UiWindow = {
  minWidth: 920,
  minHeight: 600,
  defaultWidth: 1000,
  defaultHeight: 680,
  storageKey: 'uiWindowBounds'
};

/*
 * Validate a stored {width, height, left, top, maximized} record.
 * Anything unusable falls back to the defaults; a position that is no longer on
 * screen (unplugged monitor, changed resolution) is dropped so the window opens
 * centred instead of off-screen.
 */
A2E.sanitizeUiBounds = function (value, screenSize) {
  const spec = A2E.UiWindow;
  const source = (value && typeof value === 'object') ? value : {};
  const screenWidth = (screenSize && screenSize.width) || 1920;
  const screenHeight = (screenSize && screenSize.height) || 1080;

  function dimension(v, min, fallback) {
    const n = Math.round(Number(v));
    if (!isFinite(n) || n <= 0) return fallback;
    return Math.max(n, min);
  }

  const result = {
    width: dimension(source.width, spec.minWidth, spec.defaultWidth),
    height: dimension(source.height, spec.minHeight, spec.defaultHeight),
    left: null,
    top: null,
    maximized: source.maximized === true
  };

  const left = Math.round(Number(source.left));
  const top = Math.round(Number(source.top));
  /* generous plausibility test - multi-monitor setups legitimately use negative
   * coordinates, but a wild number means the monitor is gone: re-centre instead */
  const fitsOnScreen = isFinite(left) && isFinite(top) &&
    left > -screenWidth * 2 && top > -screenHeight * 2 &&
    left < screenWidth * 2 && top < screenHeight * 2;

  if (fitsOnScreen) {
    result.left = left;
    result.top = top;
  }
  return result;
};

/* AriaNG built-in default options (subset used to seed AriaNg.Options) */
A2E.DefaultAriaNgOptions = {
  language: 'TBD',
  theme: 'system',
  title: '${downspeed}, ${upspeed} - ${title}',
  titleRefreshInterval: 3000,
  browserNotification: false,
  browserNotificationSound: true,
  browserNotificationFrequency: 'unlimited',
  rpcAlias: 'Aria2',
  rpcHost: 'localhost',
  rpcPort: '6800',
  rpcInterface: 'jsonrpc',
  protocol: 'http',
  httpMethod: 'POST',
  rpcRequestHeaders: '',
  saveRpcOptions: true,
  rpcOptions: {},
  secret: '',
  extendRpcServers: [],
  webSocketReconnectInterval: 5000,
  globalStatRefreshInterval: 1000,
  downloadTaskRefreshInterval: 1000,
  keyboardShortcuts: false,
  swipeGesture: true,
  dragAndDropTasks: true,
  rpcListDisplayOrder: 'recentlyUsed',
  afterCreatingNewTask: 'task-list',
  removeOldTaskAfterRetrying: true,
  confirmTaskRemoval: true,
  includePrefixWhenCopyingFromTaskDetails: false,
  showPiecesInfoInTaskDetailPage: 'le10240',
  afterRetryingTask: 'task-list-default',
  pauseAfterRetry: false,
  taskListIndependentDisplayOrder: true,
  displayOrder: 'default:asc',
  downloadingTaskListPageDisplayOrder: 'default:asc',
  waitingTaskListPageDisplayOrder: 'default:asc',
  stoppedTaskListPageDisplayOrder: 'default:asc',
  fileListDisplayOrder: 'default:asc',
  peerListDisplayOrder: 'default:asc'
};

/* localStorage key used by AriaNG to persist its own options */
A2E.ARIA_NG_OPTIONS_KEY = 'AriaNg.Options';
