const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const TOKEN_PATH = path.join(ROOT_DIR, 'token.json');

const SCHWAB_AUTHORIZE_URL = 'https://api.schwabapi.com/v1/oauth/authorize';
const SCHWAB_TOKEN_URL = 'https://api.schwabapi.com/v1/oauth/token';

const ACCESS_REFRESH_HEADROOM_MS = 2 * 60 * 1000;
const REFRESH_TOKEN_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_RETRY_DELAY_MS = 30 * 1000;

let tokenStore = null;
let refreshTimer = null;
let retryTimer = null;
let lastAuthError = null;

function nowIso() {
  return new Date().toISOString();
}

function parseTime(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '0m';
  }

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function getConfig() {
  return {
    clientId: process.env.SCHWAB_CLIENT_ID || '',
    clientSecret: process.env.SCHWAB_CLIENT_SECRET || '',
    redirectUri: process.env.SCHWAB_REDIRECT_URI || '',
  };
}

function missingConfigMessage() {
  return 'Missing SCHWAB_CLIENT_ID, SCHWAB_CLIENT_SECRET, or SCHWAB_REDIRECT_URI.';
}

function hasRequiredConfig() {
  const config = getConfig();
  return Boolean(config.clientId && config.clientSecret && config.redirectUri);
}

function makeBasicAuth(clientId, clientSecret) {
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

async function persistTokenStore() {
  if (!tokenStore) {
    return;
  }

  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokenStore, null, 2), 'utf8');
}

function clearTimers() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function getRefreshTokenExpiryMs(tokenData) {
  const expiry = parseTime(tokenData.refreshTokenExpiresAt);
  if (!expiry) {
    return 0;
  }

  return expiry.getTime() - Date.now();
}

function isRefreshTokenExpired(tokenData) {
  return getRefreshTokenExpiryMs(tokenData) <= 0;
}

function scheduleRefresh() {
  clearTimers();

  if (!tokenStore || !tokenStore.accessTokenExpiresAt || isRefreshTokenExpired(tokenStore)) {
    return;
  }

  const accessExpiry = parseTime(tokenStore.accessTokenExpiresAt);
  if (!accessExpiry) {
    return;
  }

  const waitMs = accessExpiry.getTime() - Date.now() - ACCESS_REFRESH_HEADROOM_MS;
  const delay = Math.max(waitMs, 1000);

  refreshTimer = setTimeout(async () => {
    try {
      await refreshAccessToken();
      scheduleRefresh();
    } catch (error) {
      lastAuthError = error.message;
      retryTimer = setTimeout(async () => {
        try {
          await refreshAccessToken();
          scheduleRefresh();
        } catch (retryError) {
          lastAuthError = retryError.message;
        }
      }, REFRESH_RETRY_DELAY_MS);
    }
  }, delay);
}

function buildTokenStore(payload, existing) {
  const now = Date.now();
  const accessExpiresInSec = Number(payload.expires_in || 1800);
  const accessTokenExpiresAt = new Date(now + accessExpiresInSec * 1000).toISOString();

  const newRefreshToken = payload.refresh_token;
  const refreshToken = newRefreshToken || existing?.refreshToken || null;

  const refreshExpiresInSec = Number(payload.refresh_token_expires_in || 0);
  const refreshTokenExpiresAt = newRefreshToken
    ? new Date(
      now + (refreshExpiresInSec > 0 ? refreshExpiresInSec * 1000 : REFRESH_TOKEN_DEFAULT_TTL_MS),
    ).toISOString()
    : (existing?.refreshTokenExpiresAt || new Date(now + REFRESH_TOKEN_DEFAULT_TTL_MS).toISOString());

  return {
    accessToken: payload.access_token,
    refreshToken,
    tokenType: payload.token_type || 'Bearer',
    scope: payload.scope || '',
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
  };
}

async function requestToken(formData) {
  const config = getConfig();

  if (!hasRequiredConfig()) {
    throw new Error(missingConfigMessage());
  }

  const response = await fetch(SCHWAB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${makeBasicAuth(config.clientId, config.clientSecret)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(formData),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const details = payload.error_description || payload.error || `HTTP ${response.status}`;
    throw new Error(`Schwab token request failed: ${details}`);
  }

  return payload;
}

async function refreshAccessToken() {
  if (!tokenStore?.refreshToken) {
    throw new Error('No refresh token available. Re-authentication required.');
  }

  if (isRefreshTokenExpired(tokenStore)) {
    throw new Error('Refresh token is expired. Re-authentication required.');
  }

  const payload = await requestToken({
    grant_type: 'refresh_token',
    refresh_token: tokenStore.refreshToken,
  });

  tokenStore = buildTokenStore(payload, tokenStore);
  await persistTokenStore();
  lastAuthError = null;

  return tokenStore;
}

async function exchangeAuthorizationCode(code) {
  const config = getConfig();

  if (!code) {
    throw new Error('Missing authorization code.');
  }

  const payload = await requestToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
  });

  tokenStore = buildTokenStore(payload, tokenStore);
  await persistTokenStore();
  scheduleRefresh();
  lastAuthError = null;

  return tokenStore;
}

function getLoginUrl(state) {
  if (!hasRequiredConfig()) {
    throw new Error(missingConfigMessage());
  }

  const config = getConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
  });

  if (state) {
    params.set('state', state);
  }

  return `${SCHWAB_AUTHORIZE_URL}?${params.toString()}`;
}

function hasValidSession() {
  if (!tokenStore || !tokenStore.accessToken || !tokenStore.refreshToken) {
    return false;
  }

  if (isRefreshTokenExpired(tokenStore)) {
    return false;
  }

  return true;
}

function getAuthStatus() {
  if (!hasRequiredConfig()) {
    return {
      authenticated: false,
      refreshTokenExpiresAt: null,
      refreshTokenExpiresIn: null,
      warning: missingConfigMessage(),
      mode: 'live',
      state: 'requires-config',
      lastError: lastAuthError,
    };
  }

  if (!tokenStore) {
    return {
      authenticated: false,
      refreshTokenExpiresAt: null,
      refreshTokenExpiresIn: null,
      warning: 'No token file found. Log in to connect Schwab.',
      mode: 'live',
      state: 'requires-login',
      lastError: lastAuthError,
    };
  }

  const expiresMs = getRefreshTokenExpiryMs(tokenStore);
  const warning = expiresMs <= 24 * 60 * 60 * 1000
    ? `Refresh token expires in ${formatDuration(expiresMs)}. Re-authenticate soon.`
    : null;

  return {
    authenticated: hasValidSession(),
    refreshTokenExpiresAt: tokenStore.refreshTokenExpiresAt || null,
    refreshTokenExpiresIn: tokenStore.refreshTokenExpiresAt ? formatDuration(expiresMs) : null,
    warning,
    mode: 'live',
    state: hasValidSession() ? 'authenticated' : 'requires-login',
    lastError: lastAuthError,
  };
}

async function clearSession() {
  clearTimers();
  tokenStore = null;
  lastAuthError = null;

  try {
    await fs.unlink(TOKEN_PATH);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function initializeAuthService({ mockMode }) {
  if (mockMode) {
    return;
  }

  clearTimers();

  try {
    const raw = await fs.readFile(TOKEN_PATH, 'utf8');
    tokenStore = JSON.parse(raw);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      lastAuthError = `Failed to read token file: ${error.message}`;
    }
    tokenStore = null;
    return;
  }

  if (!tokenStore || !tokenStore.refreshToken) {
    tokenStore = null;
    return;
  }

  if (isRefreshTokenExpired(tokenStore)) {
    await clearSession();
    lastAuthError = 'Refresh token expired. Re-authentication required.';
    return;
  }

  try {
    await refreshAccessToken();
    scheduleRefresh();
  } catch (error) {
    lastAuthError = error.message;
  }
}

module.exports = {
  clearSession,
  exchangeAuthorizationCode,
  getAuthStatus,
  getLoginUrl,
  initializeAuthService,
};
