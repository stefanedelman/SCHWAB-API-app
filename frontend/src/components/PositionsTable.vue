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

const COLUMN_STORAGE_KEY = 'schwab-dashboard-columns-v1';

const baseColumns = [
  { key: 'symbol', label: 'Symbol', locked: true },
  { key: 'description', label: 'Description' },
  { key: 'purchaseDate', label: 'Most Recent Purchase' },
  { key: 'quantity', label: 'Qty' },
  { key: 'costPerShare', label: ' --Cost/Share-- (bought for)' },
  { key: 'costBasis', label: 'Cost Basis' },
  { key: 'currentPrice', label: '-- Price --  (worth now)'},
  { key: 'priceChange', label: 'Price Chng' },
  { key: 'marketValue', label: 'Mkt Value' },
  { key: 'dayChange', label: 'Day Chg' },
  { key: 'totalGainLoss', label: 'Gain/Loss' },
];

const columnsByKey = Object.fromEntries(baseColumns.map((column) => [column.key, column]));

const orderedColumnKeys = ref(baseColumns.map((column) => column.key));
const hiddenColumnKeys = ref([]);
const showColumnManager = ref(false);
const expandedSymbols = ref(new Set());

function normalizeColumnConfig(rawConfig) {
  const knownKeys = new Set(baseColumns.map((column) => column.key));
  const defaultOrder = baseColumns.map((column) => column.key);

  const order = Array.isArray(rawConfig?.order)
    ? rawConfig.order.filter((key, index, array) => knownKeys.has(key) && array.indexOf(key) === index)
    : [];

  defaultOrder.forEach((key) => {
    if (!order.includes(key)) {
      order.push(key);
    }
  });

  const hidden = Array.isArray(rawConfig?.hidden)
    ? rawConfig.hidden.filter((key, index, array) => knownKeys.has(key) && array.indexOf(key) === index)
    : [];

  const lockedKeys = baseColumns.filter((column) => column.locked).map((column) => column.key);
  const hiddenWithoutLocked = hidden.filter((key) => !lockedKeys.includes(key));

  return {
    order,
    hidden: hiddenWithoutLocked,
  };
}

function restoreColumnState() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const raw = window.localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    const normalized = normalizeColumnConfig(parsed);
    orderedColumnKeys.value = normalized.order;
    hiddenColumnKeys.value = normalized.hidden;
  } catch {
    // Ignore malformed localStorage data.
  }
}

function persistColumnState() {
  if (typeof window === 'undefined') {
    return;
  }

  const payload = {
    order: orderedColumnKeys.value,
    hidden: hiddenColumnKeys.value,
  };

  window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(payload));
}

restoreColumnState();

watch([orderedColumnKeys, hiddenColumnKeys], () => {
  persistColumnState();
}, { deep: true });

const orderedColumns = computed(() => {
  return orderedColumnKeys.value
    .map((key) => columnsByKey[key])
    .filter(Boolean);
});

const visibleColumns = computed(() => {
  const hiddenSet = new Set(hiddenColumnKeys.value);
  const visible = orderedColumns.value.filter((column) => !hiddenSet.has(column.key));

  if (!visible.length) {
    return [columnsByKey.symbol];
  }

  return visible;
});

function isColumnHidden(key) {
  return hiddenColumnKeys.value.includes(key);
}

function toggleColumnVisibility(key) {
  const column = columnsByKey[key];
  if (!column || column.locked) {
    return;
  }

  if (isColumnHidden(key)) {
    hiddenColumnKeys.value = hiddenColumnKeys.value.filter((value) => value !== key);
    return;
  }

  const visibleCount = orderedColumns.value.filter((current) => !isColumnHidden(current.key)).length;
  if (visibleCount <= 1) {
    return;
  }

  hiddenColumnKeys.value = [...hiddenColumnKeys.value, key];
}

function moveColumn(key, direction) {
  const currentOrder = [...orderedColumnKeys.value];
  const index = currentOrder.indexOf(key);
  if (index < 0) {
    return;
  }

  const target = direction === 'left' ? index - 1 : index + 1;
  if (target < 0 || target >= currentOrder.length) {
    return;
  }

  [currentOrder[index], currentOrder[target]] = [currentOrder[target], currentOrder[index]];
  orderedColumnKeys.value = currentOrder;
}

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
      mostRecentPurchaseDate: group.lots
        .filter((lot) => lot.purchaseDateKnown && lot.purchaseDate)
        .map((lot) => new Date(lot.purchaseDate).getTime())
        .filter((value) => Number.isFinite(value))
        .reduce((max, current) => Math.max(max, current), Number.NEGATIVE_INFINITY),
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

function lotPriceChangeDollar(lot) {
  const quantity = Number(lot.quantity || 0);
  if (!quantity) {
    return 0;
  }

  return Number(lot.totalGainLoss || 0) / quantity;
}

function lotPriceChangePct(lot) {
  return Number(lot.totalGainLossPct || 0);
}

function groupPriceChangeDollar(group) {
  if (!group.quantityTotal) {
    return 0;
  }

  return Number(group.totalGainLossTotal || 0) / Number(group.quantityTotal || 0);
}

function groupPriceChangePct(group) {
  return Number(group.totalGainLossPct || 0);
}

function toneClass(value) {
  if (value > 0) {
    return 'positive';
  }

  if (value < 0) {
    return 'negative';
  }

  return 'neutral';
}

function groupCellClass(group, columnKey) {
  if (columnKey === 'symbol') {
    return 'symbol group-symbol';
  }

  if (columnKey === 'description') {
    return 'description';
  }

  if (columnKey === 'priceChange') {
    return toneClass(groupPriceChangeDollar(group));
  }

  if (columnKey === 'dayChange') {
    return toneClass(group.dayChangeTotal);
  }

  if (columnKey === 'totalGainLoss') {
    return toneClass(group.totalGainLossTotal);
  }

  return '';
}

function lotCellClass(lot, columnKey) {
  if (columnKey === 'symbol') {
    return 'symbol lot-symbol';
  }

  if (columnKey === 'description') {
    return 'description';
  }

  if (columnKey === 'priceChange') {
    return toneClass(lotPriceChangeDollar(lot));
  }

  if (columnKey === 'dayChange') {
    return toneClass(Number(lot.dayChange || 0));
  }

  if (columnKey === 'totalGainLoss') {
    return toneClass(Number(lot.totalGainLoss || 0));
  }

  return '';
}

function groupPrimaryValue(group, columnKey) {
  if (columnKey === 'description') {
    return group.description;
  }

  if (columnKey === 'purchaseDate') {
    return formatDate(Number.isFinite(group.mostRecentPurchaseDate) ? group.mostRecentPurchaseDate : null);
  }

  if (columnKey === 'quantity') {
    return formatQuantity(group.quantityTotal);
  }

  if (columnKey === 'costPerShare') {
    return formatCurrency(group.costPerShareAvg);
  }

  if (columnKey === 'costBasis') {
    return formatCurrency(group.costBasisTotal);
  }

  if (columnKey === 'currentPrice') {
    return formatCurrency(group.currentPriceAvg);
  }

  if (columnKey === 'priceChange') {
    return formatSignedCurrency(groupPriceChangeDollar(group));
  }

  if (columnKey === 'marketValue') {
    return formatCurrency(group.marketValueTotal);
  }

  if (columnKey === 'dayChange') {
    return formatSignedCurrency(group.dayChangeTotal);
  }

  if (columnKey === 'totalGainLoss') {
    return formatSignedCurrency(group.totalGainLossTotal);
  }

  return '';
}

function groupSecondaryValue(group, columnKey) {
  if (columnKey === 'priceChange') {
    return formatPercent(groupPriceChangePct(group));
  }

  if (columnKey === 'dayChange') {
    return formatPercent(group.dayChangePct);
  }

  if (columnKey === 'totalGainLoss') {
    return formatPercent(group.totalGainLossPct);
  }

  return '';
}

function lotPrimaryValue(lot, columnKey) {
  if (columnKey === 'description') {
    return lot.description;
  }

  if (columnKey === 'purchaseDate') {
    return formatDate(lot.purchaseDateKnown ? lot.purchaseDate : null);
  }

  if (columnKey === 'quantity') {
    return formatQuantity(lot.quantity);
  }

  if (columnKey === 'costPerShare') {
    return formatCurrency(lot.costPerShare);
  }

  if (columnKey === 'costBasis') {
    return formatCurrency(lot.costBasis);
  }

  if (columnKey === 'currentPrice') {
    return formatCurrency(lot.currentPrice);
  }

  if (columnKey === 'priceChange') {
    return formatSignedCurrency(lotPriceChangeDollar(lot));
  }

  if (columnKey === 'marketValue') {
    return formatCurrency(lot.marketValue);
  }

  if (columnKey === 'dayChange') {
    return formatSignedCurrency(lot.dayChange);
  }

  if (columnKey === 'totalGainLoss') {
    return formatSignedCurrency(lot.totalGainLoss);
  }

  return '';
}

function lotSecondaryValue(lot, columnKey) {
  if (columnKey === 'priceChange') {
    return formatPercent(lotPriceChangePct(lot));
  }

  if (columnKey === 'dayChange') {
    return formatPercent(lot.dayChangePct);
  }

  if (columnKey === 'totalGainLoss') {
    return formatPercent(lot.totalGainLossPct);
  }

  return '';
}
</script>

<template>
  <div class="table-controls">
    <button type="button" class="expand-all-btn" @click="toggleAll">
      {{ allExpanded ? 'Collapse All' : 'Expand All' }}
    </button>
    <button type="button" class="columns-btn" @click="showColumnManager = !showColumnManager">
      Columns
    </button>
  </div>

  <div v-if="showColumnManager" class="column-manager">
    <div v-for="(column, index) in orderedColumns" :key="column.key" class="column-item">
      <label>
        <input
          :checked="!isColumnHidden(column.key)"
          :disabled="column.locked"
          type="checkbox"
          @change="toggleColumnVisibility(column.key)"
        >
        {{ column.label }}
      </label>
      <div class="column-actions">
        <button
          type="button"
          class="column-move-btn"
          :disabled="index === 0"
          @click="moveColumn(column.key, 'left')"
        >
          ←
        </button>
        <button
          type="button"
          class="column-move-btn"
          :disabled="index === orderedColumns.length - 1"
          @click="moveColumn(column.key, 'right')"
        >
          →
        </button>
      </div>
    </div>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th
            v-for="column in visibleColumns"
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
            <td
              v-for="column in visibleColumns"
              :key="`group-${group.symbol}-${column.key}`"
              :class="groupCellClass(group, column.key)"
              :title="column.key === 'description' ? group.description : ''"
            >
              <template v-if="column.key === 'symbol'">
                <span class="expand-indicator" :class="{ expanded: isSymbolExpanded(group.symbol) }">▸</span>
                {{ group.symbol }}
              </template>
              <template v-else>
                {{ groupPrimaryValue(group, column.key) }}
                <span v-if="groupSecondaryValue(group, column.key)">{{ groupSecondaryValue(group, column.key) }}</span>
              </template>
            </td>
          </tr>

          <tr class="detail-row">
            <td :colspan="visibleColumns.length" class="detail-cell">
              <div
                class="detail-container"
                :class="{ expanded: isSymbolExpanded(group.symbol) }"
                :style="{ '--expanded-height': `${Math.max(group.lots.length, 1) * 48}px` }"
              >
                <table class="detail-table">
                  <tbody>
                    <tr v-for="lot in group.lots" :key="lot.id" class="lot-row">
                      <td
                        v-for="column in visibleColumns"
                        :key="`lot-${lot.id}-${column.key}`"
                        :class="lotCellClass(lot, column.key)"
                        :title="column.key === 'description' ? lot.description : ''"
                      >
                        <template v-if="column.key === 'symbol'">
                          {{ lot.symbol }}
                        </template>
                        <template v-else>
                          {{ lotPrimaryValue(lot, column.key) }}
                          <span v-if="lotSecondaryValue(lot, column.key)">{{ lotSecondaryValue(lot, column.key) }}</span>
                        </template>
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
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.expand-all-btn,
.columns-btn,
.column-move-btn {
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: #ffffff;
  color: var(--text-main);
  padding: 0.35rem 0.6rem;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.column-move-btn {
  padding: 0.2rem 0.45rem;
}

.expand-all-btn:disabled,
.columns-btn:disabled,
.column-move-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.column-manager {
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.96);
  padding: 0.55rem;
  margin-bottom: 0.55rem;
  display: grid;
  gap: 0.4rem;
}

.column-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.column-item label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  color: var(--text-main);
}

.column-actions {
  display: inline-flex;
  gap: 0.3rem;
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
  text-align: center;
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
  text-align: center;
}

.symbol {
  font-weight: 700;
  letter-spacing: 0.04em;
}

.group-symbol {
  display: flex;
  align-items: center;
  justify-content: center;
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
  padding-left: 0;
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
