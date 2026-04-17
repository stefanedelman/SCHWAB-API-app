<script setup>
import { formatCurrency, formatPercent, formatSignedCurrency } from '../utils/format';

defineProps({
  summary: {
    type: Object,
    required: true,
  },
  accountSummary: {
    type: Object,
    default: null,
  },
  stale: {
    type: Object,
    required: true,
  },
});
</script>

<template>
  <section class="summary-grid">
    <article class="tile">
      <h3>Total Value</h3>
      <p>{{ formatCurrency(summary.totalMarketValue) }}</p>
    </article>
    <article class="tile">
      <h3>Cost Basis</h3>
      <p>{{ formatCurrency(summary.totalCostBasis) }}</p>
    </article>
    <article class="tile" :class="summary.totalGainLoss >= 0 ? 'positive' : 'negative'">
      <h3>Gain/Loss</h3>
      <p>
        {{ formatSignedCurrency(summary.totalGainLoss) }}
        <small>{{ formatPercent(summary.totalGainLossPct) }}</small>
      </p>
    </article>
    <article class="tile" :class="summary.totalDayChange >= 0 ? 'positive' : 'negative'">
      <h3>Day Change</h3>
      <p>
        {{ formatSignedCurrency(summary.totalDayChange) }}
        <small>{{ formatPercent(summary.totalDayChangePct) }}</small>
      </p>
    </article>
    <article class="tile compact">
      <h3>Lots</h3>
      <p>{{ summary.lotsDisplayed }} / {{ summary.lotsTotal }}</p>
    </article>
    <article v-if="accountSummary" class="tile compact">
      <h3>Cash</h3>
      <p>{{ formatCurrency(accountSummary.cashBalance) }}</p>
    </article>
  </section>

  <p v-if="stale.stale" class="stale-text">
    Showing cached data from {{ stale.cachedAt }}.
  </p>
</template>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 0.75rem;
}

.tile {
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(247, 251, 252, 0.92));
  padding: 0.85rem;
}

.tile h3 {
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--text-muted);
  margin: 0 0 0.35rem;
}

.tile p {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-main);
}

small {
  margin-left: 0.35rem;
  font-size: 0.82rem;
  font-weight: 600;
}

.positive p {
  color: #1f5c3a;
}

.negative p {
  color: #8f2f2f;
}

.compact p {
  font-size: 0.95rem;
}

.stale-text {
  margin-top: 0.55rem;
  color: #7d4f0f;
  font-size: 0.8rem;
}
</style>
