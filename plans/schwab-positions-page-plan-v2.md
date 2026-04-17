# Schwab Lot-Level Positions Dashboard — Execution Plan v2

## Project Summary

Build a **view-only** positions dashboard that mirrors Schwab's positions page but displays every tax lot as its own row, with time-based filtering (e.g. "show only lots purchased in the last 30 days"). No trading, no order placement, no sell-side logic.

**Stack:** Vue 3 frontend, Node.js/Express backend, Schwab Trader API (read-only usage).

## Current Implementation Status (as of 2026-04-17)

- [x] Phase 0B complete: mock data files and mock mode contract are implemented.
- [x] Phase 0C complete: schema validation is implemented and used before merge logic.
- [~] Phase 0A in progress: developer portal registration/approval is manual and still pending.
- [~] Phase 2 in progress: lot merge, filtering, and API routes are implemented in mock mode; live Schwab fetch/pagination/cache/retry are still pending.
- [~] Phase 3 in progress: dashboard UI, filters, sorting, and polling are implemented; composable/type architecture refactor is still pending.
- [ ] Phase 1 not started: OAuth login/callback/logout and token lifecycle are not implemented yet.
- [ ] Phase 4 not started: full polish and edge-case pass is not complete yet.

---

## Scope & Design Decisions (Locked In)

These decisions are finalized to avoid scope creep and design paralysis.

| Decision | Answer | Rationale |
|----------|--------|-----------|
| Buy/sell capability | **No.** View-only. | Eliminates order endpoints, reduces security surface |
| Lot accounting (FIFO/LIFO) | **Not applicable.** | We display every BUY as its own row. No simulated sells. |
| Single vs multi-account | **Single account for v1.** | One account hash. Multi-account is a future dropdown. |
| Lots older than transaction window | **Show with "Unknown" purchase date.** | Position data still has cost basis and market value. Never hide data. |
| Timezone for date filters | **Local browser timezone.** | Single user, personal tool. |
| Token storage | **Local token file** (`token.json`, gitignored). | Single-user local dev. Permission hardening is a deployment concern. |
| Quote updates | **Polling first** (30-second interval). | WebSocket streaming deferred to v2. Not worth the complexity for a dashboard you check a few times a day. |
| Instrument scope | **Long EQUITY lots only.** | Options, shorts, and complex instruments excluded from v1. ETFs are included (they come through as EQUITY). |
| Gain/loss accuracy | **Close approximation with transparent math.** | `costBasis = price * qty + fees`, `gain = marketValue - costBasis`. Small rounding diffs vs Schwab are acceptable. |

---

## Architecture Overview

```
┌──────────────────────────────┐
│     Vue 3 SPA (Frontend)     │
│  - Lot-level positions table  │
│  - Date range filter          │
│  - Portfolio summary bar      │
│  - 30s quote polling          │
└──────────────┬───────────────┘
               │ REST (JSON)
┌──────────────▼───────────────┐
│    Node/Express (Backend)     │
│  - OAuth 2.0 token mgmt      │
│  - Schwab API proxy (read)    │
│  - Lot enrichment + merge     │
│  - Response schema validation │
│  - Transaction cache layer    │
└──────────────┬───────────────┘
               │ HTTPS
┌──────────────▼───────────────┐
│      Schwab Trader API        │
│  - /accounts/{hash}           │
│  - /transactions (read)       │
│  - /marketdata/quotes (read)  │
└───────────────────────────────┘
```

**Key simplification vs v1 plan:** No WebSocket layer, no order endpoints, no write operations to Schwab.

---

## Phase 0: Schwab Developer Setup + Mock Data Contract [IN PROGRESS]

**Goal:** Get API access approved AND build a mock data layer so frontend/backend can progress independently.

### 0A: Developer Portal Registration [NOT STARTED]

1. **Create a Schwab Developer Portal account** at `developer.schwab.com/register` (separate from brokerage login).
2. **Register an application** under Dashboard > Create App.
   - Select **"Accounts and Trading Production"** (needed for positions/transactions read access) and **"Market Data Production"** (needed for quotes).
   - Set callback URL to `https://127.0.0.1` (Schwab's recommended localhost format).
3. **Wait for approval** (1-3 business days). Status changes from "Approved - Pending" to "Ready to Use".
4. **Save credentials**: App Key (Client ID) and App Secret (Client Secret) from Dashboard > View Details.

**Known gotcha:** Callback URL must match *exactly* in the portal and your code, including trailing slashes. Mismatch produces a silent 401.

### 0B: Mock Data Contract Layer [COMPLETE]

While waiting for Schwab approval, define the exact data shapes and build mock endpoints so frontend and backend can develop in parallel.

**Mock data files to create:**

```
mocks/
├── account.json           # Account balances, buying power
├── positions.json         # Raw positions response (Schwab shape)
├── transactions.json      # Trade history (Schwab shape)
├── quotes.json            # Quote data for held symbols
└── lots-enriched.json     # Final merged lot-level output (our shape)
```

**Schwab positions response shape** (what we expect from `GET /accounts/{hash}?fields=positions`):
```json
{
  "securitiesAccount": {
    "accountNumber": "123456789",
    "currentBalances": {
      "liquidationValue": 52340.50,
      "cashBalance": 1200.00,
      "availableFunds": 1200.00
    },
    "positions": [
      {
        "shortQuantity": 0,
        "averagePrice": 142.50,
        "currentDayProfitLoss": 85.20,
        "currentDayProfitLossPercentage": 0.58,
        "longQuantity": 25,
        "marketValue": 4625.00,
        "instrument": {
          "assetType": "EQUITY",
          "cusip": "037833100",
          "symbol": "AAPL",
          "description": "APPLE INC"
        }
      }
    ]
  }
}
```

**Schwab transaction response shape** (what we expect from `GET /accounts/{hash}/transactions`):
```json
[
  {
    "activityId": 12345678,
    "time": "2026-03-15T14:30:00+0000",
    "type": "TRADE",
    "status": "VALID",
    "tradeDate": "2026-03-14T00:00:00+0000",
    "settlementDate": "2026-03-17T00:00:00+0000",
    "netAmount": -1425.07,
    "transferItems": [
      {
        "instrument": {
          "assetType": "EQUITY",
          "symbol": "AAPL",
          "description": "APPLE INC"
        },
        "amount": 10,
        "cost": 1425.00,
        "price": 142.50,
        "feeType": "COMMISSION",
        "positionEffect": "OPENING"
      }
    ]
  }
]
```

**Our enriched lot shape** (what the backend serves to the frontend):
```json
{
  "lots": [
    {
      "id": "12345678-0",
      "symbol": "AAPL",
      "description": "APPLE INC",
      "purchaseDate": "2026-03-15T14:30:00Z",
      "purchaseDateKnown": true,
      "quantity": 10,
      "costPerShare": 142.50,
      "costBasis": 1425.07,
      "currentPrice": 185.00,
      "marketValue": 1850.00,
      "dayChange": 2.30,
      "dayChangePct": 1.26,
      "totalGainLoss": 424.93,
      "totalGainLossPct": 29.82
    }
  ],
  "summary": {
    "totalMarketValue": 52340.50,
    "totalCostBasis": 41200.00,
    "totalGainLoss": 11140.50,
    "totalGainLossPct": 27.04,
    "totalDayChange": 285.40,
    "totalDayChangePct": 0.55,
    "lotsDisplayed": 12,
    "lotsTotal": 18
  }
}
```

**Backend runs in mock mode** when `SCHWAB_MOCK=true` in `.env`. All `/api/*` routes return data from mock files. Frontend doesn't know the difference.

### 0C: Response Schema Validation [COMPLETE]

Define Zod schemas (or JSON Schema) for every Schwab response shape. Validate on every API call so breaking changes from Schwab fail loudly with a clear error instead of silently corrupting data.

```
src/
└── schemas/
    ├── positions.schema.ts      # Validates Schwab positions response
    ├── transactions.schema.ts   # Validates Schwab transactions response
    ├── quotes.schema.ts         # Validates Schwab quotes response
    └── account.schema.ts        # Validates Schwab account response
```

If validation fails: log the raw response, return a structured error to the frontend, and do not render corrupted data.

### Deliverable

- `.env` file with credentials populated (gitignored).
- Mock data files matching real Schwab response shapes.
- Backend serves mock data via `/api/*` routes.
- Frontend can develop against mock endpoints immediately.
- Zod schemas defined for all Schwab responses.

---

## Phase 1: Backend — OAuth & Token Management [NOT STARTED]

**Goal:** Reliable, auto-refreshing read-only authentication.

### Endpoints

| Route | Purpose |
|-------|---------|
| `GET /auth/login` | Redirects to Schwab OAuth consent screen |
| `GET /auth/callback` | Receives authorization code, exchanges for tokens |
| `GET /auth/status` | Returns auth state + refresh token expiry countdown |
| `POST /auth/logout` | Clears stored tokens |

### Token Lifecycle

- **Access token**: expires every 30 minutes. Proactively refresh at ~28 minutes via `setInterval`.
- **Refresh token**: expires every 7 days. Requires browser re-login.
- **Storage**: `token.json` in project root, gitignored. No encryption library needed for a single-user local tool.
- On server start: load `token.json`, check refresh token age, attempt a token refresh. If expired, log a clear message and set auth status to `REQUIRES_LOGIN`.

### Implementation

- **Option A**: `@sudowealth/schwab-api` npm package (typed TS wrapper, handles OAuth).
- **Option B**: Raw `axios` calls. The OAuth flow is straightforward:
  1. Redirect to `https://api.schwabapi.com/v1/oauth/authorize?client_id=KEY&redirect_uri=URL`
  2. User logs in, Schwab redirects to callback with `?code=XXX`
  3. Exchange code for tokens via POST to `https://api.schwabapi.com/v1/oauth/token` with Basic auth header (`base64(clientId:clientSecret)`)
  4. Schedule refresh every 28 minutes

### 7-Day Re-Auth Warning

The `/auth/status` endpoint returns:
```json
{
  "authenticated": true,
  "refreshTokenExpiresAt": "2026-04-24T14:30:00Z",
  "refreshTokenExpiresIn": "5d 12h 30m",
  "warning": null
}
```

When less than 24 hours remain:
```json
{
  "warning": "Refresh token expires in 11h 45m. Re-authenticate soon."
}
```

Frontend displays this as a yellow banner.

### Deliverable

- Auth flow works end-to-end: browser login > callback > token stored > auto-refresh running.
- `/auth/status` returns expiry countdown.
- Server restart recovers tokens from `token.json` without re-login.

---

## Phase 2: Backend — Core Data Endpoints (Read-Only) [IN PROGRESS]

**Goal:** Backend routes that fetch, merge, and serve lot-level position data.

### Schwab API Calls (All GET, No Writes)

| Schwab Endpoint | What It Returns | Used For |
|----------------|-----------------|----------|
| `GET /accounts/accountNumbers` | `[{ accountNumber, hashValue }]` | Getting the encrypted account ID |
| `GET /accounts/{hash}?fields=positions` | Positions with market value, cost basis, P&L | Current holdings |
| `GET /accounts/{hash}/transactions?types=TRADE,DIVIDEND_OR_INTEREST&startDate=X&endDate=Y` | Trade history with dates, prices, fees | Purchase dates + cost data per lot (including DRIP) |
| `GET /marketdata/v1/quotes?symbols=AAPL,MSFT` | Bid, ask, last, change, volume | Current prices for display |

### Lot Enrichment Pipeline

```
Step 1: Fetch positions
  └─ Filter to assetType === "EQUITY" and longQuantity > 0
  └─ Extract list of held symbols

Step 2: Fetch transactions (types=TRADE,DIVIDEND_OR_INTEREST)
  └─ Follow Schwab pagination until exhausted (do not assume one response contains all rows)
  └─ Keep only status === "VALID"
  └─ Filter to positionEffect === "OPENING" (buys only)
  └─ Use `time` field for purchase date (NOT `tradeDate` -- UTC bug)

Step 3: Fetch quotes for all held symbols
  └─ Batch into single request: /quotes?symbols=AAPL,MSFT,GOOG

Step 4: Merge into lot objects
  └─ For each BUY transaction matching a held symbol:
  - Set lot ID to `{activityId}-{transferItemIndex}`
      - Compute costBasis = price * quantity + fees
      - Compute marketValue = currentPrice * quantity
      - Compute gainLoss = marketValue - costBasis
      - Attach quote data (dayChange, dayChangePct)

Step 5: Handle orphan positions (no matching transaction)
  └─ Positions held but no BUY transaction found (older than API window)
  └─ Create lot with purchaseDateKnown: false, purchaseDate: null
  └─ Use position-level averagePrice for costPerShare

Step 6: Apply date filter (if requested)
  └─ Filter lots where purchaseDate falls within from/to range
  └─ Lots with purchaseDateKnown: false are excluded from date-filtered views
     but included in "All" view

Step 7: Compute summary totals from filtered lot set
```

### Backend Routes

| Route | Purpose |
|-------|---------|
| `GET /api/lots` | All lots, unfiltered |
| `GET /api/lots?from=DATE&to=DATE` | Lots filtered by purchase date range |
| `GET /api/quotes?symbols=AAPL,MSFT` | Proxy to Schwab quotes (for polling refresh) |
| `GET /api/account/summary` | Account balances, buying power, cash |
| `GET /api/health` | Server + auth status check |

### Schema Validation in Practice

Every Schwab response passes through its Zod schema before any business logic:

```typescript
const raw = await schwabClient.getPositions(accountHash);
const parsed = PositionsSchema.safeParse(raw);

if (!parsed.success) {
  logger.error("Schwab positions schema mismatch", parsed.error);
  throw new SchemaValidationError("positions", parsed.error);
}

// Safe to use parsed.data from here
```

### Caching Strategy

| Data | Cache Duration | Storage | Reason |
|------|---------------|---------|--------|
| Account hash | Until logout | Memory | Never changes per session |
| Positions | 60 seconds | Memory (`node-cache`) | Rarely changes intraday |
| Transactions | 24 hours | Disk (JSON file) | Historical, immutable. This is the slowest call. |
| Quotes | Do not cache | N/A | Always fetch fresh; polling handles frequency |

Transaction caching is the biggest performance win. First fetch may take a few seconds; subsequent page loads read from `cache/transactions.json` and only re-fetch after 24 hours or on manual refresh.

When Schwab is unavailable and cached data is served, include a top-level metadata object so the frontend can show a stale banner:

```json
{
  "stale": true,
  "cachedAt": "2026-04-17T18:30:00Z",
  "lots": [],
  "summary": {}
}
```

### Rate Limit Handling

- Schwab enforces ~120 requests/minute for GET requests.
- At our usage pattern (positions + transactions + quotes per page load, then quotes every 30s), we'll use maybe 3-5 requests per page load and 2 per polling cycle. Nowhere near the limit.
- Still implement: if response status is 429, read `Retry-After` header, wait, and retry once.

### Deliverable

- `/api/lots` returns correctly merged lot-level data.
- Transaction fetches paginate until exhausted (no silent truncation).
- Date filtering works.
- Orphan positions (unknown purchase date) appear with clear labeling.
- Schema validation catches Schwab response changes.
- Transaction cache eliminates redundant slow calls.

---

## Phase 3: Frontend — Positions Table [IN PROGRESS]

**Goal:** Vue 3 SPA that renders the lot-level positions table.

### Component Structure

```
src/
├── views/
│   └── PositionsView.vue              # Main page, orchestrates data fetching
├── components/
│   ├── PositionsTable.vue             # Data table with sortable columns
│   ├── LotRow.vue                     # Single lot row (highlight gain/loss colors)
│   ├── DateRangeFilter.vue            # Preset buttons + custom date picker
│   ├── PortfolioSummary.vue           # Top bar: totals, day change, lot count
│   ├── SymbolSearch.vue               # Type-ahead filter input
│   ├── AuthBanner.vue                 # Auth status + 7-day expiry warning
│   └── MarketStatusBadge.vue          # "Market Open" / "Market Closed" indicator
├── composables/
│   ├── useLots.ts                     # Fetch lots, apply client-side filters
│   ├── useQuotePolling.ts             # 30-second polling loop, market-hours-aware
│   ├── useAuth.ts                     # Auth state, login redirect, status polling
│   └── useFilters.ts                  # Date range + symbol filter state
├── services/
│   └── api.ts                         # Axios instance with base URL + error interceptor
├── types/
│   └── lot.ts                         # TypeScript interfaces (Lot, Summary, etc.)
└── utils/
    └── format.ts                      # Currency, percentage, date formatters
```

### Table Columns

| Column | Source | Formatting |
|--------|--------|------------|
| Symbol | lot.symbol | Bold, uppercase |
| Description | lot.description | Truncated if long |
| Purchase Date | lot.purchaseDate | "Mar 15, 2026" or "Unknown" |
| Qty | lot.quantity | Whole number or decimal |
| Cost/Share | lot.costPerShare | $142.50 |
| Cost Basis | lot.costBasis | $1,425.07 |
| Price | lot.currentPrice | $185.00 (live, updates on poll) |
| Mkt Value | lot.marketValue | $1,850.00 |
| Day Chg | lot.dayChange / lot.dayChangePct | +$2.30 (+1.26%) — green/red |
| Gain/Loss | lot.totalGainLoss / lot.totalGainLossPct | +$424.93 (+29.82%) — green/red |

### Filter Controls

- **Quick presets**: "All", "Last 7 days", "Last 30 days", "Last 90 days", "YTD"
- **Custom range**: Date picker for from/to
- **Symbol search**: Filters table client-side (no API call needed, data is already loaded)
- **Column sort**: Click header to sort asc/desc. Visual arrow indicator.

### Summary Bar

Fixed at top of table. Recomputes from currently visible (filtered) lots:

```
Total Value: $52,340.50 | Cost Basis: $41,200.00 | Gain/Loss: +$11,140.50 (+27.04%)
Day Change: +$285.40 (+0.55%) | Showing 12 of 18 lots
```

### Quote Polling Behavior

- `useQuotePolling.ts` fires every 30 seconds.
- Only polls during US market hours (9:30 AM - 4:00 PM ET, Mon-Fri).
- After hours: polls once on page load, then stops. Shows "Market Closed" badge.
- On each poll: updates `currentPrice`, `dayChange`, `dayChangePct`, `marketValue`, `totalGainLoss` for all lots.

### Deliverable

- Fully functional table with all columns, sorting, filtering.
- Summary bar updates dynamically.
- Quote polling runs during market hours.
- Auth banner warns about re-auth.
- Works on desktop and mobile.

---

## Phase 4: Polish & Edge Cases [NOT STARTED]

**Goal:** Handle the real-world messiness.

### Edge Cases to Handle

| Case | Behavior |
|------|----------|
| Position with no matching transaction (purchased > 1 year ago) | Show with purchaseDate = "Unknown". Use position-level `averagePrice` for cost/share. Excluded from date-filtered views, visible in "All". |
| DRIP (dividend reinvestment) lots | Transaction type = `DIVIDEND_OR_INTEREST`. Fetch these alongside `TRADE` type. They create new lots with small quantities. |
| Stock splits | Post-split, Schwab adjusts the position quantity and average price. Historical transactions may still show pre-split numbers. Use position data as ground truth for current quantity; transaction data for purchase date only. |
| Multiple buys of same symbol | Each is its own row. Optional: "Group by Symbol" toggle collapses them with a subtotal row. |
| Schwab API is down | Show last cached data and include `{ stale: true, cachedAt: "..." }` in the API response so the frontend can display a stale-data banner. |
| Token refresh fails | Auto-retry once after 30 seconds. If still failing, show red auth banner with re-login link. |
| Zero positions | Empty state: "No positions found. If this seems wrong, try re-authenticating." |
| Very large portfolio (100+ lots) | Virtual scrolling or pagination. Probably not needed for personal use, but keep the table component ready for it. |

### UI Polish

- Color-coded gain/loss: green for positive, red for negative, gray for zero.
- Hover on lot row shows full cost breakdown tooltip (price, fees, date, time).
- Loading skeleton while data fetches.
- Error states with retry buttons.

### Deliverable

- All edge cases handled gracefully.
- No blank screens or silent failures.

---

## Project Structure (Full)

```
schwab-positions/
├── .env                          # SCHWAB_CLIENT_ID, SCHWAB_CLIENT_SECRET, etc. (gitignored)
├── .env.example                  # Template for env vars
├── .gitignore
├── package.json
├── tsconfig.json
│
├── server/                       # Node/Express backend
│   ├── index.ts                  # Express app entry
│   ├── routes/
│   │   ├── auth.ts               # /auth/* routes
│   │   └── api.ts                # /api/* routes
│   ├── services/
│   │   ├── schwab.ts             # Schwab API client wrapper
│   │   ├── lots.ts               # Lot enrichment/merge logic
│   │   ├── cache.ts              # Caching layer (node-cache + disk)
│   │   └── mock.ts               # Mock data provider (when SCHWAB_MOCK=true)
│   ├── schemas/
│   │   ├── positions.ts          # Zod schema for positions response
│   │   ├── transactions.ts       # Zod schema for transactions response
│   │   ├── quotes.ts             # Zod schema for quotes response
│   │   └── account.ts            # Zod schema for account response
│   ├── middleware/
│   │   ├── auth.ts               # Token validation middleware
│   │   └── errors.ts             # Global error handler
│   └── utils/
│       └── logger.ts             # Structured logging
│
├── client/                       # Vue 3 frontend
│   ├── index.html
│   ├── vite.config.ts
│   ├── src/
│   │   ├── App.vue
│   │   ├── main.ts
│   │   ├── views/
│   │   │   └── PositionsView.vue
│   │   ├── components/
│   │   │   ├── PositionsTable.vue
│   │   │   ├── LotRow.vue
│   │   │   ├── DateRangeFilter.vue
│   │   │   ├── PortfolioSummary.vue
│   │   │   ├── SymbolSearch.vue
│   │   │   ├── AuthBanner.vue
│   │   │   └── MarketStatusBadge.vue
│   │   ├── composables/
│   │   │   ├── useLots.ts
│   │   │   ├── useQuotePolling.ts
│   │   │   ├── useAuth.ts
│   │   │   └── useFilters.ts
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── types/
│   │   │   └── lot.ts
│   │   └── utils/
│   │       └── format.ts
│   └── public/
│
├── mocks/                        # Mock data for dev without Schwab approval
│   ├── account.json
│   ├── positions.json
│   ├── transactions.json
│   ├── quotes.json
│   └── lots-enriched.json
│
└── cache/                        # Runtime cache (gitignored)
    └── transactions.json
```

---

## Tech Stack (Final)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Vue 3 + TypeScript + Pinia + Vite | Your standard stack |
| UI Components | Custom or Naive UI | Keep it lightweight |
| Backend | Node.js + Express + TypeScript | |
| Schwab SDK | `@sudowealth/schwab-api` or raw axios | Evaluate SDK maturity first |
| Schema Validation | Zod | Validates every Schwab response |
| Caching | `node-cache` (memory) + JSON files (disk) | No Redis needed for single-user |
| Quote Refresh | `setInterval` polling (30s) | WebSocket streaming deferred to v2 |
| Deployment | Local first | VPS later if you want remote access |

---

## Timeline (Revised)

| Phase | What | Effort | Can Start |
|-------|------|--------|-----------|
| 0A | Dev portal registration | 30 min + 1-3 day wait | Immediately |
| 0B | Mock data contract + project scaffold | 1 day | Immediately (parallel with 0A) |
| 0C | Zod schemas for Schwab responses | 0.5 day | After 0B |
| 1 | OAuth flow + token management | 1.5-2 days | After 0A approval |
| 2 | Data endpoints + lot merging + caching | 2-3 days | After Phase 1 |
| 3 | Frontend table + filters + summary | 2-3 days | After Phase 0B (mock mode), refined after Phase 2 |
| 4 | Edge cases + polish | 1-2 days | After Phase 3 |
| **Total** | | **~8-12 days working time** | |

**Key parallelism:** Phase 3 (frontend) can start on Day 1 using mock data. By the time Schwab approves and Phase 2 is done, the frontend just needs to point at real endpoints.

---

## Key Risks (Updated)

| Risk | Impact | Mitigation |
|------|--------|------------|
| Transaction history limited to ~1 year | No purchase date for older lots | Show as "Unknown"; cache transactions on first fetch; future: CSV import |
| Schwab API response shape changes | Silent data corruption | Zod schema validation on every call; fail loudly |
| 7-day mandatory re-auth | Dashboard goes stale | AuthBanner with countdown; consider browser notification at 24h warning |
| `tradeDate` UTC bug | Wrong purchase dates | Use `time` field exclusively |
| Rate limiting (120 req/min) | Temporarily blocked | Not a realistic risk at our usage level; implement 429 retry as safety net |
| `@sudowealth/schwab-api` immaturity | SDK bugs or missing features | Evaluate early; fall back to raw axios if needed |
| DRIP lots have different transaction type | Missing lots in display | Fetch `DIVIDEND_OR_INTEREST` type alongside `TRADE` |

---

## Next Steps (Do Now)

1. **Register at `developer.schwab.com`** and submit the app. Clock starts on approval.
2. **Scaffold the project** with the directory structure above. `npm init`, Vite for client, Express for server.
3. **Create mock data files** matching the Schwab response shapes documented in Phase 0B.
4. **Build the frontend against mocks.** By the time Schwab approves, your table, filters, and summary bar should already work.
5. **Wire up real auth** once approved, then swap mock endpoints for live data.
