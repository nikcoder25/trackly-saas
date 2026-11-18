/** Tiny cookie-jar API client for the e2e story suite. */
const BASE = process.env.BASE || 'http://localhost:3000';
let ipSeq = 1;
class Client {
  constructor() { this.jar = {}; this.ip = `10.9.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`; }
  cookieHeader() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '); }
  csrf() { return this.jar['__Host-livesov_csrf'] || this.jar['livesov_csrf'] || ''; }
  absorb(res) {
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of sc) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i).trim(); const v = pair.slice(i + 1).trim();
      const expired = attrs.some(a => /max-age=0/i.test(a) || /expires=thu, 01 jan 1970/i.test(a));
      if (expired || v === '') delete this.jar[k]; else this.jar[k] = v;
    }
  }
  async req(method, path, body, opts = {}) {
    const headers = { 'x-real-ip': opts.ip || this.ip, ...(opts.headers || {}) };
    if (method !== 'GET' && method !== 'HEAD' && !opts.noOrigin) headers.origin = opts.origin || BASE;
    if (Object.keys(this.jar).length) headers.cookie = this.cookieHeader();
    if (method !== 'GET' && this.csrf() && !opts.noCsrf) headers['x-csrf-token'] = this.csrf();
    let payload;
    if (body !== undefined) {
      if (typeof body === 'string') { payload = body; headers['content-type'] = opts.contentType || 'application/json'; }
      else { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
    }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: opts.redirect || 'manual', signal: AbortSignal.timeout(opts.timeout || 45000) });
    this.absorb(res);
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  get(p, o) { return this.req('GET', p, undefined, o); }
  post(p, b, o) { return this.req('POST', p, b === undefined ? {} : b, o); }
  put(p, b, o) { return this.req('PUT', p, b, o); }
  patch(p, b, o) { return this.req('PATCH', p, b, o); }
  del(p, b, o) { return this.req('DELETE', p, b, o); }
  async login(email, password = 'Passw0rd!Passw0rd') {
    const r = await this.post('/api/auth/login', { email, password });
    if (r.status !== 200) throw new Error(`login ${email} -> ${r.status} ${r.text.slice(0, 200)}`);
    this.user = r.json.user;
    return r;
  }
}
module.exports = { Client, BASE };
