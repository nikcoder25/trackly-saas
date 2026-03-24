
// Token refresh lock — prevents multiple simultaneous refresh attempts
let _refreshPromise = null;

async function api(method, path, data, extraHeaders){
  // Longer timeout for run endpoints (5 min), default 30s for other calls
  const timeoutMs = path.includes('/run') ? 300000 : 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, ...(extraHeaders || {}) },
    signal: controller.signal,
    credentials: 'include'
  };
  if (data) opts.body = JSON.stringify(data);
  let res;
  try { res = await fetch(API + path, opts); } catch(e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') throw new Error('Request timed out. Please try again.');
    throw new Error('Unable to connect to the server. Please check your connection and try again.');
  }
  clearTimeout(timeoutId);
  // Auto-refresh token on 401 (not for auth endpoints themselves). Don't check in-memory refreshToken — httpOnly cookie handles it on page reload.
  if (res.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/register' && path !== '/api/auth/refresh') {
    try {
      // Use shared promise to prevent concurrent refresh attempts
      if (!_refreshPromise) {
        _refreshPromise = fetch(API + '/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          credentials: 'include'
        }).then(async (refreshRes) => {
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            token = refreshData.token;
            refreshToken = refreshData.refreshToken;
            return true;
          }
          return false;
        }).catch(() => false).finally(() => { _refreshPromise = null; });
      }
      const refreshOk = await _refreshPromise;
      if (refreshOk) {
        // Retry original request with new token
        opts.headers['Authorization'] = 'Bearer ' + token;
        res = await fetch(API + path, opts);
      } else {
        doLogout();
        throw new Error('Session expired. Please log in again.');
      }
    } catch(e) {
      doLogout();
      throw new Error('Session expired. Please log in again.');
    }
  }
  // Validate response is JSON before parsing — HTML responses (e.g. from redirects) cause cryptic errors
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Server returned an unexpected response. Please refresh and try again.');
  }
  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/register') {
      doLogout();
      throw new Error('Session expired. Please log in again.');
    }
    // Auto-show upgrade modal on plan limit errors
    if (json.planLimit) {
      showUpgradeModal(json.error);
    }
    // Rate limit — include retry info in error message
    if (res.status === 429 && json.retryAfter) {
      throw new Error(`Rate limited — please wait ${json.retryAfter} seconds before retrying.`);
    }
    throw new Error(json.error || 'Request failed');
  }
  return json;
}
