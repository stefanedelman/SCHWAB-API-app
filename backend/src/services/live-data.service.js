const { URL } = require('node:url');

const { getValidAccessToken } = require('./auth.service');
const { AccountResponseSchema } = require('../schemas/account.schema');
const { PositionsResponseSchema } = require('../schemas/positions.schema');
const { TransactionsResponseSchema } = require('../schemas/transactions.schema');
const { QuotesResponseSchema } = require('../schemas/quotes.schema');
const { buildLotsResponseFromPayloads } = require('./mock-data.service');

const TRADER_API_BASE = process.env.SCHWAB_TRADER_API_BASE || 'https://api.schwabapi.com/trader/v1';
const MARKET_DATA_API_BASE = process.env.SCHWAB_MARKETDATA_API_BASE || 'https://api.schwabapi.com/marketdata/v1';

let cachedAccountHash = null;

function normalizeBase(base) {
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateOrThrow(schemaName, schema, rawPayload) {
  const parsed = schema.safeParse(rawPayload);
  if (!parsed.success) {
    const error = new Error(`Schema validation failed for ${schemaName}`);
    error.name = 'SchemaValidationError';
    error.details = parsed.error.flatten();
    throw error;
  }

  return parsed.data;
}

async function schwabRequest(base, route, params = {}, retryOn429 = true) {
  const token = await getValidAccessToken();

  const url = new URL(`${normalizeBase(base)}${route}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (response.status === 429 && retryOn429) {
    const retryAfterSec = Number(response.headers.get('Retry-After') || '1');
    await sleep(Math.max(retryAfterSec, 1) * 1000);
    return schwabRequest(base, route, params, false);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = payload?.error_description || payload?.error || JSON.stringify(payload) || `HTTP ${response.status}`;
    throw new Error(`Schwab API request failed for ${route}: ${detail}`);
  }

  return payload;
}

async function getAccountHash() {
  if (cachedAccountHash) {
    return cachedAccountHash;
  }

  const payload = await schwabRequest(TRADER_API_BASE, '/accounts/accountNumbers');

  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error('No Schwab accounts returned for the authenticated user.');
  }

  const configuredAccount = String(process.env.SCHWAB_ACCOUNT_NUMBER || '').trim();
  const selected = configuredAccount
    ? payload.find((item) => String(item.accountNumber) === configuredAccount)
    : payload[0];

  if (!selected?.hashValue) {
    throw new Error('Unable to determine Schwab account hash. Set SCHWAB_ACCOUNT_NUMBER if needed.');
  }

  cachedAccountHash = selected.hashValue;
  return cachedAccountHash;
}

function normalizeQuotesPayload(rawQuotes) {
  const normalized = {};

  for (const [symbol, quoteEnvelope] of Object.entries(rawQuotes || {})) {
    const quote = quoteEnvelope?.quote || {};
    normalized[symbol] = {
      ...quoteEnvelope,
      quote: {
        ...quote,
        lastPrice: Number(
          quote.lastPrice
          ?? quote.mark
          ?? quote.markPrice
          ?? quote.closePrice
          ?? quote.askPrice
          ?? quote.bidPrice
          ?? 0,
        ),
        netChange: Number(quote.netChange ?? 0),
        netPercentChangeInDouble: Number(
          quote.netPercentChangeInDouble
          ?? quote.netPercentChange
          ?? quote.markChangePercent
          ?? 0,
        ),
      },
    };
  }

  return normalized;
}

async function fetchPositionsPayload(accountHash) {
  const positionsRaw = await schwabRequest(TRADER_API_BASE, `/accounts/${accountHash}`, {
    fields: 'positions',
  });
  return validateOrThrow('positions', PositionsResponseSchema, positionsRaw);
}

async function fetchTransactionsPayload(accountHash) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 365);

  const transactionsRaw = await schwabRequest(TRADER_API_BASE, `/accounts/${accountHash}/transactions`, {
    types: 'TRADE,DIVIDEND_OR_INTEREST',
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  });

  return validateOrThrow('transactions', TransactionsResponseSchema, transactionsRaw);
}

async function fetchQuotesPayload(symbols) {
  if (!symbols.length) {
    return {};
  }

  const quotesRaw = await schwabRequest(MARKET_DATA_API_BASE, '/quotes', {
    symbols: symbols.join(','),
  });

  const normalized = normalizeQuotesPayload(quotesRaw);
  return validateOrThrow('quotes', QuotesResponseSchema, normalized);
}

async function buildLiveLotsResponse({ from, to }) {
  const accountHash = await getAccountHash();

  const positions = await fetchPositionsPayload(accountHash);
  const heldSymbols = positions.securitiesAccount.positions
    .filter((position) => position.instrument?.assetType === 'EQUITY' && Number(position.longQuantity) > 0)
    .map((position) => position.instrument.symbol)
    .filter(Boolean);

  let transactions = [];
  try {
    transactions = await fetchTransactionsPayload(accountHash);
  } catch {
    // If Schwab transactions endpoint fails, we still show positions as orphan lots.
    transactions = [];
  }

  const quotes = await fetchQuotesPayload([...new Set(heldSymbols)]);

  return buildLotsResponseFromPayloads(
    {
      account: {
        securitiesAccount: {
          accountNumber: positions.securitiesAccount.accountNumber,
          currentBalances: positions.securitiesAccount.currentBalances,
        },
      },
      positions,
      transactions,
      quotes,
    },
    { from, to },
  );
}

async function getLiveAccountSummary() {
  const accountHash = await getAccountHash();
  const positions = await fetchPositionsPayload(accountHash);

  const account = validateOrThrow('account', AccountResponseSchema, {
    securitiesAccount: {
      accountNumber: positions.securitiesAccount.accountNumber,
      currentBalances: positions.securitiesAccount.currentBalances,
    },
  });

  return {
    accountNumber: account.securitiesAccount.accountNumber,
    liquidationValue: account.securitiesAccount.currentBalances.liquidationValue,
    cashBalance: account.securitiesAccount.currentBalances.cashBalance,
    availableFunds: account.securitiesAccount.currentBalances.availableFunds,
  };
}

async function getLiveQuotesForSymbols(symbols) {
  const cleanSymbols = [...new Set((symbols || []).map((symbol) => String(symbol).trim().toUpperCase()).filter(Boolean))];
  return fetchQuotesPayload(cleanSymbols);
}

module.exports = {
  buildLiveLotsResponse,
  getLiveAccountSummary,
  getLiveQuotesForSymbols,
};
