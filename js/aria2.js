/*
 * AriaNG Firefox Extension - minimal aria2 JSON-RPC client
 * WebSocket first, HTTP POST fallback. Works from a persistent background page.
 */
window.A2E = window.A2E || {};

A2E.Aria2Client = (function () {
  'use strict';

  const SOCKET_TIMEOUT = 8 * 1000;
  const DEFAULT_ARIA2 = { name: 'Aria2', rpcUrl: 'http://localhost:6800/jsonrpc', secretKey: '' };

  class Aria2 {
    static RequestId = 0;

    #isLocalhost;
    #messageHandlers;
    #pendingRequests;
    #socket;
    #online;
    #supportsWebSocket;

    constructor(aria2 = DEFAULT_ARIA2) {
      Object.assign(this, aria2);
      this.#isLocalhost = A2E.Utils.isLocalhost(this.rpcUrl);
      this.#messageHandlers = new Set();
      this.#pendingRequests = new Map();
      this.#socket = null;
      this.#online = false;
      this.#supportsWebSocket = true;
    }

    get sid() {
      return Aria2.RequestId++;
    }

    get isLocalhost() {
      return this.#isLocalhost;
    }

    setRemote(name = 'Aria2', rpcUrl, secretKey = '') {
      if (rpcUrl === this.rpcUrl && secretKey === this.secretKey) return this;
      if (A2E.Utils.validateRpcUrl(rpcUrl) === 'INVALID') {
        throw new Error('Invalid RPC URL for ' + name + ': ' + rpcUrl);
      }
      this.closeSocket();
      this.#isLocalhost = A2E.Utils.isLocalhost(rpcUrl);
      Object.assign(this, { name: name, rpcUrl: rpcUrl, secretKey: secretKey });
      return this;
    }

    openSocket() {
      if (!this.#supportsWebSocket) return;

      let url = this.rpcUrl;
      url = url.replace(/^http/, 'ws');
      if (this.#socket && this.#socket.url === url && this.#socket.readyState <= WebSocket.OPEN) {
        return this.#socket;
      }

      try {
        this.#socket = new WebSocket(url);

        this.#socket.addEventListener('open', (event) => {
          this.#online = true;
        });

        this.#socket.addEventListener('message', this.#onMessage.bind(this));

        this.#socket.addEventListener('error', (event) => {
          this.#pendingRequests.forEach(({ reject }) => {
            reject(new Error('WebSocket encountered an error'));
          });
          this.#pendingRequests.clear();
          if (this.#online) {
            this.#supportsWebSocket = false;
            console.warn('Failed to connect to ' + this.name + ' via WebSocket. Task notification will not be received.');
          }
        });

        this.#socket.addEventListener('close', (event) => {
          this.#pendingRequests.forEach(({ reject }) => {
            reject(new Error('WebSocket closed'));
          });
          this.#pendingRequests.clear();
          this.#socket = null;
        });
      } catch (error) {
        console.error(error.message);
      }
      return this.#socket;
    }

    closeSocket() {
      if (this.#socket) {
        this.#socket.close();
        this.#socket = null;
      }
      this.#supportsWebSocket = true;
    }

    #onMessage(event) {
      let message = null;
      try {
        message = JSON.parse(event.data);
        message.source = this;
      } catch (error) {
        console.error(this.name + ' received invalid message: ' + event.data, error);
        return;
      }

      if (message.id !== undefined && this.#pendingRequests.has(message.id)) {
        const { resolve } = this.#pendingRequests.get(message.id);
        resolve(message);
        this.#pendingRequests.delete(message.id);
      }

      for (const handler of this.#messageHandlers) {
        try {
          handler(message);
        } catch (error) {
          console.error(this.name + ' message handler error:', error);
        }
      }
    }

    regMessageHandler(messageHandler) {
      if (typeof messageHandler !== 'function') {
        throw new Error('Invalid aria2 message handler');
      }
      this.#messageHandlers.add(messageHandler);
    }

    unRegMessageHandler(messageHandler) {
      if (typeof messageHandler !== 'function') {
        throw new Error('Invalid aria2 message handler');
      }
      this.#messageHandlers.delete(messageHandler);
    }

    async #doRPC(request) {
      if (this.#socket && this.#socket.readyState === WebSocket.OPEN) {
        return new Promise((resolve, reject) => {
          this.#pendingRequests.set(request.id, { resolve: resolve, reject: reject });
          try {
            this.#socket.send(request.payload);
          } catch (error) {
            this.#pendingRequests.delete(request.id);
            return reject(error);
          }
          setTimeout(() => {
            if (this.#pendingRequests.has(request.id)) {
              this.#pendingRequests.delete(request.id);
              reject(new Error('RPC request timeout'));
            }
          }, SOCKET_TIMEOUT);
        });
      } else {
        let url = request.url;
        url = url.replace(/^ws/, 'http');

        const controller = new AbortController();
        const { signal } = controller;
        const timeoutId = setTimeout(() => controller.abort(), SOCKET_TIMEOUT);

        try {
          const response = await fetch(url, {
            method: 'POST',
            body: request.payload,
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            signal: signal
          });
          this.#online = true;
          clearTimeout(timeoutId);
          return await response.json();
        } catch (error) {
          clearTimeout(timeoutId);
          if (error.name === 'AbortError') {
            console.error('Aborted request to ' + this.name + ': net::ERR_CONNECTION_TIMED_OUT');
          }
          this.#online = false;
          this.#supportsWebSocket = true;
          return Promise.reject(error);
        }
      }
    }

    #buildRequest(method, ...params) {
      if (!method || typeof method !== 'string') {
        throw new Error('Invalid RPC method: method must be a non-empty string');
      }
      if (!method.startsWith('aria2.')) {
        throw new Error('Invalid RPC method: ' + method + '. Method should start with "aria2."');
      }

      const id = this.sid;
      const request = { id: id, url: this.rpcUrl, payload: '' };

      if (this.secretKey) {
        params.unshift('token:' + this.secretKey);
      }

      request.payload = JSON.stringify({
        jsonrpc: '2.0',
        method: method,
        id: id,
        params: params
      });

      return request;
    }

    addUri(uris, options) {
      if (!Array.isArray(uris)) uris = [uris];
      const request = this.#buildRequest('aria2.addUri', uris, options);
      return this.#doRPC(request);
    }

    addTorrent(torrent, options) {
      const request = this.#buildRequest('aria2.addTorrent', torrent, options);
      return this.#doRPC(request);
    }

    getGlobalStat() {
      const request = this.#buildRequest('aria2.getGlobalStat');
      return this.#doRPC(request);
    }

    getFiles(gid) {
      const request = this.#buildRequest('aria2.getFiles', gid);
      return this.#doRPC(request);
    }

    tellStatus(gid, keys) {
      const request = (Array.isArray(keys) && keys.length > 0)
        ? this.#buildRequest('aria2.tellStatus', gid, keys)
        : this.#buildRequest('aria2.tellStatus', gid);
      return this.#doRPC(request);
    }

    setGlobalOptions(options) {
      const request = this.#buildRequest('aria2.changeGlobalOption', options);
      return this.#doRPC(request);
    }

    remove(gid) {
      const request = this.#buildRequest('aria2.remove', gid);
      return this.#doRPC(request);
    }

    forceRemove(gid) {
      const request = this.#buildRequest('aria2.forceRemove', gid);
      return this.#doRPC(request);
    }

    removeDownloadResult(gid) {
      const request = this.#buildRequest('aria2.removeDownloadResult', gid);
      return this.#doRPC(request);
    }
  }

  return Aria2;
})();
