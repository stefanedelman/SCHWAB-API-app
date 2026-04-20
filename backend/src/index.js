const path = require('node:path');

const dotenv = require('dotenv');
const express = require('express');

const {
  buildLotsResponse,
  getAccountSummary,
  getQuotesForSymbols,
} = require('./services/mock-data.service');
const {
  buildLiveLotsResponse,
  getLiveAccountSummary,
  getLiveQuotesForSymbols,
} = require('./services/live-data.service');
const {
  clearSession,
  exchangeAuthorizationCode,
  getAuthStatus,
  getLoginUrl,
  initializeAuthService,
} = require('./services/auth.service');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const app = express();
const PORT = process.env.BACKEND_PORT || process.env.PORT || 3001;
const IS_MOCK_MODE = (process.env.SCHWAB_MOCK || 'true').toLowerCase() === 'true';
const AUTH_SUCCESS_REDIRECT = process.env.AUTH_SUCCESS_REDIRECT
  || process.env.FRONTEND_ORIGIN
  || (process.env.NODE_ENV === 'production' ? '/' : 'https://127.0.0.1:5173/');

app.use(express.json());

function extractCodeFromInput(input) {
  const value = String(input || '').trim();
  if (!value) {
    return '';
  }

  try {
    const parsed = new URL(value);
    return parsed.searchParams.get('code') || '';
  } catch {
    const query = value.includes('?') ? value.slice(value.indexOf('?') + 1) : value;
    const params = new URLSearchParams(query);
    return params.get('code') || '';
  }
}

function withQueryParam(url, key, value) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${key}=${encodeURIComponent(String(value || ''))}`;
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', mockMode: IS_MOCK_MODE });
});

app.get('/api/health', (_req, res) => {
  const authStatus = IS_MOCK_MODE
    ? { state: 'mock-ready' }
    : getAuthStatus();

  res.json({
    status: 'ok',
    mockMode: IS_MOCK_MODE,
    auth: authStatus.state,
    timestamp: new Date().toISOString(),
  });
});

app.get('/auth/login', (req, res, next) => {
  if (IS_MOCK_MODE) {
    return res.status(409).json({
      error: 'mock_mode_enabled',
      message: 'SCHWAB_MOCK is true. Set SCHWAB_MOCK=false to use OAuth login.',
    });
  }

  try {
    const loginUrl = getLoginUrl(req.query.state);
    return res.redirect(loginUrl);
  } catch (error) {
    return next(error);
  }
});

app.get('/auth/callback', async (req, res, next) => {
  if (IS_MOCK_MODE) {
    return res.status(409).json({
      error: 'mock_mode_enabled',
      message: 'SCHWAB_MOCK is true. Set SCHWAB_MOCK=false to use OAuth callback.',
    });
  }

  try {
    const token = await exchangeAuthorizationCode(req.query.code);

    if (String(req.query.raw || '') === '1') {
      return res.json({
        ok: true,
        authenticated: true,
        accessTokenExpiresAt: token.accessTokenExpiresAt,
        refreshTokenExpiresAt: token.refreshTokenExpiresAt,
      });
    }

    return res.redirect(AUTH_SUCCESS_REDIRECT);
  } catch (error) {
    const acceptsHtml = String(req.headers.accept || '').includes('text/html');

    if (acceptsHtml && String(req.query.raw || '') !== '1') {
      return res.redirect(withQueryParam(AUTH_SUCCESS_REDIRECT, 'authError', error.message || 'OAuth callback failed'));
    }

    return next(error);
  }
});

app.post('/auth/complete', async (req, res, next) => {
  if (IS_MOCK_MODE) {
    return res.status(409).json({
      error: 'mock_mode_enabled',
      message: 'SCHWAB_MOCK is true. Set SCHWAB_MOCK=false to use OAuth callback.',
    });
  }

  try {
    const code = String(req.body?.code || '').trim() || extractCodeFromInput(req.body?.callbackUrl);

    if (!code) {
      return res.status(400).json({
        error: 'missing_code',
        message: 'No OAuth code was found. Paste the full Schwab redirect URL or provide code directly.',
      });
    }

    const token = await exchangeAuthorizationCode(code);
    return res.json({
      ok: true,
      authenticated: true,
      accessTokenExpiresAt: token.accessTokenExpiresAt,
      refreshTokenExpiresAt: token.refreshTokenExpiresAt,
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/auth/status', (_req, res) => {
  if (IS_MOCK_MODE) {
    return res.json({
      authenticated: true,
      refreshTokenExpiresAt: null,
      refreshTokenExpiresIn: null,
      warning: null,
      mode: 'mock',
    });
  }

  return res.json(getAuthStatus());
});

app.post('/auth/logout', async (_req, res, next) => {
  if (IS_MOCK_MODE) {
    return res.status(204).send();
  }

  try {
    await clearSession();
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

app.get('/api/lots', async (req, res, next) => {
  try {
    const payload = IS_MOCK_MODE
      ? await buildLotsResponse({
        from: req.query.from,
        to: req.query.to,
      })
      : await buildLiveLotsResponse({
      from: req.query.from,
      to: req.query.to,
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get('/api/quotes', async (req, res, next) => {
  try {
    const symbols = String(req.query.symbols || '')
      .split(',')
      .map((symbol) => symbol.trim())
      .filter(Boolean);

    const quotes = IS_MOCK_MODE
      ? await getQuotesForSymbols(symbols)
      : await getLiveQuotesForSymbols(symbols);
    res.json({ quotes });
  } catch (error) {
    next(error);
  }
});

app.get('/api/account/summary', async (_req, res, next) => {
  try {
    const summary = IS_MOCK_MODE
      ? await getAccountSummary()
      : await getLiveAccountSummary();
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const statusCode = error.name === 'SchemaValidationError' ? 502 : 500;
  console.error('[backend:error]', error.message, error.details || '');

  res.status(statusCode).json({
    error: error.name || 'InternalError',
    message: error.message || 'Unexpected server error',
    details: error.details || null,
  });
});

initializeAuthService({ mockMode: IS_MOCK_MODE })
  .catch((error) => {
    console.error('[backend:auth:init]', error.message);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Backend listening on http://localhost:${PORT} (mock mode: ${IS_MOCK_MODE})`);
    });
  });
