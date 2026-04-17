<script setup>
const props = defineProps({
  selectedPreset: {
    type: String,
    required: true,
  },
  customFrom: {
    type: String,
    default: '',
  },
  customTo: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['preset-change', 'custom-change', 'apply-custom']);

const presets = [
  { value: 'ALL', label: 'All' },
  { value: 'LAST_7', label: 'Last 7 Days' },
  { value: 'LAST_30', label: 'Last 30 Days' },
  { value: 'LAST_90', label: 'Last 90 Days' },
  { value: 'YTD', label: 'YTD' },
  { value: 'CUSTOM', label: 'Custom' },
];

function updateCustom(field, value) {
  emit('custom-change', { field, value });
}
</script>

<template>
  <div class="filter-shell">
    <div class="preset-row">
      <button
        v-for="preset in presets"
        :key="preset.value"
        type="button"
        class="preset-btn"
        :class="{ active: selectedPreset === preset.value }"
        @click="emit('preset-change', preset.value)"
      >
        {{ preset.label }}
      </button>
    </div>

    <div v-if="selectedPreset === 'CUSTOM'" class="custom-row">
      <label>
        From
        <input
          type="date"
          :value="customFrom"
          @input="updateCustom('from', $event.target.value)"
        >
      </label>
      <label>
        To
        <input
          type="date"
          :value="customTo"
          @input="updateCustom('to', $event.target.value)"
        >
      </label>
      <button type="button" class="apply-btn" @click="emit('apply-custom')">
        Apply
      </button>
    </div>
  </div>
</template>

<style scoped>
.filter-shell {
  display: grid;
  gap: 0.7rem;
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.preset-btn {
  border: 1px solid var(--border-strong);
  background: #ffffff;
  color: var(--text-main);
  border-radius: 999px;
  padding: 0.42rem 0.82rem;
  font-size: 0.8rem;
  cursor: pointer;
}

.preset-btn.active {
  background: var(--accent-deep);
  border-color: var(--accent-deep);
  color: #ffffff;
}

.custom-row {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.6rem;
}

label {
  display: grid;
  gap: 0.2rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}

input {
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  padding: 0.4rem 0.5rem;
  font-size: 0.82rem;
}

.apply-btn {
  border: 0;
  background: var(--accent-bright);
  color: #ffffff;
  border-radius: 8px;
  padding: 0.46rem 0.82rem;
  cursor: pointer;
  font-size: 0.82rem;
}
</style>
