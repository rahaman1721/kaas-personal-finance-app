# KaasApp Design System & Tokens (v2.0)

A bespoke design system engineered for **KaasApp**, combining the precision of an institutional financial ledger with the tactile fluidity of modern mobile craft.

---

## 1. Brand Identity & Principles
* **Core Metaphor**: Tactile Financial Instrument. Every control feels mechanical, deliberate, and responsive.
* **Tone**: Confident, restrained, trustworthy, and fast.
* **Anti-Slop Guarantees**:
  - No decorative purple gradients or rainbow fills.
  - No blur blobs (`filter: blur(30px)`) floating behind elements.
  - No kickers or tiny all-caps labels above headings.
  - No ghost cards (1px border under heavy 32px drop shadow). Elevation is declared once: crisp border or soft ambient shadow.
  - Vector iconography only. No emoji icons in system controls.

---

## 2. Color System & Semantic Tokens

All colors are designed for strict **WCAG 2.2 AA compliance** (contrast ratio ≥ 4.5:1 for body copy and ≥ 3:1 for large graphical elements).

### Light Theme Tokens (`[data-theme="light"]`)
```css
:root, [data-theme="light"] {
  /* Canvas & Surfaces */
  --bg-app:             #F8F9FA;  /* Clean parchment canvas */
  --bg-surface:         #FFFFFF;  /* Primary card / panel */
  --bg-surface-subtle:  #F1F3F5;  /* Secondary / input field / chip */
  --bg-surface-hover:   #E9ECEF;  /* Hover / active pressed */
  --bg-backdrop:        rgba(15, 23, 42, 0.45); /* Modal overlay */

  /* Hairline Borders */
  --border-subtle:      #E5E7EB;  /* 1px structural divider */
  --border-strong:      #D1D5DB;  /* Input outline / active card */
  --border-focus:       #10B981;  /* Focus visible ring */

  /* Text & Typography */
  --text-primary:       #0F172A;  /* Deepest slate (14.2:1 contrast) */
  --text-secondary:     #475569;  /* Balanced neutral (6.1:1 contrast) */
  --text-muted:         #64748B;  /* Captions & metadata (4.8:1 contrast) */
  --text-on-primary:    #FFFFFF;

  /* Financial Accents */
  --emerald-main:       #059669;  /* Income & positive savings */
  --emerald-subtle:     #D1FAE5;  /* Income pill badge background */
  --emerald-text:       #047857;
  
  --coral-main:         #DC2626;  /* Outflow & expense */
  --coral-subtle:       #FEE2E2;  /* Expense pill badge background */
  --coral-text:         #B91C1C;

  --amber-main:         #D97706;  /* Impulse / warning / near budget */
  --amber-subtle:       #FEF3C7;
  --amber-text:         #92400E;

  --indigo-main:        #4F46E5;  /* Goals & recurring subscriptions */
  --indigo-subtle:      #EEF2FF;
  --indigo-text:        #3730A3;

  /* Elevation Shadows */
  --shadow-sm:          0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md:          0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04);
  --shadow-lg:          0 12px 24px -4px rgba(0, 0, 0, 0.12), 0 4px 8px -2px rgba(0, 0, 0, 0.06);
}
```

### Dark Theme Tokens (`[data-theme="dark"]`)
```css
[data-theme="dark"] {
  /* Canvas & Surfaces */
  --bg-app:             #090A0F;  /* Deep OLED black */
  --bg-surface:         #12141A;  /* Primary elevated surface */
  --bg-surface-subtle:  #1A1D26;  /* Input fields & secondary chips */
  --bg-surface-hover:   #232834;  /* Interactive hover */
  --bg-backdrop:        rgba(0, 0, 0, 0.75);

  /* Hairline Borders */
  --border-subtle:      rgba(255, 255, 255, 0.08); /* 1px crisp outline */
  --border-strong:      rgba(255, 255, 255, 0.16);
  --border-focus:       #10B981;

  /* Text & Typography */
  --text-primary:       #F8FAFC;  /* High legibility white */
  --text-secondary:     #94A3B8;  /* Secondary slate (7.2:1 contrast) */
  --text-muted:         #64748B;  /* Captions (4.6:1 contrast) */
  --text-on-primary:    #000000;

  /* Financial Accents */
  --emerald-main:       #10B981;  /* High luminosity green */
  --emerald-subtle:     rgba(16, 185, 129, 0.12);
  --emerald-text:       #34D399;
  
  --coral-main:         #EF4444;  /* High luminosity red */
  --coral-subtle:       rgba(239, 68, 68, 0.12);
  --coral-text:         #F87171;

  --amber-main:         #F59E0B;
  --amber-subtle:       rgba(245, 158, 11, 0.12);
  --amber-text:         #FBBF24;

  --indigo-main:        #6366F1;
  --indigo-subtle:      rgba(99, 102, 241, 0.12);
  --indigo-text:        #818CF8;

  /* Elevation Shadows */
  --shadow-sm:          0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md:          0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg:          0 16px 36px rgba(0, 0, 0, 0.6);
}
```

---

## 3. Typographic Scale & Rules

* **Font Family**: `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
* **Numerals**: Strict `font-variant-numeric: tabular-nums` on all amounts, balances, percentages, dates, and charts to prevent jitter.
* **Tracking Floor**: `-0.02em` to `-0.03em` on display headings; `normal` on body copy.

| Level | Size | Weight | Line Height | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display 1** | 36px (2.25rem) | 800 | 1.15 | -0.03em | Primary balance total |
| **Heading 1** | 24px (1.5rem) | 700 | 1.25 | -0.02em | Screen titles, modal titles |
| **Heading 2** | 18px (1.125rem) | 700 | 1.35 | -0.015em | Section headers |
| **Heading 3** | 15px (0.9375rem) | 600 | 1.4 | 0 | Card titles, merchant names |
| **Body Primary**| 14px (0.875rem) | 500 | 1.5 | 0 | Inputs, description text |
| **Caption / Sub**| 12px (0.75rem) | 600 | 1.4 | +0.01em | Timestamps, categories, badges |
| **Micro** | 11px (0.6875rem) | 700 | 1.3 | +0.02em | Chart labels, day markers |

---

## 4. Spacing, Radii & Grid System

* **Base Unit**: 4px
* **Radius Scale**:
  - `radius-sm`: 6px (micro tags, tooltips)
  - `radius-md`: 10px (buttons, input fields, category chips)
  - `radius-lg`: 16px (cards, ledger panels, preview sheets)
  - `radius-xl`: 24px (modals, bottom navigation dock, hero card)
  - `radius-pill`: 9999px (segmented control pills, active indicators)
* **Touch Target Rule**: All interactive controls must measure at least **44x44px** in hit area.
* **Mobile Safe Insets**:
  ```css
  padding-top: max(16px, env(safe-area-inset-top));
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  ```

---

## 5. Component Specifications

### A. Tactile Wallet Card
* Dedicated dark surface with hairline border (`var(--border-subtle)`).
* Primary balance formatted with symbol + integer + decimal in tabular alignment.
* Two-column cash flow sub-bar:
  - Left: Total Income (`+₹XX,XXX`) with emerald incoming icon.
  - Right: Total Outflow (`-₹XX,XXX`) with coral outgoing icon.
* Monthly budget status indicator showing remaining spending capacity.

### B. Segmented Time Pill Controller
* Native iOS/Linear-inspired pill control with dark surface frame.
* Selected pill slides with `transform` and has distinct surface elevation.
* Options: `Today` | `This Week` | `This Month` | `All Time`.

### C. Ledger Transaction Row
* 52px minimum height.
* Left: 38x38px category icon with soft category background tint (`color-mix(in srgb, ${cat.color} 12%, transparent)`).
* Center: Merchant title (`font-weight: 600`), category name & payment method (`color: var(--text-muted)`).
* Right: Tabular amount with explicit `+` or `-` sign, plus subtle `Impulse` badge if marked unnecessary.
* Micro-interaction: Active tap scale `transform: scale(0.98)` with smooth easing.

### D. Bottom Navigation Dock
* Fixed floating glass bar at bottom, centered to 480px width.
* 5 items: Home, Insights, Center Camera Scan, Calendar/Activity, Settings.
* Central Scan Camera trigger: elevated 48x48px button with emerald gradient or solid brand color, distinct icon, and tactile press feedback.
* Safe-area inset compensation to prevent collision with mobile navigation gestures.

### E. Theme-Aware Modals & Sheets
* Backdrop: `rgba(0, 0, 0, 0.6)` with `backdrop-filter: blur(8px)`.
* Modal Container: Uses `var(--bg-surface)`, rounded-t-3xl on mobile (bottom sheet) and rounded-2xl on desktop.
* Keypad currency input: 40px display with clean `inputmode="decimal"`.
* Accessible close button in top right (`aria-label="Close dialog"`).
