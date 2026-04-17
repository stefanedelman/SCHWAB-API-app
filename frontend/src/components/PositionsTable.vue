<script setup>
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

function sortArrow(columnKey) {
  if (props.sortKey !== columnKey) {
    return '';
  }

  return props.sortDirection === 'asc' ? '↑' : '↓';
}
</script>

<template>
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
        <tr v-for="lot in lots" :key="lot.id">
          <td class="symbol">{{ lot.symbol }}</td>
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
</template>

<style scoped>
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

.symbol {
  font-weight: 700;
  letter-spacing: 0.04em;
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
