const fs = require('node:fs/promises');
const path = require('node:path');

const { AccountResponseSchema } = require('../schemas/account.schema');
const { PositionsResponseSchema } = require('../schemas/positions.schema');
const { TransactionsResponseSchema } = require('../schemas/transactions.schema');
const { QuotesResponseSchema } = require('../schemas/quotes.schema');

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const MOCKS_DIR = path.join(ROOT_DIR, 'mocks');

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function toIsoOrNull(value) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function parseDateInput(value, asEndOfDay = false) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (asEndOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
}

function parseLotDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

async function readJsonFile(fileName) {
  const filePath = path.join(MOCKS_DIR, fileName);
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
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

async function loadMockPayloads() {
  const [accountRaw, positionsRaw, transactionsRaw, quotesRaw] = await Promise.all([
    readJsonFile('account.json'),
    readJsonFile('positions.json'),
    readJsonFile('transactions.json'),
    readJsonFile('quotes.json'),
  ]);

  return {
    account: validateOrThrow('account', AccountResponseSchema, accountRaw),
    positions: validateOrThrow('positions', PositionsResponseSchema, positionsRaw),
    transactions: validateOrThrow('transactions', TransactionsResponseSchema, transactionsRaw),
    quotes: validateOrThrow('quotes', QuotesResponseSchema, quotesRaw),
  };
}

function buildLotFromTransaction(transaction, transferItem, transferItemIndex, quote, allocatedFee) {
  const quantity = Math.abs(Number(transferItem.amount || 0));
  if (!quantity) {
    return null;
  }

  const transferCost = Number(
    transferItem.cost ?? Number(transferItem.price || 0) * quantity,
  );
  const costPerShare = quantity ? transferCost / quantity : 0;
  const costBasis = transferCost + allocatedFee;

  const currentPrice = Number(quote?.quote?.lastPrice ?? costPerShare);
  const marketValue = currentPrice * quantity;
  const totalGainLoss = marketValue - costBasis;

  return {
    id: `${transaction.activityId}-${transferItemIndex}`,
    symbol: transferItem.instrument.symbol,
    description: transferItem.instrument.description || transferItem.instrument.symbol,
    purchaseDate: toIsoOrNull(transaction.time),
    purchaseDateKnown: true,
    quantity: round2(quantity),
    costPerShare: round2(costPerShare),
    costBasis: round2(costBasis),
    currentPrice: round2(currentPrice),
    marketValue: round2(marketValue),
    dayChange: round2(Number(quote?.quote?.netChange || 0)),
    dayChangePct: round2(Number(quote?.quote?.netPercentChangeInDouble || 0)),
    totalGainLoss: round2(totalGainLoss),
    totalGainLossPct: costBasis ? round2((totalGainLoss / costBasis) * 100) : 0,
  };
}

function buildOrphanLot(position, quote) {
  const quantity = Number(position.longQuantity || 0);
  const costPerShare = Number(position.averagePrice || 0);
  const costBasis = quantity * costPerShare;
  const currentPrice = Number(quote?.quote?.lastPrice ?? costPerShare);
  const marketValue = currentPrice * quantity;
  const totalGainLoss = marketValue - costBasis;

  return {
    id: `orphan-${position.instrument.symbol}`,
    symbol: position.instrument.symbol,
    description: position.instrument.description || position.instrument.symbol,
    purchaseDate: null,
    purchaseDateKnown: false,
    quantity: round2(quantity),
    costPerShare: round2(costPerShare),
    costBasis: round2(costBasis),
    currentPrice: round2(currentPrice),
    marketValue: round2(marketValue),
    dayChange: round2(Number(quote?.quote?.netChange || 0)),
    dayChangePct: round2(Number(quote?.quote?.netPercentChangeInDouble || 0)),
    totalGainLoss: round2(totalGainLoss),
    totalGainLossPct: costBasis ? round2((totalGainLoss / costBasis) * 100) : 0,
  };
}

function calculateSummary(lots, totalLotsCount) {
  const totalMarketValue = lots.reduce((sum, lot) => sum + lot.marketValue, 0);
  const totalCostBasis = lots.reduce((sum, lot) => sum + lot.costBasis, 0);
  const totalDayChange = lots.reduce((sum, lot) => sum + lot.dayChange * lot.quantity, 0);
  const totalGainLoss = totalMarketValue - totalCostBasis;

  const previousMarketValue = totalMarketValue - totalDayChange;

  return {
    totalMarketValue: round2(totalMarketValue),
    totalCostBasis: round2(totalCostBasis),
    totalGainLoss: round2(totalGainLoss),
    totalGainLossPct: totalCostBasis ? round2((totalGainLoss / totalCostBasis) * 100) : 0,
    totalDayChange: round2(totalDayChange),
    totalDayChangePct: previousMarketValue ? round2((totalDayChange / previousMarketValue) * 100) : 0,
    lotsDisplayed: lots.length,
    lotsTotal: totalLotsCount,
  };
}

function filterLotsByDate(lots, from, to) {
  const fromDate = parseDateInput(from);
  const toDate = parseDateInput(to, true);

  if (!fromDate && !toDate) {
    return lots;
  }

  return lots.filter((lot) => {
    if (!lot.purchaseDateKnown || !lot.purchaseDate) {
      return false;
    }

    const lotDate = parseLotDate(lot.purchaseDate);
    if (!lotDate) {
      return false;
    }

    if (fromDate && lotDate < fromDate) {
      return false;
    }

    if (toDate && lotDate > toDate) {
      return false;
    }

    return true;
  });
}

async function buildLotsResponse({ from, to }) {
  const payloads = await loadMockPayloads();

  const positions = payloads.positions.securitiesAccount.positions.filter(
    (position) => position.instrument.assetType === 'EQUITY' && Number(position.longQuantity) > 0,
  );

  const heldSymbols = new Set(positions.map((position) => position.instrument.symbol));
  const lots = [];
  const knownQuantityBySymbol = new Map();

  payloads.transactions
    .filter((transaction) => ['TRADE', 'DIVIDEND_OR_INTEREST'].includes(transaction.type))
    .filter((transaction) => transaction.status === 'VALID')
    .forEach((transaction) => {
      const openingItems = transaction.transferItems.filter((item) => {
        return (
          item.instrument.assetType === 'EQUITY' &&
          heldSymbols.has(item.instrument.symbol) &&
          item.positionEffect === 'OPENING'
        );
      });

      if (!openingItems.length) {
        return;
      }

      const transferTotal = openingItems.reduce((sum, item) => {
        const quantity = Math.abs(Number(item.amount || 0));
        const cost = Number(item.cost ?? Number(item.price || 0) * quantity);
        return sum + cost;
      }, 0);

      const transactionNet = Math.abs(Number(transaction.netAmount || 0));
      const extraFees = Math.max(transactionNet - transferTotal, 0);

      openingItems.forEach((item, index) => {
        const quantity = Math.abs(Number(item.amount || 0));
        const itemCost = Number(item.cost ?? Number(item.price || 0) * quantity);
        const allocation = transferTotal ? (itemCost / transferTotal) * extraFees : 0;

        const lot = buildLotFromTransaction(
          transaction,
          item,
          index,
          payloads.quotes[item.instrument.symbol],
          allocation,
        );

        if (!lot) {
          return;
        }

        lots.push(lot);
        knownQuantityBySymbol.set(
          lot.symbol,
          round2(Number(knownQuantityBySymbol.get(lot.symbol) || 0) + lot.quantity),
        );
      });
    });

  positions.forEach((position) => {
    const symbol = position.instrument.symbol;
    const knownQty = Number(knownQuantityBySymbol.get(symbol) || 0);
    const totalQty = Number(position.longQuantity || 0);
    const orphanQty = round2(totalQty - knownQty);

    if (orphanQty > 0.000001) {
      const orphanLot = buildOrphanLot(
        {
          ...position,
          longQuantity: orphanQty,
        },
        payloads.quotes[symbol],
      );

      lots.push(orphanLot);
    }
  });

  lots.sort((a, b) => {
    if (!a.purchaseDate && !b.purchaseDate) {
      return a.symbol.localeCompare(b.symbol);
    }

    if (!a.purchaseDate) {
      return 1;
    }

    if (!b.purchaseDate) {
      return -1;
    }

    return new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime();
  });

  const filteredLots = filterLotsByDate(lots, from, to);
  const summary = calculateSummary(filteredLots, lots.length);

  return {
    stale: false,
    cachedAt: new Date().toISOString(),
    lots: filteredLots,
    summary,
  };
}

async function getAccountSummary() {
  const payloads = await loadMockPayloads();
  const balances = payloads.account.securitiesAccount.currentBalances;

  return {
    accountNumber: payloads.account.securitiesAccount.accountNumber,
    liquidationValue: balances.liquidationValue,
    cashBalance: balances.cashBalance,
    availableFunds: balances.availableFunds,
  };
}

async function getQuotesForSymbols(symbols) {
  const payloads = await loadMockPayloads();

  if (!symbols?.length) {
    return payloads.quotes;
  }

  return symbols.reduce((acc, symbol) => {
    const cleanSymbol = symbol.trim().toUpperCase();
    if (!cleanSymbol) {
      return acc;
    }

    if (payloads.quotes[cleanSymbol]) {
      acc[cleanSymbol] = payloads.quotes[cleanSymbol];
    }

    return acc;
  }, {});
}

module.exports = {
  buildLotsResponse,
  getAccountSummary,
  getQuotesForSymbols,
};
