# PMS Frontend — Architecture Document
## Step 1: Project Structure & Design System

---

## Project Folder Structure

```
pms-frontend/
├── public/
│   └── vite.svg
├── src/
│   ├── App.jsx                    ← Root: providers + router
│   ├── index.css                  ← Global styles + Google Fonts
│   │
│   ├── components/
│   │   ├── ui/
│   │   │   └── index.jsx          ← ALL reusable UI primitives (see below)
│   │   ├── layout/
│   │   │   └── (page-specific layout sub-components)
│   │   └── features/
│   │       ├── auth/              ← LoginForm, RegisterForm, StepIndicator
│   │       ├── dashboard/         ← GuardianNudgeCard, RetirementWidget, QuickActions
│   │       ├── deposit/           ← VaultSplitAnimation, QRTokenDisplay, AgentFlow
│   │       ├── withdraw/          ← WithdrawFlow, OTPScreen, EligibilityChecker
│   │       ├── income/            ← IncomeForm, TargetComparison, QRPayer
│   │       └── guardian/          ← ShieldDisplay, ScoreBreakdown, StateCard
│   │
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── RegisterPage.jsx
│   │   ├── DashboardPage.jsx      ← PRIMARY screen
│   │   ├── DepositPage.jsx
│   │   ├── IncomePage.jsx
│   │   ├── WithdrawPage.jsx
│   │   ├── TransactionsPage.jsx
│   │   ├── GuardianPage.jsx
│   │   ├── NotificationsPage.jsx
│   │   └── ProfilePage.jsx
│   │
│   ├── services/
│   │   └── api.js                 ← SINGLE API service file (complete)
│   │
│   ├── hooks/
│   │   └── index.js               ← All custom data hooks (complete)
│   │
│   ├── context/
│   │   ├── AuthContext.jsx        ← Auth state + token + user (complete)
│   │   └── NotificationContext.jsx ← Toasts + inbox + WebSocket (complete)
│   │
│   ├── layouts/
│   │   └── AppLayout.jsx          ← AppLayout + AuthLayout (complete)
│   │
│   ├── assets/
│   │   ├── icons/                 ← SVG icons (custom)
│   │   └── illustrations/         ← Onboarding illustrations
│   │
│   └── utils/
│       ├── helpers.js             ← formatRupee, computeVaultSplit, etc. (complete)
│       └── animations.js          ← All Framer Motion variants (complete)
│
├── tailwind.config.js             ← Full design system tokens (complete)
├── vite.config.js                 ← Dev proxy to FastAPI (complete)
└── package.json                   ← Dependencies (complete)
```

---

## Component Hierarchy

```
App
├── AuthProvider
│   └── NotificationProvider
│       ├── [Public routes]
│       │   ├── LoginPage
│       │   │   └── AuthLayout
│       │   │       ├── InputField (name, pension_id, password)
│       │   │       └── Button (submit)
│       │   └── RegisterPage
│       │       └── AuthLayout
│       │           ├── StepIndicator
│       │           ├── InputField × 6
│       │           ├── DaySelector (rest_days)
│       │           └── Button (Next / Submit)
│       │
│       └── [Protected routes → AppLayout]
│           ├── header: greeting + NotificationBell + GuardianLink
│           ├── main:   (page content, animated)
│           ├── nav:    BottomTabBar
│           └── overlay: ToastContainer
│               │
│               ├── DashboardPage
│               │   ├── VaultCard (pension_vault + liquid_vault + split bar)
│               │   ├── GuardianNudgeCard (state-aware target display)
│               │   ├── HealthScoreRing (PHS 0–1000)
│               │   ├── RetirementWidget (monthly pension projection)
│               │   ├── QuickActions (Save | Income | Withdraw)
│               │   └── RecentTransactions (last 3)
│               │
│               ├── DepositPage
│               │   ├── TabSelector (Direct | Via Agent)
│               │   ├── [Direct tab]
│               │   │   ├── SavingsTargetHint
│               │   │   ├── InputField (amount)
│               │   │   ├── VaultSplitPreview (live 80/20)
│               │   │   ├── Button (Deposit)
│               │   │   └── VaultSplitAnimation (on success)
│               │   └── [Agent tab]
│               │       ├── InputField (amount)
│               │       ├── Button (Generate QR)
│               │       ├── QRTokenDisplay (token + countdown)
│               │       └── WaitingForConfirmation (WebSocket)
│               │
│               ├── IncomePage
│               │   ├── TodayIncomeForm
│               │   │   ├── InputField (amount)
│               │   │   └── TargetComparison (before/after EMA)
│               │   └── PayerVerificationSection
│               │       ├── Button (Generate Payer QR)
│               │       └── QRTokenDisplay
│               │
│               ├── WithdrawPage
│               │   ├── LiquidVaultBalance (prominent)
│               │   ├── PensionVaultLocked (informational)
│               │   ├── InputField (amount)
│               │   ├── EligibilityChecker (live API call)
│               │   ├── HealthScoreSimulation (pre-withdrawal preview)
│               │   ├── [Instant path] Button → SuccessScreen
│               │   └── [Dual-key path] OTPScreen
│               │       ├── OTPInput (6 boxes)
│               │       └── Button (Verify)
│               │
│               ├── GuardianPage
│               │   ├── StateCard (current guardian state)
│               │   ├── InsuranceShield (animated)
│               │   ├── HealthScoreRing
│               │   └── ScoreBreakdown (bar chart per component)
│               │
│               ├── TransactionsPage
│               │   ├── AnnualSummaryCard
│               │   ├── FilterTabs (All | Deposits | Withdrawals)
│               │   └── TransactionList
│               │       └── TransactionRow × N
│               │
│               └── NotificationsPage
│                   ├── NotificationGroup × (by date)
│                   └── NotificationItem × N
```

---

## API Service Layer (`services/api.js`)

All endpoints mapped. Key design decisions:

| Category | Endpoints | Auth |
|---|---|---|
| Auth | `POST /register`, `POST /login` | None |
| Profile | `GET /user/{id}`, `GET /savings-target/{id}` | JWT |
| Savings | `POST /deposit`, `POST /income` | JWT |
| Withdrawal | `POST /withdraw`, `POST /withdraw/verify`, `POST /withdraw/check` | JWT |
| Ledger | `GET /transactions/{id}`, `POST /ledger/token`, `POST /confirm-payment` | JWT / None |
| Health | `GET /health-score/{id}`, `POST /health-score/{id}/simulate` | JWT |
| Guardian | `GET /guardian-status/{id}`, `GET /notifications/{id}` | JWT |
| Agent | `POST /agent/generate-token`, `POST /agent/confirm-cash` | JWT / None |
| Projection | `GET /retirement-projection` | JWT |
| WebSocket | `WS /ws/notifications/{id}` | — |

---

## Global State Strategy

```
Context                Purpose                          Consumers
─────────────────────────────────────────────────────────────────
AuthContext            JWT token, pensionId,            All pages
                       user profile, session restore
                       login(), logout(), refreshUser()

NotificationContext    In-app toasts queue,             AppLayout (toasts)
                       notification inbox,              NotificationsPage
                       WebSocket connection,            DashboardPage (nudge)
                       real-time event dispatch
```

**Rule:** No page fetches data twice. Hooks cache in local state; `AuthContext` holds user profile. After any mutation (deposit/withdraw), call `refreshUser()`.

---

## Design System Summary

### Colors
| Token | Hex | Usage |
|---|---|---|
| Primary | `#4f46e5` (indigo-600) | Buttons, links, focus rings |
| Pension Vault | `#fbbf24` (amber-400) | Locked savings indicator |
| Liquid Vault | `#10b981` (emerald-500) | Available fund indicator |
| Success | `#10b981` | Confirmations, deposits |
| Warning | `#f59e0b` | Grace mode, OTP, insurance |
| Danger | `#ef4444` | Errors, at-risk state |
| Background | `#f8fafc` (slate-50) | App background |
| Card | `#ffffff` | All cards |
| Body text | `#1e293b` (slate-800) | Primary text |

### Typography
- **Headings / Numbers:** `Sora` — confident, financial-grade
- **Body / Labels:** `Nunito` — warm, accessible, readable for low-literacy users
- **IDs / Codes:** `JetBrains Mono` — pension ID, token codes

### Animation Strategy (Framer Motion)
| Trigger | Animation |
|---|---|
| Page change | `y: 16→0, opacity: 0→1, duration: 0.2s` |
| Deposit success | Coin splits → 80% left (amber) + 20% right (emerald) |
| Vault split bar | Width animates from 0 → correct %, 0.8s ease-out |
| Health score ring | Stroke draws from 0 → score %, 1.2s ease-out |
| Guardian shield | Infinite pulse (active) or dim heartbeat (paused) |
| Toast | Slides in from right (x: 80→0), 0.25s |
| OTP digit fill | Scale bounce on each digit entry |
| QR token | Pulsing border ring to signal "waiting" |
| Success checkmark | Spring scale-up + path draw |

---

## Environment Variables

```env
# .env.local
VITE_API_URL=http://localhost:8000
```

---

## Step 2 Roadmap

Once this architecture is approved, Step 2 will implement full page components:
1. `DashboardPage` — the primary worker screen
2. `DepositPage` — direct + agent modes with animations
3. `WithdrawPage` — dual-key OTP flow
4. `LoginPage` + `RegisterPage` — auth screens
5. `GuardianPage` — health score + insurance
6. Remaining pages
