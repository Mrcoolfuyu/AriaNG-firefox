/*
 * AriaNG Firefox Extension - content script
 * Collects all downloadable links of the page and sends them to the
 * background script when requested (context menu "Export all links").
 */
(function () {
  'use strict';

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'EXPORT_ALL') {
      exportAllLinks();
    }
  });

  function exportAllLinks() {
    const links = [];
    const elements = document.querySelectorAll('a,img,audio,video,source,enclosure');
    for (const element of elements) {
      let link = '';
      const tagName = element.tagName.toUpperCase();
      let srcProp = '';
      try {
        switch (tagName) {
          case 'A':
            srcProp = 'href';
            break;
          case 'ENCLOSURE':
            srcProp = 'url';
            break;
          default:
            srcProp = 'src';
        }
        if (element[srcProp]) {
          link = element[srcProp];
        } else if (element.attributes[srcProp]) {
          link = element.attributes[srcProp].value;
        } else {
          continue;
        }

        const url = new URL(link);
        const filename = url.pathname.split('/').pop();
        const ext = filename.includes('.') ? filename.split('.').pop() : '';
        let valid = false;
        if (url.protocol === 'magnet:' || (/VIDEO|AUDIO|SOURCE/.test(tagName) && url.protocol.startsWith('http'))) {
          valid = true;
        } else if (/^http|ftp|sftp/.test(url.protocol)) {
          if (tagName === 'IMG') {
            if (element.width >= 400 && element.height >= 300) {
              valid = true;
            }
          } else if (ext) {
            if (/^[\da-z]{1,8}$/i.test(ext) && !/^(htm|asp|php|cgi|xml|js|css|do|\d+$)/i.test(ext)) {
              valid = true;
            }
          }
        }
        if (valid && !links.includes(link)) {
          links.push(link);
        }
      } catch (e) {
        console.warn('DownloadAllLinks: Invalid URL found, URL=', link);
      }
    }
    if (links.length > 0) {
      const downloadItem = {
        filename: '',
        url: links.join('\n'),
        referrer: window.location.href,
        multiTask: true
      };
      browser.runtime.sendMessage({ type: 'DOWNLOAD', data: downloadItem });
    } else {
      setTimeout(() => {
        if (document.hasFocus()) {
          alert('\nAriaNG: ' + browser.i18n.getMessage('exportAllFailedDes'));
        }
      }, 300);
    }
  }
})();
