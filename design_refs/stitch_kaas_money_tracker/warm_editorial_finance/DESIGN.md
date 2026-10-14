---
name: Warm Editorial Finance
colors:
  surface: '#fbf9f3'
  surface-dim: '#dcdad4'
  surface-bright: '#fbf9f3'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3ee'
  surface-container: '#f0eee8'
  surface-container-high: '#eae8e2'
  surface-container-highest: '#e4e2dd'
  on-surface: '#1b1c19'
  on-surface-variant: '#3e4943'
  inverse-surface: '#30312d'
  inverse-on-surface: '#f2f1eb'
  outline: '#6e7a73'
  outline-variant: '#bdc9c1'
  surface-tint: '#006c4c'
  primary: '#006446'
  on-primary: '#ffffff'
  primary-container: '#087f5b'
  on-primary-container: '#cfffe5'
  inverse-primary: '#78d9af'
  secondary: '#36675d'
  on-secondary: '#ffffff'
  secondary-container: '#b6eadd'
  on-secondary-container: '#3a6b61'
  tertiary: '#735100'
  on-tertiary: '#ffffff'
  tertiary-container: '#936800'
  on-tertiary-container: '#fff2e3'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#94f6ca'
  primary-fixed-dim: '#78d9af'
  on-primary-fixed: '#002115'
  on-primary-fixed-variant: '#005139'
  secondary-fixed: '#b9ede0'
  secondary-fixed-dim: '#9ed1c4'
  on-secondary-fixed: '#00201b'
  on-secondary-fixed-variant: '#1c4f45'
  tertiary-fixed: '#ffdea9'
  tertiary-fixed-dim: '#fdbb2f'
  on-tertiary-fixed: '#271900'
  on-tertiary-fixed-variant: '#5e4200'
  background: '#fbf9f3'
  on-background: '#1b1c19'
  surface-variant: '#e4e2dd'
typography:
  display-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 44px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.03em
  numeral-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 42px
    letterSpacing: -0.02em
  numeral-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  space-2xs: 0.25rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.25rem
  space-xl: 1.5rem
  space-2xl: 2rem
  space-3xl: 2.5rem
  space-4xl: 3rem
  touch-target-min: 3rem
  touch-target-cta: 3.5rem
  gutter-mobile: 1.25rem
  gutter-desktop: 2rem
---

## Brand & Style

This design system delivers a serene, mindful, and tactile financial experience inspired by Apple’s organic human interface principles combined with editorial warmth. Rejecting the aggressive neon glow and high-stress dashboards typical of modern fintech, it cultivates calm clarity, intentionality, and long-term financial peace of mind.

The visual style blends refined minimalism with physical, tactile warmth: buttery cream backdrops, generous micro-radii, warm organic emeralds, soft forest depth, and restrained golden highlights. The interface evokes the feeling of holding a bespoke leather notebook or physical cardholder—grounded, trustworthy, and welcoming.

## Colors

The palette pairs botanical greens with warm paper neutrals and soft mineral tones to foster reassurance rather than anxiety.

### Core Roles
- **Primary (`#087F5B`)**: Primary action driver, success state, income indicators, and focused toggles.
- **Secondary (`#063F36`)**: Deep anchor teal for dense visual weight—used in hero balances, card surfaces, and primary display headers.
- **Tertiary (`#F9B72B`)**: Warm gold highlight, reserved for goal milestones, budget thresholds, and card badges.
- **Canvas Neutral (`#FAF8F2`)**: Off-white, warm cream surface that reduces glare and prevents clinical fatigue.
- **Surface Elevation (`#FFFFFF`)**: Pure white cards and floating sheets resting on the warm canvas.

### Semantic Tones
- **Expense / Debit**: Warm coral red (`#D94841`), avoiding harsh alert tones.
- **Income / Credit**: Botanical green (`#087F5B`).
- **Warning / Overdraft Alert**: Warm amber (`#E58E1A`).
- **Container Tint**: Soft muted mint (`#DDF4E8`) for secondary tags, chips, and nested grouping cards.
- **Text Primary**: Deep forest graphite (`#10201D`).
- **Text Muted**: Soft slate green-gray (`#6C7773`).

## Typography

Plus Jakarta Sans provides geometric balance with softly rounded terminals, echoing the friendly yet disciplined ethos of personal wealth management. 

- **Financial Numerals**: Always set with tabular figures (`font-variant-numeric: tabular-nums`) to preserve columnar alignment across spend logs and budget limits.
- **Hierarchy Rules**: Primary balance amounts use `display-hero` or `numeral-lg` with tight tracking to form an impactful graphical anchor. Section heads retain medium weights to avoid competing with monetary figures. Secondary timestamps and metadata use `body-sm` or `label-sm` with slightly loosened letter spacing for legibility on mobile screens.

## Layout & Spacing

The layout utilizes a fluid, single-column feed structure on mobile devices that transitions into a 12-column adaptive grid on larger tablets and desktop views.

- **Mobile Viewport**: 20px (`gutter-mobile`) outer edge margin ensures screen thumb-reach comfort while preserving breathing room around card edges. Vertical stacking follows an 8px baseline rhythm, with typical inter-card gaps set to `16px` (`space-md`) and sectional divisions set to `32px` (`space-2xl`).
- **Touch Ergonomics**: All interactive elements must adhere to a strict minimum hit area of 48px (`touch-target-min`). Main screen primary calls-to-action (such as "Add Transaction") sit inside a bottom sticky safe area with a heightened 56px (`touch-target-cta`) footprint.
- **Tablet & Large Screens**: Content nests within a centered 640px maximum reading container for finance feeds, or expands across a 12-column grid (24px gutter) for analytical dashboards.

## Elevation & Depth

Visual depth is achieved through ambient, natural light simulation rather than heavy drop shadows.

- **Canvas Ground**: Base level set to Warm Cream (`#FAF8F2`).
- **Level 1 (Surface Cards & Lists)**: Pure White (`#FFFFFF`) with a layered ambient shadow tinted with deep forest tones: `0 4px 20px -2px rgba(6, 63, 54, 0.05), 0 1px 3px 0 rgba(6, 63, 54, 0.03)`. No hard borders are used; edge separation is achieved through soft tonal contrast against the cream canvas.
- **Level 2 (Active Floating Modules & Drawers)**: Pure White (`#FFFFFF`) with elevated diffuse shadow: `0 12px 32px -4px rgba(6, 63, 54, 0.08), 0 4px 8px -2px rgba(6, 63, 54, 0.02)`.
- **Level 3 (Modal Sheets & Overlays)**: Pure White sheets layered above a warm translucent backdrop blur (`rgba(16, 32, 29, 0.35)` with `backdrop-filter: blur(8px)`).
- **Tactile Accent Stacking**: When cards represent physical payment methods or accounts, a multi-layer stacking effect is created using small offset transforms (`translateY(-4px)` with scale stepping) paired with peek accents of Accent Gold (`#F9B72B`) or Deep Teal (`#063F36`).

## Shapes

The interface embraces organic curvature without sacrificing space efficiency. Standard card shells use a generous 20px corner radius, harmonizing with iOS native squircle aesthetics. 

- **Cards & Summary Panels**: 20px (`rounded-xl` equivalent in this system).
- **Inner Containers & Grouped Insets**: 12px to 14px to maintain nested concentricity.
- **Interactive Controls (Buttons, Inputs, Filter Pills)**: Full pill geometry (`9999px`) to invite confident touch interaction and communicate tactile friendliness.

## Components

### Buttons
- **Primary Button**: Full pill shape, 56px height, solid Primary Green (`#087F5B`) background, pure white label in `label-lg`, center aligned with 24px horizontal padding. On press: subtle scale down to 0.98 with background darkening to `#066b4d`.
- **Secondary Button**: Full pill shape, 48px height, Soft Green (`#DDF4E8`) background with Deep Teal (`#063F36`) text.
- **Tertiary / Ghost Button**: Full pill shape, transparent background with Primary Text (`#10201D`) or Deep Teal text, active state shows a subtle `#063F36` fill at 5% opacity.

### Chips & Filter Tags
- **Default State**: Full pill shape, 32px height, 12px horizontal padding, Surface White background with a faint 1px border of `rgba(108, 119, 115, 0.2)`. Label set in `label-sm` with Secondary Text (`#6C7773`).
- **Selected State**: Soft Green (`#DDF4E8`) container with Deep Teal (`#063F36`) typography and no border.

### Transaction Lists & Rows
- **Container**: White background, 20px rounded card or continuous divided list on warm cream.
- **Row Anatomy**: 64px row height. Left icon consists of a 44px circular or 12px rounded-squircle badge filled with `#DDF4E8` housing a themed icon. Title in `label-md` (`#10201D`), category and timestamp below in `body-sm` (`#6C7773`).
- **Amount Treatment**: Right-aligned, `label-lg` with tabular numerals. Income prepended with `+` in `#087F5B`; expenses prepended with `-` in `#10201D` (or `#D94841` if highlighted debit).

### Form Inputs
- **Text & Numerical Fields**: 52px height, Surface White (`#FFFFFF`) fill with a 1px border in `rgba(6, 63, 54, 0.12)`, rounded-xl (16px) or full pill depending on modal density. Primary Text `#10201D`, placeholder in `#6C7773`. Focused state transitions to a 1.5px solid Primary Green (`#087F5B`) border with a delicate ambient glow.
- **Large Money Keypad Display**: Minimal, borderless, displaying the active input amount in `display-hero` text centered on the Warm Cream backdrop.

### Cards & Metrics
- **Balance Card (Hero)**: Available in Deep Teal (`#063F36`) with white text and gold accent tags, or pure white with subtle ambient drop shadows. Features a warm badge tag, total balance, period change pill, and secondary spending insights.
- **Progress Trackers**: 8px height track in Soft Green (`#DDF4E8`), active indicator fill in Primary Green (`#087F5B`) or Accent Yellow (`#F9B72B`) as budget ceilings approach.