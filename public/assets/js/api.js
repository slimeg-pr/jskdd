/* Monéta — browser side of the API.
   Holds the CSRF token in memory only. The session itself lives in an
   HttpOnly cookie the page can never read, and no credential, balance or
   holding is ever written to localStorage. */

(function (global) {
  'use strict';
  var M = global.Moneta = global.Moneta || {};

  var csrf = null;

  function ApiError(status, message, extra) {
    var e = new Error(message || 'Request failed.');
    e.name = 'ApiError';
    e.status = status;
    Object.assign(e, extra || {});
    return e;
  }

  async function request(method, path, body, opts) {
    opts = opts || {};
    var headers = { 'Accept': 'application/json' };
    var init = {
      method: method,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      headers: headers
    };

    if (method !== 'GET' && method !== 'HEAD') {
      if (csrf) headers['X-CSRF-Token'] = csrf;
      if (opts.raw) {
        init.body = opts.raw;
        if (opts.contentType) headers['Content-Type'] = opts.contentType;
      } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
    }

    var res;
    try {
      res = await fetch(path, init);
    } catch (err) {
      throw ApiError(0, 'Cannot reach the server. Check your connection.');
    }

    var data = null;
    var type = res.headers.get('content-type') || '';
    if (type.indexOf('application/json') >= 0) {
      try { data = await res.json(); } catch (e) { data = null; }
    }

    if (!res.ok) {
      var msg = (data && data.error) || ('Request failed (' + res.status + ').');
      throw ApiError(res.status, msg, data || {});
    }
    return data;
  }

  var api = {
    get csrf() { return csrf; },
    setCsrf: function (t) { csrf = t || null; },

    session: function () { return request('GET', '/api/session'); },
    state: function () { return request('GET', '/api/state'); },

    signup: function (email, handle, password) {
      return request('POST', '/api/auth/signup', { email: email, handle: handle, password: password })
        .then(function (r) { csrf = r.csrf; return r; });
    },
    login: function (email, password) {
      return request('POST', '/api/auth/login', { email: email, password: password })
        .then(function (r) { csrf = r.csrf; return r; });
    },
    logout: function () {
      return request('POST', '/api/auth/logout', {}).then(function (r) { csrf = null; return r; });
    },

    patchProfile: function (patch) { return request('PATCH', '/api/profile', patch); },
    toggleWatch: function (symbol) { return request('POST', '/api/watchlist', { symbol: symbol }); },
    trade: function (symbol, side, usd) {
      return request('POST', '/api/trade', { symbol: symbol, side: side, usd: usd });
    },
    uploadAvatar: function (file) {
      return request('POST', '/api/avatar', null, { raw: file, contentType: file.type || 'application/octet-stream' });
    },
    removeAvatar: function () { return request('DELETE', '/api/avatar'); }
  };

  M.api = api;
})(window);
