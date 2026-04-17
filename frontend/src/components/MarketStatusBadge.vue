<script setup>
defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
});
</script>

<template>
  <span class="status-badge" :class="isOpen ? 'open' : 'closed'">
    {{ isOpen ? 'Market Open' : 'Market Closed' }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-radius: 999px;
  padding: 0.4rem 0.8rem;
  border: 1px solid transparent;
}

.open {
  background: rgba(41, 133, 84, 0.15);
  color: #1f5c3a;
  border-color: rgba(41, 133, 84, 0.35);
}

.closed {
  background: rgba(102, 112, 122, 0.14);
  color: #37424f;
  border-color: rgba(102, 112, 122, 0.35);
}
</style>
