<script setup>
import { ref } from 'vue';

defineProps({
  authStatus: {
    type: Object,
    default: null,
  },
});

const callbackUrl = ref('');
const completeLoading = ref(false);
const completeError = ref('');
const logoutLoading = ref(false);
const logoutError = ref('');
const AUTH_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.PROD ? '/backend' : '');
const authLoginHref = `${AUTH_BASE}/auth/login`;

async function completeOauth() {
  if (!callbackUrl.value.trim()) {
    completeError.value = 'Paste the full Schwab redirect URL first.';
    return;
  }

  completeLoading.value = true;
  completeError.value = '';

  try {
    const response = await fetch(`${AUTH_BASE}/auth/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ callbackUrl: callbackUrl.value.trim() }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || 'Failed to complete OAuth login.');
    }

    window.location.reload();
  } catch (error) {
    completeError.value = error.message || 'Failed to complete OAuth login.';
  } finally {
    completeLoading.value = false;
  }
}

async function logout() {
  logoutLoading.value = true;
  logoutError.value = '';

  try {
    const response = await fetch(`${AUTH_BASE}/auth/logout`, {
      method: 'POST',
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.message || payload?.error || 'Failed to log out.');
    }

    window.location.reload();
  } catch (error) {
    logoutError.value = error.message || 'Failed to log out.';
  } finally {
    logoutLoading.value = false;
  }
}
</script>

<template>
  <div v-if="authStatus" class="auth-banner" :class="{
    warning: authStatus.warning,
    danger: !authStatus.authenticated,
  }">
    <div class="auth-content">
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

      <a
        v-if="!authStatus.authenticated && authStatus.mode !== 'mock'"
        :href="authLoginHref"
        class="auth-action"
      >
        Login with Schwab
      </a>

      <button
        v-if="authStatus.authenticated && authStatus.mode !== 'mock'"
        type="button"
        class="auth-action logout-action"
        :disabled="logoutLoading"
        @click="logout"
      >
        {{ logoutLoading ? 'Logging Out...' : 'Logout' }}
      </button>

      <p v-if="logoutError" class="auth-error">{{ logoutError }}</p>

      <div v-if="!authStatus.authenticated && authStatus.mode !== 'mock'" class="complete-shell">
        <label class="complete-label" for="callback-url">
          If auto-login does not complete, paste the full redirected URL here:
        </label>
        <div class="complete-row">
          <input
            id="callback-url"
            v-model="callbackUrl"
            class="complete-input"
            type="text"
            placeholder="https://your-domain/.../?code=..."
          >
          <button
            type="button"
            class="complete-btn"
            :disabled="completeLoading"
            @click="completeOauth"
          >
            {{ completeLoading ? 'Finishing...' : 'Complete Login' }}
          </button>
        </div>
        <p v-if="completeError" class="complete-error">{{ completeError }}</p>
      </div>
    </div>
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

.auth-content {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 0.55rem;
}

.auth-action {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(20, 90, 114, 0.4);
  background: #ffffff;
  color: #145a72;
  text-decoration: none;
  border-radius: 8px;
  padding: 0.35rem 0.6rem;
  font-size: 0.78rem;
  font-weight: 600;
}

.auth-action:hover {
  background: rgba(20, 90, 114, 0.08);
}

.auth-action:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.logout-action {
  border-color: rgba(122, 36, 36, 0.45);
  color: #7b1f1f;
}

.logout-action:hover {
  background: rgba(123, 31, 31, 0.08);
}

.auth-error {
  width: 100%;
  margin: 0;
  font-size: 0.76rem;
  color: #7b1f1f;
}

.complete-shell {
  width: 100%;
  display: grid;
  gap: 0.35rem;
}

.complete-label {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.complete-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.complete-input {
  flex: 1;
  min-width: 260px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  padding: 0.4rem 0.55rem;
  font-size: 0.8rem;
}

.complete-btn {
  border: 0;
  border-radius: 8px;
  background: var(--accent-bright);
  color: #ffffff;
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  font-size: 0.78rem;
}

.complete-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.complete-error {
  margin: 0;
  font-size: 0.76rem;
  color: #7b1f1f;
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
