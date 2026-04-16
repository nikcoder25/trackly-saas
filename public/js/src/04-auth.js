
// ─── PASSWORD VISIBILITY TOGGLE ──────────────────────────────────
function togglePasswordVisibility(inputId, btn) {
  const input = el(inputId);
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  const open = btn.querySelector('.pw-eye-open');
  const closed = btn.querySelector('.pw-eye-closed');
  if (open) open.style.display = isPassword ? 'none' : 'block';
  if (closed) closed.style.display = isPassword ? 'block' : 'none';
}

// ─── GOOGLE SIGN-IN ──────────────────────────────────────────────
let googleClientId = null;

async function initGoogleSignIn() {
  try {
    // Use already-fetched config if available
    if (window.__GOOGLE_CLIENT_ID) {
      googleClientId = window.__GOOGLE_CLIENT_ID;
    } else {
      const config = await fetch('/api/config').then(r => r.json());
      if (!config.googleClientId) return;
      googleClientId = config.googleClientId;
    }

    // Load Google Identity Services script lazily (uses shared promise)
    loadGoogleScript().catch(() => {});
  } catch(e) {
    // Google Sign-In not available - silently skip
  }
}

async function triggerGoogleSignIn() {
  const clientId = googleClientId || window.__GOOGLE_CLIENT_ID;
  if (!clientId) {
    el('auth-err').textContent = 'Google Sign-In is not configured. Please use email and password to sign in.';
    el('auth-err').style.display = 'block';
    return;
  }

  // Wait for Google script to load if not ready yet
  if (!window.google || !google.accounts) {
    // Show loading state on the Google button
    const googleBtns = document.querySelectorAll('.google-signin-btn');
    googleBtns.forEach(b => { b.disabled = true; b._origText = b.textContent; b.textContent = 'Loading Google Sign-In...'; });
    el('auth-err').style.display = 'none';
    try {
      await loadGoogleScript();
      // Small delay to let Google initialize after script loads
      await new Promise(r => setTimeout(r, 100));
    } catch(e) {
      el('auth-err').textContent = 'Failed to load Google Sign-In. Please check your connection and try again.';
      el('auth-err').style.display = 'block';
      googleBtns.forEach(b => { b.disabled = false; b.textContent = b._origText || 'Continue with Google'; });
      return;
    } finally {
      googleBtns.forEach(b => { b.disabled = false; b.textContent = b._origText || 'Continue with Google'; });
    }
  }

  el('auth-err').style.display = 'none';

  // Use OAuth2 token flow - opens a proper Google account chooser popup
  const tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'openid email profile',
    callback: async (tokenResponse) => {
      if (tokenResponse.error) {
        el('auth-err').textContent = 'Google sign-in was cancelled or failed.';
        el('auth-err').style.display = 'block';
        return;
      }
      // Exchange access token for user info, then authenticate with backend
      try {
        const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { 'Authorization': 'Bearer ' + tokenResponse.access_token }
        }).then(r => r.json());

        const data = await api('POST', '/api/auth/google', {
          access_token: tokenResponse.access_token,
          google_user: userInfo
        });
        token = data.token;
        refreshToken = data.refreshToken || '';
        currentUser = data.user;
        localStorage.setItem('livesov_session', '1');
        await initApp();
      } catch(e) {
        el('auth-err').textContent = e.message || 'Google sign-in failed. Please try again.';
        el('auth-err').style.display = 'block';
      }
    }
  });
  tokenClient.requestAccessToken();
}

async function handleGoogleCredential(response) {
  if (!response.credential) return;
  el('auth-err').style.display = 'none';
  try {
    const data = await api('POST', '/api/auth/google', { credential: response.credential });
    token = data.token;
    refreshToken = data.refreshToken || '';
    currentUser = data.user;
    localStorage.setItem('livesov_session', '1');
    await initApp();
  } catch(e) {
    el('auth-err').textContent = e.message;
    el('auth-err').style.display = 'block';
  }
}

// ─── AUTH ─────────────────────────────────────────────────────────
function authTab(tab){
  document.querySelectorAll('.auth-tab').forEach((t,i) => {
    t.classList.toggle('active', (i===0&&tab==='login')||(i===1&&tab==='register'));
  });
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  const panel = el('panel-' + tab);
  if (panel) panel.classList.add('active');
  el('auth-err').style.display = 'none';
  // Google buttons are always visible in HTML - they show a helpful message if not configured
}

async function doLogin(){
  const email = el('login-email').value.trim();
  const password = el('login-pass').value;
  const totpInput = el('login-totp');
  const totpCode = totpInput ? totpInput.value.trim() : '';
  el('auth-err').style.display = 'none';
  const btn = document.querySelector('#panel-login .btn-primary');
  if (!email || !password) {
    el('auth-err').textContent = 'Email/username and password are required.';
    el('auth-err').style.display = 'block';
    return;
  }
  btn.disabled = true; btn.textContent = 'LOGGING IN...';
  try {
    const body = { email, password };
    if (totpCode) body.totpCode = totpCode;
    const data = await api('POST', '/api/auth/login', body);
    // Handle 2FA challenge - server returns requires2FA when TOTP is needed
    if (data.requires2FA) {
      const wrap = el('login-2fa-wrap');
      if (wrap) { wrap.style.display = 'block'; }
      if (totpInput) { totpInput.focus(); }
      btn.disabled = false; btn.textContent = 'VERIFY & LOG IN';
      return;
    }
    token = data.token;
    refreshToken = data.refreshToken || '';
    currentUser = data.user;
    localStorage.setItem('livesov_session', '1');
    // Reset 2FA UI on successful login
    const wrap = el('login-2fa-wrap');
    if (wrap) wrap.style.display = 'none';
    if (totpInput) totpInput.value = '';
    await initApp();
  } catch(e) {
    el('auth-err').textContent = e.message;
    el('auth-err').style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = el('login-2fa-wrap')?.style.display === 'none' ? 'LOG IN' : 'VERIFY & LOG IN';
  }
}

async function doRegister(){
  const name = el('reg-name').value.trim();
  const username = el('reg-username').value.trim();
  const email = el('reg-email').value.trim();
  const password = el('reg-pass').value;
  el('auth-err').style.display = 'none';
  if (!email || !password) {
    el('auth-err').textContent = 'Email and password are required.';
    el('auth-err').style.display = 'block';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    el('auth-err').textContent = 'Please enter a valid email address.';
    el('auth-err').style.display = 'block';
    return;
  }
  if (password.length < 8) {
    el('auth-err').textContent = 'Password must be at least 8 characters.';
    el('auth-err').style.display = 'block';
    return;
  }
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    el('auth-err').textContent = 'Password should contain at least one uppercase letter and one number.';
    el('auth-err').style.display = 'block';
    return;
  }
  const btn = document.querySelector('#panel-register .btn-primary');
  btn.disabled = true; btn.textContent = 'CREATING ACCOUNT...';
  try {
    const data = await api('POST', '/api/auth/register', { name, username: username || undefined, email, password });
    token = data.token;
    refreshToken = data.refreshToken || '';
    currentUser = data.user;
    localStorage.setItem('livesov_session', '1');
    await initApp();
    if (currentUser.username) toast('Your username is @' + currentUser.username + ' - you can change it in Account settings', 'ok');
  } catch(e) {
    el('auth-err').textContent = e.message;
    el('auth-err').style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'CREATE ACCOUNT';
  }
}

function showForgotPassword(){
  authTab('forgot');
}

async function doForgotPassword(){
  const email = el('forgot-email').value.trim();
  const msgEl = el('forgot-msg');
  if (!email) { msgEl.textContent = 'Please enter your email.'; msgEl.style.borderColor = 'var(--red)'; msgEl.style.color = 'var(--red)'; msgEl.style.display = 'block'; return; }
  const btn = document.querySelector('#panel-forgot .btn-primary');
  btn.disabled = true; btn.textContent = 'SENDING...';
  try {
    const data = await api('POST', '/api/auth/forgot-password', { email });
    msgEl.textContent = data.message || 'Reset link sent. Check your email.';
    msgEl.style.borderColor = 'var(--success,var(--green))'; msgEl.style.color = 'var(--success,var(--green))'; msgEl.style.background = 'var(--success-light,rgba(255,97,84,.05))';
    msgEl.style.display = 'block';
  } catch(e) {
    msgEl.textContent = e.message; msgEl.style.borderColor = 'var(--danger,var(--red))'; msgEl.style.color = 'var(--danger,var(--red))'; msgEl.style.background = 'var(--danger-light,rgba(255,68,85,.05))';
    msgEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'SEND RESET LINK';
  }
}

async function doResetPassword(){
  const pw = el('reset-pass').value;
  const pw2 = el('reset-pass-confirm').value;
  const msgEl = el('reset-msg');
  if (!pw || pw.length < 8) { msgEl.textContent = 'Password must be at least 8 characters.'; msgEl.style.borderColor = 'var(--red)'; msgEl.style.color = 'var(--red)'; msgEl.style.display = 'block'; return; }
  if (pw !== pw2) { msgEl.textContent = 'Passwords do not match.'; msgEl.style.borderColor = 'var(--red)'; msgEl.style.color = 'var(--red)'; msgEl.style.display = 'block'; return; }
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get('token');
  if (!resetToken || resetToken.length < 32) { msgEl.textContent = 'Invalid or malformed reset link.'; msgEl.style.borderColor = 'var(--red)'; msgEl.style.color = 'var(--red)'; msgEl.style.display = 'block'; return; }
  const btn = document.querySelector('#panel-reset .btn-primary');
  btn.disabled = true; btn.textContent = 'RESETTING...';
  try {
    const data = await api('POST', '/api/auth/reset-password', { token: resetToken, newPassword: pw });
    msgEl.textContent = data.message || 'Password reset! You can now log in.';
    msgEl.style.borderColor = 'var(--success,var(--green))'; msgEl.style.color = 'var(--success,var(--green))'; msgEl.style.display = 'block';
    setTimeout(() => { window.location.href = '/'; }, 2000);
  } catch(e) {
    msgEl.textContent = e.message; msgEl.style.borderColor = 'var(--danger,var(--red))'; msgEl.style.color = 'var(--danger,var(--red))'; msgEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'RESET PASSWORD';
  }
}

// ─── PASSWORD VISIBILITY TOGGLE ──────────────────────────────────
function togglePwVis(btn){
  const inp = btn.parentElement.querySelector('input');
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  } else {
    inp.type = 'password';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
}

// ─── GOOGLE SIGN-IN ─────────────────────────────────────────────
let _googleScriptLoaded = false;
let _googleScriptPromise = null;
function loadGoogleScript(){
  if (_googleScriptLoaded && window.google && google.accounts) return Promise.resolve();
  if (_googleScriptPromise) return _googleScriptPromise;
  _googleScriptPromise = new Promise((resolve, reject) => {
    if (window.google && google.accounts) { _googleScriptLoaded = true; resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => { _googleScriptLoaded = true; resolve(); };
    s.onerror = () => { _googleScriptPromise = null; reject(new Error('Failed to load Google Sign-In')); };
    document.head.appendChild(s);
  });
  return _googleScriptPromise;
}
// Load Google script when auth page is shown
const _origShowAuth = showAuth;
showAuth = function(tab){
  _origShowAuth(tab);
  loadGoogleScript();
};

async function doGoogleLogin(){
  // Delegate to the unified triggerGoogleSignIn flow
  triggerGoogleSignIn();
}

function doLogout(){
  // Clear httpOnly cookies via server endpoint (best-effort)
  if (token || _hasSession) {
    fetch(API + '/api/auth/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } }).catch(() => {});
  }
  token = '';
  refreshToken = '';
  currentUser = null;
  brands = [];
  currentBrandId = '';
  localStorage.removeItem('livesov_session');
  localStorage.removeItem('livesov_brand');
  // Close all open overlays/modals
  document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  el('app').style.display = 'none';
  el('auth-page').style.display = 'none';
  el('landing-page').style.display = 'block';
      history.replaceState(null, '', '/');
}

