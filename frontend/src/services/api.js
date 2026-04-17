const API_BASE = import.meta.env.VITE_API_BASE || '';

async function fetchJson(path) {
  const response = await fetch(`${API_BASE}${path}`);

  if (!response.ok) {
    let details = '';
    try {
      const payload = await response.json();
      details = payload?.message || payload?.error || '';
    } catch {
      details = '';
    }

    throw new Error(details || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export async function fetchLots({ from, to } = {}) {
  const params = new URLSearchParams();

  if (from) {
    params.set('from', from);
  }

  if (to) {
    params.set('to', to);
  }

  const query = params.toString();
  return fetchJson(`/api/lots${query ? `?${query}` : ''}`);
}

export async function fetchQuotes(symbols = []) {
  const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
  const query = uniqueSymbols.length
    ? `?symbols=${encodeURIComponent(uniqueSymbols.join(','))}`
    : '';

  return fetchJson(`/api/quotes${query}`);
}

export async function fetchAccountSummary() {
  return fetchJson('/api/account/summary');
}

export async function fetchAuthStatus() {
  return fetchJson('/auth/status');
}
