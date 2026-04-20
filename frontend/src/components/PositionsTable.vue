<script setup>
import { computed, ref, watch } from 'vue';

import {
  formatCurrency,
  formatDate,
  formatPercent,
  formatQuantity,
  formatSignedCurrency,
} from '../utils/format';

const props = defineProps({
  lots: {
    type: Array,
    required: true,
  },
  sortKey: {
    type: String,
    required: true,
  },
  sortDirection: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['sort-change']);

const columns = [
  { key: 'symbol', label: 'Symbol' },
  { key: 'description', label: 'Description' },
  { key: 'purchaseDate', label: 'Purchase Date' },
  { key: 'quantity', label: 'Qty' },
  { key: 'costPerShare', label: 'Cost/Share' },
  { key: 'costBasis', label: 'Cost Basis' },
  { key: 'currentPrice', label: 'Price' },
  { key: 'marketValue', label: 'Mkt Value' },
  { key: 'dayChange', label: 'Day Chg' },
  { key: 'totalGainLoss', label: 'Gain/Loss' },
];

const expandedSymbols = ref(new Set());

const groupedLots = computed(() => {
  const bySymbol = new Map();

  props.lots.forEach((lot) => {
    const symbol = String(lot.symbol || '').toUpperCase();
    const quantity = Number(lot.quantity || 0);
    const costBasis = Number(lot.costBasis || 0);
    const marketValue = Number(lot.marketValue || 0);
    const totalGainLoss = Number(lot.totalGainLoss || 0);
    const dayChange = Number(lot.dayChange || 0);

    if (!bySymbol.has(symbol)) {
      bySymbol.set(symbol, {
        symbol,
        description: lot.description || symbol,
        lots: [],
        quantityTotal: 0,
        costBasisTotal: 0,
        marketValueTotal: 0,
        totalGainLossTotal: 0,
        dayChangeTotal: 0,
        weightedPriceTotal: 0,
      });
    }

    const group = bySymbol.get(symbol);
    group.lots.push(lot);
    group.quantityTotal += quantity;
    group.costBasisTotal += costBasis;
    group.marketValueTotal += marketValue;
    group.totalGainLossTotal += totalGainLoss;
    group.dayChangeTotal += dayChange * quantity;
    group.weightedPriceTotal += Number(lot.currentPrice || 0) * quantity;
  });

  return Array.from(bySymbol.values()).map((group) => {
    const previousMarketValue = group.marketValueTotal - group.dayChangeTotal;

    return {
      ...group,
      currentPriceAvg: group.quantityTotal ? group.weightedPriceTotal / group.quantityTotal : 0,
      costPerShareAvg: group.quantityTotal ? group.costBasisTotal / group.quantityTotal : 0,
      totalGainLossPct: group.costBasisTotal
        ? (group.totalGainLossTotal / group.costBasisTotal) * 100
        : 0,
      dayChangePct: previousMarketValue
        ? (group.dayChangeTotal / previousMarketValue) * 100
        : 0,
    };
  });
});

const allSymbols = computed(() => groupedLots.value.map((group) => group.symbol));

const allExpanded = computed(() => {
  return allSymbols.value.length > 0
    && allSymbols.value.every((symbol) => expandedSymbols.value.has(symbol));
});

function isSymbolExpanded(symbol) {
  return expandedSymbols.value.has(symbol);
}

function toggleSymbol(symbol) {
  const next = new Set(expandedSymbols.value);

  if (next.has(symbol)) {
    next.delete(symbol);
  } else {
    next.add(symbol);
  }

  expandedSymbols.value = next;
}

function toggleAll() {
  if (allExpanded.value) {
    expandedSymbols.value = new Set();
    return;
  }

  expandedSymbols.value = new Set(allSymbols.value);
}

watch(
  allSymbols,
  (symbols) => {
    const next = new Set();
    symbols.forEach((symbol) => {
      if (expandedSymbols.value.has(symbol)) {
        next.add(symbol);
      }
    });
    expandedSymbols.value = next;
  },
  { immediate: true },
);

function sortArrow(columnKey) {
  if (props.sortKey !== columnKey) {
    return '';
  }

  return props.sortDirection === 'asc' ? '↑' : '↓';
}
</script>

<template>
  <div class="table-controls">
    <button type="button" class="expand-all-btn" @click="toggleAll">
      {{ allExpanded ? 'Collapse All' : 'Expand All' }}
    </button>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            @click="emit('sort-change', column.key)"
          >
            {{ column.label }} {{ sortArrow(column.key) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="group in groupedLots" :key="group.symbol">
          <tr class="group-row" @click="toggleSymbol(group.symbol)">
            <td class="symbol group-symbol">
              <span class="expand-indicator" :class="{ expanded: isSymbolExpanded(group.symbol) }">▸</span>
              {{ group.symbol }}
            </td>
            <td class="description" :title="group.description">{{ group.description }}</td>
            <td>{{ group.lots.length === 1 ? formatDate(group.lots[0].purchaseDateKnown ? group.lots[0].purchaseDate : null) : `${group.lots.length} lots` }}</td>
            <td>{{ formatQuantity(group.quantityTotal) }}</td>
            <td>{{ formatCurrency(group.costPerShareAvg) }}</td>
            <td>{{ formatCurrency(group.costBasisTotal) }}</td>
            <td>{{ formatCurrency(group.currentPriceAvg) }}</td>
            <td>{{ formatCurrency(group.marketValueTotal) }}</td>
            <td :class="group.dayChangeTotal > 0 ? 'positive' : group.dayChangeTotal < 0 ? 'negative' : 'neutral'">
              {{ formatSignedCurrency(group.dayChangeTotal) }}
              <span>{{ formatPercent(group.dayChangePct) }}</span>
            </td>
            <td :class="group.totalGainLossTotal > 0 ? 'positive' : group.totalGainLossTotal < 0 ? 'negative' : 'neutral'">
              {{ formatSignedCurrency(group.totalGainLossTotal) }}
              <span>{{ formatPercent(group.totalGainLossPct) }}</span>
            </td>
          </tr>

          <tr class="detail-row">
            <td :colspan="columns.length" class="detail-cell">
              <div
                class="detail-container"
                :class="{ expanded: isSymbolExpanded(group.symbol) }"
                :style="{ '--expanded-height': `${Math.max(group.lots.length, 1) * 48}px` }"
              >
                <table class="detail-table">
                  <tbody>
                    <tr v-for="lot in group.lots" :key="lot.id" class="lot-row">
                      <td class="symbol lot-symbol">{{ lot.symbol }}</td>
                      <td class="description" :title="lot.description">{{ lot.description }}</td>
                      <td>{{ formatDate(lot.purchaseDateKnown ? lot.purchaseDate : null) }}</td>
                      <td>{{ formatQuantity(lot.quantity) }}</td>
                      <td>{{ formatCurrency(lot.costPerShare) }}</td>
                      <td>{{ formatCurrency(lot.costBasis) }}</td>
                      <td>{{ formatCurrency(lot.currentPrice) }}</td>
                      <td>{{ formatCurrency(lot.marketValue) }}</td>
                      <td :class="lot.dayChange > 0 ? 'positive' : lot.dayChange < 0 ? 'negative' : 'neutral'">
                        {{ formatSignedCurrency(lot.dayChange) }}
                        <span>{{ formatPercent(lot.dayChangePct) }}</span>
                      </td>
                      <td :class="lot.totalGainLoss > 0 ? 'positive' : lot.totalGainLoss < 0 ? 'negative' : 'neutral'">
                        {{ formatSignedCurrency(lot.totalGainLoss) }}
                        <span>{{ formatPercent(lot.totalGainLossPct) }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-controls {
  margin-bottom: 0.45rem;
}

.expand-all-btn {
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: #ffffff;
  color: var(--text-main);
  padding: 0.35rem 0.6rem;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.table-wrap {
  overflow: auto;
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 980px;
}

thead th {
  background: #edf2f5;
  color: var(--text-main);
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  padding: 0.7rem 0.75rem;
  position: sticky;
  top: 0;
  cursor: pointer;
}

tbody td {
  padding: 0.65rem 0.75rem;
  border-top: 1px solid #e5ebee;
  font-size: 0.85rem;
  vertical-align: top;
}

tbody tr:hover {
  background: rgba(232, 242, 247, 0.55);
}

.group-row {
  background: rgba(237, 242, 245, 0.85);
  cursor: pointer;
}

.group-row td {
  font-weight: 600;
}

.lot-row {
  background: rgba(255, 255, 255, 0.95);
}

.detail-row:hover {
  background: transparent;
}

.detail-cell {
  padding: 0;
  border-top: 0;
}

.detail-container {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.24s ease;
}

.detail-container.expanded {
  max-height: var(--expanded-height);
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.detail-table td {
  padding: 0.65rem 0.75rem;
  border-top: 1px solid #e5ebee;
  font-size: 0.85rem;
  vertical-align: top;
}

.symbol {
  font-weight: 700;
  letter-spacing: 0.04em;
}

.group-symbol {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.expand-indicator {
  width: 0.75rem;
  display: inline-flex;
  justify-content: center;
  transition: transform 0.2s ease;
}

.expand-indicator.expanded {
  transform: rotate(90deg);
}

.lot-symbol {
  padding-left: 1.7rem;
}

.description {
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.positive {
  color: #1f5c3a;
  font-weight: 600;
}

.negative {
  color: #8f2f2f;
  font-weight: 600;
}

.neutral {
  color: #425262;
}

td span {
  margin-left: 0.22rem;
  font-size: 0.77rem;
  opacity: 0.9;
}
</style>
