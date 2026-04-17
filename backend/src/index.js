const path = require('node:path');

const dotenv = require('dotenv');
const express = require('express');

const {
  buildLotsResponse,
  getAccountSummary,
  getQuotesForSymbols,
} = require('./services/mock-data.service');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const app = express();
const PORT = process.env.BACKEND_PORT || process.env.PORT || 3001;
const IS_MOCK_MODE = (process.env.SCHWAB_MOCK || 'true').toLowerCase() === 'true';

app.use(express.json());

function ensureMockMode(_req, res, next) {
  if (!IS_MOCK_MODE) {
    return res.status(501).json({
      error: 'live_mode_not_implemented',
      message: 'Live Schwab integration is not wired yet. Set SCHWAB_MOCK=true for local development.',
    });
  }

  return next();
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', mockMode: IS_MOCK_MODE });
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    mockMode: IS_MOCK_MODE,
    auth: IS_MOCK_MODE ? 'mock-ready' : 'requires-login',
    timestamp: new Date().toISOString(),
  });
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

  return res.json({
    authenticated: false,
    refreshTokenExpiresAt: null,
    refreshTokenExpiresIn: null,
    warning: 'Live auth flow is not implemented yet.',
    mode: 'live',
  });
});

app.get('/api/lots', ensureMockMode, async (req, res, next) => {
  try {
    const payload = await buildLotsResponse({
      from: req.query.from,
      to: req.query.to,
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get('/api/quotes', ensureMockMode, async (req, res, next) => {
  try {
    const symbols = String(req.query.symbols || '')
      .split(',')
      .map((symbol) => symbol.trim())
      .filter(Boolean);

    const quotes = await getQuotesForSymbols(symbols);
    res.json({ quotes });
  } catch (error) {
    next(error);
  }
});

app.get('/api/account/summary', ensureMockMode, async (_req, res, next) => {
  try {
    const summary = await getAccountSummary();
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

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT} (mock mode: ${IS_MOCK_MODE})`);
});
