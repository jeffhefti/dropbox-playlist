// Dropbox OAuth 2.0 PKCE flow — entirely client-side, no server, no secret.
// Docs: https://developers.dropbox.com/oauth-guide

const AUTH_STORAGE_KEY = 'dbxplaylist_tokens';
const VERIFIER_STORAGE_KEY = 'dbxplaylist_pkce_verifier';

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateCodeVerifier() {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes.buffer);
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

function getStoredTokens() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function storeTokens(tokens) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(tokens));
}

function clearTokens() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function isLoggedIn() {
  return !!getStoredTokens();
}

function logout() {
  clearTokens();
}

// Kicks off the redirect to Dropbox's consent screen.
async function startDropboxAuth() {
  const verifier = generateCodeVerifier();
  sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier);
  const challenge = await generateCodeChallenge(verifier);

  const params = new URLSearchParams({
    client_id: CONFIG.DROPBOX_CLIENT_ID,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    redirect_uri: CONFIG.REDIRECT_URI,
    token_access_type: 'offline', // also returns a refresh_token
  });

  window.location.href = `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
}

// Call on every page load. If the URL contains an OAuth ?code=, exchanges
// it for tokens and cleans the URL. Returns true if a fresh login just
// completed.
async function handleAuthRedirect() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    window.history.replaceState({}, document.title, url.pathname + url.search);
    throw new Error(`Dropbox auth error: ${errorParam}`);
  }

  if (!code) return false;

  const verifier = sessionStorage.getItem(VERIFIER_STORAGE_KEY);
  sessionStorage.removeItem(VERIFIER_STORAGE_KEY);
  if (!verifier) throw new Error('Missing PKCE verifier — please try connecting again.');

  const body = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: CONFIG.DROPBOX_CLIENT_ID,
    redirect_uri: CONFIG.REDIRECT_URI,
    code_verifier: verifier,
  });

  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  storeTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  });

  // Strip ?code=&state= from the address bar without reloading.
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, document.title, url.pathname + url.search);

  return true;
}

async function refreshAccessToken() {
  const tokens = getStoredTokens();
  if (!tokens || !tokens.refresh_token) {
    clearTokens();
    throw new Error('Not logged in.');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: CONFIG.DROPBOX_CLIENT_ID,
  });

  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    clearTokens();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const updated = {
    ...tokens,
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  storeTokens(updated);
  return updated.access_token;
}

// Returns a currently-valid access token, refreshing it first if it's
// expired or about to expire.
async function getValidAccessToken() {
  const tokens = getStoredTokens();
  if (!tokens) throw new Error('Not logged in.');

  const bufferMs = 60 * 1000; // refresh a minute early
  if (Date.now() > tokens.expires_at - bufferMs) {
    return refreshAccessToken();
  }
  return tokens.access_token;
}
