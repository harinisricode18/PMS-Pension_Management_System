# PMS Frontend — v2 Redesign

## Files Replaced

| File | Changes |
|---|---|
| `src/layouts/AppLayout.jsx` | SVG nav icons, glassmorphism nav bar, smoother header |
| `src/pages/DashboardPage.jsx` | Animated count-up numbers, polished vault card, redesigned health ring, staggered reveals |
| `src/pages/LoginPage.jsx` | Full-bleed gradient hero, cleaner card, SVG eye toggle |
| `src/pages/RegisterPage.jsx` | Step progress dots, improved spacing, cleaner success screen |
| `src/pages/DepositPage.jsx` | Two-tone split bar preview, improved vault animation modal, agent token pulse |
| `src/pages/IncomePage.jsx` | Cleaner before/after target comparison, payer token section, animated success |
| `src/pages/WithdrawPage.jsx` | Step progress bar, OTP bounce animation, styled confirm + success screens |

## Key Design Improvements

### Visual Hierarchy
- **Vault Card**: 46px total savings number — unmissable at a glance
- **Split bar**: Amber/emerald two-tone bar shows 80/20 instantly
- **Health ring**: Color-coded (green/amber/red) with animated stroke draw
- **Quick Actions**: Gradient buttons with colored shadows for depth

### Typography
- `Sora` for all financial numbers and headings
- `Nunito` for all body text and labels
- `JetBrains Mono` for Pension ID codes and tokens

### Motion (Framer Motion)
- Count-up animation on vault amounts (spring physics)
- Vault split bar animates from 0 → correct width on mount
- Health score ring draws stroke from 0 → score over 1.4s
- Page transitions: y:12→0, opacity:0→1, 180ms
- Staggered card reveals with increasing delay
- OTP digit scale-bounce on entry
- Success modal: spring scale-in + coin split animation
- Bottom nav: `layoutId` shared element for active indicator

### Components
- `AnimatedNumber`: spring-based count-up using Framer Motion's `useSpring`
- `StepBar`: withdrawal step progress tracker
- `VaultSplitPreview`: live two-tone bar + split cells
- `OTPInput`: 6-box OTP with bounce animation and paste support

### Color Usage
| Element | Color |
|---|---|
| Primary actions | `#4f46e5` indigo-600 |
| Pension vault | `#fbbf24` amber-400 |
| Liquid vault | `#10b981` emerald-500 |
| Health excellent | `#10b981` emerald |
| Health ok | `#f59e0b` amber |
| Health at-risk | `#ef4444` red |
| Card background | `#ffffff` white |
| App background | `#f8fafc` slate-50 |

## Drop-In Replacement

These files are direct replacements. No changes to:
- `services/api.js`
- `context/AuthContext.jsx`
- `context/NotificationContext.jsx`
- `utils/helpers.js`
- `utils/animations.js`
- All other pages (GuardianPage, TransactionsPage, etc.)

## Preview

Open `PREVIEW.html` in a browser to see a static mockup of the Dashboard, Login, and Deposit screens.
