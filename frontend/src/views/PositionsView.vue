<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import AuthBanner from '../components/AuthBanner.vue';
import DateRangeFilter from '../components/DateRangeFilter.vue';
import MarketStatusBadge from '../components/MarketStatusBadge.vue';
import PortfolioSummary from '../components/PortfolioSummary.vue';
import PositionsTable from '../components/PositionsTable.vue';
import { fetchAccountSummary, fetchAuthStatus, fetchLots, fetchQuotes } from '../services/api';

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveDateRangeFromPreset(preset) {
  const now = new Date();
  const to = formatDateInput(now);

  if (preset === 'LAST_7') {
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - 7);
    return { from: formatDateInput(fromDate), to };
  }

  if (preset === 'LAST_30') {
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - 30);
    return { from: formatDateInput(fromDate), to };
  }

  if (preset === 'LAST_90') {
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - 90);
    return { from: formatDateInput(fromDate), to };
  }

  if (preset === 'YTD') {
    const fromDate = new Date(now.getFullYear(), 0, 1);
    return { from: formatDateInput(fromDate), to };
  }

  return { from: '', to: '' };
}

function isUsMarketOpen(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');

  const weekIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
  if (weekIndex < 1 || weekIndex > 5) {
    return false;
  }

  const minutes = hour * 60 + minute;
  return minutes >= 570 && minutes <= 960;
}

const allLots = ref([]);
const loading = ref(false);
const errorMessage = ref('');
const selectedPreset = ref('ALL');
const customFrom = ref('');
const customTo = ref('');
const symbolFilter = ref('');
const sortKey = ref('purchaseDate');
const sortDirection = ref('desc');
const accountSummary = ref(null);
const authStatus = ref(null);
const staleInfo = ref({ stale: false, cachedAt: null });
const marketOpen = ref(false);

let quotePollTimer = null;

function clearQuotePolling() {
  if (quotePollTimer) {
    clearInterval(quotePollTimer);
    quotePollTimer = null;
  }
}

function activeDateRange() {
  if (selectedPreset.value === 'CUSTOM') {
    return {
      from: customFrom.value,
      to: customTo.value,
    };
  }

  return resolveDateRangeFromPreset(selectedPreset.value);
}

function applyQuoteToLot(lot, quote) {
  if (!quote?.quote) {
    return lot;
  }

  const currentPrice = Number(quote.quote.lastPrice ?? lot.currentPrice);
  const dayChange = Number(quote.quote.netChange ?? lot.dayChange);
  const dayChangePct = Number(quote.quote.netPercentChangeInDouble ?? lot.dayChangePct);
  const marketValue = currentPrice * Number(lot.quantity || 0);
  const totalGainLoss = marketValue - Number(lot.costBasis || 0);

  return {
    ...lot,
    currentPrice: round2(currentPrice),
    dayChange: round2(dayChange),
    dayChangePct: round2(dayChangePct),
    marketValue: round2(marketValue),
    totalGainLoss: round2(totalGainLoss),
    totalGainLossPct: lot.costBasis ? round2((totalGainLoss / lot.costBasis) * 100) : 0,
  };
}

async function refreshQuotes() {
  const symbols = [...new Set(allLots.value.map((lot) => lot.symbol))];
  if (!symbols.length) {
    return;
  }

  const payload = await fetchQuotes(symbols);
  const quotes = payload.quotes || {};

  allLots.value = allLots.value.map((lot) => applyQuoteToLot(lot, quotes[lot.symbol]));
}

async function startQuotePolling() {
  clearQuotePolling();
  await refreshQuotes();

  if (!isUsMarketOpen()) {
    marketOpen.value = false;
    return;
  }

  marketOpen.value = true;
  quotePollTimer = setInterval(async () => {
    if (!isUsMarketOpen()) {
      marketOpen.value = false;
      clearQuotePolling();
      return;
    }

    marketOpen.value = true;
    try {
      await refreshQuotes();
    } catch {
      // Ignore quote refresh errors between full reloads.
    }
  }, 30000);
}

async function loadLots() {
  loading.value = true;
  errorMessage.value = '';

  try {
    const payload = await fetchLots(activeDateRange());
    allLots.value = payload.lots || [];
    staleInfo.value = {
      stale: Boolean(payload.stale),
      cachedAt: payload.cachedAt || null,
    };

    await startQuotePolling();
  } catch (error) {
    errorMessage.value = error.message || 'Failed to load lots.';
  } finally {
    loading.value = false;
  }
}

async function loadMeta() {
  const [accountResult, authResult] = await Promise.allSettled([
    fetchAccountSummary(),
    fetchAuthStatus(),
  ]);

  accountSummary.value = accountResult.status === 'fulfilled' ? accountResult.value : null;
  authStatus.value = authResult.status === 'fulfilled' ? authResult.value : null;
}

async function onPresetChange(preset) {
  selectedPreset.value = preset;

  if (preset !== 'CUSTOM') {
    await loadLots();
  }
}

function onCustomChange({ field, value }) {
  if (field === 'from') {
    customFrom.value = value;
    return;
  }

  customTo.value = value;
}

async function onApplyCustomRange() {
  await loadLots();
}

function onSortChange(columnKey) {
  if (sortKey.value === columnKey) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    return;
  }

  sortKey.value = columnKey;
  sortDirection.value = columnKey === 'purchaseDate' ? 'desc' : 'asc';
}

const visibleLots = computed(() => {
  const normalizedFilter = symbolFilter.value.trim().toUpperCase();
  let nextLots = [...allLots.value];

  if (normalizedFilter) {
    nextLots = nextLots.filter((lot) => {
      const symbol = String(lot.symbol || '').toUpperCase();
      const description = String(lot.description || '').toUpperCase();
      return symbol.includes(normalizedFilter) || description.includes(normalizedFilter);
    });
  }

  const key = sortKey.value;
  const directionFactor = sortDirection.value === 'asc' ? 1 : -1;

  nextLots.sort((left, right) => {
    if (key === 'purchaseDate') {
      const leftValue = left.purchaseDate ? new Date(left.purchaseDate).getTime() : -Infinity;
      const rightValue = right.purchaseDate ? new Date(right.purchaseDate).getTime() : -Infinity;
      return (leftValue - rightValue) * directionFactor;
    }

    if (['quantity', 'costPerShare', 'costBasis', 'currentPrice', 'marketValue', 'dayChange', 'totalGainLoss'].includes(key)) {
      const leftValue = Number(left[key] || 0);
      const rightValue = Number(right[key] || 0);
      return (leftValue - rightValue) * directionFactor;
    }

    const leftValue = String(left[key] || '').toUpperCase();
    const rightValue = String(right[key] || '').toUpperCase();
    return leftValue.localeCompare(rightValue) * directionFactor;
  });

  return nextLots;
});

const computedSummary = computed(() => {
  const totalMarketValue = visibleLots.value.reduce((sum, lot) => sum + Number(lot.marketValue || 0), 0);
  const totalCostBasis = visibleLots.value.reduce((sum, lot) => sum + Number(lot.costBasis || 0), 0);
  const totalDayChange = visibleLots.value.reduce(
    (sum, lot) => sum + Number(lot.dayChange || 0) * Number(lot.quantity || 0),
    0,
  );
  const totalGainLoss = totalMarketValue - totalCostBasis;
  const previousValue = totalMarketValue - totalDayChange;

  return {
    totalMarketValue: round2(totalMarketValue),
    totalCostBasis: round2(totalCostBasis),
    totalGainLoss: round2(totalGainLoss),
    totalGainLossPct: totalCostBasis ? round2((totalGainLoss / totalCostBasis) * 100) : 0,
    totalDayChange: round2(totalDayChange),
    totalDayChangePct: previousValue ? round2((totalDayChange / previousValue) * 100) : 0,
    lotsDisplayed: visibleLots.value.length,
    lotsTotal: allLots.value.length,
  };
});

onMounted(async () => {
  await loadMeta();
  await loadLots();
});

onBeforeUnmount(() => {
  clearQuotePolling();
});
</script>

<template>
  <section class="dashboard">
    <header class="hero">
      <div>
        <p class="eyebrow">Schwab View-Only Dashboard</p>
        <h1>Lot-Level Positions</h1>
        <p class="subtitle">
          Every opening lot rendered as its own row with transparent cost and gain math.
        </p>
      </div>
      <MarketStatusBadge :is-open="marketOpen" />
    </header>

    <AuthBanner :auth-status="authStatus" />

    <section class="controls">
      <DateRangeFilter
        :selected-preset="selectedPreset"
        :custom-from="customFrom"
        :custom-to="customTo"
        @preset-change="onPresetChange"
        @custom-change="onCustomChange"
        @apply-custom="onApplyCustomRange"
      />

      <label class="symbol-search">
        Symbol Search
        <input
          v-model="symbolFilter"
          type="text"
          placeholder="AAPL, MSFT, VTI..."
        >
      </label>
    </section>

    <PortfolioSummary
      :summary="computedSummary"
      :account-summary="accountSummary"
      :stale="staleInfo"
    />

    <section class="table-section">
      <p v-if="loading" class="state-message">Loading lots...</p>
      <p v-else-if="errorMessage" class="state-message error">
        {{ errorMessage }}
        <button type="button" @click="loadLots">Retry</button>
      </p>
      <p v-else-if="!visibleLots.length" class="state-message">
        No positions found. If this seems wrong, try reloading or updating filters.
      </p>
      <PositionsTable
        v-else
        :lots="visibleLots"
        :sort-key="sortKey"
        :sort-direction="sortDirection"
        @sort-change="onSortChange"
      />
    </section>
  </section>
</template>

<style scoped>
.dashboard {
  display: grid;
  gap: 1rem;
}

.hero {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: center;
  border: 1px solid var(--border-soft);
  border-radius: 16px;
  padding: 1rem;
  background: linear-gradient(135deg, rgba(10, 41, 55, 0.95), rgba(29, 86, 109, 0.85));
  color: #f2f6f7;
}

.eyebrow {
  margin: 0 0 0.3rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.72rem;
  opacity: 0.85;
}

h1 {
  margin: 0;
  font-size: clamp(1.6rem, 3vw, 2.4rem);
  font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
  line-height: 1;
}

.subtitle {
  margin: 0.45rem 0 0;
  color: #d8e8ed;
  max-width: 65ch;
  font-size: 0.9rem;
}

.controls {
  border: 1px solid var(--border-soft);
  border-radius: 16px;
  padding: 0.9rem;
  background: rgba(252, 255, 255, 0.88);
  display: grid;
  gap: 0.8rem;
}

.symbol-search {
  display: grid;
  gap: 0.25rem;
  max-width: 320px;
  font-size: 0.79rem;
  color: var(--text-muted);
}

.symbol-search input {
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  padding: 0.5rem 0.64rem;
  font-size: 0.85rem;
}

.table-section {
  display: grid;
  gap: 0.55rem;
}

.state-message {
  border: 1px dashed var(--border-strong);
  background: rgba(250, 253, 253, 0.88);
  border-radius: 12px;
  padding: 0.9rem;
  color: var(--text-main);
  font-size: 0.85rem;
}

.state-message.error {
  border-color: #be5a5a;
  color: #7b1f1f;
}

.state-message button {
  margin-left: 0.5rem;
  border: 0;
  border-radius: 8px;
  background: var(--accent-deep);
  color: #ffffff;
  padding: 0.35rem 0.6rem;
  cursor: pointer;
}
</style>
