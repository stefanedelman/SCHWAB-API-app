<script setup>
const props = defineProps({
  authStatus: {
    type: Object,
    default: null,
  },
});
</script>

<template>
  <div v-if="authStatus" class="auth-banner" :class="{
    warning: authStatus.warning,
    danger: !authStatus.authenticated,
  }">
    <span v-if="!authStatus.authenticated">
      Authentication required. Complete the OAuth login flow to fetch live Schwab data.
    </span>
    <span v-else-if="authStatus.warning">
      {{ authStatus.warning }}
    </span>
    <span v-else-if="authStatus.mode === 'mock'">
      Mock mode active. Data is currently served from local files.
    </span>
    <span v-else>
      Authenticated.
    </span>
  </div>
</template>

<style scoped>
.auth-banner {
  border: 1px solid var(--border-strong);
  background: rgba(243, 247, 247, 0.9);
  color: var(--text-main);
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  font-size: 0.86rem;
}

.auth-banner.warning {
  border-color: #d38b2c;
  background: rgba(255, 242, 213, 0.92);
  color: #7d4f0f;
}

.auth-banner.danger {
  border-color: #c24949;
  background: rgba(255, 226, 226, 0.92);
  color: #7b1f1f;
}
</style>
