/*
 * AriaNG inside the Firefox extension - URL sanitisation patch.
 *
 * AngularJS' $compileProvider.aHrefSanitizationWhitelist() only allows
 * http/https/ftp/mailto/tel/file/sms. Every ng-href pointing at a hash route is
 * absolutised against the document URL before the whitelist is applied, so in a
 * moz-extension:// page those links become "unsafe:moz-extension://...". The
 * browser refuses to open them, which makes links such as the task-list "New"
 * button and the per-task detail arrow look dead (and Firefox shows
 * "无法理解该网址 / This address wasn't understood" when it does try).
 *
 * Allow the extension schemes so ng-href keeps working. This file must load
 * AFTER the AriaNG bundles (the ariaNg module has to exist) and before the
 * AngularJS bootstrap, i.e. a plain <script> tag at the end of index.html.
 */
(function () {
  'use strict';
  if (typeof angular === 'undefined') {
    return;
  }
  angular.module('ariaNg').config(['$compileProvider', function ($compileProvider) {
    $compileProvider.aHrefSanitizationWhitelist(
      /^\s*(https?|ftp|mailto|tel|file|sms|moz-extension|chrome-extension):/
    );
  }]);

  /*
   * The RPC switcher in the top-left corner is a dead affordance when only one
   * RPC server is configured: AriaNG's switchRpcSetting() ignores a click on
   * the server that is already the default, so selecting it changes nothing.
   * Hide the caret in that case and stop the menu from opening (the tooltip
   * explains why); as soon as a second server exists the list switches the
   * connection again.
   *
   * Markup (AriaNG index.html):
   *   div.logo-lg > div.dropdown > span.dropdown-toggle > span.logo-lg-title
   *                                                + i.fa.fa-caret-right
   * The caret therefore sits inside .dropdown-toggle, not inside .logo-lg-title.
   */
  angular.module('ariaNg').run(['$rootScope', '$timeout', function ($rootScope, $timeout) {
    function syncRpcSwitcherHint() {
      try {
        const items = document.querySelectorAll('.rpcselect-dropdown li');
        const caret = document.querySelector('.main-header .logo i.fa-caret-right');
        if (!caret) return;
        const toggle = caret.closest('.dropdown-toggle') || caret.parentElement;
        if (!toggle) return;
        if (items.length < 2) {
          caret.style.display = 'none';
          /* Bootstrap's dropdown data-api is a delegated selector, so dropping
           * the attribute really disables the menu - there is nothing to pick. */
          toggle.removeAttribute('data-toggle');
          toggle.title = '只有一个 RPC 服务器；如需切换，请在扩展选项里添加更多服务器';
        } else {
          caret.style.display = '';
          toggle.setAttribute('data-toggle', 'dropdown');
          toggle.removeAttribute('title');
        }
      } catch (e) { /* keep AriaNG working no matter what */ }
    }
    $timeout(syncRpcSwitcherHint, 800);
    $rootScope.$on('$routeChangeSuccess', function () {
      $timeout(syncRpcSwitcherHint, 300);
    });
  }]);
})();
