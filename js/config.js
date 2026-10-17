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
